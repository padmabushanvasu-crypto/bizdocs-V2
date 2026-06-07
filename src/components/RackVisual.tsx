import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MapPin, PackageOpen } from "lucide-react";

const SHELF_COUNT = 6;

/**
 * Generic, illustrative rack — NOT the real floor layout. A vertical stack of
 * SHELF_COUNT shelves labelled top→bottom. Highlights the shelf that matches the
 * item's `shelf` value:
 *  - leading integer in [1, SHELF_COUNT] → glow/pulse that drawn shelf
 *  - non-numeric or out-of-range → a labelled highlighted tag (still clickable)
 * Tolerates messy/empty shelf values without crashing.
 */
export function RackVisual({
  rack,
  shelf,
  onOpenDetail,
  onSetLocation,
}: {
  rack: string | null;
  shelf: string | null;
  onOpenDetail?: () => void;
  onSetLocation?: () => void;
}) {
  const placed = !!(rack || shelf);

  // ── Unplaced: greyed rack + prompt ──────────────────────────────────────────
  if (!placed) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:bg-slate-800/40 p-6 text-center">
        <PackageOpen className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Not placed yet</p>
        <p className="text-xs text-slate-400 mb-3">This item has no storage location.</p>
        {onSetLocation && (
          <Button size="sm" onClick={onSetLocation}>
            <MapPin className="h-3.5 w-3.5 mr-1.5" /> Set location
          </Button>
        )}
        {/* Greyed shelves for context */}
        <div className="mt-4 mx-auto max-w-[220px] space-y-1 opacity-50">
          {Array.from({ length: SHELF_COUNT }).map((_, i) => (
            <div key={i} className="h-7 rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      </div>
    );
  }

  // Parse the leading integer of the shelf string.
  const m = (shelf ?? "").match(/^\s*(\d+)/);
  const shelfNum = m ? parseInt(m[1], 10) : null;
  const matchesDrawnShelf = shelfNum != null && shelfNum >= 1 && shelfNum <= SHELF_COUNT;

  // Render shelves top→bottom: Shelf N (top) … Shelf 1 (bottom).
  const shelves = Array.from({ length: SHELF_COUNT }, (_, i) => SHELF_COUNT - i);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rack {rack || "—"}
        </span>
        <span className="text-[10px] text-slate-400">illustrative — not the floor map</span>
      </div>

      <div className="mx-auto max-w-[260px] rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 p-2 space-y-1.5">
        {shelves.map((n) => {
          const isMatch = matchesDrawnShelf && n === shelfNum;
          return (
            <button
              key={n}
              type="button"
              disabled={!isMatch}
              onClick={isMatch ? onOpenDetail : undefined}
              className={cn(
                "w-full h-9 rounded flex items-center justify-between px-3 text-xs transition-colors",
                isMatch
                  ? "bg-blue-500 text-white font-semibold ring-2 ring-blue-300 ring-offset-1 animate-pulse cursor-pointer shadow"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
              )}
              title={isMatch ? "Open location details & history" : undefined}
            >
              <span>Shelf {n}</span>
              {isMatch && <MapPin className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Non-numeric / out-of-range shelf → highlighted, clickable tag. */}
      {!matchesDrawnShelf && (
        <button
          type="button"
          onClick={onOpenDetail}
          className="mt-3 w-full rounded-lg border-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-left transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer"
          title="Open location details & history"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Shelf</span>
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {shelf || "—"}
          </p>
        </button>
      )}
    </div>
  );
}
