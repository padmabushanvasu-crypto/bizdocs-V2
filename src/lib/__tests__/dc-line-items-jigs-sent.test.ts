import { describe, it, expect, vi, beforeEach } from "vitest";

// Jig custody model: jigs are no longer typed per line. They live in
// dc_jigs, keyed on DC + item + jig (NOT dc_line_items), so the DC line
// delete/re-insert on edit cannot touch them.
//
// Two concerns are covered here:
//   A. dc_jigs sync (src/lib/dc-jigs-api.ts): the diff the form applies AFTER
//      the lines are saved — insert / update qty / delete, removed-item
//      cleanup, and DB errors surfacing verbatim.
//   B. Legacy dc_line_items.jigs_sent: the form no longer writes it, but every
//      write site in delivery-challans-api.ts must still pass an existing
//      value through untouched, so historical text is never nulled on a
//      line re-insert or in-place update (create, reinsert, job-card UPDATE,
//      receipted-plain UPDATE).

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
  jigError: string | null;
};
let capturedInserts: Record<string, any[]> = {};
let capturedUpdates: Record<string, any[]> = {};
let capturedDeletes: Record<string, any[][]> = {};

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
        if (table === "dc_jigs") {
          if (op === "delete") {
            (capturedDeletes[table] ??= []).push(calls.filter((c) => c.method === "eq").map((c) => c.args));
          }
          return fixture.jigError
            ? { data: null, error: { message: fixture.jigError } }
            : { data: [], error: null };
        }
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
import { diffDcJigs, syncDcJigs, formatJigList, type DcJigRow, type PickedJig } from "@/lib/dc-jigs-api";

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

beforeEach(() => {
  capturedInserts = {};
  capturedUpdates = {};
  capturedDeletes = {};
  fixture = { dcStatus: "draft", originalLines: [], grnReceiptedLineIds: [], jigError: null };
});

const row = (id: string, item_id: string, jig_id: string, qty: number): DcJigRow => ({
  id, dc_id: "dc-1", item_id, jig_id, jig_number: `J-${jig_id}`, qty,
});
const pick = (jig_id: string, qty: number): PickedJig => ({ jig_id, jig_number: `J-${jig_id}`, qty });

describe("dc_jigs sync (jigs picked per item, saved after the lines)", () => {
  it("new job-work DC with 2 jigs inserts 2 dc_jigs rows keyed on DC + item + jig", async () => {
    await syncDcJigs("dc-1", [], new Map([["item-1", [pick("a", 2), pick("b", 1)]]]));

    expect(capturedInserts["dc_jigs"]).toHaveLength(1);
    expect(capturedInserts["dc_jigs"][0]).toEqual([
      { company_id: "company-1", dc_id: "dc-1", item_id: "item-1", jig_id: "a", qty: 2 },
      { company_id: "company-1", dc_id: "dc-1", item_id: "item-1", jig_id: "b", qty: 1 },
    ]);
    // jig_number is set by the DB trigger — never sent.
    expect(capturedInserts["dc_jigs"][0][0]).not.toHaveProperty("jig_number");
    expect(capturedInserts["dc_line_items"] ?? []).toHaveLength(0);
  });

  it("editing the DC with unchanged picks writes nothing (line re-insert keeps dc_jigs)", async () => {
    const original = [row("r1", "item-1", "a", 2), row("r2", "item-1", "b", 1)];
    await syncDcJigs("dc-1", original, new Map([["item-1", [pick("a", 2), pick("b", 1)]]]));

    expect(capturedInserts["dc_jigs"] ?? []).toHaveLength(0);
    expect(capturedUpdates["dc_jigs"] ?? []).toHaveLength(0);
    expect(capturedDeletes["dc_jigs"] ?? []).toHaveLength(0);
  });

  it("diffs insert / qty update / delete", () => {
    const original = [row("r1", "item-1", "a", 2), row("r2", "item-1", "b", 1)];
    const d = diffDcJigs(original, new Map([["item-1", [pick("a", 5), pick("c", 1)]]]));

    expect(d.toUpdate).toEqual([{ row: original[0], qty: 5 }]);
    expect(d.toDelete).toEqual([original[1]]);
    expect(d.toInsert).toEqual([{ item_id: "item-1", jig_id: "c", qty: 1 }]);
  });

  it("deletes an item's dc_jigs when its last line is removed (item absent from desired)", async () => {
    const original = [row("r1", "item-1", "a", 2), row("r9", "item-2", "z", 1)];
    await syncDcJigs("dc-1", original, new Map([["item-1", [pick("a", 2)]]]));

    expect(capturedDeletes["dc_jigs"]).toHaveLength(1);
    expect(capturedDeletes["dc_jigs"][0]).toContainEqual(["id", "r9"]);
  });

  it("surfaces the DB error verbatim (e.g. delete refused: return history)", async () => {
    fixture.jigError = "Cannot delete jig DJ 17: return history exists";
    await expect(
      syncDcJigs("dc-1", [row("r1", "item-1", "a", 2)], new Map()),
    ).rejects.toThrow("Cannot delete jig DJ 17: return history exists");
  });

  it("formats the print/detail jig list", () => {
    expect(formatJigList([{ jig_number: "DJ 17", qty: 2 }, { jig_number: "G25", qty: 1 }])).toBe("DJ 17 × 2, G25 × 1");
  });
});

describe("legacy dc_line_items.jigs_sent passthrough (no longer written by the form)", () => {

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
