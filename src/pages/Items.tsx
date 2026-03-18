import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Search, Edit, Trash2, X, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { fetchItems, createItem, updateItem, deleteItem, type Item, type ItemFilters } from "@/lib/items-api";
import { formatCurrency } from "@/lib/gst-utils";
import ImportDialog from "@/components/ImportDialog";
import { ITEMS_IMPORT_CONFIG, type ValidatedRow } from "@/lib/import-utils";
import { exportToExcel, ITEMS_EXPORT_COLS } from "@/lib/export-utils";

const ITEM_TYPES = [
  { value: "finished_good", label: "Finished Good" },
  { value: "raw_material", label: "Raw Material" },
  { value: "job_work", label: "Job Work" },
  { value: "service", label: "Service" },
  { value: "consumable", label: "Consumable" },
];

const UNITS = ["NOS", "KG", "MTR", "SFT", "SET", "ROLL", "SHEET", "LITRE", "BOX"];
const GST_RATES = [0, 5, 12, 18, 28];

const emptyItem = {
  item_code: "", description: "", drawing_number: "", item_type: "finished_good",
  unit: "NOS", hsn_sac_code: "", sale_price: 0, purchase_price: 0, gst_rate: 18,
  min_stock: 0, notes: "", standard_cost: 0, min_stock_override: "" as string,
};

export default function Items() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ItemFilters>({ search: "", type: "all", status: "active" });
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyItem);

  const { data, isLoading } = useQuery({
    queryKey: ["items", filters],
    queryFn: () => fetchItems(filters),
  });

  const items = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        standard_cost: form.standard_cost || 0,
        min_stock_override: form.min_stock_override !== "" ? parseFloat(form.min_stock_override as string) : null,
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
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      toast({ title: "Item deactivated" });
    },
  });

  const openNew = () => {
    setEditingItem(null);
    setForm(emptyItem);
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setForm({
      item_code: item.item_code, description: item.description,
      drawing_number: item.drawing_number || "", item_type: item.item_type,
      unit: item.unit, hsn_sac_code: item.hsn_sac_code || "",
      sale_price: item.sale_price, purchase_price: item.purchase_price,
      gst_rate: item.gst_rate, min_stock: item.min_stock, notes: item.notes || "",
      standard_cost: item.standard_cost ?? 0,
      min_stock_override: item.min_stock_override != null ? String(item.min_stock_override) : "",
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.item_code.trim() || !form.description.trim()) {
      toast({ title: "Code and description are required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const typeLabel = ITEM_TYPES.reduce((a, t) => ({ ...a, [t.value]: t.label }), {} as Record<string, string>);

  const handleImportItems = async (rows: ValidatedRow[]) => {
    let imported = 0, warnings = 0;
    for (const row of rows) {
      const d = row.data;
      try {
        await createItem({
          item_code: d["Item Code"] || `ITEM-${Date.now()}`,
          description: d["Description"],
          drawing_number: d["Drawing Number"] || null,
          item_type: (d["Item Type"] || "finished_good").toLowerCase().replace(/ /g, "_"),
          unit: d["Default Unit"] || "NOS",
          purchase_price: d["Default Purchase Price"] ? parseFloat(d["Default Purchase Price"]) : 0,
          sale_price: d["Default Sale Price"] ? parseFloat(d["Default Sale Price"]) : 0,
          gst_rate: d["Default GST Rate"] ? parseFloat(d["Default GST Rate"]) : 18,
          hsn_sac_code: d["HSN/SAC Code"] || null,
          notes: d["Notes"] || null,
        } as any);
        imported++;
        if (row.status === "warning") warnings++;
      } catch {
        // skip
      }
    }
    queryClient.invalidateQueries({ queryKey: ["items"] });
    return { imported, warnings, skipped: rows.length - imported };
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Items</h1>
          <p className="text-sm text-slate-500">Master list of products, materials, and services</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportToExcel(items, ITEMS_EXPORT_COLS, `Items_${new Date().toISOString().split("T")[0]}.xlsx`, "Items")} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button onClick={openNew} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
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
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th>Drawing</th><th>Type</th>
                <th>Unit</th><th>HSN</th><th className="text-right">Sale Price</th>
                <th className="text-right">GST%</th><th className="w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No items found. Add your first item.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => openEdit(item)}>
                    <td className="font-mono text-xs font-medium text-foreground">{item.item_code}</td>
                    <td className="font-medium">{item.description}</td>
                    <td className="text-muted-foreground text-sm">{item.drawing_number || "—"}</td>
                    <td className="text-muted-foreground">{typeLabel[item.item_type] || item.item_type}</td>
                    <td>{item.unit}</td>
                    <td className="font-mono text-xs">{item.hsn_sac_code || "—"}</td>
                    <td className="text-right font-mono tabular-nums">{formatCurrency(item.sale_price)}</td>
                    <td className="text-right font-mono tabular-nums">{item.gst_rate}%</td>
                    <td>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
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
            </TabsList>

            <TabsContent value="general" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Item Code *</Label>
                  <Input value={form.item_code} onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))} placeholder="e.g. ITM-001" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Item Type *</Label>
                  <Select value={form.item_type} onValueChange={(v) => setForm((f) => ({ ...f, item_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Item description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Drawing Number</Label>
                  <Input value={form.drawing_number} onChange={(e) => setForm((f) => ({ ...f, drawing_number: e.target.value }))} />
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
                  <Label>Sale Price (₹)</Label>
                  <Input type="number" value={form.sale_price || ""} onChange={(e) => setForm((f) => ({ ...f, sale_price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Purchase Price (₹)</Label>
                  <Input type="number" value={form.purchase_price || ""} onChange={(e) => setForm((f) => ({ ...f, purchase_price: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GST Rate (%)</Label>
                  <Select value={String(form.gst_rate)} onValueChange={(v) => setForm((f) => ({ ...f, gst_rate: parseFloat(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GST_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Min Stock</Label>
                  <Input type="number" value={form.min_stock || ""} onChange={(e) => setForm((f) => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} />
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
                <p className="text-xs text-muted-foreground">Internal cost used for margin calculations.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Min Stock Override</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.min_stock_override}
                  onChange={(e) => setForm((f) => ({ ...f, min_stock_override: e.target.value }))}
                  placeholder="Leave blank to use Min Stock"
                />
                <p className="text-xs text-muted-foreground">
                  Overrides the Min Stock for the Stock Register. Leave blank to use the Min Stock value.
                </p>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {editingItem ? "Update" : "Create"} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        config={ITEMS_IMPORT_CONFIG}
        onImport={handleImportItems}
      />
    </div>
  );
}
