import * as XLSX from "xlsx-js-style";

const GST_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Returns date in DD-Mon-YYYY format required by GST portal (e.g. 21-Mar-2026) */
export function formatDateGST(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${GST_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export interface ExportColumn {
  key: string;
  label: string;
  type?: "text" | "date" | "currency" | "number" | "boolean";
  width?: number;
}

interface ExportSheetData {
  sheetName: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
}

function formatDateIN(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrencyIN(value: any): number {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_received: "Partially Received",
  fully_received: "Fully Received",
  cancelled: "Cancelled",
  closed: "Closed",
  partially_returned: "Partially Returned",
  fully_returned: "Fully Returned",
  sent: "Sent",
  partially_paid: "Partially Paid",
  fully_paid: "Paid",
  overdue: "Overdue",
  recorded: "Recorded",
  verified: "Verified",
  active: "Active",
  inactive: "Inactive",
  vendor: "Vendor",
  customer: "Customer",
  both: "Both",
  raw_material: "Raw Material",
  finished_good: "Finished Good",
  service: "Service",
  consumable: "Consumable",
};

function humanize(value: string): string {
  return STATUS_LABELS[value] || value;
}

function buildSheet(sheetData: ExportSheetData): XLSX.WorkSheet {
  const { columns, data } = sheetData;
  const headers = columns.map((c) => c.label);

  const rows = data.map((row) =>
    columns.map((col) => {
      let value = row[col.key];
      if (value === null || value === undefined) return "";
      if (col.type === "date") return formatDateIN(value);
      if (col.type === "currency") return formatCurrencyIN(value);
      if (col.type === "number") return parseFloat(value) || 0;
      if (col.type === "boolean") {
        const truthy = value === true || value === 1 || value === "true" || value === "1" || value === "yes" || value === "Yes";
        return truthy ? "Yes" : "No";
      }
      if (typeof value === "string" && STATUS_LABELS[value]) return humanize(value);
      return String(value);
    })
  );

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Style header row - Deep Indigo background, white bold text
  for (let c = 0; c < columns.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) {
      ws[ref].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: "2D3282" } },
        alignment: { horizontal: "center" },
      };
    }
  }

  // Alternating row colors
  for (let r = 1; r <= rows.length; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < columns.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) {
          ws[ref].s = { fill: { fgColor: { rgb: "F8FAFC" } } };
        }
      }
    }
  }

  // Auto column widths
  ws["!cols"] = columns.map((col) => ({
    wch: Math.max(col.width || 14, col.label.length + 2),
  }));

  // Freeze header
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  return ws;
}

export function exportToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string,
  sheetName: string = "Data"
): void {
  const ws = buildSheet({ sheetName, columns, data });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function exportMultiSheet(
  sheets: ExportSheetData[],
  filename: string,
  disclaimer?: string
): void {
  const wb = XLSX.utils.book_new();

  if (disclaimer) {
    const noteWs = XLSX.utils.aoa_to_sheet([[disclaimer], [""], ["Generated: " + new Date().toLocaleString("en-IN")]]);
    noteWs["A1"].s = { font: { italic: true, color: { rgb: "555555" } }, fill: { fgColor: { rgb: "FFFBEB" } } };
    noteWs["!cols"] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, noteWs, "Notes");
  }

  for (const sheet of sheets) {
    const ws = buildSheet(sheet);
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.substring(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

// ── Column Definitions ──

export const PARTIES_EXPORT_COLS: ExportColumn[] = [
  { key: "party_type", label: "Party Type" },
  { key: "name", label: "Company Name", width: 24 },
  { key: "contact_person", label: "Contact Person", width: 18 },
  { key: "city", label: "City" },
  { key: "state", label: "State", width: 18 },
  { key: "pin_code", label: "PIN" },
  { key: "phone1", label: "Phone 1" },
  { key: "phone2", label: "Phone 2" },
  { key: "email1", label: "Email", width: 22 },
  { key: "gstin", label: "GSTIN", width: 18 },
  { key: "pan", label: "PAN" },
  { key: "payment_terms", label: "Payment Terms" },
  { key: "status", label: "Status" },
];

// Items export columns — must stay in lock-step with ITEMS_IMPORT_CONFIG below
// so a user can export → edit → re-import without renaming headers. The only
// addition here is "Current Stock" (read-only on import; ignored if present).
export const ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "drawing_number", label: "Drawing No." },
  { key: "item_code", label: "Code" },
  { key: "description", label: "Description", width: 30 },
  { key: "item_type", label: "Type" },
  { key: "unit", label: "Unit" },
  { key: "hsn_sac_code", label: "HSN" },
  { key: "min_stock", label: "Min Stock", type: "number" },
  { key: "aimed_stock", label: "Aimed Qty", type: "number" },
  { key: "gst_rate", label: "GST%", type: "number" },
  { key: "standard_cost", label: "Standard Cost", type: "number" },
  { key: "is_consumable", label: "Consumable", type: "boolean" },
  { key: "current_stock", label: "Current Stock", type: "number" },
];

export const PO_EXPORT_COLS: ExportColumn[] = [
  { key: "po_number", label: "PO Number" },
  { key: "po_date", label: "Date", type: "date" },
  { key: "vendor_name", label: "Vendor Name", width: 24 },
  { key: "vendor_gstin", label: "Vendor GSTIN", width: 18 },
  { key: "reference_number", label: "Reference" },
  { key: "payment_terms", label: "Payment Terms" },
  { key: "sub_total", label: "Sub Total", type: "currency" },
  { key: "total_gst", label: "GST Amount", type: "currency" },
  { key: "grand_total", label: "Grand Total", type: "currency" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Created Date", type: "date" },
];

export const PO_LINE_ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "po_number", label: "PO Number" },
  { key: "serial_number", label: "Serial No", type: "number" },
  { key: "description", label: "Description", width: 30 },
  { key: "drawing_number", label: "Drawing Number" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "unit_price", label: "Unit Price", type: "currency" },
  { key: "delivery_date", label: "Delivery Date", type: "date" },
  { key: "line_total", label: "Amount", type: "currency" },
  { key: "received_quantity", label: "Received Qty", type: "number" },
  { key: "pending_quantity", label: "Pending Qty", type: "number" },
];

export const DC_EXPORT_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "dc_date", label: "Date", type: "date" },
  { key: "dc_type", label: "DC Type" },
  { key: "party_name", label: "Party Name", width: 24 },
  { key: "reference_number", label: "Reference" },
  { key: "return_due_date", label: "Return Due Date", type: "date" },
  { key: "approximate_value", label: "Approximate Value", type: "currency" },
  { key: "total_items", label: "Total Items", type: "number" },
  { key: "total_qty", label: "Sent Qty", type: "number" },
  { key: "status", label: "Status" },
];

export const DC_LINE_ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "serial_number", label: "Serial No", type: "number" },
  { key: "description", label: "Description", width: 30 },
  { key: "drawing_number", label: "Drawing Number" },
  { key: "qty_nos", label: "Qty (Nos)", type: "number" },
  { key: "qty_kg", label: "Qty (KG)", type: "number" },
  { key: "qty_sft", label: "Qty (SFT)", type: "number" },
  { key: "returned_qty_nos", label: "Returned (Nos)", type: "number" },
  { key: "returned_qty_kg", label: "Returned (KG)", type: "number" },
  { key: "nature_of_process", label: "Nature of Process" },
  { key: "material_type", label: "Material Type" },
];

export const INVOICE_EXPORT_COLS: ExportColumn[] = [
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Date", type: "date" },
  { key: "customer_name", label: "Customer Name", width: 24 },
  { key: "customer_gstin", label: "Customer GSTIN", width: 18 },
  { key: "customer_po_reference", label: "PO Reference" },
  { key: "sub_total", label: "Sub Total", type: "currency" },
  { key: "total_discount", label: "Discount", type: "currency" },
  { key: "taxable_value", label: "Taxable Value", type: "currency" },
  { key: "cgst_amount", label: "CGST", type: "currency" },
  { key: "sgst_amount", label: "SGST", type: "currency" },
  { key: "igst_amount", label: "IGST", type: "currency" },
  { key: "total_gst", label: "Total GST", type: "currency" },
  { key: "grand_total", label: "Grand Total", type: "currency" },
  { key: "amount_paid", label: "Amount Paid", type: "currency" },
  { key: "amount_outstanding", label: "Outstanding", type: "currency" },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "status", label: "Status" },
];

export const INVOICE_LINE_ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "invoice_number", label: "Invoice Number" },
  { key: "serial_number", label: "Serial No", type: "number" },
  { key: "description", label: "Description", width: 30 },
  { key: "hsn_sac_code", label: "HSN/SAC" },
  { key: "quantity", label: "Qty", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "unit_price", label: "Unit Price", type: "currency" },
  { key: "discount_percent", label: "Discount %", type: "number" },
  { key: "gst_rate", label: "GST %", type: "number" },
  { key: "taxable_amount", label: "Taxable", type: "currency" },
  { key: "line_total", label: "Amount", type: "currency" },
];

export const GRN_EXPORT_COLS: ExportColumn[] = [
  { key: "grn_number", label: "GRN Number" },
  { key: "grn_date", label: "Date", type: "date" },
  { key: "vendor_name", label: "Vendor", width: 24 },
  { key: "po_number", label: "Linked PO" },
  { key: "vendor_invoice_number", label: "Vendor Invoice" },
  { key: "total_received", label: "Received", type: "number" },
  { key: "total_accepted", label: "Accepted", type: "number" },
  { key: "total_rejected", label: "Rejected", type: "number" },
  { key: "status", label: "Status" },
];

export const GRN_LINE_ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "grn_number", label: "GRN Number" },
  { key: "serial_number", label: "Serial No", type: "number" },
  { key: "description", label: "Description", width: 30 },
  { key: "drawing_number", label: "Drawing Number" },
  { key: "po_quantity", label: "PO Qty", type: "number" },
  { key: "previously_received", label: "Prev Received", type: "number" },
  { key: "receiving_now", label: "Receiving Now", type: "number" },
  { key: "accepted_quantity", label: "Accepted", type: "number" },
  { key: "rejected_quantity", label: "Rejected", type: "number" },
  { key: "unit", label: "Unit" },
];

export const PAYMENT_EXPORT_COLS: ExportColumn[] = [
  { key: "receipt_number", label: "Receipt Number" },
  { key: "payment_date", label: "Date", type: "date" },
  { key: "customer_name", label: "Customer Name", width: 24 },
  { key: "amount", label: "Amount Received", type: "currency" },
  { key: "payment_mode", label: "Payment Mode" },
  { key: "reference_number", label: "Reference" },
  { key: "invoice_number", label: "Against Invoice" },
  { key: "notes", label: "Notes", width: 24 },
];

export const COMPANY_EXPORT_COLS: ExportColumn[] = [
  { key: "company_name", label: "Company Name", width: 24 },
  { key: "gstin", label: "GSTIN", width: 18 },
  { key: "pan", label: "PAN" },
  { key: "address_line1", label: "Address Line 1", width: 24 },
  { key: "address_line2", label: "Address Line 2", width: 24 },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "state_code", label: "State Code" },
  { key: "pin_code", label: "PIN Code" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", width: 22 },
  { key: "bank_name", label: "Bank Name" },
  { key: "bank_account", label: "Account Number" },
  { key: "bank_ifsc", label: "IFSC" },
  { key: "bank_branch", label: "Branch" },
];

export const DOC_SETTINGS_EXPORT_COLS: ExportColumn[] = [
  { key: "document_type", label: "Document Type" },
  { key: "paper_size", label: "Paper Size" },
  { key: "copies_per_page", label: "Copies/Page", type: "number" },
  { key: "numbering_prefix", label: "Numbering Prefix" },
  { key: "numbering_current", label: "Current Number", type: "number" },
  { key: "show_logo", label: "Show Logo" },
  { key: "show_signature", label: "Show Signature" },
  { key: "show_bank_details", label: "Show Bank Details" },
  { key: "show_gst_breakup", label: "Show GST Breakup" },
];

// ── Date-range Report Builders ────────────────────────────────────────────────
// Used by the ExportModal flow on PO / DC / GRN list pages. Each builder takes
// the parent records (with embedded line_items where applicable) and writes a
// single-sheet summary or a two-sheet workbook (summary + line items).

const PO_REPORT_SUMMARY_COLS: ExportColumn[] = [
  { key: "po_number", label: "PO Number" },
  { key: "po_date", label: "PO Date", type: "date" },
  { key: "vendor_name", label: "Vendor", width: 24 },
  { key: "vendor_phone", label: "Vendor Phone", width: 16 },
  { key: "reference_number", label: "Reference" },
  { key: "payment_terms", label: "Payment Terms" },
  { key: "sub_total", label: "Sub Total", type: "currency" },
  { key: "total_gst", label: "GST Amount", type: "currency" },
  { key: "grand_total", label: "Grand Total", type: "currency" },
  { key: "status", label: "Status" },
];

const PO_REPORT_LINE_COLS: ExportColumn[] = [
  { key: "po_number", label: "PO Number" },
  { key: "vendor_name", label: "Vendor", width: 24 },
  { key: "drawing_number", label: "Drawing No." },
  { key: "description", label: "Description", width: 30 },
  { key: "hsn_sac_code", label: "HSN" },
  { key: "quantity", label: "Qty", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "unit_price", label: "Unit Price", type: "currency" },
  { key: "line_total", label: "Line Total", type: "currency" },
  { key: "delivery_date", label: "Delivery Date", type: "date" },
];

export function exportPOReport(
  pos: any[],
  includeLineItems: boolean,
  dateFrom: string,
  dateTo: string
): void {
  const filename = `PO_Report_${dateFrom}_to_${dateTo}.xlsx`;
  if (!includeLineItems) {
    exportToExcel(pos, PO_REPORT_SUMMARY_COLS, filename, "PO Summary");
    return;
  }
  const lineRows = pos.flatMap((po) =>
    (po.line_items ?? []).map((li: any) => ({
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      drawing_number: li.drawing_number,
      description: li.description,
      hsn_sac_code: li.hsn_sac_code,
      quantity: li.quantity,
      unit: li.unit,
      unit_price: li.unit_price,
      line_total: li.line_total,
      delivery_date: li.delivery_date,
    }))
  );
  exportMultiSheet(
    [
      { sheetName: "PO Summary", columns: PO_REPORT_SUMMARY_COLS, data: pos },
      { sheetName: "PO Line Items", columns: PO_REPORT_LINE_COLS, data: lineRows },
    ],
    filename
  );
}

const DC_REPORT_SUMMARY_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "dc_date", label: "DC Date", type: "date" },
  { key: "party_name", label: "Party", width: 24 },
  { key: "party_phone", label: "Party Phone", width: 16 },
  { key: "dc_type", label: "DC Type" },
  { key: "nature_of_job_work", label: "Nature of Job Work", width: 24 },
  { key: "reference_number", label: "Reference" },
  { key: "return_due_date", label: "Return Due Date", type: "date" },
  { key: "grand_total", label: "Grand Total", type: "currency" },
  { key: "status", label: "Status" },
];

const DC_REPORT_LINE_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "party_name", label: "Party", width: 24 },
  { key: "drawing_number", label: "Drawing No." },
  { key: "description", label: "Description", width: 30 },
  { key: "nature_of_process", label: "Stage / Process", width: 22 },
  { key: "quantity", label: "Qty", type: "number" },
  { key: "unit", label: "Unit" },
  { key: "rate", label: "Rate", type: "currency" },
  { key: "amount", label: "Amount", type: "currency" },
];

export function exportDCReport(
  dcs: any[],
  includeLineItems: boolean,
  dateFrom: string,
  dateTo: string
): void {
  const filename = `DC_Report_${dateFrom}_to_${dateTo}.xlsx`;
  if (!includeLineItems) {
    exportToExcel(dcs, DC_REPORT_SUMMARY_COLS, filename, "DC Summary");
    return;
  }
  const lineRows = dcs.flatMap((dc) =>
    (dc.line_items ?? []).map((li: any) => ({
      dc_number: dc.dc_number,
      party_name: dc.party_name,
      drawing_number: li.drawing_number,
      description: li.description,
      nature_of_process: li.nature_of_process,
      quantity: li.quantity ?? li.qty_nos,
      unit: li.unit,
      rate: li.rate,
      amount: li.amount,
    }))
  );
  exportMultiSheet(
    [
      { sheetName: "DC Summary", columns: DC_REPORT_SUMMARY_COLS, data: dcs },
      { sheetName: "DC Line Items", columns: DC_REPORT_LINE_COLS, data: lineRows },
    ],
    filename
  );
}

const DC_RETURNS_SUMMARY_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "dc_date", label: "DC Date", type: "date" },
  { key: "party_name", label: "Party", width: 24 },
  { key: "party_phone", label: "Party Phone", width: 16 },
  { key: "nature_of_job_work", label: "Nature of Job Work", width: 24 },
  { key: "return_due_date", label: "Return Due Date", type: "date" },
  { key: "status", label: "Status" },
];

const DC_RETURNS_LINE_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC Number" },
  { key: "party_name", label: "Party", width: 24 },
  { key: "drawing_number", label: "Drawing No." },
  { key: "description", label: "Description", width: 30 },
  { key: "qty_sent", label: "Qty Sent", type: "number" },
  { key: "qty_returned", label: "Qty Returned", type: "number" },
  { key: "qty_pending", label: "Qty Pending", type: "number" },
  { key: "unit", label: "Unit" },
];

export function exportDCReturnsReport(
  dcs: any[],
  includeLineItems: boolean,
  dateFrom: string,
  dateTo: string
): void {
  const filename = `DC_Returns_Report_${dateFrom}_to_${dateTo}.xlsx`;
  if (!includeLineItems) {
    exportToExcel(dcs, DC_RETURNS_SUMMARY_COLS, filename, "DC Returns Summary");
    return;
  }
  const lineRows = dcs.flatMap((dc) =>
    (dc.line_items ?? []).map((li: any) => {
      const sent = Number(li.qty_nos ?? li.quantity ?? 0);
      const returned = Number(li.returned_qty_nos ?? 0);
      const pending = Math.max(0, sent - returned);
      return {
        dc_number: dc.dc_number,
        party_name: dc.party_name,
        drawing_number: li.drawing_number,
        description: li.description,
        qty_sent: sent,
        qty_returned: returned,
        qty_pending: pending,
        unit: li.unit ?? "NOS",
      };
    })
  );
  exportMultiSheet(
    [
      { sheetName: "DC Returns Summary", columns: DC_RETURNS_SUMMARY_COLS, data: dcs },
      { sheetName: "Items Returned", columns: DC_RETURNS_LINE_COLS, data: lineRows },
    ],
    filename
  );
}

const GRN_REPORT_SUMMARY_COLS: ExportColumn[] = [
  { key: "grn_number", label: "GRN Number" },
  { key: "grn_date", label: "GRN Date", type: "date" },
  { key: "vendor_name", label: "Vendor", width: 24 },
  { key: "po_number", label: "Linked PO" },
  { key: "vendor_invoice_number", label: "Vendor Invoice" },
  { key: "total_received", label: "Total Received", type: "number" },
  { key: "total_accepted", label: "Total Accepted", type: "number" },
  { key: "total_rejected", label: "Total Rejected", type: "number" },
  { key: "status", label: "Status" },
];

const GRN_REPORT_LINE_COLS: ExportColumn[] = [
  { key: "grn_number", label: "GRN Number" },
  { key: "vendor_name", label: "Vendor", width: 24 },
  { key: "drawing_number", label: "Drawing No." },
  { key: "description", label: "Item Description", width: 30 },
  { key: "ordered_qty", label: "Ordered Qty", type: "number" },
  { key: "received_now", label: "Received", type: "number" },
  { key: "accepted_qty", label: "Accepted", type: "number" },
  { key: "rejected_qty", label: "Rejected", type: "number" },
  { key: "store_confirmed_qty", label: "Store Confirmed", type: "number" },
  { key: "unit", label: "Unit" },
];

export function exportGRNReport(
  grns: any[],
  includeLineItems: boolean,
  dateFrom: string,
  dateTo: string
): void {
  const filename = `GRN_Report_${dateFrom}_to_${dateTo}.xlsx`;
  if (!includeLineItems) {
    exportToExcel(grns, GRN_REPORT_SUMMARY_COLS, filename, "GRN Summary");
    return;
  }
  const lineRows = grns.flatMap((g) =>
    (g.line_items ?? []).map((li: any) => ({
      grn_number: g.grn_number,
      vendor_name: g.vendor_name,
      drawing_number: li.drawing_number,
      description: li.description,
      ordered_qty: li.ordered_qty ?? li.po_quantity,
      received_now: li.received_now ?? li.receiving_now,
      accepted_qty: li.accepted_qty ?? li.accepted_quantity,
      rejected_qty: li.rejected_qty ?? li.rejected_quantity,
      store_confirmed_qty: li.store_confirmed_qty,
      unit: li.unit,
    }))
  );
  exportMultiSheet(
    [
      { sheetName: "GRN Summary", columns: GRN_REPORT_SUMMARY_COLS, data: grns },
      { sheetName: "GRN Line Items", columns: GRN_REPORT_LINE_COLS, data: lineRows },
    ],
    filename
  );
}

// ── Stock Register workbook ───────────────────────────────────────────────────
// Built bespoke (not via buildSheet) because it needs real numeric cells with
// per-column number formats — buildSheet stringifies everything via the
// ExportColumn type system. The styling tokens still mirror buildSheet's
// header (deep-indigo bg, white bold text) and zebra (slate-50) so the file
// looks of a piece with the existing PO/DC/GRN exports.

interface StockStatusRowLike {
  item_code?: string;
  description?: string;
  item_type?: string;
  unit?: string;
  standard_cost?: number | null;
  stock_free?: number | null;
  stock_in_process?: number | null;
  stock_in_subassembly_wip?: number | null;
  stock_in_fg_wip?: number | null;
  stock_in_fg_ready?: number | null;
  cost_free?: number | null;
  cost_in_process?: number | null;
  cost_in_subassembly_wip?: number | null;
  cost_in_fg_wip?: number | null;
  cost_in_fg_ready?: number | null;
  cost_total?: number | null;
  effective_min_stock?: number | null;
  aimed_stock?: number | null;
  stock_alert_level?: string | null;
}

const RUPEE_FMT = '"₹"#,##,##0.00';
const QTY_INT_FMT = "#,##0";
const QTY_DEC_FMT = "#,##0.00";

function slugifyCompanyName(name: string): string {
  return (name || "client")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "client";
}

function nowStampLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function buildStockRegisterWorkbook(
  rows: StockStatusRowLike[],
  opts: { companyName: string; mode: "view" | "all" }
): { workbook: XLSX.WorkBook; filename: string } {
  // Header titles (display order matches the spec)
  const headers = [
    "Item Code",                  // 1
    "Description",                // 2
    "Type",                       // 3
    "UOM",                        // 4
    "Standard Cost (₹)",          // 5
    "Stock — In Store",           // 6
    "Stock — At Vendor",          // 7
    "Stock — Sub-Assy WIP",       // 8
    "Stock — FG WIP",             // 9
    "Stock — FG Ready",           // 10
    "Stock — TOTAL",              // 11
    "Cost — In Store (₹)",        // 12
    "Cost — At Vendor (₹)",       // 13
    "Cost — Sub-Assy WIP (₹)",    // 14
    "Cost — FG WIP (₹)",          // 15
    "Cost — FG Ready (₹)",        // 16
    "Cost — TOTAL (₹)",           // 17
    "Min Required",               // 18
    "Aimed Stock",                // 19
    "Alert Level",                // 20
  ];

  // Coerce + derive each row's numeric values. Keep numbers as numbers so the
  // sheet writes real numeric cells (sortable/summable in Excel).
  type RowVals = {
    code: string;
    desc: string;
    type: string;
    uom: string;
    std: number;
    s_free: number;
    s_proc: number;
    s_sa: number;
    s_fgwip: number;
    s_fgr: number;
    s_total: number;
    c_free: number;
    c_proc: number;
    c_sa: number;
    c_fgwip: number;
    c_fgr: number;
    c_total: number;
    minreq: number;
    aimed: number;
    alert: string;
  };
  const rowVals: RowVals[] = rows.map((r) => {
    const s_free   = Number(r.stock_free               ?? 0);
    const s_proc   = Number(r.stock_in_process         ?? 0);
    const s_sa     = Number(r.stock_in_subassembly_wip ?? 0);
    const s_fgwip  = Number(r.stock_in_fg_wip          ?? 0);
    const s_fgr    = Number(r.stock_in_fg_ready        ?? 0);
    return {
      code:    r.item_code ?? "",
      desc:    r.description ?? "",
      type:    humanize(r.item_type ?? ""),
      uom:     r.unit ?? "",
      std:     Number(r.standard_cost ?? 0),
      s_free, s_proc, s_sa, s_fgwip, s_fgr,
      s_total: s_free + s_proc + s_sa + s_fgwip + s_fgr,
      c_free:  Number(r.cost_free               ?? 0),
      c_proc:  Number(r.cost_in_process         ?? 0),
      c_sa:    Number(r.cost_in_subassembly_wip ?? 0),
      c_fgwip: Number(r.cost_in_fg_wip          ?? 0),
      c_fgr:   Number(r.cost_in_fg_ready        ?? 0),
      c_total: Number(r.cost_total              ?? 0),
      minreq:  Number(r.effective_min_stock ?? 0),
      aimed:   Number(r.aimed_stock         ?? 0),
      alert:   r.stock_alert_level ?? "",
    };
  });

  // Decide qty format — integer if every qty across the dataset is whole, else
  // 2 decimals. Standard Cost / Cost cols always use the rupee format.
  const allWholeQty = rowVals.every(
    (v) =>
      Number.isInteger(v.s_free) &&
      Number.isInteger(v.s_proc) &&
      Number.isInteger(v.s_sa) &&
      Number.isInteger(v.s_fgwip) &&
      Number.isInteger(v.s_fgr) &&
      Number.isInteger(v.s_total) &&
      Number.isInteger(v.minreq) &&
      Number.isInteger(v.aimed),
  );
  const qtyFmt = allWholeQty ? QTY_INT_FMT : QTY_DEC_FMT;

  // Column-index → number-format map (omit text columns)
  const numFmtByCol: Record<number, string> = {
    4:  RUPEE_FMT, // Standard Cost
    5:  qtyFmt,    // Stock — In Store
    6:  qtyFmt,    // Stock — At Vendor
    7:  qtyFmt,    // Stock — Sub-Assy WIP
    8:  qtyFmt,    // Stock — FG WIP
    9:  qtyFmt,    // Stock — FG Ready
    10: qtyFmt,    // Stock — TOTAL
    11: RUPEE_FMT, // Cost — In Store
    12: RUPEE_FMT, // Cost — At Vendor
    13: RUPEE_FMT, // Cost — Sub-Assy WIP
    14: RUPEE_FMT, // Cost — FG WIP
    15: RUPEE_FMT, // Cost — FG Ready
    16: RUPEE_FMT, // Cost — TOTAL
    17: qtyFmt,    // Min Required
    18: qtyFmt,    // Aimed Stock
  };

  // Build AOA: header + rows + totals
  const aoa: any[][] = [headers];
  for (const v of rowVals) {
    aoa.push([
      v.code, v.desc, v.type, v.uom,
      v.std,
      v.s_free, v.s_proc, v.s_sa, v.s_fgwip, v.s_fgr, v.s_total,
      v.c_free, v.c_proc, v.c_sa, v.c_fgwip, v.c_fgr, v.c_total,
      v.minreq, v.aimed,
      humanize(v.alert),
    ]);
  }

  // Footer totals — precomputed sums (aligns with the on-page tfoot)
  const sum = (k: keyof RowVals): number =>
    rowVals.reduce((s, r) => s + Number((r[k] ?? 0) as number), 0);

  const footer: any[] = [
    "TOTAL", "", "", "",
    "",                    // standard cost — meaningless to sum
    sum("s_free"), sum("s_proc"), sum("s_sa"), sum("s_fgwip"), sum("s_fgr"), sum("s_total"),
    sum("c_free"), sum("c_proc"), sum("c_sa"), sum("c_fgwip"), sum("c_fgr"), sum("c_total"),
    "", "", "",
  ];
  aoa.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const headerRow = 0;
  const totalsRow = aoa.length - 1;

  // Apply per-cell formats and styling.
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell: any = ws[ref];
      if (!cell) continue;

      if (r === headerRow) {
        // Header — match buildSheet's existing PO/DC/GRN export tokens
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill: { fgColor: { rgb: "2D3282" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
        continue;
      }

      const isTotalsRow = r === totalsRow;
      const fmt = numFmtByCol[c];
      const isNumericCol = fmt !== undefined;

      // Coerce numeric cells — make sure they're real numbers, not strings
      if (isNumericCol && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = fmt;
      }

      const baseFill = !isTotalsRow && r % 2 === 0
        ? { fill: { fgColor: { rgb: "F8FAFC" } } }
        : {};

      if (isTotalsRow) {
        cell.s = {
          ...baseFill,
          font: { bold: true, sz: 11 },
          alignment: { horizontal: isNumericCol ? "right" : "left", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "94A3B8" } },
          },
          ...(isNumericCol ? { numFmt: fmt } : {}),
        };
      } else {
        cell.s = {
          ...baseFill,
          alignment: { horizontal: isNumericCol ? "right" : "left", vertical: "center" },
          ...(isNumericCol ? { numFmt: fmt } : {}),
        };
      }
    }
  }

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // Item Code
    { wch: 40 }, // Description
    { wch: 14 }, // Type
    { wch: 8  }, // UOM
    { wch: 16 }, // Standard Cost
    { wch: 16 }, // Stock — In Store
    { wch: 16 }, // Stock — At Vendor
    { wch: 18 }, // Stock — Sub-Assy WIP
    { wch: 16 }, // Stock — FG WIP
    { wch: 16 }, // Stock — FG Ready
    { wch: 16 }, // Stock — TOTAL
    { wch: 18 }, // Cost — In Store
    { wch: 18 }, // Cost — At Vendor
    { wch: 20 }, // Cost — Sub-Assy WIP
    { wch: 18 }, // Cost — FG WIP
    { wch: 18 }, // Cost — FG Ready
    { wch: 20 }, // Cost — TOTAL
    { wch: 14 }, // Min Required
    { wch: 14 }, // Aimed Stock
    { wch: 14 }, // Alert Level
  ];

  // Freeze pane intentionally not set — xlsx-js-style v1.2.0 has no
  // frozen-pane writer (ws['!freeze'] / '!sheetView' / '!views' are all
  // silently dropped on write). The existing PO / DC / GRN exports share
  // this limitation. Excel users will need to freeze row 1 manually if
  // they want a sticky header while scrolling.

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Register");

  // Filename: stock-register_<slug>_<mode>_YYYY-MM-DD_HHmm.xlsx
  const slug = slugifyCompanyName(opts.companyName);
  const stamp = nowStampLocal();
  const filename = `stock-register_${slug}_${opts.mode}_${stamp}.xlsx`;

  return { workbook: wb, filename };
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename);
}
