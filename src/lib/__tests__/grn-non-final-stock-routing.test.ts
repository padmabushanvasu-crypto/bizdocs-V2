import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression tests for the "ALL GRN lines route through awaiting_store, stock
// posts only at store confirmation" fix (target rule, Sep 2026). Before this
// fix, saveQualityStage routed a GRN with zero final lines to
// grn_stage='quality_done' and credited stock immediately at QC completion
// for any line not marked is_final_grn (see the now-deleted QC-completion
// posting pass). Both behaviors are retired: every QC completion advances to
// 'awaiting_store', and no line is ever credited before store confirmation.

const grnUpdateCalls: Array<{ payload: any }> = [];
const grnLineUpdateCalls: Array<{ payload: any }> = [];
const rpcCalls: Array<{ name: string; args: any }> = [];
let testLine: any;

const GRN_HEADER: Record<string, any> = {
  grn_type: "po_grn",
  grn_number: "GRN-TEST-9001",
  vendor_name: "Test Vendor",
  linked_dc_id: null,
  company_id: "company-1",
  grn_stage: "quality_pending",
  qc_email_sent_at: null,
  overall_quality_verdict: null,
};

function makeSelectChain(resolve: () => { data: any; error: any }) {
  const chain: any = {};
  for (const m of ["eq", "neq", "in", "not", "order", "limit"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve(resolve());
  chain.maybeSingle = () => Promise.resolve(resolve());
  chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
  return chain;
}

function makeUpdateChain(table: string, payload: any) {
  const chain: any = {};
  const apply = () => {
    if (table === "grn_line_items") {
      grnLineUpdateCalls.push({ payload });
      Object.assign(testLine, payload);
    } else if (table === "grns") {
      grnUpdateCalls.push({ payload });
      Object.assign(GRN_HEADER, payload);
    }
    return { error: null };
  };
  chain.eq = () => {
    apply();
    return chain;
  };
  chain.then = (onF: any, onR: any) => Promise.resolve({ error: null }).then(onF, onR);
  return chain;
}

function makeDeleteChain() {
  const chain: any = {};
  chain.eq = () => chain;
  chain.then = (onF: any, onR: any) => Promise.resolve({ error: null }).then(onF, onR);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    from: (table: string) => ({
      select: (_cols: string) =>
        makeSelectChain(() => {
          if (table === "grns") return { data: { ...GRN_HEADER }, error: null };
          if (table === "grn_line_items") return { data: [{ ...testLine }], error: null };
          return { data: [], error: null };
        }),
      update: (payload: any) => makeUpdateChain(table, payload),
      delete: () => makeDeleteChain(),
      insert: () => Promise.resolve({ error: null }),
    }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
  return { supabase };
});

vi.mock("@/lib/auth-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-helpers")>();
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

// Ledger/notification side effects are exercised by other tests; stubbed here
// so these tests can focus purely on stage routing and stock-credit calls.
vi.mock("@/lib/assembly-orders-api", () => ({
  addStockLedgerEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-api", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { saveQualityStage } from "@/lib/grn-api";

describe("saveQualityStage: non-final lines route through awaiting_store, never credit at QC", () => {
  beforeEach(() => {
    grnUpdateCalls.length = 0;
    grnLineUpdateCalls.length = 0;
    rpcCalls.length = 0;
    Object.assign(GRN_HEADER, {
      grn_type: "po_grn",
      grn_stage: "quality_pending",
      qc_email_sent_at: null,
      overall_quality_verdict: null,
    });
    testLine = {
      id: "line-9001",
      grn_id: "grn-9001",
      item_id: "item-9001",
      description: "Non-final test item",
      drawing_number: "DWG-9001",
      disposition: null,
      rejected_qty: 0,
      accepted_qty: 0,
      accepted_quantity: 0,
      is_final_grn: false,
      store_confirmed: false,
      store_confirmed_qty: 0,
      damaged_qty: 0,
      stock_posted_at: null,
    };
  });

  it("never calls rpc_credit_partial_stock for a non-final accepted line at QC completion", async () => {
    await saveQualityStage(
      "grn-9001",
      [
        {
          id: "line-9001",
          qty_inspected: 10,
          inspection_method: "visual_only",
          conforming_qty: 10,
          non_conforming_qty: 0,
        },
      ],
      "QC Inspector",
      null,
      null,
      null,
      false, // isFinalGrn = false — exactly the case that used to credit at QC
    );

    expect(rpcCalls.filter((c) => c.name === "rpc_credit_partial_stock")).toHaveLength(0);
    expect(testLine.stock_posted_at).toBeFalsy();
  });

  it("routes to grn_stage='awaiting_store' even when zero lines are final", async () => {
    await saveQualityStage(
      "grn-9001",
      [
        {
          id: "line-9001",
          qty_inspected: 10,
          inspection_method: "visual_only",
          conforming_qty: 10,
          non_conforming_qty: 0,
        },
      ],
      "QC Inspector",
      null,
      null,
      null,
      false,
    );

    const stageUpdate = grnUpdateCalls.find((c) => "grn_stage" in c.payload);
    expect(stageUpdate).toBeTruthy();
    expect(stageUpdate!.payload.grn_stage).toBe("awaiting_store");
    expect(grnUpdateCalls.some((c) => c.payload.grn_stage === "quality_done")).toBe(false);
  });
});
