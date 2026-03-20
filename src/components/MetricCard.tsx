import { cn } from "@/lib/utils";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: string; positive: boolean };
  className?: string;
  onClick?: () => void;
}

export function MetricCard({ title, value, subtitle, icon: Icon, iconColor = "text-blue-600", iconBg = "bg-blue-50", trend, className, onClick }: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 shadow-sm p-5",
        "hover:shadow-md transition-all duration-200",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-bold text-slate-900 font-mono tabular-nums leading-none">{value}</p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          {trend && (
            <div className={cn("flex items-center gap-1 text-xs font-medium mt-2", trend.positive ? "text-green-600" : "text-red-600")}>
              {trend.positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {trend.value}
            </div>
          )}
        </div>
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
