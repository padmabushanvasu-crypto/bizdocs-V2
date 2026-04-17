import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Save, Building2, Upload, X, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchCompanySettings, saveCompanySettings } from "@/lib/settings-api";
import { supabase } from "@/integrations/supabase/client";
import { INDIA_STATE_CODES, extractStateCodeFromGSTIN, resolveStateCode } from "@/lib/tax-utils";

function validateGSTIN(gstin: string): boolean {
  if (!gstin) return true; // optional
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
}

export default function CompanySettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, refreshProfile, role } = useAuth();

  const [form, setForm] = useState({
    company_name: "",
    address_line1: "",
    address_line2: "",
    address_line3: "",
    city: "",
    state: "",
    state_code: "",
    pin_code: "",
    registered_address_line1: "",
    registered_address_line2: "",
    registered_address_line3: "",
    registered_city: "",
    registered_state: "",
    registered_state_code: "",
    registered_pin_code: "",
    gstin: "",
    pan: "",
    cin: "",
    phone: "",
    email: "",
    website: "",
    authorized_signatory: "",
    logo_url: "",
    over_receipt_tolerance_percent: 0,
  });
  const [sameAsPhysical, setSameAsPhysical] = useState(false);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [gstinError, setGstinError] = useState("");
  const [stateAutoDetected, setStateAutoDetected] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  useEffect(() => {
    if (existing) {
      const resolvedCode = resolveStateCode(existing.state_code, existing.gstin);
      const e = existing as any;
      const regLine1 = e.registered_address_line1 ?? "";
      const regLine2 = e.registered_address_line2 ?? "";
      const regLine3 = e.registered_address_line3 ?? "";
      const regCity = e.registered_city ?? "";
      const regState = e.registered_state ?? "";
      const regStateCode = e.registered_state_code ?? "";
      const regPin = e.registered_pin_code ?? "";
      const physLine1 = existing.address_line1 ?? "";
      const physLine2 = existing.address_line2 ?? "";
      // Check if registered == physical (to pre-tick the checkbox)
      const isMatch = regLine1 === physLine1 && regLine2 === physLine2 &&
        regCity === (existing.city ?? "") && regStateCode === resolvedCode;
      setSameAsPhysical(isMatch && physLine1 !== "");
      setForm({
        company_name: existing.company_name ?? "",
        address_line1: physLine1,
        address_line2: physLine2,
        address_line3: e.address_line3 ?? "",
        city: existing.city ?? "",
        state: existing.state ?? (resolvedCode ? INDIA_STATE_CODES[resolvedCode] ?? "" : ""),
        state_code: resolvedCode,
        pin_code: existing.pin_code ?? "",
        registered_address_line1: regLine1,
        registered_address_line2: regLine2,
        registered_address_line3: regLine3,
        registered_city: regCity,
        registered_state: regState,
        registered_state_code: regStateCode,
        registered_pin_code: regPin,
        gstin: existing.gstin ?? "",
        pan: existing.pan ?? "",
        cin: e.cin ?? "",
        phone: existing.phone ?? "",
        email: existing.email ?? "",
        website: existing.website ?? "",
        authorized_signatory: e.authorized_signatory ?? "",
        logo_url: existing.logo_url ?? "",
        over_receipt_tolerance_percent: Number(e.over_receipt_tolerance_percent ?? 0),
      });
      if (existing.logo_url) setLogoPreview(existing.logo_url);
    }
  }, [existing]);

  // One-time silent migration: fix "Tamil Nadu" → "33" in state_code column.
  // Also auto-fills state_code from GSTIN when state_code is blank.
  useEffect(() => {
    if (!existing) return;
    const code = existing.state_code;
    const gstin = existing.gstin;
    if (code && /^\d{2}$/.test(String(code).trim())) return; // already correct
    let correctedCode: string | null = null;
    if (code) {
      const entry = Object.entries(INDIA_STATE_CODES).find(
        ([, name]) => name.toLowerCase() === String(code).trim().toLowerCase(),
      );
      if (entry) correctedCode = entry[0];
    }
    if (!correctedCode && gstin) correctedCode = extractStateCodeFromGSTIN(gstin);
    if (correctedCode) {
      saveCompanySettings({ state_code: correctedCode } as any).then(() => {
        queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      });
    }
  }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect state from GSTIN when state_code is not yet set.
  useEffect(() => {
    if (form.gstin && form.gstin.length >= 2 && !form.state_code) {
      const detected = extractStateCodeFromGSTIN(form.gstin);
      if (detected) {
        setForm((f) => ({
          ...f,
          state_code: detected,
          state: f.state || (INDIA_STATE_CODES[detected] ?? ""),
        }));
        setStateAutoDetected(true);
      }
    }
  }, [form.gstin]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isFirstSetup = !profile?.company_id;

      // Step 1: If no company yet, call setup_company RPC to create it
      if (isFirstSetup) {
        const { error: rpcError } = await (supabase as any).rpc("setup_company", {
          _company_name: form.company_name || "My Company",
          _gstin: form.gstin || null,
          _state: form.state || null,
          _state_code: form.state_code || null,
          _phone: form.phone || null,
        });
        if (rpcError) throw rpcError;
        await refreshProfile();
      }

      // Step 2: Logo upload (unchanged from existing code)
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

      // Step 3: Save extended company settings
      const regAddr = sameAsPhysical ? {
        registered_address_line1: form.address_line1 || null,
        registered_address_line2: form.address_line2 || null,
        registered_address_line3: form.address_line3 || null,
        registered_city: form.city || null,
        registered_state: form.state || null,
        registered_state_code: form.state_code || null,
        registered_pin_code: form.pin_code || null,
      } : {
        registered_address_line1: form.registered_address_line1 || null,
        registered_address_line2: form.registered_address_line2 || null,
        registered_address_line3: form.registered_address_line3 || null,
        registered_city: form.registered_city || null,
        registered_state: form.registered_state || null,
        registered_state_code: form.registered_state_code || null,
        registered_pin_code: form.registered_pin_code || null,
      };
      return {
        result: await saveCompanySettings({
          company_name: form.company_name || null,
          address_line1: form.address_line1 || null,
          address_line2: form.address_line2 || null,
          city: form.city || null,
          state: form.state || null,
          state_code: form.state_code || null,
          pin_code: form.pin_code || null,
          gstin: form.gstin || null,
          pan: form.pan || null,
          phone: form.phone || null,
          email: form.email || null,
          website: form.website || null,
          logo_url: logoUrl || null,
          ...(form.address_line3 ? { address_line3: form.address_line3 } : {}),
          ...(form.cin ? { cin: form.cin } : {}),
          ...(form.authorized_signatory ? { authorized_signatory: form.authorized_signatory } : {}),
          ...regAddr,
          over_receipt_tolerance_percent: form.over_receipt_tolerance_percent,
        } as any),
        isFirstSetup,
      };
    },
    onSuccess: ({ isFirstSetup }) => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      if (isFirstSetup) {
        toast({ title: "Company configured successfully", description: "You can now use all BizDocs features." });
      } else {
        toast({ title: "Company details saved successfully" });
      }
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
      </div>

      {/* Physical / Factory Address */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <div>
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Physical / Factory Address</h2>
          <p className="text-xs text-slate-400 mt-0.5">Printed on Delivery Challans as the dispatch-from address</p>
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
            <Select
              value={form.state_code}
              onValueChange={(code) => {
                const name = INDIA_STATE_CODES[code] ?? "";
                setForm((f) => ({ ...f, state_code: code, state: name }));
                setStateAutoDetected(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INDIA_STATE_CODES)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {stateAutoDetected && (
              <p className="text-xs text-emerald-600">State code auto-detected from GSTIN</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>PIN Code</Label>
            <Input value={form.pin_code} onChange={set("pin_code")} placeholder="400001" maxLength={6} className="font-mono" />
          </div>
        </div>
      </div>

      {/* Registered Office Address */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <div>
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Registered Office Address</h2>
          <p className="text-xs text-slate-400 mt-0.5">Printed on Purchase Orders as your official business address</p>
        </div>

        <div className="flex items-center gap-2 pb-1">
          <Checkbox
            id="same-as-physical"
            checked={sameAsPhysical}
            onCheckedChange={(v) => setSameAsPhysical(Boolean(v))}
          />
          <label htmlFor="same-as-physical" className="text-sm text-slate-600 cursor-pointer">
            Same as Physical / Factory Address
          </label>
        </div>

        {!sameAsPhysical && (
          <>
            <div className="space-y-1.5">
              <Label>Address Line 1</Label>
              <Input value={form.registered_address_line1} onChange={set("registered_address_line1")} placeholder="Building / Plot No." />
            </div>
            <div className="space-y-1.5">
              <Label>Address Line 2</Label>
              <Input value={form.registered_address_line2} onChange={set("registered_address_line2")} placeholder="Street / Area" />
            </div>
            <div className="space-y-1.5">
              <Label>Address Line 3</Label>
              <Input value={form.registered_address_line3} onChange={set("registered_address_line3")} placeholder="Landmark" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.registered_city} onChange={set("registered_city")} placeholder="Mumbai" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select
                  value={form.registered_state_code}
                  onValueChange={(code) => {
                    const name = INDIA_STATE_CODES[code] ?? "";
                    setForm((f) => ({ ...f, registered_state_code: code, registered_state: name }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INDIA_STATE_CODES)
                      .sort(([, a], [, b]) => a.localeCompare(b))
                      .map(([code, name]) => (
                        <SelectItem key={code} value={code}>
                          {name} ({code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>PIN Code</Label>
                <Input value={form.registered_pin_code} onChange={set("registered_pin_code")} placeholder="400001" maxLength={6} className="font-mono" />
              </div>
            </div>
          </>
        )}
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

      {/* Receiving & GRN Settings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Receiving &amp; GRN Settings</h2>
          {role !== "admin" && role !== "finance" && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" /> Admin / Finance only
            </span>
          )}
        </div>

        {role === "admin" || role === "finance" ? (
          <div className="space-y-1.5">
            <Label>Over-Receipt Tolerance (%)</Label>
            <Input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={form.over_receipt_tolerance_percent}
              onChange={(e) => setForm((f) => ({ ...f, over_receipt_tolerance_percent: Number(e.target.value) }))}
              placeholder="0 (strict — no over-receipt allowed)"
              className="w-48 font-mono"
            />
            <p className="text-xs text-slate-400">
              Allow GRN to proceed if received quantity exceeds PO by up to this percentage.
              Set to 0 to block all over-receipts. Over-receipts within tolerance require finance team approval.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <Lock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-600">Over-Receipt Tolerance</p>
              <p className="text-sm font-mono text-slate-800">{form.over_receipt_tolerance_percent}%</p>
              <p className="text-xs text-slate-400">Only admins and finance can change this setting.</p>
            </div>
          </div>
        )}
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
