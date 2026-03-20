import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Activity, Plus, Search, Eye, ChevronDown, Trash2, Factory, Truck, CheckSquare, Square, XCircle } from "lucide-react";
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
  fetchJobCards,
  fetchJobCardStats,
  createJobCard,
  deleteJobCard,
  bulkDeleteJobCards,
  getNextJCNumber,
  type JobCardFilters,
} from "@/lib/job-cards-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { formatCurrency } from "@/lib/gst-utils";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

const statusClass: Record<string, string> = {
  in_progress: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  completed: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  on_hold: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};

const statusLabels: Record<string, string> = {
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

const emptyForm = {
  tracking_mode: "batch" as "batch" | "single",
  batch_ref: "",
  quantity_original: 1,
  initial_cost: 0,
  notes: "",
};

export default function JobCards() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<JobCardFilters>({
    search: "",
    status: "all",
    location: "all",
    page: 1,
    pageSize: 20,
  });

  const [newOpen, setNewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemOpen, setItemOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: stats } = useQuery({
    queryKey: ["jc-stats"],
    queryFn: fetchJobCardStats,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["job-cards", filters],
    queryFn: () => fetchJobCards(filters),
  });

  const { data: nextJCNumber } = useQuery({
    queryKey: ["next-jc-number"],
    queryFn: getNextJCNumber,
    enabled: newOpen,
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items-all"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
    enabled: newOpen,
  });
  const items = itemsData?.data ?? [];

  const { data: bomLines } = useQuery({
    queryKey: ["bom-lines-check", selectedItem?.id],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { data } = await (supabase as any)
        .from("bom_lines")
        .select("id")
        .eq("company_id", companyId)
        .eq("item_id", selectedItem!.id)
        .limit(1);
      return data ?? [];
    },
    enabled: !!selectedItem?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return createJobCard({
        jc_number: nextJCNumber!,
        item_id: selectedItem?.id ?? undefined,
        item_code: selectedItem?.item_code ?? undefined,
        item_description: selectedItem?.description ?? undefined,
        tracking_mode: form.tracking_mode,
        batch_ref: form.batch_ref || undefined,
        quantity_original: form.quantity_original,
        quantity_accepted: form.quantity_original,
        initial_cost: form.initial_cost,
        notes: form.notes || undefined,
      });
    },
    onSuccess: (jc) => {
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["jc-stats"] });
      setNewOpen(false);
      setSelectedItem(null);
      setForm(emptyForm);
      toast({ title: "Work Order created", description: `${jc.jc_number} is now active.` });
      navigate(`/job-cards/${jc.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJobCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["jc-stats"] });
      toast({ title: "Work Order deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!form.quantity_original || form.quantity_original <= 0) {
      toast({ title: "Quantity must be greater than 0", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const handleDelete = (e: React.MouseEvent, id: string, jcNumber: string) => {
    e.stopPropagation();
    if (confirm(`Delete Work Order ${jcNumber}? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteJobCards(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-cards"] });
      queryClient.invalidateQueries({ queryKey: ["jc-stats"] });
      const count = selected.size;
      setSelected(new Set());
      toast({ title: `${count} job card(s) deleted` });
    },
    onError: (err: any) => {
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const jcs = data?.data ?? [];
  const allSelected = jcs.length > 0 && selected.size === jcs.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(jcs.map((j) => j.id)));
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" /> Work Orders
          </h1>
          <p className="text-sm text-slate-500">Track manufacturing jobs through each process stage</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="active:scale-[0.98] transition-transform">
          <Plus className="h-4 w-4 mr-1" /> New Work Order
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="In Progress"
          value={String(stats?.inProgress ?? 0)}
          icon={Activity}
          className={stats?.inProgress ? "border-blue-200" : ""}
        />
        <MetricCard title="At Vendor" value={String(stats?.atVendor ?? 0)} icon={Truck} />
        <MetricCard title="Completed" value={String(stats?.completed ?? 0)} icon={Activity} />
        <MetricCard title="On Hold" value={String(stats?.onHold ?? 0)} icon={Activity} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search JC#, item, batch ref..."
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
            <SelectItem value="on_hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.location}
          onValueChange={(v) => setFilters((f) => ({ ...f, location: v, page: 1 }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            <SelectItem value="in_house">In House</SelectItem>
            <SelectItem value="at_vendor">At Vendor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Delete ${selected.size} job card(s)? This cannot be undone.`)) {
                bulkDeleteMutation.mutate([...selected]);
              }
            }}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setSelected(new Set())}
          >
            <XCircle className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allSelected
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : <Square className="h-4 w-4 text-slate-400" />
                    }
                  </button>
                </th>
                <th>JC #</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>Batch Ref</th>
                <th>Location</th>
                <th className="text-right">Qty (Acc / Orig)</th>
                <th className="text-right">Total Cost</th>
                <th className="text-right">Variance</th>
                <th>Status</th>
                <th className="text-right">Days Active</th>
                <th className="w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : jcs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12">
                    <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No work orders yet</p>
                    <p className="text-sm text-muted-foreground">
                      Create your first Work Order to track manufacturing
                    </p>
                  </td>
                </tr>
              ) : (
                jcs.map((jc) => {
                  const startDate = new Date(jc.created_at).getTime();
                  const endDate = jc.status === "completed" && jc.completed_at
                    ? new Date(jc.completed_at).getTime()
                    : Date.now();
                  const daysActive = Math.floor((endDate - startDate) / 86400000);
                  const variance = jc.variance ?? 0;
                  const isOver = variance > 0;

                  return (
                    <tr
                      key={jc.id}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${selected.has(jc.id) ? "bg-blue-50/60" : ""}`}
                      onClick={() => navigate(`/job-cards/${jc.id}`)}
                    >
                      <td onClick={(e) => { e.stopPropagation(); toggleSelect(jc.id); }}>
                        {selected.has(jc.id)
                          ? <CheckSquare className="h-4 w-4 text-blue-600 mx-auto" />
                          : <Square className="h-4 w-4 text-slate-300 mx-auto" />
                        }
                      </td>
                      <td className="font-mono text-sm font-medium text-foreground">
                        {jc.jc_number}
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">
                        {jc.item_code || "—"}
                      </td>
                      <td className="font-medium max-w-[180px] truncate">
                        {jc.item_description || "—"}
                      </td>
                      <td className="text-muted-foreground text-sm">
                        {jc.batch_ref || "—"}
                      </td>
                      <td>
                        {jc.current_location === "at_vendor" ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full">
                            <Truck className="h-3 w-3" />
                            {jc.current_vendor_name
                              ? `At ${jc.current_vendor_name}`
                              : "At Vendor"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2 py-0.5 rounded-full">
                            <Factory className="h-3 w-3" />
                            In House
                          </span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        <span className="text-foreground font-semibold">{jc.quantity_accepted}</span>
                        <span className="text-muted-foreground"> / {jc.quantity_original}</span>
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {formatCurrency(jc.total_cost ?? 0)}
                      </td>
                      <td className="text-right font-mono tabular-nums text-sm">
                        {jc.standard_cost > 0 ? (
                          <span className={isOver ? "text-destructive font-medium" : "text-green-600 font-medium"}>
                            {isOver ? "+" : ""}
                            {formatCurrency(Math.abs(variance))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <span className={statusClass[jc.status] || statusClass.in_progress}>
                          {statusLabels[jc.status] || jc.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <span
                          className={
                            jc.status === "completed"
                              ? "text-muted-foreground"
                              : daysActive > 30
                              ? "text-destructive font-semibold"
                              : daysActive > 14
                              ? "text-amber-600 font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {daysActive}d
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/job-cards/${jc.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleDelete(e, jc.id, jc.jc_number)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
            Page {filters.page} of{" "}
            {Math.ceil((data?.count ?? 0) / (filters.pageSize ?? 20))}
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

      {/* New Job Card Dialog */}
      <Dialog
        open={newOpen}
        onOpenChange={(v) => {
          setNewOpen(v);
          if (!v) {
            setSelectedItem(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>JC Number</Label>
              <Input
                value={nextJCNumber ?? "Generating..."}
                readOnly
                className="font-mono bg-muted"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Item</Label>
              <Popover open={itemOpen} onOpenChange={setItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedItem
                      ? `${selectedItem.item_code} — ${selectedItem.description}`
                      : "Select item (optional)..."}
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
                              setItemOpen(false);
                            }}
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
              {selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Standard cost: ₹{(selectedItem.standard_cost ?? 0).toLocaleString("en-IN")}
                </p>
              )}
              {selectedItem && bomLines && bomLines.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-xs text-blue-700">
                  This component has a standard processing route. Steps will be auto-populated when the Work Order is created.
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tracking Mode</Label>
              <Select
                value={form.tracking_mode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tracking_mode: v as "batch" | "single" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch — multiple identical units</SelectItem>
                  <SelectItem value="single">Single — one unique unit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Batch / Serial Ref</Label>
                <Input
                  value={form.batch_ref}
                  onChange={(e) => setForm((f) => ({ ...f, batch_ref: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity_original || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      quantity_original: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Initial Cost (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.initial_cost || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, initial_cost: parseFloat(e.target.value) || 0 }))
                }
                placeholder="Raw material or incoming cost"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewOpen(false);
                setSelectedItem(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
