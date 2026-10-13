import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { revertDispatchRecord } from "@/lib/dispatch-api";

interface Props {
  record: { id: string; dr_number: string; status: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReverted?: () => void;
}

/** Revert a dispatched/delivered record to draft (stock reversed, reason required). */
export function DispatchRecordRevertDialog({ record, open, onOpenChange, onReverted }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open, record?.id]);

  const mutation = useMutation({
    mutationFn: () => revertDispatchRecord(record!.id, reason),
    onSuccess: (res) => {
      toast({
        title: `${res.dr_number} reverted to draft`,
        description: "Stock restored. You can now edit it and confirm again.",
      });
      onOpenChange(false);
      onReverted?.();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Revert failed"),
  });

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revert {record.dr_number} to draft?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The dispatched units go back into stock and serial numbers return to in-stock. The reversal stays in the
              stock ledger. After editing, confirm the dispatch again to deduct stock.
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-revert-reason">Reason (required)</Label>
            <Textarea
              id="dr-revert-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong quantity entered"
              rows={3}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Reverting…" : "Revert to Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
