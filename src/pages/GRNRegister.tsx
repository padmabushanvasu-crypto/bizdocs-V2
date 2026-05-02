import { useState, useMemo, useEffect, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PackageCheck, Plus, Search, Eye, ClipboardCheck, AlertTriangle, Package, Download, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MetricCard } from "@/components/MetricCard";
import { fetchGRNs, fetchGRNStats, softDeleteGRN, fetchPendingQCGRNs, fetchAllGRNsForExport, type GRNFilters, type GrnDeleteStockAction } from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";
import { exportGRNReport } from "@/lib/export-utils";
import { ExportModal } from "@/components/ExportModal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/useRoleAccess";

const DELETION_REASONS = [
  { value: 'data_entry_error',        label: 'Data entry error' },
  { value: 'duplicate_entry',         label: 'Duplicate entry' },
  { value: 'wrong_vendor',            label: 'Wrong vendor / supplier selected' },
  { value: 'cancelled_by_management', label: 'Cancelled by management' },
  { value: 'other',                   label: 'Other (please specify)' },
];

const COMPLETED_GRN_STAGES = new Set(['quality_done', 'awaiting_store', 'closed']);

const stageConfig: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  draft:                          { label: 'Draft',             cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
  quantitative_pending:           { label: 'Awaiting Receipt',  cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  quantitative_done:              { label: 'Receipt Done',      cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
  quality_pending:                { label: 'Awaiting QC',       cls: 'bg-amber-50 text-amber-700 border border-amber-200', pulse: true },
  quality_done:                   { label: 'QC Done',           cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
  awaiting_store:                 { label: '📦 Awaiting Store', cls: 'bg-orange-50 text-orange-700 border border-orange-200', pulse: true },
  closed_fully_accepted:          { label: '✓ Fully Accepted',  cls: 'bg-green-50 text-green-700 border border-green-200' },
  closed_conditionally_accepted:  { label: '⚠ Conditional',    cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  closed_partially_returned:      { label: '↩ Partial Return',  cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  closed_returned:                { label: '✗ Returned',        cls: 'bg-red-50 text-red-700 border border-red-200' },
};

function StageBadge({ grn }: { grn: any }) {
  const stage = (grn.grn_stage ?? grn.status ?? 'draft') as string;
  let key = stage;
  if (stage === 'closed' && grn.overall_quality_verdict) key = `closed_${grn.overall_quality_verdict}`;
  const cfg = stageConfig[key] ?? stageConfig['draft'];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.pulse && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
      {cfg.label}
    </span>
  );
}

class GrnRegisterErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error('[GRNRegister crash]', error, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="font-medium text-destructive">Something went wrong loading Goods Receipt Notes.</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <button className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors" onClick={() => this.setState({ error: null })}>Retry</button>
            <a href="/" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">Go to Dashboard</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const STAGE_PILLS = [
  { label: 'All',              value: 'all' },
  { label: 'Awaiting Receipt', value: 'quantitative_pending' },
  { label: 'Awaiting QC',      value: 'quality_pending' },
  { label: 'Awaiting Store',   value: 'awaiting_store' },
  { label: 'Accepted',         value: 'closed_accepted' },
  { label: 'Non-Conforming',   value: 'closed_nonconforming' },
];

function GRNRegisterInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, companyId } = useAuth();
  const { canExport } = useRoleAccess();

  // ── Deletion dialog state ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteCustomReason, setDeleteCustomReason] = useState('');
  const [deleteStockAction, setDeleteStockAction] = useState<GrnDeleteStockAction | ''>('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') ?? 'all');
  const [filters, setFilters] = useState<GRNFilters>({
    search: "",
    status: "all",
    month: monthOptions[0].value,
    page: 1,
    pageSize: 20,
  });

  // qc_team default: remove month restriction so quality_pending GRNs are always visible,
  // and pre-select the "Awaiting QC" stage pill. Runs once when role resolves from auth.
  useEffect(() => {
    if (role === 'qc_team') {
      setFilters(f => ({ ...f, month: undefined }));
      setStageFilter(prev => prev === 'all' ? 'quality_pending' : prev);
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteMutation = useMutation({
    mutationFn: async ({ grn, reason, stockAction }: { grn: any; reason: string; stockAction?: GrnDeleteStockAction }) => {
      await softDeleteGRN(grn.id, { deletion_reason: reason, stockAction });
      await logAudit("grn", grn.id, "deleted", { reason, stockAction });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      queryClient.invalidateQueries({ queryKey: ["grn-stats"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteReason('');
      setDeleteCustomReason('');
      setDeleteStockAction('');
      toast({ title: "GRN deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openDeleteDialog = (grn: any) => {
    setDeleteTarget(grn);
    setDeleteReason('');
    setDeleteCustomReason('');
    setDeleteStockAction('');
    setDeleteDialogOpen(true);
  };

  const getFinalReason = () =>
    deleteReason === 'other'
      ? deleteCustomReason.trim()
      : DELETION_REASONS.find(r => r.value === deleteReason)?.label ?? deleteReason;

  const handleConfirmDelete = () => {
    if (!deleteTarget || !deleteReason) return;
    if (deleteReason === 'other' && !deleteCustomReason.trim()) return;
    const isCompleted = COMPLETED_GRN_STAGES.has(deleteTarget.grn_stage);
    const canDeleteCompleted = role === 'admin' || role === 'finance' || role === 'storekeeper';
    if (isCompleted && canDeleteCompleted && !deleteStockAction) return;
    const finalReason = getFinalReason();
    deleteMutation.mutate({
      grn: deleteTarget,
      reason: finalReason,
      stockAction: (isCompleted && canDeleteCompleted && deleteStockAction) ? deleteStockAction : undefined,
    });
  };

  const { data: stats } = useQuery({ queryKey: ["grn-stats"], queryFn: fetchGRNStats });
  const { data: pendingQC = [] } = useQuery({ queryKey: ["pending-qc-grns"], queryFn: fetchPendingQCGRNs });

  // Build effective filters including stage filter
  const effectiveFilters = useMemo(() => {
    const f = { ...filters };
    if (stageFilter === 'quantitative_pending') (f as any).grn_stage = 'quantitative_pending';
    else if (stageFilter === 'quality_pending') (f as any).grn_stage = 'quality_pending';
    else if (stageFilter === 'awaiting_store') (f as any).grn_stage = 'awaiting_store';
    else if (stageFilter === 'closed_accepted') (f as any).grn_stage = 'closed';
    else if (stageFilter === 'closed_nonconforming') (f as any).grn_stage = 'closed';
    else delete (f as any).grn_stage;
    return f;
  }, [filters, stageFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["grns", effectiveFilters],
    queryFn: () => fetchGRNs(effectiveFilters),
  });

  const grns = useMemo(() => {
    const allGrns = data?.data ?? [];
    let list = showDeleted
      ? allGrns
      : allGrns.filter((g: any) => g.status !== "deleted" && g.grn_stage !== "cancelled");
    if (stageFilter === 'closed_accepted') {
      list = list.filter(g => (g as any).overall_quality_verdict === 'fully_accepted');
    } else if (stageFilter === 'closed_nonconforming') {
      list = list.filter(g => ['conditionally_accepted','partially_returned','returned'].includes((g as any).overall_quality_verdict ?? ''));
    }
    return list;
  }, [data, stageFilter, showDeleted]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Goods Receipt Notes</h1>
          <p className="text-sm text-slate-500 mt-1">Record incoming material against POs</p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant={showDeleted ? "secondary" : "outline"} size="sm" onClick={() => setShowDeleted(d => !d)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {showDeleted ? "Hide Deleted" : "Show Deleted"}
          </Button>
          {canExport && (
            <Button variant="outline" onClick={() => setExportModalOpen(true)}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
          <Button onClick={() => navigate("/grn/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New GRN
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="GRNs This Month" value={String(stats?.totalThisMonth ?? 0)} icon={PackageCheck} />
        <MetricCard title="Items Accepted" value={String(stats?.totalAccepted ?? 0)} icon={Package} />
        <MetricCard title="Non-Conforming Items" value={String(stats?.totalRejected ?? 0)} icon={AlertTriangle} className={stats?.totalRejected ? "border-destructive/30" : ""} />
        <MetricCard title="Awaiting QC" value={String(pendingQC.length)} icon={ClipboardCheck} className={pendingQC.length > 0 ? "border-amber-300 bg-amber-50/30" : ""} />
      </div>

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {STAGE_PILLS.map(pill => (
          <button
            key={pill.value}
            onClick={() => setStageFilter(pill.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              stageFilter === pill.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {pill.label}
            {pill.value === 'quality_pending' && pendingQC.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1 py-0.5 rounded-full">{pendingQC.length}</span>
            )}
          </button>
        ))}
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
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all_months__">All months</SelectItem>
            {monthOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">GRN #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vendor</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Linked PO</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Accepted</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Non-Conforming</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Stage</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                    <PackageCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No GRNs found</p>
                  </td>
                </tr>
              ) : (
                grns.map((grn) => {
                  const isDeleted = (grn as any).status === 'deleted';
                  return (
                    <tr key={grn.id} className={`hover:bg-muted/50 transition-colors ${isDeleted ? 'opacity-50' : 'cursor-pointer'}`} onClick={() => !isDeleted && navigate(`/grn/${grn.id}`)}>
                      <td className={`px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium ${isDeleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{grn.grn_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{grn.vendor_name || "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {grn.po_number ? (
                          <button className="font-mono text-xs text-primary hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/purchase-orders/${grn.po_id}`); }}>
                            {grn.po_number}
                          </button>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{grn.total_accepted}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {grn.total_rejected > 0 ? <span className="text-destructive font-medium">{grn.total_rejected}</span> : grn.total_rejected}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {isDeleted
                          ? <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 line-through">Deleted</span>
                          : <StageBadge grn={grn} />
                        }
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/grn/${grn.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
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

      {(data?.count ?? 0) > (filters.pageSize ?? 20) && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={(filters.page ?? 1) <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>Previous</Button>
          <span className="text-sm text-muted-foreground flex items-center px-2">Page {filters.page} of {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 20))}</span>
          <Button variant="outline" size="sm" disabled={(filters.page ?? 1) * (filters.pageSize ?? 20) >= (data?.count ?? 0)} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Next</Button>
        </div>
      )}

      {/* ── GRN Deletion Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
        <DialogContent className="max-w-md">
          {(() => {
            if (!deleteTarget) return null;
            const isCompleted = COMPLETED_GRN_STAGES.has(deleteTarget.grn_stage);
            const canDelete = !isCompleted || role === 'admin' || role === 'finance' || role === 'storekeeper';

            if (isCompleted && !canDelete) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <Lock className="h-4 w-4" /> Delete GRN — Restricted
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      This GRN has completed QC and stock has been credited. Only administrators or storekeepers can delete it. Please contact your supervisor.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Close</Button>
                  </DialogFooter>
                </>
              );
            }

            const needsStockAction = isCompleted && canDelete;
            const reasonLabel = DELETION_REASONS.find(r => r.value === deleteReason)?.label ?? '';
            const isOther = deleteReason === 'other';
            const isConfirmEnabled =
              !!deleteReason &&
              (!isOther || !!deleteCustomReason.trim()) &&
              (!needsStockAction || !!deleteStockAction);

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-destructive">
                    {needsStockAction ? 'Delete GRN — Stock Action Required' : 'Delete GRN'}
                  </DialogTitle>
                  {needsStockAction && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Stock has already been credited for this GRN. How should we handle it?
                    </p>
                  )}
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Reason for deletion <span className="text-destructive">*</span></label>
                    <Select value={deleteReason} onValueChange={setDeleteReason}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                      <SelectContent>
                        {DELETION_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isOther && (
                      <Input
                        placeholder="Please specify…"
                        value={deleteCustomReason}
                        onChange={e => setDeleteCustomReason(e.target.value)}
                        className="h-9 text-sm mt-1.5"
                      />
                    )}
                  </div>

                  {needsStockAction && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Stock action <span className="text-destructive">*</span></label>
                      {([
                        { value: 'return_to_vendor', label: 'Goods returned to vendor', desc: 'Reverses stock that was credited to store' },
                        { value: 'duplicate_reverse', label: 'Duplicate GRN entry — reverse stock', desc: 'Reverses duplicate stock credit' },
                        { value: 'keep_stock',        label: 'Keep stock — GRN entry was incorrect', desc: 'Stock stays in store; only the GRN record is removed' },
                      ] as { value: GrnDeleteStockAction; label: string; desc: string }[]).map(opt => (
                        <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${deleteStockAction === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <input type="radio" name="grnStockAction" value={opt.value} checked={deleteStockAction === opt.value} onChange={() => setDeleteStockAction(opt.value)} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>Go Back</Button>
                  <Button variant="destructive" onClick={handleConfirmDelete} disabled={!isConfirmEnabled || deleteMutation.isPending}>
                    {deleteMutation.isPending ? 'Deleting…' : 'Confirm Deletion'}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        docType="GRNs"
        isExporting={isExporting}
        onExport={async (dateFrom, dateTo, includeLineItems) => {
          if (!companyId) {
            toast({ title: "Cannot export", description: "Account not linked to a company.", variant: "destructive" });
            return;
          }
          setIsExporting(true);
          try {
            const data = await fetchAllGRNsForExport(dateFrom, dateTo, companyId);
            exportGRNReport(data, includeLineItems, dateFrom, dateTo);
            setExportModalOpen(false);
            toast({ title: "Export ready", description: `${data.length} GRNs exported.` });
          } catch (e: any) {
            toast({ title: "Export failed", description: e?.message ?? "Unknown error", variant: "destructive" });
          } finally {
            setIsExporting(false);
          }
        }}
      />
    </div>
  );
}

export default function GRNRegister() {
  return (
    <GrnRegisterErrorBoundary>
      <GRNRegisterInner />
    </GrnRegisterErrorBoundary>
  );
}
