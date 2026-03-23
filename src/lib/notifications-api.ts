import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

export interface Notification {
  id: string;
  company_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export async function fetchNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const companyId = await getCompanyId();
  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // Table may not exist yet — return empty gracefully
    return { notifications: [], unreadCount: 0 };
  }
  const notifications = (data ?? []) as Notification[];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  return { notifications, unreadCount };
}

export async function markAsRead(id: string): Promise<void> {
  await (supabase as any).from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllAsRead(): Promise<void> {
  const companyId = await getCompanyId();
  await (supabase as any)
    .from("notifications")
    .update({ is_read: true })
    .eq("company_id", companyId)
    .eq("is_read", false);
}

export async function generateStockAlerts(): Promise<void> {
  try {
    const companyId = await getCompanyId();

    // Remove stale unread stock alerts — will be replaced with fresh ones
    await (supabase as any)
      .from("notifications")
      .delete()
      .eq("company_id", companyId)
      .eq("type", "stock_alert")
      .eq("is_read", false);

    const { data: items } = await (supabase as any)
      .from("items")
      .select("id, item_code, description, current_stock, min_stock")
      .eq("company_id", companyId)
      .gt("min_stock", 0);

    const below = ((items ?? []) as any[]).filter(
      (item) => (item.current_stock ?? 0) <= item.min_stock
    );

    if (below.length === 0) return;

    const inserts = below.map((item) => ({
      company_id: companyId,
      type: "stock_alert",
      title: `Stock Alert: ${item.item_code ?? "Item"}`,
      message: `${item.description} is at or below minimum stock (current: ${item.current_stock ?? 0}, min: ${item.min_stock})`,
      is_read: false,
      link: "/stock-register",
    }));

    await (supabase as any).from("notifications").insert(inserts);
  } catch {
    // Silently ignore — table may not exist yet
  }
}

export async function generateOverdueDCAlerts(): Promise<void> {
  try {
    const companyId = await getCompanyId();
    const today = new Date().toISOString().split("T")[0];

    await (supabase as any)
      .from("notifications")
      .delete()
      .eq("company_id", companyId)
      .eq("type", "overdue_dc")
      .eq("is_read", false);

    const { data: dcs } = await (supabase as any)
      .from("delivery_challans")
      .select("id, dc_number, party_name, return_due_date, status")
      .eq("company_id", companyId)
      .not("return_due_date", "is", null)
      .lt("return_due_date", today)
      .not("status", "in", "(fully_returned,cancelled,deleted)");

    if (!dcs || dcs.length === 0) return;

    const inserts = (dcs as any[]).map((dc) => ({
      company_id: companyId,
      type: "overdue_dc",
      title: `Overdue Return: ${dc.dc_number}`,
      message: `DC ${dc.dc_number}${dc.party_name ? ` to ${dc.party_name}` : ""} was due for return on ${new Date(dc.return_due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      is_read: false,
      link: `/delivery-challans/${dc.id}`,
    }));

    await (supabase as any).from("notifications").insert(inserts);
  } catch {
    // Silently ignore
  }
}

export async function generatePOPendingGRNAlerts(): Promise<void> {
  try {
    const companyId = await getCompanyId();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    await (supabase as any)
      .from("notifications")
      .delete()
      .eq("company_id", companyId)
      .eq("type", "po_pending_grn")
      .eq("is_read", false);

    const { data: pos } = await (supabase as any)
      .from("purchase_orders")
      .select("id, po_number, vendor_name, po_date, status")
      .eq("company_id", companyId)
      .in("status", ["issued", "partially_received"])
      .lt("po_date", sevenDaysAgo);

    if (!pos || pos.length === 0) return;

    // Check which POs have no GRN
    const inserts: any[] = [];
    for (const po of pos as any[]) {
      const { count } = await (supabase as any)
        .from("grns")
        .select("id", { count: "exact", head: true })
        .eq("po_id", po.id);
      if ((count ?? 0) === 0) {
        inserts.push({
          company_id: companyId,
          type: "po_pending_grn",
          title: `No GRN for ${po.po_number}`,
          message: `${po.po_number}${po.vendor_name ? ` to ${po.vendor_name}` : ""} has been open for more than 7 days with no receipt recorded`,
          is_read: false,
          link: `/purchase-orders/${po.id}`,
        });
      }
    }

    if (inserts.length > 0) {
      await (supabase as any).from("notifications").insert(inserts);
    }
  } catch {
    // Silently ignore
  }
}
