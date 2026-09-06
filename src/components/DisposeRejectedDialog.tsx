import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { disposeRejected } from "@/lib/job-works-api";

interface DisposeRejectedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  stepNumber: number;
  stepName: string;
  undispositionedQty: number;
  unit?: string | null;
}

// Backward path (DC_STAGE_FLOW_REDESIGN.md §10.2, rejection disposition rows)
// — rework re-admits units to the same stage for a fresh DC; scrap leaves
// the batch and writes off stock. Both legs live entirely in
// rpc_dispose_rejected; this is a thin call + verbatim error pass-through.
export function DisposeRejectedDialog({
  open, onOpenChange, jobCardId, stepNumber, stepName, undispositionedQty, unit,
}: DisposeRejectedDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [disposition, setDisposition] = useState<'rework' | 'scrap'>('rework');
  const [qty, setQty] = useState<number | undefined>(undispositionedQty > 0 ? undispositionedQty : undefined);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
      if (!reason.trim()) throw new Error("A reason is required.");
      return disposeRejected({ job_card_id: jobCardId, step_number: stepNumber, qty, disposition, reason: reason.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-card-stage-ledger-totals", jobCardId] });
      queryClient.invalidateQueries({ queryKey: ["job-card-stage-positions", jobCardId] });
      toast({ title: disposition === 'rework' ? "Sent for rework" : "Scrapped" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not disposition", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disposition Rejected Material</DialogTitle>
          <DialogDescription>Stage {stepNumber} — {stepName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={disposition === 'rework' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDisposition('rework')}
            >
              Rework
            </Button>
            <Button
              type="button"
              variant={disposition === 'scrap' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDisposition('scrap')}
            >
              Scrap
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={undispositionedQty}
                value={qty ?? ""}
                onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
                className="flex-1"
              />
              {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">{undispositionedQty} undispositioned right now.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={disposition === 'rework' ? "Why rework instead of scrap?" : "Why scrap instead of rework?"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!qty || qty <= 0 || !reason.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving..." : disposition === 'rework' ? "Send for Rework" : "Scrap"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
