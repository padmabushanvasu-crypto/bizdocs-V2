import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Star, AlertTriangle, Eye, Download, CheckCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchVendorScorecards, type VendorScorecard } from "@/lib/parties-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { format } from "date-fns";

function DataSourceBadge({ row }: { row: VendorScorecard }) {
  const tags: { label: string; className: string }[] = [];
  if (row.grn_count > 0) tags.push({ label: "GRN", className: "bg-blue-100 text-blue-700 border border-blue-200" });
  if (row.dc_count > 0) tags.push({ label: "DC", className: "bg-purple-100 text-purple-700 border border-purple-200" });
  if (row.total_steps > 0) tags.push({ label: "JW", className: "bg-slate-100 text-slate-600 border border-slate-200" });
  if (tags.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {tags.map((t) => (
        <span key={t.label} className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${t.className}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function RatingBadge({ rating }: { rating: VendorScorecard["performance_rating"] }) {
  if (rating === "reliable") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
        <CheckCircle className="h-3 w-3" /> Reliable
      </span>
    );
  }
  if (rating === "watch") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <Eye className="h-3 w-3" /> Watch
      </span>
    );
  }
  if (rating === "review") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
        <AlertTriangle className="h-3 w-3" /> Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
      New
    </span>
  );
}

function RatePct({
  value,
  greenBelow,
  redAbove,
}: {
  value: number | null;
  greenBelow?: number;
  redAbove?: number;
}) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  const cls =
    redAbove !== undefined && value > redAbove
      ? "text-red-600 font-semibold"
      : greenBelow !== undefined && value <= greenBelow
      ? "text-green-600 font-semibold"
      : "text-amber-600 font-semibold";
  return <span className={`text-sm tabular-nums ${cls}`}>{value.toFixed(1)}%</span>;
}

function FirstPassYield({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  const cls = value >= 90 ? 'text-green-600 font-semibold' : value >= 80 ? 'text-amber-600 font-semibold' : 'text-red-600 font-semibold';
  return <span className={`text-sm tabular-nums ${cls}`}>{value.toFixed(1)}%</span>;
}

function OnTimePct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  const cls =
    value >= 85
      ? "text-green-600 font-semibold"
      : value >= 70
      ? "text-amber-600 font-semibold"
      : "text-red-600 font-semibold";
  return <span className={`text-sm tabular-nums ${cls}`}>{value.toFixed(1)}%</span>;
}

export default function VendorScorecards() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["vendor-scorecards"],
    queryFn: () => fetchVendorScorecards(),
    refetchInterval: 60000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.vendor_name.toLowerCase().includes(q));
  }, [rows, search]);

  const withSteps = rows.filter((r) => r.total_steps > 0 || r.grn_count > 0 || r.dc_count > 0);
  const needReview = rows.filter((r) => r.performance_rating === "review").length;
  const onWatch = rows.filter((r) => r.performance_rating === "watch").length;

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { key: "vendor_name", label: "Vendor Name", type: "text", width: 24 },
        { key: "city", label: "City", type: "text", width: 14 },
        { key: "vendor_type", label: "Vendor Type", type: "text", width: 16 },
        { key: "grn_count", label: "GRN Count", type: "number", width: 10 },
        { key: "grn_qty_received", label: "GRN Qty Received", type: "number", width: 14 },
        { key: "grn_qty_accepted", label: "GRN Qty Accepted", type: "number", width: 14 },
        { key: "grn_qty_rejected", label: "GRN Qty Rejected", type: "number", width: 14 },
        { key: "grn_rejection_rate_pct", label: "GRN Rejection %", type: "number", width: 14 },
        { key: "dc_count", label: "DC Count", type: "number", width: 10 },
        { key: "dc_qty_sent", label: "DC Qty Sent", type: "number", width: 12 },
        { key: "dc_qty_accepted", label: "DC Qty Accepted", type: "number", width: 14 },
        { key: "dc_qty_rejected", label: "DC Qty Rejected", type: "number", width: 14 },
        { key: "dc_rejection_rate_pct", label: "DC Rejection %", type: "number", width: 14 },
        { key: "total_steps", label: "JW Steps", type: "number", width: 10 },
        { key: "rejection_rate_pct", label: "JW Rejection %", type: "number", width: 14 },
        { key: "avg_turnaround_days", label: "Avg Turnaround (days)", type: "number", width: 18 },
        { key: "on_time_rate_pct", label: "On-Time %", type: "number", width: 12 },
        { key: "overdue_steps", label: "Overdue Now", type: "number", width: 12 },
        { key: "total_charges", label: "Total Charges", type: "currency", width: 14 },
        { key: "performance_rating", label: "Rating", type: "text", width: 12 },
        { key: "last_used_at", label: "Last Used", type: "date", width: 14 },
      ],
      "Vendor_Scorecards.xlsx",
      "Vendor Scorecards"
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
            <Star className="h-5 w-5 text-amber-500" />
            Vendor Scorecards
          </h1>
          <p className="text-sm text-slate-500 mt-1">Performance tracking across GRN receipts, DC job work, and job card steps</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="paper-card">
          <p className="text-xs font-semibold text-slate-500">Total Vendors</p>
          <p className="text-2xl font-bold font-mono mt-1">{withSteps.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">with GRN, DC, or job work history</p>
        </div>
        <div className={`paper-card ${needReview > 0 ? "border-l-4 border-l-red-500" : ""}`}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 ${needReview > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            <p className="text-xs font-semibold text-slate-500">Need Review</p>
          </div>
          <p className={`text-2xl font-bold font-mono mt-1 ${needReview > 0 ? "text-red-700" : ""}`}>{needReview}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{needReview > 0 ? "high rejection or late deliveries" : "all clear"}</p>
        </div>
        <div className={`paper-card ${onWatch > 0 ? "border-l-4 border-l-amber-400" : ""}`}>
          <div className="flex items-center gap-1.5">
            <Eye className={`h-3.5 w-3.5 ${onWatch > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            <p className="text-xs font-semibold text-slate-500">Watch</p>
          </div>
          <p className={`text-2xl font-bold font-mono mt-1 ${onWatch > 0 ? "text-amber-700" : ""}`}>{onWatch}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{onWatch > 0 ? "approaching threshold" : "all clear"}</p>
        </div>
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Search vendor name…"
          className="h-9 w-64 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left min-w-[180px] px-3 py-2">Vendor</th>
                <th className="text-left min-w-[100px] px-3 py-2">City</th>
                <th className="text-left min-w-[80px] px-3 py-2">Source</th>
                <th className="text-right min-w-[80px] px-3 py-2">GRN Rej%</th>
                <th className="text-right min-w-[80px] px-3 py-2">DC Rej%</th>
                <th className="text-right min-w-[80px] px-3 py-2">JW Steps</th>
                <th className="text-right min-w-[80px] px-3 py-2">JW Rej%</th>
                <th className="text-right min-w-[80px] px-3 py-2">Avg Days</th>
                <th className="text-right min-w-[80px] px-3 py-2">First Pass</th>
                <th className="text-right min-w-[70px] px-3 py-2">Rework%</th>
                <th className="text-right min-w-[80px] px-3 py-2">Replacements</th>
                <th className="text-right min-w-[80px] px-3 py-2">On-Time %</th>
                <th className="text-right min-w-[80px] px-3 py-2">Overdue</th>
                <th className="text-right min-w-[100px] px-3 py-2">Total Charges</th>
                <th className="text-center min-w-[90px] px-3 py-2">Rating</th>
                <th className="text-right min-w-[100px] px-3 py-2">Last Used</th>
                <th className="text-center min-w-[90px] px-3 py-2">History</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={17} className="text-center py-10 text-muted-foreground">
                    Loading scorecards…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={17} className="text-center py-10 text-muted-foreground">
                    {rows.length === 0 ? "No active vendors found." : "No vendors match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.vendor_id}
                    className={`cursor-pointer transition-colors ${
                      row.performance_rating === "review"
                        ? "bg-red-50/50 hover:bg-red-50"
                        : row.performance_rating === "watch"
                        ? "bg-amber-50/40 hover:bg-amber-50/60"
                        : "hover:bg-muted/30"
                    }`}
                    onClick={() => navigate(`/vendor-scorecards/${row.vendor_id}`)}
                  >
                    <td className="text-left px-3 py-2">
                      <p className="font-medium text-sm">{row.vendor_name}</p>
                      {row.gstin && (
                        <p className="text-xs text-muted-foreground font-mono">{row.gstin}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[
                          row.grn_count > 0 && `${row.grn_count} GRN${row.grn_count !== 1 ? "s" : ""}`,
                          row.dc_count > 0 && `${row.dc_count} DC${row.dc_count !== 1 ? "s" : ""}`,
                          row.total_steps > 0 && `${row.total_steps} JW step${row.total_steps !== 1 ? "s" : ""}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="text-left px-3 py-2 text-sm text-muted-foreground">{row.city ?? "—"}</td>
                    <td className="text-left px-3 py-2"><DataSourceBadge row={row} /></td>
                    <td className="text-right px-3 py-2">
                      <RatePct value={row.grn_rejection_rate_pct != null ? Number(row.grn_rejection_rate_pct) : null} greenBelow={3} redAbove={5} />
                    </td>
                    <td className="text-right px-3 py-2">
                      <RatePct value={row.dc_rejection_rate_pct != null ? Number(row.dc_rejection_rate_pct) : null} greenBelow={3} redAbove={5} />
                    </td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums text-sm">
                      {row.total_steps > 0 ? row.total_steps : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right px-3 py-2">
                      <RatePct value={row.rejection_rate_pct != null ? Number(row.rejection_rate_pct) : null} greenBelow={3} redAbove={5} />
                    </td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums text-sm text-muted-foreground">
                      {row.avg_turnaround_days != null ? `${row.avg_turnaround_days}d` : "—"}
                    </td>
                    <td className="text-right px-3 py-2">
                      <FirstPassYield value={row.first_pass_yield_pct != null ? Number(row.first_pass_yield_pct) : null} />
                    </td>
                    <td className="text-right px-3 py-2">
                      <RatePct value={row.rework_rate_pct != null ? Number(row.rework_rate_pct) : null} greenBelow={5} redAbove={10} />
                    </td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums text-sm">
                      {(row.replacement_count ?? 0) > 0 ? (
                        <span className="text-amber-700 font-medium">{row.replacement_count}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2">
                      <OnTimePct value={row.on_time_rate_pct != null ? Number(row.on_time_rate_pct) : null} />
                    </td>
                    <td className="text-right px-3 py-2">
                      {Number(row.overdue_steps) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {Number(row.overdue_steps)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2 font-mono tabular-nums text-sm font-medium">
                      {formatCurrency(Number(row.total_charges))}
                    </td>
                    <td className="text-center px-3 py-2">
                      <RatingBadge rating={row.performance_rating} />
                    </td>
                    <td className="text-right px-3 py-2 text-sm text-muted-foreground">
                      {row.last_used_at
                        ? format(new Date(row.last_used_at), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="text-center px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors whitespace-nowrap"
                        onClick={() => navigate(`/vendor-scorecards/${row.vendor_id}`)}
                      >
                        View History →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Click any row or View History to see detailed transaction trail · GRN = goods receipt quality · DC = job work out quality · JW = job card steps (legacy) · Rating uses worst-case rejection across all sources
      </p>
    </div>
  );
}
