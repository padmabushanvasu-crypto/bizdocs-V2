import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck, Search, Plus, Package, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDispatchNotes, fetchDnStats } from "@/lib/sales-orders-api";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency } from "@/lib/gst-utils";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  issued:    "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", issued: "Issued", cancelled: "Cancelled",
};

export default function DispatchNotes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ["dn-stats"],
    queryFn: fetchDnStats,
    refetchInterval: 300000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatch-notes", statusFilter, search, page],
    queryFn: () => fetchDispatchNotes({ search, status: statusFilter, page, pageSize: 20 }),
    refetchInterval: 300000,
  });

  const notes = data?.data ?? [];
  const total = data?.count ?? 0;
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatch Notes</h1>
          <p className="text-sm text-slate-500 mt-1">Outward dispatch records for customer deliveries</p>
        </div>
        <Button size="sm" onClick={() => navigate("/dispatch-notes/new")} className="flex-shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Dispatch Note
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Draft"
          value={String(stats?.draft ?? "0")}
          icon={Package}
          className="border-l-4 border-l-slate-300"
        />
        <MetricCard
          title="Issued"
          value={String(stats?.issued ?? "0")}
          icon={CheckCircle2}
          className="border-l-4 border-l-blue-500"
        />
        <MetricCard
          title="Cancelled"
          value={String(stats?.cancelled ?? "0")}
          icon={Truck}
          className="border-l-4 border-l-red-300"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search DN number, customer, SO..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Unable to load dispatch notes</p>
            <p className="text-xs text-muted-foreground mt-1">Run the Phase 9 migration to enable this feature.</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="py-12 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No dispatch notes found</p>
            <p className="text-xs text-muted-foreground mt-1">Create dispatch notes from Sales Orders or directly.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/dispatch-notes/new")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Dispatch Note
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DN Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">SO Reference</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vehicle / Transporter</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Amount</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((dn) => (
                <tr
                  key={dn.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/dispatch-notes/${dn.id}`)}
                >
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{dn.dn_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dn.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{dn.so_number ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {dn.dn_date ? format(new Date(dn.dn_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {dn.vehicle_number ?? dn.transporter ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                    {formatCurrency(dn.grand_total)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={statusClass[dn.status] || "status-draft"}>
                      {statusLabels[dn.status] ?? dn.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/dispatch-notes/${dn.id}`); }}
                    >
                      {dn.status === "draft" ? "Edit / View" : "View"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
