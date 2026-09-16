import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Plus, Search, TrendingUp, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/MetricCard";
import { fetchInvoices, fetchInvoiceStats, softDeleteInvoice, type InvoiceFilters } from "@/lib/invoices-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, INVOICE_EXPORT_COLS } from "@/lib/export-utils";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { cn } from "@/lib/utils";

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sale_complete", label: "Sale Complete" },
  { value: "cancelled", label: "Cancelled" },
  { value: "deleted", label: "Deleted" },
];

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sale_complete: "Sale Complete",
  cancelled: "Cancelled",
  deleted: "Deleted",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  sale_complete: "status-paid",
  cancelled: "status-cancelled line-through",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
};

export default function InvoiceRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canExport, canEdit } = useRoleAccess();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InvoiceFilters>({ search: "", status: "all", page: 1, pageSize: 20 });

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
      toast({ title: "Draft deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error deleting draft", description: err.message, variant: "destructive" });
    },
  });

  const allInvoices = data?.data ?? [];
  // Deleted invoices are hidden unless the "Deleted" chip is explicitly selected.
  const invoices = filters.status === "deleted" ? allInvoices : allInvoices.filter((i: any) => i.status !== "deleted");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500 mt-1">GST-compliant tax invoices for finished goods</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {canExport && <Button variant="outline" onClick={() => exportToExcel(invoices, INVOICE_EXPORT_COLS, `Invoices_${new Date().toISOString().split("T")[0]}.xlsx`, "Invoices")} disabled={invoices.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>}
          {canEdit && (
            <Button onClick={() => navigate("/invoices/new")} className="active:scale-[0.98] transition-transform">
              <Plus className="h-4 w-4 mr-1" /> New Sale
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Billed This Month" value={formatCurrency(stats?.billedThisMonth ?? 0)} icon={FileText} />
        <MetricCard title="FY Revenue" value={formatCurrency(stats?.fyRevenue ?? 0)} icon={TrendingUp} />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setFilters((f) => ({ ...f, status: chip.value, page: 1 }))}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                filters.status === chip.value
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
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
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No sales found. Create your first sale.</td></tr>
              ) : (
                invoices.map((inv: any) => {
                  const isDraft = inv.status === "draft";
                  const isDeleted = inv.status === "deleted";
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => !isDeleted && navigate(`/invoices/${inv.id}`)}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${isDeleted ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{inv.invoice_number || "Draft"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{inv.invoice_date}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{inv.customer_name}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(inv.grand_total ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={statusClass[inv.status] || "status-draft"}>{statusLabels[inv.status] || inv.status}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          {isDraft && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("Delete this draft?")) deleteMutation.mutate(inv);
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
