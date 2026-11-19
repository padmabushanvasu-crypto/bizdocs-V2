import { describe, it, expect, vi, beforeEach } from "vitest";

// ── A minimal chainable stand-in for the Supabase query builder ─────────────
// Records every query (table, filters, range) and resolves from per-table
// fixtures, honouring .range() so the chunked read can be exercised.
interface Recorded {
  table: string;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  range: [number, number] | null;
}
const queries: Recorded[] = [];
let tables: Record<string, any[]> = {};
let tableErrors: Record<string, { message: string } | null> = {};
const rpcCalls: Array<{ name: string; args: any }> = [];
let rpcResult: { data: any; error: any } = { data: null, error: null };

function builder(table: string) {
  const q: Recorded = { table, eq: {}, in: {}, range: null };
  queries.push(q);
  const resolve = () => {
    if (tableErrors[table]) return { data: null, error: tableErrors[table], count: null };
    let rows = (tables[table] ?? []).filter((r) =>
      Object.entries(q.in).every(([k, vals]) => vals.includes(r[k]))
    );
    const count = rows.length;
    if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
    return { data: rows, error: null, count };
  };
  const api: any = {
    select: () => api,
    eq: (k: string, v: unknown) => { q.eq[k] = v; return api; },
    in: (k: string, v: unknown[]) => { q.in[k] = v; return api; },
    not: () => api,
    order: () => api,
    range: (a: number, b: number) => { q.range = [a, b]; return api; },
    then: (onOk: any, onErr: any) => Promise.resolve(resolve()).then(onOk, onErr),
  };
  return api;
}

vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: async () => "c1" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    from: (table: string) => builder(table),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  },
}));

import { fetchRmConversions, postRmConversion } from "@/lib/rm-conversions-api";

const header = (id: string, itemId: string, qty: number) => ({
  id,
  awo_id: null,
  output_item_id: itemId,
  output_unit: "NOS",
  output_qty_base: qty,
  output_alt_unit: null,
  output_qty_alt: null,
  output_unit_cost: 5,
  status: "posted",
  posted_at: "2026-11-19T06:00:00Z",
  posted_by: null,
  reversed_at: null,
  reversed_by: null,
  reversal_reason: null,
  notes: null,
  items: { item_code: `code-${itemId}`, description: `desc-${itemId}` },
});
const line = (convId: string, line_no: number, itemId: string, qty: number) => ({
  rm_conversion_id: convId,
  line_no,
  item_id: itemId,
  unit: "NOS",
  qty_base: qty,
  alt_unit: null,
  qty_alt: null,
  unit_cost: 5,
});
const item = (id: string) => ({ id, item_code: `code-${id}`, description: `desc-${id}` });

beforeEach(() => {
  queries.length = 0;
  rpcCalls.length = 0;
  tables = {};
  tableErrors = {};
  rpcResult = { data: null, error: null };
});

describe("fetchRmConversions — output lines", () => {
  it("attaches every output line to its own conversion, in line order", async () => {
    tables = {
      rm_conversions: [header("multi", "a", 10), header("single", "z", 250)],
      rm_conversion_outputs: [
        line("multi", 1, "a", 10),
        line("multi", 2, "b", 6),
        line("multi", 3, "c", 4),
        line("single", 1, "z", 250),
      ],
      items: [item("a"), item("b"), item("c"), item("z")],
    };

    const { rows, count } = await fetchRmConversions(0, 25);

    expect(count).toBe(2);
    const multi = rows.find((r) => r.id === "multi")!;
    expect(multi.outputs.map((o) => [o.line_no, o.item_code, o.qty_base])).toEqual([
      [1, "code-a", 10],
      [2, "code-b", 6],
      [3, "code-c", 4],
    ]);
    expect(rows.find((r) => r.id === "single")!.outputs).toHaveLength(1);
  });

  it("scopes every query to the company", async () => {
    tables = {
      rm_conversions: [header("multi", "a", 10)],
      rm_conversion_outputs: [line("multi", 1, "a", 10)],
      items: [item("a")],
    };
    await fetchRmConversions(0, 25);

    for (const t of ["rm_conversions", "rm_conversion_outputs", "items"]) {
      const q = queries.filter((x) => x.table === t);
      expect(q.length).toBeGreaterThan(0);
      for (const one of q) expect(one.eq.company_id).toBe("c1");
    }
    // Output lines are fetched only for the conversions on this page.
    expect(queries.find((x) => x.table === "rm_conversion_outputs")!.in.rm_conversion_id).toEqual(["multi"]);
  });

  it("keeps reading until a short chunk, so many lines are never cut off", async () => {
    const many = Array.from({ length: 1201 }, (_, i) => line("big", i + 1, "a", 1));
    tables = { rm_conversions: [header("big", "a", 1)], rm_conversion_outputs: many, items: [item("a")] };

    const { rows } = await fetchRmConversions(0, 25);

    expect(rows[0].outputs).toHaveLength(1201);
    const ranges = queries.filter((x) => x.table === "rm_conversion_outputs").map((x) => x.range);
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("falls back to the header line rather than showing a conversion with no output", async () => {
    tables = { rm_conversions: [header("old", "z", 250)], rm_conversion_outputs: [], items: [] };

    const { rows } = await fetchRmConversions(0, 25);

    expect(rows[0].outputs).toEqual([
      expect.objectContaining({ line_no: 1, item_id: "z", item_code: "code-z", qty_base: 250, unit: "NOS" }),
    ]);
  });

  it("fails loudly when the output lines cannot be read", async () => {
    tables = { rm_conversions: [header("multi", "a", 10)] };
    tableErrors = { rm_conversion_outputs: { message: "permission denied for table rm_conversion_outputs" } };

    await expect(fetchRmConversions(0, 25)).rejects.toMatchObject({
      message: "permission denied for table rm_conversion_outputs",
    });
  });
});

describe("postRmConversion — multi-output payload", () => {
  const payload = {
    awo_id: null,
    outputs: [
      { item_id: "a", qty_base: 10, unit: "NOS", qty_alt: null, alt_unit: null },
      { item_id: "b", qty_base: 6, unit: "NOS", qty_alt: null, alt_unit: null },
    ],
    notes: null,
    inputs: [
      { item_id: "tube", source: "store" as const, entered_qty: 100, entered_unit: "KGS", qty_base: 100, scrap_qty_base: 2 },
    ],
  };

  it("makes exactly one RPC call carrying every output line, the company and the idempotency key", async () => {
    rpcResult = { data: [{ rm_conversion_id: "conv-1", output_item_code: "code-a", output_qty_base: 10, output_unit_cost: 0 }], error: null };

    const result = await postRmConversion(payload, "key-1");

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("rpc_post_rm_conversion");
    expect(rpcCalls[0].args).toEqual({
      p_company_id: "c1",
      p_payload: payload,
      p_posted_by: "u1",
      p_idempotency_key: "key-1",
    });
    expect(result.rm_conversion_id).toBe("conv-1");
    // No client-side stock writes of any kind.
    expect(queries).toHaveLength(0);
  });

  it("surfaces the database error verbatim", async () => {
    rpcResult = { data: null, error: { message: "Output item code-a is listed more than once -- combine it into one line" } };
    await expect(postRmConversion(payload, "key-1")).rejects.toThrow(
      "Output item code-a is listed more than once -- combine it into one line"
    );
  });
});
