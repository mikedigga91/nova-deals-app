"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type PricingRule = {
  id: string;
  name: string;
  rule_type: string;
  state: string | null;
  install_partner: string | null;
  team: string | null;
  base_ppw: number | null;
  redline_ppw: number | null;
  target_margin_pct: number | null;
  max_agent_cost_basis: number | null;
  effective_start: string;
  effective_end: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdderCatalogItem = {
  id: string;
  name: string;
  category: string;
  default_unit_price: number;
  unit_label: string;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CommissionRule = {
  id: string;
  name: string;
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
};

type DealSnapshot = {
  id: string;
  deal_id: string;
  pricing_rule_id: string | null;
  commission_rule_id: string | null;
  base_ppw: number | null;
  redline_ppw: number | null;
  net_ppw: number | null;
  agent_cost_basis: number | null;
  contract_value: number | null;
  total_adders: number | null;
  contract_net_price: number | null;
  agent_commission_pct: number | null;
  agent_payout_amount: number | null;
  manager_commission_pct: number | null;
  manager_payout_amount: number | null;
  margin_pct: number | null;
  gross_profit: number | null;
  adders_snapshot: any;
  locked_at: string;
  locked_by: string | null;
  lock_reason: string | null;
  notes: string | null;
  version: number;
  is_current: boolean;
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

const RULE_TYPES = ["base", "state", "installer", "team", "override"];
const ADDER_CATEGORIES = ["equipment", "structural", "electrical", "other"];
const UNIT_LABELS = ["per unit", "per kW", "flat", "per sq ft"];
const COMMISSION_BASIS_OPTIONS = ["contract_value", "net_price", "per_kw"];

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

function getRuleStatus(rule: { effective_start: string; effective_end: string | null; is_active: boolean }): "current" | "future" | "expired" | "inactive" {
  if (!rule.is_active) return "inactive";
  const today = new Date().toISOString().slice(0, 10);
  if (rule.effective_start > today) return "future";
  if (rule.effective_end && rule.effective_end < today) return "expired";
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

/** Auto-suggest priority based on filled scope fields */
function suggestPriority(fields: { state?: string | null; team?: string | null; install_partner?: string | null; rule_type?: string }): number {
  if (fields.rule_type === "override") return 100;
  const has = { state: !!fields.state, team: !!fields.team, installer: !!fields.install_partner };
  if (has.state && has.team && has.installer) return 60;
  if (has.state && has.installer) return 50;
  if (has.state && has.team) return 40;
  if (has.installer) return 30;
  if (has.team) return 20;
  if (has.state) return 10;
  return 0;
}

/* ═══════════════════ SHARED RESOLVE FUNCTIONS ═══════════════════ */

type DealForResolve = {
  state?: string | null;
  install_partner?: string | null;
  company?: string | null;
  teams?: string | null;
  sales_rep?: string | null;
  date_closed?: string | null;
};

export function resolvePricingRule(rules: PricingRule[], deal: DealForResolve): PricingRule | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = rules.filter(r => {
    if (!r.is_active) return false;
    if (r.effective_start > today) return false;
    if (r.effective_end && r.effective_end < today) return false;
    if (r.state && r.state !== deal.state) return false;
    if (r.install_partner && r.install_partner !== (deal.install_partner ?? deal.company)) return false;
    if (r.team && r.team !== deal.teams) return false;
    return true;
  });
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] ?? null;
}

export function resolveCommissionRule(rules: CommissionRule[], deal: DealForResolve): CommissionRule | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = rules.filter(r => {
    if (!r.is_active) return false;
    if (r.effective_start > today) return false;
    if (r.effective_end && r.effective_end < today) return false;
    if (r.state && r.state !== deal.state) return false;
    if (r.install_partner && r.install_partner !== (deal.install_partner ?? deal.company)) return false;
    if (r.team && r.team !== deal.teams) return false;
    if (r.sales_rep && r.sales_rep !== deal.sales_rep) return false;
    return true;
  });
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] ?? null;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

type TabKey = "pricing" | "adders" | "commissions" | "snapshots";

export default function PricingRedline() {
  const [tab, setTab] = useState<TabKey>("pricing");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "pricing", label: "Pricing Rules" },
    { key: "adders", label: "Adder Catalog" },
    { key: "commissions", label: "Commission Rules" },
    { key: "snapshots", label: "Deal Snapshots" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1c48a6] to-[#7096e6] flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Pricing / Redline Engine</h2>
                <p className="text-xs text-slate-400">Manage pricing rules, adder catalog, commission rules & deal snapshots</p>
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
        {tab === "pricing" && <PricingRulesTab />}
        {tab === "adders" && <AdderCatalogTab />}
        {tab === "commissions" && <CommissionRulesTab />}
        {tab === "snapshots" && <SnapshotsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: PRICING RULES ═══════════════════ */

function PricingRulesTab() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<PricingRule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active">("active");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("pricing_rules").select("*").order("priority", { ascending: false });
    if (data) setRules(data as PricingRule[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rules.filter(r => {
      if (filterType && r.rule_type !== filterType) return false;
      if (filterActive === "active" && !r.is_active) return false;
      return true;
    });
  }, [rules, filterType, filterActive]);

  const blank: Partial<PricingRule> = {
    name: "", rule_type: "base", state: null, install_partner: null, team: null,
    base_ppw: null, redline_ppw: null, target_margin_pct: null, max_agent_cost_basis: null,
    effective_start: new Date().toISOString().slice(0, 10), effective_end: null,
    is_active: true, priority: 0, notes: null, created_by: null,
  };

  function setField(k: string, v: any) {
    setEditRule(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [k]: v === "" ? null : v };
      if (["state", "team", "install_partner", "rule_type"].includes(k)) {
        updated.priority = suggestPriority(updated);
      }
      return updated;
    });
  }

  async function saveRule() {
    if (!editRule || !editRule.name) { setMsg("Name is required."); return; }
    if (!editRule.effective_start) { setMsg("Effective start date is required."); return; }
    if (editRule.redline_ppw != null && editRule.base_ppw != null && Number(editRule.redline_ppw) > Number(editRule.base_ppw)) {
      setMsg("Redline PPW cannot exceed Base PPW."); return;
    }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      name: editRule.name, rule_type: editRule.rule_type ?? "base",
      state: editRule.state || null, install_partner: editRule.install_partner || null,
      team: editRule.team || null,
      base_ppw: editRule.base_ppw != null ? Number(editRule.base_ppw) : null,
      redline_ppw: editRule.redline_ppw != null ? Number(editRule.redline_ppw) : null,
      target_margin_pct: editRule.target_margin_pct != null ? Number(editRule.target_margin_pct) : null,
      max_agent_cost_basis: editRule.max_agent_cost_basis != null ? Number(editRule.max_agent_cost_basis) : null,
      effective_start: editRule.effective_start, effective_end: editRule.effective_end || null,
      is_active: editRule.is_active ?? true, priority: editRule.priority ?? 0,
      notes: editRule.notes || null, created_by: editRule.created_by || null,
      updated_at: new Date().toISOString(),
    };
    if (editRule.id) {
      const { error } = await supabase.from("pricing_rules").update(payload).eq("id", editRule.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("pricing_rules").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditRule(null); setSaving(false); load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this pricing rule?")) return;
    await supabase.from("pricing_rules").delete().eq("id", id);
    setEditRule(null); load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading pricing rules...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

      {/* Table */}
      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">State</th>
              <th className="px-3 py-2 font-semibold">Installer</th>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-3 py-2 font-semibold text-right">Base PPW</th>
              <th className="px-3 py-2 font-semibold text-right">Redline PPW</th>
              <th className="px-3 py-2 font-semibold text-right">Margin %</th>
              <th className="px-3 py-2 font-semibold text-right">Max Agent Cost</th>
              <th className="px-3 py-2 font-semibold">Priority</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Effective</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditRule({ ...r })}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2"><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">{r.rule_type}</span></td>
                <td className="px-3 py-2 text-slate-600">{r.state ?? "All"}</td>
                <td className="px-3 py-2 text-slate-600">{r.install_partner ?? "All"}</td>
                <td className="px-3 py-2 text-slate-600">{r.team ?? "All"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.base_ppw != null ? `$${numFmt(r.base_ppw)}` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.redline_ppw != null ? `$${numFmt(r.redline_ppw)}` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.target_margin_pct != null ? `${numFmt(r.target_margin_pct)}%` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.max_agent_cost_basis != null ? `$${numFmt(r.max_agent_cost_basis)}` : ""}</td>
                <td className="px-3 py-2 text-center">{r.priority}</td>
                <td className="px-3 py-2">{statusBadge(getRuleStatus(r))}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.effective_start)}{r.effective_end ? ` - ${fmtDate(r.effective_end)}` : " - ongoing"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">No pricing rules found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditRule(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editRule.id ? "Edit Pricing Rule" : "New Pricing Rule"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditRule(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Rule Name</label>
                  <input className={UI.control} value={editRule.name ?? ""} onChange={e => setField("name", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Rule Type</label>
                  <select className={UI.control} value={editRule.rule_type ?? "base"} onChange={e => setField("rule_type", e.target.value)}>
                    {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">State</label>
                  <input className={UI.control} value={editRule.state ?? ""} onChange={e => setField("state", e.target.value)} placeholder="All states" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Installer</label>
                  <input className={UI.control} value={editRule.install_partner ?? ""} onChange={e => setField("install_partner", e.target.value)} placeholder="All installers" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Team</label>
                  <input className={UI.control} value={editRule.team ?? ""} onChange={e => setField("team", e.target.value)} placeholder="All teams" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Base PPW ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.base_ppw ?? ""} onChange={e => setField("base_ppw", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Redline PPW ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.redline_ppw ?? ""} onChange={e => setField("redline_ppw", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Target Margin %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.target_margin_pct ?? ""} onChange={e => setField("target_margin_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Max Agent Cost ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.max_agent_cost_basis ?? ""} onChange={e => setField("max_agent_cost_basis", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective Start</label>
                  <input type="date" className={UI.control} value={editRule.effective_start ?? ""} onChange={e => setField("effective_start", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Effective End</label>
                  <input type="date" className={UI.control} value={editRule.effective_end ?? ""} onChange={e => setField("effective_end", e.target.value)} placeholder="Ongoing" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Priority</label>
                  <input type="number" className={`${UI.control} text-right`} value={editRule.priority ?? 0} onChange={e => setField("priority", e.target.value)} />
                  <p className="text-[9px] text-slate-400 mt-0.5">Auto-suggested based on scope</p>
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

/* ═══════════════════ TAB 2: ADDER CATALOG ═══════════════════ */

function AdderCatalogTab() {
  const [items, setItems] = useState<AdderCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<AdderCatalogItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("adder_catalog").select("*").order("sort_order").order("name");
    if (data) setItems(data as AdderCatalogItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterCat && i.category !== filterCat) return false;
      if (searchQ && !i.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [items, filterCat, searchQ]);

  const blank: Partial<AdderCatalogItem> = {
    name: "", category: "other", default_unit_price: 0, unit_label: "per unit",
    is_active: true, sort_order: 0, notes: null,
  };

  function setField(k: string, v: any) {
    setEditItem(prev => prev ? { ...prev, [k]: v === "" ? null : v } : prev);
  }

  async function saveItem() {
    if (!editItem || !editItem.name) { setMsg("Name is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      name: editItem.name, category: editItem.category ?? "other",
      default_unit_price: Number(editItem.default_unit_price ?? 0),
      unit_label: editItem.unit_label ?? "per unit",
      is_active: editItem.is_active ?? true,
      sort_order: Number(editItem.sort_order ?? 0),
      notes: editItem.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (editItem.id) {
      const { error } = await supabase.from("adder_catalog").update(payload).eq("id", editItem.id);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("adder_catalog").insert(payload);
      if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    }
    setEditItem(null); setSaving(false); load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this adder type?")) return;
    await supabase.from("adder_catalog").delete().eq("id", id);
    setEditItem(null); load();
  }

  async function saveInlinePrice(id: string) {
    const price = Number(inlinePrice);
    if (isNaN(price)) return;
    await supabase.from("adder_catalog").update({ default_unit_price: price, updated_at: new Date().toISOString() }).eq("id", id);
    setInlineEditId(null);
    load();
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading adder catalog...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-48" placeholder="Search adders..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {ADDER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className={UI.buttonGhost} onClick={load}>Refresh</button>
          <button className={UI.buttonPrimary} onClick={() => setEditItem({ ...blank })}>+ Add Adder Type</button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold text-right">Default Price</th>
              <th className="px-3 py-2 font-semibold">Unit Label</th>
              <th className="px-3 py-2 font-semibold text-center">Active</th>
              <th className="px-3 py-2 font-semibold text-center">Sort</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditItem({ ...item })}>
                <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    item.category === "equipment" ? "bg-blue-50 text-blue-700" :
                    item.category === "structural" ? "bg-amber-50 text-amber-700" :
                    item.category === "electrical" ? "bg-purple-50 text-purple-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{item.category}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" onClick={e => { e.stopPropagation(); setInlineEditId(item.id); setInlinePrice(String(item.default_unit_price)); }}>
                  {inlineEditId === item.id ? (
                    <input
                      type="number" step="0.01" className="border border-blue-300 rounded px-1.5 py-0.5 text-xs text-right w-24"
                      value={inlinePrice} autoFocus
                      onChange={e => setInlinePrice(e.target.value)}
                      onBlur={() => saveInlinePrice(item.id)}
                      onKeyDown={e => { if (e.key === "Enter") saveInlinePrice(item.id); if (e.key === "Escape") setInlineEditId(null); }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="hover:text-blue-600" title="Click to quick-edit price">{money(item.default_unit_price)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{item.unit_label}</td>
                <td className="px-3 py-2 text-center">{item.is_active ? <span className="text-emerald-600">Yes</span> : <span className="text-slate-400">No</span>}</td>
                <td className="px-3 py-2 text-center text-slate-500">{item.sort_order}</td>
                <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">{item.notes ?? ""}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No adder types found. Click &quot;+ Add Adder Type&quot; to create one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditItem(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{editItem.id ? "Edit Adder Type" : "New Adder Type"}</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditItem(null)}>&#10005;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Name</label>
                  <input className={UI.control} value={editItem.name ?? ""} onChange={e => setField("name", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Category</label>
                  <select className={UI.control} value={editItem.category ?? "other"} onChange={e => setField("category", e.target.value)}>
                    {ADDER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Default Unit Price</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editItem.default_unit_price ?? ""} onChange={e => setField("default_unit_price", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Unit Label</label>
                  <select className={UI.control} value={editItem.unit_label ?? "per unit"} onChange={e => setField("unit_label", e.target.value)}>
                    {UNIT_LABELS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Sort Order</label>
                  <input type="number" className={`${UI.control} text-right`} value={editItem.sort_order ?? 0} onChange={e => setField("sort_order", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Notes</label>
                <textarea className={UI.control} rows={2} value={editItem.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editItem.is_active ?? true} onChange={e => setField("is_active", e.target.checked as any)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
                </label>
                <span className="text-xs font-medium text-slate-700">Active</span>
              </div>
              {msg && <div className="text-xs text-red-600">{msg}</div>}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              {editItem.id ? (
                <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg" onClick={() => deleteItem(editItem.id!)}>Delete</button>
              ) : <div />}
              <div className="flex gap-2">
                <button className={UI.buttonGhost} onClick={() => setEditItem(null)}>Cancel</button>
                <button className={UI.buttonPrimary} onClick={saveItem} disabled={saving}>{saving ? "Saving..." : editItem.id ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 3: COMMISSION RULES ═══════════════════ */

function CommissionRulesTab() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<CommissionRule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active">("active");

  /* Mini calculator state */
  const [calcDealSize, setCalcDealSize] = useState("");
  const [calcRep, setCalcRep] = useState("");
  const [calcResult, setCalcResult] = useState<{ rule: CommissionRule; agentAmt: number; managerAmt: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("commission_rules").select("*").order("priority", { ascending: false });
    if (data) setRules(data as CommissionRule[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return rules.filter(r => {
      if (filterActive === "active" && !r.is_active) return false;
      return true;
    });
  }, [rules, filterActive]);

  const blank: Partial<CommissionRule> = {
    name: "", sales_rep: null, team: null, install_partner: null, state: null,
    agent_commission_pct: null, agent_flat_amount: null,
    manager_commission_pct: null, manager_flat_amount: null,
    company_margin_pct: null, setter_commission_pct: null, setter_flat_amount: null,
    commission_basis: "contract_value",
    effective_start: new Date().toISOString().slice(0, 10), effective_end: null,
    is_active: true, priority: 0, notes: null, created_by: null,
  };

  function setField(k: string, v: any) {
    setEditRule(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [k]: v === "" ? null : v };
      if (["state", "team", "install_partner"].includes(k)) {
        updated.priority = suggestPriority(updated);
      }
      return updated;
    });
  }

  async function saveRule() {
    if (!editRule || !editRule.name) { setMsg("Name is required."); return; }
    if (!editRule.effective_start) { setMsg("Effective start date is required."); return; }
    setSaving(true); setMsg(null);
    const payload: Record<string, any> = {
      name: editRule.name,
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
      is_active: editRule.is_active ?? true, priority: editRule.priority ?? 0,
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

  function runCalculator() {
    const dealSize = Number(calcDealSize);
    if (!dealSize) return;
    const matched = resolveCommissionRule(rules, { sales_rep: calcRep || null });
    if (!matched) { setCalcResult(null); return; }
    const agentAmt = (matched.agent_commission_pct != null ? dealSize * (matched.agent_commission_pct / 100) : 0) + (matched.agent_flat_amount ?? 0);
    const managerAmt = (matched.manager_commission_pct != null ? dealSize * (matched.manager_commission_pct / 100) : 0) + (matched.manager_flat_amount ?? 0);
    setCalcResult({ rule: matched, agentAmt, managerAmt });
  }

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading commission rules...</div>;

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
          <button className={UI.buttonPrimary} onClick={() => setEditRule({ ...blank })}>+ Add Commission Rule</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Rep</th>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-3 py-2 font-semibold">Installer</th>
              <th className="px-3 py-2 font-semibold">State</th>
              <th className="px-3 py-2 font-semibold text-right">Agent %</th>
              <th className="px-3 py-2 font-semibold text-right">Agent Flat</th>
              <th className="px-3 py-2 font-semibold text-right">Mgr %</th>
              <th className="px-3 py-2 font-semibold">Basis</th>
              <th className="px-3 py-2 font-semibold text-center">Priority</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Effective</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setEditRule({ ...r })}>
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.sales_rep ?? "All"}</td>
                <td className="px-3 py-2 text-slate-600">{r.team ?? "All"}</td>
                <td className="px-3 py-2 text-slate-600">{r.install_partner ?? "All"}</td>
                <td className="px-3 py-2 text-slate-600">{r.state ?? "All"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.agent_commission_pct != null ? `${numFmt(r.agent_commission_pct)}%` : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.agent_flat_amount != null ? money(r.agent_flat_amount) : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.manager_commission_pct != null ? `${numFmt(r.manager_commission_pct)}%` : ""}</td>
                <td className="px-3 py-2"><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">{r.commission_basis}</span></td>
                <td className="px-3 py-2 text-center">{r.priority}</td>
                <td className="px-3 py-2">{statusBadge(getRuleStatus(r))}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDate(r.effective_start)}{r.effective_end ? ` - ${fmtDate(r.effective_end)}` : " - ongoing"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">No commission rules found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Commission Calculator Mini-Panel */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-3">Commission Calculator</div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Sales Rep</label>
            <input className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40" value={calcRep} onChange={e => setCalcRep(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Deal Size ($)</label>
            <input type="number" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-40 text-right" value={calcDealSize} onChange={e => setCalcDealSize(e.target.value)} placeholder="e.g. 50000" />
          </div>
          <button className={UI.buttonPrimary} onClick={runCalculator}>Calculate</button>
        </div>
        {calcResult && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Matched Rule</div>
              <div className="text-xs font-medium text-slate-900 mt-0.5">{calcResult.rule.name}</div>
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Agent Payout</div>
              <div className="text-xs font-bold text-emerald-700 mt-0.5">{money(calcResult.agentAmt)}</div>
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Manager Payout</div>
              <div className="text-xs font-bold text-blue-700 mt-0.5">{money(calcResult.managerAmt)}</div>
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Priority</div>
              <div className="text-xs font-medium text-slate-700 mt-0.5">{calcResult.rule.priority}</div>
            </div>
          </div>
        )}
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
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Commission Basis</label>
                  <select className={UI.control} value={editRule.commission_basis ?? "contract_value"} onChange={e => setField("commission_basis", e.target.value)}>
                    {COMMISSION_BASIS_OPTIONS.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
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

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 mt-2">Agent Commission</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent Commission %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.agent_commission_pct ?? ""} onChange={e => setField("agent_commission_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent Flat Amount ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.agent_flat_amount ?? ""} onChange={e => setField("agent_flat_amount", e.target.value)} />
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 mt-2">Manager Commission</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Manager Commission %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.manager_commission_pct ?? ""} onChange={e => setField("manager_commission_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Manager Flat Amount ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.manager_flat_amount ?? ""} onChange={e => setField("manager_flat_amount", e.target.value)} />
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1 mt-2">Other</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Company Margin %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.company_margin_pct ?? ""} onChange={e => setField("company_margin_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Setter Commission %</label>
                  <input type="number" step="0.1" className={`${UI.control} text-right`} value={editRule.setter_commission_pct ?? ""} onChange={e => setField("setter_commission_pct", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Setter Flat Amount ($)</label>
                  <input type="number" step="0.01" className={`${UI.control} text-right`} value={editRule.setter_flat_amount ?? ""} onChange={e => setField("setter_flat_amount", e.target.value)} />
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
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Priority</label>
                  <input type="number" className={`${UI.control} text-right`} value={editRule.priority ?? 0} onChange={e => setField("priority", e.target.value)} />
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

/* ═══════════════════ TAB 4: DEAL SNAPSHOTS ═══════════════════ */

function SnapshotsTab() {
  const [snapshots, setSnapshots] = useState<DealSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Fetch snapshots and join deal customer_name
    const { data } = await supabase
      .from("deal_pricing_snapshot")
      .select("*, deals(customer_name)")
      .order("locked_at", { ascending: false })
      .limit(200);
    if (data) {
      setSnapshots(data.map((s: any) => ({
        ...s,
        customer_name: s.deals?.customer_name ?? null,
      })) as DealSnapshot[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading snapshots...</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-slate-500">Read-only audit log of locked deal pricing</p>
        </div>
        <button className={UI.buttonGhost} onClick={load}>Refresh</button>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold w-6" />
              <th className="px-3 py-2 font-semibold">Deal</th>
              <th className="px-3 py-2 font-semibold">Locked At</th>
              <th className="px-3 py-2 font-semibold">Locked By</th>
              <th className="px-3 py-2 font-semibold text-center">Version</th>
              <th className="px-3 py-2 font-semibold text-right">Base PPW</th>
              <th className="px-3 py-2 font-semibold text-right">Net PPW</th>
              <th className="px-3 py-2 font-semibold text-right">Contract Value</th>
              <th className="px-3 py-2 font-semibold text-right">Adders</th>
              <th className="px-3 py-2 font-semibold text-right">Agent %</th>
              <th className="px-3 py-2 font-semibold text-right">Payout</th>
              <th className="px-3 py-2 font-semibold text-right">Margin %</th>
              <th className="px-3 py-2 font-semibold text-center">Current</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map(s => (
              <React.Fragment key={s.id}>
                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                  <td className="px-3 py-2 text-slate-400">{expanded === s.id ? "\u25BC" : "\u25B6"}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{s.customer_name ?? s.deal_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-slate-600">{new Date(s.locked_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{s.locked_by ?? ""}</td>
                  <td className="px-3 py-2 text-center">{s.version}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.base_ppw != null ? `$${numFmt(s.base_ppw)}` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.net_ppw != null ? `$${numFmt(s.net_ppw)}` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.contract_value)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.total_adders)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.agent_commission_pct != null ? `${numFmt(s.agent_commission_pct)}%` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.agent_payout_amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.margin_pct != null ? `${numFmt(s.margin_pct)}%` : ""}</td>
                  <td className="px-3 py-2 text-center">{s.is_current ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-slate-400">No</span>}</td>
                </tr>
                {expanded === s.id && (
                  <tr>
                    <td colSpan={13} className="bg-slate-50 px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Redline PPW</span>
                          <div className="font-medium">{s.redline_ppw != null ? `$${numFmt(s.redline_ppw)}` : "N/A"}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Agent Cost Basis</span>
                          <div className="font-medium">{s.agent_cost_basis != null ? `$${numFmt(s.agent_cost_basis)}` : "N/A"}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Contract Net Price</span>
                          <div className="font-medium">{money(s.contract_net_price)}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Gross Profit</span>
                          <div className="font-medium">{money(s.gross_profit)}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Manager %</span>
                          <div className="font-medium">{s.manager_commission_pct != null ? `${numFmt(s.manager_commission_pct)}%` : "N/A"}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Manager Payout</span>
                          <div className="font-medium">{money(s.manager_payout_amount)}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Lock Reason</span>
                          <div className="font-medium">{s.lock_reason ?? "N/A"}</div>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Notes</span>
                          <div className="font-medium">{s.notes ?? "N/A"}</div>
                        </div>
                      </div>
                      {/* Itemized adders */}
                      {s.adders_snapshot && Array.isArray(s.adders_snapshot) && s.adders_snapshot.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Itemized Adders</div>
                          <table className="w-full text-xs border border-slate-200 rounded">
                            <thead className="bg-white">
                              <tr className="text-left">
                                <th className="px-2 py-1 font-semibold">Name</th>
                                <th className="px-2 py-1 font-semibold text-right">Qty</th>
                                <th className="px-2 py-1 font-semibold text-right">Unit Price</th>
                                <th className="px-2 py-1 font-semibold text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(s.adders_snapshot as any[]).map((a: any, i: number) => (
                                <tr key={i} className="border-t border-slate-100">
                                  <td className="px-2 py-1">{a.name}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{a.qty}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{money(a.unit_price)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{money(a.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {snapshots.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">No deal pricing snapshots found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
