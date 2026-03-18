import { cn } from "@/lib/utils";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon: Icon, trend, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3",
        "hover:shadow-md hover:border-blue-200 transition-all duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        <div className="rounded-lg bg-blue-50 p-2">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{value}</p>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      {trend && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", trend.positive ? "text-green-600" : "text-red-600")}>
          {trend.positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {trend.value}
        </div>
      )}
    </div>
  );
}
