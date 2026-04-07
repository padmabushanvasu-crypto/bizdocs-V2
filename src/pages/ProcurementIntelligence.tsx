import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import { exportToExcel, type ExportColumn } from "@/lib/export-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProcurementItem {
  id: string;
  item_code: string;
  description: string;
  item_type: string;
  unit: string;
  hsn_sac_code: string | null;
  current_stock: number;
  min_stock: number;
  stock_alert_level: string;
  stock_free: number;
  stock_in_process: number;
  stock_in_subassembly_wip: number;
  stock_in_fg_wip: number;
  stock_in_fg_ready: number;
  openPOId: string | null;
  openPONumber: string | null;
  openDCId: string | null;
  openDCNumber: string | null;
  openAOId: string | null;
  openAONumber: string | null;
}

type FilterPill = "all" | "needs_action" | "po_raised" | "dc_out" | "ao_raised" | "zero_stock";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchProcurementItems(): Promise<ProcurementItem[]> {
  const companyId = await getCompanyId();
  if (!companyId) {
    console.error('PI: companyId is null');
    return [];
  }

  // Fetch critical items only — stock_alert_level is the single source of truth
  const { data: itemsData, error: itemsError } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, item_type, unit, hsn_sac_code, current_stock, min_stock, stock_alert_level, stock_free, stock_in_process, stock_in_subassembly_wip, stock_in_fg_wip, stock_in_fg_ready")
    .eq("company_id", companyId)
    .eq("status", "active")
    .neq("item_type", "service")
    .eq("stock_alert_level", "critical");

  if (itemsError) {
    console.error('PI items query error:', itemsError);
    return [];
  }

  const items = (itemsData ?? []) as any[];
  if (items.length === 0) return [];

  const itemIds = items.map((i: any) => i.id);

  // Parallel: fetch open PO lines, DC lines, and AO records for these items
  const [poLinesRes, dcLinesRes, aoRes] = await Promise.all([
    (supabase as any)
      .from("po_line_items")
      .select("item_id, purchase_order_id, purchase_orders!inner(id, po_number, status)")
      .in("item_id", itemIds)
      .in("purchase_orders.status", ["draft", "issued", "partially_received"]),
    (supabase as any)
      .from("dc_line_items")
      .select("item_id, delivery_challan_id, delivery_challans!inner(id, dc_number, status)")
      .in("item_id", itemIds)
      .in("delivery_challans.status", ["issued", "partially_returned"]),
    (supabase as any)
      .from("assembly_orders")
      .select("id, item_id, ao_number, status")
      .in("item_id", itemIds)
      .in("status", ["draft", "in_progress"]),
  ]);

  // Build lookup maps (first open document per item)
  const poMap = new Map<string, { id: string; number: string }>();
  ((poLinesRes.data ?? []) as any[]).forEach((row: any) => {
    if (row.item_id && !poMap.has(row.item_id)) {
      poMap.set(row.item_id, {
        id: row.purchase_orders?.id ?? row.purchase_order_id ?? "",
        number: row.purchase_orders?.po_number ?? "",
      });
    }
  });

  const dcMap = new Map<string, { id: string; number: string }>();
  ((dcLinesRes.data ?? []) as any[]).forEach((row: any) => {
    if (row.item_id && !dcMap.has(row.item_id)) {
      dcMap.set(row.item_id, {
        id: row.delivery_challans?.id ?? row.delivery_challan_id ?? "",
        number: row.delivery_challans?.dc_number ?? "",
      });
    }
  });

  const aoMap = new Map<string, { id: string; number: string }>();
  ((aoRes.data ?? []) as any[]).forEach((row: any) => {
    if (row.item_id && !aoMap.has(row.item_id)) {
      aoMap.set(row.item_id, { id: row.id ?? "", number: row.ao_number ?? "" });
    }
  });

  return items.map((item: any): ProcurementItem => ({
    id: item.id,
    item_code: item.item_code ?? "",
    description: item.description ?? "",
    item_type: item.item_type ?? "",
    unit: item.unit ?? "",
    hsn_sac_code: item.hsn_sac_code ?? null,
    current_stock: item.current_stock ?? 0,
    min_stock: item.min_stock ?? 0,
    stock_alert_level: item.stock_alert_level ?? "healthy",
    stock_free: item.stock_free ?? 0,
    stock_in_process: item.stock_in_process ?? 0,
    stock_in_subassembly_wip: item.stock_in_subassembly_wip ?? 0,
    stock_in_fg_wip: item.stock_in_fg_wip ?? 0,
    stock_in_fg_ready: item.stock_in_fg_ready ?? 0,
    openPOId: poMap.get(item.id)?.id ?? null,
    openPONumber: poMap.get(item.id)?.number ?? null,
    openDCId: dcMap.get(item.id)?.id ?? null,
    openDCNumber: dcMap.get(item.id)?.number ?? null,
    openAOId: aoMap.get(item.id)?.id ?? null,
    openAONumber: aoMap.get(item.id)?.number ?? null,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ITEM_TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw Material",
  bought_out: "Bought Out",
  component: "Component",
  consumable: "Consumable",
  service: "Service",
  sub_assembly: "Sub Assembly",
  finished_good: "Finished Good",
};

function typeLabel(t: string) {
  return ITEM_TYPE_LABELS[t] ?? t;
}

function hasAction(item: ProcurementItem) {
  return !!(item.openPOId || item.openDCId || item.openAOId);
}

const EXPORT_COLS: ExportColumn[] = [
  { key: "item_code", label: "Item Code" },
  { key: "description", label: "Description", width: 30 },
  { key: "item_type", label: "Type" },
  { key: "current_stock", label: "Current Stock", type: "number" },
  { key: "min_stock", label: "Min Stock", type: "number" },
  { key: "stock_alert_level", label: "Alert Level" },
  { key: "action_taken", label: "Action Taken" },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProcurementIntelligence() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterPill>("all");
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: ["procurement-intelligence"],
    queryFn: fetchProcurementItems,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Summary counts — all from stock_alert_level = 'critical' items only
  const zeroStockCount  = useMemo(() => items.filter((i) => (i.stock_free + i.stock_in_process + i.stock_in_subassembly_wip + i.stock_in_fg_wip + i.stock_in_fg_ready) === 0).length, [items]);
  const needsActionCount = useMemo(() => items.filter((i) => !hasAction(i)).length, [items]);
  const actionedCount   = useMemo(() => items.filter((i) => hasAction(i)).length, [items]);

  // Filtered + searched items
  const filtered = useMemo(() => {
    let result = items;
    switch (filter) {
      case "needs_action": result = result.filter((i) => !hasAction(i)); break;
      case "po_raised":    result = result.filter((i) => !!i.openPOId); break;
      case "dc_out":       result = result.filter((i) => !!i.openDCId); break;
      case "ao_raised":    result = result.filter((i) => !!i.openAOId); break;
      case "zero_stock":   result = result.filter((i) => (i.stock_free + i.stock_in_process + i.stock_in_subassembly_wip + i.stock_in_fg_wip + i.stock_in_fg_ready) === 0); break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.item_code.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, filter, search]);

  function handleExport() {
    const exportData = filtered.map((i) => ({
      ...i,
      item_type: typeLabel(i.item_type),
      action_taken: i.openPOId
        ? `PO Raised (${i.openPONumber})`
        : i.openDCId
        ? `DC Out (${i.openDCNumber})`
        : i.openAOId
        ? `AO Raised (${i.openAONumber})`
        : "—",
    }));
    exportToExcel(exportData, EXPORT_COLS, "Procurement_Intelligence.xlsx", "Procurement");
  }

  const pills: { label: string; value: FilterPill; count?: number }[] = [
    { label: "All", value: "all", count: items.length },
    { label: "Needs Action", value: "needs_action", count: needsActionCount },
    { label: "PO Raised", value: "po_raised", count: items.filter((i) => !!i.openPOId).length },
    { label: "DC Out", value: "dc_out", count: items.filter((i) => !!i.openDCId).length },
    { label: "AO Raised", value: "ao_raised", count: items.filter((i) => !!i.openAOId).length },
    { label: "Zero Stock", value: "zero_stock", count: zeroStockCount },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Procurement Intelligence</h1>
            <p className="text-xs text-slate-500 mt-0.5">Stock levels and procurement status for all items requiring attention</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Total Critical</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">{items.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">items below min stock</p>
        </div>
        <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 ${needsActionCount > 0 ? "border-red-300" : "border-slate-200"}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Needs Action</p>
          <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${needsActionCount > 0 ? "text-red-600" : "text-slate-900"}`}>{needsActionCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">no open PO / DC / AO</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Being Actioned</p>
          <p className="text-2xl font-extrabold font-mono tabular-nums text-blue-600 mt-1">{actionedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">PO / DC / AO raised</p>
        </div>
        <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 ${zeroStockCount > 0 ? "border-red-300" : "border-slate-200"}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Zero Stock</p>
          <p className={`text-2xl font-extrabold font-mono tabular-nums mt-1 ${zeroStockCount > 0 ? "text-red-600" : "text-slate-900"}`}>{zeroStockCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">all buckets empty</p>
        </div>
      </div>

      {/* Filter pills + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <button
              key={p.value}
              onClick={() => setFilter(p.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                filter === p.value
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {p.label}
              {p.count !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filter === p.value ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {p.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search item code or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 h-8 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
        ) : isError ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-red-500">Failed to load procurement data</p>
            <p className="text-xs text-slate-400 mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <button onClick={() => refetch()} className="mt-4 text-xs text-blue-500 underline">
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="h-8 w-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No items match this filter</p>
            <p className="text-xs text-slate-400 mt-1">All items in this category are healthy</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="data-table w-full">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="bg-white">Item Code</th>
                  <th className="bg-white">Description</th>
                  <th className="bg-white">Type</th>
                  <th className="text-right bg-white">Current Stock</th>
                  <th className="text-right bg-white">Min Stock</th>
                  <th className="bg-white">Status</th>
                  <th className="bg-white">Action Taken</th>
                  <th className="bg-white">Quick Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isZero = (item.stock_free + item.stock_in_process + item.stock_in_subassembly_wip + item.stock_in_fg_wip + item.stock_in_fg_ready) === 0;
                  const isActioned = hasAction(item);
                  return (
                    <tr key={item.id}>
                      <td className="font-mono text-xs font-semibold text-slate-700">{item.item_code || "—"}</td>
                      <td className="font-medium text-slate-800 max-w-[220px]">
                        <span className="truncate block">{item.description}</span>
                      </td>
                      <td className="text-xs text-slate-500">{typeLabel(item.item_type)}</td>
                      <td className="text-right tabular-nums font-mono">
                        <span className={isZero ? "font-bold text-red-600" : "text-slate-700"}>
                          {item.current_stock}
                        </span>
                      </td>
                      <td className="text-right tabular-nums font-mono text-slate-500">{item.min_stock}</td>
                      <td>
                        {isZero ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                            Zero Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            Critical
                          </span>
                        )}
                      </td>
                      <td>
                        {item.openPOId ? (
                          <button
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition-colors"
                            onClick={() => navigate(`/purchase-orders/${item.openPOId}`)}
                          >
                            PO: {item.openPONumber || "View →"}
                          </button>
                        ) : item.openDCId ? (
                          <button
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-200 hover:bg-teal-200 transition-colors"
                            onClick={() => navigate(`/delivery-challans/${item.openDCId}`)}
                          >
                            DC: {item.openDCNumber || "View →"}
                          </button>
                        ) : item.openAOId ? (
                          <button
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition-colors"
                            onClick={() => navigate(`/assembly-orders/${item.openAOId}`)}
                          >
                            AO: {item.openAONumber || "View →"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td>
                        {isActioned ? (
                          <button
                            className="text-xs text-blue-600 hover:underline font-medium"
                            onClick={() => {
                              if (item.openPOId) navigate(`/purchase-orders/${item.openPOId}`);
                              else if (item.openDCId) navigate(`/delivery-challans/${item.openDCId}`);
                              else if (item.openAOId) navigate(`/assembly-orders/${item.openAOId}`);
                            }}
                          >
                            View →
                          </button>
                        ) : (item.item_type === "raw_material" || item.item_type === "bought_out" || item.item_type === "consumable") ? (
                          <button
                            className="text-xs font-semibold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            onClick={() => navigate("/purchase-orders/new", {
                              state: {
                                prefillItem: {
                                  item_id: item.id,
                                  item_code: item.item_code,
                                  description: item.description,
                                  unit: item.unit,
                                  hsn_sac_code: item.hsn_sac_code,
                                },
                              },
                            })}
                          >
                            Raise PO
                          </button>
                        ) : item.item_type === "component" ? (
                          <button
                            className="text-xs font-semibold px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                            onClick={() => navigate("/delivery-challans/new", {
                              state: {
                                prefillItem: {
                                  item_id: item.id,
                                  item_code: item.item_code,
                                  description: item.description,
                                  unit: item.unit,
                                  hsn_sac_code: item.hsn_sac_code,
                                },
                              },
                            })}
                          >
                            Raise DC
                          </button>
                        ) : item.item_type === "sub_assembly" ? (
                          <button
                            className="text-xs font-semibold px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                            onClick={() => navigate("/assembly-orders", {
                              state: {
                                prefillItem: {
                                  item_id: item.id,
                                  item_code: item.item_code,
                                  description: item.description,
                                  unit: item.unit,
                                },
                              },
                            })}
                          >
                            Raise AO
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
