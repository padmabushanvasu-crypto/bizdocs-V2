import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { markAsRead } from "@/lib/notifications-api";
import { getCompanyId } from "@/lib/auth-helpers";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OverReceiptLine {
  id: string;
  item_code: string;
  description: string;
  pending_quantity: number;
  received_qty: number;
  unit: string;
}

interface Props {
  grnId: string;
  grnNumber: string;
  overReceiptLines: OverReceiptLine[];
  role: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function GRNFinanceApproval({ grnId, grnNumber, overReceiptLines, role }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canApprove = role === "finance" || role === "admin";

  const approveMutation = useMutation({
    mutationFn: async (decision: "accept_and_pay" | "accept_stock_only") => {
      // 1. Update over_receipt_decision on each over-receipt line
      for (const line of overReceiptLines) {
        const { error } = await (supabase as any)
          .from("grn_line_items")
          .update({ over_receipt_decision: decision })
          .eq("id", line.id);
        if (error) throw error;
      }

      // 2. Advance GRN stage to quality_pending so Stage 2 becomes accessible
      const { error: grnErr } = await (supabase as any)
        .from("grns")
        .update({ grn_stage: "quality_pending" })
        .eq("id", grnId);
      if (grnErr) throw grnErr;

      // 3. Mark matching over_receipt_approval notifications as read
      try {
        const companyId = await getCompanyId();
        await (supabase as any)
          .from("notifications")
          .update({ is_read: true })
          .eq("company_id", companyId)
          .eq("type", "over_receipt_approval")
          .eq("link", `/grns/${grnId}`);
      } catch {
        // Notifications may not exist — ignore
      }
    },
    onSuccess: (_data, decision) => {
      queryClient.invalidateQueries({ queryKey: ["grn-stages", grnId] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const label = decision === "accept_and_pay"
        ? "Excess accepted — invoice will include over-received quantity."
        : "Excess accepted into stock — payment remains at PO quantity.";
      toast({ title: `Over-receipt approved for ${grnNumber}`, description: label });
    },
    onError: (err: any) =>
      toast({ title: "Approval failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border-l-4 border-amber-500 bg-amber-50/20 rounded-r-xl overflow-hidden no-print">
      {/* Header */}
      <div className="px-5 py-4 bg-amber-50/50 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <h2 className="text-base font-bold text-amber-900">Finance Approval Required</h2>
          <p className="text-xs text-amber-700 mt-0.5">
            {canApprove
              ? "This GRN has over-received quantities that require a finance decision before proceeding to QC."
              : "Awaiting finance team approval for over-received quantities."}
          </p>
        </div>
        {!canApprove && <Lock className="h-4 w-4 text-amber-500 ml-auto shrink-0" />}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Over-receipt lines table */}
        <div className="overflow-x-auto rounded-lg border border-amber-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-amber-50 text-xs text-slate-600 uppercase tracking-wide">
                <th className="text-left px-3 py-2.5 font-semibold">Item Code</th>
                <th className="text-left px-3 py-2.5 font-semibold">Description</th>
                <th className="text-right px-3 py-2.5 font-semibold w-28">PO Qty</th>
                <th className="text-right px-3 py-2.5 font-semibold w-28">Received</th>
                <th className="text-right px-3 py-2.5 font-semibold w-28 text-amber-700">Excess</th>
                <th className="text-center px-3 py-2.5 font-semibold w-20">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {overReceiptLines.map((line) => {
                const excess = line.received_qty - line.pending_quantity;
                return (
                  <tr key={line.id} className="bg-white">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{line.item_code || "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium text-slate-800 max-w-[220px]">
                      <span className="block truncate" title={line.description}>{line.description}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-500">
                      {line.pending_quantity}
                      <span className="ml-1 text-[10px] text-muted-foreground">{line.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                      {line.received_qty}
                      <span className="ml-1 text-[10px] text-muted-foreground">{line.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      <span className="text-amber-700 font-semibold">+{excess}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">{line.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-500">{line.unit || "NOS"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        {canApprove ? (
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <div className="flex-1 border border-green-200 rounded-lg p-4 bg-green-50/50 space-y-2">
              <p className="text-xs font-semibold text-green-800">Option 1 — Accept &amp; Pay for Excess</p>
              <p className="text-xs text-green-700">
                Invoice will include the excess quantity. Ensure a PO amendment is raised for the difference.
              </p>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white w-full"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate("accept_and_pay")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Accept &amp; Pay for Excess
              </Button>
            </div>

            <div className="flex-1 border border-blue-200 rounded-lg p-4 bg-blue-50/50 space-y-2">
              <p className="text-xs font-semibold text-blue-800">Option 2 — Accept into Stock, Pay PO Qty Only</p>
              <p className="text-xs text-blue-700">
                Excess stock is received as goodwill. Payment remains at the original PO quantity.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-blue-400 text-blue-700 hover:bg-blue-50 w-full"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate("accept_stock_only")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Accept into Stock, Pay PO Qty Only
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-3 px-4 bg-amber-50 rounded-lg border border-amber-200">
            <Lock className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-800 font-medium">
              Awaiting finance team approval. QC inspection cannot begin until a decision is made.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
