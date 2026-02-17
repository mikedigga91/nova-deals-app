"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePortalUser } from "@/lib/usePortalUser";

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
  /* Milestones */
  design_ready_date: string | null; permit_submitted_date: string | null;
  permit_approved_date: string | null; install_1_racks_date: string | null;
  install_2_panel_landed_date: string | null; pto_date: string | null; paid_date: string | null;
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

function getCurrentStage(row: DealRow): string {
  let current = "Not Started";
  for (const m of MILESTONES) {
    if (row[m.key]) current = m.short;
  }
  return current;
}

/* ─── Column definitions with collapsible group support ─── */
type ColDef = {
  label: string;
  key: keyof DealRow | "__current_stage";
  type: "text" | "money" | "num" | "date";
  group?: string;        // child of this group (hidden when collapsed)
  groupParent?: string;  // this col is the toggle for this group
  computed?: boolean;     // not a DB field
};

const ALL_COLUMNS: ColDef[] = [
  /* ── Core deal info ── */
  { label: "Date Closed",        key: "date_closed",                    type: "date" },
  { label: "Customer Name",      key: "customer_name",                  type: "text" },
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

  /* ── Status + Computed Stage ── */
  { label: "Status",        key: "status",           type: "text" },
  { label: "Current Stage", key: "__current_stage",   type: "text", computed: true },

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
  { label: "Design Ready",      key: "design_ready_date",            type: "date" },
  { label: "Permit Submitted",  key: "permit_submitted_date",        type: "date" },
  { label: "Permit Approved",   key: "permit_approved_date",         type: "date" },
  { label: "Install 1 (Racks)", key: "install_1_racks_date",         type: "date" },
  { label: "Install 2 (Panels)",key: "install_2_panel_landed_date",  type: "date" },
  { label: "PTO",               key: "pto_date",                     type: "date" },
  { label: "Paid",              key: "paid_date",                    type: "date" },
];

/* DB-backed columns only (for edit dialog & save logic) */
const EDIT_COLUMNS = ALL_COLUMNS.filter(col => !col.computed);

/* Helpers */
function money(n: number | null | undefined) { if (n == null) return ""; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n)); }
function numFmt(n: number | null | undefined, d = 2) { if (n == null) return ""; const v = Number(n); return Number.isNaN(v) ? "" : v.toFixed(d); }
function fmtDate(iso: string | null | undefined) { if (!iso) return ""; const p = iso.slice(0, 10).split("-"); return p.length < 3 ? iso : `${p[1]}/${p[2]}/${p[0].slice(-2)}`; }
function cellVal(row: DealRow, col: ColDef): string {
  if (col.computed && col.key === "__current_stage") return getCurrentStage(row);
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

const UI = {
  card: "bg-white rounded-xl border border-slate-200/60 shadow-sm",
  control: "w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200",
  buttonPrimary: "px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition",
  pill: "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-slate-200/70 bg-slate-50 text-slate-700",
};

/* ═══ MultiSelect (same as SPPDashboard) ═══ */
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
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="relative">
        <button type="button" className={`w-full ${UI.control} text-left flex items-center justify-between gap-2`} onClick={() => setOpen(s => !s)}>
          <span className={`truncate ${selected.length === 0 ? "text-slate-400" : "text-slate-900"}`}>{text}</span>
          <span className="text-slate-400 text-[10px]">▾</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200/70 bg-white shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-200/60">
              <input className={UI.control} placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
                <button type="button" className="text-[10px] font-semibold text-slate-600 hover:text-slate-900" onClick={() => onChange([])}>Clear</button>
              </div>
            </div>
            <div className="max-h-56 overflow-auto">
              {filtered.length === 0 ? <div className="px-3 py-3 text-sm text-slate-400">No matches.</div> : filtered.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer select-none">
                  <input type="checkbox" checked={selSet.has(opt)} onChange={() => toggle(opt)} />
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

/* ═══ MAIN COMPONENT ═══ */
export default function Sales() {
  useEffect(() => { const pb = document.body.style.overflow; const ph = document.documentElement.style.overflow; document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; return () => { document.body.style.overflow = pb; document.documentElement.style.overflow = ph; }; }, []);

  const { teamNames, effectiveScope, loading: scopeLoading } = usePortalUser();

  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  /* Filters */
  const [salesReps, setSalesReps] = useState<string[]>([]);
  const [ccSetters, setCcSetters] = useState<string[]>([]);
  const [installers, setInstallers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [customerQ, setCustomerQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /* Collapsible column groups — default: main 3 collapsed, NRG Adders visible */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["nrg_adders"]));
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

  /* Debounce ref */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    // If scope resolves to empty list, short-circuit — user sees nothing
    if (teamNames !== null && teamNames.length === 0) {
      setRows([]); setLoading(false); return;
    }
    setLoading(true); setMsg(null);
    let q = supabase.from("deals_view").select(SELECT_COLUMNS).order("date_closed", { ascending: false }).limit(5000);
    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);
    // Apply role-based scope filter (teamNames=null means "all", no filter)
    if (teamNames !== null && !salesReps.length) {
      q = q.in("sales_rep", teamNames);
    } else if (salesReps.length) {
      // If user picked specific reps AND we have a scope, intersect
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

  /* Options from loaded rows — sales rep dropdown is scoped to allowed names */
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

    /* Computed: sort by milestone completion count */
    if (sortKey === "__current_stage") {
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

  /* Edit dialog helpers */
  function openEdit(row: DealRow) {
    setEditRow(row);
    setEditDraft({ ...row });
    setEditMsg(null);
    setIsNew(false);
    setEditTab(0);
  }

  function openNew() {
    const blank: Record<string, any> = { id: "" };
    for (const col of EDIT_COLUMNS) blank[col.key] = null;
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
      /* ── INSERT new deal ── */
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
      /* ── UPDATE existing deal ── */
      const payload: Record<string, any> = {};
      for (const col of EDIT_COLUMNS) {
        const k = col.key as keyof DealRow;
        const rawNew = editDraft[k];
        const rawOld = editRow[k];
        /* Normalize both sides so "7.5" vs 7.5 doesn't trigger a false diff */
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
    <div className="min-h-0 flex flex-col overflow-hidden bg-slate-50 p-4" style={containerStyle}>
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Sticky top: filters */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Sales</h2>
                <p className="text-xs text-slate-400">Click any row to edit · Filters auto-apply as you type</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {!scopeLoading && effectiveScope !== "all" && (
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                  effectiveScope === "team" ? "border-purple-200 bg-purple-50 text-purple-700" :
                  effectiveScope === "own" ? "border-blue-200 bg-blue-50 text-blue-700" :
                  "border-slate-200 bg-slate-50 text-slate-500"
                }`}>
                  {effectiveScope === "team" ? "Showing: Your team's deals" :
                   effectiveScope === "own" ? "Showing: Your deals only" :
                   "Showing: No access"}
                </span>
              )}
              <span className={UI.pill}>{loading ? "Loading..." : `${rows.length} deals`}</span>
              <button className={UI.buttonGhost} onClick={load}>Refresh</button>
              <button className={UI.buttonGhost} onClick={clearAll}>Clear Filters</button>
              {/* NRG Customer Adders toggle */}
              <button
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                  expandedGroups.has("nrg_adders")
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
                }`}
                onClick={() => toggleGroup("nrg_adders")}
                title={expandedGroups.has("nrg_adders") ? "Hide NRG Customer Adders column" : "Show NRG Customer Adders column"}
              >
                NRG Adders {expandedGroups.has("nrg_adders") ? "ON" : "OFF"}
              </button>
              <button className={UI.buttonPrimary} onClick={openNew}>+ Add Deal</button>
            </div>
          </div>

          {msg && <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">{msg}</div>}

          <div className={`${UI.card} p-3`}>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Customer Name</div>
                <input className={UI.control} value={customerQ} onChange={e => setCustomerQ(e.target.value)} placeholder="Search..." />
              </div>
              <MultiSelect label="Sales Rep" options={options.salesReps} selected={salesReps} onChange={setSalesReps} />
              <MultiSelect label="CC Setter" options={options.ccSetters} selected={ccSetters} onChange={setCcSetters} />
              <MultiSelect label="Installer" options={options.installers} selected={installers} onChange={setInstallers} />
              <MultiSelect label="Status" options={options.statuses} selected={statuses} onChange={setStatuses} />
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Start Date</div>
                <input type="date" className={UI.control} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">End Date</div>
                <input type="date" className={UI.control} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        <div className="h-full overflow-auto">
          <table className="w-full text-xs" style={{ minWidth: `${visibleColumns.length * 120}px` }}>
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200/60">
              <tr className="text-left text-slate-700">
                {visibleColumns.map((col, i) => (
                  <th key={col.key}
                    className={`px-2.5 py-2 whitespace-nowrap border-r border-slate-200/60 font-semibold select-none hover:bg-slate-100/80 transition-colors ${i === visibleColumns.length - 1 ? "border-r-0" : ""} ${col.type === "money" || col.type === "num" ? "text-right" : ""} ${col.group ? "bg-blue-50/40" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {/* Group toggle chevron */}
                      {col.groupParent && (
                        <button
                          type="button"
                          className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors px-0.5"
                          onClick={(e) => { e.stopPropagation(); toggleGroup(col.groupParent!); }}
                          title={expandedGroups.has(col.groupParent!) ? "Collapse sub-columns" : "Expand sub-columns"}
                        >
                          {expandedGroups.has(col.groupParent!) ? "▾" : "▸"}
                        </button>
                      )}
                      <span className="cursor-pointer" onClick={() => handleSort(col)}>{col.label}</span>
                      {/* Sort indicator */}
                      <span className="cursor-pointer" onClick={() => handleSort(col)}>
                        {sortKey === col.key
                          ? <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                          : <span className="text-[10px] text-slate-300">⇅</span>}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={visibleColumns.length}>Loading deals...</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={visibleColumns.length}>No results.</td></tr>
              ) : (
                sortedRows.map(r => (
                  <tr key={r.id} onClick={() => openEdit(r)} className="border-b border-slate-200/40 hover:bg-indigo-50/40 cursor-pointer transition-colors">
                    {visibleColumns.map(col => (
                      <td key={col.key} className={`px-2.5 py-2 whitespace-nowrap border-r border-slate-200/40 ${col.type === "money" || col.type === "num" ? "text-right tabular-nums" : ""} ${col.group ? "bg-blue-50/20" : ""}`}>
                        {cellVal(r, col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      </div>{/* end rounded card wrapper */}

      {/* Edit Dialog — Tabbed */}
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

type EditFieldDef = { label: string; key: keyof DealRow; type: "text" | "money" | "num" | "date" };

/* ── Tab 0: Sales & Contract ── */
const TAB0_SALES: EditFieldDef[] = [
  { label: "Date Closed",   key: "date_closed",   type: "date" },
  { label: "Customer Name", key: "customer_name",  type: "text" },
  { label: "Company",       key: "company",        type: "text" },
  { label: "State",         key: "state",          type: "text" },
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
  const cls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300";
  return (
    <div>
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">{field.label}</label>
      {field.type === "date" ? (
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
  return <div className="col-span-full text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200/60 pb-1 mt-2">{children}</div>;
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-slate-800">{isNew ? "New Deal" : "Edit Deal"}</div>
            <div className="text-[10px] text-slate-400">{isNew ? "Fill in the fields below to create a new deal" : `${editDraft.customer_name ?? "Untitled"} · ${editDraft.sales_rep ?? "No rep"} · ID: ${editRow.id.slice(0, 8)}`}</div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-5 flex-shrink-0">
          {EDIT_TABS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`px-4 py-2.5 text-xs font-semibold transition-colors relative ${
                editTab === i
                  ? "text-slate-900"
                  : "text-slate-400 hover:text-slate-600"
              }`}
              onClick={() => setEditTab(i as 0 | 1 | 2)}
            >
              {label}
              {editTab === i && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {editTab === 0 && (
            <div className="space-y-1">
              <SectionLabel>Sales Info</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_SALES)}</div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-3">{renderFields(TAB0_REPS)}</div>
              <SectionLabel>Contract Info</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB0_CONTRACT)}</div>
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

              <SectionLabel>Milestones</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_MILESTONES)}</div>

              <SectionLabel>Completion</SectionLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">{renderFields(TAB2_PAID)}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0">
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
