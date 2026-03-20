import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText, Truck, ShoppingCart, AlertTriangle,
  Receipt, Activity, Factory, Package, Clock, Layers, ClipboardCheck, ShoppingBag,
  TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/gst-utils";
import { fetchWipSummary, fetchWipRegister } from "@/lib/job-cards-api";
import { fetchStockStatus } from "@/lib/items-api";
import { fetchAssemblyOrderStats } from "@/lib/assembly-orders-api";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchRecentSalesOrders } from "@/lib/sales-orders-api";
import { fetchReorderSummary } from "@/lib/reorder-api";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentDoc {
  type: "INV" | "DC" | "PO";
  number: string | null;
  party: string | null;
  amount: number | null;
  status: string | null;
  updated_at: string;
  route: string;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchAnalytics() {
  const now = new Date();
  const startStr = format(startOfMonth(now), "yyyy-MM-dd");
  const endStr = format(now, "yyyy-MM-dd");
  const today = format(now, "yyyy-MM-dd");

  const [invsRes, openPOsRes, openDCsRes, recentInvsRes, recentDCsRes, recentPOsRes] =
    await Promise.all([
      // This month's invoices for GST
      supabase
        .from("invoices")
        .select("cgst_amount, sgst_amount, igst_amount, total_gst")
        .gte("invoice_date", startStr)
        .lte("invoice_date", endStr)
        .neq("status", "cancelled"),
      // Open POs
      supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, po_date, status, grand_total")
        .in("status", ["issued", "partially_received"])
        .order("po_date", { ascending: false })
        .limit(4),
      // DCs currently out
      supabase
        .from("delivery_challans")
        .select("id, dc_number, party_name, dc_date, return_due_date, status")
        .eq("status", "issued")
        .order("dc_date", { ascending: false })
        .limit(4),
      // Recent invoices for activity feed
      supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, grand_total, status, updated_at")
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(5),
      // Recent DCs for activity feed
      supabase
        .from("delivery_challans")
        .select("id, dc_number, party_name, grand_total, status, updated_at")
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(5),
      // Recent POs for activity feed
      supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, grand_total, status, updated_at")
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);

  const invoices = invsRes.data ?? [];
  const openPOs = openPOsRes.data ?? [];
  const openDCs = openDCsRes.data ?? [];

  const gstCGST = invoices.reduce((s, i) => s + (i.cgst_amount ?? 0), 0);
  const gstSGST = invoices.reduce((s, i) => s + (i.sgst_amount ?? 0), 0);
  const gstIGST = invoices.reduce((s, i) => s + (i.igst_amount ?? 0), 0);
  const gstTotal = gstCGST + gstSGST + gstIGST;

  const recentDocs: RecentDoc[] = [
    ...(recentInvsRes.data ?? []).map((d) => ({
      type: "INV" as const,
      number: d.invoice_number,
      party: d.customer_name,
      amount: d.grand_total,
      status: d.status,
      updated_at: d.updated_at,
      route: `/invoices/${d.id}`,
    })),
    ...(recentDCsRes.data ?? []).map((d) => ({
      type: "DC" as const,
      number: d.dc_number,
      party: d.party_name,
      amount: d.grand_total,
      status: d.status,
      updated_at: d.updated_at,
      route: `/delivery-challans/${d.id}`,
    })),
    ...(recentPOsRes.data ?? []).map((d) => ({
      type: "PO" as const,
      number: d.po_number,
      party: d.vendor_name,
      amount: d.grand_total,
      status: d.status,
      updated_at: d.updated_at,
      route: `/purchase-orders/${d.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return { gstCGST, gstSGST, gstIGST, gstTotal, openPOs, openDCs, recentDocs, today };
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

function daysOut(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

const typeTag: Record<string, { label: string; cls: string }> = {
  INV: { label: "INV", cls: "bg-emerald-100 text-emerald-800" },
  DC: { label: "DC", cls: "bg-amber-100 text-amber-800" },
  PO: { label: "PO", cls: "bg-blue-100 text-blue-800" },
};

const statusBadgeCls: Record<string, string> = {
  issued:            "bg-blue-50 text-blue-700 border border-blue-200",
  partially_received:"bg-amber-50 text-amber-700 border border-amber-200",
  fully_received:    "bg-green-50 text-green-700 border border-green-200",
  draft:             "bg-slate-100 text-slate-600 border border-slate-200",
  cancelled:         "bg-red-50 text-red-700 border border-red-200",
};

function StatusPill({ status }: { status: string | null }) {
  const cls = statusBadgeCls[status ?? ""] ?? "bg-slate-100 text-slate-600 border border-slate-200";
  const label = (status ?? "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics-v2"],
    queryFn: fetchAnalytics,
    refetchInterval: 60000,
  });

  const { data: wipSummary } = useQuery({
    queryKey: ["wip-summary-dashboard"],
    queryFn: fetchWipSummary,
    refetchInterval: 60000,
  });

  const { data: stockRows = [] } = useQuery({
    queryKey: ["stock_status"],
    queryFn: fetchStockStatus,
    refetchInterval: 60000,
  });
  const stockAlerts = stockRows.filter(
    (r) => r.stock_status === "amber" || r.stock_status === "red"
  ).length;

  const { data: wipRows = [] } = useQuery({
    queryKey: ["wip-register-dashboard"],
    queryFn: () => fetchWipRegister({}),
    refetchInterval: 30000,
  });
  const activeJCs = wipRows.slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = format(new Date(), "EEEE, d MMMM yyyy");

  const { data: aoStats } = useQuery({
    queryKey: ["ao-stats-dashboard"],
    queryFn: fetchAssemblyOrderStats,
    refetchInterval: 60000,
  });

  const { data: fatStats } = useQuery({
    queryKey: ["fat-stats-dashboard"],
    queryFn: fetchFatStats,
    refetchInterval: 60000,
  });

  const { data: recentSOs = [] } = useQuery({
    queryKey: ["recent-sales-orders-dashboard"],
    queryFn: () => fetchRecentSalesOrders(4),
    refetchInterval: 60000,
  });

  const { data: reorderSummary } = useQuery({
    queryKey: ["reorder-summary-dashboard"],
    queryFn: fetchReorderSummary,
    refetchInterval: 60000,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{todayStr}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* DEBUG: test rail mode toggle */}
          <Button
            className="bg-red-600 hover:bg-red-700 text-white h-9 font-bold"
            onClick={() => { localStorage.setItem("bizdocs_sidebar_mode", "rail"); window.location.reload(); }}
          >
            TEST RAIL
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white h-9 font-bold"
            onClick={() => { localStorage.setItem("bizdocs_sidebar_mode", "full"); window.location.reload(); }}
          >
            TEST FULL
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9 shadow-sm font-semibold"
            onClick={() => navigate("/job-cards")}
          >
            <Activity className="h-3.5 w-3.5" /> New Work Order
          </Button>
          <Button
            className="h-9 gap-1.5 bg-white border border-slate-300 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-all text-slate-700"
            onClick={() => navigate("/purchase-orders/new")}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> PO
          </Button>
          <Button
            className="h-9 gap-1.5 bg-white border border-slate-300 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-all text-slate-700"
            onClick={() => navigate("/delivery-challans/new")}
          >
            <Truck className="h-3.5 w-3.5" /> DC
          </Button>
          <Button
            className="h-9 gap-1.5 bg-white border border-slate-300 shadow-sm hover:border-blue-400 hover:text-blue-600 transition-all text-slate-700"
            onClick={() => navigate("/invoices/new")}
          >
            <FileText className="h-3.5 w-3.5" /> Invoice
          </Button>
        </div>
      </div>

      {/* ── ZONE 1: OPERATIONAL ALERTS ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

        {/* At Vendors */}
        <div
          className="rounded-xl bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden"
          onClick={() => navigate("/wip-register?location=at_vendor")}
        >
          <Truck className="absolute top-2 right-3 h-12 w-12 text-blue-600 opacity-10 pointer-events-none" />
          <div className="flex flex-col justify-between h-full relative">
            <div>
              <span className="text-[11px] font-bold tracking-widest uppercase opacity-80 text-blue-600">AT VENDORS</span>
              <p className="text-4xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                {wipSummary?.atVendor ?? "—"}
              </p>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-blue-600">components out for job work</p>
              <span className="text-xs font-medium text-blue-500">View →</span>
            </div>
          </div>
        </div>

        {/* Overdue Returns */}
        {(() => {
          const n = wipSummary?.overdueReturns ?? 0;
          const isAlert = n > 0;
          return (
            <div
              className={`rounded-xl border border-l-4 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden ${
                isAlert
                  ? "bg-red-50 border-red-200 border-l-red-500"
                  : "bg-green-50 border-green-200 border-l-green-500"
              }`}
              onClick={() => navigate("/wip-register?overdue=true")}
            >
              <AlertTriangle className={`absolute top-2 right-3 h-12 w-12 opacity-10 pointer-events-none ${isAlert ? "text-red-600" : "text-green-600"}`} />
              <div className="flex flex-col justify-between h-full relative">
                <div>
                  <span className={`text-[11px] font-bold tracking-widest uppercase opacity-80 ${isAlert ? "text-red-600" : "text-green-600"}`}>
                    OVERDUE RETURNS
                  </span>
                  <p className={`text-4xl font-bold font-mono tabular-nums mt-1 ${isAlert ? "text-red-700" : "text-green-700"}`}>
                    {wipSummary ? n : "—"}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${isAlert ? "text-red-600" : "text-green-600"}`}>
                    {isAlert ? "past expected return date" : "all returns on time"}
                  </p>
                  <span className={`text-xs font-medium ${isAlert ? "text-red-500" : "text-green-500"}`}>View →</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Stock Alerts */}
        {(() => {
          const isAlert = stockAlerts > 0;
          return (
            <div
              className={`rounded-xl border border-l-4 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden ${
                isAlert
                  ? "bg-amber-50 border-amber-200 border-l-amber-500"
                  : "bg-green-50 border-green-200 border-l-green-500"
              }`}
              onClick={() => navigate("/stock-register")}
            >
              <Package className={`absolute top-2 right-3 h-12 w-12 opacity-10 pointer-events-none ${isAlert ? "text-amber-600" : "text-green-600"}`} />
              <div className="flex flex-col justify-between h-full relative">
                <div>
                  <span className={`text-[11px] font-bold tracking-widest uppercase opacity-80 ${isAlert ? "text-amber-600" : "text-green-600"}`}>
                    STOCK ALERTS
                  </span>
                  <p className={`text-4xl font-bold font-mono tabular-nums mt-1 ${isAlert ? "text-amber-700" : "text-green-700"}`}>
                    {stockAlerts}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${isAlert ? "text-amber-600" : "text-green-600"}`}>
                    {isAlert ? "items below minimum stock" : "all stock levels healthy"}
                  </p>
                  <span className={`text-xs font-medium ${isAlert ? "text-amber-500" : "text-green-500"}`}>View →</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Assembly Orders */}
        <div
          className="rounded-xl bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden"
          onClick={() => navigate("/assembly-orders")}
        >
          <Layers className="absolute top-2 right-3 h-12 w-12 text-blue-600 opacity-10 pointer-events-none" />
          <div className="flex flex-col justify-between h-full relative">
            <div>
              <span className="text-[11px] font-bold tracking-widest uppercase opacity-80 text-blue-600">ASSEMBLY ORDERS</span>
              <p className="text-4xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                {aoStats?.active ?? "—"}
              </p>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-blue-600">in progress</p>
              <span className="text-xs font-medium text-blue-500">View →</span>
            </div>
          </div>
        </div>

        {/* FAT Pending */}
        {(() => {
          const n = fatStats?.pending ?? 0;
          const isAlert = n > 0;
          return (
            <div
              className={`rounded-xl border border-l-4 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden ${
                isAlert
                  ? "bg-red-50 border-red-200 border-l-red-500"
                  : "bg-green-50 border-green-200 border-l-green-500"
              }`}
              onClick={() => navigate("/fat-certificates")}
            >
              <ClipboardCheck className={`absolute top-2 right-3 h-12 w-12 opacity-10 pointer-events-none ${isAlert ? "text-red-600" : "text-green-600"}`} />
              <div className="flex flex-col justify-between h-full relative">
                <div>
                  <span className={`text-[11px] font-bold tracking-widest uppercase opacity-80 ${isAlert ? "text-red-600" : "text-green-600"}`}>
                    FAT PENDING
                  </span>
                  <p className={`text-4xl font-bold font-mono tabular-nums mt-1 ${isAlert ? "text-red-700" : "text-green-700"}`}>
                    {fatStats ? n : "—"}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${isAlert ? "text-red-600" : "text-green-600"}`}>
                    {isAlert ? "awaiting test results" : "all FATs complete"}
                  </p>
                  <span className={`text-xs font-medium ${isAlert ? "text-red-500" : "text-green-500"}`}>View →</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Reorder Alerts */}
        {(() => {
          const critical = reorderSummary?.critical ?? 0;
          const warning = reorderSummary?.warning ?? 0;
          const total = critical + warning;
          const color = critical > 0 ? "red" : warning > 0 ? "amber" : "green";
          const colorMap = {
            red:   { bg: "bg-red-50",   border: "border-red-200 border-l-red-500",   text: "text-red-600",   num: "text-red-700",   sub: "text-red-600",   arrow: "text-red-500" },
            amber: { bg: "bg-amber-50", border: "border-amber-200 border-l-amber-500", text: "text-amber-600", num: "text-amber-700", sub: "text-amber-600", arrow: "text-amber-500" },
            green: { bg: "bg-green-50", border: "border-green-200 border-l-green-500", text: "text-green-600", num: "text-green-700", sub: "text-green-600", arrow: "text-green-500" },
          };
          const c = colorMap[color];
          return (
            <div
              className={`rounded-xl ${c.bg} border ${c.border} border-l-4 shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 min-h-[110px] relative overflow-hidden`}
              onClick={() => navigate("/reorder-intelligence")}
            >
              <TrendingDown className={`absolute top-2 right-3 h-12 w-12 opacity-10 pointer-events-none ${c.text}`} />
              <div className="flex flex-col justify-between h-full relative">
                <div>
                  <span className={`text-[11px] font-bold tracking-widest uppercase opacity-80 ${c.text}`}>
                    REORDER ALERTS
                  </span>
                  <p className={`text-4xl font-bold font-mono tabular-nums mt-1 ${c.num}`}>
                    {reorderSummary ? total : "—"}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${c.sub}`}>
                    {total === 0 ? "all stock levels healthy" : `${critical} critical · ${warning} warning`}
                  </p>
                  <span className={`text-xs font-medium ${c.arrow}`}>View →</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── ZONE 2: ACTIVE WORK ORDERS ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="font-semibold text-slate-900">Active Work Orders</h2>
          </div>
          <div className="flex items-center gap-3">
            {wipRows.length > 0 && (
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {wipRows.length} active
              </span>
            )}
            <button
              className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
              onClick={() => navigate("/job-cards")}
            >
              View all →
            </button>
          </div>
        </div>

        {activeJCs.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium text-sm">No active work orders</p>
            <p className="text-slate-400 text-xs mt-1">Create one to start tracking components.</p>
            <Button
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              size="sm"
              onClick={() => navigate("/job-cards")}
            >
              <Activity className="h-3.5 w-3.5" /> New Work Order
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>JC #</th>
                  <th>Component</th>
                  <th>Batch</th>
                  <th>Location</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Cost So Far</th>
                  <th className="text-right">Days Active</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeJCs.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/job-cards/${row.id}`)}
                  >
                    <td>
                      <span className="font-mono text-blue-600 font-medium text-sm">
                        {row.jc_number}
                      </span>
                    </td>
                    <td>
                      <p className="font-medium text-sm text-slate-800 truncate max-w-[160px]">
                        {row.item_description ?? row.item_code ?? "—"}
                      </p>
                      {row.item_code && row.item_description && (
                        <p className="text-xs text-slate-400 font-mono">{row.item_code}</p>
                      )}
                    </td>
                    <td className="text-slate-500 text-sm">{row.batch_ref ?? "—"}</td>
                    <td>
                      {row.current_location === "at_vendor" ? (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className="text-sm text-blue-600 font-medium truncate max-w-[120px]">
                            {row.current_vendor_name ?? "Vendor"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Factory className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-sm text-slate-500">In House</span>
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm text-slate-700">
                      {row.quantity_accepted}
                      <span className="text-slate-400">/{row.quantity_original}</span>
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm font-medium text-slate-900">
                      {formatCurrency(row.total_cost)}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1 text-sm text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        {row.days_active}d
                      </div>
                    </td>
                    <td>
                      {row.status === "on_hold" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          On Hold
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                          In Progress
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ZONE 3: TWO-COLUMN GRID ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* LEFT COLUMN */}
        <div className="space-y-4">

          {/* Card A: Open Purchase Orders */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900 text-sm">Purchase Orders</h3>
                {(analytics?.openPOs?.length ?? 0) > 0 && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {analytics!.openPOs.length}
                  </span>
                )}
              </div>
              <button
                className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                onClick={() => navigate("/purchase-orders")}
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {!analytics?.openPOs?.length ? (
                <div className="px-5 py-6 text-center text-sm text-slate-400">
                  No open purchase orders
                </div>
              ) : (
                analytics.openPOs.map((po) => (
                  <div
                    key={po.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/purchase-orders/${po.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-blue-600 font-medium text-sm">{po.po_number}</span>
                        <span className="text-slate-500 text-sm truncate">{po.vendor_name ?? "—"}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {format(new Date(po.po_date), "dd MMM yyyy")}
                        {po.grand_total ? ` · ${formatCurrency(po.grand_total)}` : ""}
                      </p>
                    </div>
                    <StatusPill status={po.status} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card SO: Sales Orders */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900 text-sm">Sales Orders</h3>
                {recentSOs.length > 0 && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {recentSOs.length}
                  </span>
                )}
              </div>
              <button
                className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                onClick={() => navigate("/sales-orders")}
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {recentSOs.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-slate-400">
                  No confirmed sales orders
                </div>
              ) : (
                recentSOs.map((so: any) => (
                  <div
                    key={so.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/sales-orders/${so.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-blue-600 font-medium text-sm">{so.so_number}</span>
                        <span className="text-slate-500 text-sm truncate">{so.customer_name ?? "—"}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {so.so_date ? format(new Date(so.so_date), "dd MMM yyyy") : ""}
                        {so.grand_total ? ` · ${formatCurrency(so.grand_total)}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      so.status === "in_production"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {so.status === "in_production" ? "In Production" : "Confirmed"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card B: Delivery Challans Out */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900 text-sm">Delivery Challans Out</h3>
                {(analytics?.openDCs?.length ?? 0) > 0 && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {analytics!.openDCs.length}
                  </span>
                )}
              </div>
              <button
                className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                onClick={() => navigate("/delivery-challans")}
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {!analytics?.openDCs?.length ? (
                <div className="px-5 py-6 text-center text-sm text-slate-400">
                  No delivery challans currently out
                </div>
              ) : (
                analytics.openDCs.map((dc) => {
                  const isOverdue =
                    dc.return_due_date != null && dc.return_due_date < (analytics.today ?? "");
                  const out = daysOut(dc.dc_date);
                  return (
                    <div
                      key={dc.id}
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${isOverdue ? "bg-amber-50/60" : ""}`}
                      onClick={() => navigate(`/delivery-challans/${dc.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-blue-600 font-medium text-sm">{dc.dc_number}</span>
                          <span className="text-slate-500 text-sm truncate">{dc.party_name ?? "—"}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {dc.return_due_date
                            ? `Due ${format(new Date(dc.return_due_date), "dd MMM yyyy")}`
                            : `Issued ${format(new Date(dc.dc_date), "dd MMM yyyy")}`}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium tabular-nums whitespace-nowrap ${isOverdue ? "text-amber-700 font-semibold" : "text-slate-400"}`}
                      >
                        {out}d out{isOverdue ? " ⚠" : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* Card A: GST Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Receipt className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900 text-sm">GST Summary</h3>
              <span className="text-xs text-slate-400 font-normal ml-1">this month</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "CGST", value: analytics?.gstCGST ?? 0, dot: "bg-blue-500" },
                { label: "SGST", value: analytics?.gstSGST ?? 0, dot: "bg-teal-500" },
                { label: "IGST", value: analytics?.gstIGST ?? 0, dot: "bg-violet-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-sm ${item.dot}`} />
                    <span className="text-sm text-slate-500">{item.label}</span>
                  </div>
                  <span className="font-mono text-sm font-medium text-slate-800">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Total GST</span>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {formatCurrency(analytics?.gstTotal ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Card B: Recent Activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Activity className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900 text-sm">Recent Activity</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {!analytics?.recentDocs?.length ? (
                <div className="px-5 py-6 text-center text-sm text-slate-400">
                  No recent activity
                </div>
              ) : (
                analytics.recentDocs.map((doc, i) => {
                  const tag = typeTag[doc.type];
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors group"
                      onClick={() => navigate(doc.route)}
                    >
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.cls} shrink-0`}>
                        {tag.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {doc.number ?? "—"}
                          {doc.amount ? (
                            <span className="text-slate-400 font-normal ml-1.5 font-mono text-xs">
                              {formatCurrency(doc.amount)}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{doc.party ?? "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">{timeAgo(doc.updated_at)}</p>
                        <p className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          View
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
