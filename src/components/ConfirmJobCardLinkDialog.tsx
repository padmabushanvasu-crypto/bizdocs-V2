import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import {
  getJobCardLinkCandidates,
  linkDcLineToJobCard,
  type PendingJobCardLink,
} from "@/lib/grn-api";

const NOT_A_JOB_CARD = "__none__";

interface ConfirmJobCardLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingLines: PendingJobCardLink[];
  onResolved: () => void;
  onCancelled: () => void;
}

function LineSection({
  line,
  value,
  onChange,
}: {
  line: PendingJobCardLink;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["job-card-link-candidates", line.dc_line_item_id],
    queryFn: () => getJobCardLinkCandidates(line.dc_line_item_id),
  });

  return (
    <div className="space-y-2 border-b pb-3 last:border-b-0">
      <div className="text-sm font-medium">
        {line.item_code} — DC {line.dc_number}
        {line.dc_stage_name || line.dc_stage_number != null ? (
          <span className="text-muted-foreground font-normal">
            {" "}(stage {line.dc_stage_number ?? "?"}{line.dc_stage_name ? ` — ${line.dc_stage_name}` : ""})
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Loading job cards…</p>
      ) : (
        <RadioGroup value={value} onValueChange={onChange} className="space-y-1.5">
          {candidates.map((c) => {
            const disabled = c.open_external_step == null;
            const id = `${line.dc_line_item_id}-${c.job_card_id}`;
            return (
              <div key={c.job_card_id} className="flex items-start gap-2">
                <RadioGroupItem value={c.job_card_id} id={id} disabled={disabled} className="mt-0.5" />
                <Label htmlFor={id} className={disabled ? "text-muted-foreground font-normal" : "font-normal"}>
                  {c.jc_number} — stage {c.entry_stage} ({c.current_stage_name ?? "—"}), qty {c.quantity_original}
                  {disabled && (
                    <span className="block text-[11px] text-amber-700">
                      needs supervisor — no single open stage
                    </span>
                  )}
                </Label>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <RadioGroupItem value={NOT_A_JOB_CARD} id={`${line.dc_line_item_id}-none`} className="mt-0.5" />
            <Label htmlFor={`${line.dc_line_item_id}-none`} className="font-normal">
              Not part of a job card
            </Label>
          </div>
        </RadioGroup>
      )}
    </div>
  );
}

// Gates GRN store-confirm for DC lines rpc_confirm_grn_store cannot
// auto-resolve on its own (docs/DC_STAGE_FLOW_REDESIGN.md — cutover
// return-leg gap): 0 or 2+ open job cards for the item, or exactly one with
// no single open external stage. All matching/eligibility stays server-side
// in rpc_link_dc_line_to_job_card — this only collects the human decision.
export function ConfirmJobCardLinkDialog({
  open, onOpenChange, pendingLines, onResolved, onCancelled,
}: ConfirmJobCardLinkDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const allSelected = pendingLines.length > 0 && pendingLines.every((l) => !!selections[l.dc_line_item_id]);

  function handleCancel() {
    setSelections({});
    onCancelled();
    onOpenChange(false);
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      for (const line of pendingLines) {
        const sel = selections[line.dc_line_item_id];
        const jobCardId = sel === NOT_A_JOB_CARD ? null : sel;
        try {
          await linkDcLineToJobCard(line.dc_line_item_id, jobCardId);
        } catch (e: any) {
          toast({ title: "Could not link job card", description: e.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["grn-store-queue"] });
      setSelections({});
      onResolved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving && !v) handleCancel(); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm Job Card Link</DialogTitle>
          <DialogDescription>
            These lines came from before job-card tracking and need a decision before receipt can be confirmed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {pendingLines.map((line) => (
            <LineSection
              key={line.dc_line_item_id}
              line={line}
              value={selections[line.dc_line_item_id]}
              onChange={(v) => setSelections((prev) => ({ ...prev, [line.dc_line_item_id]: v }))}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!allSelected || saving}>
            {saving ? "Confirming…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
