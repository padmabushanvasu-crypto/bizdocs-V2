import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Star, AlertTriangle, Eye, Download, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchVendorScorecards, type VendorScorecard } from "@/lib/job-cards-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { format } from "date-fns";

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

  const withSteps = rows.filter((r) => r.total_steps > 0);
  const needReview = rows.filter((r) => r.performance_rating === "review").length;
  const onWatch = rows.filter((r) => r.performance_rating === "watch").length;

  const handleExport = () => {
    exportToExcel(
      filtered,
      [
        { key: "vendor_name", label: "Vendor Name", type: "text", width: 24 },
        { key: "city", label: "City", type: "text", width: 14 },
        { key: "total_steps", label: "Total Steps", type: "number", width: 12 },
        { key: "total_qty_sent", label: "Qty Sent", type: "number", width: 10 },
        { key: "total_qty_accepted", label: "Qty Accepted", type: "number", width: 12 },
        { key: "total_qty_rejected", label: "Qty Rejected", type: "number", width: 12 },
        { key: "rejection_rate_pct", label: "Rejection %", type: "number", width: 12 },
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Vendor Scorecards
          </h1>
          <p className="text-sm text-slate-500 mt-1">Job work performance tracking</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="paper-card">
          <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Total Vendors</p>
          <p className="text-2xl font-bold font-mono mt-1">{withSteps.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">with job work history</p>
        </div>
        <div className={`paper-card ${needReview > 0 ? "border-l-4 border-l-red-500" : ""}`}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 ${needReview > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Need Review</p>
          </div>
          <p className={`text-2xl font-bold font-mono mt-1 ${needReview > 0 ? "text-red-700" : ""}`}>{needReview}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{needReview > 0 ? "high rejection or late deliveries" : "all clear"}</p>
        </div>
        <div className={`paper-card ${onWatch > 0 ? "border-l-4 border-l-amber-400" : ""}`}>
          <div className="flex items-center gap-1.5">
            <Eye className={`h-3.5 w-3.5 ${onWatch > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Watch</p>
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
                <th>Vendor</th>
                <th>City</th>
                <th className="text-right">Steps</th>
                <th className="text-right">Sent</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Rejected</th>
                <th className="text-right">Rejection %</th>
                <th className="text-right">Avg Days</th>
                <th className="text-right">On-Time %</th>
                <th className="text-right">Overdue</th>
                <th className="text-right">Total Charges</th>
                <th>Rating</th>
                <th className="text-right">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="text-center py-10 text-muted-foreground">
                    Loading scorecards…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-10 text-muted-foreground">
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
                    onClick={() => navigate(`/parties/${row.vendor_id}`)}
                  >
                    <td>
                      <p className="font-medium text-sm">{row.vendor_name}</p>
                      {row.gstin && (
                        <p className="text-xs text-muted-foreground font-mono">{row.gstin}</p>
                      )}
                    </td>
                    <td className="text-sm text-muted-foreground">{row.city ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums text-sm">
                      {row.total_steps > 0 ? row.total_steps : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm">{Number(row.total_qty_sent)}</td>
                    <td className="text-right font-mono tabular-nums text-sm text-green-700">{Number(row.total_qty_accepted)}</td>
                    <td className="text-right font-mono tabular-nums text-sm text-red-600">{Number(row.total_qty_rejected)}</td>
                    <td className="text-right">
                      <RatePct value={Number(row.rejection_rate_pct)} greenBelow={3} redAbove={5} />
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                      {row.avg_turnaround_days != null ? `${row.avg_turnaround_days}d` : "—"}
                    </td>
                    <td className="text-right">
                      <OnTimePct value={row.on_time_rate_pct != null ? Number(row.on_time_rate_pct) : null} />
                    </td>
                    <td className="text-right">
                      {Number(row.overdue_steps) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {Number(row.overdue_steps)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums text-sm font-medium">
                      {formatCurrency(Number(row.total_charges))}
                    </td>
                    <td>
                      <RatingBadge rating={row.performance_rating} />
                    </td>
                    <td className="text-right text-sm text-muted-foreground">
                      {row.last_used_at
                        ? format(new Date(row.last_used_at), "dd MMM yyyy")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Click any row to view vendor details · Rating: Reliable &lt;3% rejection &amp; &gt;85% on-time · Watch: &lt;5% &amp; &gt;70% · Review: exceeds thresholds
      </p>
    </div>
  );
}
