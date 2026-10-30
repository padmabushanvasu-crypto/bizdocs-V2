import { describe, it, expect, vi } from "vitest";

vi.mock("xlsx-js-style", () => ({ default: { utils: {}, writeFile: vi.fn() }, utils: {}, writeFile: vi.fn() }));

import { buildDispatchUnitRows, buildDispatchRecordRows } from "@/lib/export-utils";

const dr = {
  dr_number: "DR-2627-004",
  dispatch_date: "2026-09-10",
  status: "delivered",
  customer_name: "Voltamp",
  customer_po_ref: "PO-1",
  vehicle_number: "TN01",
  driver_name: "Ravi",
  driver_contact: "99",
  dispatched_by: "finance",
  delivered_at: null,
  items: [
    { item_code: "11KV AB 9", item_description: "OLTC", quantity: 1, serial_number: "5925" },
    { item_code: "11KV AB 9", item_description: "OLTC", quantity: 1, serial_number: "5926" },
    { item_code: "RTCC", item_description: "Panel", quantity: 2, serial_number: null },
  ],
};

describe("dispatch export", () => {
  it("writes one row per unit line, serial first", () => {
    const rows = buildDispatchUnitRows([dr]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.serial_number)).toEqual(["5925", "5926", ""]);
    expect(rows[0]).toMatchObject({ dr_number: "DR-2627-004", status: "Delivered", quantity: 1, customer_name: "Voltamp" });
  });

  it("summarises each record with its serials and unserialled units", () => {
    const [r] = buildDispatchRecordRows([dr]);
    expect(r).toMatchObject({ serials: "5925, 5926", units: 4, units_without_serial: 2, status: "Delivered" });
  });
});
