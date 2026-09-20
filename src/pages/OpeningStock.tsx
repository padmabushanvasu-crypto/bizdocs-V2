import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, Search, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { fetchItems, type Item } from "@/lib/items-api";
import { format } from "date-fns";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { formatNumber, formatCurrency } from "@/lib/gst-utils";

const ITEM_TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  raw_material:   { label: "Raw Material",  cls: "bg-slate-100 text-slate-700" },
  component:      { label: "Component",     cls: "bg-blue-100 text-blue-700" },
  sub_assembly:   { label: "Sub-Assembly",  cls: "bg-purple-100 text-purple-700" },
  bought_out:     { label: "Bought Out",    cls: "bg-teal-100 text-teal-700" },
  finished_good:  { label: "Finished Good", cls: "bg-green-100 text-green-700" },
  product:        { label: "Product",       cls: "bg-green-100 text-green-700" },
  consumable:     { label: "Consumable",    cls: "bg-amber-100 text-amber-700" },
  service:        { label: "Service",       cls: "bg-gray-100 text-gray-600" },
  asset:          { label: "Asset",         cls: "bg-red-100 text-red-700" },
};

interface OpeningStockEntry {
  item_id: string;
  qty: number;
  unit_cost: number;
  transaction_date: string;
}

async function fetchLatestOpeningStock(): Promise<Record<string, OpeningStockEntry>> {
  const companyId = await getCompanyId();
  if (!companyId) return {};
  const { data, error } = await (supabase as any)
    .from("stock_ledger")
    .select("item_id, qty_in, unit_cost, transaction_date")
    .eq("company_id", companyId)
    .eq("transaction_type", "opening_stock")
    .order("transaction_date", { ascending: false });
  if (error) throw error;
  const map: Record<string, OpeningStockEntry> = {};
  for (const row of data ?? []) {
    if (!map[row.item_id]) {
      map[row.item_id] = {
        item_id: row.item_id,
        qty: row.qty_in ?? 0,
        unit_cost: row.unit_cost ?? 0,
        transaction_date: row.transaction_date,
      };
    }
  }
  return map;
}

export default function OpeningStock() {
  const navigate = useNavigate();
  const { hideCosts } = useRoleAccess();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["items-opening-stock"],
    queryFn: () => fetchItems({ status: "active", pageSize: 1000 }),
  });
  const items = (itemsData?.data ?? []).filter(i => i.item_type !== "service" && i.item_type !== "asset");

  const { data: openingMap = {}, isLoading: ledgerLoading } = useQuery({
    queryKey: ["opening-stock-entries"],
    queryFn: fetchLatestOpeningStock,
  });

  const filteredItems = items.filter(item => {
    if (typeFilter !== "all" && item.item_type !== typeFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        item.item_code?.toLowerCase().includes(s) ||
        item.description?.toLowerCase().includes(s) ||
        (item.drawing_number ?? "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  const isLoading = itemsLoading || ledgerLoading;

  const uniqueTypes = Array.from(new Set(items.map(i => i.item_type))).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Archive className="h-6 w-6 text-slate-600" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Opening Stock</h1>
          <p className="text-sm text-slate-500">Find an item and correct its stock via Physical Count</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by item code or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(t => (
              <SelectItem key={t} value={t}>
                {ITEM_TYPE_LABELS[t]?.label ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Item Code</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Unit</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Free Stock</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Aimed Qty</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Reorder Level</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Last Opening Entry</th>
              {!hideCosts && <th className="text-right px-4 py-3 font-medium text-slate-600">Cost/Unit</th>}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={hideCosts ? 9 : 10} className="px-4 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={hideCosts ? 9 : 10} className="px-4 py-8 text-center text-slate-400">No items found</td>
              </tr>
            ) : (
              filteredItems.map(item => {
                const entry = openingMap[item.id];
                const typeInfo = ITEM_TYPE_LABELS[item.item_type] ?? { label: item.item_type, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{item.item_code}</td>
                    <td className="px-4 py-3 text-slate-800 max-w-xs truncate" title={item.description}>
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo.cls}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {formatNumber(item.stock_free ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-blue-700">
                      {(item as any).aimed_stock > 0
                        ? formatNumber((item as any).aimed_stock ?? 0)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate-500">
                      {item.min_stock != null && item.min_stock > 0
                        ? formatNumber(item.min_stock)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {entry ? (
                        <span title={entry.transaction_date}>
                          {formatNumber(entry.qty ?? 0)} on{" "}
                          {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {!hideCosts && (
                      <td className="px-4 py-3 text-right text-slate-500">
                        {entry ? formatCurrency(entry.unit_cost) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-blue-600 hover:text-blue-800"
                        onClick={() => navigate(`/physical-count?item=${item.id}`)}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                        Count
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!isLoading && (
        <p className="text-xs text-slate-400 mt-2">{filteredItems.length} items</p>
      )}
    </div>
  );
}
