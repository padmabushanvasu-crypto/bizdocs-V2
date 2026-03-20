import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Layers, Plus, Search, Eye, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssemblyOrders,
  fetchAssemblyOrderStats,
  createAssemblyOrder,
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

const emptyForm = {
  quantity_to_build: 1,
  notes: "",
  planned_date: "",
  work_order_ref: "",
};

export default function AssemblyOrders() {
  const navigate = useNavigate();
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
  const [form, setForm] = useState(emptyForm);

  const { data: stats } = useQuery({
    queryKey: ["ao-stats"],
    queryFn: fetchAssemblyOrderStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["assembly-orders", filters],
    queryFn: () => fetchAssemblyOrders(filters),
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items-all-ao"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
    enabled: newOpen,
  });
  const items = itemsData?.data ?? [];

  const { data: variants = [] } = useQuery<BomVariant[]>({
    queryKey: ["bom-variants-ao", selectedItem?.id],
    queryFn: () => fetchBomVariants(selectedItem!.id),
    enabled: newOpen && !!selectedItem,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAssemblyOrder({
        item_id: selectedItem?.id ?? undefined,
        item_code: selectedItem?.item_code ?? undefined,
        item_description: selectedItem?.description ?? undefined,
        quantity_to_build: form.quantity_to_build,
        notes: form.notes || undefined,
        planned_date: form.planned_date || undefined,
        work_order_ref: form.work_order_ref || undefined,
        variant_id: selectedVariantId || null,
      }),
    onSuccess: (ao) => {
      queryClient.invalidateQueries({ queryKey: ["assembly-orders"] });
      queryClient.invalidateQueries({ queryKey: ["ao-stats"] });
      setNewOpen(false);
      setSelectedItem(null);
      setSelectedVariantId("");
      setForm(emptyForm);
      toast({ title: "Assembly Order created", description: `${ao.ao_number} is ready.` });
      navigate(`/assembly-orders/${ao.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!form.quantity_to_build || form.quantity_to_build <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const aos = data?.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" /> Assembly Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">Build sub-assemblies and finished goods from components</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="flex-shrink-0 active:scale-[0.98] transition-transform">
          <Plus className="h-4 w-4 mr-1" /> New Assembly Order
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          title="Active"
          value={String(stats?.active ?? 0)}
          icon={Layers}
          className={stats?.active ? "border-blue-200" : ""}
        />
        <MetricCard
          title="Completed This Month"
          value={String(stats?.completedThisMonth ?? 0)}
          icon={Layers}
        />
        <MetricCard
          title="Draft"
          value={String(stats?.draft ?? 0)}
          icon={Layers}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search AO#, item..."
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
                <th>AO Number</th>
                <th>Item to Build</th>
                <th className="text-right">Qty to Build</th>
                <th className="text-right">Qty Built</th>
                <th>Status</th>
                <th>Created</th>
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
                  <td colSpan={7} className="text-center py-12">
                    <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No assembly orders yet</p>
                    <p className="text-sm text-muted-foreground">Create one to build finished goods from components</p>
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

      {/* New Assembly Order Dialog */}
      <Dialog
        open={newOpen}
        onOpenChange={(v) => {
          setNewOpen(v);
          if (!v) {
            setSelectedItem(null);
            setSelectedVariantId("");
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Assembly Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item to Build *</Label>
              <Popover open={itemOpen} onOpenChange={setItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedItem
                      ? `${selectedItem.item_code} — ${selectedItem.description}`
                      : "Select item..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search items..." />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {items.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_code} ${item.description}`}
                            onSelect={() => {
                              setSelectedItem(item);
                              setSelectedVariantId("");
                              setItemOpen(false);
                            }}
                          >
                            <div>
                              <p className="font-mono text-xs font-medium">{item.item_code}</p>
                              <p className="text-sm">{item.description}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.item_type?.replace(/_/g, " ")}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Standard cost: ₹{(selectedItem.standard_cost ?? 0).toLocaleString("en-IN")} ·
                  Stock: {selectedItem.current_stock} {selectedItem.unit}
                </p>
              )}
            </div>

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

            <div className="space-y-1.5">
              <Label>Quantity to Build *</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity_to_build || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity_to_build: parseFloat(e.target.value) || 1 }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Planned Date</Label>
                <Input
                  type="date"
                  value={form.planned_date}
                  onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Work Order / Ref No</Label>
                <Input
                  value={form.work_order_ref}
                  onChange={(e) => setForm((f) => ({ ...f, work_order_ref: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            {selectedItem && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 font-medium">
                  BOM lines for this item will be auto-loaded from your Bill of Materials.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewOpen(false);
                setSelectedItem(null);
                setSelectedVariantId("");
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !selectedItem}>
              Create Assembly Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
