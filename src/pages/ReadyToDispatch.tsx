import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchFinishedGoodItems } from "@/lib/dispatch-api";

/**
 * Finished goods in stock and ready to ship, by item and quantity.
 *
 * Source: items.stock_in_fg_ready — the same bucket that work-order acceptance
 * fills and Dispatch Record confirm deducts, so this page always agrees with
 * stock. (Previously it listed serial_numbers rows, which dispatch never
 * updated, so shipped units stayed here.) Resale items are sold from the
 * Dispatch Record picker and are not listed here.
 */
export default function ReadyToDispatch() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: allItems = [], isLoading, error } = useQuery({
    queryKey: ["ready-to-dispatch"],
    queryFn: async () => (await fetchFinishedGoodItems()).filter((i) => !i.is_resale),
    staleTime: 30_000,
  });

  // Every word must match somewhere (item code, description, drawing no.),
  // case-insensitive and ignoring punctuation.
  const items = useMemo(() => {
    const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const tokens = norm(search).split(" ").filter(Boolean);
    if (tokens.length === 0) return allItems;
    return allItems.filter((i) => {
      const hay = norm(`${i.item_code} ${i.description} ${i.drawing_number}`);
      return tokens.every((t) => hay.includes(t));
    });
  }, [allItems, search]);

  const totalUnits = allItems.reduce((s, i) => s + i.stock_in_fg_ready, 0);
  const shownUnits = items.reduce((s, i) => s + i.stock_in_fg_ready, 0);
  const filtered = items.length !== allItems.length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
          <CheckCircle className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ready to Dispatch</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Finished goods in stock. Quantities drop as soon as a Dispatch Record is confirmed.
          </p>
        </div>
      </div>

      {/* Stat chip */}
      {!isLoading && !error && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
          <Package className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            {filtered
              ? `${shownUnits} of ${totalUnits} units`
              : `${totalUnits} units ready across ${allItems.length} item${allItems.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          className="pl-8"
          placeholder="Search item, description, drawing no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading...</p>
      ) : error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Could not load stock: {error instanceof Error ? error.message : "unknown error"}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{allItems.length > 0 ? "No items match your search" : "No finished goods ready to dispatch"}</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            {allItems.length > 0
              ? "Try fewer words or a different drawing number."
              : "Accept a Finished Good Work Order to add units here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Ready Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <div className="font-medium text-slate-700">{item.item_code || "—"}</div>
                    {item.description && <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">
                    {item.drawing_number ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">
                    {item.stock_in_fg_ready} <span className="font-normal text-slate-500">{item.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/dispatch-records/new?item=${encodeURIComponent(item.id)}`)}
                    >
                      Create Dispatch Record
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Serial numbers are tracked on the Serial Numbers page and are not used to count stock here.
      </p>
    </div>
  );
}
