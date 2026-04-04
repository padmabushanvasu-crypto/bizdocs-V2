import * as XLSX from "xlsx-js-style";
import { INDIAN_STATES, validateGSTIN } from "@/lib/indian-states";

// ── Types ──
export interface ImportColumn {
  key: string;
  label: string;
  description: string;
  required: boolean;
  example: string;
  validate?: (value: string, row: Record<string, string>) => { valid: boolean; warning?: string; error?: string };
}

export interface ImportConfig {
  type: string;
  label: string;
  columns: ImportColumn[];
}

export interface ValidatedRow {
  data: Record<string, string>;
  status: "valid" | "warning" | "error";
  messages: string[];
}

export interface SkipReason {
  row: number;    // 1-based Excel row number
  value: string;  // primary key value (or blank)
  reason: string; // human-readable reason
}

// ── Styling constants ──
const HEADER_STYLE: XLSX.CellStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "2D3282" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    bottom: { style: "thin", color: { rgb: "1A1F5C" } },
  },
};

const DESC_STYLE: XLSX.CellStyle = {
  font: { italic: true, color: { rgb: "666666" }, sz: 9 },
  fill: { fgColor: { rgb: "F3F4F6" } },
  alignment: { wrapText: true, vertical: "top" },
};

const EXAMPLE_STYLE: XLSX.CellStyle = {
  fill: { fgColor: { rgb: "DBEAFE" } },
  font: { color: { rgb: "1E40AF" }, sz: 10 },
};

// ── Dropdown definitions per column key ──
const DROPDOWN_OPTIONS: Record<string, string[]> = {
  party_type: ["vendor", "customer", "both"],
  state: INDIAN_STATES.map((s) => s.name),
  gst_rate: ["0", "5", "12", "18", "28"],
  item_type: ["raw_material", "component", "sub_assembly", "bought_out", "finished_good", "consumable", "service"],
  unit: ["NOS", "KG", "MTR", "SFT", "SET", "ROLL", "LTR", "PKT", "BOX"],
};

const STATUS_DROPDOWNS: Record<string, string[]> = {
  purchase_orders: ["draft", "issued", "partially_received", "fully_received", "closed", "cancelled"],
  delivery_challans: ["draft", "issued", "partially_returned", "fully_returned", "closed", "cancelled"],
  invoices: ["draft", "issued", "paid", "partially_paid", "cancelled"],
};

// ── Notes sheet content per config type ──
function getNotesContent(config: ImportConfig): string[][] {
  const mandatoryCols = config.columns.filter((c) => c.required).map((c) => c.label);
  const optionalCols = config.columns.filter((c) => !c.required).map((c) => c.label);

  return [
    ["📋 How to use this Import Template"],
    [""],
    ["STEP 1:", "Fill in your data starting from Row 3 (after the description row)."],
    ["STEP 2:", "Delete the example rows (Rows 3-5) — they are samples only."],
    ["STEP 3:", "Save this file as .xlsx format."],
    ["STEP 4:", `Go to BizDocs → ${config.label} page → click "Import" button.`],
    ["STEP 5:", "Upload this file and review the preview before importing."],
    [""],
    ["📌 MANDATORY COLUMNS (must not be empty):"],
    ...mandatoryCols.map((c) => ["  •", c]),
    [""],
    ["📝 OPTIONAL COLUMNS (leave blank if not applicable):"],
    ...optionalCols.map((c) => ["  •", c]),
    [""],
    ["⚠️ SPECIAL CASES:"],
    ["  •", "GSTIN: Must be exactly 15 characters in standard format (e.g., 29AABCT1332L1ZX)"],
    ["  •", "State: Must match a valid Indian state name exactly (use the dropdown in the data sheet)"],
    ["  •", "PIN Code: Must be exactly 6 digits"],
    ["  •", "Phone: Must be exactly 10 digits (no country code)"],
    ["  •", "Dates: Use YYYY-MM-DD format (e.g., 2025-01-15)"],
    ["  •", "GST Rate: Must be one of 0, 5, 12, 18, or 28"],
    [""],
    ["🔄 IMPORTING BACK INTO BIZDOCS:"],
    ["  1.", "Do NOT change the column headers in Row 1."],
    ["  2.", "Do NOT add extra columns — they will be ignored."],
    ["  3.", "Rows with errors (red) will be skipped during import."],
    ["  4.", "Rows with warnings (amber) will be imported but may need manual review."],
    ["  5.", "After import, you can download an Error Report for any failed rows."],
    [""],
    ...(config.type.includes("purchase_orders") || config.type.includes("delivery_challans") || config.type.includes("invoices")
      ? [
          ["🏢 OPENING DATA IMPORT NOTES:"] as string[],
          ["  •", "Import your Parties and Items FIRST before importing documents."],
          ["  •", "Vendor/Customer/Party names must match existing parties in BizDocs."],
          ["  •", "Document numbers must be unique — duplicates will be skipped."],
          ["  •", "Imported records are marked as 'Imported from Excel' for reference."],
          [""] as string[],
        ]
      : []),
  ];
}

// ── Template generation ──
export function generateTemplate(config: ImportConfig): void {
  const wb = XLSX.utils.book_new();
  const headers = config.columns.map((c) => c.label);
  const reqMarkers = config.columns.map((c) => (c.required ? `${c.description} (REQUIRED)` : c.description));
  const examples: string[][] = [];
  for (let i = 0; i < 3; i++) {
    examples.push(config.columns.map((c) => c.example));
  }

  const wsData = [headers, reqMarkers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colCount = config.columns.length;

  // Apply header styles (Row 1)
  for (let c = 0; c < colCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = HEADER_STYLE;
  }

  // Apply description styles (Row 2)
  for (let c = 0; c < colCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: 1, c });
    if (ws[ref]) ws[ref].s = DESC_STYLE;
  }

  // Apply example styles (Rows 3-5)
  for (let r = 2; r < 5; r++) {
    for (let c = 0; c < colCount; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) ws[ref].s = EXAMPLE_STYLE;
    }
  }

  // Column widths
  ws["!cols"] = config.columns.map((col) => ({
    wch: Math.max(col.label.length + 4, col.description.length + 4, 18),
  }));

  // Row heights
  ws["!rows"] = [{ hpt: 24 }, { hpt: 32 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }];

  // Data validation dropdowns (rows 3-1000 for future data)
  if (!ws["!dataValidation"]) ws["!dataValidation"] = [];

  config.columns.forEach((col, idx) => {
    const colLetter = XLSX.utils.encode_col(idx);
    let options: string[] | undefined;

    // Check direct key match
    if (col.key === "party_type") options = DROPDOWN_OPTIONS.party_type;
    else if (col.key === "state") options = DROPDOWN_OPTIONS.state;
    else if (col.key === "gst_rate" || col.label.includes("GST Rate")) options = DROPDOWN_OPTIONS.gst_rate;
    else if (col.key === "item_type") options = DROPDOWN_OPTIONS.item_type;
    else if (col.key === "unit" || col.label.includes("Unit")) options = DROPDOWN_OPTIONS.unit;
    else if (col.key === "status") options = STATUS_DROPDOWNS[config.type];

    if (options) {
      ws["!dataValidation"].push({
        sqref: `${colLetter}3:${colLetter}1000`,
        type: "list",
        operator: "equal",
        formula1: `"${options.join(",")}"`,
        showDropDown: true,
        showErrorMessage: true,
        errorTitle: "Invalid Value",
        error: `Please select from: ${options.slice(0, 5).join(", ")}${options.length > 5 ? "..." : ""}`,
      });
    }
  });

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, config.label);

  // Add Notes sheet
  const notesData = getNotesContent(config);
  const notesWs = XLSX.utils.aoa_to_sheet(notesData);

  // Style Notes header
  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (notesWs[titleRef]) {
    notesWs[titleRef].s = {
      font: { bold: true, sz: 14, color: { rgb: "2D3282" } },
    };
  }

  // Style section headers
  for (let r = 0; r < notesData.length; r++) {
    const cellVal = notesData[r][0];
    if (cellVal && (cellVal.startsWith("📌") || cellVal.startsWith("📝") || cellVal.startsWith("⚠️") || cellVal.startsWith("🔄") || cellVal.startsWith("🏢"))) {
      const ref = XLSX.utils.encode_cell({ r, c: 0 });
      if (notesWs[ref]) {
        notesWs[ref].s = { font: { bold: true, sz: 11, color: { rgb: "2D3282" } } };
      }
    }
    if (cellVal && cellVal.startsWith("STEP")) {
      const ref = XLSX.utils.encode_cell({ r, c: 0 });
      if (notesWs[ref]) {
        notesWs[ref].s = { font: { bold: true, sz: 10 } };
      }
    }
  }

  notesWs["!cols"] = [{ wch: 10 }, { wch: 70 }];

  XLSX.utils.book_append_sheet(wb, notesWs, "Notes");

  XLSX.writeFile(wb, `${config.type}_import_template.xlsx`);
}

// ── File parsing ──
export function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { header: "A", defval: "" });

        if (json.length < 3) {
          reject(new Error("File appears empty or only has headers."));
          return;
        }

        // Row 1 = headers, Row 2 = descriptions (skip), Row 3+ = data
        const headerRow = json[0];
        const headerKeys = Object.values(headerRow).map((v) => String(v).trim());

        const rows: Record<string, string>[] = [];
        for (let i = 2; i < json.length; i++) {
          const row = json[i];
          const mapped: Record<string, string> = {};
          let hasData = false;
          Object.keys(row).forEach((cellKey, idx) => {
            const header = headerKeys[idx];
            if (header) {
              const val = String(row[cellKey] ?? "").trim();
              mapped[header] = val;
              if (val) hasData = true;
            }
          });
          if (hasData) rows.push(mapped);
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ── Validation ──
export function validateRows(rows: Record<string, string>[], config: ImportConfig): ValidatedRow[] {
  return rows.map((row) => {
    const messages: string[] = [];
    let status: "valid" | "warning" | "error" = "valid";

    for (const col of config.columns) {
      const value = row[col.label] ?? "";

      if (col.required && !value) {
        messages.push(`${col.label} is required`);
        status = "error";
        continue;
      }

      if (col.validate && value) {
        const result = col.validate(value, row);
        if (result.error) {
          messages.push(result.error);
          status = "error";
        } else if (result.warning && status !== "error") {
          messages.push(result.warning);
          status = "warning";
        }
      }
    }

    return { data: row, status, messages };
  });
}

// ── Error report ──
export function generateErrorReport(rows: ValidatedRow[], config: ImportConfig): void {
  const wb = XLSX.utils.book_new();
  const errorRows = rows.filter((r) => r.status === "error");
  const headers = [...config.columns.map((c) => c.label), "Errors"];
  const data = errorRows.map((r) => [
    ...config.columns.map((c) => r.data[c.label] || ""),
    r.messages.join("; "),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  XLSX.writeFile(wb, `${config.type}_import_errors.xlsx`);
}

// ── Shared validators ──
export const validators = {
  gstin: (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    const result = validateGSTIN(value);
    return result.valid ? { valid: true } : { valid: false, error: `Invalid GSTIN: ${value}` };
  },
  pin: (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    return /^\d{6}$/.test(value) ? { valid: true } : { valid: false, error: `PIN must be 6 digits` };
  },
  phone: (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    const digits = value.replace(/\D/g, "");
    return digits.length === 10 ? { valid: true } : { valid: false, error: `Phone must be 10 digits` };
  },
  state: (value: string): { valid: boolean; warning?: string } => {
    if (!value) return { valid: true };
    const found = INDIAN_STATES.find((s) => s.name.toLowerCase() === value.toLowerCase());
    return found ? { valid: true } : { valid: true, warning: `State "${value}" not recognized` };
  },
  positiveNumber: (label: string) => (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    const n = parseFloat(value);
    return !isNaN(n) && n >= 0 ? { valid: true } : { valid: false, error: `${label} must be a positive number` };
  },
  gstRate: (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    const n = parseFloat(value);
    return [0, 5, 12, 18, 28].includes(n) ? { valid: true } : { valid: false, error: `GST rate must be 0, 5, 12, 18, or 28` };
  },
  partyType: (value: string): { valid: boolean; error?: string } => {
    if (!value) return { valid: true };
    return ["vendor", "customer", "both"].includes(value.toLowerCase())
      ? { valid: true }
      : { valid: false, error: `Party Type must be vendor, customer, or both` };
  },
};

// ── Import configs ──
export const PARTIES_IMPORT_CONFIG: ImportConfig = {
  type: "parties",
  label: "Parties",
  columns: [
    { key: "party_type", label: "Party Type", description: "vendor / customer / both", required: true, example: "vendor", validate: (v) => validators.partyType(v) },
    { key: "name", label: "Company Name", description: "Full legal name", required: true, example: "Sample Enterprises" },
    { key: "contact_person", label: "Contact Person", description: "Name of contact", required: false, example: "John Doe" },
    { key: "address_line1", label: "Address Line 1", description: "Street address", required: false, example: "123, Example Road" },
    { key: "address_line2", label: "Address Line 2", description: "Area/locality", required: false, example: "Sample Nagar" },
    { key: "address_line3", label: "Address Line 3", description: "Additional address", required: false, example: "" },
    { key: "city", label: "City", description: "City name", required: false, example: "Mumbai" },
    { key: "state", label: "State", description: "Full state name", required: false, example: "Maharashtra", validate: (v) => validators.state(v) },
    { key: "pin_code", label: "PIN Code", description: "6-digit PIN", required: false, example: "400001", validate: (v) => validators.pin(v) },
    { key: "phone1", label: "Phone 1", description: "Primary phone", required: false, example: "9800000000", validate: (v) => validators.phone(v) },
    { key: "phone2", label: "Phone 2", description: "Secondary phone", required: false, example: "" },
    { key: "email1", label: "Email", description: "Email address", required: false, example: "contact@example.com" },
    { key: "gstin", label: "GSTIN", description: "15-char GST number", required: false, example: "29AABCT1332L1ZX", validate: (v) => validators.gstin(v) },
    { key: "pan", label: "PAN", description: "PAN number", required: false, example: "AABCT1332L" },
    { key: "payment_terms", label: "Payment Terms", description: "Standard terms", required: false, example: "30 Days" },
    { key: "credit_limit", label: "Credit Limit", description: "₹ amount", required: false, example: "100000", validate: (v) => validators.positiveNumber("Credit Limit")(v) },
    { key: "notes", label: "Notes", description: "Internal notes", required: false, example: "Reliable vendor" },
  ],
};

export const ITEMS_IMPORT_CONFIG: ImportConfig = {
  type: "items",
  label: "Items",
  columns: [
    { key: "item_code", label: "Item Code", description: "Your internal code", required: false, example: "230082" },
    { key: "drawing_number", label: "Drawing Number", description: "Engineering drawing ref", required: false, example: "230082-R1" },
    { key: "description", label: "Description", description: "Item description", required: true, example: "Bearing Housing ASGB" },
    { key: "item_type", label: "Item Type", description: "raw_material/finished_good/service/consumable", required: false, example: "raw_material" },
    { key: "unit", label: "Default Unit", description: "NOS/KG/MTR/SFT/SET/ROLL etc", required: false, example: "NOS" },
    { key: "purchase_price", label: "Default Purchase Price", description: "₹ amount", required: false, example: "450", validate: (v) => validators.positiveNumber("Purchase Price")(v) },
    { key: "sale_price", label: "Default Sale Price", description: "₹ amount", required: false, example: "650", validate: (v) => validators.positiveNumber("Sale Price")(v) },
    { key: "gst_rate", label: "Default GST Rate", description: "0/5/12/18/28", required: false, example: "18", validate: (v) => validators.gstRate(v) },
    { key: "hsn_sac_code", label: "HSN/SAC Code", description: "HSN or SAC code", required: false, example: "8483" },
    { key: "notes", label: "Notes", description: "Any notes", required: false, example: "" },
  ],
};

export const PO_IMPORT_CONFIG: ImportConfig = {
  type: "purchase_orders",
  label: "Purchase Orders",
  columns: [
    { key: "po_number", label: "PO Number", description: "Unique PO number", required: true, example: "24-25/001" },
    { key: "po_date", label: "PO Date", description: "YYYY-MM-DD", required: true, example: "2025-01-15" },
    { key: "vendor_name", label: "Vendor Name", description: "Must match existing party", required: true, example: "SS Engineering" },
    { key: "description", label: "Description", description: "Item description", required: true, example: "Bearing Housing" },
    { key: "drawing_number", label: "Drawing No", description: "Drawing reference", required: false, example: "230082-R1" },
    { key: "quantity", label: "Qty", description: "Quantity", required: true, example: "100", validate: (v) => validators.positiveNumber("Qty")(v) },
    { key: "unit", label: "Unit", description: "NOS/KG/MTR etc", required: false, example: "NOS" },
    { key: "unit_price", label: "Unit Price", description: "₹ per unit", required: true, example: "450", validate: (v) => validators.positiveNumber("Unit Price")(v) },
    { key: "delivery_date", label: "Delivery Date", description: "YYYY-MM-DD", required: false, example: "2025-02-15" },
    { key: "status", label: "Status", description: "draft/issued/partially_received/fully_received/closed/cancelled", required: false, example: "issued" },
    { key: "notes", label: "Notes", description: "Internal remarks", required: false, example: "" },
  ],
};

export const DC_IMPORT_CONFIG: ImportConfig = {
  type: "delivery_challans",
  label: "Delivery Challans",
  columns: [
    { key: "dc_number", label: "DC Number", description: "Unique DC number", required: true, example: "DC-24-25/001" },
    { key: "dc_date", label: "DC Date", description: "YYYY-MM-DD", required: true, example: "2025-01-15" },
    { key: "party_name", label: "Party Name", description: "Must match existing party", required: true, example: "SS Engineering" },
    { key: "description", label: "Description", description: "Item description", required: true, example: "Gear Box Shaft" },
    { key: "drawing_number", label: "Drawing No", description: "Drawing reference", required: false, example: "GB-001" },
    { key: "qty_nos", label: "Qty Sent", description: "Quantity sent", required: true, example: "50", validate: (v) => validators.positiveNumber("Qty Sent")(v) },
    { key: "returned_qty_nos", label: "Qty Returned", description: "Quantity returned", required: false, example: "20", validate: (v) => validators.positiveNumber("Qty Returned")(v) },
    { key: "nature_of_process", label: "Nature of Process", description: "Type of job work", required: false, example: "Heat Treatment" },
    { key: "return_due_date", label: "Return Due Date", description: "YYYY-MM-DD", required: false, example: "2025-03-15" },
    { key: "status", label: "Status", description: "draft/issued/partially_returned/fully_returned/closed/cancelled", required: false, example: "issued" },
  ],
};

export const INVOICE_IMPORT_CONFIG: ImportConfig = {
  type: "invoices",
  label: "Invoices",
  columns: [
    { key: "invoice_number", label: "Invoice Number", description: "Unique invoice number", required: true, example: "INV-24-25/001" },
    { key: "invoice_date", label: "Invoice Date", description: "YYYY-MM-DD", required: true, example: "2025-01-15" },
    { key: "customer_name", label: "Customer Name", description: "Must match existing party", required: true, example: "ABC Industries" },
    { key: "description", label: "Description", description: "Item description", required: true, example: "Bearing Housing" },
    { key: "hsn_sac_code", label: "HSN Code", description: "HSN/SAC code", required: false, example: "8483" },
    { key: "quantity", label: "Qty", description: "Quantity", required: true, example: "100", validate: (v) => validators.positiveNumber("Qty")(v) },
    { key: "unit", label: "Unit", description: "NOS/KG etc", required: false, example: "NOS" },
    { key: "unit_price", label: "Unit Price", description: "₹ per unit", required: true, example: "650", validate: (v) => validators.positiveNumber("Unit Price")(v) },
    { key: "gst_rate", label: "GST Rate", description: "0/5/12/18/28", required: false, example: "18", validate: (v) => validators.gstRate(v) },
    { key: "amount_paid", label: "Amount Paid", description: "₹ paid so far", required: false, example: "0", validate: (v) => validators.positiveNumber("Amount Paid")(v) },
    { key: "status", label: "Status", description: "draft/issued/paid/partially_paid/cancelled", required: false, example: "issued" },
  ],
};

// ── Flexible column matching ────────────────────────────────────────────────

// Shared normaliser used by both resolveColumns and the smart header detector
export function normaliseHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\*/g, "")          // remove asterisks
    .replace(/₹/g, "")           // remove rupee symbol
    .replace(/\(.*?\)/g, "")     // remove parenthetical content
    .replace(/[^a-z0-9\s]/g, " ") // replace remaining non-alphanumeric with space
    .replace(/\s+/g, " ")        // collapse multiple spaces
    .trim();
}

export function resolveColumns(
  headers: string[],
  fieldMap: Record<string, string[]>
): Record<string, number> {
  const result: Record<string, number> = {};
  const normHeaders = headers.map(normaliseHeader);
  for (const [field, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      const normAlias = normaliseHeader(alias);
      // Pass 1: exact match only — avoids short aliases like "state" matching
      // "state code" before the exact "state" header is found
      let idx = normHeaders.findIndex((h) => h === normAlias);
      // Pass 2: fuzzy match (only if no exact match found)
      if (idx === -1) {
        idx = normHeaders.findIndex((h) => {
          // header contains alias (e.g. "drawing revision 2" contains "drawing revision")
          if (normAlias.length >= 4 && h.includes(normAlias)) return true;
          // alias contains header — only allow when header is 6+ chars to avoid
          // short words like "unit", "code", "name" falsely matching longer aliases
          if (normAlias.length >= 4 && normAlias.includes(h) && h.length >= 6) return true;
          return false;
        });
      }
      if (idx !== -1) { result[field] = idx; break; }
    }
  }
  return result;
}

export function extractRow(
  rawRow: Record<string, string>,
  headers: string[],
  colMap: Record<string, number>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, idx] of Object.entries(colMap)) {
    result[field] = String(rawRow[headers[idx]] ?? "").trim();
  }
  return result;
}

export interface ColumnMappingSummary {
  found: Array<{ originalHeader: string; field: string }>;
  missingRequired: string[];
  missingOptional: string[];
}

export function buildMappingSummary(
  headers: string[],
  colMap: Record<string, number>,
  fieldMap: Record<string, string[]>,
  requiredFields: string[]
): ColumnMappingSummary {
  const found = Object.entries(colMap).map(([field, idx]) => ({
    originalHeader: headers[idx],
    field,
  }));
  const mappedFields = new Set(Object.keys(colMap));
  const allFields = Object.keys(fieldMap);
  const missing = allFields.filter((f) => !mappedFields.has(f));
  const reqSet = new Set(requiredFields);
  return {
    found,
    missingRequired: missing.filter((f) => reqSet.has(f)),
    missingOptional: missing.filter((f) => !reqSet.has(f)),
  };
}

export function normalizePartyType(raw: string): string {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (["vendor", "supplier", "vend", "sup", "seller", "v", "s"].includes(v)) return "vendor";
  if (["customer", "client", "buyer", "cust", "c"].includes(v)) return "customer";
  if (["both", "b", "vc", "cv", "vendorcustomer", "customervendor"].includes(v)) return "both";
  return "vendor";
}

export function normalizeUnit(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["NOS", "NO", "NR", "PCS", "PC", "PIECES", "PIECE", "NUMBERS", "NUMBER", "EA", "EACH", "UNIT", "UNITS", "UN", "NUM"].includes(v)) return "NOS";
  if (["KGS", "KG", "KILO", "KILOS", "KILOGRAM", "KILOGRAMS", "KGM"].includes(v)) return "KGS";
  if (["MTR", "M", "MT", "METER", "METERS", "METRE", "METRES", "RM", "RMT", "RMR"].includes(v)) return "MTR";
  if (["SFT", "SF", "SQFT", "SQFEET", "SQUAREFEET", "SQUAREFOOT"].includes(v)) return "SFT";
  if (["SET", "SETS"].includes(v)) return "SET";
  if (["LTR", "L", "LT", "LITRE", "LITRES", "LITER", "LITERS", "LTS"].includes(v)) return "LTR";
  if (["BOX", "BOXES", "BX", "PKT", "PACKET", "PACKETS"].includes(v)) return "BOX";
  if (["ROLL", "ROLLS", "RL", "RLL"].includes(v)) return "ROLL";
  if (["SHEET", "SHEETS", "SH", "SHT"].includes(v)) return "SHEET";
  if (["COIL", "COILS", "CL"].includes(v)) return "COIL";
  if (["PAIR", "PAIRS", "PR"].includes(v)) return "PAIR";
  if (["LOT", "LOTS"].includes(v)) return "LOT";
  return raw.trim().toUpperCase() || "NOS";
}

const VALID_ITEM_TYPES = [
  "raw_material", "component", "sub_assembly", "bought_out",
  "finished_good", "product", "consumable", "service",
];

export function normalizeItemType(raw: string): string {
  // Guard: hint/instruction values like "raw_material / component / sub_assembly ..."
  if (/ \/ /.test(raw) || raw.split("/").length - 1 > 1) return "component";
  // Strip to lowercase alphanumeric only, then match against all known aliases
  const v = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["rawmaterial", "rawmat", "rmat", "rm"].includes(v)) return "raw_material";
  if (["component", "comp", "cmp"].includes(v)) return "component";
  if (["subassembly", "subassy", "subasm", "sa"].includes(v)) return "sub_assembly";
  if (["boughtout", "boughtoutpart", "bop", "bo"].includes(v)) return "bought_out";
  if (["finishedgood", "finishedgoods", "finishedproduct", "finprod", "fg", "fp"].includes(v)) return "finished_good";
  if (["product", "prod", "prd"].includes(v)) return "product";
  if (["consumable", "consum", "cons"].includes(v)) return "consumable";
  if (["service", "svc", "srv", "jobwork", "jw"].includes(v)) return "service";
  // Fallback: convert to underscore form rather than silently substituting
  const withUnderscores = raw.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return withUnderscores || "component";
}

export const PARTY_FIELD_MAP: Record<string, string[]> = {
  name: ["party name", "company name", "name", "vendor name", "customer name", "supplier name", "ledger name", "account name", "party", "firm name", "trade name"],
  party_type: ["party type", "type", "vendor customer", "account type", "ledger type"],
  contact_person: ["contact person", "contact", "contact name", "person name", "representative"],
  address_line1: ["address line 1", "address 1", "address", "street address", "mailing address", "registered address", "address line1"],
  address_line2: ["address line 2", "address 2", "address line2"],
  address_line3: ["address line 3", "address 3", "address line3"],
  city: ["city", "town", "district"],
  state: ["state", "state name", "state of supply"],
  pin_code: ["pin code", "pin", "pincode", "postal code", "zip code", "zip"],
  phone1: ["phone 1", "phone", "phone1", "mobile", "mobile number", "contact number", "telephone", "cell"],
  phone2: ["phone 2", "phone2", "alternate phone", "alternate mobile"],
  email1: ["email", "email 1", "email1", "email address", "email id"],
  gstin: ["gstin", "gst number", "gst no", "gst in", "gst registration no", "gstin no", "gst reg no"],
  pan: ["pan", "pan number", "pan no"],
  payment_terms: ["payment terms", "terms", "credit days", "payment days"],
  state_code: ["state code"],
  credit_limit: ["credit limit", "credit", "credit amount"],
  notes: ["notes", "remarks", "comments", "description"],
};

export const ITEM_FIELD_MAP: Record<string, string[]> = {
  drawing_revision: ["drawing revision", "drawing number", "drawing no", "dwg no", "dwg number", "dwg rev", "drawing rev", "revision", "drg no", "drg number"],
  item_code: ["item code", "code", "sku", "part number", "part no"],
  description: ["description", "item name", "name", "part description", "item description"],
  item_type: ["item type", "type", "category"],
  unit: ["unit", "uom", "unit of measure", "default unit"],
  hsn_sac_code: ["hsn sac code", "hsnsac", "hsn", "sac", "hsn code", "sac code"],
  gst_rate: ["gst rate %", "gst rate", "tax rate"],
  min_stock: ["min stock", "minimum stock", "min stock level", "reorder level", "minimum qty"],
  is_critical: ["is critical", "critical", "critical item", "critical component"],
  notes: ["notes", "remarks", "comments"],
  drawing_number: ["drawing number (alt)", "alt drawing", "drawing ref"],
  standard_cost: ["standard cost", "std cost"],
  purchase_price: ["default purchase price", "purchase price", "buy price"],
  sale_price: ["default sale price", "sale price", "selling price"],
};

export const BOM_FIELD_MAP: Record<string, string[]> = {
  finished_item_code: ["finished item code", "parent item code", "parent code", "finished item", "parent item", "finished good code", "assembly code", "finished code", "fg code", "parent"],
  finished_item_drawing: ["finished drawing", "parent drawing", "parent drawing no", "finished drawing no", "parent drg"],
  component_code: ["component code", "child item code", "child code", "child item", "component", "material code", "sub item code", "component item code", "part code"],
  component_drawing: ["component drawing", "child drawing", "child drawing no", "component drawing no", "child drg"],
  quantity: ["quantity per unit", "quantity", "qty", "quantity required", "bom qty", "qty per unit", "qty per", "required qty", "component qty"],
  unit: ["unit", "uom", "unit of measure"],
  scrap_factor: ["scrap factor %", "scrap factor", "scrap %", "waste %", "scrap"],
  is_critical: ["is critical", "critical", "critical component", "critical flag"],
  variant_name: ["variant name", "variant", "bom variant"],
  notes: ["notes", "remarks"],
  vendor1_code: ["vendor 1 code", "vendor1 code", "preferred vendor", "vendor code"],
  vendor1_process: ["vendor 1 process", "process 1", "nature of process"],
  vendor1_lead_days: ["vendor 1 lead days", "lead days", "lead time"],
  vendor2_code: ["vendor 2 code", "vendor2 code"],
  vendor2_process: ["vendor 2 process", "process 2"],
  vendor2_lead_days: ["vendor 2 lead days"],
  vendor3_code: ["vendor 3 code", "vendor3 code"],
  vendor3_process: ["vendor 3 process", "process 3"],
  vendor3_lead_days: ["vendor 3 lead days"],
};

export const VENDOR_SHEET_FIELD_MAP: Record<string, string[]> = {
  component_code: ["component code", "child item code", "component", "part code"],
  vendor_code: ["vendor code", "vendor", "party code", "vendor party code"],
  process_name: ["process name", "process", "nature of process", "job work process"],
  lead_time_days: ["lead time days", "lead time", "lead days", "turnaround days"],
  preference_order: ["preference order", "preference", "priority", "rank", "order"],
  notes: ["notes", "remarks"],
};

export const STOCK_FIELD_MAP: Record<string, string[]> = {
  drawing_revision: ["drawing revision", "drawing number", "drawing no", "dwg no", "dwg number", "dwg rev", "drg no"],
  item_code: ["item code", "code", "sku", "part number", "part no"],
  current_stock: ["opening stock qty", "opening stock / current stock", "opening stock", "current stock", "stock qty", "opening qty"],
  unit: ["unit", "uom", "unit of measure"],
  standard_cost: ["cost per unit ₹", "cost per unit", "cost/unit", "standard cost", "unit cost"],
  stock_bucket: ["stock bucket", "bucket", "stock type"],
  notes: ["notes", "remarks"],
};

export const REORDER_FIELD_MAP: Record<string, string[]> = {
  drawing_revision: ["drawing revision", "drawing number", "drawing no", "dwg no", "dwg number", "dwg rev", "drg no"],
  item_code: ["item code", "code", "sku", "part number"],
  reorder_point: ["reorder point", "minimum stock", "min stock", "reorder level", "reorder trigger", "minimum level"],
  reorder_qty: ["reorder quantity", "reorder qty", "order quantity", "order qty", "quantity to order"],
  lead_time_days: ["lead time days", "lead time", "lead days", "delivery days", "vendor lead time"],
  preferred_vendor_code: ["preferred vendor code", "vendor code", "vendor", "preferred vendor"],
  notes: ["notes", "remarks"],
};

// ── Human-readable field display names ──────────────────────────────────────

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  name: "Party Name",
  party_type: "Party Type",
  state_code: "State Code",
  state: "State",
  city: "City",
  pin_code: "PIN Code",
  phone1: "Phone 1",
  phone2: "Phone 2",
  email1: "Email",
  gstin: "GSTIN",
  pan: "PAN",
  payment_terms: "Payment Terms",
  credit_limit: "Credit Limit",
  contact_person: "Contact Person",
  address_line1: "Address Line 1",
  address_line2: "Address Line 2",
  notes: "Notes",
  item_code: "Item Code",
  description: "Description",
  item_type: "Item Type",
  unit: "Unit",
  hsn_sac_code: "HSN/SAC Code",
  gst_rate: "GST Rate",
  min_stock: "Min Stock",
  drawing_revision: "Drawing Number",
  drawing_number: "Drawing Number (Alt)",
  standard_cost: "Standard Cost",
  finished_item_drawing: "Finished Item Drawing",
  component_drawing: "Component Drawing",
  purchase_price: "Purchase Price",
  sale_price: "Sale Price",
  finished_item_code: "Finished Item Code",
  component_code: "Component Code",
  quantity: "Quantity",
  scrap_factor: "Scrap Factor %",
  is_critical: "Is Critical",
  variant_name: "Variant Name",
  current_stock: "Opening Stock / Current Stock",
  stock_bucket: "Stock Bucket",
  reorder_point: "Reorder Point",
  reorder_qty: "Reorder Quantity",
  lead_time_days: "Lead Time Days",
  preferred_vendor_code: "Preferred Vendor Code",
};

export function fieldDisplayName(field: string): string {
  return (
    FIELD_DISPLAY_NAMES[field] ??
    field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

// ── Smart Excel parser (shared — used by DataImport and BackgroundImportDialog) ──

export function isHintRow(primaryCell: string): boolean {
  const lower = primaryCell.toLowerCase().trim();
  if (!lower) return false;
  const HINT_PHRASES = [
    "e.g.", "example", "required", "optional", "code of", "full ",
    "company legal", "vendor / customer", "raw_material /", "drawing number or",
    "enter", "fill",
  ];
  if (lower.length > 80) return true;
  if (/ \/ /.test(primaryCell)) return true;
  if (HINT_PHRASES.some((p) => lower.includes(p))) return true;
  return false;
}

export async function parseExcelSmart(
  file: File,
  fieldMap: Record<string, string[]>
): Promise<{ rows: Record<string, string>[]; rowNums: number[]; skipped: SkipReason[] }> {
  const buffer = await file.arrayBuffer();
  const wb = (XLSX as any).read(new Uint8Array(buffer), { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = (XLSX as any).utils.sheet_to_json(ws, {
    header: 1, defval: "", raw: false,
  }) as string[][];

  if (allRows.length === 0) return { rows: [], rowNums: [], skipped: [] };

  const allAliases = Object.values(fieldMap).flat().map(normaliseHeader).filter((a) => a.length >= 3);

  const scanLimit = Math.min(10, allRows.length);
  let headerRowIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    let score = 0;
    for (const cell of allRows[i]) {
      const norm = normaliseHeader(String(cell));
      if (norm.length < 2) continue;
      if (allAliases.some((a) => norm === a || norm.includes(a) || a.includes(norm))) score++;
    }
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
  }

  const headers = allRows[headerRowIdx].map((c) => String(c).trim());
  const colMap = resolveColumns(headers, fieldMap);
  const primaryKeyColIdx = Object.keys(colMap).length > 0 ? Object.values(colMap)[0] : 0;

  const SKIP_PHRASES = [
    "required field", "example data", "how to use", "instructions",
    "sample only", "do not change", "delete this row",
  ];

  const rows: Record<string, string>[] = [];
  const rowNums: number[] = [];
  const skipped: SkipReason[] = [];

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const excelRowNum = i + 1;
    const positionAfterHeader = i - headerRowIdx - 1;
    const primaryCell = String(row[primaryKeyColIdx] ?? "").trim();

    const rowText = row.map((c) => String(c)).join(" ").toLowerCase();
    if (SKIP_PHRASES.some((p) => rowText.includes(p))) {
      skipped.push({ row: excelRowNum, value: primaryCell, reason: "Example data row — skipped automatically" });
      continue;
    }

    if (positionAfterHeader < 5) {
      const anyCellIsHint =
        isHintRow(primaryCell) ||
        row.some((c) => {
          const s = String(c).trim();
          return / \/ /.test(s) || s.split("/").length - 1 > 2;
        });
      if (anyCellIsHint) {
        skipped.push({ row: excelRowNum, value: primaryCell, reason: "Instruction row — skipped automatically" });
        continue;
      }
    }

    const mapped: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, idx) => {
      const val = String(row[idx] ?? "").trim();
      if (header) {
        mapped[header] = val;
        if (val) hasData = true;
      }
    });
    if (hasData) {
      rows.push(mapped);
      rowNums.push(excelRowNum);
    }
  }

  return { rows, rowNums, skipped };
}

// ── Field maps for Jig Master, Mould Items, and Processing Routes ─────────────

export const JIG_FIELD_MAP: Record<string, string[]> = {
  drawing_number: ["drawing number", "drawing no", "drg no", "part number", "item code", "drawing"],
  jig_number: ["jig number", "jig no", "jig id", "tool number", "jig", "fixture number"],
  status: ["status", "jig status", "condition"],
  associated_process: ["associated process", "process", "operation"],
  notes: ["notes", "remarks", "comments"],
};

export const MOULD_FIELD_MAP: Record<string, string[]> = {
  drawing_number: ["drawing number", "drawing no", "drg no", "part number", "item code", "drawing"],
  drawing_revision: ["drawing revision", "revision", "rev", "drawing rev"],
  description: ["description", "item name", "name", "item description", "mould description"],
  vendor_name: ["vendor name", "vendor", "supplier", "supplier name", "manufacturer"],
  notes: ["notes", "remarks", "comments"],
  alert_message: ["alert message", "alert", "message", "warning"],
};

export const PROCESSING_ROUTES_FIELD_MAP: Record<string, string[]> = {
  drawing_number: ["drawing number", "drawing no", "drg no", "part number", "item code", "drawing"],
  stage_number: ["stage no", "stage number", "stage", "seq no", "sequence", "step no", "step number", "operation no"],
  process_name: ["process name", "process", "operation name", "operation", "activity"],
  process_code: ["process code", "code", "op code", "operation code"],
  stage_type: ["stage type", "type", "internal external", "process type"],
  lead_time_days: ["lead time days", "lead time", "lead days", "turnaround days", "days"],
  vendor_1: ["vendor 1", "vendor1", "primary vendor", "preferred vendor", "vendor"],
  vendor_2: ["vendor 2", "vendor2", "secondary vendor", "alternate vendor"],
  notes: ["notes", "remarks", "comments"],
};
