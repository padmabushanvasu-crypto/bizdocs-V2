import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for the live DC "link existing JC" duplicate-key bug
// (JW-26-27/381, Stage 11 "Nitriting", 2026-09-11): job_card_steps has a
// partial unique index uq_job_card_steps_active_stage on
// (job_card_id, step_number) WHERE NOT legacy (verified live). Job cards are
// now routinely created with their FULL stage route pre-populated upfront —
// all steps inserted in one batch at JC creation (161+ active job cards have
// this shape, confirmed live: e.g. JW-26-27/381's 11 steps all share one
// created_at). The DC "link existing JC" flow used to unconditionally INSERT
// a new job_card_steps row for the target stage — which now collides with
// the pre-populated row and trips the unique index.
//
// This exercises createJobWorkStep exactly as the DC "link existing JC" flow
// (JobCardCreationDialog.tsx) calls it — targeting a stage that already has
// an active row — and asserts it UPDATEs that row instead of inserting a
// duplicate. A second case confirms older, incrementally-built job cards
// (no pre-existing row for the target stage) still insert as before.

const insertCalls: Array<{ table: string; payload: any }> = [];
const updateCalls: Array<{ table: string; id: string; payload: any }> = [];

// Fake job_card_steps table, seeded per-test.
let stepsTable: Array<Record<string, any>>;

function makeStep11() {
  return {
    id: "step-11",
    company_id: "company-1",
    job_card_id: "jc-1",
    step_number: 11,
    step_type: "external",
    name: "Nitriting",
    stage_template_id: null,
    status: "pending",
    legacy: false,
    labour_cost: 0,
    material_cost: 0,
    additional_cost: 0,
    vendor_id: null,
    vendor_name: null,
    outward_dc_id: null,
    expected_return_date: null,
    qty_sent: null,
    unit: "NOS",
    job_work_charges: 0,
    transport_cost_out: 0,
    transport_cost_in: 0,
    material_consumed: 0,
    is_rework: false,
    rework_reason: null,
    notes: null,
    created_at: "2026-09-05T15:16:04.750187+00:00",
    updated_at: "2026-09-05T15:16:04.750187+00:00",
  };
}

function makeChain(table: string) {
  const filters: Array<{ col: string; val: any }> = [];
  const chain: any = {};

  const matchRows = () => stepsTable.filter((r) => filters.every((f) => r[f.col] === f.val));

  chain.select = () => chain;
  chain.eq = (col: string, val: any) => { filters.push({ col, val }); return chain; };
  chain.order = () => chain;
  chain.limit = () => {
    const rows = [...matchRows()].sort((a, b) => b.step_number - a.step_number);
    return Promise.resolve({ data: rows.slice(0, 1), error: null });
  };
  chain.maybeSingle = () => Promise.resolve({ data: matchRows()[0] ?? null, error: null });
  chain.single = () => Promise.resolve(chain._pendingResult ?? { data: null, error: null });

  chain.insert = (payload: any) => {
    insertCalls.push({ table, payload });
    if (table === "job_card_steps") {
      // Mirror the real uq_job_card_steps_active_stage unique constraint —
      // if the fix regresses to a blind insert, this reproduces the live 23505.
      const dup = stepsTable.find(
        (r) => r.job_card_id === payload.job_card_id && r.step_number === payload.step_number && !r.legacy
      );
      if (dup) {
        chain._pendingResult = {
          data: null,
          error: {
            message: 'duplicate key value violates unique constraint "uq_job_card_steps_active_stage"',
            code: "23505",
          },
        };
        return chain;
      }
      const row = { id: `step-new-${stepsTable.length + 1}`, legacy: false, ...payload };
      stepsTable.push(row);
      chain._pendingResult = { data: row, error: null };
      return chain;
    }
    // job_card_step_dcs mirror insert — awaited via .then(...) directly, no .select().
    chain._pendingResult = { data: {}, error: null };
    chain.then = (onF: any) => Promise.resolve({ error: null }).then(onF);
    return chain;
  };

  chain.update = (payload: any) => ({
    eq: (_col: string, val: any) => {
      if (table === "job_card_steps") {
        const row = stepsTable.find((r) => r.id === val);
        if (row) {
          Object.assign(row, payload);
          updateCalls.push({ table, id: val, payload });
          chain._pendingResult = { data: row, error: null };
        } else {
          chain._pendingResult = { data: null, error: { message: "not found" } };
        }
        return chain; // supports a further .select().single()
      }
      // job_cards location update etc. — awaited directly, no .select().
      return Promise.resolve({ error: null });
    },
  });

  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeChain(table) },
}));

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

vi.mock("@/lib/audit-api", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { createJobWorkStep } from "@/lib/job-works-api";

describe("DC-to-JC stage linking — duplicate key regression", () => {
  beforeEach(() => {
    insertCalls.length = 0;
    updateCalls.length = 0;
    stepsTable = [makeStep11()];
  });

  it("updates the existing pre-populated step row instead of inserting a duplicate", async () => {
    await expect(
      createJobWorkStep({
        job_card_id: "jc-1",
        step_number: 11,
        step_type: "external",
        name: "Nitriting",
        status: "in_progress",
        vendor_id: "vendor-1",
        vendor_name: "Acme Vendors",
        qty_sent: 50,
        unit: "NOS",
        outward_dc_id: "dc-99",
      } as any)
    ).resolves.toBeTruthy();

    // Must not have attempted a duplicate insert into job_card_steps — this
    // is the assertion that would have failed (thrown 23505) before the fix.
    expect(insertCalls.filter((c) => c.table === "job_card_steps")).toHaveLength(0);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe("step-11");

    const updated = stepsTable.find((r) => r.id === "step-11")!;
    expect(updated.status).toBe("in_progress");
    expect(updated.outward_dc_id).toBe("dc-99");
    expect(updated.vendor_id).toBe("vendor-1");
    expect(updated.vendor_name).toBe("Acme Vendors");
    expect(updated.qty_sent).toBe(50);
    // step_number/job_card_id are identity, not touched by the update payload.
    expect(updated.step_number).toBe(11);
    expect(updated.job_card_id).toBe("jc-1");
  });

  it("still inserts a new row for a stage with no pre-existing active row (older, incremental-style job cards)", async () => {
    const created = await createJobWorkStep({
      job_card_id: "jc-1",
      step_number: 12, // no row 12 exists yet
      step_type: "internal",
      name: "Final QC",
      status: "pending",
    } as any);

    expect(created).toBeTruthy();
    expect(insertCalls.filter((c) => c.table === "job_card_steps")).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
    expect(stepsTable.some((r) => r.step_number === 12)).toBe(true);
  });
});
