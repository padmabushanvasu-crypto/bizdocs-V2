import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Upload, X, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCompanySettings, saveCompanySettings,
  fetchAllDocumentSettings, upsertDocumentSettings,
} from "@/lib/settings-api";
import { supabase } from "@/integrations/supabase/client";

const FY_OPTIONS = [
  { value: "2425", label: "2024-25" },
  { value: "2526", label: "2025-26" },
  { value: "2627", label: "2026-27" },
];

const DOC_SERIES = [
  { prefixKey: "invoice_prefix", dsType: "invoice",          label: "Invoice",           defaultPrefix: "INV" },
  { prefixKey: "po_prefix",      dsType: "purchase_order",   label: "Purchase Order",    defaultPrefix: "PO"  },
  { prefixKey: "dc_prefix",      dsType: "delivery_challan", label: "Delivery Challan",  defaultPrefix: "DC"  },
  { prefixKey: "grn_prefix",     dsType: "grn",              label: "GRN",               defaultPrefix: "GRN" },
  { prefixKey: "jw_prefix",      dsType: "job_card",         label: "Job Work",          defaultPrefix: "JW"  },
  { prefixKey: "ao_prefix",      dsType: "assembly_order",   label: "Production Run",    defaultPrefix: "AO"  },
  { prefixKey: "so_prefix",      dsType: "sales_order",      label: "Sales Order",       defaultPrefix: "SO"  },
  { prefixKey: "dn_prefix",      dsType: "dispatch_note",    label: "Dispatch Note",     defaultPrefix: "DN"  },
  { prefixKey: "fat_prefix",     dsType: "fat_certificate",  label: "FAT Certificate",   defaultPrefix: "FAT" },
] as const;

type SeriesKey = typeof DOC_SERIES[number]["prefixKey"];
type SeriesForm = Record<SeriesKey, { prefix: string; current: number }>;

const buildDefaultSeries = (): SeriesForm =>
  Object.fromEntries(
    DOC_SERIES.map((d) => [d.prefixKey, { prefix: d.defaultPrefix, current: 0 }])
  ) as SeriesForm;

const PRINT_TOGGLES = [
  { key: "show_logo",             label: "Show company logo on documents" },
  { key: "show_signature",        label: "Show authorized signatory on documents" },
  { key: "show_not_for_sale",     label: 'Show "NOT FOR SALE" banner on Job Work DCs' },
  { key: "show_original_duplicate", label: "Show ORIGINAL / DUPLICATE stamp" },
] as const;

export default function DocumentSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fyYear, setFyYear] = useState("2526");
  const [series, setSeries] = useState<SeriesForm>(buildDefaultSeries());
  const [invoiceDefaults, setInvoiceDefaults] = useState({
    default_payment_terms: "",
    default_terms_conditions: "",
    default_bank_name: "",
    default_bank_account: "",
    default_bank_ifsc: "",
    default_bank_branch: "",
  });
  const [printToggles, setPrintToggles] = useState({
    show_logo: true,
    show_signature: true,
    show_not_for_sale: true,
    show_original_duplicate: true,
    default_footer_text: "",
  });
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState("");
  const [sigUploading, setSigUploading] = useState(false);

  const { data: companyData } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  const { data: allDocSettings } = useQuery({
    queryKey: ["document-settings"],
    queryFn: fetchAllDocumentSettings,
  });

  useEffect(() => {
    if (!companyData) return;
    const c = companyData as any;
    setFyYear(c.fy_year ?? "2526");
    setInvoiceDefaults({
      default_payment_terms: c.default_payment_terms ?? "",
      default_terms_conditions: c.default_terms_conditions ?? "",
      default_bank_name: c.default_bank_name ?? "",
      default_bank_account: c.default_bank_account ?? "",
      default_bank_ifsc: c.default_bank_ifsc ?? "",
      default_bank_branch: c.default_bank_branch ?? "",
    });
    setPrintToggles({
      show_logo: c.show_logo ?? true,
      show_signature: c.show_signature ?? true,
      show_not_for_sale: c.show_not_for_sale ?? true,
      show_original_duplicate: c.show_original_duplicate ?? true,
      default_footer_text: c.default_footer_text ?? "",
    });
    setSeries((prev) => {
      const next = { ...prev };
      for (const d of DOC_SERIES) {
        const savedPrefix = c[d.prefixKey];
        if (savedPrefix) next[d.prefixKey] = { ...next[d.prefixKey], prefix: savedPrefix };
      }
      return next;
    });
    if (companyData.signature_url && !sigPreview) setSigPreview(companyData.signature_url);
  }, [companyData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!allDocSettings) return;
    setSeries((prev) => {
      const next = { ...prev };
      for (const d of DOC_SERIES) {
        const ds = allDocSettings.find((s) => s.document_type === d.dsType);
        if (ds) next[d.prefixKey] = { ...next[d.prefixKey], current: ds.numbering_current ?? 0 };
      }
      return next;
    });
  }, [allDocSettings]);

  const handleSigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSigFile(file);
    const reader = new FileReader();
    reader.onload = () => setSigPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveAll = useMutation({
    mutationFn: async () => {
      const prefixFields = Object.fromEntries(
        DOC_SERIES.map((d) => [d.prefixKey, series[d.prefixKey].prefix])
      );
      await saveCompanySettings({
        fy_year: fyYear,
        ...prefixFields,
        ...invoiceDefaults,
        show_logo: printToggles.show_logo,
        show_signature: printToggles.show_signature,
        show_not_for_sale: printToggles.show_not_for_sale,
        show_original_duplicate: printToggles.show_original_duplicate,
        default_footer_text: printToggles.default_footer_text,
      } as any);

      for (const d of DOC_SERIES) {
        await upsertDocumentSettings(d.dsType, {
          numbering_prefix: series[d.prefixKey].prefix,
          numbering_current: series[d.prefixKey].current,
        } as any);
      }

      if (sigFile) {
        setSigUploading(true);
        try {
          const ext = sigFile.name.split(".").pop();
          const path = `signature/signature.${ext}`;
          await supabase.storage.from("company-assets").upload(path, sigFile, { upsert: true });
          const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
          await saveCompanySettings({ signature_url: urlData.publicUrl } as any);
        } finally {
          setSigUploading(false);
        }
        setSigFile(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      toast({ title: "Document settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Document Settings</h1>
          <p className="text-sm text-slate-500">Number series, invoice defaults, and print options</p>
        </div>
      </div>

      {/* Section 1: Financial Year */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Financial Year</h2>
        <div className="max-w-[220px]">
          <Select value={fyYear} onValueChange={setFyYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map((fy) => (
                <SelectItem key={fy.value} value={fy.value}>FY {fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section 2: Number Series */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Number Series</h2>
          <p className="text-sm text-slate-500 mt-0.5">Prefix and running counter per document type</p>
        </div>
        <div className="px-5 py-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-slate-400 uppercase">
                <th className="text-left pb-2 pr-4 font-medium">Document Type</th>
                <th className="text-left pb-2 pr-4 w-28 font-medium">Prefix</th>
                <th className="text-left pb-2 pr-4 w-28 font-medium">Current #</th>
                <th className="text-left pb-2 w-44 font-medium">Next Preview</th>
              </tr>
            </thead>
            <tbody>
              {DOC_SERIES.map((d) => {
                const { prefix, current } = series[d.prefixKey];
                const preview = `${prefix}-${fyYear}-${String(current + 1).padStart(3, "0")}`;
                return (
                  <tr key={d.prefixKey} className="border-t border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700">{d.label}</td>
                    <td className="py-2 pr-4">
                      <Input
                        value={prefix}
                        onChange={(e) => setSeries((s) => ({ ...s, [d.prefixKey]: { ...s[d.prefixKey], prefix: e.target.value } }))}
                        className="font-mono text-sm h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <Input
                        type="number"
                        min={0}
                        value={current}
                        onChange={(e) => setSeries((s) => ({ ...s, [d.prefixKey]: { ...s[d.prefixKey], current: parseInt(e.target.value) || 0 } }))}
                        className="font-mono text-sm h-8 w-24"
                      />
                    </td>
                    <td className="py-2">
                      <div className="h-8 flex items-center font-mono text-sm text-slate-500 bg-slate-50 rounded-md px-3 border border-slate-200 w-44 truncate">
                        {preview}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Invoice Defaults */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Invoice Defaults</h2>
        <div className="space-y-1.5">
          <Label>Default Payment Terms</Label>
          <Input
            value={invoiceDefaults.default_payment_terms}
            onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_payment_terms: e.target.value }))}
            placeholder="e.g. 30 days"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Default Terms &amp; Conditions</Label>
          <Textarea
            value={invoiceDefaults.default_terms_conditions}
            onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_terms_conditions: e.target.value }))}
            rows={4}
            placeholder="Standard T&C printed on invoices…"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input
              value={invoiceDefaults.default_bank_name}
              onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_bank_name: e.target.value }))}
              placeholder="HDFC Bank"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              value={invoiceDefaults.default_bank_account}
              onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_bank_account: e.target.value }))}
              className="font-mono"
              placeholder="00001234567890"
            />
          </div>
          <div className="space-y-1.5">
            <Label>IFSC Code</Label>
            <Input
              value={invoiceDefaults.default_bank_ifsc}
              onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_bank_ifsc: e.target.value.toUpperCase() }))}
              className="font-mono uppercase"
              placeholder="HDFC0001234"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input
              value={invoiceDefaults.default_bank_branch}
              onChange={(e) => setInvoiceDefaults((f) => ({ ...f, default_bank_branch: e.target.value }))}
              placeholder="Andheri West, Mumbai"
            />
          </div>
        </div>
      </div>

      {/* Section 4: Print Toggles */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Print Options</h2>
        <div className="space-y-3">
          {PRINT_TOGGLES.map((toggle) => (
            <div key={toggle.key} className="flex items-center justify-between py-0.5">
              <span className="text-sm text-slate-700">{toggle.label}</span>
              <Switch
                checked={printToggles[toggle.key] as boolean}
                onCheckedChange={(v) => setPrintToggles((f) => ({ ...f, [toggle.key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          <Label>Default Footer Text</Label>
          <Textarea
            value={printToggles.default_footer_text}
            onChange={(e) => setPrintToggles((f) => ({ ...f, default_footer_text: e.target.value }))}
            rows={2}
            placeholder="e.g. This is a computer generated document."
          />
        </div>
      </div>

      {/* Section 5: Authorized Signature */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <PenLine className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Authorized Signature</h2>
        </div>
        <p className="text-sm text-slate-500">Printed on invoices, DCs, and POs</p>
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
      </div>

      {/* Save */}
      <div className="flex justify-end pb-6">
        <Button
          onClick={() => saveAll.mutate()}
          disabled={saveAll.isPending || sigUploading}
          className="gap-1.5"
        >
          <Save className="h-4 w-4" />
          {saveAll.isPending ? "Saving…" : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
