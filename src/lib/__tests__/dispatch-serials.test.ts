import { describe, it, expect, vi } from "vitest";

const rows = [
  { id: "s2", serial_number: "5960", item_id: "A", created_at: "2" },
  { id: "s1", serial_number: "5959", item_id: "A", created_at: "1" },
  { id: "s3", serial_number: "7001", item_id: "B", created_at: "1" },
];
let lastIn: string[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = (_c: string, v: string[]) => { lastIn = v; return chain; };
  chain.order = () => Promise.resolve({ data: rows.filter((r) => lastIn.includes(r.item_id)), error: null });
  chain.single = () => Promise.resolve({ data: { company_id: "c1" } });
  return { supabase: { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: () => chain } };
});

import { fetchInStockSerials } from "@/lib/dispatch-api";

describe("fetchInStockSerials", () => {
  it("groups in-stock serials by item and ignores other items", async () => {
    const r = await fetchInStockSerials(["A"]);
    expect(Object.keys(r)).toEqual(["A"]);
    expect(r.A.map((x) => x.serial_number)).toEqual(["5960", "5959"]);
  });
  it("returns nothing for an empty item list without querying", async () => {
    expect(await fetchInStockSerials([])).toEqual({});
  });
});
