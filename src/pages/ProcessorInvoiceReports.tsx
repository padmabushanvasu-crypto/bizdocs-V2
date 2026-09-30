import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, type ExportColumn } from "@/lib/export-utils";
import {
  fetchDcsInvoicePending,
  fetchInvoicedLines,
  fetchProcessorRateMonthly,
  fetchProcessorRateHistory,
  type ProcessorRateMonthlyRow,
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

// Phone: filters collapse behind a toggle and stack two per row; md+: inline row (unchanged).
function FilterBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full md:w-auto">
      <Button variant="outline" className="md:hidden w-full justify-between h-10" onClick={() => setOpen((o) => !o)}>
        Filters <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      <div className={`${open ? "grid" : "hidden"} mt-3 grid-cols-2 gap-3 md:mt-0 md:flex md:flex-wrap md:items-end`}>
        {children}
      </div>
    </div>
  );
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
    <FilterBox>
      <Select value={filters.party} onValueChange={(v) => onChange({ ...filters, party: v })}>
        <SelectTrigger className="col-span-2 w-full md:w-64"><SelectValue placeholder="All processors" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All processors</SelectItem>
          {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {children}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase block">DC date from</label>
        <Input type="date" className="w-full md:w-40 h-10 md:h-9" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase block">to</label>
        <Input type="date" className="w-full md:w-40 h-10 md:h-9" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
      </div>
    </FilterBox>
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
            <SelectTrigger className="col-span-2 w-full md:w-52"><SelectValue /></SelectTrigger>
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
        <table className="w-full min-w-[640px] border-collapse text-sm">
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
          <table className="w-full min-w-[640px] border-collapse text-sm">
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
        <table className="w-full min-w-[640px] border-collapse text-sm">
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

// ── Tab 3: price movement ────────────────────────────────────────────────────
// Rates are per unit, so everything is grouped by unit and never averaged across
// units. Grouping key: processor + item + process + unit (+ rate basis, so a
// primary-basis rate is never mixed with an alternate-basis one).

const NONE = "__none__";
const fmtRate = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : null);
const pctClass = (v: number | null) =>
  v == null || v === 0 ? "text-slate-500" : v > 0 ? "text-red-600 font-medium" : "text-emerald-600 font-medium";
const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function currentMonth(offset = 0) {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

interface RateCell { qty: number; taxable: number; actualW: number; estW: number; estQty: number }
interface RateGroup {
  key: string;
  party_id: string;
  party_name: string;
  item_id: string | null;
  item_code: string | null;
  description: string | null;
  process: string | null;
  unit: string | null;
  basis: string | null;
  cells: Map<string, RateCell>;
  min: number;
  max: number;
  qty: number;
  lines: number;
}
const cellActual = (c: RateCell) => (c.qty > 0 ? c.actualW / c.qty : 0);
const cellEstimate = (c: RateCell) => (c.estQty > 0 ? c.estW / c.estQty : null);

function PriceMovementTab() {
  const [parties, setParties] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [process, setProcess] = useState("all");
  const [unit, setUnit] = useState("all");
  const [from, setFrom] = useState(currentMonth(-11));
  const [to, setTo] = useState(currentMonth(0));
  const [selKey, setSelKey] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [compareItem, setCompareItem] = useState("");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["processor-invoice-report-rates"],
    queryFn: fetchProcessorRateMonthly,
  });

  const processOf = (v: string | null) => v ?? NONE;
  const inPeriod = (r: ProcessorRateMonthlyRow) => {
    const m = r.invoice_month.slice(0, 7);
    return (!from || m >= from) && (!to || m <= to);
  };
  const matchesProcessUnit = (r: ProcessorRateMonthlyRow) =>
    (process === "all" || processOf(r.nature_of_process) === process) &&
    (unit === "all" || (r.unit ?? NONE) === unit);

  const partyOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data) m.set(r.party_id, r.party_name ?? "—");
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const processOpts = useMemo(
    () => [...new Set(data.map((r) => processOf(r.nature_of_process)))].sort(),
    [data],
  );
  const unitOpts = useMemo(() => [...new Set(data.map((r) => r.unit ?? NONE))].sort(), [data]);

  const months = useMemo(() => monthRange(from, to), [from, to]);

  // Rows passing period / process / unit / processor filters (before item search).
  const scoped = useMemo(
    () => data.filter((r) => inPeriod(r) && matchesProcessUnit(r) && (parties.length === 0 || parties.includes(r.party_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, from, to, process, unit, parties],
  );

  const filtered = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return q
      ? scoped.filter((r) => `${r.item_code ?? ""} ${r.description ?? ""}`.toLowerCase().includes(q))
      : scoped;
  }, [scoped, itemSearch]);

  const groups = useMemo(() => {
    const m = new Map<string, RateGroup>();
    for (const r of filtered) {
      const key = [r.party_id, r.item_id ?? "", r.nature_of_process ?? "", r.unit ?? "", r.rate_basis ?? ""].join("|");
      let g = m.get(key);
      if (!g) {
        g = {
          key, party_id: r.party_id, party_name: r.party_name ?? "—", item_id: r.item_id, item_code: r.item_code,
          description: r.description, process: r.nature_of_process, unit: r.unit, basis: r.rate_basis,
          cells: new Map(), min: Infinity, max: -Infinity, qty: 0, lines: 0,
        };
        m.set(key, g);
      }
      const mk = r.invoice_month.slice(0, 7);
      const c = g.cells.get(mk) ?? { qty: 0, taxable: 0, actualW: 0, estW: 0, estQty: 0 };
      // Weight by qty; fall back to weight 1 when a month has no qty, so it still shows.
      const w = r.qty_billed > 0 ? r.qty_billed : 1;
      c.qty += w;
      c.taxable += r.taxable_amount;
      c.actualW += r.avg_actual_rate * w;
      if (r.avg_estimate_rate != null) { c.estW += r.avg_estimate_rate * w; c.estQty += w; }
      g.cells.set(mk, c);
      g.min = Math.min(g.min, r.min_rate);
      g.max = Math.max(g.max, r.max_rate);
      g.qty += r.qty_billed;
      g.lines += r.invoice_lines;
    }
    return [...m.values()].sort(
      (a, b) =>
        a.party_name.localeCompare(b.party_name) ||
        (a.item_code ?? "").localeCompare(b.item_code ?? "") ||
        (a.process ?? "").localeCompare(b.process ?? "") ||
        (a.unit ?? "").localeCompare(b.unit ?? ""),
    );
  }, [filtered]);

  const movement = (g: RateGroup) => {
    const ms = [...g.cells.keys()].sort();
    if (ms.length < 2) return { first: null as number | null, prev: null as number | null };
    const last = cellActual(g.cells.get(ms[ms.length - 1])!);
    return {
      first: pct(cellActual(g.cells.get(ms[0])!), last),
      prev: pct(cellActual(g.cells.get(ms[ms.length - 2])!), last),
    };
  };

  const selected = groups.find((g) => g.key === selKey) ?? groups[0] ?? null;
  const historyGroup = groups.find((g) => g.key === historyKey) ?? null;

  const chartData = selected
    ? months.map((m) => {
        const c = selected.cells.get(m);
        return { month: monthLabel(m), actual: c ? cellActual(c) : null, estimate: c ? cellEstimate(c) : null };
      })
    : [];

  // Same item across processors: weighted average (taxable / qty) per processor,
  // separated by process, unit and basis.
  const itemOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of scoped) if (r.item_id) m.set(r.item_id, `${r.item_code ?? ""} ${r.description ? "— " + r.description : ""}`.trim());
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [scoped]);

  const comparison = useMemo(() => {
    if (!compareItem) return [];
    const sections = new Map<string, { title: string; rows: Map<string, { name: string; qty: number; taxable: number; min: number; max: number; lines: number }> }>();
    for (const r of scoped) {
      if (r.item_id !== compareItem) continue;
      const sk = [r.nature_of_process ?? "", r.unit ?? "", r.rate_basis ?? ""].join("|");
      const s = sections.get(sk) ?? {
        title: `${r.nature_of_process ?? "No process"} · per ${r.unit ?? "—"}${r.rate_basis ? ` (${r.rate_basis})` : ""}`,
        rows: new Map(),
      };
      const e = s.rows.get(r.party_id) ?? { name: r.party_name ?? "—", qty: 0, taxable: 0, min: Infinity, max: -Infinity, lines: 0 };
      e.qty += r.qty_billed; e.taxable += r.taxable_amount;
      e.min = Math.min(e.min, r.min_rate); e.max = Math.max(e.max, r.max_rate); e.lines += r.invoice_lines;
      s.rows.set(r.party_id, e);
      sections.set(sk, s);
    }
    return [...sections.values()].map((s) => {
      const rows = [...s.rows.values()]
        .map((e) => ({ ...e, avg: e.qty > 0 ? e.taxable / e.qty : null }))
        .sort((a, b) => (a.avg ?? Infinity) - (b.avg ?? Infinity));
      return { title: s.title, rows, best: rows[0]?.avg ?? null };
    });
  }, [scoped, compareItem]);

  const exportXlsx = () => {
    const cols: ExportColumn[] = [
      { key: "party_name", label: "Processor", type: "text", width: 28 },
      { key: "item_code", label: "Item Code", type: "text", width: 18 },
      { key: "description", label: "Description", type: "text", width: 30 },
      { key: "process", label: "Process", type: "text", width: 20 },
      { key: "unit", label: "Unit", type: "text", width: 8 },
      ...months.map((m): ExportColumn => ({ key: `m_${m}`, label: monthLabel(m), type: "number", width: 12 })),
      { key: "first", label: "Latest vs first %", type: "number", width: 16 },
      { key: "prev", label: "Latest vs prev %", type: "number", width: 16 },
      { key: "min", label: "Min rate", type: "number", width: 12 },
      { key: "max", label: "Max rate", type: "number", width: 12 },
      { key: "qty", label: "Qty billed", type: "number", width: 12 },
    ];
    const rows = groups.map((g) => {
      const mv = movement(g);
      const row: Record<string, any> = {
        party_name: g.party_name, item_code: g.item_code ?? "", description: g.description ?? "",
        process: g.process ?? "", unit: g.unit ?? "",
        first: mv.first == null ? "" : round2(mv.first), prev: mv.prev == null ? "" : round2(mv.prev),
        min: g.min, max: g.max, qty: g.qty,
      };
      for (const m of months) {
        const c = g.cells.get(m);
        row[`m_${m}`] = c ? round2(cellActual(c) * 10000) / 10000 : "";
      }
      return row;
    });
    exportToExcel(rows, cols, `Processor-price-movement-${new Date().toISOString().slice(0, 10)}.xlsx`, "Price movement");
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterBox>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="col-span-2 w-full md:w-56 justify-start font-normal">
              {parties.length === 0 ? "All processors" : `${parties.length} processor${parties.length > 1 ? "s" : ""} selected`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 max-h-72 overflow-y-auto p-2" align="start">
            {parties.length > 0 && (
              <button type="button" className="text-xs text-primary mb-1" onClick={() => setParties([])}>Clear</button>
            )}
            {partyOpts.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <Checkbox
                  checked={parties.includes(p.id)}
                  onCheckedChange={(v) => setParties((s) => (v === true ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                {p.name}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Input className="col-span-2 w-full md:w-56 h-10 md:h-9" placeholder="Search item code / description" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
        <Select value={process} onValueChange={setProcess}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All processes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All processes</SelectItem>
            {processOpts.map((p) => <SelectItem key={p} value={p}>{p === NONE ? "(no process)" : p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All units" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All units</SelectItem>
            {unitOpts.map((u) => <SelectItem key={u} value={u}>{u === NONE ? "(no unit)" : u}</SelectItem>)}
          </SelectContent>
        </Select>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase block">Invoice month from</label>
          <Input type="month" className="w-full md:w-40 h-10 md:h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase block">to</label>
          <Input type="month" className="w-full md:w-40 h-10 md:h-9" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        </FilterBox>
        <Button variant="outline" className="w-full md:w-auto" disabled={groups.length === 0} onClick={exportXlsx}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">Could not load report: {(error as Error).message}</p>}
      {(!from || !to || from > to) && <p className="text-sm text-amber-600">Choose a valid month range (from ≤ to).</p>}

      {/* Main table */}
      <div className="paper-card !p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>Processor</th>
              <th className={`${TH} text-left`}>Item</th>
              <th className={`${TH} text-left`}>Process</th>
              <th className={`${TH} text-left`}>Unit</th>
              {months.map((m) => <th key={m} className={`${TH} text-right whitespace-nowrap`}>{monthLabel(m)}</th>)}
              <th className={`${TH} text-right whitespace-nowrap`}>vs first</th>
              <th className={`${TH} text-right whitespace-nowrap`}>vs prev</th>
              <th className={`${TH} text-right`}>Min</th>
              <th className={`${TH} text-right`}>Max</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8 + months.length} className="px-3 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : groups.length === 0 && !error ? (
              <tr><td colSpan={8 + months.length} className="px-3 py-8 text-center text-slate-400">No invoiced rates for these filters</td></tr>
            ) : groups.map((g) => {
              const mv = movement(g);
              return (
                <tr
                  key={g.key}
                  className={`cursor-pointer hover:bg-muted/50 ${selected?.key === g.key ? "bg-blue-50/50" : ""}`}
                  onClick={() => { setSelKey(g.key); setHistoryKey(g.key); }}
                >
                  <td className={`${TD} font-medium`}>{g.party_name}</td>
                  <td className={TD}>
                    <span className="font-mono font-medium">{g.item_code ?? "—"}</span>
                    {g.description && <div className="text-[11px] text-slate-500">{g.description}</div>}
                  </td>
                  <td className={TD}>{g.process ?? "—"}</td>
                  <td className={TD}>{g.unit ?? "—"}{g.basis ? <span className="text-[10px] text-slate-400 ml-1">({g.basis})</span> : null}</td>
                  {months.map((m) => {
                    const c = g.cells.get(m);
                    return (
                      <td key={m} className={`${TD} text-right tabular-nums font-mono`}>{c ? fmtRate(cellActual(c)) : "—"}</td>
                    );
                  })}
                  <td className={`${TD} text-right tabular-nums font-mono ${pctClass(mv.first)}`}>{fmtPct(mv.first)}</td>
                  <td className={`${TD} text-right tabular-nums font-mono ${pctClass(mv.prev)}`}>{fmtPct(mv.prev)}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{fmtRate(g.min)}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{fmtRate(g.max)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Rates are per unit — units are never mixed. Red = rate went up, green = down. "vs first" compares the latest month with data to the first; "vs prev" to the month with data before it. Click a row for invoice-line history.
      </p>

      {/* Chart */}
      {selected && (
        <div className="paper-card space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">
            {selected.party_name} · {selected.item_code ?? "—"}{selected.process ? ` · ${selected.process}` : ""} · per {selected.unit ?? "—"}
          </h3>
          <ChartContainer
            className="h-64 w-full"
            config={{
              actual: { label: "Actual rate", color: "hsl(var(--primary))" },
              estimate: { label: "Estimate rate", color: "#94a3b8" },
            }}
          >
            <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2} connectNulls dot />
              <Line dataKey="estimate" type="monotone" stroke="var(--color-estimate)" strokeWidth={2} strokeDasharray="5 4" connectNulls dot />
            </LineChart>
          </ChartContainer>
        </div>
      )}

      {/* Same item across processors */}
      <div className="paper-card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Same item across processors</h3>
          <Select value={compareItem} onValueChange={setCompareItem}>
            <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choose an item" /></SelectTrigger>
            <SelectContent>
              {itemOpts.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-slate-500">Uses the period, process, unit and processor filters above. Weighted average = taxable ÷ qty billed.</span>
        </div>
        {compareItem && comparison.length === 0 && <p className="text-sm text-slate-400">No invoiced rates for this item in the period.</p>}
        {comparison.map((s) => (
          <div key={s.title}>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{s.title}</p>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${TH} text-left`}>Processor</th>
                  <th className={`${TH} text-right`}>Weighted avg rate</th>
                  <th className={`${TH} text-right`}>vs lowest</th>
                  <th className={`${TH} text-right`}>Min</th>
                  <th className={`${TH} text-right`}>Max</th>
                  <th className={`${TH} text-right`}>Qty billed</th>
                  <th className={`${TH} text-right`}>Lines</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => {
                  const vs = r.avg != null && s.best != null ? pct(s.best, r.avg) : null;
                  return (
                    <tr key={r.name}>
                      <td className={`${TD} font-medium`}>{r.name}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{r.avg != null ? fmtRate(r.avg) : "—"}</td>
                      <td className={`${TD} text-right tabular-nums font-mono ${pctClass(vs)}`}>{vs === 0 ? "lowest" : fmtPct(vs)}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{fmtRate(r.min)}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{fmtRate(r.max)}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{r.qty}</td>
                      <td className={`${TD} text-right tabular-nums font-mono`}>{r.lines}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ))}
      </div>

      <RateHistoryDialog group={historyGroup} from={from} to={to} onClose={() => setHistoryKey(null)} />
    </div>
  );
}

function RateHistoryDialog({
  group, from, to, onClose,
}: { group: RateGroup | null; from: string; to: string; onClose: () => void }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["processor-rate-history", group?.key, from, to],
    queryFn: () =>
      fetchProcessorRateHistory({
        partyId: group!.party_id,
        itemId: group!.item_id,
        natureOfProcess: group!.process,
        unit: group!.unit,
        rateBasis: group!.basis,
        monthFrom: from ? `${from}-01` : undefined,
        monthTo: to ? `${to}-01` : undefined,
      }),
    enabled: !!group,
  });
  const varianceTotal = round2(data.reduce((s, r) => s + r.variance_amount, 0));

  return (
    <Dialog open={!!group} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Invoice-line history</DialogTitle>
          <DialogDescription>
            {group?.party_name} · {group?.item_code ?? "—"}{group?.process ? ` · ${group.process}` : ""} · per {group?.unit ?? "—"}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">Could not load history: {(error as Error).message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Invoice</th>
                <th className={`${TH} text-left`}>Date</th>
                <th className={`${TH} text-left`}>DC</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={`${TH} text-right`}>Actual rate</th>
                <th className={`${TH} text-right`}>Est. rate</th>
                <th className={`${TH} text-right`}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading...</td></tr>
              ) : data.length === 0 && !error ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No invoice lines</td></tr>
              ) : data.map((r) => (
                <tr key={`${r.invoice_id}-${r.dc_line_item_id}`}>
                  <td className={`${TD} font-mono font-medium`}>{r.invoice_number}</td>
                  <td className={TD}>{fmtDate(r.invoice_date)}</td>
                  <td className={`${TD} font-mono`}>{r.dc_number}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{r.qty_billed}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{fmtRate(r.actual_rate)}</td>
                  <td className={`${TD} text-right tabular-nums font-mono`}>{r.estimate_rate != null ? fmtRate(r.estimate_rate) : "—"}</td>
                  <td className={`${TD} text-right tabular-nums font-mono ${varianceClass(r.variance_amount)}`}>{signed(r.variance_amount)}</td>
                </tr>
              ))}
            </tbody>
            {data.length > 0 && (
              <tfoot>
                <tr>
                  <td className={TF} colSpan={6}>{data.length} line{data.length !== 1 ? "s" : ""}</td>
                  <td className={`${TF} text-right tabular-nums font-mono ${varianceClass(varianceTotal)}`}>{signed(varianceTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
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
          <TabsList className="w-full h-auto grid grid-cols-3 md:inline-flex md:w-auto">
            <TabsTrigger value="pending" className="whitespace-normal text-xs md:text-sm px-1 md:px-3">Invoice pending</TabsTrigger>
            <TabsTrigger value="eva" className="whitespace-normal text-xs md:text-sm px-1 md:px-3">Estimate vs actual</TabsTrigger>
            <TabsTrigger value="price" className="whitespace-normal text-xs md:text-sm px-1 md:px-3">Price movement</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-3"><PendingTab /></TabsContent>
          <TabsContent value="eva" className="mt-3"><EstimateVsActualTab /></TabsContent>
          <TabsContent value="price" className="mt-3"><PriceMovementTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
