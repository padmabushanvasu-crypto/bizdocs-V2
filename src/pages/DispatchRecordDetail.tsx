import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Truck, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchDispatchRecord,
  confirmDispatch,
  markDelivered,
} from "@/lib/dispatch-api";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function statusBadge(status: string) {
  if (status === "draft") return <Badge className="bg-slate-100 text-slate-700">Draft</Badge>;
  if (status === "dispatched") return <Badge className="bg-blue-100 text-blue-800">Dispatched</Badge>;
  if (status === "delivered") return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
  return <Badge>{status}</Badge>;
}

export default function DispatchRecordDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dr, isLoading } = useQuery({
    queryKey: ["dispatch-record", id],
    queryFn: () => fetchDispatchRecord(id!),
    enabled: !!id,
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmDispatch(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-record", id] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-records"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stats"] });
      queryClient.invalidateQueries({ queryKey: ["ready-to-dispatch"] });
      toast({ title: "Dispatch Confirmed", description: "Stock updated and serial numbers marked as dispatched." });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deliveredMutation = useMutation({
    mutationFn: () => markDelivered(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-record", id] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-records"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stats"] });
      toast({ title: "Marked as Delivered" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <div className="p-6 text-slate-500">Loading...</div>;
  if (!dr) return <div className="p-6 text-slate-500">Dispatch record not found.</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Print styles */}
      <style>{`@media print { .no-print { display: none !important; } .print-only { display: block !important; } } .print-only { display: none; }`}</style>

      {/* Header */}
      <div className="no-print flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dispatch-records")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 font-mono">{dr.dr_number}</h1>
              {statusBadge(dr.status)}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {dr.dispatch_date ? format(parseISO(dr.dispatch_date), "dd MMM yyyy") : "—"}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {dr.status === "draft" && (
            <>
              <Button variant="outline" onClick={() => navigate(`/dispatch-records/${dr.id}/edit`)}>
                Edit
              </Button>
              <Button
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                <Truck className="h-4 w-4 mr-1" />
                Confirm Dispatch
              </Button>
            </>
          )}
          {dr.status === "dispatched" && (
            <>
              <Button
                variant="outline"
                disabled={deliveredMutation.isPending}
                onClick={() => deliveredMutation.mutate()}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Mark Delivered
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </>
          )}
          {dr.status === "delivered" && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          )}
        </div>
      </div>

      {/* Info section */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Customer</h2>
          <div>
            <p className="font-medium text-slate-900">{dr.customer_name ?? "—"}</p>
            {dr.customer_po_ref && (
              <p className="text-sm text-slate-500 mt-0.5">PO Ref: {dr.customer_po_ref}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Transport</h2>
          <div className="space-y-1 text-sm text-slate-600">
            <p>Vehicle: <span className="font-medium text-slate-800">{dr.vehicle_number ?? "—"}</span></p>
            <p>Driver: <span className="font-medium text-slate-800">{dr.driver_name ?? "—"}</span></p>
            <p>Contact: <span className="font-medium text-slate-800">{dr.driver_contact ?? "—"}</span></p>
            <p>Dispatched By: <span className="font-medium text-slate-800">{dr.dispatched_by ?? "—"}</span></p>
          </div>
        </div>
      </div>

      {dr.notes && (
        <div className="no-print bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Notes: </span>{dr.notes}
        </div>
      )}

      {/* Items table */}
      <div className="no-print bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-700">Dispatched Units</h2>
        </div>
        {(dr.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No items in this dispatch record.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Serial Number</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Item Code</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Description</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Qty</th>
                <th className="text-center px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dr.items?.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-800">{item.serial_number ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.item_code ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{item.item_description ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Print-only section */}
      <div className="print-only">
        <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>DELIVERY CHALLAN — SUPPLY</h2>
        <p>DR Number: {dr.dr_number}</p>
        <p>Date: {dr.dispatch_date ? format(parseISO(dr.dispatch_date), "dd MMM yyyy") : "—"}</p>
        <p>Customer: {dr.customer_name}</p>
        {dr.customer_po_ref && <p>Customer PO: {dr.customer_po_ref}</p>}
        <p>
          Vehicle: {dr.vehicle_number} | Driver: {dr.driver_name} | Contact: {dr.driver_contact}
        </p>
        <br />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #000", padding: 6, textAlign: "left" }}>S.No</th>
              <th style={{ border: "1px solid #000", padding: 6, textAlign: "left" }}>Serial Number</th>
              <th style={{ border: "1px solid #000", padding: 6, textAlign: "left" }}>Item Description</th>
              <th style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>Qty</th>
              <th style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {dr.items?.map((item, i) => (
              <tr key={item.id}>
                <td style={{ border: "1px solid #000", padding: 6 }}>{i + 1}</td>
                <td style={{ border: "1px solid #000", padding: 6 }}>{item.serial_number}</td>
                <td style={{ border: "1px solid #000", padding: 6 }}>{item.item_description}</td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{item.quantity}</td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dr.customer_po_ref && (
          <p style={{ marginTop: 16, fontSize: 12 }}>
            These goods have been dispatched against Customer PO: {dr.customer_po_ref}
          </p>
        )}
        <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
          <div>Receiver Signature: ___________________</div>
          <div>Date: ___________________</div>
        </div>
      </div>
    </div>
  );
}
