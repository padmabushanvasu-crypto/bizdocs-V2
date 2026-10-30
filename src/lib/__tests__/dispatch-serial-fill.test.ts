import { describe, it, expect } from "vitest";
import { fillLineSerials, orderSerialPool, type FillableLine } from "@/lib/dispatch-serial-fill";

const sn = (id: string, serial: string, unverified = false) => ({ id, serial_number: serial, needs_verification: unverified });
const notResale = () => false;

describe("orderSerialPool", () => {
  it("puts verified units first, then lowest serial (numeric)", () => {
    const pool = [sn("a", "5970", true), sn("b", "5966"), sn("c", "5912", true), sn("d", "5904")];
    expect(orderSerialPool(pool).map((s) => s.serial_number)).toEqual(["5904", "5966", "5912", "5970"]);
  });
});

describe("fillLineSerials — serials carry over from finished goods", () => {
  const pool = { fg1: [sn("s3", "5968"), sn("s1", "5966"), sn("s2", "5967")] };

  it("fills one serial per unit, lowest first", () => {
    const { lines, changed } = fillLineSerials<FillableLine>([{ item_id: "fg1", quantity: 2 }], pool, notResale);
    expect(changed).toBe(true);
    expect(lines[0].serials!.map((s) => s.serial_number)).toEqual(["5966", "5967"]);
  });

  it("keeps a unit the team swapped in, and tops up around it", () => {
    const { lines } = fillLineSerials(
      [{ item_id: "fg1", quantity: 2, serials: [{ id: "s3", serial_number: "5968" }] }],
      pool,
      notResale,
    );
    expect(lines[0].serials!.map((s) => s.serial_number)).toEqual(["5968", "5966"]);
  });

  it("drops extras when the quantity goes down", () => {
    const { lines } = fillLineSerials(
      [{ item_id: "fg1", quantity: 1, serials: [{ id: "s1", serial_number: "5966" }, { id: "s2", serial_number: "5967" }] }],
      pool,
      notResale,
    );
    expect(lines[0].serials!.map((s) => s.serial_number)).toEqual(["5966"]);
  });

  it("never gives the same unit to two lines of the same item", () => {
    const { lines } = fillLineSerials<FillableLine>(
      [{ item_id: "fg1", quantity: 2 }, { item_id: "fg1", quantity: 2 }],
      pool,
      notResale,
    );
    const all = lines.flatMap((l) => (l.serials ?? []).map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    expect(lines[1].serials!.map((s) => s.serial_number)).toEqual(["5968"]); // only 3 in stock
  });

  it("leaves resale lines and empty lines alone, and reports no change when already full", () => {
    const input = [{ item_id: "rtcc", quantity: 3 }, { item_id: "", quantity: 1 }];
    const res = fillLineSerials(input, pool, (id) => id === "rtcc");
    expect(res.changed).toBe(false);
    expect(res.lines).toBe(input);

    const full = [{ item_id: "fg1", quantity: 1, serials: [{ id: "s1", serial_number: "5966" }] }];
    expect(fillLineSerials(full, pool, notResale).changed).toBe(false);
  });
});
