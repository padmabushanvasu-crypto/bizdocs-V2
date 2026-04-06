import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, GripVertical, ChevronUp, ChevronDown, Plus, Trash2, Save, RotateCcw,
  ToggleLeft, ToggleRight, FileText, Layers, Type, Pen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchDocumentSettings, saveDocumentSettings } from "@/lib/settings-api";
import {
  getDefaultTemplate,
  type TemplateConfig,
  type TemplateSection,
  type TemplateField,
  type LineItemColumn,
  type SignatureField,
} from "@/lib/template-defaults";

const DOC_TYPES = [
  { key: "purchase_order", label: "Purchase Order", icon: "📦" },
  { key: "delivery_challan", label: "Delivery Challan", icon: "🚚" },
  { key: "invoice", label: "Invoice", icon: "🧾" },
];

const FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox", "textarea"];

function moveItem<T extends { order: number }>(arr: T[], index: number, direction: "up" | "down"): T[] {
  const newArr = [...arr].sort((a, b) => a.order - b.order);
  const swapIdx = direction === "up" ? index - 1 : index + 1;
  if (swapIdx < 0 || swapIdx >= newArr.length) return newArr;
  const tempOrder = newArr[index].order;
  newArr[index] = { ...newArr[index], order: newArr[swapIdx].order };
  newArr[swapIdx] = { ...newArr[swapIdx], order: tempOrder };
  return newArr.sort((a, b) => a.order - b.order);
}

export default function TemplateEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState("invoice");
  const [config, setConfig] = useState<TemplateConfig>(getDefaultTemplate("invoice"));
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [addFieldDialog, setAddFieldDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [addColumnDialog, setAddColumnDialog] = useState(false);
  const [addSignatureDialog, setAddSignatureDialog] = useState(false);
  const [newFieldForm, setNewFieldForm] = useState({ label: "", type: "text", required: false, printOnDoc: true, showOnForm: true, dropdownOptions: "" });
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newSignatureLabel, setNewSignatureLabel] = useState("");

  const { data: docSettings } = useQuery({
    queryKey: ["document-settings", docType],
    queryFn: () => fetchDocumentSettings(docType),
  });

  useEffect(() => {
    if (docSettings) {
      const saved = (docSettings as any).template_config;
      if (saved && typeof saved === "object" && saved.sections?.length > 0) {
        setConfig(saved as TemplateConfig);
      } else {
        setConfig(getDefaultTemplate(docType));
      }
    } else {
      setConfig(getDefaultTemplate(docType));
    }
  }, [docSettings, docType]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await saveDocumentSettings(docType, { template_config: config } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      toast({ title: "Template saved successfully" });
    },
    onError: (e: any) => toast({ title: "Error saving template", description: e.message, variant: "destructive" }),
  });

  const handleReset = () => {
    setConfig(getDefaultTemplate(docType));
    setResetDialogOpen(false);
    toast({ title: "Template reset to defaults" });
  };

  // Section operations
  const toggleSection = (sectionId: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s),
    }));
  };

  const renameSectionLabel = (sectionId: string, label: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s => s.id === sectionId ? { ...s, label } : s),
    }));
  };

  const moveSectionOrder = (index: number, direction: "up" | "down") => {
    setConfig(c => ({ ...c, sections: moveItem(c.sections, index, direction) }));
  };

  // Field operations
  const toggleField = (sectionId: string, fieldId: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, enabled: !f.enabled } : f) }
          : s
      ),
    }));
  };

  const renameFieldLabel = (sectionId: string, fieldId: string, label: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, label } : f) }
          : s
      ),
    }));
  };

  const toggleFieldRequired = (sectionId: string, fieldId: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, required: !f.required } : f) }
          : s
      ),
    }));
  };

  const moveFieldOrder = (sectionId: string, index: number, direction: "up" | "down") => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s =>
        s.id === sectionId
          ? { ...s, fields: moveItem(s.fields, index, direction) }
          : s
      ),
    }));
  };

  const removeField = (sectionId: string, fieldId: string) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s =>
        s.id === sectionId
          ? { ...s, fields: s.fields.filter(f => f.id !== fieldId) }
          : s
      ),
    }));
  };

  const addCustomField = () => {
    if (!newFieldForm.label.trim() || !addFieldDialog.sectionId) return;
    const fieldId = `custom_${newFieldForm.label.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const newField: TemplateField = {
      id: fieldId,
      label: newFieldForm.label,
      enabled: true,
      required: newFieldForm.required,
      order: 999,
    };
    setConfig(c => ({
      ...c,
      sections: c.sections.map(s => {
        if (s.id !== addFieldDialog.sectionId) return s;
        const fields = [...s.fields, newField];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    }));
    setAddFieldDialog({ open: false, sectionId: null });
    setNewFieldForm({ label: "", type: "text", required: false, printOnDoc: true, showOnForm: true, dropdownOptions: "" });
  };

  // Column operations
  const toggleColumn = (colId: string) => {
    setConfig(c => ({
      ...c,
      lineItemColumns: c.lineItemColumns.map(col => col.id === colId ? { ...col, enabled: !col.enabled } : col),
    }));
  };

  const renameColumn = (colId: string, label: string) => {
    setConfig(c => ({
      ...c,
      lineItemColumns: c.lineItemColumns.map(col => col.id === colId ? { ...col, label } : col),
    }));
  };

  const moveColumnOrder = (index: number, direction: "up" | "down") => {
    setConfig(c => ({ ...c, lineItemColumns: moveItem(c.lineItemColumns, index, direction) }));
  };

  const removeColumn = (colId: string) => {
    setConfig(c => ({ ...c, lineItemColumns: c.lineItemColumns.filter(col => col.id !== colId) }));
  };

  const addCustomColumn = () => {
    if (!newColumnLabel.trim()) return;
    const colId = `custom_col_${newColumnLabel.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    setConfig(c => ({
      ...c,
      lineItemColumns: [...c.lineItemColumns, { id: colId, label: newColumnLabel, enabled: true, order: c.lineItemColumns.length }],
    }));
    setAddColumnDialog(false);
    setNewColumnLabel("");
  };

  // Signature operations
  const toggleSignature = (sigId: string) => {
    setConfig(c => ({
      ...c,
      signatureFields: c.signatureFields.map(s => s.id === sigId ? { ...s, enabled: !s.enabled } : s),
    }));
  };

  const renameSignature = (sigId: string, label: string) => {
    setConfig(c => ({
      ...c,
      signatureFields: c.signatureFields.map(s => s.id === sigId ? { ...s, label } : s),
    }));
  };

  const moveSignatureOrder = (index: number, direction: "up" | "down") => {
    setConfig(c => ({ ...c, signatureFields: moveItem(c.signatureFields, index, direction) }));
  };

  const removeSignature = (sigId: string) => {
    setConfig(c => ({ ...c, signatureFields: c.signatureFields.filter(s => s.id !== sigId) }));
  };

  const addCustomSignature = () => {
    if (!newSignatureLabel.trim()) return;
    const sigId = `custom_sig_${newSignatureLabel.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    setConfig(c => ({
      ...c,
      signatureFields: [...c.signatureFields, { id: sigId, label: newSignatureLabel, enabled: true, order: c.signatureFields.length }],
    }));
    setAddSignatureDialog(false);
    setNewSignatureLabel("");
  };

  const sortedSections = [...config.sections].sort((a, b) => a.order - b.order);
  const sortedColumns = [...config.lineItemColumns].sort((a, b) => a.order - b.order);
  const sortedSignatures = [...config.signatureFields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Doc type tabs */}
      <Tabs value={docType} onValueChange={setDocType}>
        <TabsList>
          {DOC_TYPES.map(dt => (
            <TabsTrigger key={dt.key} value={dt.key}>
              <span className="mr-1.5">{dt.icon}</span> {dt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Editor Panel */}
        <div className="flex-1 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-foreground text-lg">
              {DOC_TYPES.find(d => d.key === docType)?.label} Template
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save Template
              </Button>
            </div>
          </div>

          {/* Sections */}
          <div className="paper-card space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              <Layers className="h-3.5 w-3.5 inline mr-1" /> Sections & Fields
            </h3>
            <Accordion type="multiple" className="space-y-1">
              {sortedSections.map((section, sIdx) => (
                <AccordionItem key={section.id} value={section.id} className="border rounded-lg px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSectionOrder(sIdx, "up"); }}
                        disabled={sIdx === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSectionOrder(sIdx, "down"); }}
                        disabled={sIdx === sortedSections.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Switch
                      checked={section.enabled}
                      onCheckedChange={() => toggleSection(section.id)}
                      className="scale-75"
                    />
                    <AccordionTrigger className="flex-1 hover:no-underline py-3">
                      <span className={section.enabled ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                        {section.label}
                      </span>
                    </AccordionTrigger>
                    <Badge variant="secondary" className="text-[10px]">
                      {section.fields.filter(f => f.enabled).length}/{section.fields.length} fields
                    </Badge>
                  </div>

                  <AccordionContent className="pt-1 pb-3">
                    {/* Rename section */}
                    <div className="flex items-center gap-2 mb-3">
                      <Label className="text-xs shrink-0">Section Label:</Label>
                      <Input
                        value={section.label}
                        onChange={(e) => renameSectionLabel(section.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Fields */}
                    <div className="space-y-1">
                      {[...section.fields].sort((a, b) => a.order - b.order).map((field, fIdx) => (
                        <div key={field.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50">
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => moveFieldOrder(section.id, fIdx, "up")}
                              disabled={fIdx === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                            >
                              <ChevronUp className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={() => moveFieldOrder(section.id, fIdx, "down")}
                              disabled={fIdx === section.fields.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                            >
                              <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                          </div>
                          <Switch
                            checked={field.enabled}
                            onCheckedChange={() => toggleField(section.id, field.id)}
                            className="scale-[0.65]"
                          />
                          <Input
                            value={field.label}
                            onChange={(e) => renameFieldLabel(section.id, field.id, e.target.value)}
                            className={`h-7 text-sm flex-1 ${!field.enabled ? "text-muted-foreground" : ""}`}
                          />
                          <button
                            onClick={() => toggleFieldRequired(section.id, field.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${field.required ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border text-muted-foreground"}`}
                          >
                            {field.required ? "Required" : "Optional"}
                          </button>
                          {field.id.startsWith("custom_") && (
                            <button onClick={() => removeField(section.id, field.id)} className="text-destructive hover:text-destructive/80 p-1">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => setAddFieldDialog({ open: true, sectionId: section.id })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Custom Field
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Line Item Columns */}
          <div className="paper-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5 inline mr-1" /> Line Item Columns
              </h3>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAddColumnDialog(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Column
              </Button>
            </div>
            <div className="space-y-1">
              {sortedColumns.map((col, i) => (
                <div key={col.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveColumnOrder(i, "up")} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronUp className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => moveColumnOrder(i, "down")} disabled={i === sortedColumns.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <Switch checked={col.enabled} onCheckedChange={() => toggleColumn(col.id)} className="scale-[0.65]" />
                  <Input value={col.label} onChange={(e) => renameColumn(col.id, e.target.value)} className={`h-7 text-sm flex-1 ${!col.enabled ? "text-muted-foreground" : ""}`} />
                  {col.id.startsWith("custom_") && (
                    <button onClick={() => removeColumn(col.id)} className="text-destructive hover:text-destructive/80 p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Signature Block */}
          <div className="paper-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Pen className="h-3.5 w-3.5 inline mr-1" /> Signature Block
              </h3>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAddSignatureDialog(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Signature Field
              </Button>
            </div>
            <div className="space-y-1">
              {sortedSignatures.map((sig, i) => (
                <div key={sig.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveSignatureOrder(i, "up")} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronUp className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => moveSignatureOrder(i, "down")} disabled={i === sortedSignatures.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <Switch checked={sig.enabled} onCheckedChange={() => toggleSignature(sig.id)} className="scale-[0.65]" />
                  <Input value={sig.label} onChange={(e) => renameSignature(sig.id, e.target.value)} className={`h-7 text-sm flex-1 ${!sig.enabled ? "text-muted-foreground" : ""}`} />
                  {sig.id.startsWith("custom_") && (
                    <button onClick={() => removeSignature(sig.id)} className="text-destructive hover:text-destructive/80 p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="paper-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Type className="h-3.5 w-3.5 inline mr-1" /> Terms & Conditions
              </h3>
              <Switch checked={config.showTerms} onCheckedChange={v => setConfig(c => ({ ...c, showTerms: v }))} />
            </div>
            {config.showTerms && (
              <Textarea
                value={config.termsText}
                onChange={(e) => setConfig(c => ({ ...c, termsText: e.target.value }))}
                placeholder="Enter default terms & conditions for this document type..."
                rows={5}
                className="text-sm"
              />
            )}
          </div>
        </div>

        {/* Live Preview */}
        <div className="lg:w-[380px] shrink-0">
          <div className="sticky top-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              <Eye className="h-3.5 w-3.5 inline mr-1" /> Live Preview
            </h3>
            <div className="border border-border rounded-lg bg-card p-4 shadow-sm text-[9px] leading-relaxed space-y-3 max-h-[80vh] overflow-y-auto">
              {sortedSections.filter(s => s.enabled).map(section => (
                <div key={section.id}>
                  <div className="font-bold text-[10px] text-primary border-b border-border pb-0.5 mb-1 uppercase">
                    {section.label}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {section.fields.filter(f => f.enabled).sort((a, b) => a.order - b.order).map(field => (
                      <div key={field.id} className="flex justify-between">
                        <span className="text-muted-foreground">{field.label}:</span>
                        <span className="font-medium text-foreground">—</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Line items preview */}
              <div>
                <div className="font-bold text-[10px] text-primary border-b border-border pb-0.5 mb-1 uppercase">
                  Line Items
                </div>
                <table className="w-full">
                  <thead>
                    <tr>
                      {sortedColumns.filter(c => c.enabled).map(col => (
                        <th key={col.id} className="text-left text-[8px] font-semibold text-slate-500 pb-0.5 pr-1 border-b border-slate-200">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {sortedColumns.filter(c => c.enabled).map(col => (
                        <td key={col.id} className="text-[8px] text-muted-foreground/60 pr-1">—</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Signature preview */}
              <div>
                <div className="font-bold text-[10px] text-primary border-b border-border pb-0.5 mb-1 uppercase">
                  Signatures
                </div>
                <div className="flex gap-3">
                  {sortedSignatures.filter(s => s.enabled).map(sig => (
                    <div key={sig.id} className="flex-1 text-center">
                      <div className="h-6 border-b border-dashed border-muted-foreground/30" />
                      <div className="text-[8px] text-muted-foreground mt-0.5">{sig.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Terms preview */}
              {config.showTerms && (
                <div>
                  <div className="font-bold text-[10px] text-primary border-b border-border pb-0.5 mb-1 uppercase">
                    Terms & Conditions
                  </div>
                  <div className="text-[8px] text-muted-foreground">
                    {config.termsText || "No terms configured."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Field Dialog */}
      <Dialog open={addFieldDialog.open} onOpenChange={(v) => { if (!v) setAddFieldDialog({ open: false, sectionId: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Field Label *</Label>
              <Input value={newFieldForm.label} onChange={(e) => setNewFieldForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Project Code" />
            </div>
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select value={newFieldForm.type} onValueChange={v => setNewFieldForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newFieldForm.type === "dropdown" && (
              <div className="space-y-1.5">
                <Label>Options (comma-separated)</Label>
                <Input value={newFieldForm.dropdownOptions} onChange={(e) => setNewFieldForm(f => ({ ...f, dropdownOptions: e.target.value }))} placeholder="Option 1, Option 2, Option 3" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch checked={newFieldForm.required} onCheckedChange={v => setNewFieldForm(f => ({ ...f, required: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Show on printed document</Label>
              <Switch checked={newFieldForm.printOnDoc} onCheckedChange={v => setNewFieldForm(f => ({ ...f, printOnDoc: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldDialog({ open: false, sectionId: null })}>Cancel</Button>
            <Button onClick={addCustomField} disabled={!newFieldForm.label.trim()}>Add Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialog} onOpenChange={setAddColumnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Line Item Column</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Column Label *</Label>
            <Input value={newColumnLabel} onChange={(e) => setNewColumnLabel(e.target.value)} placeholder="e.g. Batch No" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnDialog(false)}>Cancel</Button>
            <Button onClick={addCustomColumn} disabled={!newColumnLabel.trim()}>Add Column</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Signature Dialog */}
      <Dialog open={addSignatureDialog} onOpenChange={setAddSignatureDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Signature Field</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Label *</Label>
            <Input value={newSignatureLabel} onChange={(e) => setNewSignatureLabel(e.target.value)} placeholder="e.g. QC Checked By" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSignatureDialog(false)}>Cancel</Button>
            <Button onClick={addCustomSignature} disabled={!newSignatureLabel.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Default Template</DialogTitle>
            <DialogDescription>This will restore the original factory layout for {DOC_TYPES.find(d => d.key === docType)?.label}. All your customisations will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>Reset to Default</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
