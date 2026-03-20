import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown } from "lucide-react";
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
  fetchDispatchNote,
  fetchSalesOrder,
  createDispatchNote,
  updateDispatchNote,
  issueDN,
  type DnLineItem,
  type PackingListItem,
} from "@/lib/sales-orders-api";
import { formatCurrency, amountInWords, calculateGST } from "@/lib/gst-utils";

function emptyLineItem(serial: number): DnLineItem {
  return {
    serial_number: serial,
    item_code: "",
    description: "",
    unit: "NOS",
    quantity: 1,
    rate: 0,
    amount: 0,
    serial_number_ref: "",
    remarks: "",
  };
}

function emptyPackingItem(serial: number): PackingListItem {
  return {
    serial_number: serial,
    description: "",
    quantity: 1,
    unit: "NOS",
    weight_kg: undefined,
    dimensions: "",
    box_number: "",
    remarks: "",
  };
}

export default function DispatchNoteForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const soIdFromQuery = searchParams.get("so");
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [dnDate, setDnDate] = useState<Date>(new Date());
  const [soId, setSoId] = useState<string | null>(soIdFromQuery);
  const [soNumber, setSoNumber] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Party | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [transporter, setTransporter] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [lrDate, setLrDate] = useState<Date | undefined>();
  const [referenceNumber, setReferenceNumber] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [internalRemarks, setInternalRemarks] = useState("");
  const [gstRate, setGstRate] = useState(18);
  const [lineItems, setLineItems] = useState<DnLineItem[]>([emptyLineItem(1)]);
  const [packingList, setPackingList] = useState<PackingListItem[]>([]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedDNId, setSavedDNId] = useState<string | null>(null);
  const [savedDNNumber, setSavedDNNumber] = useState("");

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

  // If SO id from query, pre-fill customer from SO
  const { data: linkedSO } = useQuery({
    queryKey: ["sales-order-for-dn", soIdFromQuery],
    queryFn: () => fetchSalesOrder(soIdFromQuery!),
    enabled: !!soIdFromQuery && !isEdit,
  });

  useEffect(() => {
    if (linkedSO) {
      setSoNumber(linkedSO.so_number);
      setCustomerId(linkedSO.customer_id);
      setShippingAddress(linkedSO.shipping_address || linkedSO.billing_address || "");
      const p = parties.find((p) => p.id === linkedSO.customer_id);
      if (p) setSelectedCustomer(p);
    }
  }, [linkedSO, parties]);

  const { data: existingDN } = useQuery({
    queryKey: ["dispatch-note", id],
    queryFn: () => fetchDispatchNote(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingDN) {
      setDnDate(new Date(existingDN.dn_date));
      setSoId(existingDN.so_id);
      setSoNumber(existingDN.so_number || "");
      setCustomerId(existingDN.customer_id);
      setShippingAddress(existingDN.shipping_address || "");
      setVehicleNumber(existingDN.vehicle_number || "");
      setDriverName(existingDN.driver_name || "");
      setTransporter(existingDN.transporter || "");
      setLrNumber(existingDN.lr_number || "");
      setReferenceNumber(existingDN.reference_number || "");
      setSpecialInstructions(existingDN.special_instructions || "");
      setInternalRemarks(existingDN.internal_remarks || "");
      setGstRate(existingDN.gst_rate || 18);
      if (existingDN.lr_date) setLrDate(new Date(existingDN.lr_date));
      if (existingDN.line_items?.length) setLineItems(existingDN.line_items);
      if (existingDN.packing_list?.length) setPackingList(existingDN.packing_list);
      if (existingDN.customer_id) {
        const p = parties.find((p) => p.id === existingDN.customer_id);
        if (p) setSelectedCustomer(p);
      }
    }
  }, [existingDN, parties]);

  const handleCustomerSelect = (party: Party) => {
    setCustomerId(party.id);
    setSelectedCustomer(party);
    setCustomerOpen(false);
    if (!shippingAddress) {
      setShippingAddress(
        [party.address_line1, party.address_line2, party.city, party.state, party.pin_code].filter(Boolean).join(", ")
      );
    }
  };

  const updateLineItem = (index: number, field: keyof DnLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
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
    setLineItems((items) =>
      items.filter((_, i) => i !== index).map((item, i) => ({ ...item, serial_number: i + 1 }))
    );
  };

  const updatePackingItem = (index: number, field: keyof PackingListItem, value: any) => {
    setPackingList((items) => {
      const updated = [...items];
      (updated[index] as any)[field] = value;
      return updated;
    });
  };

  const addPackingItem = () => setPackingList((items) => [...items, emptyPackingItem(items.length + 1)]);
  const removePackingItem = (index: number) => {
    setPackingList((items) =>
      items.filter((_, i) => i !== index).map((item, i) => ({ ...item, serial_number: i + 1 }))
    );
  };

  const subTotal = useMemo(() => lineItems.reduce((s, i) => s + (i.amount || 0), 0), [lineItems]);
  const totalItems = lineItems.filter((i) => i.description.trim()).length;

  const companyStateCode = company?.state_code || "33";
  const partyStateCode = selectedCustomer?.state_code || companyStateCode;
  const gstResult = useMemo(
    () => calculateGST(companyStateCode, partyStateCode, subTotal, gstRate),
    [companyStateCode, partyStateCode, subTotal, gstRate]
  );
  const grandTotal = Math.round((subTotal + gstResult.total) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "issued") => {
      const dnData = {
        dn_date: format(dnDate, "yyyy-MM-dd"),
        so_id: soId || null,
        so_number: soNumber || null,
        customer_id: customerId,
        customer_name: selectedCustomer?.name || null,
        customer_address: selectedCustomer
          ? [selectedCustomer.address_line1, selectedCustomer.address_line2, selectedCustomer.city, selectedCustomer.state]
              .filter(Boolean).join(", ")
          : null,
        customer_gstin: selectedCustomer?.gstin || null,
        customer_state_code: selectedCustomer?.state_code || null,
        shipping_address: shippingAddress || null,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        transporter: transporter || null,
        lr_number: lrNumber || null,
        lr_date: lrDate ? format(lrDate, "yyyy-MM-dd") : null,
        reference_number: referenceNumber || null,
        special_instructions: specialInstructions || null,
        internal_remarks: internalRemarks || null,
        sub_total: subTotal,
        cgst_amount: gstResult.cgst,
        sgst_amount: gstResult.sgst,
        igst_amount: gstResult.igst,
        total_gst: gstResult.total,
        grand_total: grandTotal,
        gst_rate: gstRate,
        status,
        issued_at: status === "issued" ? new Date().toISOString() : null,
        cancelled_at: null,
        cancellation_reason: null,
      };

      const items = lineItems
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1 }));

      const packing = packingList
        .filter((i) => i.description.trim())
        .map((i, idx) => ({ ...i, serial_number: idx + 1 }));

      if (isEdit) {
        await updateDispatchNote(id!, { dn: dnData as any, lineItems: items, packingList: packing });
        if (status === "issued" && existingDN?.status === "draft") {
          await issueDN(id!);
        }
        return { id: id!, dn_number: existingDN?.dn_number ?? "" };
      } else {
        const result = await createDispatchNote({ dn: dnData as any, lineItems: items, packingList: packing });
        return { id: result.id, dn_number: result.dn_number };
      }
    },
    onSuccess: ({ id: dnId, dn_number }, status) => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-notes"] });
      queryClient.invalidateQueries({ queryKey: ["dn-stats"] });
      if (status === "issued") {
        setSavedDNId(dnId);
        setSavedDNNumber(dn_number);
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "Dispatch note saved as draft" });
        navigate("/dispatch-notes");
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: "draft" | "issued") => {
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
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">
          {isEdit ? "Edit Dispatch Note" : "New Dispatch Note"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit ? `Editing ${existingDN?.dn_number ?? ""}` : "Create a new dispatch note for customer delivery"}
        </p>
      </div>

      {/* Header */}
      <div className="paper-card space-y-6">
        <h2 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-2">
          Delivery & Transport Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left — Customer */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Customer *</Label>
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
                      <CommandEmpty>No customer found.</CommandEmpty>
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
                {selectedCustomer.city && (
                  <p className="text-muted-foreground">
                    {[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {selectedCustomer.gstin && <p className="font-mono text-xs">GSTIN: {selectedCustomer.gstin}</p>}
              </div>
            )}

            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Shipping / Delivery Address</Label>
              <Textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Delivery address"
              />
            </div>

            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">SO Reference</Label>
              <Input
                value={soNumber}
                onChange={(e) => setSoNumber(e.target.value)}
                className="mt-1 font-mono"
                placeholder="SO number (if applicable)"
              />
            </div>

            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Reference / PO No.</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="mt-1"
                placeholder="Customer PO number"
              />
            </div>
          </div>

          {/* Right — Transport Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">DN Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full mt-1 justify-start font-normal">
                      {dnDate ? format(dnDate, "dd MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dnDate} onSelect={(d) => d && setDnDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Vehicle Number</Label>
                <Input
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="mt-1"
                  placeholder="e.g. MH-01-AB-1234"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Driver Name</Label>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="mt-1"
                  placeholder="Driver name"
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Transporter</Label>
                <Input
                  value={transporter}
                  onChange={(e) => setTransporter(e.target.value)}
                  className="mt-1"
                  placeholder="Transport company"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">LR / Docket No.</Label>
                <Input
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="LR number"
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">LR Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !lrDate && "text-muted-foreground")}>
                      {lrDate ? format(lrDate, "dd MMM yyyy") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={lrDate} onSelect={setLrDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Special Instructions</Label>
              <Textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Internal Remarks</Label>
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
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left w-[100px]">Item Code</th>
                <th className="px-3 py-2 text-left min-w-[200px]">Description</th>
                <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                <th className="px-3 py-2 text-right w-[75px]">Qty</th>
                <th className="px-3 py-2 text-right w-[100px]">Rate (₹)</th>
                <th className="px-3 py-2 text-right w-[100px]">Amount (₹)</th>
                <th className="px-3 py-2 text-left w-[110px]">Serial/Ref</th>
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
                        updateLineItem(index, "rate", sel.sale_price || 0);
                        setLineItems((items) => {
                          const updated = [...items];
                          updated[index].amount = Math.round((updated[index].quantity || 0) * (sel.sale_price || 0) * 100) / 100;
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
                      value={item.serial_number_ref || ""}
                      onChange={(e) => updateLineItem(index, "serial_number_ref", e.target.value)}
                      placeholder="Serial ref"
                      className="h-8 text-sm font-mono"
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

      {/* Packing List */}
      <div className="paper-card !p-0">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
          <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">Packing List</h2>
          <p className="text-xs text-muted-foreground">Optional — for box-level tracking</p>
        </div>
        {packingList.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left min-w-[160px]">Description</th>
                  <th className="px-3 py-2 text-right w-[75px]">Qty</th>
                  <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                  <th className="px-3 py-2 text-right w-[80px]">Weight (kg)</th>
                  <th className="px-3 py-2 text-left w-[110px]">Dimensions</th>
                  <th className="px-3 py-2 text-left w-[90px]">Box No.</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {packingList.map((item, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground font-mono text-sm">{item.serial_number}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={item.description}
                        onChange={(e) => updatePackingItem(index, "description", e.target.value)}
                        placeholder="Item / box description"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={item.quantity || ""}
                        onChange={(e) => updatePackingItem(index, "quantity", Number(e.target.value))}
                        className="h-8 text-sm text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={item.unit}
                        onChange={(e) => updatePackingItem(index, "unit", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        value={item.weight_kg ?? ""}
                        onChange={(e) => updatePackingItem(index, "weight_kg", e.target.value ? Number(e.target.value) : undefined)}
                        className="h-8 text-sm text-right font-mono"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={item.dimensions || ""}
                        onChange={(e) => updatePackingItem(index, "dimensions", e.target.value)}
                        placeholder="L×W×H cm"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={item.box_number || ""}
                        onChange={(e) => updatePackingItem(index, "box_number", e.target.value)}
                        placeholder="Box 1"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePackingItem(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          onClick={addPackingItem}
          className="w-full py-3 border-t border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add Packing Item
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
        <Button variant="outline" onClick={() => navigate("/dispatch-notes")}>Cancel</Button>
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
          Save as Draft
        </Button>
        <Button onClick={() => handleSave("issued")} disabled={saveMutation.isPending}>
          Issue DN →
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispatch Note Issued!</DialogTitle>
            <DialogDescription>
              Dispatch Note {savedDNNumber} has been issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/dispatch-notes/${savedDNId}`)}>View DN</Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/dispatch-notes/new"); }}>
              Create Another
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
