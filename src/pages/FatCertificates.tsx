import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Search, Clock, CheckCircle2, XCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFatCertificates, fetchFatStats } from "@/lib/fat-api";
import { fetchItems } from "@/lib/items-api";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  pending: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  passed: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  failed: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  conditional: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  conditional: "Conditional",
};

export default function FatCertificates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canEdit } = useRoleAccess();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ["fat-stats"],
    queryFn: fetchFatStats,
    refetchInterval: 60000,
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items", { type: "finished_good", status: "active" }],
    queryFn: () => fetchItems({ type: "finished_good", status: "active", pageSize: 200 }),
    staleTime: 5 * 60 * 1000,
  });
  const finishedGoodItems = itemsData?.data ?? [];

  const { data, isLoading, isError } = useQuery({
    queryKey: ["fat-certificates", statusFilter, itemFilter, search, page],
    queryFn: () => fetchFatCertificates({
      search,
      status: statusFilter,
      item_id: itemFilter === "all" ? undefined : itemFilter,
      page,
      pageSize: 20,
    }),
    refetchInterval: 30000,
  });

  const certs = data?.data ?? [];
  const total = data?.count ?? 0;
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">FAT Certificates</h1>
          <p className="text-sm text-slate-500 mt-1">Factory Acceptance Test records</p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              toast({ title: "Select a serial number to create a FAT certificate" });
              navigate("/serial-numbers");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New FAT Certificate
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Pending"
          value={String(stats?.pending ?? "—")}
          icon={Clock}
          className={(stats?.pending ?? 0) > 0 ? "border-l-4 border-l-amber-500 bg-amber-50/30" : "border-l-4 border-l-green-500"}
        />
        <MetricCard
          title="Passed"
          value={String(stats?.passed ?? "—")}
          icon={CheckCircle2}
          className="border-l-4 border-l-green-500"
        />
        <MetricCard
          title="Failed"
          value={String(stats?.failed ?? "—")}
          icon={XCircle}
          className={(stats?.failed ?? 0) > 0 ? "border-l-4 border-l-red-500 bg-red-50/30" : "border-l-4 border-l-slate-200"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search FAT number, item, serial, customer..."
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="conditional">Conditional</SelectItem>
          </SelectContent>
        </Select>
        {finishedGoodItems.length > 0 && (
          <Select value={itemFilter} onValueChange={(v) => { setItemFilter(v); setPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Items" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              {finishedGoodItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.item_code} — {item.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="paper-card !p-0 overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Unable to load FAT certificates</p>
            <p className="text-xs text-muted-foreground mt-1">The database table may not be set up yet. Run the Phase 8 migration to enable this feature.</p>
          </div>
        ) : certs.length === 0 ? (
          <div className="py-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No FAT certificates found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create FAT certificates from the Serial Numbers page.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate("/serial-numbers")}
            >
              Go to Serial Numbers
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">FAT Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Test Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => (
                <tr
                  key={cert.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/fat-certificates/${cert.id}`)}
                >
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{cert.fat_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <p className="font-medium text-sm">{cert.item_description ?? "—"}</p>
                    {cert.item_code && (
                      <p className="font-mono text-xs text-muted-foreground">{cert.item_code}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{cert.serial_number ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{cert.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    {cert.test_date
                      ? format(new Date(cert.test_date), "dd MMM yyyy")
                      : cert.fat_date
                      ? format(new Date(cert.fat_date), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={statusClass[cert.status] || "status-draft"}>
                      {statusLabels[cert.status] ?? cert.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/fat-certificates/${cert.id}`); }}
                    >
                      {cert.status === "draft" ? "Edit Draft" : cert.status === "pending" ? "Enter Results" : "View"}
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
