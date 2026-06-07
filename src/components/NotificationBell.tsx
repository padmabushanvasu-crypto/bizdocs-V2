import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, Package, Truck, Receipt, X, AlertTriangle, PackageCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  isVisibleTo,
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
  if (type === "stock_alert") return <Package className={cn(cls, "text-amber-600")} />;
  if (type === "overdue_dc") return <Truck className={cn(cls, "text-red-500")} />;
  if (type === "over_receipt_approval") return <Receipt className={cn(cls, "text-amber-600")} />;
  if (type === "grn_ready_to_move") return <PackageCheck className={cn(cls, "text-blue-600")} />;
  if (type === "mir_restock" || type === "assembly_replacement_mir") return <AlertTriangle className={cn(cls, "text-amber-600")} />;
  return <Bell className={cn(cls, "text-slate-400")} />;
}

function NotifIconBg(type: string): string {
  if (type === "overdue_dc") return "bg-red-50";
  if (type === "grn_ready_to_move") return "bg-blue-50";
  if (["stock_alert", "over_receipt_approval", "mir_restock", "assembly_replacement_mir"].includes(type)) return "bg-amber-50";
  return "bg-slate-50";
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications({ limit: 30 }),
    refetchInterval: 120000,
  });

  // Visibility filter (target_user = me, or target_role matches, or untargeted).
  const visible = useMemo(
    () => (data?.notifications ?? []).filter((n) => isVisibleTo(n, role, userId)),
    [data, role, userId]
  );

  const actionRequired = visible.filter((n) => n.category === "action_required");
  const activity = visible.filter((n) => n.category !== "action_required");
  const unread = visible.filter((n) => !n.is_read);
  const unreadCount = unread.length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readMutation = useMutation({ mutationFn: markAsRead, onSuccess: invalidate });
  const readAllMutation = useMutation({ mutationFn: () => markAllAsRead(unread.map((n) => n.id)), onSuccess: invalidate });
  const dismissMutation = useMutation({ mutationFn: dismissNotification, onSuccess: invalidate });

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) readMutation.mutate(notif.id);
    if (notif.link) {
      const pageKey = notif.link.replace(/^\//, "").split("/")[0];
      const { canView } = getRoleAccess((role ?? "") as AppRole, pageKey);
      if (canView) navigate(notif.link);
    }
  };

  const Row = ({ notif }: { notif: Notification }) => (
    <div
      className={cn(
        "group w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
        !notif.is_read && "bg-blue-50/40"
      )}
    >
      <button onClick={() => handleClick(notif)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
        <div className={cn("mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0", NotifIconBg(notif.type))}>
          <NotifIcon type={notif.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className={cn("text-xs font-semibold leading-snug", !notif.is_read ? "text-slate-900" : "text-foreground")}>
              {notif.title}
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(notif.created_at)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(notif.id); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const SectionHeader = ({ label, emphasize }: { label: string; emphasize?: boolean }) => (
    <div className={cn(
      "px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide border-b border-border",
      emphasize ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500"
    )}>
      {label}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 min-w-[1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0 shadow-xl" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs font-medium bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">{unreadCount} new</span>
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

        <div className="max-h-[440px] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground mt-0.5">No notifications right now</p>
            </div>
          ) : (
            <>
              {actionRequired.length > 0 && (
                <>
                  <SectionHeader label="Action Required" emphasize />
                  <div className="divide-y divide-border">
                    {actionRequired.map((n) => <Row key={n.id} notif={n} />)}
                  </div>
                </>
              )}
              {activity.length > 0 && (
                <>
                  <SectionHeader label="Activity" />
                  <div className="divide-y divide-border">
                    {activity.map((n) => <Row key={n.id} notif={n} />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{visible.length} shown</span>
          <button onClick={() => navigate("/notifications")} className="text-xs text-primary hover:underline font-medium">
            View all →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
