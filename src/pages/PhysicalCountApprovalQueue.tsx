import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2, XCircle, Clock, Inbox, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchPendingPhysicalCounts,
  approvePhysicalCount,
  rejectPhysicalCount,
  type PhysicalCountRow,
} from "@/lib/physical-count-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { format, parseISO } from "date-fns";

// Role-gated the same way production-api.ts gates the damage-disposition
// concession picker (profiles.role IN ('qc_team','admin')) — NOT the
// hardcoded id list EditApprovalQueue uses for a different domain.
// is_stock_count_approver() on the DB is the real, authoritative gate;
// rpc_approve_physical_count / rpc_reject_physical_count re-verify it
// server-side, so this client check only decides whether to show buttons
// that would otherwise just fail.
export default function PhysicalCountApprovalQueue() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const canApprove = role === "qc_team" || role === "admin";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["physical-count-approvals"],
    queryFn: fetchPendingPhysicalCounts,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["physical-count-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["count-worklist"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvePhysicalCount(id, notes[id]?.trim() || undefined),
    onSuccess: (result) => {
      invalidate();
      toast({
        title: "Count approved",
        description: `Free stock: ${formatNumber(result.out_prior_free)} → ${formatNumber(result.out_new_free)} (variance ${result.out_variance >= 0 ? "+" : ""}${formatNumber(result.out_variance)})`,
      });
    },
    onError: (err: any) => toast({ title: "Could not approve", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => {
      const reason = notes[id]?.trim();
      if (!reason) throw new Error("A reason is required to reject a physical count.");
      return rejectPhysicalCount(id, reason);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Count rejected", description: "The submission was rejected." });
    },
    onError: (err: any) => toast({ title: "Could not reject", description: err.message, variant: "destructive" }),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-blue-600" /> Physical count approvals
        </h1>
        <p className="text-sm text-muted-foreground">Pending physical counts awaiting review.</p>
        {!canApprove && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
            Approving or rejecting a count requires the qc_team or admin role. You can view the queue below.
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">No pending physical counts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(rows as PhysicalCountRow[]).map((r) => {
            const variance = r.variance ?? r.counted_qty - r.system_qty_at_submission;
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{r.item_code}</span>
                    {r.description && <span className="text-sm text-slate-600">· {r.description}</span>}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <Clock className="h-3.5 w-3.5" />
                    {r.submitted_by_name ?? "—"} · {(() => { try { return format(parseISO(r.submitted_at), "dd MMM yyyy, HH:mm"); } catch { return r.submitted_at; } })()}
                  </span>
                </div>

                <div className="px-4 py-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-4 font-medium">System qty (at submission)</th>
                          <th className="py-1 pr-4 font-medium">Counted qty</th>
                          <th className="py-1 font-medium">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-slate-50">
                          <td className="py-1 pr-4 text-slate-700 font-mono tabular-nums">{formatNumber(r.system_qty_at_submission)}</td>
                          <td className="py-1 pr-4 text-slate-900 font-medium font-mono tabular-nums">{formatNumber(r.counted_qty)}</td>
                          <td className="py-1 font-mono tabular-nums">
                            <span className={variance === 0 ? "text-slate-400" : variance > 0 ? "text-green-600" : "text-red-600"}>
                              {variance > 0 ? "+" : ""}{formatNumber(variance)}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {r.notes && (
                    <p className="mt-3 text-sm text-slate-600"><span className="font-medium">Notes:</span> {r.notes}</p>
                  )}

                  {canApprove && (
                    <>
                      <Textarea
                        className="mt-3"
                        placeholder="Review notes (required to reject, optional to approve)"
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      />

                      <div className="mt-3 flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-red-200 hover:border-red-300"
                          disabled={busy || !notes[r.id]?.trim()}
                          onClick={() => rejectMutation.mutate(r.id)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => approveMutation.mutate(r.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
