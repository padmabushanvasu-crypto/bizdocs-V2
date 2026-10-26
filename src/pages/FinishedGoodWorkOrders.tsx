import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AwoDeleteDialog } from "@/components/AwoDeleteDialog";
import { SerialEntry, fitSerials } from "@/components/SerialEntry";
import {
  fetchSerialsForAwos,
  setAwoSerials,
  findSerialsInUse,
  findDuplicateSerials,
  type FgSerial,
} from "@/lib/fg-serials";
import { formatNumber } from "@/lib/gst-utils";
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
  /** One serial per unit, in unit order; blanks allowed until store acceptance. */
  serials: string[];
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
  serials: [""],
};

/** Serial chips for a row — the per-unit records, falling back to the legacy text. */
function SerialCell({ serials, legacy }: { serials?: FgSerial[]; legacy: string | null }) {
  if (serials && serials.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {serials.map((s) => (
          <span
            key={s.id}
            className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800"
            title={s.needs_verification ? "Not verified yet" : undefined}
          >
            {s.serial_number}
            {s.needs_verification && <span className="text-amber-600">*</span>}
          </span>
        ))}
      </div>
    );
  }
  if (legacy && /\d/.test(legacy)) return <span className="font-mono text-xs text-slate-500">{legacy}</span>;
  return <span className="text-xs text-amber-700">No serial</span>;
}

export default function FinishedGoodWorkOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);

  // Pre-populate from route state (e.g. "Raise Assembly Order" from Dashboard/StockRegister)
  useEffect(() => {
    const prefill = (location.state as any)?.prefillItem;
    if (prefill?.item_id) {
      setForm((f) => ({
        ...f,
        item_id: prefill.item_id,
        item_code: prefill.item_code ?? "",
        item_description: prefill.description ?? "",
      }));
      setDialogOpen(true);
    }
  }, []);
  const [search, setSearch] = useState("");
  const [serialFilter, setSerialFilter] = useState<"all" | "missing">("all");
  const [serialConflicts, setSerialConflicts] = useState<string[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssemblyWorkOrder | null>(null);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      opts.push({ value, label });
    }
    return opts;
  }, []);
  // Default to "All months" (no date constraint); scoping to the current month
  // silently hid older work orders.
  const [month, setMonth] = useState<string | undefined>(undefined);

  const { data: awos = [], isLoading } = useQuery({
    queryKey: ["awo", "finished_good", month, showDeleted],
    queryFn: () => fetchAssemblyWorkOrders({ type: "finished_good", month: month || undefined, showDeleted }),
  });

  const awoIds = useMemo(() => awos.map((a) => a.id), [awos]);
  const { data: serialsByAwo = {} } = useQuery({
    queryKey: ["fg-serials", awoIds],
    queryFn: () => fetchSerialsForAwos(awoIds),
    enabled: awoIds.length > 0,
  });

  const { data: stats } = useQuery({
    queryKey: ["awo-stats", "finished_good"],
    queryFn: () => fetchAwoStats("finished_good"),
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items", "finished_good"],
    queryFn: () => fetchItems({ types: ["finished_good"], pageSize: 200 }),
    enabled: dialogOpen,
  });

  const items = itemsData?.data ?? [];

  const { data: bomVariants = [] } = useQuery({
    queryKey: ["bom-variants", form.item_id],
    queryFn: () => fetchBomVariants(form.item_id),
    enabled: !!form.item_id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const serials = fitSerials(form.serials, form.quantity_to_build).map((x) => x.trim()).filter(Boolean);
      const dups = findDuplicateSerials(serials);
      if (dups.length > 0) throw new Error(`Serial entered more than once: ${dups.join(", ")}`);
      const inUse = await findSerialsInUse(serials);
      if (inUse.length > 0) {
        setSerialConflicts(inUse.map((u) => u.serial_number));
        throw new Error(
          "Already used: " +
            inUse.map((u) => `${u.serial_number}${u.awo_number ? ` (${u.awo_number})` : ""}`).join(", "),
        );
      }
      const newId = await createAssemblyWorkOrder({
        awo_type: "finished_good",
        item_id: form.item_id,
        item_code: form.item_code,
        item_description: form.item_description,
        quantity_to_build: form.quantity_to_build,
        bom_variant_id: form.bom_variant_id || undefined,
        planned_date: form.planned_date || undefined,
        work_order_ref: form.work_order_ref || undefined,
        notes: form.notes || undefined,
      });
      if (serials.length > 0) {
        try {
          await setAwoSerials(newId, serials);
        } catch (e) {
          // The work order exists; send the team to it to fix the serials there.
          toast({ title: "Work order raised — serials not saved", description: (e as Error).message, variant: "destructive" });
        }
      }
      return newId;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["awo", "finished_good"] });
      queryClient.invalidateQueries({ queryKey: ["fg-serials"] });
      toast({ title: "Work order created", description: "Finished good work order raised." });
      setDialogOpen(false);
      setForm(defaultForm);
      setSerialConflicts([]);
      navigate(`/assembly-work-orders/${newId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = awos.filter((awo) => {
    if (!showCancelled && awo.status === 'cancelled') return false;
    const units = serialsByAwo[awo.id] ?? [];
    if (serialFilter === "missing" && units.length >= awo.quantity_to_build) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      units.some((s) => s.serial_number.toLowerCase().includes(q)) ||
      awo.serial_number?.toLowerCase().includes(q) ||
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
          placeholder="Search serial no., WO number, item…"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={serialFilter} onValueChange={(v) => setSerialFilter(v as "all" | "missing")}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Serials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All serials</SelectItem>
            <SelectItem value="missing">Missing serials</SelectItem>
          </SelectContent>
        </Select>
        <Select value={month ?? "all"} onValueChange={(v) => setMonth(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <Checkbox
            checked={showCancelled}
            onCheckedChange={(checked) => setShowCancelled(!!checked)}
          />
          Show cancelled
        </label>
        <Button
          variant={showDeleted ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowDeleted((d) => !d)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> {showDeleted ? "Hide Deleted" : "Show Deleted"}
        </Button>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">WO Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Raised By</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Planned Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">
                    {awos.length === 0 ? "No finished good work orders yet." : "No results match search."}
                  </td>
                </tr>
              ) : (
                filtered.map((awo: AssemblyWorkOrder) => (
                  <tr
                    key={awo.id}
                    className={awo.deleted_at
                      ? "text-slate-400 line-through bg-slate-50/60"
                      : "cursor-pointer hover:bg-muted/30 transition-colors"}
                    onClick={awo.deleted_at ? undefined : () => navigate(`/assembly-work-orders/${awo.id}`)}
                  >
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <SerialCell serials={serialsByAwo[awo.id]} legacy={awo.serial_number} />
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-xs font-medium">{awo.awo_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <p className="font-medium text-sm">{awo.item_code ?? "—"}</p>
                      {awo.item_description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{awo.item_description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatNumber(awo.quantity_to_build)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{awo.raised_by ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">{statusBadge(awo.status)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      {awo.planned_date ? format(parseISO(awo.planned_date), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-slate-500">
                      {differenceInDays(new Date(), parseISO(awo.created_at))}d
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      {awo.deleted_at ? (
                        <span className="text-xs text-slate-400 no-underline">
                          Deleted{awo.delete_disposition ? ` · ${awo.delete_disposition}` : ""}
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(awo);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(defaultForm); setSerialConflicts([]); } }}>
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

            {/* Serial numbers — one per unit */}
            <SerialEntry
              quantity={form.quantity_to_build}
              value={form.serials}
              conflicts={serialConflicts}
              onChange={(serials) => { setForm((f) => ({ ...f, serials })); setSerialConflicts([]); }}
            />

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
              disabled={
                !form.item_id ||
                form.quantity_to_build < 1 ||
                findDuplicateSerials(fitSerials(form.serials, form.quantity_to_build)).length > 0 ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Raising…" : "Raise Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AwoDeleteDialog
        awoId={deleteTarget?.id ?? null}
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onDeleted={() => {
          setDeleteTarget(null);
          queryClient.invalidateQueries({ queryKey: ["awo", "finished_good"] });
          queryClient.invalidateQueries({ queryKey: ["awo-stats", "finished_good"] });
        }}
      />
    </div>
  );
}
