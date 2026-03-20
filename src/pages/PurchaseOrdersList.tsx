import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, Search, Eye, FileText, Package, X, Copy, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { fetchPurchaseOrders, fetchPOStats, softDeletePurchaseOrder, type POFilters } from "@/lib/purchase-orders-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, PO_EXPORT_COLS } from "@/lib/export-utils";
import { getDaysOpen, getDaysOpenClass } from "@/lib/days-open";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_received: "Partial",
  fully_received: "Received",
  cancelled: "Cancelled",
  closed: "Closed",
  deleted: "Deleted",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_received: "status-overdue",
  fully_received: "status-paid",
  cancelled: "status-cancelled line-through",
  closed: "status-draft",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
};

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<POFilters>({
    search: "",
    status: "all",
    page: 1,
    pageSize: 20,
  });
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["po-stats"],
    queryFn: fetchPOStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: () => fetchPurchaseOrders(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: async (po: any) => {
      await softDeletePurchaseOrder(po.id);
      await logAudit("purchase_order", po.id, "deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-stats"] });
      toast({ title: "PO deleted" });
    },
  });

  const allPos = data?.data ?? [];
  const pos = showDeleted ? allPos : allPos.filter((p) => p.status !== "deleted");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Track vendor orders and receipts</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => exportToExcel(pos, PO_EXPORT_COLS, `Purchase_Orders_${new Date().toISOString().split("T")[0]}.xlsx`, "Purchase Orders")} disabled={pos.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => navigate("/purchase-orders/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="POs This Month" value={String(stats?.totalThisMonth ?? 0)} icon={ShoppingCart} />
        <MetricCard title="Open POs" value={String(stats?.openPOs ?? 0)} icon={Package} />
        <MetricCard title="Value This Month" value={formatCurrency(stats?.totalValueThisMonth ?? 0)} icon={FileText} />
        <MetricCard
          title="Overdue (>30d)"
          value={String(stats?.overduePOs ?? 0)}
          icon={ShoppingCart}
          className={stats?.overduePOs ? "border-destructive/30" : ""}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO#, vendor..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_received">Partially Received</SelectItem>
            <SelectItem value="fully_received">Fully Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showDeleted ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowDeleted(!showDeleted)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> {showDeleted ? "Hide Deleted" : "Show Deleted"}
        </Button>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th className="text-right">Total Value</th>
                <th>Status</th>
                <th className="text-right">Days Open</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No purchase orders yet</p>
                    <p className="text-sm text-muted-foreground">Create your first PO to get started</p>
                  </td>
                </tr>
              ) : (
                pos.map((po) => {
                  const days = getDaysOpen(po.issued_at, po.status);
                  const daysClass = getDaysOpenClass(days);
                  const isDeleted = po.status === "deleted";
                  return (
                    <tr
                      key={po.id}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${isDeleted ? "opacity-50" : ""}`}
                      onClick={() => !isDeleted && navigate(`/purchase-orders/${po.id}`)}
                    >
                      <td className="font-mono text-sm font-medium text-foreground">{po.po_number}</td>
                      <td className="text-muted-foreground">{new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="font-medium">{po.vendor_name || "—"}</td>
                      <td className="text-right font-mono tabular-nums">{formatCurrency(po.grand_total)}</td>
                      <td>
                        <span className={statusClass[po.status] || "status-draft"}>
                          {statusLabels[po.status] || po.status}
                        </span>
                      </td>
                      <td className="text-right">
                        {days !== null ? (
                          <span className={daysClass}>{days}d</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!["cancelled", "deleted"].includes(po.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("Delete this PO? It will be hidden from the register.")) deleteMutation.mutate(po);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {(data?.count ?? 0) > (filters.pageSize ?? 20) && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground flex items-center px-2">
            Page {filters.page} of {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 20))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) * (filters.pageSize ?? 20) >= (data?.count ?? 0)}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
