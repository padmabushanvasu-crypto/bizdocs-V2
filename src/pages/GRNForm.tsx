import React, { useState, useEffect, useMemo, Component, type ReactNode } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, PackageCheck, ChevronLeft, ChevronDown,
  Info, Plus, Truck,
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
  fetchDCReceiptSummary,
  recordGRNAndUpdatePO,
  fetchGRN,
  type GRNLineItem,
} from "@/lib/grn-api";
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
  // Jig / mould return confirmation (DC-GRN only)
  jig_confirmed?: boolean;
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
    jig_confirmed: a.jig_confirmed ?? false,
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

// ── GrnLineItemRow — simple table row, no per-item stages ────────────────────

function GrnLineItemRow({
  item,
  index,
  isAdmin,
  onChange,
  jigs,
}: {
  item: LineItemState;
  index: number;
  isAdmin: boolean;
  onChange: (index: number, update: Partial<LineItemState>) => void;
  jigs?: Array<{ id: string; jig_number: string; drawing_number: string; status: string }>;
}) {
  const orderedQty = (item as any).ordered_qty ?? item.po_quantity ?? 0;
  const prevReceived = (item as any).previously_received_qty ?? item.previously_received ?? 0;
  const pendingQty = Math.max(0, orderedQty - prevReceived);
  const exceedsPending = item.s1_received_now > 0 && pendingQty > 0 && item.s1_received_now > pendingQty && !item.s1_admin_override;

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
        <td className="px-3 py-2 text-slate-400 text-xs text-center">{index + 1}</td>
        <td className="px-3 py-2">
          <p className="text-sm font-medium text-slate-800">{item.description || "—"}</p>
          {item.drawing_number && (
            <p className="text-xs font-mono text-slate-400 mt-0.5">{item.drawing_number}</p>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-500">{orderedQty}</td>
        <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-400">{prevReceived}</td>
        <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-amber-600 font-medium">{pendingQty}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 justify-end">
            <input
              type="number"
              min={0}
              max={item.s1_admin_override ? undefined : (pendingQty > 0 ? pendingQty : undefined)}
              value={item.s1_received_now || ""}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                onChange(index, { s1_received_now: v });
              }}
              className={cn(
                "w-24 text-right border rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2",
                exceedsPending
                  ? "border-red-300 bg-red-50 focus:ring-red-300"
                  : "border-slate-200 focus:ring-blue-400"
              )}
            />
            {exceedsPending && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
          </div>
        </td>
        <td className="px-3 py-2 text-slate-500 text-xs">{item.unit}</td>
      </tr>
      {exceedsPending && (
        <tr className="bg-red-50/60">
          <td colSpan={7} className="px-3 py-1.5 text-xs text-red-700">
            Received ({item.s1_received_now}) exceeds pending ({pendingQty}).
            {isAdmin && (
              <button
                type="button"
                className="ml-2 underline font-medium"
                onClick={() => onChange(index, { s1_admin_override: true })}
              >
                Override (Admin)
              </button>
            )}
          </td>
        </tr>
      )}
      {jigs && jigs.length > 0 && item.s1_received_now > 0 && (
        <tr className="bg-amber-50/60 border-b border-amber-100">
          <td colSpan={7} className="px-3 py-2">
            <div className="flex flex-col gap-1.5">
              {jigs.map((jig) => (
                <label
                  key={jig.id}
                  className="flex items-center gap-2 cursor-pointer text-sm select-none"
                >
                  <input
                    type="checkbox"
                    checked={item.jig_confirmed ?? false}
                    onChange={(e) => onChange(index, { jig_confirmed: e.target.checked })}
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className={item.jig_confirmed ? "text-green-700 font-medium" : "text-amber-800 font-medium"}>
                    {item.jig_confirmed ? "✓" : "⚠"} Confirm jig/mould returned:{" "}
                    <span className="font-mono">{jig.jig_number}</span>
                    {jig.status !== 'ok' && (
                      <span className="ml-1 text-xs text-slate-500">({jig.status})</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
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
  const [fullyReceived, setFullyReceived] = useState(false);

  // Jig/mould map: drawing_number → jig records (DC-GRN only)
  const [jigsByDrawing, setJigsByDrawing] = useState<Record<string, Array<{ id: string; jig_number: string; drawing_number: string; status: string }>>>({});

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
  const isAdmin = (userRoleData as any)?.role === 'admin' || (userRoleData as any)?.role === 'finance';

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
    const pendingItems = poItems.filter((item: any) => {
      const pending = (item.quantity || 0) - (item.received_quantity || 0);
      return pending > 0;
    });
    if (pendingItems.length === 0) {
      setFullyReceived(true);
      setLineItems([]);
      return;
    }
    setFullyReceived(false);
    const items: LineItemState[] = pendingItems.map((item: any, idx: number) => {
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
          receiving_now: pending,
          accepted_quantity: 0,
          rejected_quantity: 0,
          rejection_reason: "",
          remarks: "",
          rejection_action: null,
        };
        const state = toLineState(base, idx);
        state.s1_received_now = pending;
        return state;
      });
    setLineItems(items);
  };

  const handleDCSelect = async (dc: any) => {
    setSelectedDC(dc);
    setDcOpen(false);
    setVendorName(dc.party_name ?? '');
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const [{ data: dcItems }, prevReceivedMap] = await Promise.all([
        (supabase as any)
          .from("dc_line_items")
          .select("*")
          .eq("dc_id", dc.id)
          .order("serial_number", { ascending: true }),
        fetchDCReceiptSummary(dc.id),
      ]);
      const pendingDCItems = (dcItems ?? []).filter((item: any) => {
          const alreadyReceived = prevReceivedMap[item.id] ?? 0;
          return (item.quantity || 0) - alreadyReceived > 0;
        });
      if (pendingDCItems.length === 0) {
        setFullyReceived(true);
        setLineItems([]);
        return;
      }
      setFullyReceived(false);
      const items: LineItemState[] = pendingDCItems.map((item: any, idx: number) => {
          const alreadyReceived = prevReceivedMap[item.id] ?? 0;
          const pending = Math.max(0, (item.quantity || 0) - alreadyReceived);
          const base: GRNLineItem = {
            serial_number: idx + 1,
            description: item.description,
            drawing_number: item.drawing_number || "",
            unit: item.unit || "NOS",
            po_quantity: item.quantity || 0,
            previously_received: alreadyReceived,
            pending_quantity: pending,
            receiving_now: pending,
            accepted_quantity: 0,
            rejected_quantity: 0,
            dc_line_item_id: item.id,
          };
          const state = toLineState(base, idx);
          state.s1_received_now = pending;
          (state as any).ordered_qty = item.quantity || 0;
          (state as any).previously_received_qty = alreadyReceived;
          (state as any).dc_line_item_id = item.id;
          return state;
        });
      setLineItems(items);

      // Fetch jigs/moulds for all drawing numbers in this DC
      const drawingNums = items.map((i) => i.drawing_number).filter(Boolean) as string[];
      if (drawingNums.length > 0) {
        try {
          const { getCompanyId } = await import("@/lib/auth-helpers");
          const companyId = await getCompanyId();
          if (companyId) {
            const { data: jigData } = await (supabase as any)
              .from("jig_master")
              .select("id, drawing_number, jig_number, status")
              .eq("company_id", companyId)
              .in("drawing_number", drawingNums);
            const jigMap: Record<string, Array<{ id: string; jig_number: string; drawing_number: string; status: string }>> = {};
            for (const jig of (jigData ?? []) as any[]) {
              const dn = jig.drawing_number as string;
              if (!jigMap[dn]) jigMap[dn] = [];
              jigMap[dn].push(jig);
            }
            setJigsByDrawing(jigMap);
          }
        } catch (_e) {
          // Jig fetch failure is non-fatal — form still works without jig data
        }
      } else {
        setJigsByDrawing({});
      }
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

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const totalOrdered = lineItems.reduce((s, i) => s + ((i as any).ordered_qty ?? i.po_quantity ?? 0), 0);
    const totalReceiving = lineItems.reduce((s, i) => s + (i.s1_received_now ?? 0), 0);
    return { totalOrdered, totalReceiving };
  }, [lineItems]);

  // ── Save GRN ───────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const grnData = {
        grn_number: grnNumber,
        grn_date: format(grnDate, "yyyy-MM-dd"),
        grn_type: grnType,
        po_id: selectedPO?.id || null,
        po_number: selectedPO?.po_number || null,
        linked_dc_id: selectedDC?.id || null,
        linked_dc_number: selectedDC?.dc_number || null,
        vendor_id: selectedPO?.vendor_id || selectedDC?.party_id || null,
        vendor_name: selectedPO?.vendor_name || selectedDC?.party_name || vendorName || null,
        vendor_invoice_number: vendorInvoiceNumber || null,
        vendor_invoice_date: null,
        transporter_name: transporterName || null,
        vehicle_number: vehicleNumber || null,
        lr_reference: lrReference || null,
        driver_name: driverName || null,
        driver_contact: driverContact || null,
        received_by: receivedBy || null,
        notes: notes || null,
        total_received: totals.totalReceiving,
        total_accepted: totals.totalReceiving,
        total_rejected: 0,
        status,
        recorded_at: status === "recorded" ? new Date().toISOString() : null,
        verified_at: null,
        qc_remarks: null,
        qc_prepared_by: null,
        qc_inspected_by: null,
        qc_approved_by: null,
      };

      const items = lineItems
        .filter((i) => i.s1_received_now > 0 || i.receiving_now > 0)
        .map((i, idx) => ({
          ...i,
          serial_number: idx + 1,
          receiving_now: i.s1_received_now,
          accepted_quantity: i.s1_received_now,
          rejected_quantity: 0,
          rejection_reason: undefined,
          rejection_action: null,
          dc_line_item_id: (i as any).dc_line_item_id || null,
        }));

      return await recordGRNAndUpdatePO({ grn: grnData, lineItems: items });
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
    // DC-GRN: block save if any received item has unconfirmed jig/mould
    if (grnType === 'dc_grn' && !isExistingGrn) {
      const unconfirmed = lineItems.filter((item) => {
        if (item.s1_received_now <= 0) return false;
        const jigs = jigsByDrawing[item.drawing_number ?? ''] ?? [];
        return jigs.length > 0 && !item.jig_confirmed;
      });
      if (unconfirmed.length > 0) {
        toast({
          title: "Jig confirmation required",
          description: "Please confirm all jigs/moulds have been returned before saving.",
          variant: "destructive",
        });
        return;
      }
    }
    if (!isExistingGrn) saveMutation.mutate(status);
    else {
      toast({ title: "Saved" });
      navigate("/grn");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6 w-full">
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

      {/* Deleted / Cancelled banner */}
      {isExistingGrn && ((existingGrn as any)?.status === 'deleted' || (existingGrn as any)?.status === 'cancelled') && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 capitalize">
              This GRN has been {(existingGrn as any).status}
            </p>
            <p className="text-sm text-red-700 mt-0.5">This document is read-only and cannot be edited.</p>
          </div>
        </div>
      )}

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
                  onClick={() => { setGrnType(t); setSelectedPO(null); setSelectedDC(null); setLineItems([]); setFullyReceived(false); setJigsByDrawing({}); }}
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

            {/* Approved-but-not-issued PO warning */}
            {selectedPO && (selectedPO.status === 'approved' || (selectedPO.status === 'draft' && selectedPO.approved_at)) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This PO has been approved but not yet formally issued. Consider issuing it from the Purchase Orders page first.
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

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wide">
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-8">#</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-20">Ordered</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-20">Prev Rcvd</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-20">Pending</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-32">Receiving Now *</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-16">Unit</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <GrnLineItemRow
                    key={index}
                    item={item}
                    index={index}
                    isAdmin={isAdmin}
                    onChange={updateLineItem}
                    jigs={grnType === 'dc_grn' ? (jigsByDrawing[item.drawing_number ?? ''] ?? []) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary bar */}
          <div className="paper-card bg-muted/30 py-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-muted-foreground">Total Ordered: </span><span className="font-mono font-medium">{totals.totalOrdered}</span></div>
              <div><span className="text-muted-foreground">Receiving Now: </span><span className="font-mono font-medium text-primary">{totals.totalReceiving}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Fully received banner */}
      {fullyReceived && lineItems.length === 0 && !isExistingGrn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">All items fully received</p>
            <p className="text-sm text-amber-700 mt-0.5">Every line item on this {grnType === 'po_grn' ? 'PO' : 'DC'} has already been received in full. No pending quantities remain — a new GRN cannot be raised.</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {lineItems.length === 0 && !isExistingGrn && !fullyReceived && (
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
