import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Building2, FileText, Plus, Trash2, Save, Calendar, ChevronRight, Database, Upload, Download, Bell } from "lucide-react";
import { LogoUpload } from "@/components/LogoUpload";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCompanySettings, saveCompanySettings,
  fetchAllDocumentSettings, saveDocumentSettings,
  fetchCustomFields, createCustomField, updateCustomField, deleteCustomField,
  startNewFinancialYear,
  type CompanySettings, type DocumentSettings, type CustomField,
} from "@/lib/settings-api";
import ImportDialog from "@/components/ImportDialog";
import NotificationsSettings from "@/pages/NotificationsSettings";
import TemplateEditor from "@/components/TemplateEditor";
import {
  PO_IMPORT_CONFIG, DC_IMPORT_CONFIG, INVOICE_IMPORT_CONFIG, type ValidatedRow,
} from "@/lib/import-utils";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { fetchParties } from "@/lib/parties-api";
import { fetchItems } from "@/lib/items-api";
import {
  exportMultiSheet,
  COMPANY_EXPORT_COLS, PARTIES_EXPORT_COLS, ITEMS_EXPORT_COLS,
  PO_EXPORT_COLS, PO_LINE_ITEMS_EXPORT_COLS, DC_EXPORT_COLS, DC_LINE_ITEMS_EXPORT_COLS,
  GRN_EXPORT_COLS, GRN_LINE_ITEMS_EXPORT_COLS, INVOICE_EXPORT_COLS, INVOICE_LINE_ITEMS_EXPORT_COLS,
  PAYMENT_EXPORT_COLS, DOC_SETTINGS_EXPORT_COLS,
} from "@/lib/export-utils";

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

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("company");
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [fyDialogOpen, setFyDialogOpen] = useState(false);
  const [cfDialogOpen, setCfDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [openingImportType, setOpeningImportType] = useState<"po" | "dc" | "invoice" | null>(null);

  // Company
  const [company, setCompany] = useState<Partial<CompanySettings>>({});
  const { data: companyData } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });
  const companyLoaded = companyData !== undefined;
  if (companyData && !company.id && companyData.id) {
    // Only set once
    setTimeout(() => setCompany(companyData), 0);
  }

  const companySave = useMutation({
    mutationFn: () => saveCompanySettings(company),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: "Company settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Document settings
  const { data: allDocSettings } = useQuery({ queryKey: ["document-settings"], queryFn: fetchAllDocumentSettings });
  const [docForm, setDocForm] = useState<Partial<DocumentSettings>>({});
  const currentDocSettings = allDocSettings?.find((d) => d.document_type === selectedDocType);

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
      if (editingField) {
        return updateCustomField(editingField.id, payload as any);
      }
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

  // Financial Year
  const fyMutation = useMutation({
    mutationFn: startNewFinancialYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      setFyDialogOpen(false);
      toast({ title: "New financial year started. Document numbering has been reset." });
    },
  });

  // Opening data import handlers
  const handlePOImport = async (rows: ValidatedRow[]) => {
    const companyId = await getCompanyId();
    const { data: parties } = await fetchParties({ pageSize: 1000 });
    const partyMap = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
    let imported = 0, warnings = 0;
    for (const row of rows) {
      const d = row.data;
      const vendor = partyMap.get(d["Vendor Name"]?.toLowerCase());
      try {
        const { error } = await supabase.from("purchase_orders").insert({
          company_id: companyId,
          po_number: d["PO Number"],
          po_date: d["PO Date"],
          vendor_id: vendor?.id || null,
          vendor_name: d["Vendor Name"],
          status: d["Status"] || "issued",
          internal_remarks: [d["Notes"], "Imported from Excel"].filter(Boolean).join(" | "),
          sub_total: parseFloat(d["Unit Price"] || "0") * parseFloat(d["Qty"] || "0"),
          grand_total: parseFloat(d["Unit Price"] || "0") * parseFloat(d["Qty"] || "0"),
        } as any);
        if (error) throw error;
        imported++;
        if (row.status === "warning") warnings++;
      } catch { /* skip */ }
    }
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    return { imported, warnings, skipped: rows.length - imported };
  };

  const handleDCImport = async (rows: ValidatedRow[]) => {
    const companyId = await getCompanyId();
    const { data: parties } = await fetchParties({ pageSize: 1000 });
    const partyMap = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
    let imported = 0, warnings = 0;
    for (const row of rows) {
      const d = row.data;
      const party = partyMap.get(d["Party Name"]?.toLowerCase());
      try {
        const { error } = await supabase.from("delivery_challans").insert({
          company_id: companyId,
          dc_number: d["DC Number"],
          dc_date: d["DC Date"],
          party_id: party?.id || null,
          party_name: d["Party Name"],
          status: d["Status"] || "issued",
          nature_of_job_work: d["Nature of Process"] || null,
          return_due_date: d["Return Due Date"] || null,
          internal_remarks: "Imported from Excel",
          total_qty: parseFloat(d["Qty Sent"] || "0"),
        } as any);
        if (error) throw error;
        imported++;
        if (row.status === "warning") warnings++;
      } catch { /* skip */ }
    }
    queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
    return { imported, warnings, skipped: rows.length - imported };
  };

  const handleInvoiceImport = async (rows: ValidatedRow[]) => {
    const companyId = await getCompanyId();
    const { data: parties } = await fetchParties({ type: "customer", pageSize: 1000 });
    const partyMap = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
    let imported = 0, warnings = 0;
    for (const row of rows) {
      const d = row.data;
      const customer = partyMap.get(d["Customer Name"]?.toLowerCase());
      const qty = parseFloat(d["Qty"] || "0");
      const price = parseFloat(d["Unit Price"] || "0");
      const gstRate = parseFloat(d["GST Rate"] || "18");
      const subTotal = qty * price;
      const totalGst = subTotal * gstRate / 100;
      try {
        const { error } = await supabase.from("invoices").insert({
          company_id: companyId,
          invoice_number: d["Invoice Number"],
          invoice_date: d["Invoice Date"],
          customer_id: customer?.id || null,
          customer_name: d["Customer Name"],
          status: d["Status"] || "issued",
          sub_total: subTotal,
          gst_rate: gstRate,
          total_gst: totalGst,
          grand_total: subTotal + totalGst,
          amount_paid: parseFloat(d["Amount Paid"] || "0"),
          amount_outstanding: subTotal + totalGst - parseFloat(d["Amount Paid"] || "0"),
          internal_remarks: "Imported from Excel",
        } as any);
        if (error) throw error;
        imported++;
        if (row.status === "warning") warnings++;
      } catch { /* skip */ }
    }
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    return { imported, warnings, skipped: rows.length - imported };
  };

  const openingImportConfig = openingImportType === "po" ? PO_IMPORT_CONFIG
    : openingImportType === "dc" ? DC_IMPORT_CONFIG
    : openingImportType === "invoice" ? INVOICE_IMPORT_CONFIG : null;

  const openingImportHandler = openingImportType === "po" ? handlePOImport
    : openingImportType === "dc" ? handleDCImport
    : handleInvoiceImport;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-display font-bold text-foreground">Settings</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="financial_year">Financial Year</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-3.5 w-3.5 mr-1" /> Notifications
          </TabsTrigger>
        </TabsList>

        {/* Document Templates */}
        <TabsContent value="templates">
          <TemplateEditor />
        </TabsContent>

        {/* Company Profile */}
        <TabsContent value="company" className="space-y-4">
          <div className="paper-card space-y-4">
            <h2 className="font-display font-bold text-foreground">Company Profile</h2>

            <LogoUpload
              currentLogoPath={company.logo_url || null}
              onUploaded={(path) => setCompany((c) => ({ ...c, logo_url: path }))}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Company Name</Label>
                <Input value={company.company_name || ""} onChange={(e) => setCompany((c) => ({ ...c, company_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={company.gstin || ""} onChange={(e) => setCompany((c) => ({ ...c, gstin: e.target.value }))} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Address Line 1</Label>
                <Input value={company.address_line1 || ""} onChange={(e) => setCompany((c) => ({ ...c, address_line1: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Address Line 2</Label>
                <Input value={company.address_line2 || ""} onChange={(e) => setCompany((c) => ({ ...c, address_line2: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={company.city || ""} onChange={(e) => setCompany((c) => ({ ...c, city: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input value={company.state || ""} onChange={(e) => setCompany((c) => ({ ...c, state: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>State Code</Label>
                  <Input value={company.state_code || ""} onChange={(e) => setCompany((c) => ({ ...c, state_code: e.target.value }))} className="font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>PIN Code</Label>
                <Input value={company.pin_code || ""} onChange={(e) => setCompany((c) => ({ ...c, pin_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={company.phone || ""} onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={company.email || ""} onChange={(e) => setCompany((c) => ({ ...c, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>PAN</Label>
                <Input value={company.pan || ""} onChange={(e) => setCompany((c) => ({ ...c, pan: e.target.value }))} className="font-mono" />
              </div>
            </div>

            <h3 className="font-display font-bold text-foreground pt-2">Bank Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Bank Name</Label><Input value={company.bank_name || ""} onChange={(e) => setCompany((c) => ({ ...c, bank_name: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Account Number</Label><Input value={company.bank_account || ""} onChange={(e) => setCompany((c) => ({ ...c, bank_account: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>IFSC Code</Label><Input value={company.bank_ifsc || ""} onChange={(e) => setCompany((c) => ({ ...c, bank_ifsc: e.target.value }))} className="font-mono" /></div>
              <div className="space-y-1.5"><Label>Branch</Label><Input value={company.bank_branch || ""} onChange={(e) => setCompany((c) => ({ ...c, bank_branch: e.target.value }))} /></div>
            </div>

            <h3 className="font-display font-bold text-foreground pt-2">Default Signature</h3>
            <SignaturePad
              currentSignatureUrl={company.signature_url || null}
              onSignatureSaved={(url) => setCompany((c) => ({ ...c, signature_url: url }))}
              label="Default signature for all documents"
              storagePath="default"
            />

            <div className="space-y-1.5">
              <Label>Default Terms & Conditions</Label>
              <Textarea value={company.default_terms || ""} onChange={(e) => setCompany((c) => ({ ...c, default_terms: e.target.value }))} rows={4} />
            </div>

            <Button onClick={() => companySave.mutate()} disabled={companySave.isPending}>
              <Save className="h-4 w-4 mr-1" /> Save Company Settings
            </Button>
          </div>
        </TabsContent>

        {/* Document Settings */}
        <TabsContent value="documents" className="space-y-4">
          {!selectedDocType ? (
            <div className="paper-card space-y-2">
              <h2 className="font-display font-bold text-foreground">Document Types</h2>
              <p className="text-sm text-muted-foreground">Configure paper size, numbering, labels, and custom fields for each document type.</p>
              <div className="space-y-1 pt-2">
                {DOC_TYPES.map((dt) => (
                  <button
                    key={dt.key}
                    onClick={() => openDocSettings(dt.key)}
                    className="w-full flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{dt.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedDocType(null)}>← Back to document types</Button>

              <div className="paper-card space-y-4">
                <h2 className="font-display font-bold text-foreground">
                  {DOC_TYPES.find((d) => d.key === selectedDocType)?.label} Settings
                </h2>

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

                {/* Toggles */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Display Options</Label>
                  {[
                    { key: "show_logo", label: "Show Logo" },
                    { key: "show_signature", label: "Show Signature" },
                    { key: "show_bank_details", label: "Show Bank Details" },
                    { key: "show_gst_breakup", label: "Show GST Breakup" },
                    { key: "show_drawing_number", label: "Show Drawing Number" },
                    { key: "show_not_for_sale", label: 'Show "NOT FOR SALE"' },
                  ].map((toggle) => (
                    <div key={toggle.key} className="flex items-center justify-between">
                      <span className="text-sm">{toggle.label}</span>
                      <Switch
                        checked={(docForm as any)[toggle.key] ?? true}
                        onCheckedChange={(v) => setDocForm((f) => ({ ...f, [toggle.key]: v }))}
                      />
                    </div>
                  ))}
                </div>

                {/* Column Label Overrides */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Column Label Overrides</Label>
                  <div className="space-y-1.5">
                    {(COLUMN_DEFAULTS[selectedDocType] || []).map((col) => {
                      const overrides = (docForm.column_label_overrides || {}) as Record<string, string>;
                      return (
                        <div key={col} className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground w-40 shrink-0">{col}</span>
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

                {/* Numbering */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Numbering Prefix</Label>
                    <Input value={docForm.numbering_prefix || ""} onChange={(e) => setDocForm((f) => ({ ...f, numbering_prefix: e.target.value }))} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Starting Number</Label>
                    <Input type="number" value={docForm.numbering_start || 1} onChange={(e) => setDocForm((f) => ({ ...f, numbering_start: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Next Number Preview</Label>
                    <div className="h-10 flex items-center font-mono text-sm text-muted-foreground bg-secondary rounded-md px-3">
                      {docForm.numbering_prefix}{String(Math.max((docForm.numbering_current || 0) + 1, docForm.numbering_start || 1)).padStart(3, "0")}
                    </div>
                  </div>
                </div>

                <Button onClick={() => docSave.mutate()} disabled={docSave.isPending}>
                  <Save className="h-4 w-4 mr-1" /> Save Document Settings
                </Button>
              </div>

              {/* Custom Fields */}
              <div className="paper-card space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-foreground">Custom Fields</h2>
                  <Button size="sm" variant="outline" onClick={openNewCf}><Plus className="h-4 w-4 mr-1" /> Add Custom Field</Button>
                </div>

                {(!customFields || customFields.length === 0) ? (
                  <p className="text-sm text-muted-foreground">No custom fields configured for this document type.</p>
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
                            <td className="capitalize text-muted-foreground">{cf.field_type.replace("_", "/")}</td>
                            <td className="capitalize text-muted-foreground">{cf.location.replace("_", " ")}</td>
                            <td>{cf.is_required ? "Yes" : "No"}</td>
                            <td>{cf.print_on_document ? "Yes" : "No"}</td>
                            <td>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCf(cf)}><Settings className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cfDelete.mutate(cf.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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
        </TabsContent>

        {/* Financial Year */}
        <TabsContent value="financial_year" className="space-y-4">
          <div className="paper-card space-y-4">
            <h2 className="font-display font-bold text-foreground">Financial Year</h2>
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium text-lg">FY {companyData?.financial_year_label || "2025-26"}</div>
                <div className="text-sm text-muted-foreground">
                  {companyData?.financial_year_start
                    ? `${new Date(companyData.financial_year_start).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} — ${new Date(new Date(companyData.financial_year_start).getFullYear() + 1, 2, 31).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "01 Apr 2025 — 31 Mar 2026"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Button onClick={() => companySave.mutate()} disabled={companySave.isPending} variant="outline">
                <Save className="h-4 w-4 mr-1" /> Save FY Settings
              </Button>
              <Button variant="destructive" onClick={() => setFyDialogOpen(true)}>
                Start New Financial Year
              </Button>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-display font-bold text-foreground mb-2">Document Numbering</h3>
              <p className="text-sm text-muted-foreground mb-3">Current numbering prefixes for each document type:</p>
              <div className="space-y-2">
                {(allDocSettings ?? []).map((ds) => (
                  <div key={ds.document_type} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <span className="text-sm font-medium capitalize">{ds.document_type.replace("_", " ")}</span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {ds.numbering_prefix || "—"}{String(ds.numbering_current + 1).padStart(3, "0")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Data Management */}
        <TabsContent value="data" className="space-y-4">
          {/* Full Export */}
          <div className="paper-card space-y-4">
            <h2 className="font-display font-bold text-foreground">Export All Data</h2>
            <p className="text-sm text-muted-foreground">
              Download a complete Excel workbook with all company data — parties, items, documents, and settings.
            </p>
            <Button onClick={async () => {
              toast({ title: "Preparing export..." });
              try {
                const companyId = await getCompanyId();
                const [
                  { data: parties }, { data: items },
                  { data: pos }, { data: poItems },
                  { data: dcs }, { data: dcItems },
                  { data: grns }, { data: grnItems },
                  { data: invoices }, { data: invItems },
                  { data: payments }, { data: docSettings },
                ] = await Promise.all([
                  supabase.from("parties").select("*").order("name"),
                  supabase.from("items").select("*").order("item_code"),
                  supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
                  supabase.from("po_line_items").select("*, purchase_orders!inner(po_number)").order("serial_number"),
                  supabase.from("delivery_challans").select("*").order("created_at", { ascending: false }),
                  supabase.from("dc_line_items").select("*, delivery_challans!inner(dc_number)").order("serial_number"),
                  supabase.from("grns").select("*").order("created_at", { ascending: false }),
                  supabase.from("grn_line_items").select("*, grns!inner(grn_number)").order("serial_number"),
                  supabase.from("invoices").select("*").order("created_at", { ascending: false }),
                  supabase.from("invoice_line_items").select("*, invoices!inner(invoice_number)").order("serial_number"),
                  supabase.from("payments").select("*").order("created_at", { ascending: false }),
                  supabase.from("document_settings").select("*"),
                ]);

                const poItemsFlat = (poItems ?? []).map((i: any) => ({ ...i, po_number: i.purchase_orders?.po_number }));
                const dcItemsFlat = (dcItems ?? []).map((i: any) => ({ ...i, dc_number: i.delivery_challans?.dc_number }));
                const grnItemsFlat = (grnItems ?? []).map((i: any) => ({ ...i, grn_number: i.grns?.grn_number }));
                const invItemsFlat = (invItems ?? []).map((i: any) => ({ ...i, invoice_number: i.invoices?.invoice_number }));

                const companyName = companyData?.company_name || "Company";
                const date = new Date().toISOString().split("T")[0];

                exportMultiSheet([
                  { sheetName: "Company Info", columns: COMPANY_EXPORT_COLS, data: companyData ? [companyData] : [] },
                  { sheetName: "Parties", columns: PARTIES_EXPORT_COLS, data: parties ?? [] },
                  { sheetName: "Items", columns: ITEMS_EXPORT_COLS, data: items ?? [] },
                  { sheetName: "Purchase Orders", columns: PO_EXPORT_COLS, data: pos ?? [] },
                  { sheetName: "PO Line Items", columns: PO_LINE_ITEMS_EXPORT_COLS, data: poItemsFlat },
                  { sheetName: "Delivery Challans", columns: DC_EXPORT_COLS, data: dcs ?? [] },
                  { sheetName: "DC Line Items", columns: DC_LINE_ITEMS_EXPORT_COLS, data: dcItemsFlat },
                  { sheetName: "GRNs", columns: GRN_EXPORT_COLS, data: grns ?? [] },
                  { sheetName: "GRN Line Items", columns: GRN_LINE_ITEMS_EXPORT_COLS, data: grnItemsFlat },
                  { sheetName: "Invoices", columns: INVOICE_EXPORT_COLS, data: invoices ?? [] },
                  { sheetName: "Invoice Line Items", columns: INVOICE_LINE_ITEMS_EXPORT_COLS, data: invItemsFlat },
                  { sheetName: "Payment Receipts", columns: PAYMENT_EXPORT_COLS, data: payments ?? [] },
                  { sheetName: "Document Settings", columns: DOC_SETTINGS_EXPORT_COLS, data: docSettings ?? [] },
                ], `BizDocs_Export_${companyName.replace(/\s+/g, "_")}_${date}.xlsx`);

                toast({ title: "Export downloaded successfully" });
              } catch (err: any) {
                toast({ title: "Export failed", description: err.message, variant: "destructive" });
              }
            }}>
              <Download className="h-4 w-4 mr-1" /> Export All Data
            </Button>
          </div>

          {/* Import Opening Data */}
          <div className="paper-card space-y-4">
            <h2 className="font-display font-bold text-foreground">Import Opening Data</h2>
            <p className="text-sm text-muted-foreground">
              For businesses migrating from Excel — import your existing POs, DCs, and Invoices.
              Import parties and items first from their respective pages.
            </p>
            <div className="space-y-2">
              {[
                { key: "po" as const, label: "Purchase Orders", desc: "Import existing PO history" },
                { key: "dc" as const, label: "Delivery Challans", desc: "Import existing DC history" },
                { key: "invoice" as const, label: "Invoices", desc: "Import existing invoice history" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setOpeningImportType(item.key)}
                  className="w-full flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors text-left border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-foreground">{item.label}</span>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <NotificationsSettings />
        </TabsContent>
      </Tabs>

      {/* Custom Field Dialog */}
      <Dialog open={cfDialogOpen} onOpenChange={setCfDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Field Label *</Label>
              <Input value={cfForm.field_label} onChange={(e) => setCfForm((f) => ({ ...f, field_label: e.target.value, field_key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="e.g. Vehicle Number" />
            </div>
            <div className="space-y-1.5">
              <Label>Field Key</Label>
              <Input value={cfForm.field_key} className="font-mono text-sm" readOnly />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Type *</Label>
                <Select value={cfForm.field_type} onValueChange={(v) => setCfForm((f) => ({ ...f, field_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                    <SelectItem value="yes_no">Yes/No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location *</Label>
                <Select value={cfForm.location} onValueChange={(v) => setCfForm((f) => ({ ...f, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">Header</SelectItem>
                    <SelectItem value="line_item">Line Item</SelectItem>
                    <SelectItem value="footer">Footer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {cfForm.field_type === "dropdown" && (
              <div className="space-y-1.5">
                <Label>Dropdown Options</Label>
                <div className="space-y-1">
                  {cfForm.dropdown_options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm flex-1">{opt}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCfForm((f) => ({ ...f, dropdown_options: f.dropdown_options.filter((_, idx) => idx !== i) }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="New option" value={newOption} onChange={(e) => setNewOption(e.target.value)} className="text-sm" />
                  <Button variant="outline" size="sm" onClick={() => {
                    if (newOption.trim()) {
                      setCfForm((f) => ({ ...f, dropdown_options: [...f.dropdown_options, newOption.trim()] }));
                      setNewOption("");
                    }
                  }}>Add</Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Default Value</Label>
              <Input value={cfForm.default_value} onChange={(e) => setCfForm((f) => ({ ...f, default_value: e.target.value }))} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Required</Label>
                <Switch checked={cfForm.is_required} onCheckedChange={(v) => setCfForm((f) => ({ ...f, is_required: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Print on Document</Label>
                <Switch checked={cfForm.print_on_document} onCheckedChange={(v) => setCfForm((f) => ({ ...f, print_on_document: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Searchable in Register</Label>
                <Switch checked={cfForm.is_searchable} onCheckedChange={(v) => setCfForm((f) => ({ ...f, is_searchable: v }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input type="number" value={cfForm.sort_order} onChange={(e) => setCfForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => cfSave.mutate()} disabled={cfSave.isPending || !cfForm.field_label.trim()}>
              {editingField ? "Update" : "Create"} Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FY Dialog */}
      <Dialog open={fyDialogOpen} onOpenChange={setFyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Financial Year</DialogTitle>
            <DialogDescription>
              This will create new document number series. Previous year documents will remain accessible but numbering will reset to /001.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => fyMutation.mutate()} disabled={fyMutation.isPending}>Confirm & Start New Year</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Opening Data Import Dialog */}
      {openingImportConfig && (
        <ImportDialog
          open={!!openingImportType}
          onOpenChange={(v) => { if (!v) setOpeningImportType(null); }}
          config={openingImportConfig}
          onImport={openingImportHandler}
        />
      )}
    </div>
  );
}
