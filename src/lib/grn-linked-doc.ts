// The source document a GRN was received against: a PO for po_grn, a Delivery
// Challan for dc_grn (goods returning from a vendor). Pure — shared by the GRN
// register table and its Excel export so both always agree.

export interface GrnLinkedDoc {
  kind: "PO" | "DC";
  number: string;
  /** Route to the document, or null when the id is missing. */
  href: string | null;
}

export function getGrnLinkedDoc(g: {
  grn_type?: string | null;
  po_number?: string | null;
  po_id?: string | null;
  linked_dc_number?: string | null;
  linked_dc_id?: string | null;
}): GrnLinkedDoc | null {
  if (g.grn_type === "dc_grn") {
    if (!g.linked_dc_number) return null;
    return {
      kind: "DC",
      number: g.linked_dc_number,
      href: g.linked_dc_id ? `/delivery-challans/${g.linked_dc_id}` : null,
    };
  }
  if (!g.po_number) return null;
  return { kind: "PO", number: g.po_number, href: g.po_id ? `/purchase-orders/${g.po_id}` : null };
}

/** Plain-text form for exports, e.g. "PO: PO-0042" / "DC: DC-0007". */
export function formatGrnLinkedDoc(g: Parameters<typeof getGrnLinkedDoc>[0]): string {
  const d = getGrnLinkedDoc(g);
  return d ? `${d.kind}: ${d.number}` : "";
}
