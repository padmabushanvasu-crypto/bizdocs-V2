import { useState, useEffect } from "react";
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
  type QuantitativeLineData,
  type QualitativeLineData,
  type InspectionMethod,
  type NonConformanceType,
  type Disposition,
} from "@/lib/grn-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { AuditTimeline } from "@/components/AuditTimeline";
import { logAudit } from "@/lib/audit-api";

// ── Lookup tables ──────────────────────────────────────────────────────────────

const INSPECTION_METHODS: { value: InspectionMethod; label: string }[] = [
  { value: "100_percent",              label: "100% Inspection" },
  { value: "random_sample",            label: "Random Sample" },
  { value: "visual_only",              label: "Visual Only" },
  { value: "certificate_verification", label: "Certificate Verification" },
];

const NC_TYPES: { value: NonConformanceType; label: string }[] = [
  { value: "dimensional",    label: "Dimensional" },
  { value: "surface_finish", label: "Surface Finish" },
  { value: "material_grade", label: "Material Grade" },
  { value: "functional",     label: "Functional / Performance" },
  { value: "packaging",      label: "Packaging / Labelling" },
  { value: "documentation",  label: "Documentation" },
  { value: "other",          label: "Other" },
];

const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: "accept_as_is",       label: "Accept As-Is" },
  { value: "conditional_accept", label: "Conditional Accept" },
  { value: "return_to_vendor",   label: "Return to Vendor" },
  { value: "scrap",              label: "Scrap" },
];

// ── Line-item state shapes ─────────────────────────────────────────────────────

interface S1Line {
  id: string;
  item_code: string;       // drawing_number used as identifier
  description: string;
  po_quantity: number;
  received_qty: number;
  qty_matched: boolean;
  condition_on_arrival: string;
  packing_intact: boolean;
  notes: string;
}

interface S2Line {
  id: string;
  item_code: string;
  description: string;
  received_qty: number;
  qty_inspected: number;
  inspection_method: InspectionMethod;
  conforming_qty: number;
  non_conforming_qty: number;
  non_conformance_type: NonConformanceType | "";
  deviation_description: string;
  disposition: Disposition | "";
  reference_drawing: string;
  qc_notes: string;
}

// ── Stage Progress Bar ─────────────────────────────────────────────────────────

function StageProgress({ stage }: { stage: string }) {
  const steps = [
    {
      key: "receipt",
      label: "Goods Receipt",
      done: ["quality_pending", "quality_done", "closed"].includes(stage),
      active: ["draft", "quantitative_pending", "quantitative_done"].includes(stage),
    },
    {
      key: "quality",
      label: "Quality Inspection",
      done: ["quality_done", "closed"].includes(stage),
      active: stage === "quality_pending",
    },
    {
      key: "closed",
      label: "Closed",
      done: stage === "closed",
      active: false,
    },
  ];

  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                s.done
                  ? "bg-blue-600 text-white"
                  : s.active
                  ? "bg-blue-100 text-blue-700 border-2 border-blue-500"
                  : "bg-slate-100 text-slate-400 border-2 border-slate-200"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : s.active ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span
              className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                s.done ? "text-blue-700" : s.active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 w-12 mb-3.5 mx-1 ${
                s.done ? "bg-blue-400" : "bg-slate-200"
              }`}
            />
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
    fully_accepted:         { label: "✓ Fully Accepted",     cls: "bg-green-100 text-green-800 border border-green-300" },
    conditionally_accepted: { label: "⚠ Conditional Accept", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
    partially_returned:     { label: "↩ Partially Returned", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
    returned:               { label: "✗ Returned to Vendor", cls: "bg-red-100 text-red-800 border border-red-300" },
  };
  const cfg = map[verdict] ?? { label: verdict, cls: "bg-slate-100 text-slate-700 border border-slate-200" };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Stage 1 — editable table ───────────────────────────────────────────────────

function Stage1Table({
  lines,
  onChange,
}: {
  lines: S1Line[];
  onChange: (idx: number, field: keyof S1Line, value: unknown) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-blue-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-50 text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-2.5 font-semibold w-8">#</th>
            <th className="text-left px-3 py-2.5 font-semibold">Item Code</th>
            <th className="text-left px-3 py-2.5 font-semibold">Description</th>
            <th className="text-right px-3 py-2.5 font-semibold w-24">Ordered</th>
            <th className="text-right px-3 py-2.5 font-semibold w-28">Received Qty *</th>
            <th className="text-center px-3 py-2.5 font-semibold w-24">Qty Matched</th>
            <th className="text-center px-3 py-2.5 font-semibold w-36">Condition</th>
            <th className="text-center px-3 py-2.5 font-semibold w-24">Packing OK</th>
            <th className="text-left px-3 py-2.5 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50">
          {lines.map((line, idx) => {
            const mismatch = line.received_qty > 0 && line.received_qty !== line.po_quantity;
            return (
              <tr
                key={line.id}
                className={`transition-colors ${mismatch ? "bg-yellow-50/70" : "bg-white hover:bg-blue-50/20"}`}
              >
                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {line.item_code || "—"}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px]">
                  <span className="block truncate" title={line.description}>{line.description}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                  {line.po_quantity}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      value={line.received_qty || ""}
                      min={0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        onChange(idx, "received_qty", v);
                        onChange(idx, "qty_matched", v === line.po_quantity);
                      }}
                    />
                    {mismatch && <span className="text-amber-500 text-xs">⚠</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={line.qty_matched}
                    onChange={(e) => onChange(idx, "qty_matched", e.target.checked)}
                    className="h-4 w-4 accent-blue-600 cursor-pointer"
                    title="Qty matched — auto-set, can be overridden"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={line.condition_on_arrival}
                    onChange={(e) => onChange(idx, "condition_on_arrival", e.target.value)}
                  >
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="short_delivery">Short Delivery</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => onChange(idx, "packing_intact", !line.packing_intact)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                      line.packing_intact
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {line.packing_intact ? "Yes" : "No"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    className="w-full bg-transparent border-b border-slate-200 text-xs focus:outline-none focus:border-blue-400 py-0.5 px-0"
                    value={line.notes}
                    onChange={(e) => onChange(idx, "notes", e.target.value)}
                    placeholder="Optional…"
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

// ── Stage 1 — read-only table ──────────────────────────────────────────────────

function Stage1ReadOnly({ lines }: { lines: S1Line[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-blue-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-blue-50 text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-2.5 font-semibold w-8">#</th>
            <th className="text-left px-3 py-2.5 font-semibold">Item Code</th>
            <th className="text-left px-3 py-2.5 font-semibold">Description</th>
            <th className="text-right px-3 py-2.5 font-semibold">Ordered</th>
            <th className="text-right px-3 py-2.5 font-semibold">Received</th>
            <th className="text-center px-3 py-2.5 font-semibold">Matched</th>
            <th className="text-center px-3 py-2.5 font-semibold">Condition</th>
            <th className="text-center px-3 py-2.5 font-semibold">Packing</th>
            <th className="text-left px-3 py-2.5 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50">
          {lines.map((l, idx) => (
            <tr
              key={l.id}
              className={l.received_qty !== l.po_quantity ? "bg-yellow-50/40" : "bg-white"}
            >
              <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.item_code || "—"}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{l.description}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{l.po_quantity}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">
                {l.received_qty}
              </td>
              <td className="px-3 py-2 text-center text-xs">
                {l.qty_matched ? (
                  <span className="text-green-600 font-semibold">✓</span>
                ) : (
                  <span className="text-amber-600 font-semibold">⚠</span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-xs capitalize">
                {(l.condition_on_arrival || "good").replace(/_/g, " ")}
              </td>
              <td className="px-3 py-2 text-center text-xs">
                {l.packing_intact ? "✓" : "✗"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{l.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Stage 2 — editable table ───────────────────────────────────────────────────

function Stage2Table({
  lines,
  onChange,
}: {
  lines: S2Line[];
  onChange: (idx: number, field: keyof S2Line, value: unknown) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-purple-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-purple-50 text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-2.5 font-semibold w-8">#</th>
            <th className="text-left px-3 py-2.5 font-semibold">Item Code</th>
            <th className="text-left px-3 py-2.5 font-semibold">Description</th>
            <th className="text-right px-3 py-2.5 font-semibold w-20">Rcvd</th>
            <th className="text-right px-3 py-2.5 font-semibold w-24">Inspected</th>
            <th className="text-center px-3 py-2.5 font-semibold w-36">Method</th>
            <th className="text-right px-3 py-2.5 font-semibold w-24">Conforming</th>
            <th className="text-right px-3 py-2.5 font-semibold w-28">Non-Conf.</th>
            <th className="text-center px-3 py-2.5 font-semibold w-32">NC Type</th>
            <th className="text-left px-3 py-2.5 font-semibold">Deviation</th>
            <th className="text-center px-3 py-2.5 font-semibold w-32">Disposition</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-purple-50">
          {lines.map((line, idx) => {
            const hasNC = line.non_conforming_qty > 0;
            return (
              <tr
                key={line.id}
                className={`transition-colors ${
                  hasNC ? "bg-amber-50/60" : "bg-white hover:bg-purple-50/20"
                }`}
              >
                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{line.item_code || "—"}</td>
                <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px]">
                  <span className="block truncate" title={line.description}>{line.description}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500 text-xs">
                  {line.received_qty}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
                    value={line.qty_inspected || ""}
                    min={0}
                    onChange={(e) => onChange(idx, "qty_inspected", Number(e.target.value))}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                    value={line.inspection_method}
                    onChange={(e) => onChange(idx, "inspection_method", e.target.value as InspectionMethod)}
                  >
                    {INSPECTION_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
                    value={line.conforming_qty || ""}
                    min={0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onChange(idx, "conforming_qty", v);
                      onChange(idx, "non_conforming_qty", Math.max(0, line.received_qty - v));
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className={`w-20 text-right border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 ${
                      hasNC
                        ? "border-amber-300 bg-amber-50 focus:ring-amber-400"
                        : "border-slate-200 focus:ring-purple-400"
                    }`}
                    value={line.non_conforming_qty || ""}
                    min={0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onChange(idx, "non_conforming_qty", v);
                      onChange(idx, "conforming_qty", Math.max(0, line.received_qty - v));
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  {hasNC ? (
                    <select
                      className="w-full border border-amber-300 rounded px-1.5 py-1 text-xs bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={line.non_conformance_type}
                      onChange={(e) => onChange(idx, "non_conformance_type", e.target.value)}
                    >
                      <option value="">Select type…</option>
                      {NC_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-300 text-xs px-1">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasNC ? (
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={line.deviation_description}
                      placeholder="Describe deviation…"
                      onChange={(e) => onChange(idx, "deviation_description", e.target.value)}
                    />
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasNC ? (
                    <select
                      className="w-full border border-amber-300 rounded px-1.5 py-1 text-xs bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={line.disposition}
                      onChange={(e) => onChange(idx, "disposition", e.target.value)}
                    >
                      <option value="">Select…</option>
                      {DISPOSITIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-300 text-xs px-1">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Stage 2 — read-only table ──────────────────────────────────────────────────

function Stage2ReadOnly({ lines }: { lines: S2Line[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-purple-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-purple-50 text-xs text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-2.5 font-semibold w-8">#</th>
            <th className="text-left px-3 py-2.5 font-semibold">Item Code</th>
            <th className="text-left px-3 py-2.5 font-semibold">Description</th>
            <th className="text-right px-3 py-2.5 font-semibold">Rcvd</th>
            <th className="text-right px-3 py-2.5 font-semibold">Inspected</th>
            <th className="text-right px-3 py-2.5 font-semibold">Conforming</th>
            <th className="text-right px-3 py-2.5 font-semibold">Non-Conf.</th>
            <th className="text-center px-3 py-2.5 font-semibold">NC Type</th>
            <th className="text-center px-3 py-2.5 font-semibold">Disposition</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-purple-50">
          {lines.map((l, idx) => (
            <tr
              key={l.id}
              className={l.non_conforming_qty > 0 ? "bg-amber-50/50" : "bg-white"}
            >
              <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.item_code || "—"}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{l.description}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{l.received_qty}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{l.qty_inspected}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-green-700 font-semibold">
                {l.conforming_qty}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {l.non_conforming_qty > 0 ? (
                  <span className="text-amber-700 font-semibold">{l.non_conforming_qty}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-center text-xs capitalize">
                {l.non_conformance_type ? l.non_conformance_type.replace(/_/g, " ") : "—"}
              </td>
              <td className="px-3 py-2 text-center text-xs capitalize">
                {l.disposition ? l.disposition.replace(/_/g, " ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GRNDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Data fetch ────────────────────────────────────────────────────────────

  const { data: grn, isLoading } = useQuery({
    queryKey: ["grn-stages", id],
    queryFn: () => fetchGRNWithStages(id!),
    enabled: !!id,
  });

  // ── Stage 1 state ─────────────────────────────────────────────────────────

  const [s1Lines,         setS1Lines]         = useState<S1Line[]>([]);
  const [s1VerifiedBy,    setS1VerifiedBy]    = useState("");
  const [s1Date,          setS1Date]          = useState(format(new Date(), "yyyy-MM-dd"));
  const [s1InvoiceNumber, setS1InvoiceNumber] = useState("");
  const [s1InvoiceDate,   setS1InvoiceDate]   = useState("");
  const [s1Notes,         setS1Notes]         = useState("");
  const [s1Editing,       setS1Editing]       = useState(false);

  // ── Stage 2 state ─────────────────────────────────────────────────────────

  const [s2Lines,       setS2Lines]       = useState<S2Line[]>([]);
  const [s2InspectedBy, setS2InspectedBy] = useState("");
  const [s2Date,        setS2Date]        = useState(format(new Date(), "yyyy-MM-dd"));
  const [s2Remarks,     setS2Remarks]     = useState("");

  // ── Initialise from loaded GRN (via useEffect, not during render) ─────────

  useEffect(() => {
    if (!grn) return;
    const g = grn as any;
    const items = grn.line_items ?? [];

    setS1Lines(
      items.map((item) => {
        const a = item as any;
        const recv = a.received_qty ?? a.receiving_now ?? 0;
        return {
          id:                  item.id ?? "",
          item_code:           a.drawing_number ?? "",
          description:         item.description,
          po_quantity:         item.po_quantity ?? 0,
          received_qty:        recv,
          qty_matched:         a.qty_matched !== false && recv === (item.po_quantity ?? 0),
          condition_on_arrival: a.condition_on_arrival ?? "good",
          packing_intact:      a.packing_intact !== false,
          notes:               a.quantitative_notes ?? "",
        };
      })
    );

    setS2Lines(
      items.map((item) => {
        const a = item as any;
        const recv = a.received_qty ?? a.receiving_now ?? 0;
        return {
          id:                   item.id ?? "",
          item_code:            a.drawing_number ?? "",
          description:          item.description,
          received_qty:         recv,
          qty_inspected:        a.qty_inspected ?? recv,
          inspection_method:    (a.inspection_method as InspectionMethod) ?? "100_percent",
          conforming_qty:       a.conforming_qty ?? recv,
          non_conforming_qty:   a.non_conforming_qty ?? 0,
          non_conformance_type: (a.non_conformance_type as NonConformanceType) ?? "",
          deviation_description: a.deviation_description ?? "",
          disposition:          (a.disposition as Disposition) ?? "",
          reference_drawing:    a.reference_drawing ?? "",
          qc_notes:             a.qc_notes ?? "",
        };
      })
    );

    setS1VerifiedBy(g.quantitative_completed_by ?? "");
    setS1InvoiceNumber(g.vendor_invoice_number ?? "");
    setS1InvoiceDate(g.vendor_invoice_date ?? "");
    setS2InspectedBy(g.quality_completed_by ?? "");
    setS2Remarks(g.quality_remarks ?? "");
  }, [grn]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const s1Mutation = useMutation({
    mutationFn: async () => {
      const lines: QuantitativeLineData[] = s1Lines.map((l) => ({
        id:                   l.id,
        received_qty:         l.received_qty,
        qty_matched:          l.qty_matched,
        condition_on_arrival: l.condition_on_arrival,
        packing_intact:       l.packing_intact,
        quantitative_notes:   l.notes || null,
      }));
      await saveQuantitativeStage(id!, lines, s1VerifiedBy, s1InvoiceNumber || null, s1InvoiceDate || null);
      await logAudit("grn", id!, "GRN Stage 1 Complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn-stages", id] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["pending-qc-grns"] });
      setS1Editing(false);
      toast({ title: "Goods receipt recorded", description: "Ready for QC inspection." });
    },
    onError: (err: any) =>
      toast({ title: "Error saving Stage 1", description: err.message, variant: "destructive" }),
  });

  const s2Mutation = useMutation({
    mutationFn: async () => {
      const lines: QualitativeLineData[] = s2Lines.map((l) => ({
        id:                   l.id,
        qty_inspected:        l.qty_inspected,
        inspection_method:    l.inspection_method,
        conforming_qty:       l.conforming_qty,
        non_conforming_qty:   l.non_conforming_qty,
        non_conformance_type: (l.non_conformance_type || null) as NonConformanceType | null,
        deviation_description: l.deviation_description || null,
        disposition:          (l.disposition || null) as Disposition | null,
        reference_drawing:    l.reference_drawing || null,
        qc_notes:             l.qc_notes || null,
      }));
      await saveQualityStage(id!, lines, s2InspectedBy, s2Remarks || null, s2Date);
      await logAudit("grn", id!, "GRN Stage 2 Complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn-stages", id] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["pending-qc-grns"] });
      toast({ title: "Quality inspection complete", description: "GRN is now closed." });
    },
    onError: (err: any) =>
      toast({ title: "Error saving Stage 2", description: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleS1Save = () => {
    if (s1Lines.some((l) => !l.received_qty && l.received_qty !== 0)) {
      toast({ title: "Received quantities required", description: "Fill in all received qty fields.", variant: "destructive" });
      return;
    }
    if (!s1VerifiedBy.trim()) {
      toast({ title: "Verified By is required", variant: "destructive" });
      return;
    }
    if (!s1Date.trim()) {
      toast({ title: "Verification Date is required", variant: "destructive" });
      return;
    }
    s1Mutation.mutate();
  };

  const handleS2Save = () => {
    if (!s2InspectedBy.trim()) {
      toast({ title: "Inspected By is required", variant: "destructive" });
      return;
    }
    if (!s2Date.trim()) {
      toast({ title: "Inspection Date is required", variant: "destructive" });
      return;
    }
    const ncWithoutDisp = s2Lines.find((l) => l.non_conforming_qty > 0 && !l.disposition);
    if (ncWithoutDisp) {
      toast({
        title: "Disposition required",
        description: `"${ncWithoutDisp.description}" has non-conforming qty but no disposition.`,
        variant: "destructive",
      });
      return;
    }
    s2Mutation.mutate();
  };

  const updateS1Line = (idx: number, field: keyof S1Line, value: unknown) => {
    setS1Lines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const updateS2Line = (idx: number, field: keyof S2Line, value: unknown) => {
    setS2Lines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-muted-foreground text-sm animate-pulse">Loading GRN…</div>;
  }
  if (!grn) {
    return <div className="p-6 text-muted-foreground">GRN not found.</div>;
  }

  const g          = grn as any;
  const stage      = g.grn_stage ?? "draft";
  const verdict    = g.overall_quality_verdict as string | undefined;
  const s1Done     = ["quality_pending", "quality_done", "closed"].includes(stage);
  const s2Visible  = ["quality_pending", "quality_done", "closed"].includes(stage);
  const s2Done     = ["quality_done", "closed"].includes(stage);
  const s1Editable = !s1Done || s1Editing;

  const qtyMismatches  = s1Lines.filter((l) => l.received_qty > 0 && l.received_qty !== l.po_quantity);
  const ncItems        = s2Lines.filter((l) => l.non_conforming_qty > 0);
  const totalConforming    = s2Lines.reduce((s, l) => s + l.conforming_qty, 0);
  const totalNonConforming = s2Lines.reduce((s, l) => s + l.non_conforming_qty, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-16 space-y-6 max-w-5xl mx-auto">

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print  { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 11px; color: #000; }
          @page { size: A4 portrait; margin: 12mm; }
        }
        .print-only { display: none; }
      `}</style>

      {/* ── Back ── */}
      <button
        onClick={() => navigate("/grn")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 no-print"
      >
        <ChevronLeft className="h-4 w-4" /> Back to GRN Register
      </button>

      {/* ── Header ── */}
      <div className="paper-card space-y-4 no-print">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">{grn.grn_number}</p>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">
              {grn.vendor_name || "Goods Receipt Note"}
            </h1>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
              <span>
                {new Date(grn.grn_date).toLocaleDateString("en-IN", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </span>
              {grn.po_number && (
                <span>
                  PO:{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => navigate(`/purchase-orders/${grn.po_id}`)}
                  >
                    {grn.po_number}
                  </button>
                </span>
              )}
              {g.vendor_invoice_number && <span>Invoice: {g.vendor_invoice_number}</span>}
              {g.vendor_invoice_date && (
                <span>Invoice Date: {new Date(g.vendor_invoice_date).toLocaleDateString("en-IN")}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {verdict && <VerdictBadge verdict={verdict} />}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <StageProgress stage={stage} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STAGE 1 — GOODS RECEIPT
          All line items in ONE table. Below the table: invoice + sign-off fields.
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="border-l-4 border-blue-500 bg-blue-50/20 rounded-r-xl overflow-hidden no-print">
        {/* Section header */}
        <div className="px-5 py-4 bg-blue-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-blue-900">Stage 1 — Goods Receipt</h2>
            <p className="text-xs text-blue-600 mt-0.5">Inventory Team</p>
          </div>
          <div className="flex items-center gap-3">
            {s1Done && !s1Editing && (
              <Button
                variant="outline"
                size="sm"
                className="text-blue-700 border-blue-300 bg-white"
                onClick={() => setS1Editing(true)}
              >
                Edit Receipt
              </Button>
            )}
            {s1Done && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-700 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Qty-mismatch warning */}
          {qtyMismatches.length > 0 && s1Editable && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {qtyMismatches.length} item{qtyMismatches.length > 1 ? "s" : ""} with quantity
              discrepancies — please verify before saving
            </div>
          )}

          {/* Items table */}
          {s1Editable ? (
            <Stage1Table lines={s1Lines} onChange={updateS1Line} />
          ) : (
            <Stage1ReadOnly lines={s1Lines} />
          )}

          {/* Below-table fields (editable state only) */}
          {s1Editable && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-blue-100">
                <div>
                  <Label className="text-xs font-medium text-slate-600">Vendor Invoice No.</Label>
                  <Input
                    value={s1InvoiceNumber}
                    onChange={(e) => setS1InvoiceNumber(e.target.value)}
                    className="mt-1 text-sm"
                    placeholder="e.g. INV-001"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Invoice Date</Label>
                  <Input
                    type="date"
                    value={s1InvoiceDate}
                    onChange={(e) => setS1InvoiceDate(e.target.value)}
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">
                    Verified By <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={s1VerifiedBy}
                    onChange={(e) => setS1VerifiedBy(e.target.value)}
                    className="mt-1 text-sm"
                    placeholder="Name"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">
                    Verification Date <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={s1Date}
                    onChange={(e) => setS1Date(e.target.value)}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-600">Receipt Notes</Label>
                <Textarea
                  value={s1Notes}
                  onChange={(e) => setS1Notes(e.target.value)}
                  className="mt-1 text-sm"
                  rows={2}
                  placeholder="Overall notes for this delivery (optional)…"
                />
              </div>

              <Button
                onClick={handleS1Save}
                disabled={s1Mutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {s1Mutation.isPending ? "Saving…" : "Save — Stage 1 Complete"}
              </Button>
            </>
          )}

          {/* Sign-off summary when read-only */}
          {!s1Editable && (
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
              {g.quantitative_completed_by && (
                <span>Verified by: <strong className="text-slate-700">{g.quantitative_completed_by}</strong></span>
              )}
              {g.quantitative_completed_at && (
                <span>on {new Date(g.quantitative_completed_at).toLocaleDateString("en-IN")}</span>
              )}
              {g.vendor_invoice_number && (
                <span>Invoice: <strong className="text-slate-700">{g.vendor_invoice_number}</strong></span>
              )}
              {g.vendor_invoice_date && (
                <span>Invoice Date: {new Date(g.vendor_invoice_date).toLocaleDateString("en-IN")}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STAGE 2 — QUALITY INSPECTION
          Only shown after Stage 1 is complete. All line items in ONE table.
      ═══════════════════════════════════════════════════════════════════ */}
      {s2Visible && (
        <div className="border-l-4 border-purple-500 bg-purple-50/20 rounded-r-xl overflow-hidden no-print">
          {/* Section header */}
          <div className="px-5 py-4 bg-purple-50/50 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-purple-900">Stage 2 — Quality Inspection</h2>
              <p className="text-xs text-purple-600 mt-0.5">QC Team</p>
            </div>
            {s2Done && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </span>
            )}
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Items table */}
            {!s2Done ? (
              <>
                <Stage2Table lines={s2Lines} onChange={updateS2Line} />

                {/* Below-table fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-purple-100">
                  <div>
                    <Label className="text-xs font-medium text-slate-600">
                      Inspected By <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={s2InspectedBy}
                      onChange={(e) => setS2InspectedBy(e.target.value)}
                      className="mt-1 text-sm"
                      placeholder="QC Inspector name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600">
                      Inspection Date <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={s2Date}
                      onChange={(e) => setS2Date(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600">Quality Remarks</Label>
                    <Textarea
                      value={s2Remarks}
                      onChange={(e) => setS2Remarks(e.target.value)}
                      className="mt-1 text-sm"
                      rows={2}
                      placeholder="Overall QC assessment…"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleS2Save}
                  disabled={s2Mutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {s2Mutation.isPending ? "Saving…" : "Save — Stage 2 Complete"}
                </Button>
              </>
            ) : (
              <>
                <Stage2ReadOnly lines={s2Lines} />

                {/* Verdict + summary — shown inside Stage 2 section */}
                {verdict && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Quality Verdict
                      </span>
                      <VerdictBadge verdict={verdict} />
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="text-green-700 font-semibold">{totalConforming}</span> units conforming,{" "}
                      {totalNonConforming > 0 ? (
                        <span className="text-amber-700 font-semibold">{totalNonConforming}</span>
                      ) : (
                        <span>0</span>
                      )}{" "}
                      units non-conforming across{" "}
                      {s2Lines.length} item{s2Lines.length !== 1 ? "s" : ""}
                    </p>
                    {g.quality_remarks && (
                      <p className="text-xs text-slate-500 italic">"{g.quality_remarks}"</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
                  {g.quality_completed_by && (
                    <span>Inspected by: <strong className="text-slate-700">{g.quality_completed_by}</strong></span>
                  )}
                  {g.quality_completed_at && (
                    <span>on {new Date(g.quality_completed_at).toLocaleDateString("en-IN")}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          NON-CONFORMANCE SUMMARY PANEL
          Only shown after Stage 2 is complete and there are NC items.
      ═══════════════════════════════════════════════════════════════════ */}
      {s2Done && ncItems.length > 0 && (
        <div className="border border-amber-300 bg-amber-50/30 rounded-xl overflow-hidden no-print">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <h3 className="text-sm font-bold text-amber-900">Non-Conformance Report</h3>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-amber-800 border-b border-amber-200">
                    <th className="text-left px-2 py-2 font-semibold">Item Code</th>
                    <th className="text-left px-2 py-2 font-semibold">Description</th>
                    <th className="text-right px-2 py-2 font-semibold">NC Qty</th>
                    <th className="text-center px-2 py-2 font-semibold">Type</th>
                    <th className="text-left px-2 py-2 font-semibold">Deviation</th>
                    <th className="text-center px-2 py-2 font-semibold">Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {ncItems.map((l, idx) => (
                    <tr key={idx} className="border-b border-amber-100">
                      <td className="px-2 py-1.5 font-mono text-slate-500">{l.item_code || "—"}</td>
                      <td className="px-2 py-1.5 font-medium text-slate-800">{l.description}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-amber-700 font-semibold">
                        {l.non_conforming_qty}
                      </td>
                      <td className="px-2 py-1.5 text-center capitalize">
                        {(l.non_conformance_type || "—").replace(/_/g, " ")}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{l.deviation_description || "—"}</td>
                      <td className="px-2 py-1.5 text-center capitalize">
                        {(l.disposition || "—").replace(/_/g, " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-amber-700">
              {totalNonConforming} units non-conforming across {ncItems.length} item{ncItems.length > 1 ? "s" : ""}.
              {grn.vendor_name &&
                ` This non-conformance has been recorded against ${grn.vendor_name}'s quality scorecard.`}
            </p>
            {ncItems.some((l) => l.disposition === "return_to_vendor") && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-800 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                RETURN TO VENDOR — Vendor must collect or arrange replacement
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Audit trail ── */}
      <div className="no-print">
        <AuditTimeline documentId={id!} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PRINT VIEW — 4 sections A/B/C/D
          Hidden on screen, shown when printing.
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="print-only space-y-6 text-black text-xs">
        <DocumentHeader />

        {/* Section A — Receipt Details */}
        <div className="border border-black">
          <div className="bg-slate-100 text-center py-1.5 border-b border-black">
            <h2 className="font-bold uppercase text-sm tracking-wide">Section A — Receipt Details</h2>
          </div>
          <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-0.5 border-b border-slate-200">
            <div><strong>GRN No.:</strong> {grn.grn_number}</div>
            <div><strong>GRN Date:</strong> {new Date(grn.grn_date).toLocaleDateString("en-IN")}</div>
            <div><strong>Vendor:</strong> {grn.vendor_name || "—"}</div>
            <div><strong>Invoice No.:</strong> {g.vendor_invoice_number || "—"}</div>
            {grn.po_number && <div><strong>Against PO:</strong> {grn.po_number}</div>}
            {g.vendor_invoice_date && <div><strong>Invoice Date:</strong> {new Date(g.vendor_invoice_date).toLocaleDateString("en-IN")}</div>}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px]">
                {["#", "Item Code", "Description", "Ordered Qty", "Received Qty", "Matched", "Condition", "Packing"].map((h) => (
                  <th key={h} className="border border-slate-300 px-1.5 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s1Lines.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="border border-slate-300 px-1.5 py-1">{idx + 1}</td>
                  <td className="border border-slate-300 px-1.5 py-1 font-mono">{l.item_code || "—"}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{l.description}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{l.po_quantity}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{l.received_qty}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{l.qty_matched ? "✓" : "⚠"}</td>
                  <td className="border border-slate-300 px-1.5 py-1 capitalize">{(l.condition_on_arrival || "good").replace(/_/g, " ")}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{l.packing_intact ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3 grid grid-cols-3 gap-4 border-t border-slate-200">
            {["Received By (Store)", "Date", "Signature"].map((f) => (
              <div key={f}><strong>{f}:</strong> <span className="inline-block border-b border-black w-24 ml-1">&nbsp;</span></div>
            ))}
          </div>
        </div>

        {/* Section B — Quality Inspection */}
        <div className="border border-black">
          <div className="bg-slate-100 text-center py-1.5 border-b border-black">
            <h2 className="font-bold uppercase text-sm tracking-wide">Section B — Quality Inspection Report</h2>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px]">
                {["#", "Item Code", "Description", "Qty Inspected", "Conforming Qty", "Non-Conf. Qty", "Disposition"].map((h) => (
                  <th key={h} className="border border-slate-300 px-1.5 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s2Lines.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="border border-slate-300 px-1.5 py-1">{idx + 1}</td>
                  <td className="border border-slate-300 px-1.5 py-1 font-mono">{l.item_code || "—"}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{l.description}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{l.qty_inspected}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{l.conforming_qty}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right">{l.non_conforming_qty || "—"}</td>
                  <td className="border border-slate-300 px-1.5 py-1 capitalize">{(l.disposition || "—").replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {verdict && (
            <div className={`m-3 text-center font-bold py-2 px-4 rounded border-2 text-sm ${
              verdict === "fully_accepted"
                ? "border-green-600 bg-green-50 text-green-800"
                : verdict === "returned"
                ? "border-red-600 bg-red-50 text-red-800"
                : "border-amber-600 bg-amber-50 text-amber-800"
            }`}>
              Overall Quality Verdict: {verdict.replace(/_/g, " ").toUpperCase()}
            </div>
          )}
          <div className="p-3 grid grid-cols-3 gap-4 border-t border-slate-200">
            {["Inspected By (QC)", "Date", "Signature"].map((f) => (
              <div key={f}><strong>{f}:</strong> <span className="inline-block border-b border-black w-24 ml-1">&nbsp;</span></div>
            ))}
          </div>
        </div>

        {/* Section C — Non-Conformance (only if any) */}
        {ncItems.length > 0 && (
          <div className="border-2 border-amber-500">
            <div className="bg-amber-100 text-center py-1.5 border-b border-amber-500">
              <h2 className="font-bold uppercase text-sm tracking-wide text-amber-900">
                Section C — Non-Conformance Report
              </h2>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-amber-50 text-[10px]">
                  {["Item Code", "Description", "NC Qty", "Type", "Deviation Description", "Disposition", "Action Required"].map((h) => (
                    <th key={h} className="border border-amber-300 px-1.5 py-1 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ncItems.map((l, idx) => (
                  <tr key={idx} className="border-b border-amber-200">
                    <td className="border border-amber-200 px-1.5 py-1 font-mono">{l.item_code || "—"}</td>
                    <td className="border border-amber-200 px-1.5 py-1">{l.description}</td>
                    <td className="border border-amber-200 px-1.5 py-1 text-right">{l.non_conforming_qty}</td>
                    <td className="border border-amber-200 px-1.5 py-1 capitalize">{(l.non_conformance_type || "—").replace(/_/g, " ")}</td>
                    <td className="border border-amber-200 px-1.5 py-1">{l.deviation_description || "—"}</td>
                    <td className="border border-amber-200 px-1.5 py-1 capitalize">{(l.disposition || "—").replace(/_/g, " ")}</td>
                    <td className="border border-amber-200 px-1.5 py-1">
                      {l.disposition === "return_to_vendor"
                        ? "Return to Vendor"
                        : l.disposition === "scrap"
                        ? "Scrap"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ncItems.some((l) => l.disposition === "return_to_vendor") && (
              <p className="m-3 font-bold text-red-800 border border-red-500 bg-red-50 px-3 py-2 rounded">
                RETURN TO VENDOR — Vendor must collect or arrange replacement
              </p>
            )}
          </div>
        )}

        {/* Section D — Authorisation */}
        <div className="border border-black">
          <div className="bg-slate-100 text-center py-1.5 border-b border-black">
            <h2 className="font-bold uppercase text-sm tracking-wide">Section D — Authorisation</h2>
          </div>
          <div className="p-4 grid grid-cols-3 gap-6">
            {["Received By (Store)", "Inspected By (QC)", "Approved By (Manager)"].map((role) => (
              <div key={role} className="space-y-4 text-center">
                <p className="font-semibold text-slate-600 text-xs">{role}</p>
                {["Name", "Sign", "Date"].map((field) => (
                  <div key={field} className="text-left">
                    <strong>{field}:</strong>{" "}
                    <span className="inline-block border-b border-black w-28 ml-1">&nbsp;</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
