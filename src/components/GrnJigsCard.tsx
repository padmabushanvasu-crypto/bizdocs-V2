import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchJigLinkCandidates,
  reverseJigEvent,
  submitPendingJigAnswers,
  buildJigAnswer,
  describeJigAnswer,
  draftAllReturned,
  draftReturnedQty,
  emptyJigDraft,
  WRITE_OFF_REASONS,
  type GrnJigQuestion,
  type JigAnswerDraft,
} from "@/lib/grn-jigs-api";

export const GRN_JIGS_QUERY_KEY = (grnId: string) => ["grn-jig-questions", grnId] as const;

interface Props {
  grnId: string;
  rows: GrnJigQuestion[];
  drafts: Map<string, JigAnswerDraft>;
  onDraftChange: (dcJigId: string, next: JigAnswerDraft) => void;
  /** true while the Stage 1 save submits the answers; false → own Save button. */
  submitWithStage1: boolean;
  disabled?: boolean;
}

function QuestionRow({
  grnId, row, draft, onChange,
}: {
  grnId: string;
  row: GrnJigQuestion;
  draft: JigAnswerDraft;
  onChange: (next: JigAnswerDraft) => void;
}) {
  const allReturned = draftAllReturned(row, draft);
  const returnedQty = draftReturnedQty(row, draft);
  const needQ2 = returnedQty !== null && !allReturned;
  const wantCandidates = needQ2 && draft.hasPending === "yes";

  const { data: candidates = [], error: candErr, isLoading: candLoading } = useQuery({
    queryKey: ["jig-link-candidates", grnId, row.dc_jig_id],
    queryFn: () => fetchJigLinkCandidates(grnId, row.dc_jig_id),
    enabled: wantCandidates,
  });

  // Exactly one candidate → auto-select it.
  useEffect(() => {
    if (wantCandidates && candidates.length === 1 && draft.linkedDcId !== candidates[0].dc_id) {
      onChange({ ...draft, linkedDcId: candidates[0].dc_id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCandidates, candidates]);

  const set = (patch: Partial<JigAnswerDraft>) => onChange({ ...draft, ...patch });
  const choice = (active: boolean) =>
    `px-3 py-1 text-xs rounded border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-3">
      <JigHeader row={row} />

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-800">Jig returned?</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={choice(draft.returned === "yes")} onClick={() => set({ returned: "yes", hasPending: null, linkedDcId: null })}>Yes</button>
          <button type="button" className={choice(draft.returned === "no")} onClick={() => set({ returned: "no", hasPending: null, linkedDcId: null })}>No</button>
          {draft.returned === "yes" && row.open_qty > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Returned qty
              <Input
                type="number" min={1} max={row.open_qty} step={1}
                value={draft.returnedQty}
                onChange={(e) => set({ returnedQty: e.target.value, hasPending: null, linkedDcId: null })}
                className="h-7 w-20 text-xs"
              />
              <span>of {row.open_qty}</span>
            </label>
          )}
        </div>
      </div>

      {needQ2 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-800">Items still pending with the vendor?</p>
          <div className="flex gap-2">
            <button type="button" className={choice(draft.hasPending === "yes")} onClick={() => set({ hasPending: "yes", linkedDcId: null })}>Yes</button>
            <button type="button" className={choice(draft.hasPending === "no")} onClick={() => set({ hasPending: "no", linkedDcId: null })}>No</button>
          </div>

          {draft.hasPending === "yes" && (
            <div className="text-xs">
              {candLoading && <p className="text-slate-500">Loading…</p>}
              {candErr && <p className="text-red-600">{(candErr as Error).message}</p>}
              {!candLoading && !candErr && candidates.length === 0 && (
                <p className="text-amber-700">Nothing pending with this vendor — choose No.</p>
              )}
              {candidates.length === 1 && (
                <p className="text-slate-700">
                  Linked to <strong>{candidates[0].dc_number}</strong> ({candidates[0].dc_date ?? "—"}) · pending {candidates[0].pending_qty}
                  {candidates[0].job_order_numbers ? ` · JO ${candidates[0].job_order_numbers}` : ""}
                </p>
              )}
              {candidates.length > 1 && (
                <div className="space-y-1">
                  {candidates.map((c) => (
                    <label key={c.dc_id} className="flex items-start gap-2 cursor-pointer bg-white border rounded px-2 py-1">
                      <input
                        type="radio" name={`link-${row.dc_jig_id}`}
                        checked={draft.linkedDcId === c.dc_id}
                        onChange={() => set({ linkedDcId: c.dc_id })}
                        className="mt-0.5"
                      />
                      <span>
                        <strong>{c.dc_number}</strong> · {c.dc_date ?? "—"} · pending {c.pending_qty}
                        {c.job_order_numbers ? ` · JO ${c.job_order_numbers}` : ""}
                        {c.is_same_dc ? " · this DC" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {draft.hasPending === "no" && (
            <div className="space-y-2 text-xs">
              <p className="text-slate-700">
                If this jig already came back, open the earlier GRN and mark it returned there. Otherwise this goes to
                Finance for approval to charge the vendor.
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={draft.reasonType}
                  onChange={(e) => set({ reasonType: e.target.value as JigAnswerDraft["reasonType"] })}
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">Reason…</option>
                  {WRITE_OFF_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <Input
                  value={draft.reasonText}
                  onChange={(e) => set({ reasonText: e.target.value })}
                  placeholder="Details (required)"
                  className="h-8 text-xs flex-1 min-w-[12rem]"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JigHeader({ row }: { row: GrnJigQuestion }) {
  return (
    <div className="text-xs text-slate-600">
      <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 text-amber-700" /> {row.jig_number}
        <span className="font-normal text-slate-500">— {row.item_code ?? ""} {row.item_description ?? ""}</span>
      </p>
      <p>
        Sent on {row.dc_number ?? "—"} to {row.party_name ?? "—"}: {row.qty_sent} · returned {row.returned_qty} ·
        written off {row.written_off_qty} · outstanding {row.outstanding_qty}
        {row.open_qty !== row.outstanding_qty ? ` · open for this GRN ${row.open_qty}` : ""}
      </p>
    </div>
  );
}

export function GrnJigsCard({ grnId, rows, drafts, onDraftChange, submitWithStage1, disabled }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [undoRow, setUndoRow] = useState<GrnJigQuestion | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoing, setUndoing] = useState(false);

  const pending = rows.filter((r) => r.needs_answer);
  const answered = rows.filter((r) => !r.needs_answer);
  const incomplete = pending.filter((r) => "error" in buildJigAnswer(r, drafts.get(r.dc_jig_id) ?? emptyJigDraft(r)));

  const refetch = () => queryClient.invalidateQueries({ queryKey: GRN_JIGS_QUERY_KEY(grnId) });

  const saveAnswers = async () => {
    setSaving(true);
    try {
      const n = await submitPendingJigAnswers(grnId, drafts);
      toast({ title: "Jig answers saved", description: `${n} jig${n === 1 ? "" : "s"} recorded.` });
    } catch (e: any) {
      toast({ title: "Could not save jig answer", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
      refetch();
    }
  };

  const doUndo = async () => {
    if (!undoRow?.answer_event_id || !undoReason.trim()) return;
    setUndoing(true);
    try {
      await reverseJigEvent(undoRow.answer_event_id, undoReason.trim());
      toast({ title: "Jig answer undone", description: undoRow.jig_number });
      setUndoRow(null);
      setUndoReason("");
    } catch (e: any) {
      toast({ title: "Could not undo", description: e.message, variant: "destructive" });
    } finally {
      setUndoing(false);
      refetch();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden no-print">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Jigs / moulds</h2>
        {pending.length > 0 ? (
          <span className="inline-flex rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
            {pending.length} to answer
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" /> All answered
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {pending.map((r) => (
          <QuestionRow
            key={r.dc_jig_id}
            grnId={grnId}
            row={r}
            draft={drafts.get(r.dc_jig_id) ?? emptyJigDraft(r)}
            onChange={(next) => onDraftChange(r.dc_jig_id, next)}
          />
        ))}

        {pending.length > 0 && submitWithStage1 && (
          <p className="text-xs text-amber-700 font-medium">
            {incomplete.length > 0
              ? `Answer all ${incomplete.length} open jig question${incomplete.length === 1 ? "" : "s"} before saving Stage 1.`
              : "Answers are saved together with Stage 1."}
          </p>
        )}
        {pending.length > 0 && !submitWithStage1 && (
          <Button onClick={saveAnswers} disabled={saving || disabled || incomplete.length > 0} size="sm">
            {saving ? "Saving…" : "Save jig answer"}
          </Button>
        )}

        {answered.map((r) => (
          <div key={r.dc_jig_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
            <JigHeader row={r} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-800">{describeJigAnswer(r)}</span>
              {r.answer_event_id && !disabled && (
                <Button
                  type="button" variant="outline" size="sm" className="h-6 px-2 text-xs ml-auto"
                  onClick={() => { setUndoRow(r); setUndoReason(""); }}
                >
                  <Undo2 className="h-3 w-3 mr-1" /> Undo
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!undoRow} onOpenChange={(o) => { if (!o) setUndoRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo jig answer — {undoRow?.jig_number}</DialogTitle>
            <DialogDescription>This undoes the whole answer for this jig on this GRN.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={undoReason}
            onChange={(e) => setUndoReason(e.target.value)}
            placeholder="Reason (required)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoRow(null)} disabled={undoing}>Cancel</Button>
            <Button onClick={doUndo} disabled={!undoReason.trim() || undoing}>
              {undoing ? "Undoing…" : "Undo answer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
