import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Wrench, CheckCircle, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import {
  fetchConsumableIssue,
  fetchConsumableItems,
  createConsumableIssue,
  softDeleteConsumableIssue,
  deleteConsumableIssueLine,
  recordConsumableReturn,
  listConsumableReturnsForLine,
  deleteConsumableReturn,
  editConsumableIssue,
  type ConsumableIssueLine,
  type ConsumableIssueLineInput,
  type ConsumableIssueDeleteStockAction,
  type ConsumableItem,
  type ConsumableReturn,
} from "@/lib/consumables-api";
import { logAudit } from "@/lib/audit-api";
import { formatNumber } from "@/lib/gst-utils";
import { format, parseISO } from "date-fns";

const DELETION_REASONS = [
  { value: "data_entry_error",        label: "Data entry error" },
  { value: "duplicate_entry",         label: "Duplicate entry" },
  { value: "cancelled_by_management", label: "Cancelled by management" },
  { value: "wrong_recipient",         label: "Wrong recipient" },
  { value: "other",                   label: "Other (please specify)" },
];

const STOCK_ACTIONS: {
  value: ConsumableIssueDeleteStockAction;
  label: string;
  desc: string;
}[] = [
  {
    value: "recall_unused",
    label: "Recall unused — credit outstanding qty back to free stock",
    desc: "Use when the issue was a mistake. Credits only what wasn't already returned via return events.",
  },
  {
    value: "already_consumed",
    label: "Already consumed — no stock reversal, only remove the record",
    desc: "Use when items were used as intended; only the document is being removed.",
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineFormRow {
  _key: string;
  item_id: string;
  item_code: string;
  item_description: string;
  drawing_number: string;
  unit: string;
  stock_free: number;
  qty_issued: number;
  return_status: "returned" | "not_returned";
  qty_returned: number;
  return_reason: string;
  disposition: "scrap" | "";
}

function emptyLine(): LineFormRow {
  return {
    _key: crypto.randomUUID(),
    item_id: "",
    item_code: "",
    item_description: "",
    drawing_number: "",
    unit: "NOS",
    stock_free: 0,
    qty_issued: 1,
    return_status: "not_returned",
    qty_returned: 0,
    return_reason: "",
    disposition: "",
  };
}

function issuedStatusBadge(status: string) {
  if (status === "issued") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Issued</Badge>;
  }
  if (status === "deleted") {
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Deleted</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Draft</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConsumableIssueDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { canEdit } = useRoleAccess("consumables");

  // Delete dialog state — covers both the whole-issue delete and a
  // line-level delete. When `deleteLineTarget` is set we're deleting
  // a line; otherwise the dialog applies to the issue.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLineTarget, setDeleteLineTarget] =
    useState<ConsumableIssueLine | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteCustomReason, setDeleteCustomReason] = useState("");
  const [deleteStockAction, setDeleteStockAction] =
    useState<ConsumableIssueDeleteStockAction | "">("");

  const resetDeleteState = () => {
    setDeleteOpen(false);
    setDeleteLineTarget(null);
    setDeleteReason("");
    setDeleteCustomReason("");
    setDeleteStockAction("");
  };

  const openIssueDelete = () => {
    setDeleteLineTarget(null);
    setDeleteReason("");
    setDeleteCustomReason("");
    setDeleteStockAction("");
    setDeleteOpen(true);
  };

  const openLineDelete = (line: ConsumableIssueLine) => {
    setDeleteLineTarget(line);
    setDeleteReason("");
    setDeleteCustomReason("");
    setDeleteStockAction("");
    setDeleteOpen(true);
  };

  const finalReason = () =>
    deleteReason === "other"
      ? deleteCustomReason.trim()
      : DELETION_REASONS.find((r) => r.value === deleteReason)?.label ?? deleteReason;

  const deleteIssueMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing issue id");
      if (!deleteStockAction) throw new Error("Stock action required");
      await softDeleteConsumableIssue(id, {
        deletion_reason: finalReason(),
        stockAction: deleteStockAction,
      });
      await logAudit("consumable_issue", id, "deleted", {
        reason: finalReason(),
        stockAction: deleteStockAction,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["consumable-issues"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      toast({ title: "Consumable issue deleted" });
      resetDeleteState();
    },
    onError: (err: any) =>
      toast({
        title: "Delete failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async () => {
      if (!deleteLineTarget) throw new Error("Missing line");
      if (!deleteStockAction) throw new Error("Stock action required");
      await deleteConsumableIssueLine(deleteLineTarget.id, {
        deletion_reason: finalReason(),
        stockAction: deleteStockAction,
      });
      await logAudit("consumable_issue_line", deleteLineTarget.id, "deleted", {
        issue_id: id,
        reason: finalReason(),
        stockAction: deleteStockAction,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["consumable-issues"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      toast({ title: "Line deleted" });
      resetDeleteState();
    },
    onError: (err: any) =>
      toast({
        title: "Delete failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const deletePending =
    deleteIssueMutation.isPending || deleteLineMutation.isPending;
  const handleConfirmDelete = () => {
    if (!deleteReason || !deleteStockAction) return;
    if (deleteReason === "other" && !deleteCustomReason.trim()) return;
    if (deleteLineTarget) deleteLineMutation.mutate();
    else deleteIssueMutation.mutate();
  };

  // ── Edit-issue state ─────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editIssuedTo, setEditIssuedTo] = useState("");
  const [editIssuedBy, setEditIssuedBy] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLineQtys, setEditLineQtys] = useState<Record<string, number>>({});

  const startEdit = () => {
    if (!issue) return;
    setEditIssuedTo(issue.issued_to);
    setEditIssuedBy(issue.issued_by ?? "");
    setEditIssueDate(issue.issue_date);
    setEditNotes(issue.notes ?? "");
    const qtys: Record<string, number> = {};
    for (const l of issue.lines ?? []) {
      qtys[l.id] = Number(l.qty_issued);
    }
    setEditLineQtys(qtys);
    setEditMode(true);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setEditLineQtys({});
  };

  const editIssueMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing issue id");
      const linesUpdate = Object.entries(editLineQtys)
        .filter(([, qty]) => Number.isFinite(qty) && qty > 0)
        .map(([lineId, qty]) => ({ id: lineId, qty_issued: qty }));
      return editConsumableIssue(id, {
        header: {
          issued_to: editIssuedTo,
          issued_by: editIssuedBy || null,
          issue_date: editIssueDate,
          notes: editNotes || null,
        },
        lines: linesUpdate.length > 0 ? linesUpdate : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["consumable-issues"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      toast({ title: "Issue updated" });
      cancelEdit();
    },
    onError: (err: any) =>
      toast({
        title: "Update failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  // ── Returns dialogs (history + record) ───────────────────────────────────
  // History dialog is read-only and opens on row click; Record dialog has
  // the form and opens via the per-row "Returns" button. Both target the
  // same line and share the underlying query.
  type ReturnDialogMode = "history" | "record" | null;
  const [returnDialogMode, setReturnDialogMode] =
    useState<ReturnDialogMode>(null);
  const [returnsLineTarget, setReturnsLineTarget] =
    useState<ConsumableIssueLine | null>(null);
  const [returnQty, setReturnQty] = useState<number>(0);
  const [returnDisposition, setReturnDisposition] =
    useState<"returned_to_stock" | "scrap" | "lost">("returned_to_stock");
  const [returnReturnedByName, setReturnReturnedByName] = useState("");
  const [returnReturnedAt, setReturnReturnedAt] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [returnNotes, setReturnNotes] = useState("");

  const openHistoryDialog = (line: ConsumableIssueLine) => {
    setReturnsLineTarget(line);
    setReturnDialogMode("history");
  };
  const openRecordDialog = (line: ConsumableIssueLine) => {
    setReturnsLineTarget(line);
    setReturnQty(0);
    setReturnDisposition("returned_to_stock");
    setReturnReturnedByName(profile?.full_name ?? "");
    setReturnReturnedAt(new Date().toISOString().slice(0, 10));
    setReturnNotes("");
    setReturnDialogMode("record");
  };
  const closeReturnsDialog = () => {
    setReturnDialogMode(null);
    setReturnsLineTarget(null);
    setReturnQty(0);
    setReturnNotes("");
  };

  const { data: returnsForLine = [] } = useQuery({
    queryKey: ["consumable-returns-for-line", returnsLineTarget?.id],
    queryFn: () => listConsumableReturnsForLine(returnsLineTarget!.id),
    enabled: !!returnsLineTarget,
  });

  const recordReturnMutation = useMutation({
    mutationFn: () => {
      if (!returnsLineTarget) throw new Error("Missing line");
      if (!(returnQty > 0)) throw new Error("Qty must be > 0");
      return recordConsumableReturn(returnsLineTarget.id, {
        qty: returnQty,
        disposition: returnDisposition,
        returned_at: new Date(returnReturnedAt).toISOString(),
        returned_by_name: returnReturnedByName || null,
        notes: returnNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      queryClient.invalidateQueries({
        queryKey: ["consumable-returns-for-line", returnsLineTarget?.id],
      });
      toast({ title: "Return recorded" });
      closeReturnsDialog();
    },
    onError: (err: any) =>
      toast({
        title: "Record failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const deleteReturnMutation = useMutation({
    mutationFn: (returnId: string) =>
      deleteConsumableReturn(returnId, { reason: "Deleted from UI" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consumable-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      queryClient.invalidateQueries({
        queryKey: ["consumable-returns-for-line", returnsLineTarget?.id],
      });
      toast({ title: "Return event removed" });
    },
    onError: (err: any) =>
      toast({
        title: "Delete failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  // ── VIEW mode ─────────────────────────────────────────────────────────────
  const { data: issue, isLoading } = useQuery({
    queryKey: ["consumable-issue", id],
    queryFn: () => fetchConsumableIssue(id!),
    enabled: !isNew,
  });

  // ── Items for combobox ────────────────────────────────────────────────────
  const { data: allItems = [] } = useQuery({
    queryKey: ["consumable-items"],
    queryFn: fetchConsumableItems,
    enabled: isNew,
  });

  // ── CREATE form state ─────────────────────────────────────────────────────
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [issuedTo, setIssuedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineFormRow[]>([emptyLine()]);
  const [openComboKey, setOpenComboKey] = useState<string | null>(null);

  const DRAFT_KEY = 'bizdocs_draft_consumable';

  // Restore draft (once on mount, create mode only)
  useEffect(() => {
    if (!isNew) return;
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.issueDate) setIssueDate(draft.issueDate);
      if (draft.issuedTo !== undefined) setIssuedTo(draft.issuedTo);
      if (draft.notes !== undefined) setNotes(draft.notes);
      if (draft.lines?.length) setLines(draft.lines as LineFormRow[]);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft (debounced 500ms, create mode only)
  useEffect(() => {
    if (!isNew) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ issueDate, issuedTo, notes, lines }));
    }, 500);
    return () => clearTimeout(timer);
  }, [isNew, issueDate, issuedTo, notes, lines]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      if (!issuedTo.trim()) throw new Error("Issued To is required");
      const validLines = lines.filter((l) => l.item_id && l.qty_issued > 0);
      if (validLines.length === 0) throw new Error("Add at least one line item with qty > 0");
      const missingReason = validLines.filter(
        (l) => l.return_status === "not_returned" && !l.return_reason.trim()
      );
      if (missingReason.length > 0)
        throw new Error(`Line ${missingReason.map((l) => lines.indexOf(l) + 1).join(", ")}: reason required for items not returned`);

      const lineInputs: ConsumableIssueLineInput[] = validLines.map((l) => ({
        item_id: l.item_id,
        item_code: l.item_code || null,
        item_description: l.item_description || null,
        drawing_number: l.drawing_number || null,
        unit: l.unit,
        qty_issued: l.qty_issued,
        return_status: l.return_status,
        qty_returned: l.return_status === "returned" ? l.qty_returned : 0,
        return_reason: l.return_reason || null,
        disposition: l.return_status === "returned" && l.disposition === "scrap" ? "scrap" : null,
      }));

      return createConsumableIssue({
        issue_date: issueDate,
        issued_to: issuedTo.trim(),
        issued_by: profile?.full_name ?? null,
        notes: notes.trim() || null,
        lines: lineInputs,
      });
    },
    onSuccess: (created) => {
      sessionStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["consumable-issues"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      toast({ title: `${created.issue_number} created successfully` });
      navigate(`/consumables/${created.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Line helpers ──────────────────────────────────────────────────────────
  function selectItem(key: string, item: ConsumableItem) {
    setLines((prev) =>
      prev.map((l) =>
        l._key === key
          ? {
              ...l,
              item_id: item.id,
              item_code: item.item_code,
              item_description: item.description,
              drawing_number: item.drawing_number ?? "",
              unit: item.unit,
              stock_free: item.stock_free,
            }
          : l
      )
    );
    setOpenComboKey(null);
  }

  function updateLine<K extends keyof LineFormRow>(key: string, field: K, value: LineFormRow[K]) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  // ── Loading state (VIEW) ──────────────────────────────────────────────────
  if (!isNew && isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading…</div>;
  }

  // ── VIEW mode render ──────────────────────────────────────────────────────
  if (!isNew && issue) {
    const isDeleted = issue.status === "deleted";

    return (
      <div className="p-4 md:p-6 space-y-5 w-full">
        {/* Back + header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/consumables")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-lg">{issue.issue_number}</span>
            {issuedStatusBadge(issue.status)}
          </div>
          {canEdit && !isDeleted && !editMode && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                Edit Issue
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={openIssueDelete}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Issue
              </Button>
            </div>
          )}
          {canEdit && !isDeleted && editMode && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEdit}
                disabled={editIssueMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => editIssueMutation.mutate()}
                disabled={editIssueMutation.isPending || !editIssuedTo.trim()}
              >
                {editIssueMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </div>

        {isDeleted && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 p-3 text-sm">
            <p className="font-medium text-red-800 dark:text-red-300">
              This consumable issue has been deleted.
            </p>
            {issue.deletion_reason && (
              <p className="mt-0.5 text-red-700 dark:text-red-400">
                Reason: {issue.deletion_reason}
              </p>
            )}
            {issue.stock_action && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Stock action: {issue.stock_action}
                {issue.deleted_at && (
                  <> · Deleted {format(parseISO(issue.deleted_at), "dd MMM yyyy HH:mm")}</>
                )}
              </p>
            )}
          </div>
        )}

        {/* Meta */}
        {!editMode ? (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
            <span>Date: <b className="text-foreground">{format(parseISO(issue.issue_date), "dd MMM yyyy")}</b></span>
            <span>Issued To: <b className="text-foreground">{issue.issued_to}</b></span>
            {issue.issued_by && <span>Issued By: <b className="text-foreground">{issue.issued_by}</b></span>}
            {issue.notes && <span>Notes: <b className="text-foreground">{issue.notes}</b></span>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="space-y-1.5">
              <Label htmlFor="edit-issue-date">Issue Date</Label>
              <Input
                id="edit-issue-date"
                type="date"
                value={editIssueDate}
                onChange={(e) => setEditIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-issued-to">Issued To <span className="text-red-500">*</span></Label>
              <Input
                id="edit-issued-to"
                value={editIssuedTo}
                onChange={(e) => setEditIssuedTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-issued-by">Issued By</Label>
              <Input
                id="edit-issued-by"
                value={editIssuedBy}
                onChange={(e) => setEditIssuedBy(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3 space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        {/* Lines table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Drawing No</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 w-full">Item</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Qty Issued</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Returned</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Outstanding</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Disposition</th>
                  {canEdit && !isDeleted && (
                    <th className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap" />
                  )}
                </tr>
              </thead>
              <tbody>
                {(issue.lines ?? []).map((line: ConsumableIssueLine) => {
                  const qtyReturnedAgg = Number(line.qty_returned ?? 0);
                  const outstanding =
                    Number(line.qty_issued) - qtyReturnedAgg;
                  const rowClickable = !editMode;
                  return (
                  <tr
                    key={line.id}
                    className={
                      "border-b border-slate-100 dark:border-slate-800 " +
                      (rowClickable
                        ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        : "")
                    }
                    onClick={rowClickable ? () => openHistoryDialog(line) : undefined}
                  >
                    <td className="px-3 py-2.5 font-mono text-blue-700 dark:text-blue-400 whitespace-nowrap">
                      {line.drawing_number ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <p className="font-medium">{line.item_code ?? "—"}</p>
                      {line.item_description && (
                        <p className="text-xs text-muted-foreground">{line.item_description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono whitespace-nowrap">
                      {editMode ? (
                        <Input
                          type="number"
                          min={qtyReturnedAgg}
                          value={editLineQtys[line.id] ?? line.qty_issued}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setEditLineQtys((prev) => ({
                              ...prev,
                              [line.id]: Math.max(
                                qtyReturnedAgg,
                                Number(e.target.value) || 0
                              ),
                            }))
                          }
                          className="w-24 text-right tabular-nums font-mono"
                        />
                      ) : (
                        <>{line.qty_issued} {line.unit}</>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono whitespace-nowrap">
                      {qtyReturnedAgg > 0 ? `${qtyReturnedAgg} ${line.unit}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono whitespace-nowrap">
                      <span
                        className={
                          outstanding === 0
                            ? "text-muted-foreground"
                            : "text-foreground font-semibold"
                        }
                      >
                        {outstanding} {line.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                      {line.disposition === "scrap" && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Scrap</Badge>
                      )}
                      {line.return_reason && (
                        <span className="block">{line.return_reason}</span>
                      )}
                      {!line.return_reason && !line.disposition && "—"}
                    </td>
                    {canEdit && !isDeleted && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {!editMode && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRecordDialog(line);
                              }}
                              aria-label="Record return"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Returns
                            </Button>
                          )}
                          {!editMode && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                openLineDelete(line);
                              }}
                              aria-label="Delete line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete dialog (issue-level OR line-level depending on deleteLineTarget) */}
        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!open && !deletePending) resetDeleteState();
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-destructive">
                {deleteLineTarget
                  ? "Delete Line — Stock Action Required"
                  : "Delete Consumable Issue — Stock Action Required"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {deleteLineTarget
                  ? `Reverse stock for ${deleteLineTarget.item_code ?? "this line"} (${deleteLineTarget.qty_issued} ${deleteLineTarget.unit})?`
                  : `Stock was decremented when ${issue.issue_number} was issued. Choose how to handle it.`}
              </p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Reason for deletion <span className="text-destructive">*</span>
                </Label>
                <Select value={deleteReason} onValueChange={setDeleteReason}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DELETION_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {deleteReason === "other" && (
                  <Input
                    placeholder="Please specify…"
                    value={deleteCustomReason}
                    onChange={(e) => setDeleteCustomReason(e.target.value)}
                    className="h-9 text-sm mt-1.5"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Stock action <span className="text-destructive">*</span>
                </Label>
                {STOCK_ACTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      deleteStockAction === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="consumableDetailStockAction"
                      value={opt.value}
                      checked={deleteStockAction === opt.value}
                      onChange={() => setDeleteStockAction(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetDeleteState}
                disabled={deletePending}
              >
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={
                  deletePending ||
                  !deleteReason ||
                  !deleteStockAction ||
                  (deleteReason === "other" && !deleteCustomReason.trim())
                }
              >
                {deletePending ? "Deleting…" : "Confirm Deletion"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Return History dialog (read-only, opens on row click) */}
        <Dialog
          open={returnDialogMode === "history"}
          onOpenChange={(open) => {
            if (!open) closeReturnsDialog();
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Return history</DialogTitle>
              {returnsLineTarget && (
                <div className="mt-1 text-sm text-muted-foreground">
                  <p className="font-mono text-foreground">
                    {returnsLineTarget.item_code ?? "—"}
                  </p>
                  {returnsLineTarget.item_description && (
                    <p className="text-xs">{returnsLineTarget.item_description}</p>
                  )}
                  <p className="mt-1 text-xs">
                    Issued{" "}
                    <span className="font-mono text-foreground">
                      {Number(returnsLineTarget.qty_issued)} {returnsLineTarget.unit}
                    </span>{" "}
                    · Returned{" "}
                    <span className="font-mono text-foreground">
                      {Number(returnsLineTarget.qty_returned ?? 0)} {returnsLineTarget.unit}
                    </span>{" "}
                    · Outstanding{" "}
                    <span className="font-mono text-foreground">
                      {Number(returnsLineTarget.qty_issued) -
                        Number(returnsLineTarget.qty_returned ?? 0)}{" "}
                      {returnsLineTarget.unit}
                    </span>
                  </p>
                </div>
              )}
            </DialogHeader>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {returnsForLine.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No return events recorded yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                      <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Qty</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Disposition</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">By</th>
                      <th className="px-3 py-2 text-left w-full">Notes</th>
                      {canEdit && !isDeleted && (
                        <th className="px-3 py-2 whitespace-nowrap" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {returnsForLine.map((r: ConsumableReturn) => (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                          {format(parseISO(r.returned_at), "dd MMM yyyy")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-mono whitespace-nowrap">
                          {r.qty_returned}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.disposition === "returned_to_stock" && (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">To stock</Badge>
                          )}
                          {r.disposition === "scrap" && (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Scrap</Badge>
                          )}
                          {r.disposition === "lost" && (
                            <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">Lost</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {r.returned_by_name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {r.notes ?? "—"}
                        </td>
                        {canEdit && !isDeleted && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (window.confirm("Delete this return event? Stock will be reversed.")) {
                                  deleteReturnMutation.mutate(r.id);
                                }
                              }}
                              disabled={deleteReturnMutation.isPending}
                              aria-label="Delete return event"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeReturnsDialog}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Record Return dialog (form, opens via the "Returns" button) */}
        <Dialog
          open={returnDialogMode === "record"}
          onOpenChange={(open) => {
            if (!open && !recordReturnMutation.isPending) closeReturnsDialog();
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Record return</DialogTitle>
              {returnsLineTarget && (
                <p className="text-sm text-muted-foreground mt-1 font-mono">
                  {returnsLineTarget.item_code ?? "line"}
                  {returnsLineTarget.item_description && (
                    <span className="ml-2 font-sans">
                      · {returnsLineTarget.item_description}
                    </span>
                  )}
                </p>
              )}
            </DialogHeader>

            {returnsLineTarget && (() => {
              const issued = Number(returnsLineTarget.qty_issued);
              const previouslyReturned = Number(returnsLineTarget.qty_returned ?? 0);
              const outstandingBefore = issued - previouslyReturned;
              const qty = Number(returnQty) || 0;
              const safeQty = Math.min(Math.max(0, qty), outstandingBefore);
              const returnedAfter = previouslyReturned + safeQty;
              const outstandingAfter = issued - returnedAfter;
              return (
                <div className="space-y-4">
                  {/* Summary strip */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-2.5 text-sm tabular-nums">
                    <span>Issued: <b className="text-foreground">{issued} {returnsLineTarget.unit}</b></span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span>Previously returned: <b className="text-foreground">{previouslyReturned} {returnsLineTarget.unit}</b></span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span>Outstanding: <b className="text-foreground">{outstandingBefore} {returnsLineTarget.unit}</b></span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Returning now</Label>
                      <Input
                        type="number"
                        min={0.0001}
                        max={outstandingBefore}
                        value={returnQty || ""}
                        onChange={(e) =>
                          setReturnQty(Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Disposition</Label>
                      <Select
                        value={returnDisposition}
                        onValueChange={(v) =>
                          setReturnDisposition(v as "returned_to_stock" | "scrap" | "lost")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="returned_to_stock">Returned to stock</SelectItem>
                          <SelectItem value="scrap">Scrap</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Returned at</Label>
                      <Input
                        type="date"
                        value={returnReturnedAt}
                        onChange={(e) => setReturnReturnedAt(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Returned by</Label>
                      <Input
                        placeholder="Name"
                        value={returnReturnedByName}
                        onChange={(e) => setReturnReturnedByName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <Input
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="Why, condition, batch, etc."
                    />
                  </div>

                  {/* Live preview */}
                  {safeQty > 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      After this return:{" "}
                      <b className="text-foreground">{returnedAfter} {returnsLineTarget.unit}</b>{" "}
                      returned ·{" "}
                      <b className="text-foreground">{outstandingAfter} {returnsLineTarget.unit}</b>{" "}
                      outstanding
                    </p>
                  )}
                </div>
              );
            })()}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeReturnsDialog}
                disabled={recordReturnMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => recordReturnMutation.mutate()}
                disabled={recordReturnMutation.isPending || !(returnQty > 0)}
              >
                {recordReturnMutation.isPending ? "Recording…" : "Record return"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── CREATE mode render ────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => { sessionStorage.removeItem(DRAFT_KEY); navigate("/consumables"); }}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">New Consumable Issue</h1>
        </div>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="space-y-1.5">
          <Label htmlFor="issue-date">Issue Date</Label>
          <Input
            id="issue-date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issued-to">Issued To <span className="text-red-500">*</span></Label>
          <Input
            id="issued-to"
            placeholder="Name or department"
            value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issued-by">Issued By</Label>
          <Input
            id="issued-by"
            value={profile?.full_name ?? ""}
            readOnly
            className="bg-muted text-muted-foreground"
          />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-500">Line Items</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Line
          </Button>
        </div>

        {lines.map((line, idx) => (
          <div
            key={line._key}
            className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 space-y-3"
          >
            {/* Row header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Line {idx + 1}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => removeLine(line._key)}
                disabled={lines.length === 1}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Item combobox */}
            <div className="space-y-1.5">
              <Label>Item <span className="text-red-500">*</span></Label>
              <Popover
                open={openComboKey === line._key}
                onOpenChange={(open) => setOpenComboKey(open ? line._key : null)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-start font-normal text-left"
                  >
                    {line.item_code ? (
                      <span>
                        <span className="font-mono font-medium">{line.item_code}</span>
                        {line.item_description && (
                          <span className="text-muted-foreground ml-2 text-xs">{line.item_description}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select item…</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item code or description…" />
                    <CommandList>
                      <CommandEmpty>No items found.</CommandEmpty>
                      <CommandGroup>
                        {allItems.map((item: ConsumableItem) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_code} ${item.description}`}
                            onSelect={() => selectItem(line._key, item)}
                          >
                            <div className="flex flex-col">
                              <span className="font-mono font-medium text-sm">{item.item_code}</span>
                              <span className="text-xs text-muted-foreground">{item.description}</span>
                            </div>
                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                              Free: {formatNumber(item.stock_free ?? 0)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {line.item_id && (
                <p className="text-xs text-muted-foreground">
                  {line.drawing_number && <span className="font-mono mr-3">{line.drawing_number}</span>}
                  Free stock: <span className={line.stock_free < line.qty_issued ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>{formatNumber(line.stock_free ?? 0)}</span>
                </p>
              )}
            </div>

            {/* Qty + return status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Issued</Label>
                <Input
                  type="number"
                  min={1}
                  value={line.qty_issued}
                  onChange={(e) =>
                    updateLine(line._key, "qty_issued", Math.max(0, Number(e.target.value)))
                  }
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={line.unit} readOnly className="bg-muted text-muted-foreground" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Return Status</Label>
                <Select
                  value={line.return_status}
                  onValueChange={(v) =>
                    updateLine(line._key, "return_status", v as "returned" | "not_returned")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_returned">Not Returned</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Return details — only when returned */}
            {line.return_status === "returned" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Qty Returned</Label>
                  <Input
                    type="number"
                    min={0}
                    max={line.qty_issued}
                    value={line.qty_returned}
                    onChange={(e) =>
                      updateLine(
                        line._key,
                        "qty_returned",
                        Math.min(line.qty_issued, Math.max(0, Number(e.target.value)))
                      )
                    }
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Disposition</Label>
                  <Select
                    value={line.disposition || "none"}
                    onValueChange={(v) =>
                      updateLine(line._key, "disposition", v === "scrap" ? "scrap" : "")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="scrap">Scrap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Return Reason</Label>
                  <Input
                    placeholder="Why was it returned?"
                    value={line.return_reason}
                    onChange={(e) => updateLine(line._key, "return_reason", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Not-returned reason — required when item is not coming back */}
            {line.return_status === "not_returned" && (
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>
                    Reason <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Reason for not returning (e.g. Worn out, Lost in process)"
                    value={line.return_reason}
                    onChange={(e) => updateLine(line._key, "return_reason", e.target.value)}
                    className="dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {createMutation.isPending ? "Saving…" : "Save Issue"}
        </Button>
      </div>
    </div>
  );
}
