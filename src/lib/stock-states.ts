// Canonical stock states for stock_ledger from_state / to_state.
//
// Each non-terminal state maps 1:1 to an items.* bucket column. Source/terminal
// states (INCOMING, CONSUMED, SCRAPPED, DISPATCHED) have no bucket — stock
// either enters from outside (INCOMING) or leaves the on-hand model entirely.
//
// These are the ONLY values that should appear in from_state/to_state on new
// postings, so a per-state ledger balance (free vs in_process vs wip …) is
// computable. Values are chosen to match the existing live data where it was
// already correct (free, in_process, incoming, consumed, scrapped, dispatched,
// in_subassembly_wip, in_fg_wip, in_fg_ready) so no historical backfill is needed.
export const STOCK_STATE = {
  INCOMING: 'incoming',                 // pre-acceptance — no bucket
  FREE: 'free',                         // -> stock_free (issuable)
  IN_PROCESS: 'in_process',             // -> stock_in_process (at vendor / job-work)
  SUBASSEMBLY_WIP: 'in_subassembly_wip',// -> stock_in_subassembly_wip
  FG_WIP: 'in_fg_wip',                  // -> stock_in_fg_wip
  FG_READY: 'in_fg_ready',              // -> stock_in_fg_ready
  CONSUMED: 'consumed',                 // terminal — no bucket
  SCRAPPED: 'scrapped',                 // terminal — no bucket
  DISPATCHED: 'dispatched',             // terminal — no bucket
} as const;

export type StockState = typeof STOCK_STATE[keyof typeof STOCK_STATE];

// Canonical state -> items bucket column (null = source/terminal, no bucket).
export const STATE_BUCKET: Record<StockState, string | null> = {
  incoming: null,
  free: 'stock_free',
  in_process: 'stock_in_process',
  in_subassembly_wip: 'stock_in_subassembly_wip',
  in_fg_wip: 'stock_in_fg_wip',
  in_fg_ready: 'stock_in_fg_ready',
  consumed: null,
  scrapped: null,
  dispatched: null,
};
