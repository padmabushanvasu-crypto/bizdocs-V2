import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { dispositionDamage, fetchConcessionApprovers } from "@/lib/production-api";

type Disposition = 'scrap' | 'return_to_vendor' | 'use_as_is';

interface DispositionDamageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  awoId: string;
  awoLineId: string;
  itemLabel: string;
  pendingQty: number;
  unit?: string | null;
}

// Phase 2 of damage disposition (DC_STAGE_FLOW_REDESIGN.md §6 Phase 4, A2).
// Acts on previously-reported (rpc_report_damage), still-pending damage, in
// parts — same pattern as rejected-material disposition in the job-card flow
// (DisposeRejectedDialog). Both legs live entirely in rpc_disposition_damage;
// this is a thin call + verbatim error pass-through.
export function DispositionDamageDialog({
  open, onOpenChange, awoId, awoLineId, itemLabel, pendingQty, unit,
}: DispositionDamageDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [disposition, setDisposition] = useState<Disposition>('scrap');
  const [qty, setQty] = useState<number | undefined>(pendingQty > 0 ? pendingQty : undefined);
  const [notes, setNotes] = useState("");
  const [concessionBy, setConcessionBy] = useState<string | undefined>(undefined);

  const { data: approvers = [], isLoading: approversLoading } = useQuery({
    queryKey: ["concession-approvers"],
    queryFn: fetchConcessionApprovers,
    enabled: open && disposition === 'use_as_is',
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
      if (!notes.trim()) throw new Error("A reason is required.");
      if (disposition === 'use_as_is' && !concessionBy) {
        throw new Error("Select a concession approver.");
      }
      return dispositionDamage({
        awoLineId,
        qty,
        disposition,
        notes: notes.trim(),
        concessionBy: disposition === 'use_as_is' ? concessionBy : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awo-detail", awoId] });
      queryClient.invalidateQueries({ queryKey: ["sa-work-orders-wip"] });
      queryClient.invalidateQueries({ queryKey: ["fg-work-orders-wip"] });
      toast({
        title: disposition === 'scrap' ? "Scrapped"
          : disposition === 'return_to_vendor' ? "Marked returned to vendor"
          : "Accepted as-is",
      });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not disposition", description: e.message, variant: "destructive" }),
  });

  const isValid = !!qty && qty > 0 && qty <= pendingQty && notes.trim().length > 0
    && (disposition !== 'use_as_is' || !!concessionBy);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disposition Damaged Material</DialogTitle>
          <DialogDescription>{itemLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {pendingQty} {unit ?? ""} pending disposition.
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={disposition === 'scrap' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDisposition('scrap')}
            >
              Scrap
            </Button>
            <Button
              type="button"
              variant={disposition === 'return_to_vendor' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDisposition('return_to_vendor')}
            >
              Return to Vendor
            </Button>
            <Button
              type="button"
              variant={disposition === 'use_as_is' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setDisposition('use_as_is')}
            >
              Use As Is
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={pendingQty}
                value={qty ?? ""}
                onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
                className="flex-1"
              />
              {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            </div>
          </div>

          {disposition === 'use_as_is' && (
            <div className="space-y-1.5">
              <Label>Concession Approver *</Label>
              <Select value={concessionBy} onValueChange={setConcessionBy}>
                <SelectTrigger>
                  <SelectValue placeholder={approversLoading ? "Loading…" : "Select QC/Admin approver"} />
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                  {!approversLoading && approvers.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No QC/Admin users found.</div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Only QC Team / Admin users can approve a use-as-is concession.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={
                disposition === 'scrap' ? "Why scrap instead of return/concession?"
                  : disposition === 'return_to_vendor' ? "Why return to vendor?"
                  : "Why accept as-is?"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? "Saving…"
              : disposition === 'scrap' ? "Scrap"
              : disposition === 'return_to_vendor' ? "Return to Vendor"
              : "Accept As-Is"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
