import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, type ExportColumn } from "@/lib/export-utils";
import {
  fetchDcsInvoicePending,
  fetchInvoicedLines,
  type DcInvoiceStatusRow,
  type DcLineEstimateVsActualRow,
} from "@/lib/processor-invoices-api";

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";
const TD = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";
const TF = "px-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 border-t border-slate-200";

const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: string) => (d ?? "").slice(0, 10);
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const varianceClass = (v: number) =>
  v > 0 ? "text-red-600 font-medium" : v < 0 ? "text-emerald-600 font-medium" : "text-slate-500";
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatCurrency(v)}`;
const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

const DC_STATUS_LABEL: Record<string, string> = {
  issued: "Issued",
  partially_returned: "Partially returned",
  fully_returned: "Fully returned",
};

interface Filters { party: string; from: string; to: string }
const NO_FILTERS: Filters = { party: "all", from: "", to: "" };

function inRange(date: string, f: Filters, partyId: string | null) {
  if (f.party !== "all" && partyId !== f.party) return false;
  const d = day(date);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

function FilterBar({
  filters, onChange, parties, children,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  parties: { id: string; name: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select value={filters.party} onValueChange={(v) => onChange({ ...filters, party: v })}>
        <SelectTrigger className="w-64"><SelectValue placeholder="All processors" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All processors</SelectItem>
          {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {children}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase block">DC date from</label>
        <Input type="date" className="w-40 h-9" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase block">to</label>
        <Input type="date" className="w-40 h-9" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
      </div>
    </div>
  );
}

function partyOptions(rows: { party_id: string | null; party_name: string | null }[]) {
  const m = new Map<string, string>();
  for (const r of rows) if (r.party_id) m.set(r.party_id, r.party_name ?? "—");
  return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Tab 1: DCs with invoice pending ──────────────────────────────────────────

const PENDING_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC No", type: "text", width: 16 },
  { key: "dc_date", label: "DC Date", type: "date", width: 14 },
  { key: "party_name", label: "Processor", type: "text", width: 28 },
  { key: "dc_status", label: "DC Status", type: "text", width: 18 },
  { key: "invoice_status", label: "Invoice Status", type: "text", width: 22 },
  { key: "lines", label: "Lines Invoiced / Total", type: "text", width: 20 },
  { key: "estimate_amount", label: "Estimate Amount", type: "currency", width: 16 },
  { key: "days", label: "Days Since DC", type: "number", width: 14 },
];

function PendingTab() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [status, setStatus] = useState<"all" | "Invoice pending" | "Invoice partly received">("all");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["processor-invoice-report-pending"],
    queryFn: fetchDcsInvoicePending,
  });

  const parties = useMemo(() => partyOptions(data), [data]);
  const rows = useMemo(
    () =>
      data
        .filter((r) => inRange(r.dc_date, filters, r.party_id))
        .filter((r) => status === "all" || r.invoice_status === status)
        .sort((a, b) => day(a.dc_date).localeCompare(day(b.dc_date)) || a.dc_number.localeCompare(b.dc_number)),
    [data, filters, status],
  );
  const estimateTotal = round2(rows.reduce((s, r) => s + r.estimate_amount, 0));

  const exportXlsx = () =>
    exportToExcel(
      rows.map((r: DcInvoiceStatusRow) => ({
        ...r,
        dc_status: DC_STATUS_LABEL[r.dc_status] ?? r.dc_status,
        lines: `${r.lines_invoiced} / ${r.line_count}`,
        days: daysSince(r.dc_date),
      })),
      PENDING_COLS,
      `DCs-invoice-pending-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Invoice pending",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar filters={filters} onChange={setFilters} parties={parties}>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Pending + partly</SelectItem>
              <SelectItem value="Invoice pending">Invoice pending</SelectItem>
              <SelectItem value="Invoice partly received">Invoice partly received</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>
        <Button variant="outline" disabled={rows.length === 0} onClick={exportXlsx}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">Could not load report: {(error as Error).message}</p>}
      <div className="paper-card !p-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>DC No</th>
              <th className={`${TH} text-left`}>Date</th>
              <th className={`${TH} text-left`}>Processor</th>
              <th className={`${TH} text-left`}>DC Status</th>
              <th className={`${TH} text-left`}>Invoice</th>
              <th className={`${TH} text-right`}>Lines Invoiced</th>
              <th className={`${TH} text-right`}>Estimate</th>
              <th className={`${TH} text-right`}>Days</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : rows.length === 0 && !error ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No DCs with invoice pending</td></tr>
            ) : rows.map((r) => (
              <tr key={r.dc_id}>
                <td className={`${TD} font-mono font-medium`}>{r.dc_number}</td>
                <td className={TD}>{fmtDate(r.dc_date)}</td>
                <td className={`${TD} font-medium`}>{r.party_name ?? "—"}</td>
                <td className={TD}>{DC_STATUS_LABEL[r.dc_status] ?? r.dc_status}</td>
                <td className={TD}>{r.invoice_status}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{r.lines_invoiced} / {r.line_count}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(r.estimate_amount)}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{daysSince(r.dc_date)}d</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className={TF} colSpan={6}>{rows.length} DC{rows.length !== 1 ? "s" : ""} (filtered)</td>
                <td className={`${TF} text-right tabular-nums font-mono`}>{formatCurrency(estimateTotal)}</td>
                <td className={TF} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab 2: estimate vs actual ────────────────────────────────────────────────

// Estimate for the qty actually billed, so Estimate / Actual / Variance reconcile.
const estOf = (r: DcLineEstimateVsActualRow) => round2(r.estimate_rate * r.billed_qty);

const EVA_COLS: ExportColumn[] = [
  { key: "dc_number", label: "DC No", type: "text", width: 16 },
  { key: "dc_date", label: "DC Date", type: "date", width: 14 },
  { key: "party_name", label: "Processor", type: "text", width: 28 },
  { key: "item_code", label: "Item Code", type: "text", width: 18 },
  { key: "description", label: "Description", type: "text", width: 32 },
  { key: "billed_qty", label: "Billed Qty", type: "number", width: 12 },
  { key: "estimate_rate", label: "Estimate Rate", type: "currency", width: 14 },
  { key: "actual_rate_avg", label: "Actual Rate (avg)", type: "currency", width: 16 },
  { key: "estimate_billed", label: "Estimate (billed qty)", type: "currency", width: 18 },
  { key: "actual_taxable", label: "Actual (taxable)", type: "currency", width: 16 },
  { key: "variance_amount", label: "Variance", type: "currency", width: 14 },
];

function EstimateVsActualTab() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showSummary, setShowSummary] = useState(true);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["processor-invoice-report-eva"],
    queryFn: fetchInvoicedLines,
  });

  const parties = useMemo(() => partyOptions(data), [data]);
  const rows = useMemo(
    () => data.filter((r) => inRange(r.dc_date, filters, r.party_id)),
    [data, filters],
  );
  const totals = useMemo(
    () => ({
      est: round2(rows.reduce((s, r) => s + estOf(r), 0)),
      act: round2(rows.reduce((s, r) => s + r.actual_taxable, 0)),
      variance: round2(rows.reduce((s, r) => s + r.variance_amount, 0)),
    }),
    [rows],
  );
  const byParty = useMemo(() => {
    const m = new Map<string, { name: string; lines: number; est: number; act: number; variance: number }>();
    for (const r of rows) {
      const k = r.party_id ?? "—";
      const e = m.get(k) ?? { name: r.party_name ?? "—", lines: 0, est: 0, act: 0, variance: 0 };
      e.lines += 1; e.est += estOf(r); e.act += r.actual_taxable; e.variance += r.variance_amount;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const exportXlsx = () =>
    exportToExcel(
      rows.map((r) => ({ ...r, estimate_billed: estOf(r) })),
      EVA_COLS,
      `Processor-estimate-vs-actual-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Estimate vs actual",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar filters={filters} onChange={setFilters} parties={parties} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSummary((s) => !s)}>
            {showSummary ? "Hide" : "Show"} processor summary
          </Button>
          <Button variant="outline" disabled={rows.length === 0} onClick={exportXlsx}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">Could not load report: {(error as Error).message}</p>}

      {showSummary && byParty.length > 0 && (
        <div className="paper-card !p-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Processor (summary)</th>
                <th className={`${TH} text-right`}>Lines</th>
                <th className={`${TH} text-right`}>Estimate</th>
                <th className={`${TH} text-right`}>Actual</th>
                <th className={`${TH} text-right`}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {byParty.map((p) => (
                <tr key={p.name}>
                  <td className={`${TD} font-medium`}>{p.name}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{p.lines}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(round2(p.est))}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(round2(p.act))}</td>
                  <td className={`${TD} text-right tabular-nums font-mono ${varianceClass(round2(p.variance))}`}>{signed(round2(p.variance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="paper-card !p-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>DC No</th>
              <th className={`${TH} text-left`}>Processor</th>
              <th className={`${TH} text-left`}>Item</th>
              <th className={`${TH} text-left`}>Description</th>
              <th className={`${TH} text-right`}>Billed Qty</th>
              <th className={`${TH} text-right`}>Est. Rate</th>
              <th className={`${TH} text-right`}>Actual Rate</th>
              <th className={`${TH} text-right`}>Estimate</th>
              <th className={`${TH} text-right`}>Actual</th>
              <th className={`${TH} text-right`}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : rows.length === 0 && !error ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No invoiced lines</td></tr>
            ) : rows.map((r) => (
              <tr key={r.dc_line_item_id}>
                <td className={`${TD} font-mono font-medium`}>{r.dc_number}</td>
                <td className={TD}>{r.party_name ?? "—"}</td>
                <td className={`${TD} font-mono`}>{r.item_code ?? "—"}</td>
                <td className={TD}>{r.description ?? "—"}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{r.billed_qty} {r.unit ?? ""}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(r.estimate_rate)}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{r.actual_rate_avg != null ? formatCurrency(r.actual_rate_avg) : "—"}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(estOf(r))}</td>
                <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(r.actual_taxable)}</td>
                <td className={`${TD} text-right tabular-nums font-mono ${varianceClass(r.variance_amount)}`}>{signed(r.variance_amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className={TF} colSpan={7}>{rows.length} line{rows.length !== 1 ? "s" : ""} (filtered)</td>
                <td className={`${TF} text-right tabular-nums font-mono`}>{formatCurrency(totals.est)}</td>
                <td className={`${TF} text-right tabular-nums font-mono`}>{formatCurrency(totals.act)}</td>
                <td className={`${TF} text-right tabular-nums font-mono ${varianceClass(totals.variance)}`}>{signed(totals.variance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProcessorInvoiceReports() {
  const { hideCosts } = useRoleAccess("processor-invoices");
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Processor Invoice Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Reporting only — nothing here changes item cost or stock</p>
      </div>
      {hideCosts ? (
        <p className="text-sm text-slate-500">You don't have access to cost reports.</p>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Invoice pending</TabsTrigger>
            <TabsTrigger value="eva">Estimate vs actual</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-3"><PendingTab /></TabsContent>
          <TabsContent value="eva" className="mt-3"><EstimateVsActualTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
