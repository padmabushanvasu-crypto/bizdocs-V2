import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, Info } from "lucide-react";
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
  type DCLineItem,
} from "@/lib/delivery-challans-api";
import { formatCurrency, amountInWords, calculateGST } from "@/lib/gst-utils";

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
  };
}

export default function DeliveryChallanForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
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
  const [approxValue, setApproxValue] = useState<number | undefined>();
  const [poReference, setPoReference] = useState("");
  const [poDate, setPoDate] = useState<Date | undefined>();
  const [gstRate, setGstRate] = useState(18);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");

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
      setDcType(existingDC.dc_type);
      setDcDate(new Date(existingDC.dc_date));
      setPartyId(existingDC.party_id);
      setReferenceNumber(existingDC.reference_number || "");
      setSpecialInstructions(existingDC.special_instructions || "");
      setInternalRemarks(existingDC.internal_remarks || "");
      setNatureOfJobWork(existingDC.nature_of_job_work || "");
      setVehicleNumber(existingDC.vehicle_number || "");
      setLoNumber(existingDC.lo_number || "");
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
  const subTotal = useMemo(() => lineItems.reduce((s, i) => s + (i.amount || 0), 0), [lineItems]);
  const totalItems = lineItems.filter((i) => i.description.trim()).length;
  const totalQty = lineItems.reduce((s, i) => s + (i.quantity || 0), 0);
  const isReturnable = ["returnable", "job_work_143", "job_work_out", "loan_borrow"].includes(dcType);
  const isRule45 = dcType === "job_work_out";

  const companyStateCode = company?.state_code || "33";
  const partyStateCode = selectedParty?.state_code || companyStateCode;
  const gstResult = useMemo(() => calculateGST(companyStateCode, partyStateCode, subTotal, gstRate), [companyStateCode, partyStateCode, subTotal, gstRate]);
  const grandTotal = Math.round((subTotal + gstResult.total) * 100) / 100;

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
        lo_number: loNumber || null,
        approx_value: approxValue ?? null,
        sub_total: subTotal,
        cgst_amount: gstResult.cgst,
        sgst_amount: gstResult.sgst,
        igst_amount: gstResult.igst,
        total_gst: gstResult.total,
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
        <div className="grid grid-cols-2 gap-3">
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

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <h2 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-2">Consignee & DC Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left - Consignee */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Party / Consignee *</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">DC Number</Label>
                <Input value={dcNumber} onChange={(e) => setDcNumber(e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">DC Date *</Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Vehicle Number</Label>
                <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" placeholder="e.g., MH-01-AB-1234" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">L.O. No / Works Order Ref</Label>
                <Input value={loNumber} onChange={(e) => setLoNumber(e.target.value)} className="mt-1" placeholder="Works order / job order no." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Approx. Value ₹</Label>
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
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">PO Reference</Label>
                <Input value={poReference} onChange={(e) => setPoReference(e.target.value)} className="mt-1" placeholder="PO number" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">PO Date</Label>
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
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Return Due Date</Label>
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left w-[100px]">Item Code</th>
                <th className="px-3 py-2 text-left min-w-[180px]">Description</th>
                <th className="px-3 py-2 text-left min-w-[160px]">Nature of Process</th>
                <th className="px-3 py-2 text-left w-[90px]">Drawing #</th>
                <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                <th className="px-3 py-2 text-right w-[75px]">Qty</th>
                <th className="px-3 py-2 text-right w-[65px]">KGS</th>
                <th className="px-3 py-2 text-right w-[65px]">SFT</th>
                <th className="px-3 py-2 text-right w-[90px]">Rate (₹)</th>
                <th className="px-3 py-2 text-right w-[100px]">Amount (₹)</th>
                <th className="px-3 py-2 text-left min-w-[100px]">Remarks</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="px-3 py-2 text-muted-foreground font-mono text-sm">{item.serial_number}</td>
                  <td className="px-3 py-2">
                    <ItemSuggest
                      value={item.item_code || ""}
                      onChange={(v) => updateLineItem(index, "item_code", v)}
                      onSelect={(selectedItem) => {
                        updateLineItem(index, "item_code", selectedItem.item_code);
                        updateLineItem(index, "description", selectedItem.description);
                        updateLineItem(index, "unit", selectedItem.unit || "NOS");
                        updateLineItem(index, "rate", selectedItem.sale_price || 0);
                        updateLineItem(index, "drawing_number", selectedItem.drawing_number || "");
                        // Recalculate amount
                        setLineItems((items) => {
                          const updated = [...items];
                          updated[index].amount = Math.round((updated[index].quantity || 0) * (selectedItem.sale_price || 0) * 100) / 100;
                          return updated;
                        });
                      }}
                      placeholder="Code"
                      className="h-8 text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                      placeholder="Item description"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.nature_of_process || ""}
                      onChange={(e) => updateLineItem(index, "nature_of_process", e.target.value)}
                      placeholder="e.g. Nickel Plating, CNC Machining & Return"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.drawing_number || ""}
                      onChange={(e) => updateLineItem(index, "drawing_number", e.target.value)}
                      placeholder="DWG-001"
                      className="h-8 text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.unit || "NOS"}
                      onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                      className="h-8 text-sm text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.001"
                      value={item.qty_kgs ?? ""}
                      onChange={(e) => updateLineItem(index, "qty_kgs", e.target.value ? Number(e.target.value) : undefined)}
                      className="h-8 text-sm text-right font-mono"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.qty_sft ?? ""}
                      onChange={(e) => updateLineItem(index, "qty_sft", e.target.value ? Number(e.target.value) : undefined)}
                      className="h-8 text-sm text-right font-mono"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.rate || ""}
                      onChange={(e) => updateLineItem(index, "rate", Number(e.target.value))}
                      className="h-8 text-sm text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-medium">
                    {formatCurrency(item.amount || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.remarks || ""}
                      onChange={(e) => updateLineItem(index, "remarks", e.target.value)}
                      placeholder="Remarks"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {lineItems.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLineItem(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addLineItem}
          className="w-full py-3 border-t border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {/* Totals & Footer */}
      <div className="paper-card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left - Notes & Signatures */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Special Instructions</Label>
              <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Internal Remarks</Label>
              <Textarea value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} className="mt-1" rows={2} />
              <p className="text-[10px] text-muted-foreground mt-1">Not printed on document</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Prepared By</Label>
                <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="mt-1" placeholder="Name" />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Checked By</Label>
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
            {gstResult.type === "CGST_SGST" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(gstResult.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(gstResult.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST @ {gstRate}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(gstResult.igst)}</span>
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
