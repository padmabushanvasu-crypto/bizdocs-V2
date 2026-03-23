import { useEffect, useState } from "react";
import type { ImportJob } from "@/lib/import-queue";

// FIX 5 — Progress bar shown at bottom of screen while imports are running or queued.
// Auto-hides 5 seconds after all complete.
export function ImportProgressBar({ jobs }: { jobs: ImportJob[] }) {
  const activeJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  );
  const completedJobs = jobs.filter((j) => j.status === "completed");

  // Track which completed job IDs have been auto-hidden
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const completedKey = completedJobs.map((j) => j.id).join(",");
  useEffect(() => {
    if (completedJobs.length === 0) return;
    const ids = completedJobs.map((j) => j.id);
    const timer = setTimeout(() => {
      setHiddenIds((prev) => new Set([...prev, ...ids]));
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKey]);

  const visibleCompleted = completedJobs.filter((j) => !hiddenIds.has(j.id));

  if (activeJobs.length === 0 && visibleCompleted.length === 0) return null;

  // ── Completed state (green, auto-hides after 5s) ──────────────────────────
  if (activeJobs.length === 0 && visibleCompleted.length > 0) {
    const last = visibleCompleted[visibleCompleted.length - 1];
    return (
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-green-600 text-white text-sm shadow-lg">
        <div className="flex items-center px-4 py-2 max-w-4xl mx-auto">
          <span>✓ {last.type} import complete — {last.completed} imported</span>
        </div>
      </div>
    );
  }

  // ── Active import state ────────────────────────────────────────────────────
  let message = "";
  let progressPct = 0;

  if (activeJobs.length > 1) {
    message = `⟳ ${activeJobs.length} imports running`;
    const totalProgress = activeJobs.reduce((s, j) => s + j.progress, 0);
    const totalRows = activeJobs.reduce((s, j) => s + j.total, 0);
    progressPct = totalRows > 0 ? (totalProgress / totalRows) * 100 : 0;
  } else {
    const j = activeJobs[0];
    message = `⟳ Importing ${j.type} — ${j.completed} / ${j.total}`;
    progressPct = j.total > 0 ? (j.progress / j.total) * 100 : 0;
  }

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-blue-600 text-white text-sm shadow-lg">
      {/* Thin progress track */}
      <div className="h-0.5 bg-blue-500">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: `${Math.min(progressPct, 100)}%` }}
        />
      </div>
      <div className="flex items-center px-4 py-2 max-w-4xl mx-auto">
        <span>{message}</span>
      </div>
    </div>
  );
}
