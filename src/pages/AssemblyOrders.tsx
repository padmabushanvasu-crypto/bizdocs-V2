import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Factory, Plus, Search, Eye, ChevronDown, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssemblyOrders,
  fetchAssemblyOrderStats,
  startProductionRun,
  loadBomForItem,
  type AssemblyOrderFilters,
} from "@/lib/assembly-orders-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { fetchBomVariants, type BomVariant } from "@/lib/bom-api";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  completed: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function AssemblyOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<AssemblyOrderFilters>({
    search: "",
    status: "all",
    page: 1,
    pageSize: 20,
  });

  const [newOpen, setNewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");

  // Open dialog automatically if navigated with openNew state
  useEffect(() => {
    if ((location.state as any)?.openNew) {
      setNewOpen(true);
    }
  }, [location.state]);

  const { data: stats } = useQuery({
    queryKey: ["ao-stats"],
    queryFn: fetchAssemblyOrderStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["assembly-orders", filters],
    queryFn: () => fetchAssemblyOrders(filters),
  });

  // Only fetch finished_good items for production
  const { data: itemsData } = useQuery({
    queryKey: ["items-finished-goods"],
    queryFn: () => fetchItems({ status: "active", type: "finished_good", pageSize: 500 }),
    enabled: newOpen,
  });
  const items = itemsData?.data ?? [];

  const { data: variants = [] } = useQuery<BomVariant[]>({
    queryKey: ["bom-variants-ao", selectedItem?.id],
    queryFn: () => fetchBomVariants(selectedItem!.id),
    enabled: newOpen && !!selectedItem,
  });

  const { data: bomLines = [] } = useQuery({
    queryKey: ["bom-preview", selectedItem?.id, quantity],
    queryFn: () => loadBomForItem(selectedItem!.id, quantity),
    enabled: newOpen && !!selectedItem,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      startProductionRun({
        item_id: selectedItem!.id,
        item_code: selectedItem!.item_code ?? null,
        item_description: selectedItem!.description ?? null,
        quantity_to_build: quantity,
        variant_id: selectedVariantId || null,
        notes: notes || null,
      }),
    onSuccess: (ao) => {
      queryClient.invalidateQueries({ queryKey: ["assembly-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      queryClient.invalidateQueries({ queryKey: ["serial-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      setNewOpen(false);
      setSelectedItem(null);
      setSelectedVariantId("");
      setQuantity(1);
      setNotes("");
      toast({
        title: "Production run started",
        description: `${ao.ao_number} — ${quantity} serial number${quantity !== 1 ? "s" : ""} generated`,
      });
      navigate(`/assembly-orders/${ao.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleStart = () => {
    if (!selectedItem) {
      toast({ title: "Select an item to build", variant: "destructive" });
      return;
    }
    if (!quantity || quantity <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    startMutation.mutate();
  };

  const aos = data?.data ?? [];

  const resetDialog = () => {
    setSelectedItem(null);
    setSelectedVariantId("");
    setQuantity(1);
    setNotes("");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-600" /> Production
          </h1>
          <p className="text-sm text-slate-500 mt-1">Build finished goods from components — serial numbers generated at start</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="flex-shrink-0 active:scale-[0.98] transition-transform">
          <Plus className="h-4 w-4 mr-1" /> Start Production Run
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          title="Active Runs"
          value={String(stats?.active ?? 0)}
          icon={Factory}
          className={stats?.active ? "border-blue-200" : ""}
        />
        <MetricCard
          title="Completed This Month"
          value={String(stats?.completedThisMonth ?? 0)}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Draft"
          value={String(stats?.draft ?? 0)}
          icon={Factory}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search run#, item..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v, page: 1 }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Run #</th>
                <th>Item to Build</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Built</th>
                <th>Status</th>
                <th>Started</th>
                <th className="w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td>
                </tr>
              ) : aos.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <Factory className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">No production runs yet</h3>
                      <p className="text-sm text-slate-500 mb-6 max-w-xs">Start a production run to build finished goods. Serial numbers are generated automatically at the start.</p>
                      <Button onClick={() => setNewOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Start Production Run
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                aos.map((ao) => (
                  <tr
                    key={ao.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/assembly-orders/${ao.id}`)}
                  >
                    <td className="font-mono text-sm font-medium text-blue-600">{ao.ao_number}</td>
                    <td>
                      <p className="font-medium text-sm">{ao.item_description ?? "—"}</p>
                      {ao.item_code && (
                        <p className="text-xs text-muted-foreground font-mono">{ao.item_code}</p>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums">{ao.quantity_to_build}</td>
                    <td className="text-right font-mono tabular-nums">
                      {ao.status === "completed" ? (
                        <span className="text-green-600 font-semibold">{ao.quantity_built}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <span className={statusClass[ao.status] ?? statusClass.draft}>
                        {statusLabels[ao.status] ?? ao.status}
                      </span>
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {format(new Date(ao.created_at), "dd MMM yyyy")}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/assembly-orders/${ao.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {(data?.count ?? 0) > (filters.pageSize ?? 20) && (
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
            Page {filters.page} of {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 20))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) * (filters.pageSize ?? 20) >= (data?.count ?? 0)}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Start Production Run Dialog */}
      <Dialog
        open={newOpen}
        onOpenChange={(v) => {
          setNewOpen(v);
          if (!v) resetDialog();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start Production Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Item selector — finished_good only */}
            <div className="space-y-1.5">
              <Label>Finished Good to Build *</Label>
              <Popover open={itemOpen} onOpenChange={setItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedItem
                      ? `${selectedItem.item_code} — ${selectedItem.description}`
                      : "Select finished good..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search items..." />
                    <CommandList>
                      <CommandEmpty>No finished good found. Add finished goods in Items master.</CommandEmpty>
                      <CommandGroup>
                        {items.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_code} ${item.description}`}
                            onSelect={() => {
                              setSelectedItem(item);
                              setQuantity((item as any).production_batch_size || 1);
                              setSelectedVariantId("");
                              setItemOpen(false);
                            }}
                          >
                            <div>
                              <p className="font-mono text-xs font-medium">{item.item_code}</p>
                              <p className="text-sm">{item.description}</p>
                              <p className="text-xs text-muted-foreground">
                                Stock: {item.current_stock} {item.unit}
                                {(item as any).min_finished_stock > 0 && (
                                  <> · Min: {(item as any).min_finished_stock}</>
                                )}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Variant selector */}
            {selectedItem && variants.length > 0 && (
              <div className="space-y-1.5">
                <Label>BOM Variant</Label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default BOM (no variant)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default BOM</SelectItem>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.variant_name}
                        {v.variant_code ? ` (${v.variant_code})` : ""}
                        {v.is_default ? " — Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label>Quantity to Build *</Label>
              <Input
                type="number"
                min={1}
                value={quantity || ""}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                {quantity} serial number{quantity !== 1 ? "s" : ""} and draft FAT certificate{quantity !== 1 ? "s" : ""} will be generated automatically.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>

            {/* Component availability preview */}
            {selectedItem && bomLines.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Component Availability</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Component</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">Required</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-600">In Stock</th>
                        <th className="text-center px-3 py-2 font-medium text-slate-600">OK?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomLines.map((bl) => {
                        const reqQty = (bl as any).required_qty_total ?? bl.quantity * quantity;
                        const avail = (bl as any).child_current_stock ?? 0;
                        const ok = avail >= reqQty;
                        return (
                          <tr key={bl.id} className={!ok ? "bg-red-50/50" : ""}>
                            <td className="px-3 py-1.5">
                              <p className="font-medium">{bl.child_item_code ?? bl.child_item_id}</p>
                              {bl.child_item_description && (
                                <p className="text-muted-foreground truncate max-w-[160px]">{bl.child_item_description}</p>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{reqQty} {bl.child_unit ?? bl.unit}</td>
                            <td className={`px-3 py-1.5 text-right font-mono ${!ok ? "text-destructive font-semibold" : "text-emerald-600"}`}>
                              {avail}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {ok ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {bomLines.some((bl) => {
                  const reqQty = (bl as any).required_qty_total ?? bl.quantity * quantity;
                  return ((bl as any).child_current_stock ?? 0) < reqQty;
                }) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Some components are short. You can still start the run — stock will be checked at Mark Complete.
                  </p>
                )}
              </div>
            )}

            {selectedItem && bomLines.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                No BOM found for this item. Add BOM lines in Bill of Materials before starting production.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewOpen(false);
                resetDialog();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={startMutation.isPending || !selectedItem}>
              {startMutation.isPending ? "Starting…" : "Start Production Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
