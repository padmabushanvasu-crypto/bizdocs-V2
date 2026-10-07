import { describe, it, expect } from "vitest";
import { getGrnLinkedDoc, formatGrnLinkedDoc } from "@/lib/grn-linked-doc";

describe("getGrnLinkedDoc", () => {
  it("po_grn → PO with link to the PO", () => {
    expect(getGrnLinkedDoc({ grn_type: "po_grn", po_number: "PO-1", po_id: "p1" })).toEqual({ kind: "PO", number: "PO-1", href: "/purchase-orders/p1" });
  });
  it("dc_grn → DC with link to the DC, ignoring po_number", () => {
    expect(getGrnLinkedDoc({ grn_type: "dc_grn", po_number: "PO-1", linked_dc_number: "DC-7", linked_dc_id: "d1" })).toEqual({ kind: "DC", number: "DC-7", href: "/delivery-challans/d1" });
  });
  it("legacy rows without grn_type fall back to the PO", () => {
    expect(getGrnLinkedDoc({ po_number: "PO-2", po_id: "p2" })?.kind).toBe("PO");
  });
  it("returns null when nothing is linked, and no href without an id", () => {
    expect(getGrnLinkedDoc({ grn_type: "dc_grn" })).toBeNull();
    expect(getGrnLinkedDoc({ grn_type: "po_grn" })).toBeNull();
    expect(getGrnLinkedDoc({ grn_type: "dc_grn", linked_dc_number: "DC-7" })?.href).toBeNull();
  });
});

describe("formatGrnLinkedDoc", () => {
  it("formats export text", () => {
    expect(formatGrnLinkedDoc({ grn_type: "po_grn", po_number: "PO-1" })).toBe("PO: PO-1");
    expect(formatGrnLinkedDoc({ grn_type: "dc_grn", linked_dc_number: "DC-7" })).toBe("DC: DC-7");
    expect(formatGrnLinkedDoc({})).toBe("");
  });
});
