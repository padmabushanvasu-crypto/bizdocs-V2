import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import { createElement } from "react";
import { useToast } from "@/hooks/use-toast";
import type { SkipReason } from "@/lib/import-utils";

const LS_KEY = "bizdocs_import_queue";
const BATCH_SIZE = 50;

// ── Public types ───────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed" | "interrupted";
  progress: number;   // rows processed so far
  total: number;      // total rows submitted
  errors: string[];
  skipReasons: SkipReason[];
  completed: number;  // rows successfully imported
  startedAt: string;  // ISO date string (Date isn't JSON-safe)
}

export type BatchImportFn = (
  rows: Record<string, string>[],
  rowNums: number[],
  onProgress?: (pct: number) => void
) => Promise<{
  imported: number;
  skipped: number;
  errors: string[];
  skipReasons: SkipReason[];
}>;

interface AddJobCallbacks {
  onComplete?: (result: {
    imported: number;
    skipped: number;
    errors: string[];
    skipReasons: SkipReason[];
  }) => void;
}

interface ImportQueueContextValue {
  jobs: ImportJob[];
  addJob: (
    type: string,
    rows: Record<string, string>[],
    rowNums: number[],
    importFn: BatchImportFn,
    callbacks?: AddJobCallbacks
  ) => string;
}

// ── Context ────────────────────────────────────────────────────────────────

const ImportQueueContext = createContext<ImportQueueContextValue | null>(null);

export function useImportQueue(): ImportQueueContextValue {
  const ctx = useContext(ImportQueueContext);
  if (!ctx) throw new Error("useImportQueue must be used within ImportQueueProvider");
  return ctx;
}

// ── localStorage helpers ───────────────────────────────────────────────────

function loadPersistedJobs(): ImportJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: ImportJob[] = JSON.parse(raw);
    // Discard completed/failed — never show stale results after refresh.
    // Only running/queued were mid-flight; mark them interrupted.
    // The progress bar does not render interrupted jobs, so they are
    // silently dropped from view but preserved in state for debugging.
    return parsed
      .filter((j) => j.status === "running" || j.status === "queued")
      .map((j) => ({ ...j, status: "interrupted" as const }));
  } catch {
    return [];
  }
}

function persistJobs(jobs: ImportJob[]): void {
  try {
    // Only persist active (in-flight) jobs so we can detect interruptions
    // on next load. Clear storage once nothing is running — this also
    // handles FIX 3 (clear on dismissal) since the bar hides the moment
    // all jobs leave the active set.
    const active = jobs.filter(
      (j) => j.status === "running" || j.status === "queued"
    );
    if (active.length === 0) {
      localStorage.removeItem(LS_KEY);
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(active));
    }
  } catch {
    // Ignore QuotaExceededError
  }
}

// ── Progress bar ───────────────────────────────────────────────────────────
// Only renders while imports are actively running. Auto-hides the moment
// all jobs complete or fail (toast handles failure feedback). No timers,
// no dismiss button, no stale state.

function ImportProgressBar({ jobs }: { jobs: ImportJob[] }) {
  const activeJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  );

  if (activeJobs.length === 0) return null;

  let message = "";
  let progressPct = 0;

  if (activeJobs.length > 1) {
    message = `${activeJobs.length} imports running`;
    const totalProgress = activeJobs.reduce((s, j) => s + j.progress, 0);
    const totalRows = activeJobs.reduce((s, j) => s + j.total, 0);
    progressPct = totalRows > 0 ? (totalProgress / totalRows) * 100 : 0;
  } else {
    const j = activeJobs[0];
    message = `Importing ${j.type} — ${j.progress} / ${j.total} rows`;
    progressPct = j.total > 0 ? (j.progress / j.total) * 100 : 0;
  }

  return createElement(
    "div",
    {
      className:
        "fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-blue-600 text-white text-sm shadow-lg",
    },
    // Thin progress track
    progressPct > 0 && progressPct < 100
      ? createElement(
          "div",
          { className: "h-0.5 bg-white/30" },
          createElement("div", {
            className: "h-full bg-white transition-all duration-300",
            style: { width: `${progressPct}%` },
          })
        )
      : null,
    // Message row
    createElement(
      "div",
      {
        className: "flex items-center px-4 py-2 max-w-4xl mx-auto",
      },
      createElement(
        "span",
        { className: "flex items-center gap-2" },
        createElement(Loader2, {
          className: "h-3.5 w-3.5 animate-spin shrink-0",
        }),
        createElement("span", null, message)
      )
    )
  );
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ImportQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ImportJob[]>(() => loadPersistedJobs());
  const { toast } = useToast();

  // Persist every time jobs change (clears localStorage when nothing active)
  useEffect(() => {
    persistJobs(jobs);
  }, [jobs]);

  const updateJob = useCallback((id: string, update: Partial<ImportJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...update } : j))
    );
  }, []);

  const addJob = useCallback(
    (
      type: string,
      rows: Record<string, string>[],
      rowNums: number[],
      importFn: BatchImportFn,
      callbacks?: AddJobCallbacks
    ): string => {
      const id = crypto.randomUUID();
      const job: ImportJob = {
        id,
        type,
        status: "queued",
        progress: 0,
        total: rows.length,
        errors: [],
        skipReasons: [],
        completed: 0,
        startedAt: new Date().toISOString(),
      };
      setJobs((prev) => [...prev, job]);

      // Run asynchronously — intentionally not awaited so caller doesn't block
      void (async () => {
        updateJob(id, { status: "running" });

        let totalImported = 0;
        let totalSkipped = 0;
        const allErrors: string[] = [];
        const allSkipReasons: SkipReason[] = [];

        try {
          for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
            const batchRows = rows.slice(offset, offset + BATCH_SIZE);
            const batchNums = rowNums.slice(offset, offset + BATCH_SIZE);

            const res = await importFn(batchRows, batchNums);
            totalImported += res.imported;
            totalSkipped += res.skipped;
            allErrors.push(...res.errors);
            allSkipReasons.push(...res.skipReasons);

            const progress = Math.min(offset + batchRows.length, rows.length);
            updateJob(id, {
              progress,
              completed: totalImported,
              errors: [...allErrors],
              skipReasons: [...allSkipReasons],
            });

            // Yield to the UI thread between batches
            await new Promise<void>((r) => setTimeout(r, 0));
          }

          updateJob(id, { status: "completed" });

          const result = {
            imported: totalImported,
            skipped: totalSkipped,
            errors: allErrors,
            skipReasons: allSkipReasons,
          };

          callbacks?.onComplete?.(result);

          toast({
            title: `✓ ${totalImported} ${type} imported successfully`,
            description:
              totalSkipped > 0
                ? `${totalSkipped} row${totalSkipped !== 1 ? "s" : ""} skipped`
                : undefined,
          });
        } catch (err: any) {
          updateJob(id, {
            status: "failed",
            errors: [...allErrors, err?.message ?? "Unknown error"],
          });
          toast({
            title: `Import failed — ${err?.message ?? "unknown error"}`,
            variant: "destructive",
          });
        }
      })();

      return id;
    },
    [updateJob, toast]
  );

  return createElement(
    ImportQueueContext.Provider,
    { value: { jobs, addJob } },
    children,
    createElement(ImportProgressBar, { jobs })
  );
}
