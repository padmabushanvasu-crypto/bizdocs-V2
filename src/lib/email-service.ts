/**
 * Formats a document object as a plain-text string suitable for sharing
 * via email body, WhatsApp message, or clipboard.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

const SEP = "─".repeat(44);

function fmtDate(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtAmt(n?: number | null): string {
  if (n == null || n === 0) return "";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const DC_TYPE_LABELS: Record<string, string> = {
  returnable: "RETURNABLE",
  non_returnable: "NON-RETURNABLE",
  job_work_143: "JOB WORK (SEC 143)",
  job_work_out: "JOB WORK OUT",
  job_work_return: "JOB WORK RETURN",
};

const JOB_WORK_TYPES = new Set(["job_work_out", "job_work_return", "returnable", "job_work_143"]);

function formatDC(dc: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Delivery Challan: ${dc.dc_number}`);
  lines.push(`Date: ${fmtDate(dc.dc_date)}`);
  if (dc.dc_type) lines.push(`Type: ${DC_TYPE_LABELS[dc.dc_type] ?? dc.dc_type}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (dc.party_name) lines.push(`To: ${dc.party_name}`);
  lines.push("");

  const items: AnyDoc[] = dc.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.drawing_number) line += ` (${item.drawing_number})`;
      const qty = item.quantity ?? item.qty_nos ?? "";
      line += ` — ${qty} ${item.unit ?? "NOS"}`;
      if (item.nature_of_process) line += ` — ${item.nature_of_process}`;
      lines.push(line);
    });
    lines.push("");
  }

  const approxVal = dc.approx_value ?? dc.approximate_value ?? dc.grand_total ?? dc.sub_total;
  if (approxVal) lines.push(`Approx. Value: ${fmtAmt(approxVal)}`);
  if (dc.return_due_date) lines.push(`Return Before: ${fmtDate(dc.return_due_date)}`);
  if (dc.nature_of_job_work) lines.push(`Nature of Job Work: ${dc.nature_of_job_work}`);

  if (JOB_WORK_TYPES.has(dc.dc_type)) {
    lines.push("");
    lines.push("NOT FOR SALE — JOB WORK ONLY");
  }
  lines.push(SEP);
  return lines.join("\n");
}

function formatPO(po: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Purchase Order: ${po.po_number}`);
  lines.push(`Date: ${fmtDate(po.po_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (po.vendor_name) lines.push(`To: ${po.vendor_name}`);
  lines.push("");

  const items: AnyDoc[] = po.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.drawing_number) line += ` (${item.drawing_number})`;
      line += ` — ${item.quantity} ${item.unit ?? "NOS"} @ ${fmtAmt(item.unit_price)}`;
      if (item.delivery_date) line += ` — Delivery: ${fmtDate(item.delivery_date)}`;
      lines.push(line);
    });
    lines.push("");
  }

  if (po.sub_total != null) lines.push(`Sub Total: ${fmtAmt(po.sub_total)}`);
  if ((po.cgst_amount ?? 0) > 0) {
    const halfRate = (po.gst_rate ?? 18) / 2;
    lines.push(`CGST (${halfRate}%): ${fmtAmt(po.cgst_amount)}`);
    lines.push(`SGST (${halfRate}%): ${fmtAmt(po.sgst_amount)}`);
  } else if ((po.igst_amount ?? 0) > 0) {
    lines.push(`IGST (${po.gst_rate ?? 18}%): ${fmtAmt(po.igst_amount)}`);
  }
  if (po.grand_total != null) lines.push(`Total: ${fmtAmt(po.grand_total)}`);
  if (po.payment_terms) lines.push(`\nPayment Terms: ${po.payment_terms}`);
  if (po.special_instructions) lines.push(`Note: ${po.special_instructions}`);

  lines.push(SEP);
  return lines.join("\n");
}

function formatInvoice(inv: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Tax Invoice: ${inv.invoice_number}`);
  lines.push(`Date: ${fmtDate(inv.invoice_date)}`);
  if (inv.due_date) lines.push(`Due Date: ${fmtDate(inv.due_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (inv.customer_name) lines.push(`To: ${inv.customer_name}`);
  if (inv.customer_po_reference) lines.push(`PO Ref: ${inv.customer_po_reference}`);
  lines.push("");

  const items: AnyDoc[] = inv.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.drawing_number) line += ` (${item.drawing_number})`;
      line += ` — ${item.quantity} ${item.unit ?? "NOS"} @ ${fmtAmt(item.unit_price)}`;
      lines.push(line);
    });
    lines.push("");
  }

  if (inv.taxable_value != null) lines.push(`Taxable Value: ${fmtAmt(inv.taxable_value)}`);

  // Aggregate GST from line items
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  items.forEach((li) => {
    totalCgst += li.cgst ?? 0;
    totalSgst += li.sgst ?? 0;
    totalIgst += li.igst ?? 0;
  });
  if (totalCgst > 0) {
    lines.push(`CGST: ${fmtAmt(totalCgst)}`);
    lines.push(`SGST: ${fmtAmt(totalSgst)}`);
  } else if (totalIgst > 0) {
    lines.push(`IGST: ${fmtAmt(totalIgst)}`);
  }
  if (inv.grand_total != null) lines.push(`Total: ${fmtAmt(inv.grand_total)}`);

  if (inv.payment_terms) lines.push(`\nPayment Terms: ${inv.payment_terms}`);
  if (inv.bank_name) {
    const bankParts = [`Bank: ${inv.bank_name}`];
    if (inv.bank_account_number) bankParts.push(`A/c: ${inv.bank_account_number}`);
    if (inv.bank_ifsc) bankParts.push(`IFSC: ${inv.bank_ifsc}`);
    lines.push(bankParts.join(", "));
  }

  lines.push(SEP);
  return lines.join("\n");
}

function formatSO(so: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Sales Order: ${so.so_number}`);
  lines.push(`Date: ${fmtDate(so.so_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (so.customer_name) lines.push(`To: ${so.customer_name}`);
  if (so.delivery_date) lines.push(`Delivery: ${fmtDate(so.delivery_date)}`);
  lines.push("");

  const items: AnyDoc[] = so.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.item_code) line += ` (${item.item_code})`;
      line += ` — ${item.quantity} ${item.unit ?? "NOS"} @ ${fmtAmt(item.unit_price)}`;
      if (item.delivery_date) line += ` — Del: ${fmtDate(item.delivery_date)}`;
      lines.push(line);
    });
    lines.push("");
  }

  if (so.grand_total != null) lines.push(`Total: ${fmtAmt(so.grand_total)}`);
  if (so.payment_terms) lines.push(`Payment Terms: ${so.payment_terms}`);
  if (so.special_instructions) lines.push(`Note: ${so.special_instructions}`);

  lines.push(SEP);
  return lines.join("\n");
}

function formatDN(dn: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Dispatch Note: ${dn.dn_number}`);
  lines.push(`Date: ${fmtDate(dn.dn_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (dn.customer_name) lines.push(`To: ${dn.customer_name}`);
  if (dn.so_number) lines.push(`Sales Order Ref: ${dn.so_number}`);
  lines.push("");

  const items: AnyDoc[] = dn.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.item_code) line += ` (${item.item_code})`;
      line += ` — ${item.quantity} ${item.unit ?? "NOS"}`;
      if (item.serial_number_ref) line += ` [SN: ${item.serial_number_ref}]`;
      lines.push(line);
    });
    lines.push("");
  }

  const total = dn.grand_total ?? dn.sub_total;
  if (total) lines.push(`Total: ${fmtAmt(total)}`);
  if (dn.vehicle_number) lines.push(`Vehicle: ${dn.vehicle_number}`);
  if (dn.driver_name) lines.push(`Driver: ${dn.driver_name}`);
  if (dn.transporter) lines.push(`Transporter: ${dn.transporter}`);
  if (dn.lr_number) lines.push(`LR No: ${dn.lr_number}`);

  lines.push(SEP);
  return lines.join("\n");
}

function formatGRN(grn: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`Goods Receipt Note: ${grn.grn_number}`);
  lines.push(`Date: ${fmtDate(grn.grn_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (grn.po_number) lines.push(`PO: ${grn.po_number}`);
  if (grn.vendor_name) lines.push(`Vendor: ${grn.vendor_name}`);
  if (grn.vendor_invoice_number) lines.push(`Vendor Invoice: ${grn.vendor_invoice_number}`);
  lines.push("");

  const items: AnyDoc[] = grn.line_items ?? [];
  if (items.length > 0) {
    lines.push("Items:");
    items.forEach((item, i) => {
      let line = `${i + 1}. ${item.description}`;
      if (item.drawing_number) line += ` (${item.drawing_number})`;
      line += ` — Received: ${item.receiving_now ?? item.accepted_quantity ?? 0}`;
      if ((item.rejected_quantity ?? 0) > 0) {
        line += `, Rejected: ${item.rejected_quantity}`;
        if (item.rejection_reason) line += ` (${item.rejection_reason})`;
      }
      lines.push(line);
    });
    lines.push("");
  }

  if (grn.received_by) lines.push(`Received By: ${grn.received_by}`);

  lines.push(SEP);
  return lines.join("\n");
}

function formatFAT(fat: AnyDoc, companyName?: string): string {
  const lines: string[] = [SEP];
  lines.push(`FAT Certificate: ${fat.fat_number}`);
  lines.push(`Date: ${fmtDate(fat.fat_date ?? fat.test_date)}`);
  if (companyName) lines.push(`From: ${companyName}`);
  if (fat.item_description) {
    lines.push(`Item: ${fat.item_description}${fat.item_code ? ` (${fat.item_code})` : ""}`);
  }
  if (fat.drawing_number) {
    const dwg = fat.drawing_revision
      ? `${fat.drawing_revision} (${fat.drawing_number})`
      : fat.drawing_number;
    lines.push(`Drawing: ${dwg}`);
  }
  if (fat.serial_number) lines.push(`Serial No: ${fat.serial_number}`);
  if (fat.customer_name) lines.push(`Customer: ${fat.customer_name}`);
  if (fat.customer_po_ref) lines.push(`Customer PO: ${fat.customer_po_ref}`);
  if (fat.assembly_order_number) lines.push(`Assembly Order: ${fat.assembly_order_number}`);
  lines.push("");

  const result = fat.overall_result ?? fat.status;
  if (result) lines.push(`Result: ${String(result).toUpperCase()}`);
  if (fat.tested_by) lines.push(`Tested By: ${fat.tested_by}`);
  if (fat.witnessed_by) lines.push(`Witnessed By: ${fat.witnessed_by}`);
  if (fat.notes) lines.push(`Notes: ${fat.notes}`);

  lines.push(SEP);
  return lines.join("\n");
}

export function formatDocumentText(
  documentType: string,
  doc: Record<string, unknown>,
  companyName?: string
): string {
  const d = doc as AnyDoc;
  switch (documentType) {
    case "Delivery Challan":    return formatDC(d, companyName);
    case "Purchase Order":      return formatPO(d, companyName);
    case "Tax Invoice":         return formatInvoice(d, companyName);
    case "Sales Order":         return formatSO(d, companyName);
    case "Dispatch Note":       return formatDN(d, companyName);
    case "Goods Receipt Note":  return formatGRN(d, companyName);
    case "FAT Certificate":     return formatFAT(d, companyName);
    default:
      return [SEP, `${documentType}: ${d.doc_number ?? ""}`, SEP].join("\n");
  }
}
