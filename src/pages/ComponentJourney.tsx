import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { fetchProcessingRoute, type ProcessingRoute } from "@/lib/dc-intelligence-api";
import { format } from "date-fns";

interface StageWithStatus extends ProcessingRoute {
  status: 'complete' | 'in_progress' | 'pending';
  dcRef?: string;
  dcId?: string;
  completedDate?: string;
  vendorName?: string;
}

export default function ComponentJourney() {
  const [searchParams] = useSearchParams();
  const itemId = searchParams.get("item_id");
  const dcRef = searchParams.get("dc_ref");
  const navigate = useNavigate();

  // Fetch processing route
  const { data: route = [], isLoading: routeLoading } = useQuery({
    queryKey: ["processing-route", itemId],
    queryFn: () => fetchProcessingRoute(itemId!),
    enabled: !!itemId,
  });

  // Fetch DC line items for this item
  const { data: dcLines = [] } = useQuery({
    queryKey: ["dc-lines-for-item", itemId],
    queryFn: async () => {
      const companyId = await getCompanyId();
      if (!companyId || !itemId) return [];
      const { data } = await (supabase as any)
        .from("dc_line_items")
        .select(`
          id, stage_number, total_stages, route_id,
          delivery_challans(id, dc_number, dc_date, party_name, status)
        `)
        .eq("item_id", itemId);
      return data ?? [];
    },
    enabled: !!itemId,
  });

  // Fetch GRN line items for completed stages
  const { data: grnLines = [] } = useQuery({
    queryKey: ["grn-lines-for-item", itemId],
    queryFn: async () => {
      const companyId = await getCompanyId();
      if (!companyId || !itemId) return [];
      const { data } = await (supabase as any)
        .from("grn_line_items")
        .select("id, stage2_complete, dc_line_id, updated_at")
        .eq("item_id", itemId)
        .eq("stage2_complete", true);
      return data ?? [];
    },
    enabled: !!itemId,
  });

  // Build set of completed dc_line_ids
  const completedDcLineIds = new Set<string>(
    (grnLines as any[]).map((g: any) => g.dc_line_id).filter(Boolean)
  );

  // Map stages to status
  const stagesWithStatus: StageWithStatus[] = route.map((stage) => {
    // Find DC line for this stage
    const dcLine = (dcLines as any[]).find(
      (l: any) => l.stage_number === stage.stage_number || l.route_id === stage.id
    );
    const dc = dcLine?.delivery_challans;
    const dcLineId = dcLine?.id;

    let status: StageWithStatus['status'] = 'pending';
    let completedDate: string | undefined;

    if (dcLineId && completedDcLineIds.has(dcLineId)) {
      status = 'complete';
      const grnLine = (grnLines as any[]).find((g: any) => g.dc_line_id === dcLineId);
      if (grnLine?.updated_at) {
        completedDate = format(new Date(grnLine.updated_at), "dd MMM yyyy");
      }
    } else if (dcLine && dc) {
      status = 'in_progress';
    }

    return {
      ...stage,
      status,
      dcRef: dc?.dc_number,
      dcId: dc?.id,
      completedDate,
      vendorName: dc?.party_name,
    };
  });

  const totalStages = stagesWithStatus.length;
  const completedStages = stagesWithStatus.filter(s => s.status === 'complete').length;
  const lastCompletedStage = [...stagesWithStatus].reverse().find(s => s.status === 'complete');
  const lastCompletedNumber = lastCompletedStage?.stage_number ?? 0;
  const nextStage = stagesWithStatus.find(s => s.stage_number === lastCompletedNumber + 1 && s.status === 'pending') ?? null;

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div>
        <h1 className="text-xl font-bold">Component Journey</h1>
        {dcRef && <p className="text-sm text-muted-foreground mt-1">DC Ref: <span className="font-mono">{dcRef}</span></p>}
      </div>

      {routeLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading route…</div>
      ) : totalStages === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No processing route defined for this item.</p>
          <p className="text-xs mt-2">Set up a processing route to track component journeys.</p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${totalStages > 0 ? (completedStages / totalStages) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm font-medium whitespace-nowrap">
              {completedStages} of {totalStages} stages complete
            </span>
          </div>

          {/* Stage timeline */}
          <div className="space-y-0">
            {stagesWithStatus.map((stage, idx) => (
              <div key={stage.id} className="flex gap-4">
                {/* Left: circle + line */}
                <div className="flex flex-col items-center">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    stage.status === 'complete'
                      ? 'bg-green-500 text-white'
                      : stage.status === 'in_progress'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {stage.stage_number}
                  </div>
                  {idx < stagesWithStatus.length - 1 && (
                    <div className="w-0.5 bg-slate-200 flex-1 mt-1 min-h-[24px]" />
                  )}
                </div>

                {/* Right: content */}
                <div className="flex-1 pb-6">
                  <p className="font-semibold text-sm">{stage.process_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stage.stage_type === 'external' ? 'External' : 'Internal'}
                    {stage.lead_time_days > 0 && ` · ${stage.lead_time_days}d lead time`}
                  </p>
                  {stage.dcRef && (
                    <button
                      className="text-xs text-primary underline mt-1"
                      onClick={() => navigate(`/delivery-challans/${stage.dcId}`)}
                    >
                      DC: {stage.dcRef}
                    </button>
                  )}
                  <div className="mt-1">
                    {stage.status === 'complete' && (
                      <span className="text-xs text-green-600">
                        Complete{stage.completedDate ? ` — ${stage.completedDate}` : ''}
                      </span>
                    )}
                    {stage.status === 'in_progress' && (
                      <span className="text-xs text-blue-600">
                        In Progress{stage.vendorName ? ` at ${stage.vendorName}` : ''}
                      </span>
                    )}
                    {stage.status === 'pending' && (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Raise DC for next stage */}
          {nextStage && nextStage.stage_type === 'external' && (
            <div className="paper-card bg-blue-50 border border-blue-200">
              <p className="text-sm font-medium text-blue-800 mb-2">
                Ready for next stage
              </p>
              <p className="text-xs text-blue-700 mb-3">
                Stage {nextStage.stage_number}: {nextStage.process_name}
              </p>
              <Button
                size="sm"
                onClick={() => navigate(`/delivery-challans/new?item_id=${itemId}&stage=${nextStage.stage_number}`)}
              >
                Raise DC for Stage {nextStage.stage_number}: {nextStage.process_name}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
