import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateDispatchRecordDetails, type DispatchRecord } from "@/lib/dispatch-api";

interface Props {
  record: DispatchRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Edit the fields of a posted dispatch record that have no stock effect
 * (vehicle, driver, contact, customer PO ref, notes). Customer, date and items
 * need "Revert to Draft" first — the database enforces this.
 */
export function DispatchRecordDetailsDialog({ record, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [f, setF] = useState({ vehicle_number: "", driver_name: "", driver_contact: "", customer_po_ref: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && record) {
      setError(null);
      setF({
        vehicle_number: record.vehicle_number ?? "",
        driver_name: record.driver_name ?? "",
        driver_contact: record.driver_contact ?? "",
        customer_po_ref: record.customer_po_ref ?? "",
        notes: record.notes ?? "",
      });
    }
  }, [open, record]);

  const mutation = useMutation({
    mutationFn: () =>
      updateDispatchRecordDetails(record!.id, {
        vehicle_number: f.vehicle_number.trim() || null,
        driver_name: f.driver_name.trim() || null,
        driver_contact: f.driver_contact.trim() || null,
        customer_po_ref: f.customer_po_ref.trim() || null,
        notes: f.notes.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Details updated" });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Save failed"),
  });

  if (!record) return null;
  const field = (key: keyof typeof f, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`dr-d-${key}`}>{label}</Label>
      <Input id={`dr-d-${key}`} value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit details — {record.dr_number}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          Customer, date and items are locked on a {record.status} record. Use Revert to Draft to change them.
        </p>
        <div className="space-y-3">
          {field("vehicle_number", "Vehicle number")}
          {field("driver_name", "Driver name")}
          {field("driver_contact", "Driver contact")}
          {field("customer_po_ref", "Customer PO ref")}
          <div className="space-y-1.5">
            <Label htmlFor="dr-d-notes">Notes</Label>
            <Textarea id="dr-d-notes" rows={3} value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
