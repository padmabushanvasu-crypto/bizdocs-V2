import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/gst-utils";
import { fetchAwoCostBreakdown, type AssemblyWorkOrder } from "@/lib/production-api";

const th =
  "px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700";
const td = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";

export function AwoBuildCostPanel({ awo }: { awo: AssemblyWorkOrder }) {
  const { data: lines = [], isLoading, error } = useQuery({
    queryKey: ["awo-cost-breakdown", awo.id],
    queryFn: () => fetchAwoCostBreakdown(awo.id),
  });

  const byLine = new Map((awo.line_items ?? []).map((li) => [li.id, li]));
  const total = lines.reduce((s, l) => s + l.line_cost, 0);
  const unpricedLines = lines.filter((l) => l.rate_source === "unpriced").length;
  const partialLines = lines.filter((l) => l.unpriced_children > 0).length;
  const isPartial = unpricedLines + partialLines > 0;
  const units = Number(awo.actual_quantity_produced ?? 0) || Number(awo.quantity_to_build ?? 0);

  return (
    <div className="no-print space-y-3">
      <h2 className="text-lg font-semibold">Build Cost</h2>
      <div className="paper-card !p-0">
        {isLoading ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">Loading cost…</p>
        ) : error ? (
          <p className="px-3 py-6 text-sm text-red-600">Could not load cost: {(error as Error).message}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Item Code</th>
                  <th className={`${th} text-left`}>Description</th>
                  <th className={`${th} text-right`}>Consumed Qty</th>
                  <th className={`${th} text-right`}>Rate</th>
                  <th className={`${th} text-right`}>Line Cost</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const li = byLine.get(l.line_id);
                  return (
                    <tr key={l.line_id}>
                      <td className={`${td} font-mono text-blue-700`}>{li?.drawing_number ?? li?.item_code ?? "—"}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{li?.item_description ?? "—"}</span>
                          {l.rate_source === "bom_rollup" && (
                            <Badge variant="outline" className="text-[10px]">rolled up</Badge>
                          )}
                          {l.unpriced_children > 0 && (
                            <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                              partial ({l.unpriced_children} unpriced)
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className={`${td} text-right tabular-nums font-mono`}>
                        {formatNumber(l.consumed_qty)} {li?.unit ?? ""}
                      </td>
                      <td className={`${td} text-right tabular-nums font-mono`}>
                        {l.rate_source === "unpriced" ? (
                          <Badge className="bg-red-100 text-red-700">Unpriced</Badge>
                        ) : (
                          formatCurrency(l.unit_rate)
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums font-mono`}>
                        {l.rate_source === "unpriced" ? "—" : formatCurrency(l.line_cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <td className="px-3 py-2 text-sm" colSpan={4}>
                    Total material cost
                    {isPartial && (
                      <span className="ml-2 text-xs font-medium text-amber-700">
                        Partial – {unpricedLines + partialLines} line{unpricedLines + partialLines === 1 ? "" : "s"} unpriced
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums font-mono">{formatCurrency(total)}</td>
                </tr>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <td className="px-3 py-2 text-sm" colSpan={4}>
                    Cost per unit ({formatNumber(units)} built)
                  </td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums font-mono">
                    {units > 0 ? formatCurrency(total / units) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
