import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/gst-utils";
import {
  fetchProcessorParties,
  fetchInvoiceableLines,
  remainingQty,
  computeLineVariance,
  saveProcessorInvoice,
  type DcLineEstimateVsActualRow,
  type ProcessorInvoiceLineInput,
} from "@/lib/processor-invoices-api";

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";
const TD = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";
const DEFAULT_GST = "18";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

interface Pick {
  qty: string;
  rate: string;
  gst: string;
  /** Only set when the user edits taxable to match a printed, rounded figure. */
  taxableOverride: string | null;
}

const varianceClass = (v: number) =>
  v > 0 ? "text-red-600 font-medium" : v < 0 ? "text-emerald-600 font-medium" : "text-slate-500";
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatCurrency(v)}`;

export default function ProcessorInvoiceForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [partyId, setPartyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("");
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: parties = [], error: partiesError } = useQuery({
    queryKey: ["processor-parties"],
    queryFn: fetchProcessorParties,
  });

  const { data: lines = [], isLoading: linesLoading, error: linesError } = useQuery({
    queryKey: ["processor-invoice-lines", partyId],
    queryFn: () => fetchInvoiceableLines(partyId),
    enabled: !!partyId,
  });

  const groups = useMemo(() => {
    const m = new Map<string, DcLineEstimateVsActualRow[]>();
    for (const l of lines) {
      if (!m.has(l.dc_id)) m.set(l.dc_id, []);
      m.get(l.dc_id)!.push(l);
    }
    return [...m.values()];
  }, [lines]);

  const changeParty = (id: string) => {
    setPartyId(id);
    setPicks({});
    setSaveError(null);
  };

  const toggle = (l: DcLineEstimateVsActualRow, on: boolean) =>
    setPicks((p) => {
      const next = { ...p };
      if (!on) delete next[l.dc_line_item_id];
      else next[l.dc_line_item_id] = {
        qty: String(remainingQty(l)),
        rate: String(l.estimate_rate),
        gst: DEFAULT_GST,
        taxableOverride: null,
      };
      return next;
    });

  const patch = (id: string, change: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [id]: { ...p[id], ...change } }));

  // Per-line derived numbers + validation, computed from the current picks.
  const rows = lines
    .filter((l) => picks[l.dc_line_item_id])
    .map((l) => {
      const pk = picks[l.dc_line_item_id];
      const qty = num(pk.qty);
      const rate = num(pk.rate);
      const gst = num(pk.gst);
      const calc = round2(qty * rate);
      const taxable = pk.taxableOverride != null ? num(pk.taxableOverride) : calc;
      const errors: string[] = [];
      if (!(qty > 0)) errors.push("Qty must be > 0");
      if (!(rate >= 0)) errors.push("Rate required");
      if (!(gst >= 0 && gst <= 100)) errors.push("GST % must be 0–100");
      if (Number.isNaN(taxable)) errors.push("Taxable required");
      else if (qty > 0 && rate >= 0 && Math.abs(taxable - qty * rate) > 1) errors.push("Taxable must be within ₹1 of qty × rate");
      const overBilled = qty > remainingQty(l);
      const gstAmt = round2((taxable * gst) / 100);
      const variance = qty > 0 && rate >= 0 ? computeLineVariance(l.estimate_rate, qty, rate) : 0;
      return { l, pk, qty, rate, gst, taxable, gstAmt, variance, errors, overBilled };
    });

  const totals = rows.reduce(
    (t, r) => ({
      taxable: t.taxable + (Number.isNaN(r.taxable) ? 0 : r.taxable),
      gst: t.gst + (Number.isNaN(r.gstAmt) ? 0 : r.gstAmt),
      variance: t.variance + r.variance,
    }),
    { taxable: 0, gst: 0, variance: 0 },
  );

  const headerOk = !!partyId && invoiceNumber.trim() !== "" && invoiceDate !== "";
  const linesOk = rows.length > 0 && rows.every((r) => r.errors.length === 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: ProcessorInvoiceLineInput[] = rows.map((r) => ({
        dc_line_item_id: r.l.dc_line_item_id,
        qty_billed: r.qty,
        actual_rate: r.rate,
        taxable_amount: r.taxable,
        gst_rate: r.gst,
      }));
      return saveProcessorInvoice({
        partyId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        remarks: remarks.trim() || null,
        lines: payload,
      });
    },
    onSuccess: () => {
      toast({ title: "Processor invoice saved" });
      queryClient.invalidateQueries({ queryKey: ["processor-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["processor-invoice-lines"] });
      queryClient.invalidateQueries({ queryKey: ["dc-invoice-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["job-card-processing-cost"] });
      navigate("/processor-invoices");
    },
    // RPC check_violation messages are readable — surface verbatim.
    onError: (e: Error) => {
      setSaveError(e.message);
      toast({ title: "Could not save invoice", description: e.message, variant: "destructive" });
    },
  });

  const save = () => {
    if (saveMutation.isPending) return;
    setSaveError(null);
    saveMutation.mutate();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/processor-invoices")}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">New Processor Invoice</h1>
      </div>

      {/* Header */}
      <div className="paper-card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-500 uppercase">Processor *</label>
          <Select value={partyId} onValueChange={changeParty}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select processor" /></SelectTrigger>
            <SelectContent>
              {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {partiesError && <p className="text-xs text-red-600 mt-1">Could not load processors: {(partiesError as Error).message}</p>}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">Invoice No. *</label>
          <Input className="mt-1" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase">Invoice Date *</label>
          <Input className="mt-1" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <label className="text-xs font-semibold text-slate-500 uppercase">Remarks</label>
          <Textarea className="mt-1" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>

      {/* Lines */}
      {partyId && (
        <div className="paper-card !p-0">
          <div className="px-3 py-2 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">DC lines awaiting invoice</h2>
            <p className="text-xs text-slate-500">Tick lines from one or more DCs. Defaults: qty = unbilled qty, rate = DC estimate rate, GST 18%.</p>
          </div>
          {linesError && <p className="p-3 text-sm text-red-600">Could not load DC lines: {(linesError as Error).message}</p>}
          {linesLoading ? (
            <p className="p-6 text-center text-sm text-slate-400">Loading...</p>
          ) : groups.length === 0 && !linesError ? (
            <p className="p-6 text-center text-sm text-slate-400">No DC lines pending invoice for this processor</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${TH} w-10`} />
                    <th className={`${TH} text-left`}>Description</th>
                    <th className={`${TH} text-right`}>DC Qty</th>
                    <th className={`${TH} text-right`}>Billed</th>
                    <th className={`${TH} text-right`}>Est. Rate</th>
                    <th className={`${TH} text-right`}>Qty Billed</th>
                    <th className={`${TH} text-right`}>Actual Rate</th>
                    <th className={`${TH} text-right`}>GST %</th>
                    <th className={`${TH} text-right`}>Taxable</th>
                    <th className={`${TH} text-right`}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupRows key={g[0].dc_id} group={g} picks={picks} rows={rows} onToggle={toggle} onPatch={patch} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Totals + save */}
      {rows.length > 0 && (
        <div className="paper-card space-y-2">
          <div className="grid gap-2 md:grid-cols-4 text-sm">
            <div><span className="text-slate-500">Lines</span><div className="font-mono font-semibold">{rows.length}</div></div>
            <div><span className="text-slate-500">Taxable</span><div className="font-mono font-semibold">{formatCurrency(totals.taxable)}</div></div>
            <div><span className="text-slate-500">GST</span><div className="font-mono font-semibold">{formatCurrency(totals.gst)}</div></div>
            <div>
              <span className="text-slate-500">Variance vs estimate</span>
              <div className={`font-mono ${varianceClass(round2(totals.variance))}`}>{signed(round2(totals.variance))}</div>
            </div>
          </div>
          <div className="text-sm text-slate-700">Invoice total: <span className="font-mono font-semibold">{formatCurrency(totals.taxable + totals.gst)}</span></div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" disabled={saveMutation.isPending} onClick={() => navigate("/processor-invoices")}>Cancel</Button>
        <Button disabled={!headerOk || !linesOk || saveMutation.isPending} onClick={save}>
          {saveMutation.isPending ? "Saving…" : "Save Invoice"}
        </Button>
      </div>
    </div>
  );
}

function GroupRows({
  group, picks, rows, onToggle, onPatch,
}: {
  group: DcLineEstimateVsActualRow[];
  picks: Record<string, Pick>;
  rows: { l: DcLineEstimateVsActualRow; taxable: number; variance: number; errors: string[]; overBilled: boolean }[];
  onToggle: (l: DcLineEstimateVsActualRow, on: boolean) => void;
  onPatch: (id: string, change: Partial<Pick>) => void;
}) {
  const head = group[0];
  return (
    <>
      <tr>
        <td colSpan={10} className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600">
          <span className="font-mono">{head.dc_number}</span>
          <span className="text-slate-400 font-normal ml-2">
            {new Date(head.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </td>
      </tr>
      {group.map((l) => {
        const id = l.dc_line_item_id;
        const pk = picks[id];
        const r = rows.find((x) => x.l.dc_line_item_id === id);
        return (
          <tr key={id} className={pk ? "bg-blue-50/40" : ""}>
            <td className={`${TD} text-center`}>
              <Checkbox checked={!!pk} onCheckedChange={(v) => onToggle(l, v === true)} />
            </td>
            <td className={TD}>
              <div className="font-medium">{l.description || l.item_code || "—"}</div>
              {r && r.errors.length > 0 && <div className="text-[11px] text-red-600">{r.errors.join(" · ")}</div>}
              {r?.overBilled && <div className="text-[11px] text-amber-600">Exceeds unbilled qty ({remainingQty(l)})</div>}
            </td>
            <td className={`${TD} text-right tabular-nums font-mono`}>{l.dc_qty} {l.unit ?? ""}</td>
            <td className={`${TD} text-right tabular-nums font-mono`}>{l.billed_qty}</td>
            <td className={`${TD} text-right tabular-nums font-mono`}>{formatCurrency(l.estimate_rate)}</td>
            {pk ? (
              <>
                <td className={`${TD} text-right`}>
                  <Input className="h-8 w-24 text-right ml-auto" inputMode="decimal" value={pk.qty}
                    onChange={(e) => onPatch(id, { qty: e.target.value, taxableOverride: null })} />
                </td>
                <td className={`${TD} text-right`}>
                  <Input className="h-8 w-24 text-right ml-auto" inputMode="decimal" value={pk.rate}
                    onChange={(e) => onPatch(id, { rate: e.target.value, taxableOverride: null })} />
                </td>
                <td className={`${TD} text-right`}>
                  <Input className="h-8 w-16 text-right ml-auto" inputMode="decimal" value={pk.gst}
                    onChange={(e) => onPatch(id, { gst: e.target.value })} />
                </td>
                <td className={`${TD} text-right`}>
                  <Input className="h-8 w-28 text-right ml-auto" inputMode="decimal"
                    value={pk.taxableOverride ?? (r && !Number.isNaN(r.taxable) ? String(r.taxable) : "")}
                    onChange={(e) => onPatch(id, { taxableOverride: e.target.value })} />
                </td>
                <td className={`${TD} text-right tabular-nums font-mono ${r ? varianceClass(r.variance) : ""}`}>
                  {r ? signed(r.variance) : "—"}
                </td>
              </>
            ) : (
              <td colSpan={5} className={`${TD} text-slate-300`} />
            )}
          </tr>
        );
      })}
    </>
  );
}
