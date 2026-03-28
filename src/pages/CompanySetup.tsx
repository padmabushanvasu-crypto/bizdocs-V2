import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setCompanyId } from "@/lib/auth-helpers";
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
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [phone, setPhone] = useState("");

  // Redirect if user already has a company
  useEffect(() => {
    if (!authLoading && companyId) {
      navigate("/", { replace: true });
    }
  }, [authLoading, companyId, navigate]);

  const handleStateChange = (val: string) => {
    const s = INDIAN_STATES.find((st) => st.name === val);
    setState(val);
    setStateCode(s?.code ?? "");
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
      const { data: newCompanyId, error: rpcError } = await supabase.rpc("setup_company" as any, {
        _company_name: companyName.trim(),
        _gstin: gstin || null,
        _state: state || null,
        _state_code: stateCode || null,
        _phone: phone || null,
      });
      if (rpcError) throw rpcError;

      // Assert the known-good company ID immediately so no subsequent code can wipe it.
      setCompanyId(newCompanyId);
      localStorage.setItem("bizdocs_company_setup_done", "true");

      // Attempt a profile refresh, but re-assert afterwards.
      // loadProfile may temporarily clear these flags if the DB hasn't yet
      // reflected the new company_id on the profile row (replication lag),
      // causing the repair branch to call clearCompanyId / removeItem.
      await refreshProfile();

      // Re-assert: the RPC already confirmed success, so we own this state.
      setCompanyId(newCompanyId);
      localStorage.setItem("bizdocs_company_setup_done", "true");

      toast({ title: "Company set up successfully!" });
      setLoading(false);
      setRedirecting(true);

      // Small yield so React can flush the state update above before navigation.
      await new Promise((resolve) => setTimeout(resolve, 300));
      navigate("/", { replace: true });
    } catch (err: any) {
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
          <CardTitle className="font-display text-2xl">Set Up Your Company</CardTitle>
          <p className="text-sm text-muted-foreground">Tell us about your business to get started</p>
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
              <Input id="gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29AABCT1332L1ZX" maxLength={15} />
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
            <Button type="submit" className="w-full" disabled={loading || redirecting}>
              {redirecting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…</>
              ) : loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting up…</>
              ) : error ? "Try Again" : "Continue to Dashboard"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">You can update these details later in Settings</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
