import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ShoppingCart, Check, X, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchStockStatus, updateMinStockOverride, type StockStatusRow } from "@/lib/items-api";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loadBomForItem, recordBuild } from "@/lib/assembly-orders-api";

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

function AlertBadge({ level }: { level: string }) {
  if (level === 'critical') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">Critical</span>;
  if (level === 'warning') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">Warning</span>;
  if (level === 'watch') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">Watch</span>;
  if (level === 'locked') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200" title="Stock exists but fully committed">Locked</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">Healthy</span>;
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
  const location = useLocation();
  const { toast } = useToast();

  // Record Build dialog state
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [buildItem, setBuildItem] = useState<StockStatusRow | null>(null);
  const [buildQty, setBuildQty] = useState<number>(1);
  const [buildDate, setBuildDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [buildNotes, setBuildNotes] = useState<string>("");
  const [buildResult, setBuildResult] = useState<{ serial_numbers: string[]; fat_certificate_ids: string[] } | null>(null);

  const openBuildDialog = (row: StockStatusRow) => {
    setBuildItem(row);
    setBuildQty((row as any).production_batch_size > 0 ? (row as any).production_batch_size : 1);
    setBuildDate(new Date().toISOString().split("T")[0]);
    setBuildNotes("");
    setBuildResult(null);
    setBuildDialogOpen(true);
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock_status"],
    queryFn: fetchStockStatus,
  });

  const { data: processingLogs = [] } = useQuery({
    queryKey: ['component-processing-logs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('component_processing_log')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) return [];
      return data ?? [];
    },
    staleTime: 30000,
  });
  const processingLogByItemId = useMemo(() => {
    const map = new Map<string, any>();
    for (const log of processingLogs as any[]) {
      if (!map.has(log.item_id)) map.set(log.item_id, log);
    }
    return map;
  }, [processingLogs]);

  const [statusFilter, setStatusFilter] = useState<"all" | "green" | "amber" | "red">("all");
  const [typeTab, setTypeTab] = useState<TypeTab>("all");
  const [alertFilter, setAlertFilter] = useState<"all" | "critical" | "warning" | "watch" | "locked" | "healthy">("all");

  const { data: bomLines = [] } = useQuery({
    queryKey: ["bom-for-build", buildItem?.id],
    queryFn: () => loadBomForItem(buildItem!.id, buildQty),
    enabled: buildDialogOpen && !!buildItem,
  });
  const hasBom = bomLines.length > 0;

  useEffect(() => {
    if ((location.state as any)?.openBuildDialog && rows.length > 0) {
      const itemId = (location.state as any).openBuildDialog as string;
      const item = rows.find((r) => r.id === itemId);
      if (item) openBuildDialog(item);
    }
  }, [rows, location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildMutation = useMutation({
    mutationFn: () => recordBuild({
      item_id: buildItem!.id,
      item_description: buildItem!.description,
      drawing_number: buildItem!.item_code,
      quantity: buildQty,
      date_built: buildDate,
      notes: buildNotes || undefined,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["stock_status"] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      queryClient.invalidateQueries({ queryKey: ["serial-numbers"] });
      setBuildResult(result);
      toast({
        title: `${buildQty} unit${buildQty !== 1 ? "s" : ""} recorded`,
        description: `${result.serial_numbers.length} serial number${result.serial_numbers.length !== 1 ? "s" : ""} generated. FAT certificates ready.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // DEBUG: log active tab and row counts to diagnose bought-out items not appearing
  // If bought_out count is 0 even though items exist in the items table, the stock_status VIEW
  // in Supabase likely has a WHERE item_type IN (...) clause that excludes 'bought_out'.
  // SQL fix (run in Supabase SQL editor):
  //   DROP VIEW IF EXISTS stock_status;
  //   CREATE VIEW stock_status AS SELECT ... FROM items WHERE status = 'active';
  //   (remove the item_type filter from the WHERE clause, or add 'bought_out' to the IN list)
  // eslint-disable-next-line no-console
  console.log('Tab:', typeTab, 'Rows:', rows.length, 'bought_out in data:', rows.filter(r => r.item_type === 'bought_out').length);

  const filtered = rows
    .filter((r) => statusFilter === "all" || r.stock_status === statusFilter)
    .filter((r) => {
      if (typeTab === "all") return true;
      if (typeTab === "component") return r.item_type === "component" || r.item_type === "sub_assembly";
      return r.item_type === typeTab;
    })
    .filter((r) => {
      if (alertFilter === "all") return true;
      return ((r as any).stock_alert_level ?? 'healthy') === alertFilter;
    });

  const counts = {
    green: rows.filter((r) => r.stock_status === "green").length,
    amber: rows.filter((r) => r.stock_status === "amber").length,
    red: rows.filter((r) => r.stock_status === "red").length,
  };

  const tabCounts: Record<TypeTab, number> = {
    all: rows.length,
    raw_material: rows.filter((r) => r.item_type === "raw_material").length,
    component: rows.filter((r) => r.item_type === "component" || r.item_type === "sub_assembly").length,
    finished_good: rows.filter((r) => r.item_type === "finished_good").length,
    bought_out: rows.filter((r) => r.item_type === "bought_out").length,
  };

  const handleCreatePO = (row: StockStatusRow) => {
    navigate(`/purchase-orders/new?item_id=${row.id}`);
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
            {tabCounts[tab.value] > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 tabular-nums">
                {tabCounts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alert level filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">Alert Level:</span>
        <select
          value={alertFilter}
          onChange={(e) => setAlertFilter(e.target.value as typeof alertFilter)}
          className="h-8 text-sm border border-slate-200 rounded px-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All</option>
          <option value="critical">Critical Only</option>
          <option value="warning">Warning Only</option>
          <option value="watch">Watch Only</option>
          <option value="locked">Locked Only</option>
          <option value="healthy">Healthy Only</option>
        </select>
      </div>

      {/* Record Build Dialog */}
      <Dialog open={buildDialogOpen} onOpenChange={(o) => { if (!o) { setBuildDialogOpen(false); setBuildResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Build — {buildItem?.description}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{buildItem?.item_code}</DialogDescription>
          </DialogHeader>
          {buildResult ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <p className="font-semibold mb-1">{buildQty} unit{buildQty !== 1 ? "s" : ""} recorded successfully.</p>
                <p className="text-xs">{buildResult.serial_numbers.length} serial number{buildResult.serial_numbers.length !== 1 ? "s" : ""} generated. FAT certificates ready to fill in.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Serial numbers created:</p>
                <p className="text-xs font-mono bg-slate-50 rounded p-2 break-all">{buildResult.serial_numbers.join(", ")}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setBuildDialogOpen(false); setBuildResult(null); }}>Close</Button>
                <Button className="flex-1" onClick={() => { setBuildDialogOpen(false); setBuildResult(null); navigate("/fat-certificates"); }}>Go to FAT Certificates →</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">How many units were assembled? *</Label>
                <Input
                  type="number"
                  min={1}
                  value={buildQty || ""}
                  onChange={(e) => setBuildQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Date assembled</Label>
                <Input
                  type="date"
                  value={buildDate}
                  onChange={(e) => setBuildDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">Notes (optional)</Label>
                <Textarea
                  value={buildNotes}
                  onChange={(e) => setBuildNotes(e.target.value)}
                  placeholder="e.g. Batch ref, operator name"
                  className="mt-1"
                  rows={2}
                />
              </div>
              {/* What will happen */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">This will:</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Generate {buildQty} serial number{buildQty !== 1 ? "s" : ""} automatically</li>
                  <li>Create {buildQty} FAT certificate draft{buildQty !== 1 ? "s" : ""}</li>
                  {hasBom && <li>Deduct components from stock (BOM backflush)</li>}
                  <li>Add {buildQty} unit{buildQty !== 1 ? "s" : ""} to finished goods stock</li>
                </ul>
              </div>
              {buildDialogOpen && !hasBom && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  No BOM found for this item — components will not be deducted automatically. Set up a BOM first for accurate stock tracking.
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setBuildDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending || buildQty < 1}>
                  {buildMutation.isPending ? "Recording…" : "Record Build"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Free</th>
                <th className="text-right">In Process</th>
                <th className="text-right">S/A WIP</th>
                <th className="text-right">FG WIP</th>
                <th className="text-right">FG Ready</th>
                <th className="text-right">Total</th>
                <th className="text-right">Min Stock</th>
                <th className="text-right">Min Override</th>
                <th className="text-right">Eff. Min</th>
                <th>Alert</th>
                <th>Status</th>
                <th>Processing</th>
                <th className="w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={16} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={16} className="text-center py-8 text-muted-foreground">No items found.</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors cursor-pointer ${row.stock_status === "red" ? "bg-red-50/60 hover:bg-red-50" : row.stock_status === "amber" ? "bg-amber-50/40 hover:bg-amber-50/60" : "hover:bg-blue-50/40"}`}
                    onClick={() => navigate(`/stock-ledger?item_id=${row.id}`)}
                  >
                    <td className="font-mono text-xs font-medium text-foreground">{row.item_code}</td>
                    <td className="font-medium">{row.description}</td>
                    <td className="text-muted-foreground text-xs capitalize">{row.item_type?.replace(/_/g, ' ')}</td>
                    <td className="text-right font-mono tabular-nums">
                      {((row as any).stock_free ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700">{(row as any).stock_free ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {((row as any).stock_in_process ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700">{(row as any).stock_in_process ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {((row as any).stock_in_subassembly_wip ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{(row as any).stock_in_subassembly_wip ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {((row as any).stock_in_fg_wip ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700">{(row as any).stock_in_fg_wip ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {((row as any).stock_in_fg_ready ?? 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700">{(row as any).stock_in_fg_ready ?? 0}</span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums font-semibold">{row.current_stock}</td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">{row.min_stock}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <InlineEditCell
                        itemId={row.id}
                        value={row.min_stock_override}
                        onSaved={() => queryClient.invalidateQueries({ queryKey: ["stock_status"] })}
                      />
                    </td>
                    <td className="text-right font-mono tabular-nums font-medium">{row.effective_min_stock}</td>
                    <td onClick={(e) => e.stopPropagation()}><AlertBadge level={(row as any).stock_alert_level ?? 'healthy'} /></td>
                    <td><StatusBadge status={row.stock_status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const log = processingLogByItemId.get(row.id);
                        if (!log) return null;
                        const status = log.current_status as string;
                        if (status === 'finished_goods') return (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">All stages complete</span>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 ml-1"
                              onClick={async () => {
                                const qty = Math.min(row.stock_wip ?? 0, log.accepted_qty - (row.stock_finished_goods ?? 0));
                                if (qty <= 0) return;
                                await (supabase as any).from('items').update({ stock_wip: Math.max(0, (row.stock_wip ?? 0) - qty), stock_finished_goods: (row.stock_finished_goods ?? 0) + qty }).eq('id', row.id);
                                queryClient.invalidateQueries({ queryKey: ['stock_status'] });
                                toast({ title: 'Moved to finished goods', description: `${qty} units moved` });
                              }}>
                              Move to FG
                            </Button>
                          </div>
                        );
                        if (status === 'at_vendor' || status === 'rework_at_vendor') return (
                          <div className="flex items-center gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status === 'rework_at_vendor' ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                              {status === 'rework_at_vendor' ? 'Rework at vendor' : `At vendor — Stage ${log.current_stage} of ${log.total_stages}`}
                            </span>
                            {log.last_dc_id && (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => navigate(`/delivery-challans/${log.last_dc_id}`)}>View DC</Button>
                            )}
                          </div>
                        );
                        if (status === 'stage_complete') return (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                              Stage {log.current_stage} complete — Stage {log.current_stage + 1} pending
                            </span>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                              onClick={() => navigate('/delivery-challans/new', { state: { prefill: { dc_type: 'job_work_out', line_items: [{ item_code: row.item_code, description: row.description, drawing_number: row.item_code, quantity: log.accepted_qty - (row.stock_finished_goods ?? 0) }] } } })}>
                              Raise DC
                            </Button>
                          </div>
                        );
                        return null;
                      })()}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
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
                            onClick={() => navigate('/delivery-challans/new')}
                          >
                            <Wrench className="h-3 w-3" /> Raise DC
                          </Button>
                        )}
                        {row.item_type === "finished_good" && (
                          <Button
                            variant={row.stock_status === "amber" || row.stock_status === "red" ? "default" : "outline"}
                            size="sm"
                            className={`h-7 text-xs gap-1 ${row.stock_status === "amber" || row.stock_status === "red" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                            onClick={() => openBuildDialog(row)}
                          >
                            Record Build
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
