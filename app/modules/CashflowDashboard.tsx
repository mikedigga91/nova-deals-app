"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePortalUser } from "@/lib/usePortalUser";
import {
  ComposedChart, BarChart, Bar, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ═══════════════════ CONSTANTS & HELPERS ═══════════════════ */

const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  buttonGhost: "px-3 py-2 rounded-lg border border-[#EBEFF3] text-sm bg-white hover:bg-[#F5F7F9] active:scale-[0.99] transition",
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function money(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n));
}
function moneyCompact(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "$0";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return money(v);
}
function pct(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "0%";
  return `${(Number(n) * 100).toFixed(1)}%`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const p = iso.slice(0, 10).split("-");
  return p.length < 3 ? iso : `${p[1]}/${p[2]}/${p[0].slice(-2)}`;
}
function num(v: any): number { return Number(v) || 0; }

function deriveDealSource(d: any): string {
  if (d.deal_source) return d.deal_source;
  const ol = (d.online_deal ?? "").toString().trim().toLowerCase();
  if (["yes", "true", "1", "online"].includes(ol)) return "online";
  const cc = (d.call_center_lead ?? "").toString().trim().toLowerCase();
  if (["yes", "true", "1", "call center"].includes(cc)) return "call_center";
  return "other";
}

const DATE_PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "MTD", days: -2 },
  { label: "QTD", days: -3 },
  { label: "YTD", days: -1 },
  { label: "All", days: 0 },
] as const;

function presetRange(preset: typeof DATE_PRESETS[number]): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset.days === 0) return { start: "2020-01-01", end: "2099-12-31" };
  if (preset.days === -1) return { start: `${now.getFullYear()}-01-01`, end };
  if (preset.days === -2) return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, end };
  if (preset.days === -3) {
    const qm = Math.floor(now.getMonth() / 3) * 3;
    return { start: `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`, end };
  }
  const s = new Date(now);
  s.setDate(s.getDate() - preset.days);
  return { start: s.toISOString().slice(0, 10), end };
}

function downloadCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => {
    const v = r[k] ?? "";
    return typeof v === "string" && (v.includes(",") || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={UI.card + " p-4"}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${color ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function weekKey(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  const ws = new Date(dt);
  ws.setDate(dt.getDate() - dt.getDay());
  return ws.toISOString().slice(0, 10);
}
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/* ═══════════════════ TYPES ═══════════════════ */

type DealRow = Record<string, any>;
type EarningRow = { user_name: string; earning_amount: number; earning_status: string; deal_id: string; participant_role?: string; created_at?: string };
type AdjustmentRow = { user_name: string; type: string; amount: number; reason?: string; deal_id?: string; created_at?: string };
type AdvanceSummary = { agent_name: string; total_advances: number; total_repayments: number; current_remaining_balance: number };

type DateBasis = "payment" | "close" | "created";
type TabKey = "summary" | "receivables" | "commissions" | "advances" | "source" | "ledger";

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function CashflowDashboard() {
  const { portalUser, effectiveScope, teamNames, loading: rbacLoading } = usePortalUser();
  const isRep = effectiveScope === "own";
  const isManager = effectiveScope === "team";
  const isCEO = effectiveScope === "all";

  const [tab, setTab] = useState<TabKey>("summary");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState("");

  /* Filters */
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2099-12-31");
  const [dateBasis, setDateBasis] = useState<DateBasis>("payment");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterRep, setFilterRep] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"team" | "mine">("team");

  const scopeNames = useMemo(() => {
    if (isManager && viewMode === "mine" && portalUser?.linked_name) return [portalUser.linked_name];
    return teamNames ?? [];
  }, [isManager, viewMode, portalUser, teamNames]);

  const load = useCallback(async () => {
    if (rbacLoading) return;
    setLoading(true);

    let q = supabase.from("deals_view")
      .select("*")
      .order("date_closed", { ascending: false }).limit(5000);

    if (scopeNames.length > 0 && !isCEO) {
      const nameList = scopeNames.map(n => `"${n}"`).join(",");
      q = q.or(`sales_rep.in.(${nameList}),appointment_setter.in.(${nameList}),call_center_appointment_setter.in.(${nameList})`);
    } else if (teamNames !== null && !isCEO && scopeNames.length === 0) {
      setDeals([]);
      setEarnings([]);
      setAdjustments([]);
      setAdvances([]);
      setLoading(false);
      return;
    }

    const [dRes, eRes, aRes, advRes] = await Promise.all([
      q,
      supabase.from("commission_earnings").select("user_name,earning_amount,earning_status,deal_id,participant_role,created_at"),
      supabase.from("commission_adjustments").select("user_name,type,amount,reason,deal_id,created_at"),
      supabase.from("advances_summary").select("agent_name,total_advances,total_repayments,current_remaining_balance"),
    ]);

    const errors: string[] = [];
    if (dRes.error) { console.error("[CashflowDashboard] deals query error:", dRes.error); errors.push(`Deals: ${dRes.error.message}`); }
    if (eRes.error) { console.error("[CashflowDashboard] earnings query error:", eRes.error); errors.push(`Earnings: ${eRes.error.message}`); }
    if (aRes.error) { console.error("[CashflowDashboard] adjustments query error:", aRes.error); errors.push(`Adjustments: ${aRes.error.message}`); }
    if (advRes.error) { console.error("[CashflowDashboard] advances query error:", advRes.error); errors.push(`Advances: ${advRes.error.message}`); }
    setQueryError(errors.join(" | "));

    if (dRes.data) setDeals(dRes.data);
    if (eRes.data) setEarnings(eRes.data as EarningRow[]);
    if (aRes.data) setAdjustments(aRes.data as AdjustmentRow[]);
    if (advRes.data) setAdvances(advRes.data as AdvanceSummary[]);
    setLoading(false);
  }, [rbacLoading, scopeNames, teamNames, isCEO]);

  useEffect(() => { load(); }, [load]);

  /* Scope-filter earnings, adjustments, advances client-side */
  const scopedEarnings = useMemo(() => {
    if (isCEO) return earnings;
    if (scopeNames.length === 0) return [];
    return earnings.filter(e => scopeNames.some(n => n.toLowerCase() === e.user_name.toLowerCase()));
  }, [earnings, scopeNames, isCEO]);

  const scopedAdjustments = useMemo(() => {
    if (isCEO) return adjustments;
    if (scopeNames.length === 0) return [];
    return adjustments.filter(a => scopeNames.some(n => n.toLowerCase() === a.user_name.toLowerCase()));
  }, [adjustments, scopeNames, isCEO]);

  const scopedAdvances = useMemo(() => {
    if (isCEO) return advances;
    if (scopeNames.length === 0) return [];
    return advances.filter(a => scopeNames.some(n => n.toLowerCase() === a.agent_name.toLowerCase()));
  }, [advances, scopeNames, isCEO]);

  /* Derived filter lists */
  const allCompanies = useMemo(() => [...new Set(deals.map(d => (d.company ?? "").trim()).filter(Boolean))].sort(), [deals]);
  const allReps = useMemo(() => [...new Set(deals.map(d => (d.sales_rep ?? "").trim()).filter(Boolean))].sort(), [deals]);

  /* Date field resolver */
  function getDateField(d: DealRow): string {
    if (dateBasis === "payment") return (d.paid_nova_nrg_p2_rev_date ?? d.paid_date ?? "").slice(0, 10);
    if (dateBasis === "close") return (d.date_closed ?? "").slice(0, 10);
    return (d.created_at ?? d.date_closed ?? "").slice(0, 10);
  }

  /* Filtered deals */
  const filtered = useMemo(() => {
    return deals.filter(d => {
      const dt = getDateField(d);
      if (dt && dt < startDate) return false;
      if (dt && dt > endDate) return false;
      if (filterCompany && (d.company ?? "").trim() !== filterCompany) return false;
      if (filterRep && (d.sales_rep ?? "").trim() !== filterRep) return false;
      if (filterPayment === "unpaid" && num(d.paid_nova_nrg_p1_p2_rev_amount) > 0) return false;
      if (filterPayment === "partial" && (num(d.paid_nova_nrg_p1_p2_rev_amount) === 0 || num(d.paid_nova_nrg_p1_p2_rev_amount) >= num(d.rev))) return false;
      if (filterPayment === "full" && num(d.paid_nova_nrg_p1_p2_rev_amount) < num(d.rev)) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${d.customer_name ?? ""} ${d.sales_rep ?? ""} ${d.appointment_setter ?? ""} ${d.install_partner ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, startDate, endDate, filterCompany, filterRep, filterPayment, search, dateBasis]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "summary", label: "Cash Flow Summary" },
    { key: "receivables", label: "Receivables & Aging" },
    { key: "commissions", label: "Commission Cash Out" },
    { key: "advances", label: "Advances" },
    { key: "source", label: "Source Mix" },
    { key: "ledger", label: "Transaction Ledger" },
  ];

  if (rbacLoading) return <div className="p-8 text-sm text-slate-400">Loading permissions...</div>;

  return (
    <div className="bg-slate-50 p-4 space-y-4">
      <div className={UI.card}>
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Cash Flow Dashboard</h2>
                <p className="text-xs text-slate-400">Money in, money out, net cash position</p>
              </div>
              {isManager && (
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button onClick={() => setViewMode("team")}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "team" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Team
                  </button>
                  <button onClick={() => setViewMode("mine")}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "mine" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Mine
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap ${tab === t.key ? "bg-slate-50 border border-b-0 border-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters toolbar */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-end">
          <div className="flex gap-1">
            {DATE_PRESETS.map(p => (
              <button key={p.label} onClick={() => { const r = presetRange(p); setStartDate(r.start); setEndDate(r.end); }}
                className="px-2 py-1 rounded text-[10px] font-semibold border border-slate-200 hover:bg-slate-100">{p.label}</button>
            ))}
          </div>
          <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
          {/* Date Basis segmented control */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["payment", "close", "created"] as DateBasis[]).map(b => (
              <button key={b} onClick={() => setDateBasis(b)}
                className={`px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${dateBasis === b ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                {b === "payment" ? "Payment" : b === "close" ? "Close" : "Created"}
              </button>
            ))}
          </div>
          {!isRep && (
            <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
              <option value="">All Companies</option>
              {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {isCEO && (
            <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
              <option value="">All Reps</option>
              {allReps.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {isManager && (
            <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
              <option value="">All Team Reps</option>
              {allReps.filter(r => scopeNames.some(n => n.toLowerCase() === r.toLowerCase())).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
            <option value="all">All Payment</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial P2</option>
            <option value="full">Full P2</option>
          </select>
          <input className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs w-40" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className={UI.buttonGhost + " text-xs"} onClick={load}>Refresh</button>
        </div>

        {queryError && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <span className="font-semibold">Query Error:</span> {queryError}
          </div>
        )}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading cash flow data...</div>
        ) : (
          <>
            {tab === "summary" && <SummaryTab deals={filtered} earnings={scopedEarnings} advances={scopedAdvances} isRep={isRep} dateBasis={dateBasis} getDateField={getDateField} />}
            {tab === "receivables" && <ReceivablesTab deals={filtered} />}
            {tab === "commissions" && <CommissionsTab earnings={scopedEarnings} isRep={isRep} />}
            {tab === "advances" && <AdvancesTab advances={scopedAdvances} isRep={isRep} />}
            {tab === "source" && <SourceTab deals={filtered} />}
            {tab === "ledger" && <LedgerTab deals={filtered} earnings={scopedEarnings} isRep={isRep} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: CASH FLOW SUMMARY ═══════════════════ */

function SummaryTab({ deals, earnings, advances, isRep, dateBasis, getDateField }: {
  deals: DealRow[]; earnings: EarningRow[]; advances: AdvanceSummary[]; isRep: boolean;
  dateBasis: DateBasis; getDateField: (d: DealRow) => string;
}) {
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("weekly");

  const p2Collected = deals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0);
  const expectedP2 = deals.reduce((s, d) => s + num(d.rev), 0);
  const collectionPct = expectedP2 > 0 ? p2Collected / expectedP2 : 0;
  const outstanding = expectedP2 - p2Collected;

  const commPaid = earnings.filter(e => e.earning_status === "paid").reduce((s, e) => s + num(e.earning_amount), 0);
  const commTotal = earnings.reduce((s, e) => s + num(e.earning_amount), 0);
  const commLiability = commTotal - commPaid;
  const advOutstanding = advances.reduce((s, a) => s + num(a.current_remaining_balance), 0);

  const cashOut = commPaid + advOutstanding;
  const netCashFlow = p2Collected - cashOut;

  /* Time series data */
  const chartData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    for (const d of deals) {
      const dt = getDateField(d);
      if (!dt) continue;
      const key = granularity === "weekly" ? weekKey(dt) : monthKey(dt);
      if (!key) continue;
      const entry = map.get(key) ?? { inflow: 0, outflow: 0 };
      entry.inflow += num(d.paid_nova_nrg_p1_p2_rev_amount);
      map.set(key, entry);
    }
    for (const e of earnings) {
      if (e.earning_status !== "paid") continue;
      const dt = (e.created_at ?? "").slice(0, 10);
      if (!dt) continue;
      const key = granularity === "weekly" ? weekKey(dt) : monthKey(dt);
      if (!key) continue;
      const entry = map.get(key) ?? { inflow: 0, outflow: 0 };
      entry.outflow += num(e.earning_amount);
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, data]) => ({
        period: granularity === "weekly" ? fmtDate(period) : period,
        inflow: data.inflow,
        outflow: data.outflow,
        net: data.inflow - data.outflow,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, earnings, granularity, dateBasis]);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Cash In (P2 Collected)" value={moneyCompact(p2Collected)} color="text-emerald-700" />
        <KpiTile label="Cash Out (Comm + Adv)" value={moneyCompact(cashOut)} color="text-red-600" />
        <KpiTile label="Net Cash Flow" value={moneyCompact(netCashFlow)} color={netCashFlow >= 0 ? "text-emerald-700" : "text-red-600"} />
        <KpiTile label="Collection %" value={pct(collectionPct)} color={collectionPct >= 0.7 ? "text-emerald-700" : "text-amber-600"} />
        <KpiTile label="Receivables Outstanding" value={moneyCompact(outstanding)} color="text-amber-600" />
        <KpiTile label="Commission Liability" value={moneyCompact(commLiability)} color="text-slate-700" sub={`${money(commTotal)} earned total`} />
        <KpiTile label="Advances Outstanding" value={moneyCompact(advOutstanding)} color={advOutstanding > 0 ? "text-red-600" : "text-slate-600"} />
        <KpiTile label="Deal Count" value={String(deals.length)} sub={`${deals.filter(d => num(d.paid_nova_nrg_p1_p2_rev_amount) > 0).length} with payments`} />
      </div>

      {/* ComposedChart */}
      <div className={UI.card + " p-4"}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">Cash Flow Over Time</div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setGranularity("weekly")}
              className={`px-2.5 py-1 text-[10px] font-semibold ${granularity === "weekly" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>Weekly</button>
            <button onClick={() => setGranularity("monthly")}
              className={`px-2.5 py-1 text-[10px] font-semibold ${granularity === "monthly" ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>Monthly</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => money(v as number)} />
            <Legend />
            <Bar dataKey="inflow" name="Collections" fill="#10b981" stackId="a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="outflow" name="Payouts" fill="#ef4444" stackId="b" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="net" name="Net Cash" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 2: RECEIVABLES & AGING ═══════════════════ */

function ReceivablesTab({ deals }: { deals: DealRow[] }) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const now = new Date();
  const msPerDay = 86400000;

  const buckets = useMemo(() => {
    const defs = [
      { label: "0-7 days", min: 0, max: 7 },
      { label: "8-14 days", min: 8, max: 14 },
      { label: "15-30 days", min: 15, max: 30 },
      { label: "31-60 days", min: 31, max: 60 },
      { label: "60+ days", min: 61, max: 99999 },
    ];

    const result = defs.map(b => ({ ...b, deals: [] as DealRow[], outstanding: 0 }));

    for (const d of deals) {
      const rev = num(d.rev);
      const collected = num(d.paid_nova_nrg_p1_p2_rev_amount);
      const owed = rev - collected;
      if (owed <= 0) continue;
      if ((d.status ?? "").toLowerCase().includes("cancel")) continue;

      const dc = d.date_closed;
      if (!dc) continue;
      const daysSince = Math.floor((now.getTime() - new Date(dc).getTime()) / msPerDay);

      for (const b of result) {
        if (daysSince >= b.min && daysSince <= b.max) {
          b.deals.push(d);
          b.outstanding += owed;
          break;
        }
      }
    }

    return result;
  }, [deals]);

  const totalOutstanding = buckets.reduce((s, b) => s + b.outstanding, 0);

  const chartData = buckets.map(b => ({ name: b.label, outstanding: b.outstanding }));

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Horizontal bar chart */}
      <div className={UI.card + " p-4"}>
        <div className="text-sm font-semibold text-slate-900 mb-3">Outstanding by Aging Bucket</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
            <Tooltip formatter={(v) => money(v as number)} />
            <Bar dataKey="outstanding" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Aging Summary</div>
          <div className="text-xs text-slate-400">Total Outstanding: {money(totalOutstanding)}</div>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Bucket</th>
              <th className="px-4 py-2 text-right font-semibold">Deals</th>
              <th className="px-4 py-2 text-right font-semibold">Outstanding</th>
              <th className="px-4 py-2 text-right font-semibold">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => (
              <React.Fragment key={b.label}>
                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedBucket(expandedBucket === b.label ? null : b.label)}>
                  <td className="px-4 py-2 font-medium">{expandedBucket === b.label ? "\u25BC" : "\u25B6"} {b.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.deals.length}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(b.outstanding)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalOutstanding > 0 ? pct(b.outstanding / totalOutstanding) : "0%"}</td>
                </tr>
                {expandedBucket === b.label && b.deals.length > 0 && (
                  <tr>
                    <td colSpan={4} className="px-0 py-0 bg-slate-50">
                      <div className="overflow-auto max-h-[200px]">
                        <table className="w-full text-[10px]">
                          <thead className="bg-slate-200">
                            <tr><th className="px-3 py-1 text-left">Customer</th><th className="px-3 py-1 text-left">Rep</th><th className="px-3 py-1 text-left">Status</th><th className="px-3 py-1 text-right">Expected</th><th className="px-3 py-1 text-right">Collected</th><th className="px-3 py-1 text-right">Owed</th><th className="px-3 py-1 text-left">Closed</th></tr>
                          </thead>
                          <tbody>
                            {b.deals.map(d => (
                              <tr key={d.id} className="border-b border-slate-200">
                                <td className="px-3 py-1">{d.customer_name}</td>
                                <td className="px-3 py-1">{d.sales_rep}</td>
                                <td className="px-3 py-1">{d.status}</td>
                                <td className="px-3 py-1 text-right tabular-nums">{money(d.rev)}</td>
                                <td className="px-3 py-1 text-right tabular-nums">{money(d.paid_nova_nrg_p1_p2_rev_amount)}</td>
                                <td className="px-3 py-1 text-right tabular-nums text-amber-600 font-semibold">{money(num(d.rev) - num(d.paid_nova_nrg_p1_p2_rev_amount))}</td>
                                <td className="px-3 py-1">{fmtDate(d.date_closed)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 3: COMMISSION CASH OUT ═══════════════════ */

function CommissionsTab({ earnings, isRep }: { earnings: EarningRow[]; isRep: boolean }) {
  const commEarned = earnings.reduce((s, e) => s + num(e.earning_amount), 0);
  const commPaid = earnings.filter(e => e.earning_status === "paid").reduce((s, e) => s + num(e.earning_amount), 0);
  const commOutstanding = commEarned - commPaid;
  const pendingApproved = earnings.filter(e => ["pending", "approved"].includes(e.earning_status)).reduce((s, e) => s + num(e.earning_amount), 0);

  /* Role breakdown */
  const roleBreakdown = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number }>();
    for (const e of earnings) {
      const role = (e.participant_role ?? "unknown").toLowerCase();
      const entry = map.get(role) ?? { earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      map.set(role, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].earned - a[1].earned).map(([role, data]) => ({
      role: role.charAt(0).toUpperCase() + role.slice(1),
      ...data,
      outstanding: data.earned - data.paid,
    }));
  }, [earnings]);

  const roleChartData = roleBreakdown.map(r => ({ name: r.role, earned: r.earned, paid: r.paid }));

  /* Per-user summary */
  const userSummary = useMemo(() => {
    const map = new Map<string, { role: string; earned: number; paid: number }>();
    for (const e of earnings) {
      const key = e.user_name;
      const entry = map.get(key) ?? { role: e.participant_role ?? "unknown", earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].earned - a[1].earned).map(([name, data]) => ({
      name,
      ...data,
      role: data.role.charAt(0).toUpperCase() + data.role.slice(1),
      outstanding: data.earned - data.paid,
      paidPct: data.earned > 0 ? data.paid / data.earned : 0,
    }));
  }, [earnings]);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total Earned" value={moneyCompact(commEarned)} color="text-blue-700" />
        <KpiTile label="Total Paid" value={moneyCompact(commPaid)} color="text-emerald-700" />
        <KpiTile label="Outstanding" value={moneyCompact(commOutstanding)} color="text-amber-600" />
        <KpiTile label="Pending + Approved" value={moneyCompact(pendingApproved)} color="text-slate-700" sub="Awaiting payout" />
      </div>

      {/* Role breakdown chart */}
      {roleChartData.length > 0 && (
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">By Role</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={roleChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => money(v as number)} />
              <Legend />
              <Bar dataKey="earned" name="Earned" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="paid" name="Paid" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-user table */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Per-User Commission Summary</div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-right">Earned</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-right">Paid %</th>
              </tr>
            </thead>
            <tbody>
              {userSummary.map(u => (
                <tr key={u.name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium">{u.name}</td>
                  <td className="px-3 py-1.5">{u.role}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(u.earned)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{money(u.paid)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{money(u.outstanding)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pct(u.paidPct)}</td>
                </tr>
              ))}
              {userSummary.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No commission data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 4: ADVANCES ═══════════════════ */

function AdvancesTab({ advances, isRep }: { advances: AdvanceSummary[]; isRep: boolean }) {
  const totalOutstanding = advances.reduce((s, a) => s + num(a.current_remaining_balance), 0);
  const totalIssued = advances.reduce((s, a) => s + num(a.total_advances), 0);
  const totalRepaid = advances.reduce((s, a) => s + num(a.total_repayments), 0);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className={`grid ${isRep ? "grid-cols-1 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3"} gap-3`}>
        <KpiTile label="Outstanding Balance" value={moneyCompact(totalOutstanding)} color={totalOutstanding > 0 ? "text-red-600" : "text-emerald-700"} />
        <KpiTile label="Total Issued" value={moneyCompact(totalIssued)} color="text-blue-700" />
        <KpiTile label="Total Repaid" value={moneyCompact(totalRepaid)} color="text-emerald-700" />
      </div>

      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
          {isRep ? "My Advances" : "Agent Advance Summary"}
        </div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-right">Advances</th>
                <th className="px-3 py-2 text-right">Repayments</th>
                <th className="px-3 py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {advances.map(a => (
                <tr key={a.agent_name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium">{a.agent_name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(a.total_advances)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{money(a.total_repayments)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-600 font-semibold">{money(a.current_remaining_balance)}</td>
                </tr>
              ))}
              {advances.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No advance data.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 5: SOURCE MIX ═══════════════════ */

function SourceTab({ deals }: { deals: DealRow[] }) {
  const sourceData = useMemo(() => {
    const map = new Map<string, { count: number; collected: number; outstanding: number }>();
    for (const d of deals) {
      const src = deriveDealSource(d);
      const entry = map.get(src) ?? { count: 0, collected: 0, outstanding: 0 };
      entry.count++;
      entry.collected += num(d.paid_nova_nrg_p1_p2_rev_amount);
      entry.outstanding += Math.max(0, num(d.rev) - num(d.paid_nova_nrg_p1_p2_rev_amount));
      map.set(src, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].collected - a[1].collected).map(([source, data]) => ({
      source: source.replace(/_/g, " "),
      ...data,
    }));
  }, [deals]);

  const totalCollected = sourceData.reduce((s, d) => s + d.collected, 0);

  const pieData = sourceData.map(d => ({ name: d.source, value: d.collected }));

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Grouped bar: Collected vs Outstanding */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Collected vs Outstanding by Source</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="source" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => money(v as number)} />
              <Legend />
              <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="outstanding" name="Outstanding" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart: Cash-in share */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Cash-In Share by Source</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => money(v as number)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary table */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Source Summary</div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Source</th>
              <th className="px-4 py-2 text-right font-semibold">Deals</th>
              <th className="px-4 py-2 text-right font-semibold">Collected</th>
              <th className="px-4 py-2 text-right font-semibold">Outstanding</th>
              <th className="px-4 py-2 text-right font-semibold">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {sourceData.map(d => (
              <tr key={d.source} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium capitalize">{d.source}</td>
                <td className="px-4 py-2 text-right tabular-nums">{d.count}</td>
                <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{money(d.collected)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-amber-600">{money(d.outstanding)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{totalCollected > 0 ? pct(d.collected / totalCollected) : "0%"}</td>
              </tr>
            ))}
            {sourceData.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No source data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 6: TRANSACTION LEDGER ═══════════════════ */

function LedgerTab({ deals, earnings, isRep }: { deals: DealRow[]; earnings: EarningRow[]; isRep: boolean }) {
  const [sortCol, setSortCol] = useState("date_closed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const commByDeal = useMemo(() => {
    const map = new Map<string, { total: number; paid: number; details: EarningRow[] }>();
    for (const e of earnings) {
      const entry = map.get(e.deal_id) ?? { total: 0, paid: 0, details: [] };
      entry.total += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      entry.details.push(e);
      map.set(e.deal_id, entry);
    }
    return map;
  }, [earnings]);

  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let va: any = a[sortCol], vb: any = b[sortCol];
      if (sortCol === "commission") { va = commByDeal.get(a.id)?.total ?? 0; vb = commByDeal.get(b.id)?.total ?? 0; }
      if (sortCol === "outstanding") { va = num(a.rev) - num(a.paid_nova_nrg_p1_p2_rev_amount); vb = num(b.rev) - num(b.paid_nova_nrg_p1_p2_rev_amount); }
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [deals, sortCol, sortDir, commByDeal]);

  const totals = useMemo(() => ({
    rev: deals.reduce((s, d) => s + num(d.rev), 0),
    collected: deals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0),
    outstanding: deals.reduce((s, d) => s + Math.max(0, num(d.rev) - num(d.paid_nova_nrg_p1_p2_rev_amount)), 0),
    comm: deals.reduce((s, d) => s + (commByDeal.get(d.id)?.total ?? 0), 0),
    commPaid: deals.reduce((s, d) => s + (commByDeal.get(d.id)?.paid ?? 0), 0),
    gp: deals.reduce((s, d) => s + num(d.gross_profit), 0),
  }), [deals, commByDeal]);

  type ColDef = { key: string; label: string; align?: string; fmt?: (d: DealRow) => string };
  const cols: ColDef[] = [
    { key: "customer_name", label: "Customer" },
    { key: "sales_rep", label: "Rep" },
    { key: "status", label: "Status" },
    { key: "deal_source", label: "Source", fmt: d => deriveDealSource(d).replace(/_/g, " ") },
    { key: "date_closed", label: "Close Date", fmt: d => fmtDate(d.date_closed) },
    { key: "rev", label: "Expected", align: "right", fmt: d => money(d.rev) },
    { key: "paid_nova_nrg_p1_p2_rev_amount", label: "Collected", align: "right", fmt: d => money(d.paid_nova_nrg_p1_p2_rev_amount) },
    { key: "outstanding", label: "Outstanding", align: "right", fmt: d => money(Math.max(0, num(d.rev) - num(d.paid_nova_nrg_p1_p2_rev_amount))) },
    { key: "commission", label: "Commission", align: "right", fmt: d => money(commByDeal.get(d.id)?.total ?? 0) },
    { key: "comm_paid", label: "Comm Paid", align: "right", fmt: d => money(commByDeal.get(d.id)?.paid ?? 0) },
    ...(!isRep ? [{ key: "gross_profit", label: "GP", align: "right", fmt: (d: DealRow) => money(d.gross_profit) } as ColDef] : []),
  ];

  function handleExport() {
    const rows = sorted.map(d => {
      const base: Record<string, any> = {
        Customer: d.customer_name ?? "", Rep: d.sales_rep ?? "", Status: d.status ?? "",
        Source: deriveDealSource(d), "Close Date": d.date_closed ?? "",
        Expected: num(d.rev), Collected: num(d.paid_nova_nrg_p1_p2_rev_amount),
        Outstanding: Math.max(0, num(d.rev) - num(d.paid_nova_nrg_p1_p2_rev_amount)),
        Commission: commByDeal.get(d.id)?.total ?? 0,
        "Comm Paid": commByDeal.get(d.id)?.paid ?? 0,
      };
      if (!isRep) base["Gross Profit"] = num(d.gross_profit);
      return base;
    });
    downloadCSV(rows, "cashflow_ledger_export.csv");
  }

  return (
    <div className="px-6 py-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{sorted.length} deals</div>
        <button className={UI.buttonGhost + " text-xs"} onClick={handleExport}>Export CSV</button>
      </div>

      <div className="overflow-auto max-h-[600px] border border-slate-200 rounded-xl">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-white sticky top-0 z-10">
            <tr>
              {cols.map(c => (
                <th key={c.key} className={`px-3 py-2 cursor-pointer hover:bg-slate-800 select-none whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                  onClick={() => toggleSort(c.key)}>
                  {c.label} {sortCol === c.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                </th>
              ))}
            </tr>
            {/* Totals row */}
            <tr className="bg-blue-900 text-white text-[10px]">
              <td className="px-3 py-1 font-semibold">TOTALS ({sorted.length})</td>
              <td colSpan={3}></td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.rev)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.collected)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.outstanding)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.comm)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.commPaid)}</td>
              {!isRep && <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.gp)}</td>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => {
              const commDetail = commByDeal.get(d.id);
              return (
                <React.Fragment key={d.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    {cols.map(c => (
                      <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {c.fmt ? c.fmt(d) : (d[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                  {expandedId === d.id && commDetail && commDetail.details.length > 0 && (
                    <tr>
                      <td colSpan={cols.length} className="px-0 py-0 bg-slate-50">
                        <div className="px-6 py-2">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Commission Breakdown</div>
                          <table className="w-full text-[10px]">
                            <thead className="bg-slate-200">
                              <tr><th className="px-3 py-1 text-left">User</th><th className="px-3 py-1 text-left">Role</th><th className="px-3 py-1 text-right">Amount</th><th className="px-3 py-1 text-left">Status</th></tr>
                            </thead>
                            <tbody>
                              {commDetail.details.map((e, i) => (
                                <tr key={i} className="border-b border-slate-200">
                                  <td className="px-3 py-1">{e.user_name}</td>
                                  <td className="px-3 py-1 capitalize">{e.participant_role ?? ""}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{money(e.earning_amount)}</td>
                                  <td className="px-3 py-1">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${e.earning_status === "paid" ? "bg-emerald-50 text-emerald-700" : e.earning_status === "approved" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{e.earning_status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">No deals match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
