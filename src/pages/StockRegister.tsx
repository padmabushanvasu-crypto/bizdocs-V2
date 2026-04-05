import { useState, useMemo, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Package, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StockStatusBadge } from "@/components/StockStatusBadge";
import { fetchStockStatus, type StockStatusRow } from "@/lib/items-api";
import { fetchReorderAlerts, type ReorderAlert } from "@/lib/reorder-api";
import { fetchPendingQCGRNs } from "@/lib/grn-api";

// ── Error boundary ─────────────────────────────────────────────────────────────

class StockRegisterErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="text-destructive font-medium">
            Something went wrong loading the Stock Register.
          </p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    component:    { label: "Component",     cls: "bg-slate-100 text-slate-700 border border-slate-200" },
    bought_out:   { label: "Bought Out",    cls: "bg-blue-50 text-blue-700 border border-blue-200" },
    sub_assembly: { label: "Sub Assembly",  cls: "bg-purple-50 text-purple-700 border border-purple-200" },
    finished_good:{ label: "Finished Good", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    raw_material: { label: "Raw Material",  cls: "bg-orange-50 text-orange-700 border border-orange-200" },
  };
  const t = map[type] ?? {
    label: type.replace(/_/g, " "),
    cls: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${t.cls}`}
    >
      {t.label}
    </span>
  );
}

// ── Stat chip ──────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: "slate" | "green" | "amber" | "red";
}) {
  const cls = {
    slate: "bg-slate-50 border-slate-200 text-slate-600",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red:   "bg-red-50 border-red-200 text-red-700",
  }[colour];
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${cls}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-bold font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityFilter =
  | "all"
  | "in_store"
  | "at_vendor"
  | "in_production"
  | "ready_to_dispatch";

type AlertFilter = "all" | "critical" | "warning" | "locked" | "healthy";

type TypeFilter =
  | "all"
  | "component"
  | "bought_out"
  | "sub_assembly"
  | "finished_good"
  | "raw_material";

// ── Column header with tooltip ─────────────────────────────────────────────────

function ColHeader({
  label,
  tip,
  align = "right",
}: {
  label: string;
  tip: string;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default">{label}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

// ── Num cell ───────────────────────────────────────────────────────────────────

function Num({ value, bold }: { value: number; bold?: boolean }) {
  if (!value)
    return <span className="text-slate-300 text-sm select-none">—</span>;
  return (
    <span
      className={`text-sm font-mono tabular-nums ${
        bold ? "font-semibold text-slate-800" : "text-slate-600"
      }`}
    >
      {value}
    </span>
  );
}

// ── Main inner component ───────────────────────────────────────────────────────

function StockRegisterInner() {
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-set filters from URL params
  const urlParams = new URLSearchParams(location.search);
  const urlFilter = urlParams.get("filter");
  const urlType = urlParams.get("type");

  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [alertFilter, setAlertFilter] = useState<AlertFilter>(() => {
    if (
      urlFilter === "critical" ||
      urlFilter === "warning" ||
      urlFilter === "locked" ||
      urlFilter === "healthy"
    )
      return urlFilter;
    return "all";
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => {
    if (
      urlType === "component" ||
      urlType === "bought_out" ||
      urlType === "sub_assembly" ||
      urlType === "finished_good" ||
      urlType === "raw_material"
    )
      return urlType;
    return "all";
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock_status"],
    queryFn: fetchStockStatus,
  });

  const { data: reorderAlerts = [] } = useQuery({
    queryKey: ["reorder-alerts"],
    queryFn: fetchReorderAlerts,
  });

  const reorderMap = useMemo(() => {
    const m = new Map<string, ReorderAlert>();
    for (const a of reorderAlerts) m.set(a.item_id, a);
    return m;
  }, [reorderAlerts]);

  const { data: pendingQCGrns = [] } = useQuery({
    queryKey: ['pending-qc-grns'],
    queryFn: fetchPendingQCGRNs,
    staleTime: 60000,
  });

  const pendingQcMap = useMemo(() => {
    const map = new Map<string, { qty: number; date: string; vendor: string }>();
    for (const grn of pendingQCGrns) {
      for (const item of (grn as any).line_items ?? []) {
        if (!item.drawing_number) continue;
        const key = item.drawing_number;
        const existing = map.get(key);
        const qty = (item.received_qty ?? item.receiving_now ?? 0);
        if (existing) {
          map.set(key, { qty: existing.qty + qty, date: existing.date, vendor: existing.vendor });
        } else {
          map.set(key, { qty, date: grn.grn_date, vendor: grn.vendor_name ?? '' });
        }
      }
    }
    return map;
  }, [pendingQCGrns]);

  const anyFilterActive =
    search.trim() !== "" ||
    availability !== "all" ||
    alertFilter !== "all" ||
    typeFilter !== "all";

  // Stat chips — always from full unfiltered list
  const chips = useMemo(
    () => ({
      total: rows.length,
      inStore: rows.filter((r) => r.stock_free > 0).length,
      atVendor: rows.filter((r) => r.stock_in_process > 0).length,
      needsAttention: rows.filter((r) =>
        ["critical", "warning", "locked"].includes(r.stock_alert_level ?? "healthy")
      ).length,
    }),
    [rows]
  );

  // Filtered rows
  const filtered = useMemo(() => {
    let result = rows;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.item_code.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((r) => r.item_type === typeFilter);
    }

    if (availability !== "all") {
      result = result.filter((r) => {
        if (availability === "in_store")          return r.stock_free > 0;
        if (availability === "at_vendor")         return r.stock_in_process > 0;
        if (availability === "in_production")     return (r.stock_in_subassembly_wip + r.stock_in_fg_wip) > 0;
        if (availability === "ready_to_dispatch") return r.stock_in_fg_ready > 0;
        return true;
      });
    }

    if (alertFilter !== "all") {
      result = result.filter(
        (r) => (r.stock_alert_level ?? "healthy") === alertFilter
      );
    }

    return result;
  }, [rows, search, typeFilter, availability, alertFilter]);

  const clearFilters = () => {
    setSearch("");
    setAvailability("all");
    setAlertFilter("all");
    setTypeFilter("all");
  };

  const AVAIL_OPTS: { v: AvailabilityFilter; label: string }[] = [
    { v: "all",               label: "All" },
    { v: "in_store",          label: "In Store" },
    { v: "at_vendor",         label: "At Vendor" },
    { v: "in_production",     label: "In Production" },
    { v: "ready_to_dispatch", label: "Ready to Dispatch" },
  ];

  const TYPE_OPTS: { v: TypeFilter; label: string }[] = [
    { v: "all",           label: "All Types" },
    { v: "raw_material",  label: "Raw Material" },
    { v: "component",     label: "Component" },
    { v: "bought_out",    label: "Bought Out" },
    { v: "sub_assembly",  label: "Sub Assembly" },
    { v: "finished_good", label: "Finished Good" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Stock Register
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Real-time view of all inventory across store, vendors, and production
        </p>
      </div>

      {/* ── Stat chips ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Total Items"     value={chips.total}          colour="slate" />
        <StatChip label="In Store"        value={chips.inStore}        colour="green" />
        <StatChip label="At Vendor"       value={chips.atVendor}       colour="amber" />
        <StatChip
          label="Needs Attention"
          value={chips.needsAttention}
          colour={chips.needsAttention > 0 ? "red" : "slate"}
        />
      </div>

      {/* ── Filters row 1 ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            placeholder="Search by item name or drawing number..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Availability segmented control */}
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          {AVAIL_OPTS.map((opt) => (
            <button
              key={opt.v}
              onClick={() => setAvailability(opt.v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border-r border-slate-200 last:border-r-0 ${
                availability === opt.v
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Alert status filter */}
        <select
          value={alertFilter}
          onChange={(e) => setAlertFilter(e.target.value as AlertFilter)}
          className="h-9 text-sm border border-slate-200 rounded-lg px-3 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All Statuses</option>
          <option value="critical">Needs Reorder</option>
          <option value="warning">Running Low</option>
          <option value="locked">Engaged</option>
          <option value="healthy">Healthy</option>
        </select>
      </div>

      {/* ── Filters row 2 ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Type segmented control */}
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          {TYPE_OPTS.map((opt) => (
            <button
              key={opt.v}
              onClick={() => setTypeFilter(opt.v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border-r border-slate-200 last:border-r-0 ${
                typeFilter === opt.v
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {anyFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500 hover:text-slate-800"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Type
                </th>
                <ColHeader
                  label="In Store"
                  tip="Physically available in store, ready to use"
                />
                <ColHeader
                  label="At Vendor"
                  tip="Sent for processing via Delivery Challan, expected to return"
                />
                <ColHeader
                  label="In Production"
                  tip="Currently being assembled into a sub-assembly or finished good"
                />
                <ColHeader
                  label="Ready to Ship"
                  tip="Completed finished goods awaiting dispatch"
                />
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Total
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Min Required
                </th>
                <ColHeader
                  label="Pending QC"
                  tip="Qty received but awaiting quality clearance. Will enter confirmed stock after QC approval."
                />
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Status
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16">
                    <div className="flex flex-col items-center gap-3">
                      <Package className="h-10 w-10 text-slate-300" />
                      <div className="text-center">
                        <p className="font-medium text-slate-600">No items found</p>
                        <p className="text-sm text-slate-400 mt-0.5">
                          {rows.length === 0
                            ? "No stock data yet. Import items via Settings → Data Import → Items"
                            : "Try adjusting your search or filters"}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const inProd = row.stock_in_subassembly_wip + row.stock_in_fg_wip;
                  const total =
                    row.stock_free +
                    row.stock_in_process +
                    inProd +
                    row.stock_in_fg_ready;
                  const minReq = row.min_stock_override ?? row.min_stock ?? 0;

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/stock-ledger?item_id=${row.id}`)}
                    >
                      {/* Item */}
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="text-[11px] text-slate-400 font-mono leading-none mb-0.5">
                          {row.item_code}
                        </p>
                        <p className="text-sm font-medium text-slate-800 leading-snug">
                          {row.description}
                        </p>
                      </td>

                      {/* Type */}
                      <td className="px-3 py-3">
                        <TypeBadge type={row.item_type} />
                      </td>

                      {/* In Store */}
                      <td className="px-3 py-3 text-right">
                        <Num value={row.stock_free} bold={row.stock_free > 0} />
                      </td>

                      {/* At Vendor */}
                      <td className="px-3 py-3 text-right">
                        <Num value={row.stock_in_process} />
                      </td>

                      {/* In Production */}
                      <td className="px-3 py-3 text-right">
                        <Num value={inProd} />
                      </td>

                      {/* Ready to Ship */}
                      <td className="px-3 py-3 text-right">
                        <Num value={row.stock_in_fg_ready} />
                      </td>

                      {/* Total */}
                      <td className="px-3 py-3 text-right">
                        {total === 0 ? (
                          <span className="text-slate-300 text-sm select-none">—</span>
                        ) : (
                          <span className="text-sm font-mono tabular-nums font-semibold text-slate-500">
                            {total}
                          </span>
                        )}
                      </td>

                      {/* Min Required */}
                      <td className="px-3 py-3 text-right">
                        {minReq > 0 ? (
                          <span className="text-sm font-mono tabular-nums text-slate-500">
                            {minReq}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm select-none">—</span>
                        )}
                      </td>

                      {/* Pending QC */}
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const pqc = pendingQcMap.get(row.item_code) ?? pendingQcMap.get((row as any).drawing_revision ?? '');
                          if (!pqc || pqc.qty === 0) return <span className="text-slate-300 text-sm">—</span>;
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-amber-600 font-mono text-sm font-semibold cursor-default">
                                  ⏳ {pqc.qty}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] text-xs">
                                {pqc.qty} received on {new Date(pqc.date).toLocaleDateString('en-IN')} from {pqc.vendor} — awaiting quality clearance
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        {(() => {
                          const alert = reorderMap.get(row.id);
                          if (alert) {
                            if (alert.actioned) {
                              return (
                                <div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
                                    PO Raised
                                  </span>
                                  {alert.po_number && (
                                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono leading-tight">
                                      PO #{alert.po_number} · {alert.open_po_qty} units
                                      {alert.po_expected_date
                                        ? ` · Due ${new Date(alert.po_expected_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                                        : ''}
                                    </p>
                                  )}
                                </div>
                              );
                            } else {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap bg-red-50 text-red-700 border-red-200">
                                  Action Required
                                </span>
                              );
                            }
                          }
                          return (
                            <StockStatusBadge
                              alertLevel={row.stock_alert_level ?? "healthy"}
                              totalStock={
                                row.stock_free +
                                row.stock_in_process +
                                row.stock_in_subassembly_wip +
                                row.stock_in_fg_wip +
                                row.stock_in_fg_ready
                              }
                            />
                          );
                        })()}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const t = row.item_type;
                          if (t === "raw_material" || t === "bought_out" || t === "consumable") {
                            return (
                              <button
                                className="text-xs font-medium text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors whitespace-nowrap"
                                onClick={() => navigate(`/purchase-orders/new?item_id=${row.id}`)}
                              >
                                Raise PO
                              </button>
                            );
                          }
                          if (t === "component") {
                            return (
                              <button
                                className="text-xs font-medium text-slate-700 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50 transition-colors whitespace-nowrap"
                                onClick={() => navigate(`/delivery-challans/new?item_id=${row.id}`)}
                              >
                                Raise Job Card
                              </button>
                            );
                          }
                          if (t === "sub_assembly" || t === "finished_good") {
                            return (
                              <button
                                className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                                onClick={() => navigate(`/assembly-orders?item_id=${row.id}`)}
                              >
                                Assembly Order
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right tabular-nums">
          Showing {filtered.length} of {rows.length} items
        </p>
      )}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export default function StockRegister() {
  return (
    <StockRegisterErrorBoundary>
      <StockRegisterInner />
    </StockRegisterErrorBoundary>
  );
}
