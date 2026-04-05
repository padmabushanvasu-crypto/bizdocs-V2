import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, Info, ChevronLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ItemSuggest } from "@/components/ItemSuggest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { fetchParties, type Party } from "@/lib/parties-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import {
  fetchDeliveryChallan,
  getNextDCNumber,
  createDeliveryChallan,
  updateDeliveryChallan,
  issueDeliveryChallan,
  fetchBomStagesForItemDC,
  fetchComponentProcessingLog,
  type DCLineItem,
} from "@/lib/delivery-challans-api";
import { getCompanyId } from "@/lib/auth-helpers";
import { createJobWork, getNextJCNumber } from "@/lib/job-works-api";
import { fetchProcessingRoute, fetchProcessingRouteAll, fetchJigsForDrawing, fetchStageVendors, fetchMouldItemsForDrawing, type ProcessingRoute, type JigMasterRecord, type MouldItem } from "@/lib/dc-intelligence-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { getGSTType, calculateLineTax, round2, resolveStateCode, type GSTType } from "@/lib/tax-utils";

const RETURNABLE_SUBTYPES = [
  { value: "job_work_143", label: "Job Work (Section 143)" },
  { value: "job_work_out", label: "Job Work (Rule 45)" },
  { value: "sample", label: "Sample" },
  { value: "loan_borrow", label: "Loan / Borrow" },
  { value: "other_returnable", label: "Other Returnable" },
];

const NON_RETURNABLE_SUBTYPES = [
  { value: "supply", label: "Supply" },
  { value: "job_work_return", label: "Job Work Return" },
  { value: "other_non_returnable", label: "Other Non-Returnable" },
];

// Map (primaryChoice + subtype) → dcType saved to DB
function buildDcType(primary: "returnable" | "non_returnable", subType: string): string {
  if (primary === "returnable") {
    if (subType === "job_work_143") return "job_work_143";
    if (subType === "job_work_out") return "job_work_out";
    if (subType === "sample") return "sample";
    if (subType === "loan_borrow") return "loan_borrow";
    if (subType) return subType; // other_returnable or custom
    return "returnable";
  } else {
    if (subType === "supply") return "supply";
    if (subType === "job_work_return") return "job_work_return";
    if (subType) return subType;
    return "non_returnable";
  }
}

// Reverse: dcType from DB → (primaryChoice, subType)
function parseDcType(dcType: string): { primary: "returnable" | "non_returnable"; subType: string } {
  const returnableValues = ["returnable", "job_work_143", "job_work_out", "sample", "loan_borrow", "other_returnable"];
  const nonReturnableValues = ["non_returnable", "supply", "job_work_return", "other_non_returnable"];
  if (returnableValues.includes(dcType)) {
    return { primary: "returnable", subType: dcType === "returnable" ? "" : dcType };
  }
  if (nonReturnableValues.includes(dcType)) {
    return { primary: "non_returnable", subType: dcType === "non_returnable" ? "" : dcType };
  }
  // default
  return { primary: "returnable", subType: "" };
}

const CHALLAN_CATEGORIES = [
  { value: "supply_on_approval", label: "Supply on Approval" },
  { value: "job_work_return", label: "Job Work Return" },
  { value: "sales_return", label: "Sales Return" },
  { value: "others", label: "Others" },
];

function emptyLineItem(serial: number): DCLineItem {
  return {
    serial_number: serial,
    item_code: "",
    description: "",
    drawing_number: "",
    unit: "NOS",
    quantity: 0,
    rate: 0,
    amount: 0,
    remarks: "",
    nature_of_process: "",
    qty_kgs: undefined,
    qty_sft: undefined,
    job_work_id: null,
    job_work_number: null,
    job_work_step_id: null,
    stage_number: null,
    stage_name: null,
    is_rework: false,
    rework_cycle: 1,
    parent_dc_line_id: null,
  };
}

export default function DeliveryChallanForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [primaryChoice, setPrimaryChoice] = useState<"returnable" | "non_returnable">("returnable");
  const [dcSubType, setDcSubType] = useState<string>("");
  const dcType = buildDcType(primaryChoice, dcSubType);
  const [dcNumber, setDcNumber] = useState("");
  const [dcDate, setDcDate] = useState<Date>(new Date());
  const [partyId, setPartyId] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [returnDueDate, setReturnDueDate] = useState<Date | undefined>();
  const [natureOfJobWork, setNatureOfJobWork] = useState("");
  const [lineItems, setLineItems] = useState<DCLineItem[]>([emptyLineItem(1)]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedDCId, setSavedDCId] = useState<string | null>(null);
  // Job Card creation dialog
  type JCItemState = {
    lineItem: DCLineItem;
    itemId: string | null;
    routes: ProcessingRoute[];
    selectedStageNumber: number | null;
    skip: boolean;
    existingMode: boolean; // stage 2+ flow
    existingJCNumber: string;
    useExisting: boolean;
  };
  const [jcDialogOpen, setJcDialogOpen] = useState(false);
  const [jcItems, setJcItems] = useState<JCItemState[]>([]);
  const [jcCreating, setJcCreating] = useState(false);
  const [jcResults, setJcResults] = useState<{ itemCode: string; jcNumber: string }[]>([]);
  const [jcDone, setJcDone] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [loNumber, setLoNumber] = useState("");
  const [prefillBanner, setPrefillBanner] = useState<string>("");
  const [approxValue, setApproxValue] = useState<number | undefined>();
  const [gstRate, setGstRate] = useState(18);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  // BOM stages state
  const [lineBomStages, setLineBomStages] = useState<Map<number, any[]>>(new Map());
  const [lineProcessingLog, setLineProcessingLog] = useState<Map<number, any>>(new Map());
  const [lineStageSelection, setLineStageSelection] = useState<Map<number, number | 'manual'>>(new Map());
  const [itemIdByIndex, setItemIdByIndex] = useState<Map<number, string>>(new Map());
  // Phase 15: processing routes and jigs per line
  const [lineRoutes, setLineRoutes] = useState<Map<number, ProcessingRoute[]>>(new Map());
  const [lineJigs, setLineJigs] = useState<Map<number, JigMasterRecord[]>>(new Map());
  const [lineSelectedStageId, setLineSelectedStageId] = useState<Map<number, string>>(new Map());
  const [lineJigsChecked, setLineJigsChecked] = useState<Map<number, string[]>>(new Map());
  const [lineAutoFilledRate, setLineAutoFilledRate] = useState<Map<number, boolean>>(new Map());
  const [lineMouldItems, setLineMouldItems] = useState<Map<number, MouldItem[]>>(new Map());
  const [lineMouldAcknowledged, setLineMouldAcknowledged] = useState<Map<number, boolean>>(new Map());
  // Change 4: full all-stage route (internal + external) for read-only display
  const [lineAllRoutes, setLineAllRoutes] = useState<Map<number, ProcessingRoute[]>>(new Map());
  const [lineRouteExpanded, setLineRouteExpanded] = useState<Map<number, boolean>>(new Map());

  const selectStage = (lineIndex: number, stage: ProcessingRoute) => {
    setLineSelectedStageId(prev => { const m = new Map(prev); m.set(lineIndex, stage.id); return m; });
    setLineItems(items => {
      const updated = [...items];
      (updated[lineIndex] as any).selectedStageId = stage.id;
      (updated[lineIndex] as any).selectedStage = stage;
      return updated;
    });
    // Auto-fill rate from preferred vendor's unit_cost
    fetchStageVendors(stage.id).then(vendors => {
      if (vendors.length === 0) return;
      const preferred = vendors.find(v => v.is_preferred) ?? vendors[0];
      if (preferred.unit_cost) {
        setLineItems(items => {
          const updated = [...items];
          const qty = Number(updated[lineIndex].quantity) || 0;
          updated[lineIndex] = {
            ...updated[lineIndex],
            rate: preferred.unit_cost,
            amount: Math.round(qty * preferred.unit_cost * 100) / 100,
          };
          return updated;
        });
        setLineAutoFilledRate(prev => { const m = new Map(prev); m.set(lineIndex, true); return m; });
      }
    }).catch(() => {/* ignore */});
  };

  const toggleJigCheck = (lineIndex: number, jigId: string, checked: boolean) => {
    setLineJigsChecked(prev => {
      const m = new Map(prev);
      const current = m.get(lineIndex) ?? [];
      if (checked) {
        m.set(lineIndex, [...current.filter(id => id !== jigId), jigId]);
      } else {
        m.set(lineIndex, current.filter(id => id !== jigId));
      }
      return m;
    });
  };
  // Fetch data
  const { data: partiesData } = useQuery({
    queryKey: ["parties-all"],
    queryFn: () => fetchParties({ status: "active", pageSize: 500 }),
  });
  const parties = partiesData?.data ?? [];

  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: nextNumber } = useQuery({
    queryKey: ["next-dc-number"],
    queryFn: getNextDCNumber,
    enabled: !isEdit,
  });

  const { data: existingDC } = useQuery({
    queryKey: ["delivery-challan", id],
    queryFn: () => fetchDeliveryChallan(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!isEdit && nextNumber) setDcNumber(nextNumber);
  }, [nextNumber, isEdit]);

  useEffect(() => {
    if (existingDC) {
      setDcNumber(existingDC.dc_number);
      const parsed = parseDcType(existingDC.dc_type);
      setPrimaryChoice(parsed.primary);
      setDcSubType(parsed.subType);
      setDcDate(new Date(existingDC.dc_date));
      setPartyId(existingDC.party_id);
      setReferenceNumber(existingDC.reference_number || "");
      setSpecialInstructions(existingDC.special_instructions || "");
      setInternalRemarks(existingDC.internal_remarks || "");
      setNatureOfJobWork(existingDC.nature_of_job_work || "");
      setVehicleNumber(existingDC.vehicle_number || "");
      setDriverName((existingDC as any).driver_name || "");
      setDriverContact((existingDC as any).driver_contact || "");
      setLoNumber(existingDC.lo_number || "");
      setApproxValue(existingDC.approx_value ?? undefined);
      setGstRate(existingDC.gst_rate || 18);
      setPreparedBy(existingDC.prepared_by || "");
      setCheckedBy(existingDC.checked_by || "");
      if (existingDC.return_due_date) setReturnDueDate(new Date(existingDC.return_due_date));
      if (existingDC.line_items?.length) setLineItems(existingDC.line_items);
      if (existingDC.party_id) {
        const p = parties.find((p) => p.id === existingDC.party_id);
        if (p) setSelectedParty(p);
      }
    }
  }, [existingDC, parties]);

  // Prefill from Raise DC navigation state
  useEffect(() => {
    const prefill = (location.state as any)?.prefill;
    if (!prefill || isEdit || parties.length === 0) return;

    if (prefill.dc_type) {
      const parsed = parseDcType(prefill.dc_type);
      setPrimaryChoice(parsed.primary);
      setDcSubType(parsed.subType);
    }
    if (prefill.party_id) {
      setPartyId(prefill.party_id);
      const p = parties.find((p) => p.id === prefill.party_id);
      if (p) setSelectedParty(p);
    }
    if (prefill.return_before_date) setReturnDueDate(new Date(prefill.return_before_date));
    if (prefill.line_items?.length) {
      const items: DCLineItem[] = (prefill.line_items as any[]).map((li, idx) => ({
        serial_number: idx + 1,
        item_code: li.item_code || "",
        description: li.description || "",
        drawing_number: li.drawing_number || "",
        unit: li.unit || "NOS",
        quantity: li.quantity || 0,
        rate: li.rate || 0,
        amount: Math.round((li.quantity || 0) * (li.rate || 0) * 100) / 100,
        nature_of_process: li.nature_of_process || "",
        qty_kgs: undefined,
        qty_sft: undefined,
        job_work_id: li.job_work_id || null,
        job_work_number: li.job_work_number || null,
        job_work_step_id: li.job_work_step_id || null,
        stage_number: li.stage_number ?? null,
        stage_name: li.stage_name ?? null,
        is_rework: li.is_rework ?? false,
        rework_cycle: li.rework_cycle ?? 1,
        parent_dc_line_id: li.parent_dc_line_id ?? null,
      }));
      setLineItems(items);
    }
  }, [location.state, parties, isEdit]);

  const handlePartySelect = (party: Party) => {
    setPartyId(party.id);
    setSelectedParty(party);
    setPartyOpen(false);
  };

  // Line item handlers
  const updateLineItem = (index: number, field: keyof DCLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
      // Auto-calculate amount
      if (field === "quantity" || field === "rate") {
        const qty = field === "quantity" ? Number(value) : Number(updated[index].quantity);
        const rate = field === "rate" ? Number(value) : Number(updated[index].rate);
        updated[index].amount = Math.round(qty * rate * 100) / 100;
      }
      return updated;
    });
  };

  const addLineItem = () => setLineItems((items) => [...items, emptyLineItem(items.length + 1)]);
  const removeLineItem = (index: number) => {
    setLineItems((items) => items.filter((_, i) => i !== index).map((item, i) => ({ ...item, serial_number: i + 1 })));
  };

  // Totals & GST
  const subTotal = useMemo(() => lineItems.reduce((s, i) => round2(s + (i.amount || 0)), 0), [lineItems]);
  const totalItems = lineItems.filter((i) => i.description.trim()).length;
  const totalQty = lineItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const isReturnable = primaryChoice === "returnable";
  const isRule45 = dcSubType === "job_work_out";
  const isJobWork143 = dcSubType === "job_work_143";

  // GST type — derive from company state vs party state. Never assume intra-state.
  const gstType = useMemo<GSTType>(
    () => getGSTType(resolveStateCode(company?.state_code, company?.gstin), selectedParty?.state_code),
    [company?.state_code, company?.gstin, selectedParty?.state_code],
  );

  const taxResult = useMemo(
    () => calculateLineTax(subTotal, gstRate, gstType),
    [subTotal, gstRate, gstType],
  );
  const grandTotal = round2(subTotal + taxResult.total);

  // Save
  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const dcData = {
        dc_number: dcNumber,
        dc_date: format(dcDate, "yyyy-MM-dd"),
        dc_type: dcType,
        party_id: partyId,
        party_name: selectedParty?.name || null,
        party_address: selectedParty
          ? [selectedParty.address_line1, selectedParty.address_line2, selectedParty.city, selectedParty.state].filter(Boolean).join(", ")
          : null,
        party_gstin: selectedParty?.gstin || null,
        party_state_code: selectedParty?.state_code || null,
        party_phone: selectedParty?.phone1 || null,
        reference_number: referenceNumber || null,
        approximate_value: grandTotal,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        return_due_date: returnDueDate ? format(returnDueDate, "yyyy-MM-dd") : null,
        nature_of_job_work: natureOfJobWork || null,
        total_items: totalItems,
        total_qty: totalQty,
        status,
        issued_at: status === "issued" ? new Date().toISOString() : null,
        cancelled_at: null,
        cancellation_reason: null,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        driver_contact: driverContact || null,
        lo_number: null,
        approx_value: approxValue ?? null,
        sub_total: subTotal,
        cgst_amount: taxResult.cgst,
        sgst_amount: taxResult.sgst,
        igst_amount: taxResult.igst,
        total_gst: taxResult.total,
        grand_total: grandTotal,
        gst_rate: gstRate,
        challan_category: "supply_on_approval",
        prepared_by: preparedBy || null,
        checked_by: checkedBy || null,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => {
          const routeForLine = lineRoutes.get(idx) ?? [];
          const selectedStageId = lineSelectedStageId.get(idx) ?? null;
          const selectedStage = routeForLine.find(s => s.id === selectedStageId) ?? null;
          const jigsForLine = lineJigs.get(idx) ?? [];
          const jigsChecked = lineJigsChecked.get(idx) ?? [];
          return {
            ...i,
            serial_number: idx + 1,
            qty_nos: i.quantity,
            stage_number: selectedStage?.stage_number ?? (i as any).stage_number ?? null,
            stage_name: selectedStage?.process_name ?? (i as any).stage_name ?? null,
            is_rework: (i as any).is_rework ?? false,
            rework_cycle: (i as any).rework_cycle ?? 1,
            parent_dc_line_id: (i as any).parent_dc_line_id ?? null,
            total_stages: selectedStage ? routeForLine.length : null,
            route_id: selectedStageId ?? null,
            jigs_sent: jigsForLine.length > 0
              ? jigsForLine.filter(j => jigsChecked.includes(j.id)).map(j => ({ id: j.id, jig_number: j.jig_number }))
              : null,
          };
        });

      if (isEdit) {
        await updateDeliveryChallan(id!, { dc: dcData as any, lineItems: items });
        if (status === "issued") await issueDeliveryChallan(id!);
        return id;
      } else {
        const result = await createDeliveryChallan({ dc: dcData as any, lineItems: items });
        if (status === "issued") await issueDeliveryChallan(result.id);
        return result.id;
      }
    },
    onSuccess: (dcId, status) => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
      if (status === "issued") {
        setSavedDCId(dcId as string);
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "DC saved", description: `DC ${dcNumber} saved as draft.` });
        navigate("/delivery-challans");
      }
    },
    onError: (err: any) => {
      console.error('[DC] save error:', err);
      toast({ title: "Error saving DC", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!selectedParty) {
      toast({ title: "Party required", description: "Please select a party.", variant: "destructive" });
      return;
    }
    if (!lineItems.some((i) => i.description.trim())) {
      toast({ title: "Items required", description: "Add at least one line item.", variant: "destructive" });
      return;
    }
    // Check mould acknowledgements
    const unacknowledgedMouldLines = lineItems
      .map((_, idx) => idx)
      .filter(idx => (lineMouldItems.get(idx)?.length ?? 0) > 0 && !lineMouldAcknowledged.get(idx));
    if (unacknowledgedMouldLines.length > 0) {
      toast({
        title: "Mould acknowledgement required",
        description: `Please acknowledge the mould confirmation for line item(s): ${unacknowledgedMouldLines.map(i => i + 1).join(', ')}`,
        variant: "destructive",
      });
      return;
    }
    // Change 3: block save if any line has a 'to_be_made' jig
    for (let idx = 0; idx < lineItems.length; idx++) {
      if (!lineItems[idx].description.trim()) continue;
      const jigs = lineJigs.get(idx) ?? [];
      const notReadyJig = jigs.find(j => j.status === "to_be_made");
      if (notReadyJig) {
        toast({
          title: "Jig not ready — cannot dispatch",
          description: `Jig "${notReadyJig.jig_number}" for line item ${idx + 1} is NOT YET READY. Do not dispatch until jig is available.`,
          variant: "destructive",
        });
        return;
      }
    }
    // Change 3: require acknowledgement for 'ok' jigs (all must be ticked)
    for (let idx = 0; idx < lineItems.length; idx++) {
      if (!lineItems[idx].description.trim()) continue;
      const jigs = lineJigs.get(idx) ?? [];
      const okJigs = jigs.filter(j => j.status === "ok" || j.status === "in_progress");
      const checked = lineJigsChecked.get(idx) ?? [];
      const firstUnchecked = okJigs.find(j => !checked.includes(j.id));
      if (firstUnchecked) {
        toast({
          title: "Jig acknowledgement required",
          description: `Confirm jig "${firstUnchecked.jig_number}" is included with line item ${idx + 1} before saving.`,
          variant: "destructive",
        });
        return;
      }
    }
    saveMutation.mutate(status);
  };

  const openJCDialog = () => {
    const initial: JCItemState[] = lineItems
      .filter(li => li.description?.trim() || li.item_code?.trim())
      .map((li, idx) => ({
        lineItem: li,
        itemId: (li as any).item_id ?? itemIdByIndex.get(idx) ?? null,
        routes: [],
        selectedStageNumber: null,
        skip: false,
        existingMode: false,
        existingJCNumber: "",
        useExisting: false,
      }));
    setJcItems(initial);
    setJcResults([]);
    setJcDone(false);
    setSuccessDialogOpen(false);
    setJcDialogOpen(true);
    // Fetch routes per item
    initial.forEach((item, idx) => {
      if (!item.itemId) return;
      fetchProcessingRouteAll(item.itemId).then(routes => {
        setJcItems(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], routes };
          return updated;
        });
      }).catch(() => {});
    });
  };

  const handleCreateJC = async () => {
    setJcCreating(true);
    const results: { itemCode: string; jcNumber: string }[] = [];
    try {
      for (const item of jcItems) {
        if (item.skip || item.selectedStageNumber === null) continue;
        if (item.existingMode && item.useExisting && item.existingJCNumber.trim()) {
          results.push({ itemCode: item.lineItem.item_code || item.lineItem.description || '?', jcNumber: item.existingJCNumber.trim() });
          continue;
        }
        const jcNumber = await getNextJCNumber();
        await createJobWork({
          jc_number: jcNumber,
          item_id: item.itemId ?? undefined,
          item_code: item.lineItem.item_code || undefined,
          item_description: item.lineItem.description || undefined,
          quantity_original: Number(item.lineItem.quantity) || 1,
          unit: item.lineItem.unit || "NOS",
          notes: `Created from DC ${dcNumber}. Stage: ${item.selectedStageNumber}`,
        } as any);
        results.push({ itemCode: item.lineItem.item_code || item.lineItem.description || '?', jcNumber });
      }
      setJcResults(results);
      setJcDone(true);
    } catch (err: any) {
      toast({ title: "Error creating job cards", description: err.message, variant: "destructive" });
    } finally {
      setJcCreating(false);
    }
  };

  const isJobWorkDC = dcType === "job_work_out" || dcType === "job_work_143";

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
          {isEdit ? "Edit DC / Job Work Order" : "New DC / Job Work Order"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing DC ${dcNumber}` : "Create a new delivery challan"}
        </p>
      </div>

      {/* DC Type Selector */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => { setPrimaryChoice("returnable"); setDcSubType(""); }}
            className={cn(
              "p-4 rounded-lg border-2 text-center transition-all",
              isReturnable ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
            )}
          >
            <p className="font-bold text-sm">RETURNABLE</p>
            <p className="text-xs text-muted-foreground mt-1">Goods to be returned after processing</p>
          </button>
          <button
            onClick={() => { setPrimaryChoice("non_returnable"); setDcSubType(""); }}
            className={cn(
              "p-4 rounded-lg border-2 text-center transition-all",
              !isReturnable ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
            )}
          >
            <p className="font-bold text-sm">NON-RETURNABLE</p>
            <p className="text-xs text-muted-foreground mt-1">Goods sent permanently to party</p>
          </button>
        </div>

        {/* Sub-type dropdown */}
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Sub-type (optional)</Label>
          <Select value={dcSubType} onValueChange={setDcSubType}>
            <SelectTrigger>
              <SelectValue placeholder="Select sub-type..." />
            </SelectTrigger>
            <SelectContent>
              {(isReturnable ? RETURNABLE_SUBTYPES : NON_RETURNABLE_SUBTYPES).map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Return Due Date — only for RETURNABLE */}
        {isReturnable && (
          <div className="space-y-1.5">
            <Label className="text-sm">Return Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !returnDueDate && "text-muted-foreground")}>
                  {returnDueDate ? format(returnDueDate, "dd MMM yyyy") : "Select date..."}
                  <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={returnDueDate} onSelect={setReturnDueDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* GST Rule 45 reminder */}
        {isRule45 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <strong>GST Rule 45:</strong> Goods sent for job work must be returned within 1 year (365 days). Failure to return will attract GST as if a supply was made on the dispatch date.
            </p>
          </div>
        )}
      </div>

      {/* Section 143 info note */}
      {isJobWork143 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            <strong>Section 143:</strong> No GST on job work challan. Goods must be returned within 1 year (3 years for capital goods).
          </p>
        </div>
      )}

      {prefillBanner && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
          <span>{prefillBanner}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <h2 className="text-sm font-medium text-slate-700 border-b border-border pb-2">Consignee & DC Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left - Consignee */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Party / Consignee *</Label>
              <Popover open={partyOpen} onOpenChange={setPartyOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedParty ? selectedParty.name : "Select party..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search parties..." />
                    <CommandList>
                      <CommandEmpty>
                        No party found.{" "}
                        <Button variant="link" size="sm" onClick={() => navigate("/parties/new")}>+ Add New</Button>
                      </CommandEmpty>
                      <CommandGroup>
                        {parties.map((p) => (
                          <CommandItem key={p.id} value={p.name} onSelect={() => handlePartySelect(p)}>
                            <div>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.city}{p.gstin ? ` · ${p.gstin}` : ""}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedParty && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <p className="font-medium text-foreground">{selectedParty.name}</p>
                {selectedParty.address_line1 && <p className="text-muted-foreground">{selectedParty.address_line1}</p>}
                {selectedParty.city && (
                  <p className="text-muted-foreground">
                    {[selectedParty.city, selectedParty.state, selectedParty.pin_code].filter(Boolean).join(", ")}
                  </p>
                )}
                {selectedParty.gstin && <p className="font-mono text-xs">GSTIN: {selectedParty.gstin}</p>}
                {selectedParty.phone1 && <p className="text-xs text-muted-foreground">Ph: {selectedParty.phone1}</p>}
              </div>
            )}

          </div>

          {/* Right - DC Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">DC Number</Label>
                <Input value={dcNumber} onChange={(e) => setDcNumber(e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">DC Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !dcDate && "text-muted-foreground")}>
                      {dcDate ? format(dcDate, "dd MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dcDate} onSelect={(d) => d && setDcDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Vehicle Number</Label>
                <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" placeholder="e.g., MH-01-AB-1234" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Driver Name</Label>
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="mt-1" placeholder="Driver's name" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Driver Contact</Label>
                <Input value={driverContact} onChange={(e) => setDriverContact(e.target.value)} className="mt-1" placeholder="Mobile number" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Approx. Value ₹</Label>
                <Input
                  type="number"
                  value={approxValue ?? ""}
                  onChange={(e) => setApproxValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="mt-1"
                  placeholder="Declared value"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Required for e-way bill if goods &gt; ₹50,000</p>
              </div>
            </div>

            {/* Return due date is shown in the DC Type section above */}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="paper-card !p-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">Line Items</h2>
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left w-8 text-xs font-medium text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Item / Description</th>
                <th className="px-3 py-2 text-left w-32 text-xs font-medium text-slate-400 uppercase tracking-wider">Drawing No</th>
                <th className="px-3 py-2 text-left w-48 text-xs font-medium text-slate-400 uppercase tracking-wider">Nature of Process</th>
                <th className="px-3 py-2 text-right w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">Qty</th>
                <th className="px-3 py-2 text-left w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">Unit</th>
                <th className="px-3 py-2 text-right w-28 text-xs font-medium text-slate-400 uppercase tracking-wider">Rate ₹</th>
                <th className="px-3 py-2 text-right w-28 text-xs font-medium text-slate-400 uppercase tracking-wider">Amount ₹</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <React.Fragment key={index}>
                <tr className="group border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-muted-foreground font-mono text-sm w-8">{item.serial_number}</td>
                  <td className="px-1 py-1">
                    <ItemSuggest
                      value={item.description}
                      onChange={(v) => updateLineItem(index, "description", v)}
                      onSelect={(selectedItem) => {
                        updateLineItem(index, "item_code", selectedItem.item_code);
                        updateLineItem(index, "description", selectedItem.description);
                        updateLineItem(index, "unit", selectedItem.unit || "NOS");
                        updateLineItem(index, "rate", selectedItem.sale_price || 0);
                        updateLineItem(index, "drawing_number", selectedItem.drawing_revision || selectedItem.drawing_number || "");
                        setLineItems((items) => {
                          const updated = [...items];
                          updated[index].amount = Math.round((updated[index].quantity || 0) * (selectedItem.sale_price || 0) * 100) / 100;
                          return updated;
                        });
                        // Track item_id
                        setItemIdByIndex(prev => { const m = new Map(prev); m.set(index, selectedItem.id); return m; });
                        // Load BOM stages for this item
                        fetchBomStagesForItemDC(selectedItem.id).then(stages => {
                          setLineBomStages(prev => { const m = new Map(prev); m.set(index, stages); return m; });
                          setLineStageSelection(prev => { const m = new Map(prev); m.delete(index); return m; });
                        });
                        // Load processing log
                        getCompanyId().then(cid => {
                          fetchComponentProcessingLog(cid, selectedItem.id).then(log => {
                            setLineProcessingLog(prev => { const m = new Map(prev); if (log) m.set(index, log); else m.delete(index); return m; });
                          });
                        });
                        // Phase 15: Load processing routes for this item
                        fetchProcessingRoute(selectedItem.id).then(routes => {
                          setLineRoutes(prev => { const m = new Map(prev); m.set(index, routes); return m; });
                          setLineSelectedStageId(prev => { const m = new Map(prev); m.delete(index); return m; });
                        });
                        // Change 4: Load all stages (internal + external) for read-only display
                        fetchProcessingRouteAll(selectedItem.id).then(allRoutes => {
                          setLineAllRoutes(prev => { const m = new Map(prev); m.set(index, allRoutes); return m; });
                          setLineRouteExpanded(prev => { const m = new Map(prev); m.delete(index); return m; });
                        });
                        // Load mould items and jigs by drawing number
                        const drawingNum = selectedItem.drawing_revision || (selectedItem as any).drawing_number || '';
                        if (drawingNum.trim()) {
                          fetchJigsForDrawing(drawingNum.trim()).then(jigs => {
                            setLineJigs(prev => { const m = new Map(prev); m.set(index, jigs); return m; });
                          });
                          fetchMouldItemsForDrawing(drawingNum.trim()).then(moulds => {
                            setLineMouldItems(prev => { const m = new Map(prev); m.set(index, moulds); return m; });
                            setLineMouldAcknowledged(prev => { const m = new Map(prev); m.delete(index); return m; });
                          });
                        }
                      }}
                      placeholder="Item description"
                      className="h-8 text-sm w-full"
                    />
                  </td>
                  <td className="p-0 w-32">
                    <input
                      type="text"
                      value={item.drawing_number || ""}
                      onChange={(e) => {
                        updateLineItem(index, "drawing_number", e.target.value);
                        // Phase 15: load jigs when drawing number changes
                        if (e.target.value.trim().length >= 3) {
                          fetchJigsForDrawing(e.target.value.trim()).then(jigs => {
                            setLineJigs(prev => { const m = new Map(prev); m.set(index, jigs); return m; });
                          });
                          fetchMouldItemsForDrawing(e.target.value.trim()).then(moulds => {
                            setLineMouldItems(prev => { const m = new Map(prev); m.set(index, moulds); return m; });
                            setLineMouldAcknowledged(prev => { const m = new Map(prev); m.delete(index); return m; });
                          });
                        }
                      }}
                      placeholder="e.g. 230086"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm font-mono"
                    />
                  </td>
                  <td className="p-0 w-48">
                    <input
                      type="text"
                      value={item.nature_of_process || ""}
                      onChange={(e) => updateLineItem(index, "nature_of_process", e.target.value)}
                      placeholder="e.g. Nickel Plating"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm"
                    />
                  </td>
                  <td className="p-0 w-24">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="p-0 w-24">
                    <select
                      value={item.unit || "NOS"}
                      onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                      className="w-full min-h-[44px] px-2 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm"
                    >
                      {["NOS","KG","KGS","MTR","SFT","SET","ROLL","SHEET","OTHER"].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0 w-28">
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate || ""}
                        onChange={(e) => {
                          updateLineItem(index, "rate", Number(e.target.value));
                          setLineAutoFilledRate(prev => { const m = new Map(prev); m.delete(index); return m; });
                        }}
                        className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums"
                      />
                      {lineAutoFilledRate.get(index) && (
                        <span className="absolute -top-1 right-1 text-[9px] text-blue-600 font-semibold">auto</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 w-28 bg-slate-50 text-right text-sm font-medium text-slate-700 font-mono tabular-nums">
                    {item.amount
                      ? `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.amount)}`
                      : "—"}
                  </td>
                  <td className="px-2 w-10">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-1 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
                {(lineBomStages.get(index)?.length ?? 0) > 0 && (
                  <tr key={`stage-${index}`} className="bg-blue-50/40 border-b border-blue-100">
                    <td />
                    <td colSpan={10} className="px-3 py-2">
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="flex-1 min-w-[280px]">
                          <Label className="text-xs text-blue-700 font-medium">Processing Stage</Label>
                          <select
                            className="mt-1 w-full border border-blue-200 rounded px-2 py-1.5 text-sm bg-white"
                            value={lineStageSelection.get(index) ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'manual' || val === '') {
                                setLineStageSelection(prev => { const m = new Map(prev); if (val === 'manual') m.set(index, 'manual'); else m.delete(index); return m; });
                                return;
                              }
                              const stageNum = parseInt(val);
                              setLineStageSelection(prev => { const m = new Map(prev); m.set(index, stageNum); return m; });
                              const stage = lineBomStages.get(index)?.find((s: any) => s.stage_number === stageNum);
                              if (stage) {
                                if (stage.vendor_id) {
                                  const p = parties.find((p: Party) => p.id === stage.vendor_id);
                                  if (p) {
                                    setPartyId(p.id);
                                    setSelectedParty(p);
                                  }
                                }
                                updateLineItem(index, 'nature_of_process', stage.process_name);
                                const due = new Date();
                                due.setDate(due.getDate() + (stage.expected_days ?? 7));
                                setReturnDueDate(due);
                                setLineItems(items => {
                                  const updated = [...items];
                                  (updated[index] as any).stage_number = stage.stage_number;
                                  (updated[index] as any).stage_name = stage.stage_name;
                                  return updated;
                                });
                              }
                            }}
                          >
                            <option value="">Select processing stage…</option>
                            {(lineBomStages.get(index) ?? []).map((stage: any) => (
                              <option key={stage.stage_number} value={stage.stage_number}>
                                Stage {stage.stage_number} — {stage.process_name}{stage.vendor_name ? ` (${stage.vendor_name})` : ''}
                              </option>
                            ))}
                            <option value="manual">Manual entry (no BOM stage)</option>
                          </select>
                        </div>
                        {lineProcessingLog.get(index) && (
                          <div className="text-xs text-slate-500 self-end pb-1">
                            Last status: <span className="font-medium">{(lineProcessingLog.get(index) as any)?.current_status?.replace(/_/g, ' ')}</span>
                            {' — '}
                            {(lineProcessingLog.get(index) as any)?.accepted_qty ?? 0} accepted,
                            Stage {(lineProcessingLog.get(index) as any)?.current_stage ?? 0} of {(lineProcessingLog.get(index) as any)?.total_stages ?? 0} complete
                          </div>
                        )}
                        {(location.state as any)?.prefill?.line_items?.[index]?.is_rework && (
                          <span className="self-end pb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            Rework — Cycle {(location.state as any)?.prefill?.line_items?.[index]?.rework_cycle ?? 2}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {/* Phase 15: Processing Route Stage Selector */}
                {(lineRoutes.get(index)?.length ?? 0) > 0 && (
                  <tr key={`route-${index}`} className="bg-blue-50/30 border-b border-blue-100">
                    <td />
                    <td colSpan={10} className="px-3 py-2">
                      <div className="mt-1 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-700 mb-2">Processing Route</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(lineRoutes.get(index) ?? []).map((stage) => (
                            <button
                              key={stage.id}
                              type="button"
                              onClick={() => selectStage(index, stage)}
                              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                                lineSelectedStageId.get(index) === stage.id
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'
                              }`}
                            >
                              {stage.stage_number}. {stage.process_name}
                            </button>
                          ))}
                        </div>
                        {lineSelectedStageId.get(index) && (
                          <p className="text-xs text-blue-600">
                            Stage {(lineRoutes.get(index) ?? []).find(s => s.id === lineSelectedStageId.get(index))?.stage_number} of {(lineRoutes.get(index) ?? []).length}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {/* Change 3: Stage-aware jig alerts (status-aware, no process restriction) */}
                {(() => {
                  const allJigs = lineJigs.get(index) ?? [];
                  if (allJigs.length === 0) return null;
                  const selectedStageId = lineSelectedStageId.get(index);
                  const stage =
                    selectedStageId && selectedStageId !== "manual"
                      ? lineRoutes.get(index)?.find(s => s.id === selectedStageId)
                      : null;
                  // Filter: if jig has associated_process, only show when it matches selected stage
                  const relevantJigs = allJigs.filter(jig => {
                    if (!jig.associated_process) return true;
                    if (!stage) return true;
                    const ap = jig.associated_process.trim().toLowerCase();
                    return (
                      stage.process_name.toLowerCase().includes(ap) ||
                      Boolean(stage.process_code && stage.process_code.toLowerCase() === ap)
                    );
                  });
                  if (relevantJigs.length === 0) return null;

                  const notReadyJigs = relevantJigs.filter(j => j.status === "to_be_made");
                  const okJigs = relevantJigs.filter(j => j.status === "ok" || j.status === "in_progress");
                  const checked = lineJigsChecked.get(index) ?? [];

                  return (
                    <>
                      {notReadyJigs.length > 0 && (
                        <tr key={`jigs-notready-${index}`} className="bg-red-50/30 border-b border-red-100">
                          <td />
                          <td colSpan={10} className="px-3 py-2">
                            <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                              <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> Jig Not Ready — Do Not Dispatch
                              </p>
                              {notReadyJigs.map(jig => (
                                <p key={jig.id} className="text-xs text-red-800">
                                  ⚠ Jig <strong>{jig.jig_number}</strong>
                                  {jig.associated_process ? ` for ${jig.associated_process}` : ""}
                                  {" "}is NOT YET READY. Do not dispatch until jig is available.
                                </p>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      {okJigs.length > 0 && (
                        <tr key={`jigs-ok-${index}`} className="bg-amber-50/30 border-b border-amber-100">
                          <td />
                          <td colSpan={10} className="px-3 py-2">
                            <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> Jig Required — must be sent with this component
                              </p>
                              <div className="space-y-1">
                                {okJigs.map(jig => (
                                  <label key={jig.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked.includes(jig.id)}
                                      onChange={(e) => toggleJigCheck(index, jig.id, e.target.checked)}
                                      className="rounded"
                                    />
                                    <span className={checked.includes(jig.id) ? "line-through text-slate-400" : "text-amber-800"}>
                                      {jig.jig_number}
                                      {jig.associated_process ? ` — ${jig.associated_process}` : ""}
                                    </span>
                                  </label>
                                ))}
                              </div>
                              {okJigs.some(j => !checked.includes(j.id)) && (
                                <p className="text-xs text-amber-600 mt-1 font-medium">
                                  Confirm all jigs are included before saving
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })()}
                {/* Mould alert */}
                {(lineMouldItems.get(index)?.length ?? 0) > 0 && (
                  <tr key={`mould-${index}`} className="bg-amber-50/40 border-b border-amber-100">
                    <td />
                    <td colSpan={10} className="px-3 py-2">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                        {(lineMouldItems.get(index) ?? []).map((mould) => (
                          <div key={mould.id} className="flex items-start gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 font-medium">
                              {mould.alert_message
                                ? mould.alert_message
                                : `Mould required — Confirm mould is at ${mould.vendor_name} before dispatching raw material for this item.`}
                            </p>
                          </div>
                        ))}
                        <label className="flex items-center gap-2 text-xs cursor-pointer font-medium text-amber-900">
                          <input
                            type="checkbox"
                            checked={lineMouldAcknowledged.get(index) ?? false}
                            onChange={(e) => {
                              setLineMouldAcknowledged(prev => {
                                const m = new Map(prev);
                                m.set(index, e.target.checked);
                                return m;
                              });
                            }}
                            className="rounded border-amber-400"
                          />
                          I confirm mould is at vendor
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Change 4: Collapsible full processing route (all stages, read-only) */}
                {(lineAllRoutes.get(index)?.length ?? 0) > 0 && (
                  <tr key={`allroute-${index}`} className="border-b border-slate-100">
                    <td />
                    <td colSpan={10} className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setLineRouteExpanded(prev => {
                            const m = new Map(prev);
                            m.set(index, !prev.get(index));
                            return m;
                          })
                        }
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 py-0.5"
                      >
                        <span>{lineRouteExpanded.get(index) ? "▾" : "▸"}</span>
                        View Processing Route ({lineAllRoutes.get(index)?.length} stages)
                      </button>
                      {lineRouteExpanded.get(index) && (
                        <div className="mt-2 mb-1 space-y-1 pl-1">
                          {(lineAllRoutes.get(index) ?? []).map(stage => {
                            const isSelected = lineSelectedStageId.get(index) === stage.id;
                            return (
                              <div
                                key={stage.id}
                                className={`flex items-center gap-2 text-xs py-1 px-2 rounded transition-colors ${
                                  isSelected
                                    ? "bg-blue-100 text-blue-800 font-medium"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <span className="font-mono w-5 text-right shrink-0 text-slate-400">
                                  {stage.stage_number}.
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                                    stage.stage_type === "external"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {stage.stage_type === "external" ? "Ext" : "Int"}
                                </span>
                                <span className="flex-1 truncate">{stage.process_name}</span>
                                {isSelected && (
                                  <span className="text-blue-500 text-[10px] shrink-0">← this DC</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addLineItem}
          className="w-full h-10 border-t border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add Line Item
        </button>
      </div>

      {/* Totals & Footer */}
      <div className="paper-card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left - Notes & Signatures */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Special Instructions</Label>
              <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Internal Remarks</Label>
              <Textarea value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} className="mt-1" rows={2} />
              <p className="text-[10px] text-muted-foreground mt-1">Not printed on document</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Prepared By</Label>
                <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="mt-1" placeholder="Name" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Checked By</Label>
                <Input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} className="mt-1" placeholder="Name" />
              </div>
            </div>

            {isReturnable && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm space-y-1">
                <p className="font-medium text-primary">
                  {dcType === "returnable" ? "RETURNABLE DELIVERY CHALLAN"
                    : dcType === "job_work_out" ? "JOB WORK CHALLAN — RULE 45"
                    : dcType === "loan_borrow" ? "LOAN / BORROW CHALLAN"
                    : "JOB WORK CHALLAN (SEC 143)"}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  NOT FOR SALE
                  {dcType === "job_work_143" ? " — JOB WORK ONLY" : ""}
                  {dcType === "job_work_out" ? " — RETURN WITHIN 1 YEAR" : ""}
                </p>
              </div>
            )}
          </div>

          {/* Right - Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(subTotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                GST Rate
                <Select value={String(gstRate)} onValueChange={(v) => setGstRate(Number(v))}>
                  <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 5, 12, 18, 28].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </div>
            {isJobWork143 ? (
              <div className="text-xs text-blue-600 italic">No GST — Sec 143 Job Work</div>
            ) : gstType === 'cgst_sgst' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {gstRate}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(taxResult.igst)}</span>
              </div>
            )}
            <div className="border-t border-border my-1" />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
            </div>
            <div className="bg-muted/50 rounded p-2 text-xs text-muted-foreground">
              {amountInWords(grandTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex justify-end gap-2 z-40">
        <Button variant="outline" onClick={() => navigate("/delivery-challans")}>Cancel</Button>
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
          Save as Draft
        </Button>
        <Button onClick={() => handleSave("issued")} disabled={saveMutation.isPending}>
          Issue DC →
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>DC Issued Successfully! 🎉</DialogTitle>
            <DialogDescription>DC / Job Work Order {dcNumber} has been issued.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/delivery-challans/${savedDCId}`)}>View DC</Button>
            {isJobWorkDC && (
              <Button variant="outline" onClick={openJCDialog}>Create Job Cards →</Button>
            )}
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/delivery-challans/new"); }}>Create Another</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Cards Creation Dialog */}
      <Dialog open={jcDialogOpen} onOpenChange={v => { if (!jcCreating) setJcDialogOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Job Cards</DialogTitle>
            <DialogDescription>Select the processing stage for each item sent for job work.</DialogDescription>
          </DialogHeader>

          {jcDone ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{jcResults.length} job card{jcResults.length !== 1 ? 's' : ''} created</span>
              </div>
              <div className="space-y-1">
                {jcResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border rounded px-3 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{r.jcNumber}</span>
                    <span className="font-medium">{r.itemCode}</span>
                  </div>
                ))}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setJcDialogOpen(false); navigate("/delivery-challans/new"); }}>Create Another DC</Button>
                <Button onClick={() => navigate("/job-cards")}>View Job Cards →</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {jcItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No line items to create job cards for.</p>
              )}
              {jcItems.map((item, idx) => (
                <div key={idx} className={`border rounded-lg p-3 space-y-2 ${item.skip ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-sm">{item.lineItem.item_code || '—'}</span>
                      {item.lineItem.description && <span className="text-xs text-muted-foreground ml-2">{item.lineItem.description}</span>}
                      <span className="text-xs text-muted-foreground ml-2">× {item.lineItem.quantity} {item.lineItem.unit}</span>
                    </div>
                    <button
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => setJcItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], skip: !u[idx].skip }; return u; })}
                    >
                      {item.skip ? 'Undo skip' : 'Skip'}
                    </button>
                  </div>

                  {!item.skip && (
                    <>
                      {item.routes.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No BOM processing route found — job card will be created with no stage.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {item.routes.map(route => (
                            <button
                              key={route.id}
                              onClick={() => setJcItems(prev => {
                                const u = [...prev];
                                u[idx] = { ...u[idx], selectedStageNumber: route.stage_number, existingMode: route.stage_number > 1 };
                                return u;
                              })}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                item.selectedStageNumber === route.stage_number
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              {route.stage_number}. {route.process_name}
                              <span className="ml-1 opacity-60">{route.stage_type === 'internal' ? '(internal)' : '(vendor)'}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {item.selectedStageNumber !== null && item.selectedStageNumber > 1 && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
                          <p className="font-medium text-amber-800">Stage {item.selectedStageNumber} — does an existing job card cover earlier stages?</p>
                          <div className="flex gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name={`jc-mode-${idx}`} checked={item.existingMode && item.useExisting} onChange={() => setJcItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], useExisting: true }; return u; })} />
                              <span>Yes, link existing JC</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name={`jc-mode-${idx}`} checked={!item.useExisting} onChange={() => setJcItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], useExisting: false }; return u; })} />
                              <span>No, create new JC</span>
                            </label>
                          </div>
                          {item.useExisting && (
                            <input
                              className="w-full border rounded px-2 py-1 text-xs"
                              placeholder="JC number (e.g. JW-0042)"
                              value={item.existingJCNumber}
                              onChange={e => setJcItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], existingJCNumber: e.target.value }; return u; })}
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => { setJcDialogOpen(false); navigate(`/delivery-challans/${savedDCId}`); }}>Skip — View DC</Button>
                <Button
                  onClick={handleCreateJC}
                  disabled={jcCreating || jcItems.every(i => i.skip || i.selectedStageNumber === null)}
                >
                  {jcCreating ? 'Creating…' : 'Create Job Cards'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
