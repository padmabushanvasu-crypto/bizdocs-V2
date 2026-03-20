import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Package,
  TrendingDown, TrendingUp, BookOpen, Hash, ClipboardCheck, Plus,
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
  updateAssemblyOrder,
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

export default function AssemblyOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quantityBuilt, setQuantityBuilt] = useState<number>(0);
  const [serialInputs, setSerialInputs] = useState<string[]>([]);
  const [fatDialogOpen, setFatDialogOpen] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialNumberRecord | null>(null);

  const { data: ao, isLoading } = useQuery({
    queryKey: ["assembly-order", id],
    queryFn: () => fetchAssemblyOrder(id!),
    enabled: !!id,
    onSuccess: (data) => {
      setQuantityBuilt(data.quantity_to_build);
      // Pre-fill serial number suggestions
      const now = new Date();
      const yymm = format(now, "yyMM");
      const code = data.item_code ?? "ITEM";
      setSerialInputs(
        Array.from({ length: data.quantity_to_build }, (_, i) =>
          `${code}-${yymm}-${String(i + 1).padStart(3, "0")}`
        )
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmAssemblyOrder(
        id!,
        quantityBuilt,
        serialInputs.filter((s) => s.trim())
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assembly-order", id] });
      queryClient.invalidateQueries({ queryKey: ["assembly-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      queryClient.invalidateQueries({ queryKey: ["stock_status"] });
      setConfirmOpen(false);
      toast({ title: "Assembly confirmed!", description: `Built ${quantityBuilt} unit(s) successfully.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => updateAssemblyOrder(id!, { status: "in_progress" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assembly-order", id] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      toast({ title: "Assembly Order started" });
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
      toast({ title: "Assembly Order cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isCompleted = ao?.status === "completed";

  const { data: serialData } = useQuery({
    queryKey: ["serial-numbers-ao", id],
    queryFn: () => fetchSerialNumbers({ assemblyOrderId: id!, pageSize: 50 }),
    enabled: !!id && isCompleted,
  });
  const serialRows = serialData?.data ?? [];

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
      <div className="p-6 text-center text-muted-foreground">Assembly Order not found.</div>
    );
  }

  const lines = ao.lines ?? [];
  const allAvailable = lines.every((l) => l.is_available);
  const shortLines = lines.filter((l) => !l.is_available);
  const hasAnyStock = lines.some((l) => l.available_qty > 0);
  const isEditable = ao.status === "draft" || ao.status === "in_progress";

  // Cost summary
  const totalCost = lines.reduce(
    (sum, l) => sum + l.consumed_qty * l.unit_cost,
    0
  );
  const costPerUnit = quantityBuilt > 0 ? totalCost / quantityBuilt : 0;

  const openConfirm = () => {
    setQuantityBuilt(ao.quantity_to_build);
    const now = new Date();
    const yymm = format(now, "yyMM");
    const code = ao.item_code ?? "ITEM";
    setSerialInputs(
      Array.from({ length: ao.quantity_to_build }, (_, i) =>
        `${code}-${yymm}-${String(i + 1).padStart(3, "0")}`
      )
    );
    setConfirmOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/assembly-orders")} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Assembly Orders
      </Button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-blue-600" />
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
                  Qty to build: <span className="font-semibold text-slate-800">{ao.quantity_to_build}</span>
                </span>
                <span className="text-xs text-slate-400">
                  Created {format(new Date(ao.created_at), "dd MMM yyyy")}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {ao.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                Start Assembly
              </Button>
            )}
            {isEditable && lines.length > 0 && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                onClick={openConfirm}
                disabled={!hasAnyStock}
              >
                <CheckCircle2 className="h-4 w-4" /> Confirm Assembly
              </Button>
            )}
            {isEditable && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Cancel this Assembly Order?")) cancelMutation.mutate();
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

        {/* Completed banner */}
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

      {/* BOM Lines — Components Required */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Components Required</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lines.length} component{lines.length !== 1 ? "s" : ""} needed to build {ao.quantity_to_build} unit{ao.quantity_to_build !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Availability banner */}
        {lines.length > 0 && (
          <div
            className={`mx-5 mt-4 rounded-lg px-4 py-3 flex items-center gap-2 ${
              allAvailable
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {allAvailable ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <p className="text-sm font-semibold text-green-800">
                  All components available — ready to build
                </p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <p className="text-sm font-semibold text-red-800">
                  {shortLines.length} item{shortLines.length !== 1 ? "s are" : " is"} short — cannot build full quantity
                </p>
              </>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <Package className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No BOM lines found</p>
            <p className="text-xs text-slate-400 mt-1">
              Define a Bill of Materials for this item first, then create a new Assembly Order.
            </p>
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
          <div className="overflow-x-auto px-5 pb-5 mt-4">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="text-right">Required Qty</th>
                  <th className="text-right">In Stock</th>
                  <th>Availability</th>
                  <th className="text-right">Unit Cost</th>
                  <th className="text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const shortage = line.required_qty - line.available_qty;
                  const lineTotal = line.consumed_qty * line.unit_cost;
                  return (
                    <tr key={line.id}>
                      <td>
                        <p className="font-medium text-sm">{line.item_description ?? "—"}</p>
                        {line.item_code && (
                          <p className="text-xs text-muted-foreground font-mono">{line.item_code}</p>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        {line.required_qty} {line.unit ?? ""}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        <span className={line.available_qty >= line.required_qty ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                          {line.available_qty}
                        </span>
                      </td>
                      <td>
                        {line.is_available ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" /> Short — need {Math.ceil(shortage)} more
                          </span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(line.unit_cost)}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm font-medium">
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
                <span>Total Assembly Cost</span>
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

      {/* Serial Numbers Section (shown when completed) */}
      {isCompleted && serialRows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900">Serial Numbers</h2>
              <span className="text-xs text-slate-400">{serialRows.length} unit{serialRows.length !== 1 ? "s" : ""}</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/serial-numbers")}>
              <Hash className="h-3 w-3" /> View All
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Serial Number</th>
                  <th>Status</th>
                  <th>FAT</th>
                  <th className="print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {serialRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono font-semibold text-primary">{row.serial_number}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {row.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </td>
                    <td>
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
                    <td className="print:hidden">
                      {row.fat_completed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => navigate("/fat-certificates")}
                        >
                          <ClipboardCheck className="h-3 w-3" /> View FAT
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => { setSelectedSerial(row); setFatDialogOpen(true); }}
                        >
                          <Plus className="h-3 w-3" /> Create FAT
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

      {/* Create FAT Dialog */}
      <Dialog open={fatDialogOpen} onOpenChange={(v) => { setFatDialogOpen(v); if (!v) setSelectedSerial(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create FAT Certificate</DialogTitle>
            <DialogDescription>
              Create a Factory Acceptance Test certificate for serial number{" "}
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

      {/* Confirm Assembly Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm Assembly</DialogTitle>
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
                  const now = new Date();
                  const yymm = format(now, "yyMM");
                  const code = ao.item_code ?? "ITEM";
                  setSerialInputs(
                    Array.from({ length: qty }, (_, i) =>
                      serialInputs[i] ?? `${code}-${yymm}-${String(i + 1).padStart(3, "0")}`
                    )
                  );
                }}
              />
            </div>

            {/* Components to be consumed */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">
                Components that will be consumed:
              </p>
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
              <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex justify-between text-sm font-semibold text-slate-900">
                <span>Total cost</span>
                <span className="font-mono">{formatCurrency(totalCost)}</span>
              </div>
            </div>

            {/* Serial Numbers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Serial Numbers (one per unit)</Label>
                <span className="text-xs text-muted-foreground">optional</span>
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
              <p className="text-xs text-muted-foreground">Leave blank to skip serial number tracking.</p>
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
    </div>
  );
}
