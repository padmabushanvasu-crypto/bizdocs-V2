import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle2, XCircle, Clock, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isEditApprover, friendlyEditRequestError } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

// Human labels for the grn_line_items columns that Stage 1 edit requests carry.
const FIELD_LABELS: Record<string, string> = {
  received_qty:         "Received qty",
  receiving_now:        "Received qty (mirror)",
  qty_matched:          "All units matched?",
  qty_matched_qty:      "Matched qty",
  condition_on_arrival: "Condition on arrival",
  packing_intact:       "Packing intact",
  quantitative_notes:   "Notes",
  vendor_invoice_ref:   "Vendor invoice ref",
  product_match:        "Product match",
  matching_units:       "Matching units",
  non_matching_units:   "Non-matching units",
  mismatch_reason:      "Mismatch reason",
  mismatch_disposition: "Mismatch disposition",
  over_receipt_qty:     "Over-receipt qty",
  received_now_2:       "Alt received qty",
  stage1_rejected_qty:  "Rejected qty (Stage 1)",
  jig_confirmed:        "Jig/mould returned",
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

interface EditRequestRow {
  id: string;
  entity_id: string;
  record_id: string;
  proposed_changes: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
  reason: string | null;
  requested_by: string | null;
  requested_at: string;
}

async function fetchPendingGrnEditRequests() {
  const { data, error } = await (supabase as any)
    .from("edit_requests")
    .select("id, entity_id, record_id, proposed_changes, previous_values, reason, requested_by, requested_at")
    .eq("entity_type", "grn")
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as EditRequestRow[];

  // Enrich with GRN numbers, line descriptions and requester names — three
  // small in() lookups keyed off the ids the requests already carry.
  const grnIds  = [...new Set(rows.map((r) => r.entity_id).filter(Boolean))];
  const lineIds = [...new Set(rows.map((r) => r.record_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))] as string[];

  const [grnsRes, linesRes, usersRes] = await Promise.all([
    grnIds.length  ? (supabase as any).from("grns").select("id, grn_number").in("id", grnIds)                                   : Promise.resolve({ data: [] }),
    lineIds.length ? (supabase as any).from("grn_line_items").select("id, description, drawing_number").in("id", lineIds)       : Promise.resolve({ data: [] }),
    userIds.length ? (supabase as any).from("profiles").select("id, full_name, display_name, email").in("id", userIds)         : Promise.resolve({ data: [] }),
  ]);

  const grnMap  = new Map((grnsRes.data  ?? []).map((g: any) => [g.id, g.grn_number]));
  const lineMap = new Map((linesRes.data ?? []).map((l: any) => [l.id, l]));
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [u.id, u.display_name || u.full_name || u.email || u.id]));

  return rows.map((r) => ({
    ...r,
    grn_number: (grnMap.get(r.entity_id) as string) ?? r.entity_id,
    line: (lineMap.get(r.record_id) as any) ?? null,
    requester: r.requested_by ? ((userMap.get(r.requested_by) as string) ?? r.requested_by) : "—",
  }));
}

type EnrichedRequest = Awaited<ReturnType<typeof fetchPendingGrnEditRequests>>[number];

export default function EditApprovalQueue() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Client-side gate. The DB (is_edit_approver + RPC checks) is the real guard,
  // so this only keeps non-approvers out of a page that would be useless to them.
  // Computed before the hooks below so the guard return can come after them
  // (rules-of-hooks: no conditional hook calls).
  const approver = isEditApprover(user?.id);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["edit-approval-queue"],
    queryFn: fetchPendingGrnEditRequests,
    enabled: approver,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("rpc_approve_edit_request", {
        p_request_id: id,
        p_review_notes: notes[id]?.trim() ? notes[id].trim() : null,
      });
      if (error) throw new Error(friendlyEditRequestError(error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edit-approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["grn-stages"] });
      queryClient.invalidateQueries({ queryKey: ["grn-edit-requests"] });
      toast({ title: "Edit approved", description: "The change has been applied." });
    },
    onError: (err: any) => toast({ title: "Could not approve", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("rpc_reject_edit_request", {
        p_request_id: id,
        p_review_notes: notes[id]?.trim() ? notes[id].trim() : null,
      });
      if (error) throw new Error(friendlyEditRequestError(error));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["edit-approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["grn-edit-requests"] });
      toast({ title: "Edit rejected", description: "The request was rejected." });
    },
    onError: (err: any) => toast({ title: "Could not reject", description: err.message, variant: "destructive" }),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;

  if (!approver) return <Navigate to="/" replace />;

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
        <h1 className="text-xl font-bold text-foreground">Edit approvals</h1>
        <p className="text-sm text-muted-foreground">Pending GRN edit requests awaiting your review.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">No pending edit requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(requests as EnrichedRequest[]).map((r) => {
            const changeKeys = Object.keys(r.proposed_changes ?? {});
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">GRN {r.grn_number}</span>
                    {r.line && (
                      <span className="text-sm text-slate-600">
                        · {r.line.description}
                        {r.line.drawing_number ? ` (${r.line.drawing_number})` : ""}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <Clock className="h-3.5 w-3.5" />
                    {r.requester} · {(() => { try { return format(parseISO(r.requested_at), "dd MMM yyyy, HH:mm"); } catch { return r.requested_at; } })()}
                  </span>
                </div>

                <div className="px-4 py-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-4 font-medium">Field</th>
                          <th className="py-1 pr-4 font-medium">Previous</th>
                          <th className="py-1 font-medium">Proposed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeKeys.map((k) => (
                          <tr key={k} className="border-t border-slate-50">
                            <td className="py-1 pr-4 text-slate-700">{FIELD_LABELS[k] ?? k}</td>
                            <td className="py-1 pr-4 text-slate-500 line-through">{fmtVal((r.previous_values ?? {})[k])}</td>
                            <td className="py-1 font-medium text-slate-900">{fmtVal((r.proposed_changes ?? {})[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {r.reason && (
                    <p className="mt-3 text-sm text-slate-600"><span className="font-medium">Reason:</span> {r.reason}</p>
                  )}

                  <Textarea
                    className="mt-3"
                    placeholder="Review notes (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />

                  <div className="mt-3 flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-red-200 hover:border-red-300"
                      disabled={busy}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
