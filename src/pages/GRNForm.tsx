import React, { useState, useEffect, useMemo, Component, type ReactNode } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronUp, AlertTriangle, PackageCheck, ChevronLeft,
  Info, Plus, CheckCircle2, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  getNextGRNNumber,
  fetchOpenPOs,
  fetchPOLineItemsForGRN,
  recordGRNAndUpdatePO,
  fetchGRN,
  updateGrnLineStage1,
  updateGrnLineStage2,
  type GRNLineItem,
  type Stage1Data,
  type Stage2Data,
} from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

type GrnType = 'po_grn' | 'dc_grn';

interface LineItemState extends GRNLineItem {
  expanded?: boolean;
  // Stage 1 local state
  s1_received_now: number;
  s1_identity_match: boolean | null;
  s1_mismatch_remarks: string;
  s1_checked_by: string;
  s1_verified_by: string;
  s1_date: string;
  s1_complete: boolean;
  s1_identity_matched_qty: number;
  s1_identity_not_matched_qty: number;
  s1_admin_override: boolean;
  // Jig return check (Phase 15)
  jigsReturnChecked?: string[];
  // Stage 2 local state
  s2_accepted_qty: number;
  s2_rejected_qty: number;
  s2_rejection_reason: string;
  s2_disposal_method: 'return_to_vendor' | 'rework' | 'scrap' | 'use_as_is' | '';
  s2_inspected_by: string;
  s2_approved_by: string;
  s2_date: string;
  s2_complete: boolean;
  s2_validation_error: boolean;
}

interface Props {
  defaultGrnType?: GrnType;
}

// ── Helper to build LineItemState from raw GRN line ───────────────────────────

function toLineState(item: GRNLineItem, idx: number): LineItemState {
  const a = item as any;
  return {
    ...item,
    serial_number: idx + 1,
    expanded: false,
    s1_received_now: a.received_now ?? item.receiving_now ?? 0,
    s1_identity_match: a.item_identity_match ?? null,
    s1_mismatch_remarks: a.identity_mismatch_remarks ?? '',
    s1_checked_by: a.stage1_checked_by ?? '',
    s1_verified_by: a.stage1_verified_by ?? '',
    s1_date: a.stage1_date ?? '',
    s1_complete: a.stage1_complete ?? false,
    s1_identity_matched_qty: a.identity_matched_qty != null
      ? a.identity_matched_qty
      : (a.item_identity_match === false ? 0 : (a.received_now ?? item.receiving_now ?? 0)),
    s1_identity_not_matched_qty: a.identity_not_matched_qty != null
      ? a.identity_not_matched_qty
      : (a.item_identity_match === false ? (a.received_now ?? item.receiving_now ?? 0) : 0),
    s1_admin_override: false,
    s2_accepted_qty: a.accepted_qty ?? item.accepted_quantity ?? 0,
    s2_rejected_qty: a.rejected_qty ?? item.rejected_quantity ?? 0,
    s2_rejection_reason: a.rejection_reason ?? '',
    s2_disposal_method: (a.disposal_method ?? '') as LineItemState['s2_disposal_method'],
    s2_inspected_by: a.stage2_inspected_by ?? '',
    s2_approved_by: a.stage2_approved_by ?? '',
    s2_date: a.stage2_date ?? '',
    s2_complete: a.stage2_complete ?? false,
    s2_validation_error: false,
  };
}

// ── GrnLineItemCard ────────────────────────────────────────────────────────────

function GrnLineItemCard({
  item,
  index,
  isExistingGrn,
  isAdmin,
  onChange,
  onSaveStage1,
  onSaveStage2,
}: {
  item: LineItemState;
  index: number;
  isExistingGrn: boolean;
  isAdmin: boolean;
  onChange: (index: number, update: Partial<LineItemState>) => void;
  onSaveStage1: (index: number) => void;
  onSaveStage2: (index: number) => void;
}) {
  const orderedQty = (item as any).ordered_qty ?? item.po_quantity ?? 0;
  const prevReceived = (item as any).previously_received_qty ?? item.previously_received ?? 0;
  const pendingQty = Math.max(0, orderedQty - prevReceived);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Collapsed header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onChange(index, { expanded: !item.expanded })}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-5">{index + 1}</span>
          <div>
            <p className="text-sm font-medium">{item.description || "—"}</p>
            {item.drawing_number && (
              <p className="text-xs text-muted-foreground font-mono">{item.drawing_number}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Ordered</p>
            <p className="text-sm font-mono font-medium">{orderedQty} {item.unit}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-sm font-mono font-medium text-amber-600">{pendingQty} {item.unit}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-sm font-mono font-medium text-primary">{item.s1_received_now || 0} {item.unit}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {item.s1_complete && (
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> S1
              </span>
            )}
            {item.s2_complete && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> S2
              </span>
            )}
            {item.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {item.expanded && (
        <div className="p-4 space-y-5">
          {/* Stage 1 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</div>
              <h4 className="text-sm font-semibold text-slate-700">Quantitative / Inward Check</h4>
              {item.s1_complete && <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm font-medium">{item.description}</p>
              </div>
              {item.drawing_number && (
                <div>
                  <p className="text-xs text-muted-foreground">Drawing No</p>
                  <p className="text-sm font-mono">{item.drawing_number}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Ordered Qty</p>
                <p className="text-sm font-mono font-medium">{orderedQty} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prev Received</p>
                <p className="text-sm font-mono font-medium">{prevReceived} {item.unit}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Qty</p>
                <p className="text-sm font-mono font-medium text-amber-600">{pendingQty} {item.unit}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Received Now ({item.unit}) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={item.s1_received_now || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value));
                    onChange(index, {
                      s1_received_now: v,
                      s1_identity_matched_qty: v,
                      s1_identity_not_matched_qty: 0,
                      s2_accepted_qty: v,
                      s2_rejected_qty: 0,
                    });
                  }}
                  className="h-8 text-sm font-mono mt-1"
                  disabled={item.s1_complete}
                />
                {/* FIX 4 — inline alert when received exceeds pending */}
                {item.s1_received_now > 0 && pendingQty > 0 && item.s1_received_now > pendingQty && !item.s1_admin_override && (
                  <div className="mt-1.5 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 space-y-1.5">
                    <p>Received quantity ({item.s1_received_now} {item.unit}) exceeds the pending quantity ({pendingQty} {item.unit}). Please contact the Purchase Team to amend the PO/DC before proceeding.</p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onChange(index, { s1_admin_override: true })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-400 text-red-700 font-medium hover:bg-red-100 transition-colors"
                      >
                        Admin Override
                      </button>
                    )}
                  </div>
                )}
                {item.s1_admin_override && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">⚠ Admin override active — quantity will be saved as entered.</p>
                )}
              </div>
            </div>

            {/* FIX 5 — Identity match bifurcation */}
            {item.s1_received_now > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Identity Check</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Received Qty</p>
                    <p className="text-sm font-mono font-medium">{item.s1_received_now} {item.unit}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Identity Matched ({item.unit})</Label>
                    <Input
                      type="number"
                      min={0}
                      max={item.s1_received_now}
                      value={item.s1_identity_matched_qty === 0 ? "0" : item.s1_identity_matched_qty || ""}
                      onChange={(e) => {
                        const v = Math.min(Math.max(0, Number(e.target.value)), item.s1_received_now);
                        onChange(index, {
                          s1_identity_matched_qty: v,
                          s1_identity_not_matched_qty: Math.max(0, item.s1_received_now - v),
                          s2_accepted_qty: Math.min(item.s2_accepted_qty, v),
                          s2_rejected_qty: Math.max(0, v - Math.min(item.s2_accepted_qty, v)),
                        });
                      }}
                      className="h-8 text-sm font-mono mt-1"
                      disabled={item.s1_complete}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Not Matched ({item.unit})</Label>
                    <Input
                      type="number"
                      readOnly
                      value={item.s1_identity_not_matched_qty || 0}
                      className={`h-8 text-sm font-mono mt-1 bg-muted ${item.s1_identity_not_matched_qty > 0 ? "text-amber-700 border-amber-300" : ""}`}
                    />
                  </div>
                </div>
                {item.s1_identity_not_matched_qty > 0 && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    {item.s1_identity_not_matched_qty} {item.unit} do not match order description. These units will NOT proceed to quality inspection. Purchase Team to be contacted.
                  </div>
                )}
                {item.s1_identity_not_matched_qty > 0 && (
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Non-Match Remarks</Label>
                    <Input
                      placeholder="Describe the mismatch..."
                      value={item.s1_mismatch_remarks}
                      onChange={(e) => onChange(index, { s1_mismatch_remarks: e.target.value })}
                      className="text-sm mt-1"
                      disabled={item.s1_complete}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-700">Checked By <span className="text-red-500">*</span></Label>
                <Input
                  value={item.s1_checked_by}
                  onChange={(e) => onChange(index, { s1_checked_by: e.target.value })}
                  className={`h-8 text-sm mt-1 ${!item.s1_checked_by && (item as any).s1_validation_error ? "border-red-400" : ""}`}
                  placeholder="Name"
                  disabled={item.s1_complete}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Verified By</Label>
                <Input
                  value={item.s1_verified_by}
                  onChange={(e) => onChange(index, { s1_verified_by: e.target.value })}
                  className="h-8 text-sm mt-1"
                  placeholder="Name (optional)"
                  disabled={item.s1_complete}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={item.s1_date}
                  onChange={(e) => onChange(index, { s1_date: e.target.value })}
                  className={`h-8 text-sm mt-1 ${!item.s1_date && (item as any).s1_validation_error ? "border-red-400" : ""}`}
                  disabled={item.s1_complete}
                />
              </div>
            </div>

            {/* Phase 15: Jig Return Check */}
            {(item as any).jigs_sent && ((item as any).jigs_sent as any[]).length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Jig Return Check
                </p>
                {((item as any).jigs_sent as any[]).map((jig: any) => (
                  <label key={jig.id} className="flex items-center gap-2 text-xs cursor-pointer mb-1">
                    <input
                      type="checkbox"
                      checked={(item.jigsReturnChecked ?? []).includes(jig.id)}
                      onChange={(e) => {
                        const current = item.jigsReturnChecked ?? [];
                        const updated = e.target.checked
                          ? [...current.filter(id => id !== jig.id), jig.id]
                          : current.filter(id => id !== jig.id);
                        onChange(index, { jigsReturnChecked: updated });
                      }}
                      disabled={item.s1_complete}
                    />
                    <span>{jig.jig_number} — received back</span>
                  </label>
                ))}
                {(item.jigsReturnChecked?.length ?? 0) < ((item as any).jigs_sent as any[]).length && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">Tick all jigs before completing Stage 1</p>
                )}
              </div>
            )}

            {!item.s1_complete && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => onSaveStage1(index)}
                disabled={
                  item.s1_received_now <= 0 ||
                  (item.s1_received_now > pendingQty && pendingQty > 0 && !item.s1_admin_override) ||
                  (
                    (item as any).jigs_sent &&
                    ((item as any).jigs_sent as any[]).length > 0 &&
                    (item.jigsReturnChecked?.length ?? 0) < ((item as any).jigs_sent as any[]).length
                  )
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Save Receipt
              </Button>
            )}
          </div>

          {/* Stage 2 */}
          {/* FIX 5 — block stage 2 if all received units failed identity check */}
          {item.s1_complete && item.s1_received_now > 0 && item.s1_identity_matched_qty === 0 && !item.s1_admin_override ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">2</div>
                <h4 className="text-sm font-semibold text-red-800">Stage 2 Blocked</h4>
              </div>
              <p className="text-sm text-red-700">All received units failed identity check. Stage 2 is blocked. Admin override required to proceed.</p>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => onChange(index, { s1_admin_override: true })}
                >
                  Admin Override — Allow Stage 2
                </Button>
              )}
            </div>
          ) : (
          <div className={cn("space-y-4 rounded-lg p-4", !item.s1_complete ? "bg-slate-50 opacity-50 pointer-events-none" : "bg-slate-50")}>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">2</div>
              <h4 className="text-sm font-semibold text-slate-700">Qualitative / QC Inspection</h4>
              {!item.s1_complete && <span className="text-xs text-muted-foreground italic">(Complete Stage 1 first)</span>}
              {item.s2_complete && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>}
              {item.s1_complete && item.s1_identity_not_matched_qty > 0 && item.s1_identity_matched_qty > 0 && (
                <span className="text-xs text-amber-700 font-medium">
                  Partially matched — {item.s1_identity_matched_qty} of {item.s1_received_now} {item.unit} proceeding to QC
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">For QC (Identity Matched)</p>
                <p className="text-sm font-mono font-medium">{item.s1_identity_matched_qty || item.s1_received_now || 0} {item.unit}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Accepted Qty ({item.unit})</Label>
                <Input
                  type="number"
                  min={0}
                  max={item.s1_identity_matched_qty || item.s1_received_now}
                  value={item.s2_accepted_qty || ""}
                  onChange={(e) => {
                    const maxQty = item.s1_identity_matched_qty || item.s1_received_now;
                    const v = Math.min(Math.max(0, Number(e.target.value)), maxQty);
                    onChange(index, {
                      s2_accepted_qty: v,
                      s2_rejected_qty: Math.max(0, maxQty - v),
                    });
                  }}
                  className="h-8 text-sm font-mono mt-1"
                  disabled={item.s2_complete}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Non-Conforming Qty ({item.unit})</Label>
                <Input
                  type="number"
                  readOnly
                  value={item.s2_rejected_qty || 0}
                  className="h-8 text-sm font-mono mt-1 bg-muted"
                />
              </div>
            </div>

            {item.s2_rejected_qty > 0 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-slate-700">Non-Conformance Reason</Label>
                  <Input
                    value={item.s2_rejection_reason}
                    onChange={(e) => onChange(index, { s2_rejection_reason: e.target.value })}
                    className="text-sm mt-1"
                    placeholder="Describe the reason for non-conformance"
                    disabled={item.s2_complete}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700">Disposal Method</Label>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {[
                      { value: 'return_to_vendor', label: 'Return to Vendor' },
                      { value: 'rework', label: 'Rework (Our Scope)' },
                      { value: 'scrap', label: 'Scrap' },
                      { value: 'use_as_is', label: 'Use As-Is (Conditional)' },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={`disposal_${index}`}
                          value={opt.value}
                          checked={item.s2_disposal_method === opt.value}
                          onChange={() => onChange(index, { s2_disposal_method: opt.value as LineItemState['s2_disposal_method'] })}
                          disabled={item.s2_complete}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* FIX 3 — all three Stage 2 fields required */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-700">Inspected By <span className="text-red-500">*</span></Label>
                <Input
                  value={item.s2_inspected_by}
                  onChange={(e) => onChange(index, { s2_inspected_by: e.target.value })}
                  className={`h-8 text-sm mt-1 ${item.s2_validation_error && !item.s2_inspected_by ? "border-red-400" : ""}`}
                  placeholder="Name"
                  disabled={item.s2_complete}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Approved By <span className="text-red-500">*</span></Label>
                <Input
                  value={item.s2_approved_by}
                  onChange={(e) => onChange(index, { s2_approved_by: e.target.value })}
                  className={`h-8 text-sm mt-1 ${item.s2_validation_error && !item.s2_approved_by ? "border-red-400" : ""}`}
                  placeholder="Name"
                  disabled={item.s2_complete}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700">Inspection Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={item.s2_date}
                  onChange={(e) => onChange(index, { s2_date: e.target.value })}
                  className={`h-8 text-sm mt-1 ${item.s2_validation_error && !item.s2_date ? "border-red-400" : ""}`}
                  disabled={item.s2_complete}
                />
              </div>
            </div>

            {item.s1_complete && !item.s2_complete && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
                onClick={() => onSaveStage2(index)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Save Inspection
              </Button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Error boundary ─────────────────────────────────────────────────────────────

class GrnFormErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="font-medium text-destructive">
            Something went wrong loading the GRN form.
          </p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <button
              className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main GRNForm Component ─────────────────────────────────────────────────────

function GRNFormInner({ defaultGrnType }: Props) {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const preselectedPOId = searchParams.get("po");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const preselectedDCId = searchParams.get("dc_id");
  const isExistingGrn = Boolean(editId);

  // Header state
  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState<Date>(new Date());
  const [grnType, setGrnType] = useState<GrnType>(defaultGrnType ?? (preselectedDCId ? 'dc_grn' : 'po_grn'));

  // PO-GRN
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poOpen, setPOOpen] = useState(false);
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [vendorName, setVendorName] = useState("");

  // DC-GRN
  const [selectedDC, setSelectedDC] = useState<any>(null);
  const [dcOpen, setDcOpen] = useState(false);

  // Common transport
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [notes, setNotes] = useState("");

  // Legacy fields (kept for backward compat)
  const [lrReference, setLrReference] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [transporterName, setTransporterName] = useState("");

  // Line items
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // Success dialog
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedGRNId, setSavedGRNId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: userRoleData } = useQuery({
    queryKey: ["current-user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = (userRoleData as any)?.role === 'admin';

  const { data: openPOs } = useQuery({
    queryKey: ["open-pos-for-grn"],
    queryFn: fetchOpenPOs,
    enabled: grnType === 'po_grn',
  });

  const { data: returnableDCs } = useQuery({
    queryKey: ["returnable-dcs-for-grn"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { getCompanyId } = await import("@/lib/auth-helpers");
      const companyId = await getCompanyId();
      const { data, error } = await (supabase as any)
        .from("delivery_challans")
        .select("id, dc_number, dc_date, party_id, party_name, dc_type, status, return_due_date")
        .eq("company_id", companyId)
        .in("dc_type", ["returnable", "job_work_143", "job_work_out", "job_work"])
        .in("status", ["issued", "partially_returned"])
        .order("dc_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: grnType === 'dc_grn' || !!preselectedDCId,
  });

  const { data: nextNumber } = useQuery({
    queryKey: ["next-grn-number"],
    queryFn: getNextGRNNumber,
    enabled: !isExistingGrn,
  });

  // Load existing GRN
  const { data: existingGrn } = useQuery({
    queryKey: ["grn", editId],
    queryFn: () => fetchGRN(editId!),
    enabled: isExistingGrn,
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (nextNumber && !isExistingGrn) setGrnNumber(nextNumber);
  }, [nextNumber, isExistingGrn]);

  useEffect(() => {
    if (existingGrn) {
      const g = existingGrn as any;
      setGrnNumber(existingGrn.grn_number);
      setGrnDate(new Date(existingGrn.grn_date));
      setGrnType((g.grn_type ?? 'po_grn') as GrnType);
      setVehicleNumber(existingGrn.vehicle_number ?? '');
      setDriverName(g.driver_name ?? '');
      setDriverContact(g.driver_contact ?? '');
      setNotes(existingGrn.notes ?? '');
      setVendorInvoiceNumber(existingGrn.vendor_invoice_number ?? '');
      setLrReference(existingGrn.lr_reference ?? '');
      setReceivedBy(existingGrn.received_by ?? '');
      setTransporterName(existingGrn.transporter_name ?? '');
      if (existingGrn.line_items) {
        setLineItems(existingGrn.line_items.map((li, idx) => toLineState(li, idx)));
      }
    }
  }, [existingGrn]);

  useEffect(() => {
    if (preselectedPOId && openPOs && !isExistingGrn) {
      const po = openPOs.find((p: any) => p.id === preselectedPOId);
      if (po) handlePOSelect(po);
    }
  }, [preselectedPOId, openPOs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (preselectedDCId && returnableDCs && !isExistingGrn && !selectedDC) {
      const dc = returnableDCs.find((d: any) => d.id === preselectedDCId);
      if (dc) handleDCSelect(dc);
    }
  }, [preselectedDCId, returnableDCs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePOSelect = async (po: any) => {
    setSelectedPO(po);
    setPOOpen(false);
    setVendorName(po.vendor_name ?? '');
    const poItems = await fetchPOLineItemsForGRN(po.id);
    const items: LineItemState[] = poItems
      .filter((item: any) => {
        const pending = (item.quantity || 0) - (item.received_quantity || 0);
        return pending > 0;
      })
      .map((item: any, idx: number) => {
        const prevReceived = item.received_quantity || 0;
        const pending = (item.quantity || 0) - prevReceived;
        const base: GRNLineItem = {
          serial_number: idx + 1,
          po_line_item_id: item.id,
          description: item.description,
          drawing_number: item.drawing_number || "",
          unit: item.unit || "NOS",
          po_quantity: item.quantity || 0,
          previously_received: prevReceived,
          pending_quantity: pending,
          receiving_now: 0,
          accepted_quantity: 0,
          rejected_quantity: 0,
          rejection_reason: "",
          remarks: "",
          rejection_action: null,
        };
        return toLineState(base, idx);
      });
    setLineItems(items);
  };

  const handleDCSelect = async (dc: any) => {
    setSelectedDC(dc);
    setDcOpen(false);
    setVendorName(dc.party_name ?? '');
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { getCompanyId } = await import("@/lib/auth-helpers");
      const companyId = await getCompanyId();
      const { data: dcItems } = await (supabase as any)
        .from("dc_line_items")
        .select("*")
        .eq("dc_id", dc.id)
        .order("serial_number", { ascending: true });
      const items: LineItemState[] = (dcItems ?? []).map((item: any, idx: number) => {
        const base: GRNLineItem = {
          serial_number: idx + 1,
          description: item.description,
          drawing_number: item.drawing_number || "",
          unit: item.unit || "NOS",
          po_quantity: item.quantity || 0,
          previously_received: 0,
          pending_quantity: item.quantity || 0,
          receiving_now: 0,
          accepted_quantity: 0,
          rejected_quantity: 0,
        };
        const state = toLineState(base, idx);
        (state as any).ordered_qty = item.quantity || 0;
        return state;
      });
      setLineItems(items);
    } catch (err: any) {
      toast({ title: "Error loading DC items", description: err.message, variant: "destructive" });
    }
  };

  const addManualItem = () => {
    const base: GRNLineItem = {
      serial_number: lineItems.length + 1,
      description: "",
      drawing_number: "",
      unit: "NOS",
      po_quantity: 0,
      previously_received: 0,
      pending_quantity: 0,
      receiving_now: 0,
      accepted_quantity: 0,
      rejected_quantity: 0,
    };
    setLineItems((prev) => [...prev, toLineState(base, prev.length)]);
  };

  const updateLineItem = (index: number, update: Partial<LineItemState>) => {
    setLineItems((items) => {
      const updated = [...items];
      updated[index] = { ...updated[index], ...update };
      return updated;
    });
  };

  // Stage 1 save
  const stage1Mutation = useMutation({
    mutationFn: async (index: number) => {
      const item = lineItems[index];
      if (!item.id) return; // not yet saved to DB
      const data: Stage1Data = {
        received_now: item.s1_received_now,
        item_identity_match: item.s1_received_now > 0 && item.s1_identity_matched_qty >= item.s1_received_now,
        identity_mismatch_remarks: item.s1_mismatch_remarks || null,
        stage1_checked_by: item.s1_checked_by || null,
        stage1_verified_by: item.s1_verified_by || null,
        stage1_date: item.s1_date || null,
        stage1_complete: true,
        identity_matched_qty: item.s1_identity_matched_qty,
        identity_not_matched_qty: item.s1_identity_not_matched_qty,
      };
      await updateGrnLineStage1(item.id, data);
      return index;
    },
    onSuccess: (index) => {
      if (index === undefined) return;
      updateLineItem(index, { s1_complete: true });
      const item = lineItems[index];
      const orderedQty = (item as any).ordered_qty ?? item.po_quantity ?? 0;
      const prevReceived = (item as any).previously_received_qty ?? item.previously_received ?? 0;
      const totalReceived = prevReceived + item.s1_received_now;
      if (orderedQty > 0 && totalReceived < orderedQty) {
        toast({ title: "Partial receipt saved", description: `${item.s1_received_now} of ${orderedQty} received. ${orderedQty - totalReceived} units still pending.` });
      } else {
        toast({ title: "Receipt saved", description: "Quantitative check recorded." });
      }
    },
    onError: (err: any) => {
      // If DB columns don't exist yet, just update local state
      toast({ title: "Stage 1 saved locally", description: "Changes saved in form." });
    },
  });

  const handleSaveStage1 = (index: number) => {
    const item = lineItems[index];
    // FIX 2 — only Checked By and Date are required; Verified By is optional
    if (!item.s1_checked_by.trim() || !item.s1_date.trim()) {
      updateLineItem(index, { ...(item as any), s1_validation_error: true } as any);
      toast({
        title: "Required fields missing",
        description: "Checked By and Check Date are required.",
        variant: "destructive",
      });
      return;
    }
    // FIX 4 — admin override audit log
    if (item.s1_admin_override && editId) {
      logAudit("grn", editId, "admin_override_qty_exceeded").catch(console.error);
    }
    updateLineItem(index, { s1_complete: true });
    const orderedQty = (item as any).ordered_qty ?? item.po_quantity ?? 0;
    const prevReceived = (item as any).previously_received_qty ?? item.previously_received ?? 0;
    const totalReceived = prevReceived + item.s1_received_now;
    if (lineItems[index].id) {
      stage1Mutation.mutate(index);
    } else if (orderedQty > 0) {
      if (totalReceived >= orderedQty) {
        toast({ title: "Receipt saved", description: "All ordered quantity received." });
      } else {
        const remaining = orderedQty - totalReceived;
        toast({ title: "Partial receipt saved", description: `${item.s1_received_now} of ${orderedQty} received. ${remaining} units still pending.` });
      }
    } else {
      toast({ title: "Receipt saved" });
    }
  };

  // Stage 2 save
  const stage2Mutation = useMutation({
    mutationFn: async (index: number) => {
      const item = lineItems[index];
      if (!item.id) return;
      const data: Stage2Data = {
        accepted_qty: item.s2_accepted_qty,
        rejected_qty: item.s2_rejected_qty,
        rejection_reason: item.s2_rejection_reason || null,
        disposal_method: item.s2_disposal_method as any || null,
        stage2_inspected_by: item.s2_inspected_by || null,
        stage2_approved_by: item.s2_approved_by || null,
        stage2_date: item.s2_date || null,
        stage2_complete: true,
      };
      await updateGrnLineStage2(item.id, data);
      return index;
    },
    onSuccess: (index) => {
      if (index === undefined) return;
      updateLineItem(index, { s2_complete: true });
      toast({ title: "Stage 2 saved", description: "QC inspection recorded." });
      queryClient.invalidateQueries({ queryKey: ["grn", editId] });
    },
    onError: () => {
      toast({ title: "Stage 2 saved locally", description: "Changes saved in form." });
    },
  });

  const handleSaveStage2 = (index: number) => {
    const item = lineItems[index];
    // FIX 3 — all three Stage 2 fields are required
    if (!item.s2_inspected_by.trim() || !item.s2_approved_by.trim() || !item.s2_date.trim()) {
      updateLineItem(index, { s2_validation_error: true } as any);
      toast({
        title: "Required fields missing",
        description: "Inspected By, Approved By, and Inspection Date are all required.",
        variant: "destructive",
      });
      return;
    }
    updateLineItem(index, { s2_complete: true, s2_validation_error: false });
    if (lineItems[index].id) {
      stage2Mutation.mutate(index);
    } else {
      toast({ title: "Stage 2 marked complete" });
    }
  };

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const totalOrdered = lineItems.reduce((s, i) => s + ((i as any).ordered_qty ?? i.po_quantity ?? 0), 0);
    const totalReceiving = lineItems.reduce((s, i) => s + (i.s1_received_now ?? 0), 0);
    const totalAccepted = lineItems.reduce((s, i) => s + (i.s2_accepted_qty ?? 0), 0);
    const totalRejected = lineItems.reduce((s, i) => s + (i.s2_rejected_qty ?? 0), 0);
    return { totalOrdered, totalReceiving, totalAccepted, totalRejected };
  }, [lineItems]);

  // ── Save GRN ───────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const grnData = {
        grn_number: grnNumber,
        grn_date: format(grnDate, "yyyy-MM-dd"),
        po_id: selectedPO?.id || null,
        po_number: selectedPO?.po_number || null,
        vendor_id: selectedPO?.vendor_id || selectedDC?.party_id || null,
        vendor_name: selectedPO?.vendor_name || selectedDC?.party_name || vendorName || null,
        vendor_invoice_number: vendorInvoiceNumber || null,
        vendor_invoice_date: null,
        transporter_name: transporterName || null,
        vehicle_number: vehicleNumber || null,
        lr_reference: lrReference || null,
        received_by: receivedBy || null,
        notes: notes || null,
        total_received: totals.totalReceiving,
        total_accepted: totals.totalAccepted,
        total_rejected: totals.totalRejected,
        status,
        recorded_at: status === "recorded" ? new Date().toISOString() : null,
        verified_at: null,
      };

      const items = lineItems
        .filter((i) => i.s1_received_now > 0 || i.receiving_now > 0)
        .map((i, idx) => ({
          ...i,
          serial_number: idx + 1,
          receiving_now: i.s1_received_now,
          accepted_quantity: i.s2_accepted_qty,
          rejected_quantity: i.s2_rejected_qty,
          rejection_reason: i.s2_rejection_reason || undefined,
          rejection_action: null, // disposal_method has a different check constraint; don't write it to rejection_action
        }));

      const result = await recordGRNAndUpdatePO({ grn: grnData, lineItems: items });
      return result;
    },
    onSuccess: (result, status) => {
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["grn-stats"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-stats"] });
      if (selectedPO) {
        queryClient.invalidateQueries({ queryKey: ["purchase-order", selectedPO.id] });
      }
      if (status === "recorded") {
        setSavedGRNId(result.id);
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "GRN saved as draft", description: `GRN ${grnNumber} saved.` });
        navigate("/grn");
      }
    },
    onError: (err: any) => {
      console.error("[GRNForm] save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const hasItems = lineItems.some((i) => i.s1_received_now > 0 || i.receiving_now > 0);

  const handleSave = (status: string) => {
    if (!hasItems && !isExistingGrn) {
      toast({ title: "No items", description: "Enter receiving quantities for at least one item.", variant: "destructive" });
      return;
    }
    if (!isExistingGrn) saveMutation.mutate(status);
    else {
      toast({ title: "Saved", description: "Stage updates are saved per-item." });
      navigate("/grn");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div>
        <h1 className="text-xl font-display font-bold text-foreground">
          {isExistingGrn ? `GRN — ${grnNumber}` : "New Goods Receipt Note"}
        </h1>
        <p className="text-sm text-muted-foreground">Record incoming material received from a vendor</p>
      </div>

      {/* Info Banner */}
      {!isExistingGrn && (
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div className="space-y-1">
            <p className="font-medium">GRN records materials received from vendors.</p>
            <p>Select PO-GRN to receive against a Purchase Order, or DC-GRN for goods returning from job work / DC.</p>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="paper-card space-y-5">
        {/* GRN Type Toggle */}
        {!isExistingGrn && !preselectedDCId && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">GRN Type</Label>
            <div className="flex gap-2">
              {(['po_grn', 'dc_grn'] as GrnType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setGrnType(t); setSelectedPO(null); setSelectedDC(null); setLineItems([]); }}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                    grnType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  )}
                >
                  {t === 'po_grn' ? 'PO-GRN' : 'DC-GRN'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {/* PO selector */}
            {grnType === 'po_grn' && !isExistingGrn && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Linked Purchase Order</Label>
                <Popover open={poOpen} onOpenChange={setPOOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                      {selectedPO ? `${selectedPO.po_number} — ${selectedPO.vendor_name}` : "Select PO..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search PO number or vendor..." />
                      <CommandList>
                        <CommandEmpty>No open POs found.</CommandEmpty>
                        <CommandGroup>
                          {(openPOs ?? []).map((po: any) => (
                            <CommandItem
                              key={po.id}
                              value={`${po.po_number} ${po.vendor_name}`}
                              onSelect={() => handlePOSelect(po)}
                            >
                              <div>
                                <p className="font-mono font-medium">{po.po_number}</p>
                                <p className="text-xs text-muted-foreground">{po.vendor_name} · {new Date(po.po_date).toLocaleDateString("en-IN")}</p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* DC selector */}
            {grnType === 'dc_grn' && !isExistingGrn && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Linked DC (Returnable / Job Work)</Label>
                <Popover open={dcOpen} onOpenChange={setDcOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                      {selectedDC ? `${selectedDC.dc_number} — ${selectedDC.party_name}` : "Select DC..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search DC number or party..." />
                      <CommandList>
                        <CommandEmpty>No returnable DCs found.</CommandEmpty>
                        <CommandGroup>
                          {(returnableDCs ?? []).map((dc: any) => (
                            <CommandItem
                              key={dc.id}
                              value={`${dc.dc_number} ${dc.party_name}`}
                              onSelect={() => handleDCSelect(dc)}
                            >
                              <div>
                                <p className="font-mono font-medium">{dc.dc_number}</p>
                                <p className="text-xs text-muted-foreground">{dc.party_name} · {new Date(dc.dc_date).toLocaleDateString("en-IN")} · {dc.dc_type}</p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Vendor summary */}
            {(selectedPO || selectedDC) && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <p className="font-medium text-foreground">{selectedPO?.vendor_name ?? selectedDC?.party_name}</p>
                {selectedPO && <p className="text-muted-foreground">PO Date: {new Date(selectedPO.po_date).toLocaleDateString("en-IN")}</p>}
                {selectedDC && <p className="text-muted-foreground">DC Date: {new Date(selectedDC.dc_date).toLocaleDateString("en-IN")} · {selectedDC.dc_type}</p>}
                <p className="text-muted-foreground">Items: <span className="font-medium text-foreground">{lineItems.length}</span></p>
              </div>
            )}

            {grnType === 'po_grn' && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Vendor Invoice / Challan Number</Label>
                <Input value={vendorInvoiceNumber} onChange={(e) => setVendorInvoiceNumber(e.target.value)} className="mt-1" placeholder="e.g., INV-0001" />
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">GRN Number</Label>
              <Input value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} className="mt-1 font-mono" readOnly={isExistingGrn} />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">GRN Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start font-normal">
                    {format(grnDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={grnDate} onSelect={(d) => d && setGrnDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Transport Details
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Vehicle Number</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" placeholder="e.g., TN 01 AB 1234" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Driver Name</Label>
                    <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="mt-1" placeholder="Name" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Driver Contact</Label>
                    <Input value={driverContact} onChange={(e) => setDriverContact(e.target.value)} className="mt-1" placeholder="Phone" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              {grnType === 'po_grn' && selectedPO ? `Items from PO ${selectedPO.po_number}` :
               grnType === 'dc_grn' && selectedDC ? `Items from DC ${selectedDC.dc_number}` :
               'Items Received'}
            </h2>
            {!selectedPO && !selectedDC && (
              <Button variant="outline" size="sm" onClick={addManualItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <GrnLineItemCard
                key={index}
                item={item}
                index={index}
                isExistingGrn={isExistingGrn}
                isAdmin={isAdmin}
                onChange={updateLineItem}
                onSaveStage1={handleSaveStage1}
                onSaveStage2={handleSaveStage2}
              />
            ))}
          </div>

          {/* Summary bar */}
          <div className="paper-card bg-muted/30 py-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-muted-foreground">Total Ordered: </span><span className="font-mono font-medium">{totals.totalOrdered}</span></div>
              <div><span className="text-muted-foreground">Receiving Now: </span><span className="font-mono font-medium text-primary">{totals.totalReceiving}</span></div>
              <div><span className="text-muted-foreground">Accepted: </span><span className="font-mono font-medium text-emerald-600">{totals.totalAccepted}</span></div>
              {totals.totalRejected > 0 && (
                <div><span className="text-muted-foreground">Non-Conforming: </span><span className="font-mono font-medium text-destructive">{totals.totalRejected}</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {lineItems.length === 0 && !isExistingGrn && (
        <div className="paper-card text-center py-12">
          <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No items yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            {grnType === 'po_grn' ? "Select a Purchase Order above to pre-fill items" : "Select a Delivery Challan above to pre-fill items"}
          </p>
          <Button variant="outline" onClick={addManualItem}>
            <Plus className="h-4 w-4 mr-1" /> Add Item Manually
          </Button>
        </div>
      )}

      {lineItems.length === 0 && selectedPO && (
        <div className="paper-card text-center py-12">
          <AlertTriangle className="h-10 w-10 text-amber-500/50 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">All items in this PO have been fully received</p>
        </div>
      )}

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex justify-end gap-2 z-40">
        <Button variant="outline" onClick={() => navigate("/grn")}>Cancel</Button>
        {!isExistingGrn && (
          <>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
              Save Draft
            </Button>
            <Button onClick={() => handleSave("recorded")} disabled={saveMutation.isPending || !hasItems}>
              Record GRN →
            </Button>
          </>
        )}
        {isExistingGrn && (
          <Button onClick={() => navigate("/grn")}>
            Done
          </Button>
        )}
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GRN Recorded!</DialogTitle>
            <DialogDescription>
              GRN {grnNumber} has been recorded successfully.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/grn/${savedGRNId}`)}>View GRN</Button>
            {selectedPO && (
              <Button variant="outline" onClick={() => navigate(`/purchase-orders/${selectedPO.id}`)}>View PO</Button>
            )}
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/grn/new"); }}>Record Another</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export default function GRNForm({ defaultGrnType }: Props) {
  return (
    <GrnFormErrorBoundary>
      <GRNFormInner defaultGrnType={defaultGrnType} />
    </GrnFormErrorBoundary>
  );
}
