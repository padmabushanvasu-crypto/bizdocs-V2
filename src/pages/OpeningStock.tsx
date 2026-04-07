import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Search, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { fetchItems, updateStockBucket, recalcStockAlertLevel, type Item } from "@/lib/items-api";
import { format } from "date-fns";

const ITEM_TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  raw_material:   { label: "Raw Material",  cls: "bg-slate-100 text-slate-700" },
  component:      { label: "Component",     cls: "bg-blue-100 text-blue-700" },
  sub_assembly:   { label: "Sub-Assembly",  cls: "bg-purple-100 text-purple-700" },
  bought_out:     { label: "Bought Out",    cls: "bg-teal-100 text-teal-700" },
  finished_good:  { label: "Finished Good", cls: "bg-green-100 text-green-700" },
  product:        { label: "Product",       cls: "bg-green-100 text-green-700" },
  consumable:     { label: "Consumable",    cls: "bg-amber-100 text-amber-700" },
  service:        { label: "Service",       cls: "bg-gray-100 text-gray-600" },
};

const EDIT_REASONS = [
  "Initial stock entry",
  "Physical stock count correction",
  "Migration from previous system",
  "Audit adjustment",
  "Other",
];

interface OpeningStockEntry {
  item_id: string;
  qty: number;
  unit_cost: number;
  transaction_date: string;
}

async function fetchLatestOpeningStock(): Promise<Record<string, OpeningStockEntry>> {
  const companyId = await getCompanyId();
  if (!companyId) return {};
  const { data, error } = await (supabase as any)
    .from("stock_ledger")
    .select("item_id, qty_in, unit_cost, transaction_date")
    .eq("company_id", companyId)
    .eq("transaction_type", "opening_stock")
    .order("transaction_date", { ascending: false });
  if (error) throw error;
  const map: Record<string, OpeningStockEntry> = {};
  for (const row of data ?? []) {
    if (!map[row.item_id]) {
      map[row.item_id] = {
        item_id: row.item_id,
        qty: row.qty_in ?? 0,
        unit_cost: row.unit_cost ?? 0,
        transaction_date: row.transaction_date,
      };
    }
  }
  return map;
}

interface EditState {
  item: Item;
  newQty: string;
  costPerUnit: string;
  reason: string;
  otherReason: string;
}

export default function OpeningStock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editState, setEditState] = useState<EditState | null>(null);

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["items-opening-stock"],
    queryFn: () => fetchItems({ status: "active", pageSize: 1000 }),
  });
  const items = (itemsData?.data ?? []).filter(i => i.item_type !== "service");

  const { data: openingMap = {}, isLoading: ledgerLoading } = useQuery({
    queryKey: ["opening-stock-entries"],
    queryFn: fetchLatestOpeningStock,
  });

  const saveMutation = useMutation({
    mutationFn: async (state: EditState) => {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company");
      const newQty = parseFloat(state.newQty) || 0;
      const costPerUnit = parseFloat(state.costPerUnit) || 0;
      const currentFree = state.item.stock_free ?? 0;
      const reasonText = state.reason === "Other" ? state.otherReason.trim() || "Other" : state.reason;

      // Insert stock_ledger entry
      const { error: ledgerError } = await (supabase as any)
        .from("stock_ledger")
        .insert({
          company_id: companyId,
          item_id: state.item.id,
          transaction_type: "opening_stock",
          qty_in: newQty,
          qty_out: 0,
          balance_qty: newQty,
          unit_cost: costPerUnit,
          reference_type: "manual",
          transaction_date: format(new Date(), "yyyy-MM-dd"),
          notes: reasonText,
        });
      if (ledgerError) throw ledgerError;

      // Update stock bucket (delta from current free stock)
      const diff = newQty - currentFree;
      if (diff !== 0) {
        await updateStockBucket(state.item.id, "free", diff);
      }
      await recalcStockAlertLevel(state.item.id);
    },
    onSuccess: () => {
      toast({ title: "Opening stock updated" });
      setEditState(null);
      queryClient.invalidateQueries({ queryKey: ["items-opening-stock"] });
      queryClient.invalidateQueries({ queryKey: ["opening-stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const filteredItems = items.filter(item => {
    if (typeFilter !== "all" && item.item_type !== typeFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        item.item_code?.toLowerCase().includes(s) ||
        item.description?.toLowerCase().includes(s) ||
        (item.drawing_number ?? "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  const isLoading = itemsLoading || ledgerLoading;

  const openEdit = (item: Item) => {
    const entry = openingMap[item.id];
    setEditState({
      item,
      newQty: String(item.stock_free ?? 0),
      costPerUnit: entry ? String(entry.unit_cost) : String(item.purchase_price ?? 0),
      reason: "Initial stock entry",
      otherReason: "",
    });
  };

  const handleSave = () => {
    if (!editState) return;
    const qty = parseFloat(editState.newQty);
    if (isNaN(qty) || qty < 0) {
      toast({ title: "Invalid quantity", variant: "destructive" });
      return;
    }
    if (editState.reason === "Other" && !editState.otherReason.trim()) {
      toast({ title: "Please specify a reason", variant: "destructive" });
      return;
    }
    saveMutation.mutate(editState);
  };

  const uniqueTypes = Array.from(new Set(items.map(i => i.item_type))).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Archive className="h-6 w-6 text-slate-600" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Opening Stock</h1>
          <p className="text-sm text-slate-500">Set or update opening stock quantities for all items</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by item code or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(t => (
              <SelectItem key={t} value={t}>
                {ITEM_TYPE_LABELS[t]?.label ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item Code</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Unit</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Free Stock</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Last Opening Entry</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Cost/Unit</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No items found</td>
              </tr>
            ) : (
              filteredItems.map(item => {
                const entry = openingMap[item.id];
                const typeInfo = ITEM_TYPE_LABELS[item.item_type] ?? { label: item.item_type, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.item_code}</td>
                    <td className="px-4 py-3 text-slate-800 max-w-xs truncate" title={item.description}>
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo.cls}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {(item.stock_free ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {entry ? (
                        <span title={entry.transaction_date}>
                          {entry.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })} on{" "}
                          {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {entry ? `₹${entry.unit_cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-slate-500 hover:text-slate-800"
                        onClick={() => openEdit(item)}
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!isLoading && (
        <p className="text-xs text-slate-400 mt-2">{filteredItems.length} items</p>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editState} onOpenChange={open => { if (!open) setEditState(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Opening Stock</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="space-y-4 py-2">
              <div className="text-sm">
                <p className="font-medium text-slate-800">{editState.item.description}</p>
                <p className="text-slate-500 font-mono text-xs">{editState.item.item_code}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="os-qty">
                    New Quantity <span className="text-slate-400 font-normal">({editState.item.unit})</span>
                  </Label>
                  <Input
                    id="os-qty"
                    type="number"
                    min="0"
                    step="0.001"
                    value={editState.newQty}
                    onChange={e => setEditState(s => s ? { ...s, newQty: e.target.value } : s)}
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-400">
                    Current free stock: {(editState.item.stock_free ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="os-cost">Cost Per Unit (₹)</Label>
                  <Input
                    id="os-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editState.costPerUnit}
                    onChange={e => setEditState(s => s ? { ...s, costPerUnit: e.target.value } : s)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="os-reason">Reason</Label>
                <Select
                  value={editState.reason}
                  onValueChange={v => setEditState(s => s ? { ...s, reason: v } : s)}
                >
                  <SelectTrigger id="os-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDIT_REASONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editState.reason === "Other" && (
                <div className="space-y-1.5">
                  <Label htmlFor="os-other">Specify reason</Label>
                  <Input
                    id="os-other"
                    value={editState.otherReason}
                    onChange={e => setEditState(s => s ? { ...s, otherReason: e.target.value } : s)}
                    placeholder="Describe the reason…"
                  />
                </div>
              )}

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                This will update the free stock bucket and create an audit trail entry in the stock ledger.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
