/**
 * Calculate days open for a document.
 * Returns number of days or null if the document is in a terminal state.
 */
export function getDaysOpen(
  issuedAt: string | null,
  status: string,
  terminalStatuses: string[] = ["fully_received", "fully_returned", "fully_paid", "closed", "cancelled", "deleted", "verified"]
): number | null {
  if (!issuedAt || terminalStatuses.includes(status)) return null;
  return Math.floor((Date.now() - new Date(issuedAt).getTime()) / 86400000);
}

/**
 * Get the CSS class for days open color coding.
 */
export function getDaysOpenClass(days: number | null): string {
  if (days === null) return "";
  if (days > 60) return "text-destructive font-semibold";
  if (days > 30) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}
