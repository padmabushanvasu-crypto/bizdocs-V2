import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fetchItems } from "@/lib/items-api";
import { fetchBomVariants } from "@/lib/bom-api";
import { createAssemblyWorkOrder } from "@/lib/production-api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockAlertBoardRow {
  id: string;
  item_code: string;
  item_name: string;
  item_type: string;
  current_stock: number;
  min_stock: number;
  shortage: number;
  actionedWith: "PO" | "DC" | null;
}

interface WoFormState {
  item_id: string;
  item_code: string;
  item_description: string;
  quantity_to_build: number;
  bom_variant_id: string;
  planned_date: string;
  work_order_ref: string;
  notes: string;
}

const defaultWoForm: WoFormState = {
  item_id: "",
  item_code: "",
  item_description: "",
  quantity_to_build: 1,
  bom_variant_id: "",
  planned_date: "",
  work_order_ref: "",
  notes: "",
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchStockAlertBoard(companyId: string): Promise<StockAlertBoardRow[]> {
  // Try stock_alerts view first (columns: id, item_code, description,
  // item_type, effective_stock, min_stock, shortage, company_id).
  // View exposes company_id but does NOT self-isolate — filter required.
  const { data: viewData, error: viewError } = await (supabase as any)
    .from("stock_alerts")
    .select("*")
    .eq("company_id", companyId)
    .neq("item_type", "service")
    .neq("item_type", "finished_good");

  let rawRows: any[] = [];

  if (!viewError && viewData && viewData.length > 0) {
    rawRows = viewData;
  } else {
    // Fallback: items table direct query filtered by companyId prop (no hardcoded ID)
    const { data: itemsData, error: itemsError } = await (supabase as any)
      .from("items")
      .select("id, item_code, description, item_type, current_stock, stock_free, min_stock, aimed_stock")
      .eq("company_id", companyId)
      .neq("item_type", "service")
      .neq("item_type", "finished_good")
      .gt("min_stock", 0);

    if (itemsError) throw itemsError;

    rawRows = (itemsData ?? [])
      .filter((i: any) => {
        const stock = i.stock_free ?? i.current_stock ?? 0;
        return stock < (i.min_stock ?? 0);
      })
      .map((i: any) => ({
        ...i,
        effective_stock: i.stock_free ?? i.current_stock ?? 0,
        shortage: Math.max(0, (i.min_stock ?? 0) - (i.stock_free ?? i.current_stock ?? 0)),
      }));
  }

  if (rawRows.length === 0) return [];

  const itemIds = rawRows.map((r: any) => r.id);

  // Open POs — two-step, filtered by companyId prop
  const { data: openPOs } = await (supabase as any)
    .from("purchase_orders")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["draft", "issued", "partially_received"]);

  const openPOIds = (openPOs ?? []).map((p: any) => p.id);
  let itemsWithPO = new Set<string>();

  if (openPOIds.length > 0) {
    const { data: poLines } = await (supabase as any)
      .from("po_line_items")
      .select("item_id")
      .in("po_id", openPOIds)
      .in("item_id", itemIds);
    itemsWithPO = new Set((poLines ?? []).filter((l: any) => l.item_id).map((l: any) => l.item_id));
  }

  // Open DCs — two-step, dc_line_items FK is dc_id (not delivery_challan_id)
  const { data: openDCs } = await (supabase as any)
    .from("delivery_challans")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["draft", "issued"]);

  const openDCIds = (openDCs ?? []).map((d: any) => d.id);
  let itemsWithDC = new Set<string>();

  if (openDCIds.length > 0) {
    const { data: dcLines } = await (supabase as any)
      .from("dc_line_items")
      .select("item_id")
      .in("dc_id", openDCIds)
      .in("item_id", itemIds);
    itemsWithDC = new Set((dcLines ?? []).filter((l: any) => l.item_id).map((l: any) => l.item_id));
  }

  // Normalise columns (view: description/effective_stock; items: description/stock_free)
  const enriched: StockAlertBoardRow[] = rawRows.map((r: any) => {
    const stock = r.effective_stock ?? r.stock_free ?? r.current_stock ?? 0;
    const minStock = r.min_stock ?? 0;
    const shortage = r.shortage ?? Math.max(0, minStock - stock);
    return {
      id: r.id,
      item_code: r.item_code ?? "",
      item_name: r.item_name ?? r.description ?? r.item_code ?? "—",
      item_type: r.item_type ?? "",
      current_stock: stock,
      min_stock: minStock,
      shortage,
      actionedWith: itemsWithPO.has(r.id) ? "PO" : itemsWithDC.has(r.id) ? "DC" : null,
    };
  });

  return enriched.sort((a, b) => b.shortage - a.shortage);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ITEM_TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw Material",
  component:    "Component",
  bought_out:   "Bought Out",
  sub_assembly: "Sub-Assembly",
};

function itemTypeBadge(type: string) {
  const label = ITEM_TYPE_LABELS[type] ?? type;
  const clsMap: Record<string, string> = {
    raw_material: "bg-blue-50 text-blue-700 border-blue-200",
    component:    "bg-purple-50 text-purple-700 border-purple-200",
    bought_out:   "bg-teal-50 text-teal-700 border-teal-200",
    sub_assembly: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return { label, className: clsMap[type] ?? "bg-slate-50 text-slate-700 border-slate-200" };
}

function needsPO(type: string) {
  return ["raw_material", "component", "bought_out"].includes(type);
}

function needsProduction(type: string) {
  return type === "sub_assembly";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  companyId: string;
  /** When true, removes the max-h-80 cap so all rows are visible (for dedicated page) */
  fullHeight?: boolean;
}

export function StockAlertsBoard({ companyId, fullHeight = false }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Work order dialog state
  const [woDialogOpen, setWoDialogOpen] = useState(false);
  const [woForm, setWoForm] = useState<WoFormState>(defaultWoForm);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["stock-alerts-board", companyId],
    queryFn: () => fetchStockAlertBoard(companyId),
    staleTime: 0,
    enabled: !!companyId,
  });

  // Items for WO dialog dropdown (only fetched when dialog is open)
  const { data: itemsData } = useQuery({
    queryKey: ["items", "sub_assembly"],
    queryFn: () => fetchItems({ type: "sub_assembly", pageSize: 200 }),
    enabled: woDialogOpen,
  });
  const woItems = itemsData?.data ?? [];

  // BOM variants for selected item
  const { data: bomVariants = [] } = useQuery({
    queryKey: ["bom-variants", woForm.item_id],
    queryFn: () => fetchBomVariants(woForm.item_id),
    enabled: !!woForm.item_id,
  });

  const createWOMutation = useMutation({
    mutationFn: () =>
      createAssemblyWorkOrder({
        awo_type: "sub_assembly",
        item_id: woForm.item_id,
        item_code: woForm.item_code,
        item_description: woForm.item_description,
        quantity_to_build: woForm.quantity_to_build,
        bom_variant_id: woForm.bom_variant_id || undefined,
        planned_date: woForm.planned_date || undefined,
        work_order_ref: woForm.work_order_ref || undefined,
        notes: woForm.notes || undefined,
      }),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["awo", "sub_assembly"] });
      toast({ title: "Work order created", description: "Sub-assembly work order raised." });
      setWoDialogOpen(false);
      setWoForm(defaultWoForm);
      navigate(`/assembly-work-orders/${newId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openWoDialog = (row: StockAlertBoardRow) => {
    setWoForm({
      item_id: row.id,
      item_code: row.item_code,
      item_description: row.item_name,
      quantity_to_build: Math.max(1, Math.ceil(row.shortage)),
      bom_variant_id: "",
      planned_date: "",
      work_order_ref: "",
      notes: "",
    });
    setWoDialogOpen(true);
  };

  const closeWoDialog = () => {
    setWoDialogOpen(false);
    setWoForm(defaultWoForm);
  };

  const totalBelow       = rows.length;
  const needsPOCount     = rows.filter((r) => needsPO(r.item_type) && !r.actionedWith).length;
  const needsProdCount   = rows.filter((r) => needsProduction(r.item_type) && !r.actionedWith).length;

  return (
    <>
      <div className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col${fullHeight ? " flex-1 min-h-0" : ""}`}>

        {/* ── Header — always visible ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 lg:px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {totalBelow > 0 && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            <h2 className="font-semibold text-slate-900 text-sm">Stock Alerts Board</h2>
            {!isLoading && totalBelow > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                {totalBelow} item{totalBelow !== 1 ? "s" : ""} below min
              </span>
            )}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Summary stat cards — always visible ─────────────────────────── */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 shrink-0">
          <div className="px-4 lg:px-5 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Below Min Stock</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums ${totalBelow > 0 ? "text-red-600" : "text-green-600"}`}>
              {isLoading ? "—" : totalBelow}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">total items flagged</p>
          </div>
          <div className="px-4 lg:px-5 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Needs PO</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums ${needsPOCount > 0 ? "text-orange-600" : "text-slate-400"}`}>
              {isLoading ? "—" : needsPOCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">raw / component / bought-out</p>
          </div>
          <div className="px-4 lg:px-5 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Needs Production</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums ${needsProdCount > 0 ? "text-amber-600" : "text-slate-400"}`}>
              {isLoading ? "—" : needsProdCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">sub-assembly work orders</p>
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="p-4 space-y-2 shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center shrink-0">
            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <span className="text-green-600 text-base">✓</span>
            </div>
            <p className="text-sm font-medium text-slate-700">All stock levels are healthy</p>
            <p className="text-xs text-slate-400 mt-1">No items are below their minimum stock threshold</p>
          </div>
        ) : (
          <div className={`overflow-y-auto overflow-x-auto ${fullHeight ? "flex-1 min-h-0" : "max-h-80"}`}>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 sticky top-0 z-10">
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-32 bg-slate-50">Item Code</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">Item Name</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-32 bg-slate-50">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-28 bg-slate-50">Current Stock</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-24 bg-slate-50">Min Stock</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-24 bg-slate-50">Shortage</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-36 bg-slate-50">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const { label: typeLabel, className: typeCls } = itemTypeBadge(row.item_type);
                  const raisePO   = needsPO(row.item_type);
                  const startProd = needsProduction(row.item_type);

                  return (
                    <TableRow key={row.id} className={idx % 2 === 1 ? "bg-muted/50" : ""}>
                      <TableCell className="py-2 font-mono text-xs text-slate-700">{row.item_code}</TableCell>
                      <TableCell className="py-2 text-sm text-slate-800">{row.item_name}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${typeCls}`}>
                          {typeLabel}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm tabular-nums text-slate-700">
                        {row.current_stock.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm tabular-nums text-slate-500">
                        {row.min_stock.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm tabular-nums font-semibold text-red-600">
                        {row.shortage.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        {row.actionedWith === "PO" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-green-200 bg-green-50 text-green-700 text-xs font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            PO Raised
                          </span>
                        ) : row.actionedWith === "DC" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-green-200 bg-green-50 text-green-700 text-xs font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            In Production
                          </span>
                        ) : raisePO ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs px-3"
                            onClick={() =>
                              navigate("/purchase-orders/new", {
                                state: {
                                  prefill_items: [{
                                    item_id: row.id,
                                    description: row.item_name,
                                    qty: Math.max(1, Math.ceil(row.shortage)),
                                    unit: "NOS",
                                  }],
                                },
                              })
                            }
                          >
                            Raise PO
                          </Button>
                        ) : startProd ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                            onClick={() => openWoDialog(row)}
                          >
                            Start Production
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Work Order Dialog ──────────────────────────────────────────────── */}
      <Dialog open={woDialogOpen} onOpenChange={(open) => { if (!open) closeWoDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise Sub-Assembly Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Item — pre-filled, editable */}
            <div className="space-y-1">
              <Label>Item to Build</Label>
              <Select
                value={woForm.item_id}
                onValueChange={(itemId) => {
                  const item = woItems.find((i) => i.id === itemId);
                  if (item) {
                    setWoForm((f) => ({
                      ...f,
                      item_id: item.id,
                      item_code: item.item_code,
                      item_description: item.description,
                      bom_variant_id: "",
                    }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-assembly item…">
                    {woForm.item_id
                      ? `${woForm.item_code} — ${woForm.item_description}`
                      : "Select sub-assembly item…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {woItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.item_code} — {item.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity — pre-filled with shortage */}
            <div className="space-y-1">
              <Label>Quantity to Build</Label>
              <Input
                type="number"
                min={1}
                value={woForm.quantity_to_build}
                onChange={(e) => setWoForm((f) => ({ ...f, quantity_to_build: Number(e.target.value) }))}
              />
            </div>

            {/* BOM Variant */}
            {bomVariants.length > 0 && (
              <div className="space-y-1">
                <Label>BOM Variant</Label>
                <Select
                  value={woForm.bom_variant_id}
                  onValueChange={(v) => setWoForm((f) => ({ ...f, bom_variant_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant…" />
                  </SelectTrigger>
                  <SelectContent>
                    {bomVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.variant_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Planned Date */}
            <div className="space-y-1">
              <Label>Planned Date (optional)</Label>
              <Input
                type="date"
                value={woForm.planned_date}
                onChange={(e) => setWoForm((f) => ({ ...f, planned_date: e.target.value }))}
              />
            </div>

            {/* Work Order Ref */}
            <div className="space-y-1">
              <Label>Work Order Ref (optional)</Label>
              <Input
                placeholder="e.g. WO-2526-001"
                value={woForm.work_order_ref}
                onChange={(e) => setWoForm((f) => ({ ...f, work_order_ref: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any special instructions…"
                value={woForm.notes}
                onChange={(e) => setWoForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeWoDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => createWOMutation.mutate()}
              disabled={!woForm.item_id || woForm.quantity_to_build < 1 || createWOMutation.isPending}
            >
              {createWOMutation.isPending ? "Raising…" : "Raise Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
