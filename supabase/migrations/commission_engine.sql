-- =====================================================
-- Commission Engine — Plans, Earnings & Adjustments
-- 3 new tables + ALTER commission_rules
-- =====================================================

-- ─── Table 1: commission_plans — named plans with effective dating ───
CREATE TABLE IF NOT EXISTS commission_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  effective_start_date date NOT NULL,
  effective_end_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_plans_select" ON commission_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_plans_insert" ON commission_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "commission_plans_update" ON commission_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "commission_plans_delete" ON commission_plans FOR DELETE TO authenticated USING (true);

-- ─── ALTER commission_rules — add plan-based columns ───
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES commission_plans(id) ON DELETE SET NULL;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS participant_role text NOT NULL DEFAULT 'sales_rep';
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS tier_level integer NOT NULL DEFAULT 1;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS trigger_event text NOT NULL DEFAULT 'install';
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS amount_type text NOT NULL DEFAULT 'flat';
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS amount_value numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_commission_rules_plan_id ON commission_rules(plan_id);

-- ─── Table 2: commission_earnings — what someone is owed on a deal ───
CREATE TABLE IF NOT EXISTS commission_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  participant_role text NOT NULL DEFAULT 'sales_rep',
  plan_id uuid REFERENCES commission_plans(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  earning_amount numeric NOT NULL DEFAULT 0,
  earning_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_earnings_deal_id ON commission_earnings(deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_user ON commission_earnings(user_name);
CREATE INDEX IF NOT EXISTS idx_commission_earnings_status ON commission_earnings(earning_status);

ALTER TABLE commission_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_earnings_select" ON commission_earnings FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_earnings_insert" ON commission_earnings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "commission_earnings_update" ON commission_earnings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "commission_earnings_delete" ON commission_earnings FOR DELETE TO authenticated USING (true);

-- ─── Table 3: commission_adjustments — deductions / bonuses for audit ───
CREATE TABLE IF NOT EXISTS commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'bonus',
  reason text,
  amount numeric NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_adjustments_user ON commission_adjustments(user_name);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_deal ON commission_adjustments(deal_id);

ALTER TABLE commission_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_adjustments_select" ON commission_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_adjustments_insert" ON commission_adjustments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "commission_adjustments_update" ON commission_adjustments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "commission_adjustments_delete" ON commission_adjustments FOR DELETE TO authenticated USING (true);
