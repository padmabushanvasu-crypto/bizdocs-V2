import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcCalls: Array<{ name: string; args: any }> = [];
let rpcResult: { data: any; error: any };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { company_id: "c1", full_name: "T" } }) }) }) }),
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  },
}));
import { deleteDispatchRecord } from "@/lib/dispatch-api";

describe("deleteDispatchRecord", () => {
  beforeEach(() => { rpcCalls.length = 0; });

  it("calls rpc_delete_dispatch_record scoped to the company, with the trimmed reason", async () => {
    rpcResult = { data: { dr_number: "DR-1", prior_status: "dispatched", ledger_rows_reversed: 1, serials_restored: 0 }, error: null };
    const r = await deleteDispatchRecord("dr-id", "  wrong customer ");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("rpc_delete_dispatch_record");
    expect(rpcCalls[0].args).toMatchObject({ p_company_id: "c1", p_id: "dr-id", p_reason: "wrong customer" });
    expect(r.ledger_rows_reversed).toBe(1);
  });

  it("surfaces the database error message", async () => {
    rpcResult = { data: null, error: { message: "A reason is required" } };
    await expect(deleteDispatchRecord("dr-id")).rejects.toThrow("A reason is required");
  });
});
