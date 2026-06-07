import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronLeft, Check, X, AlertTriangle, Package, Truck, Receipt, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
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

type CategoryFilter = "all" | "action_required" | "activity";

function NotifIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (type === "stock_alert") return <Package className={cn(cls, "text-amber-600")} />;
  if (type === "overdue_dc") return <Truck className={cn(cls, "text-red-500")} />;
  if (type === "over_receipt_approval") return <Receipt className={cn(cls, "text-amber-600")} />;
  if (type === "grn_ready_to_move") return <PackageCheck className={cn(cls, "text-blue-600")} />;
  if (type === "mir_restock" || type === "assembly_replacement_mir") return <AlertTriangle className={cn(cls, "text-amber-600")} />;
  return <Bell className={cn(cls, "text-slate-400")} />;
}

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const userId = user?.id ?? null;

  const [showDismissed, setShowDismissed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-all", showDismissed],
    queryFn: () => fetchNotifications({ includeDismissed: showDismissed }),
  });

  const visible = useMemo(
    () => (data?.notifications ?? []).filter((n) => isVisibleTo(n, role, userId)),
    [data, role, userId]
  );

  const filtered = useMemo(
    () => (categoryFilter === "all" ? visible : visible.filter((n) => (n.category ?? "activity") === categoryFilter)),
    [visible, categoryFilter]
  );

  const actionRequired = filtered.filter((n) => n.category === "action_required");
  const activity = filtered.filter((n) => n.category !== "action_required");
  const unread = visible.filter((n) => !n.is_read && !n.dismissed_at);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const readMutation = useMutation({ mutationFn: markAsRead, onSuccess: invalidate });
  const readAllMutation = useMutation({ mutationFn: () => markAllAsRead(unread.map((n) => n.id)), onSuccess: invalidate });
  const dismissMutation = useMutation({ mutationFn: dismissNotification, onSuccess: invalidate });

  const goLink = (notif: Notification) => {
    if (!notif.is_read) readMutation.mutate(notif.id);
    if (notif.link) {
      const pageKey = notif.link.replace(/^\//, "").split("/")[0];
      const { canView } = getRoleAccess((role ?? "") as AppRole, pageKey);
      if (canView) navigate(notif.link);
    }
  };

  const Row = ({ notif }: { notif: Notification }) => (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 border-b border-slate-100 transition-colors hover:bg-muted/40",
      !notif.is_read && !notif.dismissed_at && "bg-blue-50/40",
      notif.dismissed_at && "opacity-60"
    )}>
      <div className="mt-0.5 h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
        <NotifIcon type={notif.type} />
      </div>
      <button onClick={() => goLink(notif)} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-semibold", !notif.is_read ? "text-slate-900" : "text-foreground")}>{notif.title}</p>
          {notif.priority === "high" && <span className="text-[9px] font-bold uppercase bg-red-100 text-red-700 rounded px-1 py-0.5">High</span>}
          {notif.dismissed_at && <span className="text-[9px] font-medium uppercase bg-slate-200 text-slate-600 rounded px-1 py-0.5">Dismissed</span>}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{notif.message}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(notif.created_at), "dd MMM yyyy, HH:mm")}</p>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {!notif.is_read && (
          <button onClick={() => readMutation.mutate(notif.id)} className="text-muted-foreground/60 hover:text-green-600 p-1" title="Mark read">
            <Check className="h-4 w-4" />
          </button>
        )}
        {!notif.dismissed_at && (
          <button onClick={() => dismissMutation.mutate(notif.id)} className="text-muted-foreground/60 hover:text-foreground p-1" title="Dismiss">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" /> Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">All notifications addressed to you or your role.</p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>
            Mark all read ({unread.length})
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "action_required", "activity"] as CategoryFilter[]).map((c) => (
          <Button key={c} size="sm" variant={categoryFilter === c ? "default" : "outline"} onClick={() => setCategoryFilter(c)}>
            {c === "all" ? "All" : c === "action_required" ? "Action Required" : "Activity"}
          </Button>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer ml-auto">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
          Show dismissed
        </label>
      </div>

      <div className="paper-card !p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">Nothing here</p>
          </div>
        ) : (
          <>
            {(categoryFilter === "all" || categoryFilter === "action_required") && actionRequired.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border-b border-border">Action Required</div>
                {actionRequired.map((n) => <Row key={n.id} notif={n} />)}
              </>
            )}
            {(categoryFilter === "all" || categoryFilter === "activity") && activity.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide bg-slate-50 text-slate-500 border-b border-border">Activity</div>
                {activity.map((n) => <Row key={n.id} notif={n} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
