import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { fetchPendingApprovalCount, fetchUnreadRejectionCount } from "@/lib/purchase-orders-api";
import { fetchPendingDCApprovalCount, fetchUnreadDCRejectionCount } from "@/lib/delivery-challans-api";
import { Activity, CheckCircle2 } from "lucide-react";
import { fetchPendingQCGRNs, fetchAwaitingStoreCount } from "@/lib/grn-api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StockAlertsBoard } from "@/components/StockAlertsBoard";
import { OutstandingPOsWidget } from "@/components/OutstandingPOsWidget";
import { OutstandingDCsWidget } from "@/components/OutstandingDCsWidget";
import { formatCurrency } from "@/lib/gst-utils";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchAllAuditLog, type AuditEntry } from "@/lib/audit-api";
import { getCompanyId } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardData {
  thisMonthRevenue: number;
  fyRevenue: number;
  overdueInvoiceCount: number;
  openPOValue: number;
  overdueDCCount: number;
  rawMaterialCount: number;
  componentCount: number;
  finishedGoodCount: number;
  needsBuildingCount: number;
  overduePOCount: number;
}

interface StockAlertItem {
  id: string;
  item_code: string;
  description: string;
  item_type: string;
  aimed_stock: number;
  effective_stock: number;
  alert_type: string;
  actionedWith: 'PO' | 'DC' | 'AO' | null;
}

interface ReadyToShipRow {
  id: string;
  serial_number: string;
  item_code: string | null;
  item_description: string | null;
  fat_completed_at: string | null;
  created_at: string;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = format(new Date(fyYear, 3, 1), "yyyy-MM-dd");

  const [invsRes, openPOsRes, openDCsRes, itemsRes, overduePOsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("grand_total, invoice_date, due_date, status")
      .gte("invoice_date", fyStart)
      .neq("status", "cancelled"),
    supabase
      .from("purchase_orders")
      .select("grand_total")
      .in("status", ["issued", "partially_received"]),
    supabase
      .from("delivery_challans")
      .select("dc_type, return_due_date")
      .eq("status", "issued"),
    (supabase as any)
      .from("items")
      .select("id, item_type, current_stock, stock_finished_goods, min_finished_stock")
      .eq("status", "active"),
    (supabase as any)
      .from("purchase_orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["draft", "issued", "partially_received"]),
  ]);

  const invoices = (invsRes.data ?? []) as any[];
  const openPOs  = (openPOsRes.data ?? []) as any[];
  const openDCs  = (openDCsRes.data ?? []) as any[];
  const items    = (itemsRes.data ?? []) as any[];

  const thisMonthRevenue = invoices
    .filter((i) => i.invoice_date >= monthStart)
    .reduce((s, i) => s + (i.grand_total ?? 0), 0);
  const fyRevenue = invoices.reduce((s, i) => s + (i.grand_total ?? 0), 0);
  const overdueInvoiceCount = invoices.filter(
    (i) => i.due_date && i.due_date < todayStr && i.status !== "paid" && i.status !== "cancelled"
  ).length;
  const openPOValue = openPOs.reduce((s, p) => s + (p.grand_total ?? 0), 0);
  const overdueDCCount = openDCs.filter(
    (dc) => dc.dc_type === "returnable" && dc.return_due_date && dc.return_due_date < todayStr
  ).length;

  const rawMaterialCount = items.filter(
    (i) => i.item_type === "raw_material" && (i.current_stock ?? 0) > 0
  ).length;
  const componentCount = items.filter(
    (i) => (i.item_type === "component" || i.item_type === "sub_assembly") && (i.current_stock ?? 0) > 0
  ).length;
  const finishedGoodCount = items.filter(
    (i) => i.item_type === "finished_good" && (i.current_stock ?? 0) > 0
  ).length;
  const needsBuildingCount = items.filter(
    (i) => i.item_type === "finished_good" && (i.stock_finished_goods ?? 0) < (i.min_finished_stock ?? 0) && (i.min_finished_stock ?? 0) > 0
  ).length;

  const overduePOCount = overduePOsRes.count ?? 0;

  return {
    thisMonthRevenue, fyRevenue, overdueInvoiceCount,
    openPOValue, overdueDCCount,
    rawMaterialCount, componentCount, finishedGoodCount,
    needsBuildingCount, overduePOCount,
  };
}

async function fetchAwoStats(): Promise<{ buildsInProgress: number; pendingCount: number; wipComponentsCount: number }> {
  const companyId = await getCompanyId();
  if (!companyId) return { buildsInProgress: 0, pendingCount: 0, wipComponentsCount: 0 };

  const { data: awos } = await (supabase as any)
    .from("assembly_work_orders")
    .select("id, status")
    .eq("company_id", companyId)
    .in("status", ["draft", "pending_materials", "in_progress"]);

  const awoList = (awos ?? []) as Array<{ id: string; status: string }>;
  const buildsInProgress = awoList.filter((a) => a.status === "in_progress").length;
  const pendingCount = awoList.filter(
    (a) => a.status === "draft" || a.status === "pending_materials"
  ).length;

  const inProgressIds = awoList.filter((a) => a.status === "in_progress").map((a) => a.id);
  let wipComponentsCount = 0;
  if (inProgressIds.length > 0) {
    const { count } = await (supabase as any)
      .from("awo_line_items")
      .select("id", { count: "exact", head: true })
      .in("awo_id", inProgressIds)
      .gt("issued_qty", 0);
    wipComponentsCount = count ?? 0;
  }

  return { buildsInProgress, pendingCount, wipComponentsCount };
}

async function fetchReadyToShip(): Promise<ReadyToShipRow[]> {
  const { data, error } = await supabase
    .from("serial_numbers")
    .select("id, serial_number, item_code, item_description, fat_completed_at, created_at")
    .eq("fat_completed", true)
    .is("invoice_id", null)
    .eq("status", "in_stock")
    .order("fat_completed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReadyToShipRow[];
}

async function fetchRecentActivity(): Promise<AuditEntry[]> {
  const { data } = await fetchAllAuditLog({ pageSize: 10, page: 1 });
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const DOC_TAGS: Record<string, { cls: string; label: string }> = {
  invoice:          { cls: "bg-emerald-100 text-emerald-800", label: "INV" },
  delivery_challan: { cls: "bg-amber-100 text-amber-800",    label: "DC"  },
  purchase_order:   { cls: "bg-blue-100 text-blue-800",      label: "PO"  },
  assembly_order:   { cls: "bg-cyan-100 text-cyan-800",      label: "AO"  },
  fat_certificate:  { cls: "bg-rose-100 text-rose-800",      label: "FAT" },
  grn:              { cls: "bg-teal-100 text-teal-800",      label: "GRN" },
};

function docTag(type: string) {
  return DOC_TAGS[type] ?? { cls: "bg-slate-100 text-slate-700", label: type.slice(0, 3).toUpperCase() };
}

// ─── Glow-box card style ──────────────────────────────────────────────────────

function glowBox(r: number, g: number, b: number, dark: boolean) {
  if (dark) {
    return {
      background: "#0A0F1C",
      backgroundImage: [
        `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.22), transparent 55%)`,
        "linear-gradient(180deg, rgba(255,255,255,0.025), transparent 30%)",
      ].join(", "),
      boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 30px -12px rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.06)",
    };
  }
  return {
    background: "white",
    backgroundImage: [
      `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.10), transparent 55%)`,
      `linear-gradient(180deg, rgba(${r},${g},${b},0.04), transparent 30%)`,
    ].join(", "),
    boxShadow: `0 1px 3px rgba(0,0,0,0.08), 0 4px 16px -4px rgba(${r},${g},${b},0.15)`,
    border: "1px solid rgba(148,163,184,0.8)",
  };
}

// ─── Small components ─────────────────────────────────────────────────────────

function AlertPill({
  label, count, colour, onClick,
}: {
  label: string;
  count: number;
  colour: "red" | "amber" | "green";
  onClick?: () => void;
}) {
  const s = {
    red:   { wrap: "bg-red-50 border-red-200 text-red-700",     dot: "bg-red-500",   badge: "bg-red-100 text-red-800"   },
    amber: { wrap: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
    green: { wrap: "bg-green-50 border-green-200 text-green-700", dot: "bg-green-500", badge: "bg-green-100 text-green-800" },
  }[colour];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium hover:opacity-80 shrink-0 transition-opacity ${s.wrap}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
      {label}
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${s.badge}`}>{count}</span>
    </button>
  );
}

function LightStatRow({
  label, value, highlight, onClick, dark,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 last:border-0 ${dark ? "border-b border-white/10" : "border-b border-slate-100"} ${onClick ? `cursor-pointer -mx-4 px-4 transition-colors ${dark ? "hover:bg-white/5" : "hover:bg-slate-50"}` : ""}`}
      onClick={onClick}
    >
      <span className={`text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums font-mono ${highlight ? (dark ? "text-red-400" : "text-red-600") : (dark ? "text-slate-50" : "text-slate-900")}`}>{value}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isFinanceOrAdmin = role === 'admin' || role === 'finance';
  const isPurchaseTeam = role === 'purchase_team';
  const isInwardTeam = role === 'inward_team';
  const isStorekeeper = role === 'storekeeper';
  const isDCApprover = role === 'admin' || role === 'finance' || role === 'purchase_team';
  const STALE = 5 * 60 * 1000;

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-db"],
    queryFn: fetchCompanySettings,
    staleTime: Infinity,
  });
  const { data: awoStats } = useQuery({
    queryKey: ["awo-stats-dashboard"],
    queryFn: fetchAwoStats,
    staleTime: STALE,
    refetchInterval: STALE,
  });
  const { data: fatStats } = useQuery({
    queryKey: ["fat-stats-db"],
    queryFn: fetchFatStats,
    staleTime: STALE,
    refetchInterval: STALE,
  });
  const { data: dashData } = useQuery({
    queryKey: ["dashboard-data-v3"],
    queryFn: fetchDashboardData,
    staleTime: STALE,
    refetchInterval: STALE,
  });
  const { data: readyToShip = [] } = useQuery({
    queryKey: ["ready-to-ship-db"],
    queryFn: fetchReadyToShip,
    staleTime: STALE,
    refetchInterval: STALE,
  });
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["recent-activity-db"],
    queryFn: fetchRecentActivity,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  const { data: pendingQCGrns = [] } = useQuery({
    queryKey: ['pending-qc-grns-dash'],
    queryFn: fetchPendingQCGRNs,
    staleTime: STALE,
    refetchInterval: STALE,
  });
  const pendingQCCount = pendingQCGrns.length;

  const { data: awaitingStoreCount = 0 } = useQuery({
    queryKey: ['awaiting-store-count'],
    queryFn: fetchAwaitingStoreCount,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  const { data: pendingApprovalCount = 0 } = useQuery({
    queryKey: ['po-pending-approval-count'],
    queryFn: fetchPendingApprovalCount,
    enabled: isFinanceOrAdmin,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  const { data: unreadRejectionCount = 0 } = useQuery({
    queryKey: ['po-unread-rejection-count'],
    queryFn: fetchUnreadRejectionCount,
    enabled: isPurchaseTeam,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  const { data: pendingDCApprovalCount = 0 } = useQuery({
    queryKey: ['dc-pending-approval-count'],
    queryFn: fetchPendingDCApprovalCount,
    enabled: isDCApprover,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  const { data: unreadDCRejectionCount = 0 } = useQuery({
    queryKey: ['dc-unread-rejection-count'],
    queryFn: fetchUnreadDCRejectionCount,
    enabled: isInwardTeam,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  // Resolve companyId once so it can gate and key the stock alerts query
  const { data: companyId } = useQuery({
    queryKey: ['company-id'],
    queryFn: () => getCompanyId(),
    staleTime: Infinity,
  });

  // Live stock alerts from view
  const { data: stockAlertData = { unactioned: [] as StockAlertItem[], actioned: [] as StockAlertItem[] } } = useQuery({
    queryKey: ['stock-alerts-dashboard', companyId],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_alerts')
        .select('*')
        .eq('company_id', companyId)
        .neq('item_type', 'service');

      if (error) {
        console.error('Stock alerts error:', error);
        throw error;
      }

      const alertItems = ((data ?? []) as any[]).sort((a: any, b: any) => {
        const aS = a.shortage ?? ((a.min_stock ?? 0) - (a.effective_stock ?? a.stock_free ?? 0));
        const bS = b.shortage ?? ((b.min_stock ?? 0) - (b.effective_stock ?? b.stock_free ?? 0));
        return bS - aS;
      });
      if (alertItems.length === 0) return { unactioned: [] as StockAlertItem[], actioned: [] as StockAlertItem[] };

      const itemIds = alertItems.map((i: any) => i.id);

      // Open POs (two-step)
      const { data: openPOs } = await (supabase as any)
        .from('purchase_orders')
        .select('id')
        .eq('company_id', companyId)
        .in('status', ['draft', 'issued', 'partially_received']);
      const openPOIds = (openPOs ?? []).map((p: any) => p.id);
      const { data: poLines } = openPOIds.length > 0
        ? await (supabase as any).from('po_line_items').select('item_id').in('item_id', itemIds).in('po_id', openPOIds)
        : { data: [] };
      const itemsWithPO = new Set((poLines ?? []).map((l: any) => l.item_id));

      // Open DCs (two-step)
      const { data: openDCs } = await (supabase as any)
        .from('delivery_challans')
        .select('id')
        .eq('company_id', companyId)
        .in('status', ['issued', 'partially_returned']);
      const openDCIds = (openDCs ?? []).map((d: any) => d.id);
      const { data: dcLines } = openDCIds.length > 0
        ? await (supabase as any).from('dc_line_items').select('item_id').in('item_id', itemIds).in('delivery_challan_id', openDCIds)
        : { data: [] };
      const itemsWithDC = new Set((dcLines ?? []).map((l: any) => l.item_id));

      // Open AOs
      const { data: openAOs } = await (supabase as any)
        .from('assembly_orders')
        .select('item_id')
        .eq('company_id', companyId)
        .in('status', ['draft', 'in_progress'])
        .in('item_id', itemIds);
      const itemsWithAO = new Set((openAOs ?? []).map((ao: any) => ao.item_id));

      const enriched: StockAlertItem[] = alertItems.map((item: any) => ({
        id: item.id ?? '',
        item_code: item.item_code ?? '',
        description: item.description ?? item.item_code ?? '—',
        item_type: item.item_type ?? '',
        aimed_stock: item.aimed_stock ?? 0,
        effective_stock: item.effective_stock ?? 0,
        alert_type: item.alert_type ?? 'low',
        actionedWith: itemsWithPO.has(item.id) ? 'PO' : itemsWithDC.has(item.id) ? 'DC' : itemsWithAO.has(item.id) ? 'AO' : null,
      }));

      return {
        unactioned: enriched.filter((i) => !i.actionedWith),
        actioned: enriched.filter((i) => !!i.actionedWith),
      };
    },
  });

  // Derived alert counts
  const overdueDCReturns  = dashData?.overdueDCCount ?? 0;
  const criticalCount     = stockAlertData.unactioned.length;
  const actionedCount     = stockAlertData.actioned.length;
  const fatPending        = fatStats?.pending ?? 0;
  const uninvoicedUnits   = readyToShip.length;

  const totalAlerts = overdueDCReturns + criticalCount + actionedCount + fatPending + uninvoicedUnits + (dashData?.needsBuildingCount ?? 0) + (dashData?.overduePOCount ?? 0) + pendingApprovalCount + unreadRejectionCount + pendingDCApprovalCount + unreadDCRejectionCount;
  const allClear = totalAlerts === 0;

  // Company info
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = format(new Date(), "EEEE, d MMMM yyyy");
  const companyName = companySettings?.company_name ?? "BizDocs";

  // GSTR-3B due date
  const _now = new Date();
  const gstr3bDue = new Date(_now.getFullYear(), _now.getMonth(), 20);
  if (_now.getDate() >= 20) gstr3bDue.setMonth(gstr3bDue.getMonth() + 1);
  const gstr3bDueLabel = format(gstr3bDue, "20 MMMM");
  const gstr3bDaysLeft = Math.ceil((gstr3bDue.getTime() - _now.setHours(0, 0, 0, 0)) / 86400000);

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── ZONE 1: DARK TOP ────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-7 lg:px-7 lg:pt-6 lg:pb-8" style={{ backgroundColor: "hsl(var(--sidebar-background))" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">

          {/* Company info */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">{greeting}</p>
            <h1 className="text-lg lg:text-xl font-bold text-slate-100 tracking-tight">{companyName}</h1>
            <p className="text-xs text-slate-600 mt-0.5">{todayStr}</p>
          </div>

          {/* Alert pill + action buttons */}
          <div className="flex flex-col gap-2 lg:items-end">
            {allClear ? (
              <span
                className="self-start flex items-center gap-1.5 text-xs font-medium text-green-400 px-3 py-1 rounded-full border w-fit"
                style={{ backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.2)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> All clear
              </span>
            ) : (
              <span
                className="self-start flex items-center gap-1.5 text-xs font-medium text-red-400 px-3 py-1 rounded-full border w-fit"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                {totalAlerts} alert{totalAlerts !== 1 ? "s" : ""}
              </span>
            )}

            {/* Quick action buttons — hidden for storekeeper */}
            {!isStorekeeper && <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:flex-wrap lg:justify-end">

              <Tooltip delayDuration={400}>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0 bg-primary hover:bg-primary/90"
                    onClick={() => navigate("/purchase-orders/new")}
                  >
                    Raise PO
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px]">
                  <p className="font-semibold">Purchase Order</p>
                  <p className="text-xs mt-1">Use this when stock falls below reorder point. Buy raw materials or bought-out items from a vendor. Raise before material arrives so you can record a GRN.</p>
                </TooltipContent>
              </Tooltip>

              {([
                {
                  label: "Record GRN",
                  route: "/grn",
                  state: undefined as any,
                  title: "GRN — Goods Receipt",
                  body: "Use this when purchased materials arrive at the factory. Link to the original PO and record accepted vs rejected quantities. Stock updates automatically.",
                },
                {
                  label: "New DC",
                  route: "/delivery-challans/new",
                  state: undefined as any,
                  title: "DC / Job Work Order",
                  body: "Use this when goods are physically leaving the factory — for job work (returnable) or delivery to a customer (non-returnable).",
                },
                {
                  label: "Record FAT",
                  route: "/fat-certificates",
                  state: undefined as any,
                  title: "FAT Certificate",
                  body: "Use this when testing a finished OLTC unit. Record all 12 IEC test results and mark pass or fail. A unit cannot be invoiced without a passed FAT.",
                },
                {
                  label: "Raise Invoice",
                  route: "/invoices/new",
                  state: undefined as any,
                  title: "Invoice",
                  body: "Use this to bill a customer after goods are assembled, FAT-passed and ready to dispatch. Only FAT-passed serial numbers appear in the dropdown.",
                },
              ].map((btn) => (
                <Tooltip key={btn.label} delayDuration={400}>
                  <TooltipTrigger asChild>
                    <button
                      className="rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors shrink-0"
                      style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)")}
                      onClick={() => navigate(btn.route, { state: btn.state })}
                    >
                      {btn.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px]">
                    <p className="font-semibold">{btn.title}</p>
                    <p className="text-xs mt-1">{btn.body}</p>
                  </TooltipContent>
                </Tooltip>
              )))}

            </div>}
          </div>
        </div>
      </div>

      {/* ── ZONE 2: LIGHT CONTENT ───────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 lg:px-7 lg:py-5 space-y-4" style={{ backgroundColor: "hsl(var(--muted))" }}>

        {/* GSTR-3B banner — hidden for storekeeper */}
        {!isStorekeeper && (
          <button
            onClick={() => navigate("/gst-reports")}
            className="w-full flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-800 truncate">GSTR-3B due on {gstr3bDueLabel}</span>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${gstr3bDaysLeft <= 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              {gstr3bDaysLeft} day{gstr3bDaysLeft !== 1 ? "s" : ""} left
            </span>
          </button>
        )}

        {/* ── PO Approval pills ────────────────────────────────────── */}
        {isFinanceOrAdmin && pendingApprovalCount > 0 && (
          <AlertPill
            label="POs awaiting approval"
            count={pendingApprovalCount}
            colour="amber"
            onClick={() => navigate("/purchase-orders?status=pending_approval")}
          />
        )}
        {isPurchaseTeam && unreadRejectionCount > 0 && (
          <AlertPill
            label="PO requests rejected"
            count={unreadRejectionCount}
            colour="red"
            onClick={() => navigate("/purchase-orders?status=rejected")}
          />
        )}

        {/* ── DC Approval pills ────────────────────────────────────── */}
        {isDCApprover && pendingDCApprovalCount > 0 && (
          <AlertPill
            label="DCs awaiting approval"
            count={pendingDCApprovalCount}
            colour="amber"
            onClick={() => navigate("/delivery-challans")}
          />
        )}
        {isInwardTeam && unreadDCRejectionCount > 0 && (
          <AlertPill
            label="DC requests rejected"
            count={unreadDCRejectionCount}
            colour="red"
            onClick={() => navigate("/delivery-challans?status=rejected")}
          />
        )}

        {/* ── Section 2: Stock Alerts Board ────────────────────────── */}
        {companyId && <StockAlertsBoard companyId={companyId} />}

        {/* ── Section 3: Outstanding POs and DCs — hidden for storekeeper ── */}
        {!isStorekeeper && companyId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutstandingPOsWidget companyId={companyId} />
            <OutstandingDCsWidget companyId={companyId} />
          </div>
        )}

        {/* ── Section 3b: Storekeeper focus cards ──────────────────── */}
        {isStorekeeper && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-4 lg:p-5 relative overflow-hidden" style={glowBox(45, 212, 191, isDark)}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Awaiting Store Receipt</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-300 mt-1 tabular-nums font-mono">{awaitingStoreCount}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">GRN items cleared by QC</p>
              <button className="mt-2 text-xs text-sky-500 dark:text-sky-300 font-medium hover:text-sky-600 dark:hover:text-sky-200 transition-colors" onClick={() => navigate("/storekeeper-queue")}>
                Go to Queue →
              </button>
            </div>
            <div className="rounded-xl p-4 lg:p-5 relative overflow-hidden" style={glowBox(99, 102, 241, isDark)}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Pending GRN QC</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-slate-50 mt-1 tabular-nums font-mono">{pendingQCCount}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">GRNs at quality check stage</p>
              <button className="mt-2 text-xs text-sky-500 dark:text-sky-300 font-medium hover:text-sky-600 dark:hover:text-sky-200 transition-colors" onClick={() => navigate("/grn")}>
                View GRNs →
              </button>
            </div>
          </div>
        )}

        {/* ── Section 4: Two-column stats grid — hidden for storekeeper ── */}
        {!isStorekeeper && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Production card */}
          <div className="rounded-xl p-4 lg:p-5 relative overflow-hidden" style={glowBox(139, 92, 246, isDark)}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Production</p>
              <button className="text-xs text-sky-500 dark:text-sky-300 font-medium hover:text-sky-600 dark:hover:text-sky-200 transition-colors" onClick={() => navigate("/stock-register")}>
                View →
              </button>
            </div>
            <div className={`divide-y mt-2 ${isDark ? "divide-white/10" : "divide-slate-100"}`}>
              <LightStatRow dark={isDark} label="Builds" value={awoStats?.buildsInProgress ?? "—"} onClick={() => navigate("/sub-assembly-work-orders")} />
              <LightStatRow dark={isDark} label="FAT Pending" value={fatStats?.pending ?? "—"} highlight={(fatStats?.pending ?? 0) > 0} onClick={() => navigate("/fat-certificates")} />
              <LightStatRow dark={isDark} label="Pending Assembly" value={awoStats?.pendingCount ?? "—"} highlight={(awoStats?.pendingCount ?? 0) > 0} onClick={() => navigate("/sub-assembly-work-orders")} />
              <LightStatRow dark={isDark} label="WIP Components" value={awoStats?.wipComponentsCount ?? "—"} onClick={() => navigate("/wip-register")} />
            </div>
          </div>

          {/* Financials card */}
          <div className="rounded-xl p-4 lg:p-5 relative overflow-hidden" style={glowBox(236, 72, 153, isDark)}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">Financials</p>
              <button className="text-xs text-sky-500 dark:text-sky-300 font-medium hover:text-sky-600 dark:hover:text-sky-200 transition-colors" onClick={() => navigate("/invoices")}>
                View →
              </button>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight my-2 font-mono tabular-nums">
              {formatCurrency(dashData?.thisMonthRevenue ?? 0)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">This month's revenue</p>
            <div className={`divide-y ${isDark ? "divide-white/10" : "divide-slate-100"}`}>
              <LightStatRow dark={isDark} label="Overdue Invoices" value={dashData?.overdueInvoiceCount ?? "—"} highlight={(dashData?.overdueInvoiceCount ?? 0) > 0} onClick={() => navigate("/invoices")} />
              <LightStatRow dark={isDark} label="Overdue POs" value={dashData?.overduePOCount ?? "—"} highlight={(dashData?.overduePOCount ?? 0) > 0} onClick={() => navigate("/purchase-orders")} />
              <LightStatRow dark={isDark} label="Open PO Value" value={formatCurrency(dashData?.openPOValue ?? 0)} onClick={() => navigate("/purchase-orders")} />
              <LightStatRow dark={isDark} label="FY Revenue" value={formatCurrency(dashData?.fyRevenue ?? 0)} />
            </div>
          </div>

        </div>
        )}

        {/* ── Section 5: Finished Goods Ready to Ship — hidden for storekeeper ── */}
        {!isStorekeeper && readyToShip.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-4 lg:px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <h2 className="font-semibold text-slate-900 text-sm">Finished Goods — Ready to Ship</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  {readyToShip.length}
                </span>
              </div>
              <button
                className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                onClick={() => navigate("/fat-certificates")}
              >
                View all →
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial #</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item Code</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Age</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center w-36">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {readyToShip.map((sn) => {
                    const age = daysSince(sn.fat_completed_at ?? sn.created_at);
                    return (
                      <tr key={sn.id} className={age > 30 ? "bg-amber-50/50" : ""}>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-slate-800">{sn.serial_number}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-xs text-slate-500">{sn.item_code ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{sn.item_description ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                          <span className={`${age > 30 ? "text-amber-700 font-semibold" : "text-slate-600"}`}>
                            {age}d
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                          <button
                            className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                            onClick={() => navigate("/invoices/new", { state: { serial_number_id: sn.id } })}
                          >
                            Raise Invoice →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 6: Recent Activity Feed ──────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Recent Activity</h3>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No recent activity</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentActivity.map((entry) => {
                const tag = docTag(entry.document_type);
                const docNumber = entry.details?.number ?? entry.details?.doc_number ?? null;
                return (
                  <div key={entry.id} className="flex items-start gap-3 py-2.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${tag.cls}`}>
                      {tag.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">
                        <span className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</span>
                        {docNumber && <span className="text-slate-400 ml-1">· {docNumber}</span>}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.user_name ?? "System"}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 mt-0.5">{timeAgo(entry.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
