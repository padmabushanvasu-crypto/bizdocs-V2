import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Truck } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchDispatchRecord,
  createDispatchRecord,
  updateDispatchRecord,
  confirmDispatch,
  fetchReadyToDispatch,
} from "@/lib/dispatch-api";
import type { DispatchRecordItem } from "@/lib/dispatch-api";
import { fetchParties } from "@/lib/parties-api";

interface LineItem {
  serial_number_id: string;
  serial_number: string;
  item_id: string;
  item_code: string;
  item_description: string;
  quantity: number;
  unit: string;
}

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

  // Fetch existing record on edit
  const { data: existingDR } = useQuery({
    queryKey: ["dispatch-record", id],
    queryFn: () => fetchDispatchRecord(id!),
    enabled: isEdit,
  });

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
        setLineItems(
          existingDR.items.map((item) => ({
            serial_number_id: item.serial_number_id ?? "",
            serial_number: item.serial_number ?? "",
            item_id: item.item_id ?? "",
            item_code: item.item_code ?? "",
            item_description: item.item_description ?? "",
            quantity: item.quantity,
            unit: item.unit,
          }))
        );
      }
    }
  }, [existingDR]);

  // Pre-populate serial from query param
  const serialParam = searchParams.get("serial");

  const { data: readyUnits = [] } = useQuery({
    queryKey: ["ready-to-dispatch"],
    queryFn: fetchReadyToDispatch,
    staleTime: 30_000,
  });

  // When readyUnits loads and serialParam exists, pre-populate first line item
  useEffect(() => {
    if (serialParam && readyUnits.length > 0 && lineItems.length === 0 && !isEdit) {
      const unit = readyUnits.find((u) => u.serial_number === serialParam);
      if (unit) {
        setLineItems([
          {
            serial_number_id: unit.id,
            serial_number: unit.serial_number,
            item_id: unit.item_id ?? "",
            item_code: unit.item_code ?? "",
            item_description: unit.item_description ?? "",
            quantity: 1,
            unit: "NOS",
          },
        ]);
      }
    }
  }, [serialParam, readyUnits, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: partiesData } = useQuery({
    queryKey: ["parties-customers"],
    queryFn: () => fetchParties({ type: "customer", status: "active" }),
    staleTime: 60_000,
  });

  const parties = partiesData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (action: "draft" | "confirm") => {
      const itemsPayload: Partial<DispatchRecordItem>[] = lineItems.map((li) => ({
        serial_number_id: li.serial_number_id || null,
        serial_number: li.serial_number || null,
        item_id: li.item_id || null,
        item_code: li.item_code || null,
        item_description: li.item_description || null,
        quantity: li.quantity,
        unit: li.unit,
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
      queryClient.invalidateQueries({ queryKey: ["ready-to-dispatch"] });
      toast({
        title: action === "confirm" ? "Dispatch Confirmed" : "Saved as Draft",
        description: action === "confirm"
          ? "Stock updated and serial numbers marked dispatched."
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
      {
        serial_number_id: "",
        serial_number: "",
        item_id: "",
        item_code: "",
        item_description: "",
        quantity: 1,
        unit: "NOS",
      },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSerialSelect(index: number, serialId: string) {
    const unit = readyUnits.find((u) => u.id === serialId);
    if (!unit) return;
    setLineItems((prev) =>
      prev.map((li, i) =>
        i === index
          ? {
              ...li,
              serial_number_id: unit.id,
              serial_number: unit.serial_number,
              item_id: unit.item_id ?? "",
              item_code: unit.item_code ?? "",
              item_description: unit.item_description ?? "",
            }
          : li
      )
    );
  }

  function updateLineItem<K extends keyof LineItem>(index: number, key: K, value: LineItem[K]) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, [key]: value } : li)));
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">
            {isEdit ? "Edit Dispatch Record" : "New Dispatch Record"}
          </h1>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dispatch Date */}
          <div className="space-y-1.5">
            <Label>Dispatch Date</Label>
            <Input
              type="date"
              value={form.dispatch_date}
              onChange={(e) => setForm((f) => ({ ...f, dispatch_date: e.target.value }))}
            />
          </div>

          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={handleCustomerChange}>
              <SelectTrigger>
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
          </div>

          {/* Customer PO Reference */}
          <div className="space-y-1.5">
            <Label>Customer PO Reference</Label>
            <Input
              placeholder="e.g. PO-2025-0042"
              value={form.customer_po_ref}
              onChange={(e) => setForm((f) => ({ ...f, customer_po_ref: e.target.value }))}
            />
          </div>

          {/* Vehicle Number */}
          <div className="space-y-1.5">
            <Label>
              Vehicle Number <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g. MH12AB1234"
              value={form.vehicle_number}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))}
            />
          </div>

          {/* Driver Name */}
          <div className="space-y-1.5">
            <Label>
              Driver Name <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Driver's full name"
              value={form.driver_name}
              onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))}
            />
          </div>

          {/* Driver Contact */}
          <div className="space-y-1.5">
            <Label>
              Driver Contact <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="10-digit mobile number"
              value={form.driver_contact}
              onChange={(e) => setForm((f) => ({ ...f, driver_contact: e.target.value }))}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            placeholder="Any additional notes..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
        </div>

        {/* Dispatched By — read only */}
        <div className="space-y-1.5">
          <Label>Dispatched By</Label>
          <p className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
            {currentUserName}
          </p>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Units Being Dispatched</h2>
          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4 mr-1" />
            Add Unit
          </Button>
        </div>

        {lineItems.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">
            No units added yet. Click "Add Unit" to begin.
          </p>
        )}

        {lineItems.map((li, index) => (
          <div key={index} className="grid grid-cols-12 gap-3 items-start border border-slate-100 rounded-lg p-3">
            {/* Serial Number select */}
            <div className="col-span-12 sm:col-span-4 space-y-1">
              <Label className="text-xs text-slate-500">Serial Number</Label>
              <Select
                value={li.serial_number_id || "__manual__"}
                onValueChange={(val) => {
                  if (val !== "__manual__") handleSerialSelect(index, val);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select serial..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Manual entry —</SelectItem>
                  {readyUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.serial_number}
                      {u.item_description ? ` — ${u.item_description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!li.serial_number_id || li.serial_number_id === "__manual__") && (
                <Input
                  placeholder="Serial number"
                  className="text-sm mt-1"
                  value={li.serial_number}
                  onChange={(e) => updateLineItem(index, "serial_number", e.target.value)}
                />
              )}
            </div>

            {/* Item description */}
            <div className="col-span-12 sm:col-span-4 space-y-1">
              <Label className="text-xs text-slate-500">Item Description</Label>
              <Input
                placeholder="Item description"
                className="text-sm"
                value={li.item_description}
                onChange={(e) => updateLineItem(index, "item_description", e.target.value)}
              />
            </div>

            {/* Qty */}
            <div className="col-span-4 sm:col-span-1 space-y-1">
              <Label className="text-xs text-slate-500">Qty</Label>
              <Input
                type="number"
                min={1}
                className="text-sm"
                value={li.quantity}
                onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
              />
            </div>

            {/* Unit */}
            <div className="col-span-4 sm:col-span-2 space-y-1">
              <Label className="text-xs text-slate-500">Unit</Label>
              <Input
                className="text-sm"
                value={li.unit}
                onChange={(e) => updateLineItem(index, "unit", e.target.value)}
              />
            </div>

            {/* Remove */}
            <div className="col-span-4 sm:col-span-1 flex items-end justify-end pb-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-5"
                onClick={() => removeLineItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {lineItems.length > 0 && (
          <p className="text-sm text-slate-500 text-right">Total units: {lineItems.length}</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate("draft")}
          >
            Save as Draft
          </Button>
          <Button
            disabled={saveMutation.isPending || lineItems.length === 0}
            onClick={() => saveMutation.mutate("confirm")}
          >
            <Truck className="h-4 w-4 mr-1" />
            Confirm Dispatch
          </Button>
        </div>
      </div>
    </div>
  );
}
