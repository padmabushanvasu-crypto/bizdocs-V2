import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export type NotificationCategory = "action_required" | "activity";
export type NotificationPriority = "high" | "normal" | "low";

export interface Notification {
  id: string;
  company_id: string;
  type: string;
  title: string;
  message: string;
  category: string | null;
  priority: string | null;
  is_read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  link: string | null;
  target_role: string | null;
  target_user: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateNotificationInput {
  type: string;
  title: string;
  message: string;
  category?: NotificationCategory;   // default 'activity'
  priority?: NotificationPriority;   // default 'normal'
  link?: string | null;
  target_role?: string | null;       // null + null target_user → everyone
  target_user?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  created_by?: string | null;
  company_id?: string | null;        // override when the caller already has it
}

/**
 * Single insert path for ALL notifications, so category/priority/targeting are
 * consistent. Non-throwing on a missing company; throws on a real insert error
 * (callers wrap in try/catch where the notification is non-critical).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const companyId = input.company_id ?? (await getCompanyId());
  if (!companyId) return;
  const { error } = await (supabase as any).from("notifications").insert({
    company_id: companyId,
    type: input.type,
    title: input.title,
    message: input.message,
    category: input.category ?? "activity",
    priority: input.priority ?? "normal",
    is_read: false,
    link: input.link ?? null,
    target_role: input.target_role ?? null,
    target_user: input.target_user ?? null,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    created_by: input.created_by ?? null,
  });
  if (error) throw error;
}

/**
 * Company-scoped fetch. Excludes dismissed by default; `category` narrows;
 * `limit` caps the bell (omit for the full page). Visibility (role/user) is
 * applied client-side via isVisibleTo.
 */
export async function fetchNotifications(
  opts: { includeDismissed?: boolean; category?: string; limit?: number } = {}
): Promise<{ notifications: Notification[] }> {
  const companyId = await getCompanyId();
  if (!companyId) return { notifications: [] };

  let query = (supabase as any)
    .from("notifications")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!opts.includeDismissed) query = query.is("dismissed_at", null);
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) {
    // Table may not exist yet — return empty gracefully
    return { notifications: [] };
  }
  return { notifications: (data ?? []) as Notification[] };
}

/**
 * Client-side visibility: a user sees a notification if it's addressed to them
 * personally, to their role (admin/finance see all role-targeted), or to nobody
 * in particular (both targets null).
 */
export function isVisibleTo(
  n: Pick<Notification, "target_role" | "target_user">,
  role: string | null,
  userId: string | null
): boolean {
  if (n.target_user) return n.target_user === userId;
  if (n.target_role) return role === "admin" || role === "finance" || role === n.target_role;
  return true; // both null → everyone
}

export async function markAsRead(id: string): Promise<void> {
  await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Mark read scoped to the CURRENT USER's visible set — callers pass the ids
 * currently shown to them (undismissed + visible), so this never touches other
 * users' / other roles' notifications.
 */
export async function markAllAsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await (supabase as any)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in("id", ids);
}

export async function dismissNotification(id: string): Promise<void> {
  await (supabase as any)
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
}
