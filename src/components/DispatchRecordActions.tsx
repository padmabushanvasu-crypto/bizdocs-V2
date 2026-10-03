import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { reopenDispatchRecord, deleteDispatchRecord } from "@/lib/dispatch-api";

interface Props {
  id: string;
  drNumber: string;
  status: string;
  /** Called after a successful delete (e.g. to leave the detail page). */
  onDeleted?: () => void;
}

/**
 * Edit / Delete for a Dispatch Record.
 *  - draft: Edit opens the form; Delete removes it. No stock effect.
 *  - dispatched/delivered: stock was already deducted at confirm. Edit first
 *    reopens the record to draft, which returns the stock (rpc_reverse_dispatch_record,
 *    one transaction); Delete returns the stock then removes the record.
 */
export function DispatchRecordActions({ id, drNumber, status, onDeleted }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDraft = status === "draft";

  const refresh = () => {
    for (const key of [
      "dispatch-records",
      "dispatch-record",
      "dispatch-stats",
      "ready-to-dispatch",
      "finished-good-items",
      "items",
      "stock-register",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const onError = (err: unknown) =>
    toast({
      title: "Error",
      description: err instanceof Error ? err.message : "Something went wrong",
      variant: "destructive",
    });

  const stockNote = (lines: number) =>
    lines > 0
      ? `Stock returned for ${lines} item${lines === 1 ? "" : "s"}.`
      : "No stock entries were found for this record, so stock was not changed.";

  const reopen = useMutation({
    mutationFn: () => reopenDispatchRecord(id),
    onSuccess: ({ reversedLines }) => {
      refresh();
      setConfirmEdit(false);
      toast({ title: `${drNumber} reopened as draft`, description: stockNote(reversedLines) });
      navigate(`/dispatch-records/${id}/edit`);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => deleteDispatchRecord(id),
    onSuccess: ({ reversedLines }) => {
      refresh();
      setConfirmDelete(false);
      toast({
        title: `${drNumber} deleted`,
        description: isDraft ? undefined : stockNote(reversedLines),
      });
      onDeleted?.();
    },
    onError,
  });

  return (
    // stopPropagation: dialogs are portaled but React events still bubble to a clickable table row.
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => (isDraft ? navigate(`/dispatch-records/${id}/edit`) : setConfirmEdit(true))}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>

      <AlertDialog open={confirmEdit} onOpenChange={setConfirmEdit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit {drNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This dispatch is already {status}. Editing returns its stock to inventory and moves the record
              back to Draft. Make your changes, then confirm the dispatch again to deduct stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopen.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reopen.isPending}
              onClick={(e) => {
                e.preventDefault();
                reopen.mutate();
              }}
            >
              {reopen.isPending ? "Reversing…" : "Reverse stock & edit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {drNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isDraft
                ? "This draft will be removed. No stock is affected."
                : `This dispatch is already ${status}. Deleting returns its stock to inventory and removes the record. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : isDraft ? "Delete" : "Reverse stock & delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
