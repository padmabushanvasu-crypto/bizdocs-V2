import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { reverseGrnReturn } from "@/lib/grn-api";

interface ReverseGrnReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grnLineItemId: string;
  lineDescription: string;
  grnId: string;
}

// Backward path (DC_STAGE_FLOW_REDESIGN.md §10.2) — corrective action, not a
// common one. Thin call to rpc_reverse_grn_return; its blocking message
// (names the downstream stage, or says the credited stock already left as
// free elsewhere) is surfaced exactly as raised, never worked around.
export function ReverseGrnReturnDialog({
  open, onOpenChange, grnLineItemId, lineDescription, grnId,
}: ReverseGrnReturnDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!reason.trim()) throw new Error("A reason is required to reverse a GRN return.");
      return reverseGrnReturn(grnLineItemId, reason.trim());
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["grn", grnId] });
      queryClient.invalidateQueries({ queryKey: ["dc-line-job-card-ids"] });
      const clawedBack = result.some((r) => r.out_stock_clawed_back);
      toast({
        title: "Return reversed",
        description: clawedBack
          ? "Stock was clawed back from free to in-process."
          : "Reversed on the job card ledger.",
      });
      onOpenChange(false);
      setReason("");
    },
    onError: (e: any) => toast({ title: "Could not reverse", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) { onOpenChange(v); if (!v) setReason(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reverse GRN Return</DialogTitle>
          <DialogDescription>{lineDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label>Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Required — why is this return being reversed?"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!reason.trim() || mutation.isPending}>
            {mutation.isPending ? "Reversing..." : "Reverse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
