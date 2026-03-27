// Centralised GST calculation utilities for Indian SME documents
// All monetary values must pass through round2() to avoid floating-point errors.

export type GSTType = 'igst' | 'cgst_sgst' | 'exempt';

/** GST state code → display name map (all 38 Indian states/UTs). */
export const INDIA_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Other Country",
};

/** Extract the 2-digit state code from the first two digits of a GSTIN. */
export function extractStateCodeFromGSTIN(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const m = String(gstin).match(/^(\d{2})/);
  return m ? m[1] : null;
}

/** Return the display name for a 2-digit state code. Returns the raw value if unrecognised. */
export function getStateName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  const cleaned = String(code).trim();
  return INDIA_STATE_CODES[cleaned] ?? cleaned;
}

/**
 * Normalise a raw state_code value that may be a full state name or already a 2-digit code.
 * Falls back to extracting from GSTIN when the stored value is unusable.
 */
export function resolveStateCode(
  rawCode: string | null | undefined,
  gstin?: string | null,
): string {
  if (rawCode) {
    const cleaned = String(rawCode).trim();
    if (/^\d{2}$/.test(cleaned)) return cleaned;
    // Full state name stored — look it up
    const entry = Object.entries(INDIA_STATE_CODES).find(
      ([, name]) => name.toLowerCase() === cleaned.toLowerCase(),
    );
    if (entry) return entry[0];
  }
  // Fallback: derive from company GSTIN
  if (gstin) return extractStateCodeFromGSTIN(gstin) ?? "";
  return "";
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Determine intra-state (CGST+SGST) vs inter-state (IGST) based on state codes.
 * Normalises codes to first 2 characters before comparing.
 * Defaults to 'igst' when either code is unknown.
 */
export function getGSTType(
  companyStateCode: string | null | undefined,
  partyStateCode: string | null | undefined,
  isExempt = false,
): GSTType {
  if (isExempt) return 'exempt';
  if (!companyStateCode || !partyStateCode) return 'igst';
  const companyState = String(companyStateCode).trim().slice(0, 2);
  const partyState = String(partyStateCode).trim().slice(0, 2);
  return companyState === partyState ? 'cgst_sgst' : 'igst';
}

/**
 * Calculate tax for a single taxable amount.
 * Returns zero for exempt or 0% rate.
 */
export function calculateLineTax(
  taxableAmount: number,
  gstRate: number,
  gstType: GSTType,
): { igst: number; cgst: number; sgst: number; total: number } {
  if (gstType === 'exempt' || gstRate === 0) {
    return { igst: 0, cgst: 0, sgst: 0, total: 0 };
  }
  if (gstType === 'igst') {
    const igst = round2(taxableAmount * gstRate / 100);
    return { igst, cgst: 0, sgst: 0, total: igst };
  }
  // cgst_sgst — compute each half separately to avoid paise drift
  const cgst = round2(taxableAmount * (gstRate / 2) / 100);
  const sgst = round2(taxableAmount * (gstRate / 2) / 100);
  return { igst: 0, cgst, sgst, total: round2(cgst + sgst) };
}

/**
 * Aggregate totals for a document's line items.
 * Accepts per-line discount_percent (optional, defaults to 0).
 */
export function calculateDocumentTotals(
  lineItems: Array<{
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    gst_rate: number;
  }>,
  gstType: GSTType,
): {
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  totalIGST: number;
  totalCGST: number;
  totalSGST: number;
  totalTax: number;
  grandTotal: number;
  gstType: GSTType;
} {
  let subtotal = 0;
  let totalDiscount = 0;
  let taxableAmount = 0;
  let totalIGST = 0;
  let totalCGST = 0;
  let totalSGST = 0;

  for (const line of lineItems) {
    const lineSubtotal = round2((line.quantity || 0) * (line.unit_price || 0));
    const discountAmt = round2(lineSubtotal * ((line.discount_percent ?? 0) / 100));
    const lineTaxable = round2(lineSubtotal - discountAmt);
    const tax = calculateLineTax(lineTaxable, line.gst_rate || 0, gstType);

    subtotal += lineSubtotal;
    totalDiscount += discountAmt;
    taxableAmount += lineTaxable;
    totalIGST += tax.igst;
    totalCGST += tax.cgst;
    totalSGST += tax.sgst;
  }

  const totalTax = round2(totalIGST + totalCGST + totalSGST);
  const grandTotal = round2(round2(taxableAmount) + totalTax);

  return {
    subtotal: round2(subtotal),
    totalDiscount: round2(totalDiscount),
    taxableAmount: round2(taxableAmount),
    totalIGST: round2(totalIGST),
    totalCGST: round2(totalCGST),
    totalSGST: round2(totalSGST),
    totalTax,
    grandTotal,
    gstType,
  };
}

/**
 * Fetch company state code from Supabase.
 * Priority 1: explicit state_code (handles full names like "Tamil Nadu" → "33").
 * Priority 2: first 2 digits of company GSTIN.
 */
export async function getCompanyStateCode(
  supabase: any,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('company_settings')
    .select('state_code, gstin')
    .eq('company_id', companyId)
    .single();
  if (!data) return null;
  const resolved = resolveStateCode(data.state_code, data.gstin);
  return resolved || null;
}

/** Number-only formatting (no currency symbol) for internal display. */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
