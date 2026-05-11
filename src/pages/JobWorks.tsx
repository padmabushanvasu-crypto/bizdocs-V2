import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchJobWorks, type JobWorkSummary } from "@/lib/job-works-api";

const STATUS_PILLS = [
  { label: "All",         value: "all" },
  { label: "In Progress", value: "in_progress" },
  { label: "On Hold",     value: "on_hold" },
  { label: "Overdue",     value: "overdue" },
  { label: "Completed",   value: "completed" },
];

const statusCls: Record<string, string> = {
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  on_hold:     "bg-amber-50 text-amber-700 border-amber-200",
  completed:   "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const priorityCls: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200",
  high:   "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-slate-50 text-slate-600 border-slate-200",
  low:    "bg-slate-50 text-slate-400 border-slate-200",
};

function MiniProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-slate-300 text-xs">—</span>;
  const pct = Math.round((done / total) * 100);
  const pillColor = pct === 100
    ? "bg-emerald-100 text-emerald-700"
    : pct > 0
    ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-500";
  return (
    <div className="min-w-[80px] space-y-1">
      <div className="flex gap-0.5 h-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-full transition-colors ${i < done ? "bg-emerald-500" : "bg-slate-100"} ${i === 0 ? "rounded-l-full" : ""} ${i === total - 1 ? "rounded-r-full" : ""}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-slate-500 tabular-nums">{done}/{total}</span>
        <span className={`text-[10px] font-semibold px-1 py-px rounded ${pillColor}`}>{pct}%</span>
      </div>
    </div>
  );
}

export default function JobWorks() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading } = useQuery({
    queryKey: ["job-works", { search, status, page, pageSize }],
    queryFn: () => fetchJobWorks({ search, status, page, pageSize }),
  });

  const rows: JobWorkSummary[] = data?.data ?? [];
  const total = data?.count ?? 0;

  // Client-side filter for overdue — already handled server-side when status=overdue
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isOverdue = (row: JobWorkSummary) =>
    !!row.due_date && row.due_date < today && row.status !== "completed";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Cards</h1>
          <p className="text-sm text-slate-500 mt-1">Track production and outsourced processing stages</p>
        </div>
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_PILLS.map((pill) => (
          <button
            key={pill.value}
            onClick={() => { setStatus(pill.value); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              status === pill.value
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search JC#, item code, description..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left whitespace-nowrap">JC #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Priority</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left whitespace-nowrap">Location</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right whitespace-nowrap">Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left whitespace-nowrap">Progress</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left whitespace-nowrap">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <Activity className="h-10 w-10 text-slate-300" />
                      <p className="font-medium text-slate-600">No job cards found</p>
                      <p className="text-sm text-slate-400">Job cards are created automatically when a DC is issued for job work</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const overdue = isOverdue(row);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/job-works/${row.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium whitespace-nowrap">
                        {row.jc_number}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left max-w-[240px]">
                        {row.item_code && (
                          <p className="text-[11px] text-slate-400 font-mono leading-none mb-0.5">{row.item_code}</p>
                        )}
                        <p className="text-sm font-medium text-slate-800 leading-snug">
                          {row.item_description ?? "—"}
                        </p>
                        {row.current_location === "at_vendor" && row.current_vendor_name && (
                          <p className="text-[11px] text-blue-600 mt-0.5">At: {row.current_vendor_name}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusCls[row.status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {row.status === "completed"
                            ? "Completed"
                            : row.status === "in_progress" && (row.step_count ?? 0) > 0
                            ? `Stage ${(row.completed_steps ?? 0) + 1} of ${row.step_count}`
                            : row.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${priorityCls[row.priority] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left whitespace-nowrap">
                        {row.current_location === "at_vendor" ? "At Vendor" : "In-House"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {row.quantity_original}
                        {row.unit ? <span className="text-slate-400 text-xs ml-0.5">{row.unit}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        <MiniProgress done={row.completed_steps ?? 0} total={row.step_count ?? 0} />
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left whitespace-nowrap">
                        {row.due_date ? (
                          <span className={`text-xs ${overdue ? "text-red-600 font-semibold flex items-center gap-1" : "text-slate-600"}`}>
                            {overdue && <AlertTriangle className="h-3 w-3" />}
                            {new Date(row.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer — "Per page" always visible; prev/next only when count exceeds pageSize */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {total > pageSize && (
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
