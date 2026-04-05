import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Printer, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  fetchGRNWithStages,
  saveQuantitativeStage,
  saveQualityStage,
  type GRNLineItem,
  type QuantitativeLineData,
  type QualitativeLineData,
  type InspectionMethod,
  type NonConformanceType,
  type Disposition,
} from "@/lib/grn-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { AuditTimeline } from "@/components/AuditTimeline";
import { logAudit } from "@/lib/audit-api";

// ── Stage Progress Bar ─────────────────────────────────────────────────────────

function StageProgress({ stage }: { stage: string }) {
  const stages = [
    { key: 'receipt', label: 'Goods Receipt', done: ['quality_pending','quality_done','closed'].includes(stage), active: ['draft','quantitative_pending','quantitative_done'].includes(stage) },
    { key: 'quality', label: 'Quality Inspection', done: ['quality_done','closed'].includes(stage), active: stage === 'quality_pending' },
    { key: 'closed',  label: 'Closed', done: stage === 'closed', active: false },
  ];
  return (
    <div className="flex items-center gap-0">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              s.done ? 'bg-blue-600 text-white' : s.active ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' : 'bg-slate-100 text-slate-400 border-2 border-slate-200'
            }`}>
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.active ? <Clock className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
            </div>
            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${s.done ? 'text-blue-700' : s.active ? 'text-blue-600' : 'text-slate-400'}`}>{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <div className={`h-0.5 w-12 mb-3.5 mx-1 ${s.done ? 'bg-blue-400' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Verdict Badge ──────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string | null | undefined }) {
  if (!verdict) return null;
  const map: Record<string, { label: string; cls: string }> = {
    fully_accepted:          { label: '✓ Fully Accepted',    cls: 'bg-green-100 text-green-800 border border-green-300' },
    conditionally_accepted:  { label: '⚠ Conditional Accept', cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
    partially_returned:      { label: '↩ Partially Returned', cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
    returned:                { label: '✗ Returned to Vendor', cls: 'bg-red-100 text-red-800 border border-red-300' },
  };
  const cfg = map[verdict] ?? { label: verdict, cls: 'bg-slate-100 text-slate-700 border border-slate-200' };
  return <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Stage 1 Edit Table ─────────────────────────────────────────────────────────

interface S1LineState {
  id: string;
  description: string;
  drawing_number?: string;
  po_quantity: number;
  received_qty: number;
  condition_on_arrival: string;
  packing_intact: boolean;
  notes: string;
}

function Stage1EditTable({
  items,
  lines,
  onChange,
}: {
  items: GRNLineItem[];
  lines: S1LineState[];
  onChange: (idx: number, field: keyof S1LineState, value: any) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-50/60 text-xs text-slate-600">
            <th className="text-left px-2 py-2 border border-blue-100">#</th>
            <th className="text-left px-2 py-2 border border-blue-100">Description</th>
            <th className="text-left px-2 py-2 border border-blue-100">Drawing</th>
            <th className="text-right px-2 py-2 border border-blue-100">Ordered Qty</th>
            <th className="text-right px-2 py-2 border border-blue-100">Received Qty *</th>
            <th className="text-center px-2 py-2 border border-blue-100">Condition</th>
            <th className="text-center px-2 py-2 border border-blue-100">Packing Intact</th>
            <th className="text-left px-2 py-2 border border-blue-100">Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const qtyMismatch = line.received_qty !== line.po_quantity && line.received_qty > 0;
            return (
              <tr key={line.id} className={qtyMismatch ? 'bg-yellow-50/60' : 'bg-white'}>
                <td className="px-2 py-1.5 border border-slate-100 text-slate-500 text-xs">{idx + 1}</td>
                <td className="px-2 py-1.5 border border-slate-100 font-medium text-sm">{line.description}</td>
                <td className="px-2 py-1.5 border border-slate-100 font-mono text-xs text-slate-500">{line.drawing_number || '—'}</td>
                <td className="px-2 py-1.5 border border-slate-100 text-right font-mono tabular-nums text-slate-500">{line.po_quantity}</td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <input
                    type="number"
                    className="w-20 text-right border rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={line.received_qty || ''}
                    onChange={e => onChange(idx, 'received_qty', Number(e.target.value))}
                    min={0}
                  />
                  {qtyMismatch && <span className="ml-1 text-[10px] text-amber-600">⚠</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <select
                    className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={line.condition_on_arrival}
                    onChange={e => onChange(idx, 'condition_on_arrival', e.target.value)}
                  >
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="short_delivery">Short Delivery</option>
                  </select>
                </td>
                <td className="px-2 py-1.5 border border-slate-100 text-center">
                  <input
                    type="checkbox"
                    checked={line.packing_intact}
                    onChange={e => onChange(idx, 'packing_intact', e.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <input
                    type="text"
                    className="w-full border-0 bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                    value={line.notes}
                    onChange={e => onChange(idx, 'notes', e.target.value)}
                    placeholder="Optional notes..."
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Stage 2 Edit Table ─────────────────────────────────────────────────────────

interface S2LineState {
  id: string;
  description: string;
  drawing_number?: string;
  received_qty: number;
  qty_inspected: number;
  inspection_method: InspectionMethod;
  conforming_qty: number;
  non_conforming_qty: number;
  non_conformance_type: NonConformanceType | '';
  deviation_description: string;
  disposition: Disposition | '';
  reference_drawing: string;
  qc_notes: string;
}

const INSPECTION_METHODS: { value: InspectionMethod; label: string }[] = [
  { value: '100_percent', label: '100% Inspection' },
  { value: 'random_sample', label: 'Random Sample' },
  { value: 'visual_only', label: 'Visual Only' },
  { value: 'certificate_verification', label: 'Certificate Verification' },
];

const NC_TYPES: { value: NonConformanceType; label: string }[] = [
  { value: 'dimensional', label: 'Dimensional' },
  { value: 'surface_finish', label: 'Surface Finish' },
  { value: 'material_grade', label: 'Material Grade' },
  { value: 'functional', label: 'Functional / Performance' },
  { value: 'packaging', label: 'Packaging / Labelling' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'other', label: 'Other' },
];

const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: 'accept_as_is', label: 'Accept As-Is' },
  { value: 'conditional_accept', label: 'Conditional Accept' },
  { value: 'return_to_vendor', label: 'Return to Vendor' },
  { value: 'scrap', label: 'Scrap' },
];

function Stage2EditTable({
  lines,
  onChange,
}: {
  lines: S2LineState[];
  onChange: (idx: number, field: keyof S2LineState, value: any) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-purple-50/60 text-xs text-slate-600">
            <th className="text-left px-2 py-2 border border-purple-100">#</th>
            <th className="text-left px-2 py-2 border border-purple-100">Description</th>
            <th className="text-right px-2 py-2 border border-purple-100">Rcvd Qty</th>
            <th className="text-right px-2 py-2 border border-purple-100">Qty Inspected</th>
            <th className="text-center px-2 py-2 border border-purple-100">Method</th>
            <th className="text-right px-2 py-2 border border-purple-100">Conforming</th>
            <th className="text-right px-2 py-2 border border-purple-100">Non-Conforming</th>
            <th className="text-center px-2 py-2 border border-purple-100">NC Type</th>
            <th className="text-left px-2 py-2 border border-purple-100">Deviation</th>
            <th className="text-center px-2 py-2 border border-purple-100">Disposition</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const hasNC = line.non_conforming_qty > 0;
            return (
              <tr key={line.id} className={hasNC ? 'bg-amber-50/60' : 'bg-white'}>
                <td className="px-2 py-1.5 border border-slate-100 text-slate-500 text-xs">{idx + 1}</td>
                <td className="px-2 py-1.5 border border-slate-100 font-medium text-sm max-w-[160px] truncate">{line.description}</td>
                <td className="px-2 py-1.5 border border-slate-100 text-right font-mono tabular-nums text-slate-500 text-xs">{line.received_qty}</td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <input type="number" className="w-20 text-right border rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-400"
                    value={line.qty_inspected || ''} min={0}
                    onChange={e => onChange(idx, 'qty_inspected', Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <select className="border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                    value={line.inspection_method}
                    onChange={e => onChange(idx, 'inspection_method', e.target.value as InspectionMethod)}>
                    {INSPECTION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <input type="number" className="w-20 text-right border rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-400"
                    value={line.conforming_qty || ''} min={0}
                    onChange={e => {
                      const v = Number(e.target.value);
                      onChange(idx, 'conforming_qty', v);
                      onChange(idx, 'non_conforming_qty', Math.max(0, line.received_qty - v));
                    }} />
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  <input type="number" className={`w-20 text-right border rounded px-1.5 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-purple-400 ${hasNC ? 'border-amber-400 bg-amber-50' : ''}`}
                    value={line.non_conforming_qty || ''} min={0}
                    onChange={e => {
                      const v = Number(e.target.value);
                      onChange(idx, 'non_conforming_qty', v);
                      onChange(idx, 'conforming_qty', Math.max(0, line.received_qty - v));
                    }} />
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  {hasNC ? (
                    <select className="border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 border-amber-300"
                      value={line.non_conformance_type}
                      onChange={e => onChange(idx, 'non_conformance_type', e.target.value)}>
                      <option value="">Select...</option>
                      {NC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  {hasNC ? (
                    <input type="text" className="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      value={line.deviation_description} placeholder="Describe deviation..."
                      onChange={e => onChange(idx, 'deviation_description', e.target.value)} />
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-100">
                  {hasNC ? (
                    <select className="border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 border-amber-300"
                      value={line.disposition}
                      onChange={e => onChange(idx, 'disposition', e.target.value)}>
                      <option value="">Select...</option>
                      {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GRNDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: grn, isLoading } = useQuery({
    queryKey: ['grn-stages', id],
    queryFn: () => fetchGRNWithStages(id!),
    enabled: !!id,
  });

  // Stage 1 state
  const [s1Lines, setS1Lines] = useState<S1LineState[]>([]);
  const [s1VerifiedBy, setS1VerifiedBy] = useState('');
  const [s1Date, setS1Date] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [s1InvoiceNumber, setS1InvoiceNumber] = useState('');
  const [s1InvoiceDate, setS1InvoiceDate] = useState('');
  const [s1Editing, setS1Editing] = useState(false);

  // Stage 2 state
  const [s2Lines, setS2Lines] = useState<S2LineState[]>([]);
  const [s2InspectedBy, setS2InspectedBy] = useState('');
  const [s2Date, setS2Date] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [s2Remarks, setS2Remarks] = useState('');

  // Initialize states from loaded GRN
  const [initialized, setInitialized] = useState(false);
  if (grn && !initialized) {
    const items = grn.line_items ?? [];
    setS1Lines(items.map(item => {
      const a = item as any;
      return {
        id: item.id ?? '',
        description: item.description,
        drawing_number: item.drawing_number ?? '',
        po_quantity: item.po_quantity ?? 0,
        received_qty: a.received_qty ?? a.receiving_now ?? 0,
        condition_on_arrival: a.condition_on_arrival ?? 'good',
        packing_intact: a.packing_intact !== false,
        notes: a.quantitative_notes ?? '',
      };
    }));
    setS2Lines(items.map(item => {
      const a = item as any;
      const recv = a.received_qty ?? a.receiving_now ?? 0;
      return {
        id: item.id ?? '',
        description: item.description,
        drawing_number: item.drawing_number ?? '',
        received_qty: recv,
        qty_inspected: a.qty_inspected ?? recv,
        inspection_method: a.inspection_method ?? '100_percent',
        conforming_qty: a.conforming_qty ?? recv,
        non_conforming_qty: a.non_conforming_qty ?? 0,
        non_conformance_type: a.non_conformance_type ?? '',
        deviation_description: a.deviation_description ?? '',
        disposition: a.disposition ?? '',
        reference_drawing: a.reference_drawing ?? '',
        qc_notes: a.qc_notes ?? '',
      };
    }));
    setS1VerifiedBy((grn as any).quantitative_completed_by ?? '');
    setS2InspectedBy((grn as any).quality_completed_by ?? '');
    setS2Remarks((grn as any).quality_remarks ?? '');
    setS1InvoiceNumber((grn as any).vendor_invoice_number ?? '');
    setS1InvoiceDate((grn as any).vendor_invoice_date ?? '');
    setInitialized(true);
  }

  const s1Mutation = useMutation({
    mutationFn: async () => {
      const lines: QuantitativeLineData[] = s1Lines.map(l => ({
        id: l.id,
        received_qty: l.received_qty,
        qty_matched: l.received_qty === l.po_quantity,
        condition_on_arrival: l.condition_on_arrival,
        packing_intact: l.packing_intact,
        quantitative_notes: l.notes || null,
      }));
      await saveQuantitativeStage(id!, lines, s1VerifiedBy, s1InvoiceNumber || null, s1InvoiceDate || null);
      await logAudit('grn', id!, 'GRN Stage 1 Complete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grn-stages', id] });
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      setS1Editing(false);
      setInitialized(false);
      toast({ title: 'Goods receipt recorded', description: 'Ready for QC inspection.' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const s2Mutation = useMutation({
    mutationFn: async () => {
      const lines: QualitativeLineData[] = s2Lines.map(l => ({
        id: l.id,
        qty_inspected: l.qty_inspected,
        inspection_method: l.inspection_method as InspectionMethod,
        conforming_qty: l.conforming_qty,
        non_conforming_qty: l.non_conforming_qty,
        non_conformance_type: (l.non_conformance_type || null) as NonConformanceType | null,
        deviation_description: l.deviation_description || null,
        disposition: (l.disposition || null) as Disposition | null,
        reference_drawing: l.reference_drawing || null,
        qc_notes: l.qc_notes || null,
      }));
      await saveQualityStage(id!, lines, s2InspectedBy, s2Remarks || null, s2Date);
      await logAudit('grn', id!, 'GRN Stage 2 Complete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grn-stages', id] });
      queryClient.invalidateQueries({ queryKey: ['grns'] });
      setInitialized(false);
      toast({ title: 'Quality inspection complete', description: 'GRN is now closed.' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleS1Save = () => {
    if (s1Lines.some(l => !l.received_qty)) {
      toast({ title: 'All received quantities required', variant: 'destructive' }); return;
    }
    if (!s1VerifiedBy.trim()) {
      toast({ title: 'Verified By is required', variant: 'destructive' }); return;
    }
    s1Mutation.mutate();
  };

  const handleS2Save = () => {
    if (!s2InspectedBy.trim()) {
      toast({ title: 'Inspected By is required', variant: 'destructive' }); return;
    }
    const ncWithoutDisp = s2Lines.find(l => l.non_conforming_qty > 0 && !l.disposition);
    if (ncWithoutDisp) {
      toast({ title: 'Disposition required', description: `Row "${ncWithoutDisp.description}" has non-conforming qty but no disposition.`, variant: 'destructive' }); return;
    }
    s2Mutation.mutate();
  };

  const updateS1Line = (idx: number, field: keyof S1LineState, value: any) => {
    setS1Lines(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
  };
  const updateS2Line = (idx: number, field: keyof S2LineState, value: any) => {
    setS2Lines(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm animate-pulse">Loading GRN…</div>;
  if (!grn) return <div className="p-6 text-muted-foreground">GRN not found.</div>;

  const stage = (grn as any).grn_stage ?? 'draft';
  const verdict = (grn as any).overall_quality_verdict;
  const items = grn.line_items ?? [];
  const ncItems = s2Lines.filter(l => l.non_conforming_qty > 0);
  const qtyMismatches = s1Lines.filter(l => l.received_qty !== l.po_quantity && l.received_qty > 0);

  const s1Done = ['quality_pending','quality_done','closed'].includes(stage);
  const s2Visible = ['quality_pending','quality_done','closed'].includes(stage);
  const s2Done = ['quality_done','closed'].includes(stage);
  const s1Editable = !s1Done || s1Editing;

  return (
    <div className="p-4 md:p-6 pb-10 space-y-6 max-w-5xl mx-auto">

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 11px; }
          @page { size: A4; margin: 12mm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* ── Back button ── */}
      <button onClick={() => navigate('/grn')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 no-print">
        <ChevronLeft className="h-4 w-4" /> Back to GRN Register
      </button>

      {/* ── Header card ── */}
      <div className="paper-card space-y-4 no-print">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">{grn.grn_number}</p>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              {grn.vendor_name || 'Goods Receipt Note'}
            </h1>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
              <span>{new Date(grn.grn_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              {grn.po_number && <span>PO: <button className="text-primary hover:underline" onClick={() => navigate(`/purchase-orders/${grn.po_id}`)}>{grn.po_number}</button></span>}
              {(grn as any).vendor_invoice_number && <span>Invoice: {(grn as any).vendor_invoice_number}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {verdict && <VerdictBadge verdict={verdict} />}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </div>
        </div>

        {/* Stage progress */}
        <div className="border-t border-slate-100 pt-3">
          <StageProgress stage={stage} />
        </div>
      </div>

      {/* ── STAGE 1 ── */}
      <div className="border-l-4 border-blue-500 bg-blue-50/20 rounded-r-xl p-4 md:p-5 space-y-4 no-print">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-blue-900">Stage 1 — Goods Receipt</h2>
            <p className="text-xs text-blue-600 mt-0.5">Inventory Team</p>
          </div>
          <div className="flex items-center gap-2">
            {s1Done && !s1Editing && (
              <Button variant="outline" size="sm" className="text-blue-700 border-blue-300" onClick={() => setS1Editing(true)}>
                Edit Receipt
              </Button>
            )}
            {s1Done && <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>}
          </div>
        </div>

        {qtyMismatches.length > 0 && s1Editable && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {qtyMismatches.length} item{qtyMismatches.length > 1 ? 's' : ''} with quantity discrepancies — please verify
          </div>
        )}

        {s1Editable ? (
          <>
            <Stage1EditTable items={items} lines={s1Lines} onChange={updateS1Line} />

            {/* Vendor invoice + verification */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-blue-100">
              <div>
                <Label className="text-xs font-medium text-slate-600">Vendor Invoice No.</Label>
                <Input value={s1InvoiceNumber} onChange={e => setS1InvoiceNumber(e.target.value)} className="mt-1 text-sm" placeholder="e.g. INV-001" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Invoice Date</Label>
                <Input type="date" value={s1InvoiceDate} onChange={e => setS1InvoiceDate(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Verified By <span className="text-red-400">*</span></Label>
                <Input value={s1VerifiedBy} onChange={e => setS1VerifiedBy(e.target.value)} className="mt-1 text-sm" placeholder="Name" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Verification Date <span className="text-red-400">*</span></Label>
                <Input type="date" value={s1Date} onChange={e => setS1Date(e.target.value)} className="mt-1 text-sm" />
              </div>
            </div>

            <Button onClick={handleS1Save} disabled={s1Mutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700">
              {s1Mutation.isPending ? 'Saving…' : 'Save — Stage 1 Complete'}
            </Button>
          </>
        ) : (
          // Read-only summary
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-blue-50/60 text-xs text-slate-600">
                  <th className="text-left px-2 py-2">#</th>
                  <th className="text-left px-2 py-2">Description</th>
                  <th className="text-right px-2 py-2">Ordered</th>
                  <th className="text-right px-2 py-2">Received</th>
                  <th className="text-center px-2 py-2">Condition</th>
                  <th className="text-center px-2 py-2">Packing</th>
                </tr>
              </thead>
              <tbody>
                {s1Lines.map((l, idx) => (
                  <tr key={l.id} className={l.received_qty !== l.po_quantity ? 'bg-yellow-50/40' : ''}>
                    <td className="px-2 py-1.5 text-slate-400 text-xs">{idx + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{l.description}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-500">{l.po_quantity}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold">{l.received_qty}</td>
                    <td className="px-2 py-1.5 text-center text-xs capitalize">{(l.condition_on_arrival || 'good').replace(/_/g,' ')}</td>
                    <td className="px-2 py-1.5 text-center text-xs">{l.packing_intact ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-4">
              {(grn as any).quantitative_completed_by && <span>Verified by: <strong>{(grn as any).quantitative_completed_by}</strong></span>}
              {(grn as any).quantitative_completed_at && <span>on {new Date((grn as any).quantitative_completed_at).toLocaleDateString('en-IN')}</span>}
              {(grn as any).vendor_invoice_number && <span>Invoice: <strong>{(grn as any).vendor_invoice_number}</strong></span>}
            </div>
          </div>
        )}
      </div>

      {/* ── STAGE 2 ── */}
      {s2Visible && (
        <div className="border-l-4 border-purple-500 bg-purple-50/20 rounded-r-xl p-4 md:p-5 space-y-4 no-print">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-purple-900">Stage 2 — Quality Inspection</h2>
              <p className="text-xs text-purple-600 mt-0.5">QC Team</p>
            </div>
            {s2Done && <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>}
          </div>

          {!s2Done ? (
            <>
              <Stage2EditTable lines={s2Lines} onChange={updateS2Line} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-purple-100">
                <div className="md:col-span-1">
                  <Label className="text-xs font-medium text-slate-600">Inspected By <span className="text-red-400">*</span></Label>
                  <Input value={s2InspectedBy} onChange={e => setS2InspectedBy(e.target.value)} className="mt-1 text-sm" placeholder="QC Inspector name" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Inspection Date <span className="text-red-400">*</span></Label>
                  <Input type="date" value={s2Date} onChange={e => setS2Date(e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Quality Remarks</Label>
                  <Textarea value={s2Remarks} onChange={e => setS2Remarks(e.target.value)} className="mt-1 text-sm" rows={2} placeholder="Overall QC assessment…" />
                </div>
              </div>

              <Button onClick={handleS2Save} disabled={s2Mutation.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
                {s2Mutation.isPending ? 'Saving…' : 'Save — Stage 2 Complete'}
              </Button>
            </>
          ) : (
            // Read-only Stage 2 summary
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-purple-50/60 text-xs text-slate-600">
                    <th className="text-left px-2 py-2">#</th>
                    <th className="text-left px-2 py-2">Description</th>
                    <th className="text-right px-2 py-2">Inspected</th>
                    <th className="text-right px-2 py-2">Conforming</th>
                    <th className="text-right px-2 py-2">Non-Conforming</th>
                    <th className="text-center px-2 py-2">Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {s2Lines.map((l, idx) => (
                    <tr key={l.id} className={l.non_conforming_qty > 0 ? 'bg-amber-50/40' : ''}>
                      <td className="px-2 py-1.5 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-medium">{l.description}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{l.qty_inspected}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-green-700 font-semibold">{l.conforming_qty}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {l.non_conforming_qty > 0 ? <span className="text-amber-700 font-semibold">{l.non_conforming_qty}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs capitalize">
                        {l.disposition ? l.disposition.replace(/_/g,' ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-4">
                {(grn as any).quality_completed_by && <span>Inspected by: <strong>{(grn as any).quality_completed_by}</strong></span>}
                {(grn as any).quality_completed_at && <span>on {new Date((grn as any).quality_completed_at).toLocaleDateString('en-IN')}</span>}
                {(grn as any).quality_remarks && <span>Remarks: {(grn as any).quality_remarks}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Non-Conformance Summary Panel ── */}
      {ncItems.length > 0 && s2Done && (
        <div className="border border-amber-300 bg-amber-50/30 rounded-xl p-4 space-y-3 no-print">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-amber-900">Non-Conformance Report</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-amber-800">
                  <th className="text-left px-2 py-1.5 border-b border-amber-200">Description</th>
                  <th className="text-right px-2 py-1.5 border-b border-amber-200">NC Qty</th>
                  <th className="text-center px-2 py-1.5 border-b border-amber-200">Type</th>
                  <th className="text-left px-2 py-1.5 border-b border-amber-200">Deviation</th>
                  <th className="text-center px-2 py-1.5 border-b border-amber-200">Disposition</th>
                </tr>
              </thead>
              <tbody>
                {ncItems.map((l, idx) => (
                  <tr key={idx} className="border-b border-amber-100">
                    <td className="px-2 py-1.5 font-medium text-slate-800">{l.description}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-amber-700 font-semibold">{l.non_conforming_qty}</td>
                    <td className="px-2 py-1.5 text-center capitalize">{(l.non_conformance_type || '—').replace(/_/g,' ')}</td>
                    <td className="px-2 py-1.5 text-slate-600">{l.deviation_description || '—'}</td>
                    <td className="px-2 py-1.5 text-center capitalize">{(l.disposition || '—').replace(/_/g,' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-700">
            {ncItems.reduce((s, l) => s + l.non_conforming_qty, 0)} units non-conforming across {ncItems.length} item{ncItems.length > 1 ? 's' : ''}.
            {grn.vendor_name && ` This non-conformance has been recorded against ${grn.vendor_name}'s quality scorecard.`}
          </p>
        </div>
      )}

      {/* ── Audit trail ── */}
      <div className="no-print">
        <AuditTimeline documentId={id!} />
      </div>

      {/* ── PRINT VIEW ── */}
      <div className="print-only space-y-6 text-black">
        <DocumentHeader />

        {/* Section A — Receipt Details */}
        <div className="border border-black p-4 space-y-3">
          <h2 className="font-bold text-center uppercase text-sm border-b border-black pb-1">Section A — Receipt Details</h2>
          <div className="grid grid-cols-2 gap-x-6 text-xs space-y-1">
            <div><strong>GRN No.:</strong> {grn.grn_number}</div>
            <div><strong>Date:</strong> {new Date(grn.grn_date).toLocaleDateString('en-IN')}</div>
            <div><strong>Vendor:</strong> {grn.vendor_name || '—'}</div>
            <div><strong>Invoice No.:</strong> {(grn as any).vendor_invoice_number || '—'}</div>
            {grn.po_number && <div><strong>Against PO:</strong> {grn.po_number}</div>}
          </div>
          <table className="w-full border-collapse text-xs mt-2">
            <thead><tr className="bg-slate-100">{['Item','Description','Ordered Qty','Received Qty','Condition','Packing'].map(h=><th key={h} className="border border-slate-300 px-1 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {s1Lines.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="border border-slate-300 px-1 py-1">{idx+1}</td>
                  <td className="border border-slate-300 px-1 py-1">{l.description}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{l.po_quantity}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{l.received_qty}</td>
                  <td className="border border-slate-300 px-1 py-1 capitalize">{(l.condition_on_arrival||'good').replace(/_/g,' ')}</td>
                  <td className="border border-slate-300 px-1 py-1 text-center">{l.packing_intact?'Yes':'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
            {['Received By (Store)','Date','Signature'].map(f=><div key={f}><strong>{f}:</strong> <span className="inline-block border-b border-black w-24 ml-1">&nbsp;</span></div>)}
          </div>
        </div>

        {/* Section B — Quality Inspection */}
        <div className="border border-black p-4 space-y-3">
          <h2 className="font-bold text-center uppercase text-sm border-b border-black pb-1">Section B — Quality Inspection Report</h2>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-slate-100">{['Item','Description','Qty Inspected','Conforming Qty','Non-Conforming Qty','Disposition'].map(h=><th key={h} className="border border-slate-300 px-1 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {s2Lines.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="border border-slate-300 px-1 py-1">{idx+1}</td>
                  <td className="border border-slate-300 px-1 py-1">{l.description}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{l.qty_inspected}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{l.conforming_qty}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{l.non_conforming_qty||'—'}</td>
                  <td className="border border-slate-300 px-1 py-1 capitalize">{(l.disposition||'—').replace(/_/g,' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {verdict && (
            <div className={`text-center font-bold py-2 px-4 rounded border-2 text-sm ${
              verdict==='fully_accepted'?'border-green-600 bg-green-50 text-green-800':
              verdict==='returned'?'border-red-600 bg-red-50 text-red-800':
              'border-amber-600 bg-amber-50 text-amber-800'
            }`}>
              Overall Quality Verdict: {verdict.replace(/_/g,' ').toUpperCase()}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
            {['Inspected By (QC)','Date','Signature'].map(f=><div key={f}><strong>{f}:</strong> <span className="inline-block border-b border-black w-24 ml-1">&nbsp;</span></div>)}
          </div>
        </div>

        {/* Section C — Non-Conformance (only if any) */}
        {ncItems.length > 0 && (
          <div className="border-2 border-amber-500 p-4 space-y-3">
            <h2 className="font-bold text-center uppercase text-sm bg-amber-100 -mx-4 px-4 py-1">NON-CONFORMANCE REPORT</h2>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-amber-50">{['Item','NC Qty','Type','Description','Disposition','Action Required'].map(h=><th key={h} className="border border-amber-300 px-1 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {ncItems.map((l, idx) => (
                  <tr key={idx}>
                    <td className="border border-amber-200 px-1 py-1">{l.description}</td>
                    <td className="border border-amber-200 px-1 py-1 text-right">{l.non_conforming_qty}</td>
                    <td className="border border-amber-200 px-1 py-1 capitalize">{(l.non_conformance_type||'—').replace(/_/g,' ')}</td>
                    <td className="border border-amber-200 px-1 py-1">{l.deviation_description||'—'}</td>
                    <td className="border border-amber-200 px-1 py-1 capitalize">{(l.disposition||'—').replace(/_/g,' ')}</td>
                    <td className="border border-amber-200 px-1 py-1">{l.disposition==='return_to_vendor'?'Return to Vendor':l.disposition==='scrap'?'Scrap':'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ncItems.some(l=>l.disposition==='return_to_vendor') && (
              <p className="font-bold text-red-800 border border-red-500 bg-red-50 px-3 py-2 rounded text-xs">RETURN TO VENDOR — Vendor must collect or arrange replacement</p>
            )}
          </div>
        )}

        {/* Section D — Authorisation */}
        <div className="border border-black p-4">
          <h2 className="font-bold text-center uppercase text-sm border-b border-black pb-1 mb-4">Section D — Authorisation</h2>
          <div className="grid grid-cols-3 gap-6 text-xs">
            {['Received By (Store)','Inspected By (QC)','Approved By (Manager)'].map(role => (
              <div key={role} className="space-y-3">
                <p className="font-semibold text-center text-slate-600">{role}</p>
                {['Name','Sign','Date'].map(field => (
                  <div key={field}><strong>{field}:</strong> <span className="inline-block border-b border-black w-28 ml-1">&nbsp;</span></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
