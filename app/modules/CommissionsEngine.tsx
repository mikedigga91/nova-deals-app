"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type CommissionPlan = {
  id: string;
  name: string;
  effective_start_date: string;
  effective_end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CommissionRule = {
  id: string;
  name: string;
  plan_id: string | null;
  participant_role: string;
  tier_level: number;
  trigger_event: string;
  amount_type: string;
  amount_value: number;
  sales_rep: string | null;
  team: string | null;
  install_partner: string | null;
  state: string | null;
  agent_commission_pct: number | null;
  agent_flat_amount: number | null;
  manager_commission_pct: number | null;
  manager_flat_amount: number | null;
  company_margin_pct: number | null;
  setter_commission_pct: number | null;
  setter_flat_amount: number | null;
  commission_basis: string;
  effective_start: string;
  effective_end: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  plan_name?: string | null;
};

type CommissionEarning = {
  id: string;
  deal_id: string;
  user_name: string;
  participant_role: string;
  plan_id: string | null;
  rule_id: string | null;
  earning_amount: number;
  earning_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer_name?: string | null;
  plan_name?: string | null;
  rule_name?: string | null;
};

type CommissionAdjustment = {
  id: string;
  user_name: string;
  deal_id: string | null;
  type: string;
  reason: string | null;
  amount: number;
  created_by: string | null;
  created_at: string;
  // joined
  customer_name?: string | null;
};

/* ═══════════════════ CONSTANTS ═══════════════════ */

const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  control: "w-full rounded-lg border border-[#EBEFF3] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7096e6]/30",
  buttonPrimary: "px-3 py-2 rounded-lg bg-[#1c48a6] text-white text-sm shadow-sm hover:bg-[#7096e6] active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-[#EBEFF3] text-sm bg-white hover:bg-[#F5F7F9] active:scale-[0.99] transition",
};

const PARTICIPANT_ROLES = ["sales_rep", "manager", "setter", "cc_setter"];
const TRIGGER_EVENTS = ["install", "pto", "payment_received", "contract_signed", "permit_approved"];
const AMOUNT_TYPES = ["flat", "ppw", "percent_of_profit", "percent_of_revenue"];
const EARNING_STATUSES = ["pending", "approved", "paid", "void"];
const ADJUSTMENT_TYPES = ["deduction", "bonus"];

function money(n: number | null | undefined) {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}
function numFmt(n: number | null | undefined, d = 2) {
  if (n == null) return "";
  const v = Number(n);
  return Number.isNaN(v) ? "" : v.toFixed(d);
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const p = iso.slice(0, 10).split("-");
  return p.length < 3 ? iso : `${p[1]}/${p[2]}/${p[0].slice(-2)}`;
}

function getPlanStatus(plan: { effective_start_date: string; effective_end_date: string | null; is_active: boolean }): "current" | "future" | "expired" | "inactive" {
  if (!plan.is_active) return "inactive";
  const today = new Date().toISOString().slice(0, 10);
  if (plan.effective_start_date > today) return "future";
  if (plan.effective_end_date && plan.effective_end_date < today) return "expired";
  return "current";
}

function statusBadge(status: string) {
  const cls =
    status === "current" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    status === "future" ? "bg-amber-100 text-amber-700 border-amber-200" :
    status === "expired" ? "bg-slate-100 text-slate-500 border-slate-200" :
    "bg-red-100 text-red-600 border-red-200";
  return <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${cls}`}>{status.toUpperCase()}</span>;
}

function earningStatusBadge(status: string) {
  const cls =
    status === "paid" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    status === "approved" ? "bg-blue-100 text-blue-700 border-blue-200" :
    status === "pending" ? "bg-amber-100 text-amber-700 border-amber-200" :
    "bg-red-100 text-red-600 border-red-200";
  return <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${cls}`}>{status.toUpperCase()}</span>;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

type TabKey = "plans" | "rules" | "earnings" | "adjustments";

export default function CommissionsEngine() {
  const [tab, setTab] = useState<TabKey>("plans");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "plans", label: "Commission Plans" },
    { key: "rules", label: "Commission Rules" },
    { key: "earnings", label: "Commission Earnings" },
    { key: "adjustments", label: "Adjustments" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Commission Engine</h2>
                <p className="text-xs text-slate-400">Manage plans, rules, earnings & adjustments</p>
              </div>
            </div>
            <div className="flex gap-1">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-5 py-2.5 text-xs font-semibold rounded-t-lg transition-colors ${tab === t.key ? "bg-slate-50 border border-b-0 border-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {tab === "plans" && <PlansTab />}
        {tab === "rules" && <RulesTab />}
        {tab === "earnings" && <EarningsTab />}
        {tab === "adjustments" && <AdjustmentsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: COMMISSION PLANS ═══════════════════ */

function PlansTab() {
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<Partial<CommissionPlan> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active">("active");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("commission_plans").select("*").order("effective_start_date", { ascending: false });
    if (data) setPlans(data as CommissionPlan[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return plans.filter(p => {
      if (filterActive === "active" && !p.is_active) return false;
      return true;
    });
  }, [plans, filterActive]);

  const blank: Partial<CommissionPlan> = {
    name: "", effective_start_date: new Date().toISOString().slice(0, 10),
    effective_end_date: null, is_active: true, notes: null,
  };

  function setField(k: string, v: any) {
    setEditPlan(prev => prev ? { ...prev, [k]: v === "" ? null : v } : prev);
  }

  async function savePlan() {
    if (!editPlan || !editPlan.name) { setMsg("Name is required."); return; }
    if (!editPlan.effective_start_date) { setMsg("Effective start date is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      name: editPlan.name,
      effective_start_date: editPlan.effective_start_date,
      effective_end_date: editPlan.effective_end_date || null,
      is_active: editPlan.is_active ?? true,
      notes: editPlan.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (editPlan.id) {
      const { error } = await supabase.from("commission_plans").update(payload).eq("id", editPlan.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("commission_plans").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditPlan(null); setSaving(false); load();
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this commission plan? Rules linked to it will be unlinked.")) return;
    await supabase.from("commission_plans").delete().eq("id", id);
    setEditPlan(null); load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading commission plans...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterActive} onChange={e => setFilterActive(e.target.value as any)}>
            <option value="active">Active Only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={UI.buttonGhost} onClick={load}>Refresh</button>
          <button className={UI.buttonPrimary} onClick={() => setEditPlan({ ...blank })}>+ Add Plan</button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Plan Name</th>
              <th className="px-3 py-2 font-semibold">Effective Start</th>
              <th className="px-3 py-2 font-semibold">Effective End</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
              <th className="px-3 py-2 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditPlan({ ...p })}>
                <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                <td className="px-3 py-2 text-slate-600">{fmtDate(p.effective_start_date)}</td>
                <td className="px-3 py-2 text-slate-600">{p.effective_end_date ? fmtDate(p.effective_end_date) : "Ongoing"}</td>
                <td className="px-3 py-2">{statusBadge(getPlanStatus(p))}</td>
                <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">{p.notes ?? ""}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(p.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No commission plans found. Click &quot;+ Add Plan&quot; to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditPlan(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editPlan.id ? "Edit Commission Plan" : "New Commission Plan"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditPlan(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Plan Name</label>
                <input className={UI.control} value={editPlan.name ?? ""} onChange={e => setField("name", e.target.value)} placeholder='e.g. "2026 Solar Plan v3"' />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective Start Date</label>
                  <input type="date" className={UI.control} value={editPlan.effective_start_date ?? ""} onChange={e => setField("effective_start_date", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective End Date</label>
                  <input type="date" className={UI.control} value={editPlan.effective_end_date ?? ""} onChange={e => setField("effective_end_date", e.target.value)} placeholder="Ongoing" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Notes</label>
                <textarea className={UI.control} rows={2} value={editPlan.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editPlan.is_active ?? true} onChange={e => setField("is_active", e.target.checked as any)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </label>
                <span className="text-xs font-medium text-slate-700">Active</span>
              </div>
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editPlan.id ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deletePlan(editPlan.id!)}>Delete</button>
              ) : <div />}
              <div className="flex gap-2">
                <button className={UI.buttonGhost} onClick={() => setEditPlan(null)}>Cancel</button>
                <button className={UI.buttonPrimary} onClick={savePlan} disabled={saving}>{saving ? "Saving..." : editPlan.id ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 2: COMMISSION RULES ═══════════════════ */

function RulesTab() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<CommissionRule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterPlan, setFilterPlan] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active">("active");

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, plansRes] = await Promise.all([
      supabase.from("commission_rules").select("*, commission_plans(name)").order("priority", { ascending: false }),
      supabase.from("commission_plans").select("*").order("name"),
    ]);
    if (rulesRes.data) {
      setRules(rulesRes.data.map((r: any) => ({
        ...r,
        plan_name: r.commission_plans?.name ?? null,
      })) as CommissionRule[]);
    }
    if (plansRes.data) setPlans(plansRes.data as CommissionPlan[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rules.filter(r => {
      if (filterActive === "active" && !r.is_active) return false;
      if (filterPlan && r.plan_id !== filterPlan) return false;
      if (filterRole && r.participant_role !== filterRole) return false;
      return true;
    });
  }, [rules, filterActive, filterPlan, filterRole]);

  const blank: Partial<CommissionRule> = {
    name: "", plan_id: null, participant_role: "sales_rep",
    tier_level: 1, trigger_event: "install", amount_type: "flat", amount_value: 0,
    sales_rep: null, team: null, install_partner: null, state: null,
    agent_commission_pct: null, agent_flat_amount: null,
    manager_commission_pct: null, manager_flat_amount: null,
    company_margin_pct: null, setter_commission_pct: null, setter_flat_amount: null,
    commission_basis: "contract_value",
    effective_start: new Date().toISOString().slice(0, 10), effective_end: null,
    is_active: true, priority: 0, notes: null, created_by: null,
  };

  function setField(k: string, v: any) {
    setEditRule(prev => prev ? { ...prev, [k]: v === "" ? null : v } : prev);
  }

  async function saveRule() {
    if (!editRule || !editRule.name) { setMsg("Name is required."); return; }
    if (!editRule.effective_start) { setMsg("Effective start date is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      name: editRule.name,
      plan_id: editRule.plan_id || null,
      participant_role: editRule.participant_role ?? "sales_rep",
      tier_level: Number(editRule.tier_level ?? 1),
      trigger_event: editRule.trigger_event ?? "install",
      amount_type: editRule.amount_type ?? "flat",
      amount_value: Number(editRule.amount_value ?? 0),
      sales_rep: editRule.sales_rep || null, team: editRule.team || null,
      install_partner: editRule.install_partner || null, state: editRule.state || null,
      agent_commission_pct: editRule.agent_commission_pct != null ? Number(editRule.agent_commission_pct) : null,
      agent_flat_amount: editRule.agent_flat_amount != null ? Number(editRule.agent_flat_amount) : null,
      manager_commission_pct: editRule.manager_commission_pct != null ? Number(editRule.manager_commission_pct) : null,
      manager_flat_amount: editRule.manager_flat_amount != null ? Number(editRule.manager_flat_amount) : null,
      company_margin_pct: editRule.company_margin_pct != null ? Number(editRule.company_margin_pct) : null,
      setter_commission_pct: editRule.setter_commission_pct != null ? Number(editRule.setter_commission_pct) : null,
      setter_flat_amount: editRule.setter_flat_amount != null ? Number(editRule.setter_flat_amount) : null,
      commission_basis: editRule.commission_basis ?? "contract_value",
      effective_start: editRule.effective_start, effective_end: editRule.effective_end || null,
      is_active: editRule.is_active ?? true, priority: Number(editRule.priority ?? 0),
      notes: editRule.notes || null, created_by: editRule.created_by || null,
      updated_at: new Date().toISOString(),
    };
    if (editRule.id) {
      const { error } = await supabase.from("commission_rules").update(payload).eq("id", editRule.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("commission_rules").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditRule(null); setSaving(false); load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this commission rule?")) return;
    await supabase.from("commission_rules").delete().eq("id", id);
    setEditRule(null); load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading commission rules...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
            <option value="">All Plans</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">All Roles</option>
            {PARTICIPANT_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterActive} onChange={e => setFilterActive(e.target.value as any)}>
            <option value="active">Active Only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className={UI.buttonGhost} onClick={load}>Refresh</button>
          <button className={UI.buttonPrimary} onClick={() => setEditRule({ ...blank })}>+ Add Rule</button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Plan</th>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold text-center">Tier</th>
              <th className="px-3 py-2 font-semibold">Trigger</th>
              <th className="px-3 py-2 font-semibold">Amount Type</th>
              <th className="px-3 py-2 font-semibold text-right">Amount</th>
              <th className="px-3 py-2 font-semibold text-center">Priority</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Effective</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditRule({ ...r })}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.plan_name ?? <span className="text-slate-400 italic">None</span>}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    r.participant_role === "sales_rep" ? "bg-blue-50 text-blue-700" :
                    r.participant_role === "manager" ? "bg-purple-50 text-purple-700" :
                    r.participant_role === "setter" ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{r.participant_role.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{r.tier_level}</td>
                <td className="px-3 py-2"><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">{r.trigger_event}</span></td>
                <td className="px-3 py-2 text-slate-600">{r.amount_type.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {r.amount_type === "flat" ? money(r.amount_value) :
                   r.amount_type === "ppw" ? `$${numFmt(r.amount_value)}/W` :
                   `${numFmt(r.amount_value)}%`}
                </td>
                <td className="px-3 py-2 text-center">{r.priority}</td>
                <td className="px-3 py-2">{statusBadge(r.is_active ? (r.effective_end && r.effective_end < new Date().toISOString().slice(0, 10) ? "expired" : r.effective_start > new Date().toISOString().slice(0, 10) ? "future" : "current") : "inactive")}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.effective_start)}{r.effective_end ? ` - ${fmtDate(r.effective_end)}` : " - ongoing"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No commission rules found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditRule(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editRule.id ? "Edit Commission Rule" : "New Commission Rule"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditRule(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Rule Name</label>
                  <input className={UI.control} value={editRule.name ?? ""} onChange={e => setField("name", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Commission Plan</label>
                  <select className={UI.control} value={editRule.plan_id ?? ""} onChange={e => setField("plan_id", e.target.value)}>
                    <option value="">No plan (standalone)</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1">Plan-Based Fields</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Participant Role</label>
                  <select className={UI.control} value={editRule.participant_role ?? "sales_rep"} onChange={e => setField("participant_role", e.target.value)}>
                    {PARTICIPANT_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Tier Level</label>
                  <input type="number" className={`${UI.control} text-right`} value={editRule.tier_level ?? 1} onChange={e => setField("tier_level", e.target.value)} min={1} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Trigger Event</label>
                  <select className={UI.control} value={editRule.trigger_event ?? "install"} onChange={e => setField("trigger_event", e.target.value)}>
                    {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Type</label>
                  <select className={UI.control} value={editRule.amount_type ?? "flat"} onChange={e => setField("amount_type", e.target.value)}>
                    {AMOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Value</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.amount_value ?? 0} onChange={e => setField("amount_value", e.target.value)} />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {editRule.amount_type === "flat" ? "Flat dollar amount" :
                     editRule.amount_type === "ppw" ? "Dollar per watt" :
                     "Percentage value"}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Priority</label>
                  <input type="number" className={`${UI.control} text-right`} value={editRule.priority ?? 0} onChange={e => setField("priority", e.target.value)} />
                  <p className="text-[9px] text-slate-400 mt-0.5">Higher priority wins when multiple rules match</p>
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 mt-2">Scope Filters</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Sales Rep</label>
                  <input className={UI.control} value={editRule.sales_rep ?? ""} onChange={e => setField("sales_rep", e.target.value)} placeholder="All reps" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Team</label>
                  <input className={UI.control} value={editRule.team ?? ""} onChange={e => setField("team", e.target.value)} placeholder="All teams" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Installer</label>
                  <input className={UI.control} value={editRule.install_partner ?? ""} onChange={e => setField("install_partner", e.target.value)} placeholder="All installers" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">State</label>
                  <input className={UI.control} value={editRule.state ?? ""} onChange={e => setField("state", e.target.value)} placeholder="All states" />
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 mt-2">Legacy Commission Fields</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.agent_commission_pct ?? ""} onChange={e => setField("agent_commission_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent Flat ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.agent_flat_amount ?? ""} onChange={e => setField("agent_flat_amount", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Manager %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.manager_commission_pct ?? ""} onChange={e => setField("manager_commission_pct", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective Start</label>
                  <input type="date" className={UI.control} value={editRule.effective_start ?? ""} onChange={e => setField("effective_start", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective End</label>
                  <input type="date" className={UI.control} value={editRule.effective_end ?? ""} onChange={e => setField("effective_end", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Commission Basis</label>
                  <select className={UI.control} value={editRule.commission_basis ?? "contract_value"} onChange={e => setField("commission_basis", e.target.value)}>
                    {["contract_value", "net_price", "per_kw"].map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Notes</label>
                <textarea className={UI.control} rows={2} value={editRule.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editRule.is_active ?? true} onChange={e => setField("is_active", e.target.checked as any)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </label>
                <span className="text-xs font-medium text-slate-700">Active</span>
              </div>
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editRule.id ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deleteRule(editRule.id!)}>Delete</button>
              ) : <div />}
              <div className="flex gap-2">
                <button className={UI.buttonGhost} onClick={() => setEditRule(null)}>Cancel</button>
                <button className={UI.buttonPrimary} onClick={saveRule} disabled={saving}>{saving ? "Saving..." : editRule.id ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 3: COMMISSION EARNINGS ═══════════════════ */

function EarningsTab() {
  const [earnings, setEarnings] = useState<CommissionEarning[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEarning, setEditEarning] = useState<Partial<CommissionEarning> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [searchDeal, setSearchDeal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [earningsRes, plansRes, rulesRes] = await Promise.all([
      supabase.from("commission_earnings").select("*, deals(customer_name), commission_plans(name), commission_rules(name)").order("created_at", { ascending: false }).limit(500),
      supabase.from("commission_plans").select("*").order("name"),
      supabase.from("commission_rules").select("id,name").order("name"),
    ]);
    if (earningsRes.data) {
      setEarnings(earningsRes.data.map((e: any) => ({
        ...e,
        customer_name: e.deals?.customer_name ?? null,
        plan_name: e.commission_plans?.name ?? null,
        rule_name: e.commission_rules?.name ?? null,
      })) as CommissionEarning[]);
    }
    if (plansRes.data) setPlans(plansRes.data as CommissionPlan[]);
    if (rulesRes.data) setRules(rulesRes.data as CommissionRule[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return earnings.filter(e => {
      if (filterStatus && e.earning_status !== filterStatus) return false;
      if (filterUser && !e.user_name.toLowerCase().includes(filterUser.toLowerCase())) return false;
      if (searchDeal && !(e.customer_name ?? "").toLowerCase().includes(searchDeal.toLowerCase())) return false;
      return true;
    });
  }, [earnings, filterStatus, filterUser, searchDeal]);

  /* KPI totals */
  const totalPending = earnings.filter(e => e.earning_status === "pending").reduce((s, e) => s + e.earning_amount, 0);
  const totalApproved = earnings.filter(e => e.earning_status === "approved").reduce((s, e) => s + e.earning_amount, 0);
  const totalPaid = earnings.filter(e => e.earning_status === "paid").reduce((s, e) => s + e.earning_amount, 0);
  const totalVoid = earnings.filter(e => e.earning_status === "void").reduce((s, e) => s + e.earning_amount, 0);

  const blank: Partial<CommissionEarning> = {
    deal_id: "", user_name: "", participant_role: "sales_rep",
    plan_id: null, rule_id: null, earning_amount: 0,
    earning_status: "pending", notes: null,
  };

  function setField(k: string, v: any) {
    setEditEarning(prev => prev ? { ...prev, [k]: v === "" ? null : v } : prev);
  }

  async function saveEarning() {
    if (!editEarning || !editEarning.user_name) { setMsg("User name is required."); return; }
    if (!editEarning.deal_id) { setMsg("Deal ID is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      deal_id: editEarning.deal_id,
      user_name: editEarning.user_name,
      participant_role: editEarning.participant_role ?? "sales_rep",
      plan_id: editEarning.plan_id || null,
      rule_id: editEarning.rule_id || null,
      earning_amount: Number(editEarning.earning_amount ?? 0),
      earning_status: editEarning.earning_status ?? "pending",
      notes: editEarning.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (editEarning.id) {
      const { error } = await supabase.from("commission_earnings").update(payload).eq("id", editEarning.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("commission_earnings").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditEarning(null); setSaving(false); load();
  }

  async function deleteEarning(id: string) {
    if (!confirm("Delete this earning record?")) return;
    await supabase.from("commission_earnings").delete().eq("id", id);
    setEditEarning(null); load();
  }

  async function bulkUpdateStatus(ids: string[], newStatus: string) {
    for (const id of ids) {
      await supabase.from("commission_earnings").update({ earning_status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    }
    load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading commission earnings...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      {/* KPI Bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Pending</div>
          <div className="text-xl font-bold text-amber-600 mt-0.5 tabular-nums">{money(totalPending)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Approved</div>
          <div className="text-xl font-bold text-blue-600 mt-0.5 tabular-nums">{money(totalApproved)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Paid</div>
          <div className="text-xl font-bold text-emerald-700 mt-0.5 tabular-nums">{money(totalPaid)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Voided</div>
          <div className="text-xl font-bold text-red-600 mt-0.5 tabular-nums">{money(totalVoid)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40" placeholder="Filter by user..." value={filterUser} onChange={e => setFilterUser(e.target.value)} />
          <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40" placeholder="Search deal..." value={searchDeal} onChange={e => setSearchDeal(e.target.value)} />
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {EARNING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {filtered.filter(e => e.earning_status === "pending").length > 0 && (
            <button className="px-3 py-2 rounded-lg border border-blue-200 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
              onClick={() => bulkUpdateStatus(filtered.filter(e => e.earning_status === "pending").map(e => e.id), "approved")}>
              Approve All Pending ({filtered.filter(e => e.earning_status === "pending").length})
            </button>
          )}
          <button className={UI.buttonGhost} onClick={load}>Refresh</button>
          <button className={UI.buttonPrimary} onClick={() => setEditEarning({ ...blank })}>+ Add Earning</button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">User</th>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Deal</th>
              <th className="px-3 py-2 font-semibold">Plan</th>
              <th className="px-3 py-2 font-semibold">Rule</th>
              <th className="px-3 py-2 font-semibold text-right">Amount</th>
              <th className="px-3 py-2 font-semibold text-center">Status</th>
              <th className="px-3 py-2 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditEarning({ ...e })}>
                <td className="px-3 py-2 font-medium text-slate-900">{e.user_name}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    e.participant_role === "sales_rep" ? "bg-blue-50 text-blue-700" :
                    e.participant_role === "manager" ? "bg-purple-50 text-purple-700" :
                    e.participant_role === "setter" ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{e.participant_role.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{e.customer_name ?? e.deal_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-slate-600">{e.plan_name ?? <span className="text-slate-400 italic">-</span>}</td>
                <td className="px-3 py-2 text-slate-600">{e.rule_name ?? <span className="text-slate-400 italic">-</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{money(e.earning_amount)}</td>
                <td className="px-3 py-2 text-center">{earningStatusBadge(e.earning_status)}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(e.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No commission earnings found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editEarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditEarning(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editEarning.id ? "Edit Commission Earning" : "New Commission Earning"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditEarning(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">User Name</label>
                  <input className={UI.control} value={editEarning.user_name ?? ""} onChange={e => setField("user_name", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Participant Role</label>
                  <select className={UI.control} value={editEarning.participant_role ?? "sales_rep"} onChange={e => setField("participant_role", e.target.value)}>
                    {PARTICIPANT_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Deal ID</label>
                <input className={UI.control} value={editEarning.deal_id ?? ""} onChange={e => setField("deal_id", e.target.value)} placeholder="UUID of the deal" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Commission Plan</label>
                  <select className={UI.control} value={editEarning.plan_id ?? ""} onChange={e => setField("plan_id", e.target.value)}>
                    <option value="">None</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Commission Rule</label>
                  <select className={UI.control} value={editEarning.rule_id ?? ""} onChange={e => setField("rule_id", e.target.value)}>
                    <option value="">None</option>
                    {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Earning Amount ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editEarning.earning_amount ?? 0} onChange={e => setField("earning_amount", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Status</label>
                  <select className={UI.control} value={editEarning.earning_status ?? "pending"} onChange={e => setField("earning_status", e.target.value)}>
                    {EARNING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Notes</label>
                <textarea className={UI.control} rows={2} value={editEarning.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editEarning.id ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deleteEarning(editEarning.id!)}>Delete</button>
              ) : <div />}
              <div className="flex gap-2">
                <button className={UI.buttonGhost} onClick={() => setEditEarning(null)}>Cancel</button>
                <button className={UI.buttonPrimary} onClick={saveEarning} disabled={saving}>{saving ? "Saving..." : editEarning.id ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 4: ADJUSTMENTS ═══════════════════ */

function AdjustmentsTab() {
  const [adjustments, setAdjustments] = useState<CommissionAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAdj, setEditAdj] = useState<Partial<CommissionAdjustment> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterUser, setFilterUser] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("commission_adjustments").select("*, deals(customer_name)").order("created_at", { ascending: false }).limit(500);
    if (data) {
      setAdjustments(data.map((a: any) => ({
        ...a,
        customer_name: a.deals?.customer_name ?? null,
      })) as CommissionAdjustment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return adjustments.filter(a => {
      if (filterType && a.type !== filterType) return false;
      if (filterUser && !a.user_name.toLowerCase().includes(filterUser.toLowerCase())) return false;
      return true;
    });
  }, [adjustments, filterType, filterUser]);

  const totalBonuses = adjustments.filter(a => a.type === "bonus").reduce((s, a) => s + a.amount, 0);
  const totalDeductions = adjustments.filter(a => a.type === "deduction").reduce((s, a) => s + a.amount, 0);
  const netAdjustments = totalBonuses - totalDeductions;

  const blank: Partial<CommissionAdjustment> = {
    user_name: "", deal_id: null, type: "bonus",
    reason: null, amount: 0, created_by: null,
  };

  function setField(k: string, v: any) {
    setEditAdj(prev => prev ? { ...prev, [k]: v === "" ? null : v } : prev);
  }

  async function saveAdj() {
    if (!editAdj || !editAdj.user_name) { setMsg("User name is required."); return; }
    if (!editAdj.amount && editAdj.amount !== 0) { setMsg("Amount is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      user_name: editAdj.user_name,
      deal_id: editAdj.deal_id || null,
      type: editAdj.type ?? "bonus",
      reason: editAdj.reason || null,
      amount: Number(editAdj.amount ?? 0),
      created_by: editAdj.created_by || null,
    };
    if (editAdj.id) {
      const { error } = await supabase.from("commission_adjustments").update(payload).eq("id", editAdj.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("commission_adjustments").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditAdj(null); setSaving(false); load();
  }

  async function deleteAdj(id: string) {
    if (!confirm("Delete this adjustment?")) return;
    await supabase.from("commission_adjustments").delete().eq("id", id);
    setEditAdj(null); load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading adjustments...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      {/* KPI Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Total Bonuses</div>
          <div className="text-xl font-bold text-emerald-700 mt-0.5 tabular-nums">{money(totalBonuses)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Total Deductions</div>
          <div className="text-xl font-bold text-red-600 mt-0.5 tabular-nums">{money(totalDeductions)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase">Net Adjustments</div>
          <div className={`text-xl font-bold mt-0.5 tabular-nums ${netAdjustments >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(netAdjustments)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40" placeholder="Filter by user..." value={filterUser} onChange={e => setFilterUser(e.target.value)} />
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {ADJUSTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className={UI.buttonGhost} onClick={load}>Refresh</button>
          <button className={UI.buttonPrimary} onClick={() => setEditAdj({ ...blank })}>+ Add Adjustment</button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">User</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Deal</th>
              <th className="px-3 py-2 font-semibold">Reason</th>
              <th className="px-3 py-2 font-semibold text-right">Amount</th>
              <th className="px-3 py-2 font-semibold">Created By</th>
              <th className="px-3 py-2 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditAdj({ ...a })}>
                <td className="px-3 py-2 font-medium text-slate-900">{a.user_name}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    a.type === "bonus" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}>{a.type}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{a.customer_name ?? (a.deal_id ? a.deal_id.slice(0, 8) : <span className="text-slate-400 italic">N/A</span>)}</td>
                <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{a.reason ?? ""}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  <span className={a.type === "deduction" ? "text-red-600" : "text-emerald-700"}>
                    {a.type === "deduction" ? "-" : "+"}{money(a.amount)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-500">{a.created_by ?? ""}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(a.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No adjustments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editAdj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditAdj(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editAdj.id ? "Edit Adjustment" : "New Adjustment"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditAdj(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">User Name</label>
                  <input className={UI.control} value={editAdj.user_name ?? ""} onChange={e => setField("user_name", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Type</label>
                  <select className={UI.control} value={editAdj.type ?? "bonus"} onChange={e => setField("type", e.target.value)}>
                    {ADJUSTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Deal ID (optional)</label>
                <input className={UI.control} value={editAdj.deal_id ?? ""} onChange={e => setField("deal_id", e.target.value)} placeholder="UUID of the deal (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editAdj.amount ?? 0} onChange={e => setField("amount", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Created By</label>
                  <input className={UI.control} value={editAdj.created_by ?? ""} onChange={e => setField("created_by", e.target.value)} placeholder="Your name" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Reason</label>
                <textarea className={UI.control} rows={2} value={editAdj.reason ?? ""} onChange={e => setField("reason", e.target.value)} />
              </div>
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editAdj.id ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deleteAdj(editAdj.id!)}>Delete</button>
              ) : <div />}
              <div className="flex gap-2">
                <button className={UI.buttonGhost} onClick={() => setEditAdj(null)}>Cancel</button>
                <button className={UI.buttonPrimary} onClick={saveAdj} disabled={saving}>{saving ? "Saving..." : editAdj.id ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
