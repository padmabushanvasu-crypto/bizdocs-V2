// Indian states for dropdown
export const INDIAN_STATES = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
] as const;

export const PAYMENT_TERMS_OPTIONS = [
  "Immediate",
  "7 Days",
  "15 Days",
  "30 Days",
  "45 Days",
  "60 Days",
  "Custom",
] as const;

// GSTIN validation: 2-digit state code + 10-char PAN + 1 entity + 1 check + Z
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(gstin: string): { valid: boolean; stateCode?: string; stateName?: string } {
  if (!gstin) return { valid: false };
  const upper = gstin.toUpperCase().trim();
  if (upper.length !== 15) return { valid: false };
  if (!GSTIN_REGEX.test(upper)) return { valid: false };

  const stateCode = upper.substring(0, 2);
  const state = INDIAN_STATES.find((s) => s.code === stateCode);
  if (!state) return { valid: false };

  return { valid: true, stateCode, stateName: state.name };
}

export function getStateByCode(code: string) {
  return INDIAN_STATES.find((s) => s.code === code);
}

export function getStateByName(name: string) {
  return INDIAN_STATES.find((s) => s.name.toLowerCase() === name.toLowerCase());
}
