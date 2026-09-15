import { describe, it, expect, vi } from "vitest";

// Regression test for the live JobCardCreationDialog.tsx strike-through bug:
// the per-item stage checklist struck a stage through with a checkmark
// whenever job_card_steps.status === 'material_returned', treating it the
// same as 'done'. 'material_returned' means material is physically back
// from the vendor but not yet accepted/QC'd (qty_accepted and completed_at
// still null) — it must render as open/current, same as 'in_progress',
// never struck off.
//
// Verified live (company 45c14753-4e54-4327-bf77-dd9fb72899dc):
//  - DC-26-27/1060, item 230046 (JW-26-27/024), stage 4 "Turning - CNC":
//    status 'material_returned', qty_sent 642, completed_at null — the
//    dialog incorrectly showed it struck through with a checkmark.
//  - item 230054 (JW-26-27/140), stage 4: status 'done', completed_at set —
//    correctly struck off.
//
// This bug and the PR #71-style "Continuing from Stage X" banner fix
// (dc-jc-continuation-banner-stage-calc.test.ts, commit f6853a5) both read
// job_card_steps through the same fetchJobCardStepProgress() helper — but
// that fix only corrected how the suggested stage NUMBER was derived. The
// 'done' | 'material_returned' completeness check itself was inherited
// unchanged from the older, now-deleted fetchCompletedStepsForItem and was
// never corrected — this is the fix for that.

type StepRow = { job_card_id: string; step_number: number; status: string };

let stepsTable: StepRow[] = [];

function makeChain(table: string) {
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    filters.push({ col, val });
    return chain;
  };
  chain.order = () => {
    if (table !== "job_card_steps") return Promise.resolve({ data: [], error: null });
    const rows = stepsTable
      .filter((r) => filters.every((f) => (r as any)[f.col] === f.val))
      .sort((a, b) => a.step_number - b.step_number);
    return Promise.resolve({ data: rows, error: null });
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeChain(table) },
}));

import { fetchJobCardStepProgress } from "@/lib/job-works-api";

describe("fetchJobCardStepProgress — 'material_returned' is not 'complete'", () => {
  it("JW-26-27/024 (item 230046): stage 4 'material_returned' renders as open, not struck through", async () => {
    stepsTable = [
      { job_card_id: "jc-024", step_number: 1, status: "done" },
      { job_card_id: "jc-024", step_number: 2, status: "done" },
      { job_card_id: "jc-024", step_number: 3, status: "done" },
      { job_card_id: "jc-024", step_number: 4, status: "material_returned" },
    ];

    const result = await fetchJobCardStepProgress("jc-024");

    // The checklist strikes through exactly completedStageNumbers — stage 4
    // must NOT be in it.
    expect(result.completedStageNumbers.has(4)).toBe(false);
    expect(result.completedStageNumbers).toEqual(new Set([1, 2, 3]));
    expect(result.lastCompletedStage).toBe(3);
    expect(result.nextOpenStage).toBe(4);
  });

  it("JW-26-27/140 (item 230054): stage 4 'done' still renders struck through, for comparison", async () => {
    stepsTable = [
      { job_card_id: "jc-140", step_number: 1, status: "done" },
      { job_card_id: "jc-140", step_number: 2, status: "done" },
      { job_card_id: "jc-140", step_number: 3, status: "done" },
      { job_card_id: "jc-140", step_number: 4, status: "done" },
    ];

    const result = await fetchJobCardStepProgress("jc-140");

    expect(result.completedStageNumbers.has(4)).toBe(true);
    expect(result.lastCompletedStage).toBe(4);
  });

  it("'in_progress' also renders as open, not struck through", async () => {
    stepsTable = [
      { job_card_id: "jc-ip", step_number: 1, status: "done" },
      { job_card_id: "jc-ip", step_number: 2, status: "in_progress" },
    ];

    const result = await fetchJobCardStepProgress("jc-ip");

    expect(result.completedStageNumbers.has(2)).toBe(false);
    expect(result.nextOpenStage).toBe(2);
  });
});
