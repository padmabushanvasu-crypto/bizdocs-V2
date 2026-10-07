import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPendingWriteOffs,
  reviewJigWriteOff,
  fetchPendingJigHolds,
  reviewJigHold,
} from "@/lib/jig-approvals-api";
import { CUSTODY_BADGE } from "@/lib/jig-custody-api";

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d: string) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function JigApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const setNote = (id: string, v: string) => setNotes((p) => ({ ...p, [id]: v }));
  const noteOf = (id: string) => notes[id]?.trim() || "";

  const writeOffs = useQuery({ queryKey: ["jig-approvals", "write-offs"], queryFn: fetchPendingWriteOffs, staleTime: 0 });
  const holds = useQuery({ queryKey: ["jig-approvals", "holds"], queryFn: fetchPendingJigHolds, staleTime: 0 });

  const afterReview = () => {
    queryClient.invalidateQueries({ queryKey: ["jig-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["jig-custody"] });
    queryClient.invalidateQueries({ queryKey: ["jig-events"] });
    queryClient.invalidateQueries({ queryKey: ["processor-invoice-jig-holds"] });
  };

  const writeOffMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => reviewJigWriteOff(id, approve, noteOf(id) || null),
    onSuccess: (_d, v) => toast({ title: v.approve ? "Write-off approved" : "Write-off rejected" }),
    onError: (e: Error) => toast({ title: "Could not review write-off", description: e.message, variant: "destructive" }),
    onSettled: afterReview,
  });

  const holdMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => reviewJigHold(id, approve, noteOf(id) || null),
    onSuccess: (_d, v) => toast({ title: v.approve ? "Invoice approved" : "Invoice rejected" }),
    onError: (e: Error) => toast({ title: "Could not review invoice", description: e.message, variant: "destructive" }),
    onSettled: afterReview,
  });

  const wo = writeOffs.data ?? [];
  const hd = holds.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-slate-500" /> Jig Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Finance review of jigs not returned by vendors</p>
      </div>

      <Tabs defaultValue="writeoffs">
        <TabsList>
          <TabsTrigger value="writeoffs">Write-off requests{wo.length > 0 ? ` (${wo.length})` : ""}</TabsTrigger>
          <TabsTrigger value="holds">Invoices with jigs out{hd.length > 0 ? ` (${hd.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="writeoffs" className="space-y-3">
          {writeOffs.error && <p className="text-sm text-red-600">{(writeOffs.error as Error).message}</p>}
          {writeOffs.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!writeOffs.isLoading && !writeOffs.error && wo.length === 0 && <p className="text-sm text-slate-500">No write-off requests waiting.</p>}
          {wo.map(({ event: e, custody: c }) => {
            const rejectDisabled = !noteOf(e.id) || writeOffMutation.isPending;
            return (
              <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    <span className="font-mono">{c?.jig_number ?? "—"}</span>
                    <span className="font-normal text-slate-600"> · {c?.item_code ?? ""} {c?.item_description ?? ""}</span>
                  </p>
                  <span className="text-sm font-medium text-amber-800">Qty {e.qty ?? "—"}</span>
                </div>
                <p className="text-xs text-slate-600">
                  Vendor <strong>{c?.party_name ?? "—"}</strong> · DC {c?.dc_number ?? "—"} (sent {fmtDate(c?.sent_at ?? null)})
                  {c ? ` · ${CUSTODY_BADGE[c.custody_status]?.label ?? c.custody_status}` : ""}
                  {e.grn_number ? ` · GRN ${e.grn_number}` : ""}
                </p>
                <p className="text-sm text-slate-800">Reason: {e.reason ?? "—"}</p>
                <p className="text-[11px] text-slate-500">Requested by {e.created_by_name ?? "—"} · {fmtDateTime(e.created_at)}</p>
                <Textarea
                  value={notes[e.id] ?? ""}
                  onChange={(ev) => setNote(e.id, ev.target.value)}
                  placeholder="Note (required to reject)"
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={writeOffMutation.isPending} onClick={() => writeOffMutation.mutate({ id: e.id, approve: true })}>
                    Approve – charge vendor in Tally
                  </Button>
                  <Button size="sm" variant="outline" disabled={rejectDisabled} onClick={() => writeOffMutation.mutate({ id: e.id, approve: false })}>
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="holds" className="space-y-3">
          {holds.error && <p className="text-sm text-red-600">{(holds.error as Error).message}</p>}
          {holds.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!holds.isLoading && !holds.error && hd.length === 0 && <p className="text-sm text-slate-500">No invoices waiting on jig approval.</p>}
          {hd.map((h) => {
            const rejectDisabled = !noteOf(h.id) || holdMutation.isPending;
            return (
              <div key={h.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    Invoice <span className="font-mono">{h.invoice_number ?? "—"}</span>
                    <span className="font-normal text-slate-600"> · {h.party_name ?? "—"}</span>
                  </p>
                  <span className="text-xs text-slate-500">Invoice date {fmtDate(h.invoice_date)}</span>
                </div>
                <p className="text-xs text-slate-600">This vendor is holding jigs on closed jobs:</p>
                <ul className="text-sm text-slate-800 list-disc pl-5 space-y-0.5">
                  {(h.jigs_snapshot ?? []).map((j) => (
                    <li key={j.dc_jig_id}>
                      <span className="font-mono font-medium">{j.jig}</span>
                      {j.item ? ` · ${j.item}` : ""} · DC {j.dc ?? "—"} · outstanding {j.outstanding}
                      {j.days_out != null ? ` · ${j.days_out} days out` : ""}
                      {` · ${CUSTODY_BADGE[j.status as keyof typeof CUSTODY_BADGE]?.label ?? j.status}`}
                    </li>
                  ))}
                  {(h.jigs_snapshot ?? []).length === 0 && <li className="list-none text-slate-500">No jigs recorded in the snapshot.</li>}
                </ul>
                <Textarea
                  value={notes[h.id] ?? ""}
                  onChange={(ev) => setNote(h.id, ev.target.value)}
                  placeholder="Note (required to reject)"
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={holdMutation.isPending} onClick={() => holdMutation.mutate({ id: h.id, approve: true })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={rejectDisabled} onClick={() => holdMutation.mutate({ id: h.id, approve: false })}>
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
