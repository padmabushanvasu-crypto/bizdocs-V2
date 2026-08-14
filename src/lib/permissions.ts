// ── Edit-approval permissions (client-side mirror of the DB gate) ─────────────
// The AUTHORITATIVE check is is_edit_approver() in Postgres; rpc_approve_edit_request
// / rpc_reject_edit_request re-verify it server-side, so a stale or forged id here
// can never actually approve anything. These ids exist only so the UI can show/hide
// controls. Keep this list in sync with is_edit_approver() in the DB.
export const EDIT_APPROVER_IDS = [
  '52297cae-eb41-4b07-88db-6f01a7e3cd02', // padhuvasu95@gmail.com
  'c6e8bf51-de15-4504-baf0-b808dd59b52f', // finance.innventives@gmail.com
] as const;

export function isEditApprover(userId?: string | null): boolean {
  return !!userId && (EDIT_APPROVER_IDS as readonly string[]).includes(userId);
}

// Map a raw Supabase/Postgres error from the edit-request RPCs to a clean,
// user-facing sentence. Falls back to the raw message when unrecognised — we
// never swallow an error (fail loud), we only make the known ones readable.
export function friendlyEditRequestError(err: unknown): string {
  const raw = (err as any)?.message ? String((err as any).message) : String(err ?? '');
  const m = raw.toLowerCase();

  if (
    m.includes('permission denied') ||
    m.includes('row-level security') ||
    m.includes('not authorized') ||
    m.includes('not an approver') ||
    m.includes('is_edit_approver')
  ) {
    return "You don't have permission to perform this action.";
  }
  if (
    m.includes('already') &&
    (m.includes('review') || m.includes('approved') || m.includes('rejected') || m.includes('cancel'))
  ) {
    return 'This request has already been reviewed.';
  }
  if (m.includes('not found') || m.includes('does not exist') || m.includes('no rows')) {
    return 'This edit request no longer exists — it may have been reviewed already.';
  }
  return raw || 'Something went wrong. Please try again.';
}
