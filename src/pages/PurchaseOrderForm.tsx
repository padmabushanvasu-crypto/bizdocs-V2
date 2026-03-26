import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, Info, ChevronDown, ChevronLeft } from "lucide-react";
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
import { fetchItems, type Item } from "@/lib/items-api";
import {
  fetchPurchaseOrder,
  getNextPONumber,
  createPurchaseOrder,
  updatePurchaseOrder,
  issuePurchaseOrder,
  type POLineItem,
} from "@/lib/purchase-orders-api";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { getGSTType, calculateLineTax, round2, type GSTType } from "@/lib/tax-utils";

const UNITS = ["NOS", "KG", "MTR", "SFT", "SET", "ROLL", "SHEET", "LITRE", "BOX"];
const PAYMENT_TERMS = ["Immediate", "7 Days", "15 Days", "30 Days", "45 Days", "60 Days", "Custom"];
const GST_RATES = [0, 5, 12, 18, 28];
// Company state code fetched dynamically from settings

function emptyLineItem(serial: number): POLineItem {
  return {
    serial_number: serial,
    description: "",
    drawing_number: "",
    quantity: 0,
    unit: "NOS",
    unit_price: 0,
    line_total: 0,
    gst_rate: 18,
  };
}

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const prefillState = location.state as { vendor_id?: string; prefill_items?: { item_id: string; description: string; qty: number; unit: string }[] } | null;
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Form state
  const [poNumber, setPONumber] = useState("");
  const [poDate, setPODate] = useState<Date>(new Date());
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Party | null>(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [lineItems, setLineItems] = useState<POLineItem[]>([emptyLineItem(1)]);
  const [gstRate, setGstRate] = useState(18);
  const [additionalCharges, setAdditionalCharges] = useState<{ label: string; amount: number }[]>([]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedPOId, setSavedPOId] = useState<string | null>(null);

  // Fetch company settings for state code
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const COMPANY_STATE_CODE = companySettings?.state_code || "";

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["parties-vendors"],
    queryFn: () => fetchParties({ type: "vendor", status: "active", pageSize: 500 }),
  });
  const vendors = vendorsData?.data ?? [];

  // Fetch next PO number
  const { data: nextNumber } = useQuery({
    queryKey: ["next-po-number"],
    queryFn: getNextPONumber,
    enabled: !isEdit,
  });

  // Load existing PO for edit
  const { data: existingPO } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchPurchaseOrder(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!isEdit && nextNumber) setPONumber(nextNumber);
  }, [nextNumber, isEdit]);

  useEffect(() => {
    if (existingPO) {
      setPONumber(existingPO.po_number);
      setPODate(new Date(existingPO.po_date));
      setVendorId(existingPO.vendor_id);
      setReferenceNumber(existingPO.reference_number || "");
      setPaymentTerms(existingPO.payment_terms || "");
      setDeliveryAddress(existingPO.delivery_address || "");
      setSpecialInstructions(existingPO.special_instructions || "");
      setInternalRemarks(existingPO.internal_remarks || "");
      setGstRate(existingPO.gst_rate || 18);
      setAdditionalCharges(existingPO.additional_charges || []);
      if (existingPO.line_items?.length) {
        setLineItems(existingPO.line_items);
      }
      // Find vendor
      if (existingPO.vendor_id) {
        const v = vendors.find((v) => v.id === existingPO.vendor_id);
        if (v) setSelectedVendor(v);
      }
    }
  }, [existingPO, vendors]);

  // Pre-fill from Reorder Intelligence
  useEffect(() => {
    if (isEdit || !prefillState || prefillApplied || vendors.length === 0) return;
    if (prefillState.vendor_id) {
      const v = vendors.find((v) => v.id === prefillState.vendor_id);
      if (v) {
        setVendorId(v.id);
        setSelectedVendor(v);
        if (v.payment_terms) setPaymentTerms(v.payment_terms);
      }
    }
    if (prefillState.prefill_items?.length) {
      const items: POLineItem[] = prefillState.prefill_items.map((pi, idx) => ({
        serial_number: idx + 1,
        description: pi.description,
        drawing_number: "",
        quantity: pi.qty,
        unit: pi.unit || "NOS",
        unit_price: 0,
        line_total: 0,
        gst_rate: 18,
      }));
      setLineItems(items);
    }
    setPrefillApplied(true);
  }, [isEdit, prefillState, prefillApplied, vendors]);

  const handleVendorSelect = (vendor: Party) => {
    setVendorId(vendor.id);
    setSelectedVendor(vendor);
    setVendorOpen(false);
    if (vendor.payment_terms && !paymentTerms) {
      setPaymentTerms(vendor.payment_terms);
    }
  };

  // Line item handlers
  const updateLineItem = (index: number, field: keyof POLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
      if (field === "quantity" || field === "unit_price") {
        updated[index].line_total = Math.round(updated[index].quantity * updated[index].unit_price * 100) / 100;
      }
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems((items) => [...items, emptyLineItem(items.length + 1)]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((items) => {
      const updated = items.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, serial_number: i + 1 }));
    });
  };

  const addCharge = () => setAdditionalCharges((c) => [...c, { label: "", amount: 0 }]);
  const removeCharge = (index: number) => setAdditionalCharges((c) => c.filter((_, i) => i !== index));
  const updateCharge = (index: number, field: "label" | "amount", value: any) => {
    setAdditionalCharges((c) => {
      const updated = [...c];
      updated[index] = { ...updated[index], [field]: field === "amount" ? Number(value) : value };
      return updated;
    });
  };

  // Calculations
  const subTotal = useMemo(() => lineItems.reduce((s, i) => round2(s + (i.line_total || 0)), 0), [lineItems]);
  const additionalTotal = useMemo(() => additionalCharges.reduce((s, c) => round2(s + (c.amount || 0)), 0), [additionalCharges]);
  const taxableValue = round2(subTotal + additionalTotal);

  // GST type — intra vs inter state based on vendor selection
  const gstType = useMemo<GSTType>(
    () => getGSTType(COMPANY_STATE_CODE, selectedVendor?.state_code),
    [COMPANY_STATE_CODE, selectedVendor?.state_code],
  );

  const taxResult = useMemo(
    () => calculateLineTax(taxableValue, gstRate, gstType),
    [taxableValue, gstRate, gstType],
  );
  const grandTotal = round2(taxableValue + taxResult.total);

  // Save
  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const poData = {
        po_number: poNumber,
        po_date: format(poDate, "yyyy-MM-dd"),
        vendor_id: vendorId,
        vendor_name: selectedVendor?.name || null,
        vendor_address: selectedVendor
          ? [selectedVendor.address_line1, selectedVendor.address_line2, selectedVendor.city, selectedVendor.state]
              .filter(Boolean)
              .join(", ")
          : null,
        vendor_gstin: selectedVendor?.gstin || null,
        vendor_state_code: selectedVendor?.state_code || null,
        vendor_phone: selectedVendor?.phone1 || null,
        reference_number: referenceNumber || null,
        payment_terms: paymentTerms === "Custom" ? customPaymentTerms : paymentTerms || null,
        delivery_address: deliveryAddress || null,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        sub_total: subTotal,
        additional_charges: additionalCharges,
        taxable_value: taxableValue,
        igst_amount: taxResult.igst,
        cgst_amount: taxResult.cgst,
        sgst_amount: taxResult.sgst,
        total_gst: taxResult.total,
        grand_total: grandTotal,
        gst_rate: gstRate,
        status,
        issued_at: status === "issued" ? new Date().toISOString() : null,
        cancelled_at: null,
        cancellation_reason: null,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1, gst_rate: gstRate }));

      if (isEdit) {
        await updatePurchaseOrder(id!, { po: poData, lineItems: items });
        if (status === "issued") await issuePurchaseOrder(id!);
        return id;
      } else {
        const result = await createPurchaseOrder({ po: poData, lineItems: items });
        if (status === "issued") await issuePurchaseOrder(result.id);
        return result.id;
      }
    },
    onSuccess: (poId, status) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-stats"] });
      if (status === "issued") {
        setSavedPOId(poId as string);
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "Purchase order saved", description: `PO ${poNumber} saved as draft.` });
        navigate("/purchase-orders");
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!selectedVendor) {
      toast({ title: "Vendor required", description: "Please select a vendor.", variant: "destructive" });
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
          {isEdit ? "Edit Purchase Order" : "New Purchase Order"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing PO ${poNumber}` : "Create a new purchase order for your vendor"}
        </p>
      </div>

      {prefillApplied && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
          <span>Pre-filled from Reorder Intelligence — please review quantities and unit prices before saving.</span>
        </div>
      )}

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor *</Label>
              <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedVendor ? selectedVendor.name : "Select vendor..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendors..." />
                    <CommandList>
                      <CommandEmpty>
                        No vendor found.{" "}
                        <Button variant="link" size="sm" onClick={() => navigate("/parties/new")}>
                          + Add New Vendor
                        </Button>
                      </CommandEmpty>
                      <CommandGroup>
                        {vendors.map((v) => (
                          <CommandItem key={v.id} value={v.name} onSelect={() => handleVendorSelect(v)}>
                            <div>
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-muted-foreground">{v.city}{v.gstin ? ` · ${v.gstin}` : ""}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Vendor Card */}
            {selectedVendor && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{selectedVendor.name}</p>
                  {selectedVendor.vendor_type && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      selectedVendor.vendor_type === "raw_material_supplier" ? "bg-teal-50 text-teal-700 border-teal-200" :
                      selectedVendor.vendor_type === "processor" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      {selectedVendor.vendor_type === "raw_material_supplier" ? "RAW MAT" : selectedVendor.vendor_type === "processor" ? "PROCESSOR" : "BOTH"}
                    </span>
                  )}
                </div>
                {selectedVendor.address_line1 && <p className="text-muted-foreground">{selectedVendor.address_line1}</p>}
                {selectedVendor.city && (
                  <p className="text-muted-foreground">
                    {selectedVendor.city}{selectedVendor.state ? `, ${selectedVendor.state}` : ""}
                  </p>
                )}
                {selectedVendor.gstin && <p className="font-mono text-xs">GSTIN: {selectedVendor.gstin}</p>}
                {selectedVendor.phone1 && <p className="text-muted-foreground">Ph: {selectedVendor.phone1}</p>}
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Reference / L.O. Number</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Special Instructions</Label>
              <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} className="mt-1" rows={2} />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Internal Remarks</Label>
              <Textarea value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} className="mt-1" rows={2} />
              <p className="text-[10px] text-muted-foreground mt-1">Not printed on document</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">PO Number</Label>
              <Input value={poNumber} onChange={(e) => setPONumber(e.target.value)} className="mt-1 font-mono" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">PO Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !poDate && "text-muted-foreground")}>
                    {poDate ? format(poDate, "dd MMM yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={poDate} onSelect={(d) => d && setPODate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentTerms === "Custom" && (
                <Input
                  value={customPaymentTerms}
                  onChange={(e) => setCustomPaymentTerms(e.target.value)}
                  className="mt-2"
                  placeholder="Enter custom payment terms"
                />
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Delivery Address</Label>
              <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="mt-1" rows={2} placeholder="Defaults to company address" />
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="paper-card !p-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">Items</h2>
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
              {lineItems.filter((i) => i.description.trim()).length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">GST Rate:</Label>
            <Select value={String(gstRate)} onValueChange={(v) => setGstRate(Number(v))}>
              <SelectTrigger className="w-[90px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GST_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left min-w-[200px]">Description</th>
                <th className="px-3 py-2 text-left min-w-[100px]">Drawing No.</th>
                <th className="px-3 py-2 text-right min-w-[80px]">Qty</th>
                <th className="px-3 py-2 text-left min-w-[80px]">Unit</th>
                <th className="px-3 py-2 text-right min-w-[110px]">Unit Price (₹)</th>
                <th className="px-3 py-2 text-left min-w-[120px]">Delivery Date</th>
                <th className="px-3 py-2 text-right min-w-[110px]">Amount (₹)</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="px-3 py-2 text-sm text-muted-foreground font-mono">{item.serial_number}</td>
                  <td className="px-3 py-2">
                    <ItemSuggest
                      value={item.description}
                      onChange={(v) => updateLineItem(index, "description", v)}
                      onSelect={(selectedItem) => {
                        updateLineItem(index, "description", selectedItem.description);
                        updateLineItem(index, "drawing_number", selectedItem.drawing_revision || "");
                        updateLineItem(index, "unit", selectedItem.unit || "NOS");
                        if (!item.unit_price) updateLineItem(index, "unit_price", selectedItem.standard_cost || 0);
                        updateLineItem(index, "gst_rate", selectedItem.gst_rate || 18);
                        if (selectedItem.hsn_sac_code) updateLineItem(index, "hsn_sac_code", selectedItem.hsn_sac_code);
                      }}
                      placeholder="Type to search items..."
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.drawing_number || ""}
                      onChange={(e) => updateLineItem(index, "drawing_number", e.target.value)}
                      className="h-8 text-sm w-full"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                      className="h-8 text-sm text-right w-full"
                      step="any"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select value={item.unit} onValueChange={(v) => updateLineItem(index, "unit", v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={item.unit_price || ""}
                      onChange={(e) => updateLineItem(index, "unit_price", Number(e.target.value))}
                      className="h-8 text-sm text-right w-full"
                      step="any"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="date"
                      value={item.delivery_date || ""}
                      onChange={(e) => updateLineItem(index, "delivery_date", e.target.value)}
                      className="h-8 text-sm w-full"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                    {formatNumber(item.line_total || 0)}
                  </td>
                  <td className="px-3 py-2">
                    {lineItems.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLineItem(index)}>
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

      {/* Footer: GST Info + Additional Charges + Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* GST Info */}
        <div className="paper-card space-y-2">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2">GST Information</h3>
          {selectedVendor ? (
            <>
              <p className="text-sm">
                <span className="text-muted-foreground">Vendor:</span>{" "}
                <span className="font-medium">{selectedVendor.state || "N/A"} ({selectedVendor.state_code || "??"})</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Your Company:</span>{" "}
                <span className="font-medium">{companySettings?.state || "N/A"} ({COMPANY_STATE_CODE || "?"})</span>
              </p>
              {gstType === 'cgst_sgst' ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mt-1">
                  <Info className="h-3 w-3 shrink-0" /> Intra-state — Input CGST + SGST
                </div>
              ) : !selectedVendor.state_code ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold mt-1">
                  <Info className="h-3 w-3 shrink-0" /> State unknown — defaulting to IGST
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mt-1">
                  <Info className="h-3 w-3 shrink-0" /> Inter-state — Input IGST
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a vendor to see GST details</p>
          )}
        </div>

        {/* Additional Charges */}
        <div className="paper-card space-y-2">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2">Additional Charges</h3>
          {additionalCharges.map((charge, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={charge.label}
                onChange={(e) => updateCharge(i, "label", e.target.value)}
                placeholder="Label"
                className="h-8 text-sm flex-1"
              />
              <Input
                type="number"
                value={charge.amount || ""}
                onChange={(e) => updateCharge(i, "amount", e.target.value)}
                placeholder="₹"
                className="h-8 text-sm w-24 text-right"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeCharge(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCharge} className="w-full border-dashed">
            <Plus className="h-3 w-3 mr-1" /> Add Charge
          </Button>
        </div>

        {/* Totals */}
        <div className="paper-card">
          <h3 className="text-sm font-medium text-slate-700 border-b border-border pb-2 mb-3">Totals</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(subTotal)}</span>
            </div>
            {additionalTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional</span>
                <span className="font-mono tabular-nums">{formatCurrency(additionalTotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable Value</span>
              <span className="font-mono tabular-nums">{formatCurrency(taxableValue)}</span>
            </div>
            <div className="border-t border-border my-2" />
            {gstType === 'cgst_sgst' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input CGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input SGST @ {gstRate / 2}%</span>
                  <span className="font-mono tabular-nums">{formatCurrency(taxResult.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Input IGST @ {gstRate}%</span>
                <span className="font-mono tabular-nums">{formatCurrency(taxResult.igst)}</span>
              </div>
            )}
            <div className="border-t border-border my-2" />
            <div className="flex justify-between text-base font-bold">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 italic">
            {amountInWords(grandTotal)}
          </p>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[var(--sidebar-width)] bg-card border-t border-border p-3 flex justify-end gap-2 z-40">
        <Button variant="outline" onClick={() => navigate("/purchase-orders")}>Cancel</Button>
        <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
          Save as Draft
        </Button>
        <Button onClick={() => handleSave("issued")} disabled={saveMutation.isPending} className="active:scale-[0.98] transition-transform">
          Issue PO →
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Order Issued! 🎉</DialogTitle>
            <DialogDescription>PO {poNumber} has been issued successfully.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setSuccessDialogOpen(false); navigate(`/purchase-orders/${savedPOId}`); }}>
              View PO
            </Button>
            <Button variant="outline" onClick={() => { setSuccessDialogOpen(false); navigate("/purchase-orders/new"); }}>
              Create Another
            </Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/purchase-orders"); }}>
              Back to List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
