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
  job_work_143: "RETURNABLE (SEC 143)",
  job_work_out: "RETURNABLE (PROCESSING)",
  job_work_return: "RETURN RECEIPT",
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
  if (dc.nature_of_job_work) lines.push(`Nature of Processing: ${dc.nature_of_job_work}`);

  if (JOB_WORK_TYPES.has(dc.dc_type)) {
    lines.push("");
    lines.push("NOT FOR SALE — RETURNABLE / PROCESSING ONLY");
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
  if (fat.assembly_order_number) lines.push(`Production Run: ${fat.assembly_order_number}`);
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

// ── Professional WhatsApp sharing message ────────────────────────────────────
// Uses *bold* markers (rendered by WhatsApp). Falls back to plain formatDocumentText
// for document types without a custom template.
export function formatWhatsAppMessage(
  documentType: string,
  doc: Record<string, unknown>,
  companyName?: string
): string {
  const d = doc as AnyDoc;
  const items: AnyDoc[] = d.line_items ?? [];
  const sign = companyName ? `\nFor ${companyName}` : "";
  const details = formatDocumentText(documentType, doc, companyName);

  switch (documentType) {
    case "Purchase Order": {
      const gstType = (d.cgst_amount ?? 0) > 0 ? "CGST+SGST" : "IGST";
      const firstDelivery = items.map((i) => i.delivery_date).filter(Boolean).sort()[0] as string | undefined;
      const deliveryLine = firstDelivery
        ? `Delivery Expected: ${fmtDate(firstDelivery)}`
        : d.payment_terms
        ? `Terms: ${d.payment_terms}`
        : "";
      const intro = d.vendor_name ? `Dear ${d.vendor_name},\n\n` : "";
      return (
        `${intro}Please find our *Purchase Order ${d.po_number}* dated ${fmtDate(d.po_date)}.` +
        `\n\nItems: ${items.length} line item${items.length !== 1 ? "s" : ""}` +
        `\nTotal Value: ${fmtAmt(d.grand_total)} (${gstType})` +
        (deliveryLine ? `\n${deliveryLine}` : "") +
        `\n\nPlease confirm receipt and expected delivery date.` +
        sign +
        `\n\n${details}`
      );
    }
    case "Delivery Challan": {
      const party = (d.party_name || d.vendor_name) as string | undefined;
      const intro = party ? `Dear ${party},\n\n` : "";
      return (
        `${intro}Please find details of Delivery Challan *${d.dc_number}* dated ${fmtDate(d.dc_date)} accompanying the goods dispatched today.` +
        `\n\nItems: ${items.length} item${items.length !== 1 ? "s" : ""}` +
        (d.return_due_date ? `\nReturn Before: ${fmtDate(d.return_due_date)}` : "") +
        `\n\nKindly acknowledge receipt.` +
        sign +
        `\n\n${details}`
      );
    }
    case "Tax Invoice": {
      const intro = d.customer_name ? `Dear ${d.customer_name},\n\n` : "";
      return (
        `${intro}Please find *Invoice ${d.invoice_number}* dated ${fmtDate(d.invoice_date)} for your kind payment.` +
        `\n\nAmount Due: ${fmtAmt(d.grand_total)}` +
        (d.payment_terms ? `\nPayment Terms: ${d.payment_terms}` : "") +
        (d.due_date ? `\nDue Date: ${fmtDate(d.due_date)}` : "") +
        `\n\nKindly arrange payment at the earliest.` +
        sign +
        `\n\n${details}`
      );
    }
    default:
      return details;
  }
}

// ── Email subject line ────────────────────────────────────────────────────────
// Format: "Company Name — Document Type Number — DD Mon YYYY"
export function formatEmailSubject(
  documentType: string,
  doc: Record<string, unknown>,
  companyName?: string
): string {
  const d = doc as AnyDoc;
  const prefix = companyName ? `${companyName} — ` : "";
  let number = "";
  let date = "";
  switch (documentType) {
    case "Purchase Order":     number = (d.po_number ?? "") as string;      date = fmtDate(d.po_date); break;
    case "Delivery Challan":   number = (d.dc_number ?? "") as string;      date = fmtDate(d.dc_date); break;
    case "Tax Invoice":        number = (d.invoice_number ?? "") as string;  date = fmtDate(d.invoice_date); break;
    case "Sales Order":        number = (d.so_number ?? "") as string;      date = fmtDate(d.so_date); break;
    case "Goods Receipt Note": number = (d.grn_number ?? "") as string;     date = fmtDate(d.grn_date); break;
    default:                   number = (d.doc_number ?? "") as string;
  }
  const parts = [documentType, number].filter(Boolean).join(" ");
  return `${prefix}${parts}${date ? ` — ${date}` : ""}`;
}

// ── HTML document summary (new-tab print-to-PDF) ─────────────────────────────
// TODO: For automatic PDF attachment, integrate a service like Puppeteer (via
// Supabase Edge Function) or use the @react-pdf/renderer library.
// Current approach: browser print to PDF (open in new tab → Ctrl+P → Save as PDF).

function _esc(s?: string | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function _fmtNum(n?: number | null): string {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const _HTML_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#1e293b;padding:20px;max-width:720px;margin:0 auto;line-height:1.4}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:2px solid #1E3A5F;margin-bottom:10px}
  .co{font-size:13pt;font-weight:700;color:#1E3A5F}
  .dt{font-size:12pt;font-weight:700;color:#1E3A5F;text-align:right;text-transform:uppercase;letter-spacing:.05em}
  .dm{font-size:9pt;color:#64748b;text-align:right}
  .pts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;padding:8px;background:#f8fafc;border:1px solid #e2e8f0}
  .lbl{font-size:7.5pt;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:2px}
  .pn{font-weight:600;font-size:10pt}
  .pd{font-size:9pt;color:#475569}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9.5pt}
  thead tr{background:#1E3A5F;color:#fff}
  th{padding:5px 7px;font-size:8pt;text-align:left}
  th.r,td.r{text-align:right}
  td{padding:4px 7px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  .tls{display:flex;justify-content:flex-end;margin-bottom:10px}
  .ti{width:240px}
  .tr{display:flex;justify-content:space-between;font-size:9.5pt;padding:1.5px 0}
  .tr.g{font-weight:700;font-size:11pt;border-top:1.5px solid #1E3A5F;padding-top:4px;margin-top:2px}
  .sec{margin-bottom:8px;font-size:9pt}
  .ft{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:8px;display:flex;justify-content:flex-end}
  .sig{text-align:center;width:150px}
  .sl{border-top:1px solid #94a3b8;margin-top:20px;margin-bottom:3px}
  .slbl{font-size:7.5pt;color:#64748b}
  @media print{body{padding:0;max-width:100%}@page{margin:12mm;size:A4 portrait}}
`;

function _htmlWrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${_esc(title)}</title><style>${_HTML_CSS}</style></head>
<body>${body}</body></html>`;
}

function _htmlFooter(companyName?: string): string {
  return `<div class="ft"><div class="sig"><div class="sl"></div><div class="slbl">Authorised Signatory${companyName ? `<br>for ${_esc(companyName)}` : ""}</div></div></div>`;
}

export function generateHTMLSummary(
  documentType: string,
  doc: Record<string, unknown>,
  companyName?: string
): string {
  const d = doc as AnyDoc;
  const title = formatEmailSubject(documentType, doc, companyName);
  const coDiv = `<div class="co">${_esc(companyName) || "&nbsp;"}</div>`;

  if (documentType === "Purchase Order") {
    const items: AnyDoc[] = d.line_items ?? [];
    const gstRows = (d.cgst_amount ?? 0) > 0
      ? `<div class="tr"><span>CGST @ ${(d.gst_rate ?? 18) / 2}%</span><span>${_fmtNum(d.cgst_amount)}</span></div>` +
        `<div class="tr"><span>SGST @ ${(d.gst_rate ?? 18) / 2}%</span><span>${_fmtNum(d.sgst_amount)}</span></div>`
      : (d.igst_amount ?? 0) > 0
      ? `<div class="tr"><span>IGST @ ${d.gst_rate ?? 18}%</span><span>${_fmtNum(d.igst_amount)}</span></div>`
      : "";

    const body =
      `<div class="hd"><div>${coDiv}</div><div>` +
        `<div class="dt">Purchase Order</div>` +
        `<div class="dm"><strong>PO No: ${_esc(d.po_number)}</strong></div>` +
        `<div class="dm">Date: ${fmtDate(d.po_date)}</div>` +
        (d.payment_terms ? `<div class="dm">Terms: ${_esc(d.payment_terms)}</div>` : "") +
        (d.reference_number ? `<div class="dm">Ref: ${_esc(d.reference_number)}</div>` : "") +
      `</div></div>` +
      `<div class="pts"><div><div class="lbl">Vendor / Bill To</div>` +
        `<div class="pn">${_esc(d.vendor_name)}</div>` +
        (d.vendor_address ? `<div class="pd">${_esc(d.vendor_address)}</div>` : "") +
        (d.vendor_gstin ? `<div class="pd" style="font-family:monospace">GSTIN: ${_esc(d.vendor_gstin)}</div>` : "") +
      `</div>` +
      (d.delivery_address
        ? `<div><div class="lbl">Deliver To</div><div class="pd">${_esc(d.delivery_address)}</div></div>`
        : "") +
      `</div>` +
      `<table><thead><tr>` +
        `<th style="width:4%">#</th><th style="width:40%">Description</th>` +
        `<th class="r" style="width:9%">Qty</th><th style="width:7%">Unit</th>` +
        `<th class="r" style="width:17%">Unit Price</th><th class="r" style="width:23%">Amount</th>` +
      `</tr></thead><tbody>` +
      items.map((it, i) =>
        `<tr><td>${i + 1}</td>` +
        `<td><strong>${_esc(it.description)}</strong>` +
          (it.drawing_number ? `<br><span style="font-family:monospace;font-size:8pt;color:#64748b">${_esc(it.drawing_number)}</span>` : "") +
          (it.hsn_sac_code ? `<br><span style="font-size:8pt;color:#64748b">HSN: ${_esc(it.hsn_sac_code)}</span>` : "") +
        `</td>` +
        `<td class="r">${it.quantity}</td><td>${_esc(it.unit) || "NOS"}</td>` +
        `<td class="r">${_fmtNum(it.unit_price)}</td><td class="r">${_fmtNum(it.line_total)}</td></tr>`
      ).join("") +
      `</tbody></table>` +
      `<div class="tls"><div class="ti">` +
        `<div class="tr"><span>Sub Total</span><span>${_fmtNum(d.sub_total)}</span></div>` +
        gstRows +
        `<div class="tr g"><span>Grand Total</span><span>${_fmtNum(d.grand_total)}</span></div>` +
      `</div></div>` +
      (d.special_instructions ? `<div class="sec"><div class="lbl">Special Instructions</div>${_esc(d.special_instructions)}</div>` : "") +
      _htmlFooter(companyName);
    return _htmlWrap(title, body);
  }

  if (documentType === "Tax Invoice") {
    const items: AnyDoc[] = d.line_items ?? [];
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    items.forEach((li) => { totalCgst += li.cgst ?? 0; totalSgst += li.sgst ?? 0; totalIgst += li.igst ?? 0; });
    const gstRows = totalCgst > 0
      ? `<div class="tr"><span>CGST</span><span>${_fmtNum(totalCgst)}</span></div>` +
        `<div class="tr"><span>SGST</span><span>${_fmtNum(totalSgst)}</span></div>`
      : totalIgst > 0
      ? `<div class="tr"><span>IGST</span><span>${_fmtNum(totalIgst)}</span></div>`
      : "";

    const body =
      `<div class="hd"><div>${coDiv}</div><div>` +
        `<div class="dt">Tax Invoice</div>` +
        `<div class="dm"><strong>Invoice No: ${_esc(d.invoice_number)}</strong></div>` +
        `<div class="dm">Date: ${fmtDate(d.invoice_date)}</div>` +
        (d.due_date ? `<div class="dm">Due: ${fmtDate(d.due_date)}</div>` : "") +
      `</div></div>` +
      `<div class="pts"><div><div class="lbl">Bill To</div>` +
        `<div class="pn">${_esc(d.customer_name)}</div>` +
        (d.customer_address ? `<div class="pd">${_esc(d.customer_address)}</div>` : "") +
        (d.customer_gstin ? `<div class="pd" style="font-family:monospace">GSTIN: ${_esc(d.customer_gstin)}</div>` : "") +
      `</div>` +
      (d.customer_po_reference
        ? `<div><div class="lbl">Customer PO Ref</div><div class="pd">${_esc(d.customer_po_reference)}</div></div>`
        : "") +
      `</div>` +
      `<table><thead><tr>` +
        `<th style="width:4%">#</th><th style="width:40%">Description</th>` +
        `<th class="r" style="width:8%">Qty</th><th style="width:7%">Unit</th>` +
        `<th class="r" style="width:14%">Rate</th><th class="r" style="width:8%">GST%</th><th class="r" style="width:19%">Amount</th>` +
      `</tr></thead><tbody>` +
      items.map((it, i) =>
        `<tr><td>${i + 1}</td>` +
        `<td><strong>${_esc(it.description)}</strong>` +
          (it.hsn_sac_code ? `<br><span style="font-size:8pt;color:#64748b">HSN: ${_esc(it.hsn_sac_code)}</span>` : "") +
        `</td>` +
        `<td class="r">${it.quantity}</td><td>${_esc(it.unit) || "NOS"}</td>` +
        `<td class="r">${_fmtNum(it.unit_price)}</td><td class="r">${it.gst_rate ?? 0}%</td><td class="r">${_fmtNum(it.amount)}</td></tr>`
      ).join("") +
      `</tbody></table>` +
      `<div class="tls"><div class="ti">` +
        `<div class="tr"><span>Taxable Value</span><span>${_fmtNum(d.taxable_value)}</span></div>` +
        gstRows +
        `<div class="tr g"><span>Grand Total</span><span>${_fmtNum(d.grand_total)}</span></div>` +
      `</div></div>` +
      (d.payment_terms ? `<div class="sec"><div class="lbl">Payment Terms</div>${_esc(d.payment_terms)}</div>` : "") +
      (d.bank_name
        ? `<div class="sec"><div class="lbl">Bank Details</div>${_esc(d.bank_name)}` +
            (d.bank_account_number ? ` · A/c: ${_esc(d.bank_account_number)}` : "") +
            (d.bank_ifsc ? ` · IFSC: ${_esc(d.bank_ifsc)}` : "") +
          `</div>`
        : "") +
      _htmlFooter(companyName);
    return _htmlWrap(title, body);
  }

  if (documentType === "Delivery Challan") {
    const items: AnyDoc[] = d.line_items ?? [];
    const typeLabel = DC_TYPE_LABELS[d.dc_type] ?? d.dc_type ?? "";
    const approxVal = d.approx_value ?? d.grand_total;

    const body =
      `<div class="hd"><div>${coDiv}</div><div>` +
        `<div class="dt">Delivery Challan</div>` +
        `<div class="dm"><strong>DC No: ${_esc(d.dc_number)}</strong></div>` +
        `<div class="dm">Date: ${fmtDate(d.dc_date)}</div>` +
        (typeLabel ? `<div class="dm">Type: ${_esc(typeLabel)}</div>` : "") +
      `</div></div>` +
      `<div class="pts"><div><div class="lbl">To</div>` +
        `<div class="pn">${_esc(d.party_name)}</div>` +
        (d.party_address ? `<div class="pd">${_esc(d.party_address)}</div>` : "") +
      `</div>` +
      (d.return_due_date
        ? `<div><div class="lbl">Return Due</div><div class="pd">${fmtDate(d.return_due_date)}</div></div>`
        : "") +
      `</div>` +
      `<table><thead><tr>` +
        `<th style="width:4%">#</th><th style="width:38%">Description</th>` +
        `<th style="width:13%">Drawing</th><th class="r" style="width:10%">Qty</th>` +
        `<th style="width:7%">Unit</th><th style="width:28%">Process</th>` +
      `</tr></thead><tbody>` +
      items.map((it, i) =>
        `<tr><td>${i + 1}</td>` +
        `<td><strong>${_esc(it.description)}</strong></td>` +
        `<td style="font-family:monospace;font-size:8.5pt">${_esc(it.drawing_number) || "—"}</td>` +
        `<td class="r">${it.quantity ?? it.qty_nos ?? ""}</td>` +
        `<td>${_esc(it.unit) || "NOS"}</td>` +
        `<td>${_esc(it.nature_of_process) || "—"}</td></tr>`
      ).join("") +
      `</tbody></table>` +
      (approxVal
        ? `<div class="tls"><div class="ti"><div class="tr"><span>Approx. Value</span><span>${_fmtNum(approxVal)}</span></div></div></div>`
        : "") +
      (JOB_WORK_TYPES.has(d.dc_type)
        ? `<div style="text-align:center;font-size:8.5pt;font-weight:700;color:#64748b;padding:4px;border:1px solid #e2e8f0;margin-bottom:8px">NOT FOR SALE — JOB WORK ONLY</div>`
        : "") +
      _htmlFooter(companyName);
    return _htmlWrap(title, body);
  }

  // Fallback: pre-formatted plain text
  const text = formatDocumentText(documentType, doc, companyName);
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body =
    `<div class="hd"><div>${coDiv}</div><div><div class="dt">${_esc(documentType)}</div></div></div>` +
    `<pre style="font-family:'Courier New',monospace;font-size:9pt;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px">${escaped}</pre>`;
  return _htmlWrap(title, body);
}
