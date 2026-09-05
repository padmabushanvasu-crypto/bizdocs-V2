import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { confirmInternalStep } from "@/lib/job-works-api";

interface ConfirmInternalStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  stepNumber: number;
  stepName: string;
  eligibleQty: number;
  unit?: string | null;
}

// Piece 4 (DC_STAGE_FLOW_REDESIGN.md §4.4) — internal stages never get a DC;
// this is their only forward action. Thin call to rpc_confirm_internal_step,
// no client-side ledger or stock math.
export function ConfirmInternalStepDialog({
  open, onOpenChange, jobCardId, stepNumber, stepName, eligibleQty, unit,
}: ConfirmInternalStepDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState<number | undefined>();

  useEffect(() => {
    if (open) setQty(eligibleQty > 0 ? eligibleQty : undefined);
  }, [open, eligibleQty]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
      return confirmInternalStep({ job_card_id: jobCardId, step_number: stepNumber, qty });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["job-card-stage-positions", jobCardId] });
      queryClient.invalidateQueries({ queryKey: ["job-work", jobCardId] });
      toast({
        title: "Confirmed",
        description: result.final_stage_credited
          ? `${result.qty_confirmed} ${unit ?? ""} confirmed — final stage, credited to free stock.`
          : `${result.qty_confirmed} ${unit ?? ""} confirmed.`,
      });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not confirm", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm units done</DialogTitle>
          <DialogDescription>
            Stage {stepNumber} — {stepName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label>Quantity *</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={eligibleQty}
              value={qty ?? ""}
              onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
              className="flex-1"
              autoFocus
            />
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">{eligibleQty} eligible right now.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!qty || qty <= 0 || mutation.isPending}>
            {mutation.isPending ? "Confirming..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
