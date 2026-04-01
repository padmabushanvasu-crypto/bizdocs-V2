import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createJobWorkStep } from "@/lib/job-works-api";
import { fetchParties, type Party } from "@/lib/parties-api";

const UNITS = ["NOS", "KG", "KGS", "MTR", "SFT", "SET"];

interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  defaultUnit?: string;
}

export default function AddStepDialog({ open, onOpenChange, jobCardId, defaultUnit = "NOS" }: AddStepDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stepType, setStepType] = useState<"internal" | "external">("external");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  // Internal fields
  const [labourCost, setLabourCost] = useState(0);
  const [materialCost, setMaterialCost] = useState(0);
  const [additionalCost, setAdditionalCost] = useState(0);

  // External fields
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [qtySent, setQtySent] = useState<number | undefined>();
  const [unit, setUnit] = useState(defaultUnit || "NOS");
  const [jobWorkCharges, setJobWorkCharges] = useState(0);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");

  const { data: partiesData } = useQuery({
    queryKey: ["parties-vendors"],
    queryFn: () => fetchParties({ status: "active", pageSize: 500 }),
    enabled: open,
  });
  const vendors = (partiesData?.data ?? []).filter(
    (p: Party) => p.party_type === "vendor" || p.party_type === "both"
  );

  const addMutation = useMutation({
    mutationFn: () =>
      createJobWorkStep({
        job_card_id: jobCardId,
        step_type: stepType,
        name: name.trim(),
        notes: notes.trim() || null,
        labour_cost: labourCost,
        material_cost: materialCost,
        additional_cost: additionalCost,
        vendor_id: stepType === "external" ? vendorId : null,
        vendor_name: stepType === "external" ? vendorName || null : null,
        qty_sent: stepType === "external" ? (qtySent ?? null) : null,
        unit: stepType === "external" ? unit : null,
        job_work_charges: stepType === "external" ? jobWorkCharges : 0,
        expected_return_date: stepType === "external" && expectedReturnDate ? expectedReturnDate : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-card", jobCardId] });
      queryClient.invalidateQueries({ queryKey: ["job-work-steps", jobCardId] });
      toast({ title: "Step added" });
      onOpenChange(false);
      // reset
      setName(""); setNotes(""); setStepType("external");
      setLabourCost(0); setMaterialCost(0); setAdditionalCost(0);
      setVendorId(null); setVendorName(""); setQtySent(undefined);
      setUnit(defaultUnit || "NOS"); setJobWorkCharges(0); setExpectedReturnDate("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Process Step</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step type */}
          <div className="flex gap-2">
            <Button
              variant={stepType === "internal" ? "default" : "outline"}
              size="sm"
              onClick={() => setStepType("internal")}
              className="flex-1"
            >
              Internal
            </Button>
            <Button
              variant={stepType === "external" ? "default" : "outline"}
              size="sm"
              onClick={() => setStepType("external")}
              className="flex-1"
            >
              External (Job Work)
            </Button>
          </div>

          {/* Step name */}
          <div className="space-y-1.5">
            <Label>Step Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CNC Turning, Heat Treatment..."
            />
          </div>

          {stepType === "internal" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Labour Cost (₹)</Label>
                <Input type="number" min={0} value={labourCost} onChange={(e) => setLabourCost(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Material Cost (₹)</Label>
                <Input type="number" min={0} value={materialCost} onChange={(e) => setMaterialCost(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Additional (₹)</Label>
                <Input type="number" min={0} value={additionalCost} onChange={(e) => setAdditionalCost(Number(e.target.value))} />
              </div>
            </div>
          ) : (
            <>
              {/* Vendor select */}
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {vendorName || "Select vendor..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search vendors..." />
                      <CommandList>
                        <CommandEmpty>No vendor found.</CommandEmpty>
                        <CommandGroup>
                          {vendors.map((v: Party) => (
                            <CommandItem
                              key={v.id}
                              value={v.name}
                              onSelect={() => {
                                setVendorId(v.id);
                                setVendorName(v.name);
                                setVendorOpen(false);
                              }}
                            >
                              {v.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Qty + Unit on same row */}
              <div className="space-y-1.5">
                <Label>Qty Sent</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={qtySent ?? ""}
                    onChange={(e) => setQtySent(e.target.value ? Number(e.target.value) : undefined)}
                    className="flex-1"
                  />
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Job Work Charges (₹)</Label>
                  <Input type="number" min={0} value={jobWorkCharges} onChange={(e) => setJobWorkCharges(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expected Return Date</Label>
                  <Input type="date" value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!name.trim() || addMutation.isPending}
          >
            {addMutation.isPending ? "Adding..." : "Add Step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
