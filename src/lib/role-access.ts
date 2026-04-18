// ── Role-Based Access Control ─────────────────────────────────────────────────
// Single source of truth for all role-based access in BizDocs.
// Session 1: canView (sidebar + route guard)
// Session 2: hideCosts (column hiding)
// Session 3: canExport (export button)
// canEdit is reserved for future enforcement.

export type AppRole =
  | 'admin'
  | 'purchase_team'
  | 'inward_team'
  | 'qc_team'
  | 'storekeeper'
  | 'assembly_team'
  | 'finance';

export type PageAccess = {
  canView: boolean;
  canEdit: boolean;     // can create / edit / delete
  canExport: boolean;   // export button visible
  hideCosts: boolean;   // hide price / cost columns
};

const NO_ACCESS: PageAccess   = { canView: false, canEdit: false, canExport: false, hideCosts: false };
const FULL_ACCESS: PageAccess = { canView: true,  canEdit: true,  canExport: true,  hideCosts: false };

// ── Per-role access maps ───────────────────────────────────────────────────────

const PURCHASE_TEAM_MAP: Record<string, PageAccess> = {
  'dashboard':            { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'reorder-intelligence': { canView: true,  canEdit: true,  canExport: false, hideCosts: true  },
  'purchase-orders':      { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'follow-up-tracker':    { canView: true,  canEdit: true,  canExport: false, hideCosts: false },
  'vendor-scorecards':    { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'dc-grn':               { canView: true,  canEdit: true,  canExport: false, hideCosts: true  },
  'delivery-challans':    { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'grn':                  { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'stock-register':       { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'stock-ledger':         { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'dispatch-records':     { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'invoices':             { canView: true,  canEdit: false, canExport: false, hideCosts: false },
  'items':                { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'parties':              { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'sales-orders':         { canView: true,  canEdit: false, canExport: false, hideCosts: false },
  'receipts':             { canView: true,  canEdit: false, canExport: false, hideCosts: false },
  'open-items':           { canView: true,  canEdit: false, canExport: false, hideCosts: false },
  'reorder-rules':        { canView: true,  canEdit: false, canExport: false, hideCosts: false },
};

const INWARD_TEAM_MAP: Record<string, PageAccess> = {
  'dashboard':          { canView: true,  canEdit: false, canExport: false, hideCosts: true },
  'follow-up-tracker':  { canView: true,  canEdit: true,  canExport: false, hideCosts: true },
  'delivery-challans':  { canView: true,  canEdit: true,  canExport: false, hideCosts: false },
  'grn':                { canView: true,  canEdit: true,  canExport: false, hideCosts: true },
  'dc-grn':             { canView: true,  canEdit: true,  canExport: false, hideCosts: true },
  'job-works':          { canView: true,  canEdit: false, canExport: false, hideCosts: true },
  'stock-register':     { canView: true,  canEdit: false, canExport: false, hideCosts: true },
  'stock-ledger':       { canView: true,  canEdit: false, canExport: false, hideCosts: true },
  'items':              { canView: true,  canEdit: false, canExport: false, hideCosts: true },
};

const QC_TEAM_MAP: Record<string, PageAccess> = {
  'dashboard':                  { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'grn':                        { canView: true,  canEdit: true,  canExport: false, hideCosts: true  },
  'job-works':                  { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'finished-good-work-orders':  { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'wip-register':               { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'serial-numbers':             { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'fat-certificates':           { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'scrap-register':             { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'ready-to-dispatch':          { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'items':                      { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
};

const STOREKEEPER_MAP: Record<string, PageAccess> = {
  // ── Pages storekeeper can access — all with hideCosts: true ──────────────
  'dashboard':         { canView: true, canEdit: false, canExport: false, hideCosts: true },
  'storekeeper':       { canView: true, canEdit: true,  canExport: true,  hideCosts: true },
  'storekeeper-queue': { canView: true, canEdit: true,  canExport: true,  hideCosts: true },
  'stock-register':    { canView: true, canEdit: false, canExport: false, hideCosts: true },
  'stock-ledger':      { canView: true, canEdit: false, canExport: false, hideCosts: true },
  'items':             { canView: true, canEdit: false, canExport: false, hideCosts: true },
  // All other pages return NO_ACCESS via fallback
};

const ASSEMBLY_TEAM_MAP: Record<string, PageAccess> = {
  'dashboard':                  { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'reorder-intelligence':       { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'delivery-challans':          { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'job-works':                  { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'wip-register':               { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'sub-assembly-work-orders':   { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'finished-good-work-orders':  { canView: true,  canEdit: true,  canExport: true,  hideCosts: false },
  'stock-register':             { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'serial-numbers':             { canView: true,  canEdit: false, canExport: true,  hideCosts: false },
  'fat-certificates':           { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'ready-to-dispatch':          { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'items':                      { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
  'bill-of-materials':          { canView: true,  canEdit: true,  canExport: false, hideCosts: true  },
  'jig-master':                 { canView: true,  canEdit: false, canExport: false, hideCosts: true  },
};

const ROLE_MAPS: Record<Exclude<AppRole, 'admin' | 'finance'>, Record<string, PageAccess>> = {
  purchase_team: PURCHASE_TEAM_MAP,
  inward_team:   INWARD_TEAM_MAP,
  qc_team:       QC_TEAM_MAP,
  storekeeper:   STOREKEEPER_MAP,
  assembly_team: ASSEMBLY_TEAM_MAP,
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getRoleAccess(role: AppRole, page: string): PageAccess {
  // Admin and Finance have full access to everything
  if (role === 'admin' || role === 'finance') return FULL_ACCESS;

  const map = ROLE_MAPS[role as Exclude<AppRole, 'admin' | 'finance'>];
  if (!map) return NO_ACCESS;

  return map[page] ?? NO_ACCESS;
}
