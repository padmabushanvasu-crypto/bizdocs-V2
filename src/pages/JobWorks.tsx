import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Activity, Plus, Search, Eye, ChevronDown, Trash2, Factory, Truck, CheckSquare, Square, XCircle, ClipboardList, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import {
  fetchJobWorks,
  fetchJobWorkStats,
  createJobWork,
  createJobWorkStep,
  deleteJobWork,
  bulkDeleteJobWorks,
  getNextJCNumber,
  type JobWorkFilters,
} from "@/lib/job-works-api";
import { fetchProcessRouteForItem } from "@/lib/bom-api";
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

const priorityClass: Record<string, string> = {
  low: "bg-slate-50 text-slate-600 border border-slate-200 text-xs font-medium px-2 py-0.5 rounded-full",
  normal: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2 py-0.5 rounded-full",
  high: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full",
  urgent: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2 py-0.5 rounded-full",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const UNIT_OPTIONS = ["NOS", "KG", "KGS", "MTR", "SFT", "SET", "PAIR", "LOT"];

const emptyForm = {
  tracking_mode: "batch" as "batch" | "single",
  batch_ref: "",
  unit: "NOS",
  quantity_original: 0,
  planned_start_date: "",
  due_date: "",
  priority: "normal",
  sales_order_ref: "",
  initial_cost: 0,
  notes: "",
};

export default function JobWorks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<JobWorkFilters>({
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
  const [prefillData, setPrefillData] = useState<{ item_id: string; item_code: string; item_description: string; quantity: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if ((location.state as any)?.openNew) {
      setNewOpen(true);
      if ((location.state as any)?.prefill) {
        setPrefillData((location.state as any).prefill);
      }
      // Clear state so a refresh doesn't re-open the dialog
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const { data: stats } = useQuery({
    queryKey: ["jw-stats"],
    queryFn: fetchJobWorkStats,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["job-works", filters],
    queryFn: () => fetchJobWorks(filters),
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

  // Auto-select item from prefill once items are loaded.
  // Must come after `items` is declared to avoid TDZ reference error.
  useEffect(() => {
    if (!prefillData || items.length === 0) return;
    const found = items.find((it) => it.id === prefillData.item_id);
    if (found) {
      setSelectedItem(found);
      setForm((f) => ({ ...f, quantity_original: prefillData.quantity, unit: found.unit ?? "NOS" }));
    }
  }, [prefillData, items]);

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
      const trackingMode = selectedItem?.item_type === "finished_good" ? "single" : "batch";
      const jc = await createJobWork({
        jc_number: nextJCNumber!,
        item_id: selectedItem?.id ?? undefined,
        item_code: selectedItem?.item_code ?? undefined,
        item_description: selectedItem?.description ?? undefined,
        tracking_mode: trackingMode,
        batch_ref: form.batch_ref || undefined,
        unit: form.unit,
        quantity_original: form.quantity_original,
        quantity_accepted: form.quantity_original,
        planned_start_date: form.planned_start_date || undefined,
        due_date: form.due_date || undefined,
        priority: form.priority as "low" | "normal" | "high" | "urgent",
        sales_order_ref: form.sales_order_ref || undefined,
        initial_cost: form.initial_cost,
        notes: form.notes || undefined,
      });

      let stepsCreated = 0;
      if (selectedItem?.id) {
        const processSteps = await fetchProcessRouteForItem(selectedItem.id).catch(() => []);
        for (const step of processSteps) {
          await createJobWorkStep({
            job_card_id: jc.id,
            step_number: step.step_order,
            step_type: step.step_type === "external" ? "job_work" : "production",
            name: step.process_name,
            vendor_id: step.vendor_id ?? undefined,
            vendor_name: step.vendor_name ?? undefined,
            notes: step.notes ?? undefined,
          });
          stepsCreated++;
        }
      }

      return { jc, stepsCreated };
    },
    onSuccess: ({ jc, stepsCreated }) => {
      queryClient.invalidateQueries({ queryKey: ["job-works"] });
      queryClient.invalidateQueries({ queryKey: ["jw-stats"] });
      setNewOpen(false);
      setSelectedItem(null);
      setForm(emptyForm);
      toast({
        title: "Job Work created",
        description: stepsCreated > 0
          ? `${jc.jc_number} created with ${stepsCreated} process step${stepsCreated !== 1 ? "s" : ""} auto-loaded from BOM.`
          : `${jc.jc_number} is now active.`,
      });
      navigate(`/job-works/${jc.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJobWork(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-works"] });
      queryClient.invalidateQueries({ queryKey: ["jw-stats"] });
      toast({ title: "Job Work deleted" });
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
    if (confirm(`Delete Job Work ${jcNumber}? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteJobWorks(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-works"] });
      queryClient.invalidateQueries({ queryKey: ["jw-stats"] });
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

  const renderFormBody = () => (
    <>
      {prefillData && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Pre-filled from Stock Register — <span className="font-mono font-semibold">{prefillData.item_code}</span> is below minimum stock level
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Job Work Number</Label>
        <Input value={nextJCNumber ?? "Generating..."} readOnly className="font-mono bg-muted" />
      </div>

      <div className="space-y-1.5">
        <Label>Item</Label>
        <Popover open={itemOpen} onOpenChange={setItemOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
                        setForm((f) => ({ ...f, unit: item.unit ?? "NOS" }));
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
            This component has a standard processing route. Steps will be auto-populated when the Job Work is created.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Quantity *</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={String(form.quantity_original || "")}
            onChange={(e) => setForm((f) => ({ ...f, quantity_original: parseFloat(e.target.value) || 0 }))}
            placeholder="Enter quantity"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
            <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u} value={u} className="font-mono">{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="text-xs text-blue-600 bg-blue-50 rounded px-3 py-2">
        Unit auto-fills from the selected item. Change if needed.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={form.planned_start_date}
            onChange={(e) => setForm((f) => ({ ...f, planned_start_date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Due Date</Label>
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Sales Order Ref</Label>
        <Input
          value={form.sales_order_ref}
          onChange={(e) => setForm((f) => ({ ...f, sales_order_ref: e.target.value }))}
          placeholder="Optional — link to a sales order"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Batch / Serial Ref</Label>
        <Input
          value={form.batch_ref}
          onChange={(e) => setForm((f) => ({ ...f, batch_ref: e.target.value }))}
          placeholder="Optional"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Initial Cost (₹)</Label>
        <Input
          type="number"
          min={0}
          value={form.initial_cost || ""}
          onChange={(e) => setForm((f) => ({ ...f, initial_cost: parseFloat(e.target.value) || 0 }))}
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
    </>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" /> Job Works
          </h1>
          <p className="text-sm text-slate-500">Track manufacturing jobs through each process stage</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="active:scale-[0.98] transition-transform">
          <Plus className="h-4 w-4 mr-1" /> New Job Work
        </Button>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800">Failed to load Job Works</p>
            <p className="text-xs text-red-600 mt-0.5">{(error as any)?.message ?? "Unknown error"}</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 border-red-300 text-red-700 hover:bg-red-100" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      )}

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
            <SelectItem value="overdue">Overdue</SelectItem>
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
                <th>JW #</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>Batch Ref</th>
                <th>Location</th>
                <th className="text-right">Qty (Acc / Orig)</th>
                <th className="text-right">Total Cost</th>
                <th className="text-right">Variance</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>Status</th>
                <th className="text-right">Days Active</th>
                <th className="w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  {[0, 1, 2].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td><div className="h-4 w-4 bg-slate-200 rounded mx-auto" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-20" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-16" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-32" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-16" /></td>
                      <td><div className="h-5 bg-slate-200 rounded-full w-20" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-12 ml-auto" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-16 ml-auto" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-12 ml-auto" /></td>
                      <td><div className="h-5 bg-slate-200 rounded-full w-14" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-12" /></td>
                      <td><div className="h-5 bg-slate-200 rounded-full w-16" /></td>
                      <td><div className="h-3 bg-slate-200 rounded w-6 ml-auto" /></td>
                      <td><div className="h-6 bg-slate-200 rounded w-12" /></td>
                    </tr>
                  ))}
                </>
              ) : jcs.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <ClipboardList className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mb-1">No job works yet</h3>
                      <p className="text-sm text-slate-500 mb-6 max-w-xs">Create your first job work to start tracking components through the manufacturing process.</p>
                    </div>
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
                      onClick={() => navigate(`/job-works/${jc.id}`)}
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
                        <span className="text-muted-foreground text-xs"> {jc.unit ?? "NOS"}</span>
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
                        {jc.priority ? (
                          <span className={priorityClass[jc.priority] || priorityClass.normal}>
                            {priorityLabels[jc.priority] || jc.priority}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="text-sm">
                        {jc.due_date ? (() => {
                          const isOverdue = jc.status !== "completed" && jc.due_date < new Date().toISOString().slice(0, 10);
                          return (
                            <span className={isOverdue ? "text-red-600 font-medium flex items-center gap-1" : "text-muted-foreground"}>
                              {isOverdue && <AlertCircle className="h-3 w-3 shrink-0" />}
                              {new Date(jc.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          );
                        })() : (
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
                            onClick={() => navigate(`/job-works/${jc.id}`)}
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

      {/* New Work Order — Desktop Dialog / Mobile Sheet */}
      {isMobile ? (
        <Sheet
          open={newOpen}
          onOpenChange={(v) => {
            setNewOpen(v);
            if (!v) { setSelectedItem(null); setForm(emptyForm); setPrefillData(null); }
          }}
        >
          <SheetContent side="bottom" className="h-[90dvh] flex flex-col px-4 pb-0">
            <SheetHeader className="pb-2 border-b">
              <SheetTitle>New Job Work</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {renderFormBody()}
            </div>
            <SheetFooter className="border-t py-3">
              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
                Create Job Work
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog
          open={newOpen}
          onOpenChange={(v) => {
            setNewOpen(v);
            if (!v) { setSelectedItem(null); setForm(emptyForm); setPrefillData(null); }
          }}
        >
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Job Work</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {renderFormBody()}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setNewOpen(false); setSelectedItem(null); setForm(emptyForm); setPrefillData(null); }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                Create Job Work
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
