import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchReadyToDispatch } from "@/lib/dispatch-api";
import { format, parseISO } from "date-fns";

function daysBadge(days: number) {
  if (days > 90) return <span className="text-red-600 font-semibold">{days}d</span>;
  if (days > 30) return <span className="text-amber-600 font-semibold">{days}d</span>;
  return <span className="text-slate-500">{days}d</span>;
}

export default function ReadyToDispatch() {
  const navigate = useNavigate();

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["ready-to-dispatch"],
    queryFn: fetchReadyToDispatch,
    staleTime: 30_000,
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
          <CheckCircle className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ready to Dispatch</h1>
          <p className="text-sm text-slate-500 mt-0.5">FAT-passed finished goods awaiting dispatch</p>
        </div>
      </div>

      {/* Stat chip */}
      {!isLoading && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
          <Package className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">{units.length} units ready</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : units.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No units ready to dispatch</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            Complete Assembly Work Orders and FAT to see units here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">FAT Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Since FAT</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{unit.serial_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <div className="font-medium text-slate-700">{unit.item_code ?? "—"}</div>
                    {unit.item_description && (
                      <div className="text-xs text-slate-500 mt-0.5">{unit.item_description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {unit.fat_completed_at
                      ? format(parseISO(unit.fat_completed_at), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{daysBadge(unit.days_since_fat)}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(`/dispatch-records/new?serial=${encodeURIComponent(unit.serial_number)}`)
                      }
                    >
                      Create Dispatch Record
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
