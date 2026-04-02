import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getStockStatusBadge } from "@/lib/stock-utils";

const colorCls: Record<string, string> = {
  red:   "bg-red-100 text-red-700 border-red-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  blue:  "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  grey:  "bg-slate-100 text-slate-500 border-slate-200",
};

export function StockStatusBadge({
  alertLevel,
  totalStock,
}: {
  alertLevel: string;
  totalStock: number;
}) {
  const { label, color, tooltip } = getStockStatusBadge(alertLevel, totalStock);
  const cls = `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${colorCls[color]}`;

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`${cls} cursor-default`}>{label}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[240px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return <span className={cls}>{label}</span>;
}
