import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, Info, ChevronLeft, Loader2 } from "lucide-react";
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
  fetchOpenJobWorksForDC,
  type DCLineItem,
  type OpenJobWorkDCItem,
} from "@/lib/delivery-challans-api";
import { fetchOpenJobWorks, fetchJobWork } from "@/lib/job-works-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { getGSTType, calculateLineTax, round2, resolveStateCode, type GSTType } from "@/lib/tax-utils";

const RETURNABLE_SUBTYPES = [
  { value: "returnable", label: "Standard Returnable" },
  { value: "job_work_143", label: "Job Work (Sec 143)" },
  { value: "job_work_out", label: "Job Work Out (Rule 45)" },
  { value: "loan_borrow", label: "Loan / Borrow" },
];

const NON_RETURNABLE_SUBTYPES = [
  { value: "non_returnable", label: "Standard Non-Returnable" },
  { value: "supply", label: "Supply" },
  { value: "sample", label: "Sample" },
  { value: "job_work_return", label: "Job Work Return" },
];

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
  const [dcType, setDcType] = useState("returnable");
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
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [loNumber, setLoNumber] = useState("");
  const [jobWorkId, setJobWorkId] = useState<string | null>(null);
  const [jobWorkNumber, setJobWorkNumber] = useState("");
  const [jobWorkOpen, setJobWorkOpen] = useState(false);
  const [prefillBanner, setPrefillBanner] = useState("");
  const [approxValue, setApproxValue] = useState<number | undefined>();
  const [poReference, setPoReference] = useState("");
  const [poDate, setPoDate] = useState<Date | undefined>();
  const [gstRate, setGstRate] = useState(18);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  // Multi-JW picker
  const [jwPickerOpen, setJwPickerOpen] = useState(false);
  const [jwPickerSelected, setJwPickerSelected] = useState<Set<string>>(new Set());
  const [jwPickerSearch, setJwPickerSearch] = useState("");
  const [jwVendorFilterOwn, setJwVendorFilterOwn] = useState(true);

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

  const { data: openJobWorks = [] } = useQuery({
    queryKey: ["open-job-works"],
    queryFn: fetchOpenJobWorks,
  });

  const { data: openJWsForDC = [], isLoading: isJWsLoading, isError: isJWsError, refetch: refetchJWsForDC } = useQuery<OpenJobWorkDCItem[]>({
    queryKey: ["open-jws-for-dc"],
    queryFn: () => fetchOpenJobWorksForDC(),
    enabled: jwPickerOpen,
    staleTime: 0,
  });

  useEffect(() => {
    if (jwPickerOpen) refetchJWsForDC();
  }, [jwPickerOpen]);

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
      setDcType(existingDC.dc_type);
      setDcDate(new Date(existingDC.dc_date));
      setPartyId(existingDC.party_id);
      setReferenceNumber(existingDC.reference_number || "");
      setSpecialInstructions(existingDC.special_instructions || "");
      setInternalRemarks(existingDC.internal_remarks || "");
      setNatureOfJobWork(existingDC.nature_of_job_work || "");
      setVehicleNumber(existingDC.vehicle_number || "");
      setLoNumber(existingDC.lo_number || "");
      setJobWorkId(existingDC.job_work_id || null);
      setJobWorkNumber(existingDC.job_work_number || "");
      setApproxValue(existingDC.approx_value ?? undefined);
      setPoReference(existingDC.po_reference || "");
      setGstRate(existingDC.gst_rate || 18);
      setPreparedBy(existingDC.prepared_by || "");
      setCheckedBy(existingDC.checked_by || "");
      if (existingDC.po_date) setPoDate(new Date(existingDC.po_date));
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

    if (prefill.dc_type) setDcType(prefill.dc_type);
    if (prefill.job_work_id) setJobWorkId(prefill.job_work_id);
    if (prefill.job_work_number) {
      setJobWorkNumber(prefill.job_work_number);
      setPrefillBanner(`Pre-filled from Job Work ${prefill.job_work_number} — review and confirm before saving`);
    }
    if (prefill.party_id) {
      setPartyId(prefill.party_id);
      const p = parties.find((p) => p.id === prefill.party_id);
      if (p) setSelectedParty(p);
    }
    if (prefill.line_items?.length) {
      const items: DCLineItem[] = (prefill.line_items as any[]).map((li, idx) => ({
        serial_number: idx + 1,
        item_code: li.item_code || "",
        description: li.description || "",
        drawing_number: li.drawing_number || "",
        unit: li.unit || "NOS",
        quantity: li.quantity || 0,
        rate: 0,
        amount: 0,
        nature_of_process: li.nature_of_process || "",
        qty_kgs: undefined,
        qty_sft: undefined,
        job_work_id: li.job_work_id || null,
        job_work_number: li.job_work_number || null,
        job_work_step_id: li.job_work_step_id || null,
      }));
      setLineItems(items);
    }
  }, [location.state, parties, isEdit]);

  const handleJobWorkSelect = async (jw: { id: string; jc_number: string; item_code: string | null; item_description: string | null }) => {
    setJobWorkId(jw.id);
    setJobWorkNumber(jw.jc_number);
    setJobWorkOpen(false);
    setDcType("returnable");
    try {
      const full = await fetchJobWork(jw.id);
      const activeStep = full.steps.find((s) => s.step_type === "external" && s.status !== "done");
      if (activeStep?.vendor_id) {
        const p = parties.find((p) => p.id === activeStep.vendor_id);
        if (p) { setPartyId(p.id); setSelectedParty(p); }
      }
      const extSteps = full.steps.filter((s) => s.step_type === "external");
      if (extSteps.length > 0) {
        setLineItems(extSteps.map((s, idx) => ({
          serial_number: idx + 1,
          item_code: full.item_code || "",
          description: full.item_description || "",
          drawing_number: full.drawing_number || "",
          unit: s.unit || full.unit || "NOS",
          quantity: s.qty_sent || 0,
          rate: 0,
          amount: 0,
          nature_of_process: s.name || "",
          qty_kgs: undefined,
          qty_sft: undefined,
        })));
      }
    } catch {
      // just set the JW reference, don't fail
    }
  };

  const handlePartySelect = (party: Party) => {
    setPartyId(party.id);
    setSelectedParty(party);
    setPartyOpen(false);
  };

  const handleAddFromJobWorks = () => {
    const selectedRows = openJWsForDC.filter((r) => jwPickerSelected.has(r.step_id));
    if (selectedRows.length === 0) return;

    // Vendor check
    const firstVendorId = selectedRows[0].vendor_id;
    if (!selectedParty && firstVendorId) {
      const p = parties.find((p) => p.id === firstVendorId);
      if (p) { setPartyId(p.id); setSelectedParty(p); }
    } else if (selectedParty) {
      const mismatch = selectedRows.some((r) => r.vendor_id && r.vendor_id !== selectedParty.id);
      if (mismatch) {
        toast({ title: "Vendor mismatch warning", description: "Some selected job works are for a different vendor. Review before issuing.", variant: "destructive" });
      }
    }

    const newItems: DCLineItem[] = selectedRows.map((r, idx) => ({
      serial_number: lineItems.filter((i) => i.description.trim()).length + idx + 1,
      item_code: r.item_code || "",
      description: r.item_description || "",
      drawing_number: r.drawing_revision || r.drawing_number || "",
      unit: r.step_unit || r.unit || "NOS",
      quantity: r.step_qty_sent ?? r.quantity_original,
      rate: 0,
      amount: 0,
      nature_of_process: r.step_name || "",
      qty_kgs: undefined,
      qty_sft: undefined,
      job_work_id: r.jc_id,
      job_work_number: r.jc_number,
      job_work_step_id: r.step_id,
    }));

    // Append (clearing blank placeholder if it's the only item)
    const existingFilled = lineItems.filter((i) => i.description.trim());
    const merged = existingFilled.length === 0
      ? newItems
      : [...existingFilled, ...newItems];
    setLineItems(merged.map((i, idx) => ({ ...i, serial_number: idx + 1 })));
    setDcType("returnable");
    setJwPickerOpen(false);
    setJwPickerSelected(new Set());
    setJwPickerSearch("");
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
  const isReturnable = ["returnable", "job_work_143", "job_work_out", "loan_borrow"].includes(dcType);
  const isRule45 = dcType === "job_work_out";
  const isJobWork143 = dcType === "job_work_143";

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
        driver_name: null,
        lo_number: null,
        job_work_id: jobWorkId || null,
        job_work_number: jobWorkNumber || null,
        approx_value: approxValue ?? null,
        sub_total: subTotal,
        cgst_amount: taxResult.cgst,
        sgst_amount: taxResult.sgst,
        igst_amount: taxResult.igst,
        total_gst: taxResult.total,
        grand_total: grandTotal,
        gst_rate: gstRate,
        po_reference: poReference || null,
        po_date: poDate ? format(poDate, "yyyy-MM-dd") : null,
        challan_category: "supply_on_approval",
        prepared_by: preparedBy || null,
        checked_by: checkedBy || null,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1, qty_nos: i.quantity }));

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
    saveMutation.mutate(status);
  };

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
          {isEdit ? "Edit Delivery Challan" : "New Delivery Challan"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing DC ${dcNumber}` : "Create a new delivery challan"}
        </p>
      </div>

      {/* DC Type Selector */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => { if (!isReturnable) setDcType("returnable"); }}
            className={cn(
              "p-4 rounded-xl border-2 text-center transition-all",
              isReturnable ? "border-blue-500 bg-blue-50" : "border-border hover:border-muted-foreground/40"
            )}
          >
            <p className="font-bold text-sm text-foreground">RETURNABLE</p>
            <p className="text-xs text-muted-foreground mt-1">Goods to be returned after processing</p>
          </button>
          <button
            onClick={() => { if (isReturnable) setDcType("non_returnable"); }}
            className={cn(
              "p-4 rounded-xl border-2 text-center transition-all",
              !isReturnable ? "border-blue-500 bg-blue-50" : "border-border hover:border-muted-foreground/40"
            )}
          >
            <p className="font-bold text-sm text-foreground">NON-RETURNABLE</p>
            <p className="text-xs text-muted-foreground mt-1">Goods sent permanently to party</p>
          </button>
        </div>
        <Select value={dcType} onValueChange={setDcType}>
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

      {/* Job Work Sec 143 — no GST note */}
      {isJobWork143 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-800 text-sm">Section 143 — Job Work Challan (No GST)</p>
            <p className="text-xs text-blue-700 mt-1">
              No GST is applicable on goods sent for job work under Section 143 of the CGST Act.
              Goods must be returned within <strong>1 year</strong> (3 years for capital goods).
              The approximate value field is used only for e-way bill purposes.
            </p>
          </div>
        </div>
      )}

      {/* GST Rule 45 Banner */}
      {isRule45 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">GST Rule 45 — Job Work Challan</p>
            <p className="text-xs text-amber-700 mt-1">
              Goods sent for job work must be returned within <strong>1 year (365 days)</strong> from
              the date of dispatch. Failure to return within the prescribed time will attract GST
              liability as if a supply was made on the date of original dispatch.
            </p>
          </div>
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
              <div>
                <Label className="text-sm font-medium text-slate-700">Job Work Reference</Label>
                <Popover open={jobWorkOpen} onOpenChange={setJobWorkOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal text-sm h-9">
                      {jobWorkNumber || "Link to Job Work..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search job works..." />
                      <CommandList>
                        <CommandEmpty>No open job works found.</CommandEmpty>
                        <CommandGroup>
                          {openJobWorks.map((jw) => (
                            <CommandItem key={jw.id} value={jw.jc_number} onSelect={() => handleJobWorkSelect(jw)}>
                              <div>
                                <p className="font-mono font-medium text-sm">{jw.jc_number}</p>
                                {jw.item_description && (
                                  <p className="text-xs text-muted-foreground">{jw.item_code ? `${jw.item_code} — ` : ""}{jw.item_description}</p>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {jobWorkId && (
                  <button
                    type="button"
                    onClick={() => { setJobWorkId(null); setJobWorkNumber(""); }}
                    className="text-[10px] text-muted-foreground hover:text-destructive mt-0.5"
                  >
                    Clear
                  </button>
                )}
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
              <div>
                <Label className="text-sm font-medium text-slate-700">PO Reference</Label>
                <Input value={poReference} onChange={(e) => setPoReference(e.target.value)} className="mt-1" placeholder="PO number" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">PO Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !poDate && "text-muted-foreground")}>
                      {poDate ? format(poDate, "dd MMM yyyy") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={poDate} onSelect={setPoDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {isReturnable && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Return Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !returnDueDate && "text-muted-foreground")}>
                      {returnDueDate ? format(returnDueDate, "dd MMM yyyy") : "Select return date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={returnDueDate} onSelect={setReturnDueDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs"
            onClick={() => setJwPickerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add from Job Works
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left w-8 text-xs font-medium text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-3 py-2 text-left w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">Job Work</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Item / Description</th>
                <th className="px-3 py-2 text-left w-32 text-xs font-medium text-slate-400 uppercase tracking-wider">Drawing No</th>
                <th className="px-3 py-2 text-left w-48 text-xs font-medium text-slate-400 uppercase tracking-wider">Nature of Process</th>
                <th className="px-3 py-2 text-right w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">Qty</th>
                <th className="px-3 py-2 text-right w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">KGS</th>
                <th className="px-3 py-2 text-right w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">SFT</th>
                <th className="px-3 py-2 text-left w-24 text-xs font-medium text-slate-400 uppercase tracking-wider">Unit</th>
                <th className="px-3 py-2 text-right w-28 text-xs font-medium text-slate-400 uppercase tracking-wider">Rate ₹</th>
                <th className="px-3 py-2 text-right w-28 text-xs font-medium text-slate-400 uppercase tracking-wider">Amount ₹</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={index} className="group border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-muted-foreground font-mono text-sm w-8">{item.serial_number}</td>
                  <td className="px-3 py-2 w-24">
                    {item.job_work_number ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                        {item.job_work_number}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
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
                      }}
                      placeholder="Item description"
                      className="h-8 text-sm w-full"
                    />
                  </td>
                  <td className="p-0 w-32">
                    <input
                      type="text"
                      value={item.drawing_number || ""}
                      onChange={(e) => updateLineItem(index, "drawing_number", e.target.value)}
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
                    <input
                      type="number"
                      step="0.001"
                      value={item.qty_kgs ?? ""}
                      onChange={(e) => updateLineItem(index, "qty_kgs", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="—"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums placeholder:text-slate-300"
                    />
                  </td>
                  <td className="p-0 w-24">
                    <input
                      type="number"
                      step="0.01"
                      value={item.qty_sft ?? ""}
                      onChange={(e) => updateLineItem(index, "qty_sft", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="—"
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums placeholder:text-slate-300"
                    />
                  </td>
                  <td className="p-0 w-24">
                    <input
                      type="text"
                      value={item.unit || "NOS"}
                      onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm"
                    />
                  </td>
                  <td className="p-0 w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={item.rate || ""}
                      onChange={(e) => updateLineItem(index, "rate", Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 bg-transparent border-none outline-none focus:bg-blue-50 text-sm text-right font-mono tabular-nums"
                    />
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

      {/* Add from Job Works picker */}
      <Dialog open={jwPickerOpen} onOpenChange={(o) => { setJwPickerOpen(o); if (!o) { setJwPickerSelected(new Set()); setJwPickerSearch(""); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Job Works to add to this DC</DialogTitle>
            <DialogDescription>
              Select external steps to add as line items.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by drawing number, item or vendor..."
              value={jwPickerSearch}
              onChange={(e) => setJwPickerSearch(e.target.value)}
              className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {selectedParty && (
              <button
                type="button"
                onClick={() => setJwVendorFilterOwn((v) => !v)}
                className={cn(
                  "shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap",
                  jwVendorFilterOwn
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {jwVendorFilterOwn ? "This vendor only" : "All vendors"}
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 border rounded-lg">
            {isJWsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Loading job works...
              </div>
            ) : isJWsError ? (
              <div className="text-center py-10 text-sm text-destructive">
                Failed to load job works. Please close and try again.
              </div>
            ) : openJWsForDC.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No open job works found.
              </div>
            ) : (
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-secondary sticky top-0">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          const filtered = openJWsForDC.filter((r) => {
                            if (selectedParty && jwVendorFilterOwn && r.vendor_id && r.vendor_id !== selectedParty.id) return false;
                            const q = jwPickerSearch.toLowerCase();
                            return !q || r.jc_number.toLowerCase().includes(q) || (r.item_description ?? "").toLowerCase().includes(q) || r.step_name.toLowerCase().includes(q) || (r.drawing_revision ?? "").toLowerCase().includes(q) || (r.vendor_name ?? "").toLowerCase().includes(q);
                          });
                          setJwPickerSelected(e.target.checked ? new Set(filtered.map((r) => r.step_id)) : new Set());
                        }}
                        checked={jwPickerSelected.size > 0 && openJWsForDC.filter((r) => {
                            if (selectedParty && jwVendorFilterOwn && r.vendor_id && r.vendor_id !== selectedParty.id) return false;
                            const q = jwPickerSearch.toLowerCase();
                            return !q || r.jc_number.toLowerCase().includes(q) || (r.item_description ?? "").toLowerCase().includes(q) || r.step_name.toLowerCase().includes(q) || (r.drawing_revision ?? "").toLowerCase().includes(q) || (r.vendor_name ?? "").toLowerCase().includes(q);
                          }).every((r) => jwPickerSelected.has(r.step_id))}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">JW Number</th>
                    <th className="px-3 py-2 text-left">Drawing No.</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-left">Process</th>
                    <th className="px-3 py-2 text-left">Due Date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openJWsForDC
                    .filter((r) => {
                      if (selectedParty && jwVendorFilterOwn && r.vendor_id && r.vendor_id !== selectedParty.id) return false;
                      const q = jwPickerSearch.toLowerCase();
                      return !q || r.jc_number.toLowerCase().includes(q) || (r.item_description ?? "").toLowerCase().includes(q) || r.step_name.toLowerCase().includes(q) || (r.drawing_revision ?? "").toLowerCase().includes(q) || (r.vendor_name ?? "").toLowerCase().includes(q);
                    })
                    .map((r) => {
                      const isVendorMismatch = !!(selectedParty && r.vendor_id && r.vendor_id !== selectedParty.id);
                      const isOverdue = r.return_before_date ? new Date(r.return_before_date) < new Date() : false;
                      return (
                        <tr
                          key={r.step_id}
                          className={cn(
                            "border-t border-border cursor-pointer hover:bg-muted/40 transition-colors",
                            jwPickerSelected.has(r.step_id) && "bg-blue-50 border-l-2 border-l-blue-500",
                            isVendorMismatch && "opacity-75"
                          )}
                          onClick={() => setJwPickerSelected((prev) => { const n = new Set(prev); n.has(r.step_id) ? n.delete(r.step_id) : n.add(r.step_id); return n; })}
                        >
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={jwPickerSelected.has(r.step_id)}
                              onChange={() => setJwPickerSelected((prev) => { const n = new Set(prev); n.has(r.step_id) ? n.delete(r.step_id) : n.add(r.step_id); return n; })}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-medium text-blue-700">{r.jc_number}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.drawing_revision || r.drawing_number || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs max-w-[160px] truncate" title={r.item_description ?? ""}>{r.item_description || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-sm">{r.step_qty_sent ?? r.quantity_original}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.step_unit || r.unit || "NOS"}</td>
                          <td className="px-3 py-2 text-xs">
                            {isVendorMismatch ? (
                              <span className="text-amber-600 flex items-center gap-1">
                                <Info className="h-3 w-3 shrink-0" /> {r.vendor_name || "—"}
                              </span>
                            ) : (r.vendor_name || "—")}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.step_name}</td>
                          <td className="px-3 py-2 text-xs">
                            {r.return_before_date ? (
                              <span className={isOverdue ? "text-red-600 font-medium" : "text-slate-600"}>
                                {format(new Date(r.return_before_date), "dd MMM yy")}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                              isOverdue ? "bg-red-50 text-red-700 border-red-200" :
                              r.jc_status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
                              "bg-slate-100 text-slate-600 border-slate-200"
                            )}>
                              {isOverdue ? "Overdue" : r.jc_status === "in_progress" ? "In Progress" : "Draft"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="mt-3">
            <span className="text-sm text-muted-foreground mr-auto">
              {jwPickerSelected.size > 0 ? `${jwPickerSelected.size} job work${jwPickerSelected.size !== 1 ? "s" : ""} selected` : "None selected"}
            </span>
            <Button variant="outline" onClick={() => setJwPickerOpen(false)}>Cancel</Button>
            <Button
              disabled={jwPickerSelected.size === 0}
              onClick={handleAddFromJobWorks}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Add {jwPickerSelected.size > 0 ? `${jwPickerSelected.size} Selected` : "Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>DC Issued Successfully! 🎉</DialogTitle>
            <DialogDescription>Delivery Challan {dcNumber} has been issued.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/delivery-challans/${savedDCId}`)}>View DC</Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/delivery-challans/new"); }}>Create Another</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
