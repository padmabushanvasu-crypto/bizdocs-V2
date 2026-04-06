import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, ArrowRight, Search, History } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAwaitingStoreLineItems,
  storeConfirmLineItem,
  fetchStoreConfirmedHistory,
  type AwaitingStoreLineItem,
  type StoreConfirmedItem,
} from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";

export default function GrnStoreQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedLine, setSelectedLine] = useState<AwaitingStoreLineItem | null>(null);
  const [confirmedBy, setConfirmedBy] = useState("");
  const [confirmedAt, setConfirmedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [location, setLocation]       = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const { data: lineItems = [], isLoading } = useQuery({
    queryKey: ["awaiting-store-line-items"],
    queryFn: fetchAwaitingStoreLineItems,
    staleTime: 30_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["store-confirmed-history"],
    queryFn: fetchStoreConfirmedHistory,
    staleTime: 30_000,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const confirmedTodayCount = history.filter(
    (item) => item.store_confirmed_at?.startsWith(today)
  ).length;

  const filteredHistory = historySearch.trim()
    ? history.filter(
        (item) =>
          item.description.toLowerCase().includes(historySearch.toLowerCase()) ||
          item.grn_number.toLowerCase().includes(historySearch.toLowerCase()) ||
          (item.vendor_name ?? "").toLowerCase().includes(historySearch.toLowerCase())
      )
    : history;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLine) throw new Error("No item selected");
      if (!confirmedBy.trim()) throw new Error("Received By is required");
      await storeConfirmLineItem(selectedLine.id, {
        confirmedBy,
        confirmedAt,
        location: location || null,
      });
      await logAudit("grn", selectedLine.grn_id, "Store receipt confirmed for line item", {
        lineItemId: selectedLine.id,
        description: selectedLine.description,
        confirmedBy,
        location,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-line-items"] });
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-count"] });
      queryClient.invalidateQueries({ queryKey: ["store-confirmed-history"] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      setSelectedLine(null);
      setConfirmedBy("");
      setLocation("");
      toast({ title: "Store receipt confirmed", description: "Item marked as received in store." });
    },
    onError: (err: any) =>
      toast({ title: "Error confirming receipt", description: err.message, variant: "destructive" }),
  });

  // Group line items by GRN for display
  const grouped = lineItems.reduce<Record<string, AwaitingStoreLineItem[]>>((acc, item) => {
    if (!acc[item.grn_id]) acc[item.grn_id] = [];
    acc[item.grn_id].push(item);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <PackageCheck className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Store Receipt Queue</h1>
          <p className="text-xs text-slate-500">Final GRN items cleared by QC and awaiting physical receipt confirmation</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-amber-200 bg-amber-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pending Confirmation</p>
          <p className="text-3xl font-bold text-amber-900 mt-1 tabular-nums">{lineItems.length}</p>
          <p className="text-xs text-amber-600 mt-0.5">items awaiting store receipt</p>
        </div>
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Confirmed Today</p>
          <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">{confirmedTodayCount}</p>
          <p className="text-xs text-emerald-600 mt-0.5">items received in store today</p>
        </div>
      </div>

      {/* Pending queue */}
      {isLoading ? (
        <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
      ) : lineItems.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <PackageCheck className="h-8 w-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium">No items awaiting store confirmation</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([grnId, items]) => {
            const first = items[0];
            return (
              <div key={grnId} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* GRN header */}
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      className="font-mono font-semibold text-blue-700 text-sm hover:underline"
                      onClick={() => navigate(`/grn/${grnId}`)}
                    >
                      {first.grn_number}
                    </button>
                    {first.vendor_name && (
                      <span className="text-xs text-slate-500">{first.vendor_name}</span>
                    )}
                    {first.grn_date && (
                      <span className="text-xs text-slate-400">
                        {format(new Date(first.grn_date), "dd MMM yyyy")}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-500"
                    onClick={() => navigate(`/grn/${grnId}`)}
                  >
                    View GRN <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>

                {/* Line items */}
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-white border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No.</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Conforming Qty</th>
                      <th className="px-3 py-2 bg-slate-50 border-b border-slate-200" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.description}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{item.drawing_number || "—"}</td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">
                          {item.conforming_qty != null ? item.conforming_qty : "—"}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => {
                              setSelectedLine(item);
                              setConfirmedAt(format(new Date(), "yyyy-MM-dd"));
                            }}
                          >
                            Confirm Receipt
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-800">Receipt History</h2>
            <span className="text-xs text-slate-400 tabular-nums">({history.length} items)</span>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Filter by item or GRN…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <p className="text-sm">{history.length === 0 ? "No store receipts confirmed yet" : "No results match your search"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">GRN Reference</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Confirmed By</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date & Time</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Location</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item: StoreConfirmedItem) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <p className="font-medium leading-snug">{item.description}</p>
                      {item.drawing_number && (
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{item.drawing_number}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">
                      {item.conforming_qty != null ? item.conforming_qty : "—"}
                      {item.unit && <span className="text-xs text-slate-400 ml-1 font-normal">{item.unit}</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <button
                        className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                        onClick={() => navigate(`/grn/${item.grn_id}`)}
                      >
                        {item.grn_number}
                      </button>
                      {item.grn_date && (
                        <span className="text-xs text-slate-400 mx-1">·</span>
                      )}
                      {item.grn_date && (
                        <span className="text-xs text-slate-400">
                          {format(new Date(item.grn_date), "dd MMM yyyy")}
                        </span>
                      )}
                      {item.vendor_name && (
                        <>
                          <span className="text-xs text-slate-400 mx-1">·</span>
                          <span className="text-xs text-slate-500">{item.vendor_name}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      {item.store_confirmed_by || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left tabular-nums whitespace-nowrap">
                      {item.store_confirmed_at
                        ? format(new Date(item.store_confirmed_at), "dd MMM yyyy, hh:mm a")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      {item.store_location || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!selectedLine} onOpenChange={(open) => { if (!open) setSelectedLine(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Store Receipt</DialogTitle>
          </DialogHeader>
          {selectedLine && (
            <div className="space-y-3 py-2">
              <div className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                <p className="font-medium">{selectedLine.description}</p>
                {selectedLine.drawing_number && (
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedLine.drawing_number}</p>
                )}
                {selectedLine.conforming_qty != null && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    Conforming Qty: <span className="font-semibold">{selectedLine.conforming_qty} units</span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">
                  Received By (Inward to Store) <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  className="mt-1 text-sm"
                  placeholder="Full name"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">
                  Date Received in Store <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="date"
                  value={confirmedAt}
                  onChange={(e) => setConfirmedAt(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Physical Location / Rack</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 text-sm"
                  placeholder="e.g. Rack A3, Bin 7"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLine(null)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? "Saving…" : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
