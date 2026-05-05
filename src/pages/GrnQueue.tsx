import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

async function fetchPendingGrns() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) return [];

  // Single round-trip — embed grn_line_items so we can filter for any
  // line that's not Stage 1 complete without N+1 lookups.
  const { data: grns } = await (supabase as any)
    .from("grns")
    .select(
      `id, grn_number, grn_date, vendor_name, vehicle_number, driver_name, grn_type, created_at,
       line_items:grn_line_items(id, stage1_complete)`
    )
    .eq("company_id", profile.company_id)
    .neq("status", "deleted")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!grns) return [];

  return (grns as any[])
    .filter((grn) => (grn.line_items ?? []).some((l: any) => !l.stage1_complete))
    .map((grn) => ({ ...grn, line_count: grn.line_items?.length ?? 0 }));
}

export default function GrnQueue() {
  const navigate = useNavigate();
  const { data: grns = [], isLoading } = useQuery({
    queryKey: ["grn-queue"],
    queryFn: fetchPendingGrns,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <PackageCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Inward Queue</h1>
          <p className="text-sm text-muted-foreground">GRNs pending Stage 1 inspection</p>
        </div>
        <Badge className="ml-auto bg-amber-100 text-amber-800">{grns.length} pending</Badge>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && grns.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pending inward inspections</p>
          <p className="text-sm mt-1">All GRNs are up to date</p>
        </div>
      )}

      <div className="space-y-3">
        {grns.map((grn: any) => (
          <button
            key={grn.id}
            onClick={() => navigate(`/grn/${grn.id}`)}
            className="w-full text-left bg-white border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{grn.grn_number}</span>
                  <Badge className="text-[10px] bg-amber-100 text-amber-800">Stage 1 Pending</Badge>
                </div>
                <p className="text-sm text-foreground truncate">{grn.vendor_name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(grn.grn_date), 'dd MMM yyyy')}</span>
                  {grn.vehicle_number && <span>Vehicle: {grn.vehicle_number}</span>}
                  <span>{grn.line_count} item{grn.line_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
