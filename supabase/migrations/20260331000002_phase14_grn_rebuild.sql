-- Phase 14: GRN Complete Rebuild
-- Adds grn_type, driver info, linked DC, and two-stage inspection fields

-- ─── GRN header new columns ──────────────────────────────────────────────────

ALTER TABLE grns
  ADD COLUMN IF NOT EXISTS grn_type         TEXT CHECK (grn_type IN ('po_grn', 'dc_grn')) DEFAULT 'po_grn',
  ADD COLUMN IF NOT EXISTS driver_name      TEXT,
  ADD COLUMN IF NOT EXISTS driver_contact   TEXT,
  ADD COLUMN IF NOT EXISTS linked_dc_id     UUID REFERENCES delivery_challans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_dc_number TEXT,
  ADD COLUMN IF NOT EXISTS total_ordered_qty  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_received_qty NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accepted_qty NUMERIC(14,2) DEFAULT 0;

-- ─── GRN line items new columns ──────────────────────────────────────────────

ALTER TABLE grn_line_items
  -- Stage 1: Quantitative / Inward Check
  ADD COLUMN IF NOT EXISTS ordered_qty               NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previously_received_qty   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_now              NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_identity_match       BOOLEAN,
  ADD COLUMN IF NOT EXISTS identity_mismatch_remarks TEXT,
  ADD COLUMN IF NOT EXISTS stage1_checked_by         TEXT,
  ADD COLUMN IF NOT EXISTS stage1_verified_by        TEXT,
  ADD COLUMN IF NOT EXISTS stage1_date               DATE,
  ADD COLUMN IF NOT EXISTS stage1_complete           BOOLEAN DEFAULT FALSE,
  -- Stage 2: Qualitative / QC Inspection
  ADD COLUMN IF NOT EXISTS accepted_qty              NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_qty              NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_method           TEXT CHECK (disposal_method IN ('return_to_vendor','rework','scrap','use_as_is')),
  ADD COLUMN IF NOT EXISTS stage2_inspected_by       TEXT,
  ADD COLUMN IF NOT EXISTS stage2_approved_by        TEXT,
  ADD COLUMN IF NOT EXISTS stage2_date               DATE,
  ADD COLUMN IF NOT EXISTS stage2_complete           BOOLEAN DEFAULT FALSE,
  -- Jig tracking for DC-GRN
  ADD COLUMN IF NOT EXISTS jigs_sent                 JSONB,
  ADD COLUMN IF NOT EXISTS jigs_returned             JSONB;

-- ─── GRN Receipt Events table (optional - V1 placeholder) ────────────────────

CREATE TABLE IF NOT EXISTS grn_receipt_events (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL,
  grn_id         UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  receipt_date   DATE NOT NULL,
  vehicle_number TEXT,
  driver_name    TEXT,
  driver_contact TEXT,
  notes          TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_grns_grn_type        ON grns(grn_type);
CREATE INDEX IF NOT EXISTS idx_grns_linked_dc_id    ON grns(linked_dc_id);
CREATE INDEX IF NOT EXISTS idx_grn_receipt_events_grn ON grn_receipt_events(grn_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
