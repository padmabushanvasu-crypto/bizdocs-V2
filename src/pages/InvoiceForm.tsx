import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, ChevronDown, ChevronUp, Truck } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { fetchParties, type Party } from "@/lib/parties-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { fetchItems, type Item } from "@/lib/items-api";
import {
  fetchInvoice,
  getNextInvoiceNumber,
  createInvoice,
  updateInvoice,
  issueInvoice,
  type InvoiceLineItem,
} from "@/lib/invoices-api";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { fetchSerialNumbers, assignSerialToInvoice } from "@/lib/fat-api";

const UNITS = ["NOS", "KG", "MTR", "SFT", "SET", "ROLL", "SHEET", "LITRE", "BOX"];
const PAYMENT_TERMS = ["Immediate", "7 Days", "15 Days", "30 Days", "45 Days", "60 Days"];
const GST_RATES = [0, 5, 12, 18, 28];
// Company state code fetched dynamically from settings

function emptyLineItem(serial: number): InvoiceLineItem {
  return {
    serial_number: serial,
    description: "",
    drawing_number: "",
    hsn_sac_code: "",
    quantity: 0,
    unit: "NOS",
    unit_price: 0,
    discount_percent: 0,
    discount_amount: 0,
    taxable_amount: 0,
    gst_rate: 18,
    cgst: 0,
    sgst: 0,
    igst: 0,
    line_total: 0,
  };
}

function getDueDateFromTerms(invoiceDate: Date, terms: string): Date {
  const daysMap: Record<string, number> = {
    Immediate: 0, "7 Days": 7, "15 Days": 15, "30 Days": 30, "45 Days": 45, "60 Days": 60,
  };
  return addDays(invoiceDate, daysMap[terms] ?? 30);
}

export default function InvoiceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(addDays(new Date(), 30));
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [customerPoRef, setCustomerPoRef] = useState("");
  const [dcReference, setDcReference] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("1. Payment due as per agreed terms.\n2. Interest @ 18% p.a. will be charged on overdue payments.\n3. Goods once sold will not be taken back.");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([emptyLineItem(1)]);
  const [successOpen, setSuccessOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Dispatch & Transport fields (FIX 7)
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [supplyType, setSupplyType] = useState("");
  const [ewayBillNumber, setEwayBillNumber] = useState("");
  const [dispatchVehicleNumber, setDispatchVehicleNumber] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [lrDate, setLrDate] = useState("");
  const [serialNumberRef, setSerialNumberRef] = useState("");
  const [serialNumberId, setSerialNumberId] = useState<string | null>(null);
  const [serialSearchOpen, setSerialSearchOpen] = useState(false);
  const [dispatchThrough, setDispatchThrough] = useState("");
  const [destination, setDestination] = useState("");

  // Queries
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const COMPANY_STATE_CODE = companySettings?.state_code || "";

  const { data: customers } = useQuery({
    queryKey: ["customers-for-invoice"],
    queryFn: () => fetchParties({ type: "customer", status: "active", pageSize: 500 }),
  });

  const { data: nextNum } = useQuery({
    queryKey: ["next-invoice-number"],
    queryFn: getNextInvoiceNumber,
    enabled: !isEdit,
  });

  const { data: existingInvoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoice(id!),
    enabled: isEdit,
  });

  const { data: availableSerials } = useQuery({
    queryKey: ["serial-numbers-available"],
    queryFn: () => fetchSerialNumbers({ status: "in_stock", fatCompleted: true, pageSize: 200 }),
  });

  useEffect(() => {
    if (!isEdit && nextNum) setInvoiceNumber(nextNum);
  }, [nextNum, isEdit]);

  useEffect(() => {
    if (isEdit && existingInvoice) {
      const inv = existingInvoice.invoice;
      setInvoiceNumber(inv.invoice_number);
      setInvoiceDate(new Date(inv.invoice_date));
      if (inv.due_date) setDueDate(new Date(inv.due_date));
      setPaymentTerms(inv.payment_terms || "30 Days");
      setPlaceOfSupply(inv.place_of_supply || "");
      setCustomerPoRef(inv.customer_po_reference || "");
      setDcReference(inv.dc_reference || "");
      setSpecialInstructions(inv.special_instructions || "");
      setInternalRemarks(inv.internal_remarks || "");
      setTermsAndConditions(inv.terms_and_conditions || "");
      setBankName(inv.bank_name || "");
      setBankAccount(inv.bank_account_number || "");
      setBankIfsc(inv.bank_ifsc || "");
      setBankBranch(inv.bank_branch || "");
      setReverseCharge((inv as any).reverse_charge || false);
      setSupplyType((inv as any).supply_type || "");
      setEwayBillNumber((inv as any).eway_bill_number || "");
      setDispatchVehicleNumber((inv as any).vehicle_number || "");
      setTransporterName((inv as any).transporter_name || "");
      setLrNumber((inv as any).lr_number || "");
      setLrDate((inv as any).lr_date || "");
      setSerialNumberRef((inv as any).serial_number_ref || "");
      setDispatchThrough((inv as any).dispatch_through || "");
      setDestination((inv as any).destination || "");
      if (inv.customer_id) {
        setSelectedCustomer({
          id: inv.customer_id,
          name: inv.customer_name || "",
          address_line1: inv.customer_address || "",
          gstin: inv.customer_gstin || "",
          phone1: inv.customer_phone || "",
          state_code: inv.customer_state_code || "",
        } as Party);
        setPlaceOfSupply(inv.place_of_supply || inv.customer_state_code || "");
      }
      if (existingInvoice.lineItems.length > 0) {
        setLineItems(
          existingInvoice.lineItems.map((li: any) => ({
            serial_number: li.serial_number,
            description: li.description,
            drawing_number: li.drawing_number || "",
            hsn_sac_code: li.hsn_sac_code || "",
            quantity: li.quantity,
            unit: li.unit || "NOS",
            unit_price: li.unit_price,
            discount_percent: li.discount_percent ?? 0,
            discount_amount: li.discount_amount ?? 0,
            taxable_amount: li.taxable_amount ?? 0,
            gst_rate: li.gst_rate ?? 18,
            cgst: li.cgst ?? 0,
            sgst: li.sgst ?? 0,
            igst: li.igst ?? 0,
            line_total: li.line_total ?? 0,
          }))
        );
      }
    }
  }, [isEdit, existingInvoice]);

  // Customer selection
  const handleSelectCustomer = useCallback((customer: Party) => {
    setSelectedCustomer(customer);
    setCustomerOpen(false);
    setPlaceOfSupply(customer.state_code || "");
    if (customer.payment_terms) {
      setPaymentTerms(customer.payment_terms);
      setDueDate(getDueDateFromTerms(invoiceDate, customer.payment_terms));
    }
  }, [invoiceDate]);

  // Payment terms change
  const handleTermsChange = useCallback((terms: string) => {
    setPaymentTerms(terms);
    setDueDate(getDueDateFromTerms(invoiceDate, terms));
  }, [invoiceDate]);

  // GST logic
  const isSameState = useMemo(() => {
    const custState = placeOfSupply || selectedCustomer?.state_code || "";
    return custState === COMPANY_STATE_CODE;
  }, [placeOfSupply, selectedCustomer]);

  // Line item updates
  const updateLineItem = useCallback((index: number, field: keyof InvoiceLineItem, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      // Recalculate
      const baseAmount = Math.round(item.quantity * item.unit_price * 100) / 100;
      item.discount_amount = Math.round(baseAmount * (item.discount_percent / 100) * 100) / 100;
      item.taxable_amount = Math.round((baseAmount - item.discount_amount) * 100) / 100;
      const gstAmt = Math.round(item.taxable_amount * (item.gst_rate / 100) * 100) / 100;

      const custState = placeOfSupply || selectedCustomer?.state_code || "";
      const sameState = custState === COMPANY_STATE_CODE;

      if (sameState) {
        item.cgst = Math.round(gstAmt / 2 * 100) / 100;
        item.sgst = Math.round(gstAmt / 2 * 100) / 100;
        item.igst = 0;
      } else {
        item.cgst = 0;
        item.sgst = 0;
        item.igst = gstAmt;
      }
      item.line_total = Math.round((item.taxable_amount + gstAmt) * 100) / 100;

      updated[index] = item;
      return updated;
    });
  }, [placeOfSupply, selectedCustomer]);

  const addLineItem = () => setLineItems((prev) => [...prev, emptyLineItem(prev.length + 1)]);
  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, serial_number: i + 1 })));
  };

  // Totals
  const totals = useMemo(() => {
    const subTotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const totalDiscount = lineItems.reduce((s, li) => s + li.discount_amount, 0);
    const taxableValue = lineItems.reduce((s, li) => s + li.taxable_amount, 0);

    // Group by GST rate
    const gstByRate: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
    lineItems.forEach((li) => {
      if (!gstByRate[li.gst_rate]) gstByRate[li.gst_rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      gstByRate[li.gst_rate].taxable += li.taxable_amount;
      gstByRate[li.gst_rate].cgst += li.cgst;
      gstByRate[li.gst_rate].sgst += li.sgst;
      gstByRate[li.gst_rate].igst += li.igst;
    });

    const totalCgst = lineItems.reduce((s, li) => s + li.cgst, 0);
    const totalSgst = lineItems.reduce((s, li) => s + li.sgst, 0);
    const totalIgst = lineItems.reduce((s, li) => s + li.igst, 0);
    const totalGst = totalCgst + totalSgst + totalIgst;
    const preRound = taxableValue + totalGst;
    const roundOff = Math.round(preRound) - preRound;
    const grandTotal = Math.round(preRound);

    return { subTotal, totalDiscount, taxableValue, gstByRate, totalCgst, totalSgst, totalIgst, totalGst, roundOff, grandTotal };
  }, [lineItems]);

  // Save
  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const invoiceData: Record<string, any> = {
        invoice_number: invoiceNumber,
        invoice_date: format(invoiceDate, "yyyy-MM-dd"),
        due_date: format(dueDate, "yyyy-MM-dd"),
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || null,
        customer_address: selectedCustomer?.address_line1 || null,
        customer_gstin: selectedCustomer?.gstin || null,
        customer_phone: selectedCustomer?.phone1 || null,
        customer_state_code: selectedCustomer?.state_code || null,
        place_of_supply: placeOfSupply,
        customer_po_reference: customerPoRef || null,
        dc_reference: dcReference || null,
        payment_terms: paymentTerms,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        terms_and_conditions: termsAndConditions || null,
        bank_name: bankName || null,
        bank_account_number: bankAccount || null,
        bank_ifsc: bankIfsc || null,
        bank_branch: bankBranch || null,
        reverse_charge: reverseCharge,
        supply_type: supplyType || null,
        eway_bill_number: ewayBillNumber || null,
        vehicle_number: dispatchVehicleNumber || null,
        transporter_name: transporterName || null,
        lr_number: lrNumber || null,
        lr_date: lrDate || null,
        serial_number_ref: serialNumberRef || null,
        dispatch_through: dispatchThrough || null,
        destination: destination || null,
        sub_total: totals.subTotal,
        total_discount: totals.totalDiscount,
        taxable_value: totals.taxableValue,
        cgst_amount: totals.totalCgst,
        sgst_amount: totals.totalSgst,
        igst_amount: totals.totalIgst,
        total_gst: totals.totalGst,
        round_off: totals.roundOff,
        grand_total: totals.grandTotal,
        amount_outstanding: totals.grandTotal,
        status,
      };

      if (isEdit) {
        await updateInvoice(id!, invoiceData, lineItems);
        if (status === "sent") {
          await issueInvoice(id!);
          if (serialNumberId) {
            await assignSerialToInvoice(
              serialNumberId, id!, invoiceNumber,
              selectedCustomer?.name || null,
              format(invoiceDate, "yyyy-MM-dd")
            );
          }
        }
        return id;
      } else {
        const inv = await createInvoice(invoiceData, lineItems);
        if (status === "sent") {
          await issueInvoice(inv.id);
          if (serialNumberId) {
            await assignSerialToInvoice(
              serialNumberId, inv.id, invoiceNumber,
              selectedCustomer?.name || null,
              format(invoiceDate, "yyyy-MM-dd")
            );
          }
        }
        return inv.id;
      }
    },
    onSuccess: (invId, status) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      setSavedId(invId as string);
      if (status === "sent") {
        setSuccessOpen(true);
      } else {
        toast({ title: "Invoice saved as draft" });
        navigate(`/invoices/${invId}`);
      }
    },
    onError: (err: any) => {
      toast({ title: "Error saving invoice", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!selectedCustomer) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    const validItems = lineItems.filter((li) => li.description.trim() && li.quantity > 0);
    if (validItems.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    saveMutation.mutate(status);
  };

  const customerList = customers?.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">{isEdit ? "Edit Invoice" : "New Sales Invoice"}</h1>
          <p className="text-sm text-muted-foreground">GST-compliant tax invoice</p>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedCustomer ? selectedCustomer.name : "Select customer..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0">
                <Command>
                  <CommandInput placeholder="Search customers..." />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {customerList.map((c: Party) => (
                        <CommandItem key={c.id} onSelect={() => handleSelectCustomer(c)}>
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.gstin || "No GSTIN"} • {c.city || ""}</div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedCustomer && (
            <div className="bg-secondary/50 border border-border rounded-md p-3 text-sm space-y-1">
              <div className="font-medium">{selectedCustomer.name}</div>
              {selectedCustomer.address_line1 && <div className="text-muted-foreground">{selectedCustomer.address_line1}</div>}
              {selectedCustomer.gstin && <div className="text-muted-foreground">GSTIN: {selectedCustomer.gstin}</div>}
              {selectedCustomer.phone1 && <div className="text-muted-foreground">Phone: {selectedCustomer.phone1}</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Place of Supply</Label>
              <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="State code" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer PO Ref</Label>
              <Input value={customerPoRef} onChange={(e) => setCustomerPoRef(e.target.value)} placeholder="Their order no." />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>DC Reference</Label>
            <Input value={dcReference} onChange={(e) => setDcReference(e.target.value)} placeholder="Linked delivery challan" />
          </div>

          <div className="space-y-1.5">
            <Label>Special Instructions</Label>
            <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Internal Remarks <span className="text-xs text-muted-foreground">(not printed)</span></Label>
            <Textarea value={internalRemarks} onChange={(e) => setInternalRemarks(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Invoice Number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {format(invoiceDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={invoiceDate} onSelect={(d) => d && setInvoiceDate(d)} /></PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <Select value={paymentTerms} onValueChange={handleTermsChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {format(dueDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dueDate} onSelect={(d) => d && setDueDate(d)} /></PopoverContent>
            </Popover>
          </div>

          {/* Bank Details */}
          <div className="border border-border rounded-md p-3 space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Bank Details</Label>
            <Input placeholder="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            <Input placeholder="Account Number" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input placeholder="IFSC Code" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} />
              <Input placeholder="Branch" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-foreground">
            Items <span className="bg-secondary text-muted-foreground text-xs px-2 py-0.5 rounded-full ml-2">{lineItems.length}</span>
          </h2>
          <Button variant="outline" size="sm" onClick={addLineItem}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
        </div>

        <div className="paper-card !p-0 overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th className="w-20">Qty</th>
                <th className="w-20">Unit</th>
                <th className="w-24">Price (₹)</th>
                <th className="w-20">Disc %</th>
                <th className="w-20">GST %</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="text-muted-foreground text-center">{li.serial_number}</td>
                  <td>
                    <ItemSuggest
                      value={li.description}
                      onChange={(v) => updateLineItem(i, "description", v)}
                      onSelect={(item) => {
                        updateLineItem(i, "description", item.description);
                        updateLineItem(i, "hsn_sac_code", item.hsn_sac_code || "");
                        updateLineItem(i, "unit", item.unit || "NOS");
                        updateLineItem(i, "unit_price", item.sale_price || 0);
                        updateLineItem(i, "gst_rate", item.gst_rate || 18);
                        if ((item as any).drawing_number) updateLineItem(i, "drawing_number", (item as any).drawing_number);
                      }}
                      placeholder="Type to search items..."
                      className="min-w-[200px]"
                    />
                    <Input
                      value={li.drawing_number || ""}
                      onChange={(e) => updateLineItem(i, "drawing_number", e.target.value)}
                      placeholder="Drawing No (optional)"
                      className="mt-1 h-7 text-xs text-muted-foreground"
                    />
                  </td>
                  <td><Input value={li.hsn_sac_code || ""} onChange={(e) => updateLineItem(i, "hsn_sac_code", e.target.value)} placeholder="HSN" className="w-24" /></td>
                  <td><Input type="number" value={li.quantity || ""} onChange={(e) => updateLineItem(i, "quantity", parseFloat(e.target.value) || 0)} className="w-20" /></td>
                  <td>
                    <Select value={li.unit} onValueChange={(v) => updateLineItem(i, "unit", v)}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td><Input type="number" value={li.unit_price || ""} onChange={(e) => updateLineItem(i, "unit_price", parseFloat(e.target.value) || 0)} className="w-24" /></td>
                  <td><Input type="number" value={li.discount_percent || ""} onChange={(e) => updateLineItem(i, "discount_percent", parseFloat(e.target.value) || 0)} className="w-20" /></td>
                  <td>
                    <Select value={String(li.gst_rate)} onValueChange={(v) => updateLineItem(i, "gst_rate", parseFloat(v))}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>{GST_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="text-right font-mono tabular-nums text-sm">{formatNumber(li.taxable_amount)}</td>
                  <td className="text-right font-mono tabular-nums text-sm font-semibold">{formatNumber(li.line_total)}</td>
                  <td>
                    {lineItems.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLineItem(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button variant="outline" className="w-full border-dashed" onClick={addLineItem}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      {/* Footer: GST info + Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* GST Info */}
        <div className="bg-secondary/50 border border-border rounded-md p-4 text-sm space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">GST Information</Label>
          {selectedCustomer ? (
            <>
              <div>Customer: {selectedCustomer.state || "Unknown"} ({placeOfSupply || selectedCustomer.state_code || "?"})</div>
              <div>Your Company: {companySettings?.state || "N/A"} ({COMPANY_STATE_CODE || "?"})</div>
              <div className={cn("font-medium mt-1", isSameState ? "text-emerald-600" : "text-blue-600")}>
                {isSameState ? "CGST + SGST will apply" : "IGST will apply"}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">Select a customer to see GST type</div>
          )}
        </div>

        {/* Terms */}
        <div className="space-y-1.5">
          <Label>Terms & Conditions</Label>
          <Textarea value={termsAndConditions} onChange={(e) => setTermsAndConditions(e.target.value)} rows={6} className="text-xs" />
        </div>

        {/* Totals */}
        <div className="bg-card border border-border rounded-md p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="font-mono tabular-nums">{formatCurrency(totals.subTotal)}</span></div>
          {totals.totalDiscount > 0 && (
            <div className="flex justify-between text-emerald-600"><span>Total Discount</span><span className="font-mono tabular-nums">-{formatCurrency(totals.totalDiscount)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Taxable Value</span><span className="font-mono tabular-nums">{formatCurrency(totals.taxableValue)}</span></div>
          <div className="border-t border-border my-2" />

          {/* GST breakdown by rate */}
          {Object.entries(totals.gstByRate)
            .filter(([_, v]) => v.taxable > 0)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([rate, vals]) => (
              <div key={rate}>
                {isSameState ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">CGST @ {Number(rate) / 2}% on {formatCurrency(vals.taxable)}</span>
                      <span className="font-mono tabular-nums">{formatCurrency(vals.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">SGST @ {Number(rate) / 2}% on {formatCurrency(vals.taxable)}</span>
                      <span className="font-mono tabular-nums">{formatCurrency(vals.sgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">IGST @ {rate}% on {formatCurrency(vals.taxable)}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(vals.igst)}</span>
                  </div>
                )}
              </div>
            ))}

          <div className="flex justify-between font-medium">
            <span>Total GST</span>
            <span className="font-mono tabular-nums">{formatCurrency(totals.totalGst)}</span>
          </div>

          <div className="border-t border-border my-2" />
          {totals.roundOff !== 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Round Off</span>
              <span className="font-mono tabular-nums">{totals.roundOff > 0 ? "+" : ""}{formatNumber(totals.roundOff)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Grand Total</span>
            <span className="font-mono tabular-nums">{formatCurrency(totals.grandTotal)}</span>
          </div>
          <div className="text-xs text-muted-foreground italic">{amountInWords(totals.grandTotal)}</div>
        </div>
      </div>

      {/* Dispatch & Transport Details */}
      <div className="border border-border rounded-lg">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          onClick={() => setDispatchOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-500" />
            <span className="font-medium text-sm text-slate-700">Dispatch & Transport Details</span>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          {dispatchOpen
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />
          }
        </button>
        {dispatchOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Reverse Charge Applicable</Label>
                <p className="text-xs text-muted-foreground">Mark if GST under reverse charge mechanism</p>
              </div>
              <Switch checked={reverseCharge} onCheckedChange={setReverseCharge} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Supply Type</Label>
                <Select value={supplyType} onValueChange={setSupplyType}>
                  <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B2B">B2B</SelectItem>
                    <SelectItem value="B2C">B2C</SelectItem>
                    <SelectItem value="B2CL">B2CL (Large)</SelectItem>
                    <SelectItem value="SEZWP">SEZ with Payment</SelectItem>
                    <SelectItem value="SEZWOP">SEZ without Payment</SelectItem>
                    <SelectItem value="export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">E-Way Bill Number</Label>
                <Input value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} placeholder="EWB-12345678901234" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Vehicle Number</Label>
                <Input value={dispatchVehicleNumber} onChange={(e) => setDispatchVehicleNumber(e.target.value)} placeholder="e.g. MH-01-AB-1234" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Transporter Name</Label>
                <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} placeholder="Transport company name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">LR Number</Label>
                <Input value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} placeholder="Lorry receipt number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">LR Date</Label>
                <Input type="date" value={lrDate} onChange={(e) => setLrDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Serial Number</Label>
                <Popover open={serialSearchOpen} onOpenChange={setSerialSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-sm">
                      {serialNumberRef || "Select serial number..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search serial number, item..." />
                      <CommandList>
                        <CommandEmpty>No available serial numbers.</CommandEmpty>
                        <CommandGroup>
                          {(availableSerials?.data ?? []).map((sn) => (
                            <CommandItem
                              key={sn.id}
                              value={sn.serial_number}
                              onSelect={() => {
                                setSerialNumberRef(sn.serial_number);
                                setSerialNumberId(sn.id);
                                setSerialSearchOpen(false);
                              }}
                            >
                              <div>
                                <p className="font-mono font-semibold text-sm">{sn.serial_number}</p>
                                {sn.item_description && (
                                  <p className="text-xs text-muted-foreground">{sn.item_description}</p>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {serialNumberRef && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-red-600 underline"
                    onClick={() => { setSerialNumberRef(""); setSerialNumberId(null); }}
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Dispatch Through</Label>
                <Input value={dispatchThrough} onChange={(e) => setDispatchThrough(e.target.value)} placeholder="Mode of dispatch" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Destination</Label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Place of delivery" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 flex justify-end gap-3 z-50">
        <Button variant="outline" onClick={() => navigate("/invoices")}>Cancel</Button>
        <Button variant="secondary" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>Save as Draft</Button>
        <Button onClick={() => handleSave("sent")} disabled={saveMutation.isPending}>Issue Invoice →</Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice Issued!</DialogTitle>
            <DialogDescription>Invoice {invoiceNumber} has been issued successfully.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/invoices/${savedId}`)}>View Invoice</Button>
            <Button onClick={() => { setSuccessOpen(false); navigate("/invoices/new"); }}>Create Another</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
