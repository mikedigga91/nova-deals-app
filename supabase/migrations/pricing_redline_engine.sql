-- =====================================================
-- Pricing / Redline Engine — Full Schema Migration
-- 5 new tables + 2 ALTER columns on deals + deals_view
-- =====================================================

-- ─── Table 1: adder_catalog — master list of adder types ───
CREATE TABLE IF NOT EXISTS adder_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  default_unit_price numeric NOT NULL DEFAULT 0,
  unit_label text NOT NULL DEFAULT 'per unit',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adder_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adder_catalog_select" ON adder_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "adder_catalog_insert" ON adder_catalog FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "adder_catalog_update" ON adder_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adder_catalog_delete" ON adder_catalog FOR DELETE TO authenticated USING (true);

-- ─── Table 2: deal_adders — itemized adders per deal ───
CREATE TABLE IF NOT EXISTS deal_adders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  adder_catalog_id uuid REFERENCES adder_catalog(id) ON DELETE SET NULL,
  adder_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_adders_deal_id ON deal_adders(deal_id);

ALTER TABLE deal_adders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deal_adders_select" ON deal_adders FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_adders_insert" ON deal_adders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "deal_adders_update" ON deal_adders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deal_adders_delete" ON deal_adders FOR DELETE TO authenticated USING (true);

-- ─── Table 3: pricing_rules — admin-editable with effective dating ───
CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'base',
  state text,
  install_partner text,
  team text,
  base_ppw numeric,
  redline_ppw numeric,
  target_margin_pct numeric,
  max_agent_cost_basis numeric,
  effective_start date NOT NULL,
  effective_end date,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_rules_select" ON pricing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing_rules_insert" ON pricing_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pricing_rules_update" ON pricing_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pricing_rules_delete" ON pricing_rules FOR DELETE TO authenticated USING (true);

-- ─── Table 4: commission_rules — per rep/team/installer rates ───
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sales_rep text,
  team text,
  install_partner text,
  state text,
  agent_commission_pct numeric,
  agent_flat_amount numeric,
  manager_commission_pct numeric,
  manager_flat_amount numeric,
  company_margin_pct numeric,
  setter_commission_pct numeric,
  setter_flat_amount numeric,
  commission_basis text NOT NULL DEFAULT 'contract_value',
  effective_start date NOT NULL,
  effective_end date,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_rules_select" ON commission_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "commission_rules_insert" ON commission_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "commission_rules_update" ON commission_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "commission_rules_delete" ON commission_rules FOR DELETE TO authenticated USING (true);

-- ─── Table 5: deal_pricing_snapshot — locks pricing at deal signing ───
CREATE TABLE IF NOT EXISTS deal_pricing_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  pricing_rule_id uuid REFERENCES pricing_rules(id) ON DELETE SET NULL,
  commission_rule_id uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  base_ppw numeric,
  redline_ppw numeric,
  net_ppw numeric,
  agent_cost_basis numeric,
  contract_value numeric,
  total_adders numeric,
  contract_net_price numeric,
  agent_commission_pct numeric,
  agent_payout_amount numeric,
  manager_commission_pct numeric,
  manager_payout_amount numeric,
  margin_pct numeric,
  gross_profit numeric,
  adders_snapshot jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lock_reason text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_current ON deal_pricing_snapshot(deal_id) WHERE is_current = true;

ALTER TABLE deal_pricing_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deal_pricing_snapshot_select" ON deal_pricing_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_pricing_snapshot_insert" ON deal_pricing_snapshot FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "deal_pricing_snapshot_update" ON deal_pricing_snapshot FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deal_pricing_snapshot_delete" ON deal_pricing_snapshot FOR DELETE TO authenticated USING (true);

-- ─── ALTER deals table — add pricing lock columns ───
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pricing_locked boolean NOT NULL DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pricing_locked_at timestamptz;

-- ─── Recreate deals_view to include pricing_locked columns ───
-- Must DROP + CREATE because adding columns changes the column list
DROP VIEW IF EXISTS deals_view;
CREATE VIEW deals_view AS
SELECT
  d.id,
  d.created_at,
  d.sales_rep,
  d.company,
  d.customer_name,
  d.appointment_setter,
  d.call_center_appointment_setter,
  d.company_barayev_input,
  d.kw_system,
  d.agent_cost_basis,
  d.agent_cost_basis_sold_at,
  d.net_price_per_watt,
  d.date_closed,
  d.contract_value,
  d.total_adders,
  d.contract_net_price,
  d.rev,
  d.gross_profit,
  d.visionary_paid_out_commission,
  d.nova_nrg_customer_adders,
  d.agent_payout,
  d.manager,
  d.manager_amount,
  d.status,
  d.p1_nova_nrg_paid,
  d.site_survey_date_completed,
  d.site_survey_status,
  d.owed_money,
  d.paid_bonus,
  d.fee_charges,
  d.notes,
  d.paid_nova_nrg_rev_date,
  d.paid_nova_nrg_rev,
  d.sales_partner_redline,
  d.sales_redline_contract,
  d.install_partner,
  d.state,
  d.teams,
  d.activated,
  d.online_deal,
  d.call_center_lead,
  d.month_year,
  d.commission_structure,
  d.paid_nova_nrg_p1_date,
  d.paid_nova_nrg_p1_amount,
  d.revenue,
  d.paid_nova_nrg_p2_rev_date,
  d.paid_nova_nrg_p1_p2_rev_amount,
  d.paid_nova_nrg_post_p2_date,
  d.paid_nova_nrg_post_p2_rev_amount,
  d.nova_nrg_reversal_date,
  d.nova_nrg_reversal_amount,
  d.nova_nrg_fee_amount,
  d.paid_visionary_p1_date,
  d.paid_visionary_p1_amount,
  d.visionary_revenue,
  d.paid_visionary_p2_date,
  d.paid_visionary_p1_p2_amount,
  d.paid_visionary_post_p2_date,
  d.paid_visionary_post_p2_amount,
  d.p1_visionary_reversal_date,
  d.p1_visionary_reversal_amount,
  d.visionary_fee_amount,
  d.paid_agent_p1_date,
  d.paid_agent_p1_amount,
  d.agent_pay,
  d.paid_agent_p2_date,
  d.paid_agent_p1_p2_amount,
  d.paid_agent_post_p2_date,
  d.paid_agent_post_p2_amount,
  d.p1_agent_reversal_date,
  d.p1_agent_reversal_amount,
  d.agent_fee_amount,
  d.agent_net_price,
  d.only_agent_net_price_accounts,
  d.agent_payout_tableau,
  d.setter,
  d.opportunity,
  d.setter_paid_date,
  d.manager_paid_date,
  d.nova_nrg_rev_after_fee_override,
  d.visionary_rev_after_fee_override,
  d.agent_rev_after_fee_override,
  d.only_agent_net_price_accounts_override,
  d.agent_payout_tableau_override,
  d.gp_percent_override,
  d.nova_nrg_rev_after_fee_amount,
  d.visionary_rev_after_fee_amount,
  d.agent_rev_after_fee_amount,
  d.gp_percent,
  d.first_name,
  d.last_name,
  d.phone_number,
  d.email_address,
  d.street_address,
  d.city,
  d.postal_code,
  d.country,
  d.sale_type,
  d.battery_job,
  d.type_of_roof,
  d.panel_type,
  d.panel_amount,
  d.roof_work_needed,
  d.roof_work_progress,
  d.permit_ahj_info,
  d.permit_fees,
  d.permit_number,
  d.permit_status,
  d.permit_fees_paid,
  d.hoa,
  d.hoa_name,
  d.hoa_forms_completed,
  -- New pricing lock columns
  d.pricing_locked,
  d.pricing_locked_at,
  -- From deal_stages join
  s.design_ready_date,
  s.permit_submitted_date,
  s.permit_approved_date,
  s.install_1_racks_date,
  s.install_2_panel_landed_date,
  s.paid_date,
  s.pto_date,
  -- From deal_utility join
  u.utility_company,
  u.ntp_status,
  u.ic_status,
  u.meter_status
FROM deals d
LEFT JOIN deal_stages s ON d.id = s.deal_id
LEFT JOIN deal_utility u ON d.id = u.deal_id;

-- ─── Backfill existing adders ───
INSERT INTO deal_adders (deal_id, adder_name, description, quantity, unit_price, is_custom)
SELECT id, 'Legacy Adders', 'Migrated from total_adders field', 1, total_adders, true
FROM deals WHERE total_adders IS NOT NULL AND total_adders > 0
ON CONFLICT DO NOTHING;
