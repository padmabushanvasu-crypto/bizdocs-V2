import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingDown, ChevronLeft } from "lucide-react";
import { getCompanyId } from "@/lib/auth-helpers";
import { StockAlertsBoard } from "@/components/StockAlertsBoard";

export default function ReorderIntelligence() {
  const navigate = useNavigate();

  const { data: companyId } = useQuery({
    queryKey: ["company-id"],
    queryFn: () => getCompanyId(),
    staleTime: Infinity,
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — fixed, never scrolls */}
      <div className="shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Reorder Alerts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Items currently below their minimum stock threshold
          </p>
        </div>
      </div>

      {/* Board — fills remaining height, table scrolls internally */}
      {companyId && (
        <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 pb-4 md:pb-6">
          <StockAlertsBoard companyId={companyId} fullHeight />
        </div>
      )}
    </div>
  );
}
