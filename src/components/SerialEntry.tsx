import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { parseSerialList, findDuplicateSerials } from "@/lib/fg-serials";

interface SerialEntryProps {
  /** Units being built — one box per unit. */
  quantity: number;
  value: string[];
  onChange: (serials: string[]) => void;
  /** Serials the server reported as already used, highlighted in red. */
  conflicts?: string[];
  disabled?: boolean;
}

/** Resize the serial list to the unit count, keeping what was typed. */
export function fitSerials(serials: string[], quantity: number): string[] {
  const n = Math.max(0, Math.floor(quantity || 0));
  const out = serials.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

export function SerialEntry({ quantity, value, onChange, conflicts = [], disabled }: SerialEntryProps) {
  const [paste, setPaste] = useState("");
  const boxes = fitSerials(value, quantity);
  const dups = new Set(findDuplicateSerials(boxes));
  const clash = new Set(conflicts.map((c) => c.trim().toUpperCase()));
  const filled = boxes.filter((s) => s.trim()).length;
  const pasted = paste.trim() ? parseSerialList(paste) : [];

  const setAt = (i: number, v: string) => {
    const next = [...boxes];
    next[i] = v;
    onChange(next);
  };

  const applyPaste = () => {
    if (pasted.length === 0) return;
    onChange(fitSerials(pasted, quantity));
    setPaste("");
  };

  if (quantity < 1) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Serial numbers — one per unit</Label>
        <span className={`text-xs tabular-nums ${filled === boxes.length ? "text-green-700" : "text-muted-foreground"}`}>
          {filled} of {boxes.length} entered
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {boxes.map((s, i) => {
          const key = s.trim().toUpperCase();
          const bad = !!key && (dups.has(key) || clash.has(key));
          return (
            <Input
              key={i}
              aria-label={`Serial for unit ${i + 1}`}
              placeholder={`Unit ${i + 1}`}
              value={s}
              disabled={disabled}
              className={`font-mono ${bad ? "border-destructive focus-visible:ring-destructive" : ""}`}
              onChange={(e) => setAt(i, e.target.value)}
            />
          );
        })}
      </div>

      {quantity > 1 && !disabled && (
        <div className="flex gap-2">
          <Input
            placeholder="Or paste a list, e.g. 5966, 5967 & 5968"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPaste(); } }}
          />
          <Button type="button" variant="outline" size="sm" className="shrink-0 h-10" disabled={pasted.length === 0} onClick={applyPaste}>
            Fill {pasted.length > 0 ? pasted.length : ""}
          </Button>
        </div>
      )}
      {pasted.length > quantity && (
        <p className="text-xs text-amber-700">That list has {pasted.length} serials but only {quantity} unit(s) are being built — the extra ones will be dropped.</p>
      )}

      {dups.size > 0 && (
        <p className="text-xs text-destructive">Entered more than once: {[...dups].join(", ")}</p>
      )}
      {conflicts.length > 0 && (
        <p className="text-xs text-destructive">Already used on another unit: {conflicts.join(", ")}</p>
      )}
      {filled < boxes.length && dups.size === 0 && conflicts.length === 0 && (
        <p className="text-xs text-muted-foreground">You can leave some blank for now — every unit needs a serial before the store can accept the build.</p>
      )}
    </div>
  );
}
