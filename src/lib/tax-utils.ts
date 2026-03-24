// Centralised GST calculation utilities for Indian SME documents
// All monetary values must pass through round2() to avoid floating-point errors.

export type GSTType = 'igst' | 'cgst_sgst' | 'exempt';

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
 * Pass the supabase client so this util stays import-free.
 */
export async function getCompanyStateCode(
  supabase: any,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('company_settings')
    .select('state_code')
    .eq('company_id', companyId)
    .single();
  return data?.state_code ?? null;
}

/** Number-only formatting (no currency symbol) for internal display. */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
