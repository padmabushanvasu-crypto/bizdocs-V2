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
import { todayIST, monthRange, previousMonth, fyStartIST } from "@/lib/date-ist";

export interface StockPeriodExportOptions {
  from: string;
  to: string;
  includeAtVendor: boolean;
  includeZeroRows: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  isExporting: boolean;
  onExport: (opts: StockPeriodExportOptions) => Promise<void>;
}

const monthStartIST = () => `${todayIST().slice(0, 7)}-01`;

export function validatePeriod(from: string, to: string, today: string): string | null {
  if (!from || !to) return "Both From and To dates are required.";
  if (from > to) return "From date must be on or before To date.";
  if (to > today) return "To date cannot be in the future.";
  return null;
}

export function StockPeriodExportModal({ open, onClose, isExporting, onExport }: Props) {
  const [from, setFrom] = useState(monthStartIST());
  const [to, setTo] = useState(todayIST());
  const [month, setMonth] = useState("");
  const [includeAtVendor, setIncludeAtVendor] = useState(true);
  const [includeZeroRows, setIncludeZeroRows] = useState(false);

  // Fresh defaults on every open so a previous export's selections don't carry over.
  useEffect(() => {
    if (open) {
      setFrom(monthStartIST());
      setTo(todayIST());
      setMonth("");
      setIncludeAtVendor(true);
      setIncludeZeroRows(false);
    }
  }, [open]);

  const today = todayIST();
  const error = validatePeriod(from, to, today);

  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t > today ? today : t);
  };

  const pickMonth = (m: string) => {
    setMonth(m);
    if (!m) return;
    const r = monthRange(m);
    setRange(r.from, r.to);
  };

  const preset = (kind: "this" | "last" | "fy") => {
    setMonth("");
    if (kind === "this") setRange(monthStartIST(), today);
    else if (kind === "last") {
      const r = monthRange(previousMonth(today.slice(0, 7)));
      setRange(r.from, r.to);
    } else setRange(fyStartIST(today), today);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isExporting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Stock Register — Period</DialogTitle>
          <DialogDescription>
            Opening, inward, outward, adjustment and closing stock per item for a date range
            (whole IST days). Downloads as an Excel (.xlsx) file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={() => preset("this")}>
              This month
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={() => preset("last")}>
              Last month
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={() => preset("fy")}>
              This FY
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Month</Label>
            <Input
              type="month"
              value={month}
              max={today.slice(0, 7)}
              onChange={(e) => pickMonth(e.target.value)}
              className="h-9 text-sm"
              disabled={isExporting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">From</Label>
              <Input
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => { setMonth(""); setFrom(e.target.value); }}
                className="h-9 text-sm"
                disabled={isExporting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">To</Label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(e) => { setMonth(""); setTo(e.target.value); }}
                className="h-9 text-sm"
                disabled={isExporting}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={includeAtVendor}
              onCheckedChange={(v) => setIncludeAtVendor(v === true)}
              disabled={isExporting}
            />
            <span className="text-sm text-slate-700">Include At Vendor sheet</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={includeZeroRows}
              onCheckedChange={(v) => setIncludeZeroRows(v === true)}
              disabled={isExporting}
            />
            <span className="text-sm text-slate-700">Include items with no stock or movement</span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isExporting || error !== null}
            onClick={() => onExport({ from, to, includeAtVendor, includeZeroRows })}
          >
            <Download className="h-4 w-4 mr-1" />
            {isExporting ? "Generating…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StockPeriodExportModal;
