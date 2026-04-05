import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Printer, CheckCircle2, Clock, AlertTriangle, Trash2, Plus, PackageCheck,
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
  fetchGRNQCMeasurements,
  saveGRNQCMeasurements,
  saveGRNScrapItems,
  storeConfirmGRN,
  type QuantitativeLineData,
  type QualitativeLineData,
  type InspectionMethod,
  type NonConformanceType,
  type Disposition,
  type GRNQCMeasurement,
  type GRNLineItem,
  type GRNScrapItem,
} from "@/lib/grn-api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DocumentHeader } from "@/components/DocumentHeader";
import { AuditTimeline } from "@/components/AuditTimeline";
import { logAudit } from "@/lib/audit-api";
import { UNITS } from "@/lib/constants";

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
  { value: "rework_our_scope",   label: "Rework (Our Scope)" },
];

// ── Stage 1 line state ─────────────────────────────────────────────────────────

interface S1Line {
  id: string;
  item_code: string;
  description: string;
  po_quantity: number;
  received_qty: number;
  qty_matched: boolean;
  condition_on_arrival: string;
  packing_intact: boolean;
  notes: string;
}

// ── QC Measurement row state ───────────────────────────────────────────────────

interface QCRow {
  // link back to line item
  lineItemId: string;
  // the measurement
  sl_no: number;
  characteristic: string;
  specification: string;
  qty_checked: string;
  sample_1: string;
  sample_2: string;
  sample_3: string;
  sample_4: string;
  sample_5: string;
  conforming_qty: string;
  non_conforming_qty: string;
  measuring_instrument: string;
}

// ── NC Summary per item ────────────────────────────────────────────────────────

interface NCSummary {
  lineItemId: string;
  qty_inspected: number;
  conforming_qty: number;
  non_conforming_qty: number;
  disposition: Disposition | '';
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
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              s.done ? "bg-blue-600 text-white" : s.active ? "bg-blue-100 text-blue-700 border-2 border-blue-500" : "bg-slate-100 text-slate-400 border-2 border-slate-200"
            }`}>
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.active ? <Clock className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
            </div>
            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${s.done ? "text-blue-700" : s.active ? "text-blue-600" : "text-slate-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-12 mb-3.5 mx-1 ${s.done ? "bg-blue-400" : "bg-slate-200"}`} />
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
              <tr key={line.id} className={`transition-colors ${mismatch ? "bg-yellow-50/70" : "bg-white hover:bg-blue-50/20"}`}>
                <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{line.item_code || "—"}</td>
                <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px]">
                  <span className="block truncate" title={line.description}>{line.description}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{line.po_quantity}</td>
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
                      line.packing_intact ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
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
            <tr key={l.id} className={l.received_qty !== l.po_quantity ? "bg-yellow-50/40" : "bg-white"}>
              <td className="px-3 py-2 text-slate-400 text-xs">{idx + 1}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.item_code || "—"}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{l.description}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">{l.po_quantity}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-800">{l.received_qty}</td>
              <td className="px-3 py-2 text-center text-xs">
                {l.qty_matched ? <span className="text-green-600 font-semibold">✓</span> : <span className="text-amber-600 font-semibold">⚠</span>}
              </td>
              <td className="px-3 py-2 text-center text-xs capitalize">{(l.condition_on_arrival || "good").replace(/_/g, " ")}</td>
              <td className="px-3 py-2 text-center text-xs">{l.packing_intact ? "✓" : "✗"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{l.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── QC Measurement — editable rows per item ────────────────────────────────────

function QCMeasurementEditor({
  lineItems,
  qcRows,
  onAddRow,
  onChangeRow,
  onDeleteRow,
}: {
  lineItems: Array<{ id: string; item_code: string; description: string; received_qty: number; unit: string }>;
  qcRows: QCRow[];
  onAddRow: (lineItemId: string) => void;
  onChangeRow: (idx: number, field: keyof QCRow, value: string) => void;
  onDeleteRow: (idx: number) => void;
}) {
  return (
    <div className="space-y-4">
      {lineItems.map((item) => {
        const itemRows = qcRows
          .map((r, globalIdx) => ({ ...r, globalIdx }))
          .filter((r) => r.lineItemId === item.id);
        const hasNC = itemRows.some((r) => Number(r.non_conforming_qty) > 0);

        return (
          <div key={item.id} className="rounded-lg border border-slate-200 overflow-hidden">
            {/* Item header */}
            <div className={`flex items-center justify-between px-4 py-2 ${hasNC ? "bg-amber-100" : "bg-blue-50"}`}>
              <span className={`text-xs font-semibold ${hasNC ? "text-amber-800" : "text-blue-800"}`}>
                <span className="font-mono">{item.item_code || "—"}</span>
                {" — "}{item.description}
                <span className="font-normal ml-2">· Received: {item.received_qty} {item.unit}</span>
              </span>
              <button
                type="button"
                onClick={() => onAddRow(item.id)}
                className="text-xs px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 font-medium flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Row
              </button>
            </div>

            {/* Measurement table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 36}}>Sl</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{minWidth: 140}}>Characteristics</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{minWidth: 130}}>Specification</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 52}}>Qty</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S1</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S2</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S3</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S4</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S5</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 60}}>Conf.</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 60}}>NC</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{minWidth: 130}}>Measuring Instrument</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 30}}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-3 text-center text-slate-400 italic text-xs">
                        No measurements yet — click "+ Add Row"
                      </td>
                    </tr>
                  ) : (
                    itemRows.map(({ globalIdx, ...row }) => {
                      const confNum = Number(row.conforming_qty) || 0;
                      const ncNum = Number(row.non_conforming_qty) || 0;
                      const qtyNum = Number(row.qty_checked) || 0;
                      const sumMismatch = qtyNum > 0 && (confNum + ncNum) !== qtyNum;
                      const isNC = ncNum > 0;
                      return (
                        <tr key={globalIdx} className={isNC ? "bg-amber-50" : "bg-white hover:bg-slate-50/50"}>
                          <td className="px-2 py-1.5 text-center text-slate-400">{row.sl_no}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-purple-400 text-xs py-0.5"
                              value={row.characteristic}
                              placeholder="e.g. Diameter"
                              onChange={(e) => onChangeRow(globalIdx, "characteristic", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-purple-400 text-xs py-0.5"
                              value={row.specification}
                              placeholder="e.g. 25mm ± 0.05"
                              onChange={(e) => onChangeRow(globalIdx, "specification", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              className="w-full text-center bg-transparent border-b border-slate-200 focus:outline-none focus:border-purple-400 text-xs py-0.5"
                              value={row.qty_checked}
                              placeholder="5"
                              min={0}
                              max={item.received_qty}
                              onChange={(e) => onChangeRow(globalIdx, "qty_checked", e.target.value)}
                            />
                          </td>
                          {(["sample_1", "sample_2", "sample_3", "sample_4", "sample_5"] as const).map((s) => (
                            <td key={s} className="px-2 py-1.5">
                              <input
                                className="w-full text-center bg-transparent border-b border-slate-200 focus:outline-none focus:border-purple-400 text-xs py-0.5"
                                value={row[s]}
                                placeholder="—"
                                onChange={(e) => onChangeRow(globalIdx, s, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              className="w-full text-center border border-green-200 bg-green-50 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                              value={row.conforming_qty}
                              placeholder="0"
                              min={0}
                              onChange={(e) => onChangeRow(globalIdx, "conforming_qty", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              readOnly
                              className={`w-full text-center border rounded px-1 py-0.5 text-xs cursor-default ${
                                isNC
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-slate-100 bg-slate-50 text-slate-500"
                              }`}
                              value={row.non_conforming_qty}
                              tabIndex={-1}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div>
                              <input
                                className="w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-purple-400 text-xs py-0.5"
                                value={row.measuring_instrument}
                                placeholder="e.g. Vernier Caliper"
                                onChange={(e) => onChangeRow(globalIdx, "measuring_instrument", e.target.value)}
                              />
                              {sumMismatch && (
                                <p className="text-red-500 text-[10px] mt-0.5">Conf+NC ≠ Qty ({confNum + ncNum} ≠ {qtyNum})</p>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => onDeleteRow(globalIdx)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── QC Measurement — read-only view ───────────────────────────────────────────

function QCMeasurementReadOnly({
  lineItems,
  qcRows,
}: {
  lineItems: Array<{ id: string; item_code: string; description: string; received_qty: number; unit: string }>;
  qcRows: GRNQCMeasurement[];
}) {
  return (
    <div className="space-y-4">
      {lineItems.map((item) => {
        const itemRows = qcRows.filter((r) => r.grn_line_item_id === item.id);
        if (itemRows.length === 0) return null;
        const hasNC = itemRows.some((r) => r.result === "non_conforming");
        return (
          <div key={item.id} className="rounded-lg border border-slate-200 overflow-hidden">
            <div className={`px-4 py-2 ${hasNC ? "bg-amber-100" : "bg-blue-50"}`}>
              <span className={`text-xs font-semibold ${hasNC ? "text-amber-800" : "text-blue-800"}`}>
                <span className="font-mono">{item.item_code || "—"}</span>
                {" — "}{item.description}
                <span className="font-normal ml-2">· Received: {item.received_qty} {item.unit}</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 36}}>Sl</th>
                    <th className="px-2 py-2 text-left font-semibold">Characteristics</th>
                    <th className="px-2 py-2 text-left font-semibold">Specification</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 52}}>Qty</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S1</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S2</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S3</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S4</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 62}}>S5</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{width: 110}}>Result</th>
                    <th className="px-2 py-2 text-left font-semibold">Measuring Instrument</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemRows.map((row, idx) => {
                    const isNC = row.result === "non_conforming";
                    return (
                      <tr key={idx} className={isNC ? "bg-amber-50/60" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                        <td className="px-2 py-1.5 text-center text-slate-400">{row.sl_no}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{row.characteristic}</td>
                        <td className="px-2 py-1.5 text-slate-600">{row.specification || "—"}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{row.qty_checked ?? "—"}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-xs">{row.sample_1 || "—"}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-xs">{row.sample_2 || "—"}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-xs">{row.sample_3 || "—"}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-xs">{row.sample_4 || "—"}</td>
                        <td className="px-2 py-1.5 text-center font-mono text-xs">{row.sample_5 || "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {row.result === "conforming" ? (
                            <span className="text-green-700 font-semibold text-xs">✓ OK</span>
                          ) : row.result === "non_conforming" ? (
                            <span className="text-red-600 font-semibold text-xs">✗ NC</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{row.measuring_instrument || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Print View ─────────────────────────────────────────────────────────────────

function GRNPrintView({
  grn,
  s1Lines,
  qcMeasurements,
  ncSummaries,
  s2InspectedBy,
  s2ApprovedBy,
  s2Date,
  s2Remarks,
  verdict,
}: {
  grn: any;
  s1Lines: S1Line[];
  qcMeasurements: GRNQCMeasurement[];
  ncSummaries: NCSummary[];
  s2InspectedBy: string;
  s2ApprovedBy: string;
  s2Date: string;
  s2Remarks: string;
  verdict: string | undefined;
}) {
  const lineItems: GRNLineItem[] = grn.line_items ?? [];
  const hasNC = qcMeasurements.some((m) => m.result === "non_conforming");
  const ncItems = ncSummaries.filter((s) => s.non_conforming_qty > 0);

  // Group measurements by line item
  const measurementsByItem = (itemId: string) =>
    qcMeasurements.filter((m) => m.grn_line_item_id === itemId);

  return (
    <div id="grn-print-view" style={{ display: "none" }}>
      {/* ── Page header ── */}
      <div style={{ borderBottom: "2pt solid #0F4C81", paddingBottom: "6pt", marginBottom: "8pt" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "11pt", color: "#0F4C81", fontFamily: "Arial" }}>
              <DocumentHeader />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: "bold", fontSize: "11pt", fontFamily: "Arial" }}>GOODS RECEIPT NOTE</div>
            <div style={{ fontSize: "7pt", color: "#64748B", fontFamily: "Arial" }}>Doc: GRN / INS / 01</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4pt", marginTop: "4pt", fontSize: "8pt", fontFamily: "Arial" }}>
          <div>
            <div><strong>GRN No.:</strong> {grn.grn_number}</div>
            <div><strong>GRN Date:</strong> {new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
            <div><strong>Vendor:</strong> {grn.vendor_name || "—"}</div>
          </div>
          <div>
            {grn.po_number && <div><strong>PO No.:</strong> {grn.po_number}</div>}
            {grn.vendor_invoice_number && <div><strong>Invoice No.:</strong> {grn.vendor_invoice_number}</div>}
            {grn.vehicle_number && <div><strong>Vehicle No.:</strong> {grn.vehicle_number}</div>}
          </div>
        </div>
      </div>

      {/* ── SECTION A — GOODS RECEIPT ── */}
      <div style={{ marginBottom: "10pt" }}>
        <div style={{
          background: "#EFF6FF",
          borderLeft: "3pt solid #2563EB",
          padding: "4pt 8pt",
          marginBottom: "4pt",
          fontWeight: "bold",
          fontSize: "8pt",
          fontFamily: "Arial",
          color: "#1E40AF",
        }}>
          SECTION A — GOODS RECEIPT · Inward Team
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt", fontFamily: "Arial" }}>
          <thead>
            <tr style={{ background: "#0F4C81", color: "white" }}>
              {["Sl", "Item Code", "Description", "Ordered Qty", "Received Qty", "Matched", "Condition", "Packing"].map((h) => (
                <th key={h} style={{ padding: "3pt 4pt", textAlign: h === "Ordered Qty" || h === "Received Qty" ? "right" : "left", fontSize: "8pt", fontWeight: "bold" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s1Lines.map((l, idx) => (
              <tr key={idx} style={{ background: l.received_qty !== l.po_quantity ? "#FEF3C7" : idx % 2 === 0 ? "#F8FAFC" : "white" }}>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0" }}>{idx + 1}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", fontFamily: "Courier New, monospace" }}>{l.item_code || "—"}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0" }}>{l.description}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "right" }}>{l.po_quantity}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "right", fontWeight: "bold" }}>{l.received_qty}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center" }}>{l.qty_matched ? "✓" : "⚠"}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", textTransform: "capitalize" }}>{(l.condition_on_arrival || "good").replace(/_/g, " ")}</td>
                <td style={{ padding: "2.5pt 4pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center" }}>{l.packing_intact ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4pt", fontSize: "7.5pt", fontFamily: "Arial" }}>
          <span>
            {grn.quantitative_completed_by && <>Received By: <strong>{grn.quantitative_completed_by}</strong></>}
            {grn.quantitative_completed_at && <> · Date: {new Date(grn.quantitative_completed_at).toLocaleDateString("en-IN")}</>}
          </span>
          <span>Signature: <span style={{ display: "inline-block", borderBottom: "0.5pt solid black", width: "80pt" }}>&nbsp;</span></span>
        </div>
      </div>

      {/* ── SECTION B — QUALITY INSPECTION REPORT ── */}
      <div style={{ marginBottom: "10pt" }}>
        <div style={{
          background: "#F3F0FF",
          borderLeft: "3pt solid #6D28D9",
          padding: "4pt 8pt",
          marginBottom: "4pt",
          fontWeight: "bold",
          fontSize: "8pt",
          fontFamily: "Arial",
          color: "#4C1D95",
        }}>
          SECTION B — QUALITY INSPECTION REPORT · QC Team
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt", fontFamily: "Arial", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "18pt" }} />
            <col style={{ width: "80pt" }} />
            <col style={{ width: "75pt" }} />
            <col style={{ width: "22pt" }} />
            <col style={{ width: "28pt" }} />
            <col style={{ width: "28pt" }} />
            <col style={{ width: "28pt" }} />
            <col style={{ width: "28pt" }} />
            <col style={{ width: "28pt" }} />
            <col style={{ width: "45pt" }} />
            <col style={{ width: "65pt" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#0F4C81", color: "white" }}>
              {["Sl", "Characteristics", "Specification", "Qty", "S1", "S2", "S3", "S4", "S5", "Result", "Measuring Instrument"].map((h) => (
                <th key={h} style={{ padding: "3pt 3pt", textAlign: "left", fontSize: "7pt", fontWeight: "bold" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item: GRNLineItem, itemIdx: number) => {
              const itemMeasurements = measurementsByItem(item.id ?? "");
              if (itemMeasurements.length === 0) return null;
              const itemHasNC = itemMeasurements.some((m) => m.result === "non_conforming");
              const itemCode = (item as any).drawing_number ?? "";
              const s1 = s1Lines.find((l) => l.id === item.id);
              return (
                <React.Fragment key={item.id ?? itemIdx}>
                  {/* Item group header */}
                  <tr style={{ background: itemHasNC ? "#FEF3C7" : "#DBEAFE" }}>
                    <td colSpan={11} style={{
                      padding: "3pt 4pt",
                      fontWeight: "bold",
                      fontSize: "7.5pt",
                      color: itemHasNC ? "#92400E" : "#0F4C81",
                    }}>
                      {itemCode && <span style={{ fontFamily: "Courier New, monospace" }}>{itemCode}</span>}
                      {itemCode && " — "}
                      {item.description}
                      {s1 && <span style={{ fontWeight: "normal" }}> · Received: {s1.received_qty} {item.unit}</span>}
                    </td>
                  </tr>
                  {/* Measurement rows */}
                  {itemMeasurements.map((row, idx) => {
                    const isNC = row.result === "non_conforming";
                    return (
                      <tr key={row.id ?? idx} style={{ background: isNC ? "#FEF3C7" : idx % 2 === 0 ? "#F8FAFC" : "white" }}>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center" }}>{row.sl_no}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0" }}>{row.characteristic}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0" }}>{row.specification || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center" }}>{row.qty_checked ?? "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontFamily: "Courier New, monospace" }}>{row.sample_1 || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontFamily: "Courier New, monospace" }}>{row.sample_2 || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontFamily: "Courier New, monospace" }}>{row.sample_3 || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontFamily: "Courier New, monospace" }}>{row.sample_4 || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontFamily: "Courier New, monospace" }}>{row.sample_5 || "—"}</td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0", textAlign: "center", fontWeight: "bold", color: isNC ? "#DC2626" : "#166534" }}>
                          {row.result === "conforming" ? "✓ OK" : row.result === "non_conforming" ? "✗ NC" : "—"}
                        </td>
                        <td style={{ padding: "2pt 3pt", borderBottom: "0.5pt solid #E2E8F0" }}>{row.measuring_instrument || "—"}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: "4pt", fontSize: "7.5pt", fontFamily: "Arial" }}>
          {s2InspectedBy && <span>Inspected By: <strong>{s2InspectedBy}</strong></span>}
          {s2Date && <span> · Date: {new Date(s2Date).toLocaleDateString("en-IN")}</span>}
          <span> · Instrument Calibration records on file</span>
        </div>
      </div>

      {/* ── SECTION C — NON-CONFORMANCE REPORT (conditional) ── */}
      {hasNC && (
        <div style={{ marginBottom: "10pt", border: "1pt solid #FDE68A", background: "#FFFBEB", padding: "6pt" }}>
          <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#92400E", marginBottom: "6pt", fontFamily: "Arial" }}>
            SECTION C — NON-CONFORMANCE REPORT
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt", fontFamily: "Arial" }}>
            <thead>
              <tr style={{ background: "#FEF3C7" }}>
                {["Item", "Description", "Conforming Qty", "NC Qty", "Disposition"].map((h) => (
                  <th key={h} style={{ padding: "2pt 4pt", textAlign: "left", borderBottom: "0.5pt solid #FDE68A", fontWeight: "bold" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ncItems.map((nc, idx) => {
                const item = lineItems.find((i: GRNLineItem) => i.id === nc.lineItemId);
                const itemCode = item ? (item as any).drawing_number ?? "" : "";
                return (
                  <tr key={idx}>
                    <td style={{ padding: "2pt 4pt", borderBottom: "0.5pt solid #FDE68A", fontFamily: "Courier New, monospace" }}>{itemCode || "—"}</td>
                    <td style={{ padding: "2pt 4pt", borderBottom: "0.5pt solid #FDE68A" }}>{item?.description || "—"}</td>
                    <td style={{ padding: "2pt 4pt", borderBottom: "0.5pt solid #FDE68A", textAlign: "center" }}>{nc.conforming_qty}</td>
                    <td style={{ padding: "2pt 4pt", borderBottom: "0.5pt solid #FDE68A", textAlign: "center", fontWeight: "bold", color: "#DC2626" }}>{nc.non_conforming_qty}</td>
                    <td style={{ padding: "2pt 4pt", borderBottom: "0.5pt solid #FDE68A", textTransform: "capitalize" }}>{(nc.disposition || "—").replace(/_/g, " ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ncItems.some((nc) => nc.disposition === "return_to_vendor") && (
            <div style={{ marginTop: "4pt", fontWeight: "bold", fontSize: "7.5pt", color: "#DC2626", fontFamily: "Arial" }}>
              ACTION REQUIRED: Vendor to collect non-conforming items and arrange replacement.
            </div>
          )}
          {s2Remarks && (
            <div style={{ marginTop: "4pt", fontSize: "7.5pt", fontFamily: "Arial" }}>
              <strong>QC REMARKS:</strong> {s2Remarks}
            </div>
          )}
          {verdict && (
            <div style={{
              display: "inline-block",
              marginTop: "6pt",
              padding: "3pt 8pt",
              border: `1pt solid ${verdict === "fully_accepted" ? "#166534" : verdict === "returned" ? "#DC2626" : "#92400E"}`,
              background: verdict === "fully_accepted" ? "#DCFCE7" : verdict === "returned" ? "#FEE2E2" : "#FEF3C7",
              color: verdict === "fully_accepted" ? "#166534" : verdict === "returned" ? "#DC2626" : "#92400E",
              fontWeight: "bold",
              fontSize: "8pt",
              fontFamily: "Arial",
            }}>
              Overall Verdict: {verdict.replace(/_/g, " ").toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* ── SECTION D — AUTHORISATION ── */}
      <div>
        <div style={{ fontWeight: "bold", fontSize: "8pt", color: "#1E40AF", marginBottom: "6pt", fontFamily: "Arial" }}>
          SECTION D — AUTHORISATION
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6pt" }}>
          {[
            { role: "RECEIVED BY (INWARD TEAM)", name: grn.quantitative_completed_by, date: grn.quantitative_completed_at ? new Date(grn.quantitative_completed_at).toLocaleDateString("en-IN") : "" },
            { role: "INSPECTED BY (QC TEAM)", name: s2InspectedBy, date: s2Date ? new Date(s2Date).toLocaleDateString("en-IN") : "" },
            { role: "APPROVED BY", name: s2ApprovedBy, date: "" },
          ].map(({ role, name, date }) => (
            <div key={role} style={{ border: "0.5pt solid #E2E8F0", padding: "6pt", textAlign: "center", fontFamily: "Arial" }}>
              <div style={{ fontSize: "6pt", textTransform: "uppercase", color: "#64748B", letterSpacing: "0.5pt", marginBottom: "4pt" }}>{role}</div>
              <div style={{ fontSize: "8pt", fontWeight: "bold", minHeight: "12pt" }}>{name || ""}</div>
              <div style={{ fontSize: "7pt", color: "#475569", marginTop: "2pt", minHeight: "10pt" }}>{date || ""}</div>
              <div style={{ borderTop: "0.5pt solid black", marginTop: "8pt", paddingTop: "2pt" }}>
                <span style={{ fontSize: "6pt", color: "#94A3B8" }}>Signature</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: "8pt", fontSize: "6.5pt", color: "#94A3B8", textAlign: "center", fontFamily: "Arial", borderTop: "0.5pt solid #E2E8F0", paddingTop: "4pt" }}>
        BizDocs · {grn.grn_number} · Printed {new Date().toLocaleDateString("en-IN")}
      </div>
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

  const [qcRows,        setQcRows]        = useState<QCRow[]>([]);
  const [ncSummaries,   setNcSummaries]   = useState<NCSummary[]>([]);
  const [s2InspectedBy, setS2InspectedBy] = useState("");
  const [s2ApprovedBy,  setS2ApprovedBy]  = useState("");
  const [s2Date,        setS2Date]        = useState(format(new Date(), "yyyy-MM-dd"));
  const [s2Remarks,     setS2Remarks]     = useState("");

  // ── Scrap return state (Stage 1 — DC-GRN only) ────────────────────────────
  const [scrapReturned, setScrapReturned] = useState(false);
  const [scrapNotes,    setScrapNotes]    = useState("");
  const [scrapItems,    setScrapItems]    = useState<{material_type:string; quantity:string; unit:string; notes:string}[]>([]);

  // ── Final GRN / store confirmation state ──────────────────────────────────
  const [isFinalGrn,        setIsFinalGrn]        = useState(false);
  const [finalGrnReason,    setFinalGrnReason]     = useState("");
  const [showUntickDialog,  setShowUntickDialog]   = useState(false);
  const [untickReason,      setUntickReason]       = useState("");
  const [storeDialogOpen,   setStoreDialogOpen]    = useState(false);
  const [storeConfirmedBy,  setStoreConfirmedBy]   = useState("");
  const [storeDateStr,      setStoreDateStr]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [storeLocation,     setStoreLocation]      = useState("");
  const [storeNotes,        setStoreNotes]         = useState("");

  // ── Initialise from loaded GRN ────────────────────────────────────────────

  useEffect(() => {
    if (!grn) return;
    const g = grn as any;
    const items = grn.line_items ?? [];

    // Stage 1
    setS1Lines(
      items.map((item) => {
        const a = item as any;
        const recv = a.received_qty ?? a.receiving_now ?? 0;
        return {
          id:                   item.id ?? "",
          item_code:            a.drawing_number ?? "",
          description:          item.description,
          po_quantity:          item.po_quantity ?? 0,
          received_qty:         recv,
          qty_matched:          a.qty_matched !== false && recv === (item.po_quantity ?? 0),
          condition_on_arrival: a.condition_on_arrival ?? "good",
          packing_intact:       a.packing_intact !== false,
          notes:                a.quantitative_notes ?? "",
        };
      })
    );

    // Stage 2 — QC rows from loaded measurements
    const existingMeasurements = grn.qc_measurements ?? [];
    if (existingMeasurements.length > 0) {
      setQcRows(
        existingMeasurements.map((m) => {
          const am = m as any;
          // Support both new conforming_qty/non_conforming_qty and legacy result field
          const confQty = am.conforming_qty != null
            ? String(am.conforming_qty)
            : (m.result === 'conforming' && m.qty_checked != null ? String(m.qty_checked) : '');
          const ncQty = am.non_conforming_qty != null
            ? String(am.non_conforming_qty)
            : (m.result === 'non_conforming' && m.qty_checked != null ? String(m.qty_checked) : '');
          return {
            lineItemId:           m.grn_line_item_id,
            sl_no:                m.sl_no,
            characteristic:       m.characteristic,
            specification:        m.specification ?? "",
            qty_checked:          m.qty_checked != null ? String(m.qty_checked) : "",
            sample_1:             m.sample_1 ?? "",
            sample_2:             m.sample_2 ?? "",
            sample_3:             m.sample_3 ?? "",
            sample_4:             m.sample_4 ?? "",
            sample_5:             m.sample_5 ?? "",
            conforming_qty:       confQty,
            non_conforming_qty:   ncQty,
            measuring_instrument: m.measuring_instrument ?? "",
          };
        })
      );
    }

    // NC summaries
    setNcSummaries(
      items.map((item) => {
        const a = item as any;
        const recv = a.received_qty ?? a.receiving_now ?? 0;
        return {
          lineItemId:         item.id ?? "",
          qty_inspected:      recv,
          conforming_qty:     a.conforming_qty ?? recv,
          non_conforming_qty: a.non_conforming_qty ?? 0,
          disposition:        (a.disposition as Disposition) ?? "",
        };
      })
    );

    setS1VerifiedBy(g.quantitative_completed_by ?? "");
    setS1InvoiceNumber(g.vendor_invoice_number ?? "");
    setS1InvoiceDate(g.vendor_invoice_date ?? "");
    setS2InspectedBy(g.quality_completed_by ?? "");
    setS2ApprovedBy(g.qc_approved_by ?? "");
    setS2Remarks(g.quality_remarks ?? "");
    setIsFinalGrn(g.is_final_grn ?? false);
    setScrapReturned(g.scrap_returned ?? false);
    setScrapNotes(g.scrap_notes ?? "");
  }, [grn]);

  // ── NC summary auto-update from QC rows ──────────────────────────────────

  useEffect(() => {
    if (!grn?.line_items) return;
    const items = grn.line_items;
    setNcSummaries((prev) =>
      items.map((item) => {
        const existing = prev.find((s) => s.lineItemId === item.id);
        const itemRows = qcRows.filter((r) => r.lineItemId === item.id);
        const hasNCRow = itemRows.some((r) => Number(r.non_conforming_qty) > 0);
        const recv = (item as any).received_qty ?? (item as any).receiving_now ?? item.po_quantity ?? 0;
        if (!hasNCRow) {
          return {
            lineItemId:         item.id ?? "",
            qty_inspected:      recv,
            conforming_qty:     recv,
            non_conforming_qty: 0,
            disposition:        "",
          };
        }
        // Derive nc qty from the max across rows for this item
        const totalNC = itemRows.reduce((s, r) => s + (Number(r.non_conforming_qty) || 0), 0);
        return existing
          ? { ...existing, non_conforming_qty: totalNC, conforming_qty: Math.max(0, recv - totalNC) }
          : {
              lineItemId:         item.id ?? "",
              qty_inspected:      recv,
              conforming_qty:     Math.max(0, recv - totalNC),
              non_conforming_qty: totalNC,
              disposition:        "",
            };
      })
    );
  }, [qcRows, grn?.line_items]);

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
      // Save scrap data for DC-GRNs
      await saveGRNScrapItems(id!, scrapReturned, scrapNotes || null,
        scrapItems.filter((r) => r.material_type.trim()).map((r) => ({
          material_type: r.material_type,
          quantity: r.quantity ? Number(r.quantity) : null,
          unit: r.unit || undefined,
          notes: r.notes || undefined,
        }))
      );
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
      // Save QC measurements
      const measurements: GRNQCMeasurement[] = qcRows.map((r) => ({
        grn_id:              id!,
        grn_line_item_id:    r.lineItemId,
        sl_no:               r.sl_no,
        characteristic:      r.characteristic,
        specification:       r.specification || undefined,
        qty_checked:         r.qty_checked ? Number(r.qty_checked) : undefined,
        sample_1:            r.sample_1 || undefined,
        sample_2:            r.sample_2 || undefined,
        sample_3:            r.sample_3 || undefined,
        sample_4:            r.sample_4 || undefined,
        sample_5:            r.sample_5 || undefined,
        conforming_qty:      r.conforming_qty ? Number(r.conforming_qty) : undefined,
        non_conforming_qty:  r.non_conforming_qty ? Number(r.non_conforming_qty) : undefined,
        measuring_instrument: r.measuring_instrument || undefined,
      }));
      await saveGRNQCMeasurements(id!, measurements);

      // Save qualitative stage with nc summaries
      const lines: QualitativeLineData[] = ncSummaries.map((nc) => ({
        id:                   nc.lineItemId,
        qty_inspected:        nc.qty_inspected ?? (nc.conforming_qty + nc.non_conforming_qty),
        inspection_method:    "100_percent" as InspectionMethod,
        conforming_qty:       nc.conforming_qty,
        non_conforming_qty:   nc.non_conforming_qty,
        non_conformance_type: null,
        deviation_description: null,
        disposition:          (nc.disposition || null) as Disposition | null,
        reference_drawing:    null,
        qc_notes:             null,
      }));
      await saveQualityStage(
        id!, lines, s2InspectedBy, s2Remarks || null, s2Date,
        s2ApprovedBy || null, isFinalGrn, finalGrnReason || null
      );
      await logAudit("grn", id!, isFinalGrn ? "GRN Stage 2 Complete — Final GRN" : "GRN Stage 2 Complete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn-stages", id] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["pending-qc-grns"] });
      toast({
        title: "Quality inspection complete",
        description: isFinalGrn ? "GRN is awaiting store confirmation." : "GRN is now closed.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Error saving Stage 2", description: err.message, variant: "destructive" }),
  });

  const storeMutation = useMutation({
    mutationFn: async () => {
      if (!storeConfirmedBy.trim()) throw new Error("Confirmed By is required");
      await storeConfirmGRN(id!, {
        confirmedBy: storeConfirmedBy,
        confirmedAt: storeDateStr,
        location: storeLocation || null,
        notes: storeNotes || null,
      });
      await logAudit("grn", id!, "Store receipt confirmed", { confirmedBy: storeConfirmedBy, location: storeLocation });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grn-stages", id] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      setStoreDialogOpen(false);
      toast({ title: "Store receipt confirmed", description: "GRN is now closed." });
    },
    onError: (err: any) =>
      toast({ title: "Error confirming store receipt", description: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const isDeletedOrCancelled = (grn as any)?.status === 'deleted' || (grn as any)?.status === 'cancelled';

  const handleS1Save = () => {
    if (isDeletedOrCancelled) return;
    if (s1Lines.some((l) => !l.received_qty && l.received_qty !== 0)) {
      toast({ title: "Received quantities required", variant: "destructive" });
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
    if (isDeletedOrCancelled) return;
    if (!s2InspectedBy.trim()) {
      toast({ title: "Inspected By is required", variant: "destructive" });
      return;
    }
    if (!s2Date.trim()) {
      toast({ title: "Inspection Date is required", variant: "destructive" });
      return;
    }
    if (qcRows.filter((r) => r.characteristic.trim()).length === 0) {
      toast({ title: "At least one measurement row required", variant: "destructive" });
      return;
    }
    const ncItemsWithoutDisp = ncSummaries.filter(
      (s) => s.non_conforming_qty > 0 && !s.disposition
    );
    if (ncItemsWithoutDisp.length > 0) {
      toast({
        title: "Disposition required",
        description: "Select disposition for all items with non-conforming quantities.",
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

  const addQCRow = (lineItemId: string) => {
    const itemRows = qcRows.filter((r) => r.lineItemId === lineItemId);
    const receivedQty = editorLineItems.find((l) => l.id === lineItemId)?.received_qty ?? 0;
    const newRow: QCRow = {
      lineItemId,
      sl_no: itemRows.length + 1,
      characteristic: "",
      specification: "",
      qty_checked: receivedQty > 0 ? String(receivedQty) : "",
      sample_1: "", sample_2: "", sample_3: "", sample_4: "", sample_5: "",
      conforming_qty: receivedQty > 0 ? String(receivedQty) : "",
      non_conforming_qty: "0",
      measuring_instrument: "",
    };
    setQcRows((prev) => [...prev, newRow]);
  };

  const changeQCRow = (globalIdx: number, field: keyof QCRow, value: string) => {
    setQcRows((prev) => {
      const next = [...prev];
      const row = { ...next[globalIdx], [field]: value };
      // Auto-derive non_conforming_qty when conforming_qty or qty_checked changes
      if (field === "conforming_qty" || field === "qty_checked") {
        const qty = Number(field === "qty_checked" ? value : row.qty_checked) || 0;
        const conf = Number(field === "conforming_qty" ? value : row.conforming_qty) || 0;
        row.non_conforming_qty = String(Math.max(0, qty - conf));
      }
      next[globalIdx] = row;
      return next;
    });
  };

  const deleteQCRow = (globalIdx: number) => {
    setQcRows((prev) => {
      const lineItemId = prev[globalIdx].lineItemId;
      const filtered = prev.filter((_, i) => i !== globalIdx);
      // Re-number sl_no for this item
      let sl = 1;
      return filtered.map((r) =>
        r.lineItemId === lineItemId ? { ...r, sl_no: sl++ } : r
      );
    });
  };

  const updateNCSummary = (lineItemId: string, field: keyof NCSummary, value: unknown) => {
    setNcSummaries((prev) =>
      prev.map((s) => s.lineItemId === lineItemId ? { ...s, [field]: value } : s)
    );
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-muted-foreground text-sm animate-pulse">Loading GRN…</div>;
  }
  if (!grn) {
    return <div className="p-6 text-muted-foreground">GRN not found.</div>;
  }

  const g         = grn as any;
  const stage     = g.grn_stage ?? "draft";
  const verdict   = g.overall_quality_verdict as string | undefined;
  const s1Done    = ["quality_pending", "quality_done", "closed", "awaiting_store"].includes(stage);
  const s2Visible = ["quality_pending", "quality_done", "closed", "awaiting_store"].includes(stage);
  const s2Done    = ["quality_done", "closed", "awaiting_store"].includes(stage);
  const showStorePanel = stage === "awaiting_store" && !g.store_confirmed;
  const s1Editable = !s1Done || s1Editing;

  const qtyMismatches = s1Lines.filter((l) => l.received_qty > 0 && l.received_qty !== l.po_quantity);
  const ncItemsWithData = ncSummaries.filter((s) => s.non_conforming_qty > 0);

  // For QCMeasurementEditor lineItems
  const editorLineItems = s1Lines.map((l) => ({
    id: l.id,
    item_code: l.item_code,
    description: l.description,
    received_qty: l.received_qty,
    unit: (grn.line_items ?? []).find((li) => li.id === l.id)?.unit ?? "",
  }));

  // For print view - QC measurements from grn (after save) or from qcRows (before save)
  const printMeasurements: GRNQCMeasurement[] = s2Done
    ? (grn.qc_measurements ?? [])
    : qcRows
        .filter((r) => r.characteristic.trim())
        .map((r) => ({
          grn_id: id!,
          grn_line_item_id: r.lineItemId,
          sl_no: r.sl_no,
          characteristic: r.characteristic,
          specification: r.specification || undefined,
          qty_checked: r.qty_checked ? Number(r.qty_checked) : undefined,
          sample_1: r.sample_1 || undefined,
          sample_2: r.sample_2 || undefined,
          sample_3: r.sample_3 || undefined,
          sample_4: r.sample_4 || undefined,
          sample_5: r.sample_5 || undefined,
          conforming_qty: r.conforming_qty ? Number(r.conforming_qty) : undefined,
          non_conforming_qty: r.non_conforming_qty ? Number(r.non_conforming_qty) : undefined,
          measuring_instrument: r.measuring_instrument || undefined,
        }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-16 space-y-6 max-w-5xl mx-auto">

      {/* Print CSS */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #grn-print-view { display: block !important; }
          @page {
            size: A4 portrait;
            margin: 12mm 14mm 12mm 14mm;
          }
          .print-no-break { page-break-inside: avoid; break-inside: avoid; }
          .print-page-break { page-break-before: always; break-before: always; }
          body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #000; }
          table { font-size: 7.5pt; }
          thead { display: table-header-group; }
        }
      `}</style>

      {/* ── Back ── */}
      <button
        onClick={() => navigate("/grn")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 no-print"
      >
        <ChevronLeft className="h-4 w-4" /> Back to GRN Register
      </button>

      {/* ── Deleted / Cancelled banner ── */}
      {((grn as any).status === 'deleted' || (grn as any).status === 'cancelled') && (
        <div className="no-print rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 capitalize">
              This GRN has been {(grn as any).status}
            </p>
            <p className="text-sm text-red-700 mt-0.5">
              This document is read-only and cannot be edited. All stage actions are disabled.
            </p>
          </div>
        </div>
      )}

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
              <Printer className="h-3.5 w-3.5 mr-1" /> Print GRN
            </Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <StageProgress stage={stage} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STAGE 1 — GOODS RECEIPT
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="border-l-4 border-blue-500 bg-blue-50/20 rounded-r-xl overflow-hidden no-print">
        <div className="px-5 py-4 bg-blue-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-blue-900">Stage 1 — Goods Receipt</h2>
            <p className="text-xs text-blue-600 mt-0.5">Inward Team</p>
          </div>
          <div className="flex items-center gap-3">
            {s1Done && !s1Editing && (
              <Button variant="outline" size="sm" className="text-blue-700 border-blue-300 bg-white" onClick={() => setS1Editing(true)}>
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
          {qtyMismatches.length > 0 && s1Editable && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {qtyMismatches.length} item{qtyMismatches.length > 1 ? "s" : ""} with quantity discrepancies
            </div>
          )}

          {s1Editable ? (
            <Stage1Table lines={s1Lines} onChange={updateS1Line} />
          ) : (
            <Stage1ReadOnly lines={s1Lines} />
          )}

          {s1Editable && (
            <>
              {/* Scrap Return section — DC-GRN only */}
              {g.linked_dc_id && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="scrap-returned"
                      checked={scrapReturned}
                      onChange={(e) => setScrapReturned(e.target.checked)}
                      className="h-4 w-4 accent-blue-600 cursor-pointer"
                    />
                    <label htmlFor="scrap-returned" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Has scrap been returned by the vendor?
                    </label>
                  </div>
                  {scrapReturned && (
                    <div className="space-y-2">
                      <div className="overflow-x-auto rounded border border-slate-200">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                              <th className="text-left px-3 py-2 font-semibold">Material Type</th>
                              <th className="text-right px-3 py-2 font-semibold w-24">Qty</th>
                              <th className="text-center px-3 py-2 font-semibold w-28">Unit</th>
                              <th className="text-left px-3 py-2 font-semibold">Notes</th>
                              <th className="px-2 py-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {scrapItems.map((row, idx) => (
                              <tr key={idx} className="bg-white">
                                <td className="px-3 py-1.5">
                                  <input
                                    className="w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 text-xs py-0.5"
                                    value={row.material_type}
                                    placeholder="e.g. Steel offcuts"
                                    onChange={(e) => setScrapItems((prev) => prev.map((r, i) => i === idx ? { ...r, material_type: e.target.value } : r))}
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <input
                                    type="number"
                                    className="w-full text-right bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 text-xs py-0.5"
                                    value={row.quantity}
                                    min={0}
                                    onChange={(e) => setScrapItems((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <select
                                    className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                                    value={row.unit}
                                    onChange={(e) => setScrapItems((prev) => prev.map((r, i) => i === idx ? { ...r, unit: e.target.value } : r))}
                                  >
                                    <option value="">—</option>
                                    {UNITS.map((u) => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-1.5">
                                  <input
                                    className="w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 text-xs py-0.5"
                                    value={row.notes}
                                    placeholder="Optional notes…"
                                    onChange={(e) => setScrapItems((prev) => prev.map((r, i) => i === idx ? { ...r, notes: e.target.value } : r))}
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button type="button" onClick={() => setScrapItems((prev) => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScrapItems((prev) => [...prev, { material_type: "", quantity: "", unit: "", notes: "" }])}
                        className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 font-medium flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add Material
                      </button>
                      <p className="text-xs text-slate-400">Scrap details will be recorded in the Scrap Register.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-blue-100">
                <div>
                  <Label className="text-xs font-medium text-slate-600">Vendor Invoice No.</Label>
                  <Input value={s1InvoiceNumber} onChange={(e) => setS1InvoiceNumber(e.target.value)} className="mt-1 text-sm" placeholder="e.g. INV-001" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Invoice Date</Label>
                  <Input type="date" value={s1InvoiceDate} onChange={(e) => setS1InvoiceDate(e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Verified By <span className="text-red-400">*</span></Label>
                  <Input value={s1VerifiedBy} onChange={(e) => setS1VerifiedBy(e.target.value)} className="mt-1 text-sm" placeholder="Name" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">Verification Date <span className="text-red-400">*</span></Label>
                  <Input type="date" value={s1Date} onChange={(e) => setS1Date(e.target.value)} className="mt-1 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Receipt Notes</Label>
                <Textarea value={s1Notes} onChange={(e) => setS1Notes(e.target.value)} className="mt-1 text-sm" rows={2} placeholder="Overall notes for this delivery (optional)…" />
              </div>
              <Button onClick={handleS1Save} disabled={s1Mutation.isPending || isDeletedOrCancelled} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {s1Mutation.isPending ? "Saving…" : "Save — Stage 1 Complete"}
              </Button>
            </>
          )}

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
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          STAGE 2 — QUALITY INSPECTION
      ═══════════════════════════════════════════════════════════════════ */}
      {s2Visible && (
        <div className="border-l-4 border-purple-500 bg-purple-50/20 rounded-r-xl overflow-hidden no-print">
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

          <div className="px-5 py-4 space-y-5">
            {!s2Done ? (
              <>
                {/* QC measurement tables per item */}
                <QCMeasurementEditor
                  lineItems={editorLineItems}
                  qcRows={qcRows}
                  onAddRow={addQCRow}
                  onChangeRow={changeQCRow}
                  onDeleteRow={deleteQCRow}
                />

                {/* NC Summary — only for items with non_conforming rows */}
                {ncItemsWithData.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Non-Conformance Summary</p>
                    {ncItemsWithData.map((nc) => {
                      const item = s1Lines.find((l) => l.id === nc.lineItemId);
                      const unit = (grn.line_items ?? []).find((li) => li.id === nc.lineItemId)?.unit ?? "";
                      if (!item) return null;
                      return (
                        <div key={nc.lineItemId} className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-mono text-slate-500">{item.item_code || "—"}</span>
                          <span className="font-medium text-slate-700">{item.description}</span>
                          <span className="text-green-700">Conforming: <strong>{nc.conforming_qty} {unit}</strong></span>
                          <span className="text-amber-700">Non-Conforming: <strong>{nc.non_conforming_qty} {unit}</strong></span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-500">Disposition:</span>
                            <select
                              className="border border-amber-300 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={nc.disposition}
                              onChange={(e) => updateNCSummary(nc.lineItemId, "disposition", e.target.value as Disposition)}
                            >
                              <option value="">Select…</option>
                              {DISPOSITIONS.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                            {nc.disposition === "rework_our_scope" && (
                              <span className="text-blue-600 text-[10px] italic">Note: Raise an internal work order or job card to track this rework.</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-slate-500">Conf. Qty:</Label>
                            <input
                              type="number"
                              className="w-16 border border-slate-200 rounded px-2 py-0.5 text-xs text-right"
                              value={nc.conforming_qty}
                              min={0}
                              onChange={(e) => updateNCSummary(nc.lineItemId, "conforming_qty", Number(e.target.value))}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-slate-500">NC Qty:</Label>
                            <input
                              type="number"
                              className="w-16 border border-amber-300 bg-amber-50 rounded px-2 py-0.5 text-xs text-right"
                              value={nc.non_conforming_qty}
                              min={0}
                              onChange={(e) => updateNCSummary(nc.lineItemId, "non_conforming_qty", Number(e.target.value))}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Below-table fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-purple-100">
                  <div className="md:col-span-2">
                    <Label className="text-xs font-medium text-slate-600">Overall Quality Remarks</Label>
                    <Textarea
                      value={s2Remarks}
                      onChange={(e) => setS2Remarks(e.target.value)}
                      className="mt-1 text-sm"
                      rows={2}
                      placeholder="Overall QC assessment, observations, corrective actions requested…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600">
                      Inspected By <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={s2InspectedBy}
                      onChange={(e) => setS2InspectedBy(e.target.value)}
                      className="mt-1 text-sm"
                      placeholder="Full name of QC inspector"
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
                    <Label className="text-xs font-medium text-slate-600">Approved By</Label>
                    <Input
                      value={s2ApprovedBy}
                      onChange={(e) => setS2ApprovedBy(e.target.value)}
                      className="mt-1 text-sm"
                      placeholder="Name of approving manager"
                    />
                  </div>
                </div>

                {/* DC deduction alert — job work NC items */}
                {g.linked_dc_id && ncItemsWithData.some((s) => s.non_conforming_qty > 0 && s.disposition !== 'return_to_vendor') && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2 text-xs">
                    <p className="font-semibold text-amber-800">⚠ Deduction Alert — {ncItemsWithData.filter((s) => s.non_conforming_qty > 0).reduce((t, s) => t + s.non_conforming_qty, 0)} non-conforming unit(s) found on job work return.</p>
                    {ncItemsWithData.filter((s) => s.non_conforming_qty > 0 && s.disposition !== 'return_to_vendor').map((nc) => {
                      const item = s1Lines.find((l) => l.id === nc.lineItemId);
                      return item ? (
                        <div key={nc.lineItemId} className="text-amber-700">
                          {item.description} × {nc.non_conforming_qty} unit(s) — Amount: To be determined
                        </div>
                      ) : null;
                    })}
                    <p className="text-amber-600 italic">Coordinate with accounts to reflect this deduction against the vendor.</p>
                  </div>
                )}

                {/* Final GRN checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is-final-grn"
                    checked={isFinalGrn}
                    onChange={(e) => {
                      if (!e.target.checked && g.is_final_grn) {
                        setShowUntickDialog(true);
                      } else {
                        setIsFinalGrn(e.target.checked);
                      }
                    }}
                    className="h-4 w-4 accent-purple-600 cursor-pointer"
                  />
                  <label htmlFor="is-final-grn" className="text-xs font-medium text-slate-700 cursor-pointer">
                    Mark as Final GRN — goods will move to store after QC
                  </label>
                </div>

                <Button
                  onClick={handleS2Save}
                  disabled={s2Mutation.isPending || isDeletedOrCancelled}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {s2Mutation.isPending ? "Saving…" : "Save — Stage 2 Complete"}
                </Button>

                {/* Untick protection dialog */}
                <Dialog open={showUntickDialog} onOpenChange={setShowUntickDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Remove Final GRN Status?</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <p className="text-sm text-slate-600">Please provide a reason for removing the Final GRN flag:</p>
                      <Input
                        value={untickReason}
                        onChange={(e) => setUntickReason(e.target.value)}
                        placeholder="Reason (e.g. partial delivery expected)"
                        className="text-sm"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowUntickDialog(false)}>Cancel</Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          setIsFinalGrn(false);
                          setFinalGrnReason(untickReason);
                          await logAudit("grn", id!, "Final GRN status removed", { reason: untickReason });
                          setUntickReason("");
                          setShowUntickDialog(false);
                        }}
                      >
                        Confirm
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                {/* Read-only QC measurements */}
                <QCMeasurementReadOnly
                  lineItems={editorLineItems}
                  qcRows={grn.qc_measurements ?? []}
                />

                {/* Verdict + summary */}
                {verdict && (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quality Verdict</span>
                      <VerdictBadge verdict={verdict} />
                    </div>
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

      {/* ── NC Summary Panel (after Stage 2 done) ── */}
      {s2Done && ncItemsWithData.length > 0 && (
        <div className="border border-amber-300 bg-amber-50/30 rounded-xl overflow-hidden no-print">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <h3 className="text-sm font-bold text-amber-900">Non-Conformance Report</h3>
          </div>
          <div className="px-4 py-3 space-y-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-amber-800 border-b border-amber-200">
                  <th className="text-left px-2 py-2 font-semibold">Item Code</th>
                  <th className="text-left px-2 py-2 font-semibold">Description</th>
                  <th className="text-right px-2 py-2 font-semibold">Conforming</th>
                  <th className="text-right px-2 py-2 font-semibold">NC Qty</th>
                  <th className="text-center px-2 py-2 font-semibold">Disposition</th>
                </tr>
              </thead>
              <tbody>
                {ncItemsWithData.map((nc, idx) => {
                  const item = s1Lines.find((l) => l.id === nc.lineItemId);
                  return (
                    <tr key={idx} className="border-b border-amber-100">
                      <td className="px-2 py-1.5 font-mono text-slate-500">{item?.item_code || "—"}</td>
                      <td className="px-2 py-1.5 font-medium text-slate-800">{item?.description || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-green-700 font-semibold">{nc.conforming_qty}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-amber-700 font-semibold">{nc.non_conforming_qty}</td>
                      <td className="px-2 py-1.5 text-center capitalize">{(nc.disposition || "—").replace(/_/g, " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ncItemsWithData.some((nc) => nc.disposition === "return_to_vendor") && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-800 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                RETURN TO VENDOR — Vendor must collect or arrange replacement
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Store Confirmation Panel ── */}
      {showStorePanel && (
        <div className="border border-amber-200 bg-amber-50/30 rounded-xl overflow-hidden no-print">
          <div className="px-5 py-4 flex items-start gap-3">
            <PackageCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900">Awaiting Store Receipt Confirmation</h3>
              <p className="text-xs text-amber-700 mt-0.5">QC has cleared these items. Inward team must confirm physical receipt into store.</p>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={() => setStoreDialogOpen(true)}
            >
              Confirm Store Receipt
            </Button>
          </div>
        </div>
      )}

      {/* Store confirmation dialog */}
      <Dialog open={storeDialogOpen} onOpenChange={setStoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Store Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {ncSummaries.filter((s) => s.conforming_qty > 0).map((nc) => {
              const item = s1Lines.find((l) => l.id === nc.lineItemId);
              if (!item) return null;
              const unit = (grn.line_items ?? []).find((li) => li.id === nc.lineItemId)?.unit ?? "";
              return (
                <div key={nc.lineItemId} className="text-xs text-slate-600 flex justify-between">
                  <span>{item.description}</span>
                  <span className="font-semibold">{nc.conforming_qty} {unit}</span>
                </div>
              );
            })}
            <div>
              <Label className="text-xs font-medium text-slate-600">Received By (Inward to Store) <span className="text-red-400">*</span></Label>
              <Input value={storeConfirmedBy} onChange={(e) => setStoreConfirmedBy(e.target.value)} className="mt-1 text-sm" placeholder="Full name" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Date Received in Store <span className="text-red-400">*</span></Label>
              <Input type="date" value={storeDateStr} onChange={(e) => setStoreDateStr(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Physical Location / Rack</Label>
              <Input value={storeLocation} onChange={(e) => setStoreLocation(e.target.value)} className="mt-1 text-sm" placeholder="e.g. Rack A3, Bin 7" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Notes</Label>
              <Textarea value={storeNotes} onChange={(e) => setStoreNotes(e.target.value)} className="mt-1 text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={storeMutation.isPending}
              onClick={() => storeMutation.mutate()}
            >
              {storeMutation.isPending ? "Saving…" : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit trail ── */}
      <div className="no-print">
        <AuditTimeline documentId={id!} />
      </div>

      {/* ── Print View ── */}
      <GRNPrintView
        grn={g}
        s1Lines={s1Lines}
        qcMeasurements={printMeasurements}
        ncSummaries={ncSummaries}
        s2InspectedBy={s2InspectedBy}
        s2ApprovedBy={s2ApprovedBy}
        s2Date={s2Date}
        s2Remarks={s2Remarks}
        verdict={verdict}
      />
    </div>
  );
}
