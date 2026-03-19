import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Building2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchCompanySettings, saveCompanySettings } from "@/lib/settings-api";
import { supabase } from "@/integrations/supabase/client";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
];

function validateGSTIN(gstin: string): boolean {
  if (!gstin) return true; // optional
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    company_name: "",
    address_line1: "",
    address_line2: "",
    address_line3: "",
    city: "",
    state: "",
    pin_code: "",
    gstin: "",
    pan: "",
    cin: "",
    phone: "",
    email: "",
    website: "",
    authorized_signatory: "",
    logo_url: "",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [gstinError, setGstinError] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        company_name: existing.company_name ?? "",
        address_line1: existing.address_line1 ?? "",
        address_line2: existing.address_line2 ?? "",
        address_line3: (existing as any).address_line3 ?? "",
        city: existing.city ?? "",
        state: existing.state ?? "",
        pin_code: existing.pin_code ?? "",
        gstin: existing.gstin ?? "",
        pan: existing.pan ?? "",
        cin: (existing as any).cin ?? "",
        phone: existing.phone ?? "",
        email: existing.email ?? "",
        website: existing.website ?? "",
        authorized_signatory: (existing as any).authorized_signatory ?? "",
        logo_url: existing.logo_url ?? "",
      });
      if (existing.logo_url) setLogoPreview(existing.logo_url);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = form.logo_url;

      if (logoFile) {
        setUploading(true);
        try {
          const ext = logoFile.name.split(".").pop();
          const path = `company-logo/logo.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("company-assets")
            .upload(path, logoFile, { upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("company-assets")
              .getPublicUrl(path);
            logoUrl = urlData.publicUrl;
          }
        } finally {
          setUploading(false);
        }
      }

      return saveCompanySettings({
        company_name: form.company_name || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: form.state || null,
        pin_code: form.pin_code || null,
        gstin: form.gstin || null,
        pan: form.pan || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        logo_url: logoUrl || null,
        // Extra fields stored as-is (DB may have them via migration)
        ...(form.address_line3 ? { address_line3: form.address_line3 } : {}),
        ...(form.cin ? { cin: form.cin } : {}),
        ...(form.authorized_signatory ? { authorized_signatory: form.authorized_signatory } : {}),
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: "Company profile saved" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (form.gstin && !validateGSTIN(form.gstin)) {
      setGstinError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)");
      return;
    }
    setGstinError("");
    saveMutation.mutate();
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" /> Company Profile
          </h1>
          <p className="text-sm text-slate-500">Your company details printed on all documents</p>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-3">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Company Logo</h2>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            <div className="relative">
              <img src={logoPreview} alt="Logo" className="h-20 w-auto max-w-[160px] object-contain border border-slate-200 rounded-lg p-1" />
              <button
                onClick={() => { setLogoPreview(""); setLogoFile(null); setForm((f) => ({ ...f, logo_url: "" })); }}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="h-20 w-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-xs">
              No logo
            </div>
          )}
          <div>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">
                <Upload className="h-4 w-4" /> Upload Logo
              </div>
            </label>
            <p className="text-xs text-slate-400 mt-1">PNG or JPG, max 2MB. Shown on invoices, DCs, POs.</p>
          </div>
        </div>
      </div>

      {/* Company Details */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Company Details</h2>

        <div className="space-y-1.5">
          <Label>Company Name *</Label>
          <Input value={form.company_name} onChange={set("company_name")} placeholder="e.g. Acme Manufacturing Pvt. Ltd." />
        </div>

        <div className="space-y-1.5">
          <Label>Address Line 1</Label>
          <Input value={form.address_line1} onChange={set("address_line1")} placeholder="Building / Plot No." />
        </div>
        <div className="space-y-1.5">
          <Label>Address Line 2</Label>
          <Input value={form.address_line2} onChange={set("address_line2")} placeholder="Street / Area" />
        </div>
        <div className="space-y-1.5">
          <Label>Address Line 3</Label>
          <Input value={form.address_line3} onChange={set("address_line3")} placeholder="Landmark / Industrial Area" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={set("city")} placeholder="Mumbai" />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={form.state} onChange={set("state")} placeholder="Maharashtra" list="states-list" />
            <datalist id="states-list">
              {INDIAN_STATES.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>PIN Code</Label>
            <Input value={form.pin_code} onChange={set("pin_code")} placeholder="400001" maxLength={6} className="font-mono" />
          </div>
        </div>
      </div>

      {/* Tax Registration */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Tax &amp; Registration</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={(e) => { set("gstin")(e); setGstinError(""); }}
              placeholder="29ABCDE1234F1Z5"
              className={`font-mono uppercase ${gstinError ? "border-red-400" : ""}`}
              maxLength={15}
            />
            {gstinError && <p className="text-xs text-red-500">{gstinError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>PAN Number</Label>
            <Input value={form.pan} onChange={set("pan")} placeholder="ABCDE1234F" className="font-mono uppercase" maxLength={10} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>CIN (optional)</Label>
          <Input value={form.cin} onChange={set("cin")} placeholder="U12345MH2020PTC123456" className="font-mono" />
          <p className="text-xs text-slate-400">Corporate Identity Number — required for private/public companies</p>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Contact Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="info@company.com" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input value={form.website} onChange={set("website")} placeholder="https://www.company.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Authorized Signatory Name</Label>
          <Input value={form.authorized_signatory} onChange={set("authorized_signatory")} placeholder="Name of authorized person" />
          <p className="text-xs text-slate-400">Printed below the signature on documents</p>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending || uploading} className="gap-1.5">
          <Save className="h-4 w-4" />
          {uploading ? "Uploading…" : saveMutation.isPending ? "Saving…" : "Save Company Profile"}
        </Button>
      </div>
    </div>
  );
}
