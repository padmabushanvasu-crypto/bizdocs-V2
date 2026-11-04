import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchGrnPendingAgeing, type GrnPendingAgeingRow } from "@/lib/grn-api";

// GRN ageing alert (Nov 2026). Reads v_grn_pending_ageing — a live view that
// reuses the app's own rules (header grn_stage for QC, v_grn_line_next_action
// for store). This widget only groups and formats; it computes nothing.

const OLDER_THAN_DAYS = 3;

const STEP_LABEL: Record<GrnPendingAgeingRow["pending_step"], string> = {
  qc_pending: "QC",
  store_pending: "Store",
};

interface GrnGroup {
  grn_id: string;
  grn_number: string;
  vendor_name: string | null;
  pending_step: GrnPendingAgeingRow["pending_step"];
  age_days: number;
  lines: number;
  action_label: string;
}

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

interface Props {
  companyId: string;
}

export function GrnAgeingWidget({ companyId }: Props) {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["grn-pending-ageing", companyId],
    queryFn: () => fetchGrnPendingAgeing(companyId),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!companyId,
  });

  const { overdue, qcCount, storeCount } = useMemo(() => {
    const byGrn = new Map<string, GrnGroup>();
    for (const r of rows) {
      if (r.age_days <= OLDER_THAN_DAYS) continue;
      const key = `${r.grn_id}|${r.pending_step}`;
      const g = byGrn.get(key);
      if (g) {
        g.lines += 1;
      } else {
        byGrn.set(key, {
          grn_id: r.grn_id,
          grn_number: r.grn_number,
          vendor_name: r.vendor_name,
          pending_step: r.pending_step,
          age_days: r.age_days,
          lines: 1,
          action_label: r.action_label,
        });
      }
    }
    const list = [...byGrn.values()].sort((a, b) => b.age_days - a.age_days);
    return {
      overdue: list,
      qcCount: list.filter((g) => g.pending_step === "qc_pending").length,
      storeCount: list.filter((g) => g.pending_step === "store_pending").length,
    };
  }, [rows]);

  const thClass = "sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
  const thStyle = { background: isDark ? "#0A0F1C" : "white" };

  return (
    <div className="rounded-xl flex flex-col relative overflow-hidden" style={glowBox(245, 158, 11, isDark)}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-3 flex-wrap">
        <h2 className="text-sm font-display font-semibold text-foreground">
          GRNs waiting more than {OLDER_THAN_DAYS} days
          {!isLoading && overdue.length > 0 && (
            <span className="ml-2 text-xs font-mono font-normal text-muted-foreground">({overdue.length})</span>
          )}
        </h2>
        {!isLoading && overdue.length > 0 && (
          <div className="flex gap-3 text-xs font-mono">
            <span className="text-amber-600 dark:text-amber-300">QC: {qcCount}</span>
            <span className="text-rose-600 dark:text-rose-300">Store: {storeCount}</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="px-4 py-6 text-sm text-destructive">
          Could not load GRN ageing: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : overdue.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          No GRN has been waiting more than {OLDER_THAN_DAYS} days
        </div>
      ) : (
        <div className="relative max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className={thClass} style={thStyle}>GRN #</th>
                <th className={thClass} style={thStyle}>Vendor</th>
                <th className={thClass} style={thStyle}>Waiting for</th>
                <th className={`${thClass} text-right`} style={thStyle}>Lines</th>
                <th className={`${thClass} text-right`} style={thStyle}>Days</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((g, idx) => (
                <tr key={`${g.grn_id}-${g.pending_step}`} className={`border-b border-border/50 ${idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-2">
                    <button
                      className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors text-left"
                      onClick={() => navigate(`/grn/${g.grn_id}`)}
                    >
                      {g.grn_number}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground max-w-[140px] truncate">
                    {g.vendor_name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground">
                    <span className="font-semibold">{STEP_LABEL[g.pending_step]}</span>
                    <span className="text-muted-foreground"> · {g.action_label}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums">{g.lines}</td>
                  <td className={`px-3 py-2 text-xs text-right font-mono tabular-nums ${g.age_days > 14 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-foreground"}`}>
                    {g.age_days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
