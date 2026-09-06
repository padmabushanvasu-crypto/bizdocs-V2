import { useQuery } from "@tanstack/react-query";
import {
  fetchOpenJobCardsForItem,
  fetchEligibleExternalStagesForJobCard,
} from "@/lib/job-works-api";
import { Label } from "@/components/ui/label";

interface JobCardLinePickerProps {
  itemId: string | null;
  jobCardId: string | null;
  stepNumber: number | null;
  // Called with (jobCardId, stepNumber). stepNumber is null whenever the
  // line isn't ready to be issued yet — no job card picked, nothing
  // eligible, or (with >1 eligible stage) nothing picked from the dropdown
  // yet. The parent form gates saving/issuing on this being non-null for
  // every line that has a job card selected.
  onChange: (jobCardId: string | null, stepNumber: number | null) => void;
}

// New stage-ledger model (DC_STAGE_FLOW_REDESIGN.md §4.2/§4.4) — the DC
// form's "which job card, which stage?" picker for a job-work line. Fully
// separate from the legacy job_work_id / lineRoutes picker elsewhere in
// DeliveryChallanForm.tsx, which stays untouched. Renders nothing when the
// item has no open (non-legacy) job cards, so it's invisible/inert for
// every line until the new model actually applies.
export function JobCardLinePicker({ itemId, jobCardId, stepNumber, onChange }: JobCardLinePickerProps) {
  const { data: openJobCards = [] } = useQuery({
    queryKey: ["open-job-cards-for-item", itemId],
    queryFn: () => fetchOpenJobCardsForItem(itemId!),
    enabled: !!itemId,
  });

  const { data: eligibleStages, isLoading: stagesLoading } = useQuery({
    queryKey: ["eligible-external-stages", jobCardId],
    queryFn: () => fetchEligibleExternalStagesForJobCard(jobCardId!),
    enabled: !!jobCardId,
  });

  if (!itemId || openJobCards.length === 0) return null;

  const selectedJc = openJobCards.find((jc) => jc.id === jobCardId) ?? null;

  return (
    <tr>
      <td />
      <td colSpan={12} className="px-3 py-2">
      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-2">
      <Label className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
        Job Card (new)
      </Label>
      <select
        className="w-full border border-emerald-300 rounded px-2 py-1.5 text-sm bg-white"
        value={jobCardId ?? ""}
        onChange={(e) => onChange(e.target.value || null, null)}
      >
        <option value="">— Not linked to a job card —</option>
        {openJobCards.map((jc) => (
          <option key={jc.id} value={jc.id}>
            {jc.jc_number} (qty {jc.quantity_original} {jc.unit ?? ""})
          </option>
        ))}
      </select>

      {selectedJc && (
        <div>
          {stagesLoading ? (
            <p className="text-emerald-700">Loading eligible stages…</p>
          ) : !eligibleStages || eligibleStages.length === 0 ? (
            <p className="text-red-700 font-medium">
              Nothing currently eligible to send for this job card.
            </p>
          ) : eligibleStages.length === 1 ? (
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-emerald-700 shrink-0">Stage</Label>
              <input
                type="number"
                className="w-20 border border-emerald-300 rounded px-2 py-1 text-sm"
                value={stepNumber ?? eligibleStages[0].step_number}
                onChange={(e) => onChange(jobCardId, e.target.value ? Number(e.target.value) : null)}
              />
              <span className="text-emerald-700">
                {eligibleStages[0].process_name} ({eligibleStages[0].eligible_qty} available)
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px] text-emerald-700">Stage * (required — more than one eligible)</Label>
              <select
                className="w-full border border-emerald-300 rounded px-2 py-1.5 text-sm bg-white"
                value={stepNumber ?? ""}
                onChange={(e) => onChange(jobCardId, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select stage…</option>
                {eligibleStages.map((s) => (
                  <option key={s.step_number} value={s.step_number}>
                    {s.step_number} — {s.process_name} ({s.eligible_qty} available)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      </div>
      </td>
    </tr>
  );
}
