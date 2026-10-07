import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  fetchJigCustody,
  fetchJigEventsForDcJig,
  compareCustody,
  CUSTODY_BADGE,
  EVENT_LABEL,
  type JigCustodyRow,
} from "@/lib/jig-custody-api";
import type { CustodyStatus } from "@/lib/grn-jigs-api";

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 whitespace-nowrap";
const TD = "px-3 py-2 text-sm text-slate-700 border-b border-slate-100";
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d: string) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function StatusBadge({ status }: { status: CustodyStatus }) {
  const b = CUSTODY_BADGE[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${b.cls}`}>{b.label}</span>;
}

function EventsDrawer({ row, onClose }: { row: JigCustodyRow | null; onClose: () => void }) {
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["jig-events", row?.dc_jig_id],
    queryFn: () => fetchJigEventsForDcJig(row!.dc_jig_id),
    enabled: !!row,
  });
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row?.jig_number} — history</SheetTitle>
          <SheetDescription>
            {row?.dc_number} · {row?.party_name} · sent {row?.qty_sent}, returned {row?.returned_qty}, outstanding {row?.outstanding_qty}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
          {!isLoading && !error && events.length === 0 && <p className="text-sm text-slate-500">No events yet — jig is still with the vendor.</p>}
          {events.map((e) => (
            <div key={e.id} className={`rounded-lg border p-3 text-sm ${e.reversed ? "bg-slate-50 text-slate-400" : "bg-white"}`}>
              <div className={e.reversed ? "line-through" : ""}>
                <p className="font-medium text-slate-800">
                  {EVENT_LABEL[e.event_type] ?? e.event_type}
                  {e.qty != null ? ` · qty ${e.qty}` : ""}
                </p>
                <p className="text-xs text-slate-600">
                  {e.grn_number ? `GRN ${e.grn_number}` : ""}
                  {e.grn_number && e.linked_dc_number ? " · " : ""}
                  {e.linked_dc_number ? `Linked DC ${e.linked_dc_number}` : ""}
                </p>
                {e.reason && <p className="text-xs text-slate-600">Reason: {e.reason}</p>}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {e.created_by_name ?? "—"} · {fmtDateTime(e.created_at)}
                {e.reversed ? " · reversed" : ""}
              </p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function JigTracker() {
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [jigQ, setJigQ] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [dcQ, setDcQ] = useState("");
  const [selected, setSelected] = useState<JigCustodyRow | null>(null);

  const { data: all = [], isLoading, error } = useQuery({
    queryKey: ["jig-custody"],
    queryFn: fetchJigCustody,
    staleTime: 0,
  });

  const vendors = useMemo(
    () => [...new Map(all.filter((r) => r.party_id).map((r) => [r.party_id!, r.party_name ?? "—"])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
    [all],
  );

  const rows = useMemo(() => {
    const has = (v: string | null | undefined, q: string) => (v ?? "").toLowerCase().includes(q.trim().toLowerCase());
    return all
      .filter((r) => showAll || r.outstanding_qty > 0)
      .filter((r) => status === "all" || r.custody_status === status)
      .filter((r) => vendor === "all" || r.party_id === vendor)
      .filter((r) => !jigQ.trim() || has(r.jig_number, jigQ))
      .filter((r) => !itemQ.trim() || has(r.item_code, itemQ) || has(r.item_description, itemQ))
      .filter((r) => !dcQ.trim() || has(r.dc_number, dcQ) || has(r.linked_dc_number, dcQ))
      .sort(compareCustody);
  }, [all, showAll, status, vendor, jigQ, itemQ, dcQ]);

  const rowTone = (s: CustodyStatus) => (s === "with_vendor_job_closed" ? "bg-red-50/60" : "");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Wrench className="h-6 w-6 text-slate-500" /> Jig Tracker</h1>
        <p className="text-sm text-slate-500 mt-1">Where every jig sent on a DC is now — with which vendor, how long, and what is still outstanding</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-56 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CUSTODY_BADGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={vendor} onValueChange={setVendor}>
          <SelectTrigger className="w-full sm:w-56 h-9"><SelectValue placeholder="Vendor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={jigQ} onChange={(e) => setJigQ(e.target.value)} placeholder="Jig" className="h-9 w-full sm:w-32" />
        <Input value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder="Item" className="h-9 w-full sm:w-40" />
        <Input value={dcQ} onChange={(e) => setDcQ(e.target.value)} placeholder="DC" className="h-9 w-full sm:w-32" />
        <Button variant={showAll ? "default" : "outline"} size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Showing all" : "Show all"}
        </Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{(error as Error).message}</div>}
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-slate-500">{showAll ? "No jigs match." : "No jigs outstanding."}</p>
      )}

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr>
                {["Jig", "Item", "Vendor", "DC", "JO", "Sent", "Days out"].map((h) => <th key={h} className={`${TH} text-left`}>{h}</th>)}
                {["Sent", "Returned", "Written off", "Outstanding", "DC pending"].map((h) => <th key={h} className={`${TH} text-right`}>{h}</th>)}
                <th className={`${TH} text-left`}>Linked DC</th>
                <th className={`${TH} text-left`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dc_jig_id} className={`cursor-pointer hover:bg-slate-50 ${rowTone(r.custody_status)}`} onClick={() => setSelected(r)}>
                  <td className={`${TD} font-mono font-semibold`}>{r.jig_number}</td>
                  <td className={TD}>{r.item_code} <span className="text-slate-500">{r.item_description}</span></td>
                  <td className={TD}>{r.party_name ?? "—"}</td>
                  <td className={`${TD} font-mono`}>{r.dc_number ?? "—"}</td>
                  <td className={TD}>{r.job_order_numbers ?? "—"}</td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtDate(r.sent_at)}</td>
                  <td className={`${TD} tabular-nums`}>{r.days_out ?? "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.qty_sent}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.returned_qty}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.written_off_qty}{r.wo_pending_qty > 0 ? ` (+${r.wo_pending_qty} pending)` : ""}</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`}>{r.outstanding_qty}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.dc_pending_qty ?? "—"}</td>
                  <td className={TD}>
                    {r.linked_dc_number ? <>{r.linked_dc_number} <span className="text-slate-500">({r.linked_dc_pending_qty ?? "—"})</span></> : "—"}
                  </td>
                  <td className={TD}><StatusBadge status={r.custody_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <button
            key={r.dc_jig_id}
            type="button"
            onClick={() => setSelected(r)}
            className={`w-full text-left rounded-lg border border-slate-200 p-3 space-y-1 ${r.custody_status === "with_vendor_job_closed" ? "bg-red-50" : "bg-white"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono font-semibold text-slate-900">{r.jig_number}</span>
              <StatusBadge status={r.custody_status} />
            </div>
            <p className="text-xs text-slate-600">{r.item_code} {r.item_description}</p>
            <p className="text-xs text-slate-600">{r.party_name ?? "—"} · {r.dc_number ?? "—"}{r.job_order_numbers ? ` · JO ${r.job_order_numbers}` : ""}</p>
            <p className="text-xs text-slate-600">
              Sent {fmtDate(r.sent_at)} · {r.days_out ?? "—"} days out
            </p>
            <p className="text-xs text-slate-800">
              Sent {r.qty_sent} · returned {r.returned_qty} · written off {r.written_off_qty} · <strong>outstanding {r.outstanding_qty}</strong>
            </p>
            {(r.dc_pending_qty != null || r.linked_dc_number) && (
              <p className="text-xs text-slate-500">
                DC pending {r.dc_pending_qty ?? "—"}
                {r.linked_dc_number ? ` · linked ${r.linked_dc_number} (${r.linked_dc_pending_qty ?? "—"})` : ""}
              </p>
            )}
          </button>
        ))}
      </div>

      <EventsDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
