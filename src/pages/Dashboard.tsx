import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/gst-utils";
import { fetchWipSummary } from "@/lib/job-works-api";
import { fetchAssemblyOrderStats } from "@/lib/assembly-orders-api";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchReorderAlerts, fetchProductionAlertCount } from "@/lib/reorder-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchAllAuditLog, type AuditEntry } from "@/lib/audit-api";
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
  zeroStockCount: number;
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

  const [invsRes, openPOsRes, openDCsRes, itemsRes] = await Promise.all([
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
    supabase
      .from("items")
      .select("item_type, current_stock")
      .eq("is_active", true),
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
  const zeroStockCount = items.filter((i) => (i.current_stock ?? 0) === 0).length;

  return {
    thisMonthRevenue, fyRevenue, overdueInvoiceCount,
    openPOValue, overdueDCCount,
    rawMaterialCount, componentCount, finishedGoodCount, zeroStockCount,
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
  job_work:         { cls: "bg-violet-100 text-violet-800",  label: "JW"  },
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
  const STALE = 5 * 60 * 1000;

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-db"],
    queryFn: fetchCompanySettings,
    staleTime: Infinity,
  });
  const { data: wipSummary } = useQuery({
    queryKey: ["wip-summary-db"],
    queryFn: fetchWipSummary,
    staleTime: STALE,
    refetchInterval: STALE,
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
  const { data: reorderAlerts = [] } = useQuery({
    queryKey: ["reorder-alerts-db"],
    queryFn: fetchReorderAlerts,
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
  const { data: productionRequired = 0 } = useQuery({
    queryKey: ["production-alert-count-db"],
    queryFn: fetchProductionAlertCount,
    staleTime: STALE,
    refetchInterval: STALE,
  });

  // Derived alert counts
  const overdueDCReturns  = dashData?.overdueDCCount ?? 0;
  const jobWorksOverdue   = wipSummary?.overdueReturns ?? 0;
  const zeroStockItems    = dashData?.zeroStockCount ?? 0;
  const reorderAlertCount = reorderAlerts.length;
  const fatPending        = fatStats?.pending ?? 0;
  const uninvoicedUnits   = readyToShip.length;
  const readyToAssemble   = aoStats?.draft ?? 0;

  const totalAlerts = overdueDCReturns + jobWorksOverdue + zeroStockItems + reorderAlertCount + fatPending + uninvoicedUnits + productionRequired;
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
                  route: "/grn/new",
                  state: undefined as any,
                  title: "GRN — Goods Receipt",
                  body: "Use this when purchased materials arrive at the factory. Link to the original PO and record accepted vs rejected quantities. Stock updates automatically.",
                },
                {
                  label: "New Job Work",
                  route: "/job-works",
                  state: { openNew: true },
                  title: "Job Work",
                  body: "Use this when sending a component to a vendor for external processing — CNC machining, plating, welding. One Job Work per component per batch.",
                },
                {
                  label: "New DC",
                  route: "/delivery-challans/new",
                  state: undefined as any,
                  title: "Delivery Challan",
                  body: "Use this when goods are physically leaving the factory — for job work (returnable) or delivery to a customer (non-returnable).",
                },
                {
                  label: "Start Production",
                  route: "/assembly-orders",
                  state: { openNew: true },
                  title: "Start Production Run",
                  body: "Use this when finished goods stock falls below minimum levels. Serial numbers are generated immediately at the start of the run and FAT certificates are pre-created as drafts.",
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
            {jobWorksOverdue > 0 && (
              <AlertPill label="Job Works Overdue"  count={jobWorksOverdue}  colour="red"   onClick={() => navigate("/wip-register?overdue=true")} />
            )}
            {zeroStockItems > 0 && (
              <AlertPill label="Zero Stock Items"   count={zeroStockItems}   colour="red"   onClick={() => navigate("/stock-register")} />
            )}
            {reorderAlertCount > 0 && (
              <AlertPill label="Reorder Alerts"     count={reorderAlertCount} colour="amber" onClick={() => navigate("/reorder-intelligence")} />
            )}
            {fatPending > 0 && (
              <AlertPill label="FAT Pending"        count={fatPending}       colour="amber" onClick={() => navigate("/fat-certificates")} />
            )}
            {uninvoicedUnits > 0 && (
              <AlertPill label="Ready to Invoice"   count={uninvoicedUnits}  colour="amber" onClick={() => navigate("/fat-certificates")} />
            )}
            {productionRequired > 0 && (
              <AlertPill label="Production Required" count={productionRequired} colour="amber" onClick={() => navigate("/reorder-intelligence")} />
            )}
            {readyToAssemble > 0 && (
              <AlertPill label="Ready to Assemble"  count={readyToAssemble}  colour="green" onClick={() => navigate("/assembly-orders")} />
            )}
          </div>
        )}

        {/* ── Section 2: Three-column stats grid ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Production card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Production</p>
              <button className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors" onClick={() => navigate("/job-works")}>
                View →
              </button>
            </div>
            <div className="divide-y divide-slate-100 mt-2">
              <LightStatRow label="Active Job Works"   value={wipSummary?.atVendor ?? "—"}         onClick={() => navigate("/job-works")} />
              <LightStatRow label="Overdue Returns"    value={wipSummary?.overdueReturns ?? "—"}    highlight={(wipSummary?.overdueReturns ?? 0) > 0} onClick={() => navigate("/wip-register?overdue=true")} />
              <LightStatRow label="Assembly Orders"    value={aoStats?.active ?? "—"}               onClick={() => navigate("/assembly-orders")} />
              <LightStatRow label="FAT Pending"        value={fatStats?.pending ?? "—"}             highlight={(fatStats?.pending ?? 0) > 0} onClick={() => navigate("/fat-certificates")} />
            </div>
          </div>

          {/* Stock card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Stock</p>
              <button className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors" onClick={() => navigate("/stock-register")}>
                View →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              <LightStatRow label="Raw Materials (in stock)"  value={dashData?.rawMaterialCount  ?? "—"} onClick={() => navigate("/stock-register?type=raw_material")} />
              <LightStatRow label="Components (in stock)"     value={dashData?.componentCount    ?? "—"} onClick={() => navigate("/stock-register?type=component")} />
              <LightStatRow label="Finished Goods (in stock)" value={dashData?.finishedGoodCount ?? "—"} onClick={() => navigate("/stock-register?type=finished_good")} />
              <LightStatRow label="Reorder Alerts"            value={reorderAlertCount}           highlight={reorderAlertCount > 0} onClick={() => navigate("/reorder-intelligence")} />
              <LightStatRow label="Zero Stock Items"          value={dashData?.zeroStockCount ?? "—"} highlight={(dashData?.zeroStockCount ?? 0) > 0} onClick={() => navigate("/stock-register")} />
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
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>Serial #</th>
                    <th>Item Code</th>
                    <th>Description</th>
                    <th className="text-right">Age</th>
                    <th className="w-36">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {readyToShip.map((sn) => {
                    const age = daysSince(sn.fat_completed_at ?? sn.created_at);
                    return (
                      <tr key={sn.id} className={age > 30 ? "bg-amber-50/50" : ""}>
                        <td className="font-mono text-sm font-semibold text-slate-800">{sn.serial_number}</td>
                        <td className="font-mono text-xs text-slate-500">{sn.item_code ?? "—"}</td>
                        <td className="text-sm text-slate-700">{sn.item_description ?? "—"}</td>
                        <td className="text-right">
                          <span className={`text-sm font-mono tabular-nums ${age > 30 ? "text-amber-700 font-semibold" : "text-slate-600"}`}>
                            {age}d
                          </span>
                        </td>
                        <td>
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
