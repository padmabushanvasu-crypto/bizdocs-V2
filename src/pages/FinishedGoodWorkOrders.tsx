import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssemblyWorkOrders,
  createAssemblyWorkOrder,
  fetchAwoStats,
  type AssemblyWorkOrder,
} from "@/lib/production-api";
import { fetchItems } from "@/lib/items-api";
import { fetchBomVariants } from "@/lib/bom-api";
import { format, differenceInDays, parseISO } from "date-fns";

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-slate-100 text-slate-700" },
    pending_materials: { label: "Pending Materials", className: "bg-amber-100 text-amber-800" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-800" },
    complete: { label: "Complete", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

interface FormState {
  item_id: string;
  item_code: string;
  item_description: string;
  quantity_to_build: number;
  bom_variant_id: string;
  planned_date: string;
  work_order_ref: string;
  notes: string;
  serial_number: string;
}

const defaultForm: FormState = {
  item_id: "",
  item_code: "",
  item_description: "",
  quantity_to_build: 1,
  bom_variant_id: "",
  planned_date: "",
  work_order_ref: "",
  notes: "",
  serial_number: "",
};

function generateSerialNumber(itemCode: string): string {
  const now = new Date();
  const yy = format(now, "yy");
  const mm = format(now, "MM");
  return `${itemCode}-${yy}${mm}-001`;
}

export default function FinishedGoodWorkOrders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");

  const { data: awos = [], isLoading } = useQuery({
    queryKey: ["awo", "finished_good", month],
    queryFn: () => fetchAssemblyWorkOrders({ type: "finished_good", month: month || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ["awo-stats", "finished_good"],
    queryFn: () => fetchAwoStats("finished_good"),
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items", "finished_good_or_sub"],
    queryFn: () => fetchItems({ types: ["finished_good", "sub_assembly"], pageSize: 200 }),
    enabled: dialogOpen,
  });

  const items = itemsData?.data ?? [];

  const { data: bomVariants = [] } = useQuery({
    queryKey: ["bom-variants", form.item_id],
    queryFn: () => fetchBomVariants(form.item_id),
    enabled: !!form.item_id,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAssemblyWorkOrder({
        awo_type: "finished_good",
        item_id: form.item_id,
        item_code: form.item_code,
        item_description: form.item_description,
        quantity_to_build: form.quantity_to_build,
        bom_variant_id: form.bom_variant_id || undefined,
        planned_date: form.planned_date || undefined,
        work_order_ref: form.work_order_ref || undefined,
        notes: form.notes || undefined,
        serial_number: form.serial_number || undefined,
      }),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["awo", "finished_good"] });
      toast({ title: "Work order created", description: "Finished good work order raised." });
      setDialogOpen(false);
      setForm(defaultForm);
      navigate(`/assembly-work-orders/${newId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = awos.filter((awo) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      awo.awo_number?.toLowerCase().includes(q) ||
      awo.item_description?.toLowerCase().includes(q) ||
      awo.item_code?.toLowerCase().includes(q)
    );
  });

  const handleItemSelect = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      setForm((f) => ({
        ...f,
        item_id: item.id,
        item_code: item.item_code,
        item_description: item.description,
        bom_variant_id: "",
        serial_number: generateSerialNumber(item.item_code),
      }));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Finished Good Work Orders</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Raise New Work Order
        </Button>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3 mb-6 text-sm text-muted-foreground">
        <span><b className="text-foreground">{stats?.draft ?? 0}</b> draft</span>
        <span>·</span>
        <span><b className="text-amber-600">{stats?.pending_materials ?? 0}</b> pending materials</span>
        <span>·</span>
        <span><b className="text-blue-600">{stats?.in_progress ?? 0}</b> in progress</span>
        <span>·</span>
        <span><b className="text-green-600">{stats?.complete_this_month ?? 0}</b> complete this month</span>
      </div>

      {/* Search + Month filter */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by WO number, item…"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="month"
          className="border rounded-md px-3 py-2 text-sm h-10"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        {month && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline px-1"
            onClick={() => setMonth("")}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>WO Number</th>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Raised By</th>
                <th>Status</th>
                <th>Planned Date</th>
                <th className="text-right">Days Open</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground">
                    {awos.length === 0 ? "No finished good work orders yet." : "No results match search."}
                  </td>
                </tr>
              ) : (
                filtered.map((awo: AssemblyWorkOrder) => (
                  <tr
                    key={awo.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/assembly-work-orders/${awo.id}`)}
                  >
                    <td className="font-mono text-xs font-medium">{awo.awo_number}</td>
                    <td>
                      <p className="font-medium text-sm">{awo.item_code ?? "—"}</p>
                      {awo.item_description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{awo.item_description}</p>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm">{awo.quantity_to_build}</td>
                    <td className="text-sm">{awo.raised_by ?? "—"}</td>
                    <td>{statusBadge(awo.status)}</td>
                    <td className="text-sm">
                      {awo.planned_date ? format(parseISO(awo.planned_date), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right text-sm text-slate-500">
                      {differenceInDays(new Date(), parseISO(awo.created_at))}d
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/assembly-work-orders/${awo.id}`);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm(defaultForm); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise New Finished Good Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Item select */}
            <div className="space-y-1">
              <Label>Item to Build</Label>
              <Select value={form.item_id} onValueChange={handleItemSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select finished good item…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.item_code} — {item.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-1">
              <Label>Quantity to Build</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity_to_build}
                onChange={(e) => setForm((f) => ({ ...f, quantity_to_build: Number(e.target.value) }))}
              />
            </div>

            {/* Serial Number */}
            <div className="space-y-1">
              <Label>Serial Number</Label>
              <Input
                placeholder="Auto-generated, can be edited"
                value={form.serial_number}
                onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
              />
            </div>

            {/* BOM Variant */}
            {bomVariants.length > 0 && (
              <div className="space-y-1">
                <Label>BOM Variant</Label>
                <Select
                  value={form.bom_variant_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, bom_variant_id: v }))}
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
                value={form.planned_date}
                onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
              />
            </div>

            {/* Work Order Ref */}
            <div className="space-y-1">
              <Label>Work Order Ref (optional)</Label>
              <Input
                placeholder="e.g. WO-2526-001"
                value={form.work_order_ref}
                onChange={(e) => setForm((f) => ({ ...f, work_order_ref: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any special instructions…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.item_id || form.quantity_to_build < 1 || createMutation.isPending}
            >
              {createMutation.isPending ? "Raising…" : "Raise Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
