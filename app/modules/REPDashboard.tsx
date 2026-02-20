"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePortalUser } from "@/lib/usePortalUser";
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
function moneyFull(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
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

function RolePill({ role }: { role: string }) {
  const cls = role === "Closer" ? "bg-blue-100 text-blue-700 border-blue-200"
    : role === "Setter" ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-purple-100 text-purple-700 border-purple-200";
  return <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded font-semibold border ${cls}`}>{role}</span>;
}

/* ═══════════════════ TYPES ═══════════════════ */

type DealRow = Record<string, any>;
type EarningRow = { id?: string; user_name: string; earning_amount: number; earning_status: string; deal_id: string; participant_role?: string; created_at?: string };
type AdjustmentRow = { user_name: string; type: string; amount: number; reason?: string; deal_id?: string };
type AdvanceSummary = { agent_name: string; current_remaining_balance: number };
type TabKey = "snapshot" | "charts" | "deals" | "payout";

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function REPDashboard() {
  const { portalUser, loading: rbacLoading, effectiveScope, teamNames } = usePortalUser();
  const isAdmin = effectiveScope === "all";
  const isManager = effectiveScope === "team";
  const [tab, setTab] = useState<TabKey>("snapshot");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRep, setSelectedRep] = useState("");
  const [queryError, setQueryError] = useState("");

  /* Filters */
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2099-12-31");
  const [search, setSearch] = useState("");

  const myName = portalUser?.linked_name ?? "";
  const activeName = (isAdmin || isManager) ? selectedRep : myName;

  const load = useCallback(async () => {
    if (rbacLoading) return;
    // Reps must have a linked name; admin/manager can proceed without one
    if (!isAdmin && !isManager && !myName) return;
    setLoading(true);

    // Determine which name(s) to filter by
    const filterName = (isAdmin || isManager) ? selectedRep : myName;

    let dq = supabase.from("deals_view")
      .select("*")
      .order("date_closed", { ascending: false }).limit(5000);

    let eq = supabase.from("commission_earnings").select("id,user_name,earning_amount,earning_status,deal_id,participant_role,created_at");
    let aq = supabase.from("commission_adjustments").select("user_name,type,amount,reason,deal_id");
    let advq = supabase.from("advances_summary").select("agent_name,current_remaining_balance");

    if (filterName) {
      // Filter to a specific rep
      dq = dq.or(`sales_rep.eq.${filterName},appointment_setter.eq.${filterName},call_center_appointment_setter.eq.${filterName}`);
      eq = eq.eq("user_name", filterName);
      aq = aq.eq("user_name", filterName);
      advq = advq.eq("agent_name", filterName);
    } else if (isManager && teamNames && teamNames.length > 0) {
      // Manager with no selectedRep: load team data
      const nameList = teamNames.map(n => `"${n}"`).join(",");
      dq = dq.or(`sales_rep.in.(${nameList}),appointment_setter.in.(${nameList}),call_center_appointment_setter.in.(${nameList})`);
    }
    // Admin with no selectedRep: no filter applied — loads all

    const [dRes, eRes, aRes, advRes] = await Promise.all([
      dq,
      eq,
      aq,
      filterName ? advq.maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);

    const errors: string[] = [];
    if (dRes.error) { console.error("[REPDashboard] deals query error:", dRes.error); errors.push(`Deals: ${dRes.error.message}`); }
    if (eRes.error) { console.error("[REPDashboard] earnings query error:", eRes.error); errors.push(`Earnings: ${eRes.error.message}`); }
    if (aRes.error) { console.error("[REPDashboard] adjustments query error:", aRes.error); errors.push(`Adjustments: ${aRes.error.message}`); }
    if (advRes.error) { console.error("[REPDashboard] advances query error:", advRes.error); errors.push(`Advances: ${advRes.error.message}`); }
    setQueryError(errors.join(" | "));

    if (dRes.data) setDeals(dRes.data);
    if (eRes.data) setEarnings(eRes.data as EarningRow[]);
    if (aRes.data) setAdjustments(aRes.data as AdjustmentRow[]);
    if (advRes.data) setAdvanceBalance(num((advRes.data as AdvanceSummary).current_remaining_balance));
    else setAdvanceBalance(0);
    setLoading(false);
  }, [rbacLoading, isAdmin, isManager, myName, selectedRep, teamNames]);

  useEffect(() => { load(); }, [load]);

  /* Filtered deals */
  const filtered = useMemo(() => {
    return deals.filter(d => {
      const dc = (d.date_closed ?? "").slice(0, 10);
      if (dc && dc < startDate) return false;
      if (dc && dc > endDate) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${d.customer_name ?? ""} ${d.install_partner ?? ""} ${d.status ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [deals, startDate, endDate, search]);

  /* Derive all rep names from deals for admin/manager dropdown */
  const allReps = useMemo(() => {
    if (!isAdmin && !isManager) return [];
    if (isManager && teamNames) return [...teamNames].sort((a, b) => a.localeCompare(b));
    const set = new Set<string>();
    for (const d of deals) {
      const rep = (d.sales_rep ?? "").trim();
      if (rep) set.add(rep);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [isAdmin, isManager, teamNames, deals]);

  /* Tag each deal with role for the viewed rep */
  function getMyRole(d: DealRow): string[] {
    const name = activeName;
    if (!name) return [];
    const roles: string[] = [];
    if ((d.sales_rep ?? "").trim().toLowerCase() === name.toLowerCase()) roles.push("Closer");
    if ((d.appointment_setter ?? "").trim().toLowerCase() === name.toLowerCase()) roles.push("Setter");
    if ((d.call_center_appointment_setter ?? "").trim().toLowerCase() === name.toLowerCase()) roles.push("CC Setter");
    return roles;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "snapshot", label: "Personal Snapshot" },
    { key: "charts", label: "My Performance" },
    { key: "deals", label: "My Deals" },
    { key: "payout", label: "Payout Clarity" },
  ];

  if (rbacLoading) return <div className="p-8 text-sm text-slate-400">Loading permissions...</div>;
  if (!isAdmin && !isManager && !myName) return <div className="p-8 text-sm text-slate-400">No linked user profile found. Please contact your administrator.</div>;

  return (
    <div className="bg-slate-50 p-4 space-y-4">
      <div className={UI.card}>
        <div className="border-b border-slate-200">
          <div className="px-5 pt-3.5 pb-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Rep Dashboard</h2>
                <p className="text-xs text-slate-400">
                  {activeName ? `${activeName} — Personal performance & payouts` : (isAdmin || isManager) ? "Select a rep to view their data" : "Personal performance & payouts"}
                </p>
              </div>
              {(isAdmin || isManager) && (
                <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" value={selectedRep} onChange={e => setSelectedRep(e.target.value)}>
                  <option value="">{isAdmin ? "All Reps (aggregate)" : "Select a rep..."}</option>
                  {allReps.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
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
          <button className={UI.buttonGhost + " text-xs"} onClick={load}>Refresh</button>
        </div>

        {queryError && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <span className="font-semibold">Query Error:</span> {queryError}
          </div>
        )}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading your data...</div>
        ) : (
          <>
            {tab === "snapshot" && <PersonalSnapshotTab deals={filtered} earnings={earnings} advanceBalance={advanceBalance} />}
            {tab === "charts" && <MyChartsTab deals={filtered} earnings={earnings} myName={activeName} />}
            {tab === "deals" && <MyDealsTab deals={filtered} earnings={earnings} getMyRole={getMyRole} />}
            {tab === "payout" && <PayoutClarityTab deals={filtered} earnings={earnings} adjustments={adjustments} advanceBalance={advanceBalance} myName={activeName} getMyRole={getMyRole} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: PERSONAL SNAPSHOT ═══════════════════ */

function PersonalSnapshotTab({ deals, earnings, advanceBalance }: { deals: DealRow[]; earnings: EarningRow[]; advanceBalance: number }) {
  const pipeline = deals.filter(d => !["P2 Paid", "Cancelled", "Canceled"].includes((d.status ?? "").trim())).length;
  const closed = deals.filter(d => ["P2 Paid", "Partial P2 Paid", "P2 Ready"].includes((d.status ?? "").trim())).length;
  const p2Collected = deals.reduce((s, d) => s + num(d.paid_nova_nrg_p1_p2_rev_amount), 0);
  const expectedP2 = deals.reduce((s, d) => s + num(d.rev), 0);
  const collPct = expectedP2 > 0 ? p2Collected / expectedP2 : 0;

  const commEarned = earnings.reduce((s, e) => s + num(e.earning_amount), 0);
  const commPaid = earnings.filter(e => e.earning_status === "paid").reduce((s, e) => s + num(e.earning_amount), 0);
  const commOutstanding = commEarned - commPaid;

  return (
    <div className="px-6 py-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="My Pipeline" value={String(pipeline)} sub="Active deals" />
        <KpiTile label="My Closed" value={String(closed)} sub="P2 Ready/Paid" color="text-emerald-700" />
        <KpiTile label="P2 Collected" value={moneyCompact(p2Collected)} color="text-blue-700" />
        <KpiTile label="Collection %" value={pct(collPct)} color={collPct >= 0.7 ? "text-emerald-700" : "text-amber-600"} />
        <KpiTile label="Commission Earned" value={moneyCompact(commEarned)} />
        <KpiTile label="Commission Paid" value={moneyCompact(commPaid)} color="text-emerald-700" />
        <KpiTile label="Outstanding" value={moneyCompact(commOutstanding)} color={commOutstanding > 0 ? "text-amber-600" : "text-slate-600"} />
        <KpiTile label="Advance Balance" value={moneyCompact(advanceBalance)} color={advanceBalance > 0 ? "text-red-600" : "text-slate-600"} sub={advanceBalance > 0 ? "To be repaid" : "No balance"} />
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 2: MY PERFORMANCE CHARTS ═══════════════════ */

function MyChartsTab({ deals, earnings, myName }: { deals: DealRow[]; earnings: EarningRow[]; myName: string }) {
  /* Monthly commission earned vs paid */
  const monthlyComm = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number }>();
    for (const e of earnings) {
      const dt = e.created_at?.slice(0, 7); // YYYY-MM
      if (!dt) continue;
      const entry = map.get(dt) ?? { earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      map.set(dt, entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, data]) => ({ month, ...data }));
  }, [earnings]);

  /* Deals by source */
  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const src = deriveDealSource(d);
      map.set(src, (map.get(src) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [deals]);

  /* Deals by status */
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deals) {
      const s = (d.status ?? "").trim();
      if (s) map.set(s, (map.get(s) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [deals]);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Commission earned vs paid */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">Monthly Commission: Earned vs Paid</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthlyComm}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => moneyCompact(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => money(v as number)} />
              <Legend />
              <Area type="monotone" dataKey="earned" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} name="Earned" />
              <Area type="monotone" dataKey="paid" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} name="Paid" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Source pie */}
        <div className={UI.card + " p-4"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">My Deals by Source</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={sourceMix} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {sourceMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Status bar chart */}
        <div className={UI.card + " p-4 lg:col-span-2"}>
          <div className="text-sm font-semibold text-slate-900 mb-3">My Deals by Status</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusCounts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 3: MY DEALS TABLE ═══════════════════ */

function MyDealsTab({ deals, earnings, getMyRole }: { deals: DealRow[]; earnings: EarningRow[]; getMyRole: (d: DealRow) => string[] }) {
  const [sortCol, setSortCol] = useState("date_closed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const commByDeal = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number }>();
    for (const e of earnings) {
      const entry = map.get(e.deal_id) ?? { earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      map.set(e.deal_id, entry);
    }
    return map;
  }, [earnings]);

  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [deals, sortCol, sortDir]);

  function handleExport() {
    const rows = sorted.map(d => ({
      Customer: d.customer_name ?? "", Installer: d.install_partner ?? "", Status: d.status ?? "",
      "My Role": getMyRole(d).join(", "), kW: num(d.kw_system), Closed: d.date_closed ?? "",
      Revenue: num(d.rev), Collected: num(d.paid_nova_nrg_p1_p2_rev_amount),
      "Collection%": num(d.rev) > 0 ? (num(d.paid_nova_nrg_p1_p2_rev_amount) / num(d.rev) * 100).toFixed(1) : 0,
      Commission: commByDeal.get(d.id)?.earned ?? 0,
      Paid: commByDeal.get(d.id)?.paid ?? 0,
    }));
    downloadCSV(rows, "my_deals_export.csv");
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
              {[
                { key: "customer_name", label: "Customer" },
                { key: "install_partner", label: "Installer" },
                { key: "status", label: "Status" },
                { key: "role", label: "My Role" },
                { key: "kw_system", label: "kW", align: "right" },
                { key: "date_closed", label: "Closed" },
                { key: "rev", label: "Rev", align: "right" },
                { key: "paid_nova_nrg_p1_p2_rev_amount", label: "Collected", align: "right" },
                { key: "pct", label: "%", align: "right" },
                { key: "commission", label: "Commission", align: "right" },
                { key: "comm_paid", label: "Paid", align: "right" },
              ].map(c => (
                <th key={c.key} className={`px-3 py-2 cursor-pointer hover:bg-slate-800 select-none whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                  onClick={() => toggleSort(c.key)}>
                  {c.label} {sortCol === c.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => {
              const roles = getMyRole(d);
              const comm = commByDeal.get(d.id);
              const rev = num(d.rev);
              const coll = num(d.paid_nova_nrg_p1_p2_rev_amount);
              return (
                <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5">{d.customer_name}</td>
                  <td className="px-3 py-1.5">{d.install_partner}</td>
                  <td className="px-3 py-1.5">{d.status}</td>
                  <td className="px-3 py-1.5"><div className="flex gap-1">{roles.map(r => <RolePill key={r} role={r} />)}</div></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(d.kw_system) ? num(d.kw_system).toFixed(2) : ""}</td>
                  <td className="px-3 py-1.5">{fmtDate(d.date_closed)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(rev)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(coll)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{rev > 0 ? pct(coll / rev) : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(comm?.earned)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{money(comm?.paid)}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">No deals found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 4: PAYOUT CLARITY ═══════════════════ */

function PayoutClarityTab({ deals, earnings, adjustments, advanceBalance, myName, getMyRole }: {
  deals: DealRow[]; earnings: EarningRow[]; adjustments: AdjustmentRow[]; advanceBalance: number; myName: string; getMyRole: (d: DealRow) => string[];
}) {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  /* Commission & adjustments per deal */
  const commByDeal = useMemo(() => {
    const map = new Map<string, { earned: number; paid: number }>();
    for (const e of earnings) {
      const entry = map.get(e.deal_id) ?? { earned: 0, paid: 0 };
      entry.earned += num(e.earning_amount);
      if (e.earning_status === "paid") entry.paid += num(e.earning_amount);
      map.set(e.deal_id, entry);
    }
    return map;
  }, [earnings]);

  const adjByDeal = useMemo(() => {
    const map = new Map<string, { bonuses: number; deductions: number }>();
    for (const a of adjustments) {
      if (!a.deal_id) continue;
      const entry = map.get(a.deal_id) ?? { bonuses: 0, deductions: 0 };
      if (a.type === "bonus") entry.bonuses += num(a.amount);
      else entry.deductions += num(a.amount);
      map.set(a.deal_id, entry);
    }
    return map;
  }, [adjustments]);

  const selectedDeal = deals.find(d => d.id === selectedDealId);

  /* Payout calculation for selected deal */
  const payoutCalc = useMemo(() => {
    if (!selectedDeal) return null;
    const rev = num(selectedDeal.rev);
    const collected = num(selectedDeal.paid_nova_nrg_p1_p2_rev_amount);
    const collPct = rev > 0 ? collected / rev : 0;
    const comm = commByDeal.get(selectedDeal.id);
    const adj = adjByDeal.get(selectedDeal.id);
    const baseComm = comm?.earned ?? 0;
    const proportional = baseComm * collPct;
    const bonuses = adj?.bonuses ?? 0;
    const deductions = adj?.deductions ?? 0;
    const netPayout = proportional + bonuses - deductions;
    const alreadyPaid = comm?.paid ?? 0;
    const remaining = netPayout - alreadyPaid;

    return { rev, collected, collPct, baseComm, proportional, bonuses, deductions, netPayout, alreadyPaid, remaining };
  }, [selectedDeal, commByDeal, adjByDeal]);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="text-sm text-slate-500 mb-2">Click a deal to see its payout breakdown</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Deal list */}
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">Select a Deal</div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-right">Rev</th>
                  <th className="px-3 py-2 text-right">Comm</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const roles = getMyRole(d);
                  const comm = commByDeal.get(d.id);
                  const isSelected = d.id === selectedDealId;
                  return (
                    <tr key={d.id} className={`border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                      onClick={() => setSelectedDealId(d.id)}>
                      <td className="px-3 py-1.5 font-medium">{d.customer_name}</td>
                      <td className="px-3 py-1.5"><div className="flex gap-1">{roles.map(r => <RolePill key={r} role={r} />)}</div></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(d.rev)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(comm?.earned)}</td>
                    </tr>
                  );
                })}
                {deals.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No deals.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payout breakdown */}
        <div className={UI.card + " overflow-hidden"}>
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold">
            Payout Breakdown {selectedDeal ? `\u2014 ${selectedDeal.customer_name}` : ""}
          </div>
          {payoutCalc ? (
            <div className="p-5 space-y-3">
              <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm space-y-2">
                <PayoutLine label="Expected P2 Revenue" value={moneyFull(payoutCalc.rev)} />
                <PayoutLine label="P2 Collected" value={moneyFull(payoutCalc.collected)} note={`(${pct(payoutCalc.collPct)})`} />
                <div className="border-t border-slate-300 my-2" />
                <PayoutLine label="Base Commission" value={moneyFull(payoutCalc.baseComm)} />
                <PayoutLine label="Proportional Payout" value={moneyFull(payoutCalc.proportional)} note={`(${pct(payoutCalc.collPct)} of base)`} bold />
                {payoutCalc.bonuses > 0 && <PayoutLine label="+ Bonuses" value={moneyFull(payoutCalc.bonuses)} color="text-emerald-700" />}
                {payoutCalc.deductions > 0 && <PayoutLine label="- Deductions" value={`(${moneyFull(payoutCalc.deductions)})`} color="text-red-600" />}
                <div className="border-t border-slate-300 my-2" />
                <PayoutLine label="Net Payout" value={moneyFull(payoutCalc.netPayout)} bold />
                <PayoutLine label="Already Paid" value={moneyFull(payoutCalc.alreadyPaid)} color="text-emerald-700" />
                <div className="border-t border-slate-900 border-double my-2" />
                <PayoutLine label="Remaining" value={moneyFull(payoutCalc.remaining)} bold color={payoutCalc.remaining > 0 ? "text-blue-700" : payoutCalc.remaining < 0 ? "text-red-600" : "text-slate-900"} />
              </div>

              {advanceBalance > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <span className="font-semibold">Advance Balance:</span> {moneyFull(advanceBalance)} &mdash; This will be repaid from future payouts.
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">Select a deal from the list to view its payout breakdown.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PayoutLine({ label, value, note, bold, color }: { label: string; value: string; note?: string; bold?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={color ?? "text-slate-900"}>
        {value} {note && <span className="text-slate-400 text-xs font-normal">{note}</span>}
      </span>
    </div>
  );
}
