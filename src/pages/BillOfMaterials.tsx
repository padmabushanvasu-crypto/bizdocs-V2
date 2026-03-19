import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitFork, Plus, Trash2, Search, ChevronDown, ChevronRight,
  Pencil, RefreshCw, Download, Printer, CheckCircle2, Star,
  AlertTriangle, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  fetchBomLines, createBomLine, updateBomLine, deleteBomLine,
  fetchBomVariants, createBomVariant, updateBomVariant, deleteBomVariant, setDefaultVariant,
  explodeBom, calculateBomCost, fetchWhereUsed, compareBomVariants,
  type BomLine, type BomVariant, type BomNode,
} from "@/lib/bom-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { format } from "date-fns";

// ── Colour maps ────────────────────────────────────────────────────────────────

const typeColor: Record<string, string> = {
  finished_good:  "bg-emerald-100 text-emerald-800",
  sub_assembly:   "bg-indigo-100 text-indigo-800",
  component:      "bg-sky-100 text-sky-800",
  bought_out:     "bg-amber-100 text-amber-800",
  consumable:     "bg-teal-100 text-teal-800",
  raw_material:   "bg-orange-100 text-orange-800",
  service:        "bg-pink-100 text-pink-800",
};

const CHART_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#6366f1"];

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeColor[type] ?? "bg-slate-100 text-slate-600"}`}>
      {type?.replace(/_/g, " ")}
    </span>
  );
}

// ── Recursive tree node for BOM Explosion ─────────────────────────────────────

function TreeRow({
  node,
  collapsed,
  onToggle,
}: {
  node: BomNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const indent = (node.level - 1) * 22;

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors text-sm">
        <td className="py-1.5">
          <div style={{ paddingLeft: indent }} className="flex items-center gap-1.5">
            {node.has_children ? (
              <button
                className="h-4 w-4 flex items-center justify-center text-slate-400 hover:text-slate-700 shrink-0"
                onClick={() => onToggle(node.id)}
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />
                }
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0 inline-block border-l border-b border-slate-200 ml-0.5" />
            )}
            <span className="font-mono text-xs text-blue-600 font-medium">{node.item_code}</span>
            {node.is_critical && (
              <span className="text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-semibold">
                CRIT
              </span>
            )}
            {node.drawing_number && (
              <span className="text-[10px] text-slate-400 font-mono">{node.drawing_number}</span>
            )}
          </div>
        </td>
        <td className="text-slate-700 max-w-[200px] truncate text-sm">{node.item_description}</td>
        <td><TypeBadge type={node.item_type} /></td>
        <td className="text-right font-mono tabular-nums text-sm">
          {node.effective_qty % 1 === 0 ? node.effective_qty.toFixed(0) : node.effective_qty.toFixed(3)}
          <span className="text-muted-foreground ml-1 text-xs">{node.unit}</span>
        </td>
        <td className="text-right font-mono tabular-nums text-sm text-muted-foreground">
          {formatCurrency(node.unit_cost)}
        </td>
        <td className="text-right font-mono tabular-nums text-sm font-medium">
          {formatCurrency(node.total_cost)}
        </td>
        <td className="text-center">
          {node.is_sufficient ? (
            <span className="text-xs text-green-600 font-medium">
              ✓ {node.current_stock}
            </span>
          ) : (
            <span className="text-xs text-red-600 font-semibold">
              ✗ {node.current_stock}
            </span>
          )}
        </td>
      </tr>
      {!isCollapsed &&
        node.children.map((child) => (
          <TreeRow key={child.id} node={child} collapsed={collapsed} onToggle={onToggle} />
        ))}
    </>
  );
}

// ── Flatten tree to rows (for print / export) ─────────────────────────────────

function flattenTree(nodes: BomNode[]): BomNode[] {
  const rows: BomNode[] = [];
  for (const n of nodes) {
    rows.push(n);
    if (n.children.length > 0) rows.push(...flattenTree(n.children));
  }
  return rows;
}

// ── Main component ─────────────────────────────────────────────────────────────

const emptyLineForm = {
  quantity: 1,
  unit: "",
  drawing_number: "",
  scrap_factor: 0,
  is_critical: false,
  reference_designator: "",
  notes: "",
};

const emptyVariantForm = {
  variant_name: "",
  variant_code: "",
  description: "",
  is_default: false,
  notes: "",
  copy_from: "" as string, // "" = fresh, "__default__" = default BOM, uuid = specific variant
};

export default function BillOfMaterials() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Left panel state ────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSearch, setItemSearch] = useState("");

  // ── Tab / variant state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("structure");
  // "" = default BOM (variant_id IS NULL), "uuid" = specific variant
  const [selectedVariantId, setSelectedVariantId] = useState("");

  // ── Tab 2: Explosion ────────────────────────────────────────────────────────
  const [explosionQty, setExplosionQty] = useState(1);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // ── Tab 3: Cost ─────────────────────────────────────────────────────────────
  const [costQty, setCostQty] = useState(1);

  // ── Tab 4: Where Used ──────────────────────────────────────────────────────
  const [whereUsedItemId, setWhereUsedItemId] = useState<string>("");

  // ── Tab 5: Variants ─────────────────────────────────────────────────────────
  const [compareV1, setCompareV1] = useState("");
  const [compareV2, setCompareV2] = useState("");

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<BomLine | null>(null);
  const [newVariantOpen, setNewVariantOpen] = useState(false);
  const [editVariant, setEditVariant] = useState<BomVariant | null>(null);
  const [childItemOpen, setChildItemOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Item | null>(null);
  const [lineForm, setLineForm] = useState({ ...emptyLineForm });
  const [variantForm, setVariantForm] = useState({ ...emptyVariantForm });

  // ── Reset state when item changes ────────────────────────────────────────────
  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedVariantId("");
    setActiveTab("structure");
    setCollapsedNodes(new Set());
    setWhereUsedItemId(item.id);
    setCompareV1("");
    setCompareV2("");
  };

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: allItemsData } = useQuery({
    queryKey: ["items-all-bom"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
  });
  const allItems = allItemsData?.data ?? [];

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

  const variantFilter = selectedVariantId === "" ? null : selectedVariantId;

  const { data: bomLines = [], isLoading: bomLoading, refetch: refetchLines } = useQuery({
    queryKey: ["bom-lines-v2", selectedItem?.id, selectedVariantId],
    queryFn: () => fetchBomLines(selectedItem!.id, variantFilter),
    enabled: !!selectedItem,
  });

  const { data: bomVariants = [], refetch: refetchVariants } = useQuery({
    queryKey: ["bom-variants", selectedItem?.id],
    queryFn: () => fetchBomVariants(selectedItem!.id),
    enabled: !!selectedItem,
  });

  const { data: explosionData, isLoading: exploding, refetch: refetchExplosion } = useQuery({
    queryKey: ["bom-explosion", selectedItem?.id, explosionQty, selectedVariantId],
    queryFn: () => explodeBom(selectedItem!.id, explosionQty, variantFilter),
    enabled: !!selectedItem && activeTab === "explosion",
    staleTime: 30000,
  });

  const { data: costRollup, isLoading: costing } = useQuery({
    queryKey: ["bom-cost", selectedItem?.id, costQty, selectedVariantId],
    queryFn: () => calculateBomCost(selectedItem!.id, costQty, variantFilter),
    enabled: !!selectedItem && activeTab === "cost",
    staleTime: 30000,
  });

  const whereUsedTarget = whereUsedItemId || selectedItem?.id || "";
  const { data: whereUsed = [], isLoading: whereUsedLoading } = useQuery({
    queryKey: ["bom-where-used", whereUsedTarget],
    queryFn: () => fetchWhereUsed(whereUsedTarget),
    enabled: !!whereUsedTarget && activeTab === "where-used",
    staleTime: 30000,
  });

  const { data: compareResult, isLoading: comparing } = useQuery({
    queryKey: ["bom-compare", selectedItem?.id, compareV1, compareV2],
    queryFn: () => compareBomVariants(selectedItem!.id, compareV1, compareV2),
    enabled: !!selectedItem && !!compareV1 && !!compareV2 && compareV1 !== compareV2 && activeTab === "variants",
    staleTime: 30000,
  });

  const childCandidates = allItems.filter((i) => i.id !== selectedItem?.id);
  const whereUsedItems = allItems; // for where-used search

  // ── Cost chart data ──────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!costRollup) return [];
    const data = [];
    if (costRollup.raw_material_cost > 0)
      data.push({ name: "Raw Material", value: costRollup.raw_material_cost });
    if (costRollup.bought_out_cost > 0)
      data.push({ name: "Bought Out", value: costRollup.bought_out_cost });
    if (costRollup.job_work_cost > 0)
      data.push({ name: "Job Work", value: costRollup.job_work_cost });
    if (costRollup.consumable_cost > 0)
      data.push({ name: "Consumable", value: costRollup.consumable_cost });
    return data;
  }, [costRollup]);

  // ── Mutations: BOM Lines ─────────────────────────────────────────────────────

  const createLineMutation = useMutation({
    mutationFn: () =>
      createBomLine({
        parent_item_id: selectedItem!.id,
        child_item_id: selectedChild!.id,
        quantity: lineForm.quantity,
        unit: lineForm.unit || selectedChild?.unit || undefined,
        drawing_number: lineForm.drawing_number || selectedChild?.drawing_number || undefined,
        scrap_factor: lineForm.scrap_factor,
        is_critical: lineForm.is_critical,
        reference_designator: lineForm.reference_designator || undefined,
        notes: lineForm.notes || undefined,
        variant_id: variantFilter,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-explosion", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-cost", selectedItem?.id] });
      setAddOpen(false);
      setSelectedChild(null);
      setLineForm({ ...emptyLineForm });
      toast({ title: "Component added to BOM" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateLineMutation = useMutation({
    mutationFn: (data: Partial<BomLine> & { id: string }) =>
      updateBomLine(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-explosion", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-cost", selectedItem?.id] });
      setEditLine(null);
      toast({ title: "BOM line updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: (id: string) => deleteBomLine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-explosion", selectedItem?.id] });
      toast({ title: "Component removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Mutations: Variants ──────────────────────────────────────────────────────

  const createVariantMutation = useMutation({
    mutationFn: () => {
      const copyFrom =
        variantForm.copy_from === ""
          ? undefined
          : variantForm.copy_from === "__default__"
          ? (null as null)
          : variantForm.copy_from;
      return createBomVariant({
        item_id: selectedItem!.id,
        variant_name: variantForm.variant_name,
        variant_code: variantForm.variant_code || undefined,
        description: variantForm.description || undefined,
        is_default: variantForm.is_default,
        notes: variantForm.notes || undefined,
        ...(copyFrom !== undefined ? { copy_from_variant_id: copyFrom } : {}),
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["bom-variants", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      setNewVariantOpen(false);
      setVariantForm({ ...emptyVariantForm });
      setSelectedVariantId(created.id);
      toast({ title: "Variant created", description: created.variant_name });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateVariantMutation = useMutation({
    mutationFn: (data: { id: string } & Partial<BomVariant>) =>
      updateBomVariant(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-variants", selectedItem?.id] });
      setEditVariant(null);
      toast({ title: "Variant updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (id: string) => deleteBomVariant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-variants", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      if (selectedVariantId && bomVariants.find((v) => v.id === selectedVariantId)) {
        setSelectedVariantId("");
      }
      toast({ title: "Variant deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (variantId: string) => setDefaultVariant(selectedItem!.id, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bom-variants", selectedItem?.id] });
      toast({ title: "Default variant updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const openEdit = (line: BomLine) => {
    setEditLine(line);
    setLineForm({
      quantity: line.quantity,
      unit: line.unit ?? "",
      drawing_number: line.drawing_number ?? "",
      scrap_factor: line.scrap_factor ?? 0,
      is_critical: line.is_critical ?? false,
      reference_designator: line.reference_designator ?? "",
      notes: line.notes ?? "",
    });
  };

  const toggleNode = (id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    if (explosionData) {
      setCollapsedNodes(new Set(explosionData.children.map((n) => n.id)));
    }
  };
  const expandAll = () => setCollapsedNodes(new Set());

  const handleExportExplosion = () => {
    if (!explosionData) return;
    const rows = flattenTree(explosionData.children);
    exportToExcel(
      [
        {
          sheetName: "BOM Explosion",
          columns: [
            { key: "level",            label: "Level",       type: "number", width: 8  },
            { key: "item_code",        label: "Item Code",   type: "text",   width: 16 },
            { key: "item_description", label: "Description", type: "text",   width: 30 },
            { key: "item_type",        label: "Type",        type: "text",   width: 14 },
            { key: "effective_qty",    label: "Qty Required",type: "number", width: 14 },
            { key: "unit",             label: "Unit",        type: "text",   width: 10 },
            { key: "unit_cost",        label: "Unit Cost",   type: "currency",width: 14 },
            { key: "total_cost",       label: "Total Cost",  type: "currency",width: 14 },
            { key: "current_stock",    label: "Stock",       type: "number", width: 10 },
            { key: "drawing_number",   label: "Drawing No",  type: "text",   width: 14 },
          ],
          data: rows,
        },
      ],
      `BOM_${selectedItem?.item_code ?? "export"}_${format(new Date(), "yyyyMMdd")}`
    );
  };

  const handlePrint = () => window.print();

  const estimatedCost = bomLines.reduce(
    (s, l) => s + l.quantity * (l.child_standard_cost ?? 0),
    0
  );

  // ── Variant selector (shared across tabs 1/2/3) ──────────────────────────────

  const VariantSelector = () => (
    <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
      <SelectTrigger className="h-8 w-[220px] text-sm">
        <SelectValue placeholder="Default BOM" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">Default BOM</SelectItem>
        {bomVariants.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.variant_name}
            {v.is_default ? " ★" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // ── Print-only section (rendered in DOM but hidden normally) ─────────────────

  const printRows = explosionData ? flattenTree(explosionData.children) : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Print styles */}
      <style>{`
        @media print {
          .bom-no-print { display: none !important; }
          .bom-print-only { display: block !important; }
          body { font-size: 11px; }
          .bom-print-table th, .bom-print-table td { border: 1px solid #ccc; padding: 4px 6px; }
          .bom-print-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        }
        .bom-print-only { display: none; }
      `}</style>

      {/* Print view (hidden unless printing) */}
      <div className="bom-print-only">
        <div style={{ fontFamily: "serif", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
            BILL OF MATERIALS
          </h1>
          <p style={{ marginBottom: 2 }}>
            <strong>Item:</strong> {selectedItem?.item_code} — {selectedItem?.description}
          </p>
          {selectedVariantId && bomVariants.find((v) => v.id === selectedVariantId) && (
            <p style={{ marginBottom: 2 }}>
              <strong>Variant:</strong>{" "}
              {bomVariants.find((v) => v.id === selectedVariantId)?.variant_name}
            </p>
          )}
          <p style={{ marginBottom: 2 }}>
            <strong>Quantity:</strong> {explosionQty} unit(s)
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong>Date:</strong> {format(new Date(), "dd-MMM-yyyy")}
          </p>
          <table className="bom-print-table">
            <thead>
              <tr>
                <th>Lvl</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Unit Cost</th>
                <th>Total Cost</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.level}</td>
                  <td style={{ fontFamily: "monospace" }}>{row.item_code}</td>
                  <td style={{ paddingLeft: (row.level - 1) * 12 }}>{row.item_description}</td>
                  <td>{row.item_type?.replace(/_/g, " ")}</td>
                  <td style={{ textAlign: "right" }}>{row.effective_qty.toFixed(3)}</td>
                  <td>{row.unit}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(row.unit_cost)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(row.total_cost)}</td>
                  <td style={{ textAlign: "right" }}>{row.current_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {explosionData && (
            <div style={{ marginTop: 16, borderTop: "2px solid #333", paddingTop: 8 }}>
              <strong>Total BOM Cost: {formatCurrency(explosionData.total_cost)}</strong>
              {" · "}Cost per unit: {formatCurrency(explosionData.total_cost / (explosionQty || 1))}
            </div>
          )}
          <p style={{ marginTop: 24, fontSize: 10, color: "#666" }}>
            This is a computer generated document.
          </p>
        </div>
      </div>

      {/* ── Main UI (hidden when printing) ─────────────────────────────────── */}
      <div className="bom-no-print">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <GitFork className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bill of Materials</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Define product structure, manage variants, and analyse costs
            </p>
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 mt-4">

          {/* LEFT PANEL — Item selector */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-200px)] min-h-[400px]">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Items</h2>
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
                    onClick={() => handleSelectItem(item)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${
                      selectedItem?.id === item.id
                        ? "bg-blue-50 border-l-2 border-blue-500"
                        : ""
                    }`}
                  >
                    <p className="font-mono text-xs font-medium text-blue-600">{item.item_code}</p>
                    <p className="text-sm text-slate-700 truncate">{item.description}</p>
                    <TypeBadge type={item.item_type} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
            {!selectedItem ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <GitFork className="h-10 w-10 text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium text-sm">
                  Select an item to view or edit its BOM
                </p>
                <p className="text-xs text-slate-400 mt-1">Click any item in the left panel</p>
              </div>
            ) : (
              <>
                {/* Item header */}
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-slate-900">{selectedItem.description}</h2>
                    <span className="font-mono text-xs text-slate-400">{selectedItem.item_code}</span>
                    <TypeBadge type={selectedItem.item_type} />
                    {bomVariants.length > 0 && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
                        {bomVariants.length} variant{bomVariants.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
                  <TabsList className="mx-5 mt-3 justify-start h-9 w-fit gap-0.5">
                    <TabsTrigger value="structure" className="text-xs px-3">Structure</TabsTrigger>
                    <TabsTrigger value="explosion" className="text-xs px-3">BOM Explosion</TabsTrigger>
                    <TabsTrigger value="cost" className="text-xs px-3">Cost Rollup</TabsTrigger>
                    <TabsTrigger value="where-used" className="text-xs px-3">Where Used</TabsTrigger>
                    <TabsTrigger value="variants" className="text-xs px-3">
                      Variants {bomVariants.length > 0 && `(${bomVariants.length})`}
                    </TabsTrigger>
                  </TabsList>

                  {/* ── TAB 1: STRUCTURE ──────────────────────────────────── */}
                  <TabsContent value="structure" className="flex flex-col flex-1 mt-0">
                    {/* Toolbar */}
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <VariantSelector />
                        {bomVariants.length === 0 && (
                          <span className="text-xs text-muted-foreground">No variants — using default BOM</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {bomLines.length} component{bomLines.length !== 1 ? "s" : ""} ·{" "}
                          <span className="font-medium text-slate-700">{formatCurrency(estimatedCost)}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNewVariantOpen(true)}
                          className="gap-1.5 h-8 text-xs"
                        >
                          <Plus className="h-3 w-3" /> New Variant
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setAddOpen(true)}
                          className="gap-1.5 h-8 text-xs"
                        >
                          <Plus className="h-3 w-3" /> Add Component
                        </Button>
                      </div>
                    </div>

                    {bomLoading ? (
                      <div className="flex justify-center py-10">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : bomLines.length === 0 ? (
                      <div className="py-12 text-center">
                        <GitFork className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium">No components defined</p>
                        <p className="text-xs text-slate-400 mt-1">Click "Add Component" to start</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto flex-1">
                        <table className="w-full data-table text-sm">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Item Code</th>
                              <th>Description</th>
                              <th>Type</th>
                              <th>Drawing No</th>
                              <th className="text-right">Qty</th>
                              <th>Unit</th>
                              <th className="text-right">Scrap%</th>
                              <th className="text-center">Critical</th>
                              <th className="text-right">Stock</th>
                              <th className="text-right">Line Cost</th>
                              <th className="w-20">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bomLines.map((line, idx) => (
                              <tr key={line.id}>
                                <td className="text-muted-foreground text-xs">{idx + 1}</td>
                                <td className="font-mono text-xs text-blue-600 font-medium">
                                  {line.child_item_code ?? "—"}
                                </td>
                                <td className="font-medium text-sm max-w-[160px] truncate">
                                  {line.child_item_description ?? "—"}
                                </td>
                                <td>
                                  {line.child_item_type && (
                                    <TypeBadge type={line.child_item_type} />
                                  )}
                                </td>
                                <td className="text-xs text-muted-foreground font-mono">
                                  {line.drawing_number ?? "—"}
                                </td>
                                <td className="text-right font-mono tabular-nums text-sm">
                                  {line.quantity}
                                </td>
                                <td className="text-xs text-muted-foreground">
                                  {line.child_unit ?? line.unit ?? ""}
                                </td>
                                <td className="text-right text-xs">
                                  {line.scrap_factor > 0 ? (
                                    <span className="text-amber-600 font-medium">{line.scrap_factor}%</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="text-center">
                                  {line.is_critical && (
                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                                      CRIT
                                    </span>
                                  )}
                                </td>
                                <td className="text-right">
                                  <span
                                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                                      (line.child_current_stock ?? 0) <= 0
                                        ? "bg-red-50 text-red-700"
                                        : (line.child_current_stock ?? 0) < line.quantity
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-green-50 text-green-700"
                                    }`}
                                  >
                                    {line.child_current_stock ?? 0}
                                  </span>
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
                                        if (
                                          confirm(
                                            `Remove ${line.child_item_code ?? "this component"} from BOM?`
                                          )
                                        ) {
                                          deleteLineMutation.mutate(line.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Footer cost */}
                    {bomLines.length > 0 && (
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">Estimated Cost per Unit</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(estimatedCost)}
                        </span>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── TAB 2: EXPLOSION ──────────────────────────────────── */}
                  <TabsContent value="explosion" className="flex flex-col flex-1 mt-0">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Explode for</Label>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20 text-sm"
                          value={explosionQty}
                          onChange={(e) => setExplosionQty(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <Label className="text-xs">units</Label>
                      </div>
                      <VariantSelector />
                      <div className="ml-auto flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={expandAll}>
                          Expand all
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={collapseAll}>
                          Collapse
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={handleExportExplosion}
                          disabled={!explosionData}
                        >
                          <Download className="h-3 w-3" /> Export
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={handlePrint}
                          disabled={!explosionData}
                        >
                          <Printer className="h-3 w-3" /> Print
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => refetchExplosion()}
                          disabled={exploding}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${exploding ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </div>

                    {exploding ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin opacity-40" />
                        <p className="text-sm">Exploding BOM…</p>
                      </div>
                    ) : !explosionData || explosionData.children.length === 0 ? (
                      <div className="py-12 text-center">
                        <GitFork className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium">No BOM defined for this item</p>
                        <p className="text-xs text-slate-400 mt-1">Add components in the Structure tab first</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto flex-1">
                          <table className="w-full data-table text-sm">
                            <thead>
                              <tr>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th>Type</th>
                                <th className="text-right">Qty Required</th>
                                <th className="text-right">Unit Cost</th>
                                <th className="text-right">Total Cost</th>
                                <th className="text-center">Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {explosionData.children.map((node) => (
                                <TreeRow
                                  key={node.id}
                                  node={node}
                                  collapsed={collapsedNodes}
                                  onToggle={toggleNode}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Cost summary */}
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {explosionData.raw_material_cost > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">Raw Material</p>
                              <p className="font-mono font-medium">{formatCurrency(explosionData.raw_material_cost)}</p>
                            </div>
                          )}
                          {explosionData.bought_out_cost > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">Bought Out</p>
                              <p className="font-mono font-medium">{formatCurrency(explosionData.bought_out_cost)}</p>
                            </div>
                          )}
                          {explosionData.job_work_cost > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">Job Work</p>
                              <p className="font-mono font-medium">{formatCurrency(explosionData.job_work_cost)}</p>
                            </div>
                          )}
                          <div className="sm:col-span-1 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-3 pt-2 sm:pt-0">
                            <p className="text-xs text-muted-foreground">Total BOM Cost</p>
                            <p className="font-mono font-bold text-slate-900 text-base">
                              {formatCurrency(explosionData.total_cost)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(explosionData.total_cost / (explosionQty || 1))} / unit
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* ── TAB 3: COST ROLLUP ───────────────────────────────── */}
                  <TabsContent value="cost" className="flex flex-col flex-1 mt-0">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Calculate for</Label>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20 text-sm"
                          value={costQty}
                          onChange={(e) => setCostQty(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <Label className="text-xs">units</Label>
                      </div>
                      <VariantSelector />
                      <p className="text-xs text-muted-foreground ml-auto">
                        Costs based on standard cost from Items master.
                      </p>
                    </div>

                    {costing ? (
                      <div className="flex justify-center py-12">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !costRollup || costRollup.line_items.length === 0 ? (
                      <div className="py-12 text-center">
                        <BarChart3 className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium">No BOM defined</p>
                      </div>
                    ) : (
                      <div className="flex flex-col flex-1">
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] flex-1">
                          {/* Left: table */}
                          <div className="overflow-x-auto">
                            <table className="w-full data-table text-sm">
                              <thead>
                                <tr>
                                  <th>Item Code</th>
                                  <th>Description</th>
                                  <th>Type</th>
                                  <th className="text-right">Level</th>
                                  <th className="text-right">Qty</th>
                                  <th>Unit</th>
                                  <th className="text-right">Unit Cost</th>
                                  <th className="text-right">Extended Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(["raw_material", "component", "bought_out", "service", "consumable", "sub_assembly"] as const).map(
                                  (type) => {
                                    const rows = costRollup.line_items.filter((l) => l.item_type === type);
                                    if (rows.length === 0) return null;
                                    const subtotal = rows.reduce((s, r) => s + r.extended_cost, 0);
                                    return (
                                      <>
                                        <tr key={`header-${type}`} className="bg-slate-50">
                                          <td colSpan={8} className="py-1 px-4">
                                            <div className="flex items-center justify-between">
                                              <TypeBadge type={type} />
                                              <span className="font-mono text-xs font-semibold text-slate-700">
                                                Subtotal: {formatCurrency(subtotal)}
                                              </span>
                                            </div>
                                          </td>
                                        </tr>
                                        {rows.map((item, i) => (
                                          <tr key={`${type}-${i}`}>
                                            <td className="font-mono text-xs text-blue-600">{item.item_code}</td>
                                            <td className="text-sm max-w-[160px] truncate">{item.description}</td>
                                            <td><TypeBadge type={item.item_type} /></td>
                                            <td className="text-right text-xs text-muted-foreground">L{item.level}</td>
                                            <td className="text-right font-mono tabular-nums">
                                              {item.qty_required.toFixed(3)}
                                            </td>
                                            <td className="text-xs text-muted-foreground">{item.unit}</td>
                                            <td className="text-right font-mono tabular-nums text-muted-foreground">
                                              {formatCurrency(item.unit_cost)}
                                            </td>
                                            <td className="text-right font-mono tabular-nums font-medium">
                                              {formatCurrency(item.extended_cost)}
                                            </td>
                                          </tr>
                                        ))}
                                      </>
                                    );
                                  }
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Right: chart + summary */}
                          <div className="border-l border-slate-100 px-5 py-4 space-y-4">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Cost Breakdown
                              </p>
                              {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={180}>
                                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8 }}>
                                    <XAxis type="number" hide />
                                    <YAxis
                                      type="category"
                                      dataKey="name"
                                      width={90}
                                      tick={{ fontSize: 11 }}
                                    />
                                    <RechartsTooltip
                                      formatter={(v: number) => formatCurrency(v)}
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                      {chartData.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              ) : (
                                <p className="text-xs text-muted-foreground">No cost data</p>
                              )}
                            </div>

                            <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
                              {costRollup.raw_material_cost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Raw Material</span>
                                  <span className="font-mono">{formatCurrency(costRollup.raw_material_cost)}</span>
                                </div>
                              )}
                              {costRollup.bought_out_cost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Bought Out</span>
                                  <span className="font-mono">{formatCurrency(costRollup.bought_out_cost)}</span>
                                </div>
                              )}
                              {costRollup.job_work_cost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Job Work</span>
                                  <span className="font-mono">{formatCurrency(costRollup.job_work_cost)}</span>
                                </div>
                              )}
                              {costRollup.consumable_cost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Consumable</span>
                                  <span className="font-mono">{formatCurrency(costRollup.consumable_cost)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold border-t border-slate-200 pt-2 text-slate-900">
                                <span>Total ({costQty} unit{costQty !== 1 ? "s" : ""})</span>
                                <span className="font-mono">{formatCurrency(costRollup.total_material_cost)}</span>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Cost per unit</span>
                                <span className="font-mono">{formatCurrency(costRollup.cost_per_unit)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── TAB 4: WHERE USED ────────────────────────────────── */}
                  <TabsContent value="where-used" className="flex flex-col flex-1 mt-0">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-1">
                        <Label className="text-xs whitespace-nowrap shrink-0">Find where used:</Label>
                        <Select
                          value={whereUsedItemId}
                          onValueChange={setWhereUsedItemId}
                        >
                          <SelectTrigger className="h-8 text-sm flex-1 max-w-xs">
                            <SelectValue placeholder="Select item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {whereUsedItems.map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.item_code} — {i.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {whereUsedLoading ? (
                      <div className="flex justify-center py-12">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : whereUsed.length === 0 ? (
                      <div className="py-12 text-center">
                        <GitFork className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium">
                          Not used as a component in any BOM
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          This item has no parent assemblies.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto flex-1">
                        <table className="w-full data-table text-sm">
                          <thead>
                            <tr>
                              <th>Parent Item Code</th>
                              <th>Description</th>
                              <th>Type</th>
                              <th className="text-right">Qty Used</th>
                              <th>Unit</th>
                              <th>Variant</th>
                              <th className="text-right">BOM Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {whereUsed.map((r, i) => (
                              <tr key={i}>
                                <td className="font-mono text-xs text-blue-600 font-medium">
                                  {r.parent_item_code}
                                </td>
                                <td className="font-medium text-sm">{r.parent_item_description}</td>
                                <td>
                                  <TypeBadge type={r.parent_item_type} />
                                </td>
                                <td className="text-right font-mono tabular-nums">{r.quantity_used}</td>
                                <td className="text-xs text-muted-foreground">{r.unit}</td>
                                <td className="text-xs text-muted-foreground">
                                  {r.variant_name ?? (
                                    <span className="text-slate-400">Default</span>
                                  )}
                                </td>
                                <td className="text-right text-xs text-muted-foreground">
                                  L{r.bom_level}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── TAB 5: VARIANTS ──────────────────────────────────── */}
                  <TabsContent value="variants" className="flex flex-col flex-1 mt-0">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        Manage Variants
                      </span>
                      <Button
                        size="sm"
                        onClick={() => setNewVariantOpen(true)}
                        className="gap-1.5 h-8 text-xs"
                      >
                        <Plus className="h-3 w-3" /> New Variant
                      </Button>
                    </div>

                    {/* Variant list */}
                    {bomVariants.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-sm text-slate-500 font-medium">No variants defined</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Variants let you define different component sets for the same item (e.g. 315 KVA vs 500 KVA)
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full data-table text-sm">
                          <thead>
                            <tr>
                              <th>Variant Name</th>
                              <th>Code</th>
                              <th>Description</th>
                              <th className="text-center">Default</th>
                              <th className="text-center">Active</th>
                              <th className="w-32">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bomVariants.map((v) => (
                              <tr key={v.id}>
                                <td className="font-semibold text-slate-800">{v.variant_name}</td>
                                <td className="font-mono text-xs text-blue-600">
                                  {v.variant_code ?? "—"}
                                </td>
                                <td className="text-muted-foreground max-w-[180px] truncate">
                                  {v.description ?? "—"}
                                </td>
                                <td className="text-center">
                                  {v.is_default ? (
                                    <Star className="h-4 w-4 text-amber-500 mx-auto fill-amber-400" />
                                  ) : (
                                    <button
                                      className="text-xs text-muted-foreground hover:text-amber-600 transition-colors"
                                      onClick={() => setDefaultMutation.mutate(v.id)}
                                    >
                                      Set default
                                    </button>
                                  )}
                                </td>
                                <td className="text-center">
                                  <span
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                      v.is_active
                                        ? "bg-green-100 text-green-700"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {v.is_active ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setSelectedVariantId(v.id);
                                        setActiveTab("structure");
                                      }}
                                    >
                                      Edit BOM
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setEditVariant(v);
                                        setVariantForm({
                                          variant_name: v.variant_name,
                                          variant_code: v.variant_code ?? "",
                                          description: v.description ?? "",
                                          is_default: v.is_default,
                                          notes: v.notes ?? "",
                                          copy_from: "",
                                        });
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Delete variant "${v.variant_name}"? All BOM lines for this variant will also be deleted.`
                                          )
                                        ) {
                                          deleteVariantMutation.mutate(v.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Variant comparison */}
                    {bomVariants.length >= 2 && (
                      <div className="px-5 py-4 border-t border-slate-100">
                        <p className="text-sm font-semibold text-slate-700 mb-3">
                          Compare Two Variants
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <Select value={compareV1} onValueChange={setCompareV1}>
                            <SelectTrigger className="h-8 w-[180px] text-sm">
                              <SelectValue placeholder="Variant 1..." />
                            </SelectTrigger>
                            <SelectContent>
                              {bomVariants.map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.variant_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground text-sm">vs</span>
                          <Select value={compareV2} onValueChange={setCompareV2}>
                            <SelectTrigger className="h-8 w-[180px] text-sm">
                              <SelectValue placeholder="Variant 2..." />
                            </SelectTrigger>
                            <SelectContent>
                              {bomVariants.map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.variant_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {comparing && (
                          <div className="flex justify-center py-6">
                            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        )}

                        {compareResult && !comparing && (
                          <div className="mt-4 space-y-4">
                            {/* Only in V1 */}
                            {compareResult.only_in_v1.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-red-600 mb-1">
                                  Only in {compareResult.variant_1.name} ({compareResult.only_in_v1.length})
                                </p>
                                {compareResult.only_in_v1.map((l) => (
                                  <div key={l.id} className="text-xs bg-red-50 border border-red-200 rounded px-3 py-1.5 mb-1 flex justify-between">
                                    <span className="font-mono text-red-700">{l.child_item_code}</span>
                                    <span className="text-red-600">{l.child_item_description}</span>
                                    <span className="font-mono text-red-600">× {l.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Only in V2 */}
                            {compareResult.only_in_v2.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-blue-600 mb-1">
                                  Only in {compareResult.variant_2.name} ({compareResult.only_in_v2.length})
                                </p>
                                {compareResult.only_in_v2.map((l) => (
                                  <div key={l.id} className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mb-1 flex justify-between">
                                    <span className="font-mono text-blue-700">{l.child_item_code}</span>
                                    <span className="text-blue-600">{l.child_item_description}</span>
                                    <span className="font-mono text-blue-600">× {l.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Different quantity */}
                            {compareResult.different_qty.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-amber-600 mb-1">
                                  Different quantity ({compareResult.different_qty.length})
                                </p>
                                {compareResult.different_qty.map(({ line_v1, line_v2 }) => (
                                  <div key={line_v1.id} className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mb-1 flex justify-between gap-4">
                                    <span className="font-mono text-amber-700">{line_v1.child_item_code}</span>
                                    <span className="text-amber-600 truncate">{line_v1.child_item_description}</span>
                                    <span className="font-mono text-amber-700 shrink-0">
                                      {line_v1.quantity} → {line_v2.quantity}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {compareResult.only_in_v1.length === 0 &&
                              compareResult.only_in_v2.length === 0 &&
                              compareResult.different_qty.length === 0 && (
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Variants are identical
                                </div>
                              )}
                            {compareResult.same_in_both.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {compareResult.same_in_both.length} component{compareResult.same_in_both.length !== 1 ? "s" : ""} are identical in both variants.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── ADD COMPONENT DIALOG ─────────────────────────────────────────── */}
      <Dialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) {
            setSelectedChild(null);
            setLineForm({ ...emptyLineForm });
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Component</DialogTitle>
            <DialogDescription>
              {selectedVariantId
                ? `Adding to variant: ${bomVariants.find((v) => v.id === selectedVariantId)?.variant_name}`
                : "Adding to default BOM"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Component search */}
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
                              setLineForm((f) => ({
                                ...f,
                                unit: item.unit ?? "",
                                drawing_number: item.drawing_number ?? "",
                              }));
                              setChildItemOpen(false);
                            }}
                          >
                            <div>
                              <p className="font-mono text-xs font-medium">{item.item_code}</p>
                              <p className="text-sm">{item.description}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.item_type?.replace(/_/g, " ")} · Stock: {item.current_stock}{" "}
                                {item.unit}
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
                <Label>Quantity *</Label>
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
                  placeholder={selectedChild?.unit ?? "NOS"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Drawing Number</Label>
                <Input
                  value={lineForm.drawing_number}
                  onChange={(e) => setLineForm((f) => ({ ...f, drawing_number: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scrap Factor %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={lineForm.scrap_factor}
                  onChange={(e) =>
                    setLineForm((f) => ({ ...f, scrap_factor: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Reference Designator</Label>
                <Input
                  value={lineForm.reference_designator}
                  onChange={(e) =>
                    setLineForm((f) => ({ ...f, reference_designator: e.target.value }))
                  }
                  placeholder="e.g. R1, C2"
                />
              </div>
              <div className="space-y-1.5 flex items-end pb-0.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_critical"
                    checked={lineForm.is_critical}
                    onCheckedChange={(v) =>
                      setLineForm((f) => ({ ...f, is_critical: v === true }))
                    }
                  />
                  <Label htmlFor="is_critical" className="cursor-pointer">
                    Critical component
                  </Label>
                </div>
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
                  <span className="font-mono">
                    {selectedChild.current_stock} {selectedChild.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Standard cost</span>
                  <span className="font-mono">{formatCurrency(selectedChild.standard_cost ?? 0)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Line cost (est.)</span>
                  <span className="font-mono">
                    {formatCurrency(
                      lineForm.quantity *
                        (1 + lineForm.scrap_factor / 100) *
                        (selectedChild.standard_cost ?? 0)
                    )}
                  </span>
                </div>
              </div>
            )}

            {lineForm.scrap_factor > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  With {lineForm.scrap_factor}% scrap factor, effective quantity will be{" "}
                  <strong>{(lineForm.quantity * (1 + lineForm.scrap_factor / 100)).toFixed(3)}</strong>{" "}
                  per unit.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                setSelectedChild(null);
                setLineForm({ ...emptyLineForm });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createLineMutation.mutate()}
              disabled={createLineMutation.isPending || !selectedChild}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Add to BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT LINE DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={!!editLine} onOpenChange={(v) => { if (!v) setEditLine(null); }}>
        <DialogContent className="max-w-md">
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
                  <Label>Quantity *</Label>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Drawing Number</Label>
                  <Input
                    value={lineForm.drawing_number}
                    onChange={(e) => setLineForm((f) => ({ ...f, drawing_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Scrap Factor %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={lineForm.scrap_factor}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, scrap_factor: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5 flex items-center gap-2">
                <Checkbox
                  id="edit_is_critical"
                  checked={lineForm.is_critical}
                  onCheckedChange={(v) =>
                    setLineForm((f) => ({ ...f, is_critical: v === true }))
                  }
                />
                <Label htmlFor="edit_is_critical" className="cursor-pointer">Critical component</Label>
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
                  updateLineMutation.mutate({
                    id: editLine.id,
                    quantity: lineForm.quantity,
                    unit: lineForm.unit || null,
                    drawing_number: lineForm.drawing_number || null,
                    scrap_factor: lineForm.scrap_factor,
                    is_critical: lineForm.is_critical,
                    reference_designator: lineForm.reference_designator || null,
                    notes: lineForm.notes || null,
                  });
                }
              }}
              disabled={updateLineMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NEW VARIANT DIALOG ───────────────────────────────────────────── */}
      <Dialog
        open={newVariantOpen}
        onOpenChange={(v) => {
          setNewVariantOpen(v);
          if (!v) setVariantForm({ ...emptyVariantForm });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Variant</DialogTitle>
            <DialogDescription>
              Create a new BOM variant for {selectedItem?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Variant Name *</Label>
                <Input
                  value={variantForm.variant_name}
                  onChange={(e) => setVariantForm((f) => ({ ...f, variant_name: e.target.value }))}
                  placeholder="e.g. 315 KVA"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Variant Code</Label>
                <Input
                  value={variantForm.variant_code}
                  onChange={(e) => setVariantForm((f) => ({ ...f, variant_code: e.target.value }))}
                  placeholder="e.g. V315"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={variantForm.description}
                onChange={(e) => setVariantForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Copy BOM lines from</Label>
              <Select
                value={variantForm.copy_from}
                onValueChange={(v) => setVariantForm((f) => ({ ...f, copy_from: v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Start from scratch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Start from scratch</SelectItem>
                  <SelectItem value="__default__">Default BOM</SelectItem>
                  {bomVariants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.variant_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={variantForm.notes}
                onChange={(e) => setVariantForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="variant_default"
                checked={variantForm.is_default}
                onCheckedChange={(v) =>
                  setVariantForm((f) => ({ ...f, is_default: v === true }))
                }
              />
              <Label htmlFor="variant_default" className="cursor-pointer">Set as default variant</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewVariantOpen(false);
                setVariantForm({ ...emptyVariantForm });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createVariantMutation.mutate()}
              disabled={createVariantMutation.isPending || !variantForm.variant_name.trim()}
            >
              Create Variant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT VARIANT DIALOG ──────────────────────────────────────────── */}
      <Dialog open={!!editVariant} onOpenChange={(v) => { if (!v) setEditVariant(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Variant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Variant Name *</Label>
                <Input
                  value={variantForm.variant_name}
                  onChange={(e) => setVariantForm((f) => ({ ...f, variant_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Variant Code</Label>
                <Input
                  value={variantForm.variant_code}
                  onChange={(e) => setVariantForm((f) => ({ ...f, variant_code: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={variantForm.description}
                onChange={(e) => setVariantForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={variantForm.notes}
                onChange={(e) => setVariantForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVariant(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editVariant) {
                  updateVariantMutation.mutate({
                    id: editVariant.id,
                    variant_name: variantForm.variant_name,
                    variant_code: variantForm.variant_code || null,
                    description: variantForm.description || null,
                    notes: variantForm.notes || null,
                  });
                }
              }}
              disabled={updateVariantMutation.isPending || !variantForm.variant_name.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
