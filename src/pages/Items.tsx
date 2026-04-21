import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Search, Edit, Trash2, X, Upload, Download, CheckSquare, Square, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { fetchItems, createItem, updateItem, deleteItem, bulkDeleteItems, fetchItemClassifications, createItemClassification, type Item, type ItemFilters, type ItemClassification } from "@/lib/items-api";
import ItemsImportDialog from "@/components/ItemsImportDialog";
import { exportToExcel, ITEMS_EXPORT_COLS } from "@/lib/export-utils";
import { UNITS } from "@/lib/constants";
import { useRoleAccess } from "@/hooks/useRoleAccess";

const ITEM_TYPES = [
  { value: "raw_material", label: "Raw Material" },
  { value: "component", label: "Component" },
  { value: "sub_assembly", label: "Sub Assembly" },
  { value: "bought_out", label: "Bought Out" },
  { value: "finished_good", label: "Finished Good" },
  { value: "product", label: "Product" },
  { value: "consumable", label: "Consumable" },
  { value: "service", label: "Service" },
];

const TYPE_BADGE: Record<string, string> = {
  finished_good: "bg-blue-50 text-blue-700 border border-blue-200",
  raw_material: "bg-orange-100 text-orange-800",
  component: "bg-sky-100 text-sky-800",
  sub_assembly: "bg-indigo-100 text-indigo-800",
  bought_out: "bg-amber-100 text-amber-800",
  product: "bg-emerald-100 text-emerald-800",
  service: "bg-violet-100 text-violet-800",
  consumable: "bg-teal-100 text-teal-800",
};

const GST_RATES = [0, 5, 12, 18, 28];

const emptyItem = {
  item_code: "", description: "", drawing_number: "", drawing_revision: "", item_type: "raw_material",
  unit: "NOS", hsn_sac_code: "", gst_rate: 18,
  min_stock: 0, aimed_stock: 0, notes: "", standard_cost: 0,
  min_finished_stock: 0, production_batch_size: 1,
};

export default function Items() {
  const { toast } = useToast();
  const { companyId } = useAuth();
  const { canExport, canEdit } = useRoleAccess();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ItemFilters>({ search: "", type: "all", status: "active" });
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Classification
  const [classifDialogOpen, setClassifDialogOpen] = useState(false);
  const [classifForm, setClassifForm] = useState({ name: "", description: "", affects_stock: true, affects_reorder: true, affects_bom: true });
  const [customClassifId, setCustomClassifId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["items", { type: filters.type, status: filters.status }],
    queryFn: () => fetchItems({ type: filters.type, status: filters.status }),
    enabled: !!companyId,
  });

  const allItems = data?.data ?? [];
  const totalCount = allItems.length;

  const items = useMemo(() => {
    if (!filters.search?.trim()) return allItems;
    const q = filters.search.toLowerCase();
    return allItems.filter((item) =>
      item.item_code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.drawing_number?.toLowerCase() ?? "").includes(q) ||
      (item.drawing_revision?.toLowerCase() ?? "").includes(q) ||
      (item.hsn_sac_code?.toLowerCase() ?? "").includes(q)
    );
  }, [allItems, filters.search]);

  const { data: classifications = [] } = useQuery({
    queryKey: ["item-classifications"],
    queryFn: fetchItemClassifications,
    staleTime: 60_000,
  });

  const createClassifMutation = useMutation({
    mutationFn: () => createItemClassification(classifForm),
    onSuccess: (newClassif) => {
      queryClient.invalidateQueries({ queryKey: ["item-classifications"] });
      setCustomClassifId(newClassif.id);
      setClassifDialogOpen(false);
      setClassifForm({ name: "", description: "", affects_stock: true, affects_reorder: true, affects_bom: true });
      toast({ title: "Classification created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Optimistic single delete
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onMutate: async (id) => {
      const qKey = ["items", { type: filters.type, status: filters.status }];
      await queryClient.cancelQueries({ queryKey: qKey });
      const prev = queryClient.getQueryData(qKey);
      queryClient.setQueryData(qKey, (old: any) =>
        old ? { ...old, data: old.data.filter((i: any) => i.id !== id) } : old
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.invalidateQueries({ queryKey: ["items"] });
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Item deleted" });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  // Optimistic bulk delete
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteItems(ids),
    onMutate: async (ids) => {
      const qKey = ["items", { type: filters.type, status: filters.status }];
      await queryClient.cancelQueries({ queryKey: qKey });
      const prev = queryClient.getQueryData(qKey);
      const idSet = new Set(ids);
      queryClient.setQueryData(qKey, (old: any) =>
        old ? { ...old, data: old.data.filter((i: any) => !idSet.has(i.id)) } : old
      );
      setSelected(new Set());
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.invalidateQueries({ queryKey: ["items"] });
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.deleted > 0) parts.push(`${result.deleted} deleted`);
      if (result.deactivated > 0) parts.push(`${result.deactivated} deactivated`);
      toast({ title: parts.join(", ") || "Done" });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Normalize optional text fields — send null, not empty string
      const payload = {
        ...form,
        drawing_number: form.drawing_number || null,
        drawing_revision: form.drawing_revision || null,
        hsn_sac_code: form.hsn_sac_code || null,
        notes: form.notes || null,
        standard_cost: form.standard_cost || 0,
        custom_classification_id: customClassifId ?? null,
        // min_stock_override intentionally omitted — never set by this form;
        // sending explicit null overwrites any value set via other means and
        // fails if PostgREST schema cache hasn't refreshed since the migration.
      };
      if (editingItem) {
        return updateItem(editingItem.id, payload as any);
      }
      return createItem(payload as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setFormOpen(false);
      toast({ title: editingItem ? "Item updated" : "Item created" });
    },
    onError: (err: any) => {
      console.error("[Items] save error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const openNew = () => {
    setEditingItem(null);
    setForm(emptyItem);
    setCustomClassifId(null);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setCustomClassifId((item as any).custom_classification_id ?? null);
    setForm({
      item_code: item.item_code, description: item.description,
      drawing_number: item.drawing_number || "", drawing_revision: item.drawing_revision || "", item_type: item.item_type,
      unit: item.unit, hsn_sac_code: item.hsn_sac_code || "",
      gst_rate: item.gst_rate, min_stock: item.min_stock, aimed_stock: (item as any).aimed_stock ?? 0, notes: item.notes || "",
      standard_cost: item.standard_cost ?? 0,
      min_finished_stock: (item as any).min_finished_stock ?? 0,
      production_batch_size: (item as any).production_batch_size ?? 1,
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.description.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const typeLabel = ITEM_TYPES.reduce((a, t) => ({ ...a, [t.value]: t.label }), {} as Record<string, string>);
  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Items</h1>
            {!canEdit && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                View Only
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {totalCount > 0
              ? items.length < totalCount
                ? `Showing ${items.length} of ${totalCount} items`
                : `${totalCount} items`
              : "Master list of products, materials, and services"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {canExport && <Button variant="outline" onClick={() => exportToExcel(items, ITEMS_EXPORT_COLS, `Items_${new Date().toISOString().split("T")[0]}.xlsx`, "Items")} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>}
          {canEdit && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Import
            </Button>
          )}
          {canEdit && (
            <Button onClick={openNew} className="active:scale-[0.98] transition-transform">
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search code, description, drawing..." className="pl-9"
            value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <Select value={filters.type || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filters.search || (filters.type && filters.type !== "all")) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground"
            onClick={() => setFilters((f) => ({ ...f, search: "", type: "all" }))}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear filters
          </Button>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete Selected
            </Button>
          )}
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

      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-120px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center w-8">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allSelected
                      ? <CheckSquare className="h-4 w-4 text-blue-600" />
                      : <Square className="h-4 w-4 text-slate-400" />
                    }
                  </button>
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No.</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Code</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Type</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">HSN</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Min Stock</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Aimed Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">GST%</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>

              ) : items.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">No items found. Add your first item.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={`transition-colors ${canEdit ? "hover:bg-muted/50 cursor-pointer" : ""} ${selected.has(item.id) ? "bg-blue-50/60" : ""}`} onClick={canEdit ? () => openEdit(item) : undefined}>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center" onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
                      {selected.has(item.id)
                        ? <CheckSquare className="h-4 w-4 text-blue-600 mx-auto" />
                        : <Square className="h-4 w-4 text-slate-300 mx-auto" />
                      }
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left" onClick={(e) => e.stopPropagation()}>
                      {item.drawing_revision ? (
                        <button
                          className="font-mono text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          onClick={() => setFilters((f) => ({ ...f, search: item.drawing_revision! }))}
                          title="Click to filter by this drawing number"
                        >
                          {item.drawing_revision}
                        </button>
                      ) : item.drawing_number ? (
                        <span className="font-mono text-xs text-slate-400">{item.drawing_number}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{item.item_code}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{item.description}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[item.item_type] || "bg-slate-100 text-slate-600"}`}>
                        {typeLabel[item.item_type] || item.item_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.unit}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{item.hsn_sac_code || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{item.min_stock || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{(item as any).aimed_stock || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{item.gst_rate}%</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setItemToDelete(item)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general">
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
              <TabsTrigger value="costing" className="flex-1">Costing &amp; Stock</TabsTrigger>
              {form.item_type === "finished_good" && (
                <TabsTrigger value="production" className="flex-1">Production</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="general" className="space-y-3 mt-3">
              <div className="space-y-1.5">
                <Label>Drawing Number (Primary ID)</Label>
                <Input
                  value={form.drawing_revision}
                  onChange={(e) => setForm((f) => ({ ...f, drawing_revision: e.target.value }))}
                  placeholder="e.g. DWG-FCA-001"
                  className="font-mono text-base"
                />
                <p className="text-xs text-muted-foreground">This is the primary identifier used across all documents. Item code will be auto-generated from this if left blank.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Item Code (auto-generated if blank)</Label>
                  <Input
                    value={form.item_code}
                    onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
                    placeholder={form.drawing_revision ? form.drawing_revision.toUpperCase().replace(/[^A-Z0-9\-\.]/g, "").slice(0, 30) || "Auto" : "Auto"}
                    className="font-mono"
                  />
                  {!form.item_code.trim() && form.drawing_revision.trim() && !editingItem && (
                    <p className="text-xs text-blue-600">Will be generated as: {form.drawing_revision.trim().toUpperCase().replace(/[^A-Z0-9\-\.]/g, "").slice(0, 30)}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Item Type / Classification *</Label>
                  <Select
                    value={customClassifId ?? form.item_type}
                    onValueChange={(v) => {
                      if (v === "__create_new__") { setClassifDialogOpen(true); return; }
                      const isClassif = classifications.some(c => c.id === v);
                      if (isClassif) {
                        setCustomClassifId(v);
                      } else {
                        setCustomClassifId(null);
                        setForm(f => ({ ...f, item_type: v }));
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      {classifications.filter(c => !c.is_system).length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Custom</div>
                          {classifications.filter(c => !c.is_system).map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: `#${c.color}` }} />
                                {c.name}
                              </span>
                            </SelectItem>
                          ))}
                        </>
                      )}
                      <SelectItem value="__create_new__">
                        <span className="text-primary font-medium">+ Create New Classification</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Item description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Drawing Number (Alt / Detail)</Label>
                  <Input value={form.drawing_number} onChange={(e) => setForm((f) => ({ ...f, drawing_number: e.target.value }))} placeholder="e.g. DWG-FCA-001-A" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>HSN/SAC Code</Label>
                  <Input value={form.hsn_sac_code} onChange={(e) => setForm((f) => ({ ...f, hsn_sac_code: e.target.value }))} className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>GST Rate (%)</Label>
                  <Select value={String(form.gst_rate)} onValueChange={(v) => setForm((f) => ({ ...f, gst_rate: parseFloat(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GST_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Minimum Stock Level</Label>
                  <Input type="number" min={0} value={form.min_stock || ""} onChange={(e) => setForm((f) => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Aimed Qty (Max)</Label>
                  <Input type="number" min={0} value={(form as any).aimed_stock || ""} onChange={(e) => setForm((f) => ({ ...f, aimed_stock: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </TabsContent>

            <TabsContent value="costing" className="space-y-3 mt-3">
              <div className="space-y-1.5">
                <Label>Standard Cost (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={form.standard_cost || ""}
                  onChange={(e) => setForm((f) => ({ ...f, standard_cost: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">Internal cost used for margin calculations and assembly costing.</p>
              </div>
            </TabsContent>

            {form.item_type === "finished_good" && (
              <TabsContent value="production" className="space-y-3 mt-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  Production settings trigger alerts when finished goods stock falls below the minimum. The system uses batch size to suggest how many units to build.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Min Finished Stock</Label>
                    <Input
                      type="number"
                      min={0}
                      value={(form as any).min_finished_stock || ""}
                      onChange={(e) => setForm((f) => ({ ...f, min_finished_stock: parseFloat(e.target.value) || 0 } as any))}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">Alert triggered when stock falls below this level.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Production Batch Size</Label>
                    <Input
                      type="number"
                      min={1}
                      value={(form as any).production_batch_size || ""}
                      onChange={(e) => setForm((f) => ({ ...f, production_batch_size: parseFloat(e.target.value) || 1 } as any))}
                      placeholder="1"
                    />
                    <p className="text-xs text-muted-foreground">Default quantity per production run.</p>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {editingItem ? "Update" : "Create"} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ItemsImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Create Classification Dialog */}
      <Dialog open={classifDialogOpen} onOpenChange={setClassifDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Item Classification</DialogTitle>
            <DialogDescription>
              Classify items to control stock tracking, reorder alerts, and BOM behaviour.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Item classifications affect how items behave across the entire app — stock tracking, reorder alerts, BOM, and assembly orders. Set these options carefully. They cannot be changed once items are assigned to this classification.</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Classification Name *</Label>
              <Input value={classifForm.name} onChange={e => setClassifForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tool, Fixture, Packing Material" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={classifForm.description} onChange={e => setClassifForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              {([
                { key: "affects_stock", label: "Affects Stock Register" },
                { key: "affects_reorder", label: "Affects Reorder Alerts" },
                { key: "affects_bom", label: "Appears in BOM" },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <div className="flex gap-2">
                    {([true, false] as const).map(v => (
                      <button key={String(v)} onClick={() => setClassifForm(f => ({ ...f, [key]: v }))}
                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${classifForm[key] === v ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
                        {v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassifDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createClassifMutation.mutate()} disabled={!classifForm.name.trim() || createClassifMutation.isPending}>
              Create Classification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} item{selected.size !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              Items with transaction history will be deactivated instead of deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                bulkDeleteMutation.mutate([...selected]);
                setBulkDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => { if (!open) setItemToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{itemToDelete?.item_code} — {itemToDelete?.description}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (itemToDelete) { deleteMutation.mutate(itemToDelete.id); setItemToDelete(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
