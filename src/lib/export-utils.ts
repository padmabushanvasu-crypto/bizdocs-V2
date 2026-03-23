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
  type?: "text" | "date" | "currency" | "number";
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
  job_work: "Job Work",
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

export const ITEMS_EXPORT_COLS: ExportColumn[] = [
  { key: "item_code", label: "Item Code" },
  { key: "drawing_number", label: "Drawing Number" },
  { key: "description", label: "Description", width: 30 },
  { key: "item_type", label: "Item Type" },
  { key: "unit", label: "Default Unit" },
  { key: "purchase_price", label: "Purchase Price", type: "currency" },
  { key: "sale_price", label: "Sale Price", type: "currency" },
  { key: "gst_rate", label: "GST Rate", type: "number" },
  { key: "hsn_sac_code", label: "HSN/SAC Code" },
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
