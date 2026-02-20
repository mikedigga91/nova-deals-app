"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePortalUser } from "@/lib/usePortalUser";

/* ═══════════════════ CONSTANTS & HELPERS ═══════════════════ */

const UI = {
  card: "bg-white rounded-xl border border-[#EBEFF3] shadow-sm",
  control: "w-full rounded-lg border border-[#EBEFF3] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7096e6]/30",
  buttonPrimary: "px-3 py-2 rounded-lg bg-[#1c48a6] text-white text-sm shadow-sm hover:bg-[#7096e6] active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-[#EBEFF3] text-sm bg-white hover:bg-[#F5F7F9] active:scale-[0.99] transition",
};

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
type EarningRow = { user_name: string; earning_amount: number; earning_status: string; deal_id: string };
type TabKey = "snapshot" | "performance" | "deals";

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function ManagerDashboard() {
  const { teamNames, portalUser, loading: rbacLoading, effectiveScope } = usePortalUser();
  const isAdmin = effectiveScope === "all";
  const [tab, setTab] = useState<TabKey>("snapshot");
  const [viewMode, setViewMode] = useState<"team" | "mine">("team");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRep, setFilterRep] = useState("");

  /* Filters */
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2099-12-31");
  const [search, setSearch] = useState("");

  const scopeNames = useMemo(() => {
    if (isAdmin) return [];
    if (viewMode === "mine" && portalUser?.linked_name) return [portalUser.linked_name];
    return teamNames ?? [];
  }, [isAdmin, viewMode, portalUser, teamNames]);

  const load = useCallback(async () => {
    if (rbacLoading) return;
    setLoading(true);

    let q = supabase.from("deals_view")
      .select("*")
      .order("date_closed", { ascending: false }).limit(5000);

    // Team scope filter (admin loads all — no filter)
    if (!isAdmin && scopeNames.length > 0) {
      const nameList = scopeNames.map(n => `"${n}"`).join(",");
      q = q.or(`sales_rep.in.(${nameList}),appointment_setter.in.(${nameList}),call_center_appointment_setter.in.(${nameList})`);
    } else if (!isAdmin && teamNames !== null) {
      // Empty team names = show nothing
      setDeals([]);
      setLoading(false);
      return;
    }

    const [dRes, eRes] = await Promise.all([
      q,
      supabase.from("commission_earnings").select("user_name,earning_amount,earning_status,deal_id"),
    ]);

    if (dRes.error) console.error("[ManagerDashboard] deals query error:", dRes.error);
    if (eRes.error) console.error("[ManagerDashboard] earnings query error:", eRes.error);

    if (dRes.data) setDeals(dRes.data);
    if (eRes.data) setEarnings(eRes.data as EarningRow[]);
    setLoading(false);
  }, [rbacLoading, isAdmin, scopeNames, teamNames]);

  useEffect(() => { load(); }, [load]);

  /* Derive all rep names from deals for admin dropdown */
  const allReps = useMemo(() => {
    if (!isAdmin) return [];
    const set = new Set<string>();
    for (const d of deals) {
      const rep = (d.sales_rep ?? "").trim();
      if (rep) set.add(rep);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [isAdmin, deals]);

  /* Filtered deals */
  const filtered = useMemo(() => {
    return deals.filter(d => {
      if (isAdmin && filterRep) {
        const rep = (d.sales_rep ?? "").trim().toLowerCase();
        const setter = (d.appointment_setter ?? "").trim().toLowerCase();
        const ccSetter = (d.call_center_appointment_setter ?? "").trim().toLowerCase();
        const fr = filterRep.toLowerCase();
        if (rep !== fr && setter !== fr && ccSetter !== fr) return false;
      }
      const dc = (d.date_closed ?? "").slice(0, 10);
      if (dc && dc < startDate) return false;
      if (dc && dc > endDate) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${d.customer_name ?? ""} ${d.sales_rep ?? ""} ${d.appointment_setter ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [deals, isAdmin, filterRep, startDate, endDate, search]);

  /* Filter earnings to scope */
  const scopedEarnings = useMemo(() => {
    if (isAdmin) return earnings;
    if (scopeNames.length === 0 && teamNames !== null) return [];
    if (teamNames === null) return earnings;
    return earnings.filter(e => scopeNames.some(n => n.toLowerCase() === e.user_name.toLowerCase()));
  }, [isAdmin, earnings, scopeNames, teamNames]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "snapshot", label: "Team Snapshot" },
    { key: "performance", label: "Rep Performance" },
    { key: "deals", label: "Team Deals" },
  ];

  if (rbacLoading) return <div className="p-8 text-sm text-slate-400">Loading permissions...</div>;

  return (
    <div className="bg-slate-50 p-4 space-y-4">
      <div className={UI.card}>
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Manager Dashboard</h2>
                <p className="text-xs text-slate-400">{isAdmin ? "All reps — admin view" : "Team performance & rep analytics"}</p>
              </div>
              {/* Team / Mine toggle — hidden for admin */}
              {!isAdmin && (
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button onClick={() => setViewMode("team")}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "team" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Team View
                  </button>
                  <button onClick={() => setViewMode("mine")}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "mine" ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    My Deals
                  </button>
                </div>
              )}
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

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-end">
          <div className="flex gap-1">
            {DATE_PRESETS.map(p => (
              <button key={p.label} onClick={() => { const r = presetRange(p); setStartDate(r.start); setEndDate(r.end); }}
                className="px-2 py-1 rounded text-[10px] font-semibold border border-slate-200 hover:bg-slate-100">{p.label}</button>
            ))}
          </div>
          <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <input className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs w-40" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          {isAdmin && (
            <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
              <option value="">All Reps</option>
              {allReps.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button className={UI.buttonGhost + " text-xs"} onClick={load}>Refresh</button>
          <div className="text-[10px] text-slate-400 ml-auto">
            Scope: {isAdmin ? (filterRep || "All reps") : viewMode === "mine" ? portalUser?.linked_name ?? "you" : `${scopeNames.length} team members`}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading team data...</div>
        ) : (
          <>
            {tab === "snapshot" && <TeamSnapshotTab deals={filtered} earnings={scopedEarnings} />}
            {tab === "performance" && <PerformanceTab deals={filtered} earnings={scopedEarnings} scopeNames={isAdmin ? allReps : scopeNames} />}
            {tab === "deals" && <TeamDealsTab deals={filtered} earnings={scopedEarnings} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: TEAM SNAPSHOT ═══════════════════ */

function TeamSnapshotTab({ deals, earnings }: { deals: DealRow[]; earnings: EarningRow[] }) {
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
        <KpiTile label="Commission Earned" value={moneyCompact(commEarned)} />
        <KpiTile label="Commission Paid" value={moneyCompact(commPaid)} color="text-emerald-700" />
        <KpiTile label="Outstanding" value={moneyCompact(commOutstanding)} color={commOutstanding > 0 ? "text-amber-600" : "text-slate-600"} />
        <KpiTile label="Deal Counts" value={`${closedDeals} closed`} sub={`${newDeals} new / ${cancelledDeals} cancelled`} />
      </div>

      {sourceRows.length > 0 && (
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Source Breakdown</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Source</th>
                <th className="px-4 py-2 text-right font-semibold">Deals</th>
                <th className="px-4 py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map(([src, data]) => (
                <tr key={src} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium capitalize">{src.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{data.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(data.rev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 2: REP PERFORMANCE BOARD ═══════════════════ */

function PerformanceTab({ deals, earnings, scopeNames }: { deals: DealRow[]; earnings: EarningRow[]; scopeNames: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  /* Build per-rep stats */
  type RepStats = {
    name: string; dealsClosed: number; p2Collected: number; commEarned: number; commPaid: number; outstanding: number;
    avgNPPW: number; avgKW: number; deals: DealRow[];
    zeroClosed30: boolean; stuckCount: number;
  };

  const repRows = useMemo(() => {
    const now = new Date();
    const msPerDay = 86400000;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * msPerDay).toISOString().slice(0, 10);

    /* All unique rep names from deals */
    const names = new Set<string>();
    for (const n of scopeNames) names.add(n);
    for (const d of deals) {
      const rep = (d.sales_rep ?? "").trim();
      if (rep && scopeNames.some(n => n.toLowerCase() === rep.toLowerCase())) names.add(rep);
    }

    /* Earnings map */
    const earnMap = new Map<string, { earned: number; paid: number }>();
    for (const e of earnings) {
      const key = e.user_name.toLowerCase();
      const entry = earnMap.get(key) ?? { earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      earnMap.set(key, entry);
    }

    const rows: RepStats[] = [];
    for (const name of names) {
      const repDeals = deals.filter(d => (d.sales_rep ?? "").trim().toLowerCase() === name.toLowerCase());
      const closedStatuses = ["p2 paid", "partial p2 paid", "p2 ready"];
      const closed = repDeals.filter(d => closedStatuses.includes((d.status ?? "").trim().toLowerCase()));
      const p2 = repDeals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0);
      const earn = earnMap.get(name.toLowerCase());

      // Recent closed (last 30 days)
      const recentClosed = closed.filter(d => (d.date_closed ?? "") >= thirtyDaysAgo);
      const zeroClosed30 = recentClosed.length === 0;

      // Stuck: same stage > 30 days
      const final = ["p2 paid", "cancelled", "canceled"];
      const stuckCount = repDeals.filter(d => {
        const st = (d.status ?? "").trim().toLowerCase();
        if (final.includes(st)) return false;
        const dc = d.date_closed;
        if (!dc) return false;
        return Math.floor((now.getTime() - new Date(dc).getTime()) / msPerDay) > 30;
      }).length;

      const kwVals = closed.map(d => num(d.kw_system)).filter(v => v > 0);
      const nppwVals = closed.map(d => num(d.net_price_per_watt)).filter(v => v > 0);

      rows.push({
        name,
        dealsClosed: closed.length,
        p2Collected: p2,
        commEarned: earn?.earned ?? 0,
        commPaid: earn?.paid ?? 0,
        outstanding: (earn?.earned ?? 0) - (earn?.paid ?? 0),
        avgNPPW: nppwVals.length ? nppwVals.reduce((a, b) => a + b, 0) / nppwVals.length : 0,
        avgKW: kwVals.length ? kwVals.reduce((a, b) => a + b, 0) / kwVals.length : 0,
        deals: repDeals,
        zeroClosed30,
        stuckCount,
      });
    }

    return rows.sort((a, b) => b.p2Collected - a.p2Collected);
  }, [deals, earnings, scopeNames]);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className={UI.card + " overflow-hidden"}>
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Rep Performance Board</div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Rep</th>
                <th className="px-3 py-2 text-right">Deals Closed</th>
                <th className="px-3 py-2 text-right">P2 Collected</th>
                <th className="px-3 py-2 text-right">Comm Earned</th>
                <th className="px-3 py-2 text-right">Comm Paid</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-right">Avg NPPW</th>
                <th className="px-3 py-2 text-right">Avg kW</th>
                <th className="px-3 py-2 text-center">Signals</th>
              </tr>
            </thead>
            <tbody>
              {repRows.map(r => (
                <React.Fragment key={r.name}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(expanded === r.name ? null : r.name)}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name} {expanded === r.name ? "\u25BC" : "\u25B6"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.dealsClosed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.p2Collected)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.commEarned)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.commPaid)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.outstanding)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgNPPW > 0 ? `$${r.avgNPPW.toFixed(2)}` : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgKW > 0 ? r.avgKW.toFixed(1) : ""}</td>
                    <td className="px-3 py-2 text-center">
                      {r.zeroClosed30 && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 mr-1">0 in 30D</span>}
                      {r.stuckCount > 3 && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">{r.stuckCount} stuck</span>}
                    </td>
                  </tr>
                  {expanded === r.name && (
                    <tr>
                      <td colSpan={9} className="px-0 py-0 bg-slate-50">
                        <div className="overflow-auto max-h-[250px]">
                          <table className="w-full text-[10px]">
                            <thead className="bg-slate-200">
                              <tr><th className="px-3 py-1 text-left">Customer</th><th className="px-3 py-1 text-left">Status</th><th className="px-3 py-1 text-right">kW</th><th className="px-3 py-1 text-right">Revenue</th><th className="px-3 py-1 text-right">Collected</th><th className="px-3 py-1 text-left">Closed</th></tr>
                            </thead>
                            <tbody>
                              {r.deals.map(d => (
                                <tr key={d.id} className="border-b border-slate-200">
                                  <td className="px-3 py-1">{d.customer_name}</td>
                                  <td className="px-3 py-1">{d.status}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{num(d.kw_system) ? num(d.kw_system).toFixed(2) : ""}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{money(d.rev)}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{money(d.paid_nova_nrg_p1_p2_rev_amount)}</td>
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
              {repRows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No team members found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Coaching signals summary */}
      {repRows.some(r => r.zeroClosed30 || r.stuckCount > 3) && (
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Coaching Signals</div>
          <div className="space-y-2">
            {repRows.filter(r => r.zeroClosed30).map(r => (
              <div key={r.name + "-zero"} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="font-medium">{r.name}</span>
                <span className="text-slate-500">has 0 deals closed in the last 30 days</span>
              </div>
            ))}
            {repRows.filter(r => r.stuckCount > 3).map(r => (
              <div key={r.name + "-stuck"} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="font-medium">{r.name}</span>
                <span className="text-slate-500">has {r.stuckCount} deals stuck at the same stage for &gt;30 days</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 3: TEAM DEAL TABLE ═══════════════════ */

function TeamDealsTab({ deals, earnings }: { deals: DealRow[]; earnings: EarningRow[] }) {
  const [sortCol, setSortCol] = useState("date_closed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const commByDeal = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of earnings) map.set(e.deal_id, (map.get(e.deal_id) ?? 0) + num(e.earning_amount));
    return map;
  }, [earnings]);

  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === "commission") { va = commByDeal.get(a.id) ?? 0; vb = commByDeal.get(b.id) ?? 0; }
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
    gp: deals.reduce((s, d) => s + num(d.gross_profit), 0),
    comm: deals.reduce((s, d) => s + (commByDeal.get(d.id) ?? 0), 0),
  }), [deals, commByDeal]);

  function handleExport() {
    const rows = sorted.map(d => ({
      Customer: d.customer_name ?? "", Rep: d.sales_rep ?? "", Setter: d.appointment_setter ?? "",
      Installer: d.install_partner ?? "", Status: d.status ?? "", Source: deriveDealSource(d),
      kW: num(d.kw_system), NPPW: num(d.net_price_per_watt), Closed: d.date_closed ?? "",
      Revenue: num(d.rev), Collected: num(d.paid_nova_nrg_p1_p2_rev_amount),
      GrossProfit: num(d.gross_profit), Commission: commByDeal.get(d.id) ?? 0,
    }));
    downloadCSV(rows, "team_deals_export.csv");
  }

  const cols: { key: string; label: string; align?: string; fmt?: (d: DealRow) => string }[] = [
    { key: "customer_name", label: "Customer" },
    { key: "sales_rep", label: "Rep" },
    { key: "appointment_setter", label: "Setter" },
    { key: "install_partner", label: "Installer" },
    { key: "status", label: "Status" },
    { key: "deal_source", label: "Source", fmt: d => deriveDealSource(d).replace(/_/g, " ") },
    { key: "kw_system", label: "kW", align: "right", fmt: d => num(d.kw_system) ? num(d.kw_system).toFixed(2) : "" },
    { key: "date_closed", label: "Closed", fmt: d => fmtDate(d.date_closed) },
    { key: "rev", label: "Rev", align: "right", fmt: d => money(d.rev) },
    { key: "paid_nova_nrg_p1_p2_rev_amount", label: "Collected", align: "right", fmt: d => money(d.paid_nova_nrg_p1_p2_rev_amount) },
    { key: "gross_profit", label: "GP", align: "right", fmt: d => money(d.gross_profit) },
    { key: "commission", label: "Comm", align: "right", fmt: d => money(commByDeal.get(d.id) ?? 0) },
  ];

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
            <tr className="bg-blue-900 text-white text-[10px]">
              <td className="px-3 py-1 font-semibold">TOTALS ({sorted.length})</td>
              <td colSpan={7}></td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.rev)}</td>
              <td className="px-3 py-1 text-right tabular-nums font-semibold">{money(totals.collected)}</td>
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
