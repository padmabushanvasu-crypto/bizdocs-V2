# Live-applied migrations, 25–26 Nov 2026 (not yet exported as .sql)

Applied through the Supabase MCP `apply_migration`; full SQL is stored in
`supabase_migrations.schema_migrations.statements` for each version below.
Export with:

```sql
select version, name, array_to_string(statements, E';\n\n')
from supabase_migrations.schema_migrations
where version between '20261125000000' and '20261126235959' order by version;
```

| Version | Name | What it does |
|---|---|---|
| 20261125032727 | grn_line_settles_when_drawn_elsewhere | GRN line closes when store + damaged + drawn covers it; settle/reopen triggers on all four allocation tables; `grn_settle_log` |
| 20261125032734 | front_plate_trio_like_for_like_mappings | 230272 K-R3 / 230196-R3 / 230197-R4 receivable as each other |
| 20261125032741 | backfill_settle_grn_lines_drawn_elsewhere | Closed 165 stuck lines / 90 GRNs |
| 20261125100818 | phase_board_33kv_bom_parts_a_to_f | 33 KV 9/17 POS phase board BOMs: lump 230382 x11 → parts A–F |
| 20261125112352 | correct_awo_grn_held_overdraws_and_in_process | Reversed 7 WO GRN-held draws posted NULL→free; re-posted used qty in_process→free; released 18 + 8 over-drawn |
| 20261125113040 | awo_grn_held_draw_only_needed_qty_and_relieve_in_process | WO draws `qty − max(Store,0)`; WO/job-card draws post in_process→free |
| 20261126062000 | awo_draws_only_finished_parts_route_aware | `_grn_line_route_position`; WOs draw finished GRN-held parts only |
| 20261126062055 | grn_next_action_shows_next_route_process | View: `route_next_process`, `route_finished`, "Not finished — still needs …" message |
| 20261126062117 | grn_next_action_message_wording | Message wording |
| (26 Nov) | undo_awo_draws_of_unfinished_parts_grn_3050_3051_3052 | WO-669 returned 34 unfinished 230248 BR; draws on GRN-3050/3051/3052 released |
| (26 Nov) | v_item_grn_held_finished_split | Per-item GRN-held view (finished / not finished) for Stock Register and MIR |

Rules these implement: STOCK_LIFECYCLE_GOVERNANCE.md §2 Stage B2.
