import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchMaterialIssueRequests,
  fetchMaterialIssueRequest,
  confirmMaterialIssue,
  type MirLineItem,
} from "@/lib/production-api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";

function mirStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    partially_issued: { label: "Partially Issued", className: "bg-blue-100 text-blue-800" },
    issued: { label: "Issued", className: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

export default function StorekeeperQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [selectedMirId, setSelectedMirId] = useState<string | null>(null);
  const [lineEdits, setLineEdits] = useState<Record<string, { issued_qty: number; shortage_notes: string }>>({});
  const [statusFilter, setStatusFilter] = useState("pending");

  // Last-6-months options for month filter
  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      opts.push({ value, label });
    }
    return opts;
  })();
  const currentMonth = monthOptions[0].value;
  const [month, setMonth] = useState(currentMonth);

  const issuedBy = profile?.full_name ?? "Storekeeper";

  // List view query — show all statuses, filtered client-side or via param
  const { data: mirs = [], isLoading: listLoading } = useQuery({
    queryKey: ["mirs", statusFilter, month],
    queryFn: () => fetchMaterialIssueRequests({
      status: statusFilter !== "all" ? statusFilter : undefined,
      month: month || undefined,
    }),
    enabled: !selectedMirId,
  });

  // Detail view query
  const { data: mirDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["mir-detail", selectedMirId],
    queryFn: () => fetchMaterialIssueRequest(selectedMirId!),
    enabled: !!selectedMirId,
  });

  // Initialize lineEdits when mirDetail loads (replaces deprecated onSuccess)
  useEffect(() => {
    if (mirDetail?.line_items) {
      const edits: Record<string, { issued_qty: number; shortage_notes: string }> = {};
      for (const li of mirDetail.line_items) {
        // FIX 3C: pre-fill with remaining qty, not total requested qty
        const remaining = Math.max(0, li.requested_qty - (li.issued_qty ?? 0));
        edits[li.id] = { issued_qty: remaining, shortage_notes: "" };
      }
      setLineEdits(edits);
    }
  }, [mirDetail]);

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!selectedMirId || !mirDetail?.line_items) throw new Error("No MIR selected");
      const lineIssues = mirDetail.line_items.map((li: MirLineItem) => ({
        mir_line_item_id: li.id,
        issued_qty: lineEdits[li.id]?.issued_qty ?? li.requested_qty,
        shortage_notes: lineEdits[li.id]?.shortage_notes || undefined,
      }));
      return confirmMaterialIssue(selectedMirId, lineIssues, issuedBy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mirs"] });
      queryClient.invalidateQueries({ queryKey: ["awo-detail"] });
      toast({ title: "Materials issued successfully" });
      setSelectedMirId(null);
      setLineEdits({});
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── List view ──────────────────────────────────────────────────────────────

  if (!selectedMirId) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Assembly Issue Queue</h1>
          {profile?.full_name && (
            <span className="text-sm text-muted-foreground ml-auto">{profile.full_name}</span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partially_issued">Partially Issued</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {listLoading ? (
          <p className="text-muted-foreground text-center py-10">Loading…</p>
        ) : mirs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-xl border border-slate-200">
            <CheckCircle className="h-10 w-10 text-green-400" />
            <p className="text-slate-500 font-medium">No material requests</p>
            <p className="text-sm text-slate-400">No MIRs match the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mirs.map((mir) => (
              <div
                key={mir.id}
                className="paper-card space-y-2 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium text-sm">{mir.mir_number}</span>
                      {mirStatusBadge(mir.status)}
                    </div>
                    <p className="text-sm font-medium">
                      WO: {mir.awo?.awo_number ?? "—"}
                      {mir.awo?.item_description && (
                        <span className="text-muted-foreground font-normal"> · {mir.awo.item_description}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {mir.requested_by && <span>Requested by: {mir.requested_by}</span>}
                      {mir.request_date && (
                        <span>{format(parseISO(mir.request_date), "dd MMM yyyy")}</span>
                      )}
                      {mir.line_items && (
                        <span>{mir.line_items.length} items</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={mir.status === "issued" ? "outline" : "default"}
                    onClick={() => setSelectedMirId(mir.id)}
                  >
                    {mir.status === "issued" ? "View" : "Open"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────

  if (detailLoading || !mirDetail) {
    return (
      <div className="p-6 text-center text-muted-foreground">Loading MIR…</div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedMirId(null); setLineEdits({}); }}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-lg">{mirDetail.mir_number}</span>
          {mirStatusBadge(mirDetail.status)}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>WO: <b className="text-foreground font-mono">{mirDetail.awo?.awo_number ?? "—"}</b></span>
        {mirDetail.requested_by && <span>Requested by: <b className="text-foreground">{mirDetail.requested_by}</b></span>}
        {mirDetail.request_date && (
          <span>Date: <b className="text-foreground">{format(parseISO(mirDetail.request_date), "dd MMM yyyy")}</b></span>
        )}
      </div>

      {/* Line items table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Required Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Available Stock</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Issued Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Shortage Notes</th>
              </tr>
            </thead>
            <tbody>
              {(mirDetail.line_items ?? []).map((li: MirLineItem) => {
                const remaining = Math.max(0, li.requested_qty - (li.issued_qty ?? 0));
                const edit = lineEdits[li.id] ?? { issued_qty: remaining, shortage_notes: "" };
                const fullyIssued = remaining === 0;
                const hasShortage = !fullyIssued && edit.issued_qty < remaining;

                return (
                  <tr key={li.id} className={fullyIssued ? "opacity-60" : undefined}>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{li.drawing_number ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <p className="text-sm font-medium">{li.item_code ?? "—"}</p>
                      {li.item_description && (
                        <p className="text-xs text-muted-foreground">{li.item_description}</p>
                      )}
                      {(li.issued_qty ?? 0) > 0 && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Issued: {li.issued_qty} of {li.requested_qty}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.requested_qty}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">
                      {li.stock_free != null ? (
                        <span className={li.stock_free >= li.requested_qty ? "text-green-600" : "text-amber-600"}>
                          {li.stock_free}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
                      {mirDetail.status === "issued" || fullyIssued ? (
                        <span className="font-mono tabular-nums text-sm">
                          {fullyIssued ? <span className="text-green-600">✓ Done</span> : edit.issued_qty}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={edit.issued_qty}
                          onChange={(e) => {
                            const val = Math.min(remaining, Math.max(0, Number(e.target.value)));
                            setLineEdits((prev) => ({
                              ...prev,
                              [li.id]: { ...edit, issued_qty: val },
                            }));
                          }}
                          className="w-20 text-right ml-auto"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      {mirDetail.status === "issued" || fullyIssued ? (
                        <span className="text-muted-foreground text-sm">{edit.shortage_notes || "—"}</span>
                      ) : hasShortage ? (
                        <Input
                          placeholder="Reason for shortage"
                          value={edit.shortage_notes}
                          onChange={(e) => {
                            setLineEdits((prev) => ({
                              ...prev,
                              [li.id]: { ...edit, shortage_notes: e.target.value },
                            }));
                          }}
                          className="text-sm"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issued by + confirm */}
      <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-muted-foreground">
            {mirDetail.status === "issued"
              ? <>Issued by: <b className="text-foreground">{(mirDetail as any).issued_by ?? issuedBy}</b></>
              : <>Issuing as: <b className="text-foreground">{issuedBy}</b></>}
          </span>
        </div>
        {mirDetail.status !== "issued" && (
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {confirmMutation.isPending ? "Confirming…" : "Confirm Issue"}
          </Button>
        )}
      </div>
    </div>
  );
}
