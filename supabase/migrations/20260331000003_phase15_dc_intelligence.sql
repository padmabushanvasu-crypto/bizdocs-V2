-- Phase 15: DC Intelligence and BOM-Driven Staging
-- ─────────────────────────────────────────────────

-- 1. Processing routes per item (maps each item's stages)
CREATE TABLE IF NOT EXISTS bom_processing_routes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage_number    integer NOT NULL,
  process_code    text,
  process_name    text NOT NULL,
  stage_type      text NOT NULL DEFAULT 'external' CHECK (stage_type IN ('internal', 'external')),
  lead_time_days  integer NOT NULL DEFAULT 7,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_id, stage_number)
);

CREATE INDEX IF NOT EXISTS bom_processing_routes_item_id ON bom_processing_routes(item_id);
CREATE INDEX IF NOT EXISTS bom_processing_routes_company_id ON bom_processing_routes(company_id);

-- 2. Approved vendors per processing route stage
CREATE TABLE IF NOT EXISTS bpr_vendors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  route_id     uuid NOT NULL REFERENCES bom_processing_routes(id) ON DELETE CASCADE,
  vendor_id    uuid REFERENCES parties(id) ON DELETE SET NULL,
  vendor_name  text,
  is_preferred boolean NOT NULL DEFAULT false,
  unit_cost    numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS bpr_vendors_route_id ON bpr_vendors(route_id);

-- 3. Jig Master
CREATE TABLE IF NOT EXISTS jig_master (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  drawing_number     text NOT NULL,
  jig_number         text NOT NULL,
  status             text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'to_be_made', 'in_progress', 'damaged')),
  associated_process text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jig_master_company_id ON jig_master(company_id);
CREATE INDEX IF NOT EXISTS jig_master_drawing_number ON jig_master(drawing_number);

-- 4. Add new columns to dc_line_items for route tracking and jig dispatch
ALTER TABLE dc_line_items
  ADD COLUMN IF NOT EXISTS total_stages  integer,
  ADD COLUMN IF NOT EXISTS route_id      uuid REFERENCES bom_processing_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jigs_sent     jsonb,
  ADD COLUMN IF NOT EXISTS item_id       uuid REFERENCES items(id) ON DELETE SET NULL;

-- 5. Add new columns to grn_line_items for jig return tracking
ALTER TABLE grn_line_items
  ADD COLUMN IF NOT EXISTS jigs_returned jsonb,
  ADD COLUMN IF NOT EXISTS item_id       uuid REFERENCES items(id) ON DELETE SET NULL;

-- 6. RLS policies for bom_processing_routes
ALTER TABLE bom_processing_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_bom_processing_routes"
  ON bom_processing_routes
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

-- 7. RLS policies for bpr_vendors
ALTER TABLE bpr_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_bpr_vendors"
  ON bpr_vendors
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

-- 8. RLS policies for jig_master
ALTER TABLE jig_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_jig_master"
  ON jig_master
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));
