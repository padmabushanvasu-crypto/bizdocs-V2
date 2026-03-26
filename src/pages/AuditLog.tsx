import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  ChevronLeft,
  Download,
  Search,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllAuditLog, type AuditEntry } from "@/lib/audit-api";

const PAGE_SIZE = 50;

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_order: "Purchase Order",
  delivery_challan: "Delivery Challan",
  invoice: "Invoice",
  grn: "GRN",
  job_card: "Job Work",
  assembly_order: "Assembly Order",
  fat_certificate: "FAT Certificate",
  sales_order: "Sales Order",
  dispatch_note: "Dispatch Note",
  item: "Item",
  party: "Party",
  payment_receipt: "Payment Receipt",
};

const DOC_TYPE_URL: Record<string, (id: string) => string> = {
  purchase_order: (id) => `/purchase-orders/${id}`,
  delivery_challan: (id) => `/delivery-challans/${id}`,
  invoice: (id) => `/invoices/${id}`,
  grn: (id) => `/grn/${id}`,
  job_card: (id) => `/job-works/${id}`,
  assembly_order: (id) => `/assembly-orders/${id}`,
  fat_certificate: (id) => `/fat-certificates/${id}`,
  sales_order: (id) => `/sales-orders/${id}`,
  dispatch_note: (id) => `/dispatch-notes/${id}`,
  party: (id) => `/parties/${id}`,
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-50 text-green-700 border-green-100",
  updated: "bg-blue-50 text-blue-700 border-blue-100",
  deleted: "bg-red-50 text-red-700 border-red-100",
  cancelled: "bg-red-50 text-red-700 border-red-100",
  issued: "bg-blue-50 text-blue-700 border-blue-100",
  completed: "bg-green-50 text-green-700 border-green-100",
  recorded: "bg-blue-50 text-blue-700 border-blue-100",
  imported: "bg-purple-50 text-purple-700 border-purple-100",
};

function detailSummary(details: Record<string, any> | null): string {
  if (!details) return "—";
  // Show a brief summary of the details object
  const keys = Object.keys(details);
  if (keys.length === 0) return "—";
  if (keys.length === 1) {
    const k = keys[0];
    const v = details[k];
    return `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80)}`;
  }
  return keys
    .slice(0, 2)
    .map((k) => {
      const v = details[k];
      return `${k}: ${typeof v === "object" ? "…" : String(v).slice(0, 40)}`;
    })
    .join(" · ");
}

export default function AuditLog() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("all");
  const [documentType, setDocumentType] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const filters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    action: action !== "all" ? action : undefined,
    documentType: documentType !== "all" ? documentType : undefined,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log-all", filters],
    queryFn: () => fetchAllAuditLog(filters),
  });

  const rows = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleExport = async () => {
    const XLSX = await import("xlsx-js-style");
    // Fetch all matching rows (no pagination)
    const all = await fetchAllAuditLog({ ...filters, page: 1, pageSize: 5000 });
    const wsData = [
      ["Timestamp", "User", "Action", "Entity Type", "Document ID", "Details"],
      ...all.data.map((row) => [
        new Date(row.created_at).toLocaleString("en-IN"),
        row.user_name || row.user_email || "—",
        row.action,
        DOC_TYPE_LABELS[row.document_type] ?? row.document_type,
        row.document_id,
        row.details ? JSON.stringify(row.details) : "—",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 38 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    XLSX.writeFile(wb, `audit_log_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Settings
      </button>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
            <p className="text-sm text-muted-foreground">All actions recorded across your workspace</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="paper-card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">Action</Label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="recorded">Recorded</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700">Entity Type</Label>
            <Select value={documentType} onValueChange={(v) => { setDocumentType(v); setPage(1); }}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleFilterChange(); }}
              placeholder="Search details..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleFilterChange}>Search</Button>
          {(dateFrom || dateTo || action !== "all" || documentType !== "all" || search) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDateFrom(""); setDateTo(""); setAction("all");
                setDocumentType("all"); setSearch(""); setSearchInput(""); setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">
            {isLoading ? "Loading…" : `${total.toLocaleString()} entries`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-1">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table text-sm">
            <thead>
              <tr>
                <th className="min-w-[160px]">Timestamp</th>
                <th className="min-w-[140px]">User</th>
                <th className="min-w-[100px]">Action</th>
                <th className="min-w-[140px]">Entity</th>
                <th>Details</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    No audit entries found
                  </td>
                </tr>
              ) : (
                rows.map((row: AuditEntry) => {
                  const docUrl = DOC_TYPE_URL[row.document_type]?.(row.document_id);
                  return (
                    <tr
                      key={row.id}
                      className={docUrl ? "cursor-pointer hover:bg-muted/40" : ""}
                      onClick={() => docUrl && navigate(docUrl)}
                    >
                      <td className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="text-xs">
                        <p className="font-medium text-foreground truncate max-w-[130px]">
                          {row.user_name || "—"}
                        </p>
                        {row.user_email && row.user_name !== row.user_email && (
                          <p className="text-muted-foreground text-[10px] truncate max-w-[130px]">
                            {row.user_email}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${ACTION_COLORS[row.action] ?? "bg-slate-50 text-slate-600 border-slate-100"}`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="text-xs">
                        <p className="font-medium text-foreground">
                          {DOC_TYPE_LABELS[row.document_type] ?? row.document_type}
                        </p>
                      </td>
                      <td className="text-xs text-muted-foreground max-w-[320px] truncate">
                        {detailSummary(row.details)}
                      </td>
                      <td>
                        {docUrl && (
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
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
