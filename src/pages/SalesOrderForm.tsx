import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, ChevronLeft } from "lucide-react";
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
  fetchSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  confirmSalesOrder,
  type SoLineItem,
} from "@/lib/sales-orders-api";
import { formatCurrency, amountInWords, calculateGST } from "@/lib/gst-utils";

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

function emptyLineItem(serial: number): SoLineItem {
  return {
    serial_number: serial,
    item_id: null,
    item_code: "",
    description: "",
    hsn_sac_code: "",
    unit: "NOS",
    quantity: 1,
    unit_price: 0,
    gst_rate: 18,
    line_total: 0,
    delivery_date: "",
    remarks: "",
  };
}

export default function SalesOrderForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [soDate, setSoDate] = useState<Date>(new Date());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [billingAddress, setBillingAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [priority, setPriority] = useState("normal");
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>();
  const [paymentTerms, setPaymentTerms] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [gstRate, setGstRate] = useState(18);
  const [lineItems, setLineItems] = useState<SoLineItem[]>([emptyLineItem(1)]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedSOId, setSavedSOId] = useState<string | null>(null);
  const [savedSONumber, setSavedSONumber] = useState("");

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

  const { data: existingSO } = useQuery({
    queryKey: ["sales-order", id],
    queryFn: () => fetchSalesOrder(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingSO) {
      setSoDate(new Date(existingSO.so_date));
      setCustomerId(existingSO.customer_id);
      setBillingAddress(existingSO.billing_address || "");
      setShippingAddress(existingSO.shipping_address || "");
      setReferenceNumber(existingSO.reference_number || "");
      setPriority(existingSO.priority || "normal");
      setPaymentTerms(existingSO.payment_terms || "");
      setSpecialInstructions(existingSO.special_instructions || "");
      setInternalRemarks(existingSO.internal_remarks || "");
      setGstRate(existingSO.gst_rate || 18);
      if (existingSO.delivery_date) setDeliveryDate(new Date(existingSO.delivery_date));
      if (existingSO.line_items?.length) {
        setLineItems(existingSO.line_items);
      }
      if (existingSO.customer_id) {
        const p = parties.find((p) => p.id === existingSO.customer_id);
        if (p) setSelectedCustomer(p);
      }
    }
  }, [existingSO, parties]);

  const handleCustomerSelect = (party: Party) => {
    setCustomerId(party.id);
    setSelectedCustomer(party);
    setCustomerOpen(false);
    // Pre-fill billing address
    const addr = [party.address_line1, party.address_line2, party.city, party.state, party.pin_code]
      .filter(Boolean).join(", ");
    setBillingAddress(addr);
    if (!shippingAddress) setShippingAddress(addr);
  };

  const updateLineItem = (index: number, field: keyof SoLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
      if (field === "quantity" || field === "unit_price") {
        const qty = field === "quantity" ? Number(value) : Number(updated[index].quantity);
        const price = field === "unit_price" ? Number(value) : Number(updated[index].unit_price);
        updated[index].line_total = Math.round(qty * price * 100) / 100;
      }
      return updated;
    });
  };

  const addLineItem = () => setLineItems((items) => [...items, emptyLineItem(items.length + 1)]);
  const removeLineItem = (index: number) => {
    setLineItems((items) =>
      items.filter((_, i) => i !== index).map((item, i) => ({ ...item, serial_number: i + 1 }))
    );
  };

  const subTotal = useMemo(() => lineItems.reduce((s, i) => s + (i.line_total || 0), 0), [lineItems]);
  const totalItems = lineItems.filter((i) => i.description.trim()).length;

  const companyStateCode = company?.state_code || "33";
  const partyStateCode = selectedCustomer?.state_code || companyStateCode;
  const gstResult = useMemo(
    () => calculateGST(companyStateCode, partyStateCode, subTotal, gstRate),
    [companyStateCode, partyStateCode, subTotal, gstRate]
  );
  const grandTotal = Math.round((subTotal + gstResult.total) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "confirmed") => {
      const soData = {
        so_date: format(soDate, "yyyy-MM-dd"),
        customer_id: customerId,
        customer_name: selectedCustomer?.name || null,
        customer_address: billingAddress || null,
        customer_gstin: selectedCustomer?.gstin || null,
        customer_state_code: selectedCustomer?.state_code || null,
        customer_phone: selectedCustomer?.phone1 || null,
        billing_address: billingAddress || null,
        shipping_address: shippingAddress || null,
        reference_number: referenceNumber || null,
        priority,
        delivery_date: deliveryDate ? format(deliveryDate, "yyyy-MM-dd") : null,
        payment_terms: paymentTerms || null,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        sub_total: subTotal,
        taxable_value: subTotal,
        cgst_amount: gstResult.cgst,
        sgst_amount: gstResult.sgst,
        igst_amount: gstResult.igst,
        total_gst: gstResult.total,
        grand_total: grandTotal,
        gst_rate: gstRate,
        status,
        confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
        cancelled_at: null,
        cancellation_reason: null,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1, line_total: i.line_total || 0 }));

      if (isEdit) {
        await updateSalesOrder(id!, { so: soData as any, lineItems: items });
        if (status === "confirmed" && existingSO?.status === "draft") {
          await confirmSalesOrder(id!);
        }
        return { id: id!, so_number: existingSO?.so_number ?? "" };
      } else {
        const result = await createSalesOrder({ so: soData as any, lineItems: items });
        return { id: result.id, so_number: result.so_number };
      }
    },
    onSuccess: ({ id: soId, so_number }, status) => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["so-stats"] });
      if (status === "confirmed") {
        setSavedSOId(soId);
        setSavedSONumber(so_number);
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "Sales order saved as draft" });
        navigate("/sales-orders");
      }
    },
    onError: (err: any) => {
      console.error("[SalesOrderForm] save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: "draft" | "confirmed") => {
    if (!selectedCustomer) {
      toast({ title: "Customer required", description: "Please select a customer.", variant: "destructive" });
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
          {isEdit ? "Edit Sales Order" : "New Sales Order"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing ${existingSO?.so_number ?? ""}` : "Create a new customer sales order"}
        </p>
      </div>

      {/* Header Details */}
      <div className="paper-card space-y-6">
        <h2 className="text-sm font-medium text-slate-700 border-b border-border pb-2">
          Customer & Order Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left — Customer */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Customer *</Label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedCustomer ? selectedCustomer.name : "Select customer..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers..." />
                    <CommandList>
                      <CommandEmpty>
                        No customer found.{" "}
                        <Button variant="link" size="sm" onClick={() => navigate("/parties/new")}>+ Add New</Button>
                      </CommandEmpty>
                      <CommandGroup>
                        {parties.map((p) => (
                          <CommandItem key={p.id} value={p.name} onSelect={() => handleCustomerSelect(p)}>
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

            {selectedCustomer && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <p className="font-medium">{selectedCustomer.name}</p>
                {selectedCustomer.address_line1 && <p className="text-muted-foreground">{selectedCustomer.address_line1}</p>}
                {selectedCustomer.city && (
                  <p className="text-muted-foreground">
                    {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.pin_code].filter(Boolean).join(", ")}
                  </p>
                )}
                {selectedCustomer.gstin && <p className="font-mono text-xs">GSTIN: {selectedCustomer.gstin}</p>}
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Billing Address</Label>
              <Textarea
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Billing address"
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Shipping Address</Label>
              <Textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Shipping address (if different)"
              />
            </div>
          </div>

          {/* Right — SO Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">SO Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal")}>
                      {soDate ? format(soDate, "dd MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={soDate} onSelect={(d) => d && setSoDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Reference / PO No.</Label>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="mt-1"
                  placeholder="Customer PO number"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Payment Terms</Label>
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="mt-1"
                  placeholder="e.g. 30 days net"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Expected Delivery Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !deliveryDate && "text-muted-foreground")}>
                    {deliveryDate ? format(deliveryDate, "dd MMM yyyy") : "Select delivery date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={deliveryDate} onSelect={setDeliveryDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Special Instructions</Label>
              <Textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Internal Remarks</Label>
              <Textarea
                value={internalRemarks}
                onChange={(e) => setInternalRemarks(e.target.value)}
                className="mt-1"
                rows={2}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Not printed on document</p>
            </div>
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
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-8">#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-[100px]">Item Code</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left min-w-[200px]">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-[90px]">HSN/SAC</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-[60px]">Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-[75px]">Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-[100px]">Unit Price</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-[70px]">GST %</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right w-[100px]">Line Total</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left w-[110px]">Delivery Date</th>
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
                      onSelect={(sel) => {
                        updateLineItem(index, "item_code", sel.item_code);
                        updateLineItem(index, "description", sel.description);
                        updateLineItem(index, "unit", sel.unit || "NOS");
                        updateLineItem(index, "unit_price", sel.sale_price || 0);
                        updateLineItem(index, "hsn_sac_code", sel.hsn_sac_code || "");
                        setLineItems((items) => {
                          const updated = [...items];
                          updated[index].line_total = Math.round((updated[index].quantity || 0) * (sel.sale_price || 0) * 100) / 100;
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
                      value={item.hsn_sac_code || ""}
                      onChange={(e) => updateLineItem(index, "hsn_sac_code", e.target.value)}
                      placeholder="HSN"
                      className="h-8 text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.unit}
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
                      step="0.01"
                      value={item.unit_price || ""}
                      onChange={(e) => updateLineItem(index, "unit_price", Number(e.target.value))}
                      className="h-8 text-sm text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={String(item.gst_rate)}
                      onValueChange={(v) => updateLineItem(index, "gst_rate", Number(v))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 5, 12, 18, 28].map((r) => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-medium">
                    {formatCurrency(item.line_total || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="date"
                      value={item.delivery_date || ""}
                      onChange={(e) => updateLineItem(index, "delivery_date", e.target.value)}
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

      {/* Totals */}
      <div className="paper-card">
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-mono tabular-nums font-medium">{formatCurrency(subTotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-2">
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
        <Button variant="outline" onClick={() => navigate("/sales-orders")}>Cancel</Button>
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
          Save as Draft
        </Button>
        <Button onClick={() => handleSave("confirmed")} disabled={saveMutation.isPending}>
          Confirm SO →
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sales Order Confirmed!</DialogTitle>
            <DialogDescription>
              Sales Order {savedSONumber} has been confirmed and is ready for production.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/sales-orders/${savedSOId}`)}>View SO</Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/sales-orders/new"); }}>
              Create Another
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
