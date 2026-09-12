import { describe, it, expect } from "vitest";
import { resolveCandidateStageName, type JobCardStepName } from "@/lib/grn-api";

// Regression test for ConfirmJobCardLinkDialog's radio-option label showing a
// mismatched stage name: it displayed entry_stage (a real, correctly-tracked
// column) next to current_stage_name (a stage NAME pulled straight from
// job_cards.current_stage_name), which shares the staleness problem PR #71
// fixed for the DC-creation continuation banner — current_stage_name can be
// NULL, or can name a different stage than entry_stage, on an otherwise
// healthy job card. The link itself was never affected (it uses entry_stage,
// not the name), but the label was misleading.
//
// The fix (resolveCandidateStageName) looks up the real step name from
// job_card_steps by matching entry_stage to that step's step_number, instead
// of trusting current_stage_name.

describe("resolveCandidateStageName", () => {
  it("uses the job_card_steps name for entry_stage, ignoring a stale current_stage_name", () => {
    const candidate = { job_card_id: "jc-1", entry_stage: 3 };
    const steps: JobCardStepName[] = [
      { job_card_id: "jc-1", step_number: 1, name: "Cutting" },
      { job_card_id: "jc-1", step_number: 2, name: "Machining" },
      { job_card_id: "jc-1", step_number: 3, name: "Plating (Vendor X)" },
    ];

    expect(resolveCandidateStageName(candidate, steps)).toBe("Plating (Vendor X)");
  });

  it("returns the correct step name even when current_stage_name would have named a different stage", () => {
    // Live scenario: job_cards.current_stage_name lags behind entry_stage
    // (e.g. it still says "Machining" — stage 2 — while entry_stage is 3).
    // resolveCandidateStageName never even looks at current_stage_name, so
    // it can't surface that mismatch.
    const candidate = { job_card_id: "jc-2", entry_stage: 3 };
    const steps: JobCardStepName[] = [
      { job_card_id: "jc-2", step_number: 2, name: "Machining" },
      { job_card_id: "jc-2", step_number: 3, name: "Heat Treatment" },
    ];

    expect(resolveCandidateStageName(candidate, steps)).toBe("Heat Treatment");
  });

  it("does not cross-contaminate between job cards sharing a step_number", () => {
    const candidate = { job_card_id: "jc-b", entry_stage: 1 };
    const steps: JobCardStepName[] = [
      { job_card_id: "jc-a", step_number: 1, name: "Cutting" },
      { job_card_id: "jc-b", step_number: 1, name: "Inspection" },
    ];

    expect(resolveCandidateStageName(candidate, steps)).toBe("Inspection");
  });

  it("falls back to — when no job_card_steps row matches entry_stage (e.g. NULL current_stage_name case)", () => {
    const candidate = { job_card_id: "jc-3", entry_stage: 5 };
    const steps: JobCardStepName[] = [
      { job_card_id: "jc-3", step_number: 1, name: "Cutting" },
    ];

    expect(resolveCandidateStageName(candidate, steps)).toBe("—");
  });
});
