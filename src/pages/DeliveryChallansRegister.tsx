import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck, Plus, Search, Eye, Edit, Package, Clock, AlertTriangle, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { fetchDeliveryChallans, fetchDCStats, softDeleteDeliveryChallan, type DCFilters } from "@/lib/delivery-challans-api";
import { exportToExcel, DC_EXPORT_COLS } from "@/lib/export-utils";
import { getDaysOpen, getDaysOpenClass } from "@/lib/days-open";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_returned: "Partial Return",
  fully_returned: "Returned",
  cancelled: "Cancelled",
  deleted: "Deleted",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_returned: "status-overdue",
  fully_returned: "status-paid",
  cancelled: "status-cancelled line-through",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
};

const typeLabels: Record<string, string> = {
  returnable: "Returnable",
  non_returnable: "Non-Returnable",
  job_work_143: "Job Work (143)",
  job_work_out: "Job Work Out (R45)",
  job_work_return: "Job Work Return",
  supply: "Supply",
  sample: "Sample",
  loan_borrow: "Loan/Borrow",
};

export default function DeliveryChallansRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DCFilters>({
    search: "",
    status: "all",
    page: 1,
    pageSize: 20,
  });
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["dc-stats"],
    queryFn: fetchDCStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-challans", filters],
    queryFn: () => fetchDeliveryChallans(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: async (dc: any) => {
      await softDeleteDeliveryChallan(dc.id);
      await logAudit("delivery_challan", dc.id, "deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
      toast({ title: "DC deleted" });
    },
  });

  const allDcs = data?.data ?? [];
  const dcs = showDeleted ? allDcs : allDcs.filter((d) => d.status !== "deleted");
  const today = new Date().toISOString().split("T")[0];

  const isOverdue = (dc: any) =>
    dc.return_due_date &&
    dc.return_due_date < today &&
    !["fully_returned", "cancelled", "deleted"].includes(dc.status);

  // Rule 45: job_work_out must return within 365 days
  const getRule45Status = (dc: any): "overdue" | "warning" | null => {
    if (dc.dc_type !== "job_work_out" || ["fully_returned", "cancelled", "deleted"].includes(dc.status)) return null;
    const dueDate = new Date(dc.dc_date);
    dueDate.setFullYear(dueDate.getFullYear() + 1);
    const dueDateStr = dueDate.toISOString().split("T")[0];
    const warnDate = new Date(dueDate);
    warnDate.setDate(warnDate.getDate() - 30);
    const warnDateStr = warnDate.toISOString().split("T")[0];
    if (today >= dueDateStr) return "overdue";
    if (today >= warnDateStr) return "warning";
    return null;
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Delivery Challans</h1>
          <p className="text-sm text-muted-foreground">Track outgoing material and returns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportToExcel(dcs, DC_EXPORT_COLS, `Delivery_Challans_${new Date().toISOString().split("T")[0]}.xlsx`, "Delivery Challans")} disabled={dcs.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => navigate("/delivery-challans/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New DC
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="DCs This Month" value={String(stats?.totalThisMonth ?? 0)} icon={Truck} />
        <MetricCard title="Open DCs" value={String(stats?.openDCs ?? 0)} icon={Package} />
        <MetricCard
          title="Overdue"
          value={String(stats?.overdueDCs ?? 0)}
          icon={AlertTriangle}
          className={stats?.overdueDCs ? "border-destructive/30" : ""}
        />
        <MetricCard title="Pending Returns" value={String(stats?.pendingReturns ?? 0)} icon={Clock} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search DC#, party..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_returned">Partially Returned</SelectItem>
            <SelectItem value="fully_returned">Fully Returned</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
                <th>DC #</th>
                <th>Date</th>
                <th>Party</th>
                <th>Type</th>
                <th className="text-right">Items</th>
                <th>Return Due</th>
                <th>Status</th>
                <th className="text-right">Days Open</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : dcs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No delivery challans yet</p>
                    <p className="text-sm text-muted-foreground">Create your first DC to get started</p>
                  </td>
                </tr>
              ) : (
                dcs.map((dc) => {
                  const overdue = isOverdue(dc);
                  const rule45Status = getRule45Status(dc);
                  const days = getDaysOpen(dc.issued_at, dc.status, ["fully_returned", "cancelled", "deleted"]);
                  const daysClass = getDaysOpenClass(days);
                  const isDeleted = dc.status === "deleted";
                  return (
                    <tr
                      key={dc.id}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${overdue || rule45Status === "overdue" ? "bg-destructive/5" : ""} ${isDeleted ? "opacity-50" : ""}`}
                      onClick={() => !isDeleted && navigate(`/delivery-challans/${dc.id}`)}
                    >
                      <td className="font-mono text-sm font-medium text-foreground">{dc.dc_number}</td>
                      <td className="text-muted-foreground">
                        {new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="font-medium">{dc.party_name || "—"}</td>
                      <td>
                        <span className="text-muted-foreground">{typeLabels[dc.dc_type] || dc.dc_type}</span>
                        {rule45Status === "overdue" && (
                          <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">R45 OVERDUE</span>
                        )}
                        {rule45Status === "warning" && (
                          <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">R45 DUE SOON</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums">{dc.total_items}</td>
                      <td className="text-muted-foreground">
                        {dc.return_due_date ? (
                          <span className={overdue ? "text-destructive font-medium" : ""}>
                            {new Date(dc.return_due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            {overdue && " ⚠"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className={statusClass[dc.status] || "status-draft"}>
                          {overdue && dc.status !== "cancelled" ? "Overdue" : statusLabels[dc.status] || dc.status}
                        </span>
                      </td>
                      <td className="text-right">
                        {days !== null ? <span className={daysClass}>{days}d</span> : "—"}
                      </td>
                      <td>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/delivery-challans/${dc.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!["cancelled", "deleted"].includes(dc.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("Delete this DC? It will be hidden from the register.")) deleteMutation.mutate(dc);
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
