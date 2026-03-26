import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ShoppingCart, Check, X, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchStockStatus, updateMinStockOverride, type StockStatusRow } from "@/lib/items-api";
import { useNavigate } from "react-router-dom";

function StatusBadge({ status }: { status: StockStatusRow["stock_status"] }) {
  const map = {
    green: "bg-green-100 text-green-800 border-green-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
  };
  const label = { green: "OK", amber: "Low", red: "Out" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${map[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "green" ? "bg-green-500" : status === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
      {label[status]}
    </span>
  );
}

function InlineEditCell({
  itemId,
  value,
  onSaved,
}: {
  itemId: string;
  value: number | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  const mutation = useMutation({
    mutationFn: (val: number | null) => updateMinStockOverride(itemId, val),
    onSuccess: () => {
      onSaved();
      setEditing(false);
      toast({ title: "Min stock override saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const commit = () => {
    const parsed = draft.trim() === "" ? null : parseFloat(draft);
    if (parsed !== null && isNaN(parsed)) {
      toast({ title: "Invalid number", variant: "destructive" });
      return;
    }
    mutation.mutate(parsed);
  };

  const cancel = () => {
    setDraft(value != null ? String(value) : "");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        className="text-left w-full hover:underline focus:outline-none text-sm tabular-nums"
        onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
        title="Click to edit"
      >
        {value != null ? value : <span className="text-muted-foreground italic">—</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        className="h-7 w-24 text-sm"
      />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={commit} disabled={mutation.isPending}>
        <Check className="h-3.5 w-3.5 text-green-600" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancel}>
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

type TypeTab = "all" | "raw_material" | "component" | "finished_good" | "bought_out";

const TYPE_TABS: { value: TypeTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "raw_material", label: "Raw Materials" },
  { value: "component", label: "Components" },
  { value: "finished_good", label: "Finished Goods" },
  { value: "bought_out", label: "Bought-Out" },
];

export default function StockRegister() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock_status"],
    queryFn: fetchStockStatus,
  });

  const [statusFilter, setStatusFilter] = useState<"all" | "green" | "amber" | "red">("all");
  const [typeTab, setTypeTab] = useState<TypeTab>("all");

  const filtered = rows
    .filter((r) => statusFilter === "all" || r.stock_status === statusFilter)
    .filter((r) => {
      if (typeTab === "all") return true;
      if (typeTab === "component") return r.item_type === "component" || r.item_type === "sub_assembly";
      return r.item_type === typeTab;
    });

  const counts = {
    green: rows.filter((r) => r.stock_status === "green").length,
    amber: rows.filter((r) => r.stock_status === "amber").length,
    red: rows.filter((r) => r.stock_status === "red").length,
  };

  const handleCreatePO = (row: StockStatusRow) => {
    navigate(`/purchase-orders/new?item_id=${row.id}`);
  };

  const handleRaiseJobWork = (row: StockStatusRow) => {
    navigate("/job-works", {
      state: {
        openNew: true,
        prefill: {
          item_id: row.id,
          item_code: row.item_code,
          item_description: row.description,
          quantity: 1,
        },
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" /> Stock Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">Current stock vs minimum levels for all active items</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["all", "green", "amber", "red"] as const).map((s) => {
          const labelMap = { all: "All Items", green: "In Stock", amber: "Low Stock", red: "Out of Stock" };
          const countMap = { all: rows.length, green: counts.green, amber: counts.amber, red: counts.red };
          const cardColour = {
            all: "bg-white border-slate-200",
            green: "bg-green-50 border-green-200",
            amber: "bg-amber-50 border-amber-200",
            red: "bg-red-50 border-red-200",
          };
          const textColour = {
            all: "text-slate-700",
            green: "text-green-700",
            amber: "text-amber-700",
            red: "text-red-700",
          };
          const numColour = {
            all: "text-slate-900",
            green: "text-green-800",
            amber: "text-amber-800",
            red: "text-red-800",
          };
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border shadow-sm p-4 text-left transition-all hover:shadow-md ${cardColour[s]} ${statusFilter === s ? "ring-2 ring-offset-1 ring-blue-400/40" : ""}`}
            >
              <p className={`text-xs font-semibold uppercase tracking-wider ${textColour[s]}`}>{labelMap[s]}</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${numColour[s]}`}>{countMap[s]}</p>
            </button>
          );
        })}
      </div>

      {/* Type tab bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTypeTab(tab.value)}
            className={`px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              typeTab === tab.value
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Unit</th>
                <th className="text-right">Raw Mat</th>
                <th className="text-right">WIP</th>
                <th className="text-right">Finished</th>
                <th className="text-right">Total</th>
                <th className="text-right">Min Stock</th>
                <th className="text-right">Min Override</th>
                <th className="text-right">Effective Min</th>
                <th>Status</th>
                <th className="w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">No items found.</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors ${row.stock_status === "red" ? "bg-red-50/60 hover:bg-red-50" : row.stock_status === "amber" ? "bg-amber-50/40 hover:bg-amber-50/60" : "hover:bg-blue-50/40"}`}
                  >
                    <td className="font-mono text-xs font-medium text-foreground">{row.item_code}</td>
                    <td className="font-medium">{row.description}</td>
                    <td className="text-muted-foreground">{row.unit}</td>
                    <td className="text-right font-mono tabular-nums text-slate-600">
                      {(row.stock_raw_material ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{row.stock_raw_material ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums text-amber-700">
                      {(row.stock_wip ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">{row.stock_wip ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums text-green-700">
                      {(row.stock_finished_goods ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">{row.stock_finished_goods ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums font-semibold">{row.current_stock}</td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">{row.min_stock}</td>
                    <td className="text-right">
                      <InlineEditCell
                        itemId={row.id}
                        value={row.min_stock_override}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ["stock_status"] })}
                      />
                    </td>
                    <td className="text-right font-mono tabular-nums font-medium">{row.effective_min_stock}</td>
                    <td><StatusBadge status={row.stock_status} /></td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(row.stock_status === "amber" || row.stock_status === "red") &&
                          (row.item_type === "raw_material" || row.item_type === "bought_out") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleCreatePO(row)}
                          >
                            <ShoppingCart className="h-3 w-3" /> Create PO
                          </Button>
                        )}
                        {(row.stock_status === "amber" || row.stock_status === "red") &&
                          (row.item_type === "component" || row.item_type === "sub_assembly") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleRaiseJobWork(row)}
                          >
                            <Wrench className="h-3 w-3" /> Raise JW
                          </Button>
                        )}
                      </div>
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
