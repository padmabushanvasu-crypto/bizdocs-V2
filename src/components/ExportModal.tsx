import { useState, useEffect } from "react";
import { Download, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  docType: string;
  isExporting: boolean;
  onExport: (
    dateFrom: string,
    dateTo: string,
    includeLineItems: boolean
  ) => Promise<void>;
  // Optional override of the default checkbox label / disable line items
  lineItemsLabel?: string;
  lineItemsToggleable?: boolean;
}

const todayIso = () => new Date().toISOString().split("T")[0];
const isoDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

export function ExportModal({
  open,
  onClose,
  docType,
  isExporting,
  onExport,
  lineItemsLabel = "Include line items",
  lineItemsToggleable = true,
}: ExportModalProps) {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [includeLineItems, setIncludeLineItems] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset to defaults whenever the dialog (re-)opens so a previous export's
  // selections don't carry over to a fresh open.
  useEffect(() => {
    if (open) {
      setFrom(isoDaysAgo(30));
      setTo(todayIso());
      setIncludeLineItems(true);
      setError(null);
    }
  }, [open]);

  const handleExport = async () => {
    if (!from || !to) {
      setError("Both From and To dates are required.");
      return;
    }
    if (from > to) {
      setError("From date must be on or before To date.");
      return;
    }
    setError(null);
    await onExport(from, to, includeLineItems);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isExporting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md dark:bg-[#0f1525] dark:border-white/10">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            Export {docType} Report
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Choose the date range and whether to include line-item detail. The
            report is generated as an Excel (.xlsx) file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                From
              </Label>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 text-sm dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                disabled={isExporting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                To
              </Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 text-sm dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                disabled={isExporting}
              />
            </div>
          </div>

          {lineItemsToggleable && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={includeLineItems}
                onCheckedChange={(v) => setIncludeLineItems(v === true)}
                disabled={isExporting}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                {lineItemsLabel}
              </span>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 dark:border-red-400/40 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-1" />
            {isExporting ? "Generating…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExportModal;
