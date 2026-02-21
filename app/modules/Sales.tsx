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
  /* Payment dates */
  manager_paid_date: string | null;
  paid_agent_p1_date: string | null;
  /* Milestones */
  design_ready_date: string | null; design_submitted_date: string | null;
  permit_submitted_date: string | null;
  permit_approved_date: string | null; install_1_racks_date: string | null;
  install_2_panel_landed_date: string | null; pto_date: string | null; paid_date: string | null;
  /* Deal source */
  deal_source: string | null;
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

type SmartListConfig = {
  salesReps: string[];
  salesManagers: string[];
  ccManagers: string[];
  ccSetters: string[];
  installers: string[];
  statuses: string[];
  stages: string[];
  customerQ: string;
  startDate: string;
  endDate: string;
  paymentFilter: "in_progress" | "partially_paid" | "fully_paid";
  eraMode: "solar2" | "solar1" | "solar_all";
  hideHold: boolean;
  hideCancel: boolean;
  expandedGroups: string[];
  hiddenColumns: string[];
};

type SmartList = {
  id: string;
  user_id: string;
  name: string;
  config: SmartListConfig;
  created_at: string;
  updated_at: string;
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
  "manager_paid_date","paid_agent_p1_date",
].join(",");

/* ─── Milestones (10-step pipeline) ─── */
const MILESTONES: { key: keyof DealRow; short: string; label: string }[] = [
  { key: "date_closed",                short: "Closed",    label: "Date Closed" },
  { key: "site_survey_date_completed", short: "Survey",    label: "Site Survey" },
  { key: "design_submitted_date",      short: "Des Sub",   label: "Design Submitted" },
  { key: "design_ready_date",          short: "Des Ready", label: "Design Ready" },
  { key: "permit_submitted_date",      short: "Perm Sub",  label: "Permit Submitted" },
  { key: "permit_approved_date",       short: "Perm App",  label: "Permit Approved" },
  { key: "install_1_racks_date",       short: "Racks",     label: "Install Racks" },
  { key: "install_2_panel_landed_date",short: "Panels",    label: "Install Panels" },
  { key: "pto_date",                   short: "PTO",       label: "Paid PTO" },
  { key: "paid_date",                  short: "Paid",      label: "Final Payment" },
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
  /* Active stages */
  { key: "on_hold",           label: "On-Hold",            milestoneKey: null,                          dot: "#EAB308", bg: "#FEF9C3" },
  { key: "new",               label: "New",                milestoneKey: null,                          dot: "#9CA3AF", bg: "#F3F4F6" },
  { key: "survey",            label: "Site Survey",        milestoneKey: "site_survey_date_completed",  dot: "#3B82F6", bg: "#EFF6FF" },
  { key: "design_submitted",  label: "Design Submitted",   milestoneKey: "design_submitted_date",       dot: "#7C3AED", bg: "#F5F3FF" },
  { key: "design",            label: "Design Ready",       milestoneKey: "design_ready_date",           dot: "#8B5CF6", bg: "#EDE9FE" },
  { key: "permit_submitted",  label: "Permit Submitted",   milestoneKey: "permit_submitted_date",       dot: "#F59E0B", bg: "#FFFBEB" },
  { key: "permit_approved",   label: "Permit Approved",    milestoneKey: "permit_approved_date",        dot: "#10B981", bg: "#ECFDF5" },
  { key: "install_1",         label: "Install 1 (Racks)",  milestoneKey: "install_1_racks_date",        dot: "#06B6D4", bg: "#ECFEFF" },
  { key: "install_2",         label: "Install 2 (Panels)", milestoneKey: "install_2_panel_landed_date", dot: "#0891B2", bg: "#ECFEFF" },
  { key: "pto",               label: "PTO",                milestoneKey: "pto_date",                    dot: "#EC4899", bg: "#FDF2F8" },
  { key: "partially_paid",    label: "Partially Paid",     milestoneKey: null,                          dot: "#F97316", bg: "#FFF7ED" },
  { key: "paid",              label: "Paid",               milestoneKey: "paid_date",                   dot: "#10B981", bg: "#ECFDF5" },
  /* Inactive stages */
  { key: "cancelled",  label: "Cancelled",  milestoneKey: null, dot: "#EF4444", bg: "#FEF2F2", inactive: true },
  { key: "won",        label: "Won",        milestoneKey: null, dot: "#10B981", bg: "#ECFDF5", inactive: true },
  { key: "abandoned",  label: "Abandoned",  milestoneKey: null, dot: "#9CA3AF", bg: "#F3F4F6", inactive: true },
];

const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => !s.inactive);
const INACTIVE_STAGES = PIPELINE_STAGES.filter(s => s.inactive);
const INACTIVE_STAGE_KEYS = new Set(INACTIVE_STAGES.map(s => s.key));

/* Maps stage index to last MILESTONES index that should be filled (inclusive).
   Milestone 0 (date_closed) is a starting marker — drag logic skips it.
   Stage 0 (On-Hold) = -1, 1 (New) = -1, 2 (Site Survey) = 1, 3 (Des Sub) = 2,
   4 (Des Ready) = 3, 5 (Perm Sub) = 4, 6 (Perm App) = 5, 7 (Install 1) = 6,
   8 (Install 2) = 7, 9 (PTO) = 8, 10 (Part Paid) = -1, 11 (Paid) = 9 */
const STAGE_MILESTONE_END = [-1, -1, 1, 2, 3, 4, 5, 6, 7, 8, -1, 9];

function getDealStage(row: DealRow): string {
  const status = (row.status ?? "").trim().toLowerCase();

  /* 1. Cancelled/Canceled → always cancelled regardless of date */
  if (status === "cancelled" || status === "canceled") return "cancelled";

  /* 2. On-Hold */
  if (status === "on-hold" || status === "on hold") return "on_hold";

  /* 3. Legacy deals (closed before Solar 2.0 cutoff) */
  if (row.date_closed && row.date_closed < "2024-08-01") {
    if (status === "p2 paid") return "won";
    return "abandoned";
  }

  /* 4. Partial P2 Paid → partially_paid */
  if (status === "partial p2 paid") return "partially_paid";

  /* 5. P2 Paid → paid */
  if (status === "p2 paid") return "paid";

  /* 6. Active milestone walk (skip on_hold/new, walk from end) */
  for (let i = ACTIVE_STAGES.length - 1; i >= 2; i--) {
    const stage = ACTIVE_STAGES[i];
    if (stage.milestoneKey !== null && row[stage.milestoneKey]) return stage.key;
  }

  /* 7. Default */
  return "new";
}

/* ─── Column definitions with collapsible group support ─── */
type ColDef = {
  label: string;
  key: keyof DealRow | "__progress" | "__milestones" | "__stage" | "__address" | "__sales_manager" | "__cc_manager" | "__total_commissions" | "__cc_mgr_comm" | "__cc_mgr_date" | "__cc_agent_comm" | "__cc_agent_date";
  type: "text" | "money" | "num" | "date";
  group?: string;
  groupParent?: string;
  computed?: boolean;
};

const ALL_COLUMNS: ColDef[] = [
  /* ── Stage (computed) ── */
  { label: "Stage", key: "__stage" as ColDef["key"], type: "text", computed: true },
  /* ── Core deal info ── */
  { label: "Date Closed",        key: "date_closed",                    type: "date" },
  { label: "Customer Name",      key: "customer_name",                  type: "text" },

  /* ── Contacts (toolbar toggle) ── */
  { label: "Phone",   key: "phone_number",                  type: "text", group: "contacts" },
  { label: "Email",   key: "email_address",                 type: "text", group: "contacts" },
  { label: "Address", key: "__address" as ColDef["key"],    type: "text", group: "contacts", computed: true },

  /* ── Sale Type ── */
  { label: "Sale Type", key: "sale_type", type: "text" },

  { label: "Installer",         key: "company",                        type: "text" },
  { label: "Sales Manager",     key: "__sales_manager" as ColDef["key"], type: "text", computed: true },
  { label: "Sales Rep",          key: "sales_rep",                      type: "text" },
  { label: "Appointment Setter", key: "appointment_setter",             type: "text" },
  { label: "CC Manager",        key: "__cc_manager" as ColDef["key"],   type: "text", computed: true },
  { label: "CC App Setter",      key: "call_center_appointment_setter", type: "text" },

  { label: "KW System",              key: "kw_system",                      type: "num" },
  { label: "Agent Cost Basis",       key: "agent_cost_basis_sold_at",       type: "money" },
  { label: "Net $/W",                key: "net_price_per_watt",             type: "num" },
  { label: "Contract EPC Amount",    key: "contract_value",                 type: "money" },
  { label: "Net Contract EPC Amount",key: "contract_net_price",             type: "money" },

  /* ── Revenue (plain column, no sub-columns) ── */
  { label: "Revenue",           key: "rev",                            type: "money" },

  /* ── Total Commissions (collapsible) ── */
  { label: "Total Commissions",  key: "__total_commissions" as ColDef["key"], type: "money", groupParent: "total_commissions", computed: true },
  { label: "Manager Commissions",key: "manager_amount",               type: "money", group: "total_commissions" },
  { label: "Manager Date Paid",  key: "manager_paid_date",            type: "date",  group: "total_commissions" },
  { label: "Agent Commissions",  key: "agent_payout",                 type: "money", group: "total_commissions" },
  { label: "Agent Date Paid",    key: "paid_agent_p1_date",           type: "date",  group: "total_commissions" },
  { label: "CC Manager Comm",    key: "__cc_mgr_comm" as ColDef["key"],  type: "money", group: "total_commissions", computed: true },
  { label: "CC Manager Date Paid",key: "__cc_mgr_date" as ColDef["key"], type: "date",  group: "total_commissions", computed: true },
  { label: "CC Agent Comm",      key: "__cc_agent_comm" as ColDef["key"], type: "money", group: "total_commissions", computed: true },
  { label: "CC Agent Date Paid", key: "__cc_agent_date" as ColDef["key"], type: "date",  group: "total_commissions", computed: true },

  /* ── Gross Profit ── */
  { label: "Gross Profit", key: "gross_profit", type: "money" },

  /* ── Deductions (toolbar toggle) ── */
  { label: "Owed Money",        key: "owed_money",                   type: "money", group: "deductions" },
  { label: "Fee Charges",       key: "fee_charges",                  type: "money", group: "deductions" },
  { label: "Paid Bonus",        key: "paid_bonus",                   type: "money", group: "deductions" },

  /* ── Remaining always-visible columns ── */
  { label: "State",             key: "state",                        type: "text" },
  { label: "Status",            key: "status",                       type: "text" },
  { label: "CC Lead",           key: "call_center_lead",             type: "text" },
  { label: "Survey Date",       key: "site_survey_date_completed",   type: "date" },
  { label: "Survey Status",     key: "site_survey_status",           type: "text" },

  /* ── Battery Jobs (toolbar toggle) ── */
  { label: "Battery Job",        key: "battery_job",        type: "text", group: "battery_jobs" },

  /* ── Roof Jobs (toolbar toggle) ── */
  { label: "Type of Roof",       key: "type_of_roof",       type: "text", group: "roof_jobs" },
  { label: "Roof Work Needed",   key: "roof_work_needed",   type: "text", group: "roof_jobs" },
  { label: "Roof Work Progress", key: "roof_work_progress", type: "text", group: "roof_jobs" },

  /* ── Design (toolbar toggle) ── */
  { label: "Design Submitted",  key: "design_submitted_date", type: "date", group: "design" },
  { label: "Design Ready",      key: "design_ready_date",     type: "date", group: "design" },
  { label: "Panel Type",        key: "panel_type",             type: "text", group: "design" },
  { label: "Panel Amount",      key: "panel_amount",           type: "num",  group: "design" },

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
  { label: "Progress",   key: "__progress" as ColDef["key"],   type: "text", computed: true },
  { label: "Milestones", key: "__milestones" as ColDef["key"],  type: "text", computed: true },

  /* ── Hidden: included in EDIT_COLUMNS for save, not shown in list ── */
  { label: "First Name",      key: "first_name",      type: "text",  group: "_save_only" },
  { label: "Last Name",       key: "last_name",       type: "text",  group: "_save_only" },
  { label: "Street Address",  key: "street_address",  type: "text",  group: "_save_only" },
  { label: "City",            key: "city",             type: "text",  group: "_save_only" },
  { label: "Postal Code",     key: "postal_code",     type: "text",  group: "_save_only" },
  { label: "Country",         key: "country",          type: "text",  group: "_save_only" },
  { label: "Permit Fees",     key: "permit_fees",      type: "money", group: "_save_only" },
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
  return { completed, total: MILESTONES.length, pct: Math.round((completed / MILESTONES.length) * 100) };
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
const NAME_KEYS = new Set(["customer_name","sales_rep","appointment_setter","call_center_appointment_setter","__sales_manager","__cc_manager"]);
const SHORT_KEYS = new Set(["state","call_center_lead","battery_job","roof_work_needed","hoa","hoa_forms_completed","permit_status","permit_fees_paid","ntp_status","ic_status","meter_status","survey_status","sale_type"]);
const LONG_KEYS = new Set(["email_address","company"]);
function getColWidth(col: ColDef): number {
  if (col.key === "__stage") return W.stage;
  if (col.key === "__progress") return W.progress;
  if (col.key === "__milestones") return W.milestones;
  if (col.key === "__address") return W.address;
  if (col.key === "__sales_manager") return W.name;
  if (col.key === "__cc_manager") return W.name;
  if (col.key === "__total_commissions") return W.money;
  if (col.key === "__cc_mgr_comm" || col.key === "__cc_agent_comm") return W.money;
  if (col.key === "__cc_mgr_date" || col.key === "__cc_agent_date") return W.date;
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

function StageColumn({ stage, deals, onCardClick, onCardDoubleClick, inactive, hideFinancials }: { stage: PipelineStage; deals: DealRow[]; onCardClick: (d: DealRow) => void; onCardDoubleClick: (d: DealRow) => void; inactive?: boolean; hideFinancials?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !!inactive });
  const colWidth = inactive ? 240 : 280;

  const totals = useMemo(() => {
    let cv = 0, rev = 0, comm = 0, gp = 0;
    for (const d of deals) { cv += d.contract_value ?? 0; rev += d.rev ?? 0; comm += d.visionary_paid_out_commission ?? 0; gp += d.gross_profit ?? 0; }
    return { cv, rev, comm, gp };
  }, [deals]);

  const m$ = (v: number) => hideFinancials ? "*****" : money(v);

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
        <div className="text-base font-bold text-[#000000] mt-1">{m$(totals.gp)} <span className="text-[10px] font-normal text-[#6B7280]">GP</span></div>
        <div className="flex gap-2 mt-0.5 text-[10px] text-[#6B7280]">
          <span>CV {m$(totals.cv)}</span>
          <span>Rev {m$(totals.rev)}</span>
          <span>Comm {m$(totals.comm)}</span>
        </div>
      </div>
      {/* Body */}
      <div className={`flex-1 overflow-y-auto p-2 space-y-2 transition-colors ${isOver && !inactive ? "bg-[#1c48a6]/5" : "bg-[#F5F7F9]"}`}>
        {deals.map(deal => (
          <DealCard key={deal.id} deal={deal} onCardClick={onCardClick} onCardDoubleClick={onCardDoubleClick} inactive={inactive} hideFinancials={hideFinancials} />
        ))}
        {deals.length === 0 && (
          <div className="text-center text-xs text-[#6B7280] py-6">No deals</div>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, onCardClick, onCardDoubleClick, inactive, hideFinancials }: { deal: DealRow; onCardClick: (d: DealRow) => void; onCardDoubleClick: (d: DealRow) => void; inactive?: boolean; hideFinancials?: boolean }) {
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
  const m$ = (v: number | null | undefined) => hideFinancials ? "*****" : money(v);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`group/card bg-white rounded-lg border border-[#EBEFF3] shadow-sm p-3 hover:shadow-md transition-shadow relative ${inactive ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
      onClick={handleClick}
    >
      {/* Tooltip on hover — lower-right of card */}
      <div className="absolute top-full right-0 mt-1 hidden group-hover/card:block z-50 pointer-events-none">
        <div className="bg-[#1F2937] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
          Age: {aging.totalDays}d | In stage: {aging.stageDays}d
        </div>
      </div>
      <div className="font-semibold text-sm text-[#000000] truncate">{deal.customer_name || "Untitled"}</div>
      {/* Primary: Gross Profit */}
      <div className="mt-1">
        <span className="text-[10px] text-[#6B7280]">GP </span>
        <span className="text-base font-bold text-[#1c48a6]">{m$(deal.gross_profit)}</span>
      </div>
      {/* Secondary: CV, Rev, Comm */}
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#6B7280]">
        <span>CV {m$(deal.contract_value)}</span>
        <span>Rev {m$(deal.rev)}</span>
        <span>Comm {m$(deal.visionary_paid_out_commission)}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#6B7280]">
        {deal.kw_system != null && <span>{numFmt(deal.kw_system)} kW</span>}
        {deal.sales_rep && <span className="truncate">{deal.sales_rep}</span>}
      </div>
      {/* Milestone bubbles — individual hover tooltip per bubble */}
      <div className="flex items-center gap-1 mt-2">
        {MILESTONES.map(m => (
          <div key={m.key} className="group/dot relative">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: deal[m.key] ? "#1c48a6" : "#E5E7EB" }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/dot:block z-50 pointer-events-none">
              <div className="bg-[#1F2937] text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                {m.label}{deal[m.key] ? ` ${fmtDate(deal[m.key] as string)}` : " — Pending"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DealCardOverlay({ deal }: { deal: DealRow }) {
  return (
    <div className="bg-white rounded-lg border-2 border-[#1c48a6] shadow-lg p-3" style={{ width: 264 }}>
      <div className="font-semibold text-sm text-[#000000] truncate">{deal.customer_name || "Untitled"}</div>
      <div className="mt-1">
        <span className="text-[10px] text-[#6B7280]">GP </span>
        <span className="text-base font-bold text-[#1c48a6]">{money(deal.gross_profit)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#6B7280]">
        <span>CV {money(deal.contract_value)}</span>
        <span>Rev {money(deal.rev)}</span>
        <span>Comm {money(deal.visionary_paid_out_commission)}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-[#6B7280]">
        {deal.kw_system != null && <span>{numFmt(deal.kw_system)} kW</span>}
        {deal.sales_rep && <span className="truncate">{deal.sales_rep}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {MILESTONES.map(m => (
          <div key={m.key} title={m.label} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: deal[m.key] ? "#1c48a6" : "#E5E7EB" }} />
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
type MilestoneAgg = { key: string; short: string; label: string; done: number; total: number };

/* ── SVG Pie Chart helper ── */
function PieChart({ slices, size = 80 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="#F3F4F6" /></svg>;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2; // start at top
  const paths: React.ReactNode[] = [];
  for (const sl of slices) {
    if (sl.value === 0) continue;
    const angle = (sl.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    if (sl.value === total) {
      paths.push(<circle key={sl.label} cx={cx} cy={cy} r={r} fill={sl.color}><title>{sl.label}: {sl.value}</title></circle>);
    } else {
      paths.push(
        <path key={sl.label} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={sl.color}>
          <title>{sl.label}: {sl.value}</title>
        </path>
      );
    }
    cumAngle += angle;
  }
  return <svg width={size} height={size}>{paths}</svg>;
}

function ListSummaryBar({ stageStats, totals, milestoneAgg, trendPeriod, setTrendPeriod }: {
  stageStats: StageStat[];
  totals: { count: number; value: number; gp: number; rev: number; comm: number; recent: number; prior: number; milestoneTotal: number; milestoneDone: number };
  milestoneAgg: MilestoneAgg[];
  trendPeriod: number;
  setTrendPeriod: (v: number) => void;
}) {
  const milestonePct = totals.milestoneTotal > 0 ? Math.round((totals.milestoneDone / totals.milestoneTotal) * 100) : 0;
  const trendDelta = totals.recent - totals.prior;
  const trendPctVal = totals.prior > 0 ? Math.round((trendDelta / totals.prior) * 100) : totals.recent > 0 ? 100 : 0;
  const periodLabel = trendPeriod === 7 ? "7d" : trendPeriod === 14 ? "14d" : trendPeriod === 30 ? "30d" : "90d";

  /* Pie slices for deal count by stage */
  const countSlices = stageStats.filter(s => s.count > 0).map(s => ({ value: s.count, color: s.stage.dot, label: s.stage.label }));
  /* Pie slices for value by stage */
  const valueSlices = stageStats.filter(s => s.value > 0).map(s => ({ value: s.value, color: s.stage.dot, label: s.stage.label }));

  /* Collapsible — default expanded */
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
        <div className="px-4 pb-3 space-y-2">

          {/* ── Row 1: KPI cards ── */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "0.6fr 1.2fr 1.2fr 1fr" }}>
            {/* Total Deals — narrower */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider">Total Deals</div>
              <div className="text-xl font-bold text-[#000000] mt-0.5 tabular-nums">{totals.count}</div>
              <div className="text-[9px] text-[#6B7280]">{stageStats.filter(s => !s.stage.inactive).length} active stages</div>
            </div>
            {/* Pipeline Value — highlight GP */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider">Pipeline Value</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-emerald-600 tabular-nums">{money(totals.gp)}</span>
                <span className="text-[9px] text-[#6B7280]">Gross Profit</span>
              </div>
              <div className="text-[9px] text-[#6B7280]">Avg {totals.count > 0 ? money(totals.gp / totals.count) : "$0"}/deal</div>
              <div className="flex gap-3 mt-0.5 text-[9px] text-[#6B7280]">
                <span>EPC: {money(totals.value)}</span>
                <span>Rev: {money(totals.rev)}</span>
                <span>Comm: {money(totals.comm)}</span>
              </div>
            </div>
            {/* Trend — with period selector */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider">Trend</div>
                <div className="flex rounded border border-[#EBEFF3] overflow-hidden">
                  {([7, 14, 30, 90] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`px-1 py-0.5 text-[8px] font-semibold transition ${trendPeriod === p ? "bg-[#1c48a6] text-white" : "bg-white text-[#6B7280] hover:bg-[#F5F7F9]"}`}
                      onClick={(e) => { e.stopPropagation(); setTrendPeriod(p); }}
                    >
                      {p}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-xl font-bold tabular-nums ${trendDelta > 0 ? "text-emerald-600" : trendDelta < 0 ? "text-red-500" : "text-[#6B7280]"}`}>
                  {trendDelta > 0 ? "+" : ""}{trendDelta}
                </span>
                {trendPctVal !== 0 && (
                  <span className={`text-[10px] font-semibold ${trendDelta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {trendDelta > 0 ? "\u25B2" : "\u25BC"} {Math.abs(trendPctVal)}%
                  </span>
                )}
              </div>
              <div className="text-[9px] text-[#6B7280]">{totals.recent} new vs {totals.prior} prior {periodLabel}</div>
            </div>
            {/* Pipeline Progress */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider">Pipeline Progress</div>
              <div className="text-[8px] text-[#9CA3AF]">Avg milestone completion</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-xl font-bold tabular-nums ${progressColor(milestonePct)}`}>{milestonePct}%</span>
                <span className="text-[9px] text-[#9CA3AF]">{totals.milestoneDone}/{totals.milestoneTotal}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#EBEFF3] overflow-hidden mt-1">
                <div className={`h-full rounded-full ${progressBg(milestonePct)} transition-all`} style={{ width: `${milestonePct}%` }} />
              </div>
            </div>
          </div>

          {/* ── Row 2: charts — same column sizing as Row 1 ── */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "0.6fr 1.2fr 1.2fr 1fr" }}>

            {/* 1. Pipeline Funnel — Pie Chart (same width as Total Deals) */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2 flex flex-col items-center">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1 self-start">Pipeline Funnel</div>
              <PieChart slices={countSlices} size={120} />
              <div className="w-full mt-1.5 flex flex-wrap justify-center gap-x-2 gap-y-0.5">
                {stageStats.filter(s => s.count > 0).map(s => (
                  <div key={s.stage.key} className="flex items-center gap-0.5">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage.dot }} />
                    <span className="text-[6px] text-[#000000]">{s.stage.label}</span>
                    <span className="text-[6px] font-semibold text-[#000000]">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Deals by Stage — Vertical Bar Graph (wider, matches Pipeline Value) */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Deals by Stage</div>
              {(() => {
                const maxC = Math.max(1, ...stageStats.map(s => s.count));
                return (
                  <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
                    {stageStats.map(s => {
                      const h = s.count > 0 ? Math.max(4, (s.count / maxC) * 144) : 0;
                      return (
                        <div key={s.stage.key} className="flex-1 flex flex-col items-center justify-end min-w-0 group relative overflow-hidden">
                          <div className="absolute bottom-full mb-0.5 hidden group-hover:block z-10 pointer-events-none">
                            <div className="bg-[#1F2937] text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-lg">{s.stage.label}: {s.count}</div>
                          </div>
                          {s.count > 0 && <span className="text-[7px] font-bold text-[#000000] tabular-nums mb-0.5 leading-none text-center w-full truncate">{s.count}</span>}
                          <div className="w-full rounded-t" style={{ height: h > 0 ? h : 2, backgroundColor: h > 0 ? s.stage.dot : "#E5E7EB", opacity: h > 0 ? 0.8 : 0.4 }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex gap-0 mt-1">
                {stageStats.map(s => (
                  <div key={s.stage.key} className="flex-1 min-w-0 flex flex-col items-center">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage.dot }} />
                    <span className="text-[6px] text-[#6B7280] text-center leading-tight mt-0.5 break-words w-full px-px">{s.stage.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Value by Stage — Vertical Bar Graph */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Value by Stage</div>
              {(() => {
                const maxV = Math.max(1, ...stageStats.map(s => s.value));
                return (
                  <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
                    {stageStats.map(s => {
                      const h = s.value > 0 ? Math.max(4, (s.value / maxV) * 144) : 0;
                      return (
                        <div key={s.stage.key} className="flex-1 flex flex-col items-center justify-end min-w-0 group relative overflow-hidden">
                          <div className="absolute bottom-full mb-0.5 hidden group-hover:block z-10 pointer-events-none">
                            <div className="bg-[#1F2937] text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-lg">{s.stage.label}: {money(s.value)}</div>
                          </div>
                          {s.value > 0 && <span className="text-[6px] font-bold text-[#000000] tabular-nums mb-0.5 leading-none text-center w-full truncate">{s.value >= 1000000 ? `$${(s.value / 1000000).toFixed(1)}M` : s.value >= 1000 ? `$${(s.value / 1000).toFixed(0)}K` : `$${s.value.toFixed(0)}`}</span>}
                          <div className="w-full rounded-t" style={{ height: h > 0 ? h : 2, backgroundColor: h > 0 ? s.stage.dot : "#E5E7EB", opacity: h > 0 ? 0.8 : 0.4 }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex gap-0 mt-1">
                {stageStats.map(s => (
                  <div key={s.stage.key} className="flex-1 min-w-0 flex flex-col items-center">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage.dot }} />
                    <span className="text-[6px] text-[#6B7280] text-center leading-tight mt-0.5 break-words w-full px-px">{s.stage.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Milestone Completion */}
            <div className="rounded-lg border border-[#EBEFF3] bg-white px-2.5 py-2">
              <div className="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Milestone Completion</div>
              <div className="space-y-1.5 pt-1">
                {milestoneAgg.map(m => {
                  const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                  return (
                    <div key={m.key} className="flex items-center gap-1.5">
                      <span className="text-[8px] text-[#000000] w-[55px] truncate flex-shrink-0">{m.short}</span>
                      <div className="flex-1 h-3.5 rounded bg-[#F3F4F6] overflow-hidden relative">
                        <div className={`h-full rounded transition-all ${progressBg(pct)}`} style={{ width: `${pct}%` }} />
                        <span className="absolute inset-0 flex items-center justify-end pr-1 text-[7px] font-bold text-[#000000] tabular-nums">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
    <div ref={panelRef} className="flex-shrink-0 border-l border-[#EBEFF3] bg-white overflow-y-auto h-full" style={{ width: 360 }}>
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
          <InfoCell label="Deal Source" value={deal.deal_source ?? ""} />
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
                    <div className={`text-xs font-medium ${done ? "text-[#000000]" : "text-[#9CA3AF]"}`}>{m.label}</div>
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

/* ═══ DateInput — styled date input with mm/dd/yyyy placeholder ═══ */
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const textRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (value) {
      const p = value.split("-");
      if (p.length === 3) setText(`${p[1]}/${p[2]}/${p[0]}`);
    } else {
      setText("");
    }
  }, [value]);

  function parseAndSet(raw: string) {
    setText(raw);
    const cleaned = raw.replace(/[^0-9/]/g, "");
    const parts = cleaned.split("/");
    if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      const mm = parts[0].padStart(2, "0");
      const dd = parts[1].padStart(2, "0");
      const yyyy = parts[2];
      const iso = `${yyyy}-${mm}-${dd}`;
      if (!isNaN(Date.parse(iso))) { onChange(iso); return; }
    }
    if (raw === "") onChange("");
  }

  return (
    <div>
      <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">{label}</div>
      <div className="relative">
        <input
          ref={textRef}
          className={`${UI.control} pr-8`}
          placeholder="mm/dd/yyyy"
          value={text}
          onChange={e => parseAndSet(e.target.value)}
          onClick={() => textRef.current?.select()}
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#000000] p-0.5"
          onClick={() => hiddenRef.current?.showPicker?.()}
          tabIndex={-1}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </button>
        <input
          ref={hiddenRef}
          type="date"
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          value={value}
          onChange={e => onChange(e.target.value)}
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═══ */
export default function Sales() {
  useEffect(() => { const pb = document.body.style.overflow; const ph = document.documentElement.style.overflow; document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; return () => { document.body.style.overflow = pb; document.documentElement.style.overflow = ph; }; }, []);

  const { portalUser, teamNames, effectiveScope, loading: scopeLoading } = usePortalUser();

  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  /* View mode */
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  /* Era toggle, Paid toggle, financials & Summary panel */
  const [eraMode, setEraMode] = useState<"solar2" | "solar1" | "solar_all">("solar2");
  const [paymentFilter, setPaymentFilter] = useState<"in_progress" | "partially_paid" | "fully_paid">("in_progress");
  const [hideFinancials, setHideFinancials] = useState(false);
  const [hideHold, setHideHold] = useState(false);
  const [hideCancel, setHideCancel] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIdx = useRef<number | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<number>(30);
  const [jobsOpen, setJobsOpen] = useState(false);
  const jobsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!jobsOpen) return;
    const h = (e: MouseEvent) => { if (jobsRef.current && !jobsRef.current.contains(e.target as Node)) setJobsOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [jobsOpen]);
  const [summaryDeal, setSummaryDeal] = useState<DealRow | null>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);

  /* Filters */
  const [salesReps, setSalesReps] = useState<string[]>([]);
  const [salesManagers, setSalesManagers] = useState<string[]>([]);
  const [ccManagers, setCcManagers] = useState<string[]>([]);
  const [ccSetters, setCcSetters] = useState<string[]>([]);
  const [installers, setInstallers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [customerQ, setCustomerQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /* Advanced Filter panel & Smart Lists */
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [smartLists, setSmartLists] = useState<SmartList[]>([]);
  const [smartListsLoading, setSmartListsLoading] = useState(false);
  const [activeSmartListId, setActiveSmartListId] = useState<string | null>(null);
  const [saveListName, setSaveListName] = useState("");
  const [saveListError, setSaveListError] = useState<string | null>(null);
  const [savingList, setSavingList] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  /* Employee org chart data */
  type EmployeeBasic = { id: string; full_name: string; position: string; department: string; is_active: boolean; manager_id: string | null };
  const [employeeData, setEmployeeData] = useState<EmployeeBasic[]>([]);

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

  /* Per-column visibility — hiddenColumns tracks keys the user has unchecked */
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  function toggleColumn(colKey: string) {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }

  const visibleColumns = useMemo(() => {
    return ALL_COLUMNS.filter(col => {
      if (col.group === "_save_only") return false;
      if (hiddenColumns.has(col.key)) return false;
      if (col.group) return expandedGroups.has(col.group);
      return true;
    });
  }, [expandedGroups, hiddenColumns]);

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
  const [editTab, setEditTab] = useState<0 | 1 | 2 | 3>(0);

  /* Drag-and-drop */
  const [activeDragDeal, setActiveDragDeal] = useState<DealRow | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /* Debounce ref */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Row click timer (for list view single/double click discrimination) */
  const rowClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Employee org chart fetch ── */
  useEffect(() => {
    supabase.from("employees").select("id, full_name, position, department, is_active, manager_id").eq("is_active", true)
      .then(({ data }) => { if (data) setEmployeeData(data as EmployeeBasic[]); });
  }, []);

  const empLookups = useMemo(() => {
    const salesMgrs = employeeData.filter(e => e.department === "Sales" && e.position === "Sales Manager").map(e => e.full_name).sort();
    const ccMgrs = employeeData.filter(e => e.department === "Call Center" && e.position === "Call Center Manager").map(e => e.full_name).sort();
    const activeSalesReps = employeeData.filter(e => e.department === "Sales" && e.position === "Sales Rep").map(e => e.full_name).sort();
    const activeCallCenterReps = employeeData.filter(e => e.department === "Call Center").map(e => e.full_name).sort();
    /* manager_id → reps lookup */
    const idToName = new Map(employeeData.map(e => [e.id, e.full_name]));
    const managerToReps = new Map<string, string[]>();
    for (const e of employeeData) {
      if (e.manager_id) {
        const mgrName = idToName.get(e.manager_id);
        if (mgrName) {
          const arr = managerToReps.get(mgrName) ?? [];
          arr.push(e.full_name);
          managerToReps.set(mgrName, arr);
        }
      }
    }
    /* Reverse lookup: rep name → manager name */
    const repToManager = new Map<string, string>();
    for (const [mgrName, reps] of managerToReps) {
      for (const rep of reps) repToManager.set(rep, mgrName);
    }
    return { salesMgrs, ccMgrs, activeSalesReps, activeCallCenterReps, managerToReps, repToManager };
  }, [employeeData]);

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

  /* Accumulated option pools — values persist across filtered reloads */
  const knownVals = useRef({ salesReps: new Set<string>(), ccSetters: new Set<string>(), installers: new Set<string>(), statuses: new Set<string>() });
  const [knownVer, setKnownVer] = useState(0);

  useEffect(() => {
    const k = knownVals.current;
    let changed = false;
    for (const r of rows) {
      for (const [field, set] of [
        ["sales_rep", k.salesReps], ["call_center_appointment_setter", k.ccSetters],
        ["company", k.installers], ["status", k.statuses],
      ] as [keyof DealRow, Set<string>][]) {
        const v = (r[field] as string | null)?.trim();
        if (v && !set.has(v)) { set.add(v); changed = true; }
      }
    }
    if (changed) setKnownVer(v => v + 1);
  }, [rows]);

  /* Options from accumulated pools + employee org chart */
  const options = useMemo(() => {
    const k = knownVals.current;
    const repList = empLookups.activeSalesReps.length > 0
      ? empLookups.activeSalesReps
      : Array.from(k.salesReps).sort();
    return {
      salesReps: teamNames !== null ? repList.filter(r => teamNames.includes(r)) : repList,
      salesManagers: empLookups.salesMgrs,
      ccManagers: empLookups.ccMgrs,
      ccSetters: empLookups.activeCallCenterReps.length > 0
        ? empLookups.activeCallCenterReps
        : Array.from(k.ccSetters).sort(),
      installers: Array.from(k.installers).sort(),
      statuses: Array.from(k.statuses).sort(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownVer, teamNames, empLookups]);

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
    if (sortKey === "__sales_manager" || sortKey === "__cc_manager") {
      const dir = sortDir === "asc" ? 1 : -1;
      const field = sortKey === "__sales_manager" ? "sales_rep" : "call_center_appointment_setter";
      return [...rows].sort((a, b) => {
        const am = empLookups.repToManager.get((a as Record<string, any>)[field] ?? "") ?? "";
        const bm = empLookups.repToManager.get((b as Record<string, any>)[field] ?? "") ?? "";
        return am.localeCompare(bm) * dir;
      });
    }
    if (sortKey === "__total_commissions") {
      const dir = sortDir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const av = (a.manager_amount ?? 0) + (a.agent_payout ?? 0);
        const bv = (b.manager_amount ?? 0) + (b.agent_payout ?? 0);
        return (av - bv) * dir;
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
  }, [rows, sortKey, sortDir, empLookups]);

  /* Visible active stages (respects paymentFilter for kanban) */
  const visibleActiveStages = useMemo(() => {
    let stgs = ACTIVE_STAGES;
    if (paymentFilter === "in_progress") stgs = stgs.filter(s => s.key !== "paid" && s.key !== "partially_paid");
    if (hideHold) stgs = stgs.filter(s => s.key !== "on_hold");
    return stgs;
  }, [paymentFilter, hideHold]);

  /* Era-filtered rows (Solar 2.0 / Solar 1.0 / Solar All) + sales/cc manager hierarchy */
  const eraFilteredRows = useMemo(() => {
    let out = sortedRows;
    /* Era filter */
    if (eraMode === "solar2") out = out.filter(r => !r.date_closed || r.date_closed >= "2024-08-01");
    else if (eraMode === "solar1") out = out.filter(r => r.date_closed && r.date_closed < "2024-08-01");
    /* Sales Manager filter (client-side hierarchy) */
    if (salesManagers.length > 0) {
      const allowedReps = new Set<string>();
      for (const mgr of salesManagers) {
        const reps = empLookups.managerToReps.get(mgr) ?? [];
        for (const r of reps) allowedReps.add(r);
        allowedReps.add(mgr);
      }
      out = out.filter(r => r.sales_rep && allowedReps.has(r.sales_rep));
    }
    /* CC Manager filter (client-side hierarchy) */
    if (ccManagers.length > 0) {
      const allowedSetters = new Set<string>();
      for (const mgr of ccManagers) {
        const reps = empLookups.managerToReps.get(mgr) ?? [];
        for (const r of reps) allowedSetters.add(r);
        allowedSetters.add(mgr);
      }
      out = out.filter(r => r.call_center_appointment_setter && allowedSetters.has(r.call_center_appointment_setter));
    }
    return out;
  }, [sortedRows, eraMode, salesManagers, ccManagers, empLookups]);

  /* Filtered display rows for list view */
  const displayRows = useMemo(() => {
    let out = eraFilteredRows;
    if (stages.length > 0) {
      const keys = new Set(PIPELINE_STAGES.filter(s => stages.includes(s.label)).map(s => s.key));
      out = out.filter(r => keys.has(getDealStage(r)));
    }
    if (paymentFilter === "in_progress") {
      out = out.filter(r => { const s = getDealStage(r); return s !== "paid" && s !== "partially_paid"; });
    } else if (paymentFilter === "partially_paid") {
      out = out.filter(r => getDealStage(r) === "partially_paid");
    } else if (paymentFilter === "fully_paid") {
      out = out.filter(r => getDealStage(r) === "paid");
    }
    if (hideHold) out = out.filter(r => getDealStage(r) !== "on_hold");
    if (hideCancel) out = out.filter(r => getDealStage(r) !== "cancelled");
    return out;
  }, [eraFilteredRows, paymentFilter, stages, hideHold, hideCancel]);

  /* Deal count */
  const visibleDealCount = displayRows.length;

  /* List-view summary stats (per-stage counts, totals, trajectory, milestones) */
  const listSummary = useMemo(() => {
    const now = Date.now();
    const dPeriod = trendPeriod * 86_400_000;
    const stageStats: StageStat[] = [];
    const showInactive = eraMode === "solar1" || eraMode === "solar_all";
    const allStages = showInactive ? PIPELINE_STAGES : PIPELINE_STAGES.filter(s => !s.inactive);

    /* Per-milestone aggregate counts across all visible deals */
    const milestoneAgg: MilestoneAgg[] =
      MILESTONES.map(m => ({ key: m.key, short: m.short, label: m.label, done: 0, total: 0 }));

    let totalGp = 0, totalRev = 0, totalComm = 0;

    for (const stage of allStages) {
      let count = 0, value = 0, recent = 0, prior = 0, milestoneTotal = 0, milestoneDone = 0;
      for (const r of displayRows) {
        if (getDealStage(r) !== stage.key) continue;
        count++;
        value += r.contract_value ?? 0;
        totalGp += r.gross_profit ?? 0;
        totalRev += r.rev ?? 0;
        totalComm += (r.manager_amount ?? 0) + (r.agent_payout ?? 0);
        milestoneTotal += MILESTONES.length;
        for (let mi = 0; mi < MILESTONES.length; mi++) {
          milestoneAgg[mi].total++;
          if (r[MILESTONES[mi].key]) { milestoneDone++; milestoneAgg[mi].done++; }
        }
        if (r.date_closed) {
          const closed = new Date(r.date_closed + "T00:00:00").getTime();
          if (now - closed <= dPeriod) recent++;
          else if (now - closed <= dPeriod * 2) prior++;
        }
      }
      stageStats.push({ stage, count, value, recent, prior, milestoneTotal, milestoneDone });
    }

    const totals = stageStats.reduce(
      (acc, s) => ({ count: acc.count + s.count, value: acc.value + s.value, recent: acc.recent + s.recent, prior: acc.prior + s.prior, milestoneTotal: acc.milestoneTotal + s.milestoneTotal, milestoneDone: acc.milestoneDone + s.milestoneDone }),
      { count: 0, value: 0, recent: 0, prior: 0, milestoneTotal: 0, milestoneDone: 0 }
    );

    return { stageStats, totals: { ...totals, gp: totalGp, rev: totalRev, comm: totalComm }, milestoneAgg };
  }, [displayRows, eraMode, trendPeriod]);

  /* Selection totals for multi-row summary */
  const selTotals = useMemo(() => {
    if (selectedIds.size === 0) return null;
    let contractEpc = 0, rev = 0, comm = 0, gp = 0;
    for (const r of displayRows) {
      if (!selectedIds.has(r.id)) continue;
      contractEpc += r.contract_value ?? 0;
      rev += r.rev ?? 0;
      comm += (r.manager_amount ?? 0) + (r.agent_payout ?? 0);
      gp += r.gross_profit ?? 0;
    }
    return { count: selectedIds.size, contractEpc, rev, comm, gp };
  }, [selectedIds, displayRows]);

  /* Deals grouped by pipeline stage (for Kanban — from era-filtered rows) */
  const dealsByStage = useMemo(() => {
    const map = new Map<string, DealRow[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.key, []);
    for (const deal of eraFilteredRows) {
      const stageKey = getDealStage(deal);
      const arr = map.get(stageKey);
      if (arr) arr.push(deal);
    }
    return map;
  }, [eraFilteredRows]);

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

    /* Block drag to/from inactive stages or partially_paid (status-based) */
    if (INACTIVE_STAGE_KEYS.has(targetStageKey) || INACTIVE_STAGE_KEYS.has(currentStageKey)) return;
    if (targetStageKey === "partially_paid") return;

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
      /* Skip milestone index 0 (date_closed) — it's a starting marker */
      for (let i = 1; i <= targetEnd; i++) {
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
        /* Skip milestone index 0 (date_closed) */
        for (let i = 1; i <= targetEnd; i++) {
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

  function clearAll() {
    setSalesReps([]); setSalesManagers([]); setCcManagers([]); setCcSetters([]); setInstallers([]); setStatuses([]); setCustomerQ(""); setStartDate(""); setEndDate("");
    setStages([]); setPaymentFilter("in_progress"); setSelectedIds(new Set()); setTrendPeriod(30);
    knownVals.current = { salesReps: new Set(), ccSetters: new Set(), installers: new Set(), statuses: new Set() };
    setActiveSmartListId(null);
    setHiddenColumns(new Set());
  }

  /* ── Smart List helpers ── */
  function captureFilterConfig(): SmartListConfig {
    return {
      salesReps, salesManagers, ccManagers, ccSetters, installers, statuses, stages,
      customerQ, startDate, endDate, paymentFilter, eraMode, hideHold, hideCancel,
      expandedGroups: Array.from(expandedGroups),
      hiddenColumns: Array.from(hiddenColumns),
    };
  }

  function applyFilterConfig(cfg: SmartListConfig) {
    setSalesReps(cfg.salesReps ?? []);
    setSalesManagers(cfg.salesManagers ?? []);
    setCcManagers(cfg.ccManagers ?? []);
    setCcSetters(cfg.ccSetters ?? []);
    setInstallers(cfg.installers ?? []);
    setStatuses(cfg.statuses ?? []);
    setStages(cfg.stages ?? []);
    setCustomerQ(cfg.customerQ ?? "");
    setStartDate(cfg.startDate ?? "");
    setEndDate(cfg.endDate ?? "");
    setPaymentFilter(cfg.paymentFilter ?? "in_progress");
    setEraMode(cfg.eraMode ?? "solar2");
    setHideHold(cfg.hideHold ?? false);
    setHideCancel(cfg.hideCancel ?? false);
    setExpandedGroups(new Set(cfg.expandedGroups ?? []));
    setHiddenColumns(new Set(cfg.hiddenColumns ?? []));
  }

  async function loadSmartLists() {
    if (!portalUser?.id) return;
    setSmartListsLoading(true);
    const { data } = await supabase
      .from("smart_lists")
      .select("*")
      .eq("user_id", portalUser.id)
      .order("created_at", { ascending: false });
    setSmartLists((data ?? []) as SmartList[]);
    setSmartListsLoading(false);
  }

  async function saveSmartList() {
    if (!portalUser?.id) return;
    const trimmed = saveListName.trim();
    if (!trimmed) { setSaveListError("Enter a name"); return; }
    setSavingList(true); setSaveListError(null);
    const { error } = await supabase.from("smart_lists").insert({
      user_id: portalUser.id,
      name: trimmed,
      config: captureFilterConfig(),
    });
    if (error) { setSaveListError(error.message); setSavingList(false); return; }
    setSaveListName("");
    await loadSmartLists();
    setSavingList(false);
  }

  async function updateSmartList(id: string) {
    const { error } = await supabase.from("smart_lists")
      .update({ config: captureFilterConfig() as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setActiveSmartListId(id);
      await loadSmartLists();
    }
  }

  async function deleteSmartList(id: string) {
    setDeletingListId(id);
    await supabase.from("smart_lists").delete().eq("id", id);
    if (activeSmartListId === id) setActiveSmartListId(null);
    await loadSmartLists();
    setDeletingListId(null);
  }

  function loadSmartList(sl: SmartList) {
    applyFilterConfig(sl.config);
    setActiveSmartListId(sl.id);
  }

  /* Load smart lists on mount */
  useEffect(() => { if (portalUser?.id) loadSmartLists(); }, [portalUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Clear active smart list when any filter changes manually */
  const isApplyingRef = useRef(false);
  const prevFiltersRef = useRef<string>("");
  useEffect(() => {
    const snap = JSON.stringify({ salesReps, salesManagers, ccManagers, ccSetters, installers, statuses, stages, customerQ, startDate, endDate, paymentFilter, eraMode, hideHold, hideCancel, expandedGroups: Array.from(expandedGroups), hiddenColumns: Array.from(hiddenColumns) });
    if (prevFiltersRef.current && prevFiltersRef.current !== snap && activeSmartListId && !isApplyingRef.current) {
      setActiveSmartListId(null);
    }
    prevFiltersRef.current = snap;
  }, [salesReps, salesManagers, ccManagers, ccSetters, installers, statuses, stages, customerQ, startDate, endDate, paymentFilter, eraMode, hideHold, hideCancel, expandedGroups, hiddenColumns, activeSmartListId]);

  /* Close filter panel on Escape */
  useEffect(() => {
    if (!filterPanelOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFilterPanelOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [filterPanelOpen]);

  /* Count active (non-default) filters for badge */
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (salesReps.length) c++;
    if (salesManagers.length) c++;
    if (ccManagers.length) c++;
    if (ccSetters.length) c++;
    if (installers.length) c++;
    if (statuses.length) c++;
    if (stages.length) c++;
    if (customerQ.trim()) c++;
    if (startDate) c++;
    if (endDate) c++;
    if (paymentFilter !== "in_progress") c++;
    if (eraMode !== "solar2") c++;
    if (hideHold) c++;
    if (hideCancel) c++;
    return c;
  }, [salesReps, salesManagers, ccManagers, ccSetters, installers, statuses, stages, customerQ, startDate, endDate, paymentFilter, eraMode, hideHold, hideCancel]);

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
                <p className="text-xs text-[#6B7280]">Project Management</p>
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
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
                {/* Era 3-way segmented control */}
                <div className="flex rounded-lg border border-[#EBEFF3] overflow-hidden">
                  {([["solar2", "Solar 2.0"], ["solar1", "Solar 1.0"], ["solar_all", "Solar All"]] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`px-2.5 py-1 text-[10px] font-semibold transition ${
                        eraMode === val ? "bg-[#1c48a6] text-white" : "bg-white text-[#6B7280] hover:bg-[#F5F7F9]"
                      }`}
                      onClick={() => setEraMode(val)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                {/* Payment filter dropdown */}
                <select
                  className="px-2 py-1 rounded text-[10px] font-semibold border border-[#EBEFF3] bg-white text-[#6B7280] focus:outline-none"
                  value={paymentFilter}
                  onChange={e => setPaymentFilter(e.target.value as "in_progress" | "partially_paid" | "fully_paid")}
                >
                  <option value="in_progress">In Progress</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="fully_paid">Fully Paid</option>
                </select>
                <button
                  className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                    !hideHold
                      ? "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B] hover:bg-[#F59E0B]/10"
                      : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                  }`}
                  onClick={() => setHideHold(v => !v)}
                >
                  On-Hold {hideHold ? "Hidden" : "Shown"}
                </button>
                <button
                  className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                    !hideCancel
                      ? "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444] hover:bg-[#EF4444]/10"
                      : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                  }`}
                  onClick={() => setHideCancel(v => !v)}
                >
                  Cancelled {hideCancel ? "Hidden" : "Shown"}
                </button>
                {/* Smart Lists quick-selector */}
                {smartLists.length > 0 && (
                  <select
                    className="px-2 py-1 rounded text-[10px] font-semibold border border-[#EBEFF3] bg-white text-[#6B7280] focus:outline-none max-w-[140px]"
                    value={activeSmartListId ?? ""}
                    onChange={e => {
                      const sl = smartLists.find(s => s.id === e.target.value);
                      if (sl) loadSmartList(sl);
                    }}
                  >
                    <option value="">Smart Lists...</option>
                    {smartLists.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                  </select>
                )}
                {/* Separator + Columns dropdown (list view only) */}
                {viewMode === "list" && (
                  <>
                    <span className="h-6 border-l-2 border-[#EBEFF3] mx-0.5" />
                    <div className="relative" ref={jobsRef}>
                      <button
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition ${
                          expandedGroups.size > 0
                            ? "border-[#1c48a6]/30 bg-[#1c48a6]/5 text-[#1c48a6] hover:bg-[#1c48a6]/10"
                            : "border-[#EBEFF3] bg-[#F5F7F9] text-[#6B7280] hover:bg-white"
                        }`}
                        onClick={() => setJobsOpen(v => !v)}
                      >
                        {expandedGroups.size > 0 ? `Columns Shown (${expandedGroups.size})` : "Hidden Columns"} <span className="text-[8px]">&#9662;</span>
                      </button>
                      {jobsOpen && (
                        <div className="absolute z-50 mt-1 right-0 rounded-xl border border-[#EBEFF3] bg-white shadow-lg p-2 min-w-[160px]">
                          {[
                            { id: "contacts",          label: "Contact Details" },
                            { id: "battery_jobs",      label: "Battery Jobs" },
                            { id: "roof_jobs",         label: "Roof Jobs" },
                            { id: "design",            label: "Design" },
                            { id: "permitting",        label: "Permitting" },
                            { id: "hoa_detail",        label: "HOA" },
                            { id: "utilities",         label: "Utilities" },
                            { id: "deductions",        label: "Deductions" },
                            { id: "total_commissions", label: "Total Commissions" },
                          ].map(g => (
                            <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold cursor-pointer hover:bg-[#F5F7F9] rounded select-none">
                              <input type="checkbox" checked={expandedGroups.has(g.id)} onChange={() => toggleGroup(g.id)} className="accent-[#1c48a6]" />
                              {g.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition shadow-sm ${
                    hideFinancials
                      ? "border-[#800020] bg-[#800020] text-white hover:bg-[#9a1a3a]"
                      : "border-[#800020] bg-white text-[#800020] hover:bg-[#800020]/5"
                  }`}
                  onClick={() => setHideFinancials(v => !v)}
                >
                  {hideFinancials ? "Show $" : "Hide $"}
                </button>
                <button className={UI.buttonPrimary} onClick={openNew}>+ Add Deal</button>
            </div>
          </div>

          {msg && <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">{msg}</div>}

          <div className={`${UI.card} p-3`}>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">Customer Name</div>
                <input className={UI.control} value={customerQ} onChange={e => setCustomerQ(e.target.value)} placeholder="Search..." />
                <button
                  type="button"
                  className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold transition ${
                    filterPanelOpen ? "text-[#1c48a6]" : "text-[#6B7280] hover:text-[#1c48a6]"
                  }`}
                  onClick={() => setFilterPanelOpen(v => !v)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  Advanced Filter
                  {activeFilterCount > 0 && (
                    <span className="px-1 py-0 rounded-full bg-[#1c48a6] text-white text-[9px] font-bold leading-tight">{activeFilterCount}</span>
                  )}
                </button>
              </div>
              <MultiSelect label="Sales Manager" options={options.salesManagers} selected={salesManagers} onChange={setSalesManagers} />
              <MultiSelect label="Sales Rep" options={options.salesReps} selected={salesReps} onChange={setSalesReps} />
              <MultiSelect label="CC Manager" options={options.ccManagers} selected={ccManagers} onChange={setCcManagers} />
              <MultiSelect label="CC Setter" options={options.ccSetters} selected={ccSetters} onChange={setCcSetters} />
              <MultiSelect label="Installer" options={options.installers} selected={installers} onChange={setInstallers} />
              <MultiSelect label="Stage" options={PIPELINE_STAGES.map(s => s.label)} selected={stages} onChange={setStages} />
              <MultiSelect label="Status" options={options.statuses} selected={statuses} onChange={setStatuses} />
              <DateInput label="Start Date" value={startDate} onChange={setStartDate} />
              <DateInput label="End Date" value={endDate} onChange={setEndDate} />
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
                      hideFinancials={hideFinancials}
                    />
                  ))}
                  {/* Divider + Inactive stages */}
                  {(() => {
                    const showLegacy = eraMode === "solar1" || eraMode === "solar_all";
                    const visibleInactive = INACTIVE_STAGES.filter(s =>
                      (s.key === "cancelled" && !hideCancel) || (showLegacy && (s.key === "won" || s.key === "abandoned"))
                    );
                    if (visibleInactive.length === 0) return null;
                    return (
                      <>
                        <div className="flex-shrink-0" style={{ width: 8, minWidth: 8, backgroundColor: "#EBEFF3" }} />
                        {visibleInactive.map(stage => (
                          <StageColumn
                            key={stage.key}
                            stage={stage}
                            deals={dealsByStage.get(stage.key) ?? []}
                            onCardClick={(d) => setSummaryDeal(d)}
                            onCardDoubleClick={openEdit}
                            inactive
                            hideFinancials={hideFinancials}
                          />
                        ))}
                      </>
                    );
                  })()}
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
        <div className="flex-1 min-h-0 flex flex-col relative">
          {/* List Summary Bar */}
          {!loading && displayRows.length > 0 && (
            <ListSummaryBar stageStats={listSummary.stageStats} totals={listSummary.totals} milestoneAgg={listSummary.milestoneAgg} trendPeriod={trendPeriod} setTrendPeriod={setTrendPeriod} />
          )}
          <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-h-0 overflow-auto relative">
            {/* Selection summary bar */}
            {selTotals && (
              <div className="sticky top-0 z-20 bg-[#1c48a6] text-white px-4 py-2 flex items-center gap-4 text-xs">
                <span className="font-bold">{selTotals.count} selected</span>
                <span>Contract EPC: {money(selTotals.contractEpc)}</span>
                <span>Revenue: {money(selTotals.rev)}</span>
                <span>Commissions: {money(selTotals.comm)}</span>
                <span>Gross Profit: {money(selTotals.gp)}</span>
                <button className="ml-auto px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px] font-semibold" onClick={() => setSelectedIds(new Set())}>Clear Selection</button>
              </div>
            )}
            <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: 32 + visibleColumns.reduce((s, c) => s + getColWidth(c), 0) }}>
              <thead className="sticky top-0 z-10 bg-[#F5F7F9] border-b border-[#EBEFF3]" style={selTotals ? { top: 36 } : undefined}>
                <tr className="text-left text-[#000000]">
                  {/* Checkbox column header */}
                  <th className="px-1 py-2 border-r border-[#EBEFF3] text-center" style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      className="accent-[#1c48a6]"
                      checked={displayRows.length > 0 && selectedIds.size === displayRows.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(displayRows.map(r => r.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </th>
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
                  <tr><td className="px-2 py-8 text-[#6B7280] text-center" colSpan={visibleColumns.length + 1}>Loading deals...</td></tr>
                ) : displayRows.length === 0 ? (
                  <tr><td className="px-2 py-8 text-[#6B7280] text-center" colSpan={visibleColumns.length + 1}>No results.</td></tr>
                ) : (
                  displayRows.map((r, rowIdx) => {
                    const prog = getProgress(r);
                    const rowStageKey = getDealStage(r);
                    const rowStage = PIPELINE_STAGES.find(s => s.key === rowStageKey) ?? PIPELINE_STAGES[0];
                    const isSelected = selectedIds.has(r.id);
                    return (
                    <tr key={r.id}
                      onClick={() => {
                        if (rowClickTimer.current) { clearTimeout(rowClickTimer.current); rowClickTimer.current = null; openEdit(r); return; }
                        rowClickTimer.current = setTimeout(() => { rowClickTimer.current = null; setSummaryDeal(r); }, 250);
                      }}
                      className={`border-b border-[#EBEFF3] hover:bg-[#1c48a6]/5 cursor-pointer transition-colors ${isSelected ? "bg-[#1c48a6]/10" : rowIdx % 2 === 1 ? "bg-[#F9FAFB]" : "bg-white"}`}
                    >
                      {/* Checkbox cell */}
                      <td className="px-1 py-2 border-r border-[#EBEFF3] text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-[#1c48a6]"
                          checked={isSelected}
                          onClick={e => {
                            e.stopPropagation();
                            const nativeEvent = e.nativeEvent as MouseEvent;
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (nativeEvent.shiftKey && lastClickedIdx.current !== null) {
                                const start = Math.min(lastClickedIdx.current, rowIdx);
                                const end = Math.max(lastClickedIdx.current, rowIdx);
                                for (let i = start; i <= end; i++) next.add(displayRows[i].id);
                              } else {
                                if (next.has(r.id)) next.delete(r.id);
                                else next.add(r.id);
                              }
                              return next;
                            });
                            lastClickedIdx.current = rowIdx;
                          }}
                          onChange={() => {}}
                        />
                      </td>
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
                                <div key={m.key} title={`${m.label}: ${r[m.key] ? fmtDate(r[m.key] as string) : "Pending"}`}
                                  className="w-3 h-3 rounded-full transition-colors"
                                  style={{ backgroundColor: r[m.key] ? "#1c48a6" : "#E5E7EB" }} />
                              ))}
                            </div>
                          </td>
                        );
                        /* Sales Manager (computed from org chart) */
                        if (col.key === "__sales_manager") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3]">
                            <div className="truncate">{empLookups.repToManager.get(r.sales_rep ?? "") ?? "\u2014"}</div>
                          </td>
                        );
                        /* CC Manager (computed from org chart) */
                        if (col.key === "__cc_manager") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3]">
                            <div className="truncate">{empLookups.repToManager.get(r.call_center_appointment_setter ?? "") ?? "\u2014"}</div>
                          </td>
                        );
                        /* Total Commissions (computed sum) */
                        if (col.key === "__total_commissions") return (
                          <td key={col.key} className="px-2 py-2 border-r border-[#EBEFF3] text-right tabular-nums">
                            <div className="truncate">{money((r.manager_amount ?? 0) + (r.agent_payout ?? 0))}</div>
                          </td>
                        );
                        /* CC placeholder columns */
                        if (col.key === "__cc_mgr_comm" || col.key === "__cc_mgr_date" || col.key === "__cc_agent_comm" || col.key === "__cc_agent_date") return (
                          <td key={col.key} className={`px-2 py-2 border-r border-[#EBEFF3] ${col.type === "money" ? "text-right tabular-nums" : ""}`}>
                            <div className="truncate text-[#9CA3AF]">{"\u2014"}</div>
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
        </div>
        {/* Summary Panel (list view) — absolute overlay covering ListSummaryBar + table */}
        {summaryDeal && (
          <div className="absolute inset-0 z-30" onClick={() => setSummaryDeal(null)}>
            <div className="absolute right-0 top-0 bottom-0 shadow-xl" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
              <DealSummaryPanel deal={summaryDeal} onClose={() => setSummaryDeal(null)} onOpenEdit={(d) => { setSummaryDeal(null); openEdit(d); }} panelRef={summaryPanelRef} />
            </div>
          </div>
        )}
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

      {/* Advanced Filter Panel */}
      {filterPanelOpen && (
        <AdvancedFilterPanel
          salesReps={salesReps} setSalesReps={setSalesReps}
          salesManagers={salesManagers} setSalesManagers={setSalesManagers}
          ccManagers={ccManagers} setCcManagers={setCcManagers}
          ccSetters={ccSetters} setCcSetters={setCcSetters}
          installers={installers} setInstallers={setInstallers}
          statuses={statuses} setStatuses={setStatuses}
          stages={stages} setStages={setStages}
          customerQ={customerQ} setCustomerQ={setCustomerQ}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter}
          eraMode={eraMode} setEraMode={setEraMode}
          hideHold={hideHold} setHideHold={setHideHold}
          hideCancel={hideCancel} setHideCancel={setHideCancel}
          expandedGroups={expandedGroups} toggleGroup={toggleGroup}
          hiddenColumns={hiddenColumns} toggleColumn={toggleColumn}
          options={options}
          smartLists={smartLists}
          smartListsLoading={smartListsLoading}
          activeSmartListId={activeSmartListId}
          saveListName={saveListName} setSaveListName={setSaveListName}
          saveListError={saveListError}
          savingList={savingList}
          deletingListId={deletingListId}
          onSaveSmartList={saveSmartList}
          onUpdateSmartList={updateSmartList}
          onDeleteSmartList={deleteSmartList}
          onLoadSmartList={loadSmartList}
          onClose={() => setFilterPanelOpen(false)}
          onClearAll={clearAll}
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

const EDIT_TABS = ["Sales & Contract", "Finance", "Status & Stage", "Financial Summary"] as const;

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
  { label: "Design Submitted",   key: "design_submitted_date",      type: "date" },
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
  editTab: 0 | 1 | 2 | 3;
  setEditTab: (t: 0 | 1 | 2 | 3) => void;
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
              onClick={() => setEditTab(i as 0 | 1 | 2 | 3)}
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

          {editTab === 3 && !isNew && (() => {
            const d = editDraft;
            const m$ = (v: unknown) => { const n = Number(v); return (v == null || v === "" || isNaN(n)) ? "$0.00" : money(n); };
            const totalComm = (Number(d.manager_amount) || 0) + (Number(d.agent_payout) || 0) + (Number(d.visionary_paid_out_commission) || 0);
            const totalAdders = (Number(d.total_adders) || 0);
            const nrgAdders = (Number(d.nova_nrg_customer_adders) || 0);
            const otherAdders = totalAdders - nrgAdders;
            return (
              <div className="space-y-4">
                {/* Contract EPC */}
                <div className="rounded-lg border border-[#EBEFF3] bg-[#F9FAFB] px-4 py-3">
                  <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Contract EPC Amount</div>
                  <div className="text-2xl font-bold text-[#000000] mt-1">{m$(d.contract_value)}</div>
                </div>

                {/* Total Commissions */}
                <div className="rounded-lg border border-[#EBEFF3] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Total Commissions</div>
                    <div className="text-lg font-bold text-[#1c48a6]">{money(totalComm)}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {/* Manager */}
                    <div className="flex items-center justify-between py-2 border-b border-[#EBEFF3]">
                      <div>
                        <div className="text-xs font-semibold text-[#000000]">Manager Commission</div>
                        <div className="text-[10px] text-[#6B7280]">{d.manager ?? "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#000000] tabular-nums">{m$(d.manager_amount)}</div>
                        <div className="text-[10px] text-[#6B7280]">Paid: {d.manager_paid_date ? fmtDate(d.manager_paid_date) : "—"}</div>
                      </div>
                    </div>
                    {/* Agent */}
                    <div className="flex items-center justify-between py-2 border-b border-[#EBEFF3]">
                      <div>
                        <div className="text-xs font-semibold text-[#000000]">Agent Payout</div>
                        <div className="text-[10px] text-[#6B7280]">{d.sales_rep ?? "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#000000] tabular-nums">{m$(d.agent_payout)}</div>
                        <div className="text-[10px] text-[#6B7280]">Paid: {d.paid_agent_p1_date ? fmtDate(d.paid_agent_p1_date) : "—"}</div>
                      </div>
                    </div>
                    {/* Visionary */}
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <div className="text-xs font-semibold text-[#000000]">Visionary Commission</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#000000] tabular-nums">{m$(d.visionary_paid_out_commission)}</div>
                        <div className="text-[10px] text-[#6B7280]">Paid: {d.paid_visionary_p2_date ? fmtDate(d.paid_visionary_p2_date) : "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Adders */}
                <div className="rounded-lg border border-[#EBEFF3] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Total Adders</div>
                    <div className="text-lg font-bold text-[#000000]">{m$(d.total_adders)}</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-[#EBEFF3]">
                      <div className="text-xs font-semibold text-[#000000]">NRG Customer Adders</div>
                      <div className="text-sm font-bold text-[#000000] tabular-nums">{m$(d.nova_nrg_customer_adders)}</div>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div className="text-xs font-semibold text-[#000000]">Other Adders</div>
                      <div className="text-sm font-bold text-[#000000] tabular-nums">{money(otherAdders)}</div>
                    </div>
                  </div>
                </div>

                {/* Net Contract EPC */}
                <div className="rounded-lg border border-[#EBEFF3] bg-[#F9FAFB] px-4 py-3">
                  <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Net Contract EPC Amount</div>
                  <div className="text-2xl font-bold text-[#000000] mt-1">{m$(d.contract_net_price)}</div>
                </div>

                {/* Revenue */}
                <div className="rounded-lg border border-[#EBEFF3] bg-[#F9FAFB] px-4 py-3">
                  <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Revenue</div>
                  <div className="text-2xl font-bold text-[#000000] mt-1">{m$(d.rev)}</div>
                </div>

                {/* Gross Profit */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Gross Profit</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">{m$(d.gross_profit)}</div>
                </div>
              </div>
            );
          })()}

          {editTab === 3 && isNew && (
            <div className="flex items-center justify-center h-40 text-sm text-[#6B7280]">
              Financial summary is available after the deal is created.
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

/* ═══════════════════════════════════════════════════════════
   ADVANCED FILTER PANEL — Right-side slide-out
   ═══════════════════════════════════════════════════════════ */

type FilterPanelProps = {
  /* People filter state */
  salesReps: string[]; setSalesReps: (v: string[]) => void;
  salesManagers: string[]; setSalesManagers: (v: string[]) => void;
  ccManagers: string[]; setCcManagers: (v: string[]) => void;
  ccSetters: string[]; setCcSetters: (v: string[]) => void;
  installers: string[]; setInstallers: (v: string[]) => void;
  statuses: string[]; setStatuses: (v: string[]) => void;
  stages: string[]; setStages: (v: string[]) => void;
  customerQ: string; setCustomerQ: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  paymentFilter: "in_progress" | "partially_paid" | "fully_paid"; setPaymentFilter: (v: "in_progress" | "partially_paid" | "fully_paid") => void;
  eraMode: "solar2" | "solar1" | "solar_all"; setEraMode: (v: "solar2" | "solar1" | "solar_all") => void;
  hideHold: boolean; setHideHold: (v: boolean) => void;
  hideCancel: boolean; setHideCancel: (v: boolean) => void;
  expandedGroups: Set<string>; toggleGroup: (id: string) => void;
  hiddenColumns: Set<string>; toggleColumn: (key: string) => void;
  /* Options for dropdowns */
  options: { salesReps: string[]; salesManagers: string[]; ccManagers: string[]; ccSetters: string[]; installers: string[]; statuses: string[] };
  /* Smart lists */
  smartLists: SmartList[];
  smartListsLoading: boolean;
  activeSmartListId: string | null;
  saveListName: string; setSaveListName: (v: string) => void;
  saveListError: string | null;
  savingList: boolean;
  deletingListId: string | null;
  onSaveSmartList: () => void;
  onUpdateSmartList: (id: string) => void;
  onDeleteSmartList: (id: string) => void;
  onLoadSmartList: (sl: SmartList) => void;
  /* Actions */
  onClose: () => void;
  onClearAll: () => void;
};

function AdvancedFilterPanel(p: FilterPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[39] bg-black/20" onClick={p.onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-96 bg-white border-l border-[#EBEFF3] shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#EBEFF3] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1c48a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            <span className="text-sm font-bold text-[#000000]">Advanced Filters</span>
          </div>
          <button className="text-[#6B7280] hover:text-[#000000] text-base" onClick={p.onClose}>{"\u2715"}</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#EBEFF3]">

          {/* ── My Smart Lists ── */}
          <div className="px-4 py-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">My Smart Lists</div>
            {p.smartListsLoading ? (
              <div className="text-xs text-[#6B7280]">Loading...</div>
            ) : p.smartLists.length === 0 ? (
              <div className="text-xs text-[#9CA3AF]">No saved lists yet</div>
            ) : (
              <div className="space-y-1.5">
                {p.smartLists.map(sl => {
                  const isActive = p.activeSmartListId === sl.id;
                  const isDeleting = p.deletingListId === sl.id;
                  return (
                    <div key={sl.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border transition ${isActive ? "border-[#1c48a6]/40 bg-[#1c48a6]/5" : "border-[#EBEFF3] bg-[#F9FAFB] hover:bg-white"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#000000] truncate">{sl.name}</div>
                        {isActive && <span className="text-[9px] text-[#1c48a6] font-bold">Active</span>}
                      </div>
                      <button type="button" className="text-[10px] font-semibold text-[#1c48a6] hover:underline flex-shrink-0" onClick={() => p.onLoadSmartList(sl)}>Load</button>
                      <button type="button" className="text-[10px] font-semibold text-[#6B7280] hover:text-[#000000] flex-shrink-0" onClick={() => p.onUpdateSmartList(sl.id)}>Overwrite</button>
                      <button type="button" className="text-[10px] font-semibold text-red-500 hover:text-red-700 flex-shrink-0" onClick={() => p.onDeleteSmartList(sl.id)} disabled={isDeleting}>
                        {isDeleting ? "..." : "\u2715"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Save Current Filters ── */}
          <div className="px-4 py-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Save Current Filters</div>
            <div className="flex gap-2">
              <input
                className={`${UI.control} flex-1 text-xs`}
                placeholder="Name this filter set..."
                value={p.saveListName}
                onChange={e => p.setSaveListName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") p.onSaveSmartList(); }}
              />
              <button
                type="button"
                className={`${UI.buttonPrimary} text-xs whitespace-nowrap`}
                onClick={p.onSaveSmartList}
                disabled={p.savingList}
              >
                {p.savingList ? "Saving..." : "Save"}
              </button>
            </div>
            {p.saveListError && <div className="text-[10px] text-red-500 mt-1">{p.saveListError}</div>}
          </div>

          {/* ── Date Range ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Date Range</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-0.5">Start</label>
                <input type="date" className={`${UI.control} text-xs`} value={p.startDate} onChange={e => p.setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-0.5">End</label>
                <input type="date" className={`${UI.control} text-xs`} value={p.endDate} onChange={e => p.setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Visible Columns ── */}
          <div className="px-4 py-3 space-y-1">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Visible Columns</div>
            <div className="text-[10px] text-[#9CA3AF] mb-1">Only checked columns will show on screen</div>
            {ALL_COLUMNS.filter(c => c.group !== "_save_only").map(col => {
              const isVisible = !p.hiddenColumns.has(col.key) && (!col.group || p.expandedGroups.has(col.group));
              return (
                <label key={col.key} className="flex items-center gap-2 px-1 py-0.5 text-xs hover:bg-[#F5F7F9] rounded cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => {
                      if (isVisible) {
                        /* Hide: add to hiddenColumns */
                        p.toggleColumn(col.key);
                      } else {
                        /* Show: remove from hiddenColumns + expand group if needed */
                        if (p.hiddenColumns.has(col.key)) p.toggleColumn(col.key);
                        if (col.group && !p.expandedGroups.has(col.group)) p.toggleGroup(col.group);
                      }
                    }}
                    className="accent-[#1c48a6]"
                  />
                  <span className={col.group ? "pl-2" : "font-medium"}>{col.label}</span>
                </label>
              );
            })}
          </div>

          {/* ── Status & Stage ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Status & Stage</div>
            <div>
              <div className="text-[11px] font-semibold text-[#000000] uppercase tracking-wider mb-1.5">Stage</div>
              <div className="flex flex-wrap gap-1">
                {PIPELINE_STAGES.map(s => {
                  const isOn = p.stages.includes(s.label);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition ${isOn ? "border-[#1c48a6]/40 bg-[#1c48a6]/10 text-[#1c48a6]" : "border-[#EBEFF3] bg-[#F9FAFB] text-[#6B7280] hover:bg-white"}`}
                      onClick={() => {
                        const next = isOn ? p.stages.filter(x => x !== s.label) : [...p.stages, s.label];
                        p.setStages(next);
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {p.stages.length > 0 && (
                <button type="button" className="text-[10px] text-[#6B7280] hover:text-[#000000] font-semibold mt-1" onClick={() => p.setStages([])}>Clear stages</button>
              )}
            </div>
            <MultiSelect label="Status" options={p.options.statuses} selected={p.statuses} onChange={p.setStatuses} placeholder="All Statuses" />
          </div>

          {/* ── People / Installer Filters ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">People / Installer Filters</div>
            <MultiSelect label="Sales Manager" options={p.options.salesManagers} selected={p.salesManagers} onChange={p.setSalesManagers} placeholder="All" />
            <MultiSelect label="Sales Rep" options={p.options.salesReps} selected={p.salesReps} onChange={p.setSalesReps} placeholder="All" />
            <MultiSelect label="CC Manager" options={p.options.ccManagers} selected={p.ccManagers} onChange={p.setCcManagers} placeholder="All" />
            <MultiSelect label="CC Setter" options={p.options.ccSetters} selected={p.ccSetters} onChange={p.setCcSetters} placeholder="All" />
            <MultiSelect label="Installer" options={p.options.installers} selected={p.installers} onChange={p.setInstallers} placeholder="All" />
          </div>

          {/* ── Era & Payment ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Era & Payment</div>
            <div>
              <div className="text-[11px] font-semibold text-[#000000] mb-1">Era Mode</div>
              <div className="flex gap-1">
                {([["solar2", "Solar 2.0"], ["solar1", "Solar 1.0"], ["solar_all", "All"]] as const).map(([val, lbl]) => (
                  <button key={val} type="button" className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition ${p.eraMode === val ? "bg-[#1c48a6] text-white border-[#1c48a6]" : "bg-white text-[#6B7280] border-[#EBEFF3] hover:bg-[#F5F7F9]"}`} onClick={() => p.setEraMode(val)}>{lbl}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#000000] mb-1">Payment Filter</div>
              <div className="flex gap-1">
                {([["in_progress", "In Progress"], ["partially_paid", "Partially Paid"], ["fully_paid", "Fully Paid"]] as const).map(([val, lbl]) => (
                  <button key={val} type="button" className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition ${p.paymentFilter === val ? "bg-[#1c48a6] text-white border-[#1c48a6]" : "bg-white text-[#6B7280] border-[#EBEFF3] hover:bg-[#F5F7F9]"}`} onClick={() => p.setPaymentFilter(val)}>{lbl}</button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Visibility Toggles ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">Visibility Toggles</div>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={p.hideHold} onChange={() => p.setHideHold(!p.hideHold)} className="accent-[#1c48a6]" />
              Hide On-Hold deals
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={p.hideCancel} onChange={() => p.setHideCancel(!p.hideCancel)} className="accent-[#1c48a6]" />
              Hide Cancelled deals
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#EBEFF3] flex-shrink-0">
          <button type="button" className={`${UI.buttonGhost} w-full text-center text-xs`} onClick={p.onClearAll}>Clear All Filters</button>
        </div>
      </div>
    </>
  );
}
