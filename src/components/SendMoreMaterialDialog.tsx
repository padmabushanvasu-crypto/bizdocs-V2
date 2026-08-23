import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fetchLinkableOutwardDcs, addStepOutwardDc } from "@/lib/job-works-api";

// Links an additional outward DC to a job card step (job_card_step_dcs INSERT).
// The DC itself is created via the normal DC flow; this records that it also
// sent material out for this step.
export function SendMoreMaterialDialog({
  stepId,
  stepName,
  jobCardId,
  open,
  onClose,
}: {
  stepId: string | null;
  stepName: string | null;
  jobCardId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dcId, setDcId] = useState<string>("");
  const [qty, setQty] = useState<string>("");

  const { data: dcs = [], isLoading } = useQuery({
    queryKey: ["linkable-outward-dcs", stepId],
    queryFn: () => fetchLinkableOutwardDcs(stepId!),
    enabled: open && !!stepId,
  });

  const mutation = useMutation({
    mutationFn: () => addStepOutwardDc({ stepId: stepId!, dcId, qty: Number(qty) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-work", jobCardId] });
      toast({ title: "Material send recorded", description: "The DC has been linked to this step." });
      handleClose();
    },
    onError: (err: any) =>
      toast({ title: "Could not link DC", description: err.message, variant: "destructive" }),
  });

  const handleClose = () => {
    setDcId("");
    setQty("");
    onClose();
  };

  const canSubmit = !!dcId && Number(qty) > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send more material out</DialogTitle>
          <DialogDescription>
            {stepName ? `Link an outward DC to "${stepName}".` : "Link an outward DC to this step."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Delivery Challan</Label>
            <Select value={dcId} onValueChange={setDcId} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading DCs…" : "Select a DC"} />
              </SelectTrigger>
              <SelectContent>
                {dcs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.dc_number}
                    {d.dc_date ? ` · ${format(new Date(d.dc_date), "dd MMM yyyy")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && dcs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No DCs available to link. Create the DC first, then link it here.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Qty sent</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "Linking…" : "Link DC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
