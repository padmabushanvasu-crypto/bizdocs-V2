import { useState, useMemo, Component, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Plus, Search, Eye, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDcGrns, softDeleteGRN, type GRNFilters } from "@/lib/grn-api";
import { useToast } from "@/hooks/use-toast";

class DcGrnErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
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
          <p className="text-destructive font-medium">Something went wrong loading DC Returns.</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>Retry</Button>
            <Button variant="ghost" onClick={() => { window.location.href = "/dashboard"; }}>Go to Dashboard</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Open",
  recorded: "Partially Complete",
  verified: "Complete",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  recorded: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  verified: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};

function daysOpen(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function DcGrnInner() {
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

  const [showDeleted, setShowDeleted] = useState(false);

  const [filters, setFilters] = useState<GRNFilters>({
    search: "",
    status: "all",
    month: monthOptions[0].value,
    page: 1,
    pageSize: 25,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dc-grns", filters, showDeleted],
    queryFn: () => fetchDcGrns({ ...filters, showDeleted }),
  });

  const grns = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await softDeleteGRN(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-grns"] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["grn-stats"] });
      // Sidebar badges that read from grns / grn_line_items.
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-count"] });
      queryClient.invalidateQueries({ queryKey: ["grn-qc-count-sidebar"] });
      queryClient.invalidateQueries({ queryKey: ["dc-return-qc-count-sidebar"] });
      toast({ title: "DC-GRN deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">DC Returns — Goods Returned from Vendors</h1>
          <p className="text-sm text-slate-500 mt-1">GRNs for goods returning from job work / delivery challans</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showDeleted ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowDeleted(v => !v)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {showDeleted ? "Hide Deleted" : "Show Deleted"}
          </Button>
          <Button onClick={() => navigate("/dc-grn/new")} className="active:scale-[0.98] transition-transform flex-shrink-0">
            <Plus className="h-4 w-4 mr-1" /> New DC-GRN
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search GRN#, vendor, DC#..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select value={filters.month ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, month: v === "all" ? undefined : v, page: 1 }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC Return #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vendor / Party</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Items</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">GRN Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td>
                </tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                    <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No DC-GRNs yet</p>
                    <p className="text-sm text-muted-foreground">Record goods returned from vendors</p>
                  </td>
                </tr>
              ) : (
                grns.map((grn) => {
                  const g = grn as any;
                  const isDeletedRow = grn.status === 'deleted';
                  return (
                    <tr
                      key={grn.id}
                      className={`hover:bg-muted/50 transition-colors ${isDeletedRow ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
                      onClick={() => !isDeletedRow && navigate(`/dc-grn/${grn.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {g.linked_dc_number ? (
                          <button
                            className="font-mono text-sm font-medium text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (g.linked_dc_id) navigate(`/delivery-challans/${g.linked_dc_id}`);
                            }}
                          >
                            {g.linked_dc_number}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{grn.grn_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{grn.vendor_name || "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {(g as any).items_count ?? (g as any).line_items_count ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {isDeletedRow ? (
                          <span className="bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full">Deleted</span>
                        ) : (
                          <span className={STATUS_CLASS[grn.status] || STATUS_CLASS.draft}>
                            {STATUS_LABEL[grn.status] || grn.status}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {grn.status !== "verified" ? `${daysOpen(grn.grn_date)}d` : <span className="text-green-600 font-medium">Done</span>}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/dc-grn/${grn.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Pagination footer — "Per page" always visible; prev/next only when count exceeds pageSize */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Per page</span>
          <Select
            value={String(filters.pageSize ?? 25)}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, pageSize: Number(v), page: 1 }))
            }
          >
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(data?.count ?? 0) > (filters.pageSize ?? 25) && (
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">
              Page {filters.page} of {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 25))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page ?? 1) * (filters.pageSize ?? 25) >= (data?.count ?? 0)}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DcGrn() {
  return (
    <DcGrnErrorBoundary>
      <DcGrnInner />
    </DcGrnErrorBoundary>
  );
}
