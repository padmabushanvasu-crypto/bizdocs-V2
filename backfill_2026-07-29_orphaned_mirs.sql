-- Backfill: cancel orphaned pending MIRs whose parent AWO is dead.
--
-- STATUS: EXECUTED ONCE against the live Supabase DB on 2026-07-29.
-- DO NOT RE-RUN. This is a historical record of a one-time production data fix,
-- not a repeatable migration. Re-running is a no-op today (0 pending orphans
-- remain) but is left here for provenance and reversal only.
--
-- Companion to the code/RPC fix in the same commit (Issue Queue excludeDeadAwo
-- filter + rpc_delete_awo MIR cascade). Those stop NEW drift going forward; this
-- cleaned up the 90 pre-existing orphans that accumulated before the cascade.
--
-- REVERSAL HANDLE: every row this touched carries the substring
-- 'backfill 2026-07-29' in its notes. To identify or reverse the affected rows,
-- filter on notes LIKE '%backfill 2026-07-29%'.

-- ── The UPDATE that was run ──────────────────────────────────────────────────
UPDATE material_issue_requests mir
   SET status = 'cancelled',
       notes  = COALESCE(mir.notes || ' | ', '')
                || 'auto-cancelled: parent AWO cancelled/deleted (backfill 2026-07-29)'
  FROM assembly_work_orders awo
 WHERE awo.id = mir.awo_id
   AND mir.company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
   AND mir.status = 'pending'
   AND (awo.deleted_at IS NOT NULL OR awo.status = 'cancelled');

-- ── Verified counts ─────────────────────────────────────────────────────────
-- Rows affected: 90
--
-- material_issue_requests status distribution (this company):
--   status            | before | after
--   ------------------+--------+------
--   pending           |     90 |     0
--   cancelled         |      2 |    92
--   issued            |      4 |     4
--   partially_issued  |      2 |     2
--
-- Note: the 2 partially_issued MIRs against cancelled AWOs were intentionally
-- LEFT untouched by this backfill (status='pending' only) — they have already
-- issued material and need separate WIP reconciliation, not a blind cancel.

-- ── Reversal (if ever needed) ───────────────────────────────────────────────
-- UPDATE material_issue_requests
--    SET status = 'pending',
--        notes  = regexp_replace(
--                   notes,
--                   ' \| auto-cancelled: parent AWO cancelled/deleted \(backfill 2026-07-29\)$',
--                   '')
--  WHERE company_id = '45c14753-4e54-4327-bf77-dd9fb72899dc'
--    AND notes LIKE '%backfill 2026-07-29%';
