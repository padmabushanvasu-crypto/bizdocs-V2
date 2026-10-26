import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { SerialEntry, fitSerials } from "@/components/SerialEntry";
import { fetchSerialsForAwos, setAwoSerials, findDuplicateSerials, SERIAL_STATUS_LABEL } from "@/lib/fg-serials";
import type { AssemblyWorkOrder } from "@/lib/production-api";

/** Finished-good work order: the unit serials, shown first, with an editor while the build is open. */
export function AwoSerialsPanel({ awo }: { awo: AssemblyWorkOrder }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);

  const { data: byAwo = {}, isLoading } = useQuery({
    queryKey: ["fg-serials", [awo.id]],
    queryFn: () => fetchSerialsForAwos([awo.id]),
  });
  const serials = byAwo[awo.id] ?? [];
  const editable = !["complete", "cancelled"].includes(awo.status) && !awo.deleted_at;
  const missing = Math.max(0, awo.quantity_to_build - serials.length);

  const save = useMutation({
    mutationFn: () => setAwoSerials(awo.id, fitSerials(draft, awo.quantity_to_build)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fg-serials"] });
      queryClient.invalidateQueries({ queryKey: ["awo"] });
      toast({ title: "Serial numbers saved" });
      setOpen(false);
    },
    onError: (e: Error) => {
      const m = e.message.match(/^Serial (.+?) is already used/);
      if (m) setConflicts([m[1]]);
      toast({ title: "Serials not saved", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serial No.</span>
        {isLoading ? (
          <span className="text-sm text-muted-foreground">…</span>
        ) : serials.length > 0 ? (
          serials.map((s) => (
            <span
              key={s.id}
              className="font-mono text-base font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-900"
              title={`${SERIAL_STATUS_LABEL[s.status] ?? s.status}${s.needs_verification ? " · not verified yet" : ""}`}
            >
              {s.serial_number}
              {s.needs_verification && <span className="text-amber-600 text-sm">*</span>}
            </span>
          ))
        ) : (
          <span className="text-sm text-amber-700">
            {awo.serial_number && /\d/.test(awo.serial_number) ? awo.serial_number : "No serial entered"}
          </span>
        )}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              setDraft(fitSerials(serials.map((s) => s.serial_number), awo.quantity_to_build));
              setConflicts([]);
              setOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> {serials.length ? "Edit serials" : "Enter serials"}
          </Button>
        )}
      </div>
      {editable && missing > 0 && (
        <p className="text-xs text-amber-700 mt-1">
          {missing} of {awo.quantity_to_build} unit(s) still need a serial before the store can accept this build.
        </p>
      )}
      {serials.some((s) => s.needs_verification) && (
        <p className="text-xs text-muted-foreground mt-1">* not verified yet — confirm on the Serial Numbers page.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Serial numbers — {awo.awo_number}</DialogTitle>
          </DialogHeader>
          <SerialEntry
            quantity={awo.quantity_to_build}
            value={draft}
            conflicts={conflicts}
            onChange={(v) => { setDraft(v); setConflicts([]); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || findDuplicateSerials(draft).length > 0}
            >
              {save.isPending ? "Saving…" : "Save serials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
