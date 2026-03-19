import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitFork, Plus, Trash2, Search, ChevronDown, Pencil, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  fetchBomLines,
  createBomLine,
  updateBomLine,
  deleteBomLine,
  type BomLine,
} from "@/lib/assembly-orders-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { formatCurrency } from "@/lib/gst-utils";

const typeColor: Record<string, string> = {
  finished_good:  "bg-emerald-100 text-emerald-800",
  sub_assembly:   "bg-indigo-100 text-indigo-800",
  component:      "bg-sky-100 text-sky-800",
  bought_out:     "bg-amber-100 text-amber-800",
  consumable:     "bg-teal-100 text-teal-800",
  raw_material:   "bg-orange-100 text-orange-800",
};

const stockIndicator = (current: number, required: number) => {
  if (current <= 0) return "bg-red-50 border border-red-200 text-red-700";
  if (current < required) return "bg-amber-50 border border-amber-200 text-amber-700";
  return "bg-green-50 border border-green-200 text-green-700";
};

export default function BillOfMaterials() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<BomLine | null>(null);
  const [childItemOpen, setChildItemOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Item | null>(null);
  const [lineForm, setLineForm] = useState({ quantity: 1, unit: "", notes: "" });

  // All items for the left panel selector
  const { data: allItemsData } = useQuery({
    queryKey: ["items-all-bom"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
  });
  const allItems = allItemsData?.data ?? [];

  // Items eligible to be parents (can have BOM)
  const parentCandidates = allItems.filter((i) =>
    ["finished_good", "sub_assembly", "component"].includes(i.item_type)
  );

  const filteredParents = itemSearch.trim()
    ? parentCandidates.filter(
        (i) =>
          i.item_code.toLowerCase().includes(itemSearch.toLowerCase()) ||
          i.description.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : parentCandidates;

  // BOM lines for selected item
  const { data: bomLines = [], isLoading: bomLoading } = useQuery({
    queryKey: ["bom-lines", selectedItem?.id],
    queryFn: () => fetchBomLines(selectedItem!.id),
    enabled: !!selectedItem,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createBomLine({
        parent_item_id: selectedItem!.id,
        child_item_id: selectedChild!.id,
        quantity: lineForm.quantity,
        unit: lineForm.unit || selectedChild?.unit || undefined,
        notes: lineForm.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines", selectedItem?.id] });
      setAddOpen(false);
      setSelectedChild(null);
      setLineForm({ quantity: 1, unit: "", notes: "" });
      toast({ title: "Component added to BOM" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; quantity: number; unit: string; notes: string }) =>
      updateBomLine(data.id, {
        quantity: data.quantity,
        unit: data.unit || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines", selectedItem?.id] });
      setEditLine(null);
      toast({ title: "BOM line updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBomLine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines", selectedItem?.id] });
      toast({ title: "Component removed from BOM" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (line: BomLine) => {
    setEditLine(line);
    setLineForm({
      quantity: line.quantity,
      unit: line.unit ?? "",
      notes: line.notes ?? "",
    });
  };

  // Cost estimate
  const estimatedCost = bomLines.reduce(
    (sum, l) => sum + l.quantity * (l.child_standard_cost ?? 0),
    0
  );

  // Items available to be children (exclude the parent itself)
  const childCandidates = allItems.filter((i) => i.id !== selectedItem?.id);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
          <GitFork className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bill of Materials</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define component lists for finished goods and sub-assemblies.
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">

        {/* LEFT PANEL — Item selector */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-200px)] min-h-[400px]">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Items with BOM</h2>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 h-8 text-sm"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredParents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No items found</p>
            ) : (
              filteredParents.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                    selectedItem?.id === item.id ? "bg-blue-50 border-l-2 border-blue-500" : ""
                  }`}
                >
                  <p className="font-mono text-xs font-medium text-blue-600">{item.item_code}</p>
                  <p className="text-sm text-slate-700 truncate">{item.description}</p>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      typeColor[item.item_type] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.item_type?.replace(/_/g, " ")}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL — BOM editor */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
              <GitFork className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium text-sm">Select an item to view or edit its BOM</p>
              <p className="text-xs text-slate-400 mt-1">Click any item in the left panel</p>
            </div>
          ) : (
            <>
              {/* BOM header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{selectedItem.description}</h2>
                    <span className="font-mono text-xs text-slate-400">{selectedItem.item_code}</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        typeColor[selectedItem.item_type] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {selectedItem.item_type?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {bomLines.length} component{bomLines.length !== 1 ? "s" : ""} · Est. cost:{" "}
                    <span className="font-medium text-slate-700">{formatCurrency(estimatedCost)}</span>
                  </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Component
                </Button>
              </div>

              {/* BOM lines table */}
              {bomLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : bomLines.length === 0 ? (
                <div className="py-12 text-center">
                  <GitFork className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 font-medium">No components defined yet</p>
                  <p className="text-xs text-slate-400 mt-1">Click "Add Component" to start building the BOM</p>
                </div>
              ) : (
                <div className="overflow-x-auto flex-1">
                  <table className="w-full data-table">
                    <thead>
                      <tr>
                        <th>Component Code</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th className="text-right">Qty / Unit</th>
                        <th className="text-right">Current Stock</th>
                        <th className="text-right">Unit Cost</th>
                        <th className="text-right">Line Cost</th>
                        <th className="w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomLines.map((line) => {
                        const stockCls = stockIndicator(
                          line.child_current_stock ?? 0,
                          line.quantity
                        );
                        return (
                          <tr key={line.id}>
                            <td className="font-mono text-xs text-blue-600 font-medium">
                              {line.child_item_code ?? "—"}
                            </td>
                            <td className="font-medium text-sm max-w-[180px] truncate">
                              {line.child_item_description ?? "—"}
                            </td>
                            <td>
                              {line.child_item_type && (
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                    typeColor[line.child_item_type] ?? "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {line.child_item_type.replace(/_/g, " ")}
                                </span>
                              )}
                            </td>
                            <td className="text-right font-mono tabular-nums text-sm">
                              {line.quantity} {line.child_unit ?? line.unit ?? ""}
                            </td>
                            <td className="text-right">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${stockCls}`}>
                                {line.child_current_stock ?? 0}
                              </span>
                            </td>
                            <td className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                              {formatCurrency(line.child_standard_cost ?? 0)}
                            </td>
                            <td className="text-right font-mono tabular-nums text-sm font-medium">
                              {formatCurrency(line.quantity * (line.child_standard_cost ?? 0))}
                            </td>
                            <td>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(line)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    if (confirm(`Remove ${line.child_item_code ?? "this component"} from BOM?`)) {
                                      deleteMutation.mutate(line.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cost summary footer */}
              {bomLines.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Estimated Cost per Unit</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(estimatedCost)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Based on current standard costs. Actual cost is calculated at Assembly Order time.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Component Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) {
            setSelectedChild(null);
            setLineForm({ quantity: 1, unit: "", notes: "" });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Component</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Component *</Label>
              <Popover open={childItemOpen} onOpenChange={setChildItemOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedChild
                      ? `${selectedChild.item_code} — ${selectedChild.description}`
                      : "Search and select component..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search items..." />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {childCandidates.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_code} ${item.description}`}
                            onSelect={() => {
                              setSelectedChild(item);
                              setLineForm((f) => ({ ...f, unit: item.unit ?? "" }));
                              setChildItemOpen(false);
                            }}
                          >
                            <div>
                              <p className="font-mono text-xs font-medium">{item.item_code}</p>
                              <p className="text-sm">{item.description}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.item_type?.replace(/_/g, " ")} · Stock: {item.current_stock}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity per Unit *</Label>
                <Input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={lineForm.quantity}
                  onChange={(e) =>
                    setLineForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input
                  value={lineForm.unit}
                  onChange={(e) => setLineForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder={selectedChild?.unit ?? "nos, kg, m..."}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={lineForm.notes}
                onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            {selectedChild && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current stock</span>
                  <span className="font-mono">{selectedChild.current_stock} {selectedChild.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Standard cost</span>
                  <span className="font-mono">{formatCurrency(selectedChild.standard_cost ?? 0)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Line cost (est.)</span>
                  <span className="font-mono">
                    {formatCurrency(lineForm.quantity * (selectedChild.standard_cost ?? 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setSelectedChild(null);
                setLineForm({ quantity: 1, unit: "", notes: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !selectedChild}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Add to BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit BOM Line Dialog */}
      <Dialog open={!!editLine} onOpenChange={(v) => { if (!v) setEditLine(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit BOM Line</DialogTitle>
          </DialogHeader>
          {editLine && (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-mono font-medium text-blue-600">{editLine.child_item_code}</p>
                <p className="text-slate-700">{editLine.child_item_description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantity per Unit *</Label>
                  <Input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={lineForm.quantity}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Input
                    value={lineForm.unit}
                    onChange={(e) => setLineForm((f) => ({ ...f, unit: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={lineForm.notes}
                  onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLine(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editLine) {
                  updateMutation.mutate({
                    id: editLine.id,
                    quantity: lineForm.quantity,
                    unit: lineForm.unit,
                    notes: lineForm.notes,
                  });
                }
              }}
              disabled={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
