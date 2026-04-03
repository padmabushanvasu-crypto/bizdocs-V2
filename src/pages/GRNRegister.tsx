import { useState, useMemo, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, Plus, Search, Eye, ClipboardCheck, AlertTriangle, Package, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { fetchGRNs, fetchGRNStats, softDeleteGRN, type GRNFilters } from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";
import { exportToExcel, GRN_EXPORT_COLS } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  recorded: "Recorded",
  verified: "Verified",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  recorded: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  verified: "status-paid",
};

// ── Error boundary ─────────────────────────────────────────────────────────────

class GrnRegisterErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="font-medium text-destructive">
            Something went wrong loading Goods Receipt Notes.
          </p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <button
              className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function GRNRegisterInner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const [filters, setFilters] = useState<GRNFilters>({
    search: "",
    status: "all",
    month: monthOptions[0].value,
    page: 1,
    pageSize: 20,
  });

  const deleteMutation = useMutation({
    mutationFn: async (grn: any) => {
      await softDeleteGRN(grn.id);
      await logAudit("grn", grn.id, "deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["grn-stats"] });
      toast({ title: "GRN deleted" });
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["grn-stats"],
    queryFn: fetchGRNStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["grns", filters],
    queryFn: () => fetchGRNs(filters),
  });

  const grns = data?.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Goods Receipt Notes</h1>
          <p className="text-sm text-slate-500 mt-1">Record incoming material against POs</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => exportToExcel(grns, GRN_EXPORT_COLS, `GRNs_${new Date().toISOString().split("T")[0]}.xlsx`, "GRNs")} disabled={grns.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => navigate("/grn/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New GRN
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="GRNs This Month" value={String(stats?.totalThisMonth ?? 0)} icon={PackageCheck} />
        <MetricCard title="Items Accepted" value={String(stats?.totalAccepted ?? 0)} icon={Package} />
        <MetricCard
          title="Items Rejected"
          value={String(stats?.totalRejected ?? 0)}
          icon={AlertTriangle}
          className={stats?.totalRejected ? "border-destructive/30" : ""}
        />
        <MetricCard title="Pending Verification" value={String(stats?.pendingVerification ?? 0)} icon={ClipboardCheck} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search GRN#, vendor, PO#..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select value={filters.month ?? "__all_months__"} onValueChange={(v) => setFilters((f) => ({ ...f, month: v === "__all_months__" ? undefined : v, page: 1 }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all_months__">All months</SelectItem>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="recorded">Recorded</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full data-table">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>GRN #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Linked PO</th>
                <th className="text-right">Accepted</th>
                <th className="text-right">Rejected</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No GRNs yet</p>
                    <p className="text-sm text-muted-foreground">Record your first goods receipt</p>
                  </td>
                </tr>
              ) : (
                grns.map((grn) => (
                  <tr
                    key={grn.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/grn/${grn.id}`)}
                  >
                    <td className="font-mono text-sm font-medium text-foreground">{grn.grn_number}</td>
                    <td className="text-muted-foreground">
                      {new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="font-medium">{grn.vendor_name || "—"}</td>
                    <td>
                      {grn.po_number ? (
                        <button
                          className="font-mono text-xs text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/purchase-orders/${grn.po_id}`);
                          }}
                        >
                          {grn.po_number}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums">{grn.total_accepted}</td>
                    <td className="text-right font-mono tabular-nums">
                      {grn.total_rejected > 0 ? (
                        <span className="text-destructive font-medium">{grn.total_rejected}</span>
                      ) : (
                        grn.total_rejected
                      )}
                    </td>
                    <td>
                      <span className={statusClass[grn.status] || "status-draft"}>
                        {statusLabels[grn.status] || grn.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/grn/${grn.id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={grn.status === "deleted"}
                          onClick={() => deleteMutation.mutate(grn)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
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

// ── Export ─────────────────────────────────────────────────────────────────────

export default function GRNRegister() {
  return (
    <GrnRegisterErrorBoundary>
      <GRNRegisterInner />
    </GrnRegisterErrorBoundary>
  );
}
