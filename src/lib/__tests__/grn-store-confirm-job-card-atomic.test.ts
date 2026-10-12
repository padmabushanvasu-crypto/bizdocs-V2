import { describe, it, expect, vi, beforeEach } from "vitest";

// Job-card-linked lines confirm through rpc_store_confirm_job_card_lines (one
// DB transaction: line update + damaged write-off + rpc_confirm_grn_store).
// The client must not write the line flag itself or call rpc_confirm_grn_store.

const rpcCalls: Array<{ name: string; args: any }> = [];
const lineUpdates: any[] = [];
let jcResponse: { data: any; error: any };

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
          if (table === "grn_line_items" && cols === "id") return { data: [], error: null };
          if (table === "grn_line_items")
            return {
              data: [{
                id: "J1", grn_id: "G1", item_id: "item-J1", description: "Job card line",
                conforming_qty: 5, store_confirmed_qty: 0, damaged_qty: 0, store_confirmed: false,
                dc_line_item_id: "DCL1", stock_posted_at: null,
              }],
              error: null,
            };
          if (table === "dc_line_items") return { data: [{ id: "DCL1", job_card_id: "JC1" }], error: null };
          if (table === "grns")
            return { data: { grn_type: "dc_grn", grn_number: "GRN-T", linked_dc_id: "DC1", company_id: "c1" }, error: null };
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
      if (name === "rpc_store_confirm_job_card_lines") return Promise.resolve(jcResponse);
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

describe("storeConfirmGRNItems (job-card lines) → atomic RPC", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    lineUpdates.length = 0;
  });

  it("routes through the job-card RPC and writes nothing client-side", async () => {
    jcResponse = { data: { results: [{ line_id: "J1", status: "confirmed" }] }, error: null };
    const r = await storeConfirmGRNItems("G1", [{ id: "J1", storeQty: 5 }], data);
    expect(rpcCalls.filter((c) => c.name === "rpc_store_confirm_job_card_lines")).toHaveLength(1);
    expect(rpcCalls.some((c) => c.name === "rpc_confirm_grn_store")).toBe(false);
    expect(rpcCalls.some((c) => c.name === "rpc_store_confirm_plain_lines")).toBe(false);
    expect(lineUpdates).toHaveLength(0);
    expect(r.fullyConfirmed).toEqual(["J1"]);
  });

  it("surfaces an RPC failure verbatim and leaves the line unconfirmed", async () => {
    jcResponse = { data: null, error: { message: "conversion line not supported" } };
    await expect(storeConfirmGRNItems("G1", [{ id: "J1", storeQty: 5 }], data)).rejects.toThrow(
      /Job card line: conversion line not supported/
    );
    expect(lineUpdates).toHaveLength(0);
  });
});
