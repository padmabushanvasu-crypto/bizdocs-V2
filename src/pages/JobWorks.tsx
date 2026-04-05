import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
}

export default function JobWorks() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["job-works", { search, status, page }],
    queryFn: () => fetchJobWorks({ search, status, page, pageSize: PAGE_SIZE }),
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">JC #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Location</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Progress</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16">
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
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                        {row.jc_number}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
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
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusCls[row.status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {row.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${priorityCls[row.priority] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {row.current_location === "at_vendor" ? "At Vendor" : "In-House"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-sm text-slate-700">
                        {row.quantity_original}
                        {row.unit ? <span className="text-slate-400 text-xs ml-0.5">{row.unit}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <MiniProgress done={row.completed_steps ?? 0} total={row.step_count ?? 0} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
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

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500 flex items-center px-2">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={page * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
