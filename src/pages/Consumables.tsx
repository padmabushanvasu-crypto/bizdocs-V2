import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchConsumableIssues,
  fetchConsumableStats,
  type ConsumableIssue,
} from "@/lib/consumables-api";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { format, parseISO } from "date-fns";

// ─── Glow-box style (same pattern as Dashboard) ──────────────────────────────

function glowBox(r: number, g: number, b: number, dark: boolean) {
  if (dark) {
    return {
      background: "#0A0F1C",
      backgroundImage: [
        `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.22), transparent 55%)`,
        "linear-gradient(180deg, rgba(255,255,255,0.025), transparent 30%)",
      ].join(", "),
      boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 30px -12px rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.06)",
    };
  }
  return {
    background: "white",
    backgroundImage: [
      `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.10), transparent 55%)`,
      `linear-gradient(180deg, rgba(${r},${g},${b},0.04), transparent 30%)`,
    ].join(", "),
    boxShadow: `0 1px 3px rgba(0,0,0,0.08), 0 4px 16px -4px rgba(${r},${g},${b},0.15)`,
    border: "1px solid rgba(148,163,184,0.8)",
  };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    issued: { label: "Issued", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    draft:  { label: "Draft",  className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

export default function Consumables() {
  const navigate = useNavigate();
  const { canEdit } = useRoleAccess("consumables");

  // Dark mode observer
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Month filter
  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      opts.push({ value, label });
    }
    return opts;
  })();

  const [month, setMonth] = useState(monthOptions[0].value);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["consumable-stats"],
    queryFn: fetchConsumableStats,
  });

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["consumable-issues", month, statusFilter, search],
    queryFn: () =>
      fetchConsumableIssues({ month, status: statusFilter, search: search || undefined }),
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Wrench className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Consumables Issue</h1>
        </div>
        {canEdit && (
          <Button onClick={() => navigate("/consumables/new")}>
            <Plus className="w-4 h-4 mr-2" />
            New Issue
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 space-y-1" style={glowBox(59, 130, 246, isDark)}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Issues This Month</p>
          <p className="text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {stats?.issues_this_month ?? 0}
          </p>
        </div>
        <div className="rounded-xl p-4 space-y-1" style={glowBox(139, 92, 246, isDark)}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Qty Issued</p>
          <p className="text-3xl font-bold tabular-nums text-violet-600 dark:text-violet-400">
            {stats?.qty_issued_this_month ?? 0}
          </p>
        </div>
        <div className="rounded-xl p-4 space-y-1" style={glowBox(34, 197, 94, isDark)}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Qty Returned</p>
          <p className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
            {stats?.qty_returned_this_month ?? 0}
          </p>
        </div>
        <div className="rounded-xl p-4 space-y-1" style={glowBox(245, 158, 11, isDark)}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pending Returns</p>
          <p className="text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {stats?.pending_returns ?? 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search issue number or issued to…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-10">Loading…</p>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
          <Wrench className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 font-medium">No consumable issues found</p>
          <p className="text-sm text-slate-400">Try adjusting the filters or create a new issue.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Issue #</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Issued To</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Issued By</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Lines</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">Status</th>
                  <th className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700" />
                </tr>
              </thead>
              <tbody>
                {issues.map((issue: ConsumableIssue) => (
                  <tr
                    key={issue.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/consumables/${issue.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono font-medium text-primary border-b border-slate-100 dark:border-slate-800">
                      {issue.issue_number}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      {format(parseISO(issue.issue_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 font-medium">
                      {issue.issued_to}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                      {issue.issued_by ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-center tabular-nums">
                      {issue.lines?.length ?? 0}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      {statusBadge(issue.status)}
                    </td>
                    <td className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/consumables/${issue.id}`);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
