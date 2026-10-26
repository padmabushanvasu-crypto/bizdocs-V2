import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: async () => "co-1" }));

import { parseSerialList, findDuplicateSerials } from "@/lib/fg-serials";

describe("parseSerialList — the formats the team actually typed", () => {
  it.each([
    ["5912", ["5912"]],
    ["5913,5914,5915,5916", ["5913", "5914", "5915", "5916"]],
    ["5925 & 5926", ["5925", "5926"]],
    ["5966,5967&5968", ["5966", "5967", "5968"]],
    ["5949,5950 & 5951", ["5949", "5950", "5951"]],
    ["5938 / 5939/ 5940", ["5938", "5939", "5940"]],
    ["5936-5937", ["5936", "5937"]],
    ["5923 & 24", ["5923", "5924"]],
    ["5934 ", ["5934"]],
    ["5912\n5913\n", ["5912", "5913"]],
  ])("%j", (input, expected) => {
    expect(parseSerialList(input)).toEqual(expected);
  });

  it("keeps an unclear range as typed instead of guessing", () => {
    expect(parseSerialList("5931-3932")).toEqual(["5931-3932"]);
  });

  it("keeps non-numeric serials as typed", () => {
    expect(parseSerialList("OLTC-A1, OLTC-A2")).toEqual(["OLTC-A1", "OLTC-A2"]);
  });

  it("returns nothing for blank input", () => {
    expect(parseSerialList("  ,  & ")).toEqual([]);
  });
});

describe("findDuplicateSerials", () => {
  it("finds repeats ignoring case and spaces", () => {
    expect(findDuplicateSerials(["5912", " 5912", "a1", "A1", "5913"])).toEqual(["5912", "A1"]);
  });
  it("ignores blanks", () => {
    expect(findDuplicateSerials(["", " ", "5912"])).toEqual([]);
  });
});
