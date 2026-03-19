import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Plus, Edit, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  fetchReorderRules,
  createReorderRule,
  updateReorderRule,
  deleteReorderRule,
  type ReorderRule,
} from "@/lib/reorder-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { fetchParties, type Party } from "@/lib/parties-api";

// ── Dialog form state ─────────────────────────────────────────────────────────

interface RuleFormState {
  item_id: string;
  item_code: string;
  item_description: string;
  reorder_point: number;
  reorder_qty: number;
  lead_time_days: number;
  preferred_vendor_id: string;
  preferred_vendor_name: string;
  notes: string;
}

function emptyForm(): RuleFormState {
  return {
    item_id: "",
    item_code: "",
    item_description: "",
    reorder_point: 0,
    reorder_qty: 0,
    lead_time_days: 7,
    preferred_vendor_id: "",
    preferred_vendor_name: "",
    notes: "",
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReorderRules() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm());
  const [itemOpen, setItemOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["reorder-rules"],
    queryFn: fetchReorderRules,
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items-all-reorder"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
  });
  const items: Item[] = itemsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ["parties-vendors-reorder"],
    queryFn: () => fetchParties({ type: "vendor", status: "active", pageSize: 500 }),
  });
  const vendors: Party[] = (vendorsData?.data ?? []) as Party[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["reorder-rules"] });
    queryClient.invalidateQueries({ queryKey: ["reorder-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["reorder-summary-sidebar"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.item_id) throw new Error("Please select an item.");
      if (form.reorder_point < 0) throw new Error("Reorder point must be ≥ 0.");

      const payload: Partial<ReorderRule> = {
        item_id: form.item_id,
        reorder_point: Number(form.reorder_point),
        reorder_qty: Number(form.reorder_qty),
        lead_time_days: Number(form.lead_time_days),
        preferred_vendor_id: form.preferred_vendor_id || null,
        notes: form.notes || null,
        is_active: true,
      };

      if (editingId) {
        return updateReorderRule(editingId, payload);
      } else {
        return createReorderRule(payload);
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Rule updated" : "Rule created" });
      invalidate();
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReorderRule(id),
    onSuccess: () => {
      toast({ title: "Rule deleted" });
      invalidate();
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (rule: ReorderRule) => {
    setEditingId(rule.id);
    setForm({
      item_id: rule.item_id,
      item_code: rule.item_code ?? "",
      item_description: rule.item_description ?? "",
      reorder_point: rule.reorder_point,
      reorder_qty: rule.reorder_qty,
      lead_time_days: rule.lead_time_days,
      preferred_vendor_id: rule.preferred_vendor_id ?? "",
      preferred_vendor_name: rule.preferred_vendor_name ?? "",
      notes: rule.notes ?? "",
    });
    setDialogOpen(true);
  };

  const selectItem = (item: Item) => {
    setForm((f) => ({
      ...f,
      item_id: item.id,
      item_code: item.item_code,
      item_description: item.description,
      reorder_point: f.reorder_point || item.min_stock || 0,
    }));
    setItemOpen(false);
  };

  const selectVendor = (v: Party) => {
    setForm((f) => ({ ...f, preferred_vendor_id: v.id, preferred_vendor_name: v.name }));
    setVendorOpen(false);
  };

  const clearVendor = () => {
    setForm((f) => ({ ...f, preferred_vendor_id: "", preferred_vendor_name: "" }));
  };

  const field = (key: keyof RuleFormState) => ({
    value: form[key] as any,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Reorder Rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure reorder points and preferred vendors per item
          </p>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Rule
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Items without a custom rule use their <strong>Minimum Stock Level</strong> as the reorder
          point. Add rules here to set custom thresholds and preferred vendors.
        </span>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Min Stock</th>
                <th className="text-right">Reorder Pt.</th>
                <th className="text-right">Reorder Qty</th>
                <th className="text-right">Lead Time</th>
                <th>Preferred Vendor</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground">
                    Loading rules…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground">
                    No reorder rules configured. Click "Add Rule" to get started.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                    <td className="font-mono text-xs font-medium">{rule.item_code ?? "—"}</td>
                    <td className="font-medium text-sm">{rule.item_description ?? "—"}</td>
                    <td className="text-xs text-muted-foreground capitalize">
                      {rule.item_type?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">
                      {rule.item_min_stock ?? 0}
                    </td>
                    <td className="text-right font-mono tabular-nums font-medium">
                      {rule.reorder_point}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {rule.reorder_qty}
                    </td>
                    <td className="text-right text-sm text-muted-foreground">
                      {rule.lead_time_days}d
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {rule.preferred_vendor_name ?? "—"}
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        rule.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(rule)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(rule.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Reorder Rule" : "Add Reorder Rule"}</DialogTitle>
            <DialogDescription>
              Set custom reorder thresholds for an item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Item picker */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                Item *
              </Label>
              <Popover open={itemOpen} onOpenChange={setItemOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full mt-1 justify-between font-normal"
                    disabled={!!editingId}
                  >
                    {form.item_code
                      ? `${form.item_code} — ${form.item_description}`
                      : "Select item…"}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item…" />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {items.map((it) => (
                          <CommandItem
                            key={it.id}
                            value={`${it.item_code} ${it.description}`}
                            onSelect={() => selectItem(it)}
                          >
                            <div>
                              <p className="font-medium text-sm">{it.item_code}</p>
                              <p className="text-xs text-muted-foreground">{it.description}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                  Reorder Point
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1"
                  value={form.reorder_point}
                  onChange={(e) => setForm((f) => ({ ...f, reorder_point: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                  Reorder Qty
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1"
                  value={form.reorder_qty}
                  onChange={(e) => setForm((f) => ({ ...f, reorder_qty: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                  Lead Time (days)
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className="mt-1"
                  value={form.lead_time_days}
                  onChange={(e) => setForm((f) => ({ ...f, lead_time_days: Number(e.target.value) }))}
                />
              </div>
            </div>

            {/* Vendor picker */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                Preferred Vendor
              </Label>
              <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full mt-1 justify-between font-normal"
                  >
                    {form.preferred_vendor_name || "None (optional)"}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendor…" />
                    <CommandList>
                      <CommandEmpty>No vendor found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="none" onSelect={clearVendor}>
                          <span className="text-muted-foreground">— None —</span>
                        </CommandItem>
                        {vendors.map((v) => (
                          <CommandItem
                            key={v.id}
                            value={v.name}
                            onSelect={() => selectVendor(v)}
                          >
                            <div>
                              <p className="font-medium text-sm">{v.name}</p>
                              {v.city && (
                                <p className="text-xs text-muted-foreground">{v.city}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                Notes
              </Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Optional notes…"
                {...field("notes")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {editingId ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reorder Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom rule. The item will fall back to its minimum stock level as
              the reorder point.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
