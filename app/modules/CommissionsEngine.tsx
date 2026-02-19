"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

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
  commission_basis: string;
  effective_start: string;
  effective_end: string | null;
  is_active: boolean;
  priority: number;
};

type DealRow = {
  id: string;
  sales_rep: string | null;
  customer_name: string | null;
  company: string | null;
  state: string | null;
  teams: string | null;
  install_partner: string | null;
  contract_value: number | null;
  agent_payout: number | null;
  manager: string | null;
  manager_amount: number | null;
  date_closed: string | null;
  status: string | null;
  kw_system: number | null;
  net_price_per_watt: number | null;
  pricing_locked: boolean;
};

type RepSummary = {
  rep: string;
  matchedRule: CommissionRule | null;
  totalDeals: number;
  totalContractValue: number;
  totalActualPayout: number;
  totalCalculatedPayout: number;
  driftCount: number;
  deals: DealDetail[];
};

type DealDetail = {
  deal: DealRow;
  matchedRule: CommissionRule | null;
  calculatedPayout: number;
  actualPayout: number;
  hasDrift: boolean;
};

/* ═══════════════════ HELPERS ═══════════════════ */

const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  buttonPrimary: "px-3 py-2 rounded-lg bg-[#1c48a6] text-white text-sm shadow-sm hover:bg-[#7096e6] active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-[#EBEFF3] text-sm bg-white hover:bg-[#F5F7F9] active:scale-[0.99] transition",
};

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

function resolveCommissionRule(rules: CommissionRule[], deal: DealRow): CommissionRule | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = rules.filter(r => {
    if (!r.is_active || r.effective_start > today) return false;
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

function calculatePayout(rule: CommissionRule | null, deal: DealRow): number {
  if (!rule) return 0;
  const basis =
    rule.commission_basis === "per_kw" ? (deal.kw_system ?? 0) * 1000 :
    rule.commission_basis === "net_price" ? (deal.net_price_per_watt ?? 0) * (deal.kw_system ?? 0) * 1000 :
    (deal.contract_value ?? 0);
  const pct = rule.agent_commission_pct != null ? basis * (rule.agent_commission_pct / 100) : 0;
  return pct + (rule.agent_flat_amount ?? 0);
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

type ViewMode = "summary" | "detail" | "drift";

export default function CommissionsEngine() {
  const [view, setView] = useState<ViewMode>("summary");
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, dealsRes] = await Promise.all([
      supabase.from("commission_rules").select("*").order("priority", { ascending: false }),
      supabase.from("deals_view").select("id,sales_rep,customer_name,company,state,teams,install_partner,contract_value,agent_payout,manager,manager_amount,date_closed,status,kw_system,net_price_per_watt,pricing_locked").order("date_closed", { ascending: false }).limit(5000),
    ]);
    if (rulesRes.data) setRules(rulesRes.data as CommissionRule[]);
    if (dealsRes.data) setDeals(dealsRes.data as unknown as DealRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Build rep summaries */
  const repSummaries = useMemo(() => {
    const repMap = new Map<string, DealDetail[]>();
    for (const deal of deals) {
      const rep = deal.sales_rep ?? "Unassigned";
      if (!repMap.has(rep)) repMap.set(rep, []);
      const matched = resolveCommissionRule(rules, deal);
      const calc = calculatePayout(matched, deal);
      const actual = deal.agent_payout ?? 0;
      repMap.get(rep)!.push({
        deal, matchedRule: matched,
        calculatedPayout: calc, actualPayout: actual,
        hasDrift: Math.abs(calc - actual) > 1,
      });
    }
    const summaries: RepSummary[] = [];
    for (const [rep, dealDetails] of repMap) {
      const firstMatch = dealDetails[0]?.matchedRule ?? null;
      summaries.push({
        rep,
        matchedRule: firstMatch,
        totalDeals: dealDetails.length,
        totalContractValue: dealDetails.reduce((s, d) => s + (d.deal.contract_value ?? 0), 0),
        totalActualPayout: dealDetails.reduce((s, d) => s + d.actualPayout, 0),
        totalCalculatedPayout: dealDetails.reduce((s, d) => s + d.calculatedPayout, 0),
        driftCount: dealDetails.filter(d => d.hasDrift).length,
        deals: dealDetails,
      });
    }
    summaries.sort((a, b) => b.totalContractValue - a.totalContractValue);
    return summaries;
  }, [deals, rules]);

  const driftDeals = useMemo(() => {
    return repSummaries.flatMap(r => r.deals.filter(d => d.hasDrift));
  }, [repSummaries]);

  const selectedRepData = useMemo(() => {
    return repSummaries.find(r => r.rep === selectedRep) ?? null;
  }, [repSummaries, selectedRep]);

  const totalDrift = driftDeals.length;
  const totalDeals = deals.length;
  const totalCV = deals.reduce((s, d) => s + (d.contract_value ?? 0), 0);
  const totalPayout = deals.reduce((s, d) => s + (d.agent_payout ?? 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading commission data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Header */}
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
                <p className="text-xs text-slate-400">Commission reporting, drill-down & drift detection</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button className={UI.buttonGhost} onClick={load}>Refresh</button>
              </div>
            </div>
            <div className="flex gap-1">
              {([
                { key: "summary" as ViewMode, label: "Rep Summary" },
                { key: "detail" as ViewMode, label: "Deal Detail" },
                { key: "drift" as ViewMode, label: `Drift Detection (${totalDrift})` },
              ]).map(t => (
                <button key={t.key} onClick={() => { setView(t.key); if (t.key !== "detail") setSelectedRep(null); }}
                  className={`px-5 py-2.5 text-xs font-semibold rounded-t-lg transition-colors ${view === t.key ? "bg-slate-50 border border-b-0 border-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Total Deals</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">{totalDeals}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Pipeline Value</div>
              <div className="text-xl font-bold text-[#1c48a6] mt-0.5 tabular-nums">{money(totalCV)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Total Commissions Paid</div>
              <div className="text-xl font-bold text-emerald-700 mt-0.5 tabular-nums">{money(totalPayout)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Drift Alerts</div>
              <div className={`text-xl font-bold mt-0.5 tabular-nums ${totalDrift > 0 ? "text-amber-600" : "text-emerald-600"}`}>{totalDrift}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {view === "summary" && (
            <div className="overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Sales Rep</th>
                    <th className="px-3 py-2 font-semibold">Current Rule</th>
                    <th className="px-3 py-2 font-semibold text-right">Total Deals</th>
                    <th className="px-3 py-2 font-semibold text-right">Contract Value</th>
                    <th className="px-3 py-2 font-semibold text-right">Actual Payout</th>
                    <th className="px-3 py-2 font-semibold text-right">Calculated Payout</th>
                    <th className="px-3 py-2 font-semibold text-center">Drift</th>
                    <th className="px-3 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {repSummaries.map(r => (
                    <tr key={r.rep} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.rep}</td>
                      <td className="px-3 py-2 text-slate-600">{r.matchedRule?.name ?? <span className="text-slate-400 italic">No rule</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalDeals}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.totalContractValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.totalActualPayout)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.totalCalculatedPayout)}</td>
                      <td className="px-3 py-2 text-center">
                        {r.driftCount > 0 ? (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">{r.driftCount}</span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-semibold">OK</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button className="text-[10px] text-[#1c48a6] font-semibold hover:underline"
                          onClick={() => { setSelectedRep(r.rep); setView("detail"); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {repSummaries.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No commission data available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {view === "detail" && (
            <div className="space-y-4">
              {/* Rep selector */}
              <div className="flex items-center gap-3">
                <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                  value={selectedRep ?? ""} onChange={e => setSelectedRep(e.target.value || null)}>
                  <option value="">Select a rep...</option>
                  {repSummaries.map(r => <option key={r.rep} value={r.rep}>{r.rep} ({r.totalDeals} deals)</option>)}
                </select>
                {selectedRepData && (
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>Rule: <strong>{selectedRepData.matchedRule?.name ?? "None"}</strong></span>
                    <span>Deals: <strong>{selectedRepData.totalDeals}</strong></span>
                    <span>Total Payout: <strong className="text-emerald-700">{money(selectedRepData.totalActualPayout)}</strong></span>
                  </div>
                )}
              </div>

              {selectedRepData ? (
                <div className="overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold">Customer</th>
                        <th className="px-3 py-2 font-semibold">Date Closed</th>
                        <th className="px-3 py-2 font-semibold">State</th>
                        <th className="px-3 py-2 font-semibold text-right">Contract Value</th>
                        <th className="px-3 py-2 font-semibold">Matched Rule</th>
                        <th className="px-3 py-2 font-semibold text-right">Calculated</th>
                        <th className="px-3 py-2 font-semibold text-right">Actual Payout</th>
                        <th className="px-3 py-2 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRepData.deals.map(d => (
                        <tr key={d.deal.id} className={`border-b border-slate-100 ${d.hasDrift ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2 font-medium text-slate-900">{d.deal.customer_name ?? "Untitled"}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(d.deal.date_closed)}</td>
                          <td className="px-3 py-2 text-slate-600">{d.deal.state ?? ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.deal.contract_value)}</td>
                          <td className="px-3 py-2 text-slate-600">{d.matchedRule?.name ?? <span className="text-slate-400 italic">None</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.calculatedPayout)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.actualPayout)}</td>
                          <td className="px-3 py-2 text-center">
                            {d.hasDrift ? (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">DRIFT</span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-semibold">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-sm">Select a rep above to view deal-by-deal commission breakdown.</div>
              )}
            </div>
          )}

          {view === "drift" && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                Showing deals where the actual agent payout differs from the rule-calculated amount by more than $1.
              </div>
              <div className="overflow-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Sales Rep</th>
                      <th className="px-3 py-2 font-semibold">Customer</th>
                      <th className="px-3 py-2 font-semibold">Date Closed</th>
                      <th className="px-3 py-2 font-semibold text-right">Contract Value</th>
                      <th className="px-3 py-2 font-semibold">Matched Rule</th>
                      <th className="px-3 py-2 font-semibold text-right">Calculated</th>
                      <th className="px-3 py-2 font-semibold text-right">Actual</th>
                      <th className="px-3 py-2 font-semibold text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driftDeals.map(d => {
                      const diff = d.actualPayout - d.calculatedPayout;
                      return (
                        <tr key={d.deal.id} className="border-b border-slate-100 bg-amber-50/50 hover:bg-amber-50">
                          <td className="px-3 py-2 text-slate-700">{d.deal.sales_rep ?? "Unassigned"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{d.deal.customer_name ?? "Untitled"}</td>
                          <td className="px-3 py-2 text-slate-600">{fmtDate(d.deal.date_closed)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.deal.contract_value)}</td>
                          <td className="px-3 py-2 text-slate-600">{d.matchedRule?.name ?? <span className="text-slate-400 italic">No rule</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.calculatedPayout)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(d.actualPayout)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className={`font-semibold ${diff > 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {diff > 0 ? "+" : ""}{money(diff)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {driftDeals.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-emerald-600 font-semibold">No drift detected. All payouts match commission rules.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
