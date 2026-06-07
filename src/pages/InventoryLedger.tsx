import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  Download,
  Search,
  ArrowDownUp,
  Package,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { formatNumber } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { fetchItems, type Item } from "@/lib/items-api";
import {
  fetchItemLedger,
  fetchCurrentStock,
  downloadCsv,
  ledgerTypeLabel,
  ledgerTypeFlow,
  stateLabel,
  FLOW_BADGE_CLS,
  REFERENCE_ROUTES,
  type InventoryLedgerRow,
  type InventoryCurrentRow,
} from "@/lib/inventory-ledger-api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : format(d, "dd MMM yyyy");
}

function TypeBadge({ type }: { type: string }) {
  const flow = ledgerTypeFlow(type);
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${FLOW_BADGE_CLS[flow]}`}
    >
      {ledgerTypeLabel(type)}
    </span>
  );
}

function StateFlow({ row }: { row: InventoryLedgerRow }) {
  const from = stateLabel(row.from_state);
  const to = stateLabel(row.to_state);
  if (!from && !to) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs text-slate-600 whitespace-nowrap">
      <span className="text-slate-500">{from || "—"}</span>
      <span className="mx-1 text-slate-400">→</span>
      <span className="text-slate-700 font-medium">{to || "—"}</span>
    </span>
  );
}

// ── Item Ledger tab ────────────────────────────────────────────────────────────

function ItemLedgerTab({ initialItemId }: { initialItemId?: string | null }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: itemsData } = useQuery({
    queryKey: ["items-all-inventory-ledger"],
    queryFn: () => fetchItems({ status: "all" }),
  });
  const items = itemsData?.data ?? [];

  // Deep-link pre-select: once items load, select the URL-provided item once.
  useEffect(() => {
    if (!initialItemId || selectedItem) return;
    const match = items.find((i) => i.id === initialItemId);
    if (match) setSelectedItem(match);
  }, [initialItemId, items, selectedItem]);

  const { data: ledgerRows = [], isLoading } = useQuery({
    queryKey: ["inventory-item-ledger", selectedItem?.id],
    queryFn: () => fetchItemLedger(selectedItem!.id),
    enabled: !!selectedItem,
  });

  // Date filtering is display-only. running_balance is preserved from the view
  // (computed over full history) — we never recompute it here.
  const { openingBalance, displayRows, closingBalance, hasDateFilter } = useMemo(() => {
    const hasFilter = !!(dateFrom || dateTo);
    if (!hasFilter) {
      const closing = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].running_balance : 0;
      return {
        openingBalance: 0,
        displayRows: ledgerRows,
        closingBalance: closing,
        hasDateFilter: false,
      };
    }
    // Opening balance = running_balance of the last movement strictly before the range.
    let opening = 0;
    const inRange: InventoryLedgerRow[] = [];
    for (const row of ledgerRows) {
      const beforeRange = dateFrom && row.transaction_date < dateFrom;
      const afterRange = dateTo && row.transaction_date > dateTo;
      if (beforeRange) {
        opening = row.running_balance;
        continue;
      }
      if (afterRange) continue;
      inRange.push(row);
    }
    const closing = inRange.length ? inRange[inRange.length - 1].running_balance : opening;
    return {
      openingBalance: opening,
      displayRows: inRange,
      closingBalance: closing,
      hasDateFilter: true,
    };
  }, [ledgerRows, dateFrom, dateTo]);

  const handleExport = () => {
    if (!selectedItem || displayRows.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const rows = displayRows.map((r) => ({
      transaction_date: fmtDate(r.transaction_date),
      transaction_type: ledgerTypeLabel(r.transaction_type),
      reference_number: r.reference_number ?? "",
      qty_in: r.qty_in || "",
      qty_out: r.qty_out || "",
      running_balance: r.running_balance,
      from_state: stateLabel(r.from_state),
      to_state: stateLabel(r.to_state),
    }));
    downloadCsv(
      rows,
      [
        { key: "transaction_date", label: "Date" },
        { key: "transaction_type", label: "Type" },
        { key: "reference_number", label: "Reference" },
        { key: "qty_in", label: "Qty In" },
        { key: "qty_out", label: "Qty Out" },
        { key: "running_balance", label: "Running Balance" },
        { key: "from_state", label: "From State" },
        { key: "to_state", label: "To State" },
      ],
      `Item_Ledger_${selectedItem.item_code ?? "item"}_${format(new Date(), "yyyyMMdd")}.csv`,
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={itemOpen} onOpenChange={setItemOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="justify-between font-normal min-w-[280px]"
            >
              {selectedItem
                ? `${selectedItem.item_code} — ${selectedItem.description}`
                : "Select an item…"}
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-40" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <Command
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder="Search code, drawing no, description…" />
              <CommandList>
                <CommandEmpty>No item found.</CommandEmpty>
                <CommandGroup>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.item_code} ${item.drawing_number ?? ""} ${item.description}`}
                      onSelect={() => {
                        setSelectedItem(item);
                        setItemOpen(false);
                      }}
                    >
                      <div>
                        <p className="font-mono text-xs font-medium">
                          {item.item_code}
                          {item.drawing_number && (
                            <span className="ml-2 text-slate-400">{item.drawing_number}</span>
                          )}
                        </p>
                        <p className="text-sm">{item.description}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="w-[140px] text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            className="w-[140px] text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear dates
          </Button>
        )}

        <div className="ml-auto">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!selectedItem || displayRows.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Item header card */}
      {selectedItem && (
        <div className="paper-card flex flex-wrap items-center justify-between gap-3 !py-3">
          <div>
            <p className="font-mono text-sm font-semibold text-slate-900">
              {selectedItem.item_code}
              {selectedItem.drawing_number && (
                <span className="ml-2 font-normal text-slate-400">
                  {selectedItem.drawing_number}
                </span>
              )}
            </p>
            <p className="text-sm text-slate-600">{selectedItem.description}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {hasDateFilter ? "Closing (range)" : "Current Balance"}
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                closingBalance < 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {formatNumber(closingBalance)}
              <span className="ml-1 text-sm font-normal text-slate-500">
                {selectedItem.unit ?? ""}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Ledger table — bin-card style, chronological top→bottom */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Type</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Reference</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty In</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty Out</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Running Balance</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">From → To</th>
              </tr>
            </thead>
            <tbody>
              {!selectedItem ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">Select an item to view its ledger</p>
                    <p className="text-sm text-muted-foreground">
                      A per-item subsidiary ledger with running balance.
                    </p>
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : (
                <>
                  {hasDateFilter && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right border-b border-slate-100">
                        Opening Balance
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-700 border-b border-slate-100">
                        {formatNumber(openingBalance)}
                      </td>
                      <td className="border-b border-slate-100" />
                    </tr>
                  )}

                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                        No movements{hasDateFilter ? " in this date range" : ""}.
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((r) => {
                      const route = r.reference_type ? REFERENCE_ROUTES[r.reference_type] : null;
                      return (
                        <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 text-slate-700 border-b border-slate-100 whitespace-nowrap">
                            {fmtDate(r.transaction_date)}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-center">
                            <TypeBadge type={r.transaction_type} />
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            {r.reference_number && route && r.reference_id ? (
                              <button
                                className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                onClick={() => navigate(`${route}/${r.reference_id}`)}
                              >
                                {r.reference_number}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {r.reference_number ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                            {r.qty_in > 0 ? (
                              <span className="text-green-600 font-semibold">+{formatNumber(r.qty_in)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                            {r.qty_out > 0 ? (
                              <span className="text-red-600 font-semibold">−{formatNumber(r.qty_out)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums font-semibold ${
                              r.running_balance < 0 ? "text-red-600" : "text-slate-900"
                            }`}
                          >
                            {formatNumber(r.running_balance)}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            <StateFlow row={r} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </>
              )}
            </tbody>
            {selectedItem && displayRows.length > 0 && (
              <tfoot className="sticky bottom-0">
                <tr className="bg-slate-100">
                  <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wide text-right border-t border-slate-300">
                    Closing Balance
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums font-bold border-t border-slate-300 ${
                      closingBalance < 0 ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {formatNumber(closingBalance)}
                  </td>
                  <td className="border-t border-slate-300" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Closing Stock tab ──────────────────────────────────────────────────────────

type SortKey = "item_code" | "current_balance" | "last_movement_date";

function ClosingStockTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("item_code");
  const [nonZeroOnly, setNonZeroOnly] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory-current-stock"],
    queryFn: fetchCurrentStock,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (nonZeroOnly && Number(r.current_balance) === 0) return false;
      if (!term) return true;
      return (
        (r.item_code ?? "").toLowerCase().includes(term) ||
        (r.drawing_number ?? "").toLowerCase().includes(term) ||
        (r.item_description ?? "").toLowerCase().includes(term)
      );
    });
    out = [...out].sort((a, b) => {
      if (sortKey === "current_balance") {
        return Number(b.current_balance) - Number(a.current_balance);
      }
      if (sortKey === "last_movement_date") {
        return (b.last_movement_date ?? "").localeCompare(a.last_movement_date ?? "");
      }
      return (a.item_code ?? "").localeCompare(b.item_code ?? "");
    });
    return out;
  }, [rows, search, sortKey, nonZeroOnly]);

  const handleDownload = () => {
    if (filtered.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    exportToExcel(
      filtered,
      [
        { key: "drawing_number", label: "Drawing No", width: 16 },
        { key: "item_code", label: "Item Code", width: 14 },
        { key: "item_description", label: "Description", width: 32 },
        { key: "item_type", label: "Type", width: 14 },
        { key: "current_balance", label: "Current Balance", type: "number", width: 14 },
        { key: "unit", label: "Unit", width: 8 },
        { key: "last_movement_date", label: "Last Movement", type: "date", width: 14 },
      ],
      `Closing_Stock_${format(new Date(), "yyyyMMdd")}.xlsx`,
      "Closing Stock",
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code, drawing no, description…"
            className="pl-8 w-[280px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[200px]">
            <ArrowDownUp className="h-3.5 w-3.5 mr-1 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="item_code">Sort: Item Code</SelectItem>
            <SelectItem value="current_balance">Sort: Balance (high→low)</SelectItem>
            <SelectItem value="last_movement_date">Sort: Last Movement</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={nonZeroOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setNonZeroOnly((v) => !v)}
        >
          {nonZeroOnly ? "Showing non-zero" : "Show all"}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{filtered.length} items</span>
          <Button variant="outline" onClick={handleDownload} className="gap-1.5">
            <Download className="h-4 w-4" /> Download Closing Stock
          </Button>
        </div>
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item Code</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Type</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Current Balance</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Last Movement</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No items to show</p>
                  </td>
                </tr>
              ) : (
                filtered.map((r: InventoryCurrentRow) => (
                  <tr key={r.item_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 border-b border-slate-100 font-mono text-xs text-slate-500">
                      {r.drawing_number ?? "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 font-mono text-xs text-slate-700">
                      {r.item_code ?? "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700 max-w-[280px] truncate">
                      {r.item_description ?? "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 capitalize">
                      {(r.item_type ?? "—").replace(/_/g, " ")}
                    </td>
                    <td
                      className={`px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums font-semibold ${
                        Number(r.current_balance) < 0 ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {formatNumber(Number(r.current_balance))}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-500 text-xs">
                      {r.unit ?? "—"}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-600 whitespace-nowrap">
                      {fmtDate(r.last_movement_date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────────

export default function InventoryLedger() {
  const navigate = useNavigate();
  // Reuse the existing stock-ledger access key (same audience).
  useRoleAccess("stock-ledger");

  // Deep-link support: /inventory-ledger?item_id=<id> opens the Item Ledger tab
  // pre-selected to that item (used by the Stock Register drill-down).
  const [searchParams] = useSearchParams();
  const urlItemId = searchParams.get("item_id");
  const [tab, setTab] = useState(urlItemId ? "item-ledger" : "closing-stock");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-600" /> Inventory Ledger
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Per-item subsidiary ledger with running balance, and closing stock across all items.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="closing-stock">Closing Stock</TabsTrigger>
          <TabsTrigger value="item-ledger">Item Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="closing-stock">
          <ClosingStockTab />
        </TabsContent>
        <TabsContent value="item-ledger">
          <ItemLedgerTab initialItemId={urlItemId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
