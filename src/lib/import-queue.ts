import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createElement } from "react";
import { useToast } from "@/hooks/use-toast";
import { ImportProgressBar } from "@/components/ImportProgressBar";
import type { SkipReason } from "@/lib/import-utils";

const LS_KEY = "bizdocs_import_queue";
const BATCH_SIZE = 500;

// ── Public types ───────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  type: string;
  // Runtime fields — stored in state but NOT persisted to localStorage
  // (functions can't be JSON-serialised; rows are too large to persist)
  rows?: Record<string, string>[];
  rowNums?: number[];
  processBatch?: BatchImportFn;
  callbacks?: AddJobCallbacks;
  // Persisted fields
  status: "queued" | "running" | "completed" | "failed";
  progress: number;   // rows processed so far
  total: number;      // total rows submitted
  errors: string[];
  skipped: SkipReason[];
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
  updated?: number;
}>;

interface AddJobCallbacks {
  onComplete?: (result: {
    imported: number;
    skipped: number;
    errors: string[];
    skipReasons: SkipReason[];
    updated?: number;
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
    // Mark any running/queued jobs from last session as failed
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
      // Strip non-serialisable/large fields before persisting
      const toSave = active.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ rows, rowNums, processBatch, callbacks, ...rest }) => rest
      );
      localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    }
  } catch {
    // Ignore QuotaExceededError
  }
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ImportQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ImportJob[]>(() => loadPersistedJobs());
  const { toast } = useToast();

  // Keep a ref to the latest jobs array so processNextJob can read it
  // without capturing stale state in its closure
  const jobsRef = useRef<ImportJob[]>(jobs);
  jobsRef.current = jobs;

  // Guard: only one job runs at a time
  const processingRef = useRef(false);

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

  // ── Processing loop — lives in the Provider so it survives navigation ──

  const processNextJob = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Read latest jobs from ref (avoids stale closure over jobs state)
      const job = jobsRef.current.find((j) => j.status === "queued");
      if (!job) return;

      updateJob(job.id, { status: "running" });

      let totalImported = 0;
      let totalUpdated = 0;
      const allErrors: string[] = [];
      const allSkipped: SkipReason[] = [];

      const rows = job.rows ?? [];
      const rowNums = job.rowNums ?? [];

      for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        const batchRows = rows.slice(offset, offset + BATCH_SIZE);
        const batchNums = rowNums.slice(offset, offset + BATCH_SIZE);

        try {
          const res = await job.processBatch!(batchRows, batchNums);
          totalImported += res.imported;
          if (res.updated) totalUpdated += res.updated;
          allErrors.push(...res.errors);
          allSkipped.push(...res.skipReasons);
        } catch (err: any) {
          allErrors.push(err?.message ?? "Unknown error");
        }

        const done = Math.min(offset + BATCH_SIZE, rows.length);
        updateJob(job.id, {
          progress: done,
          completed: totalImported,
          errors: [...allErrors],
          skipped: [...allSkipped],
        });

        // Yield to browser between batches so the UI stays responsive
        await new Promise<void>((r) => setTimeout(r, 10));
      }

      updateJob(job.id, {
        status: "completed",
        completed: totalImported,
        progress: rows.length,
      });

      // Fire the onComplete callback (e.g. to update page UI or invalidate queries)
      const callbackResult = {
        imported: totalImported,
        skipped: allSkipped.length,
        errors: allErrors,
        skipReasons: allSkipped,
        ...(totalUpdated > 0 ? { updated: totalUpdated } : {}),
      };
      job.callbacks?.onComplete?.(callbackResult);

      // Show completion toast — fires on every page since Provider is always mounted
      toast({
        title: `${job.type} import complete`,
        description: `${totalImported} of ${rows.length} rows imported successfully`,
      });

    } catch (err: any) {
      // Mark the running job as failed
      const runningJob = jobsRef.current.find((j) => j.status === "running");
      if (runningJob) {
        updateJob(runningJob.id, {
          status: "failed",
          errors: [err?.message ?? "Unknown error"],
        });
        toast({
          title: `${runningJob.type} import failed`,
          description: err?.message ?? "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      processingRef.current = false;
      // No recursive setTimeout needed — the useEffect below restarts the
      // loop whenever jobs state changes (e.g. after updateJob marks a job
      // completed, or when a new job is added)
    }
  }, [updateJob, toast]); // stable — reads jobs via jobsRef, not state

  // Start processing whenever a queued job appears
  useEffect(() => {
    const hasQueued = jobs.some((j) => j.status === "queued");
    if (hasQueued && !processingRef.current) {
      processNextJob();
    }
  }, [jobs, processNextJob]);

  // ── addJob — just enqueues; the useEffect above starts processing ──

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
        rows,
        rowNums,
        processBatch: importFn,
        callbacks,
        status: "queued",
        progress: 0,
        total: rows.length,
        errors: [],
        skipped: [],
        completed: 0,
        startedAt: new Date().toISOString(),
      };
      setJobs((prev) => [...prev, job]);
      return id;
    },
    []
  );

  return createElement(
    ImportQueueContext.Provider,
    { value: { jobs, addJob, clearCompleted } },
    children,
    createElement(ImportProgressBar, { jobs })
  );
}
