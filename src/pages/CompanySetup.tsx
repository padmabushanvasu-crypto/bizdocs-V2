import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setCompanyId } from "@/lib/auth-helpers";
import { fetchCompanySettings } from "@/lib/settings-api";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { INDIAN_STATES } from "@/lib/indian-states";
import { Building2, AlertCircle } from "lucide-react";

export default function CompanySetup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, companyId, loading: authLoading, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [phone, setPhone] = useState("");

  const { data: existingSettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  useEffect(() => {
    if (existingSettings) {
      setCompanyName(existingSettings.company_name ?? "");
      setGstin(existingSettings.gstin ?? "");
      if (existingSettings.state) setState(existingSettings.state);
      if (existingSettings.state_code) setStateCode(existingSettings.state_code);
      if (existingSettings.phone) setPhone(existingSettings.phone ?? "");
    }
  }, [existingSettings]);

  // Navigate only when the auth context has actually committed the new companyId —
  // not based on a timer. refreshProfile() runs async; this fires when it lands.
  useEffect(() => {
    if (setupComplete && companyId) {
      navigate("/", { replace: true });
    }
  }, [setupComplete, companyId, navigate]);

  const handleStateChange = (val: string) => {
    const s = INDIAN_STATES.find((st) => st.name === val);
    setState(val);
    setStateCode(s?.code ?? "");
  };

  const handleGstinChange = (val: string) => {
    const upper = val.toUpperCase();
    setGstin(upper);
    // Auto-derive state from first 2 digits of GSTIN if no state manually selected
    if (upper.length >= 2 && !state) {
      const code = upper.substring(0, 2);
      const matched = INDIAN_STATES.find((st) => st.code === code);
      if (matched) {
        setState(matched.name);
        setStateCode(matched.code);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Derive state_code from GSTIN if still missing (belt-and-suspenders)
      const resolvedStateCode = stateCode || (gstin.length >= 2 ? gstin.substring(0, 2) : null) || null;
      const resolvedState = state || (resolvedStateCode ? (INDIAN_STATES.find((s) => s.code === resolvedStateCode)?.name ?? null) : null);

      const params = {
        _company_name: companyName.trim(),
        _gstin: gstin || null,
        _state: resolvedState,
        _state_code: resolvedStateCode,
        _phone: phone || null,
      };
      console.log("[setup_company] params:", params);

      const result = await supabase.rpc("setup_company" as any, params);
      console.log("[setup_company] result:", result);
      if (result.error) {
        console.error("[setup_company] error:", result.error);
        throw result.error;
      }
      const newCompanyId = result.data;

      // Set module-level cache immediately so API calls work right away.
      setCompanyId(newCompanyId);
      localStorage.setItem("bizdocs_company_setup_done", "true");

      // Fire profile refresh — do NOT await. When the async fetch completes and
      // React commits setProfile(data), companyId in the auth context will update,
      // which triggers the useEffect above to navigate. This is correct: navigation
      // happens exactly when the context is ready, not based on an arbitrary timer.
      refreshProfile();

      toast({ title: "Company set up successfully!" });
      setLoading(false);
      setSetupComplete(true);
    } catch (err: any) {
      console.error("[setup_company] caught:", err);
      const msg = err.message || "Something went wrong during setup.";
      setError(msg);
      toast({ title: "Setup failed", description: msg, variant: "destructive" });
      setLoading(false);
    }
  };

  // Don't render form while checking auth / if already has company
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-lg shadow-lg border-border">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">{companyId ? "Company Details" : "Set Up Your Company"}</CardTitle>
          <p className="text-sm text-muted-foreground">{companyId ? "Update your company name and basic details" : "Tell us about your business to get started"}</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Setup failed</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name *</Label>
              <Input id="company-name" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Sample Co. Pvt. Ltd." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input id="gstin" value={gstin} onChange={(e) => handleGstinChange(e.target.value)} placeholder="29AABCT1332L1ZX" maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={state} onValueChange={handleStateChange}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.name}>{s.name} ({s.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98000 00000" />
            </div>
            <Button type="submit" className="w-full" disabled={loading || setupComplete}>
              {setupComplete ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…</>
              ) : loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting up…</>
              ) : error ? "Try Again" : companyId ? "Update Company Details" : "Continue to Dashboard"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">You can update these details later in Settings</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
