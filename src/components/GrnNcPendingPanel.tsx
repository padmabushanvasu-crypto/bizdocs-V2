import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { createNcReworkDc, fetchGrnNcPending, scrapNcHold } from "@/lib/grn-api";

interface Props {
  grnId: string;
  role: string | null | undefined;
}

const TH = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200";

export function GrnNcPendingPanel({ grnId, role }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canScrap = role === "admin" || role === "qc_team";

  const { data: rows = [], error } = useQuery({
    queryKey: ["grn-nc-pending", grnId],
    queryFn: () => fetchGrnNcPending(grnId),
  });

  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [scrapLine, setScrapLine] = useState<string | null>(null);
  const [scrapReason, setScrapReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["grn-nc-pending", grnId] });

  const sendBack = useMutation({
    mutationFn: ({ lineId, qty }: { lineId: string; qty: number }) => createNcReworkDc(lineId, qty),
    onSuccess: (res) => {
      refresh();
      toast({ title: `Rework DC ${res.dc_number} drafted` });
      navigate(`/delivery-challans/${res.dc_id}/edit`);
    },
    onError: (err: Error) => toast({ title: "Could not create rework DC", description: err.message, variant: "destructive" }),
  });

  const scrap = useMutation({
    mutationFn: ({ lineId, qty, reason }: { lineId: string; qty: number; reason: string }) =>
      scrapNcHold(lineId, qty, reason),
    onSuccess: () => {
      refresh();
      setScrapLine(null);
      setScrapReason("");
      toast({ title: "Held units scrapped" });
    },
    onError: (err: Error) => toast({ title: "Could not scrap held units", description: err.message, variant: "destructive" }),
  });

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-xl px-4 py-3 text-xs text-red-700 no-print">
        Could not load pending non-conformance: {(error as Error).message}
      </div>
    );
  }
  const visible = rows.filter((r) => r.rejected_qty > 0);
  if (visible.length === 0) return null;

  const qtyFor = (id: string, max: number) => {
    const n = Number(qtyByLine[id] ?? max);
    return Number.isFinite(n) ? n : 0;
  };
  const busy = sendBack.isPending || scrap.isPending;

  return (
    <div className="border border-red-200 bg-red-50/30 rounded-xl overflow-hidden no-print">
      <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
        <h3 className="text-sm font-bold text-red-900">Rejected Units — Pending Action</h3>
      </div>
      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>Item</th>
              <th className={`${TH} text-right`}>Rejected</th>
              <th className={`${TH} text-right`}>Held now</th>
              <th className={`${TH} text-right`}>On draft DC</th>
              <th className={`${TH} text-right`}>Sent to processor</th>
              <th className={`${TH} text-right`}>Received back</th>
              <th className={`${TH} text-right`}>Scrapped</th>
              <th className={`${TH} text-left`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const available = Math.max(0, r.held_now - r.planned_on_draft_dc);
              const qty = qtyFor(r.grn_line_item_id, available);
              const qtyValid = qty > 0 && qty <= available;
              const scrapping = scrapLine === r.grn_line_item_id;
              return (
                <tr key={r.grn_line_item_id} className="align-top">
                  <td className="px-3 py-2 border-b border-slate-100 text-slate-700">{r.description ?? r.item_id ?? "—"}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.rejected_qty)}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.held_now)}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.planned_on_draft_dc)}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.sent_to_processor)}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.received_back)}</td>
                  <td className="px-3 py-2 border-b border-slate-100 text-right font-mono">{formatNumber(r.scrapped)}</td>
                  <td className="px-3 py-2 border-b border-slate-100">
                    {available > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={available}
                            className="w-20 h-8 text-xs text-right"
                            value={qtyByLine[r.grn_line_item_id] ?? String(available)}
                            onChange={(e) => setQtyByLine((p) => ({ ...p, [r.grn_line_item_id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!qtyValid || busy}
                            onClick={() => sendBack.mutate({ lineId: r.grn_line_item_id, qty })}
                          >
                            Send back to processor
                          </Button>
                          {canScrap && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-700"
                              disabled={!qtyValid || busy}
                              onClick={() => { setScrapLine(scrapping ? null : r.grn_line_item_id); setScrapReason(""); }}
                            >
                              Scrap
                            </Button>
                          )}
                        </div>
                        {!qtyValid && (
                          <p className="text-[10px] text-red-600">Enter 1 to {formatNumber(available)}.</p>
                        )}
                        {canScrap && scrapping && (
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 text-xs w-56"
                              placeholder="Scrap reason (required)"
                              value={scrapReason}
                              onChange={(e) => setScrapReason(e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!qtyValid || !scrapReason.trim() || busy}
                              onClick={() => scrap.mutate({ lineId: r.grn_line_item_id, qty, reason: scrapReason.trim() })}
                            >
                              Confirm scrap {formatNumber(qty)}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Nothing available to action</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
