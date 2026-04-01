import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchDispatchRecords, fetchDispatchStats } from "@/lib/dispatch-api";
import { format, parseISO } from "date-fns";

function statusBadge(status: string) {
  if (status === "draft") return <Badge className="bg-slate-100 text-slate-700">Draft</Badge>;
  if (status === "dispatched") return <Badge className="bg-blue-100 text-blue-800">Dispatched</Badge>;
  if (status === "delivered") return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
  return <Badge>{status}</Badge>;
}

export default function DispatchRecords() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["dispatch-stats"],
    queryFn: fetchDispatchStats,
    staleTime: 30_000,
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["dispatch-records", search],
    queryFn: () => fetchDispatchRecords({ search }),
    staleTime: 30_000,
  });

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

      {/* Search */}
      <div className="max-w-xs">
        <Input
          placeholder="Search by DR number or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No dispatch records yet</p>
          <p className="text-sm mt-1">Create your first dispatch record to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">DR Number</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Vehicle</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dispatched By</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dispatch Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((dr) => (
                <tr
                  key={dr.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/dispatch-records/${dr.id}`)}
                >
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{dr.dr_number}</td>
                  <td className="px-4 py-3 text-slate-700">{dr.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{dr.vehicle_number ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{dr.dispatched_by ?? "—"}</td>
                  <td className="px-4 py-3">{statusBadge(dr.status)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {dr.dispatch_date ? format(parseISO(dr.dispatch_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
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
