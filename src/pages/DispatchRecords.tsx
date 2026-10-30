import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchDispatchRecords, fetchDispatchStats, type DispatchRecord } from "@/lib/dispatch-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { DispatchRecordDeleteDialog } from "@/components/DispatchRecordDeleteDialog";

function statusBadge(status: string) {
  if (status === "draft") return <Badge className="bg-slate-100 text-slate-700">Draft</Badge>;
  if (status === "dispatched") return <Badge className="bg-blue-100 text-blue-800">Dispatched</Badge>;
  if (status === "delivered") return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
  return <Badge>{status}</Badge>;
}

/** Units on a record that left without a serial (lines with no linked serial). */
function unitsWithoutSerial(dr: DispatchRecord): number {
  return (dr.items ?? [])
    .filter((li) => !li.serial_number && !li.serial_number_id)
    .reduce((n, li) => n + Number(li.quantity ?? 0), 0);
}

function SerialCell({ dr }: { dr: DispatchRecord }) {
  const serials = (dr.items ?? []).map((li) => li.serial_number).filter((s): s is string => !!s);
  const missing = unitsWithoutSerial(dr);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {serials.map((s, i) => (
        <span key={`${s}-${i}`} className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
          {s}
        </span>
      ))}
      {missing > 0 && (
        <span className="text-xs text-amber-700">
          {serials.length > 0 ? `+${missing} without serial` : `No serial (${missing} unit${missing === 1 ? "" : "s"})`}
        </span>
      )}
    </div>
  );
}

export default function DispatchRecords() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [serialFilter, setSerialFilter] = useState<"all" | "missing">("all");
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; dr_number: string; status: string } | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["dispatch-stats"],
    queryFn: fetchDispatchStats,
    staleTime: 30_000,
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["dispatch-records"],
    queryFn: () => fetchDispatchRecords(),
    staleTime: 30_000,
  });

  // Search runs here so it can match serial numbers on the lines, not just the header.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((dr) => {
      if (serialFilter === "missing" && unitsWithoutSerial(dr) === 0) return false;
      if (!q) return true;
      return (
        (dr.items ?? []).some((li) => (li.serial_number ?? "").toLowerCase().includes(q)) ||
        dr.dr_number?.toLowerCase().includes(q) ||
        (dr.customer_name ?? "").toLowerCase().includes(q) ||
        (dr.vehicle_number ?? "").toLowerCase().includes(q) ||
        (dr.items ?? []).some((li) => (li.item_code ?? "").toLowerCase().includes(q))
      );
    });
  }, [records, search, serialFilter]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <Truck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dispatch Records</h1>
            {stats && (
              <p className="text-sm text-slate-500 mt-0.5">
                {stats.draft} draft &middot; {stats.dispatched} dispatched &middot; {stats.delivered_this_month} delivered this month
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => navigate("/dispatch-records/new")}>
          <Plus className="h-4 w-4 mr-1" />
          New Dispatch Record
        </Button>
      </div>

      {/* Search + serial filter */}
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Search serial no., DR number, customer, item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={serialFilter} onValueChange={(v) => setSerialFilter(v as "all" | "missing")}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Serials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All serials</SelectItem>
            <SelectItem value="missing">Missing serials</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{records.length === 0 ? "No dispatch records yet" : "No records match your search"}</p>
          <p className="text-sm mt-1">
            {records.length === 0 ? "Create your first dispatch record to get started." : "Try a different serial or DR number."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DR Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vehicle</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Dispatched By</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Dispatch Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dr) => (
                <tr
                  key={dr.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/dispatch-records/${dr.id}`)}
                >
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <SerialCell dr={dr} />
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium text-blue-700">{dr.dr_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dr.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dr.vehicle_number ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dr.dispatched_by ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">{statusBadge(dr.status)}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {dr.dispatch_date ? format(parseISO(dr.dispatch_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dispatch-records/${dr.id}`);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      aria-label={`Delete ${dr.dr_number}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: dr.id, dr_number: dr.dr_number, status: dr.status });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DispatchRecordDeleteDialog
        record={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["dispatch-records"] });
          queryClient.invalidateQueries({ queryKey: ["dispatch-stats"] });
          queryClient.invalidateQueries({ queryKey: ["ready-to-dispatch"] });
          queryClient.invalidateQueries({ queryKey: ["stock-register"] });
        }}
      />
    </div>
  );
}
