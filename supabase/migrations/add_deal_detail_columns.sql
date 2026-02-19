-- Add customer detail, address, system, permit, and HOA columns to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS email_address text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS sale_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS battery_job text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS type_of_roof text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS panel_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS panel_amount integer;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS roof_work_needed text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS roof_work_progress text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS permit_ahj_info text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS permit_fees numeric;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS permit_number text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS hoa text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS hoa_name text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS hoa_forms_completed text;

-- Recreate deals_view to include the new columns.
-- NOTE: You must replace the column list below with the ACTUAL current view definition
-- from your database, then append the new columns. Run this after verifying the existing
-- view columns match your production schema.
--
-- To get your current view definition:
--   SELECT pg_get_viewdef('deals_view', true);
--
-- Example pattern (adjust to match your actual view):
CREATE OR REPLACE VIEW deals_view AS
SELECT
  d.id,
  d.sales_rep,
  d.company,
  d.customer_name,
  d.appointment_setter,
  d.call_center_appointment_setter,
  d.company_barayev_input,
  d.kw_system,
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
  d.install_partner,
  d.state,
  d.teams,
  d.activated,
  d.online_deal,
  d.call_center_lead,
  d.month_year,
  d.commission_structure,
  d.revenue,
  d.paid_nova_nrg_p2_rev_date,
  d.paid_nova_nrg_p1_p2_rev_amount,
  d.paid_nova_nrg_post_p2_date,
  d.paid_nova_nrg_post_p2_rev_amount,
  d.nova_nrg_reversal_date,
  d.nova_nrg_reversal_amount,
  d.nova_nrg_fee_amount,
  d.nova_nrg_rev_after_fee_amount,
  d.visionary_revenue,
  d.paid_visionary_p2_date,
  d.paid_visionary_p1_p2_amount,
  d.paid_visionary_post_p2_date,
  d.paid_visionary_post_p2_amount,
  d.p1_visionary_reversal_date,
  d.p1_visionary_reversal_amount,
  d.visionary_fee_amount,
  d.visionary_rev_after_fee_amount,
  d.agent_pay,
  d.paid_agent_p2_date,
  d.paid_agent_p1_p2_amount,
  d.paid_agent_post_p2_date,
  d.paid_agent_post_p2_amount,
  d.p1_agent_reversal_date,
  d.p1_agent_reversal_amount,
  d.agent_fee_amount,
  d.agent_rev_after_fee_amount,
  d.agent_net_price,
  d.only_agent_net_price_accounts,
  d.design_ready_date,
  d.permit_submitted_date,
  d.permit_approved_date,
  d.install_1_racks_date,
  d.install_2_panel_landed_date,
  d.pto_date,
  d.paid_date,
  -- New columns
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
  d.hoa,
  d.hoa_name,
  d.hoa_forms_completed,
  -- From join (keep existing join columns)
  s.stage_key,
  s.stage_entered_at
FROM deals d
LEFT JOIN deal_stages s ON s.deal_id = d.id;
