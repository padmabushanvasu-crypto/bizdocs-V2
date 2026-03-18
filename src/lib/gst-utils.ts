// GST Calculation Utilities for Indian SME Document Management

export interface GSTResult {
  type: 'CGST_SGST' | 'IGST';
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface LineTotals {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function calculateGST(
  companyStateCode: string,
  partyStateCode: string,
  taxableAmount: number,
  gstRate: number
): GSTResult {
  const isSameState = companyStateCode === partyStateCode;
  const totalGST = (taxableAmount * gstRate) / 100;

  if (isSameState) {
    return {
      type: 'CGST_SGST',
      cgst: Math.round(totalGST / 2 * 100) / 100,
      sgst: Math.round(totalGST / 2 * 100) / 100,
      igst: 0,
      total: Math.round(totalGST * 100) / 100,
    };
  }

  return {
    type: 'IGST',
    cgst: 0,
    sgst: 0,
    igst: Math.round(totalGST * 100) / 100,
    total: Math.round(totalGST * 100) / 100,
  };
}

export function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  gstRate: number,
  isSameState: boolean
): LineTotals {
  const taxableValue = Math.round(quantity * unitPrice * 100) / 100;
  const totalGst = (taxableValue * gstRate) / 100;

  return {
    taxableValue,
    cgst: isSameState ? Math.round(totalGst / 2 * 100) / 100 : 0,
    sgst: isSameState ? Math.round(totalGst / 2 * 100) / 100 : 0,
    igst: isSameState ? 0 : Math.round(totalGst * 100) / 100,
    total: Math.round((taxableValue + totalGst) * 100) / 100,
  };
}

export function getStateFromGSTIN(gstin: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.substring(0, 2);
}

export const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '36': 'Telangana', '37': 'Andhra Pradesh',
};

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWordsHelper(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWordsHelper(n % 100) : '');
  if (n < 100000) return numberToWordsHelper(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numberToWordsHelper(n % 1000) : '');
  if (n < 10000000) return numberToWordsHelper(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numberToWordsHelper(n % 100000) : '');
  return numberToWordsHelper(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numberToWordsHelper(n % 10000000) : '');
}

export function amountInWords(amount: number): string {
  if (amount === 0) return 'Rupees Zero Only';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = 'Rupees ' + numberToWordsHelper(rupees);
  if (paise > 0) {
    result += ' and ' + numberToWordsHelper(paise) + ' Paise';
  }
  return result + ' Only';
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
