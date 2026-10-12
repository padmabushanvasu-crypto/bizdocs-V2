import { describe, it, expect, vi, beforeEach } from "vitest";

// Contract test: plain-line store confirm goes through the atomic
// rpc_store_confirm_plain_lines. The client must NOT write the line flag or
// credit stock itself, and must surface per-line failures loudly.

const rpcCalls: Array<{ name: string; args: any }> = [];
const lineUpdates: any[] = [];
let rpcResponse: any;

function chain(resolve: () => any) {
  const c: any = {};
  for (const m of ["eq", "neq", "in", "gt", "gte", "ilike", "order", "limit"]) c[m] = () => c;
  c.single = () => Promise.resolve(resolve());
  c.then = (f: any, r: any) => Promise.resolve(resolve()).then(f, r);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (cols: string) =>
        chain(() => {
          if (table === "grn_line_items" && cols === "id") return { data: [{ id: "open" }], error: null };
          if (table === "grn_line_items")
            return {
              data: ["L1", "L2"].map((id) => ({
                id, grn_id: "G1", item_id: "item-" + id, description: "Desc " + id,
                conforming_qty: 5, store_confirmed_qty: 0, damaged_qty: 0, store_confirmed: false,
                dc_line_item_id: null, stock_posted_at: null,
              })),
              error: null,
            };
          if (table === "grns")
            return { data: { grn_type: "po_grn", grn_number: "GRN-T", linked_dc_id: null, company_id: "c1" }, error: null };
          return { data: [], error: null };
        }),
      update: (payload: any) => ({
        eq: () => {
          if (table === "grn_line_items") lineUpdates.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "rpc_store_confirm_plain_lines") return Promise.resolve({ data: rpcResponse, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

vi.mock("@/lib/auth-helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth-helpers")>()),
  getCompanyId: vi.fn().mockResolvedValue("c1"),
}));

import { storeConfirmGRNItems } from "@/lib/grn-api";

const data = { confirmedBy: "t", confirmedAt: "2026-10-12T10:00:00.000Z" };
const items = [{ id: "L1", storeQty: 5 }, { id: "L2", storeQty: 5, damagedQty: 0 }];

describe("storeConfirmGRNItems (plain lines) → atomic RPC", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    lineUpdates.length = 0;
  });

  it("sends all plain lines in one RPC and writes no line flag client-side", async () => {
    rpcResponse = {
      results: [
        { line_id: "L1", status: "confirmed", credited: true, qty_credited: 5, item_id: "i1" },
        { line_id: "L2", status: "partial", credited: true, qty_credited: 5, item_id: "i2" },
      ],
      failed: 0,
    };
    const r = await storeConfirmGRNItems("G1", items, data);
    const calls = rpcCalls.filter((c) => c.name === "rpc_store_confirm_plain_lines");
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_items).toHaveLength(2);
    expect(calls[0].args.p_items[0]).toMatchObject({ id: "L1", store_qty: 5 });
    expect(lineUpdates).toHaveLength(0);
    expect(rpcCalls.some((c) => c.name === "rpc_credit_partial_stock")).toBe(false);
    expect(r.fullyConfirmed).toEqual(["L1"]);
    expect(r.stillPending).toEqual(["L2"]);
  });

  it("throws naming failed lines, while still reporting the batch as partly done", async () => {
    rpcResponse = {
      results: [
        { line_id: "L1", status: "confirmed", credited: true, qty_credited: 5, item_id: "i1" },
        { line_id: "L2", status: "failed", error: "Insufficient in_process stock" },
      ],
      failed: 1,
    };
    await expect(storeConfirmGRNItems("G1", items, data)).rejects.toThrow(
      /1 line\(s\) could not be confirmed[\s\S]*Desc L2: Insufficient in_process stock[\s\S]*1 other line/
    );
  });

  it("does not throw for duplicate_ignored results", async () => {
    rpcResponse = { results: [{ line_id: "L1", status: "duplicate_ignored" }, { line_id: "L2", status: "duplicate_ignored" }], failed: 0 };
    await expect(storeConfirmGRNItems("G1", items, data)).resolves.toBeTruthy();
  });
});
