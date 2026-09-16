import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { reverseRmConversion } from "@/lib/rm-conversions-api";

interface ReverseConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rmConversionId: string | null;
  outputItemLabel?: string | null;
}

export function ReverseConversionDialog({
  open,
  onOpenChange,
  rmConversionId,
  outputItemLabel,
}: ReverseConversionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const reverseMutation = useMutation({
    mutationFn: () => {
      if (!rmConversionId) throw new Error("No conversion selected.");
      return reverseRmConversion(rmConversionId, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rm-conversions"] });
      setReason("");
      onOpenChange(false);
      toast({ title: "Conversion reversed" });
    },
    onError: (err: Error) => {
      // Surface the RPC's message verbatim — e.g. its "already issued/
      // dispatched, stock_free below produced qty" block, or the required-
      // reason rejection if the client check below is ever bypassed.
      toast({ title: "Could not reverse", description: err.message, variant: "destructive" });
    },
  });

  const trimmedReason = reason.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setReason(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reverse RM Conversion</DialogTitle>
          <DialogDescription>
            {outputItemLabel
              ? `Reverses the output credit and input consumption for ${outputItemLabel}. This cannot be undone.`
              : "Reverses the output credit and input consumption for this conversion. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this conversion being reversed?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!trimmedReason || reverseMutation.isPending}
            onClick={() => reverseMutation.mutate()}
          >
            {reverseMutation.isPending ? "Reversing…" : "Reverse Conversion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
