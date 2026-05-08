import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Truck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchDispatchRecord,
  createDispatchRecord,
  updateDispatchRecord,
  confirmDispatch,
  fetchFinishedGoodItems,
} from "@/lib/dispatch-api";
import type { DispatchRecordItem } from "@/lib/dispatch-api";
import { fetchParties } from "@/lib/parties-api";

interface LineItem {
  item_id: string;
  item_code: string;
  item_description: string;
  quantity: number;
  unit: string;
  notes?: string;
}

const inputDarkClasses =
  "dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100";

export default function DispatchRecordForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const currentUserName = (profile as any)?.full_name ?? "Current User";
  const isEdit = !!id;

  const [form, setForm] = useState({
    dispatch_date: new Date().toISOString().split("T")[0],
    customer_id: "",
    customer_name: "",
    customer_po_ref: "",
    vehicle_number: "",
    driver_name: "",
    driver_contact: "",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [itemPopoverIndex, setItemPopoverIndex] = useState<number | null>(null);

  // Draft persistence — create mode only. Mirrors PO/DC pattern.
  const DRAFT_KEY = "bizdocs_draft_dispatch";
  const draftRestored = useRef(false);

  useEffect(() => {
    if (isEdit) return;
    if (draftRestored.current) return;
    draftRestored.current = true;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { form?: typeof form; lineItems?: LineItem[] };
      if (draft.form) setForm(draft.form);
      if (Array.isArray(draft.lineItems)) setLineItems(draft.lineItems);
    } catch {
      /* ignore malformed draft */
    }
  }, [isEdit]);

  useEffect(() => {
    if (isEdit) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, lineItems }));
      } catch { /* quota / disabled — ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [isEdit, form, lineItems]);

  const clearDispatchDraft = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const { data: existingDR } = useQuery({
    queryKey: ["dispatch-record", id],
    queryFn: () => fetchDispatchRecord(id!),
    enabled: isEdit,
  });

  const { data: fgItems = [] } = useQuery({
    queryKey: ["finished-good-items"],
    queryFn: fetchFinishedGoodItems,
    staleTime: 30_000,
  });

  const { data: partiesData } = useQuery({
    queryKey: ["parties-customers"],
    queryFn: () => fetchParties({ type: "customer", status: "active" }),
    staleTime: 60_000,
  });

  const parties = partiesData?.data ?? [];

  // Pre-populate on edit
  useEffect(() => {
    if (existingDR) {
      setForm({
        dispatch_date: existingDR.dispatch_date ?? new Date().toISOString().split("T")[0],
        customer_id: existingDR.customer_id ?? "",
        customer_name: existingDR.customer_name ?? "",
        customer_po_ref: existingDR.customer_po_ref ?? "",
        vehicle_number: existingDR.vehicle_number ?? "",
        driver_name: existingDR.driver_name ?? "",
        driver_contact: existingDR.driver_contact ?? "",
        notes: existingDR.notes ?? "",
      });
      if (existingDR.items && existingDR.items.length > 0) {
        // Map legacy items (which may have serial-number fields) to the new
        // item-only LineItem shape — serial info is dropped from the form.
        setLineItems(
          existingDR.items.map((item) => ({
            item_id: item.item_id ?? "",
            item_code: item.item_code ?? "",
            item_description: item.item_description ?? "",
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes ?? undefined,
          }))
        );
      }
    }
  }, [existingDR]);

  // Pre-populate first row when ?item=<id> query param matches an FG item
  const itemParam = searchParams.get("item");
  useEffect(() => {
    if (
      itemParam &&
      fgItems.length > 0 &&
      lineItems.length === 0 &&
      !isEdit
    ) {
      const fg = fgItems.find((i) => i.id === itemParam);
      if (fg) {
        setLineItems([
          {
            item_id: fg.id,
            item_code: fg.item_code,
            item_description: fg.description,
            quantity: 1,
            unit: fg.unit,
          },
        ]);
      }
    }
  }, [itemParam, fgItems, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const fgById = useMemo(() => {
    const map: Record<string, (typeof fgItems)[number]> = {};
    for (const fg of fgItems) map[fg.id] = fg;
    return map;
  }, [fgItems]);

  // ── Validation ────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const e: {
      customer?: string;
      vehicle?: string;
      driver_name?: string;
      driver_contact?: string;
      lines?: string;
      lineByIndex: Record<number, string>;
    } = { lineByIndex: {} };

    if (!form.customer_id) e.customer = "Select a customer";
    if (!form.vehicle_number.trim()) e.vehicle = "Vehicle number is required";
    if (!form.driver_name.trim()) e.driver_name = "Driver name is required";
    if (!form.driver_contact.trim()) e.driver_contact = "Driver contact is required";

    if (lineItems.length === 0) {
      e.lines = "Add at least one line item";
    } else {
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        if (!li.item_id) {
          e.lineByIndex[i] = "Select an item";
          continue;
        }
        if (!li.quantity || li.quantity < 1) {
          e.lineByIndex[i] = "Quantity must be 1 or more";
          continue;
        }
        const fg = fgById[li.item_id];
        const available = fg?.stock_in_fg_ready ?? 0;
        if (li.quantity > available) {
          e.lineByIndex[i] = `Only ${available} ${li.unit || "NOS"} available`;
        }
      }
    }
    return e;
  }, [form, lineItems, fgById]);

  const isValid =
    !errors.customer &&
    !errors.vehicle &&
    !errors.driver_name &&
    !errors.driver_contact &&
    !errors.lines &&
    Object.keys(errors.lineByIndex).length === 0;

  // ── Save / confirm ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (action: "draft" | "confirm") => {
      const itemsPayload: Partial<DispatchRecordItem>[] = lineItems.map((li) => ({
        serial_number_id: null,
        serial_number: null,
        item_id: li.item_id || null,
        item_code: li.item_code || null,
        item_description: li.item_description || null,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes ?? null,
      }));

      let drId: string;
      if (isEdit) {
        await updateDispatchRecord(id!, form, itemsPayload);
        drId = id!;
      } else {
        drId = await createDispatchRecord(form, itemsPayload);
      }
      if (action === "confirm") {
        await confirmDispatch(drId);
      }
      return drId;
    },
    onSuccess: (drId, action) => {
      queryClient.invalidateQueries({ queryKey: ["dispatch-records"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-record", drId] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stats"] });
      queryClient.invalidateQueries({ queryKey: ["finished-good-items"] });
      queryClient.invalidateQueries({ queryKey: ["ready-to-dispatch"] });
      clearDispatchDraft();
      toast({
        title: action === "confirm" ? "Dispatch Confirmed" : "Saved as Draft",
        description:
          action === "confirm"
            ? "Stock deducted from finished-goods ready bucket and ledger updated."
            : "Your draft has been saved.",
      });
      navigate(`/dispatch-records/${drId}`);
    },
    onError: (err: unknown) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSave = (action: "draft" | "confirm") => {
    if (action === "confirm" && !isValid) {
      setShowErrors(true);
      toast({
        title: "Please complete all required fields",
        description: "Some required fields are missing or invalid.",
        variant: "destructive",
      });
      return;
    }
    // Drafts can save without full validation, but we still block if there's
    // no customer selected or no items at all (header is uninformative).
    if (action === "draft" && (!form.customer_id || lineItems.length === 0)) {
      setShowErrors(true);
      toast({
        title: "Cannot save empty draft",
        description: "Add a customer and at least one line item.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(action);
  };

  function handleCustomerChange(partyId: string) {
    const party = parties.find((p) => p.id === partyId);
    setForm((f) => ({
      ...f,
      customer_id: partyId,
      customer_name: party?.name ?? "",
    }));
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { item_id: "", item_code: "", item_description: "", quantity: 1, unit: "NOS" },
    ]);
  }
  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }
  function selectItemForLine(index: number, fgId: string) {
    const fg = fgById[fgId];
    if (!fg) return;
    setLineItems((prev) =>
      prev.map((li, i) =>
        i === index
          ? {
              ...li,
              item_id: fg.id,
              item_code: fg.item_code,
              item_description: fg.description,
              unit: fg.unit,
              quantity: li.quantity || 1,
            }
          : li
      )
    );
    setItemPopoverIndex(null);
  }
  function updateLine<K extends keyof LineItem>(
    index: number,
    key: K,
    value: LineItem[K]
  ) {
    setLineItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [key]: value } : li))
    );
  }

  // Per-row availability — prefer the item we already have selected
  function availableFor(li: LineItem): number {
    if (!li.item_id) return 0;
    return fgById[li.item_id]?.stock_in_fg_ready ?? 0;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {isEdit ? "Edit Dispatch Record" : "New Dispatch Record"}
          </h1>
        </div>
      </div>

      {/* Validation banner */}
      {showErrors && !isValid && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-400/40 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Please complete all required fields before saving.</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-[#0f1525] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Dispatch Date</Label>
            <Input
              type="date"
              value={form.dispatch_date}
              onChange={(e) => setForm((f) => ({ ...f, dispatch_date: e.target.value }))}
              className={inputDarkClasses}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Customer <span className="text-red-500">*</span>
            </Label>
            <Select value={form.customer_id} onValueChange={handleCustomerChange}>
              <SelectTrigger
                className={`${inputDarkClasses} ${
                  showErrors && errors.customer ? "border-red-500 dark:border-red-400" : ""
                }`}
              >
                <SelectValue placeholder="Select customer..." />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showErrors && errors.customer && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.customer}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Customer PO Reference</Label>
            <Input
              placeholder="e.g. PO-2025-0042"
              value={form.customer_po_ref}
              onChange={(e) => setForm((f) => ({ ...f, customer_po_ref: e.target.value }))}
              className={inputDarkClasses}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Vehicle Number <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g. MH12AB1234"
              value={form.vehicle_number}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
              className={`${inputDarkClasses} ${
                showErrors && errors.vehicle ? "border-red-500 dark:border-red-400" : ""
              }`}
            />
            {showErrors && errors.vehicle && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.vehicle}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Driver Name <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Driver's full name"
              value={form.driver_name}
              onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
              className={`${inputDarkClasses} ${
                showErrors && errors.driver_name ? "border-red-500 dark:border-red-400" : ""
              }`}
            />
            {showErrors && errors.driver_name && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.driver_name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              Driver Contact <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="10-digit mobile number"
              value={form.driver_contact}
              onChange={(e) => setForm((f) => ({ ...f, driver_contact: e.target.value }))}
              className={`${inputDarkClasses} ${
                showErrors && errors.driver_contact ? "border-red-500 dark:border-red-400" : ""
              }`}
            />
            {showErrors && errors.driver_contact && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.driver_contact}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            placeholder="Any additional notes..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className={inputDarkClasses}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Dispatched By</Label>
          <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#0a0e1a] rounded-md px-3 py-2 border border-slate-200 dark:border-white/10">
            {currentUserName}
          </p>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white dark:bg-[#0f1525] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Items Being Dispatched</h2>
          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>

        {lineItems.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
            No items added yet. Click "Add Item" to begin.
          </p>
        )}
        {showErrors && errors.lines && (
          <p className="text-xs text-red-600 dark:text-red-400">{errors.lines}</p>
        )}

        {lineItems.map((li, index) => {
          const available = availableFor(li);
          const lineErr = errors.lineByIndex[index];
          const showLineErr = showErrors && lineErr;
          const selectedFg = li.item_id ? fgById[li.item_id] : null;
          return (
            <div
              key={index}
              className={`grid grid-cols-12 gap-3 items-start border ${
                showLineErr
                  ? "border-red-300 dark:border-red-400/50"
                  : "border-slate-100 dark:border-white/10"
              } rounded-lg p-3`}
            >
              {/* Item picker */}
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <Label className="text-xs text-slate-500 dark:text-slate-400">
                  Item <span className="text-red-500">*</span>
                </Label>
                <Popover
                  open={itemPopoverIndex === index}
                  onOpenChange={(open) => setItemPopoverIndex(open ? index : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={`w-full justify-between font-normal ${inputDarkClasses} ${
                        showLineErr && !li.item_id ? "border-red-500 dark:border-red-400" : ""
                      }`}
                    >
                      {selectedFg ? (
                        <span className="truncate">
                          <span className="font-mono">{selectedFg.item_code}</span>
                          <span className="text-muted-foreground"> — {selectedFg.description}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Select an item with stock…</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by code or description…" />
                      <CommandList>
                        <CommandEmpty>No finished-good items with stock.</CommandEmpty>
                        <CommandGroup>
                          {fgItems.map((fg) => (
                            <CommandItem
                              key={fg.id}
                              value={`${fg.item_code} ${fg.description}`}
                              onSelect={() => selectItemForLine(index, fg.id)}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm">
                                  <span className="font-mono font-medium">{fg.item_code}</span>
                                  <span className="text-muted-foreground"> — {fg.description}</span>
                                </span>
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                  Available: {fg.stock_in_fg_ready} {fg.unit}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Description (editable for remarks) */}
              <div className="col-span-12 sm:col-span-3 space-y-1">
                <Label className="text-xs text-slate-500 dark:text-slate-400">Description</Label>
                <Input
                  className={`text-sm ${inputDarkClasses}`}
                  value={li.item_description}
                  onChange={(e) => updateLine(index, "item_description", e.target.value)}
                />
              </div>

              {/* Qty */}
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs text-slate-500 dark:text-slate-400">
                  Qty <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={available || undefined}
                  value={li.quantity}
                  onChange={(e) => updateLine(index, "quantity", Number(e.target.value))}
                  className={`text-sm ${inputDarkClasses} ${
                    showLineErr && li.quantity > available ? "border-red-500 dark:border-red-400" : ""
                  }`}
                />
                {li.item_id && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Available: {available} {li.unit || "NOS"}
                  </p>
                )}
              </div>

              {/* Unit */}
              <div className="col-span-4 sm:col-span-1 space-y-1">
                <Label className="text-xs text-slate-500 dark:text-slate-400">Unit</Label>
                <Input
                  className={`text-sm ${inputDarkClasses}`}
                  value={li.unit}
                  onChange={(e) => updateLine(index, "unit", e.target.value)}
                />
              </div>

              {/* Remove */}
              <div className="col-span-4 sm:col-span-1 flex items-end justify-end pb-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 mt-5"
                  onClick={() => removeLineItem(index)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {showLineErr && (
                <div className="col-span-12 -mt-1">
                  <p className="text-xs text-red-600 dark:text-red-400">{lineErr}</p>
                </div>
              )}
            </div>
          );
        })}

        {lineItems.length > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-right">
            Total lines: {lineItems.length}
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" onClick={() => { clearDispatchDraft(); navigate(-1); }}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => handleSave("draft")}
          >
            Save as Draft
          </Button>
          <Button
            disabled={saveMutation.isPending || lineItems.length === 0}
            onClick={() => handleSave("confirm")}
          >
            <Truck className="h-4 w-4 mr-1" />
            Confirm Dispatch
          </Button>
        </div>
      </div>
    </div>
  );
}
