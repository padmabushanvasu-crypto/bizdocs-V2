import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Search, IndianRupee, AlertTriangle, CheckCircle2, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { fetchInvoices, fetchInvoiceStats, softDeleteInvoice, type InvoiceFilters } from "@/lib/invoices-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, INVOICE_EXPORT_COLS } from "@/lib/export-utils";
import { getDaysOpen, getDaysOpenClass } from "@/lib/days-open";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partial",
  fully_paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  deleted: "Deleted",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  sent: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_paid: "status-overdue",
  fully_paid: "status-paid",
  overdue: "bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled: "status-cancelled line-through",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
};

export default function InvoiceRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canExport } = useRoleAccess();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InvoiceFilters>({ search: "", status: "all", page: 1, pageSize: 20 });
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: stats } = useQuery({ queryKey: ["invoice-stats"], queryFn: fetchInvoiceStats });
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", filters],
    queryFn: () => fetchInvoices(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: async (inv: any) => {
      await softDeleteInvoice(inv.id);
      await logAudit("invoice", inv.id, "deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      toast({ title: "Invoice deleted" });
    },
  });

  const allInvoices = data?.data ?? [];
  const invoices = showDeleted ? allInvoices : allInvoices.filter((i: any) => i.status !== "deleted");

  const getDisplayStatus = (inv: any) => {
    if (inv.status !== "cancelled" && inv.status !== "deleted" && inv.due_date && inv.due_date < new Date().toISOString().split("T")[0] && (inv.amount_outstanding ?? 0) > 0) {
      return "overdue";
    }
    return inv.status;
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">GST-compliant tax invoices</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {canExport && <Button variant="outline" onClick={() => exportToExcel(invoices, INVOICE_EXPORT_COLS, `Invoices_${new Date().toISOString().split("T")[0]}.xlsx`, "Invoices")} disabled={invoices.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>}
          <Button onClick={() => navigate("/invoices/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New Invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="Billed This Month" value={formatCurrency(stats?.billedThisMonth ?? 0)} icon={FileText} />
        <MetricCard title="Collected This Month" value={formatCurrency(stats?.collectedThisMonth ?? 0)} icon={CheckCircle2} />
        <MetricCard title="Outstanding" value={formatCurrency(stats?.totalOutstanding ?? 0)} icon={IndianRupee} />
        <MetricCard title="Overdue" value={formatCurrency(stats?.overdueAmount ?? 0)} icon={AlertTriangle} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="fully_paid">Paid</SelectItem>
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

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Invoice #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Total</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Due Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Outstanding</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">No invoices found. Create your first invoice.</td></tr>
              ) : (
                invoices.map((inv: any) => {
                  const displayStatus = getDisplayStatus(inv);
                  const isOverdue = displayStatus === "overdue";
                  const isDeleted = inv.status === "deleted";
                  const days = getDaysOpen(inv.issued_at, inv.status, ["fully_paid", "cancelled", "deleted"]);
                  const daysClass = getDaysOpenClass(days);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => !isDeleted && navigate(`/invoices/${inv.id}`)}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${isOverdue ? "bg-rose-50/50" : ""} ${isDeleted ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{inv.invoice_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{inv.invoice_date}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{inv.customer_name}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(inv.grand_total ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{inv.due_date || "—"}</td>
                      <td className={`px-3 py-2 text-sm border-b border-slate-100 text-right tabular-nums font-mono ${(inv.amount_outstanding ?? 0) > 0 ? "text-amber-600 font-semibold" : "text-slate-700"}`}>
                        {formatCurrency(inv.amount_outstanding ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={statusClass[displayStatus] || "status-draft"}>{statusLabels[displayStatus] || displayStatus}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {days !== null ? <span className={daysClass}>{days}d</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          {!["cancelled", "deleted"].includes(inv.status) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("Delete this invoice? It will be hidden from the register.")) deleteMutation.mutate(inv);
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
    </div>
  );
}
