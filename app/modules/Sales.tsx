"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePortalUser } from "@/lib/usePortalUser";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

const PORTAL_HEADER_PX = 64;

type DealRow = {
  id: string;
  sales_rep: string | null; company: string | null; customer_name: string | null;
  appointment_setter: string | null; call_center_appointment_setter: string | null;
  company_barayev_input: string | null;
  kw_system: number | null; agent_cost_basis_sold_at: number | null; net_price_per_watt: number | null;
  date_closed: string | null;
  contract_value: number | null; total_adders: number | null; contract_net_price: number | null;
  rev: number | null; gross_profit: number | null;
  visionary_paid_out_commission: number | null; nova_nrg_customer_adders: number | null; agent_payout: number | null;
  manager: string | null; manager_amount: number | null;
  status: string | null; p1_nova_nrg_paid: number | null;
  site_survey_date_completed: string | null; site_survey_status: string | null;
  owed_money: number | null; paid_bonus: number | null; fee_charges: number | null;
  notes: string | null;
  install_partner: string | null; state: string | null; teams: string | null;
  activated: string | null; online_deal: string | null; call_center_lead: string | null;
  month_year: string | null; commission_structure: string | null;
  revenue: number | null;
  paid_nova_nrg_p2_rev_date: string | null; paid_nova_nrg_p1_p2_rev_amount: number | null;
  paid_nova_nrg_post_p2_date: string | null; paid_nova_nrg_post_p2_rev_amount: number | null;
  nova_nrg_reversal_date: string | null; nova_nrg_reversal_amount: number | null;
  nova_nrg_fee_amount: number | null; nova_nrg_rev_after_fee_amount: number | null;
  visionary_revenue: number | null;
  paid_visionary_p2_date: string | null; paid_visionary_p1_p2_amount: number | null;
  paid_visionary_post_p2_date: string | null; paid_visionary_post_p2_amount: number | null;
  p1_visionary_reversal_date: string | null; p1_visionary_reversal_amount: number | null;
  visionary_fee_amount: number | null; visionary_rev_after_fee_amount: number | null;
  agent_pay: number | null;
  paid_agent_p2_date: string | null; paid_agent_p1_p2_amount: number | null;
  paid_agent_post_p2_date: string | null; paid_agent_post_p2_amount: number | null;
  p1_agent_reversal_date: string | null; p1_agent_reversal_amount: number | null;
  agent_fee_amount: number | null; agent_rev_after_fee_amount: number | null;
  agent_net_price: number | null; only_agent_net_price_accounts: string | null;
  /* Customer Details */
  first_name: string | null; last_name: string | null; phone_number: string | null; email_address: string | null;
  /* Address */
  street_address: string | null; city: string | null; postal_code: string | null; country: string | null;
  /* Sale & System */
  sale_type: string | null; battery_job: string | null; type_of_roof: string | null;
  panel_type: string | null; panel_amount: number | null;
  roof_work_needed: string | null; roof_work_progress: string | null;
  /* Permit */
  permit_ahj_info: string | null; permit_fees: number | null; permit_number: string | null;
  permit_status: string | null; permit_fees_paid: string | null;
  /* Utility (from view join) */
  utility_company: string | null; ntp_status: string | null; ic_status: string | null; meter_status: string | null;
  /* HOA */
  hoa: string | null; hoa_name: string | null; hoa_forms_completed: string | null;
  /* Milestones */
  design_ready_date: string | null; permit_submitted_date: string | null;
  permit_approved_date: string | null; install_1_racks_date: string | null;
  install_2_panel_landed_date: string | null; pto_date: string | null; paid_date: string | null;
};

type DealUtility = {
  id: string; deal_id: string;
  utility_company: string | null; utility_account_number: string | null;
  ntp_date: string | null; ntp_status: string | null;
  ic_submitted_date: string | null; ic_status: string | null;
  ic_approved_date: string | null;
  meter_pending_date: string | null; meter_status: string | null;
  meter_install_date: string | null;
  utility_notes: string | null;
};

type DealFinance = {
  id: string; deal_id: string;
  finance_type: string | null; finance_company: string | null;
  finance_status: string | null; approval_date: string | null;
  funded_date: string | null; finance_notes: string | null;
};

const SELECT_COLUMNS = [
  "id","sales_rep","company","customer_name","appointment_setter","call_center_appointment_setter",
  "company_barayev_input","kw_system","agent_cost_basis_sold_at","net_price_per_watt","date_closed",
  "contract_value","total_adders","contract_net_price","rev","gross_profit",
  "visionary_paid_out_commission","nova_nrg_customer_adders","agent_payout",
  "manager","manager_amount","status","p1_nova_nrg_paid",
  "site_survey_date_completed","site_survey_status","owed_money","paid_bonus","fee_charges","notes",
  "install_partner","state","teams","activated","online_deal","call_center_lead",
  "month_year","commission_structure","revenue",
  "paid_nova_nrg_p2_rev_date","paid_nova_nrg_p1_p2_rev_amount",
  "paid_nova_nrg_post_p2_date","paid_nova_nrg_post_p2_rev_amount",
  "nova_nrg_reversal_date","nova_nrg_reversal_amount","nova_nrg_fee_amount","nova_nrg_rev_after_fee_amount",
  "visionary_revenue","paid_visionary_p2_date","paid_visionary_p1_p2_amount",
  "paid_visionary_post_p2_date","paid_visionary_post_p2_amount",
  "p1_visionary_reversal_date","p1_visionary_reversal_amount","visionary_fee_amount","visionary_rev_after_fee_amount",
  "agent_pay","paid_agent_p2_date","paid_agent_p1_p2_amount",
  "paid_agent_post_p2_date","paid_agent_post_p2_amount",
  "p1_agent_reversal_date","p1_agent_reversal_amount","agent_fee_amount","agent_rev_after_fee_amount",
  "agent_net_price","only_agent_net_price_accounts",
  "design_ready_date","permit_submitted_date","permit_approved_date",
  "install_1_racks_date","install_2_panel_landed_date","pto_date","paid_date",
  "first_name","last_name","phone_number","email_address",
  "street_address","city","postal_code","country",
  "sale_type","battery_job","type_of_roof","panel_type","panel_amount",
  "roof_work_needed","roof_work_progress",
  "permit_ahj_info","permit_fees","permit_number","permit_status","permit_fees_paid",
  "hoa","hoa_name","hoa_forms_completed",
  "utility_company","ntp_status","ic_status","meter_status",
].join(",");

/* ─── Milestones (ported from RepPortal) ─── */
const MILESTONES: { key: keyof DealRow; short: string }[] = [
  { key: "site_survey_date_completed", short: "Survey" },
  { key: "design_ready_date",          short: "Design" },
  { key: "permit_submitted_date",      short: "Perm Sub" },
  { key: "permit_approved_date",       short: "Perm App" },
  { key: "install_1_racks_date",       short: "Racks" },
  { key: "install_2_panel_landed_date",short: "Panels" },
  { key: "pto_date",                   short: "PTO" },
  { key: "paid_date",                  short: "Paid" },
];

/* ─── Pipeline Stages (GHL-style Kanban) ─── */
type PipelineStage = {
  key: string;
  label: string;
  milestoneKey: keyof DealRow | null;
  dot: string;
  bg: string;
  inactive?: boolean;
};

const PIPELINE_STAGES: PipelineStage[] = [
  /* On-Hold first so reps see it immediately */
  { key: "on_hold",          label: "On-Hold",          milestoneKey: null,                          dot: "#F59E0B", bg: "#FEF3C7" },
  { key: "new",              label: "New",              milestoneKey: null,                          dot: "#9CA3AF", bg: "#F3F4F6" },
  { key: "survey",           label: "Survey",           milestoneKey: "site_survey_date_completed",  dot: "#3B82F6", bg: "#EFF6FF" },
  { key: "design",           label: "Design",           milestoneKey: "design_ready_date",           dot: "#8B5CF6", bg: "#F5F3FF" },
  { key: "permit_submitted", label: "Permit Submitted", milestoneKey: "permit_submitted_date",       dot: "#F59E0B", bg: "#FFFBEB" },
  { key: "permit_approved",  label: "Permit Approved",  milestoneKey: "permit_approved_date",        dot: "#10B981", bg: "#ECFDF5" },
  { key: "install_1",        label: "Install 1 (Racks)",  milestoneKey: "install_1_racks_date",       dot: "#06B6D4", bg: "#ECFEFF" },
  { key: "install_2",        label: "Install 2 (Panels)", milestoneKey: "install_2_panel_landed_date", dot: "#0891B2", bg: "#ECFEFF" },
  { key: "pto",              label: "PTO",              milestoneKey: "pto_date",                    dot: "#EC4899", bg: "#FDF2F8" },
  { key: "paid",             label: "Paid",             milestoneKey: "paid_date",                   dot: "#10B981", bg: "#ECFDF5" },
  /* Inactive stages */
  { key: "cancelled",  label: "Cancelled",  milestoneKey: null, dot: "#EF4444", bg: "#FEF2F2", inactive: true },
  { key: "inactive",   label: "Inactive",   milestoneKey: null, dot: "#9CA3AF", bg: "#F3F4F6", inactive: true },
];

const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => !s.inactive);
const INACTIVE_STAGES = PIPELINE_STAGES.filter(s => s.inactive);
const INACTIVE_STAGE_KEYS = new Set(INACTIVE_STAGES.map(s => s.key));

/* Maps stage index to last MILESTONES index that should be filled (inclusive).
   Stage 0 (On-Hold) = -1, 1 (New) = -1, 2 (Survey) = 0, 3 (Design) = 1,
   4 (Perm Sub) = 2, 5 (Perm App) = 3, 6 (Install 1) = 4, 7 (Install 2) = 5,
   8 (PTO) = 6, 9 (Paid) = 7 */
const STAGE_MILESTONE_END = [-1, -1, 0, 1, 2, 3, 4, 5, 6, 7];

function getDealStage(row: DealRow): string {
  const status = (row.status ?? "").trim().toLowerCase();
  /* On-Hold: active if closed >= 2024-08-01, otherwise inactive */
  if (status === "on-hold" || status === "on hold") {
    if (row.date_closed && row.date_closed < "2024-08-01") return "inactive";
    return "on_hold";
  }
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (row.date_closed && row.date_closed < "2024-08-01") return "inactive";
  /* Active milestone walk (skip index 0 = on_hold, start from end) */
  for (let i = ACTIVE_STAGES.length - 1; i >= 2; i--) {
    const stage = ACTIVE_STAGES[i];
    if (stage.milestoneKey !== null && row[stage.milestoneKey]) return stage.key;
  }
  return "new";
}

/* ─── Column definitions with collapsible group support ─── */
type ColDef = {
  label: string;
  key: keyof DealRow | "__progress" | "__milestones" | "__stage" | "__address";
  type: "text" | "money" | "num" | "date";
  group?: string;
  groupParent?: string;
  computed?: boolean;
};

const ALL_COLUMNS: ColDef[] = [
  /* ── Stage (computed) ── */
  { label: "Stage", key: "__stage" as keyof DealRow, type: "text", computed: true },
  /* ── Core deal info ── */
  { label: "Date Closed",        key: "date_closed",                    type: "date" },
  { label: "Customer Name",      key: "customer_name",                  type: "text" },

  /* ── Contacts (toolbar toggle) ── */
  { label: "Phone",   key: "phone_number",                  type: "text", group: "contacts" },
  { label: "Email",   key: "email_address",                 type: "text", group: "contacts" },
  { label: "Address", key: "__address" as keyof DealRow,    type: "text", group: "contacts", computed: true },

  /* ── Sale Type ── */
  { label: "Sale Type", key: "sale_type", type: "text" },

  { label: "Company",            key: "company",                        type: "text" },
  { label: "Sales Rep",          key: "sales_rep",                      type: "text" },
  { label: "Appointment Setter", key: "appointment_setter",             type: "text" },
  { label: "CC App Setter",      key: "call_center_appointment_setter", type: "text" },
  { label: "KW System",          key: "kw_system",                      type: "num" },
  { label: "Agent Cost Basis",   key: "agent_cost_basis_sold_at",       type: "money" },
  { label: "Net $/W",            key: "net_price_per_watt",             type: "num" },
  { label: "Contract Value",     key: "contract_value",                 type: "money" },
  { label: "Total Adders",       key: "total_adders",                   type: "money" },
  { label: "Contract Net Price", key: "contract_net_price",             type: "money" },

  /* ── Rev + NRG sub-columns (collapsible) ── */
  { label: "Rev",                key: "rev",                                type: "money", groupParent: "rev" },
  { label: "NRG P2 Rev Date",   key: "paid_nova_nrg_p2_rev_date",         type: "date",  group: "rev" },
  { label: "NRG P1+P2 Rev Amt", key: "paid_nova_nrg_p1_p2_rev_amount",    type: "money", group: "rev" },
  { label: "NRG Post-P2 Date",  key: "paid_nova_nrg_post_p2_date",        type: "date",  group: "rev" },
  { label: "NRG Post-P2 Amt",   key: "paid_nova_nrg_post_p2_rev_amount",  type: "money", group: "rev" },
  { label: "NRG Reversal Date", key: "nova_nrg_reversal_date",            type: "date",  group: "rev" },
  { label: "NRG Reversal Amt",  key: "nova_nrg_reversal_amount",          type: "money", group: "rev" },
  { label: "NRG Fee Amt",       key: "nova_nrg_fee_amount",               type: "money", group: "rev" },
  { label: "NRG After Fee",     key: "nova_nrg_rev_after_fee_amount",     type: "money", group: "rev" },

  /* ── Gross Profit ── */
  { label: "Gross Profit", key: "gross_profit", type: "money" },

  /* ── Visionary Commission + sub-columns (collapsible) ── */
  { label: "Visionary Commission", key: "visionary_paid_out_commission",  type: "money", groupParent: "vis_comm" },
  { label: "Vis P2 Date",         key: "paid_visionary_p2_date",          type: "date",  group: "vis_comm" },
  { label: "Vis P1+P2 Amt",       key: "paid_visionary_p1_p2_amount",     type: "money", group: "vis_comm" },
  { label: "Vis Post-P2 Date",    key: "paid_visionary_post_p2_date",     type: "date",  group: "vis_comm" },
  { label: "Vis Post-P2 Amt",     key: "paid_visionary_post_p2_amount",   type: "money", group: "vis_comm" },
  { label: "Vis Reversal Date",   key: "p1_visionary_reversal_date",      type: "date",  group: "vis_comm" },
  { label: "Vis Reversal Amt",    key: "p1_visionary_reversal_amount",    type: "money", group: "vis_comm" },
  { label: "Vis Fee Amt",         key: "visionary_fee_amount",            type: "money", group: "vis_comm" },
  { label: "Vis After Fee",       key: "visionary_rev_after_fee_amount",  type: "money", group: "vis_comm" },

  /* ── Agent Payout + sub-columns (collapsible) ── */
  { label: "Agent Payout",        key: "agent_payout",                   type: "money", groupParent: "agent_pay" },
  { label: "Agent P2 Date",       key: "paid_agent_p2_date",             type: "date",  group: "agent_pay" },
  { label: "Agent P1+P2 Amt",     key: "paid_agent_p1_p2_amount",        type: "money", group: "agent_pay" },
  { label: "Agent Post-P2 Date",  key: "paid_agent_post_p2_date",        type: "date",  group: "agent_pay" },
  { label: "Agent Post-P2 Amt",   key: "paid_agent_post_p2_amount",      type: "money", group: "agent_pay" },
  { label: "Agent Reversal Date", key: "p1_agent_reversal_date",         type: "date",  group: "agent_pay" },
  { label: "Agent Reversal Amt",  key: "p1_agent_reversal_amount",       type: "money", group: "agent_pay" },
  { label: "Agent Fee Amt",       key: "agent_fee_amount",               type: "money", group: "agent_pay" },
  { label: "Agent After Fee",     key: "agent_rev_after_fee_amount",     type: "money", group: "agent_pay" },

  /* ── Status ── */
  { label: "Status",        key: "status",           type: "text" },

  /* ── NRG Customer Adders (toggleable via toolbar) ── */
  { label: "NRG Customer Adders", key: "nova_nrg_customer_adders", type: "money", group: "nrg_adders" },

  /* ── Remaining always-visible columns ── */
  { label: "Manager",           key: "manager",                      type: "text" },
  { label: "Manager $",         key: "manager_amount",               type: "money" },
  { label: "Owed Money",        key: "owed_money",                   type: "money" },
  { label: "Paid Bonus",        key: "paid_bonus",                   type: "money" },
  { label: "State",             key: "state",                        type: "text" },
  { label: "Teams",             key: "teams",                        type: "text" },
  { label: "Activated",         key: "activated",                    type: "text" },
  { label: "Online Deal",       key: "online_deal",                  type: "text" },
  { label: "CC Lead",           key: "call_center_lead",             type: "text" },
  { label: "Survey Date",       key: "site_survey_date_completed",   type: "date" },
  { label: "Survey Status",     key: "site_survey_status",           type: "text" },

  /* ── Other Jobs (toolbar toggle) ── */
  { label: "Battery Job",        key: "battery_job",        type: "text", group: "other_jobs" },
  { label: "Type of Roof",       key: "type_of_roof",       type: "text", group: "other_jobs" },
  { label: "Roof Work Needed",   key: "roof_work_needed",   type: "text", group: "other_jobs" },
  { label: "Roof Work Progress", key: "roof_work_progress", type: "text", group: "other_jobs" },

  /* ── Permitting (toolbar toggle) ── */
  { label: "AHJ Info",          key: "permit_ahj_info",   type: "text", group: "permitting" },
  { label: "Permit Status",     key: "permit_status",      type: "text", group: "permitting" },
  { label: "Permit Fees Paid",  key: "permit_fees_paid",   type: "text", group: "permitting" },
  { label: "Permit No.",        key: "permit_number",      type: "text", group: "permitting" },

  /* ── HOA (toolbar toggle) ── */
  { label: "HOA",                  key: "hoa",                  type: "text", group: "hoa_detail" },
  { label: "HOA Name",            key: "hoa_name",             type: "text", group: "hoa_detail" },
  { label: "HOA Forms Completed", key: "hoa_forms_completed",  type: "text", group: "hoa_detail" },

  /* ── Utilities (toolbar toggle) ── */
  { label: "Utility Co.",  key: "utility_company", type: "text", group: "utilities" },
  { label: "NTP Status",   key: "ntp_status",      type: "text", group: "utilities" },
  { label: "IC Status",    key: "ic_status",        type: "text", group: "utilities" },
  { label: "Meter Status", key: "meter_status",     type: "text", group: "utilities" },

  /* ── Progress & Milestones (computed) ── */
  { label: "Progress",   key: "__progress" as keyof DealRow,   type: "text", computed: true },
  { label: "Milestones", key: "__milestones" as keyof DealRow,  type: "text", computed: true },

  /* ── Hidden: included in EDIT_COLUMNS for save, not shown in list ── */
  { label: "First Name",      key: "first_name",      type: "text",  group: "_save_only" },
  { label: "Last Name",       key: "last_name",       type: "text",  group: "_save_only" },
  { label: "Street Address",  key: "street_address",  type: "text",  group: "_save_only" },
  { label: "City",            key: "city",             type: "text",  group: "_save_only" },
  { label: "Postal Code",     key: "postal_code",     type: "text",  group: "_save_only" },
  { label: "Country",         key: "country",          type: "text",  group: "_save_only" },
  { label: "Permit Fees",     key: "permit_fees",      type: "money", group: "_save_only" },
  { label: "Panel Type",      key: "panel_type",       type: "text",  group: "_save_only" },
  { label: "Panel Amount",    key: "panel_amount",     type: "num",   group: "_save_only" },
];

/* DB-backed columns only (for edit dialog & save logic) */
const EDIT_COLUMNS = ALL_COLUMNS.filter(col => !col.computed);

/* Helpers */
function money(n: number | null | undefined) { if (n == null) return ""; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n)); }
function numFmt(n: number | null | undefined, d = 2) { if (n == null) return ""; const v = Number(n); return Number.isNaN(v) ? "" : v.toFixed(d); }
function fmtDate(iso: string | null | undefined) { if (!iso) return ""; const p = iso.slice(0, 10).split("-"); return p.length < 3 ? iso : `${p[1]}/${p[2]}/${p[0].slice(-2)}`; }
function progressColor(pct: number): string {
  if (pct >= 88) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  if (pct >= 25) return "text-orange-500";
  return "text-[#6B7280]";
}
function progressBg(pct: number): string {
  if (pct >= 88) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  if (pct >= 25) return "bg-orange-400";
  return "bg-[#EBEFF3]";
}
function getProgress(row: DealRow): { completed: number; total: number; pct: number } {
  let completed = 0;
  for (const m of MILESTONES) { if (row[m.key]) completed++; }
  return { completed, total: 8, pct: Math.round((completed / 8) * 100) };
}
function getDealAging(row: DealRow): { totalDays: number; stageDays: number } {
  const now = Date.now();
  const closed = row.date_closed ? new Date(row.date_closed + "T00:00:00").getTime() : NaN;
  const totalDays = Number.isNaN(closed) ? 0 : Math.max(0, Math.floor((now - closed) / 86_400_000));
  let latest = closed;
  for (const m of MILESTONES) {
    const v = row[m.key];
    if (v) {
      const t = new Date((v as string) + "T00:00:00").getTime();
      if (!Number.isNaN(t) && (Number.isNaN(latest) || t > latest)) latest = t;
    }
  }
  const stageDays = Number.isNaN(latest) ? totalDays : Math.max(0, Math.floor((now - latest) / 86_400_000));
  return { totalDays, stageDays };
}

function cellVal(row: DealRow, col: ColDef): string {
  if (col.computed) return "";
  const v = row[col.key as keyof DealRow];
  if (v == null) return "";
  if (col.type === "money") return money(v as number);
  if (col.type === "num") return numFmt(v as number);
  if (col.type === "date") return fmtDate(v as string);
  return String(v);
}
function uniqSorted(vals: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of vals) { const s = (v ?? "").trim(); if (s) set.add(s); }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ─── Column widths (px) ─── */
const W = { date: 80, name: 140, money: 110, num: 72, stage: 118, progress: 88, milestones: 100, address: 185, short: 82, long: 155, med: 108, phone: 110 };
const NAME_KEYS = new Set(["customer_name","sales_rep","appointment_setter","call_center_appointment_setter","manager","teams"]);
const SHORT_KEYS = new Set(["state","activated","online_deal","call_center_lead","battery_job","roof_work_needed","hoa","hoa_forms_completed","permit_status","permit_fees_paid","ntp_status","ic_status","meter_status","survey_status","sale_type"]);
const LONG_KEYS = new Set(["email_address","company"]);
function getColWidth(col: ColDef): number {
  if (col.key === "__stage") return W.stage;
  if (col.key === "__progress") return W.progress;
  if (col.key === "__milestones") return W.milestones;
  if (col.key === "__address") return W.address;
  if (col.key === "phone_number") return W.phone;
  if (NAME_KEYS.has(col.key as string)) return W.name;
  if (SHORT_KEYS.has(col.key as string)) return W.short;
  if (LONG_KEYS.has(col.key as string)) return W.long;
  if (col.type === "date") return W.date;
  if (col.type === "money") return W.money;
  if (col.type === "num") return W.num;
  return W.med;
}

/* ─── GHL Color Palette ─── */
const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  control: "w-full rounded-lg border border-[#EBEFF3] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7096e6]/30",
  buttonPrimary: "px-3 py-2 rounded-lg bg-[#1c48a6] text-white text-sm shadow-sm hover:bg-[#7096e6] active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-[#EBEFF3] text-sm bg-white hover:bg-[#F5F7F9] active:scale-[0.99] transition",
  pill: "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280]",
};

/* ═══ MultiSelect ═══ */
function MultiSelect({ label, options, selected, onChange, placeholder }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const filtered = useMemo(() => { const t = q.trim().toLowerCase(); return t ? options.filter(o => o.toLowerCase().includes(t)) : options; }, [options, q]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (v: string) => { const next = selSet.has(v) ? selected.filter(x => x !== v) : [...selected, v]; next.sort((a, b) => a.localeCompare(b)); onChange(next); };
  const text = selected.length === 0 ? (placeholder ?? "All") : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div ref={ref}>
      <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{label}</div>
      <div className="relative">
        <button type="button" className={`w-full ${UI.control} text-left flex items-center justify-between gap-2`} onClick={() => setOpen(s => !s)}>
          <span className={`truncate ${selected.length === 0 ? "text-[#6B7280]" : "text-[#000000]"}`}>{text}</span>
          <span className="text-[#6B7280] text-[10px]">&#9662;</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#EBEFF3] bg-white shadow-lg overflow-hidden">
            <div className="p-2 border-b border-[#EBEFF3]">
              <input className={UI.control} placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-[#6B7280]">{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
                <button type="button" className="text-[10px] font-semibold text-[#6B7280] hover:text-[#000000]" onClick={() => onChange([])}>Clear</button>
              </div>
            </div>
            <div className="max-h-56 overflow-auto">
              {filtered.length === 0 ? <div className="px-3 py-3 text-sm text-[#6B7280]">No matches.</div> : filtered.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#F5F7F9] cursor-pointer select-none">
                  <input type="checkbox" checked={selSet.has(opt)} onChange={() => toggle(opt)} className="accent-[#1c48a6]" />
                  <span className="truncate">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Kanban Components ═══ */

function StageColumn({ stage, deals, onCardClick, onCardDoubleClick, inactive }: { stage: PipelineStage; deals: DealRow[]; onCardClick: (d: DealRow) => void; onCardDoubleClick: (d: DealRow) => void; inactive?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !!inactive });
  const totalValue = deals.reduce((sum, d) => sum + (d.contract_value ?? 0), 0);
  const colWidth = inactive ? 240 : 280;

  return (
    <div ref={setNodeRef} className="flex flex-col min-h-0" style={{ width: colWidth, minWidth: colWidth, opacity: inactive ? 0.8 : 1 }}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#EBEFF3] flex-shrink-0" style={{ backgroundColor: stage.bg }}>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.dot }} />
          <span className="text-sm font-semibold text-[#000000]">{stage.label}</span>
          <span className="text-[11px] text-[#6B7280] bg-white rounded-full px-1.5 py-0.5 font-medium">{deals.length}</span>
          {inactive && <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wider font-medium">inactive</span>}
        </div>
        <div className="text-xs text-[#6B7280] mt-0.5">{money(totalValue)}</div>
      </div>
      {/* Body */}
      <div className={`flex-1 overflow-y-auto p-2 space-y-2 transition-colors ${isOver && !inactive ? "bg-[#1c48a6]/5" : "bg-[#F5F7F9]"}`}>
        {deals.map(deal => (
          <DealCard key={deal.id} deal={deal} onCardClick={onCardClick} onCardDoubleClick={onCardDoubleClick} inactive={inactive} />
        ))}
        {deals.length === 0 && (
          <div className="text-center text-xs text-[#6B7280] py-6">No deals</div>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, onCardClick, onCardDoubleClick, inactive }: { deal: DealRow; onCardClick: (d: DealRow) => void; onCardDoubleClick: (d: DealRow) => void; inactive?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
    disabled: !!inactive,
  });

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = useCallback(() => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; onCardDoubleClick(deal); return; }
    clickTimer.current = setTimeout(() => { clickTimer.current = null; onCardClick(deal); }, 250);
  }, [deal, onCardClick, onCardDoubleClick]);

  const aging = getDealAging(deal);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`bg-white rounded-lg border border-[#EBEFF3] shadow-sm p-3 hover:shadow-md transition-shadow ${inactive ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      onClick={handleClick}
      title={`Age: ${aging.totalDays}d | In stage: ${aging.stageDays}d`}
    >
      <div className="font-semibold text-sm text-[#000000] truncate">{deal.customer_name || "Untitled"}</div>
      <div className="text-base font-bold text-[#1c48a6] mt-1">{money(deal.contract_value)}</div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#6B7280]">
        {deal.kw_system != null && <span>{numFmt(deal.kw_system)} kW</span>}
        {deal.sales_rep && <span className="truncate">{deal.sales_rep}</span>}
      </div>
      {/* Milestone dots */}
      <div className="flex items-center gap-1 mt-2">
        {MILESTONES.map(m => (
          <div
            key={m.key}
            title={`${m.short}: ${deal[m.key] ? fmtDate(deal[m.key] as string) : "Pending"}`}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: deal[m.key] ? "#1c48a6" : "#E5E7EB" }}
          />
        ))}
      </div>
    </div>
  );
}

function DealCardOverlay({ deal }: { deal: DealRow }) {
  return (
    <div className="bg-white rounded-lg border-2 border-[#1c48a6] shadow-lg p-3" style={{ width: 264 }}>
      <div className="font-semibold text-sm text-[#000000] truncate">{deal.customer_name || "Untitled"}</div>
      <div className="text-base font-bold text-[#1c48a6] mt-1">{money(deal.contract_value)}</div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#6B7280]">
        {deal.kw_system != null && <span>{numFmt(deal.kw_system)} kW</span>}
        {deal.sales_rep && <span className="truncate">{deal.sales_rep}</span>}
      </div>
      <div className="flex items-center gap-1 mt-2">
        {MILESTONES.map(m => (
          <div key={m.key} className="w-2 h-2 rounded-full" style={{ backgroundColor: deal[m.key] ? "#1c48a6" : "#E5E7EB" }} />
        ))}
      </div>
    </div>
  );
}

/* ═══ InfoCell — small metric card for the summary panel ═══ */
function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#EBEFF3] rounded-lg px-3 py-2">
      <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium text-[#000000] mt-0.5 truncate">{value || "—"}</div>
    </div>
  );
}

/* ═══ ListSummaryBar — full-width dashboard above list view ═══ */
type StageStat = { stage: PipelineStage; count: number; value: number; recent: number; prior: number; milestoneTotal: number; milestoneDone: number };
type MilestoneAgg = { key: string; short: string; done: number; total: number };

function ListSummaryBar({ stageStats, totals, milestoneAgg }: {
  stageStats: StageStat[];
  totals: { count: number; value: number; recent: number; prior: number; milestoneTotal: number; milestoneDone: number };
  milestoneAgg: MilestoneAgg[];
}) {
  const milestonePct = totals.milestoneTotal > 0 ? Math.round((totals.milestoneDone / totals.milestoneTotal) * 100) : 0;
  const maxCount = Math.max(1, ...stageStats.map(s => s.count));
  const maxValue = Math.max(1, ...stageStats.map(s => s.value));
  const trendDelta = totals.recent - totals.prior;
  const trendPctVal = totals.prior > 0 ? Math.round((trendDelta / totals.prior) * 100) : totals.recent > 0 ? 100 : 0;

  /* Collapsible */
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-[#EBEFF3] bg-[#F9FAFB]">
      {/* Toggle header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider hover:bg-[#EBEFF3]/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span>Dashboard Summary</span>
        <span className="text-[10px]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">

          {/* ── Row 1: KPI cards ── */}
          <div className="grid grid-cols-4 gap-3">
            {/* Total Deals */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Total Deals</div>
              <div className="text-2xl font-bold text-[#000000] mt-1 tabular-nums">{totals.count}</div>
              <div className="text-[10px] text-[#6B7280] mt-0.5">{stageStats.filter(s => !s.stage.inactive).length} active stages</div>
            </div>
            {/* Pipeline Value */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Pipeline Value</div>
              <div className="text-2xl font-bold text-[#1c48a6] mt-1 tabular-nums">{money(totals.value)}</div>
              <div className="text-[10px] text-[#6B7280] mt-0.5">
                Avg {totals.count > 0 ? money(totals.value / totals.count) : "$0"}/deal
              </div>
            </div>
            {/* 30d Trend */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">30-Day Trend</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-bold tabular-nums ${trendDelta > 0 ? "text-emerald-600" : trendDelta < 0 ? "text-red-500" : "text-[#6B7280]"}`}>
                  {trendDelta > 0 ? "+" : ""}{trendDelta}
                </span>
                {trendPctVal !== 0 && (
                  <span className={`text-xs font-semibold ${trendDelta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {trendDelta > 0 ? "\u25B2" : "\u25BC"} {Math.abs(trendPctVal)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[#6B7280] mt-0.5">{totals.recent} new vs {totals.prior} prior 30d</div>
            </div>
            {/* Milestone Completion */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Milestones</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-bold tabular-nums ${progressColor(milestonePct)}`}>{milestonePct}%</span>
                <span className="text-[10px] text-[#9CA3AF]">{totals.milestoneDone}/{totals.milestoneTotal}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#EBEFF3] overflow-hidden mt-1.5">
                <div className={`h-full rounded-full ${progressBg(milestonePct)} transition-all`} style={{ width: `${milestonePct}%` }} />
              </div>
            </div>
          </div>

          {/* ── Row 2: Charts ── */}
          <div className="grid grid-cols-3 gap-3">

            {/* Deal Count Bar Chart */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Deals by Stage</div>
              <div className="space-y-1.5">
                {stageStats.map(s => {
                  const pct = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
                  return (
                    <div key={s.stage.key} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage.dot }} />
                      <span className="text-[10px] text-[#000000] w-[90px] truncate flex-shrink-0">{s.stage.label}</span>
                      <div className="flex-1 h-4 rounded bg-[#F3F4F6] overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${pct}%`, backgroundColor: s.stage.dot, opacity: 0.7 }}
                        />
                        {s.count > 0 && (
                          <span className="absolute inset-0 flex items-center pl-1.5 text-[10px] font-bold text-[#000000]">{s.count}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Value Distribution Bar Chart */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Value by Stage</div>
              <div className="space-y-1.5">
                {stageStats.map(s => {
                  const pct = maxValue > 0 ? (s.value / maxValue) * 100 : 0;
                  return (
                    <div key={s.stage.key} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage.dot }} />
                      <span className="text-[10px] text-[#000000] w-[90px] truncate flex-shrink-0">{s.stage.label}</span>
                      <div className="flex-1 h-4 rounded bg-[#F3F4F6] overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${pct}%`, backgroundColor: s.stage.dot, opacity: 0.7 }}
                        />
                        {s.value > 0 && (
                          <span className="absolute inset-0 flex items-center justify-end pr-1.5 text-[10px] font-bold text-[#000000] tabular-nums">{money(s.value)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestone Completion Chart */}
            <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
              <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Milestone Completion</div>
              <div className="space-y-1.5">
                {milestoneAgg.map(m => {
                  const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                  return (
                    <div key={m.key} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#000000] w-[52px] truncate flex-shrink-0">{m.short}</span>
                      <div className="flex-1 h-4 rounded bg-[#F3F4F6] overflow-hidden relative">
                        <div
                          className={`h-full rounded transition-all ${progressBg(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-end pr-1.5 text-[10px] font-bold text-[#000000] tabular-nums">{pct}%</span>
                      </div>
                      <span className="text-[9px] text-[#9CA3AF] w-[40px] text-right tabular-nums flex-shrink-0">{m.done}/{m.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Row 3: Pipeline funnel — stacked horizontal bar ── */}
          <div className="rounded-xl border border-[#EBEFF3] bg-white p-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Pipeline Funnel</div>
            {totals.count > 0 ? (
              <div className="flex h-7 rounded-lg overflow-hidden">
                {stageStats.map(s => {
                  const pct = (s.count / totals.count) * 100;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={s.stage.key}
                      className="h-full flex items-center justify-center relative group"
                      style={{ width: `${pct}%`, backgroundColor: s.stage.dot, minWidth: pct > 3 ? undefined : 4 }}
                      title={`${s.stage.label}: ${s.count} deals (${Math.round(pct)}%) — ${money(s.value)}`}
                    >
                      {pct > 6 && (
                        <span className="text-[9px] font-bold text-white truncate px-1">{s.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-7 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[10px] text-[#9CA3AF]">No deals</div>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {stageStats.filter(s => s.count > 0).map(s => (
                <div key={s.stage.key} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.stage.dot }} />
                  <span className="text-[10px] text-[#6B7280]">{s.stage.label}</span>
                  <span className="text-[10px] font-semibold text-[#000000]">{s.count}</span>
                  <span className="text-[10px] text-[#9CA3AF]">({Math.round((s.count / totals.count) * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

/* ═══ DealSummaryPanel — right-side detail panel ═══ */

const UTILITY_STEPS: { key: keyof DealUtility; label: string; statusKey?: keyof DealUtility }[] = [
  { key: "ntp_date", label: "NTP", statusKey: "ntp_status" },
  { key: "ic_submitted_date", label: "IC Submitted", statusKey: "ic_status" },
  { key: "ic_approved_date", label: "IC Approved" },
  { key: "meter_pending_date", label: "Meter Pending", statusKey: "meter_status" },
  { key: "meter_install_date", label: "Meter Install" },
];

function DealSummaryPanel({ deal, onClose, onOpenEdit, panelRef }: { deal: DealRow; onClose: () => void; onOpenEdit: (d: DealRow) => void; panelRef?: React.RefObject<HTMLDivElement | null> }) {
  const stageKey = getDealStage(deal);
  const stage = PIPELINE_STAGES.find(s => s.key === stageKey) ?? PIPELINE_STAGES[0];
  const prog = getProgress(deal);

  /* Extra data from new tables */
  const [utility, setUtility] = useState<DealUtility | null>(null);
  const [finance, setFinance] = useState<DealFinance | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setExtraLoading(true);
    setUtility(null);
    setFinance(null);
    Promise.all([
      supabase.from("deal_utility").select("*").eq("deal_id", deal.id).maybeSingle(),
      supabase.from("deal_finance").select("*").eq("deal_id", deal.id).maybeSingle(),
    ]).then(([uRes, fRes]) => {
      if (cancelled) return;
      if (uRes.data) setUtility(uRes.data as DealUtility);
      if (fRes.data) setFinance(fRes.data as DealFinance);
      setExtraLoading(false);
    }).catch(() => { if (!cancelled) setExtraLoading(false); });
    return () => { cancelled = true; };
  }, [deal.id]);

  /* Close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const financeTypeBadge = (type: string | null) => {
    if (!type) return null;
    const t = type.toLowerCase();
    const color = t === "cash" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : t === "loan" ? "bg-blue-50 text-blue-700 border-blue-200"
      : t === "lease" ? "bg-purple-50 text-purple-700 border-purple-200"
      : "bg-[#F5F7F9] text-[#6B7280] border-[#EBEFF3]";
    return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${color}`}>{type}</span>;
  };

  return (
    <div ref={panelRef} className="flex-shrink-0 border-l border-[#EBEFF3] bg-white overflow-y-auto" style={{ width: 360 }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#EBEFF3] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#000000] truncate">{deal.customer_name || "Untitled"}</div>
          <div className="text-xs text-[#6B7280] mt-0.5 truncate">
            {[deal.company, deal.state].filter(Boolean).join(" \u00B7 ") || "\u2014"}
          </div>
          {deal.phone_number && <div className="text-[10px] text-[#6B7280] mt-0.5 truncate">{deal.phone_number}</div>}
          {deal.email_address && <div className="text-[10px] text-[#6B7280] truncate">{deal.email_address}</div>}
          {(deal.street_address || deal.city || deal.state || deal.postal_code) && (
            <div className="text-[10px] text-[#6B7280] truncate">
              {[deal.street_address, deal.city, deal.state, deal.postal_code].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
        <button className="text-[#6B7280] hover:text-[#000000] text-base flex-shrink-0 mt-0.5" onClick={onClose}>{"\u2715"}</button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Stage badge */}
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: stage.bg, color: stage.dot, border: `1px solid ${stage.dot}30` }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.dot }} />
            {stage.label}
          </span>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <InfoCell label="Contract Value" value={money(deal.contract_value)} />
          <InfoCell label="kW System" value={deal.kw_system != null ? numFmt(deal.kw_system) : ""} />
          <InfoCell label="Sales Rep" value={deal.sales_rep ?? ""} />
          <InfoCell label="Date Closed" value={fmtDate(deal.date_closed)} />
          <InfoCell label="Company" value={deal.company ?? ""} />
          <InfoCell label="State" value={deal.state ?? ""} />
        </div>

        {/* Sale & System */}
        {(deal.sale_type || deal.battery_job || deal.type_of_roof || deal.panel_type || deal.panel_amount != null) && (
          <div>
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Sale & System</div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label="Sale Type" value={deal.sale_type ?? ""} />
              <InfoCell label="Battery" value={deal.battery_job ?? ""} />
              <InfoCell label="Roof Type" value={deal.type_of_roof ?? ""} />
              <InfoCell label="Panel Type" value={deal.panel_type ?? ""} />
              <InfoCell label="Panel Amount" value={deal.panel_amount != null ? String(deal.panel_amount) : ""} />
              {deal.roof_work_needed === "Yes" && (
                <InfoCell label="Roof Work Progress" value={deal.roof_work_progress ?? ""} />
              )}
            </div>
          </div>
        )}

        {/* Permit Details */}
        {(deal.permit_ahj_info || deal.permit_fees != null || deal.permit_number) && (
          <div>
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Permit Details</div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label="AHJ Info" value={deal.permit_ahj_info ?? ""} />
              <InfoCell label="Permit Fees" value={money(deal.permit_fees)} />
              <InfoCell label="Permit No." value={deal.permit_number ?? ""} />
            </div>
          </div>
        )}

        {/* HOA */}
        {deal.hoa === "Yes" && (
          <div>
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">HOA</div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label="HOA Name" value={deal.hoa_name ?? ""} />
              <InfoCell label="Forms Completed" value={deal.hoa_forms_completed ?? ""} />
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Progress</span>
            <span className={`text-xs font-bold tabular-nums ${progressColor(prog.pct)}`}>{prog.pct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#EBEFF3] overflow-hidden">
            <div className={`h-full rounded-full ${progressBg(prog.pct)} transition-all`} style={{ width: `${prog.pct}%` }} />
          </div>
        </div>

        {/* Milestone Timeline */}
        <div>
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Milestones</div>
          <div className="space-y-0">
            {MILESTONES.map((m, i) => {
              const done = !!deal[m.key];
              return (
                <div key={m.key} className="flex items-start gap-3">
                  {/* Vertical line + dot */}
                  <div className="flex flex-col items-center" style={{ width: 16 }}>
                    <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${done ? "bg-[#1c48a6] border-[#1c48a6]" : "bg-white border-[#D1D5DB]"}`} />
                    {i < MILESTONES.length - 1 && <div className="w-0.5 flex-1 min-h-[20px]" style={{ backgroundColor: done ? "#1c48a6" : "#E5E7EB" }} />}
                  </div>
                  <div className="pb-3 min-w-0">
                    <div className={`text-xs font-medium ${done ? "text-[#000000]" : "text-[#9CA3AF]"}`}>{m.short}</div>
                    {done && <div className="text-[10px] text-[#6B7280]">{fmtDate(deal[m.key] as string)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        {deal.notes && (
          <div>
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Notes</div>
            <div className="text-xs text-[#000000] bg-[#F5F7F9] rounded-lg px-3 py-2 whitespace-pre-wrap">{deal.notes}</div>
          </div>
        )}

        {/* ── Adder Details ── */}
        <div>
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Adder Details</div>
          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="Total Adders" value={money(deal.total_adders)} />
            <InfoCell label="NRG Customer Adders" value={money(deal.nova_nrg_customer_adders)} />
          </div>
        </div>

        {/* ── Utility Progress ── */}
        <div>
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Utility Progress</div>
          {extraLoading ? (
            <div className="text-xs text-[#6B7280]">Loading...</div>
          ) : !utility ? (
            <div className="text-xs text-[#9CA3AF]">No utility data</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <InfoCell label="Utility Company" value={utility.utility_company ?? ""} />
                <InfoCell label="Account #" value={utility.utility_account_number ?? ""} />
              </div>
              <div className="space-y-0">
                {UTILITY_STEPS.map((step, i) => {
                  const dateVal = utility[step.key] as string | null;
                  const done = !!dateVal;
                  const statusVal = step.statusKey ? (utility[step.statusKey] as string | null) : null;
                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="flex flex-col items-center" style={{ width: 16 }}>
                        <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${done ? "bg-[#06B6D4] border-[#06B6D4]" : "bg-white border-[#D1D5DB]"}`} />
                        {i < UTILITY_STEPS.length - 1 && <div className="w-0.5 flex-1 min-h-[20px]" style={{ backgroundColor: done ? "#06B6D4" : "#E5E7EB" }} />}
                      </div>
                      <div className="pb-3 min-w-0">
                        <div className={`text-xs font-medium ${done ? "text-[#000000]" : "text-[#9CA3AF]"}`}>{step.label}</div>
                        {done && <div className="text-[10px] text-[#6B7280]">{fmtDate(dateVal)}</div>}
                        {statusVal && <div className="text-[10px] text-[#6B7280]">{statusVal}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {utility.utility_notes && (
                <div className="text-xs text-[#000000] bg-[#F5F7F9] rounded-lg px-3 py-2 whitespace-pre-wrap mt-2">{utility.utility_notes}</div>
              )}
            </>
          )}
        </div>

        {/* ── Finance ── */}
        <div>
          <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Finance</div>
          {extraLoading ? (
            <div className="text-xs text-[#6B7280]">Loading...</div>
          ) : !finance ? (
            <div className="text-xs text-[#9CA3AF]">No finance data</div>
          ) : (
            <>
              <div className="mb-2">{financeTypeBadge(finance.finance_type)}</div>
              <div className="grid grid-cols-2 gap-2">
                <InfoCell label="Finance Company" value={finance.finance_company ?? ""} />
                <InfoCell label="Status" value={finance.finance_status ?? ""} />
                <InfoCell label="Approval Date" value={fmtDate(finance.approval_date)} />
                <InfoCell label="Funded Date" value={fmtDate(finance.funded_date)} />
              </div>
              {finance.finance_notes && (
                <div className="text-xs text-[#000000] bg-[#F5F7F9] rounded-lg px-3 py-2 whitespace-pre-wrap mt-2">{finance.finance_notes}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#EBEFF3]">
        <button className={`${UI.buttonPrimary} w-full text-center`} onClick={() => onOpenEdit(deal)}>Open Full Edit</button>
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═══ */
export default function Sales() {
  useEffect(() => { const pb = document.body.style.overflow; const ph = document.documentElement.style.overflow; document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; return () => { document.body.style.overflow = pb; document.documentElement.style.overflow = ph; }; }, []);

  const { teamNames, effectiveScope, loading: scopeLoading } = usePortalUser();

  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  /* View mode */
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  /* Inactive toggle, Paid toggle & Summary panel */
  const [showInactive, setShowInactive] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [summaryDeal, setSummaryDeal] = useState<DealRow | null>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);

  /* Filters */
  const [salesReps, setSalesReps] = useState<string[]>([]);
  const [ccSetters, setCcSetters] = useState<string[]>([]);
  const [installers, setInstallers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [customerQ, setCustomerQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /* Collapsible column groups — default: main 3 collapsed, NRG Adders visible */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(groupId: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const visibleColumns = useMemo(() => {
    return ALL_COLUMNS.filter(col => {
      if (col.group) return expandedGroups.has(col.group);
      return true;
    });
  }, [expandedGroups]);

  /* Sort — key-based (stable across expand/collapse) */
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: ColDef) {
    const k = col.key;
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  /* Edit dialog */
  const [editRow, setEditRow] = useState<DealRow | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editTab, setEditTab] = useState<0 | 1 | 2>(0);

  /* Drag-and-drop */
  const [activeDragDeal, setActiveDragDeal] = useState<DealRow | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /* Debounce ref */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Row click timer (for list view single/double click discrimination) */
  const rowClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (teamNames !== null && teamNames.length === 0) {
      setRows([]); setLoading(false); return;
    }
    setLoading(true); setMsg(null);
    let q = supabase.from("deals_view").select(SELECT_COLUMNS).order("date_closed", { ascending: false }).limit(5000);
    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);
    if (teamNames !== null && !salesReps.length) {
      q = q.in("sales_rep", teamNames);
    } else if (salesReps.length) {
      if (teamNames !== null) {
        const allowed = salesReps.filter(r => teamNames.includes(r));
        q = q.in("sales_rep", allowed.length ? allowed : ["__none__"]);
      } else {
        q = q.in("sales_rep", salesReps);
      }
    }
    if (ccSetters.length) q = q.in("call_center_appointment_setter", ccSetters);
    if (installers.length) q = q.in("company", installers);
    if (statuses.length) q = q.in("status", statuses);
    if (customerQ.trim()) q = q.ilike("customer_name", `%${customerQ.trim()}%`);
    const { data, error } = await q;
    if (error) { setRows([]); setMsg(`Error: ${error.message}`); }
    else setRows((data ?? []) as unknown as DealRow[]);
    setLoading(false);
  }, [startDate, endDate, salesReps, ccSetters, installers, statuses, customerQ, teamNames]);

  /* Auto-reload on filter change with debounce */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load]);

  /* Click outside to close summary panel */
  useEffect(() => {
    if (!summaryDeal) return;
    const handler = (e: MouseEvent) => {
      if (summaryPanelRef.current && !summaryPanelRef.current.contains(e.target as Node)) {
        setSummaryDeal(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [summaryDeal]);

  /* Options from loaded rows */
  const options = useMemo(() => {
    const allReps = uniqSorted(rows.map(r => r.sales_rep));
    return {
      salesReps: teamNames !== null ? allReps.filter(r => teamNames.includes(r)) : allReps,
      ccSetters: uniqSorted(rows.map(r => r.call_center_appointment_setter)),
      installers: uniqSorted(rows.map(r => r.company)),
      statuses: uniqSorted(rows.map(r => r.status)),
    };
  }, [rows, teamNames]);

  /* Sorting */
  const sortedRows = useMemo(() => {
    if (sortKey === null) return rows;
    if (sortKey === "__stage") {
      const dir = sortDir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const as = getDealStage(a); const bs = getDealStage(b);
        const ai = PIPELINE_STAGES.findIndex(s => s.key === as);
        const bi = PIPELINE_STAGES.findIndex(s => s.key === bs);
        return (ai - bi) * dir;
      });
    }
    if (sortKey === "__progress" || sortKey === "__milestones") {
      const dir = sortDir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const ac = MILESTONES.filter(m => a[m.key]).length;
        const bc = MILESTONES.filter(m => b[m.key]).length;
        return (ac - bc) * dir;
      });
    }
    const col = ALL_COLUMNS.find(c => c.key === sortKey);
    if (!col) return rows;
    const key = col.key as keyof DealRow;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  /* Visible active stages (respects showPaid toggle) */
  const visibleActiveStages = useMemo(() => {
    if (showPaid) return ACTIVE_STAGES;
    return ACTIVE_STAGES.filter(s => s.key !== "paid");
  }, [showPaid]);

  /* Filtered display rows for list view (respects showInactive + showPaid) */
  const displayRows = useMemo(() => {
    let out = sortedRows;
    if (!showInactive) out = out.filter(r => !INACTIVE_STAGE_KEYS.has(getDealStage(r)));
    if (!showPaid) out = out.filter(r => getDealStage(r) !== "paid");
    return out;
  }, [sortedRows, showInactive, showPaid]);

  /* Deal count respecting both toggles */
  const visibleDealCount = useMemo(() => {
    let count = 0;
    for (const r of rows) {
      const s = getDealStage(r);
      if (!showInactive && INACTIVE_STAGE_KEYS.has(s)) continue;
      if (!showPaid && s === "paid") continue;
      count++;
    }
    return count;
  }, [rows, showInactive, showPaid]);

  /* List-view summary stats (per-stage counts, totals, trajectory, milestones) */
  const listSummary = useMemo(() => {
    const now = Date.now();
    const d30 = 30 * 86_400_000;
    const stageStats: StageStat[] = [];
    const allStages = showInactive ? PIPELINE_STAGES : PIPELINE_STAGES.filter(s => !s.inactive);
    const filtered = showPaid ? allStages : allStages.filter(s => s.key !== "paid");

    /* Per-milestone aggregate counts across all visible deals */
    const milestoneAgg: { key: string; short: string; done: number; total: number }[] =
      MILESTONES.map(m => ({ key: m.key, short: m.short, done: 0, total: 0 }));

    for (const stage of filtered) {
      let count = 0, value = 0, recent = 0, prior = 0, milestoneTotal = 0, milestoneDone = 0;
      for (const r of displayRows) {
        if (getDealStage(r) !== stage.key) continue;
        count++;
        value += r.contract_value ?? 0;
        milestoneTotal += MILESTONES.length;
        for (let mi = 0; mi < MILESTONES.length; mi++) {
          milestoneAgg[mi].total++;
          if (r[MILESTONES[mi].key]) { milestoneDone++; milestoneAgg[mi].done++; }
        }
        if (r.date_closed) {
          const closed = new Date(r.date_closed + "T00:00:00").getTime();
          if (now - closed <= d30) recent++;
          else if (now - closed <= d30 * 2) prior++;
        }
      }
      stageStats.push({ stage, count, value, recent, prior, milestoneTotal, milestoneDone });
    }

    const totals = stageStats.reduce(
      (acc, s) => ({ count: acc.count + s.count, value: acc.value + s.value, recent: acc.recent + s.recent, prior: acc.prior + s.prior, milestoneTotal: acc.milestoneTotal + s.milestoneTotal, milestoneDone: acc.milestoneDone + s.milestoneDone }),
      { count: 0, value: 0, recent: 0, prior: 0, milestoneTotal: 0, milestoneDone: 0 }
    );

    return { stageStats, totals, milestoneAgg };
  }, [displayRows, showInactive, showPaid]);

  /* Deals grouped by pipeline stage (for Kanban) */
  const dealsByStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const deal of sortedRows) {
      const stageKey = getDealStage(deal);
      const arr = map.get(stageKey);
      if (arr) arr.push(deal);
    }
    return map;
  }, [sortedRows]);

  /* Drag handlers */
  function handleDragStart(event: DragStartEvent) {
    const deal = (event.active.data.current as Record<string, unknown>)?.deal as DealRow | undefined;
    setActiveDragDeal(deal ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragDeal(null);
    const { active, over } = event;
    if (!over) return;

    const deal = (active.data.current as Record<string, unknown>)?.deal as DealRow | undefined;
    if (!deal) return;

    const targetStageKey = over.id as string;
    const currentStageKey = getDealStage(deal);
    if (targetStageKey === currentStageKey) return;

    /* Block drag to/from inactive stages (cancelled / inactive) */
    if (INACTIVE_STAGE_KEYS.has(targetStageKey) || INACTIVE_STAGE_KEYS.has(currentStageKey)) return;

    const targetIdx = ACTIVE_STAGES.findIndex(s => s.key === targetStageKey);
    const currentIdx = ACTIVE_STAGES.findIndex(s => s.key === currentStageKey);
    if (targetIdx < 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const payload: Record<string, string | null> = {};

    /* Dragging INTO On-Hold: set status to On-Hold, don't touch milestones */
    if (targetStageKey === "on_hold") {
      payload.status = "On-Hold";
    }
    /* Dragging OUT of On-Hold: clear On-Hold status, then set milestones for target */
    else if (currentStageKey === "on_hold") {
      payload.status = null;
      const targetEnd = STAGE_MILESTONE_END[targetIdx];
      for (let i = 0; i <= targetEnd; i++) {
        const mKey = MILESTONES[i].key as string;
        if (!deal[MILESTONES[i].key]) {
          payload[mKey] = today;
        }
      }
    }
    /* Normal milestone drag */
    else {
      const targetEnd = STAGE_MILESTONE_END[targetIdx];
      if (targetIdx > currentIdx) {
        for (let i = 0; i <= targetEnd; i++) {
          const mKey = MILESTONES[i].key as string;
          if (!deal[MILESTONES[i].key]) {
            payload[mKey] = today;
          }
        }
      } else {
        for (let i = targetEnd + 1; i < MILESTONES.length; i++) {
          const mKey = MILESTONES[i].key as string;
          if (deal[MILESTONES[i].key]) {
            payload[mKey] = null;
          }
        }
      }
    }

    if (Object.keys(payload).length === 0) return;

    // Optimistic update
    setRows(prev => prev.map(r => {
      if (r.id !== deal.id) return r;
      const updated = { ...r };
      for (const [k, v] of Object.entries(payload)) {
        (updated as Record<string, unknown>)[k] = v;
      }
      return updated as DealRow;
    }));

    // Persist to Supabase
    const { error } = await supabase.from("deals").update(payload).eq("id", deal.id).select("id");
    if (error) {
      console.error("Failed to update deal:", error);
      load(); // reload on error to restore correct state
    }
  }

  /* Edit dialog helpers */
  function autoSaleType(draft: Record<string, any>) {
    if (!draft.sale_type) {
      const ccLead = ((draft.call_center_lead as string) ?? "").trim().toLowerCase();
      draft.sale_type = ccLead === "yes" ? "Call Center Deal" : "D2D";
    }
  }

  function openEdit(row: DealRow) {
    setEditRow(row);
    const draft = { ...row } as Record<string, any>;
    autoSaleType(draft);
    setEditDraft(draft);
    setEditMsg(null);
    setIsNew(false);
    setEditTab(0);
  }

  function openNew() {
    const blank: Record<string, any> = { id: "" };
    for (const col of EDIT_COLUMNS) blank[col.key] = null;
    autoSaleType(blank);
    setEditRow(blank as DealRow);
    setEditDraft(blank);
    setEditMsg(null);
    setIsNew(true);
    setEditTab(0);
  }

  function setField(key: string, value: string) {
    setEditDraft(d => ({ ...d, [key]: value === "" ? null : value }));
  }

  async function saveEdit() {
    if (!editRow) return;
    setSaving(true); setEditMsg(null);

    if (isNew) {
      const payload: Record<string, any> = {};
      for (const col of EDIT_COLUMNS) {
        const k = col.key as keyof DealRow;
        const val = editDraft[k];
        if (val != null && val !== "") {
          payload[k] = (col.type === "money" || col.type === "num") ? Number(val) : val;
        }
      }
      if (!payload.customer_name && !payload.sales_rep) { setEditMsg("At least Customer Name or Sales Rep is required."); setSaving(false); return; }
      const { data: inserted, error } = await supabase.from("deals").insert(payload).select("id");
      if (error) { setEditMsg(`Error: ${error.message}`); setSaving(false); return; }
      if (!inserted || inserted.length === 0) { setEditMsg("Insert failed — check database permissions."); setSaving(false); return; }
    } else {
      const payload: Record<string, any> = {};
      for (const col of EDIT_COLUMNS) {
        const k = col.key as keyof DealRow;
        const rawNew = editDraft[k];
        const rawOld = editRow[k];
        const norm = (v: unknown) => (v == null || v === "" ? null : (col.type === "money" || col.type === "num") ? Number(v) : String(v));
        const nNew = norm(rawNew);
        const nOld = norm(rawOld);
        if (nNew === nOld) continue;
        payload[k] = nNew;
      }
      if (Object.keys(payload).length === 0) { setEditMsg("No changes."); setSaving(false); return; }
      const { data: updated, error } = await supabase.from("deals").update(payload).eq("id", editRow.id).select("id");
      if (error) { setEditMsg(`Error: ${error.message}`); setSaving(false); return; }
      if (!updated || updated.length === 0) { setEditMsg("Save failed — row not updated. Check database permissions."); setSaving(false); return; }
    }

    setEditRow(null); setSaving(false); setIsNew(false); load();
  }

  function clearAll() { setSalesReps([]); setCcSetters([]); setInstallers([]); setStatuses([]); setCustomerQ(""); setStartDate(""); setEndDate(""); }

  const containerStyle: React.CSSProperties = { height: `calc(100dvh - ${PORTAL_HEADER_PX}px)`, maxHeight: `calc(100dvh - ${PORTAL_HEADER_PX}px)` };

  return (
    <div className="min-h-0 flex flex-col overflow-hidden bg-[#F5F7F9] p-4" style={containerStyle}>
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-[#EBEFF3] shadow-sm overflow-hidden">
      {/* Sticky top: filters */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#EBEFF3]">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1c48a6] to-[#7096e6] flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#000000] tracking-tight">Sales</h2>
                <p className="text-xs text-[#6B7280]">Click to preview · Double-click to edit</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {/* View Toggle */}
              <div className="flex rounded-lg border-2 border-[#1c48a6]/30 overflow-hidden shadow-sm">
                <button
                  type="button"
                  className={`px-5 py-2 text-sm font-bold transition-colors ${viewMode === "kanban" ? "bg-[#1c48a6] text-white" : "bg-white text-[#1c48a6] hover:bg-[#1c48a6]/5"}`}
                  onClick={() => setViewMode("kanban")}
                >
                  Board
                </button>
                <button
                  type="button"
                  className={`px-5 py-2 text-sm font-bold transition-colors ${viewMode === "list" ? "bg-[#1c48a6] text-white" : "bg-white text-[#1c48a6] hover:bg-[#1c48a6]/5"}`}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
              </div>
              {!scopeLoading && effectiveScope !== "all" && (
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                  effectiveScope === "team" ? "border-purple-200 bg-purple-50 text-purple-700" :
                  effectiveScope === "own" ? "border-blue-200 bg-blue-50 text-blue-700" :
                  "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280]"
                }`}>
                  {effectiveScope === "team" ? "Showing: Your team's deals" :
                   effectiveScope === "own" ? "Showing: Your deals only" :
                   "Showing: No access"}
                </span>
              )}
              <span className={UI.pill}>{loading ? "Loading..." : `${visibleDealCount} deals`}</span>
              <button className={UI.buttonGhost} onClick={load}>Refresh</button>
              <button className={UI.buttonGhost} onClick={clearAll}>Clear Filters</button>
              <button
                className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                  showInactive
                    ? "border-[#1c48a6]/30 bg-[#1c48a6]/5 text-[#1c48a6] hover:bg-[#1c48a6]/10"
                    : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                }`}
                onClick={() => setShowInactive(v => !v)}
              >
                Inactive {showInactive ? "ON" : "OFF"}
              </button>
              <button
                className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                  showPaid
                    ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981] hover:bg-[#10B981]/10"
                    : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                }`}
                onClick={() => setShowPaid(v => !v)}
              >
                Paid {showPaid ? "ON" : "OFF"}
              </button>
              {viewMode === "list" && (
                <>
                {[
                  { id: "contacts",   label: "Contacts" },
                  { id: "other_jobs", label: "Other Jobs" },
                  { id: "permitting", label: "Permitting" },
                  { id: "hoa_detail", label: "HOA" },
                  { id: "utilities",  label: "Utilities" },
                  { id: "nrg_adders", label: "NRG Adders" },
                ].map(g => (
                  <button
                    key={g.id}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                      expandedGroups.has(g.id)
                        ? "border-[#1c48a6]/30 bg-[#1c48a6]/5 text-[#1c48a6] hover:bg-[#1c48a6]/10"
                        : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                    }`}
                    onClick={() => toggleGroup(g.id)}
                  >
                    {g.label} {expandedGroups.has(g.id) ? "ON" : "OFF"}
                  </button>
                ))}
                </>
              )}
              <button className={UI.buttonPrimary} onClick={openNew}>+ Add Deal</button>
            </div>
          </div>

          {msg && <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">{msg}</div>}

          <div className={`${UI.card} p-3`}>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Customer Name</div>
                <input className={UI.control} value={customerQ} onChange={e => setCustomerQ(e.target.value)} placeholder="Search..." />
              </div>
              <MultiSelect label="Sales Rep" options={options.salesReps} selected={salesReps} onChange={setSalesReps} />
              <MultiSelect label="CC Setter" options={options.ccSetters} selected={ccSetters} onChange={setCcSetters} />
              <MultiSelect label="Installer" options={options.installers} selected={installers} onChange={setInstallers} />
              <MultiSelect label="Status" options={options.statuses} selected={statuses} onChange={setStatuses} />
              <div>
                <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Start Date</div>
                <input type="date" className={UI.control} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">End Date</div>
                <input type="date" className={UI.control} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content: Kanban Board or Table */}
      {viewMode === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-h-0 overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[#6B7280] text-sm">Loading deals...</div>
              ) : (
                <div className="flex h-full divide-x divide-[#EBEFF3]">
                  {/* Active stages */}
                  {visibleActiveStages.map(stage => (
                    <StageColumn
                      key={stage.key}
                      stage={stage}
                      deals={dealsByStage.get(stage.key) ?? []}
                      onCardClick={(d) => setSummaryDeal(d)}
                      onCardDoubleClick={openEdit}
                    />
                  ))}
                  {/* Divider between active and inactive */}
                  {showInactive && (
                    <>
                      <div className="flex-shrink-0" style={{ width: 8, minWidth: 8, backgroundColor: "#EBEFF3" }} />
                      {/* Inactive stages */}
                      {INACTIVE_STAGES.map(stage => (
                        <StageColumn
                          key={stage.key}
                          stage={stage}
                          deals={dealsByStage.get(stage.key) ?? []}
                          onCardClick={(d) => setSummaryDeal(d)}
                          onCardDoubleClick={openEdit}
                          inactive
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Summary Panel (kanban) */}
            {summaryDeal && (
              <DealSummaryPanel deal={summaryDeal} onClose={() => setSummaryDeal(null)} onOpenEdit={(d) => { setSummaryDeal(null); openEdit(d); }} panelRef={summaryPanelRef} />
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragDeal ? <DealCardOverlay deal={activeDragDeal} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* List Summary Bar */}
          {!loading && displayRows.length > 0 && (
            <ListSummaryBar stageStats={listSummary.stageStats} totals={listSummary.totals} milestoneAgg={listSummary.milestoneAgg} />
          )}
          <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: visibleColumns.reduce((s, c) => s + getColWidth(c), 0) }}>
              <thead className="sticky top-0 z-10 bg-[#F5F7F9] border-b border-[#EBEFF3]">
                <tr className="text-left text-[#000000]">
                  {visibleColumns.map((col, i) => (
                    <th key={col.key}
                      className={`px-2 py-2 border-r border-[#EBEFF3] font-semibold select-none hover:bg-[#EBEFF3] transition-colors text-[11px] leading-tight ${i === visibleColumns.length - 1 ? "border-r-0" : ""} ${col.type === "money" || col.type === "num" ? "text-right" : ""}`}
                      style={{ width: getColWidth(col) }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.groupParent && (
                          <button
                            type="button"
                            className="text-[10px] text-[#6B7280] hover:text-[#000000] transition-colors px-0.5"
                            onClick={(e) => { e.stopPropagation(); toggleGroup(col.groupParent!); }}
                            title={expandedGroups.has(col.groupParent!) ? "Collapse sub-columns" : "Expand sub-columns"}
                          >
                            {expandedGroups.has(col.groupParent!) ? "\u25BC" : "\u25B6"}
                          </button>
                        )}
                        <span className="cursor-pointer" onClick={() => handleSort(col)}>{col.label}</span>
                        <span className="cursor-pointer" onClick={() => handleSort(col)}>
                          {sortKey === col.key
                            ? <span className="text-[10px]">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
                            : <span className="text-[10px] text-[#EBEFF3]">{"\u21C5"}</span>}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-2 py-8 text-[#6B7280] text-center" colSpan={visibleColumns.length}>Loading deals...</td></tr>
                ) : displayRows.length === 0 ? (
                  <tr><td className="px-2 py-8 text-[#6B7280] text-center" colSpan={visibleColumns.length}>No results.</td></tr>
                ) : (
                  displayRows.map((r, rowIdx) => {
                    const prog = getProgress(r);
                    const rowStageKey = getDealStage(r);
                    const rowStage = PIPELINE_STAGES.find(s => s.key === rowStageKey) ?? PIPELINE_STAGES[0];
                    return (
                    <tr key={r.id}
                      onClick={() => {
                        if (rowClickTimer.current) { clearTimeout(rowClickTimer.current); rowClickTimer.current = null; openEdit(r); return; }
                        rowClickTimer.current = setTimeout(() => { rowClickTimer.current = null; setSummaryDeal(r); }, 250);
                      }}
                      className={`border-b border-[#EBEFF3] hover:bg-[#1c48a6]/5 cursor-pointer transition-colors ${rowIdx % 2 === 1 ? "bg-[#F9FAFB]" : "bg-white"}`}
                    >
                      {visibleColumns.map(col => {
                        /* Stage badge cell */
                        if (col.key === "__stage") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3]">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                              style={{ backgroundColor: rowStage.bg, color: rowStage.dot, border: `1px solid ${rowStage.dot}30` }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rowStage.dot }} />
                              {rowStage.label}
                            </span>
                          </td>
                        );
                        /* Address (computed) cell */
                        if (col.key === "__address") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3]">
                            <div className="truncate">{[r.street_address, r.city, r.postal_code, r.state].filter(Boolean).join(", ")}</div>
                          </td>
                        );
                        /* Progress bar cell */
                        if (col.key === "__progress") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3] text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-12 h-1.5 rounded-full bg-[#EBEFF3] overflow-hidden">
                                <div className={`h-full rounded-full ${progressBg(prog.pct)} transition-all`} style={{ width: `${prog.pct}%` }} />
                              </div>
                              <span className={`text-[10px] font-bold tabular-nums ${progressColor(prog.pct)}`}>{prog.pct}%</span>
                            </div>
                          </td>
                        );
                        /* Milestone dots cell */
                        if (col.key === "__milestones") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3]">
                            <div className="flex items-center justify-center gap-1">
                              {MILESTONES.map(m => (
                                <div key={m.key} title={`${m.short}: ${r[m.key] ? fmtDate(r[m.key] as string) : "Pending"}`}
                                  className="w-2 h-2 rounded-full transition-colors"
                                  style={{ backgroundColor: r[m.key] ? "#1c48a6" : "#E5E7EB" }} />
                              ))}
                            </div>
                          </td>
                        );
                        /* Standard cell */
                        return (
                          <td key={col.key} className={`px-2 py-2 border-r border-[#EBEFF3] ${col.type === "money" || col.type === "num" ? "text-right tabular-nums" : ""}`}>
                            <div className="truncate">{cellVal(r, col)}</div>
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Summary Panel (list view) */}
          {summaryDeal && (
            <DealSummaryPanel deal={summaryDeal} onClose={() => setSummaryDeal(null)} onOpenEdit={(d) => { setSummaryDeal(null); openEdit(d); }} panelRef={summaryPanelRef} />
          )}
        </div>
        </div>
      )}

      </div>{/* end rounded card wrapper */}

      {/* Edit Dialog */}
      {editRow && (
        <EditDialog
          isNew={isNew}
          editRow={editRow}
          editDraft={editDraft}
          editMsg={editMsg}
          saving={saving}
          editTab={editTab}
          setEditTab={setEditTab}
          setField={setField}
          saveEdit={saveEdit}
          onClose={() => { setEditRow(null); setIsNew(false); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EDIT DIALOG — Tabbed layout
   Tab 0: Sales & Contract
   Tab 1: Finance
   Tab 2: Status & Stage
   ═══════════════════════════════════════════════════════════ */

const EDIT_TABS = ["Sales & Contract", "Finance", "Status & Stage"] as const;

type EditFieldDef = { label: string; key: keyof DealRow; type: "text" | "money" | "num" | "date" | "select"; options?: string[] };

/* ── Tab 0: Customer Details ── */
const TAB0_CUSTOMER: EditFieldDef[] = [
  { label: "First Name", key: "first_name",    type: "text" },
  { label: "Last Name",  key: "last_name",     type: "text" },
  { label: "Phone",      key: "phone_number",  type: "text" },
  { label: "Email",      key: "email_address",  type: "text" },
];
const TAB0_ADDRESS: EditFieldDef[] = [
  { label: "Street Address", key: "street_address", type: "text" },
  { label: "City",           key: "city",            type: "text" },
  { label: "State",          key: "state",           type: "text" },
  { label: "Postal Code",    key: "postal_code",     type: "text" },
];
const TAB0_SALE_TYPE: EditFieldDef[] = [
  { label: "Sale Type", key: "sale_type", type: "select", options: ["Call Center Deal", "D2D", "Referral"] },
];
const TAB0_SYSTEM: EditFieldDef[] = [
  { label: "Battery Job",      key: "battery_job",      type: "select", options: ["Yes", "No"] },
  { label: "Type of Roof",     key: "type_of_roof",     type: "text" },
  { label: "Panel Type",       key: "panel_type",        type: "text" },
  { label: "Panel Amount",     key: "panel_amount",      type: "num" },
  { label: "Roof Work Needed", key: "roof_work_needed",  type: "select", options: ["Yes", "No"] },
];
const TAB0_ROOF_PROGRESS: EditFieldDef[] = [
  { label: "Roof Work Progress", key: "roof_work_progress", type: "text" },
];

/* ── Tab 0: Sales & Contract ── */
const TAB0_SALES: EditFieldDef[] = [
  { label: "Date Closed",   key: "date_closed",   type: "date" },
  { label: "Customer Name", key: "customer_name",  type: "text" },
  { label: "Company",       key: "company",        type: "text" },
  { label: "Teams",         key: "teams",          type: "text" },
];
const TAB0_REPS: EditFieldDef[] = [
  { label: "Sales Rep",          key: "sales_rep",                      type: "text" },
  { label: "Appointment Setter", key: "appointment_setter",             type: "text" },
  { label: "CC App Setter",      key: "call_center_appointment_setter", type: "text" },
];
const TAB0_CONTRACT: EditFieldDef[] = [
  { label: "KW System",          key: "kw_system",              type: "num" },
  { label: "Agent Cost Basis",   key: "agent_cost_basis_sold_at", type: "money" },
  { label: "Net $/W",            key: "net_price_per_watt",     type: "num" },
  { label: "Contract Value",     key: "contract_value",         type: "money" },
  { label: "Total Adders",       key: "total_adders",           type: "money" },
  { label: "Contract Net Price", key: "contract_net_price",     type: "money" },
];

/* ── Tab 1: Finance ── */
const TAB1_REV: EditFieldDef[] = [
  { label: "Rev", key: "rev", type: "money" },
];
const TAB1_NRG: EditFieldDef[] = [
  { label: "NRG P2 Rev Date",   key: "paid_nova_nrg_p2_rev_date",        type: "date" },
  { label: "NRG P1+P2 Rev Amt", key: "paid_nova_nrg_p1_p2_rev_amount",   type: "money" },
  { label: "NRG Post-P2 Date",  key: "paid_nova_nrg_post_p2_date",       type: "date" },
  { label: "NRG Post-P2 Amt",   key: "paid_nova_nrg_post_p2_rev_amount", type: "money" },
  { label: "NRG Reversal Date", key: "nova_nrg_reversal_date",           type: "date" },
  { label: "NRG Reversal Amt",  key: "nova_nrg_reversal_amount",         type: "money" },
  { label: "NRG Fee Amt",       key: "nova_nrg_fee_amount",              type: "money" },
  { label: "NRG After Fee",     key: "nova_nrg_rev_after_fee_amount",    type: "money" },
];
const TAB1_GROSS: EditFieldDef[] = [
  { label: "Gross Profit", key: "gross_profit", type: "money" },
];
const TAB1_VIS_HEADER: EditFieldDef[] = [
  { label: "Visionary Commission", key: "visionary_paid_out_commission", type: "money" },
];
const TAB1_VIS: EditFieldDef[] = [
  { label: "Vis P2 Date",       key: "paid_visionary_p2_date",       type: "date" },
  { label: "Vis P1+P2 Amt",     key: "paid_visionary_p1_p2_amount",  type: "money" },
  { label: "Vis Post-P2 Date",  key: "paid_visionary_post_p2_date",  type: "date" },
  { label: "Vis Post-P2 Amt",   key: "paid_visionary_post_p2_amount",type: "money" },
  { label: "Vis Reversal Date", key: "p1_visionary_reversal_date",   type: "date" },
  { label: "Vis Reversal Amt",  key: "p1_visionary_reversal_amount", type: "money" },
  { label: "Vis Fee Amt",       key: "visionary_fee_amount",         type: "money" },
  { label: "Vis After Fee",     key: "visionary_rev_after_fee_amount",type: "money" },
];
const TAB1_AGENT_HEADER: EditFieldDef[] = [
  { label: "Agent Payout", key: "agent_payout", type: "money" },
];
const TAB1_AGENT: EditFieldDef[] = [
  { label: "Agent P2 Date",       key: "paid_agent_p2_date",       type: "date" },
  { label: "Agent P1+P2 Amt",     key: "paid_agent_p1_p2_amount",  type: "money" },
  { label: "Agent Post-P2 Date",  key: "paid_agent_post_p2_date",  type: "date" },
  { label: "Agent Post-P2 Amt",   key: "paid_agent_post_p2_amount",type: "money" },
  { label: "Agent Reversal Date", key: "p1_agent_reversal_date",   type: "date" },
  { label: "Agent Reversal Amt",  key: "p1_agent_reversal_amount", type: "money" },
  { label: "Agent Fee Amt",       key: "agent_fee_amount",         type: "money" },
  { label: "Agent After Fee",     key: "agent_rev_after_fee_amount",type: "money" },
];
const TAB1_MGR: EditFieldDef[] = [
  { label: "Manager",   key: "manager",        type: "text" },
  { label: "Manager $", key: "manager_amount",  type: "money" },
];
const TAB1_MISC: EditFieldDef[] = [
  { label: "NRG Customer Adders", key: "nova_nrg_customer_adders", type: "money" },
  { label: "Owed Money",          key: "owed_money",               type: "money" },
  { label: "Paid Bonus",          key: "paid_bonus",               type: "money" },
];

/* ── Tab 2: Status & Stage ── */
const TAB2_TOP: EditFieldDef[] = [
  { label: "Activated",   key: "activated",   type: "text" },
  { label: "Online Deal", key: "online_deal", type: "text" },
  { label: "CC Lead",     key: "call_center_lead", type: "text" },
];
const TAB2_STATUS: EditFieldDef[] = [
  { label: "Status", key: "status", type: "text" },
];
const TAB2_PERMIT: EditFieldDef[] = [
  { label: "AHJ Info",          key: "permit_ahj_info",  type: "text" },
  { label: "Permit Status",     key: "permit_status",     type: "select", options: ["Submitted", "Revision", "Completed"] },
  { label: "Permit Fees",       key: "permit_fees",       type: "money" },
  { label: "Permit Fees Paid",  key: "permit_fees_paid",  type: "select", options: ["Yes", "No"] },
  { label: "Permit No.",        key: "permit_number",     type: "text" },
];
const TAB2_HOA_SELECT: EditFieldDef[] = [
  { label: "HOA", key: "hoa", type: "select", options: ["Yes", "No"] },
];
const TAB2_HOA_DETAILS: EditFieldDef[] = [
  { label: "HOA Name",            key: "hoa_name",             type: "text" },
  { label: "HOA Forms Completed", key: "hoa_forms_completed",  type: "select", options: ["Yes", "Not Yet", "Processing"] },
];
const TAB2_MILESTONES: EditFieldDef[] = [
  { label: "Survey Date",        key: "site_survey_date_completed", type: "date" },
  { label: "Survey Status",      key: "site_survey_status",         type: "text" },
  { label: "Design Ready",       key: "design_ready_date",          type: "date" },
  { label: "Permit Submitted",   key: "permit_submitted_date",      type: "date" },
  { label: "Permit Approved",    key: "permit_approved_date",       type: "date" },
  { label: "Install 1 (Racks)",  key: "install_1_racks_date",       type: "date" },
  { label: "Install 2 (Panels)", key: "install_2_panel_landed_date",type: "date" },
  { label: "PTO",                key: "pto_date",                   type: "date" },
];
const TAB2_PAID: EditFieldDef[] = [
  { label: "Paid", key: "paid_date", type: "date" },
];

/* ── Reusable field input renderer ── */
function FieldInput({ field, value, onChange }: { field: EditFieldDef; value: unknown; onChange: (key: string, val: string) => void }) {
  const displayVal = value == null ? "" : String(value);
  const cls = "w-full border border-[#EBEFF3] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#7096e6]/40";
  return (
    <div>
      <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-0.5">{field.label}</label>
      {field.type === "select" && field.options ? (
        <select className={cls} value={displayVal} onChange={e => onChange(field.key, e.target.value)}>
          <option value="">— Select —</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : field.type === "date" ? (
        <input type="date" className={cls} value={displayVal ? displayVal.slice(0, 10) : ""} onChange={e => onChange(field.key, e.target.value)} />
      ) : field.type === "money" || field.type === "num" ? (
        <input type="number" step="any" className={`${cls} text-right`} value={displayVal} onChange={e => onChange(field.key, e.target.value)} />
      ) : (
        <input className={cls} value={displayVal} onChange={e => onChange(field.key, e.target.value)} />
      )}
    </div>
  );
}

/* ── Section header ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full text-[11px] font-bold text-[#000000] uppercase tracking-wider border-b border-[#EBEFF3] pb-1 mt-2">{children}</div>;
}

/* ── Tabbed edit dialog ── */
function EditDialog({ isNew, editRow, editDraft, editMsg, saving, editTab, setEditTab, setField, saveEdit, onClose }: {
  isNew: boolean;
  editRow: DealRow;
  editDraft: Record<string, any>;
  editMsg: string | null;
  saving: boolean;
  editTab: 0 | 1 | 2;
  setEditTab: (t: 0 | 1 | 2) => void;
  setField: (key: string, value: string) => void;
  saveEdit: () => void;
  onClose: () => void;
}) {
  const renderFields = (fields: EditFieldDef[]) =>
    fields.map(f => <FieldInput key={f.key} field={f} value={editDraft[f.key]} onChange={setField} />);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBEFF3] flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-[#000000]">{isNew ? "New Deal" : "Edit Deal"}</div>
            <div className="text-[10px] text-[#6B7280]">{isNew ? "Fill in the fields below to create a new deal" : `${editDraft.customer_name ?? "Untitled"} \u00B7 ${editDraft.sales_rep ?? "No rep"} \u00B7 ID: ${editRow.id.slice(0, 8)}`}</div>
          </div>
          <button className="text-[#6B7280] hover:text-[#000000] text-lg" onClick={onClose}>{"\u2715"}</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#EBEFF3] px-5 flex-shrink-0">
          {EDIT_TABS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`px-4 py-2.5 text-xs font-semibold transition-colors relative ${
                editTab === i
                  ? "text-[#000000]"
                  : "text-[#6B7280] hover:text-[#000000]"
              }`}
              onClick={() => setEditTab(i as 0 | 1 | 2)}
            >
              {label}
              {editTab === i && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1c48a6] rounded-full" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {editTab === 0 && (
            <div className="space-y-1">
              <SectionLabel>Customer Info</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">{renderFields(TAB0_CUSTOMER)}</div>
              <SectionLabel>Address</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_ADDRESS)}</div>
              <SectionLabel>Sale Type</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_SALE_TYPE)}</div>
              <SectionLabel>Sales Info</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_SALES)}</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-3">{renderFields(TAB0_REPS)}</div>
              <SectionLabel>Contract Info</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_CONTRACT)}</div>
              <SectionLabel>System Details</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_SYSTEM)}</div>
              {editDraft.roof_work_needed === "Yes" && (
                <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-2">{renderFields(TAB0_ROOF_PROGRESS)}</div>
              )}
            </div>
          )}

          {editTab === 1 && (
            <div className="space-y-1">
              <SectionLabel>Revenue (NRG)</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB1_REV)}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-2">{renderFields(TAB1_NRG)}</div>

              <SectionLabel>Gross Profit</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB1_GROSS)}</div>

              <SectionLabel>Visionary</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB1_VIS_HEADER)}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-2">{renderFields(TAB1_VIS)}</div>

              <SectionLabel>Agent Payout</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB1_AGENT_HEADER)}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-2">{renderFields(TAB1_AGENT)}</div>

              <SectionLabel>Management & Other</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB1_MGR)}</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-2">{renderFields(TAB1_MISC)}</div>
            </div>
          )}

          {editTab === 2 && (
            <div className="space-y-1">
              <SectionLabel>Deal Info</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_TOP)}</div>

              <SectionLabel>Status</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_STATUS)}</div>

              <SectionLabel>Permit Details</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_PERMIT)}</div>

              <SectionLabel>HOA</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_HOA_SELECT)}</div>
              {editDraft.hoa === "Yes" && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">{renderFields(TAB2_HOA_DETAILS)}</div>
              )}

              <SectionLabel>Milestones</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_MILESTONES)}</div>

              <SectionLabel>Completion</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_PAID)}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#EBEFF3] bg-[#F5F7F9] rounded-b-xl flex-shrink-0">
          {editMsg && <div className="text-xs text-amber-600">{editMsg}</div>}
          {!editMsg && <div />}
          <div className="flex gap-2">
            <button className={UI.buttonGhost} onClick={onClose}>Cancel</button>
            <button className={UI.buttonPrimary} onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : isNew ? "Create Deal" : "Save Changes"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
