import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { reportDamage } from "@/lib/production-api";

interface ReportDamageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awoId: string;
  awoLineId: string;
  itemLabel: string;
  availableQty: number;
  unit?: string | null;
}

// Phase 1 of damage disposition (DC_STAGE_FLOW_REDESIGN.md §6 Phase 4, A2).
// This only flags damaged units — no stock movement happens here. The line
// then shows a pending amount awaiting a separate Disposition call.
export function ReportDamageDialog({
  open, onOpenChange, awoId, awoLineId, itemLabel, availableQty, unit,
}: ReportDamageDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState<number | undefined>(availableQty > 0 ? availableQty : undefined);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
      if (!reason.trim()) throw new Error("A reason is required.");
      return reportDamage(awoLineId, qty, reason.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", awoId] });
      toast({ title: "Damage reported", description: "Pending disposition — no stock has moved yet." });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not report damage", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Report Damage</DialogTitle>
          <DialogDescription>{itemLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            This only flags the units as damaged — no stock movement happens now. A separate disposition
            (scrap / return to vendor / use as-is) resolves it afterward.
          </p>

          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={availableQty}
                value={qty ?? ""}
                onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
                className="flex-1"
              />
              {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">{availableQty} available in WIP right now.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Describe the damage…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!qty || qty <= 0 || !reason.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Report Damage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
