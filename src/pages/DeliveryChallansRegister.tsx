import { useState, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Truck, Plus, Search, Eye, Package, Clock, AlertTriangle, Download, Trash2, Lock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/MetricCard";
import {
  fetchDeliveryChallans,
  fetchDCStats,
  softDeleteDeliveryChallan,
  fetchPendingDCApprovals,
  fetchDCApprovalHistory,
  approveDC,
  rejectDC,
  fetchAllDCsForExport,
  fetchAllDCReturnsForExport,
  type DCFilters,
  type DcDeleteStockAction,
} from "@/lib/delivery-challans-api";
import { exportDCReport, exportDCReturnsReport } from "@/lib/export-utils";
import { ExportModal } from "@/components/ExportModal";
import { getDaysOpen, getDaysOpenClass } from "@/lib/days-open";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/useRoleAccess";

const DELETION_REASONS_DC = [
  { value: 'data_entry_error',        label: 'Data entry error' },
  { value: 'duplicate_entry',         label: 'Duplicate entry' },
  { value: 'wrong_vendor',            label: 'Wrong vendor / supplier selected' },
  { value: 'cancelled_by_management', label: 'Cancelled by management' },
  { value: 'other',                   label: 'Other (please specify)' },
];

const statusLabels: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_returned: "Partial Return",
  fully_returned: "Returned",
  cancelled: "Cancelled",
  deleted: "Deleted",
  pending_approval: "Awaiting Approval",
  rejected: "Rejected",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_returned: "status-overdue",
  fully_returned: "status-paid",
  cancelled: "status-cancelled line-through",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
  pending_approval: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  rejected: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};

const typeLabels: Record<string, string> = {
  returnable: "Returnable",
  non_returnable: "Non-Returnable",
  job_work_143: "Returnable (S.143)",
  job_work_out: "Returnable (Processing)",
  job_work_return: "Return Receipt",
  supply: "Supply",
  sample: "Sample",
  loan_borrow: "Loan/Borrow",
};

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Pending Approvals Tab ────────────────────────────────────────────────────

function PendingApprovalsTab({ profile }: { profile: any }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectDcId, setRejectDcId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: pendingDcs = [], isLoading } = useQuery({
    queryKey: ["dc-pending-approvals"],
    queryFn: fetchPendingDCApprovals,
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: (dcId: string) => {
      const approvedBy = profile?.display_name || profile?.full_name || profile?.email || "Approver";
      return approveDC(dcId, approvedBy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dc-approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-pending-approval-count"] });
      toast({ title: "DC approved", description: "Inward team can now issue it." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (dcId: string) => rejectDC(dcId, rejectReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dc-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["dc-approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-pending-approval-count"] });
      queryClient.invalidateQueries({ queryKey: ["dc-unread-rejection-count"] });
      setRejectDcId(null);
      setRejectReason("");
      toast({ title: "DC request rejected", description: "The inward team will be notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const thCls = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;

  if (pendingDcs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle className="h-7 w-7 text-green-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">All clear</h3>
        <p className="text-sm text-slate-500">No DC requests awaiting approval.</p>
      </div>
    );
  }

  return (
    <>
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${thCls} text-left`}>DC #</th>
                <th className={`${thCls} text-left`}>Party</th>
                <th className={`${thCls} text-left`}>Type</th>
                <th className={`${thCls} text-left`}>Requested By</th>
                <th className={`${thCls} text-left`}>Requested On</th>
                <th className={`${thCls} text-right`}>Waiting</th>
                <th className={`${thCls} text-center`}>Items</th>
                <th className={`${thCls} text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingDcs.map((dc) => {
                const waitDays = daysSince((dc as any).approval_requested_at);
                const isApprovingThis = approveMutation.isPending && approveMutation.variables === dc.id;
                return (
                  <tr key={dc.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left">
                      <button
                        className="font-mono font-semibold text-blue-700 hover:underline text-sm"
                        onClick={() => navigate(`/delivery-challans/${dc.id}`)}
                      >
                        {dc.dc_number}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left font-medium text-sm text-slate-800">
                      {dc.party_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left text-sm text-slate-500">
                      {typeLabels[dc.dc_type] || dc.dc_type}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left text-sm text-slate-600">
                      {(dc as any).approval_requested_by || "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left text-sm text-slate-600">
                      {(dc as any).approval_requested_at
                        ? new Date((dc as any).approval_requested_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-right font-mono tabular-nums text-sm">
                      <span className={waitDays > 3 ? "text-amber-600 font-semibold" : "text-slate-600"}>
                        {waitDays}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-center text-sm text-slate-500">
                      {(dc as any).line_item_count} item{(dc as any).line_item_count !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                      <div className="flex gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                          onClick={() => { setRejectDcId(dc.id); setRejectReason(""); }}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-700 hover:bg-green-800 text-white"
                          disabled={isApprovingThis}
                          onClick={() => approveMutation.mutate(dc.id)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" /> {isApprovingThis ? "Approving…" : "Approve"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!rejectDcId} onOpenChange={(open) => { if (!open) setRejectDcId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Reject DC Request</DialogTitle>
            <DialogDescription>Provide a reason so the inward team can correct and resubmit.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDcId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectDcId && rejectMutation.mutate(rejectDcId)}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject DC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Approval History Tab ─────────────────────────────────────────────────────

function ApprovalHistoryTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: historyDcs = [], isLoading } = useQuery({
    queryKey: ["dc-approval-history", search],
    queryFn: () => fetchDCApprovalHistory(search),
    staleTime: 30_000,
  });

  const thCls = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search DC#, party…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${thCls} text-left`}>DC #</th>
                <th className={`${thCls} text-left`}>Party</th>
                <th className={`${thCls} text-left`}>Type</th>
                <th className={`${thCls} text-center`}>Outcome</th>
                <th className={`${thCls} text-left`}>Requested By</th>
                <th className={`${thCls} text-left`}>Actioned By</th>
                <th className={`${thCls} text-left`}>Actioned On</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : historyDcs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-400">
                    No approval history yet.
                  </td>
                </tr>
              ) : (
                historyDcs.map((dc) => {
                  const wasApproved = !!(dc as any).approved_at;
                  const actionedOn = (dc as any).approved_at || null;
                  const actionedBy = (dc as any).approved_by || "—";
                  return (
                    <tr
                      key={dc.id}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/delivery-challans/${dc.id}`)}
                    >
                      <td className="px-3 py-2.5 border-b border-slate-100 text-left font-mono font-semibold text-slate-800">
                        {dc.dc_number}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-left text-slate-700">
                        {dc.party_name || "—"}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-left text-slate-500 text-sm">
                        {typeLabels[dc.dc_type] || dc.dc_type}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                        {wasApproved ? (
                          <span className="bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            Approved
                          </span>
                        ) : (
                          <div>
                            <span className="bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
                              Rejected
                            </span>
                            {(dc as any).rejection_reason && (
                              <p className="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate" title={(dc as any).rejection_reason}>
                                {(dc as any).rejection_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 text-sm">
                        {(dc as any).approval_requested_by || "—"}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 text-sm">
                        {actionedBy}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 text-sm">
                        {actionedOn
                          ? new Date(actionedOn).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
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

// ─── Error Boundary ───────────────────────────────────────────────────────────

class DCRegisterErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error('[DCRegister crash]', error, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center space-y-3">
          <p className="font-medium text-destructive">Something went wrong loading Delivery Challans.</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

function DeliveryChallansRegisterInner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, profile, companyId } = useAuth();
  const access = useRoleAccess();
  const canExport = access.canExport;
  const isInwardTeam = role === 'inward_team';
  const isApprover = role === 'admin' || role === 'finance' || role === 'purchase_team';
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [returnsExportModalOpen, setReturnsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [filters, setFilters] = useState<DCFilters>({
    search: "",
    status: "all",
    drawingNumber: "",
    page: 1,
    pageSize: 20,
  });
  const [showDeleted, setShowDeleted] = useState(false);

  // ── Deletion dialog state ─────────────────────────────────────────────────
  const [deleteTarget,       setDeleteTarget]       = useState<any>(null);
  const [deleteDialogOpen,   setDeleteDialogOpen]   = useState(false);
  const [deleteReason,       setDeleteReason]       = useState('');
  const [deleteCustomReason, setDeleteCustomReason] = useState('');
  const [deleteStockAction,  setDeleteStockAction]  = useState<DcDeleteStockAction | ''>('');

  const { data: stats } = useQuery({
    queryKey: ["dc-stats"],
    queryFn: fetchDCStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-challans", filters],
    queryFn: () => fetchDeliveryChallans(filters),
  });

  // Pending count for the tab badge (approvers only)
  const { data: pendingApprovalCount = 0 } = useQuery({
    queryKey: ["dc-pending-approval-count"],
    queryFn: async () => {
      const res = await fetchPendingDCApprovals();
      return res.length;
    },
    enabled: isApprover,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ dc, reason, stockAction }: { dc: any; reason: string; stockAction?: DcDeleteStockAction }) => {
      await softDeleteDeliveryChallan(dc.id, { deletion_reason: reason, stockAction });
      await logAudit("delivery_challan", dc.id, "deleted", { reason, stockAction });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-challans"] });
      queryClient.invalidateQueries({ queryKey: ["dc-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dc-pending-approval-count"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteReason('');
      setDeleteCustomReason('');
      setDeleteStockAction('');
      toast({ title: "DC deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const openDeleteDialog = (dc: any) => {
    setDeleteTarget(dc);
    setDeleteReason('');
    setDeleteCustomReason('');
    setDeleteStockAction('');
    setDeleteDialogOpen(true);
  };

  const getDCFinalReason = () =>
    deleteReason === 'other'
      ? deleteCustomReason.trim()
      : DELETION_REASONS_DC.find(r => r.value === deleteReason)?.label ?? deleteReason;

  const handleConfirmDeleteDC = () => {
    if (!deleteTarget || !deleteReason) return;
    if (deleteReason === 'other' && !deleteCustomReason.trim()) return;
    const isIssued = deleteTarget.status === 'issued';
    const canDeleteIssued = access.canEdit;
    if (isIssued && canDeleteIssued && !deleteStockAction) return;
    deleteMutation.mutate({
      dc: deleteTarget,
      reason: getDCFinalReason(),
      stockAction: (isIssued && canDeleteIssued && deleteStockAction) ? deleteStockAction : undefined,
    });
  };

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

  // ── Shared header ─────────────────────────────────────────────────────────
  const pageHeader = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">DC / Job Work Orders</h1>
        <p className="text-sm text-slate-500 mt-1">Track outgoing material and returns</p>
      </div>
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        {canExport && (
          <>
            <Button variant="outline" onClick={() => setExportModalOpen(true)}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button variant="outline" onClick={() => setReturnsExportModalOpen(true)}>
              <Download className="h-4 w-4 mr-1" /> Export DC Returns
            </Button>
          </>
        )}
        {access.canEdit && (
          <Button onClick={() => navigate("/delivery-challans/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New DC
          </Button>
        )}
      </div>
    </div>
  );

  // ── Summary cards ─────────────────────────────────────────────────────────
  const summaryCards = (
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
  );

  // ── All DCs table ─────────────────────────────────────────────────────────
  const allDCsContent = (
    <div className="space-y-3">
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Drawing No..."
            value={filters.drawingNumber ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, drawingNumber: e.target.value, page: 1 }))}
            className="pl-9 w-40 dark:bg-[#0a0e1a] dark:border-white/20"
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
            <SelectItem value="pending_approval">Awaiting Approval</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
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
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Party</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Type</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Items</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Return Due</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td>
                </tr>
              ) : dcs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">
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
                  // Inward team: show "Approved — Ready to Issue" for approved drafts
                  const isApprovedDraft = isInwardTeam && dc.status === "draft" && !!(dc as any).approved_at;
                  return (
                    <tr
                      key={dc.id}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${overdue || rule45Status === "overdue" ? "bg-destructive/5" : ""} ${isDeleted ? "opacity-50" : ""}`}
                      onClick={() => !isDeleted && navigate(`/delivery-challans/${dc.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{dc.dc_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {new Date(dc.dc_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{dc.party_name || "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        <span className="text-muted-foreground">{typeLabels[dc.dc_type] || dc.dc_type}</span>
                        {rule45Status === "overdue" && (
                          <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">R45 OVERDUE</span>
                        )}
                        {rule45Status === "warning" && (
                          <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">R45 DUE SOON</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{dc.total_items}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                        {dc.return_due_date ? (
                          <span className={overdue ? "text-destructive font-medium" : ""}>
                            {new Date(dc.return_due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            {overdue && " ⚠"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {isApprovedDraft ? (
                          <span className="bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            Approved — Ready to Issue
                          </span>
                        ) : (
                          <span className={statusClass[dc.status] || "status-draft"}>
                            {overdue && dc.status !== "cancelled" ? "Overdue" : statusLabels[dc.status] || dc.status}
                          </span>
                        )}
                        {isInwardTeam && dc.status === "rejected" && (dc as any).rejection_reason && !(dc as any).rejection_noted && (
                          <span className="block text-[10px] text-red-600 font-medium mt-0.5">New rejection</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {days !== null ? <span className={daysClass}>{days}d</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/delivery-challans/${dc.id}`)}>
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      {pageHeader}
      {summaryCards}

      {isApprover ? (
        <Tabs defaultValue="all">
          <TabsList className="mb-1">
            <TabsTrigger value="all">All DCs</TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-1.5">
              Pending Approvals
              {pendingApprovalCount > 0 && (
                <span className="inline-flex items-center justify-center h-4.5 min-w-[1.25rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                  {pendingApprovalCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Approval History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            {allDCsContent}
          </TabsContent>

          <TabsContent value="pending" className="mt-3">
            <PendingApprovalsTab profile={profile} />
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <ApprovalHistoryTab />
          </TabsContent>
        </Tabs>
      ) : (
        allDCsContent
      )}

      {/* ── DC Deletion Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeleteTarget(null); } }}>
        <DialogContent className="max-w-md">
          {(() => {
            if (!deleteTarget) return null;
            const isIssued = deleteTarget.status === 'issued';
            const canDelete = !isIssued || access.canEdit;

            if (isIssued && !canDelete) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <Lock className="h-4 w-4" /> Delete DC — Restricted
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      This DC has been issued and stock has been moved to the vendor. Only administrators or purchase team can delete it.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Close</Button>
                  </DialogFooter>
                </>
              );
            }

            const needsStockAction = isIssued && canDelete;
            const isOther = deleteReason === 'other';
            const isConfirmEnabled =
              !!deleteReason &&
              (!isOther || !!deleteCustomReason.trim()) &&
              (!needsStockAction || !!deleteStockAction);

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-destructive">
                    {needsStockAction ? 'Delete DC — Stock Action Required' : 'Delete DC'}
                  </DialogTitle>
                  {needsStockAction && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Stock was moved when this DC was issued. How should we handle it?
                    </p>
                  )}
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Reason for deletion <span className="text-destructive">*</span></label>
                    <Select value={deleteReason} onValueChange={setDeleteReason}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                      <SelectContent>
                        {DELETION_REASONS_DC.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isOther && (
                      <Input placeholder="Please specify…" value={deleteCustomReason} onChange={e => setDeleteCustomReason(e.target.value)} className="h-9 text-sm mt-1.5" />
                    )}
                  </div>

                  {needsStockAction && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Stock action <span className="text-destructive">*</span></label>
                      {([
                        { value: 'recalled',          label: 'DC recalled — goods never left the store', desc: 'Returns stock from vendor bucket back to store' },
                        { value: 'immediate_return',  label: 'Vendor returned goods immediately',         desc: 'Returns stock from vendor bucket back to store' },
                        { value: 'write_off',         label: 'Stock written off — goods lost/damaged',    desc: 'Removes from vendor bucket, not returned to store' },
                      ] as { value: DcDeleteStockAction; label: string; desc: string }[]).map(opt => (
                        <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${deleteStockAction === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                          <input type="radio" name="dcStockAction" value={opt.value} checked={deleteStockAction === opt.value} onChange={() => setDeleteStockAction(opt.value)} className="mt-0.5" />
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
                  <Button variant="destructive" onClick={handleConfirmDeleteDC} disabled={!isConfirmEnabled || deleteMutation.isPending}>
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
        docType="Delivery Challans"
        isExporting={isExporting}
        onExport={async (dateFrom, dateTo, includeLineItems) => {
          if (!companyId) {
            toast({ title: "Cannot export", description: "Account not linked to a company.", variant: "destructive" });
            return;
          }
          setIsExporting(true);
          try {
            const data = await fetchAllDCsForExport(dateFrom, dateTo, companyId);
            exportDCReport(data, includeLineItems, dateFrom, dateTo);
            setExportModalOpen(false);
            toast({ title: "Export ready", description: `${data.length} delivery challans exported.` });
          } catch (e: any) {
            toast({ title: "Export failed", description: e?.message ?? "Unknown error", variant: "destructive" });
          } finally {
            setIsExporting(false);
          }
        }}
      />

      <ExportModal
        open={returnsExportModalOpen}
        onClose={() => setReturnsExportModalOpen(false)}
        docType="DC Returns"
        isExporting={isExporting}
        onExport={async (dateFrom, dateTo, includeLineItems) => {
          if (!companyId) {
            toast({ title: "Cannot export", description: "Account not linked to a company.", variant: "destructive" });
            return;
          }
          setIsExporting(true);
          try {
            const data = await fetchAllDCReturnsForExport(dateFrom, dateTo, companyId);
            exportDCReturnsReport(data, includeLineItems, dateFrom, dateTo);
            setReturnsExportModalOpen(false);
            toast({ title: "Export ready", description: `${data.length} DCs with returns exported.` });
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

export default function DeliveryChallansRegister() {
  return (
    <DCRegisterErrorBoundary>
      <DeliveryChallansRegisterInner />
    </DCRegisterErrorBoundary>
  );
}
