import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Factory, Truck, ChevronDown, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fetchStageTemplates, type JobCardStep } from "@/lib/job-cards-api";
import { fetchParties } from "@/lib/parties-api";

interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStep?: JobCardStep | null;
  onSave: (step: Partial<JobCardStep>) => void;
  isSaving?: boolean;
}

type StepType = "internal" | "external" | null;

const emptyInternal = {
  name: "",
  stage_template_id: null as string | null,
  labour_cost: 0,
  material_cost: 0,
  additional_cost: 0,
  notes: "",
};

const emptyExternal = {
  name: "",
  vendor_id: null as string | null,
  vendor_name: "",
  expected_return_date: "",
  qty_sent: null as number | null,
  unit: "NOS",
  job_work_charges: 0,
  transport_cost_out: 0,
  transport_cost_in: 0,
  material_consumed: 0,
  is_rework: false,
  rework_reason: "",
  notes: "",
};

export function AddStepDialog({ open, onOpenChange, editingStep, onSave, isSaving }: AddStepDialogProps) {
  const isEditing = !!editingStep;

  const [stepType, setStepType] = useState<StepType>(null);
  const [internalForm, setInternalForm] = useState(emptyInternal);
  const [externalForm, setExternalForm] = useState(emptyExternal);
  const [vendorOpen, setVendorOpen] = useState(false);

  // Reset or pre-populate whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (editingStep) {
      setStepType(editingStep.step_type);
      if (editingStep.step_type === "internal") {
        setInternalForm({
          name: editingStep.name ?? "",
          stage_template_id: editingStep.stage_template_id ?? null,
          labour_cost: editingStep.labour_cost ?? 0,
          material_cost: editingStep.material_cost ?? 0,
          additional_cost: editingStep.additional_cost ?? 0,
          notes: editingStep.notes ?? "",
        });
        setExternalForm(emptyExternal);
      } else {
        setExternalForm({
          name: editingStep.name ?? "",
          vendor_id: editingStep.vendor_id ?? null,
          vendor_name: editingStep.vendor_name ?? "",
          expected_return_date: editingStep.expected_return_date ?? "",
          qty_sent: editingStep.qty_sent ?? null,
          unit: editingStep.unit ?? "NOS",
          job_work_charges: editingStep.job_work_charges ?? 0,
          transport_cost_out: editingStep.transport_cost_out ?? 0,
          transport_cost_in: editingStep.transport_cost_in ?? 0,
          material_consumed: editingStep.material_consumed ?? 0,
          is_rework: editingStep.is_rework ?? false,
          rework_reason: editingStep.rework_reason ?? "",
          notes: editingStep.notes ?? "",
        });
        setInternalForm(emptyInternal);
      }
    } else {
      setStepType(null);
      setInternalForm(emptyInternal);
      setExternalForm(emptyExternal);
      setVendorOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: templates = [] } = useQuery({
    queryKey: ["stage-templates"],
    queryFn: () => fetchStageTemplates({ status: "active" }),
    enabled: open,
  });

  const { data: vendorsData } = useQuery({
    queryKey: ["parties-vendors"],
    queryFn: () => fetchParties({ type: "vendor", status: "active", pageSize: 500 }),
    enabled: open,
  });
  const vendors = vendorsData?.data ?? [];

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSave = () => {
    if (stepType === "internal") {
      if (!internalForm.name.trim()) return;
      onSave({
        step_type: "internal",
        name: internalForm.name,
        stage_template_id: internalForm.stage_template_id ?? undefined,
        labour_cost: internalForm.labour_cost,
        material_cost: internalForm.material_cost,
        additional_cost: internalForm.additional_cost,
        notes: internalForm.notes || undefined,
      });
    } else if (stepType === "external") {
      if (!externalForm.name.trim()) return;
      onSave({
        step_type: "external",
        name: externalForm.name,
        vendor_id: externalForm.vendor_id ?? undefined,
        vendor_name: externalForm.vendor_name || undefined,
        expected_return_date: externalForm.expected_return_date || undefined,
        qty_sent: externalForm.qty_sent ?? undefined,
        unit: externalForm.unit || "NOS",
        job_work_charges: externalForm.job_work_charges,
        transport_cost_out: externalForm.transport_cost_out,
        transport_cost_in: externalForm.transport_cost_in,
        material_consumed: externalForm.material_consumed,
        is_rework: externalForm.is_rework,
        rework_reason: externalForm.is_rework ? externalForm.rework_reason : undefined,
        notes: externalForm.notes || undefined,
      });
    }
  };

  const selectedTemplate = templates.find((t) => t.id === internalForm.stage_template_id);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Step" : "Add Process Step"}</DialogTitle>
        </DialogHeader>

        {/* Step type selector — only in add mode */}
        {!isEditing && stepType === null && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => setStepType("internal")}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Factory className="h-6 w-6 text-blue-700" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Internal Process</p>
                <p className="text-xs text-muted-foreground mt-1">Done in-house — labour, material, and overhead costs</p>
              </div>
            </button>
            <button
              onClick={() => setStepType("external")}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
            >
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <Truck className="h-6 w-6 text-amber-700" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">External Job Work</p>
                <p className="text-xs text-muted-foreground mt-1">Sent to a vendor — job work, transport, and inspection</p>
              </div>
            </button>
          </div>
        )}

        {/* Internal process form */}
        {stepType === "internal" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Factory className="h-3.5 w-3.5 text-blue-700" />
              </div>
              <span className="text-sm font-medium text-blue-700">Internal Process</span>
              {!isEditing && (
                <button
                  onClick={() => setStepType(null)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Change type
                </button>
              )}
            </div>

            {/* Template chips */}
            {templates.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Quick pick from templates:</p>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setInternalForm((f) => ({
                          ...f,
                          name: t.name,
                          stage_template_id: t.id,
                          additional_cost: t.default_cost ?? 0,
                        }))
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs border transition-colors",
                        internalForm.stage_template_id === t.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground hover:bg-accent border-transparent"
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Link className="h-3 w-3" />
                No templates yet.{" "}
                <a href="/stage-templates" className="underline hover:text-foreground">
                  Add templates
                </a>{" "}
                to speed up step creation.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Step Name *</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                      {internalForm.name || "Select or type a process name..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search templates or type name..."
                        value={internalForm.name}
                        onValueChange={(v) =>
                          setInternalForm((f) => ({ ...f, name: v, stage_template_id: null }))
                        }
                      />
                      <CommandList>
                        <CommandEmpty>
                          <p className="text-xs text-muted-foreground p-2">
                            No template found — the typed name will be used as-is.
                          </p>
                        </CommandEmpty>
                        {templates.length > 0 && (
                          <CommandGroup heading="Templates">
                            {templates.map((t) => (
                              <CommandItem
                                key={t.id}
                                value={t.name}
                                onSelect={() => {
                                  setInternalForm((f) => ({
                                    ...f,
                                    name: t.name,
                                    stage_template_id: t.id,
                                    additional_cost: t.default_cost ?? 0,
                                  }));
                                }}
                              >
                                <div>
                                  <p className="font-medium">{t.name}</p>
                                  <p className="text-xs text-muted-foreground">{t.category}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground">
                  Template: {selectedTemplate.name} · {selectedTemplate.category}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Labour Cost (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={internalForm.labour_cost || ""}
                  onChange={(e) =>
                    setInternalForm((f) => ({ ...f, labour_cost: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Material Cost (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={internalForm.material_cost || ""}
                  onChange={(e) =>
                    setInternalForm((f) => ({ ...f, material_cost: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Additional Cost (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={internalForm.additional_cost || ""}
                  onChange={(e) =>
                    setInternalForm((f) => ({ ...f, additional_cost: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={internalForm.notes}
                onChange={(e) => setInternalForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>
        )}

        {/* External job work form */}
        {stepType === "external" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                <Truck className="h-3.5 w-3.5 text-amber-700" />
              </div>
              <span className="text-sm font-medium text-amber-700">External Job Work</span>
              {!isEditing && (
                <button
                  onClick={() => setStepType(null)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Change type
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Nature of Process *</Label>
              <Input
                value={externalForm.name}
                onChange={(e) => setExternalForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Nickel Plating, CNC Machining & Return"
              />
              <p className="text-xs text-muted-foreground">This will appear on the Job Work DC as the Nature of Process</p>
            </div>

            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {externalForm.vendor_name || "Select vendor..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendors..." />
                    <CommandList>
                      <CommandEmpty>No vendor found.</CommandEmpty>
                      <CommandGroup>
                        {vendors.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.name}
                            onSelect={() => {
                              setExternalForm((f) => ({
                                ...f,
                                vendor_id: v.id,
                                vendor_name: v.name,
                              }));
                              setVendorOpen(false);
                            }}
                          >
                            <div>
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-muted-foreground">{v.city}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Sent</Label>
                <Input
                  type="number"
                  min={0}
                  value={externalForm.qty_sent ?? ""}
                  onChange={(e) =>
                    setExternalForm((f) => ({
                      ...f,
                      qty_sent: e.target.value ? parseFloat(e.target.value) : null,
                    }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input
                  value={externalForm.unit}
                  onChange={(e) => setExternalForm((f) => ({ ...f, unit: e.target.value.toUpperCase() }))}
                  placeholder="NOS"
                  className="font-mono"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected Return</Label>
                <Input
                  type="date"
                  value={externalForm.expected_return_date}
                  onChange={(e) =>
                    setExternalForm((f) => ({ ...f, expected_return_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Job Work Charges (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={externalForm.job_work_charges || ""}
                  onChange={(e) =>
                    setExternalForm((f) => ({ ...f, job_work_charges: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Material Consumed (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={externalForm.material_consumed || ""}
                  onChange={(e) =>
                    setExternalForm((f) => ({
                      ...f,
                      material_consumed: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Transport Out (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={externalForm.transport_cost_out || ""}
                  onChange={(e) =>
                    setExternalForm((f) => ({
                      ...f,
                      transport_cost_out: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Transport In (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={externalForm.transport_cost_in || ""}
                  onChange={(e) =>
                    setExternalForm((f) => ({
                      ...f,
                      transport_cost_in: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="is-rework"
                checked={externalForm.is_rework}
                onCheckedChange={(v) =>
                  setExternalForm((f) => ({ ...f, is_rework: !!v }))
                }
              />
              <div className="space-y-1">
                <Label htmlFor="is-rework" className="cursor-pointer">
                  This is a rework step
                </Label>
                {externalForm.is_rework && (
                  <Input
                    value={externalForm.rework_reason}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, rework_reason: e.target.value }))
                    }
                    placeholder="Reason for rework..."
                    className="mt-1"
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={externalForm.notes}
                onChange={(e) => setExternalForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {stepType !== null && (
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                (stepType === "internal" ? !internalForm.name.trim() : !externalForm.name.trim())
              }
            >
              {isEditing ? "Update Step" : "Add Step"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
