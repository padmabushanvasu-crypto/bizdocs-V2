import { describe, it, expect, vi } from "vitest";

// Regression test for the live "Continuing from Stage X — suggesting Stage Y"
// banner bug shown above the stage checklist when creating a DC-linked job
// card (JobCardCreationDialog.tsx).
//
// The banner and the initial stage selection used to be computed as
// `(existingMatch.current_stage ?? 0) + 1`, treating job_cards.current_stage
// as "the last completed stage". Live data shows that's wrong on two counts:
//
//  1. current_stage is NOT "last completed" — every writer of that column
//     (grn-api.ts's return-confirmation flow, and the "link existing JC"
//     path in JobCardCreationDialog.tsx itself) sets it to the *next open*
//     step number. Adding +1 to an already-correct "next open stage" value
//     overshoots by one stage.
//     Verified live: JC JW-26-27/140 (item 230054) has only 5 routing
//     stages; step 5 is still 'pending'. current_stage=5 (correct — that IS
//     the open stage), but the old code suggested Stage 6, which doesn't
//     exist.
//  2. current_stage is unreliably populated in the first place — the
//     "create new JC" path (createJobWork) never sets it at all, so it can
//     be NULL on a job card whose job_card_steps are perfectly fine.
//     Verified live: JC JW-26-27/024 (item 230046) has steps 1-4 done
//     (step 4 'material_returned', a real vendor + linked DC) and step 5
//     genuinely 'pending' — but current_stage was NULL, so the old code
//     rendered a blank stage number and suggested Stage 1, even though
//     steps 1-4 are already done.
//
// The fix (fetchJobCardStepProgress) derives both numbers directly from
// job_card_steps — the same reliable source already used correctly for the
// checklist's struck-through state — instead of trusting job_cards.current_stage.
//
// It also fixes a related, separately-confirmed bug: the old
// fetchCompletedStepsForItem picked "the most recent non-cancelled job card
// for this item_id", which can silently pick a DIFFERENT, unrelated job card
// than the one actually being continued (or a stale finished one), making a
// brand-new job card show steps as already done. fetchJobCardStepProgress
// takes an explicit job_card_id instead, so it can never cross-contaminate
// between job cards for the same item.

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

describe("fetchJobCardStepProgress — DC-creation continuation banner", () => {
  it("JW-26-27/024 (item 230046): steps 1-4 done, step 5 pending — suggests Stage 5, not Stage 1", async () => {
    stepsTable = [
      { job_card_id: "jc-024", step_number: 1, status: "done" },
      { job_card_id: "jc-024", step_number: 2, status: "done" },
      { job_card_id: "jc-024", step_number: 3, status: "done" },
      { job_card_id: "jc-024", step_number: 4, status: "material_returned" },
      { job_card_id: "jc-024", step_number: 5, status: "pending" },
    ];

    const result = await fetchJobCardStepProgress("jc-024");

    expect(result.lastCompletedStage).toBe(4);
    expect(result.nextOpenStage).toBe(5);
    expect(result.completedStageNumbers).toEqual(new Set([1, 2, 3, 4]));
  });

  it("JW-26-27/140 (item 230054): only 5 stages exist, step 5 itself still pending — suggests Stage 5, never Stage 6", async () => {
    stepsTable = [
      { job_card_id: "jc-140", step_number: 1, status: "pre_bizdocs" },
      { job_card_id: "jc-140", step_number: 2, status: "pre_bizdocs" },
      { job_card_id: "jc-140", step_number: 3, status: "pre_bizdocs" },
      { job_card_id: "jc-140", step_number: 4, status: "pre_bizdocs" },
      { job_card_id: "jc-140", step_number: 5, status: "pending" },
    ];

    const result = await fetchJobCardStepProgress("jc-140");

    // Nothing is actually done yet — "continuing from" a completed stage
    // doesn't apply here.
    expect(result.lastCompletedStage).toBeNull();
    // The suggested stage must stay within the job card's real 5 steps.
    expect(result.nextOpenStage).toBe(5);
    expect(result.completedStageNumbers.size).toBe(0);
  });

  it("does not leak a different job card's completed steps for the same item", async () => {
    stepsTable = [
      // An older, unrelated job card for the same item — fully done.
      { job_card_id: "jc-old", step_number: 1, status: "done" },
      { job_card_id: "jc-old", step_number: 2, status: "done" },
      // The actual job card being continued — nothing done yet.
      { job_card_id: "jc-new", step_number: 1, status: "pending" },
      { job_card_id: "jc-new", step_number: 2, status: "pending" },
    ];

    const result = await fetchJobCardStepProgress("jc-new");

    expect(result.completedStageNumbers.size).toBe(0);
    expect(result.lastCompletedStage).toBeNull();
    expect(result.nextOpenStage).toBe(1);
  });

  it("returns nextOpenStage=null once every real step is done (nothing left to suggest)", async () => {
    stepsTable = [
      { job_card_id: "jc-done", step_number: 1, status: "done" },
      { job_card_id: "jc-done", step_number: 2, status: "material_returned" },
    ];

    const result = await fetchJobCardStepProgress("jc-done");

    expect(result.lastCompletedStage).toBe(2);
    expect(result.nextOpenStage).toBeNull();
    expect(result.completedStageNumbers).toEqual(new Set([1, 2]));
  });
});
