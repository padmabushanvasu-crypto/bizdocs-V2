import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { type JobWorkStep, type RecordReturnData } from "@/lib/job-works-api";

interface RecordReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: JobWorkStep;
  onSave: (data: RecordReturnData, autoNextStep?: "send_back" | "rework_inhouse") => void;
  isSaving?: boolean;
}

type InspectionResult = "accepted" | "partially_accepted" | "rejected";
type RejectedOutcome = "scrap" | "send_back" | "rework_inhouse";

export function RecordReturnDialog({
  open,
  onOpenChange,
  step,
  onSave,
  isSaving,
}: RecordReturnDialogProps) {
  const [qtyReturned, setQtyReturned] = useState<string>(
    step.qty_sent != null ? String(step.qty_sent) : ""
  );
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>("accepted");
  const [qtyAccepted, setQtyAccepted] = useState<string>("");
  const [qtyRejected, setQtyRejected] = useState<string>("0");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectedOutcome, setRejectedOutcome] = useState<RejectedOutcome>("scrap");
  const [inspectedBy, setInspectedBy] = useState("");
  const [notes, setNotes] = useState("");

  // Auto-fill qty accepted when qty returned or inspection result changes
  useEffect(() => {
    const returned = parseFloat(qtyReturned) || 0;
    if (inspectionResult === "accepted") {
      setQtyAccepted(String(returned));
      setQtyRejected("0");
    } else if (inspectionResult === "rejected") {
      setQtyAccepted("0");
      setQtyRejected(String(returned));
    }
    // For partially_accepted, user fills in both
  }, [qtyReturned, inspectionResult]);

  // Auto-calculate rejected when accepted changes (partial case)
  const handleQtyAcceptedChange = (val: string) => {
    setQtyAccepted(val);
    const returned = parseFloat(qtyReturned) || 0;
    const accepted = parseFloat(val) || 0;
    setQtyRejected(String(Math.max(0, returned - accepted)));
  };

  const handleSave = () => {
    const returned = parseFloat(qtyReturned) || 0;
    const accepted = parseFloat(qtyAccepted) || 0;
    const rejected = parseFloat(qtyRejected) || 0;

    const data: RecordReturnData = {
      qty_returned: returned,
      inspection_result: inspectionResult,
      qty_accepted: accepted,
      qty_rejected: rejected,
      rejection_reason: rejected > 0 ? rejectionReason : undefined,
      inspected_by: inspectedBy || undefined,
      notes: notes || undefined,
    };

    let autoNext: "send_back" | "rework_inhouse" | undefined;
    if (rejected > 0 && rejectedOutcome === "send_back") autoNext = "send_back";
    if (rejected > 0 && rejectedOutcome === "rework_inhouse") autoNext = "rework_inhouse";

    onSave(data, autoNext);
  };

  const showRejectionFields =
    inspectionResult === "partially_accepted" || inspectionResult === "rejected";
  const showRejectedOutcome =
    showRejectionFields && (parseFloat(qtyRejected) || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Return — {step.name}</DialogTitle>
          <DialogDescription>
            {step.vendor_name && `Returning from ${step.vendor_name}`}
            {step.qty_sent != null && ` · ${step.qty_sent} units sent`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Qty Returned *</Label>
            <Input
              type="number"
              min={0}
              value={qtyReturned}
              onChange={(e) => setQtyReturned(e.target.value)}
              placeholder={step.qty_sent != null ? String(step.qty_sent) : "0"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inspection Result *</Label>
            <Select
              value={inspectionResult}
              onValueChange={(v) => setInspectionResult(v as InspectionResult)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accepted">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                    Accepted — all units OK
                  </span>
                </SelectItem>
                <SelectItem value="partially_accepted">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                    Partially Accepted — some rejected
                  </span>
                </SelectItem>
                <SelectItem value="rejected">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                    Rejected — all units rejected
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {inspectionResult === "partially_accepted" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Accepted</Label>
                <Input
                  type="number"
                  min={0}
                  value={qtyAccepted}
                  onChange={(e) => handleQtyAcceptedChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qty Rejected</Label>
                <Input
                  type="number"
                  min={0}
                  value={qtyRejected}
                  onChange={(e) => setQtyRejected(e.target.value)}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>
          )}

          {inspectionResult !== "partially_accepted" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Accepted</Label>
                <Input
                  type="number"
                  value={qtyAccepted}
                  readOnly
                  className="bg-muted font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qty Rejected</Label>
                <Input
                  type="number"
                  value={qtyRejected}
                  readOnly
                  className="bg-muted font-mono"
                />
              </div>
            </div>
          )}

          {showRejectionFields && (
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Textarea
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Describe the defect or non-conformance..."
              />
            </div>
          )}

          {showRejectedOutcome && (
            <div className="space-y-1.5">
              <Label>What to do with rejected units?</Label>
              <Select
                value={rejectedOutcome}
                onValueChange={(v) => setRejectedOutcome(v as RejectedOutcome)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scrap">Scrap</SelectItem>
                  <SelectItem value="send_back">Send Back to Vendor</SelectItem>
                  <SelectItem value="rework_inhouse">Rework In-House</SelectItem>
                </SelectContent>
              </Select>
              {(rejectedOutcome === "send_back" || rejectedOutcome === "rework_inhouse") && (
                <p className="text-xs text-muted-foreground">
                  A new step will be automatically created after saving.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Inspected By</Label>
            <Input
              value={inspectedBy}
              onChange={(e) => setInspectedBy(e.target.value)}
              placeholder="Name of inspector"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !qtyReturned}
          >
            Record Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
