import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/auth-helpers", () => ({ getCompanyId: async () => "co-1" }));

import { parseSerialList, parseSerialListDetailed, findDuplicateSerials } from "@/lib/fg-serials";

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

  it("refuses an unclear range instead of guessing", () => {
    expect(parseSerialListDetailed("5931-3932")).toEqual({ serials: [], invalid: ["5931-3932"] });
    expect(parseSerialListDetailed("5936-37").invalid).toEqual(["5936-37"]);
    expect(parseSerialListDetailed("5940-5936").invalid).toEqual(["5940-5936"]);
    expect(parseSerialListDetailed("5900-6100").invalid).toEqual(["5900-6100"]);
  });

  it("refuses a short tail that would go backwards (no carry)", () => {
    expect(parseSerialListDetailed("5999 & 01")).toEqual({ serials: ["5999"], invalid: ["01"] });
  });

  it("splits space- and tab-separated numbers (pasted from Excel)", () => {
    expect(parseSerialList("5912 5913")).toEqual(["5912", "5913"]);
    expect(parseSerialList("5912\t5913\t5914")).toEqual(["5912", "5913", "5914"]);
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
