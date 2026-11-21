import { describe, it, expect } from "vitest";
import { userQtyError, toUserQtys } from "./UserQtyFields";
import type { BomUserQtyLine } from "@/lib/production-api";

const lines: BomUserQtyLine[] = [
  { qty_group: "Vacuum bottle", item_id: "imp", item_code: "230059 - I", description: "Import", unit: "NOS", bom_qty: 6 },
  { qty_group: "Vacuum bottle", item_id: "cg", item_code: "230059", description: "CG Power", unit: "NOS", bom_qty: 2 },
];

describe("user-entered qty rules", () => {
  it("requires every box (no defaults)", () => {
    expect(userQtyError(lines, {})).toMatch(/230059 - I/);
    expect(userQtyError(lines, { imp: "12" })).toMatch(/230059 \(0 if not used\)/);
  });
  it("blocks a zero group total and negatives", () => {
    expect(userQtyError(lines, { imp: "0", cg: "0" })).toMatch(/total quantity must be more than 0/);
    expect(userQtyError(lines, { imp: "-1", cg: "4" })).toMatch(/230059 - I/);
  });
  it("accepts 0 for one type", () => {
    expect(userQtyError(lines, { imp: "20", cg: "0" })).toBeNull();
    expect(toUserQtys(lines, { imp: "20", cg: "0" })).toEqual({ imp: 20, cg: 0 });
  });
  it("no user-qty lines means nothing to check", () => {
    expect(userQtyError([], {})).toBeNull();
  });
});
