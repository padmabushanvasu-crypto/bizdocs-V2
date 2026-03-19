-- Phase 9: Sales Orders & Dispatch Notes
-- Tables: sales_orders, so_line_items, dispatch_notes, dn_line_items, packing_list_items

-- ─── TABLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  so_number            TEXT NOT NULL DEFAULT '',
  so_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id          UUID REFERENCES public.parties(id),
  customer_name        TEXT,
  customer_address     TEXT,
  customer_gstin       TEXT,
  customer_state_code  TEXT,
  customer_phone       TEXT,
  billing_address      TEXT,
  shipping_address     TEXT,
  reference_number     TEXT,
  priority             TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  delivery_date        DATE,
  payment_terms        TEXT,
  special_instructions TEXT,
  internal_remarks     TEXT,
  sub_total            NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxable_value        NUMERIC(15,2) NOT NULL DEFAULT 0,
  cgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_gst            NUMERIC(15,2) NOT NULL DEFAULT 0,
  grand_total          NUMERIC(15,2) NOT NULL DEFAULT 0,
  gst_rate             NUMERIC(5,2)  NOT NULL DEFAULT 18,
  status               TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'in_production', 'dispatched', 'invoiced', 'cancelled')),
  confirmed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.so_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  so_id         UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  serial_number INTEGER NOT NULL,
  item_id       UUID REFERENCES public.items(id),
  item_code     TEXT,
  description   TEXT NOT NULL DEFAULT '',
  hsn_sac_code  TEXT,
  unit          TEXT NOT NULL DEFAULT 'NOS',
  quantity      NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  gst_rate      NUMERIC(5,2)  NOT NULL DEFAULT 18,
  line_total    NUMERIC(15,2) NOT NULL DEFAULT 0,
  delivery_date DATE,
  remarks       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispatch_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dn_number            TEXT NOT NULL DEFAULT '',
  dn_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  so_id                UUID REFERENCES public.sales_orders(id),
  so_number            TEXT,
  customer_id          UUID REFERENCES public.parties(id),
  customer_name        TEXT,
  customer_address     TEXT,
  customer_gstin       TEXT,
  customer_state_code  TEXT,
  shipping_address     TEXT,
  vehicle_number       TEXT,
  driver_name          TEXT,
  transporter          TEXT,
  lr_number            TEXT,
  lr_date              DATE,
  reference_number     TEXT,
  special_instructions TEXT,
  internal_remarks     TEXT,
  sub_total            NUMERIC(15,2) NOT NULL DEFAULT 0,
  cgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_gst            NUMERIC(15,2) NOT NULL DEFAULT 0,
  grand_total          NUMERIC(15,2) NOT NULL DEFAULT 0,
  gst_rate             NUMERIC(5,2)  NOT NULL DEFAULT 18,
  status               TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'cancelled')),
  issued_at            TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dn_line_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dn_id              UUID NOT NULL REFERENCES public.dispatch_notes(id) ON DELETE CASCADE,
  serial_number      INTEGER NOT NULL,
  item_code          TEXT,
  description        TEXT NOT NULL DEFAULT '',
  unit               TEXT NOT NULL DEFAULT 'NOS',
  quantity           NUMERIC(15,3) NOT NULL DEFAULT 1,
  rate               NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount             NUMERIC(15,2) NOT NULL DEFAULT 0,
  serial_number_ref  TEXT,
  remarks            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.packing_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dn_id         UUID NOT NULL REFERENCES public.dispatch_notes(id) ON DELETE CASCADE,
  serial_number INTEGER NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  quantity      NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit          TEXT NOT NULL DEFAULT 'NOS',
  weight_kg     NUMERIC(10,3),
  dimensions    TEXT,
  box_number    TEXT,
  remarks       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUTO-NUMBERING: SO-YY-YY-NNN ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_so_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year     INTEGER;
  v_month    INTEGER;
  v_fy       TEXT;
  v_next_seq INTEGER;
BEGIN
  IF NEW.so_number IS NOT NULL AND NEW.so_number != '' THEN
    RETURN NEW;
  END IF;
  v_year  := EXTRACT(YEAR  FROM CURRENT_DATE)::INTEGER;
  v_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
  IF v_month >= 4 THEN
    v_fy := LPAD((v_year % 100)::TEXT, 2, '0') || '-' || LPAD(((v_year + 1) % 100)::TEXT, 2, '0');
  ELSE
    v_fy := LPAD(((v_year - 1) % 100)::TEXT, 2, '0') || '-' || LPAD((v_year % 100)::TEXT, 2, '0');
  END IF;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(so_number, '-', 4) AS INTEGER)), 0) + 1
    INTO v_next_seq
    FROM public.sales_orders
   WHERE so_number LIKE 'SO-' || v_fy || '-%'
     AND company_id = NEW.company_id;
  NEW.so_number := 'SO-' || v_fy || '-' || LPAD(v_next_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_so_number ON public.sales_orders;
CREATE TRIGGER trg_generate_so_number
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_so_number();

-- ─── AUTO-NUMBERING: DN-YY-YY-NNN ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_dn_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year     INTEGER;
  v_month    INTEGER;
  v_fy       TEXT;
  v_next_seq INTEGER;
BEGIN
  IF NEW.dn_number IS NOT NULL AND NEW.dn_number != '' THEN
    RETURN NEW;
  END IF;
  v_year  := EXTRACT(YEAR  FROM CURRENT_DATE)::INTEGER;
  v_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
  IF v_month >= 4 THEN
    v_fy := LPAD((v_year % 100)::TEXT, 2, '0') || '-' || LPAD(((v_year + 1) % 100)::TEXT, 2, '0');
  ELSE
    v_fy := LPAD(((v_year - 1) % 100)::TEXT, 2, '0') || '-' || LPAD((v_year % 100)::TEXT, 2, '0');
  END IF;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(dn_number, '-', 4) AS INTEGER)), 0) + 1
    INTO v_next_seq
    FROM public.dispatch_notes
   WHERE dn_number LIKE 'DN-' || v_fy || '-%'
     AND company_id = NEW.company_id;
  NEW.dn_number := 'DN-' || v_fy || '-' || LPAD(v_next_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_dn_number ON public.dispatch_notes;
CREATE TRIGGER trg_generate_dn_number
  BEFORE INSERT ON public.dispatch_notes
  FOR EACH ROW EXECUTE FUNCTION public.generate_dn_number();

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_so_updated_at ON public.sales_orders;
CREATE TRIGGER trg_so_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dn_updated_at ON public.dispatch_notes;
CREATE TRIGGER trg_dn_updated_at
  BEFORE UPDATE ON public.dispatch_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE public.sales_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.so_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dn_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_orders_company"       ON public.sales_orders;
DROP POLICY IF EXISTS "so_line_items_company"      ON public.so_line_items;
DROP POLICY IF EXISTS "dispatch_notes_company"     ON public.dispatch_notes;
DROP POLICY IF EXISTS "dn_line_items_company"      ON public.dn_line_items;
DROP POLICY IF EXISTS "packing_list_items_company" ON public.packing_list_items;

CREATE POLICY "sales_orders_company" ON public.sales_orders
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "so_line_items_company" ON public.so_line_items
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "dispatch_notes_company" ON public.dispatch_notes
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "dn_line_items_company" ON public.dn_line_items
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "packing_list_items_company" ON public.packing_list_items
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_id   ON public.sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status       ON public.sales_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer     ON public.sales_orders(company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_so_line_items_so_id       ON public.so_line_items(so_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_notes_company_id ON public.dispatch_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_notes_status     ON public.dispatch_notes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_notes_so_id      ON public.dispatch_notes(so_id);
CREATE INDEX IF NOT EXISTS idx_dn_line_items_dn_id       ON public.dn_line_items(dn_id);
CREATE INDEX IF NOT EXISTS idx_packing_list_dn_id        ON public.packing_list_items(dn_id);
