import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BookOpen, Search, Download, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { fetchStockLedger, type StockLedgerFilters } from "@/lib/assembly-orders-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { exportToExcel } from "@/lib/export-utils";
import { formatCurrency } from "@/lib/gst-utils";
import { format } from "date-fns";

const TXN_LABELS: Record<string, { label: string; cls: string }> = {
  grn_receipt:           { label: "GRN Receipt",       cls: "bg-green-100 text-green-800" },
  assembly_consumption:  { label: "Assembly Used",      cls: "bg-purple-100 text-purple-800" },
  assembly_output:       { label: "Assembly Built",     cls: "bg-blue-100 text-blue-800" },
  job_card_issue:        { label: "Job Work Issue",     cls: "bg-amber-100 text-amber-800" },
  job_card_return:       { label: "Job Work Return",    cls: "bg-teal-100 text-teal-800" },
  invoice_dispatch:      { label: "Dispatched",         cls: "bg-red-100 text-red-800" },
  dc_issue:              { label: "DC Issue",           cls: "bg-orange-100 text-orange-800" },
  dc_return:             { label: "DC Return",          cls: "bg-cyan-100 text-cyan-800" },
  opening_stock:         { label: "Opening Stock",      cls: "bg-slate-100 text-slate-700" },
  manual_adjustment:     { label: "Adjustment",         cls: "bg-gray-100 text-gray-700" },
  rejection_writeoff:    { label: "Write-Off",          cls: "bg-red-200 text-red-900" },
};

const ROUTE_MAP: Record<string, string> = {
  assembly_order: "/assembly-orders",
  purchase_order: "/purchase-orders",
  delivery_challan: "/delivery-challans",
  invoice: "/invoices",
  grn: "/grn",
  job_card: "/job-works",
};

export default function StockLedger() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState<StockLedgerFilters>({
    page: 1,
    pageSize: 50,
  });

  const STATE_LABELS: Record<string, { label: string; cls: string }> = {
    raw_material:    { label: "Raw Mat",   cls: "bg-slate-100 text-slate-600" },
    wip:             { label: "WIP",       cls: "bg-amber-100 text-amber-700" },
    finished_goods:  { label: "Finished",  cls: "bg-green-100 text-green-700" },
  };

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: itemsData } = useQuery({
    queryKey: ["items-all-ledger"],
    queryFn: () => fetchItems({ status: "all", pageSize: 500 }),
  });
  const items = itemsData?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["stock-ledger", filters],
    queryFn: () => fetchStockLedger(filters),
  });

  const entries = data?.data ?? [];

  const handleItemSelect = (item: Item | null) => {
    setSelectedItem(item);
    setFilters((f) => ({ ...f, item_id: item?.id ?? undefined, page: 1 }));
    setItemOpen(false);
  };

  const handleDateFilter = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setFilters((f) => ({
      ...f,
      date_from: from || undefined,
      date_to: to || undefined,
      page: 1,
    }));
  };

  const handleExport = async () => {
    if (entries.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    exportToExcel(
      entries.map((e) => ({
        ...e,
        transaction_type_label: TXN_LABELS[e.transaction_type]?.label ?? e.transaction_type,
      })),
      [
        { key: "transaction_date", label: "Date", type: "date", width: 12 },
        { key: "item_code", label: "Item Code", width: 14 },
        { key: "item_description", label: "Description", width: 30 },
        { key: "transaction_type_label", label: "Transaction Type", width: 20 },
        { key: "reference_number", label: "Reference", width: 16 },
        { key: "qty_in", label: "Qty In", type: "number", width: 10 },
        { key: "qty_out", label: "Qty Out", type: "number", width: 10 },
        { key: "balance_qty", label: "Balance", type: "number", width: 10 },
        { key: "unit_cost", label: "Unit Cost", type: "currency", width: 12 },
        { key: "total_value", label: "Total Value", type: "currency", width: 14 },
      ],
      `Stock_Ledger_${format(new Date(), "yyyyMMdd")}.xlsx`,
      "Stock Ledger"
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" /> Stock Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">Complete history of every stock movement</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-1.5 flex-shrink-0">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Item selector */}
        <Popover open={itemOpen} onOpenChange={setItemOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="justify-between font-normal min-w-[220px]">
              {selectedItem ? `${selectedItem.item_code} — ${selectedItem.description}` : "All items..."}
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-40" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search items..." />
              <CommandList>
                <CommandEmpty>No item found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__all__" onSelect={() => handleItemSelect(null)}>
                    <span className="text-muted-foreground">All items</span>
                  </CommandItem>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.item_code} ${item.description}`}
                      onSelect={() => handleItemSelect(item)}
                    >
                      <div>
                        <p className="font-mono text-xs font-medium">{item.item_code}</p>
                        <p className="text-sm">{item.description}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Transaction type */}
        <Select
          value={filters.transaction_type ?? "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, transaction_type: v === "all" ? undefined : v, page: 1 }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Transaction type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TXN_LABELS).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Stock state filter */}
        <Select
          value={filters.stock_state ?? "all"}
          onValueChange={(v) => setFilters((f) => ({ ...f, stock_state: v === "all" ? undefined : v, page: 1 }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stock state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="raw_material">Raw Material</SelectItem>
            <SelectItem value="wip">WIP</SelectItem>
            <SelectItem value="finished_goods">Finished Goods</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="w-[140px] text-sm"
            value={dateFrom}
            onChange={(e) => handleDateFilter(e.target.value, dateTo)}
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            className="w-[140px] text-sm"
            value={dateTo}
            onChange={(e) => handleDateFilter(dateFrom, e.target.value)}
            placeholder="To"
          />
        </div>

        {(selectedItem || filters.transaction_type || dateFrom || dateTo || filters.stock_state) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedItem(null);
              setDateFrom("");
              setDateTo("");
              setFilters({ page: 1, pageSize: 50 });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>Type</th>
                <th>Reference</th>
                <th>From State</th>
                <th>To State</th>
                <th className="text-right">Qty In</th>
                <th className="text-right">Qty Out</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12">
                    <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No stock movements recorded yet</p>
                    <p className="text-sm text-muted-foreground">
                      Stock movements are logged when Assembly Orders are confirmed.
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const txn = TXN_LABELS[entry.transaction_type];
                  const refRoute = entry.reference_type
                    ? ROUTE_MAP[entry.reference_type]
                    : null;
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                      </td>
                      <td className="font-mono text-xs text-slate-600">
                        {entry.item_code ?? "—"}
                      </td>
                      <td className="text-sm max-w-[200px] truncate">
                        {entry.item_description ?? "—"}
                      </td>
                      <td>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${txn?.cls ?? "bg-slate-100 text-slate-600"}`}>
                          {txn?.label ?? entry.transaction_type}
                        </span>
                      </td>
                      <td>
                        {entry.reference_number && refRoute && entry.reference_id ? (
                          <button
                            className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => navigate(`${refRoute}/${entry.reference_id}`)}
                          >
                            {entry.reference_number}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {entry.reference_number ?? "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        {(entry as any).from_state ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATE_LABELS[(entry as any).from_state]?.cls ?? "bg-slate-100 text-slate-600"}`}>
                            {STATE_LABELS[(entry as any).from_state]?.label ?? (entry as any).from_state}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td>
                        {(entry as any).to_state ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATE_LABELS[(entry as any).to_state]?.cls ?? "bg-slate-100 text-slate-600"}`}>
                            {STATE_LABELS[(entry as any).to_state]?.label ?? (entry as any).to_state}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        {entry.qty_in > 0 ? (
                          <span className="text-green-600 font-semibold">+{entry.qty_in}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        {entry.qty_out > 0 ? (
                          <span className="text-red-600 font-semibold">−{entry.qty_out}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
                        {entry.balance_qty}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        {entry.unit_cost > 0 ? formatCurrency(entry.unit_cost) : "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm font-medium">
                        {entry.total_value > 0 ? formatCurrency(entry.total_value) : "—"}
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
      {(data?.count ?? 0) > (filters.pageSize ?? 50) && (
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
            Page {filters.page} of {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 50))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) * (filters.pageSize ?? 50) >= (data?.count ?? 0)}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
