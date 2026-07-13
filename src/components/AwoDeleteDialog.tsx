import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { fetchAssemblyWorkOrder, deleteAssemblyWorkOrder } from "@/lib/production-api";

interface Props {
  awoId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete so the caller can invalidate/navigate. */
  onDeleted?: () => void;
}

/**
 * Status-aware AWO delete confirmation. Fetches the WO fresh on open (status +
 * line items drive the dialog) and delegates every stock decision to
 * rpc_delete_awo via deleteAssemblyWorkOrder:
 *  - draft/pending_materials/cancelled → plain confirm, no stock params.
 *  - in_progress/awaiting_store        → list outstanding WIP, force return/scrap.
 *  - complete                          → warn + double-confirm, single call with
 *                                        reverseOutput=true (RPC blocks & rolls
 *                                        back cleanly if the stock has moved on).
 * RPC exception messages are surfaced verbatim inline.
 */
export function AwoDeleteDialog({ awoId, open, onOpenChange, onDeleted }: Props) {
  const { toast } = useToast();
  const [wipDisposition, setWipDisposition] = useState<"" | "return" | "scrap">("");
  const [notes, setNotes] = useState("");
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: awo, isLoading } = useQuery({
    queryKey: ["awo-delete-detail", awoId],
    queryFn: () => fetchAssemblyWorkOrder(awoId!),
    enabled: open && !!awoId,
  });

  // Reset transient state whenever the dialog (re)opens or switches target.
  useEffect(() => {
    if (open) {
      setWipDisposition("");
      setNotes("");
      setConfirmReverse(false);
      setErrorMsg(null);
    }
  }, [open, awoId]);

  const status = awo?.status;
  const needsWipChoice = status === "in_progress" || status === "awaiting_store";
  const isComplete = status === "complete";

  // Outstanding WIP per component = issued − returned − scrapped − consumed.
  const outstanding = (awo?.line_items ?? [])
    .map((li) => ({
      li,
      qty: Math.max(
        0,
        (li.issued_qty ?? 0) - (li.returned_qty ?? 0) - (li.scrapped_qty ?? 0) - (li.consumed_qty ?? 0)
      ),
    }))
    .filter((x) => x.qty > 0);

  const mutation = useMutation({
    mutationFn: () =>
      deleteAssemblyWorkOrder(awoId!, {
        wipDisposition: needsWipChoice ? (wipDisposition as "return" | "scrap") : undefined,
        reverseOutput: isComplete ? true : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast({
        title: "Work order deleted",
        description:
          res.disposition === "return"
            ? "Outstanding components returned to store."
            : res.disposition === "scrap"
            ? "Outstanding components scrapped."
            : undefined,
      });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const canConfirm =
    !!awo &&
    !mutation.isPending &&
    (!needsWipChoice || wipDisposition !== "") &&
    (!isComplete || confirmReverse);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        flex-col + max-h-[85vh]: header, all controls, and the footer are shrink-0
        (always visible); only the outstanding-WIP list scrolls (min-h-0 +
        max-h-[40vh] + overflow-y-auto), so a large component list (e.g. 82 lines)
        can never push the Cancel/Delete buttons off-screen. Mirrors the app's
        flex-col dialog shell (GstReports) + inner-scroll list (AWO detail).
      */}
      <DialogContent className="flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Delete work order{awo ? ` ${awo.awo_number}` : ""}?</DialogTitle>
        </DialogHeader>

        {isLoading || !awo ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {!needsWipChoice && !isComplete && (
              <p className="shrink-0 text-sm text-muted-foreground">
                This will delete <b>{awo.awo_number}</b> ({awo.item_description ?? awo.item_code}). No stock
                is affected.
              </p>
            )}

            {needsWipChoice && (
              <p className="shrink-0 text-sm text-muted-foreground">
                {outstanding.length > 0
                  ? "This work order holds components in WIP. Choose what happens to them before deleting:"
                  : "No outstanding WIP is recorded, but this WO may still hold components. Choose a disposition to be safe:"}
              </p>
            )}

            {/* Only this list scrolls — everything else stays fixed. */}
            {needsWipChoice && outstanding.length > 0 && (
              <div className="min-h-0 max-h-[40vh] overflow-y-auto divide-y rounded-md border text-sm">
                {outstanding.map(({ li, qty }) => (
                  <div key={li.id} className="flex justify-between px-3 py-1.5">
                    <span className="truncate">{li.item_code ?? li.item_description ?? "—"}</span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(qty)} {li.unit ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {needsWipChoice && (
              <RadioGroup
                className="shrink-0"
                value={wipDisposition}
                onValueChange={(v) => setWipDisposition(v as "return" | "scrap")}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="return" id="wip-return" />
                  <Label htmlFor="wip-return">Return components to store</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="scrap" id="wip-scrap" />
                  <Label htmlFor="wip-scrap">Scrap components (write-off)</Label>
                </div>
              </RadioGroup>
            )}

            {isComplete && (
              <div className="shrink-0 space-y-3">
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This work order is <b>complete</b>. Deleting it will <b>reverse the produced stock</b> —{" "}
                    {formatNumber(awo.quantity_to_build)} × {awo.item_description ?? awo.item_code}. If that
                    stock has already moved on, the delete is blocked and nothing changes.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="confirm-reverse"
                    checked={confirmReverse}
                    onCheckedChange={(c) => setConfirmReverse(!!c)}
                  />
                  <Label htmlFor="confirm-reverse" className="text-sm">
                    I understand the produced stock will be reversed.
                  </Label>
                </div>
              </div>
            )}

            <div className="shrink-0 space-y-1">
              <Label htmlFor="delete-notes" className="text-xs text-muted-foreground">
                Notes (optional)
              </Label>
              <Textarea
                id="delete-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Reason for deletion…"
              />
            </div>

            {errorMsg && (
              <div className="shrink-0 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {errorMsg}
              </div>
            )}
          </>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setErrorMsg(null);
              mutation.mutate();
            }}
            disabled={!canConfirm}
          >
            {mutation.isPending ? "Deleting…" : "Delete work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
