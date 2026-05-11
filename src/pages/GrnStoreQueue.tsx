import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchGrnStoreReceiptQueue,
  storeConfirmGRNItems,
  type GrnStoreReceiptCard,
} from "@/lib/grn-api";
import { logAudit } from "@/lib/audit-api";
import { formatNumber } from "@/lib/gst-utils";

type StatusFilter = "pending" | "confirmed" | "partial" | "all";

type ItemState = {
  storeQty: string;
  location: string;
  damagedQty: string;
  damagedReason: string;
  notes: string;
  checked: boolean;
};

type GrnFormState = {
  confirmedBy: string;
  confirmedAt: string;
  items: Record<string, ItemState>; // key = line item id (pending lines only)
};

function cardStatusBadge(status: "pending" | "confirmed" | "partial") {
  if (status === "pending") {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800/50">
        Pending
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200 dark:border-blue-800/50">
        Closed (with damage)
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50">
      Confirmed
    </Badge>
  );
}

function buildInitialFormForCard(card: GrnStoreReceiptCard): GrnFormState {
  const today = format(new Date(), "yyyy-MM-dd");
  const items: Record<string, ItemState> = {};
  for (const li of card.line_items) {
    if (li.store_confirmed) continue; // already-confirmed lines aren't editable
    items[li.id] = {
      storeQty: li.remaining_qty > 0 ? String(li.remaining_qty) : "",
      location: li.store_location ?? "",
      damagedQty: "",
      damagedReason: "",
      notes: "",
      checked: true,
    };
  }
  return { confirmedBy: "", confirmedAt: today, items };
}

// Last-6-months options, prefixed with an "All months" sentinel so confirmed /
// partial / all views can show the full history floor. We use "all" (not "")
// because Radix Select forbids empty-string Item values (reserved for the
// placeholder slot and throws at render).
const ALL_MONTHS = "all";
const monthOptions: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [
    { value: ALL_MONTHS, label: "All months" },
  ];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
})();

// First non-sentinel entry = current month (operational default for "pending").
const CURRENT_MONTH = monthOptions[1].value;

const monthLabel = (m: string): string => {
  if (!m || m === ALL_MONTHS) return "All months";
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
};

export default function GrnStoreQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [month, setMonth] = useState<string>(CURRENT_MONTH);

  // When the user flips status away from "pending", auto-broaden to All months
  // so the history floor stays visible without forcing them to also pick a month.
  // When they flip back to "pending" from All months, restore the current-month
  // operational default. (Manual month picks after the auto-switch are honored.)
  const onStatusChange = (newStatus: StatusFilter) => {
    setStatusFilter(newStatus);
    if (newStatus !== "pending") {
      setMonth(ALL_MONTHS);
    } else if (month === ALL_MONTHS) {
      setMonth(CURRENT_MONTH);
    }
  };

  const { data: cardsData, isLoading } = useQuery({
    queryKey: ["grn-store-queue", statusFilter, month],
    queryFn: () =>
      fetchGrnStoreReceiptQueue({
        status: statusFilter !== "all" ? statusFilter : undefined,
        month: month && month !== ALL_MONTHS ? month : undefined,
      }),
    staleTime: 30_000,
  });
  const cards = useMemo(() => cardsData ?? [], [cardsData]);

  // Per-GRN form state — only built for cards that have pending lines.
  const [grnForms, setGrnForms] = useState<Record<string, GrnFormState>>({});

  useEffect(() => {
    const next: Record<string, GrnFormState> = {};
    for (const card of cards) {
      if (card.pending_lines > 0) {
        next[card.grn_id] = buildInitialFormForCard(card);
      }
    }
    setGrnForms(next);
  }, [cards]);

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

  const [confirming, setConfirming] = useState<Record<string, boolean>>({});

  async function handleConfirmGRN(card: GrnStoreReceiptCard) {
    const grnId = card.grn_id;
    const form = grnForms[grnId];
    if (!form) return;

    if (!form.confirmedBy.trim()) {
      toast({ title: "Received By is required", variant: "destructive" });
      return;
    }

    const pendingLines = card.line_items.filter((li) => !li.store_confirmed);
    const checkedItems = pendingLines.filter((li) => form.items[li.id]?.checked);
    if (checkedItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Check at least one item to confirm.",
        variant: "destructive",
      });
      return;
    }

    setConfirming((prev) => ({ ...prev, [grnId]: true }));
    try {
      await storeConfirmGRNItems(
        grnId,
        checkedItems.map((item) => {
          const s = form.items[item.id];
          return {
            id: item.id,
            storeQty: s?.storeQty ? Number(s.storeQty) : item.conforming_qty,
            location: s?.location || null,
            damagedQty: s?.damagedQty ? Number(s.damagedQty) : null,
            damagedReason: s?.damagedReason || null,
            notes: s?.notes || null,
          };
        }),
        { confirmedBy: form.confirmedBy, confirmedAt: form.confirmedAt }
      );
      await logAudit("grn", grnId, "Store receipt confirmed (batch)", {
        itemCount: checkedItems.length,
        confirmedBy: form.confirmedBy,
      });
      queryClient.invalidateQueries({ queryKey: ["grn-store-queue"] });
      queryClient.invalidateQueries({ queryKey: ["awaiting-store-count"] });
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

  // Status-aware empty-state copy + icon. Month-aware where useful to hint at
  // the "All months" escape hatch when a narrow month picks up nothing.
  const emptyState = {
    pending: {
      title: "All caught up",
      detail: "No items awaiting store receipt",
      Icon: CheckCircle2,
      tone: "emerald" as const,
    },
    confirmed: {
      title:
        month && month !== ALL_MONTHS
          ? `No confirmations in ${monthLabel(month)}`
          : "No confirmations match the selected filters",
      detail:
        month && month !== ALL_MONTHS
          ? "Try 'All months' or pick a different period"
          : "Try switching the month filter",
      Icon: PackageCheck,
      tone: "slate" as const,
    },
    partial: {
      title:
        month && month !== ALL_MONTHS
          ? `No GRNs with damaged items in ${monthLabel(month)}`
          : "No GRNs with damaged items",
      detail:
        month && month !== ALL_MONTHS
          ? "Try 'All months' or pick a different period"
          : "All receipts came in clean",
      Icon: CheckCircle2,
      tone: "emerald" as const,
    },
    all: {
      title:
        month && month !== ALL_MONTHS
          ? `No GRN inward records in ${monthLabel(month)}`
          : "No GRN inward records",
      detail:
        month && month !== ALL_MONTHS
          ? "Try 'All months' for full history"
          : "Limited to 200 most recent",
      Icon: PackageCheck,
      tone: "slate" as const,
    },
  }[statusFilter];
  const EmptyIcon = emptyState.Icon;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <PackageCheck className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Inward Receipt Queue
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            GRNs cleared by QC and awaiting physical receipt confirmation
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending Confirmation</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="partial">With Damage</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
      ) : cards.length === 0 ? (
        <div
          className={`border border-dashed rounded-xl p-14 text-center ${
            emptyState.tone === "emerald"
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-slate-200 bg-slate-50/40 dark:border-white/10 dark:bg-[#0a0e1a]/40"
          }`}
        >
          <EmptyIcon
            className={`h-10 w-10 mx-auto mb-3 ${
              emptyState.tone === "emerald" ? "text-emerald-500" : "text-slate-400"
            }`}
          />
          <p
            className={`text-sm font-semibold ${
              emptyState.tone === "emerald"
                ? "text-emerald-800"
                : "text-slate-700 dark:text-slate-200"
            }`}
          >
            {emptyState.title}
          </p>
          <p
            className={`text-xs mt-1 ${
              emptyState.tone === "emerald" ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {emptyState.detail}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {cards.map((card) => {
            const form = grnForms[card.grn_id];
            const checkedCount = form
              ? Object.values(form.items).filter((s) => s.checked).length
              : 0;
            const isSubmitting = confirming[card.grn_id] ?? false;
            const showFooter = card.pending_lines > 0;

            return (
              <div
                key={card.grn_id}
                className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Card header */}
                <div className="bg-slate-800 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      className="font-mono font-bold text-white text-sm hover:underline"
                      onClick={() => navigate(`/grn/${card.grn_id}`)}
                    >
                      {card.grn_number}
                    </button>
                    {cardStatusBadge(card.card_status)}
                    {card.grn_type === "dc_grn" && (
                      <Badge variant="outline" className="text-[10px] text-slate-200 border-slate-500">
                        DC GRN
                      </Badge>
                    )}
                    {card.vendor_name && (
                      <span className="text-xs text-slate-300">{card.vendor_name}</span>
                    )}
                    {card.grn_date && (
                      <span className="text-xs text-slate-400">
                        {format(new Date(card.grn_date), "dd MMM yyyy")}
                      </span>
                    )}
                    <span className="text-xs bg-slate-700 text-slate-200 px-2 py-0.5 rounded-full font-medium tabular-nums">
                      {card.total_lines} item{card.total_lines !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-300 hover:text-white hover:bg-slate-700"
                    onClick={() => navigate(`/grn/${card.grn_id}`)}
                  >
                    View GRN <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#0a0e1a] border-b border-slate-200 dark:border-white/10">
                        {showFooter && <th className="px-3 py-2 w-8" />}
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-left">
                          Description
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-left">
                          Drawing No.
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">
                          {showFooter ? "Remaining" : "QC Accepted"}
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">
                          Store Qty
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">
                          Damaged Qty
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-left">
                          Damage Reason
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-left">
                          Location / Rack
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-left">
                          {showFooter ? "Notes" : "Notes / When"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.line_items.map((item) => {
                        // Read-only row — line has been fully confirmed.
                        if (item.store_confirmed) {
                          return (
                            <tr
                              key={item.id}
                              className="border-b border-slate-100 dark:border-white/5 last:border-0 bg-emerald-50/30 dark:bg-emerald-900/10"
                            >
                              {showFooter && (
                                <td className="px-3 py-2.5 text-center text-emerald-600">
                                  <CheckCircle2 className="h-4 w-4 inline-block" />
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                                <p className="font-medium leading-snug">{item.description}</p>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                {item.drawing_number || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-slate-800 dark:text-slate-200">
                                {formatNumber(item.conforming_qty)}
                                {item.unit && (
                                  <span className="text-xs text-slate-400 ml-1 font-normal">
                                    {item.unit}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-300">
                                {formatNumber(item.store_confirmed_qty)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-mono text-rose-600 dark:text-rose-300">
                                {item.damaged_qty > 0 ? formatNumber(item.damaged_qty) : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                                {item.damaged_reason || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                                {item.store_location || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                                {item.store_confirmation_notes && (
                                  <div className="mb-1">{item.store_confirmation_notes}</div>
                                )}
                                <div className="text-[10px] text-slate-400">
                                  {item.store_confirmed_at
                                    ? format(
                                        new Date(item.store_confirmed_at),
                                        "dd MMM yyyy, hh:mm a"
                                      )
                                    : "—"}
                                  {item.store_confirmed_by && (
                                    <> · {item.store_confirmed_by}</>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        // Editable pending row.
                        const itemState = form?.items[item.id];
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-slate-100 dark:border-white/5 last:border-0 transition-colors ${
                              itemState?.checked
                                ? "bg-white dark:bg-[#0f1525]"
                                : "bg-slate-50/60 dark:bg-[#0a0e1a]/60 opacity-60"
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={itemState?.checked ?? true}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    checked: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 accent-emerald-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                              <p className="font-medium leading-snug">{item.description}</p>
                              {item.store_confirmed_qty > 0 && (
                                <p className="text-[11px] text-emerald-600 mt-0.5">
                                  Already received: {formatNumber(item.store_confirmed_qty)} of{" "}
                                  {formatNumber(item.conforming_qty)}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                              {item.drawing_number || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {formatNumber(item.remaining_qty)}
                              {item.unit && (
                                <span className="text-xs text-slate-400 ml-1 font-normal">
                                  {item.unit}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Input
                                type="number"
                                min={0}
                                value={itemState?.storeQty ?? ""}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    storeQty: e.target.value,
                                  })
                                }
                                disabled={!itemState?.checked}
                                className="w-24 h-7 text-sm text-right tabular-nums ml-auto"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Input
                                type="number"
                                min={0}
                                value={itemState?.damagedQty ?? ""}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    damagedQty: e.target.value,
                                  })
                                }
                                disabled={!itemState?.checked}
                                placeholder="0"
                                className="w-20 h-7 text-sm text-right tabular-nums ml-auto"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Input
                                value={itemState?.damagedReason ?? ""}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    damagedReason: e.target.value,
                                  })
                                }
                                disabled={!itemState?.checked || !itemState?.damagedQty}
                                placeholder="Reason…"
                                className="h-7 text-sm min-w-[140px]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Input
                                value={itemState?.location ?? ""}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    location: e.target.value,
                                  })
                                }
                                disabled={!itemState?.checked}
                                placeholder="e.g. Rack A3, Bin 7"
                                className="h-7 text-sm min-w-[140px]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Input
                                value={itemState?.notes ?? ""}
                                onChange={(e) =>
                                  setItemField(card.grn_id, item.id, {
                                    notes: e.target.value,
                                  })
                                }
                                disabled={!itemState?.checked}
                                placeholder="Optional note…"
                                className="h-7 text-sm min-w-[140px]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Confirm footer — only when card has pending lines */}
                {showFooter && (
                  <div className="bg-slate-50 dark:bg-[#0a0e1a] border-t border-slate-200 dark:border-white/10 px-4 py-3 flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[180px]">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Received By <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        value={form?.confirmedBy ?? ""}
                        onChange={(e) => setGrnField(card.grn_id, "confirmedBy", e.target.value)}
                        placeholder="Full name"
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Date Received
                      </Label>
                      <Input
                        type="date"
                        value={form?.confirmedAt ?? ""}
                        onChange={(e) => setGrnField(card.grn_id, "confirmedAt", e.target.value)}
                        className="mt-1 h-8 text-sm w-40"
                      />
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 self-end"
                      disabled={isSubmitting || checkedCount === 0 || !form?.confirmedBy.trim()}
                      onClick={() => handleConfirmGRN(card)}
                    >
                      {isSubmitting
                        ? "Saving…"
                        : `Confirm ${checkedCount} Item${checkedCount !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
