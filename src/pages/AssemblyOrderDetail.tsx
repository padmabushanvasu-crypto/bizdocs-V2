import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory, ChevronLeft, CheckCircle2, XCircle, AlertTriangle, Package,
  BookOpen, Hash, ClipboardCheck, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssemblyOrder,
  confirmAssemblyOrder,
  cancelAssemblyOrder,
  completeProductionRun,
} from "@/lib/assembly-orders-api";
import {
  fetchSerialNumbers,
  createFatCertificate,
  type SerialNumberRecord,
} from "@/lib/fat-api";
import { formatCurrency } from "@/lib/gst-utils";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border border-slate-300",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-green-50 text-green-700 border border-green-200",
  cancelled: "bg-red-50 text-red-700 border border-red-200",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const serialStatusClass: Record<string, string> = {
  in_production: "bg-amber-50 text-amber-700 border border-amber-200",
  in_stock: "bg-blue-50 text-blue-700 border border-blue-200",
  dispatched: "bg-green-50 text-green-700 border border-green-200",
  scrapped: "bg-red-50 text-red-700 border border-red-200",
  cancelled: "bg-slate-100 text-slate-500 border border-slate-200",
};

export default function AssemblyOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Legacy flow state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quantityBuilt, setQuantityBuilt] = useState<number>(0);
  const [serialInputs, setSerialInputs] = useState<string[]>([]);

  // New flow state
  const [markCompleteOpen, setMarkCompleteOpen] = useState(false);

  // FAT dialog state
  const [fatDialogOpen, setFatDialogOpen] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialNumberRecord | null>(null);

  const { data: ao, isLoading } = useQuery({
    queryKey: ["assembly-order", id],
    queryFn: () => fetchAssemblyOrder(id!),
    enabled: !!id,
  });

  const isNewFlow = !!(ao?.serial_numbers_generated);
  const isCompleted = ao?.status === "completed";
  const isEditable = ao?.status === "draft" || ao?.status === "in_progress";

  // Fetch serials for this AO (for new-flow runs, always; for old-flow, only when completed)
  const { data: serialData } = useQuery({
    queryKey: ["serial-numbers-ao", id],
    queryFn: () => fetchSerialNumbers({ assemblyOrderId: id!, pageSize: 100 }),
    enabled: !!id && (isNewFlow || isCompleted),
  });
  const serialRows = serialData?.data ?? [];

  // Legacy confirm mutation
  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmAssemblyOrder(id!, quantityBuilt, serialInputs.filter((s) => s.trim())),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assembly-order", id] });
      queryClient.invalidateQueries({ queryKey: ["assembly-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      queryClient.invalidateQueries({ queryKey: ["stock_status"] });
      setConfirmOpen(false);
      toast({ title: "Production complete!", description: `Built ${quantityBuilt} unit(s) successfully.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // New flow: Mark Complete (backflush)
  const completeMutation = useMutation({
    mutationFn: () => completeProductionRun(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assembly-order", id] });
      queryClient.invalidateQueries({ queryKey: ["assembly-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      queryClient.invalidateQueries({ queryKey: ["serial-numbers-ao", id] });
      queryClient.invalidateQueries({ queryKey: ["stock_status"] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      setMarkCompleteOpen(false);
      toast({ title: "Production complete!", description: "Components deducted, serial numbers moved to In Stock." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAssemblyOrder(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assembly-order", id] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      toast({ title: "Production run cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createFatMutation = useMutation({
    mutationFn: (serial: SerialNumberRecord) =>
      createFatCertificate({
        serial_number_id: serial.id,
        serial_number: serial.serial_number,
        item_id: serial.item_id,
        item_code: serial.item_code,
        item_description: serial.item_description,
        assembly_order_id: serial.assembly_order_id,
      }),
    onSuccess: (fat) => {
      queryClient.invalidateQueries({ queryKey: ["serial-numbers-ao", id] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      setFatDialogOpen(false);
      setSelectedSerial(null);
      toast({ title: "FAT Certificate created", description: fat.fat_number });
      navigate(`/fat-certificates/${fat.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ao) {
    return (
      <div className="p-6 text-center text-muted-foreground">Production run not found.</div>
    );
  }

  const lines = ao.lines ?? [];
  const allAvailable = lines.every((l) => l.is_available);
  const shortLines = lines.filter((l) => !l.is_available);
  const totalCost = lines.reduce((sum, l) => sum + l.consumed_qty * l.unit_cost, 0);
  const costPerUnit = ao.quantity_to_build > 0 ? totalCost / ao.quantity_to_build : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/assembly-orders")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Production
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Factory className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-slate-900">{ao.ao_number}</p>
              <p className="font-semibold text-slate-700 mt-0.5">
                {ao.item_description ?? ao.item_code ?? "No item"}
              </p>
              {ao.item_code && ao.item_description && (
                <p className="font-mono text-xs text-slate-400">{ao.item_code}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusClass[ao.status]}`}>
                  {statusLabels[ao.status]}
                </span>
                <span className="text-sm text-slate-500">
                  Qty: <span className="font-semibold text-slate-800">{ao.quantity_to_build}</span>
                </span>
                {isNewFlow && (
                  <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    {serialRows.length} serial{serialRows.length !== 1 ? "s" : ""} generated
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  Started {format(new Date(ao.created_at), "dd MMM yyyy")}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {/* New flow: Mark Complete button */}
            {isNewFlow && ao.status === "in_progress" && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={() => setMarkCompleteOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark Complete
              </Button>
            )}

            {/* Legacy flow: Confirm Assembly */}
            {!isNewFlow && ao.status === "in_progress" && lines.length > 0 && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={() => {
                  setQuantityBuilt(ao.quantity_to_build);
                  const yymm = format(new Date(), "yyMM");
                  const code = ao.item_code ?? "ITEM";
                  setSerialInputs(
                    Array.from({ length: ao.quantity_to_build }, (_, i) =>
                      `${code}-${yymm}-${String(i + 1).padStart(3, "0")}`
                    )
                  );
                  setConfirmOpen(true);
                }}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark Complete
              </Button>
            )}

            {isEditable && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Cancel this production run?")) cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            )}
            {isCompleted && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/stock-ledger")}
                className="gap-1.5"
              >
                <BookOpen className="h-4 w-4" /> View Stock Ledger
              </Button>
            )}
          </div>
        </div>

        {ao.notes && (
          <p className="mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{ao.notes}</p>
        )}

        {isCompleted && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                Completed — {ao.quantity_built} unit(s) built
              </p>
              {ao.completed_at && (
                <p className="text-xs text-green-600">
                  {format(new Date(ao.completed_at), "dd MMM yyyy, h:mm a")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Serial Numbers Section (new flow — shown always, not just when completed) */}
      {isNewFlow && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900">Serial Numbers</h2>
              <span className="text-xs text-slate-400">{serialRows.length} unit{serialRows.length !== 1 ? "s" : ""}</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate("/serial-numbers")}>
              View All
            </Button>
          </div>
          {serialRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No serial numbers found.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">FAT</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {serialRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{row.serial_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${serialStatusClass[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {row.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {row.fat_completed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> FAT Passed
                          </span>
                        ) : row.status === "in_production" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            Draft FAT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            FAT Pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center print:hidden">
                        {row.fat_completed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => navigate("/fat-certificates")}
                          >
                            <ClipboardCheck className="h-3 w-3" /> View FAT
                          </Button>
                        ) : row.status !== "in_production" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => { setSelectedSerial(row); setFatDialogOpen(true); }}
                          >
                            <Plus className="h-3 w-3" /> Create FAT
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Mark Complete first</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Components Required */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Components Required</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lines.length} component{lines.length !== 1 ? "s" : ""} · will be deducted from stock at Mark Complete
          </p>
        </div>

        {lines.length > 0 && !isCompleted && (
          <div
            className={`mx-5 mt-4 rounded-lg px-4 py-3 flex items-center gap-2 ${
              allAvailable ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
            }`}
          >
            {allAvailable ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-sm font-semibold text-green-800">All components available</p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">
                  {shortLines.length} component{shortLines.length !== 1 ? "s" : ""} short — replenish before marking complete
                </p>
              </>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <Package className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No BOM lines found</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => navigate("/bill-of-materials")}
            >
              Go to Bill of Materials
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 px-0 pb-0 mt-4 mx-5 mb-5">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Component</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Required Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">In Stock</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Unit Cost</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const lineTotal = line.consumed_qty * line.unit_cost;
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        <p className="font-medium text-sm">{line.item_description ?? "—"}</p>
                        {line.item_code && (
                          <p className="text-xs text-muted-foreground font-mono">{line.item_code}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {line.required_qty} {line.unit ?? ""}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        <span className={line.available_qty >= line.required_qty ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>
                          {line.available_qty}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {line.is_available ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" /> Short
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {formatCurrency(line.unit_cost)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-medium">
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cost Summary */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Cost Summary</h2>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {line.item_code ?? line.item_description} × {line.consumed_qty} {line.unit ?? ""}
                </span>
                <span className="font-mono text-slate-700">
                  {formatCurrency(line.consumed_qty * line.unit_cost)}
                </span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-2 mt-2">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Total Production Cost</span>
                <span className="font-mono">{formatCurrency(totalCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 mt-1">
                <span>Cost Per Unit (×{ao.quantity_to_build})</span>
                <span className="font-mono">{formatCurrency(costPerUnit)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Serial Numbers Section (old flow — only when completed) */}
      {!isNewFlow && isCompleted && serialRows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Hash className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Serial Numbers</h2>
            <span className="text-xs text-slate-400">{serialRows.length}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">FAT</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {serialRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{row.serial_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      {row.fat_completed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> FAT Passed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          FAT Pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center print:hidden">
                      {row.fat_completed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => navigate("/fat-certificates")}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" /> View FAT
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { setSelectedSerial(row); setFatDialogOpen(true); }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Create FAT
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark Complete Dialog (new flow) */}
      <Dialog open={markCompleteOpen} onOpenChange={setMarkCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Production Complete</DialogTitle>
            <DialogDescription>
              This will deduct components from stock and move all {serialRows.length} serial number{serialRows.length !== 1 ? "s" : ""} to In Stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">Components to be deducted:</p>
              {lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{line.item_code ?? line.item_description}</span>
                  <span className={`font-mono ${line.available_qty < line.consumed_qty ? "text-amber-600 font-semibold" : "text-slate-800"}`}>
                    {line.consumed_qty} {line.unit ?? ""}
                    {line.available_qty < line.consumed_qty && " ⚠"}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex justify-between text-sm font-semibold text-slate-900">
                <span>Total cost</span>
                <span className="font-mono">{formatCurrency(totalCost)}</span>
              </div>
            </div>
            {shortLines.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                {shortLines.length} component{shortLines.length !== 1 ? "s are" : " is"} short. Stock will be reduced to 0 for those items — consider replenishing first.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkCompleteOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? "Processing…" : `Complete — Build ${ao.quantity_to_build} Unit(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy Confirm Dialog (old flow) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Quantity Being Built</Label>
              <Input
                type="number"
                min={1}
                max={ao.quantity_to_build}
                value={quantityBuilt}
                onChange={(e) => {
                  const qty = parseFloat(e.target.value) || 1;
                  setQuantityBuilt(qty);
                  const yymm = format(new Date(), "yyMM");
                  const code = ao.item_code ?? "ITEM";
                  setSerialInputs(
                    Array.from({ length: qty }, (_, i) =>
                      serialInputs[i] ?? `${code}-${yymm}-${String(i + 1).padStart(3, "0")}`
                    )
                  );
                }}
              />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">Components to be consumed:</p>
              {lines.map((line) => (
                <div key={line.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{line.item_code ?? line.item_description}</span>
                  <span className="font-mono text-slate-800">
                    {line.consumed_qty} {line.unit ?? ""}
                    {line.available_qty < line.consumed_qty && (
                      <span className="text-amber-600 ml-1">(⚠ short)</span>
                    )}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-semibold">
                <span>Total cost</span>
                <span className="font-mono">{formatCurrency(totalCost)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Serial Numbers (optional)</Label>
                <span className="text-xs text-muted-foreground">one per unit</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {Array.from({ length: quantityBuilt }, (_, i) => (
                  <Input
                    key={i}
                    placeholder={`Unit ${i + 1} serial number`}
                    value={serialInputs[i] ?? ""}
                    onChange={(e) => {
                      const next = [...serialInputs];
                      next[i] = e.target.value;
                      setSerialInputs(next);
                    }}
                    className="font-mono text-sm h-8"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || quantityBuilt <= 0}
            >
              {confirmMutation.isPending ? "Processing..." : `Confirm — Build ${quantityBuilt} Unit(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create FAT Dialog */}
      <Dialog open={fatDialogOpen} onOpenChange={(v) => { setFatDialogOpen(v); if (!v) setSelectedSerial(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create FAT Certificate</DialogTitle>
            <DialogDescription>
              Create a Factory Acceptance Test certificate for{" "}
              <span className="font-mono font-semibold">{selectedSerial?.serial_number}</span>.
            </DialogDescription>
          </DialogHeader>
          {selectedSerial && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serial Number</span>
                <span className="font-mono font-semibold">{selectedSerial.serial_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item</span>
                <span>{selectedSerial.item_description ?? selectedSerial.item_code ?? "—"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFatDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedSerial && createFatMutation.mutate(selectedSerial)}
              disabled={createFatMutation.isPending || !selectedSerial}
            >
              {createFatMutation.isPending ? "Creating..." : "Create FAT Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
