import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, AlertTriangle, PackageCheck, ChevronLeft, Info, Plus } from "lucide-react";
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
import {
  getNextGRNNumber,
  fetchOpenPOs,
  fetchPOLineItemsForGRN,
  recordGRNAndUpdatePO,
  type GRNLineItem,
} from "@/lib/grn-api";

const REJECTION_REASONS = ["Damaged", "Wrong Spec", "Wrong Quantity", "Poor Quality", "Other"];

export default function GRNForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPOId = searchParams.get("po");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [grnNumber, setGrnNumber] = useState("");
  const [grnDate, setGrnDate] = useState<Date>(new Date());
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poOpen, setPOOpen] = useState(false);
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState<Date | undefined>();
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [lrReference, setLrReference] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [lineItems, setLineItems] = useState<GRNLineItem[]>([]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedGRNId, setSavedGRNId] = useState<string | null>(null);
  const [newPOStatus, setNewPOStatus] = useState("");

  // Fetch open POs
  const { data: openPOs } = useQuery({
    queryKey: ["open-pos-for-grn"],
    queryFn: fetchOpenPOs,
  });

  // Next GRN number
  const { data: nextNumber } = useQuery({
    queryKey: ["next-grn-number"],
    queryFn: getNextGRNNumber,
  });

  useEffect(() => {
    if (nextNumber) setGrnNumber(nextNumber);
  }, [nextNumber]);

  // Pre-select PO if coming from PO detail
  useEffect(() => {
    if (preselectedPOId && openPOs) {
      const po = openPOs.find((p: any) => p.id === preselectedPOId);
      if (po) handlePOSelect(po);
    }
  }, [preselectedPOId, openPOs]);

  const handlePOSelect = async (po: any) => {
    setSelectedPO(po);
    setPOOpen(false);

    // Fetch PO line items and pre-fill
    const poItems = await fetchPOLineItemsForGRN(po.id);
    const items: GRNLineItem[] = poItems
      .filter((item: any) => {
        const pending = (item.quantity || 0) - (item.received_quantity || 0);
        return pending > 0;
      })
      .map((item: any, idx: number) => {
        const prevReceived = item.received_quantity || 0;
        const pending = (item.quantity || 0) - prevReceived;
        return {
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
      });
    setLineItems(items);
  };

  const addManualItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        serial_number: prev.length + 1,
        description: "",
        drawing_number: "",
        unit: "NOS",
        po_quantity: 0,
        previously_received: 0,
        pending_quantity: 0,
        receiving_now: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        rejection_reason: "",
        remarks: "",
        rejection_action: null,
      },
    ]);
  };

  const updateLineItem = (index: number, field: keyof GRNLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      const row = { ...updated[index] };

      if (field === "receiving_now") {
        const v = row.po_line_item_id
          ? Math.min(Math.max(0, Number(value)), row.pending_quantity)
          : Math.max(0, Number(value));
        row.receiving_now = v;
        row.accepted_quantity = v; // Default all accepted
        row.rejected_quantity = 0;
      } else if (field === "accepted_quantity") {
        const v = Math.min(Math.max(0, Number(value)), row.receiving_now);
        row.accepted_quantity = v;
        row.rejected_quantity = Math.max(0, row.receiving_now - v);
      } else if (field === "rejected_quantity") {
        const v = Math.min(Math.max(0, Number(value)), row.receiving_now);
        row.rejected_quantity = v;
        row.accepted_quantity = Math.max(0, row.receiving_now - v);
      } else {
        (row as any)[field] = value;
      }

      updated[index] = row;
      return updated;
    });
  };

  // Totals
  const totals = useMemo(() => {
    const totalOrdered = lineItems.reduce((s, i) => s + i.po_quantity, 0);
    const totalPrevReceived = lineItems.reduce((s, i) => s + i.previously_received, 0);
    const totalReceiving = lineItems.reduce((s, i) => s + i.receiving_now, 0);
    const totalAccepted = lineItems.reduce((s, i) => s + i.accepted_quantity, 0);
    const totalRejected = lineItems.reduce((s, i) => s + i.rejected_quantity, 0);
    return { totalOrdered, totalPrevReceived, totalReceiving, totalAccepted, totalRejected };
  }, [lineItems]);

  const hasItems = lineItems.some((i) => i.receiving_now > 0);

  // Save
  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const grnData = {
        grn_number: grnNumber,
        grn_date: format(grnDate, "yyyy-MM-dd"),
        po_id: selectedPO?.id || null,
        po_number: selectedPO?.po_number || null,
        vendor_id: selectedPO?.vendor_id || null,
        vendor_name: selectedPO?.vendor_name || vendorName || null,
        vendor_invoice_number: vendorInvoiceNumber || null,
        vendor_invoice_date: vendorInvoiceDate ? format(vendorInvoiceDate, "yyyy-MM-dd") : null,
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
        .filter((i) => i.receiving_now > 0)
        .map((i, idx) => ({ ...i, serial_number: idx + 1 }));

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
        // Determine new PO status for toast
        const allFullyReceived = lineItems.every(
          (i) => i.previously_received + i.accepted_quantity >= i.po_quantity
        );
        setNewPOStatus(allFullyReceived ? "Fully Received" : "Partially Received");
        setSuccessDialogOpen(true);
      } else {
        toast({ title: "GRN saved", description: `GRN ${grnNumber} saved as draft.` });
        navigate("/grn");
      }
    },
    onError: (err: any) => {
      console.error("[GRNForm] save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!hasItems) {
      toast({ title: "No items", description: "Enter receiving quantities for at least one item.", variant: "destructive" });
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
        <h1 className="text-xl font-display font-bold text-foreground">New Goods Receipt Note</h1>
        <p className="text-sm text-muted-foreground">Record incoming material received from a vendor</p>
      </div>

      {/* Guidance Banner */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div className="space-y-1">
          <p className="font-medium">GRN records materials received from vendors.</p>
          <p>Link to a Purchase Order to pre-fill pending items — or leave blank and add items manually for unplanned receipts.</p>
          <p>To return materials to a vendor, use a <a href="/delivery-challans" className="font-medium underline underline-offset-2 hover:text-blue-900">Delivery Challan</a> with type "Return to Vendor".</p>
        </div>
      </div>

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Linked Purchase Order <span className="font-normal text-muted-foreground">(optional)</span></Label>
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
              <p className="text-xs text-muted-foreground mt-1">Leave blank for unplanned receipts — you can add items manually below</p>
            </div>

            {/* Vendor name when no PO */}
            {!selectedPO && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Vendor Name</Label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1" placeholder="e.g., ABC Traders" />
              </div>
            )}

            {/* PO Summary Card */}
            {selectedPO && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border text-sm space-y-1">
                <p className="font-medium text-foreground">{selectedPO.vendor_name}</p>
                <p className="text-muted-foreground">PO Date: {new Date(selectedPO.po_date).toLocaleDateString("en-IN")}</p>
                {selectedPO.vendor_gstin && <p className="font-mono text-xs">GSTIN: {selectedPO.vendor_gstin}</p>}
                <p className="text-muted-foreground">
                  Items pending: <span className="font-medium text-foreground">{lineItems.length}</span>
                </p>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor Invoice Number</Label>
              <Input value={vendorInvoiceNumber} onChange={(e) => setVendorInvoiceNumber(e.target.value)} className="mt-1" placeholder="e.g., INV-0001" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Vendor Invoice Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal", !vendorInvoiceDate && "text-muted-foreground")}>
                    {vendorInvoiceDate ? format(vendorInvoiceDate, "dd MMM yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={vendorInvoiceDate} onSelect={setVendorInvoiceDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Transporter Name</Label>
              <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} className="mt-1" placeholder="e.g., Blue Dart, Self" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">GRN Number</Label>
              <Input value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} className="mt-1 font-mono" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">GRN Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full mt-1 justify-start font-normal")}>
                    {format(grnDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={grnDate} onSelect={(d) => d && setGrnDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transport & Receipt</p>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Vehicle Number</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" placeholder="e.g., TN 01 AB 1234" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">LR / Consignment Ref</Label>
                  <Input value={lrReference} onChange={(e) => setLrReference(e.target.value)} className="mt-1" placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Received By</Label>
                  <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="mt-1" placeholder="Name of person" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="paper-card !p-0">
          <div className="px-4 md:px-6 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">
              {selectedPO ? `Pending Items from PO ${selectedPO.po_number}` : "Items Received"}
            </h2>
            {!selectedPO && (
              <Button variant="outline" size="sm" onClick={addManualItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-secondary text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left min-w-[160px]">Description</th>
                  <th className="px-3 py-2 text-left w-[80px]">Drawing</th>
                  <th className="px-3 py-2 text-right w-[70px]">PO Qty</th>
                  <th className="px-3 py-2 text-right w-[70px]">Prev Rcvd</th>
                  <th className="px-3 py-2 text-right w-[70px]">Pending</th>
                  <th className="px-3 py-2 text-right w-[100px]">
                    <div>Qty Arriving Today</div>
                    <div className="font-normal normal-case text-[10px] text-muted-foreground tracking-normal">Enter how many arrived in this delivery</div>
                  </th>
                  <th className="px-3 py-2 text-right w-[80px]">Accepted</th>
                  <th className="px-3 py-2 text-right w-[80px]">Rejected</th>
                  <th className="px-3 py-2 text-left w-[120px]">Reason</th>
                  <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <React.Fragment key={index}>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 text-sm font-medium">
                      {item.po_line_item_id
                        ? item.description
                        : <Input value={item.description} onChange={(e) => updateLineItem(index, "description", e.target.value)} className="h-8 text-sm" placeholder="Description" />}
                    </td>
                    <td className="px-3 py-2 text-sm font-mono text-muted-foreground">
                      {item.po_line_item_id
                        ? (item.drawing_number || "—")
                        : <Input value={item.drawing_number || ""} onChange={(e) => updateLineItem(index, "drawing_number", e.target.value)} className="h-8 text-sm font-mono" placeholder="Optional" />}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums text-muted-foreground">{item.po_quantity}</td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums text-muted-foreground">{item.previously_received}</td>
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums font-medium text-amber-600">{item.pending_quantity}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={item.pending_quantity}
                        value={item.receiving_now || ""}
                        onChange={(e) => updateLineItem(index, "receiving_now", e.target.value)}
                        className="h-8 text-sm text-right font-mono w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={item.receiving_now}
                        value={item.accepted_quantity || ""}
                        onChange={(e) => updateLineItem(index, "accepted_quantity", e.target.value)}
                        className="h-8 text-sm text-right font-mono w-full"
                        disabled={item.receiving_now === 0}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={item.receiving_now}
                        value={item.rejected_quantity || ""}
                        onChange={(e) => updateLineItem(index, "rejected_quantity", e.target.value)}
                        className={cn(
                          "h-8 text-sm text-right font-mono w-full",
                          item.rejected_quantity > 0 && "border-destructive text-destructive"
                        )}
                        disabled={item.receiving_now === 0}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {item.rejected_quantity > 0 ? (
                        <Select
                          value={item.rejection_reason || ""}
                          onValueChange={(v) => updateLineItem(index, "rejection_reason", v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {REJECTION_REASONS.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{item.unit}</td>
                  </tr>
                  {item.rejected_quantity > 0 && (
                    <tr className="bg-red-50 border-t border-red-100">
                      <td colSpan={10} className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-4">
                          <p className="text-xs font-medium text-red-700">What to do with {item.rejected_quantity} rejected unit{item.rejected_quantity > 1 ? 's' : ''}?</p>
                          <div className="flex flex-wrap gap-4">
                            {[
                              { value: 'return_to_supplier', label: 'Return to supplier' },
                              { value: 'replacement_requested', label: 'Request replacement' },
                              { value: 'scrap', label: 'Scrap' },
                              { value: 'hold', label: 'Hold for inspection' },
                            ].map(opt => (
                              <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="radio"
                                  name={`rejection_action_${index}`}
                                  value={opt.value}
                                  checked={item.rejection_action === opt.value}
                                  onChange={() => updateLineItem(index, 'rejection_action', opt.value)}
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                          {item.rejection_action === 'replacement_requested' && (
                            <p className="text-xs text-muted-foreground italic">A replacement GRN will be expected when the replacement arrives.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="px-4 md:px-6 py-4 border-t border-border bg-muted/30">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total Ordered: </span>
                <span className="font-mono font-medium">{totals.totalOrdered}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Prev Received: </span>
                <span className="font-mono font-medium">{totals.totalPrevReceived}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Receiving Now: </span>
                <span className="font-mono font-medium text-primary">{totals.totalReceiving}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Accepted: </span>
                <span className="font-mono font-medium text-emerald-600">{totals.totalAccepted}</span>
              </div>
              {totals.totalRejected > 0 && (
                <div>
                  <span className="text-muted-foreground">Rejected: </span>
                  <span className="font-mono font-medium text-destructive">{totals.totalRejected}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state when no PO selected */}
      {lineItems.length === 0 && !selectedPO && (
        <div className="paper-card text-center py-12">
          <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No items yet</p>
          <p className="text-sm text-muted-foreground mb-4">Select a Purchase Order above to pre-fill items, or add manually</p>
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
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saveMutation.isPending}>
          Save Draft
        </Button>
        <Button onClick={() => handleSave("recorded")} disabled={saveMutation.isPending || !hasItems}>
          Record GRN →
        </Button>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GRN Recorded! ✅</DialogTitle>
            <DialogDescription>
              GRN {grnNumber} has been recorded. PO {selectedPO?.po_number} updated to <strong>{newPOStatus}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate(`/grn/${savedGRNId}`)}>View GRN</Button>
            <Button variant="outline" onClick={() => navigate(`/purchase-orders/${selectedPO?.id}`)}>View PO</Button>
            <Button onClick={() => { setSuccessDialogOpen(false); navigate("/grn/new"); }}>Record Another</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

