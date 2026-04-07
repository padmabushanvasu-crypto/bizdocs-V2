import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Activity, CheckCircle2 } from "lucide-react";
import { fetchPendingQCGRNs, fetchAwaitingStoreCount } from "@/lib/grn-api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/gst-utils";
import { fetchAssemblyOrderStats } from "@/lib/assembly-orders-api";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchAllAuditLog, type AuditEntry } from "@/lib/audit-api";
import { recalcAllStockAlertLevels } from "@/lib/items-api";
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
  criticalCount: number;
  actionedCount: number;
  overduePOCount: number;
  criticalItems: Array<{
    id: string;
    description: string;
    item_code: string;
    item_type: string;
    current_stock: number;
    aimed_stock: number;
    effective_stock: number;
    actionedWith: 'PO' | 'DC' | 'AO' | null;
  }>;
  pendingAssemblyOrderCount: number;
  wipCount: number;
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

  const [invsRes, openPOsRes, openDCsRes, itemsRes, overduePOsRes,
         itemsWithOpenPORes, itemsWithOpenDCRes, itemsWithOpenAORes, pendingAORes] = await Promise.all([
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
      .select("id, description, item_type, current_stock, stock_finished_goods, min_finished_stock, stock_wip, min_stock, stock_alert_level, item_code, aimed_stock, stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready")
      .eq("status", "active"),
    (supabase as any)
      .from("purchase_orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["draft", "issued", "partially_received"])
      .lt("delivery_date", todayStr),
    // Query A — items with an open PO already raised
    (supabase as any)
      .from("po_line_items")
      .select("item_id, purchase_orders!inner(status)")
      .in("purchase_orders.status", ["draft", "issued", "partially_received"]),
    // Query B — items with an open DC already sent out
    (supabase as any)
      .from("dc_line_items")
      .select("item_id, delivery_challans!inner(status)")
      .in("delivery_challans.status", ["issued", "partially_returned"]),
    // Query C — items with an open Assembly Order
    (supabase as any)
      .from("assembly_orders")
      .select("item_id")
      .in("status", ["draft", "in_progress"]),
    // Pending assembly order count
    (supabase as any)
      .from("assembly_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "in_progress"]),
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
  const wipCount = items.filter((i) => (i.stock_wip ?? 0) > 0).length;

  // Single source of truth: critical items from stock_alert_level column
  const itemsWithPOIds = new Set((itemsWithOpenPORes.data ?? []).map((r: any) => r.item_id).filter(Boolean));
  const itemsWithDCIds = new Set((itemsWithOpenDCRes.data ?? []).map((r: any) => r.item_id).filter(Boolean));
  const itemsWithAOIds = new Set((itemsWithOpenAORes.data ?? []).map((r: any) => r.item_id).filter(Boolean));
  const pendingAssemblyOrderCount = (pendingAORes as any).count ?? 0;

  const allCritical = items.filter(
    (i) => i.stock_alert_level === 'critical' && i.item_type !== 'service'
  );
  const criticalCount = allCritical.filter(
    (i) => !itemsWithPOIds.has(i.id) && !itemsWithDCIds.has(i.id) && !itemsWithAOIds.has(i.id)
  ).length;
  const actionedCount = allCritical.filter(
    (i) => itemsWithPOIds.has(i.id) || itemsWithDCIds.has(i.id) || itemsWithAOIds.has(i.id)
  ).length;

  const criticalItems = allCritical
    .slice(0, 6)
    .map((i) => {
      const actionedWith: 'PO' | 'DC' | 'AO' | null =
        itemsWithPOIds.has(i.id) ? 'PO' :
        itemsWithDCIds.has(i.id) ? 'DC' :
        itemsWithAOIds.has(i.id) ? 'AO' : null;
      const effectiveStock =
        (i.stock_free ?? 0) +
        (i.stock_in_process ?? 0) +
        (i.stock_in_subassembly_wip ?? 0) +
        (i.stock_in_fg_wip ?? 0) +
        (i.stock_in_fg_ready ?? 0);
      return {
        id: i.id ?? '',
        description: i.description ?? i.item_code ?? '—',
        item_code: i.item_code ?? '',
        item_type: i.item_type ?? '',
        current_stock: i.current_stock ?? 0,
        aimed_stock: i.aimed_stock ?? 0,
        effective_stock: effectiveStock,
        actionedWith,
      };
    });

  const overduePOCount = overduePOsRes.count ?? 0;

  return {
    thisMonthRevenue, fyRevenue, overdueInvoiceCount,
    openPOValue, overdueDCCount,
    rawMaterialCount, componentCount, finishedGoodCount,
    needsBuildingCount, criticalCount, actionedCount,
    overduePOCount, criticalItems,
    pendingAssemblyOrderCount, wipCount,
  };
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
  label, value, highlight, onClick,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 border-b border-slate-100 last:border-0 ${onClick ? "cursor-pointer hover:bg-slate-50 -mx-4 px-4 transition-colors" : ""}`}
      onClick={onClick}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold tabular-nums font-mono ${highlight ? "text-red-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const STALE = 5 * 60 * 1000;

  // One-time recalc of stock_alert_level for all items (runs once per deployment)
  useEffect(() => {
    const FLAG = 'bizdocs_alert_recalc_v2';
    if (localStorage.getItem(FLAG)) return;
    (async () => {
      try {
        const companyId = await getCompanyId();
        if (!companyId) return;
        await recalcAllStockAlertLevels(companyId);
        localStorage.setItem(FLAG, '1');
        queryClient.invalidateQueries({ queryKey: ["dashboard-data-v3"] });
        queryClient.invalidateQueries({ queryKey: ["reorder-summary-sidebar"] });
      } catch {
        // Non-fatal — will retry on next mount
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-db"],
    queryFn: fetchCompanySettings,
    staleTime: Infinity,
  });
  const { data: aoStats } = useQuery({
    queryKey: ["ao-stats-db"],
    queryFn: fetchAssemblyOrderStats,
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

  // Derived alert counts — single source: stock_alert_level column
  const overdueDCReturns  = dashData?.overdueDCCount ?? 0;
  const criticalCount     = dashData?.criticalCount ?? 0;
  const actionedCount     = dashData?.actionedCount ?? 0;
  const fatPending        = fatStats?.pending ?? 0;
  const uninvoicedUnits   = readyToShip.length;

  const totalAlerts = overdueDCReturns + criticalCount + actionedCount + fatPending + uninvoicedUnits + (dashData?.needsBuildingCount ?? 0) + (dashData?.overduePOCount ?? 0);
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
      <div className="px-4 pt-5 pb-7 lg:px-7 lg:pt-6 lg:pb-8" style={{ backgroundColor: "#0F172A" }}>
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

            {/* 7 quick action buttons — production flow order */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:flex-wrap lg:justify-end">

              <Tooltip delayDuration={400}>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0"
                    style={{ backgroundColor: "#2563EB" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1D4ED8")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2563EB")}
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

            </div>
          </div>
        </div>
      </div>

      {/* ── ZONE 2: LIGHT CONTENT ───────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 lg:px-7 lg:py-5 space-y-4" style={{ backgroundColor: "#F1F5F9" }}>

        {/* GSTR-3B banner */}
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

        {/* ── Section 1: Critical Alerts ───────────────────────────── */}
        {allClear ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-800">All systems go — no alerts requiring attention.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {overdueDCReturns > 0 && (
              <AlertPill label="Overdue DC Returns" count={overdueDCReturns} colour="red"   onClick={() => navigate("/delivery-challans")} />
            )}
            {(dashData?.overduePOCount ?? 0) > 0 && (
              <AlertPill label="Overdue POs" count={dashData!.overduePOCount} colour="red" onClick={() => navigate("/purchase-orders")} />
            )}
            {criticalCount > 0 && (
              <AlertPill label="Needs Action"       count={criticalCount}   colour="red"   onClick={() => navigate("/procurement-intelligence?filter=needs_action")} />
            )}
            {actionedCount > 0 && (
              <AlertPill label="Being Actioned"     count={actionedCount}   colour="amber" onClick={() => navigate("/procurement-intelligence")} />
            )}
            {pendingQCCount > 0 && (
              <AlertPill
                label="Awaiting QC"
                count={pendingQCCount}
                colour="amber"
                onClick={() => navigate('/grn?stage=quality_pending')}
              />
            )}
            {awaitingStoreCount > 0 && (
              <AlertPill
                label="Awaiting Store"
                count={awaitingStoreCount}
                colour="amber"
                onClick={() => navigate('/storekeeper-queue')}
              />
            )}
            {fatPending > 0 && (
              <AlertPill label="FAT Pending"        count={fatPending}       colour="amber" onClick={() => navigate("/fat-certificates")} />
            )}
            {uninvoicedUnits > 0 && (
              <AlertPill label="Ready to Invoice"   count={uninvoicedUnits}  colour="amber" onClick={() => navigate("/fat-certificates")} />
            )}
            {(dashData?.needsBuildingCount ?? 0) > 0 && (
              <AlertPill label="Items Need Building" count={dashData!.needsBuildingCount} colour="amber" onClick={() => navigate("/stock-register")} />
            )}
          </div>
        )}

        {/* ── Section 2: Three-column stats grid ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Production card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Production</p>
              <button className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors" onClick={() => navigate("/stock-register")}>
                View →
              </button>
            </div>
            <div className="divide-y divide-slate-100 mt-2">
              <LightStatRow label="Builds"   value={aoStats?.completedThisMonth ?? "—"}   onClick={() => navigate("/stock-register")} />
              <LightStatRow label="FAT Pending"  value={fatStats?.pending ?? "—"} highlight={(fatStats?.pending ?? 0) > 0} onClick={() => navigate("/fat-certificates")} />
              <LightStatRow label="Pending Assembly" value={dashData?.pendingAssemblyOrderCount ?? "—"} highlight={(dashData?.pendingAssemblyOrderCount ?? 0) > 0} onClick={() => navigate("/assembly-orders")} />
              <LightStatRow label="WIP Components" value={dashData?.wipCount ?? "—"} onClick={() => navigate("/wip-register")} />
            </div>
          </div>

          {/* Stock Alerts card */}
          <div className={`bg-white rounded-xl border shadow-sm p-4 lg:p-5 ${criticalCount > 0 ? 'border-red-300' : actionedCount > 0 ? 'border-blue-300' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Stock Alerts</p>
              <button className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors" onClick={() => navigate("/procurement-intelligence")}>
                View All →
              </button>
            </div>

            <div className="space-y-2">
              {/* Group 1 — Needs Action (unactioned critical items) */}
              {criticalCount > 0 && (
                <div
                  className="rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => navigate("/procurement-intelligence?filter=needs_action")}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">Needs Action</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-red-600">{criticalCount}</span>
                  </div>
                  <p className="text-[10px] text-red-500 mt-0.5">Critical stock — no open PO / DC / AO</p>
                  {/* Unactioned critical items */}
                  {(dashData?.criticalItems ?? []).filter(i => !i.actionedWith).slice(0, 3).map((item, i) => (
                    <div key={i} className="mt-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-red-800 truncate max-w-[100px] font-mono">{item.item_code || item.description}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.item_type === 'raw_material' || item.item_type === 'bought_out' || item.item_type === 'consumable' ? (
                            <button
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                              onClick={(e) => { e.stopPropagation(); navigate("/purchase-orders/new", { state: { prefillItem: { item_id: item.id, item_code: item.item_code, description: item.description } } }); }}
                            >Raise PO</button>
                          ) : item.item_type === 'component' ? (
                            <button
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                              onClick={(e) => { e.stopPropagation(); navigate("/delivery-challans/new", { state: { prefillItem: { item_id: item.id, item_code: item.item_code, description: item.description } } }); }}
                            >Raise DC</button>
                          ) : item.item_type === 'sub_assembly' || item.item_type === 'finished_good' ? (
                            <button
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                              onClick={(e) => { e.stopPropagation(); navigate(item.item_type === 'sub_assembly' ? '/sub-assembly-work-orders' : '/finished-good-work-orders', { state: { prefillItem: { item_id: item.id, item_code: item.item_code, description: item.description } } }); }}
                            >Raise AO</button>
                          ) : null}
                        </div>
                      </div>
                      {item.aimed_stock > 0 && (item.aimed_stock - item.effective_stock) > 0 && (
                        <p className="text-[9px] text-red-500 mt-0.5">
                          Order {Math.ceil(item.aimed_stock - item.effective_stock)} to reach aimed {item.aimed_stock}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Group 2 — Being Actioned (critical items with open PO/DC/AO) */}
              {actionedCount > 0 && (
                <div className="rounded-lg border-l-[3px] border-blue-400 bg-blue-50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Being Actioned</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-blue-600">{actionedCount}</span>
                  </div>
                  <p className="text-[10px] text-blue-500 mt-0.5">Open PO / DC / AO already raised</p>
                  {/* Actioned critical items with document badge */}
                  {(dashData?.criticalItems ?? []).filter(i => !!i.actionedWith).slice(0, 3).map((item, i) => (
                    <div key={i} className="mt-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-blue-800 truncate max-w-[110px] font-mono opacity-70">{item.item_code || item.description}</span>
                        {item.actionedWith === 'PO' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">PO Raised</span>}
                        {item.actionedWith === 'DC' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">DC Out</span>}
                        {item.actionedWith === 'AO' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">AO Raised</span>}
                      </div>
                      {item.aimed_stock > 0 && (item.aimed_stock - item.effective_stock) > 0 && (
                        <p className="text-[9px] text-blue-400 mt-0.5">
                          Order {Math.ceil(item.aimed_stock - item.effective_stock)} to reach aimed {item.aimed_stock}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* All healthy */}
              {criticalCount === 0 && actionedCount === 0 && (
                <div className="py-2">
                  <p className="text-2xl font-extrabold tracking-tight font-mono tabular-nums text-green-600">0</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">All healthy</p>
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100">
              <button
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                onClick={() => navigate("/procurement-intelligence")}
              >
                View full procurement intelligence →
              </button>
            </div>
          </div>

          {/* Financials card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Financials</p>
              <button className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors" onClick={() => navigate("/invoices")}>
                View →
              </button>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight my-2 font-mono tabular-nums">
              {formatCurrency(dashData?.thisMonthRevenue ?? 0)}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">This month's revenue</p>
            <div className="divide-y divide-slate-100">
              <LightStatRow label="Overdue Invoices" value={dashData?.overdueInvoiceCount ?? "—"} highlight={(dashData?.overdueInvoiceCount ?? 0) > 0} onClick={() => navigate("/invoices")} />
              <LightStatRow label="Overdue POs" value={dashData?.overduePOCount ?? "—"} highlight={(dashData?.overduePOCount ?? 0) > 0} onClick={() => navigate("/purchase-orders")} />
              <LightStatRow label="Open PO Value"    value={formatCurrency(dashData?.openPOValue ?? 0)} onClick={() => navigate("/purchase-orders")} />
              <LightStatRow label="FY Revenue"       value={formatCurrency(dashData?.fyRevenue ?? 0)} />
            </div>
          </div>

        </div>

        {/* ── Section 3: Finished Goods Ready to Ship ──────────────── */}
        {readyToShip.length > 0 && (
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

        {/* ── Section 4: Recent Activity Feed ──────────────────────── */}
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
