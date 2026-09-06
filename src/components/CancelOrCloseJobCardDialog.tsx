import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cancelJobCard, closeJobCardShort } from "@/lib/job-works-api";

interface CancelOrCloseJobCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCardId: string;
  jcNumber: string;
  // Which action applies is decided by the caller from the ledger state
  // (only entry/skip so far -> cancel; anything else -> close short) —
  // only one of the two is ever offered at a time, never both.
  mode: 'cancel' | 'close_short';
}

export function CancelOrCloseJobCardDialog({
  open, onOpenChange, jobCardId, jcNumber, mode,
}: CancelOrCloseJobCardDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!reason.trim()) throw new Error("A reason is required.");
      return mode === 'cancel'
        ? cancelJobCard(jobCardId, reason.trim())
        : closeJobCardShort(jobCardId, reason.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-work", jobCardId] });
      queryClient.invalidateQueries({ queryKey: ["job-works"] });
      toast({ title: mode === 'cancel' ? "Job card cancelled" : "Job card closed short" });
      onOpenChange(false);
      navigate("/job-works");
    },
    onError: (e: any) =>
      toast({ title: mode === 'cancel' ? "Could not cancel" : "Could not close short", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) { onOpenChange(v); if (!v) setReason(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'cancel' ? "Cancel Job Card" : "Close Job Card Short"}</DialogTitle>
          <DialogDescription>
            {jcNumber} —{" "}
            {mode === 'cancel'
              ? "nothing has been issued or confirmed yet; this reverses the material back to free stock."
              : "any unprocessed remainder is released back to free stock as raw. This will raise if material is still outstanding at a vendor."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label>Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Required"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Go Back</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!reason.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving..." : mode === 'cancel' ? "Cancel Job Card" : "Close Short"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
