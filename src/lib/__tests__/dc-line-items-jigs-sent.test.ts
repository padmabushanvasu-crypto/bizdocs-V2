import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for: dc_line_items.jigs_sent was computed correctly by
// DeliveryChallanForm.tsx (from the checked jig selections) but dropped by
// every write site in delivery-challans-api.ts, so it was never persisted —
// confirmed live: 1,953/1,953 dc_line_items rows have jigs_sent NULL.
//
// Covers all three write sites the bug report named:
//   1. createDeliveryChallan's insert (itemsToInsert)
//   2. updateDeliveryChallan's reinsert (itemsToInsert), for a fresh line
//   3. updateDeliveryChallan's in-place UPDATE for a preserved job-card line
// plus the fourth, structurally identical site found during the fix:
//   4. updateDeliveryChallan's in-place UPDATE for a preserved receipted
//      plain line (rpc_update_dc_line_qty_plain path)

type Call = { method: string; args: any[] };

function opOf(calls: Call[]): "insert" | "update" | "delete" | "select" {
  if (calls.some((c) => c.method === "insert")) return "insert";
  if (calls.some((c) => c.method === "update")) return "update";
  if (calls.some((c) => c.method === "delete")) return "delete";
  return "select";
}

let fixture: {
  dcStatus: string;
  originalLines: any[];
  grnReceiptedLineIds: string[];
};
let capturedInserts: Record<string, any[]> = {};
let capturedUpdates: Record<string, any[]> = {};

function makeSupabaseMock() {
  return {
    from(table: string) {
      const calls: Call[] = [];
      const chain: any = {};
      for (const m of ["select", "eq", "neq", "not", "in", "order", "limit"]) {
        chain[m] = (...args: any[]) => {
          calls.push({ method: m, args });
          return chain;
        };
      }
      chain.insert = (payload: any) => {
        calls.push({ method: "insert", args: [payload] });
        (capturedInserts[table] ??= []).push(payload);
        return chain;
      };
      chain.update = (payload: any) => {
        calls.push({ method: "update", args: [payload] });
        (capturedUpdates[table] ??= []).push(payload);
        return chain;
      };
      chain.delete = () => {
        calls.push({ method: "delete", args: [] });
        return chain;
      };
      const resolve = () => {
        const op = opOf(calls);
        if (table === "delivery_challans") {
          if (op === "insert") {
            return { data: { id: "dc-1", dc_number: "DC-1" }, error: null };
          }
          if (op === "update") return { error: null };
          // status lookup at top of updateDeliveryChallan
          return { data: { status: fixture.dcStatus }, error: null };
        }
        if (table === "dc_line_items") {
          if (op === "insert" || op === "update" || op === "delete") {
            return { data: [], error: null };
          }
          // fetch of originalLines
          return { data: fixture.originalLines, error: null };
        }
        if (table === "grn_line_items") {
          return {
            data: fixture.grnReceiptedLineIds.map((id) => ({ dc_line_item_id: id })),
            error: null,
          };
        }
        return { data: [], error: null };
      };
      chain.single = () => Promise.resolve(resolve());
      chain.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
      return chain;
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: makeSupabaseMock(),
}));

vi.mock("@/lib/auth-helpers", async () => {
  const actual = await vi.importActual<any>("@/lib/auth-helpers");
  return { ...actual, getCompanyId: vi.fn().mockResolvedValue("company-1") };
});

import { createDeliveryChallan, updateDeliveryChallan, DCLineItem } from "@/lib/delivery-challans-api";

const baseDc = {
  dc_number: "", dc_date: "2026-09-15", dc_type: "job_work",
  party_id: "party-1", party_name: "Vendor Co", party_address: null,
  party_gstin: null, party_state_code: null, party_phone: null,
  reference_number: null, approximate_value: 0,
  special_instructions: null, internal_remarks: null,
  return_due_date: null, nature_of_job_work: null,
  total_items: 1, total_qty: 5, status: "draft", issued_at: null,
  cancelled_at: null, cancellation_reason: null,
} as any;

describe("dc_line_items.jigs_sent persistence", () => {
  beforeEach(() => {
    capturedInserts = {};
    capturedUpdates = {};
    fixture = { dcStatus: "draft", originalLines: [], grnReceiptedLineIds: [] };
  });

  it("survives create (createDeliveryChallan's insert)", async () => {
    const lineItems: DCLineItem[] = [
      {
        serial_number: 1, description: "Widget", quantity: 5, rate: 10, amount: 50,
        jigs_sent: "JIG-1, JIG-2",
      } as any,
    ];

    await createDeliveryChallan({ dc: baseDc, lineItems });

    expect(capturedInserts["dc_line_items"]).toHaveLength(1);
    expect(capturedInserts["dc_line_items"][0][0].jigs_sent).toBe("JIG-1, JIG-2");
  });

  it("survives update for a fresh-reinserted line (updateDeliveryChallan's reinsert)", async () => {
    fixture.dcStatus = "draft"; // not issued -> delete+reinsert path, nothing protected

    const lineItems: DCLineItem[] = [
      {
        id: "line-fresh-1", serial_number: 1, description: "Widget", quantity: 5,
        qty_nos: 5, rate: 10, amount: 50, jigs_sent: "JIG-3",
      } as any,
    ];

    await updateDeliveryChallan("dc-1", { dc: baseDc, lineItems });

    expect(capturedInserts["dc_line_items"]).toHaveLength(1);
    expect(capturedInserts["dc_line_items"][0][0].jigs_sent).toBe("JIG-3");
  });

  it("survives update for a preserved job-card line (in-place UPDATE)", async () => {
    fixture.dcStatus = "issued";
    fixture.originalLines = [
      { id: "line-jc-1", item_id: "item-9", qty_nos: 5, quantity: 5, job_card_id: "jc-1", step_number: 2 },
    ];

    const lineItems: DCLineItem[] = [
      {
        id: "line-jc-1", serial_number: 1, description: "Widget", quantity: 5,
        qty_nos: 5, rate: 10, amount: 50, job_card_id: "jc-1", step_number: 2,
        jigs_sent: "JIG-7, JIG-8",
      } as any,
    ];

    await updateDeliveryChallan("dc-1", { dc: baseDc, lineItems });

    // Preserved job-card lines are never reinserted.
    expect(capturedInserts["dc_line_items"] ?? []).toHaveLength(0);
    expect(capturedUpdates["dc_line_items"]).toHaveLength(1);
    expect(capturedUpdates["dc_line_items"][0].jigs_sent).toBe("JIG-7, JIG-8");
  });

  it("survives update for a preserved receipted plain line (in-place UPDATE)", async () => {
    fixture.dcStatus = "issued";
    fixture.originalLines = [
      { id: "line-plain-1", item_id: "item-4", qty_nos: 5, quantity: 5, job_card_id: null, step_number: null },
    ];
    fixture.grnReceiptedLineIds = ["line-plain-1"];

    const lineItems: DCLineItem[] = [
      {
        id: "line-plain-1", serial_number: 1, description: "Widget", quantity: 5,
        qty_nos: 5, rate: 10, amount: 50, jigs_sent: "JIG-9",
      } as any,
    ];

    await updateDeliveryChallan("dc-1", { dc: { ...baseDc, dc_type: "returnable" }, lineItems });

    expect(capturedInserts["dc_line_items"] ?? []).toHaveLength(0);
    expect(capturedUpdates["dc_line_items"]).toHaveLength(1);
    expect(capturedUpdates["dc_line_items"][0].jigs_sent).toBe("JIG-9");
  });
});
