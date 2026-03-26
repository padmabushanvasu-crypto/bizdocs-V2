import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, AlertTriangle, PackageCheck, ChevronLeft } from "lucide-react";
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
import { fetchOpenJobWorks } from "@/lib/job-works-api";

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
  const [selectedJobCard, setSelectedJobCard] = useState<any>(null);
  const [jcOpen, setJcOpen] = useState(false);
  const [lineItems, setLineItems] = useState<GRNLineItem[]>([]);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [savedGRNId, setSavedGRNId] = useState<string | null>(null);
  const [newPOStatus, setNewPOStatus] = useState("");

  // Fetch open POs
  const { data: openPOs } = useQuery({
    queryKey: ["open-pos-for-grn"],
    queryFn: fetchOpenPOs,
  });

  // Fetch open job cards for WO link
  const { data: openJobCards } = useQuery({
    queryKey: ["open-job-cards-for-grn"],
    queryFn: fetchOpenJobWorks,
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
        };
      });
    setLineItems(items);
  };

  const updateLineItem = (index: number, field: keyof GRNLineItem, value: any) => {
    setLineItems((items) => {
      const updated = [...items];
      const row = { ...updated[index] };

      if (field === "receiving_now") {
        const v = Math.min(Math.max(0, Number(value)), row.pending_quantity);
        row.receiving_now = v;
        row.accepted_quantity = v; // Default accepted = receiving
        row.rejected_quantity = 0;
      } else if (field === "accepted_quantity") {
        const v = Math.min(Math.max(0, Number(value)), row.receiving_now);
        row.accepted_quantity = v;
        row.rejected_quantity = row.receiving_now - v;
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
        vendor_name: selectedPO?.vendor_name || null,
        vendor_invoice_number: vendorInvoiceNumber || null,
        vendor_invoice_date: vendorInvoiceDate ? format(vendorInvoiceDate, "yyyy-MM-dd") : null,
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
        job_card_id: selectedJobCard?.id || null,
        job_card_number: selectedJobCard?.jc_number || null,
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (status: string) => {
    if (!selectedPO) {
      toast({ title: "PO required", description: "Please select a purchase order.", variant: "destructive" });
      return;
    }
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
        <p className="text-sm text-muted-foreground">Record incoming material against a purchase order</p>
      </div>

      {/* Header Section */}
      <div className="paper-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Linked Purchase Order *</Label>
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
              <Label className="text-sm font-medium text-slate-700">Link to Job Work (optional)</Label>
              <Popover open={jcOpen} onOpenChange={setJcOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedJobCard
                      ? `${selectedJobCard.jc_number} — ${selectedJobCard.item_description ?? selectedJobCard.item_code ?? ""}`
                      : "Select Job Work..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search job work..." />
                    <CommandList>
                      <CommandEmpty>No open job works found.</CommandEmpty>
                      <CommandGroup>
                        {(openJobCards ?? []).map((jc: any) => (
                          <CommandItem
                            key={jc.id}
                            value={`${jc.jc_number} ${jc.item_description ?? ""} ${jc.item_code ?? ""}`}
                            onSelect={() => { setSelectedJobCard(jc); setJcOpen(false); }}
                          >
                            <div>
                              <p className="font-mono font-medium">{jc.jc_number}</p>
                              <p className="text-xs text-muted-foreground">{jc.item_description ?? jc.item_code}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground mt-1">Link this GRN to a Job Work if these materials are for a specific job</p>
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

            <div>
              <Label className="text-sm font-medium text-slate-700">Vehicle Number</Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" placeholder="e.g., TN 01 AB 1234" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">LR / Transporter Ref</Label>
              <Input value={lrReference} onChange={(e) => setLrReference(e.target.value)} className="mt-1" placeholder="Optional" />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Received By</Label>
              <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="mt-1" placeholder="Name of person" />
            </div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="paper-card !p-0">
          <div className="px-4 md:px-6 py-3 border-b border-border">
            <h2 className="text-sm uppercase text-muted-foreground font-bold tracking-wider">
              Pending Items from PO {selectedPO?.po_number}
            </h2>
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
                  <th className="px-3 py-2 text-right w-[90px]">Receiving *</th>
                  <th className="px-3 py-2 text-right w-[80px]">Accepted</th>
                  <th className="px-3 py-2 text-right w-[70px]">Rejected</th>
                  <th className="px-3 py-2 text-left w-[120px]">Reason</th>
                  <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="px-3 py-2 text-sm font-medium">{item.description}</td>
                    <td className="px-3 py-2 text-sm font-mono text-muted-foreground">{item.drawing_number || "—"}</td>
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
                    <td className="px-3 py-2 text-right text-sm font-mono tabular-nums">
                      {item.rejected_quantity > 0 ? (
                        <span className="text-destructive font-medium">{item.rejected_quantity}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
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
          <p className="text-muted-foreground font-medium">Select a Purchase Order to begin</p>
          <p className="text-sm text-muted-foreground">GRN items will be pre-filled from the PO</p>
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

