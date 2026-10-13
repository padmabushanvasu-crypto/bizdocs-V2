import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { deleteDispatchRecord } from "@/lib/dispatch-api";

interface Props {
  record: { id: string; dr_number: string; status: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete so the caller can invalidate/navigate. */
  onDeleted?: () => void;
}

/**
 * Status-aware dispatch record delete. A draft is a plain confirm. A
 * dispatched/delivered record is reversed by rpc_delete_dispatch_record
 * (stock goes back, serials back to in_stock), so a reason is mandatory.
 * RPC errors are shown inline, verbatim.
 */
export function DispatchRecordDeleteDialog({ record, open, onOpenChange, onDeleted }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open, record?.id]);

  const isDraft = record?.status === "draft";

  const mutation = useMutation({
    mutationFn: () => deleteDispatchRecord(record!.id, reason),
    onSuccess: (res) => {
      toast({
        title: `${res.dr_number} deleted`,
        description: isDraft ? undefined : "Stock restored and serial numbers returned to in-stock.",
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Delete failed"),
  });

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {record.dr_number}?</DialogTitle>
        </DialogHeader>

        {isDraft ? (
          <p className="text-sm text-slate-600">This draft has not affected stock. It will be removed from the list.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                This record is <b>{record.status}</b>. Deleting it puts the dispatched units back into stock and
                returns their serial numbers to in-stock. The reversal stays in the stock ledger.
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-delete-reason">Reason (required)</Label>
              <Textarea
                id="dr-delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Created by mistake / wrong customer"
                rows={3}
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || (!isDraft && !reason.trim())}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
