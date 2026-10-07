import { describe, it, expect, vi, beforeEach } from "vitest";

// Jig custody, GRN side: answer building (Q1/Q2 rules) and the pre-stage
// submit — only needs_answer rows are sent, the first DB error surfaces
// verbatim, and answers recorded before it stand.

let questionRows: any[] = [];
let rpcCalls: { fn: string; args: any }[] = [];
let rpcErrorOn: number | null = null; // 0-based index of the rpc call that fails

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.then = (onF: any, onR: any) => Promise.resolve({ data: questionRows, error: null }).then(onF, onR);
  return {
    supabase: {
      from: () => chain,
      rpc: (fn: string, args: any) => {
        const idx = rpcCalls.length;
        rpcCalls.push({ fn, args });
        if (rpcErrorOn === idx) return Promise.resolve({ data: null, error: { message: "Gate: jig not answered" } });
        return Promise.resolve({ data: {}, error: null });
      },
    },
  };
});
vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: vi.fn().mockResolvedValue("company-1") }));

import {
  buildJigAnswer, emptyJigDraft, submitPendingJigAnswers, describeJigAnswer, type JigAnswerDraft,
} from "@/lib/grn-jigs-api";

const row = (over: any = {}) => ({
  dc_jig_id: "dj-1", grn_id: "g-1", jig_number: "DJ 17", open_qty: 1, needs_answer: true, answered: false, ...over,
});
const draft = (over: Partial<JigAnswerDraft> = {}): JigAnswerDraft => ({ ...emptyJigDraft({ open_qty: 1 }), ...over });

beforeEach(() => {
  questionRows = [];
  rpcCalls = [];
  rpcErrorOn = null;
});

describe("buildJigAnswer", () => {
  it("unanswered → error", () => {
    expect(buildJigAnswer({ open_qty: 1 }, draft())).toHaveProperty("error");
  });

  it("returned Yes, single jig → all returned, no Q2", () => {
    expect(buildJigAnswer({ open_qty: 1 }, draft({ returned: "yes" }))).toEqual({
      p_qty_returned: 1, p_remainder: null, p_linked_dc_id: null, p_reason: null,
    });
  });

  it("open_qty > 1: Yes = all by default; lower qty needs Q2", () => {
    const r = { open_qty: 3 };
    expect(buildJigAnswer(r, { ...emptyJigDraft(r), returned: "yes" })).toMatchObject({ p_qty_returned: 3, p_remainder: null });
    expect(buildJigAnswer(r, { ...emptyJigDraft(r), returned: "yes", returnedQty: "2" })).toHaveProperty("error");
    expect(buildJigAnswer(r, { ...emptyJigDraft(r), returned: "yes", returnedQty: "4" })).toHaveProperty("error");
  });

  it("No + pending with vendor → held_pending with linked DC", () => {
    expect(buildJigAnswer({ open_qty: 1 }, draft({ returned: "no", hasPending: "yes", linkedDcId: "dc-9" }))).toEqual({
      p_qty_returned: 0, p_remainder: "held_pending", p_linked_dc_id: "dc-9", p_reason: null,
    });
    expect(buildJigAnswer({ open_qty: 1 }, draft({ returned: "no", hasPending: "yes" }))).toHaveProperty("error");
  });

  it("No + nothing pending → write_off needs reason type and text", () => {
    expect(buildJigAnswer({ open_qty: 1 }, draft({ returned: "no", hasPending: "no" }))).toHaveProperty("error");
    expect(buildJigAnswer({ open_qty: 1 }, draft({ returned: "no", hasPending: "no", reasonType: "Lost" }))).toHaveProperty("error");
    expect(
      buildJigAnswer({ open_qty: 1 }, draft({ returned: "no", hasPending: "no", reasonType: "Lost", reasonText: " fell off truck " })),
    ).toEqual({ p_qty_returned: 0, p_remainder: "write_off", p_linked_dc_id: null, p_reason: "Lost: fell off truck" });
  });
});

describe("submitPendingJigAnswers", () => {
  it("sends only needs_answer rows", async () => {
    questionRows = [row(), row({ dc_jig_id: "dj-2", needs_answer: false, answered: true })];
    const n = await submitPendingJigAnswers("g-1", new Map([["dj-1", draft({ returned: "yes" })]]));
    expect(n).toBe(1);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      fn: "rpc_record_grn_jig_answer",
      args: { p_grn_id: "g-1", p_dc_jig_id: "dj-1", p_qty_returned: 1, p_remainder: null, p_linked_dc_id: null, p_reason: null },
    });
  });

  it("throws before any write if a needs_answer row is incomplete", async () => {
    questionRows = [row(), row({ dc_jig_id: "dj-2", jig_number: "G25" })];
    await expect(
      submitPendingJigAnswers("g-1", new Map([["dj-1", draft({ returned: "yes" })]])),
    ).rejects.toThrow("Jig G25");
    expect(rpcCalls).toHaveLength(0);
  });

  it("surfaces the DB error verbatim and keeps earlier answers", async () => {
    questionRows = [row(), row({ dc_jig_id: "dj-2", jig_number: "G25" })];
    rpcErrorOn = 1;
    const drafts = new Map([
      ["dj-1", draft({ returned: "yes" })],
      ["dj-2", draft({ returned: "yes" })],
    ]);
    await expect(submitPendingJigAnswers("g-1", drafts)).rejects.toThrow("Gate: jig not answered");
    expect(rpcCalls).toHaveLength(2); // first one went through and stands
  });
});

describe("describeJigAnswer (answered-row breakdown)", () => {
  const base = {
    answer_returned_qty: 0, answer_held_qty: 0, answer_write_off_qty: 0,
    answer_type: null, linked_dc_number: null, linked_dc_pending_qty: null,
  } as any;

  it("shows only the non-zero parts, with the linked DC on the held part", () => {
    expect(
      describeJigAnswer({ ...base, answer_returned_qty: 1, answer_held_qty: 1, linked_dc_number: "DC-26-27/1101", linked_dc_pending_qty: 5 }),
    ).toBe("Returned 1 · Held 1 (linked DC-26-27/1101, pending 5)");
  });

  it("write-off only", () => {
    expect(describeJigAnswer({ ...base, answer_write_off_qty: 2, answer_type: "write_off_requested" })).toBe(
      "Not returned — sent to Finance 2",
    );
  });

  it("fully returned, and an approved write-off", () => {
    expect(describeJigAnswer({ ...base, answer_returned_qty: 3 })).toBe("Returned 3");
    expect(describeJigAnswer({ ...base, answer_write_off_qty: 1, answer_type: "write_off_approved" })).toBe("Write-off approved 1");
  });

  it("held without a linked DC, null counts, and no breakdown", () => {
    expect(describeJigAnswer({ ...base, answer_held_qty: 2 })).toBe("Held 2");
    expect(describeJigAnswer({ ...base, answer_returned_qty: null, answer_held_qty: null, answer_write_off_qty: null })).toBe("Answered");
  });

  it("combines all three parts", () => {
    expect(
      describeJigAnswer({ ...base, answer_returned_qty: 1, answer_held_qty: 1, answer_write_off_qty: 1, linked_dc_number: "DC-1", linked_dc_pending_qty: 2 }),
    ).toBe("Returned 1 · Held 1 (linked DC-1, pending 2) · Not returned — sent to Finance 1");
  });
});
