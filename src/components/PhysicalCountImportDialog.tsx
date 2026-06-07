import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { recordPhysicalCount, type CountWorklistRow } from "@/lib/physical-count-api";

type RowStatus = "OK" | "UNMATCHED" | "AMBIGUOUS" | "INVALID" | "DUPLICATE";

interface PreviewRow {
  rowNum: number;
  csvCode: string;
  csvCounted: string;
  counted: number | null;
  status: RowStatus;
  itemId?: string;
  description?: string;
  systemFree?: number;
  variance?: number;
  reason: string;
}

const STATUS_META: Record<RowStatus, { label: string; cls: string }> = {
  OK: { label: "OK", cls: "bg-green-100 text-green-800" },
  UNMATCHED: { label: "Unmatched", cls: "bg-amber-100 text-amber-800" },
  AMBIGUOUS: { label: "Ambiguous", cls: "bg-orange-100 text-orange-800" },
  INVALID: { label: "Invalid", cls: "bg-red-100 text-red-800" },
  DUPLICATE: { label: "Duplicate in file", cls: "bg-purple-100 text-purple-800" },
};

const norm = (s: string) => s.replace(/[\s._-]/g, "").toLowerCase();

/** Find a CSV header key by tolerant matching (ignores case/space/_/-/.). */
function findField(fields: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = fields.find((f) => norm(f) === norm(c));
    if (hit) return hit;
  }
  // looser: contains
  for (const c of candidates) {
    const hit = fields.find((f) => norm(f).includes(norm(c)));
    if (hit) return hit;
  }
  return null;
}

export function PhysicalCountImportDialog({
  open,
  onOpenChange,
  worklist,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  worklist: CountWorklistRow[];
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ applied: number; failed: number; errors: string[] } | null>(null);

  // item_code is NOT unique — map code -> all matching active items.
  const codeMap = useMemo(() => {
    const m = new Map<string, CountWorklistRow[]>();
    for (const it of worklist) {
      const k = norm(it.item_code);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [worklist]);

  const summary = useMemo(() => {
    const s: Record<RowStatus, number> = { OK: 0, UNMATCHED: 0, AMBIGUOUS: 0, INVALID: 0, DUPLICATE: 0 };
    for (const r of rows) s[r.status]++;
    return s;
  }, [rows]);

  const okRows = useMemo(() => rows.filter((r) => r.status === "OK"), [rows]);

  function reset() {
    setRows([]); setFileName(null); setConfirming(false); setApplying(false);
    setProgress({ done: 0, total: 0 }); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    reset();
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = res.meta.fields ?? [];
        const codeField = findField(fields, ["item_code", "code"]);
        const countedField = findField(fields, ["counted_qty", "counted", "count", "qty", "quantity"]);
        if (!codeField || !countedField) {
          toast({
            title: "Missing required columns",
            description: "CSV must include item_code and counted_qty columns.",
            variant: "destructive",
          });
          return;
        }

        // Count occurrences of each code in the file (for DUPLICATE flagging).
        const seen = new Map<string, number>();
        const data = res.data;
        for (const raw of data) {
          const code = String(raw[codeField] ?? "").trim();
          if (!code) continue;
          seen.set(norm(code), (seen.get(norm(code)) ?? 0) + 1);
        }

        const firstSeen = new Set<string>();
        const preview: PreviewRow[] = [];
        data.forEach((raw, i) => {
          const code = String(raw[codeField] ?? "").trim();
          const countedRaw = String(raw[countedField] ?? "").trim();
          if (!code && !countedRaw) return; // wholly blank line
          const key = norm(code);
          const num = Number(countedRaw);
          const isNum = countedRaw !== "" && Number.isFinite(num);
          const matches = codeMap.get(key) ?? [];

          let status: RowStatus;
          let reason = "";
          let itemId: string | undefined;
          let description: string | undefined;
          let systemFree: number | undefined;
          let variance: number | undefined;

          const isDuplicate = code !== "" && (seen.get(key) ?? 0) > 1 && firstSeen.has(key);
          if (code !== "") firstSeen.add(key);

          if (!isNum || num < 0) {
            status = "INVALID";
            reason = countedRaw === "" ? "counted_qty missing" : num < 0 ? "negative qty" : "counted_qty not a number";
          } else if (isDuplicate) {
            status = "DUPLICATE";
            reason = "code repeated in file — first row used";
          } else if (matches.length === 0) {
            status = "UNMATCHED";
            reason = "no active item with this code";
          } else if (matches.length > 1) {
            status = "AMBIGUOUS";
            reason = `${matches.length} items share this code`;
          } else {
            status = "OK";
            const it = matches[0];
            itemId = it.id; description = it.description; systemFree = it.system_free;
            variance = num - it.system_free;
          }

          preview.push({
            rowNum: i + 2, // +1 header, +1 to 1-index
            csvCode: code || "(blank)",
            csvCounted: countedRaw || "(blank)",
            counted: isNum ? num : null,
            status, itemId, description, systemFree, variance, reason,
          });
        });

        setRows(preview);
        if (preview.length === 0) {
          toast({ title: "No data rows found in CSV", variant: "destructive" });
        }
      },
      error: (err) => toast({ title: "Could not parse CSV", description: err.message, variant: "destructive" }),
    });
  }

  async function applyAll() {
    setApplying(true);
    setProgress({ done: 0, total: okRows.length });
    let applied = 0, failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < okRows.length; i++) {
      const r = okRows[i];
      try {
        await recordPhysicalCount(r.itemId!, r.counted!);
        applied++;
      } catch (e: any) {
        failed++;
        errors.push(`${r.csvCode}: ${e?.message ?? "failed"}`);
      }
      setProgress({ done: i + 1, total: okRows.length });
    }
    setApplying(false);
    setConfirming(false);
    setResult({ applied, failed, errors });
    onApplied();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!applying) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-blue-600" /> Import counts from CSV</DialogTitle>
          <DialogDescription>
            CSV must include <code>item_code</code> and <code>counted_qty</code> columns (other columns are ignored).
            Nothing is changed until you confirm — only <b>OK</b> rows are applied.
          </DialogDescription>
        </DialogHeader>

        {/* Result summary (after apply) */}
        {result ? (
          <div className="py-4 space-y-2">
            <div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="h-5 w-5" /> Applied {result.applied} count(s).</div>
            {result.failed > 0 && (
              <div className="text-red-600 text-sm">
                {result.failed} failed:
                <ul className="list-disc ml-5 mt-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Skipped {rows.length - okRows.length} non-OK row(s): {summary.UNMATCHED} unmatched, {summary.AMBIGUOUS} ambiguous, {summary.INVALID} invalid, {summary.DUPLICATE} duplicate.
            </p>
          </div>
        ) : (
          <>
            {/* File picker */}
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={applying}>
                <Upload className="h-4 w-4 mr-1.5" /> Choose CSV
              </Button>
              {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
              {fileName && <button onClick={reset} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>

            {/* Summary chips */}
            {rows.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {(Object.keys(STATUS_META) as RowStatus[]).map((s) => (
                  <span key={s} className={`px-2 py-0.5 rounded font-medium ${STATUS_META[s].cls}`}>
                    {STATUS_META[s].label}: {summary[s]}
                  </span>
                ))}
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">Total: {rows.length}</span>
              </div>
            )}

            {/* Preview table */}
            {rows.length > 0 && (
              <div className="max-h-[44vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {["Item Code", "Description", "System", "Counted", "Variance", "Status"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 ${i >= 2 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5 border-b border-slate-100 font-mono text-xs">{r.csvCode}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 max-w-[260px] truncate text-slate-700">{r.description ?? <span className="text-muted-foreground">{r.reason}</span>}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 text-right font-mono tabular-nums text-slate-500">{r.systemFree != null ? formatNumber(r.systemFree) : "—"}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 text-right font-mono tabular-nums">{r.csvCounted}</td>
                        <td className="px-3 py-1.5 border-b border-slate-100 text-right font-mono tabular-nums">
                          {r.variance != null ? <span className={r.variance === 0 ? "text-slate-400" : r.variance > 0 ? "text-green-600" : "text-red-600"}>{r.variance > 0 ? "+" : ""}{formatNumber(r.variance)}</span> : "—"}
                        </td>
                        <td className="px-3 py-1.5 border-b border-slate-100">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_META[r.status].cls}`} title={r.reason}>{STATUS_META[r.status].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Confirm banner */}
            {confirming && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>This resets the FREE (on-shelf) stock for <b>{okRows.length}</b> item(s) and posts a physical-count ledger event for each. In-process / WIP stock is not affected. Proceed?</span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
          ) : applying ? (
            <Button disabled>Applying {progress.done}/{progress.total}…</Button>
          ) : confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>Back</Button>
              <Button onClick={applyAll}>Confirm &amp; apply {okRows.length}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button disabled={okRows.length === 0} onClick={() => setConfirming(true)}>Apply {okRows.length} count{okRows.length === 1 ? "" : "s"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
