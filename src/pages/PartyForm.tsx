import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchParty, createParty, updateParty, type PartyInsert, type PartyUpdate } from "@/lib/parties-api";
import { INDIAN_STATES, PAYMENT_TERMS_OPTIONS, validateGSTIN, getStateByName } from "@/lib/indian-states";
import { fetchCompanySettings } from "@/lib/settings-api";

type PartyType = "vendor" | "customer" | "both";

interface FormData {
  name: string;
  contact_person: string;
  phone1: string;
  phone2: string;
  email1: string;
  email2: string;
  website: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city: string;
  state: string;
  pin_code: string;
  gstin: string;
  pan: string;
  payment_terms: string;
  custom_payment_terms: string;
  credit_limit: string;
  notes: string;
}

const emptyForm: FormData = {
  name: "", contact_person: "", phone1: "", phone2: "", email1: "", email2: "",
  website: "", address_line1: "", address_line2: "", address_line3: "",
  city: "", state: "", pin_code: "", gstin: "", pan: "",
  payment_terms: "", custom_payment_terms: "", credit_limit: "", notes: "",
};

export default function PartyForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [partyTypes, setPartyTypes] = useState<Set<"vendor" | "customer">>(new Set());
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  const { data: existingParty } = useQuery({
    queryKey: ["party", id],
    queryFn: () => fetchParty(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingParty) {
      const pt = existingParty.party_type;
      if (pt === "both") setPartyTypes(new Set(["vendor", "customer"]));
      else if (pt === "vendor") setPartyTypes(new Set(["vendor"]));
      else setPartyTypes(new Set(["customer"]));

      const isCustom = existingParty.payment_terms &&
        !PAYMENT_TERMS_OPTIONS.slice(0, -1).includes(existingParty.payment_terms as any);

      setForm({
        name: existingParty.name || "",
        contact_person: existingParty.contact_person || "",
        phone1: existingParty.phone1 || "",
        phone2: existingParty.phone2 || "",
        email1: existingParty.email1 || "",
        email2: existingParty.email2 || "",
        website: existingParty.website || "",
        address_line1: existingParty.address_line1 || "",
        address_line2: existingParty.address_line2 || "",
        address_line3: existingParty.address_line3 || "",
        city: existingParty.city || "",
        state: existingParty.state || "",
        pin_code: existingParty.pin_code || "",
        gstin: existingParty.gstin || "",
        pan: existingParty.pan || "",
        payment_terms: isCustom ? "Custom" : (existingParty.payment_terms || ""),
        custom_payment_terms: isCustom ? (existingParty.payment_terms || "") : "",
        credit_limit: existingParty.credit_limit?.toString() || "",
        notes: existingParty.notes || "",
      });
    }
  }, [existingParty]);

  const toggleType = (type: "vendor" | "customer") => {
    setPartyTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const resolvedPartyType: PartyType = partyTypes.has("vendor") && partyTypes.has("customer")
    ? "both" : partyTypes.has("vendor") ? "vendor" : partyTypes.has("customer") ? "customer" : "customer";

  const gstinValidation = useMemo(() => {
    if (!form.gstin) return null;
    return validateGSTIN(form.gstin);
  }, [form.gstin]);

  // Auto-fill state from GSTIN
  useEffect(() => {
    if (gstinValidation?.valid && gstinValidation.stateName && !form.state) {
      setForm((prev) => ({ ...prev, state: gstinValidation.stateName! }));
    }
  }, [gstinValidation]);

  const stateCode = useMemo(() => {
    if (gstinValidation?.valid) return gstinValidation.stateCode;
    const st = getStateByName(form.state);
    return st?.code || null;
  }, [form.state, gstinValidation]);

  // Fetch company settings for dynamic state code
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });
  const companyStateCode = companySettings?.state_code || "";
  const companyStateName = companySettings?.state || "your company's state";
  const isSameState = stateCode === companyStateCode && !!companyStateCode;
  const gstTypeLabel = stateCode
    ? isSameState ? "CGST + SGST" : "IGST"
    : null;

  const updateField = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const filteredStates = INDIAN_STATES.filter((s) =>
    s.name.toLowerCase().includes((stateSearch || form.state).toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    if (partyTypes.size === 0) {
      toast({ title: "Select at least one party type", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const paymentTerms = form.payment_terms === "Custom" ? form.custom_payment_terms : form.payment_terms;
      const partyData: PartyInsert = {
        party_type: resolvedPartyType,
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        phone1: form.phone1 || null,
        phone2: form.phone2 || null,
        email1: form.email1 || null,
        email2: form.email2 || null,
        website: form.website || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        address_line3: form.address_line3 || null,
        city: form.city || null,
        state: form.state || null,
        state_code: stateCode || null,
        pin_code: form.pin_code || null,
        gstin: form.gstin.toUpperCase() || null,
        pan: form.pan.toUpperCase() || null,
        payment_terms: paymentTerms || null,
        credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
        notes: form.notes || null,
      };

      let result;
      if (isEdit && id) {
        result = await updateParty(id, partyData as PartyUpdate);
      } else {
        result = await createParty(partyData);
      }

      queryClient.invalidateQueries({ queryKey: ["parties"] });
      toast({ title: `Party ${isEdit ? "updated" : "saved"} successfully` });
      navigate(`/parties/${result.id}`);
    } catch (err: any) {
      toast({ title: err.message || "Failed to save party", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/parties")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            {isEdit ? "Edit Party" : "Add New Party"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Update party details" : "Add a new vendor or customer"}
          </p>
        </div>
      </div>

      <div className="max-w-4xl space-y-8">
        {/* Party Type */}
        <FormSection label="Party Type">
          <div className="flex gap-3">
            <TypeToggle
              label="VENDOR"
              description="You purchase from them"
              selected={partyTypes.has("vendor")}
              onClick={() => toggleType("vendor")}
            />
            <TypeToggle
              label="CUSTOMER"
              description="You sell to them"
              selected={partyTypes.has("customer")}
              onClick={() => toggleType("customer")}
            />
          </div>
        </FormSection>

        {/* Basic Info */}
        <FormSection label="Basic Information">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Company / Firm Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g., Sample Enterprises" />
            </div>
            <div>
              <Label htmlFor="contact_person">Contact Person Name</Label>
              <Input id="contact_person" value={form.contact_person} onChange={(e) => updateField("contact_person", e.target.value)} placeholder="e.g., John Doe" />
            </div>
          </div>
        </FormSection>

        {/* Contact */}
        <FormSection label="Contact Details">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone1">Phone 1 *</Label>
                <Input id="phone1" value={form.phone1} onChange={(e) => updateField("phone1", e.target.value)} placeholder="+91 98000 00000" />
                {!form.phone1 && form.name && (
                  <p className="text-xs text-accent mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Recommended: Add at least one phone number
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="phone2">Phone 2</Label>
                <Input id="phone2" value={form.phone2} onChange={(e) => updateField("phone2", e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email1">Email 1</Label>
                <Input id="email1" type="email" value={form.email1} onChange={(e) => updateField("email1", e.target.value)} placeholder="accounts@company.com" />
              </div>
              <div>
                <Label htmlFor="email2">Email 2</Label>
                <Input id="email2" type="email" value={form.email2} onChange={(e) => updateField("email2", e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={form.website} onChange={(e) => updateField("website", e.target.value)} placeholder="https://" />
            </div>
          </div>
        </FormSection>

        {/* Address */}
        <FormSection label="Address">
          <div className="space-y-4">
            <div>
              <Label htmlFor="addr1">Address Line 1</Label>
              <Input id="addr1" value={form.address_line1} onChange={(e) => updateField("address_line1", e.target.value)} placeholder="Building / Street" />
            </div>
            <div>
              <Label htmlFor="addr2">Address Line 2</Label>
              <Input id="addr2" value={form.address_line2} onChange={(e) => updateField("address_line2", e.target.value)} placeholder="Area / Locality" />
            </div>
            <div>
              <Label htmlFor="addr3">Address Line 3</Label>
              <Input id="addr3" value={form.address_line3} onChange={(e) => updateField("address_line3", e.target.value)} placeholder="Landmark (optional)" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder="e.g., Mumbai" />
              </div>
              <div className="relative">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => {
                    updateField("state", e.target.value);
                    setStateSearch(e.target.value);
                    setShowStateDropdown(true);
                  }}
                  onFocus={() => setShowStateDropdown(true)}
                  onBlur={() => setTimeout(() => setShowStateDropdown(false), 200)}
                  placeholder="Search state..."
                  autoComplete="off"
                />
                {showStateDropdown && filteredStates.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {filteredStates.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                        onMouseDown={() => {
                          updateField("state", s.name);
                          setShowStateDropdown(false);
                        }}
                      >
                        <span>{s.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="w-full sm:w-1/2">
              <Label htmlFor="pin">PIN Code</Label>
              <Input id="pin" value={form.pin_code} onChange={(e) => updateField("pin_code", e.target.value)} placeholder="600032" maxLength={6} />
            </div>
          </div>
        </FormSection>

        {/* GST & Tax */}
        <FormSection label="GST & Tax Information">
          <div className="space-y-4">
            <div>
              <Label htmlFor="gstin">GSTIN</Label>
              <div className="relative">
                <Input
                  id="gstin"
                  value={form.gstin}
                  onChange={(e) => updateField("gstin", e.target.value.toUpperCase())}
                  placeholder="Enter 15-digit GSTIN"
                  maxLength={15}
                  className={`font-mono uppercase ${
                    form.gstin.length > 0
                      ? gstinValidation?.valid
                        ? "border-emerald-500 focus-visible:ring-emerald-500"
                        : "border-destructive focus-visible:ring-destructive"
                      : ""
                  }`}
                />
                {form.gstin.length > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {gstinValidation?.valid ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                  </span>
                )}
              </div>
              {form.gstin.length > 0 && !gstinValidation?.valid && (
                <p className="text-xs text-destructive mt-1">Invalid GSTIN format. Must be 15 characters (e.g., 29AABCT1332L1ZX)</p>
              )}
              {gstinValidation?.valid && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium px-2.5 py-1 rounded-md">
                  <Check className="h-3 w-3" />
                  State detected: {gstinValidation.stateName} ({gstinValidation.stateCode})
                </div>
              )}
            </div>

            <div className="w-full sm:w-1/2">
              <Label htmlFor="pan">PAN Number</Label>
              <Input
                id="pan"
                value={form.pan}
                onChange={(e) => updateField("pan", e.target.value.toUpperCase())}
                placeholder="AABCT1332L"
                maxLength={10}
                className="font-mono uppercase"
              />
            </div>

            {gstTypeLabel && (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">
                  When creating documents for this party, the app will automatically apply{" "}
                  <strong>{gstTypeLabel}</strong> based on their state code.
                  {isSameState
                    ? ` (Same state as your company — ${companyStateName})`
                    : ` (Interstate — party is in ${gstinValidation?.stateName || form.state})`}
                </p>
              </div>
            )}
          </div>
        </FormSection>

        {/* Business Terms */}
        <FormSection label="Business Terms">
          <div className="space-y-4">
            <div>
              <Label htmlFor="payment_terms">Default Payment Terms</Label>
              <select
                id="payment_terms"
                value={form.payment_terms}
                onChange={(e) => updateField("payment_terms", e.target.value)}
                className="flex h-10 w-full sm:w-1/2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select...</option>
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            {form.payment_terms === "Custom" && (
              <div>
                <Label htmlFor="custom_terms">Custom Payment Terms</Label>
                <Input id="custom_terms" value={form.custom_payment_terms} onChange={(e) => updateField("custom_payment_terms", e.target.value)} placeholder="Enter payment terms" />
              </div>
            )}
            <div className="w-full sm:w-1/2">
              <Label htmlFor="credit_limit">Credit Limit</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">₹</span>
                <Input
                  id="credit_limit"
                  type="number"
                  value={form.credit_limit}
                  onChange={(e) => updateField("credit_limit", e.target.value)}
                  placeholder="0.00"
                  className="pl-7 font-mono"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes / Internal Remarks</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Internal notes about this party..."
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground mt-1">These notes are for internal use only</p>
            </div>
          </div>
        </FormSection>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[240px] bg-card border-t border-border px-6 py-3 flex items-center justify-end gap-3 z-40">
        <Button variant="outline" onClick={() => navigate("/parties")}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="active:scale-[0.98] transition-transform">
          {saving ? "Saving..." : isEdit ? "Update Party" : "Save Party"}
        </Button>
      </div>
    </div>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 pb-2 border-b border-border">
        <h3 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">{label}</h3>
      </div>
      {children}
    </div>
  );
}

function TypeToggle({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border-2 px-4 py-4 text-left transition-all active:scale-[0.98] ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-muted-foreground/30"
      }`}
    >
      <span className={`text-sm font-bold tracking-wide ${selected ? "text-primary" : "text-foreground"}`}>
        {label}
      </span>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      {selected && (
        <div className="mt-2">
          <Check className="h-4 w-4 text-primary" />
        </div>
      )}
    </button>
  );
}
