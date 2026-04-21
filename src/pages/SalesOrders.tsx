import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingBag, Search, Plus, TrendingUp, CheckCircle2, Factory, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSalesOrders, fetchSoStats } from "@/lib/sales-orders-api";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency } from "@/lib/gst-utils";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft:         "bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  confirmed:     "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  in_production: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  dispatched:    "bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  invoiced:      "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled:     "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  draft: "Draft", confirmed: "Confirmed", in_production: "In Production",
  dispatched: "Dispatched", invoiced: "Invoiced", cancelled: "Cancelled",
};
const priorityClass: Record<string, string> = {
  low:    "text-slate-400",
  normal: "text-slate-500",
  high:   "text-amber-600 font-semibold",
  urgent: "text-red-600 font-bold",
};

export default function SalesOrders() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ["so-stats"],
    queryFn: fetchSoStats,
    refetchInterval: 300000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sales-orders", statusFilter, search, page],
    queryFn: () => fetchSalesOrders({ search, status: statusFilter, page, pageSize: 20 }),
    refetchInterval: 300000,
  });

  const orders = data?.data ?? [];
  const total = data?.count ?? 0;
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Customer orders from enquiry to dispatch</p>
        </div>
        <Button size="sm" onClick={() => navigate("/sales-orders/new")} className="flex-shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Sales Order
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Confirmed"
          value={String(stats?.confirmed ?? "0")}
          icon={CheckCircle2}
          className="border-l-4 border-l-blue-500"
        />
        <MetricCard
          title="In Production"
          value={String(stats?.inProduction ?? "0")}
          icon={Factory}
          className={(stats?.inProduction ?? 0) > 0 ? "border-l-4 border-l-amber-500 bg-amber-50/30" : "border-l-4 border-l-slate-200"}
        />
        <MetricCard
          title="Dispatched"
          value={String(stats?.dispatched ?? "0")}
          icon={Truck}
          className="border-l-4 border-l-teal-500"
        />
        <MetricCard
          title="Draft"
          value={String(stats?.draft ?? "0")}
          icon={TrendingUp}
          className="border-l-4 border-l-slate-300"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search SO number, customer..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="in_production">In Production</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
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
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Unable to load sales orders</p>
            <p className="text-xs text-muted-foreground mt-1">Run the Phase 9 migration to enable this feature.</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No sales orders found</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first sales order to get started.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/sales-orders/new")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Sales Order
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">SO Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Priority</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Delivery Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Amount</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((so) => (
                <tr
                  key={so.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/sales-orders/${so.id}`)}
                >
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{so.so_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{so.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {so.so_date ? format(new Date(so.so_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={`text-xs capitalize ${priorityClass[so.priority] ?? ""}`}>
                      {so.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {so.delivery_date ? format(new Date(so.delivery_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                    {formatCurrency(so.grand_total)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={statusClass[so.status] || "status-draft"}>
                      {statusLabels[so.status] ?? so.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/sales-orders/${so.id}`); }}
                    >
                      View
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
