import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

async function fetchQcPendingGrns() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) return [];

  const { data: grns } = await (supabase as any)
    .from("grns")
    .select("id, grn_number, grn_date, vendor_name, vehicle_number, grn_type, created_at")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!grns) return [];

  const result = [];
  for (const grn of grns) {
    const { data: lines } = await (supabase as any)
      .from("grn_line_items")
      .select("id, stage1_complete, stage2_complete")
      .eq("grn_id", grn.id);

    const allStage1Done = (lines ?? []).length > 0 && (lines ?? []).every((l: any) => l.stage1_complete);
    const someStage2Pending = (lines ?? []).some((l: any) => !l.stage2_complete);

    if (allStage1Done && someStage2Pending) {
      result.push({ ...grn, line_count: lines?.length ?? 0 });
    }
  }
  return result;
}

export default function QcQueue() {
  const navigate = useNavigate();
  const { data: grns = [], isLoading } = useQuery({
    queryKey: ["qc-queue"],
    queryFn: fetchQcPendingGrns,
    refetchInterval: 30_000,
  });

  return (
    <div className="p-4 w-full">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">QC Queue</h1>
          <p className="text-sm text-muted-foreground">GRNs pending Stage 2 quality inspection</p>
        </div>
        <Badge className="ml-auto bg-blue-100 text-blue-800">{grns.length} pending</Badge>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && grns.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No pending QC inspections</p>
          <p className="text-sm mt-1">All GRNs have passed Stage 2</p>
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
                  <Badge className="text-[10px] bg-blue-100 text-blue-800">QC Pending</Badge>
                </div>
                <p className="text-sm text-foreground truncate">{grn.vendor_name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(grn.grn_date), 'dd MMM yyyy')}</span>
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
