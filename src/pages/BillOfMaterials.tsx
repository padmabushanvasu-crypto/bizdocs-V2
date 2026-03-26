import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitFork, Plus, Trash2, Search, ChevronDown, ChevronRight, ChevronUp,
  Pencil, RefreshCw, Download, Printer, CheckCircle2, Star,
  AlertTriangle, AlertCircle, BarChart3, Users, X, Square, CheckSquare,
  ListOrdered, ArrowUp, ArrowDown, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/SegmentedControl";
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
  fetchBomLines, createBomLine, updateBomLine, deleteBomLine, bulkDeleteBomLines,
  fetchBomVariants, createBomVariant, updateBomVariant, deleteBomVariant, setDefaultVariant,
  explodeBom, calculateBomCost, fetchWhereUsed, compareBomVariants,
  fetchBomLineVendorsBatch, addBomLineVendor, updateBomLineVendor, removeBomLineVendor, swapBomLineVendorOrder,
  fetchBomProcessStepsBatch, addBomProcessStep, updateBomProcessStep, deleteBomProcessStep, reorderBomProcessSteps,
  type BomLine, type BomVariant, type BomNode, type BomLineVendor, type BomProcessStep,
} from "@/lib/bom-api";
import { fetchParties, type Party } from "@/lib/parties-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

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

// ── Visual Tree ────────────────────────────────────────────────────────────────

const NODE_STYLE: Record<string, { border: string; bg: string; lineColor: string }> = {
  finished_good:  { border: "border-blue-400",   bg: "bg-blue-50",   lineColor: "#60a5fa" },
  sub_assembly:   { border: "border-violet-400",  bg: "bg-violet-50", lineColor: "#a78bfa" },
  component:      { border: "border-green-400",   bg: "bg-green-50",  lineColor: "#4ade80" },
  bought_out:     { border: "border-amber-400",   bg: "bg-amber-50",  lineColor: "#fbbf24" },
  raw_material:   { border: "border-orange-400",  bg: "bg-orange-50", lineColor: "#fb923c" },
  consumable:     { border: "border-teal-400",    bg: "bg-teal-50",   lineColor: "#2dd4bf" },
  service:        { border: "border-pink-400",    bg: "bg-pink-50",   lineColor: "#f472b6" },
};
const DEFAULT_NODE_STYLE = { border: "border-slate-300", bg: "bg-slate-50", lineColor: "#94a3b8" };

function VisualTreeNode({
  node,
  collapsed,
  onToggle,
  stepsByLine,
}: {
  node: BomNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  stepsByLine: Map<string, BomProcessStep[]>;
}) {
  const isCollapsed = collapsed.has(node.id);
  const style = NODE_STYLE[node.item_type] ?? DEFAULT_NODE_STYLE;
  const steps = (stepsByLine.get(node.bom_line_id) ?? [])
    .sort((a, b) => a.step_order - b.step_order);
  const visibleChildren = isCollapsed ? [] : node.children;

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div
        className={`rounded-lg border-2 p-3 w-44 shrink-0 shadow-sm transition-shadow hover:shadow-md ${style.border} ${style.bg} ${node.has_children ? "cursor-pointer" : ""}`}
        onClick={() => node.has_children && onToggle(node.id)}
      >
        <TypeBadge type={node.item_type} />
        {node.drawing_number && (
          <p className="font-mono text-[10px] font-bold text-blue-700 mt-0.5 truncate">
            {node.drawing_number}
          </p>
        )}
        <p
          className="font-semibold text-sm text-slate-800 mt-0.5 leading-tight overflow-hidden"
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}
        >
          {node.item_description}
        </p>
        <p className="font-mono text-[10px] text-slate-400 mt-0.5 truncate">{node.item_code}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${node.is_sufficient ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs font-mono text-slate-700">
            ×{" "}
            {node.effective_qty % 1 === 0
              ? node.effective_qty.toFixed(0)
              : node.effective_qty.toFixed(2)}{" "}
            {node.unit}
          </span>
        </div>
        {steps.length > 0 && (
          <p className="text-[10px] text-slate-400 mt-1 truncate leading-tight">
            {steps.map((s) => s.process_name).join(" → ")}
          </p>
        )}
        {node.has_children && (
          <div className="flex justify-center mt-1.5">
            {isCollapsed
              ? <ChevronRight className="h-3 w-3 text-slate-400" />
              : <ChevronDown className="h-3 w-3 text-slate-400" />}
          </div>
        )}
      </div>

      {/* Children connectors + subtree */}
      {visibleChildren.length > 0 && (
        <>
          {/* Vertical stem down from card */}
          <div style={{ width: 2, height: 28, background: style.lineColor, flexShrink: 0 }} />

          {visibleChildren.length === 1 ? (
            <VisualTreeNode
              node={visibleChildren[0]}
              collapsed={collapsed}
              onToggle={onToggle}
              stepsByLine={stepsByLine}
            />
          ) : (
            /* Multi-child: horizontal rail spanning all child stubs */
            <div className="flex flex-col">
              <div style={{ height: 2, background: style.lineColor }} />
              <div className="flex gap-6">
                {visibleChildren.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div style={{ width: 2, height: 28, background: style.lineColor, flexShrink: 0 }} />
                    <VisualTreeNode
                      node={child}
                      collapsed={collapsed}
                      onToggle={onToggle}
                      stepsByLine={stepsByLine}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

class BomErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[BOM] Right panel render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-5">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-600">Something went wrong loading the BOM</p>
          <p className="text-xs text-slate-400 mt-1">{this.state.error?.message ?? "Unknown error"}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
  make_or_buy: "make" as "make" | "buy",
  lead_time_days: 0,
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

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const rightPanelRef = useRef<HTMLDivElement>(null);

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

  // ── Tab 6: Visual Tree ───────────────────────────────────────────────────────
  const [treeQty, setTreeQty] = useState(1);
  const [treeZoom, setTreeZoom] = useState(1);
  const [treeCollapsedNodes, setTreeCollapsedNodes] = useState<Set<string>>(new Set());

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<BomLine | null>(null);
  const [newVariantOpen, setNewVariantOpen] = useState(false);
  const [editVariant, setEditVariant] = useState<BomVariant | null>(null);
  const [childItemOpen, setChildItemOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Item | null>(null);
  const [lineForm, setLineForm] = useState({ ...emptyLineForm });
  const [variantForm, setVariantForm] = useState({ ...emptyVariantForm });

  // ── BOM line bulk select state ───────────────────────────────────────────────
  const [selectedBomLines, setSelectedBomLines] = useState<Set<string>>(new Set());
  const [deleteLinesConfirmOpen, setDeleteLinesConfirmOpen] = useState(false);

  // ── Vendor state ─────────────────────────────────────────────────────────────
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorDialogLine, setVendorDialogLine] = useState<BomLine | null>(null);
  const [editingVendor, setEditingVendor] = useState<BomLineVendor | null>(null);
  const [vendorForm, setVendorForm] = useState({
    vendor_id: null as string | null,
    vendor_name: "",
    vendor_code: "",
    unit_price: null as number | null,
    lead_time_days: 7,
    is_preferred: false,
    notes: "",
  });
  const [vendorPartyOpen, setVendorPartyOpen] = useState(false);

  // ── Process step state ───────────────────────────────────────────────────────
  const [editingLeadTime, setEditingLeadTime] = useState<{ id: string; val: number } | null>(null);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepDialogLine, setStepDialogLine] = useState<BomLine | null>(null);
  const [editingStep, setEditingStep] = useState<BomProcessStep | null>(null);
  const [stepVendorOpen, setStepVendorOpen] = useState(false);
  const [stepForm, setStepForm] = useState({
    step_type: "internal" as "internal" | "external",
    process_name: "",
    vendor_id: null as string | null,
    vendor_name: "",
    lead_time_days: 1,
    notes: "",
  });

  // ── Reset state when item changes ────────────────────────────────────────────
  const handleSelectItem = (item: Item) => {
    console.log("[BOM] Item selected:", item.id, item.description, "type:", item.item_type);
    setSelectedItem(item);
    setSelectedVariantId("");
    setActiveTab("structure");
    setCollapsedNodes(new Set());
    setWhereUsedItemId(item.id);
    setCompareV1("");
    setCompareV2("");
    setSelectedBomLines(new Set());
    setTreeCollapsedNodes(new Set());
    // Scroll right panel to top
    if (rightPanelRef.current) rightPanelRef.current.scrollTop = 0;
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
          i.description.toLowerCase().includes(itemSearch.toLowerCase()) ||
          (i.drawing_revision ?? "").toLowerCase().includes(itemSearch.toLowerCase())
      )
    : parentCandidates;

  const variantFilter = selectedVariantId === "" ? null : selectedVariantId;

  const { data: bomLines = [], isLoading: bomLoading, isError: bomError, error: bomQueryError, refetch: refetchLines } = useQuery({
    queryKey: ["bom-lines-v2", selectedItem?.id, selectedVariantId],
    queryFn: async () => {
      console.log("[BOM] Fetching lines, itemId:", selectedItem?.id, "variant:", variantFilter);
      const result = await fetchBomLines(selectedItem!.id, variantFilter);
      console.log("[BOM] Lines fetched:", result.length, "lines", result);
      return result;
    },
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

  const whereUsedLineIds = useMemo(() => whereUsed.map((r) => r.bom_line_id).filter(Boolean), [whereUsed]);
  const { data: whereUsedVendors = [] } = useQuery<BomLineVendor[]>({
    queryKey: ["where-used-vendors", whereUsedLineIds],
    queryFn: () => fetchBomLineVendorsBatch(whereUsedLineIds),
    enabled: whereUsedLineIds.length > 0 && activeTab === "where-used",
    staleTime: 30000,
  });
  const whereUsedVendorsByLine = useMemo(() => {
    const map = new Map<string, BomLineVendor[]>();
    for (const v of whereUsedVendors) {
      const arr = map.get(v.bom_line_id) ?? [];
      arr.push(v);
      map.set(v.bom_line_id, arr);
    }
    return map;
  }, [whereUsedVendors]);

  const whereUsedComponentStock = useMemo(() => {
    const item = allItems.find((i) => i.id === whereUsedTarget);
    return item?.current_stock ?? 0;
  }, [allItems, whereUsedTarget]);

  const { data: compareResult, isLoading: comparing } = useQuery({
    queryKey: ["bom-compare", selectedItem?.id, compareV1, compareV2],
    queryFn: () => compareBomVariants(selectedItem!.id, compareV1, compareV2),
    enabled: !!selectedItem && !!compareV1 && !!compareV2 && compareV1 !== compareV2 && activeTab === "variants",
    staleTime: 30000,
  });

  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ["bom-visual-tree", selectedItem?.id, treeQty, selectedVariantId],
    queryFn: () => explodeBom(selectedItem!.id, treeQty, variantFilter),
    enabled: !!selectedItem && activeTab === "visual-tree",
    staleTime: 30000,
  });

  const treeLineIds = useMemo(() => {
    function collect(nodes: BomNode[]): string[] {
      const ids: string[] = [];
      for (const n of nodes) {
        ids.push(n.bom_line_id);
        if (n.children.length > 0) ids.push(...collect(n.children));
      }
      return ids;
    }
    if (!treeData) return [];
    return collect(treeData.children);
  }, [treeData]);

  const { data: treeStepsRaw = [] } = useQuery<BomProcessStep[]>({
    queryKey: ["bom-tree-steps", treeLineIds],
    queryFn: () => fetchBomProcessStepsBatch(treeLineIds),
    enabled: treeLineIds.length > 0,
  });

  const treeStepsByLine = useMemo(() => {
    const map = new Map<string, BomProcessStep[]>();
    for (const s of treeStepsRaw) {
      const arr = map.get(s.bom_line_id) ?? [];
      arr.push(s);
      map.set(s.bom_line_id, arr);
    }
    return map;
  }, [treeStepsRaw]);

  const childCandidates = allItems.filter((i) => i.id !== selectedItem?.id);
  const whereUsedItems = allItems; // for where-used search

  // Vendors: fetch for all lines in the current view (batch)
  const bomLineIds = useMemo(() => bomLines.map((l) => l.id), [bomLines]);
  const { data: allVendors = [], refetch: refetchVendors } = useQuery<BomLineVendor[]>({
    queryKey: ["bom-line-vendors-batch", bomLineIds],
    queryFn: () => fetchBomLineVendorsBatch(bomLineIds),
    enabled: bomLineIds.length > 0,
  });
  const { data: allProcessSteps = [], refetch: refetchProcessSteps } = useQuery<BomProcessStep[]>({
    queryKey: ["bom-process-steps-batch", bomLineIds],
    queryFn: () => fetchBomProcessStepsBatch(bomLineIds),
    enabled: bomLineIds.length > 0,
  });
  const stepsByLine = useMemo(() => {
    const map = new Map<string, BomProcessStep[]>();
    for (const s of allProcessSteps) {
      const arr = map.get(s.bom_line_id) ?? [];
      arr.push(s);
      map.set(s.bom_line_id, arr);
    }
    return map;
  }, [allProcessSteps]);

  const vendorsByLine = useMemo(() => {
    const map = new Map<string, BomLineVendor[]>();
    for (const v of allVendors) {
      const arr = map.get(v.bom_line_id) ?? [];
      arr.push(v);
      map.set(v.bom_line_id, arr);
    }
    return map;
  }, [allVendors]);

  const { data: vendorPartiesData } = useQuery({
    queryKey: ["parties-vendors-bom"],
    queryFn: () => fetchParties({ type: "vendor", status: "active", pageSize: 500 }),
    enabled: vendorDialogOpen || stepDialogOpen,
  });
  const vendorParties: Party[] = vendorPartiesData?.data ?? [];

  const { data: processNameSuggestions = [] } = useQuery<string[]>({
    queryKey: ["bom-process-names", selectedItem?.id],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const [{ data: vNotes }, { data: sNames }] = await Promise.all([
        (supabase as any).from("bom_line_vendors").select("notes").eq("company_id", companyId).not("notes", "is", null),
        (supabase as any).from("bom_process_steps").select("process_name").eq("company_id", companyId),
      ]);
      const names = new Set<string>();
      for (const v of (vNotes ?? []) as any[]) if ((v.notes as string)?.trim()) names.add((v.notes as string).trim());
      for (const s of (sNames ?? []) as any[]) if ((s.process_name as string)?.trim()) names.add((s.process_name as string).trim());
      return [...names].sort();
    },
    enabled: vendorDialogOpen,
    staleTime: 60000,
  });

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
        make_or_buy: lineForm.make_or_buy,
        lead_time_days: lineForm.lead_time_days,
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

  const bulkDeleteLinesMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteBomLines(ids),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["bom-lines-v2", selectedItem?.id] });
      queryClient.invalidateQueries({ queryKey: ["bom-explosion", selectedItem?.id] });
      setSelectedBomLines(new Set());
      setDeleteLinesConfirmOpen(false);
      toast({ title: `${ids.length} component${ids.length !== 1 ? "s" : ""} removed` });
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

  // ── Vendor mutations ─────────────────────────────────────────────────────────

  const addVendorMutation = useMutation({
    mutationFn: () =>
      addBomLineVendor({
        bom_line_id: vendorDialogLine!.id,
        vendor_id: vendorForm.vendor_id ?? null,
        vendor_name: vendorForm.vendor_name,
        vendor_code: vendorForm.vendor_code || null,
        unit_price: vendorForm.unit_price,
        lead_time_days: vendorForm.lead_time_days,
        is_preferred: vendorForm.is_preferred,
        notes: vendorForm.notes || null,
      }),
    onSuccess: () => {
      refetchVendors();
      setVendorDialogOpen(false);
      toast({ title: "Vendor added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateVendorMutation = useMutation({
    mutationFn: () =>
      updateBomLineVendor(editingVendor!.id, {
        bom_line_id: vendorDialogLine!.id,
        vendor_id: vendorForm.vendor_id ?? null,
        vendor_name: vendorForm.vendor_name,
        vendor_code: vendorForm.vendor_code || null,
        unit_price: vendorForm.unit_price,
        lead_time_days: vendorForm.lead_time_days,
        is_preferred: vendorForm.is_preferred,
        notes: vendorForm.notes || null,
      }),
    onSuccess: () => {
      refetchVendors();
      setVendorDialogOpen(false);
      toast({ title: "Vendor updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeVendorMutation = useMutation({
    mutationFn: (id: string) => removeBomLineVendor(id),
    onSuccess: () => {
      refetchVendors();
      toast({ title: "Vendor removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reorderVendorMutation = useMutation({
    mutationFn: ({ idA, orderA, idB, orderB }: { idA: string; orderA: number; idB: string; orderB: number }) =>
      swapBomLineVendorOrder(idA, orderA, idB, orderB),
    onSuccess: () => refetchVendors(),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addStepMutation = useMutation({
    mutationFn: () =>
      addBomProcessStep({
        bom_line_id: stepDialogLine!.id,
        step_type: stepForm.step_type,
        process_name: stepForm.process_name,
        vendor_id: stepForm.vendor_id,
        vendor_name: stepForm.vendor_name || null,
        lead_time_days: stepForm.lead_time_days,
        notes: stepForm.notes || null,
      }),
    onSuccess: () => {
      refetchProcessSteps();
      setStepDialogOpen(false);
      toast({ title: "Process step added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStepMutation = useMutation({
    mutationFn: () =>
      updateBomProcessStep(editingStep!.id, {
        step_type: stepForm.step_type,
        process_name: stepForm.process_name,
        vendor_id: stepForm.vendor_id,
        vendor_name: stepForm.vendor_name || null,
        lead_time_days: stepForm.lead_time_days,
        notes: stepForm.notes || null,
      }),
    onSuccess: () => {
      refetchProcessSteps();
      setStepDialogOpen(false);
      toast({ title: "Step updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id: string) => deleteBomProcessStep(id),
    onSuccess: () => {
      refetchProcessSteps();
      toast({ title: "Step removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reorderStepMutation = useMutation({
    mutationFn: ({ lineId, orderedIds }: { lineId: string; orderedIds: string[] }) =>
      reorderBomProcessSteps(lineId, orderedIds),
    onSuccess: () => refetchProcessSteps(),
  });

  const openAddStep = (line: BomLine) => {
    setStepDialogLine(line);
    setEditingStep(null);
    setStepForm({ step_type: "internal", process_name: "", vendor_id: null, vendor_name: "", lead_time_days: 1, notes: "" });
    setStepDialogOpen(true);
  };

  const openEditStep = (line: BomLine, step: BomProcessStep) => {
    setStepDialogLine(line);
    setEditingStep(step);
    setStepForm({
      step_type: step.step_type,
      process_name: step.process_name,
      vendor_id: step.vendor_id,
      vendor_name: step.vendor_name ?? "",
      lead_time_days: step.lead_time_days,
      notes: step.notes ?? "",
    });
    setStepDialogOpen(true);
  };

  const openAddVendor = (line: BomLine) => {
    setVendorDialogLine(line);
    setEditingVendor(null);
    setVendorForm({ vendor_id: null, vendor_name: "", vendor_code: "", unit_price: null, lead_time_days: 7, is_preferred: false, notes: "" });
    setVendorDialogOpen(true);
  };

  const openEditVendor = (line: BomLine, v: BomLineVendor) => {
    setVendorDialogLine(line);
    setEditingVendor(v);
    setVendorForm({
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name,
      vendor_code: v.vendor_code ?? "",
      unit_price: v.unit_price,
      lead_time_days: v.lead_time_days ?? 7,
      is_preferred: v.is_preferred,
      notes: v.notes ?? "",
    });
    setVendorDialogOpen(true);
  };

  const toggleLineExpand = (lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

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
      make_or_buy: line.make_or_buy ?? "make",
      lead_time_days: line.lead_time_days ?? 0,
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

  const toggleTreeNode = (id: string) => {
    setTreeCollapsedNodes((prev) => {
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
        {activeTab === "visual-tree" && treeData && treeData.children.length > 0 ? (
          /* Visual Tree print view */
          <div style={{ fontFamily: "sans-serif", padding: 24 }}>
            <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
              BILL OF MATERIALS — VISUAL TREE
            </h1>
            <p style={{ marginBottom: 2 }}>
              <strong>Item:</strong> {selectedItem?.item_code} — {selectedItem?.description}
            </p>
            <p style={{ marginBottom: 2 }}>
              <strong>Build Quantity:</strong> {treeQty} unit(s)
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong>Printed on:</strong> {format(new Date(), "dd-MMM-yyyy")}
            </p>
            <div style={{ transform: "scale(0.65)", transformOrigin: "top left", marginTop: 8 }}>
              <div className="flex flex-col items-center">
                {/* Root node */}
                <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3 w-44 shrink-0">
                  <TypeBadge type={selectedItem!.item_type} />
                  {selectedItem?.drawing_revision && (
                    <p className="font-mono text-[10px] font-bold text-blue-700 mt-0.5">
                      {selectedItem.drawing_revision}
                    </p>
                  )}
                  <p className="font-semibold text-sm text-slate-900 mt-0.5 leading-tight">
                    {selectedItem?.description}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400 mt-0.5">{selectedItem?.item_code}</p>
                  <p className="text-[10px] text-blue-600 font-mono mt-1">× {treeQty}</p>
                </div>
                <div style={{ width: 2, height: 28, background: "#60a5fa" }} />
                {treeData.children.length === 1 ? (
                  <VisualTreeNode
                    node={treeData.children[0]}
                    collapsed={new Set()}
                    onToggle={() => {}}
                    stepsByLine={treeStepsByLine}
                  />
                ) : (
                  <div className="flex flex-col">
                    <div style={{ height: 2, background: "#60a5fa" }} />
                    <div className="flex gap-6">
                      {treeData.children.map((child) => (
                        <div key={child.id} className="flex flex-col items-center">
                          <div style={{ width: 2, height: 28, background: "#60a5fa" }} />
                          <VisualTreeNode
                            node={child}
                            collapsed={new Set()}
                            onToggle={() => {}}
                            stepsByLine={treeStepsByLine}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p style={{ marginTop: 32, fontSize: 10, color: "#666" }}>
              This is a computer generated document.
            </p>
          </div>
        ) : (
          /* Standard explosion table print view */
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
        )}
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
                        ? "bg-blue-50 border-l-2 border-l-blue-500"
                        : "border-l-2 border-l-transparent"
                    }`}
                  >
                    {item.drawing_revision ? (
                      <p className="font-mono text-xs font-bold text-blue-600">{item.drawing_revision}</p>
                    ) : (
                      <p className={`font-mono text-xs font-medium ${selectedItem?.id === item.id ? "text-blue-600" : "text-slate-400"}`}>
                        {item.item_code}
                      </p>
                    )}
                    <p className={`text-sm truncate ${selectedItem?.id === item.id ? "text-blue-700 font-medium" : "text-slate-700"}`}>
                      {item.description}
                    </p>
                    <TypeBadge type={item.item_type} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div ref={rightPanelRef} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
            {!selectedItem ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <GitFork className="h-10 w-10 text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium text-sm">
                  Select an item to view or edit its BOM
                </p>
                <p className="text-xs text-slate-400 mt-1">Click any item in the left panel</p>
              </div>
            ) : (
              <BomErrorBoundary>
              <>
                {/* Debug — remove after root cause confirmed */}
                {(() => {
                  console.log("[BOM] Rendering right panel. selectedItem:", selectedItem?.id, selectedItem?.description, "bomLoading:", bomLoading, "bomError:", bomError, "lines:", bomLines.length);
                  return null;
                })()}
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
                  <div className="mx-5 mt-3 overflow-x-auto">
                    <SegmentedControl
                      options={[
                        { value: "structure", label: "Structure" },
                        { value: "explosion", label: "BOM Explosion" },
                        { value: "cost", label: "Cost Rollup" },
                        { value: "where-used", label: "Where Used" },
                        { value: "variants", label: bomVariants.length > 0 ? `Variants (${bomVariants.length})` : "Variants" },
                        { value: "visual-tree", label: "Visual Tree" },
                      ]}
                      value={activeTab}
                      onChange={setActiveTab}
                    />
                  </div>

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
                        {selectedBomLines.size > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteLinesConfirmOpen(true)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete {selectedBomLines.size} Line{selectedBomLines.size !== 1 ? "s" : ""}
                          </Button>
                        )}
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
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin opacity-40" />
                        <p className="text-sm">Loading BOM…</p>
                      </div>
                    ) : bomError ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                        <p className="text-sm font-medium text-red-600">Failed to load BOM — {(bomQueryError as any)?.message ?? "Unknown error"}</p>
                        <button onClick={() => refetchLines()} className="mt-3 text-xs text-blue-600 hover:underline">Try again</button>
                      </div>
                    ) : bomLines.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                        <GitFork className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-600 font-medium">No components defined yet</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Click "Add Component" to start building the BOM for {selectedItem.description}
                        </p>
                        <Button size="sm" className="mt-4 gap-1.5 h-8 text-xs" onClick={() => setAddOpen(true)}>
                          <Plus className="h-3 w-3" /> Add Component
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto flex-1">
                        <table className="w-full data-table text-sm">
                          <thead>
                            <tr>
                              <th className="w-6">
                                <button
                                  className="flex items-center justify-center"
                                  onClick={() => {
                                    const sortedIds = [...bomLines].map((l) => l.id);
                                    if (selectedBomLines.size === sortedIds.length) {
                                      setSelectedBomLines(new Set());
                                    } else {
                                      setSelectedBomLines(new Set(sortedIds));
                                    }
                                  }}
                                >
                                  {selectedBomLines.size === bomLines.length && bomLines.length > 0
                                    ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                                    : <Square className="h-3.5 w-3.5 text-slate-400" />}
                                </button>
                              </th>
                              <th className="w-6"></th>
                              <th>#</th>
                              <th className="min-w-[110px]">Drawing No.</th>
                              <th>Item Code</th>
                              <th>Description</th>
                              <th>Type</th>
                              <th>Make/Buy</th>
                              <th className="text-right">Qty</th>
                              <th>Unit</th>
                              <th className="text-right">Scrap%</th>
                              <th className="text-center">Critical</th>
                              <th className="text-right">Stock</th>
                              <th className="text-right">Lead Time</th>
                              <th className="text-right">Line Cost</th>
                              <th className="w-20">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...bomLines].sort((a, b) => {
                              const da = (a as any).child_drawing_revision ?? "";
                              const db = (b as any).child_drawing_revision ?? "";
                              return da.localeCompare(db, undefined, { numeric: true, sensitivity: "base" });
                            }).map((line, idx) => {
                              const lineVendors = vendorsByLine.get(line.id) ?? [];
                              const lineSteps = stepsByLine.get(line.id) ?? [];
                              const isExpanded = expandedLines.has(line.id);
                              return (
                                <>
                                  <tr key={line.id} className={selectedBomLines.has(line.id) ? "bg-blue-50/60" : ""}>
                                    <td>
                                      <button
                                        className="flex items-center justify-center"
                                        onClick={() => setSelectedBomLines((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(line.id)) next.delete(line.id);
                                          else next.add(line.id);
                                          return next;
                                        })}
                                      >
                                        {selectedBomLines.has(line.id)
                                          ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                                          : <Square className="h-3.5 w-3.5 text-slate-300" />}
                                      </button>
                                    </td>
                                    <td>
                                      <button
                                        onClick={() => toggleLineExpand(line.id)}
                                        className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        {isExpanded
                                          ? <ChevronDown className="h-3.5 w-3.5" />
                                          : <ChevronRight className="h-3.5 w-3.5" />}
                                      </button>
                                    </td>
                                    <td className="text-muted-foreground text-xs">{idx + 1}</td>
                                    <td className="font-mono text-xs font-semibold text-blue-700 min-w-[110px]">
                                      {(line as any).child_drawing_revision ?? "—"}
                                    </td>
                                    <td className="font-mono text-xs text-blue-600 font-medium">
                                      {line.child_item_code ?? "—"}
                                    </td>
                                    <td>
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-medium text-sm max-w-[140px] truncate">
                                          {line.child_item_description ?? "—"}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                          {(() => {
                                            const preferredV = lineVendors.find((v) => v.is_preferred) ?? lineVendors[0];
                                            if (lineVendors.length === 0) {
                                              return (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                                  <Users className="h-2.5 w-2.5" /> No vendors
                                                </span>
                                              );
                                            }
                                            return (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                                <Users className="h-2.5 w-2.5" />
                                                {lineVendors.length} vendor{lineVendors.length !== 1 ? "s" : ""}{preferredV ? ` · ${preferredV.vendor_name}` : ""}
                                              </span>
                                            );
                                          })()}
                                          {lineSteps.length > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                              <ListOrdered className="h-2.5 w-2.5" />
                                              {lineSteps.length} step{lineSteps.length !== 1 ? "s" : ""}: {lineSteps.slice(0, 3).map((s) => s.process_name).join(" → ")}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      {line.child_item_type && (
                                        <TypeBadge type={line.child_item_type} />
                                      )}
                                    </td>
                                    <td>
                                      <button
                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                          (line.make_or_buy ?? "make") === "make"
                                            ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                        }`}
                                        onClick={() =>
                                          updateLineMutation.mutate({
                                            id: line.id,
                                            make_or_buy: (line.make_or_buy ?? "make") === "make" ? "buy" : "make",
                                          })
                                        }
                                      >
                                        {(line.make_or_buy ?? "make") === "make" ? "Make" : "Buy"}
                                      </button>
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
                                    <td className="text-right text-xs">
                                      {editingLeadTime?.id === line.id ? (
                                        <input
                                          autoFocus
                                          type="number"
                                          min={0}
                                          className="w-14 text-right border border-blue-300 rounded px-1 py-0.5 text-xs font-mono outline-none"
                                          value={editingLeadTime.val}
                                          onChange={(e) =>
                                            setEditingLeadTime({ id: line.id, val: parseInt(e.target.value) || 0 })
                                          }
                                          onBlur={() => {
                                            updateLineMutation.mutate({ id: line.id, lead_time_days: editingLeadTime.val });
                                            setEditingLeadTime(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              updateLineMutation.mutate({ id: line.id, lead_time_days: editingLeadTime.val });
                                              setEditingLeadTime(null);
                                            } else if (e.key === "Escape") {
                                              setEditingLeadTime(null);
                                            }
                                          }}
                                        />
                                      ) : (
                                        <button
                                          className="text-muted-foreground hover:text-slate-800 transition-colors font-mono"
                                          onClick={() =>
                                            setEditingLeadTime({ id: line.id, val: line.lead_time_days ?? 0 })
                                          }
                                        >
                                          {(line.lead_time_days ?? 0) > 0 ? `${line.lead_time_days}d` : "—"}
                                        </button>
                                      )}
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
                                  {/* Vendor + Process Route sub-table */}
                                  {isExpanded && (
                                    <tr key={`${line.id}-expanded`}>
                                      <td colSpan={16} className="bg-slate-50 border-t border-b border-slate-100 !p-0">
                                        <div className="px-10 py-3 space-y-4">
                                          {/* Approved Vendors */}
                                          <div>
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                                              <Users className="h-3 w-3" /> Approved Vendors
                                            </p>
                                            {lineVendors.length === 0 ? (
                                              <p className="text-xs text-muted-foreground py-1">No vendors added yet.</p>
                                            ) : (
                                              <table className="w-full text-xs mb-2">
                                                <thead>
                                                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                                    <th className="pb-1.5 pr-3 font-semibold w-6">Pref.</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Vendor</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Type</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Process</th>
                                                    <th className="pb-1.5 pr-4 font-semibold text-right">Lead Time</th>
                                                    <th className="pb-1.5 pr-4 font-semibold text-right">Unit Cost</th>
                                                    <th className="pb-1.5 font-semibold">Actions</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {lineVendors.map((v, vi) => {
                                                    const prevV = vi > 0 ? lineVendors[vi - 1] : null;
                                                    const nextV = vi < lineVendors.length - 1 ? lineVendors[vi + 1] : null;
                                                    const isGoldStar = v.preference_order === 1 && v.is_preferred;
                                                    return (
                                                    <tr key={v.id} className="border-b border-slate-100 last:border-0">
                                                      <td className="py-1.5 pr-3">
                                                        <div className="flex items-center gap-1">
                                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isGoldStar ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                                                            {ordinal(v.preference_order ?? vi + 1)}
                                                          </span>
                                                          {isGoldStar && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                                                        </div>
                                                      </td>
                                                      <td className="py-1.5 pr-4 font-medium text-slate-800">
                                                        {v.vendor_name}
                                                        {v.vendor_code && (
                                                          <span className="ml-1 text-slate-400 font-mono">({v.vendor_code})</span>
                                                        )}
                                                      </td>
                                                      <td className="py-1.5 pr-4">
                                                        {v.vendor_type ? (
                                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                                            v.vendor_type === "raw_material_supplier" ? "bg-teal-50 text-teal-700 border-teal-200" :
                                                            v.vendor_type === "processor" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                            "bg-slate-100 text-slate-500 border-slate-200"
                                                          }`}>
                                                            {v.vendor_type === "raw_material_supplier" ? "RAW MAT" : v.vendor_type === "processor" ? "PROCESSOR" : "BOTH"}
                                                          </span>
                                                        ) : "—"}
                                                      </td>
                                                      <td className="py-1.5 pr-4 text-slate-600">
                                                        {v.notes ?? "—"}
                                                      </td>
                                                      <td className="py-1.5 pr-4 text-right text-slate-600">
                                                        {v.lead_time_days != null ? `${v.lead_time_days} days` : "—"}
                                                      </td>
                                                      <td className="py-1.5 pr-4 text-right font-mono text-slate-700">
                                                        {v.unit_price != null ? formatCurrency(v.unit_price) : "—"}
                                                      </td>
                                                      <td className="py-1.5">
                                                        <div className="flex gap-0.5">
                                                          <button
                                                            disabled={!prevV}
                                                            onClick={() => prevV && reorderVendorMutation.mutate({ idA: v.id, orderA: v.preference_order ?? vi + 1, idB: prevV.id, orderB: prevV.preference_order ?? vi })}
                                                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30"
                                                            title="Move up"
                                                          >
                                                            <ChevronUp className="h-3 w-3" />
                                                          </button>
                                                          <button
                                                            disabled={!nextV}
                                                            onClick={() => nextV && reorderVendorMutation.mutate({ idA: v.id, orderA: v.preference_order ?? vi + 1, idB: nextV.id, orderB: nextV.preference_order ?? vi + 2 })}
                                                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30"
                                                            title="Move down"
                                                          >
                                                            <ChevronDown className="h-3 w-3" />
                                                          </button>
                                                          <button
                                                            onClick={() => openEditVendor(line, v)}
                                                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500 transition-colors"
                                                          >
                                                            <Pencil className="h-3 w-3" />
                                                          </button>
                                                          <button
                                                            onClick={() => {
                                                              if (confirm(`Remove ${v.vendor_name}?`)) {
                                                                removeVendorMutation.mutate(v.id);
                                                              }
                                                            }}
                                                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                                                          >
                                                            <X className="h-3 w-3" />
                                                          </button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            )}
                                            <button
                                              onClick={() => openAddVendor(line)}
                                              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                                            >
                                              <Plus className="h-3 w-3" /> Add Vendor
                                            </button>
                                          </div>

                                          {/* Process Route */}
                                          <div className="border-t border-slate-200 pt-3">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                                              <ListOrdered className="h-3 w-3" /> Process Route
                                            </p>
                                            {lineSteps.length === 0 ? (
                                              <p className="text-xs text-muted-foreground py-1">No process steps defined.</p>
                                            ) : (
                                              <table className="w-full text-xs mb-2">
                                                <thead>
                                                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                                    <th className="pb-1.5 pr-2 font-semibold w-8">#</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Process</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Type</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Vendor</th>
                                                    <th className="pb-1.5 pr-4 font-semibold text-right">Lead Time</th>
                                                    <th className="pb-1.5 pr-4 font-semibold">Notes</th>
                                                    <th className="pb-1.5 font-semibold">Actions</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {[...lineSteps]
                                                    .sort((a, b) => a.step_order - b.step_order)
                                                    .map((step, si) => (
                                                      <tr key={step.id} className="border-b border-slate-100 last:border-0">
                                                        <td className="py-1.5 pr-2 text-slate-400 font-mono">{step.step_order}</td>
                                                        <td className="py-1.5 pr-4 font-medium text-slate-800">{step.process_name}</td>
                                                        <td className="py-1.5 pr-4">
                                                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                                            step.step_type === "internal"
                                                              ? "bg-green-50 text-green-700"
                                                              : "bg-purple-50 text-purple-700"
                                                          }`}>
                                                            {step.step_type}
                                                          </span>
                                                        </td>
                                                        <td className="py-1.5 pr-4 text-slate-600">
                                                          {step.vendor_name ?? "—"}
                                                        </td>
                                                        <td className="py-1.5 pr-4 text-right text-slate-600">
                                                          {step.lead_time_days > 0 ? `${step.lead_time_days}d` : "—"}
                                                        </td>
                                                        <td className="py-1.5 pr-4 text-slate-500 max-w-[120px] truncate">
                                                          {step.notes ?? "—"}
                                                        </td>
                                                        <td className="py-1.5">
                                                          <div className="flex gap-0.5">
                                                            <button
                                                              disabled={si === 0}
                                                              onClick={() => {
                                                                const sorted = [...lineSteps].sort((a, b) => a.step_order - b.step_order);
                                                                const ids = sorted.map((s) => s.id);
                                                                const idx2 = ids.indexOf(step.id);
                                                                [ids[idx2], ids[idx2 - 1]] = [ids[idx2 - 1], ids[idx2]];
                                                                reorderStepMutation.mutate({ lineId: line.id, orderedIds: ids });
                                                              }}
                                                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30 transition-colors"
                                                            >
                                                              <ArrowUp className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                              disabled={si === lineSteps.length - 1}
                                                              onClick={() => {
                                                                const sorted = [...lineSteps].sort((a, b) => a.step_order - b.step_order);
                                                                const ids = sorted.map((s) => s.id);
                                                                const idx2 = ids.indexOf(step.id);
                                                                [ids[idx2], ids[idx2 + 1]] = [ids[idx2 + 1], ids[idx2]];
                                                                reorderStepMutation.mutate({ lineId: line.id, orderedIds: ids });
                                                              }}
                                                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 disabled:opacity-30 transition-colors"
                                                            >
                                                              <ArrowDown className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                              onClick={() => openEditStep(line, step)}
                                                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500 transition-colors"
                                                            >
                                                              <Pencil className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                              onClick={() => {
                                                                if (confirm(`Remove step "${step.process_name}"?`)) {
                                                                  deleteStepMutation.mutate(step.id);
                                                                }
                                                              }}
                                                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                                                            >
                                                              <X className="h-3 w-3" />
                                                            </button>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                </tbody>
                                              </table>
                                            )}
                                            <button
                                              onClick={() => openAddStep(line)}
                                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
                                            >
                                              <Plus className="h-3 w-3" /> Add Step
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
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
                          This item is not used in any finished item.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto flex-1">
                        <table className="w-full data-table text-sm">
                          <thead>
                            <tr>
                              <th>Finished Item Code</th>
                              <th>Description</th>
                              <th>Type</th>
                              <th className="text-right">Qty Used</th>
                              <th>Unit</th>
                              <th>Variant</th>
                              <th className="text-right">BOM Level</th>
                              <th className="text-right">Coverage</th>
                              <th>Top Vendors</th>
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
                                <td className="text-right">
                                  {r.quantity_used > 0 ? (
                                    <span className={`text-xs font-medium ${Math.floor(whereUsedComponentStock / r.quantity_used) > 0 ? "text-green-600" : "text-red-600"}`}>
                                      {Math.floor(whereUsedComponentStock / r.quantity_used)} units
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="text-xs text-slate-600">
                                  {(() => {
                                    const lineVendors = r.bom_line_id ? (whereUsedVendorsByLine.get(r.bom_line_id) ?? []) : [];
                                    if (!lineVendors.length) return <span className="text-slate-400">No vendors</span>;
                                    const preferred = lineVendors.find((v) => v.is_preferred) ?? lineVendors[0];
                                    return (
                                      <span>
                                        {preferred.vendor_name}
                                        {lineVendors.length > 1 && <span className="text-slate-400 ml-1">+{lineVendors.length - 1}</span>}
                                      </span>
                                    );
                                  })()}
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

                  {/* ── TAB 6: VISUAL TREE ───────────────────────────────── */}
                  <TabsContent value="visual-tree" className="flex flex-col flex-1 mt-0">
                    {/* Toolbar */}
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Label className="text-xs whitespace-nowrap">Build for</Label>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20 text-sm"
                          value={treeQty}
                          onChange={(e) => setTreeQty(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <Label className="text-xs">units</Label>
                        <VariantSelector />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setTreeZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
                          title="Zoom out"
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
                          {Math.round(treeZoom * 100)}%
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setTreeZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                          title="Zoom in"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => setTreeZoom(1)}
                        >
                          Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => window.print()}
                          disabled={!treeData || treeData.children.length === 0}
                        >
                          <Printer className="h-3 w-3" /> Print BOM Tree
                        </Button>
                      </div>
                    </div>

                    {treeLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin opacity-40" />
                        <p className="text-sm">Building tree…</p>
                      </div>
                    ) : !treeData || treeData.children.length === 0 ? (
                      <div className="py-12 text-center">
                        <GitFork className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-500 font-medium">No BOM defined for this item</p>
                        <p className="text-xs text-slate-400 mt-1">Add components in the Structure tab first</p>
                      </div>
                    ) : (
                      <div className="overflow-auto flex-1 p-8 bg-slate-50/50">
                        <div
                          style={{
                            transform: `scale(${treeZoom})`,
                            transformOrigin: "top center",
                            transition: "transform 0.15s ease",
                            display: "inline-flex",
                            minWidth: "100%",
                            justifyContent: "center",
                          }}
                        >
                          {/* Root node (the finished good) */}
                          <div className="flex flex-col items-center">
                            <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3 w-44 shrink-0 shadow-sm">
                              <TypeBadge type={selectedItem.item_type} />
                              {selectedItem.drawing_revision && (
                                <p className="font-mono text-[10px] font-bold text-blue-700 mt-0.5 truncate">
                                  {selectedItem.drawing_revision}
                                </p>
                              )}
                              <p
                                className="font-semibold text-sm text-slate-900 mt-0.5 leading-tight overflow-hidden"
                                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}
                              >
                                {selectedItem.description}
                              </p>
                              <p className="font-mono text-[10px] text-slate-400 mt-0.5 truncate">
                                {selectedItem.item_code}
                              </p>
                              <p className="text-[10px] text-blue-600 font-mono mt-1">
                                × {treeQty} {selectedItem.unit ?? ""}
                              </p>
                            </div>

                            {/* Stem to children */}
                            <div style={{ width: 2, height: 28, background: "#60a5fa", flexShrink: 0 }} />

                            {/* Top-level children */}
                            {treeData.children.length === 1 ? (
                              <VisualTreeNode
                                node={treeData.children[0]}
                                collapsed={treeCollapsedNodes}
                                onToggle={toggleTreeNode}
                                stepsByLine={treeStepsByLine}
                              />
                            ) : (
                              <div className="flex flex-col">
                                <div style={{ height: 2, background: "#60a5fa" }} />
                                <div className="flex gap-6">
                                  {treeData.children.map((child) => (
                                    <div key={child.id} className="flex flex-col items-center">
                                      <div style={{ width: 2, height: 28, background: "#60a5fa", flexShrink: 0 }} />
                                      <VisualTreeNode
                                        node={child}
                                        collapsed={treeCollapsedNodes}
                                        onToggle={toggleTreeNode}
                                        stepsByLine={treeStepsByLine}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
              </BomErrorBoundary>
            )}
          </div>
        </div>
      </div>

      {/* ── DELETE LINES CONFIRMATION DIALOG ─────────────────────────────── */}
      <Dialog open={deleteLinesConfirmOpen} onOpenChange={(v) => { if (!bulkDeleteLinesMutation.isPending) setDeleteLinesConfirmOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectedBomLines.size} Component{selectedBomLines.size !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This will permanently remove {selectedBomLines.size} BOM line{selectedBomLines.size !== 1 ? "s" : ""} from this item. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLinesConfirmOpen(false)} disabled={bulkDeleteLinesMutation.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteLinesMutation.mutate([...selectedBomLines])}
              disabled={bulkDeleteLinesMutation.isPending}
            >
              {bulkDeleteLinesMutation.isPending ? "Deleting…" : `Delete ${selectedBomLines.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      ? selectedChild.drawing_revision
                        ? `${selectedChild.drawing_revision} — ${selectedChild.description}`
                        : `${selectedChild.item_code} — ${selectedChild.description}`
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
                            value={`${item.item_code} ${item.description} ${item.drawing_revision ?? ""}`}
                            onSelect={() => {
                              setSelectedChild(item);
                              const autoBuy = ["bought_out", "raw_material"].includes(item.item_type);
                              setLineForm((f) => ({
                                ...f,
                                unit: item.unit ?? "",
                                drawing_number: item.drawing_revision ?? item.drawing_number ?? "",
                                make_or_buy: autoBuy ? "buy" : "make",
                              }));
                              setChildItemOpen(false);
                            }}
                          >
                            <div>
                              {item.drawing_revision ? (
                                <p className="font-mono text-xs font-bold text-blue-700">
                                  {item.drawing_revision} — {item.description}
                                </p>
                              ) : (
                                <p className="text-sm font-medium">{item.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground capitalize">
                                {item.item_code} · {item.item_type?.replace(/_/g, " ")} · Stock: {item.current_stock}{" "}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Make / Buy</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-l-md border transition-colors ${
                      lineForm.make_or_buy === "make"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => setLineForm((f) => ({ ...f, make_or_buy: "make" }))}
                  >
                    Make
                  </button>
                  <button
                    type="button"
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-r-md border-t border-b border-r transition-colors ${
                      lineForm.make_or_buy === "buy"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => setLineForm((f) => ({ ...f, make_or_buy: "buy" }))}
                  >
                    Buy
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={lineForm.lead_time_days}
                  onChange={(e) => setLineForm((f) => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
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

      {/* ── ADD / EDIT VENDOR DIALOG ─────────────────────────────────────── */}
      <Dialog open={vendorDialogOpen} onOpenChange={(v) => { setVendorDialogOpen(v); if (!v) { setEditingVendor(null); setVendorPartyOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Approved Vendor"}</DialogTitle>
            {vendorDialogLine && (
              <DialogDescription>
                For: <span className="font-mono text-blue-700">{vendorDialogLine.child_item_code ?? "component"}</span>
                {" — "}{vendorDialogLine.child_item_description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3">
            {/* Vendor combobox */}
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <Popover open={vendorPartyOpen} onOpenChange={setVendorPartyOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {vendorForm.vendor_name || "Select vendor..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search vendors..." />
                    <CommandList>
                      <CommandEmpty>No vendor found.</CommandEmpty>
                      <CommandGroup>
                        {vendorParties.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => {
                              setVendorForm((f) => ({ ...f, vendor_id: p.id, vendor_name: p.name }));
                              setVendorPartyOpen(false);
                            }}
                          >
                            <div className="flex items-start justify-between w-full gap-2">
                              <div>
                                <p className="font-medium text-sm">{p.name}</p>
                                {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                              </div>
                              {p.vendor_type && (
                                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border mt-0.5 ${
                                  p.vendor_type === "raw_material_supplier" ? "bg-teal-50 text-teal-700 border-teal-200" :
                                  p.vendor_type === "processor" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                  "bg-slate-100 text-slate-600 border-slate-200"
                                }`}>
                                  {p.vendor_type === "raw_material_supplier" ? "RAW MAT" : p.vendor_type === "processor" ? "PROCESSOR" : "BOTH"}
                                </span>
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

            {/* Process name used as notes */}
            <div className="space-y-1.5">
              <Label>Process Name</Label>
              <Input
                list="bom-process-suggestions"
                value={vendorForm.notes}
                onChange={(e) => setVendorForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Nickel Plating, CNC Machining"
              />
              {processNameSuggestions.length > 0 && (
                <datalist id="bom-process-suggestions">
                  {processNameSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={vendorForm.lead_time_days ?? ""}
                  onChange={(e) => setVendorForm((f) => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit Cost ₹ (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={vendorForm.unit_price ?? ""}
                  onChange={(e) => setVendorForm((f) => ({ ...f, unit_price: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            {!editingVendor && vendorDialogLine && (vendorsByLine.get(vendorDialogLine.id) ?? []).length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>This will be set as the preferred vendor since it is the first vendor for this component.</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="vendor-preferred"
                checked={vendorForm.is_preferred}
                onCheckedChange={(v) => setVendorForm((f) => ({ ...f, is_preferred: !!v }))}
              />
              <Label htmlFor="vendor-preferred" className="cursor-pointer flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" /> Mark as preferred vendor
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editingVendor ? updateVendorMutation.mutate() : addVendorMutation.mutate()}
              disabled={!vendorForm.vendor_name.trim() || addVendorMutation.isPending || updateVendorMutation.isPending}
            >
              {editingVendor ? "Save Changes" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADD / EDIT PROCESS STEP DIALOG ───────────────────────────────── */}
      <Dialog open={stepDialogOpen} onOpenChange={(v) => { setStepDialogOpen(v); if (!v) { setEditingStep(null); setStepVendorOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStep ? "Edit Process Step" : "Add Process Step"}</DialogTitle>
            {stepDialogLine && (
              <DialogDescription>
                For: <span className="font-mono text-blue-700">{stepDialogLine.child_item_code ?? "component"}</span>
                {" — "}{stepDialogLine.child_item_description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Process Name *</Label>
              <Input
                value={stepForm.process_name}
                onChange={(e) => setStepForm((f) => ({ ...f, process_name: e.target.value }))}
                placeholder="e.g. CNC Machining, Nickel Plating, QC Inspection"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Step Type</Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-l-md border transition-colors ${
                    stepForm.step_type === "internal"
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => setStepForm((f) => ({ ...f, step_type: "internal", vendor_id: null, vendor_name: "" }))}
                >
                  Internal
                </button>
                <button
                  type="button"
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-r-md border-t border-b border-r transition-colors ${
                    stepForm.step_type === "external"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => setStepForm((f) => ({ ...f, step_type: "external" }))}
                >
                  External (Job Work)
                </button>
              </div>
            </div>

            {stepForm.step_type === "external" && (
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Popover open={stepVendorOpen} onOpenChange={setStepVendorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {stepForm.vendor_name || "Select vendor..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search vendors..." />
                      <CommandList>
                        <CommandEmpty>No vendor found.</CommandEmpty>
                        <CommandGroup>
                          {vendorParties.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.name}
                              onSelect={() => {
                                setStepForm((f) => ({ ...f, vendor_id: p.id, vendor_name: p.name }));
                                setStepVendorOpen(false);
                              }}
                            >
                              <div className="flex items-start justify-between w-full gap-2">
                                <div>
                                  <p className="font-medium text-sm">{p.name}</p>
                                  {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                                </div>
                                {p.vendor_type && (
                                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border mt-0.5 ${
                                    p.vendor_type === "raw_material_supplier" ? "bg-teal-50 text-teal-700 border-teal-200" :
                                    p.vendor_type === "processor" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                    "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}>
                                    {p.vendor_type === "raw_material_supplier" ? "RAW MAT" : p.vendor_type === "processor" ? "PROCESSOR" : "BOTH"}
                                  </span>
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
            )}

            <div className="space-y-1.5">
              <Label>Lead Time (days)</Label>
              <Input
                type="number"
                min={0}
                value={stepForm.lead_time_days}
                onChange={(e) => setStepForm((f) => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={stepForm.notes}
                onChange={(e) => setStepForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editingStep ? updateStepMutation.mutate() : addStepMutation.mutate()}
              disabled={
                !stepForm.process_name.trim() ||
                addStepMutation.isPending ||
                updateStepMutation.isPending
              }
            >
              {editingStep ? "Save Changes" : "Add Step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
