import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Trash2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { fetchCompanySettings } from "@/lib/settings-api";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function DangerZone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);

  const companyName = companySettings?.company_name ?? "";
  const nameMatches = confirmName.trim().toLowerCase() === companyName.trim().toLowerCase();

  async function handleClearAll() {
    if (!nameMatches) return;
    setLoading(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) throw new Error("No company configured");

      const { error } = await supabase.rpc("clear_all_company_data", {
        p_company_id: companyId,
      });
      if (error) throw error;

      // Clear React Query cache
      queryClient.clear();

      // Clear local storage alerts flag
      localStorage.removeItem("bizdocs_alert_recalc_v2");

      toast.success("All account data has been cleared.");
      setDialogOpen(false);

      setTimeout(() => navigate("/"), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to clear data: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Danger Zone</h1>
        <p className="text-sm text-slate-500 mt-1">Irreversible actions — use with extreme caution</p>
      </div>

      {/* Warning card */}
      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-900">Clear All Account Data</p>
            <p className="text-sm text-red-700 mt-1 leading-snug">
              Permanently deletes <strong>all</strong> items, parties, bills, GRNs, purchase orders,
              delivery challans, BOMs, job cards, assembly orders, scrap records, serial numbers,
              and all other transactional data for your company. Document number sequences are reset to 1.
            </p>
            <p className="text-sm font-semibold text-red-800 mt-2">
              This cannot be undone. Your company account and users are preserved.
            </p>
          </div>
        </div>

        <Button
          variant="destructive"
          className="w-full sm:w-auto"
          onClick={() => {
            setConfirmName("");
            setDialogOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear All Data…
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!loading) setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (loading) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Confirm: Clear All Account Data
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-1">
              This will permanently delete all data associated with your company account.
              To confirm, type your company name exactly as shown below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-mono font-semibold text-slate-800 select-all">
              {companyName || "—"}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">Company name</Label>
              <Input
                id="confirm-name"
                placeholder={`Type "${companyName}" to confirm`}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              {confirmName.length > 0 && !nameMatches && (
                <p className="text-xs text-red-600">Name does not match — check capitalisation and spaces</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={!nameMatches || loading}
            >
              {loading ? "Clearing…" : "Yes, Delete Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
