import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current financial year string in "YY-YY" format.
 * Financial year starts in April.
 * e.g. April 2025 – March 2026 → "25-26"
 */
export function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed

  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;

  const sy = String(startYear).slice(-2);
  const ey = String(endYear).slice(-2);
  return `${sy}-${ey}`;
}

/**
 * Returns the next sequential document number for a given table/column/prefix.
 *
 * If settingsKey is provided, fetches the prefix from company_settings[settingsKey].
 * With prefix: "{PREFIX}-{fy}/{seq}" e.g. "GRN-25-26/001"
 * Without prefix: "{fy}/{seq}" e.g. "25-26/001"
 *
 * @param tableName     Supabase table name
 * @param numberColumn  Column that holds the document number
 * @param companyId     Company UUID to scope the query
 * @param settingsKey   Optional company_settings column key for the prefix (e.g. 'grn_prefix')
 */
export async function getNextDocNumber(
  tableName: string,
  numberColumn: string,
  companyId: string,
  settingsKey?: string
): Promise<string> {
  const fy = getCurrentFinancialYear();

  let prefix = fy;

  if (settingsKey) {
    const { data: settings } = await supabase
      .from("company_settings")
      .select(settingsKey)
      .limit(1)
      .single();
    const customPrefix = (settings as any)?.[settingsKey];
    if (customPrefix) {
      prefix = `${customPrefix}-${fy}`;
    }
  }

  const { data } = await supabase
    .from(tableName as any)
    .select(numberColumn)
    .eq("company_id", companyId)
    .ilike(numberColumn, `${prefix}/%`)
    .order(numberColumn, { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return `${prefix}/001`;
  const lastNum = parseInt(
    ((data[0] as any)[numberColumn] as string).split("/").pop() || "0",
    10
  );
  return `${prefix}/${String(lastNum + 1).padStart(3, "0")}`;
}
