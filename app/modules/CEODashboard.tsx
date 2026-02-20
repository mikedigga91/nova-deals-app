"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ═══════════════════ CONSTANTS & HELPERS ═══════════════════ */

const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  control: "w-full rounded-lg border border-[#EBEFF3] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7096e6]/30",
  buttonPrimary: "px-3 py-2 rounded-lg bg-[#1c48a6] text-white text-sm shadow-sm hover:bg-[#7096e6] active:scale-[0.99] transition",
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
  { label: "YTD", days: -1 },
  { label: "All", days: 0 },
] as const;

function presetRange(preset: typeof DATE_PRESETS[number]): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset.days === 0) return { start: "2020-01-01", end: "2099-12-31" };
  if (preset.days === -1) return { start: `${now.getFullYear()}-01-01`, end };
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

/* ─── KPI Tile ─── */
function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={UI.card + " p-4"}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${color ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ═══════════════════ TYPES ═══════════════════ */

type DealRow = Record<string, any>;
type EarningRow = { user_name: string; earning_amount: number; earning_status: string; deal_id: string; participant_role?: string };
type AdjustmentRow = { user_name: string; type: string; amount: number; reason?: string; deal_id?: string; created_at?: string };

type TabKey = "snapshot" | "analytics" | "risk" | "deals";

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function CEODashboard() {
  const [tab, setTab] = useState<TabKey>("snapshot");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* ─── Filters ─── */
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2099-12-31");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterRep, setFilterRep] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [dRes, eRes, aRes] = await Promise.all([
      supabase.from("deals_view").select("*").order("date_closed", { ascending: false }).limit(5000),
      supabase.from("commission_earnings").select("user_name,earning_amount,earning_status,deal_id,participant_role"),
      supabase.from("commission_adjustments").select("user_name,type,amount,reason,deal_id,created_at"),
    ]);
    if (dRes.data) setDeals(dRes.data);
    if (eRes.data) setEarnings(eRes.data as EarningRow[]);
    if (aRes.data) setAdjustments(aRes.data as AdjustmentRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ─── Derived lists for filters ─── */
  const allCompanies = useMemo(() => [...new Set(deals.map(d => (d.company ?? "").trim()).filter(Boolean))].sort(), [deals]);
  const allStatuses = useMemo(() => [...new Set(deals.map(d => (d.status ?? "").trim()).filter(Boolean))].sort(), [deals]);
  const allSources = useMemo(() => [...new Set(deals.map(d => deriveDealSource(d)).filter(Boolean))].sort(), [deals]);
  const allReps = useMemo(() => [...new Set(deals.map(d => (d.sales_rep ?? "").trim()).filter(Boolean))].sort(), [deals]);

  /* ─── Filtered deals ─── */
  const filtered = useMemo(() => {
    return deals.filter(d => {
      const dc = (d.date_closed ?? "").slice(0, 10);
      if (dc && dc < startDate) return false;
      if (dc && dc > endDate) return false;
      if (filterCompany && (d.company ?? "").trim() !== filterCompany) return false;
      if (filterStatus.length && !filterStatus.includes((d.status ?? "").trim())) return false;
      if (filterSource.length && !filterSource.includes(deriveDealSource(d))) return false;
      if (filterRep && (d.sales_rep ?? "").trim() !== filterRep) return false;
      if (filterPayment === "unpaid" && d.paid_nova_nrg_p1_p2_rev_amount) return false;
      if (filterPayment === "partial" && (!d.paid_nova_nrg_p1_p2_rev_amount || num(d.paid_nova_nrg_p1_p2_rev_amount) >= num(d.rev))) return false;
      if (filterPayment === "full" && num(d.paid_nova_nrg_p1_p2_rev_amount) < num(d.rev)) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${d.customer_name ?? ""} ${d.sales_rep ?? ""} ${d.appointment_setter ?? ""} ${d.install_partner ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [deals, startDate, endDate, filterCompany, filterStatus, filterSource, filterRep, filterPayment, search]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "snapshot", label: "Executive Snapshot" },
    { key: "analytics", label: "Performance Analytics" },
    { key: "risk", label: "Risk & Exceptions" },
    { key: "deals", label: "Global Deal Table" },
  ];

  return (
    <div className="bg-slate-50 p-4 space-y-4">
      {/* Header */}
      <div className={UI.card}>
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">CEO Dashboard</h2>
                <p className="text-xs text-slate-400">Company-wide performance overview</p>
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
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
            <option value="">All Companies</option>
            {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
            <option value="">All Reps</option>
            {allReps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
            <option value="all">All Payment</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial P2</option>
            <option value="full">Full P2</option>
          </select>
          <input className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs w-40" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className={UI.buttonGhost + " text-xs"} onClick={load}>Refresh</button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading dashboard data...</div>
        ) : (
          <>
            {tab === "snapshot" && <SnapshotTab deals={filtered} earnings={earnings} adjustments={adjustments} />}
            {tab === "analytics" && <AnalyticsTab deals={filtered} earnings={earnings} />}
            {tab === "risk" && <RiskTab deals={filtered} earnings={earnings} adjustments={adjustments} />}
            {tab === "deals" && <DealsTab deals={filtered} earnings={earnings} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: EXECUTIVE SNAPSHOT ═══════════════════ */

function SnapshotTab({ deals, earnings, adjustments }: { deals: DealRow[]; earnings: EarningRow[]; adjustments: AdjustmentRow[] }) {
  const p2Collected = deals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0);
  const expectedP2 = deals.reduce((s, d) => s + num(d.rev), 0);
  const collectionPct = expectedP2 > 0 ? p2Collected / expectedP2 : 0;
  const grossProfit = deals.reduce((s, d) => s + num(d.gross_profit), 0);

  const commEarned = earnings.reduce((s, e) => s + num(e.earning_amount), 0);
  const commPaid = earnings.filter(e => e.earning_status === "paid").reduce((s, e) => s + num(e.earning_amount), 0);
  const commOutstanding = commEarned - commPaid;

  const newDeals = deals.filter(d => (d.status ?? "").trim() === "Pending").length;
  const closedDeals = deals.filter(d => ["P2 Paid", "Partial P2 Paid", "P2 Ready"].includes((d.status ?? "").trim())).length;
  const cancelledDeals = deals.filter(d => (d.status ?? "").toLowerCase().includes("cancel")).length;

  /* Source breakdown */
  const sourceMap = new Map<string, { count: number; rev: number }>();
  for (const d of deals) {
    const src = deriveDealSource(d);
    const e = sourceMap.get(src) ?? { count: 0, rev: 0 };
    e.count++;
    e.rev += num(d.rev);
    sourceMap.set(src, e);
  }
  const sourceRows = Array.from(sourceMap.entries()).sort((a, b) => b[1].rev - a[1].rev);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="P2 Collected" value={moneyCompact(p2Collected)} color="text-emerald-700" />
        <KpiTile label="Expected P2" value={moneyCompact(expectedP2)} color="text-blue-700" />
        <KpiTile label="Collection %" value={pct(collectionPct)} color={collectionPct >= 0.7 ? "text-emerald-700" : "text-amber-600"} />
        <KpiTile label="Gross Profit" value={moneyCompact(grossProfit)} color="text-indigo-700" />
        <KpiTile label="Commission Owed" value={moneyCompact(commEarned)} sub="Total earned" />
        <KpiTile label="Commission Paid" value={moneyCompact(commPaid)} color="text-emerald-700" />
        <KpiTile label="Outstanding" value={moneyCompact(commOutstanding)} color={commOutstanding > 0 ? "text-amber-600" : "text-slate-600"} />
        <KpiTile label="Deal Counts" value={`${closedDeals} closed`} sub={`${newDeals} new / ${cancelledDeals} cancelled`} />
      </div>

      {/* Source breakdown */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Source Breakdown</div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Source</th>
              <th className="px-4 py-2 text-right font-semibold">Deals</th>
              <th className="px-4 py-2 text-right font-semibold">Revenue</th>
              <th className="px-4 py-2 text-right font-semibold">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map(([src, data]) => (
              <tr key={src} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium capitalize">{src.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-right tabular-nums">{data.count}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(data.rev)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{expectedP2 > 0 ? pct(data.rev / expectedP2) : "0%"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 2: PERFORMANCE ANALYTICS ═══════════════════ */

function AnalyticsTab({ deals, earnings }: { deals: DealRow[]; earnings: EarningRow[] }) {
  /* Weekly P2 collection */
  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const dateStr = d.paid_nova_nrg_p2_rev_date ?? d.paid_date;
      if (!dateStr) continue;
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) continue;
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - dt.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + num(d.paid_nova_nrg_p1_p2_rev_amount));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([week, amount]) => ({ week: fmtDate(week), amount }));
  }, [deals]);

  /* Status funnel */
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const s = (d.status ?? "").trim();
      if (s) map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [deals]);

  /* Source mix */
  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const src = deriveDealSource(d);
      map.set(src, (map.get(src) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [deals]);

  /* Leaderboards */
  const topClosers = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const rep = (d.sales_rep ?? "").trim();
      if (rep) map.set(rep, (map.get(rep) ?? 0) + num(d.rev));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, rev]) => ({ name, rev }));
  }, [deals]);

  const topSetters = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const setter = (d.appointment_setter ?? "").trim();
      if (setter) map.set(setter, (map.get(setter) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  }, [deals]);

  const topManagers = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const mgr = (d.manager ?? "").trim();
      if (mgr) map.set(mgr, (map.get(mgr) ?? 0) + num(d.rev));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, rev]) => ({ name, rev }));
  }, [deals]);

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* P2 collected per week */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">P2 Collected per Week</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => money(v as number)} />
              <Area type="monotone" dataKey="amount" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status funnel */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Deals by Status</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusCounts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source mix pie */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Source Mix</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={sourceMix} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {sourceMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Top 10 Closers by $</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Rep</th><th className="px-3 py-2 text-right">Revenue</th></tr></thead>
            <tbody>
              {topClosers.map((r, i) => (
                <tr key={r.name} className="border-b border-slate-100"><td className="px-3 py-1.5 text-slate-500">{i + 1}</td><td className="px-3 py-1.5 font-medium">{r.name}</td><td className="px-3 py-1.5 text-right tabular-nums">{money(r.rev)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Top 10 Setters by #</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Setter</th><th className="px-3 py-2 text-right">Deals</th></tr></thead>
            <tbody>
              {topSetters.map((r, i) => (
                <tr key={r.name} className="border-b border-slate-100"><td className="px-3 py-1.5 text-slate-500">{i + 1}</td><td className="px-3 py-1.5 font-medium">{r.name}</td><td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Top 5 Managers by Team $</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Manager</th><th className="px-3 py-2 text-right">Revenue</th></tr></thead>
            <tbody>
              {topManagers.map((r, i) => (
                <tr key={r.name} className="border-b border-slate-100"><td className="px-3 py-1.5 text-slate-500">{i + 1}</td><td className="px-3 py-1.5 font-medium">{r.name}</td><td className="px-3 py-1.5 text-right tabular-nums">{money(r.rev)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 3: RISK & EXCEPTIONS ═══════════════════ */

function RiskTab({ deals, earnings, adjustments }: { deals: DealRow[]; earnings: EarningRow[]; adjustments: AdjustmentRow[] }) {
  const now = new Date();
  const msPerDay = 86400000;

  /* Stuck deals: status not final AND >45 days since last milestone */
  const stuckDeals = useMemo(() => {
    const final = ["p2 paid", "cancelled", "canceled"];
    return deals.filter(d => {
      const st = (d.status ?? "").trim().toLowerCase();
      if (final.includes(st)) return false;
      const dc = d.date_closed;
      if (!dc) return false;
      const daysSince = Math.floor((now.getTime() - new Date(dc).getTime()) / msPerDay);
      return daysSince > 45;
    }).slice(0, 50);
  }, [deals]);

  /* High value / low collection */
  const lowCollection = useMemo(() => {
    return deals.filter(d => {
      const rev = num(d.rev);
      const collected = num(d.paid_nova_nrg_p1_p2_rev_amount);
      return rev > 10000 && rev > 0 && (collected / rev) < 0.5;
    }).slice(0, 50);
  }, [deals]);

  /* Commission anomalies */
  const anomalies = useMemo(() => {
    return adjustments.filter(a => num(a.amount) > 500).slice(0, 30);
  }, [adjustments]);

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Stuck deals */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Stuck Deals ({stuckDeals.length})</div>
          <span className="text-[10px] text-slate-400">Status not final & &gt;45 days since sale</span>
        </div>
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Rep</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Days</th></tr>
            </thead>
            <tbody>
              {stuckDeals.map(d => {
                const daysSince = d.date_closed ? Math.floor((now.getTime() - new Date(d.date_closed).getTime()) / msPerDay) : 0;
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-red-50/50">
                    <td className="px-3 py-1.5">{d.customer_name}</td>
                    <td className="px-3 py-1.5">{d.sales_rep}</td>
                    <td className="px-3 py-1.5"><span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">{d.status}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(d.rev)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600 font-semibold">{daysSince}</td>
                  </tr>
                );
              })}
              {stuckDeals.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No stuck deals found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* High value low collection */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">High Value / Low Collection ({lowCollection.length})</div>
          <span className="text-[10px] text-slate-400">Revenue &gt;$10K & collection &lt;50%</span>
        </div>
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Rep</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Collected</th><th className="px-3 py-2 text-right">%</th></tr>
            </thead>
            <tbody>
              {lowCollection.map(d => {
                const rev = num(d.rev);
                const coll = num(d.paid_nova_nrg_p1_p2_rev_amount);
                return (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-amber-50/50">
                    <td className="px-3 py-1.5">{d.customer_name}</td>
                    <td className="px-3 py-1.5">{d.sales_rep}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(rev)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(coll)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-amber-600 font-semibold">{rev > 0 ? pct(coll / rev) : "0%"}</td>
                  </tr>
                );
              })}
              {lowCollection.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No high-value low-collection deals.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commission anomalies */}
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Commission Anomalies ({anomalies.length})</div>
          <span className="text-[10px] text-slate-400">Adjustments &gt;$500</span>
        </div>
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr><th className="px-3 py-2 text-left">User</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Date</th></tr>
            </thead>
            <tbody>
              {anomalies.map((a, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium">{a.user_name}</td>
                  <td className="px-3 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${a.type === "bonus" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{a.type}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(a.amount)}</td>
                  <td className="px-3 py-1.5 text-slate-500 truncate max-w-[200px]">{a.reason ?? ""}</td>
                  <td className="px-3 py-1.5 text-slate-500">{fmtDate(a.created_at)}</td>
                </tr>
              ))}
              {anomalies.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No commission anomalies.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 4: GLOBAL DEAL TABLE ═══════════════════ */

type SortCol = string;
type SortDir = "asc" | "desc";

function DealsTab({ deals, earnings }: { deals: DealRow[]; earnings: EarningRow[] }) {
  const [sortCol, setSortCol] = useState<SortCol>("date_closed");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  /* Commission lookup by deal */
  const commByDeal = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of earnings) {
      map.set(e.deal_id, (map.get(e.deal_id) ?? 0) + num(e.earning_amount));
    }
    return map;
  }, [earnings]);

  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === "commission") { va = commByDeal.get(a.id) ?? 0; vb = commByDeal.get(b.id) ?? 0; }
      if (sortCol === "collection_pct") { va = num(a.rev) > 0 ? num(a.paid_nova_nrg_p1_p2_rev_amount) / num(a.rev) : 0; vb = num(b.rev) > 0 ? num(b.paid_nova_nrg_p1_p2_rev_amount) / num(b.rev) : 0; }
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [deals, sortCol, sortDir, commByDeal]);

  /* Totals */
  const totals = useMemo(() => ({
    rev: deals.reduce((s, d) => s + num(d.rev), 0),
    collected: deals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0),
    gp: deals.reduce((s, d) => s + num(d.gross_profit), 0),
    comm: deals.reduce((s, d) => s + (commByDeal.get(d.id) ?? 0), 0),
  }), [deals, commByDeal]);

  const cols: { key: string; label: string; align?: string; fmt?: (d: DealRow) => string }[] = [
    { key: "customer_name", label: "Customer" },
    { key: "sales_rep", label: "Rep" },
    { key: "appointment_setter", label: "Setter" },
    { key: "install_partner", label: "Installer" },
    { key: "status", label: "Status" },
    { key: "deal_source", label: "Source", fmt: d => deriveDealSource(d).replace(/_/g, " ") },
    { key: "kw_system", label: "kW", align: "right", fmt: d => num(d.kw_system) ? num(d.kw_system).toFixed(2) : "" },
    { key: "net_price_per_watt", label: "NPPW", align: "right", fmt: d => num(d.net_price_per_watt) ? `$${num(d.net_price_per_watt).toFixed(2)}` : "" },
    { key: "date_closed", label: "Closed", fmt: d => fmtDate(d.date_closed) },
    { key: "rev", label: "Rev", align: "right", fmt: d => money(d.rev) },
    { key: "paid_nova_nrg_p1_p2_rev_amount", label: "Collected", align: "right", fmt: d => money(d.paid_nova_nrg_p1_p2_rev_amount) },
    { key: "collection_pct", label: "%", align: "right", fmt: d => num(d.rev) > 0 ? pct(num(d.paid_nova_nrg_p1_p2_rev_amount) / num(d.rev)) : "" },
    { key: "gross_profit", label: "GP", align: "right", fmt: d => money(d.gross_profit) },
    { key: "commission", label: "Comm", align: "right", fmt: d => money(commByDeal.get(d.id) ?? 0) },
  ];

  function handleExport() {
    const rows = sorted.map(d => ({
      Customer: d.customer_name ?? "",
      Rep: d.sales_rep ?? "",
      Setter: d.appointment_setter ?? "",
      Installer: d.install_partner ?? "",
      Status: d.status ?? "",
      Source: deriveDealSource(d),
      kW: num(d.kw_system),
      NPPW: num(d.net_price_per_watt),
      Closed: d.date_closed ?? "",
      Revenue: num(d.rev),
      Collected: num(d.paid_nova_nrg_p1_p2_rev_amount),
      "Collection%": num(d.rev) > 0 ? (num(d.paid_nova_nrg_p1_p2_rev_amount) / num(d.rev) * 100).toFixed(1) : 0,
      GrossProfit: num(d.gross_profit),
      Commission: commByDeal.get(d.id) ?? 0,
    }));
    downloadCSV(rows, "ceo_deals_export.csv");
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
                  {c.label} {sortCol === c.key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : ""}
                </th>
              ))}
            </tr>
            {/* Totals row */}
            <tr className="bg-blue-900 text-white text-[10px]">
              <td className="px-3 py-1 font-semibold">TOTALS ({sorted.length})</td>
              <td colSpan={8}></td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.rev)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.collected)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{totals.rev > 0 ? pct(totals.collected / totals.rev) : ""}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.gp)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.comm)}</td>
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => (
              <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                {cols.map(c => (
                  <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.fmt ? c.fmt(d) : (d[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">No deals match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
