import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatNumber } from "@/lib/gst-utils";
import {
  fetchAssemblyWorkOrders,
  acceptAssemblyWorkOrder,
  type AssemblyWorkOrder,
} from "@/lib/production-api";

/**
 * Store acceptance of finished assembly builds (A4). Lives in the Store Receipt
 * Queue alongside GRN store-confirmation — same storekeeper, same "accept goods
 * into a rack" action. Lists AWOs in 'awaiting_store' and, on Accept, captures a
 * free-text rack/location and calls acceptAssemblyWorkOrder (which posts the
 * consumption + output stock, ledger-first).
 */
export function AssemblyOutputAcceptance() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [locations, setLocations] = useState<Record<string, string>>({});
  const [accepting, setAccepting] = useState<Record<string, boolean>>({});

  const { data: awos = [], isLoading } = useQuery({
    queryKey: ["awaiting-store-awos"],
    queryFn: () => fetchAssemblyWorkOrders({ status: "awaiting_store" }),
  });

  const acceptedBy =
    (profile as any)?.full_name ||
    (user as any)?.user_metadata?.full_name ||
    user?.email ||
    "Storekeeper";

  const acceptMutation = useMutation({
    mutationFn: (awo: AssemblyWorkOrder) =>
      acceptAssemblyWorkOrder(awo.id, locations[awo.id]?.trim() || null, acceptedBy),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-awos"] });
      queryClient.invalidateQueries({ queryKey: ["sa-work-orders-wip"] });
      queryClient.invalidateQueries({ queryKey: ["fg-work-orders-wip"] });
      queryClient.invalidateQueries({ queryKey: ["awo-stats-dashboard"] });
      toast({ title: "Assembly output accepted into stock" });
      const warnings = res?.warnings ?? [];
      if (warnings.length > 0) {
        toast({ title: "Some lines were not posted", description: warnings.join("; "), variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Hide the whole block when there's nothing awaiting acceptance.
  if (!isLoading && awos.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-900/10 overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-2 border-b border-blue-200 dark:border-blue-900/40">
        <Boxes className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Assembly Output — Awaiting Acceptance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Finished builds cleared by production. Accept into stock with a rack/location.
          </p>
        </div>
        {awos.length > 0 && (
          <Badge className="ml-auto bg-blue-100 text-blue-800">{awos.length}</Badge>
        )}
      </div>

      <div className="divide-y divide-blue-100 dark:divide-blue-900/30">
        {isLoading ? (
          <div className="px-5 py-4 text-sm text-slate-400">Loading…</div>
        ) : (
          awos.map((awo) => {
            const isBusy = !!accepting[awo.id] || acceptMutation.isPending;
            return (
              <div key={awo.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    className="font-mono text-xs font-medium text-blue-700 hover:underline"
                    onClick={() => navigate(`/assembly-work-orders/${awo.id}`)}
                  >
                    {awo.awo_number}
                  </button>
                  <span className="ml-2 text-xs text-slate-500">
                    {awo.awo_type === "finished_good" ? "Finished Good" : "Sub-Assembly"}
                  </span>
                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                    {awo.item_description ?? awo.item_code ?? "—"}
                    <span className="text-slate-500"> · build {formatNumber(awo.quantity_to_build)}</span>
                  </p>
                </div>
                <Input
                  placeholder="Rack / location"
                  className="w-40"
                  value={locations[awo.id] ?? ""}
                  onChange={(e) => setLocations((prev) => ({ ...prev, [awo.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() => {
                    setAccepting((p) => ({ ...p, [awo.id]: true }));
                    acceptMutation.mutate(awo, {
                      onSettled: () => setAccepting((p) => ({ ...p, [awo.id]: false })),
                    });
                  }}
                >
                  {isBusy ? "Accepting…" : "Accept into stock"}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
