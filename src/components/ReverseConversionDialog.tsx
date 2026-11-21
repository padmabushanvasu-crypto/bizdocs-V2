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
import { formatNumber } from "@/lib/gst-utils";
import { reverseRmConversion, type RmConversionOutputRow } from "@/lib/rm-conversions-api";

interface ReverseConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rmConversionId: string | null;
  /** Every item the conversion produced — all of them are reversed together. */
  outputs?: RmConversionOutputRow[];
}

export function ReverseConversionDialog({
  open,
  onOpenChange,
  rmConversionId,
  outputs = [],
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
      queryClient.invalidateQueries({ queryKey: ["rm-conversion-inputs"] });
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
            Takes every item this conversion produced back out of store and returns the raw material
            it consumed. If any of these items has already been issued or used, nothing is reversed.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {outputs.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {outputs.length === 1 ? "Output being reversed" : `${outputs.length} outputs being reversed`}
            </p>
            <ul className="space-y-0.5 text-xs">
              {outputs.map((o) => (
                <li key={o.line_no} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-mono text-slate-700">{o.item_code}</span>
                    {o.description && <span className="text-slate-500 ml-1">{o.description}</span>}
                  </span>
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    {formatNumber(o.qty_base)} {o.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
