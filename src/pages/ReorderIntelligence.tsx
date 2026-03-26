import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Download,
  ShoppingCart,
  CheckCircle2,
  Upload,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchReorderAlerts, type ReorderAlert } from "@/lib/reorder-api";
import { exportToExcel } from "@/lib/export-utils";
import { format } from "date-fns";

const ITEM_TYPES = [
  { value: "all", label: "All Types" },
  { value: "raw_material", label: "Raw Material" },
  { value: "component", label: "Component" },
  { value: "sub_assembly", label: "Sub Assembly" },
  { value: "bought_out", label: "Bought Out" },
  { value: "finished_good", label: "Finished Good" },
  { value: "consumable", label: "Consumable" },
];

type AlertLevel = "all" | "critical" | "warning" | "watch";

function AlertBadge({ level }: { level: ReorderAlert["alert_level"] }) {
  const map = {
    critical: "bg-red-100 text-red-800 border border-red-200",
    warning:  "bg-amber-100 text-amber-800 border border-amber-200",
    watch:    "bg-blue-100 text-blue-800 border border-blue-200",
  };
  const labels = { critical: "Critical", warning: "Warning", watch: "Watch" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[level]}`}>
      {labels[level]}
    </span>
  );
}

function DaysCell({ days }: { days: number }) {
  if (days >= 999) return <span className="text-muted-foreground text-sm font-mono">∞</span>;
  const cls =
    days < 7  ? "text-destructive font-bold" :
    days < 14 ? "text-amber-600 font-medium" :
    days > 30 ? "text-emerald-600" :
                "text-foreground";
  return <span className={`text-sm font-mono tabular-nums ${cls}`}>{days}d</span>;
}

export default function ReorderIntelligence() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<AlertLevel>("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: alerts = [], isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["reorder-alerts"],
    queryFn: fetchReorderAlerts,
    staleTime: 60000,
  });

  const filtered = useMemo(() => {
    let result = alerts;
    if (levelFilter !== "all") result = result.filter((a) => a.alert_level === levelFilter);
    if (typeFilter !== "all") result = result.filter((a) => a.item_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.item_code?.toLowerCase().includes(q) ||
          a.item_description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [alerts, levelFilter, typeFilter, search]);

  const criticalCount = alerts.filter((a) => a.alert_level === "critical").length;
  const warningCount  = alerts.filter((a) => a.alert_level === "warning").length;
  const watchCount    = alerts.filter((a) => a.alert_level === "watch").length;

  const lastUpdated = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), "dd MMM yyyy HH:mm")
    : "—";

  const handleExport = () => {
    exportToExcel(
      [
        {
          sheetName: "Reorder Alerts",
          columns: [
            { key: "item_code",              label: "Item Code",           type: "text",    width: 14 },
            { key: "item_description",       label: "Description",          type: "text",    width: 30 },
            { key: "item_type",              label: "Type",                 type: "text",    width: 14 },
            { key: "current_stock",          label: "Current Stock",        type: "number",  width: 14 },
            { key: "min_stock",              label: "Min Stock",            type: "number",  width: 12 },
            { key: "reorder_point",          label: "Reorder Point",        type: "number",  width: 14 },
            { key: "days_of_stock_remaining",label: "Days Remaining",       type: "number",  width: 14 },
            { key: "consumption_rate_per_day", label: "Consumption/Day",    type: "number",  width: 14 },
            { key: "open_ao_requirement",    label: "AO Requirement",       type: "number",  width: 14 },
            { key: "recommended_order_qty",  label: "Recommended Qty",      type: "number",  width: 16 },
            { key: "preferred_vendor_name",  label: "Preferred Vendor",     type: "text",    width: 22 },
            { key: "alert_level",            label: "Alert Level",          type: "text",    width: 12 },
          ],
          data: filtered,
        },
      ],
      "Reorder_Alerts"
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Reorder Intelligence
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Smart reorder alerts based on stock levels and consumption patterns
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/settings/import", { state: { tab: "reorder_rules" } })}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Import Rules
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div
          className={`paper-card cursor-pointer transition-colors ${criticalCount > 0 ? "border-l-4 border-l-destructive" : ""}`}
          onClick={() => setLevelFilter(levelFilter === "critical" ? "all" : "critical")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className={`h-3.5 w-3.5 ${criticalCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Critical</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${criticalCount > 0 ? "text-destructive" : ""}`}>
            {isLoading ? "—" : criticalCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Below minimum stock</p>
        </div>
        <div
          className={`paper-card cursor-pointer transition-colors ${warningCount > 0 ? "border-l-4 border-l-amber-500" : ""}`}
          onClick={() => setLevelFilter(levelFilter === "warning" ? "all" : "warning")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className={`h-3.5 w-3.5 ${warningCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Warning</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${warningCount > 0 ? "text-amber-700" : ""}`}>
            {isLoading ? "—" : warningCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Below reorder point</p>
        </div>
        <div
          className={`paper-card cursor-pointer transition-colors ${watchCount > 0 ? "border-l-4 border-l-blue-400" : ""}`}
          onClick={() => setLevelFilter(levelFilter === "watch" ? "all" : "watch")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-blue-600" />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Watch</p>
          </div>
          <p className="text-2xl font-bold font-mono text-blue-700">
            {isLoading ? "—" : watchCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Approaching reorder point</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search item code, description…"
          className="h-9 w-64 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as AlertLevel)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Alert level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="watch">Watch</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Item type" />
          </SelectTrigger>
          <SelectContent>
            {ITEM_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">
          Last updated: {lastUpdated}
        </p>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table text-sm">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Raw Stock</th>
                <th className="text-right">Total Stock</th>
                <th className="text-right">Min Stock</th>
                <th className="text-right">Reorder Pt.</th>
                <th className="text-right">Days Left</th>
                <th className="text-right">Cons./Day</th>
                <th className="text-right">AO Req.</th>
                <th className="text-right">Rec. Order</th>
                <th>Preferred Vendor</th>
                <th>Level</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin opacity-40" />
                      <p>Computing reorder alerts…</p>
                      <p className="text-xs">This may take a moment</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-12">
                    {alerts.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-60" />
                        <p className="font-medium text-emerald-700">All stock levels are healthy.</p>
                        <p className="text-xs text-muted-foreground">No reorder alerts at this time.</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No alerts match current filters.</span>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => {
                  const rowBg =
                    alert.alert_level === "critical"
                      ? "bg-red-50/50 hover:bg-red-50"
                      : alert.alert_level === "warning"
                      ? "bg-amber-50/40 hover:bg-amber-50"
                      : "hover:bg-muted/30";

                  const stockColor =
                    alert.alert_level === "critical"
                      ? "text-destructive font-bold"
                      : alert.alert_level === "warning"
                      ? "text-amber-700 font-medium"
                      : "text-foreground";

                  return (
                    <tr key={alert.item_id} className={`transition-colors ${rowBg}`}>
                      <td className="font-mono text-xs font-medium">{alert.item_code}</td>
                      <td>
                        <p className="font-medium leading-tight truncate max-w-[180px]">
                          {alert.item_description}
                        </p>
                      </td>
                      <td>
                        <span className="text-xs text-muted-foreground capitalize">
                          {alert.item_type?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className={`text-right font-mono tabular-nums ${stockColor}`}>
                        {alert.raw_stock} {alert.item_unit}
                      </td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">
                        {alert.current_stock} {alert.item_unit}
                      </td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">
                        {alert.min_stock}
                      </td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">
                        {alert.reorder_point}
                      </td>
                      <td className="text-right">
                        <DaysCell days={alert.days_of_stock_remaining} />
                      </td>
                      <td className="text-right text-xs text-muted-foreground tabular-nums font-mono">
                        {alert.consumption_rate_per_day > 0
                          ? alert.consumption_rate_per_day.toFixed(2)
                          : "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums text-muted-foreground">
                        {alert.open_ao_requirement > 0 ? alert.open_ao_requirement : "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums font-bold text-primary">
                        {alert.recommended_order_qty}
                      </td>
                      <td className="text-sm text-muted-foreground truncate max-w-[130px]">
                        {alert.preferred_vendor_name ?? "—"}
                      </td>
                      <td>
                        <AlertBadge level={alert.alert_level} />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 whitespace-nowrap"
                          onClick={() =>
                            navigate("/purchase-orders/new", {
                              state: {
                                vendor_id: alert.preferred_vendor_id,
                                prefill_items: [
                                  {
                                    item_id: alert.item_id,
                                    description: `${alert.item_code} — ${alert.item_description}`,
                                    qty: alert.recommended_order_qty,
                                    unit: alert.item_unit,
                                  },
                                ],
                              },
                            })
                          }
                        >
                          <ShoppingCart className="h-3 w-3" /> Raise PO
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Consumption based on 90-day rolling average from stock ledger · Reorder points from custom rules or item min stock
      </p>
    </div>
  );
}
