import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePageSize } from "@/components/TablePageSize";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import {
  fetchDcBalance,
  fetchDcBalanceForExport,
  fetchDcBalanceVendors,
  type DcBalanceFilters,
  type DcBalanceStatusFilter,
} from "@/lib/dc-balance-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { buildDcBalanceWorkbook, downloadWorkbook, DC_BALANCE_STATUS_LABEL } from "@/lib/export-utils";
import { formatDateIN, nowStampIST, todayIST } from "@/lib/date-ist";
import { formatNumber } from "@/lib/gst-utils";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  partially_received: "bg-blue-50 text-blue-700 border border-blue-200",
  fully_received: "bg-green-50 text-green-700 border border-green-200",
};

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 whitespace-nowrap";
const TD = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";

export function DcBalanceView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canExport } = useRoleAccess();
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<DcBalanceFilters>({
    search: "",
    status: "open",
    vendor: undefined,
    overdueOnly: false,
    month: undefined,
    page: 1,
    pageSize: 25,
  });
  const patch = (p: Partial<DcBalanceFilters>) => setFilters((f) => ({ ...f, ...p, page: 1 }));

  const { data, isLoading, error } = useQuery({
    queryKey: ["dc-balance", filters],
    queryFn: () => fetchDcBalance(filters),
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["dc-balance-vendors"],
    queryFn: fetchDcBalanceVendors,
    staleTime: 5 * 60 * 1000,
  });
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.data ?? [];
  const count = data?.count ?? 0;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  // Exports exactly the current filters, across all pages.
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const all = await fetchDcBalanceForExport(filters);
      const { workbook, filename } = buildDcBalanceWorkbook(all, {
        companyName: companySettings?.company_name ?? "client",
        generatedAt: nowStampIST(),
        todayIST: todayIST(),
        filters,
      });
      downloadWorkbook(workbook, filename);
      toast({ title: `Exported ${all.length} row${all.length === 1 ? "" : "s"} to ${filename}` });
    } catch (err: any) {
      console.error("[DcBalanceView] export failed:", err);
      toast({ title: "Export failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search DC#, vendor, item, drawing..."
            className="pl-9"
            value={filters.search ?? ""}
            onChange={(e) => patch({ search: e.target.value })}
          />
        </div>
        <Select value={filters.status ?? "open"} onValueChange={(v) => patch({ status: v as DcBalanceStatusFilter })}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Pending + Partial</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partially_received">Partial</SelectItem>
            <SelectItem value="fully_received">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.vendor ?? "all"} onValueChange={(v) => patch({ vendor: v === "all" ? undefined : v })}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All vendors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="month"
          className="w-[160px]"
          value={filters.month ?? ""}
          onChange={(e) => patch({ month: e.target.value || undefined })}
          title="DC month"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox checked={!!filters.overdueOnly} onCheckedChange={(v) => patch({ overdueOnly: v === true })} />
          Overdue only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <TablePageSize value={pageSize} onChange={(v) => setFilters((f) => ({ ...f, pageSize: v, page: 1 }))} />
          {canExport && (
            <Button variant="outline" size="sm" disabled={isExporting} onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {isExporting ? "Exporting…" : "Export"}
            </Button>
          )}
        </div>
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${TH} text-left`}>DC No</th>
                <th className={`${TH} text-left`}>DC Date</th>
                <th className={`${TH} text-left`}>Vendor</th>
                <th className={`${TH} text-left`}>Item Code</th>
                <th className={`${TH} text-left`}>Drawing No</th>
                <th className={`${TH} text-left`}>Description</th>
                <th className={`${TH} text-left`}>Process</th>
                <th className={`${TH} text-left`}>Unit</th>
                <th className={`${TH} text-right`}>Plan Qty</th>
                <th className={`${TH} text-right`}>Received Qty</th>
                <th className={`${TH} text-right`}>Balance Qty</th>
                <th className={`${TH} text-left`}>GRN Nos</th>
                <th className={`${TH} text-left`}>Due Date</th>
                <th className={`${TH} text-right`}>Overdue</th>
                <th className={`${TH} text-center`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={15} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={15} className="px-3 py-8 text-center text-sm text-destructive">{(error as Error).message}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={15} className="px-3 py-10 text-center text-sm text-slate-400">No DC lines match these filters</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.dc_line_item_id} className="hover:bg-muted/50 transition-colors">
                    <td className={TD}>
                      <button className="font-mono text-sm font-medium text-primary hover:underline" onClick={() => navigate(`/delivery-challans/${r.dc_id}`)}>
                        {r.dc_number}
                      </button>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{formatDateIN(r.dc_date)}</td>
                    <td className={`${TD} font-medium`}>{r.vendor_name || "—"}</td>
                    <td className={`${TD} font-mono`}>{r.item_code || "—"}</td>
                    <td className={`${TD} font-mono`}>{r.drawing_number || "—"}</td>
                    <td className={`${TD} max-w-[260px]`}>{r.description || "—"}</td>
                    <td className={TD}>{r.nature_of_process || "—"}</td>
                    <td className={TD}>{r.unit || "—"}</td>
                    <td className={`${TD} text-right tabular-nums font-mono`}>{formatNumber(r.plan_qty)}</td>
                    <td className={`${TD} text-right tabular-nums font-mono`}>{formatNumber(r.received_qty)}</td>
                    <td className={`${TD} text-right tabular-nums font-mono font-semibold`}>{formatNumber(r.balance_qty)}</td>
                    <td className={`${TD} font-mono text-xs`}>{r.grn_numbers || "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{r.return_due_date ? formatDateIN(r.return_due_date) : "—"}</td>
                    <td className={`${TD} text-right tabular-nums font-mono`}>
                      {r.days_overdue != null && r.days_overdue > 0
                        ? <span className="text-destructive font-semibold">{r.days_overdue}d</span>
                        : "—"}
                    </td>
                    <td className={`${TD} text-center`}>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_BADGE[r.line_status] ?? ""}`}>
                        {DC_BALANCE_STATUS_LABEL[r.line_status] ?? r.line_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 text-xs text-slate-500">
        <span className="tabular-nums">{count} line{count === 1 ? "" : "s"}</span>
        {count > pageSize && (
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}>Previous</Button>
            <span className="tabular-nums">Page {page} of {Math.ceil(count / pageSize)}</span>
            <Button variant="outline" size="sm" disabled={page * pageSize >= count} onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}>Next</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DcBalanceView;
