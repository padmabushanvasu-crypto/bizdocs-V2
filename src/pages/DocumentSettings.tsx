import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Save, ChevronRight, Plus, Settings, Trash2, Calendar, Upload, X, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCompanySettings, saveCompanySettings,
  fetchAllDocumentSettings, saveDocumentSettings,
  fetchCustomFields, createCustomField, updateCustomField, deleteCustomField,
  startNewFinancialYear,
  type DocumentSettings, type CustomField,
} from "@/lib/settings-api";
import { supabase } from "@/integrations/supabase/client";

const DOC_TYPES = [
  { key: "purchase_order", label: "Purchase Order" },
  { key: "delivery_challan", label: "Delivery Challan" },
  { key: "invoice", label: "Invoice" },
  { key: "grn", label: "GRN" },
  { key: "payment_receipt", label: "Payment Receipt" },
];

const PAPER_SIZES = ["A4 Portrait", "A4 Landscape", "A5", "Letter"];
const FIELD_TYPES = ["text", "number", "date", "dropdown", "yes_no"];
const FIELD_LOCATIONS = ["header", "line_item", "footer"];

const COLUMN_DEFAULTS: Record<string, string[]> = {
  purchase_order: ["Description", "Drawing Number", "Quantity", "Unit", "Unit Price", "Delivery Date", "Amount"],
  delivery_challan: ["Description", "Drawing Number", "Qty (Nos)", "Weight (KG)", "Area (SFT)", "Nature of Process", "Material"],
  invoice: ["Description", "HSN/SAC", "Quantity", "Unit", "Unit Price", "Discount %", "GST %", "Taxable", "Amount"],
  grn: ["Description", "Drawing Number", "PO Qty", "Previously Received", "Pending", "Receiving Now", "Accepted", "Rejected"],
  payment_receipt: ["Receipt No", "Date", "Amount", "Mode", "Reference"],
};

export default function DocumentSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [fyDialogOpen, setFyDialogOpen] = useState(false);
  const [cfDialogOpen, setCfDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // Signature upload
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState<string>("");
  const [sigUploading, setSigUploading] = useState(false);

  const { data: companyData } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });
  const [company, setCompany] = useState<{ financial_year_label?: string; financial_year_start?: string }>({});
  if (companyData && !company.financial_year_label && companyData.financial_year_label) {
    setTimeout(() => setCompany({
      financial_year_label: companyData.financial_year_label,
      financial_year_start: companyData.financial_year_start,
    }), 0);
  }
  if (companyData?.signature_url && !sigPreview) {
    setTimeout(() => setSigPreview(companyData.signature_url!), 0);
  }

  // Document settings
  const { data: allDocSettings } = useQuery({ queryKey: ["document-settings"], queryFn: fetchAllDocumentSettings });
  const [docForm, setDocForm] = useState<Partial<DocumentSettings>>({});

  const docSave = useMutation({
    mutationFn: () => saveDocumentSettings(selectedDocType!, docForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      toast({ title: "Document settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openDocSettings = (docType: string) => {
    setSelectedDocType(docType);
    const existing = allDocSettings?.find((d) => d.document_type === docType);
    if (existing) setDocForm(existing);
    else setDocForm({});
  };

  // Custom fields
  const { data: customFields } = useQuery({
    queryKey: ["custom-fields", selectedDocType],
    queryFn: () => fetchCustomFields(selectedDocType || undefined),
    enabled: !!selectedDocType,
  });

  const [cfForm, setCfForm] = useState({
    field_label: "", field_key: "", field_type: "text", dropdown_options: [] as string[],
    location: "header", is_required: false, print_on_document: true, default_value: "",
    is_searchable: false, sort_order: 0,
  });
  const [newOption, setNewOption] = useState("");

  const cfSave = useMutation({
    mutationFn: async () => {
      const payload = {
        ...cfForm,
        document_type: selectedDocType!,
        field_key: cfForm.field_key || cfForm.field_label.toLowerCase().replace(/\s+/g, "_"),
        dropdown_options: cfForm.dropdown_options,
      };
      if (editingField) return updateCustomField(editingField.id, payload as any);
      return createCustomField(payload as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      setCfDialogOpen(false);
      toast({ title: editingField ? "Custom field updated" : "Custom field created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cfDelete = useMutation({
    mutationFn: (id: string) => deleteCustomField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      toast({ title: "Custom field removed" });
    },
  });

  const openNewCf = () => {
    setEditingField(null);
    setCfForm({
      field_label: "", field_key: "", field_type: "text", dropdown_options: [],
      location: "header", is_required: false, print_on_document: true, default_value: "",
      is_searchable: false, sort_order: (customFields?.length ?? 0) + 1,
    });
    setCfDialogOpen(true);
  };

  const openEditCf = (cf: CustomField) => {
    setEditingField(cf);
    setCfForm({
      field_label: cf.field_label, field_key: cf.field_key, field_type: cf.field_type,
      dropdown_options: (cf.dropdown_options as string[]) || [],
      location: cf.location, is_required: cf.is_required, print_on_document: cf.print_on_document,
      default_value: cf.default_value || "", is_searchable: cf.is_searchable, sort_order: cf.sort_order,
    });
    setCfDialogOpen(true);
  };

  const sigSave = useMutation({
    mutationFn: async () => {
      let sigUrl = companyData?.signature_url ?? "";
      if (sigFile) {
        setSigUploading(true);
        try {
          const ext = sigFile.name.split(".").pop();
          const path = `signature/signature.${ext}`;
          await supabase.storage.from("company-assets").upload(path, sigFile, { upsert: true });
          const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
          sigUrl = urlData.publicUrl;
        } finally {
          setSigUploading(false);
        }
      }
      return saveCompanySettings({ signature_url: sigUrl } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: "Signature saved" });
      setSigFile(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSigFile(file);
    const reader = new FileReader();
    reader.onload = () => setSigPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Financial Year
  const fySave = useMutation({
    mutationFn: () => saveCompanySettings(company as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: "Financial year settings saved" });
    },
  });

  const fyMutation = useMutation({
    mutationFn: startNewFinancialYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      setFyDialogOpen(false);
      toast({ title: "New financial year started. Document numbering has been reset." });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => selectedDocType ? setSelectedDocType(null) : navigate("/settings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {selectedDocType
              ? `${DOC_TYPES.find((d) => d.key === selectedDocType)?.label} Settings`
              : "Document Settings"}
          </h1>
          <p className="text-sm text-slate-500">
            {selectedDocType
              ? "Configure numbering, layout and custom fields"
              : "Invoice, PO, DC, GRN and Job Card preferences"}
          </p>
        </div>
      </div>

      {!selectedDocType ? (
        <>
          {/* Document Type List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Document Types</h2>
              <p className="text-sm text-slate-500 mt-0.5">Select a document type to configure its settings</p>
            </div>
            <div className="divide-y divide-slate-100">
              {DOC_TYPES.map((dt) => {
                const ds = allDocSettings?.find((d) => d.document_type === dt.key);
                return (
                  <button
                    key={dt.key}
                    onClick={() => openDocSettings(dt.key)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{dt.label}</p>
                        {ds && (
                          <p className="text-xs text-slate-400 font-mono">
                            {ds.numbering_prefix || "—"}{String((ds.numbering_current ?? 0) + 1).padStart(3, "0")}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Financial Year Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                <h2 className="font-semibold text-slate-900">Financial Year</h2>
              </div>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-slate-900">FY {companyData?.financial_year_label || "2025-26"}</p>
                  <p className="text-sm text-slate-500">
                    {companyData?.financial_year_start
                      ? `${new Date(companyData.financial_year_start).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} — ${new Date(new Date(companyData.financial_year_start).getFullYear() + 1, 2, 31).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                      : "01 Apr 2025 — 31 Mar 2026"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Financial Year Label</Label>
                  <Input
                    value={company.financial_year_label || ""}
                    onChange={(e) => setCompany((c) => ({ ...c, financial_year_label: e.target.value }))}
                    placeholder="e.g. 25-26"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={company.financial_year_start || ""}
                    onChange={(e) => setCompany((c) => ({ ...c, financial_year_start: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fySave.mutate()} disabled={fySave.isPending}>
                  <Save className="h-4 w-4 mr-1" /> Save FY Settings
                </Button>
                <Button variant="destructive" onClick={() => setFyDialogOpen(true)}>
                  Start New Financial Year
                </Button>
              </div>

              {/* Numbering summary */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Numbering</p>
                <div className="space-y-1.5">
                  {(allDocSettings ?? []).map((ds) => (
                    <div key={ds.document_type} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50">
                      <span className="text-sm text-slate-600 capitalize">{ds.document_type.replace(/_/g, " ")}</span>
                      <span className="font-mono text-sm text-slate-500">
                        {ds.numbering_prefix || "—"}{String((ds.numbering_current ?? 0) + 1).padStart(3, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Signature Upload */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-slate-400" />
                <h2 className="font-semibold text-slate-900">Authorized Signature</h2>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">Printed on invoices, DCs, and POs</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-4">
                {sigPreview ? (
                  <div className="relative">
                    <img
                      src={sigPreview}
                      alt="Signature"
                      className="h-20 w-auto max-w-[200px] object-contain border border-slate-200 rounded-lg p-1 bg-white"
                    />
                    <button
                      onClick={() => { setSigPreview(""); setSigFile(null); }}
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-40 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                    No signature
                  </div>
                )}
                <div>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleSigChange} />
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      <Upload className="h-4 w-4" /> Upload Signature
                    </div>
                  </label>
                  <p className="text-xs text-slate-400 mt-1">PNG with transparent background recommended</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => sigSave.mutate()}
                disabled={sigSave.isPending || sigUploading || !sigFile}
              >
                <Save className="h-4 w-4 mr-1" />
                {sigUploading ? "Uploading…" : sigSave.isPending ? "Saving…" : "Save Signature"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* Document Settings Form */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Paper Size</Label>
                <Select value={docForm.paper_size || "A4 Portrait"} onValueChange={(v) => setDocForm((f) => ({ ...f, paper_size: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAPER_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {["purchase_order", "delivery_challan"].includes(selectedDocType) && (
                <div className="space-y-1.5">
                  <Label>Copies Per Page</Label>
                  <Select value={String(docForm.copies_per_page || 1)} onValueChange={(v) => setDocForm((f) => ({ ...f, copies_per_page: parseInt(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Copy</SelectItem>
                      <SelectItem value="2">2 Copies</SelectItem>
                      <SelectItem value="3">3 Copies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Numbering */}
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Document Numbering</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Prefix</Label>
                  <Input value={docForm.numbering_prefix || ""} onChange={(e) => setDocForm((f) => ({ ...f, numbering_prefix: e.target.value }))} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Starting Number</Label>
                  <Input type="number" value={docForm.numbering_start || 1} onChange={(e) => setDocForm((f) => ({ ...f, numbering_start: parseInt(e.target.value) || 1 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Next Preview</Label>
                  <div className="h-10 flex items-center font-mono text-sm text-slate-500 bg-slate-50 rounded-md px-3 border border-slate-200">
                    {docForm.numbering_prefix}{String(Math.max((docForm.numbering_current || 0) + 1, docForm.numbering_start || 1)).padStart(3, "0")}
                  </div>
                </div>
              </div>
            </div>

            {/* Display toggles */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Display Options</Label>
              {[
                { key: "show_logo", label: "Show Logo" },
                { key: "show_signature", label: "Show Signature" },
                { key: "show_bank_details", label: "Show Bank Details" },
                { key: "show_gst_breakup", label: "Show GST Breakup" },
                { key: "show_drawing_number", label: "Show Drawing Number" },
                { key: "show_not_for_sale", label: 'Show "NOT FOR SALE"' },
              ].map((toggle) => (
                <div key={toggle.key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{toggle.label}</span>
                  <Switch
                    checked={(docForm as any)[toggle.key] ?? true}
                    onCheckedChange={(v) => setDocForm((f) => ({ ...f, [toggle.key]: v }))}
                  />
                </div>
              ))}
            </div>

            {/* Column Label Overrides */}
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-500">Column Label Overrides</Label>
              <div className="space-y-1.5">
                {(COLUMN_DEFAULTS[selectedDocType] || []).map((col) => {
                  const overrides = (docForm.column_label_overrides || {}) as Record<string, string>;
                  return (
                    <div key={col} className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 w-40 shrink-0">{col}</span>
                      <Input
                        placeholder={col}
                        value={overrides[col] || ""}
                        onChange={(e) => setDocForm((f) => ({
                          ...f,
                          column_label_overrides: { ...(f.column_label_overrides || {}), [col]: e.target.value },
                        }))}
                        className="text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Header Note</Label>
                <Textarea value={docForm.header_note || ""} onChange={(e) => setDocForm((f) => ({ ...f, header_note: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Footer Note</Label>
                <Textarea value={docForm.footer_note || ""} onChange={(e) => setDocForm((f) => ({ ...f, footer_note: e.target.value }))} rows={3} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Terms & Conditions</Label>
              <Textarea value={docForm.terms_and_conditions || ""} onChange={(e) => setDocForm((f) => ({ ...f, terms_and_conditions: e.target.value }))} rows={4} />
            </div>

            <Button onClick={() => docSave.mutate()} disabled={docSave.isPending}>
              <Save className="h-4 w-4 mr-1" /> Save Document Settings
            </Button>
          </div>

          {/* Custom Fields */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Custom Fields</h2>
              <Button size="sm" variant="outline" onClick={openNewCf}>
                <Plus className="h-4 w-4 mr-1" /> Add Field
              </Button>
            </div>

            {(!customFields || customFields.length === 0) ? (
              <p className="text-sm text-slate-500">No custom fields for this document type yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr><th>Label</th><th>Type</th><th>Location</th><th>Required</th><th>Printed</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {customFields.map((cf) => (
                      <tr key={cf.id}>
                        <td className="font-medium">{cf.field_label}</td>
                        <td className="capitalize text-slate-500">{cf.field_type.replace("_", "/")}</td>
                        <td className="capitalize text-slate-500">{cf.location.replace("_", " ")}</td>
                        <td>{cf.is_required ? "Yes" : "No"}</td>
                        <td>{cf.print_on_document ? "Yes" : "No"}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCf(cf)}>
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cfDelete.mutate(cf.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Financial Year Confirmation Dialog */}
      <Dialog open={fyDialogOpen} onOpenChange={setFyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Financial Year?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will reset all document counters to 1. Existing documents will not be affected.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => fyMutation.mutate()} disabled={fyMutation.isPending}>
              Confirm — Start New FY
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Field Dialog */}
      <Dialog open={cfDialogOpen} onOpenChange={setCfDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Field Label *</Label>
              <Input value={cfForm.field_label} onChange={(e) => setCfForm((f) => ({ ...f, field_label: e.target.value }))} placeholder="e.g. Customer PO Number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Type</Label>
                <Select value={cfForm.field_type} onValueChange={(v) => setCfForm((f) => ({ ...f, field_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", "/")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Select value={cfForm.location} onValueChange={(v) => setCfForm((f) => ({ ...f, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_LOCATIONS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {cfForm.field_type === "dropdown" && (
              <div className="space-y-1.5">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="Add option" className="text-sm" />
                  <Button size="sm" variant="outline" onClick={() => { if (newOption.trim()) { setCfForm((f) => ({ ...f, dropdown_options: [...f.dropdown_options, newOption.trim()] })); setNewOption(""); } }}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cfForm.dropdown_options.map((opt, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">
                      {opt}
                      <button onClick={() => setCfForm((f) => ({ ...f, dropdown_options: f.dropdown_options.filter((_, j) => j !== i) }))} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={cfForm.is_required} onCheckedChange={(v) => setCfForm((f) => ({ ...f, is_required: v }))} />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={cfForm.print_on_document} onCheckedChange={(v) => setCfForm((f) => ({ ...f, print_on_document: v }))} />
                Print on document
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => cfSave.mutate()} disabled={cfSave.isPending}>
              {editingField ? "Update" : "Add"} Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
