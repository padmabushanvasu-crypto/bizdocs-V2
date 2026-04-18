import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, ArrowRight, Search, History, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAwaitingStoreLineItems,
  storeConfirmGRNItems,
  fetchStoreConfirmedHistory,
  type AwaitingStoreLineItem,
  type StoreConfirmedItem,
} from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";

// ── per-item editable state ──────────────────────────────────────────────────
type ItemState = {
  storeQty: string;
  location: string;
  checked: boolean;
};

// ── per-GRN form state ───────────────────────────────────────────────────────
type GrnFormState = {
  confirmedBy: string;
  confirmedAt: string;
  items: Record<string, ItemState>; // key = line item id
};

function buildInitialGrnForms(
  grouped: Record<string, AwaitingStoreLineItem[]>
): Record<string, GrnFormState> {
  const today = format(new Date(), "yyyy-MM-dd");
  const result: Record<string, GrnFormState> = {};
  for (const [grnId, items] of Object.entries(grouped)) {
    const itemStates: Record<string, ItemState> = {};
    for (const item of items) {
      itemStates[item.id] = {
        storeQty: item.conforming_qty != null ? String(item.conforming_qty) : "",
        location: "",
        checked: true,
      };
    }
    result[grnId] = { confirmedBy: "", confirmedAt: today, items: itemStates };
  }
  return result;
}

export default function GrnStoreQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [historySearch, setHistorySearch] = useState("");

  // ── data ──────────────────────────────────────────────────────────────────
  // Note: avoid inline `= []` default — it creates a new reference every render,
  // causing the grouped useMemo (and therefore the useEffect) to fire every render.
  const { data: lineItemsData, isLoading } = useQuery({
    queryKey: ["awaiting-store-line-items"],
    queryFn: fetchAwaitingStoreLineItems,
    staleTime: 30_000,
  });
  const lineItems = useMemo(() => lineItemsData ?? [], [lineItemsData]);

  const { data: historyData } = useQuery({
    queryKey: ["store-confirmed-history"],
    queryFn: fetchStoreConfirmedHistory,
    staleTime: 30_000,
  });
  const history = useMemo(() => historyData ?? [], [historyData]);

  // Group by GRN — memoised so it only changes when lineItems changes
  const grouped = useMemo(
    () => lineItems.reduce<Record<string, AwaitingStoreLineItem[]>>((acc, item) => {
      if (!acc[item.grn_id]) acc[item.grn_id] = [];
      acc[item.grn_id].push(item);
      return acc;
    }, {}),
    [lineItems]
  );

  // ── per-GRN form state ────────────────────────────────────────────────────
  const [grnForms, setGrnForms] = useState<Record<string, GrnFormState>>({});

  useEffect(() => {
    setGrnForms(buildInitialGrnForms(grouped));
  }, [grouped]);

  // ── helpers to update state ───────────────────────────────────────────────
  function setGrnField<K extends keyof Omit<GrnFormState, "items">>(
    grnId: string,
    field: K,
    value: GrnFormState[K]
  ) {
    setGrnForms((prev) => ({
      ...prev,
      [grnId]: { ...prev[grnId], [field]: value },
    }));
  }

  function setItemField(grnId: string, itemId: string, patch: Partial<ItemState>) {
    setGrnForms((prev) => ({
      ...prev,
      [grnId]: {
        ...prev[grnId],
        items: {
          ...prev[grnId]?.items,
          [itemId]: { ...prev[grnId]?.items?.[itemId], ...patch },
        },
      },
    }));
  }

  // ── stats ─────────────────────────────────────────────────────────────────
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

  // ── per-GRN confirm mutation factory ─────────────────────────────────────
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});

  async function handleConfirmGRN(grnId: string, grnItems: AwaitingStoreLineItem[]) {
    const form = grnForms[grnId];
    if (!form) return;

    if (!form.confirmedBy.trim()) {
      toast({ title: "Received By is required", variant: "destructive" });
      return;
    }

    const checkedItems = grnItems.filter((item) => form.items[item.id]?.checked);
    if (checkedItems.length === 0) {
      toast({ title: "No items selected", description: "Check at least one item to confirm.", variant: "destructive" });
      return;
    }

    setConfirming((prev) => ({ ...prev, [grnId]: true }));
    try {
      await storeConfirmGRNItems(
        grnId,
        checkedItems.map((item) => ({
          id: item.id,
          storeQty: form.items[item.id]?.storeQty
            ? Number(form.items[item.id].storeQty)
            : item.conforming_qty,
          location: form.items[item.id]?.location || null,
        })),
        { confirmedBy: form.confirmedBy, confirmedAt: form.confirmedAt }
      );
      await logAudit("grn", grnId, "Store receipt confirmed (batch)", {
        itemCount: checkedItems.length,
        confirmedBy: form.confirmedBy,
      });
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-line-items"] });
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-count"] });
      queryClient.invalidateQueries({ queryKey: ["store-confirmed-history"] });
      queryClient.invalidateQueries({ queryKey: ["grns"] });
      toast({
        title: "Store receipt confirmed",
        description: `${checkedItems.length} item${checkedItems.length !== 1 ? "s" : ""} received in store.`,
      });
    } catch (err: any) {
      toast({ title: "Error confirming receipt", description: err.message, variant: "destructive" });
    } finally {
      setConfirming((prev) => ({ ...prev, [grnId]: false }));
    }
  }

  const pendingGrnCount = Object.keys(grouped).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <PackageCheck className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Store Receipt Queue</h1>
          <p className="text-xs text-slate-500">
            GRNs cleared by QC and awaiting physical receipt confirmation
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-amber-200 bg-amber-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
            Pending Confirmation
          </p>
          <p className="text-3xl font-bold text-amber-900 mt-1 tabular-nums">{pendingGrnCount}</p>
          <p className="text-xs text-amber-600 mt-0.5">GRNs awaiting store receipt</p>
        </div>
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
            Confirmed Today
          </p>
          <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">
            {confirmedTodayCount}
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">items received in store today</p>
        </div>
      </div>

      {/* Pending queue */}
      {isLoading ? (
        <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
      ) : pendingGrnCount === 0 ? (
        <div className="border border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl p-14 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-800">All caught up</p>
          <p className="text-xs text-emerald-600 mt-1">No items awaiting store receipt</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([grnId, items]) => {
            const first = items[0];
            const form = grnForms[grnId];
            const checkedCount = form
              ? Object.values(form.items).filter((s) => s.checked).length
              : 0;
            const isSubmitting = confirming[grnId] ?? false;

            return (
              <div
                key={grnId}
                className="border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              >
                {/* GRN card header */}
                <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      className="font-mono font-bold text-white text-sm hover:underline"
                      onClick={() => navigate(`/grn/${grnId}`)}
                    >
                      {first.grn_number}
                    </button>
                    {first.vendor_name && (
                      <span className="text-xs text-slate-300">{first.vendor_name}</span>
                    )}
                    {first.grn_date && (
                      <span className="text-xs text-slate-400">
                        {format(new Date(first.grn_date), "dd MMM yyyy")}
                      </span>
                    )}
                    <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium tabular-nums">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-700"
                    onClick={() => navigate(`/grn/${grnId}`)}
                  >
                    View GRN <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 w-8" />
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                          Description
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                          Drawing No.
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                          QC Accepted
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                          Store Qty
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                          Location / Rack
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const itemState = form?.items[item.id];
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-slate-100 last:border-0 transition-colors ${
                              itemState?.checked ? "bg-white" : "bg-slate-50/60 opacity-60"
                            }`}
                          >
                            {/* Confirm checkbox */}
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={itemState?.checked ?? true}
                                onChange={(e) =>
                                  setItemField(grnId, item.id, { checked: e.target.checked })
                                }
                                className="h-4 w-4 accent-emerald-600 cursor-pointer"
                              />
                            </td>
                            {/* Description */}
                            <td className="px-3 py-2.5 text-slate-800">
                              <p className="font-medium leading-snug">{item.description}</p>
                            </td>
                            {/* Drawing number */}
                            <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">
                              {item.drawing_number || "—"}
                            </td>
                            {/* QC accepted qty */}
                            <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-slate-800">
                              {item.conforming_qty != null ? (
                                <>
                                  {item.conforming_qty}
                                  {item.unit && (
                                    <span className="text-xs text-slate-400 ml-1 font-normal">
                                      {item.unit}
                                    </span>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            {/* Store qty input */}
                            <td className="px-3 py-2.5 text-right">
                              <Input
                                type="number"
                                min={0}
                                value={itemState?.storeQty ?? ""}
                                onChange={(e) =>
                                  setItemField(grnId, item.id, { storeQty: e.target.value })
                                }
                                disabled={!itemState?.checked}
                                className="w-24 h-7 text-sm text-right tabular-nums ml-auto"
                              />
                            </td>
                            {/* Location input */}
                            <td className="px-3 py-2.5">
                              <Input
                                value={itemState?.location ?? ""}
                                onChange={(e) =>
                                  setItemField(grnId, item.id, { location: e.target.value })
                                }
                                disabled={!itemState?.checked}
                                placeholder="e.g. Rack A3, Bin 7"
                                className="h-7 text-sm min-w-[160px]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Card footer — confirm fields + button */}
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs font-medium text-slate-600">
                      Received By <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={form?.confirmedBy ?? ""}
                      onChange={(e) => setGrnField(grnId, "confirmedBy", e.target.value)}
                      placeholder="Full name"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-600">Date Received</Label>
                    <Input
                      type="date"
                      value={form?.confirmedAt ?? ""}
                      onChange={(e) => setGrnField(grnId, "confirmedAt", e.target.value)}
                      className="mt-1 h-8 text-sm w-40"
                    />
                  </div>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 self-end"
                    disabled={isSubmitting || checkedCount === 0 || !form?.confirmedBy.trim()}
                    onClick={() => handleConfirmGRN(grnId, items)}
                  >
                    {isSubmitting
                      ? "Saving…"
                      : `Confirm ${checkedCount} Item${checkedCount !== 1 ? "s" : ""}`}
                  </Button>
                </div>
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
            <p className="text-sm">
              {history.length === 0
                ? "No store receipts confirmed yet"
                : "No results match your search"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                    Description
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                    GRN Reference
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                    Confirmed By
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                    Date &amp; Time
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item: StoreConfirmedItem) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 text-sm text-slate-700 text-left">
                      <p className="font-medium leading-snug">{item.description}</p>
                      {item.drawing_number && (
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          {item.drawing_number}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 text-right tabular-nums font-mono font-semibold">
                      {item.conforming_qty != null ? item.conforming_qty : "—"}
                      {item.unit && (
                        <span className="text-xs text-slate-400 ml-1 font-normal">{item.unit}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 text-left">
                      <button
                        className="font-mono text-xs font-semibold text-blue-700 hover:underline"
                        onClick={() => navigate(`/grn/${item.grn_id}`)}
                      >
                        {item.grn_number}
                      </button>
                      {item.grn_date && (
                        <>
                          <span className="text-xs text-slate-400 mx-1">·</span>
                          <span className="text-xs text-slate-400">
                            {format(new Date(item.grn_date), "dd MMM yyyy")}
                          </span>
                        </>
                      )}
                      {item.vendor_name && (
                        <>
                          <span className="text-xs text-slate-400 mx-1">·</span>
                          <span className="text-xs text-slate-500">{item.vendor_name}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 text-left">
                      {item.store_confirmed_by || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 text-left tabular-nums whitespace-nowrap">
                      {item.store_confirmed_at
                        ? format(new Date(item.store_confirmed_at), "dd MMM yyyy, hh:mm a")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 text-left">
                      {item.store_location || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
