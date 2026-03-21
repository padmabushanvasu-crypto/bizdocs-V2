import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText, Truck, ShoppingCart,
  Activity, Factory, Clock, Layers, ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/gst-utils";
import { fetchWipSummary, fetchWipRegister } from "@/lib/job-cards-api";
import { fetchAssemblyOrderStats } from "@/lib/assembly-orders-api";
import { fetchFatStats } from "@/lib/fat-api";
import { fetchRecentSalesOrders } from "@/lib/sales-orders-api";
import { fetchReorderSummary, fetchReorderAlerts } from "@/lib/reorder-api";
import { fetchCompanySettings } from "@/lib/settings-api";
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
      supabase
        .from("invoices")
        .select("cgst_amount, sgst_amount, igst_amount, total_gst")
        .gte("invoice_date", startStr)
        .lte("invoice_date", endStr)
        .neq("status", "cancelled"),
      supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, po_date, status, grand_total")
        .in("status", ["issued", "partially_received"])
        .order("po_date", { ascending: false })
        .limit(4),
      supabase
        .from("delivery_challans")
        .select("id, dc_number, party_name, dc_date, return_due_date, status")
        .eq("status", "issued")
        .order("dc_date", { ascending: false })
        .limit(4),
      supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, grand_total, status, updated_at")
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("delivery_challans")
        .select("id, dc_number, party_name, grand_total, status, updated_at")
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(5),
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
    .slice(0, 8);

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
  DC:  { label: "DC",  cls: "bg-amber-100 text-amber-800" },
  PO:  { label: "PO",  cls: "bg-blue-100 text-blue-800" },
};

// Badge shown inside dark panels — green if zero, red if non-zero
function StatBadge({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  if (count === 0) {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/12 text-green-400 border border-green-500/20 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> clear
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
      {count}
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

  const { data: wipRows = [] } = useQuery({
    queryKey: ["wip-register-dashboard"],
    queryFn: () => fetchWipRegister({}),
    refetchInterval: 30000,
  });
  const activeJCs = wipRows.slice(0, 6);

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

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-dashboard"],
    queryFn: fetchCompanySettings,
    staleTime: 300000,
  });

  const { data: reorderAlerts = [] } = useQuery({
    queryKey: ["dashboard-reorder-alerts"],
    queryFn: fetchReorderAlerts,
    staleTime: 5 * 60 * 1000,
  });

  const criticalCount = reorderAlerts.filter((a) => a.alert_level === "critical").length;

  const hour = new Date().getHours();
  const greetingWord = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayStr = format(new Date(), "EEEE, d MMMM yyyy");
  const companyName = companySettings?.company_name ?? "BizDocs";

  // Critical alert count for the header pill
  const overdueReturns = wipSummary?.overdueReturns ?? 0;
  const fatPending = fatStats?.pending ?? 0;
  const reorderCritical = reorderSummary?.critical ?? 0;
  const totalAlerts = overdueReturns + fatPending + reorderCritical;
  const allClear = totalAlerts === 0;

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── ZONE 1: DARK TOP SECTION ─────────────────────────────────────── */}
      <div
        className="px-4 pt-5 pb-7 lg:px-7 lg:pt-6 lg:pb-8"
        style={{ backgroundColor: "#0F172A" }}
      >
        {/* Header row — stacks on mobile, side-by-side on desktop */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">

          {/* Company info */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-1">
              {greetingWord}
            </p>
            <h1 className="text-lg lg:text-xl font-bold text-slate-100 tracking-tight">{companyName}</h1>
            <p className="text-xs text-slate-600 mt-0.5">{todayStr}</p>
          </div>

          {/* Alert pill + action buttons */}
          <div className="flex flex-col gap-2 lg:items-end">
            {/* Alert pill */}
            {allClear ? (
              <span className="self-start flex items-center gap-1.5 text-xs font-medium text-green-400 px-3 py-1 rounded-full border w-fit"
                style={{ backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.2)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                All clear
              </span>
            ) : (
              <span className="self-start flex items-center gap-1.5 text-xs font-medium text-red-400 px-3 py-1 rounded-full border w-fit"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {totalAlerts} alert{totalAlerts !== 1 ? "s" : ""}
              </span>
            )}

            {/* Buttons — horizontally scrollable on mobile, wrapping on desktop */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-x-visible lg:flex-wrap lg:justify-end">
              <button
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0"
                style={{ backgroundColor: "#2563EB" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#1D4ED8")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#2563EB")}
                onClick={() => navigate("/job-cards/new")}
              >
                <Activity className="h-3.5 w-3.5" />
                New Work Order
              </button>
              {[
                { label: "PO", route: "/purchase-orders/new" },
                { label: "DC", route: "/delivery-challans/new" },
                { label: "Invoice", route: "/invoices/new" },
              ].map((btn) => (
                <button
                  key={btn.label}
                  className="rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)")}
                  onClick={() => navigate(btn.route)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Three stat panels — single column on mobile, 3-col on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-5">

          {/* Panel 1 — Production */}
          <div
            className="rounded-xl p-4 lg:p-5"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-4">
              Production
            </p>
            <div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-400">Work Orders</span>
                <span className="text-xl font-bold text-slate-100 font-mono tabular-nums">
                  {wipSummary?.atVendor !== undefined ? activeJCs.length : "—"}
                </span>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-400">Assembly Orders</span>
                <span className="text-xl font-bold text-slate-100 font-mono tabular-nums">
                  {aoStats?.active ?? "—"}
                </span>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-400">FAT Pending</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-slate-100 font-mono tabular-nums">
                    {fatStats ? fatStats.pending : "—"}
                  </span>
                  <StatBadge count={fatStats?.pending} />
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2 — Purchasing & Stock */}
          <div
            className="rounded-xl p-4 lg:p-5"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-4">
              Purchasing & Stock
            </p>
            <div>
              <div className="flex items-center justify-between py-2.5 cursor-pointer group" onClick={() => navigate("/wip-register?location=at_vendor")}>
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">At Vendors</span>
                <span className="text-xl font-bold text-slate-100 font-mono tabular-nums">
                  {wipSummary?.atVendor ?? "—"}
                </span>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />
              <div className="flex items-center justify-between py-2.5 cursor-pointer group" onClick={() => navigate("/wip-register?overdue=true")}>
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Overdue Returns</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-slate-100 font-mono tabular-nums">
                    {wipSummary ? wipSummary.overdueReturns : "—"}
                  </span>
                  <StatBadge count={wipSummary?.overdueReturns} />
                </div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-400">Reorder Alerts</span>
                {reorderAlerts.length === 0 ? (
                  <span style={{ fontSize: "10px", color: "#22C55E" }}>all healthy ✓</span>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 8px", borderRadius: "9999px", backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>
                      {reorderAlerts.length}
                    </span>
                    <span style={{ fontSize: "10px", color: "#EF4444" }}>↓ see below</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel 3 — GST This Month */}
          <div
            className="rounded-xl p-4 lg:p-5"
            style={{
              background: "linear-gradient(135deg, rgba(37,99,235,0.25), rgba(29,78,216,0.15))",
              border: "1px solid rgba(37,99,235,0.35)",
            }}
          >
            <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold mb-2">
              GST This Month
            </p>
            <p className="text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight mb-4 font-mono tabular-nums">
              {formatCurrency(analytics?.gstTotal ?? 0)}
            </p>
            <div className="space-y-2">
              {[
                { label: "CGST", value: analytics?.gstCGST ?? 0, dot: "bg-blue-500" },
                { label: "SGST", value: analytics?.gstSGST ?? 0, dot: "bg-emerald-500" },
                { label: "IGST", value: analytics?.gstIGST ?? 0, dot: "bg-violet-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                    <span className="text-xs text-blue-300/70">{item.label}</span>
                  </div>
                  <span className="text-sm text-slate-200 font-medium font-mono tabular-nums">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Reorder Alerts Widget — only shown when alerts exist */}
        {reorderAlerts.length > 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              padding: "16px",
              marginTop: "12px",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  className={criticalCount > 0 ? "animate-pulse" : ""}
                  style={{
                    height: "6px",
                    width: "6px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: criticalCount > 0 ? "#EF4444" : "#F59E0B",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: "10px", color: "#CBD5E1", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                  Reorder Alerts
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: "9999px",
                    backgroundColor: criticalCount > 0 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: criticalCount > 0 ? "#FCA5A5" : "#FCD34D",
                  }}
                >
                  {reorderAlerts.length}
                </span>
              </div>
              <button
                style={{ fontSize: "12px", color: "#60A5FA", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => navigate("/reorder-intelligence")}
              >
                See all {reorderAlerts.length} →
              </button>
            </div>

            {/* Items list */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "198px",
                overflowY: reorderAlerts.length > 3 ? "auto" : "visible",
                paddingRight: reorderAlerts.length > 3 ? "4px" : "0",
              }}
            >
              {reorderAlerts.map((alert) => {
                const isCritical = alert.alert_level === "critical";
                return (
                  <div
                    key={alert.item_id}
                    style={{
                      background: isCritical ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
                      border: `1px solid ${isCritical ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
                      borderRadius: "8px",
                      padding: "9px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {/* Item info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: isCritical ? "#FCA5A5" : "#FCD34D",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          margin: 0,
                        }}
                      >
                        {alert.item_description}
                      </p>
                      <p style={{ fontSize: "11px", color: "#64748B", margin: 0 }}>
                        Stock: {alert.current_stock} · Min: {alert.min_stock}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: "9999px",
                        flexShrink: 0,
                        backgroundColor: isCritical ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                        color: isCritical ? "#FCA5A5" : "#FCD34D",
                      }}
                    >
                      {isCritical ? "Critical" : "Warning"}
                    </span>

                    {/* Raise PO button */}
                    <button
                      style={{
                        background: "rgba(37,99,235,0.15)",
                        border: "1px solid rgba(37,99,235,0.3)",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "11px",
                        color: "#60A5FA",
                        flexShrink: 0,
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        navigate("/purchase-orders/new", {
                          state: {
                            vendor_id: alert.preferred_vendor_id,
                            items: [{ item_id: alert.item_id, description: alert.item_description, qty: alert.recommended_order_qty }],
                          },
                        })
                      }
                    >
                      Raise PO
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Scroll hint */}
            {reorderAlerts.length > 3 && (
              <p style={{ textAlign: "center", color: "#475569", fontSize: "10px", marginTop: "6px" }}>
                Scroll to see all {reorderAlerts.length} alerts
              </p>
            )}
          </div>
        )}

      </div>

      {/* ── ZONE 2: LIGHT CONTENT AREA ───────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 lg:px-7 lg:py-5" style={{ backgroundColor: "#F1F5F9" }}>
        {/* Single column on mobile, two-column on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 min-w-0">

            {/* Card: Active Work Orders */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <h2 className="font-semibold text-slate-900">Active Work Orders</h2>
                  {activeJCs.length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      {activeJCs.length}
                    </span>
                  )}
                </div>
                <button
                  className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
                  onClick={() => navigate("/job-cards")}
                >
                  View all →
                </button>
              </div>

              {activeJCs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No active work orders — factory floor is clear
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full data-table">
                    <thead>
                      <tr>
                        <th>JC #</th>
                        <th>Component</th>
                        <th>Location</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Cost</th>
                        <th className="text-right">Days</th>
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
                            <span className="font-mono text-blue-600 font-medium text-sm">{row.jc_number}</span>
                          </td>
                          <td>
                            <p className="font-medium text-sm text-slate-800 truncate max-w-[160px]">
                              {row.item_description ?? row.item_code ?? "—"}
                            </p>
                            {row.item_code && row.item_description && (
                              <p className="text-xs text-slate-400 font-mono">{row.item_code}</p>
                            )}
                          </td>
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

            {/* Card row: Purchase Orders + Sales Orders — 1 col on mobile, 2 on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Purchase Orders */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900 text-sm">Purchase Orders</h3>
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
                    <p className="text-sm text-slate-400 py-4 text-center">No open purchase orders</p>
                  ) : (
                    analytics.openPOs.map((po) => (
                      <div
                        key={po.id}
                        className="flex items-center justify-between py-2.5 hover:bg-slate-50 -mx-1 px-1 rounded cursor-pointer transition-colors"
                        onClick={() => navigate(`/purchase-orders/${po.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-blue-600 font-medium text-sm truncate">{po.po_number}</p>
                          <p className="text-xs text-slate-400 truncate">{po.vendor_name ?? "—"}</p>
                        </div>
                        <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">
                          {po.grand_total ? formatCurrency(po.grand_total) : "—"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Sales Orders */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900 text-sm">Sales Orders</h3>
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
                    <p className="text-sm text-slate-400 py-4 text-center">No confirmed sales orders</p>
                  ) : (
                    recentSOs.map((so: any) => (
                      <div
                        key={so.id}
                        className="flex items-center justify-between py-2.5 hover:bg-slate-50 -mx-1 px-1 rounded cursor-pointer transition-colors"
                        onClick={() => navigate(`/sales-orders/${so.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-blue-600 font-medium text-sm truncate">{so.so_number}</p>
                          <p className="text-xs text-slate-400 truncate">{so.customer_name ?? "—"}</p>
                        </div>
                        <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">
                          {so.grand_total ? formatCurrency(so.grand_total) : "—"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Card: Delivery Challans Out */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-900 text-sm">Delivery Challans Out</h3>
                  {(analytics?.openDCs?.length ?? 0) > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
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
                  <p className="text-sm text-slate-400 py-4 text-center">No delivery challans currently out</p>
                ) : (
                  analytics.openDCs.map((dc) => {
                    const isOverdue = dc.return_due_date != null && dc.return_due_date < (analytics.today ?? "");
                    const out = daysOut(dc.dc_date);
                    return (
                      <div
                        key={dc.id}
                        className={`flex items-center gap-3 py-2.5 hover:bg-slate-50 -mx-1 px-1 rounded cursor-pointer transition-colors ${isOverdue ? "bg-amber-50/60" : ""}`}
                        onClick={() => navigate(`/delivery-challans/${dc.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-blue-600 font-medium text-sm">{dc.dc_number}</span>
                            <span className="text-slate-500 text-sm truncate">{dc.party_name ?? "—"}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {dc.return_due_date
                              ? `Due ${format(new Date(dc.return_due_date), "dd MMM yyyy")}`
                              : `Issued ${format(new Date(dc.dc_date), "dd MMM yyyy")}`}
                          </p>
                        </div>
                        <span className={`text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${isOverdue ? "text-amber-700 font-semibold" : "text-slate-400"}`}>
                          {out}d out{isOverdue ? " ⚠" : ""}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN — full width on mobile, 320px fixed on desktop ── */}
          <div className="flex flex-col gap-3 w-full lg:w-[320px] lg:shrink-0">

            {/* Card: Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {!analytics?.recentDocs?.length ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No recent activity</p>
                ) : (
                  analytics.recentDocs.map((doc, i) => {
                    const tag = typeTag[doc.type];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer transition-colors group"
                        onClick={() => navigate(doc.route)}
                      >
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${tag.cls}`}>
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

            {/* Card: Assembly Orders quick stat */}
            <div
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/assembly-orders")}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="h-4 w-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900 text-sm">Assembly Orders</h3>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    {aoStats?.active ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">active orders</p>
                </div>
                <span className="text-xs text-blue-600 font-medium">View all →</span>
              </div>
            </div>

            {/* Card: FAT Certificates */}
            <div
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/fat-certificates")}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <h3 className="font-semibold text-slate-900 text-sm">FAT Pending</h3>
                  </div>
                  <p className={`text-3xl font-bold font-mono tabular-nums ${(fatStats?.pending ?? 0) > 0 ? "text-red-600" : "text-slate-900"}`}>
                    {fatStats ? fatStats.pending : "—"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(fatStats?.pending ?? 0) === 0 ? "all FATs complete" : "awaiting test results"}
                  </p>
                </div>
                <span className="text-xs text-blue-600 font-medium">View all →</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
