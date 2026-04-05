import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Download, ChevronDown, IndianRupee, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  fetchScrapEntries,
  fetchScrapStats,
  createScrapEntry,
  type ScrapEntry,
  type ScrapFilters,
} from "@/lib/reorder-api";
import { fetchItems, type Item } from "@/lib/items-api";
import { fetchParties, type Party } from "@/lib/parties-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportMultiSheet } from "@/lib/export-utils";
import { UNITS } from "@/lib/constants";
import { format } from "date-fns";

const SCRAP_CATEGORIES = [
  { value: "process_rejection",  label: "Process Rejection" },
  { value: "incoming_rejection", label: "Incoming Rejection" },
  { value: "assembly_rejection", label: "Assembly Rejection" },
  { value: "rework_failure",     label: "Rework Failure" },
  { value: "damage",             label: "Damage" },
  { value: "obsolescence",       label: "Obsolescence" },
  { value: "other",              label: "Other" },
];

const DISPOSAL_METHODS = [
  { value: "write_off",         label: "Write Off" },
  { value: "scrap_sale",        label: "Scrap Sale" },
  { value: "rework",            label: "Rework" },
  { value: "return_to_vendor",  label: "Return to Vendor" },
];


interface ScrapForm {
  scrap_date: string;
  item_id: string;
  item_code: string;
  item_description: string;
  drawing_number: string;
  qty_scrapped: number;
  unit: string;
  scrap_reason: string;
  scrap_category: string;
  cost_per_unit: number;
  disposal_method: string;
  scrap_sale_value: number;
  vendor_id: string;
  vendor_name: string;
  linked_dc_number: string;
  assembly_order_number: string;
  remarks: string;
  recorded_by: string;
}

function emptyForm(): ScrapForm {
  return {
    scrap_date: new Date().toISOString().split("T")[0],
    item_id: "",
    item_code: "",
    item_description: "",
    drawing_number: "",
    qty_scrapped: 0,
    unit: "NOS",
    scrap_reason: "",
    scrap_category: "process_rejection",
    cost_per_unit: 0,
    disposal_method: "write_off",
    scrap_sale_value: 0,
    vendor_id: "",
    vendor_name: "",
    linked_dc_number: "",
    assembly_order_number: "",
    remarks: "",
    recorded_by: "",
  };
}

const categoryLabels: Record<string, string> = {
  process_rejection:  "Process Rejection",
  incoming_rejection: "Incoming Rejection",
  assembly_rejection: "Assembly Rejection",
  rework_failure:     "Rework Failure",
  damage:             "Damage",
  obsolescence:       "Obsolescence",
  other:              "Other",
};

const disposalLabels: Record<string, string> = {
  write_off:        "Write Off",
  scrap_sale:       "Scrap Sale",
  rework:           "Rework",
  return_to_vendor: "Return to Vendor",
};

export default function ScrapRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ScrapForm>(emptyForm());
  const [itemOpen, setItemOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [filters, setFilters] = useState<ScrapFilters>({ page: 1, pageSize: PAGE_SIZE });
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const activeFilters: ScrapFilters = useMemo(() => ({
    search: search || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    category: catFilter !== "all" ? catFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [search, dateFrom, dateTo, catFilter, page]);

  const { data: entriesRes, isLoading } = useQuery({
    queryKey: ["scrap-entries", activeFilters],
    queryFn: () => fetchScrapEntries(activeFilters),
  });
  const entries: ScrapEntry[] = entriesRes?.data ?? [];
  const totalCount = entriesRes?.count ?? 0;

  const { data: stats } = useQuery({
    queryKey: ["scrap-stats"],
    queryFn: fetchScrapStats,
    refetchInterval: 60000,
  });

  const { data: itemsData } = useQuery({
    queryKey: ["items-all-scrap"],
    queryFn: () => fetchItems({ status: "active", pageSize: 500 }),
  });
  const items: Item[] = itemsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ["parties-all-scrap"],
    queryFn: () => fetchParties({ type: "all", status: "active", pageSize: 500 }),
  });
  const parties: Party[] = (vendorsData?.data ?? []) as Party[];

  const totalScrapValue = Math.round((form.qty_scrapped || 0) * (form.cost_per_unit || 0) * 100) / 100;

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.item_id) throw new Error("Please select an item.");
      if (!form.scrap_reason.trim()) throw new Error("Scrap reason is required.");
      if ((form.qty_scrapped || 0) <= 0) throw new Error("Quantity must be greater than 0.");

      return createScrapEntry({
        scrap_date: form.scrap_date,
        item_id: form.item_id || null,
        item_code: form.item_code || null,
        item_description: form.item_description || null,
        drawing_number: form.drawing_number || null,
        qty_scrapped: Number(form.qty_scrapped),
        unit: form.unit,
        scrap_reason: form.scrap_reason,
        scrap_category: form.scrap_category,
        cost_per_unit: Number(form.cost_per_unit),
        disposal_method: form.disposal_method,
        scrap_sale_value: form.disposal_method === "scrap_sale" ? Number(form.scrap_sale_value) : 0,
        vendor_id: form.disposal_method === "scrap_sale" && form.vendor_id ? form.vendor_id : null,
        vendor_name: form.disposal_method === "scrap_sale" && form.vendor_name ? form.vendor_name : null,
        linked_dc_number: form.linked_dc_number || null,
        assembly_order_number: form.assembly_order_number || null,
        remarks: form.remarks || null,
        recorded_by: form.recorded_by || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Scrap entry recorded" });
      queryClient.invalidateQueries({ queryKey: ["scrap-entries"] });
      queryClient.invalidateQueries({ queryKey: ["scrap-stats"] });
      setDialogOpen(false);
      setForm(emptyForm());
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const selectItem = (it: Item) => {
    setForm((f) => ({
      ...f,
      item_id: it.id,
      item_code: it.item_code,
      item_description: it.description,
      drawing_number: it.drawing_number ?? "",
      unit: it.unit || "NOS",
      cost_per_unit: it.standard_cost || 0,
    }));
    setItemOpen(false);
  };

  const selectVendor = (v: Party) => {
    setForm((f) => ({ ...f, vendor_id: v.id, vendor_name: v.name }));
    setVendorOpen(false);
  };

  const handleExport = () => {
    exportMultiSheet(
      [
        {
          sheetName: "Scrap Register",
          columns: [
            { key: "scrap_number",     label: "Scrap No.",      type: "text",     width: 14 },
            { key: "scrap_date",       label: "Date",            type: "date",     width: 12 },
            { key: "item_code",        label: "Item Code",       type: "text",     width: 14 },
            { key: "item_description", label: "Description",     type: "text",     width: 28 },
            { key: "drawing_number",   label: "Drawing No.",     type: "text",     width: 14 },
            { key: "qty_scrapped",     label: "Qty",             type: "number",   width: 8  },
            { key: "unit",             label: "Unit",            type: "text",     width: 8  },
            { key: "scrap_reason",     label: "Reason",          type: "text",     width: 28 },
            { key: "scrap_category",   label: "Category",        type: "text",     width: 18 },
            { key: "cost_per_unit",    label: "Cost/Unit",       type: "currency", width: 12 },
            { key: "total_scrap_value",label: "Scrap Value",     type: "currency", width: 14 },
            { key: "disposal_method",  label: "Disposal",        type: "text",     width: 16 },
            { key: "scrap_sale_value", label: "Sale Value",      type: "currency", width: 14 },
            { key: "vendor_name",      label: "Buyer/Vendor",    type: "text",     width: 20 },
            { key: "recorded_by",      label: "Recorded By",     type: "text",     width: 16 },
          ],
          data: entries,
        },
      ],
      "Scrap_Register.xlsx"
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Scrap Register</h1>
          <p className="text-sm text-slate-500 mt-1">
            Record and track all rejected and scrapped material
          </p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setForm(emptyForm()); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Record Scrap
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="paper-card py-3">
          <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider mb-1">
            This Month
          </p>
          <p className="text-2xl font-bold font-mono">{stats?.total_entries ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">Entries</p>
        </div>
        <div className="paper-card py-3 border-l-4 border-l-destructive">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="h-3.5 w-3.5 text-destructive" />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Scrap Value</p>
          </div>
          <p className="text-xl font-bold font-mono text-destructive">
            {formatCurrency(stats?.total_value ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">This month</p>
        </div>
        <div className="paper-card py-3 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Recovered</p>
          </div>
          <p className="text-xl font-bold font-mono text-emerald-700">
            {formatCurrency(stats?.recovered ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">Scrap sales</p>
        </div>
        <div className="paper-card py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Net Loss</p>
          </div>
          <p className="text-xl font-bold font-mono text-amber-700">
            {formatCurrency(stats?.net_loss ?? 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">This month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search scrap no., item, reason…"
          className="h-9 w-64 text-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Input
          type="date"
          className="h-9 w-36 text-sm"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          placeholder="From"
        />
        <Input
          type="date"
          className="h-9 w-36 text-sm"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          placeholder="To"
        />
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {SCRAP_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
          <table className="w-full data-table text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th>Scrap No.</th>
                <th>Date</th>
                <th>Item</th>
                <th>Drawing No.</th>
                <th className="text-right">Qty</th>
                <th>Reason</th>
                <th>Category</th>
                <th className="text-right">Cost/Unit</th>
                <th className="text-right">Scrap Value</th>
                <th>Disposal</th>
                <th>Vendor/Buyer</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground">
                    No scrap entries found. Click "Record Scrap" to add the first entry.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="font-mono text-xs font-medium">{entry.scrap_number}</td>
                    <td className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.scrap_date), "dd MMM yyyy")}
                    </td>
                    <td>
                      <p className="font-medium text-sm leading-tight">{entry.item_code ?? "—"}</p>
                      {entry.item_description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {entry.item_description}
                        </p>
                      )}
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">
                      {entry.drawing_number ?? "—"}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {entry.qty_scrapped} {entry.unit}
                    </td>
                    <td className="text-sm max-w-[160px] truncate">{entry.scrap_reason}</td>
                    <td>
                      <span className="text-xs text-muted-foreground">
                        {categoryLabels[entry.scrap_category] ?? entry.scrap_category}
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums text-muted-foreground">
                      {formatCurrency(entry.cost_per_unit)}
                    </td>
                    <td className="text-right font-mono tabular-nums font-medium text-destructive">
                      {formatCurrency(entry.total_scrap_value)}
                    </td>
                    <td>
                      <span className="text-xs text-muted-foreground">
                        {disposalLabels[entry.disposal_method] ?? entry.disposal_method}
                      </span>
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {entry.vendor_name ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= totalCount}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Record Scrap Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Scrap</DialogTitle>
            <DialogDescription>
              Record a rejected or scrapped material entry. Stock will be decremented automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Item */}
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">
                  Item *
                </Label>
                <Popover open={itemOpen} onOpenChange={setItemOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full mt-1 justify-between font-normal"
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

              {/* Drawing number */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Drawing No.
                </Label>
                <Input
                  className="mt-1"
                  value={form.drawing_number}
                  onChange={(e) => setForm((f) => ({ ...f, drawing_number: e.target.value }))}
                  placeholder="Auto-filled from item"
                />
              </div>

              {/* Date */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Scrap Date
                </Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.scrap_date}
                  onChange={(e) => setForm((f) => ({ ...f, scrap_date: e.target.value }))}
                />
              </div>

              {/* Qty and unit */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Qty Scrapped *
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1"
                  value={form.qty_scrapped || ""}
                  onChange={(e) => setForm((f) => ({ ...f, qty_scrapped: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Unit
                </Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Scrap reason */}
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">
                  Scrap Reason *
                </Label>
                <Input
                  className="mt-1"
                  value={form.scrap_reason}
                  onChange={(e) => setForm((f) => ({ ...f, scrap_reason: e.target.value }))}
                  placeholder="Describe why the material was scrapped…"
                />
              </div>

              {/* Category */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Category
                </Label>
                <Select
                  value={form.scrap_category}
                  onValueChange={(v) => setForm((f) => ({ ...f, scrap_category: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCRAP_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Disposal method */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Disposal Method
                </Label>
                <Select
                  value={form.disposal_method}
                  onValueChange={(v) => setForm((f) => ({ ...f, disposal_method: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSAL_METHODS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cost per unit + total */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Cost Per Unit (₹)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="mt-1"
                  value={form.cost_per_unit || ""}
                  onChange={(e) => setForm((f) => ({ ...f, cost_per_unit: Number(e.target.value) }))}
                  placeholder="Auto-filled from standard cost"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Total Scrap Value (₹)
                </Label>
                <div className="mt-1 px-3 py-2 bg-muted/50 rounded-md border border-border text-sm font-mono font-bold text-destructive">
                  {formatCurrency(totalScrapValue)}
                </div>
              </div>

              {/* Scrap sale details */}
              {form.disposal_method === "scrap_sale" && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Scrap Sale Value (₹)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="mt-1"
                      value={form.scrap_sale_value || ""}
                      onChange={(e) => setForm((f) => ({ ...f, scrap_sale_value: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">
                      Buyer / Vendor
                    </Label>
                    <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full mt-1 justify-between font-normal"
                        >
                          {form.vendor_name || "Select party…"}
                          <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search party…" />
                          <CommandList>
                            <CommandEmpty>No party found.</CommandEmpty>
                            <CommandGroup>
                              {parties.map((v) => (
                                <CommandItem
                                  key={v.id}
                                  value={v.name}
                                  onSelect={() => selectVendor(v)}
                                >
                                  {v.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {/* Linked DC / AO */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Linked DC (optional)
                </Label>
                <Input
                  className="mt-1"
                  value={form.linked_dc_number}
                  onChange={(e) => setForm((f) => ({ ...f, linked_dc_number: e.target.value }))}
                  placeholder="e.g. DC-2526-001"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Linked Production Run (optional)
                </Label>
                <Input
                  className="mt-1"
                  value={form.assembly_order_number}
                  onChange={(e) => setForm((f) => ({ ...f, assembly_order_number: e.target.value }))}
                  placeholder="e.g. PR-25-26-001"
                />
              </div>

              {/* Remarks + Recorded by */}
              <div className="col-span-2">
                <Label className="text-sm font-medium text-slate-700">
                  Remarks
                </Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  placeholder="Additional notes…"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Recorded By
                </Label>
                <Input
                  className="mt-1"
                  value={form.recorded_by}
                  onChange={(e) => setForm((f) => ({ ...f, recorded_by: e.target.value }))}
                  placeholder="Name"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Record Scrap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
