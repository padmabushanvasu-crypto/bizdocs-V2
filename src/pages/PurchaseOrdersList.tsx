import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, Search, Eye, FileText, Package, Download, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/MetricCard";
import {
  fetchPurchaseOrders,
  fetchPOStats,
  fetchPendingApprovals,
  fetchApprovalHistory,
  softDeletePurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  fetchAllPOsForExport,
  type POFilters,
} from "@/lib/purchase-orders-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportPOReport } from "@/lib/export-utils";
import { ExportModal } from "@/components/ExportModal";
import { getDaysOpen, getDaysOpenClass } from "@/lib/days-open";
import { logAudit } from "@/lib/audit-api";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useAuth } from "@/hooks/useAuth";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  issued: "Issued",
  partially_received: "Partial",
  fully_received: "Received",
  cancelled: "Cancelled",
  closed: "Closed",
  deleted: "Deleted",
  pending_approval: "Pending Approval",
  rejected: "Rejected",
};

const statusClass: Record<string, string> = {
  draft: "status-draft",
  approved: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  issued: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_received: "status-overdue",
  fully_received: "status-paid",
  cancelled: "status-cancelled line-through",
  closed: "status-draft",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
  pending_approval: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  rejected: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Pending Approvals Tab ────────────────────────────────────────────────────

function PendingApprovalsTab({ hideCosts, profile }: { hideCosts: boolean; profile: any }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectPoId, setRejectPoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: pendingPos = [], isLoading } = useQuery({
    queryKey: ["po-pending-approvals"],
    queryFn: fetchPendingApprovals,
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: (poId: string) => {
      const approvedBy = profile?.display_name || profile?.full_name || profile?.email || "Finance";
      return approvePurchaseOrder(poId, approvedBy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["po-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["po-approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-pending-approval-count"] });
      toast({ title: "PO approved", description: "PO moved to draft — purchase team can now issue it." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (poId: string) => rejectPurchaseOrder(poId, rejectReason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["po-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["po-approval-history"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-pending-approval-count"] });
      queryClient.invalidateQueries({ queryKey: ["po-unread-rejection-count"] });
      setRejectPoId(null);
      setRejectReason("");
      toast({ title: "PO rejected", description: "The purchase team will be notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const thCls = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;

  if (pendingPos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle className="h-7 w-7 text-green-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">All clear</h3>
        <p className="text-sm text-slate-500">No purchase orders awaiting approval.</p>
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
                <th className={`${thCls} text-left`}>PO #</th>
                <th className={`${thCls} text-left`}>Vendor</th>
                {!hideCosts && <th className={`${thCls} text-right`}>Value</th>}
                <th className={`${thCls} text-left`}>Requested By</th>
                <th className={`${thCls} text-left`}>Requested On</th>
                <th className={`${thCls} text-right`}>Waiting</th>
                <th className={`${thCls} text-center`}>Items</th>
                <th className={`${thCls} text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingPos.map((po) => {
                const waitDays = daysSince(po.approval_requested_at);
                const isApprovingThis = approveMutation.isPending && approveMutation.variables === po.id;
                return (
                  <tr
                    key={po.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left">
                      <button
                        className="font-mono font-semibold text-blue-700 hover:underline text-sm"
                        onClick={() => navigate(`/purchase-orders/${po.id}`)}
                      >
                        {po.po_number}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left font-medium text-sm text-slate-800">
                      {po.vendor_name || "—"}
                    </td>
                    {!hideCosts && (
                      <td className="px-3 py-2.5 border-b border-slate-100 text-right font-mono tabular-nums text-sm">
                        {formatCurrency(po.grand_total)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left text-sm text-slate-600">
                      {po.approval_requested_by || "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-left text-sm text-slate-600">
                      {po.approval_requested_at
                        ? new Date(po.approval_requested_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-right font-mono tabular-nums text-sm">
                      <span className={waitDays > 3 ? "text-amber-600 font-semibold" : "text-slate-600"}>
                        {waitDays}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-center text-sm text-slate-500">
                      {po.line_item_count} item{po.line_item_count !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2.5 border-b border-slate-100 text-center">
                      <div className="flex gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                          onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-700 hover:bg-green-800 text-white"
                          disabled={isApprovingThis}
                          onClick={() => approveMutation.mutate(po.id)}
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

      {/* Reject Dialog */}
      <Dialog open={!!rejectPoId} onOpenChange={(open) => { if (!open) setRejectPoId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Reject Purchase Order</DialogTitle>
            <DialogDescription>Provide a reason so the purchase team can correct and resubmit.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectPoId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectPoId && rejectMutation.mutate(rejectPoId)}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Approval History Tab ─────────────────────────────────────────────────────

function ApprovalHistoryTab({ hideCosts }: { hideCosts: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: historyPos = [], isLoading } = useQuery({
    queryKey: ["po-approval-history", search],
    queryFn: () => fetchApprovalHistory(search),
    staleTime: 30_000,
  });

  const thCls = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search PO#, vendor…"
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
                <th className={`${thCls} text-left`}>PO #</th>
                <th className={`${thCls} text-left`}>Vendor</th>
                {!hideCosts && <th className={`${thCls} text-right`}>Value</th>}
                <th className={`${thCls} text-center`}>Outcome</th>
                <th className={`${thCls} text-left`}>Requested By</th>
                <th className={`${thCls} text-left`}>Actioned By</th>
                <th className={`${thCls} text-left`}>Actioned On</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={hideCosts ? 6 : 7} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : historyPos.length === 0 ? (
                <tr>
                  <td colSpan={hideCosts ? 6 : 7} className="px-3 py-10 text-center text-sm text-slate-400">
                    No approval history yet.
                  </td>
                </tr>
              ) : (
                historyPos.map((po) => {
                  const wasApproved = !!po.approved_at;
                  const actionedOn = po.approved_at || null;
                  const actionedBy = po.approved_by || "—";
                  return (
                    <tr
                      key={po.id}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                    >
                      <td className="px-3 py-2.5 border-b border-slate-100 text-left font-mono font-semibold text-slate-800">
                        {po.po_number}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-left text-slate-700">
                        {po.vendor_name || "—"}
                      </td>
                      {!hideCosts && (
                        <td className="px-3 py-2.5 border-b border-slate-100 text-right font-mono tabular-nums">
                          {formatCurrency(po.grand_total)}
                        </td>
                      )}
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
                            {po.rejection_reason && (
                              <p className="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate" title={po.rejection_reason}>
                                {po.rejection_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-slate-100 text-slate-600 text-sm">
                        {po.approval_requested_by || "—"}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hideCosts, canExport, canEdit } = useRoleAccess();
  const { role, profile, companyId } = useAuth();
  const isPurchaseTeam = role === 'purchase_team';
  const isFinanceOrAdmin = role === 'admin' || role === 'finance';
  const queryClient = useQueryClient();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<POFilters>({
    search: "",
    status: "all",
    drawingNumber: "",
    page: 1,
    pageSize: 20,
  });
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["po-stats"],
    queryFn: fetchPOStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: () => fetchPurchaseOrders(filters),
  });

  // Pending count for the tab badge
  const { data: pendingApprovalCount = 0 } = useQuery({
    queryKey: ["po-pending-approval-count"],
    queryFn: async () => {
      const res = await fetchPendingApprovals();
      return res.length;
    },
    enabled: isFinanceOrAdmin,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (po: any) => {
      await softDeletePurchaseOrder(po.id);
      await logAudit("purchase_order", po.id, "deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["po-stats"] });
      toast({ title: "PO deleted" });
    },
  });

  const allPos = data?.data ?? [];
  const pos = showDeleted ? allPos : allPos.filter((p) => p.status !== "deleted");

  // ── Shared header (always rendered) ──────────────────────────────────────
  const pageHeader = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
        <p className="text-sm text-slate-500 mt-1">Track vendor orders and receipts</p>
      </div>
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        {canExport && (
          <Button variant="outline" onClick={() => setExportModalOpen(true)}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => navigate("/purchase-orders/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        )}
      </div>
    </div>
  );

  // ── Summary cards ─────────────────────────────────────────────────────────
  const summaryCards = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard title="POs This Month" value={String(stats?.totalThisMonth ?? 0)} icon={ShoppingCart} />
      <MetricCard title="Open POs" value={String(stats?.openPOs ?? 0)} icon={Package} />
      <MetricCard title="Value This Month" value={formatCurrency(stats?.totalValueThisMonth ?? 0)} icon={FileText} />
      <MetricCard
        title="Overdue (>30d)"
        value={String(stats?.overduePOs ?? 0)}
        icon={ShoppingCart}
        className={stats?.overduePOs ? "border-destructive/30" : ""}
      />
    </div>
  );

  // ── All POs table (shared by "All POs" tab and non-tabbed purchase_team view) ──
  const allPOsContent = (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO#, vendor..."
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
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partially_received">Partially Received</SelectItem>
            <SelectItem value="fully_received">Fully Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
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
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">PO #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vendor</th>
                {!hideCosts && <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Total Value</th>}
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Payment</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={hideCosts ? 7 : 8} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={hideCosts ? 7 : 8} className="px-3 py-8 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <ShoppingCart className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">No purchase orders yet</h3>
                      <p className="text-sm text-slate-500 mb-6 max-w-xs">Raise a purchase order to start procuring materials from your vendors.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pos.map((po) => {
                  const days = getDaysOpen(po.issued_at, po.status);
                  const daysClass = getDaysOpenClass(days);
                  const isDeleted = po.status === "deleted";
                  return (
                    <tr
                      key={po.id}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${isDeleted ? "opacity-50" : ""}`}
                      onClick={() => !isDeleted && navigate(`/purchase-orders/${po.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{po.po_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{po.vendor_name || "—"}</td>
                      {!hideCosts && <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(po.grand_total)}</td>}
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {isPurchaseTeam && po.status === "draft" && (po as any).approved_at ? (
                          <span className="bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            Approved
                          </span>
                        ) : (
                          <span className={statusClass[po.status] || "status-draft"}>
                            {statusLabels[po.status] || po.status}
                          </span>
                        )}
                        {isPurchaseTeam && po.status === "rejected" && (po as any).rejection_reason && !(po as any).rejection_noted && (
                          <span className="block text-[10px] text-red-600 font-medium mt-0.5">New rejection</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {(po as any).payment_status === "paid" ? (
                          <span className="status-paid text-xs">Paid</span>
                        ) : (po as any).payment_status === "partial" ? (
                          <span className="status-pending text-xs">Partial</span>
                        ) : (po as any).payment_status === "unpaid" ? (
                          <span className="status-overdue text-xs">Unpaid</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                        {days !== null ? <span className={daysClass}>{days}d</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4">
      {pageHeader}
      {summaryCards}

      {isFinanceOrAdmin ? (
        <Tabs defaultValue="all">
          <TabsList className="mb-1">
            <TabsTrigger value="all">All POs</TabsTrigger>
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
            {allPOsContent}
          </TabsContent>

          <TabsContent value="pending" className="mt-3">
            <PendingApprovalsTab hideCosts={hideCosts} profile={profile} />
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <ApprovalHistoryTab hideCosts={hideCosts} />
          </TabsContent>
        </Tabs>
      ) : (
        allPOsContent
      )}

      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        docType="Purchase Orders"
        isExporting={isExporting}
        onExport={async (dateFrom, dateTo, includeLineItems) => {
          if (!companyId) {
            toast({ title: "Cannot export", description: "Account not linked to a company.", variant: "destructive" });
            return;
          }
          setIsExporting(true);
          try {
            const data = await fetchAllPOsForExport(dateFrom, dateTo, companyId);
            exportPOReport(data, includeLineItems, dateFrom, dateTo);
            setExportModalOpen(false);
            toast({ title: "Export ready", description: `${data.length} purchase orders exported.` });
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
