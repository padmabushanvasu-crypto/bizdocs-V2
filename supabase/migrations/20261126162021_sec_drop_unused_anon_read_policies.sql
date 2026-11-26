-- Security hardening 6/6 — anonymous read only where the OLTC Dashboard needs it.
-- The dashboard (anon key, no login) reads items, stock_ledger, purchase_orders, po_line_items,
-- grn_line_items, dc_line_items (+ delivery_challans via join). It does not read the six tables
-- below (verified in oltc-dashboard electron/services/bizdocs-service.ts, 26 Nov 2026), so their
-- anon policies only exposed vendor/customer, invoice and sales data to anyone with the public key.
-- Remaining anon policies stay until the dashboard signs in with its own account.
-- Inverse: .down.sql
drop policy if exists "OLTC dashboard read" on public.parties;
drop policy if exists "OLTC dashboard read" on public.invoices;
drop policy if exists "OLTC dashboard read" on public.invoice_line_items;
drop policy if exists "OLTC dashboard read" on public.grns;
drop policy if exists "OLTC dashboard read" on public.sale_backflush_lines;
drop policy if exists "OLTC dashboard read" on public.sale_shortfalls;
