import { useState, useMemo, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Package, Shield, ArrowDownCircle, ArrowUpCircle, BarChart2, Database, X, Download } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StockStatusBadge } from "@/components/StockStatusBadge";
import { fetchStockStatus, fetchStockMovements, type StockStatusRow, type StockMovement } from "@/lib/items-api";
import { fetchPendingQCGRNs } from "@/lib/grn-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { formatCurrency, formatNumber } from "@/lib/gst-utils";
import { buildStockRegisterWorkbook, downloadWorkbook } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";

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
  // Every distinct item_type gets its own consistent pill colour (no type left as
  // plain/greyed text). Unknown types fall back to a neutral slate pill.
  const map: Record<string, { label: string; cls: string }> = {
    component:    { label: "Component",     cls: "bg-indigo-50 text-indigo-700 border border-indigo-200" },
    bought_out:   { label: "Bought Out",    cls: "bg-blue-50 text-blue-700 border border-blue-200" },
    sub_assembly: { label: "Sub Assembly",  cls: "bg-purple-50 text-purple-700 border border-purple-200" },
    finished_good:{ label: "Finished Good", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    raw_material: { label: "Raw Material",  cls: "bg-orange-50 text-orange-700 border border-orange-200" },
    consumable:   { label: "Consumable",    cls: "bg-rose-50 text-rose-700 border border-rose-200" },
  };
  const t = map[type] ?? {
    label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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
  onClick,
  active,
}: {
  label: string;
  value: number;
  colour: "slate" | "green" | "amber" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const cls = {
    slate: "bg-slate-50 border-slate-200 text-slate-600",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red:   "bg-red-50 border-red-200 text-red-700",
  }[colour];
  const interactive = onClick
    ? "cursor-pointer hover:brightness-95 active:scale-[0.98] transition"
    : "cursor-default";
  const ring = active ? "ring-2 ring-offset-1 ring-slate-400" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${cls} ${interactive} ${ring}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-bold font-mono tabular-nums">{value}</span>
    </button>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type AvailabilityFilter =
  | "all"
  | "in_store"
  | "at_vendor"
  | "in_production"
  | "ready_to_dispatch";

type AlertFilter = "all" | "needs_attention" | "critical" | "warning" | "locked" | "healthy";

type TypeFilter =
  | "all"
  | "component"
  | "bought_out"
  | "sub_assembly"
  | "finished_good"
  | "raw_material"
  | "consumable";

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
      urlType === "raw_material" ||
      urlType === "consumable"
    )
      return urlType;
    return "all";
  });

  // Phase 2 filter toggles (below-reorder / zero-stock).
  const [belowReorder, setBelowReorder] = useState(false);
  const [zeroStock, setZeroStock] = useState(false);

  const [selectedItem, setSelectedItem] = useState<StockStatusRow | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock_status"],
    queryFn: fetchStockStatus,
  });

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const companyName = companySettings?.company_name ?? "client";

  const handleExport = (mode: "view" | "all") => {
    if (isExporting) return;
    const dataset = mode === "view" ? filtered : rows;
    setIsExporting(true);
    try {
      const { workbook, filename } = buildStockRegisterWorkbook(dataset, { companyName, mode });
      downloadWorkbook(workbook, filename);
      toast({ title: `Exported ${dataset.length} row${dataset.length === 1 ? "" : "s"} to ${filename}` });
    } catch (err) {
      console.error("[StockRegister] export failed:", err);
      toast({ title: "Export failed", description: "See console for details.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["stock-movements", selectedItem?.id],
    queryFn: () => fetchStockMovements(selectedItem!.id),
    enabled: !!selectedItem?.id && ledgerOpen,
  });

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
    typeFilter !== "all" ||
    belowReorder ||
    zeroStock;

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
          r.description.toLowerCase().includes(q) ||
          (r.drawing_number?.toLowerCase().includes(q) ?? false)
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((r) => r.item_type === typeFilter);
    }

    if (availability !== "all") {
      result = result.filter((r) => {
        if (availability === "in_store")          return r.stock_free > 0;
        if (availability === "at_vendor")         return r.stock_in_process > 0;
        if (availability === "in_production")     return (r.stock_in_subassembly_wip + r.stock_in_fg_wip + r.awo_qty) > 0;
        if (availability === "ready_to_dispatch") return r.stock_in_fg_ready > 0;
        return true;
      });
    }

    if (alertFilter === "needs_attention") {
      result = result.filter((r) =>
        ["critical", "warning", "locked"].includes(r.stock_alert_level ?? "healthy")
      );
    } else if (alertFilter !== "all") {
      result = result.filter(
        (r) => (r.stock_alert_level ?? "healthy") === alertFilter
      );
    }

    if (zeroStock) {
      result = result.filter(
        (r) =>
          (r.stock_free + r.stock_in_process + r.stock_in_subassembly_wip +
            r.stock_in_fg_wip + r.awo_qty + r.stock_in_fg_ready) === 0
      );
    }

    if (belowReorder) {
      // Canonical reorder rule: COALESCE(min_stock_override, min_stock, 0) — a
      // deliberate 0 override is honoured (null-check, not the falsy || the older
      // display path used). Below-reorder = free stock at/under that threshold.
      result = result.filter((r) => {
        const em = r.min_stock_override ?? r.min_stock ?? 0;
        return em > 0 && r.stock_free <= em;
      });
    }

    return result;
  }, [rows, search, typeFilter, availability, alertFilter, zeroStock, belowReorder]);

  // Footer cost rollups across the currently filtered set. Sums the same
  // per-row cost_* fields that the body cells render (so footer can never
  // disagree with the body). awo_qty is excluded — costs reflect the 5
  // physical buckets only.
  const footerTotals = useMemo(() => {
    let sum_cost_free = 0;
    let sum_cost_in_process = 0;
    let sum_cost_in_subassembly_wip = 0;
    let sum_cost_in_fg_wip = 0;
    let sum_cost_in_fg_ready = 0;
    let sum_cost_total = 0;
    for (const r of filtered) {
      sum_cost_free               += Number(r.cost_free               ?? 0);
      sum_cost_in_process         += Number(r.cost_in_process         ?? 0);
      sum_cost_in_subassembly_wip += Number(r.cost_in_subassembly_wip ?? 0);
      sum_cost_in_fg_wip          += Number(r.cost_in_fg_wip          ?? 0);
      sum_cost_in_fg_ready        += Number(r.cost_in_fg_ready        ?? 0);
      sum_cost_total              += Number(r.cost_total              ?? 0);
    }
    return {
      sum_cost_free,
      sum_cost_in_process,
      sum_cost_in_subassembly_wip,
      sum_cost_in_fg_wip,
      sum_cost_in_fg_ready,
      sum_cost_total,
      filteredCount: filtered.length,
    };
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setAvailability("all");
    setAlertFilter("all");
    setTypeFilter("all");
    setBelowReorder(false);
    setZeroStock(false);
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
    { v: "consumable",    label: "Consumable" },
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
        <StatChip
          label="Total Items"
          value={chips.total}
          colour="slate"
          onClick={clearFilters}
          active={!anyFilterActive}
        />
        <StatChip
          label="In Store"
          value={chips.inStore}
          colour="green"
          onClick={() => setAvailability((v) => (v === "in_store" ? "all" : "in_store"))}
          active={availability === "in_store"}
        />
        <StatChip
          label="At Vendor"
          value={chips.atVendor}
          colour="amber"
          onClick={() => setAvailability((v) => (v === "at_vendor" ? "all" : "at_vendor"))}
          active={availability === "at_vendor"}
        />
        <StatChip
          label="Needs Attention"
          value={chips.needsAttention}
          colour={chips.needsAttention > 0 ? "red" : "slate"}
          onClick={() => setAlertFilter((v) => (v === "needs_attention" ? "all" : "needs_attention"))}
          active={alertFilter === "needs_attention"}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
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
            placeholder="Search by item name, code, or drawing number..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Location */}
        <Select value={availability} onValueChange={(v) => setAvailability(v as AvailabilityFilter)}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAIL_OPTS.map((opt) => (
              <SelectItem key={opt.v} value={opt.v}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type */}
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTS.map((opt) => (
              <SelectItem key={opt.v} value={opt.v}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={alertFilter} onValueChange={(v) => setAlertFilter(v as AlertFilter)}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem>
            <SelectItem value="critical">Needs Reorder</SelectItem>
            <SelectItem value="warning">Running Low</SelectItem>
            <SelectItem value="locked">Engaged</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
          </SelectContent>
        </Select>

        {/* Phase 2 toggles — below-reorder & zero-stock (default off; inert). */}
        <Button
          variant={belowReorder ? "secondary" : "outline"}
          size="sm"
          className="h-9 text-xs"
          aria-pressed={belowReorder}
          onClick={() => setBelowReorder((v) => !v)}
        >
          Below Reorder
        </Button>
        <Button
          variant={zeroStock ? "secondary" : "outline"}
          size="sm"
          className="h-9 text-xs"
          aria-pressed={zeroStock}
          onClick={() => setZeroStock((v) => !v)}
        >
          Zero Stock
        </Button>

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

        {/* Export buttons — right-aligned */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isExporting}
            onClick={() => handleExport("view")}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {isExporting ? "Exporting…" : "Export view"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isExporting}
            onClick={() => handleExport("all")}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {isExporting ? "Exporting…" : "Export all items"}
          </Button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
              <tr className="border-b-2 border-slate-300">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Drawing Number
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
                {/* ── Cost block — qty × standard_cost per Phase-13 bucket ── */}
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-l border-border">
                  Cost: In Store
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Cost: At Vendor
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Cost: Sub-Assy
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Cost: FG WIP
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Cost: FG Ready
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                  Cost: TOTAL
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Reorder Level
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Aimed Qty
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
                  <td colSpan={19} className="text-center py-12 text-slate-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={19} className="py-16">
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
                  const inProd = row.stock_in_subassembly_wip + row.stock_in_fg_wip + row.awo_qty;
                  const total =
                    row.stock_free +
                    row.stock_in_process +
                    inProd +
                    row.stock_in_fg_ready;
                  const minReq = row.min_stock_override || row.min_stock || 0;

                  return (
                    <tr
                      key={row.id}
                      className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedItem(row); setLedgerOpen(true); }}
                    >
                      {/* Item — name/description only. The code/drawing line was a
                          duplicate of the dedicated Drawing Number column. */}
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="text-sm font-medium text-slate-800 leading-snug">
                          {row.description}
                        </p>
                      </td>

                      {/* Drawing Number */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.drawing_number ? (
                          <span className="text-sm font-mono tabular-nums text-slate-700">
                            {row.drawing_number}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm select-none">—</span>
                        )}
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

                      {/* Cost: In Store */}
                      <td className="px-3 py-3 text-right whitespace-nowrap border-l border-border">
                        <span className="text-sm font-mono tabular-nums text-slate-600">
                          {formatCurrency(row.cost_free)}
                        </span>
                      </td>

                      {/* Cost: At Vendor */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono tabular-nums text-slate-600">
                          {formatCurrency(row.cost_in_process)}
                        </span>
                      </td>

                      {/* Cost: Sub-Assy */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono tabular-nums text-slate-600">
                          {formatCurrency(row.cost_in_subassembly_wip)}
                        </span>
                      </td>

                      {/* Cost: FG WIP */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono tabular-nums text-slate-600">
                          {formatCurrency(row.cost_in_fg_wip)}
                        </span>
                      </td>

                      {/* Cost: FG Ready */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-mono tabular-nums text-slate-600">
                          {formatCurrency(row.cost_in_fg_ready)}
                        </span>
                      </td>

                      {/* Cost: TOTAL */}
                      <td className="px-3 py-3 text-right whitespace-nowrap font-semibold">
                        <span className="text-sm font-mono tabular-nums font-semibold text-slate-800">
                          {formatCurrency(row.cost_total)}
                        </span>
                      </td>

                      {/* Reorder Level */}
                      <td className="px-3 py-3 text-right">
                        {minReq > 0 ? (
                          <span className="text-sm font-mono tabular-nums text-slate-500">
                            {minReq}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-sm select-none">—</span>
                        )}
                      </td>

                      {/* Aimed Qty */}
                      <td className="px-3 py-3 text-right">
                        {(row as any).aimed_stock > 0 ? (
                          <span className="text-sm font-mono tabular-nums text-slate-500">
                            {(row as any).aimed_stock}
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
                        {row.stock_alert_level === 'critical' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap bg-red-50 text-red-700 border-red-200">
                            Action Required
                          </span>
                        ) : (
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
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            className="text-xs font-medium text-slate-500 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1"
                            onClick={() => { setSelectedItem(row); setLedgerOpen(true); }}
                          >
                            <BarChart2 className="h-3 w-3" /> Ledger
                          </button>
                          {(() => {
                            const t = row.item_type;
                            if (t === "raw_material" || t === "bought_out" || t === "consumable") {
                              return (
                                <button
                                  className="text-xs font-medium text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors whitespace-nowrap"
                                  onClick={() => navigate("/purchase-orders/new", {
                                    state: {
                                      prefillItem: {
                                        item_id: row.id,
                                        item_code: row.item_code,
                                        description: row.description,
                                        unit: row.unit,
                                        hsn_sac_code: row.hsn_sac_code,
                                      },
                                    },
                                  })}
                                >
                                  Raise PO
                                </button>
                              );
                            }
                            if (t === "component") {
                              return (
                                <button
                                  className="text-xs font-medium text-slate-700 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50 transition-colors whitespace-nowrap"
                                  onClick={() => navigate("/delivery-challans/new", {
                                    state: {
                                      prefillItem: {
                                        item_id: row.id,
                                        item_code: row.item_code,
                                        description: row.description,
                                        unit: row.unit,
                                        hsn_sac_code: row.hsn_sac_code,
                                      },
                                    },
                                  })}
                                >
                                  Raise Job Card
                                </button>
                              );
                            }
                            if (t === "sub_assembly" || t === "finished_good") {
                              return (
                                <button
                                  className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded px-2 py-1 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                                  onClick={() => navigate(t === "sub_assembly" ? "/sub-assembly-work-orders" : "/finished-good-work-orders", {
                                    state: {
                                      prefillItem: {
                                        item_id: row.id,
                                        item_code: row.item_code,
                                        description: row.description,
                                        unit: row.unit,
                                        hsn_sac_code: row.hsn_sac_code,
                                      },
                                    },
                                  })}
                                >
                                  Assembly Order
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-white">
              <tr className="border-t-2 border-border">
                {/* Item col — label + filtered count */}
                <td className="px-4 py-3 align-top">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    TOTAL (filtered)
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono leading-none mt-0.5">
                    ({footerTotals.filteredCount} item{footerTotals.filteredCount === 1 ? "" : "s"})
                  </p>
                </td>

                {/* Drawing Number */}
                <td className="px-3 py-3" />
                {/* Type */}
                <td className="px-3 py-3" />
                {/* In Store qty */}
                <td className="px-3 py-3" />
                {/* At Vendor qty */}
                <td className="px-3 py-3" />
                {/* In Production qty */}
                <td className="px-3 py-3" />
                {/* Ready to Ship qty */}
                <td className="px-3 py-3" />
                {/* Total qty */}
                <td className="px-3 py-3" />

                {/* Cost: In Store */}
                <td className="px-3 py-3 text-right whitespace-nowrap border-l border-border">
                  <span className="text-sm font-mono tabular-nums text-slate-700">
                    {formatCurrency(footerTotals.sum_cost_free)}
                  </span>
                </td>
                {/* Cost: At Vendor */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-mono tabular-nums text-slate-700">
                    {formatCurrency(footerTotals.sum_cost_in_process)}
                  </span>
                </td>
                {/* Cost: Sub-Assy */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-mono tabular-nums text-slate-700">
                    {formatCurrency(footerTotals.sum_cost_in_subassembly_wip)}
                  </span>
                </td>
                {/* Cost: FG WIP */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-mono tabular-nums text-slate-700">
                    {formatCurrency(footerTotals.sum_cost_in_fg_wip)}
                  </span>
                </td>
                {/* Cost: FG Ready */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-sm font-mono tabular-nums text-slate-700">
                    {formatCurrency(footerTotals.sum_cost_in_fg_ready)}
                  </span>
                </td>
                {/* Cost: TOTAL */}
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className="text-base font-mono tabular-nums font-semibold text-slate-900">
                    {formatCurrency(footerTotals.sum_cost_total)}
                  </span>
                </td>

                {/* Reorder Level */}
                <td className="px-3 py-3" />
                {/* Aimed Qty */}
                <td className="px-3 py-3" />
                {/* Pending QC */}
                <td className="px-3 py-3" />
                {/* Status */}
                <td className="px-3 py-3" />
                {/* Action */}
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Row count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-right tabular-nums">
          Showing {filtered.length} of {rows.length} items
        </p>
      )}

      {/* Overlay */}
      {ledgerOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setLedgerOpen(false)}
        />
      )}

      {/* Stock Ledger Side Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          ledgerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedItem && (
          <>
            {/* Panel header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-slate-200 shrink-0">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-mono text-slate-400 leading-none mb-1">{selectedItem.item_code}</p>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{selectedItem.description}</p>
              </div>
              <button
                onClick={() => setLedgerOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 shrink-0 mt-0.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stock summary */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tabular-nums ${
                  selectedItem.stock_free === 0 ? "text-red-600" :
                  selectedItem.effective_min_stock > 0 && selectedItem.stock_free <= selectedItem.effective_min_stock ? "text-amber-600" :
                  "text-emerald-600"
                }`}>
                  {selectedItem.stock_free}
                </span>
                <span className="text-sm text-slate-500">{selectedItem.unit} in store</span>
              </div>
              {(selectedItem.stock_in_process > 0 || (selectedItem.stock_in_subassembly_wip + selectedItem.stock_in_fg_wip) > 0) && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedItem.stock_in_process > 0 && `${selectedItem.stock_in_process} at vendor`}
                  {selectedItem.stock_in_process > 0 && (selectedItem.stock_in_subassembly_wip + selectedItem.stock_in_fg_wip) > 0 && " · "}
                  {(selectedItem.stock_in_subassembly_wip + selectedItem.stock_in_fg_wip) > 0 && `${selectedItem.stock_in_subassembly_wip + selectedItem.stock_in_fg_wip} in production`}
                </p>
              )}
              <button
                className="text-xs text-blue-600 hover:underline mt-1.5"
                onClick={() => { setLedgerOpen(false); navigate(`/inventory-ledger?item_id=${selectedItem.id}`); }}
              >
                View full ledger →
              </button>
            </div>

            {/* Movements table */}
            <div className="flex-1 overflow-y-auto">
              {movementsLoading ? (
                <p className="text-sm text-slate-400 p-4 animate-pulse">Loading movements…</p>
              ) : movements.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-sm">No stock movements recorded yet for this item</p>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <colgroup>
                    <col style={{ width: "90px" }} />
                    <col />
                    <col style={{ width: "56px" }} />
                    <col style={{ width: "56px" }} />
                    <col style={{ width: "70px" }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-emerald-600 uppercase tracking-wide">In</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-red-500 uppercase tracking-wide">Out</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m: StockMovement) => {
                      const docIconMap: Record<StockMovement['document_type'], React.ReactNode> = {
                        grn:           <ArrowDownCircle className="h-3 w-3 text-emerald-500 shrink-0" />,
                        dc:            <ArrowUpCircle className="h-3 w-3 text-amber-500 shrink-0" />,
                        assembly_order:<Package className="h-3 w-3 text-blue-500 shrink-0" />,
                        adjustment:    <BarChart2 className="h-3 w-3 text-slate-400 shrink-0" />,
                        opening_stock: <Database className="h-3 w-3 text-slate-400 shrink-0" />,
                      };
                      const refHrefMap: Record<StockMovement['document_type'], string | null> = {
                        grn:           m.document_id ? `/grn/${m.document_id}` : null,
                        dc:            m.document_id ? `/delivery-challans/${m.document_id}` : null,
                        assembly_order:m.document_id ? `/assembly-orders/${m.document_id}` : null,
                        adjustment:    null,
                        opening_stock: null,
                      };
                      const refHref = refHrefMap[m.document_type];
                      const balanceColor =
                        m.running_balance === 0 ? "text-red-600" :
                        selectedItem.effective_min_stock > 0 && m.running_balance <= selectedItem.effective_min_stock ? "text-amber-600" :
                        "text-slate-800";
                      return (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            {format(new Date(m.movement_date), "dd MMM yy")}
                          </td>
                          <td className="px-3 py-2 max-w-[140px]">
                            <div className="flex items-center gap-1 min-w-0">
                              {docIconMap[m.document_type]}
                              {refHref ? (
                                <button
                                  className="font-mono text-blue-700 hover:underline truncate text-left leading-tight"
                                  onClick={() => { setLedgerOpen(false); navigate(refHref); }}
                                >
                                  {m.document_number}
                                </button>
                              ) : (
                                <span className="font-mono text-slate-500 truncate">{m.document_number}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {m.movement_type === "in"
                              ? <span className="text-emerald-600 font-semibold">+{formatNumber(m.quantity)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {m.movement_type === "out"
                              ? <span className="text-red-500 font-semibold">−{formatNumber(m.quantity)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono tabular-nums font-semibold ${balanceColor}`}>
                            {formatNumber(m.running_balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
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
