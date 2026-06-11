import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a quantity for display: round to at most 2 decimals and drop trailing
 * zeros. Kills float-sum artifacts (105331.44399999999 → "105331.44") while
 * leaving clean values untouched (208 → "208", 49.9 → "49.9"). Display only.
 */
export function formatQty(n: number): string {
  return Number((Number(n) || 0).toFixed(2)).toString();
}
