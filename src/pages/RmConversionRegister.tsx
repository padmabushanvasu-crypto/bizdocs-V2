import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronDown, ChevronRight, Plus, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { TablePageSize } from "@/components/TablePageSize";
import { ReverseConversionDialog } from "@/components/ReverseConversionDialog";
import { useCanEdit } from "@/hooks/useCanEdit";
import { formatNumber, formatCurrency } from "@/lib/gst-utils";
import {
  fetchRmConversions,
  fetchRmConversionInputs,
  type RmConversionRow,
} from "@/lib/rm-conversions-api";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "reversed"
      ? "bg-slate-100 text-slate-500 border-slate-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      {status === "reversed" ? "Reversed" : "Posted"}
    </span>
  );
}

function InputsDetail({ rmConversionId }: { rmConversionId: string }) {
  const { data: inputs = [], isLoading } = useQuery({
    queryKey: ["rm-conversion-inputs", rmConversionId],
    queryFn: () => fetchRmConversionInputs(rmConversionId),
  });

  if (isLoading) {
    return <p className="text-xs text-slate-400 px-4 py-3">Loading inputs…</p>;
  }
  if (inputs.length === 0) {
    return <p className="text-xs text-slate-400 px-4 py-3">No input lines recorded.</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-slate-50">
          <th className="px-3 py-1.5 text-left font-semibold text-slate-500 uppercase tracking-wide">Item</th>
          <th className="px-3 py-1.5 text-left font-semibold text-slate-500 uppercase tracking-wide">Source</th>
          <th className="px-3 py-1.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
          <th className="px-3 py-1.5 text-right font-semibold text-indigo-600 uppercase tracking-wide">Alt Qty</th>
          <th className="px-3 py-1.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Scrap</th>
          <th className="px-3 py-1.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Return</th>
        </tr>
      </thead>
      <tbody>
        {inputs.map((i) => (
          <tr key={i.id} className="border-t border-slate-100">
            <td className="px-3 py-1.5">
              <span className="font-mono text-slate-700">{i.item_code}</span>
              {i.description && <span className="text-slate-500 ml-1">{i.description}</span>}
            </td>
            <td className="px-3 py-1.5 text-slate-600">{i.source === "grn_direct" ? "GRN-direct" : "Store"}</td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatNumber(i.qty_base)}</td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-indigo-600">
              {i.qty_alt != null ? `${formatNumber(i.qty_alt)} ${i.alt_unit ?? ""}` : "—"}
            </td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{i.scrap_qty_base > 0 ? formatNumber(i.scrap_qty_base) : "—"}</td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{i.return_qty_base > 0 ? formatNumber(i.return_qty_base) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RmConversionRegister() {
  const navigate = useNavigate();
  const canEdit = useCanEdit("rm-conversions");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reverseTarget, setReverseTarget] = useState<RmConversionRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rm-conversions", page, pageSize],
    queryFn: () => fetchRmConversions(page, pageSize),
  });

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RM Conversions</h1>
          <p className="text-sm text-slate-500 mt-1">Raw material conversions — consumed inputs and the item produced.</p>
        </div>
        {canEdit && (
          <Button onClick={() => navigate("/rm-conversions/new")} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Conversion
          </Button>
        )}
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left"></th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Posted</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Output Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty Produced</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right hidden md:table-cell">Unit Cost</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left hidden md:table-cell">Posted By</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">No RM conversions yet.</td></tr>
              ) : (
                rows.map((r) => {
                  const expanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-400">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                          {(() => { try { return format(new Date(r.posted_at), "dd MMM yyyy, HH:mm"); } catch { return r.posted_at; } })()}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          <span className="font-mono text-slate-700">{r.output_item_code}</span>
                          {r.output_item_description && (
                            <span className="text-slate-500 ml-1">{r.output_item_description}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                          {formatNumber(r.output_qty_base)} {r.output_unit}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums text-slate-600 hidden md:table-cell">
                          {r.output_unit_cost != null ? formatCurrency(r.output_unit_cost) : "—"}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 hidden md:table-cell">{r.posted_by_name ?? "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100 text-center">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
                          {canEdit && r.status !== "reversed" && (
                            <button
                              className="text-xs font-medium text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition-colors whitespace-nowrap flex items-center gap-1"
                              onClick={() => setReverseTarget(r)}
                            >
                              <Undo2 className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="p-0 border-b border-slate-100 bg-slate-50/50">
                            <InputsDetail rmConversionId={r.id} />
                            {r.status === "reversed" && r.reversal_reason && (
                              <p className="text-xs text-slate-500 px-4 pb-3">
                                Reversed by {r.reversed_by_name ?? "—"}
                                {r.reversed_at && ` on ${(() => { try { return format(new Date(r.reversed_at), "dd MMM yyyy, HH:mm"); } catch { return r.reversed_at; } })()}`}
                                : {r.reversal_reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <TablePageSize value={pageSize} onChange={(v) => { setPageSize(v); setPage(0); }} />
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <span>Page {page + 1} of {totalPages} ({count} total)</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <ReverseConversionDialog
        open={!!reverseTarget}
        onOpenChange={(open) => { if (!open) setReverseTarget(null); }}
        rmConversionId={reverseTarget?.id ?? null}
        outputItemLabel={reverseTarget?.output_item_code}
      />
    </div>
  );
}
