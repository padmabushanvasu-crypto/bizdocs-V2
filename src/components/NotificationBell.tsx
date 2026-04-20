import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, Package, Truck, ShoppingCart, CheckCircle2, Receipt } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/notifications-api";
import { useAuth } from "@/hooks/useAuth";
import { getRoleAccess, type AppRole } from "@/lib/role-access";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotifIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (type === "stock_alert")         return <Package className={cn(cls, "text-amber-600")} />;
  if (type === "overdue_dc")          return <Truck className={cn(cls, "text-red-500")} />;
  if (type === "po_pending_grn")      return <ShoppingCart className={cn(cls, "text-blue-500")} />;
  if (type === "fat_pending")         return <CheckCircle2 className={cn(cls, "text-purple-500")} />;
  if (type === "over_receipt_approval") return <Receipt className={cn(cls, "text-amber-600")} />;
  return <Bell className={cn(cls, "text-slate-400")} />;
}

function NotifIconBg(type: string): string {
  if (type === "stock_alert")           return "bg-amber-50";
  if (type === "overdue_dc")            return "bg-red-50";
  if (type === "po_pending_grn")        return "bg-blue-50";
  if (type === "fat_pending")           return "bg-purple-50";
  if (type === "over_receipt_approval") return "bg-amber-50";
  return "bg-slate-50";
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 60000,
  });

  // Filter out role-targeted notifications the current user shouldn't see.
  // target_role = null → show to everyone.
  // target_role = 'finance' → show only to finance or admin.
  const allNotifications = data?.notifications ?? [];
  const notifications = allNotifications.filter((n) => {
    const target = (n as any).target_role as string | null;
    if (!target) return true;
    return role === "admin" || role === "finance" || role === target;
  });
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const readMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) readMutation.mutate(notif.id);
    if (notif.link) {
      // Derive the page key from the link (e.g. "/purchase-orders/123" → "purchase-orders")
      const pageKey = notif.link.replace(/^\//, '').split('/')[0];
      const { canView } = getRoleAccess((role ?? '') as AppRole, pageKey);
      if (canView) navigate(notif.link);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full h-8 w-8"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 min-w-[1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0 shadow-xl" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs font-medium bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground mt-0.5">No notifications right now</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  !notif.is_read && "bg-blue-50/40"
                )}
              >
                {/* Icon bubble */}
                <div className={cn("mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0", NotifIconBg(notif.type))}>
                  <NotifIcon type={notif.type} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className={cn("text-xs font-semibold text-foreground leading-snug", !notif.is_read && "text-slate-900")}>
                      {notif.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {timeAgo(notif.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                    {notif.message}
                  </p>
                </div>

                {/* Unread dot */}
                {!notif.is_read && (
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2 text-center">
            <span className="text-xs text-muted-foreground">
              Showing last {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
