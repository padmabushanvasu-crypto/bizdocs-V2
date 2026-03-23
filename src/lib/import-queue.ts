import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createElement } from "react";
import { useToast } from "@/hooks/use-toast";
import { ImportProgressBar } from "@/components/ImportProgressBar";
import type { SkipReason } from "@/lib/import-utils";

const LS_KEY = "bizdocs_import_queue";
const BATCH_SIZE = 50;

// ── Public types ───────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;   // rows processed so far
  total: number;      // total rows submitted
  errors: string[];
  skipped: SkipReason[];     // FIX 4: renamed from skipReasons → skipped
  completed: number;  // rows successfully imported
  startedAt: string;  // ISO date string
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
  clearCompleted: () => void;
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
    // FIX 4: Mark any running/queued jobs from last session as failed
    // (page was refreshed mid-import)
    return parsed
      .filter((j) => j.status === "running" || j.status === "queued")
      .map((j) => ({
        ...j,
        status: "failed" as const,
        errors: [
          ...(j.errors ?? []),
          "Import was interrupted — please re-import",
        ],
      }));
  } catch {
    return [];
  }
}

function persistJobs(jobs: ImportJob[]): void {
  try {
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

// ── Provider ───────────────────────────────────────────────────────────────

export function ImportQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ImportJob[]>(() => loadPersistedJobs());
  const { toast } = useToast();

  useEffect(() => {
    persistJobs(jobs);
  }, [jobs]);

  const updateJob = useCallback((id: string, update: Partial<ImportJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...update } : j))
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status !== "completed"));
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
        skipped: [],
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
        const allSkipped: SkipReason[] = [];

        try {
          for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
            const batchRows = rows.slice(offset, offset + BATCH_SIZE);
            const batchNums = rowNums.slice(offset, offset + BATCH_SIZE);

            const res = await importFn(batchRows, batchNums);
            totalImported += res.imported;
            totalSkipped += res.skipped;
            allErrors.push(...res.errors);
            allSkipped.push(...res.skipReasons);

            const progress = Math.min(offset + batchRows.length, rows.length);
            updateJob(id, {
              progress,
              completed: totalImported,
              errors: [...allErrors],
              skipped: [...allSkipped],
            });

            // Yield to the UI thread between batches
            await new Promise<void>((r) => setTimeout(r, 0));
          }

          updateJob(id, { status: "completed" });

          const result = {
            imported: totalImported,
            skipped: totalSkipped,
            errors: allErrors,
            skipReasons: allSkipped,
          };

          callbacks?.onComplete?.(result);
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
    { value: { jobs, addJob, clearCompleted } },
    children,
    createElement(ImportProgressBar, { jobs })
  );
}
