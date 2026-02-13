"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PORTAL_HEADER_PX = 64;

type DealRow = {
  id: string;
  created_at: string | null;
  company: string | null;
  customer_name: string | null;
  sales_rep: string | null;
  appointment_setter: string | null;
  call_center_appointment_setter: string | null;
  status: string | null;
  kw_system: number | null;
  net_price_per_watt: number | null;
  date_closed: string | null;
  paid_nova_nrg_p2_rev_date: string | null;
  rev: number | null;
  nova_nrg_rev_after_fee_amount: number | null;
  gross_profit: number | null;
  visionary_revenue: number | null;
  visionary_rev_after_fee_amount: number | null;
  agent_pay: number | null;
  agent_rev_after_fee_amount: number | null;
};

type FilterOptionRow = {
  company: string | null;
  sales_rep: string | null;
  call_center_appointment_setter: string | null;
  status: string | null;
};

type DisplayRow = DealRow & {
  paymentTimeline: number | null;
  totalRevenue: number;
  revenuePaid: number;
  percentPaid: number | null;
  revenueUnpaid: number;
  grossProfit: number;
  gpPaid: number;
  gpUnpaid: number;
  visionaryTotal: number;
  visionaryPaidOut: number;
  visionaryPending: number;
  agentTotal: number;
  agentPaidOut: number;
  agentPending: number;
  hasSplit: boolean;
  splitRevenue: number;
  splitRevenuePaid: number;
  splitRevenueUnpaid: number;
  splitGP: number;
  splitGPPaid: number;
  splitGPUnpaid: number;
  splitPayTotal: number;
  splitPaidOut: number;
  splitPending: number;
  bucket: string;
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function num(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined) return "";
  const v = Number(n);
  if (Number.isNaN(v)) return "";
  return v.toFixed(d);
}

function pct(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined) return "";
  const v = Number(n);
  if (Number.isNaN(v)) return "";
  return `${v.toFixed(d)}%`;
}

function safeLower(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function daysBetweenISO(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return null;
  const pa = a.slice(0, 10).split("-").map(Number);
  const pb = b.slice(0, 10).split("-").map(Number);
  if (pa.length < 3 || pb.length < 3) return null;
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateMMDDYY(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length < 3) return iso;
  const [yyyy, mm, dd] = parts;
  return `${mm}/${dd}/${yyyy.slice(-2)}`;
}

function statusBucket(status: string | null | undefined) {
  const s = safeLower(status);
  if (s.includes("pending")) return "Pending";
  if (s.includes("p2 ready")) return "P2 Ready";
  if (s.includes("partial") && s.includes("p2") && s.includes("paid")) return "Partial P2 Paid";
  if (s.includes("p2 paid")) return "P2 Paid";
  if (s.includes("on hold") || s.includes("hold")) return "On Hold";
  if (s.includes("issue")) return "Issue";
  if (s.includes("cancel")) return "Canceled";
  return (status ?? "").trim() || "Other";
}

function statusClass(status: string | null | undefined) {
  const s = safeLower(status);
  if (s.includes("cancel")) return "bg-red-200/50 hover:bg-red-300/60";
  if (s.includes("p2 ready")) return "bg-green-600/60 hover:bg-green-600";
  if (s.includes("partial") && s.includes("p2") && s.includes("paid")) return "bg-green-200/50 hover:bg-green-200";
  if (s.includes("p2 paid")) return "bg-lime-300/50 hover:bg-lime-400/50";
  if (s.includes("issue")) return "bg-orange-200/50 hover:bg-orange-300/50";
  if (s.includes("on hold") || s === "hold" || s.includes("hold")) return "bg-yellow-300/50 hover:bg-yellow-400/50";
  return "bg-white hover:bg-slate-100";
}

function uniqSorted(vals: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of vals) { const s = (v ?? "").trim(); if (s) set.add(s); }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function useDebouncedEffect(effect: () => void, deps: any[], delayMs: number) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => effect(), delayMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const UI = {
  topSticky: "sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/60",
  contentPad: "p-4 space-y-3",
  card: "bg-white rounded-xl border border-slate-200/60 shadow-sm",
  cardPad: "p-4",
  control: "w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200",
  buttonPrimary: "px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition",
  pill: "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-slate-200/70 bg-slate-50 text-slate-700",
};

type MultiSelectProps = { label: string; options: string[]; selected: string[]; onChange: (next: string[]) => void; placeholder?: string; };

function MultiSelect({ label, options, selected, onChange, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { function onDocDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); } document.addEventListener("mousedown", onDocDown); return () => document.removeEventListener("mousedown", onDocDown); }, []);
  const filtered = useMemo(() => { const t = q.trim().toLowerCase(); return t ? options.filter(o => o.toLowerCase().includes(t)) : options; }, [options, q]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  function toggle(v: string) { const next = selectedSet.has(v) ? selected.filter(x => x !== v) : [...selected, v]; next.sort((a, b) => a.localeCompare(b)); onChange(next); }
  const displayText = selected.length === 0 ? (placeholder ?? "All") : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2" ref={wrapRef}>
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="relative">
        <button type="button" className={`w-full ${UI.control} text-left flex items-center justify-between gap-2`} onClick={() => setOpen(s => !s)}>
          <span className={`truncate ${selected.length === 0 ? "text-slate-500" : "text-slate-900"}`}>{displayText}</span>
          <span className="text-slate-400">▾</span>
        </button>
        {open && (
          <div className="absolute z-40 mt-2 w-full rounded-xl border border-slate-200/70 bg-white shadow-lg overflow-hidden" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div className="p-2 border-b border-slate-200/60">
              <input className={UI.control} placeholder="Type to filter…" value={q} onChange={e => setQ(e.target.value)} />
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[11px] text-slate-500">{selected.length === 0 ? "All selected" : `${selected.length} selected`}</div>
                <button type="button" className="text-[11px] font-semibold text-slate-700 hover:text-slate-900" onClick={() => onChange([])}>Clear</button>
              </div>
            </div>
            <div className="max-h-64 overflow-auto">
              {filtered.length === 0 ? <div className="px-3 py-3 text-sm text-slate-500">No matches.</div> : filtered.map(opt => {
                const checked = selectedSet.has(opt);
                return (
                  <label key={opt} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer select-none">
                    <input type="checkbox" checked={checked} onChange={() => toggle(opt)} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SPPDashboard() {
  useEffect(() => { const pb = document.body.style.overflow; const ph = document.documentElement.style.overflow; document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden"; return () => { document.body.style.overflow = pb; document.documentElement.style.overflow = ph; }; }, []);

  const [rows, setRows] = useState<DealRow[]>([]);
  const [optRows, setOptRows] = useState<FilterOptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [salesReps, setSalesReps] = useState<string[]>([]);
  const [ccSetters, setCcSetters] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [installers, setInstallers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("2024-07-01");
  const [endDate, setEndDate] = useState("2027-12-31");

  const loadFilterOptions = useCallback(async () => {
    let q = supabase.from("deals_view").select("company,sales_rep,call_center_appointment_setter,status").order("date_closed", { ascending: false }).limit(5000);
    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);
    const { data, error } = await q;
    if (error) { setMsg(prev => prev ?? `Options load error: ${error.message}`); setOptRows([]); return; }
    setOptRows((data ?? []) as FilterOptionRow[]);
  }, [startDate, endDate]);

  const loadRows = useCallback(async () => {
    setLoading(true); setMsg(null);
    let q = supabase.from("deals_view").select([
      "id", "created_at", "company", "customer_name", "sales_rep",
      "appointment_setter", "call_center_appointment_setter", "status",
      "kw_system", "net_price_per_watt", "date_closed",
      "paid_nova_nrg_p2_rev_date", "rev", "nova_nrg_rev_after_fee_amount",
      "gross_profit",
      "visionary_revenue", "visionary_rev_after_fee_amount",
      "agent_pay", "agent_rev_after_fee_amount",
    ].join(",")).order("date_closed", { ascending: false }).limit(5000);

    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);
    if (salesReps.length) q = q.in("sales_rep", salesReps);
    if (ccSetters.length) q = q.in("call_center_appointment_setter", ccSetters);
    if (installers.length) q = q.in("company", installers);
    if (statuses.length) q = q.in("status", statuses);

    const { data, error } = await q;
    if (error) { setMsg(`Load error: ${error.message}`); setRows([]); }
    else setRows((data ?? []) as unknown as DealRow[]);
    setLoading(false);
  }, [startDate, endDate, salesReps, ccSetters, installers, statuses]);

  useEffect(() => { loadFilterOptions(); loadRows(); }, [loadFilterOptions, loadRows]);
  useDebouncedEffect(() => loadRows(), [startDate, endDate, salesReps, ccSetters, installers, statuses], 250);
  useDebouncedEffect(() => loadFilterOptions(), [startDate, endDate], 250);

  const options = useMemo(() => ({
    installers: uniqSorted(optRows.map(r => r.company)),
    salesReps: uniqSorted(optRows.map(r => r.sales_rep)),
    ccSetters: uniqSorted(optRows.map(r => r.call_center_appointment_setter)),
    statuses: uniqSorted(optRows.map(r => r.status)),
  }), [optRows]);

  const mergedOptions = useMemo(() => {
    const merge = (opts: string[], sel: string[]) => { const set = new Set(opts); for (const s of sel) set.add(s); return Array.from(set).sort((a, b) => a.localeCompare(b)); };
    return { installers: merge(options.installers, installers), salesReps: merge(options.salesReps, salesReps), ccSetters: merge(options.ccSetters, ccSetters), statuses: merge(options.statuses, statuses) };
  }, [options, installers, salesReps, ccSetters, statuses]);

  /* ═══════════ CORRECTED FORMULAS ═══════════ */
  const displayRows: DisplayRow[] = useMemo(() => {
    return rows.map(r => {
      const paymentTimeline = daysBetweenISO(r.paid_nova_nrg_p2_rev_date, r.date_closed);

      // Revenue
      const totalRevenue = r.rev ?? 0;
      const revenuePaid = r.nova_nrg_rev_after_fee_amount ?? 0;
      const percentPaid = totalRevenue ? (revenuePaid / totalRevenue) * 100 : null;
      const revenueUnpaid = totalRevenue - revenuePaid;

      // Gross Profit
      const grossProfit = r.gross_profit ?? 0;
      const agentPaidOutVal = r.agent_rev_after_fee_amount ?? 0;
      const gpPaid = revenuePaid - agentPaidOutVal;
      const gpUnpaid = grossProfit - gpPaid;

      // Visionary: visionary_revenue = total, visionary_rev_after_fee_amount = paid
      const visionaryTotal = r.visionary_revenue ?? 0;
      const visionaryPaidOut = r.visionary_rev_after_fee_amount ?? 0;
      const visionaryPending = visionaryTotal - visionaryPaidOut;

      // Agent: agent_pay = total, agent_rev_after_fee_amount = paid
      const agentTotal = r.agent_pay ?? 0;
      const agentPaidOut = agentPaidOutVal;
      const agentPending = agentTotal - agentPaidOut;

      // 50/50 Split: applies when BOTH agent AND setter are filled AND agent_pay > 0
      const hasSplit = !!(r.sales_rep && r.sales_rep.trim() && r.appointment_setter && r.appointment_setter.trim() && agentTotal > 0);
      const splitRevenue = hasSplit ? totalRevenue / 2 : 0;
      const splitRevenuePaid = hasSplit ? revenuePaid / 2 : 0;
      const splitRevenueUnpaid = hasSplit ? revenueUnpaid / 2 : 0;
      const splitGP = hasSplit ? grossProfit / 2 : 0;
      const splitGPPaid = hasSplit ? gpPaid / 2 : 0;
      const splitGPUnpaid = hasSplit ? gpUnpaid / 2 : 0;
      const splitPayTotal = hasSplit ? agentTotal / 2 : 0;
      const splitPaidOut = hasSplit ? agentPaidOut / 2 : 0;
      const splitPending = hasSplit ? agentPending / 2 : 0;

      return {
        ...r, paymentTimeline,
        totalRevenue, revenuePaid, percentPaid, revenueUnpaid,
        grossProfit, gpPaid, gpUnpaid,
        visionaryTotal, visionaryPaidOut, visionaryPending,
        agentTotal, agentPaidOut, agentPending,
        hasSplit, splitRevenue, splitRevenuePaid, splitRevenueUnpaid,
        splitGP, splitGPPaid, splitGPUnpaid,
        splitPayTotal, splitPaidOut, splitPending,
        bucket: statusBucket(r.status),
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const sum = (key: keyof DisplayRow) => displayRows.reduce((a, r) => a + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
    const totalDeals = displayRows.length;
    const totalRevenue = sum("totalRevenue");
    const totalRevenuePaid = sum("revenuePaid");
    const totalRevenueUnpaid = sum("revenueUnpaid");
    const totalGP = sum("grossProfit");
    const totalGPPaid = sum("gpPaid");
    const totalGPUnpaid = sum("gpUnpaid");
    const visionaryTotal = sum("visionaryTotal");
    const visionaryPaidOut = sum("visionaryPaidOut");
    const visionaryPending = sum("visionaryPending");
    const agentTotal = sum("agentTotal");
    const agentPaidOut = sum("agentPaidOut");
    const agentPending = sum("agentPending");
    const percentPaid = totalRevenue ? (totalRevenuePaid / totalRevenue) * 100 : 0;
    const splitRevenue = sum("splitRevenue");
    const splitRevenuePaid = sum("splitRevenuePaid");
    const splitRevenueUnpaid = sum("splitRevenueUnpaid");
    const splitGP = sum("splitGP");
    const splitGPPaid = sum("splitGPPaid");
    const splitGPUnpaid = sum("splitGPUnpaid");
    const splitPayTotal = sum("splitPayTotal");
    const splitPaidOut = sum("splitPaidOut");
    const splitPending = sum("splitPending");
    return { totalDeals, totalRevenue, totalRevenuePaid, totalRevenueUnpaid, percentPaid, totalGP, totalGPPaid, totalGPUnpaid, visionaryTotal, visionaryPaidOut, visionaryPending, agentTotal, agentPaidOut, agentPending, splitRevenue, splitRevenuePaid, splitRevenueUnpaid, splitGP, splitGPPaid, splitGPUnpaid, splitPayTotal, splitPaidOut, splitPending };
  }, [displayRows]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of displayRows) counts.set(r.bucket, (counts.get(r.bucket) ?? 0) + 1);
    const overallTotal = displayRows.length;
    const activeTotal = (counts.get("Pending") ?? 0) + (counts.get("P2 Ready") ?? 0) + (counts.get("Partial P2 Paid") ?? 0) + (counts.get("P2 Paid") ?? 0);
    const pending = counts.get("Pending") ?? 0;
    const p2Ready = counts.get("P2 Ready") ?? 0;
    const partialP2Paid = counts.get("Partial P2 Paid") ?? 0;
    const p2Paid = counts.get("P2 Paid") ?? 0;
    const onHold = counts.get("On Hold") ?? 0;
    const issue = counts.get("Issue") ?? 0;
    const canceled = counts.get("Canceled") ?? 0;
    const pctOf = (n: number, d: number) => d ? (n / d) * 100 : 0;
    return { overallTotal, activeTotal, pending, p2Ready, partialP2Paid, p2Paid, onHold, issue, canceled,
      pendingPctActive: pctOf(pending, activeTotal), p2ReadyPctActive: pctOf(p2Ready, activeTotal),
      partialP2PaidPctActive: pctOf(partialP2Paid, activeTotal), p2PaidPctActive: pctOf(p2Paid, activeTotal),
      onHoldPctOverall: pctOf(onHold, overallTotal), issuePctOverall: pctOf(issue, overallTotal), canceledPctOverall: pctOf(canceled, overallTotal) };
  }, [displayRows]);

  function clearAll() { setSalesReps([]); setCcSetters([]); setStatuses([]); setInstallers([]); setStartDate("2024-07-01"); setEndDate("2027-12-31"); }

  const containerStyle: React.CSSProperties = { height: `calc(100dvh - ${PORTAL_HEADER_PX}px)`, maxHeight: `calc(100dvh - ${PORTAL_HEADER_PX}px)` };

  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const HEADERS: { label: string; key: keyof DisplayRow | null }[] = [
    { label: "Installer", key: "company" },
    { label: "Client Name", key: "customer_name" },
    { label: "Agent", key: "sales_rep" },
    { label: "App Setter", key: "appointment_setter" },
    { label: "Call Center App Setter", key: "call_center_appointment_setter" },
    { label: "Status", key: "status" },
    { label: "KWS", key: "kw_system" },
    { label: "NPPW", key: "net_price_per_watt" },
    { label: "Closed Date", key: "date_closed" },
    { label: "Payment Timeline", key: "paymentTimeline" },
    { label: "Total Revenue", key: "totalRevenue" },
    { label: "Paid Date", key: "paid_nova_nrg_p2_rev_date" },
    { label: "Revenue (Paid)", key: "revenuePaid" },
    { label: "% Paid", key: "percentPaid" },
    { label: "Revenue (Unpaid)", key: "revenueUnpaid" },
    { label: "Gross Profit", key: "grossProfit" },
    { label: "Gross Profit (Paid)", key: "gpPaid" },
    { label: "Gross Profit (Unpaid)", key: "gpUnpaid" },
    { label: "Visionary Payment Total", key: "visionaryTotal" },
    { label: "Visionary Paid Out", key: "visionaryPaidOut" },
    { label: "Visionary Pending Payout", key: "visionaryPending" },
    { label: "Agent Payment Total", key: "agentTotal" },
    { label: "Agent Paid Out", key: "agentPaidOut" },
    { label: "Agent Pending Payout", key: "agentPending" },
    { label: "Rev 50/50 Split", key: "splitRevenue" },
    { label: "Rev 50/50 (Paid)", key: "splitRevenuePaid" },
    { label: "Rev 50/50 (Unpaid)", key: "splitRevenueUnpaid" },
    { label: "GP 50/50 Split", key: "splitGP" },
    { label: "GP 50/50 (Paid)", key: "splitGPPaid" },
    { label: "GP 50/50 (Unpaid)", key: "splitGPUnpaid" },
    { label: "50/50 Pay Total", key: "splitPayTotal" },
    { label: "50/50 Paid Out", key: "splitPaidOut" },
    { label: "50/50 Pending", key: "splitPending" },
  ];

  function handleSort(colIdx: number) {
    if (sortCol === colIdx) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (sortCol === null) return displayRows;
    const key = HEADERS[sortCol]?.key;
    if (!key) return displayRows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...displayRows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "boolean" && typeof bv === "boolean") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [displayRows, sortCol, sortDir]);

  return (
    <div className="min-h-0 flex flex-col overflow-hidden bg-slate-50 p-4" style={containerStyle}>
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className={UI.topSticky}>
        <div className={UI.contentPad}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight">SPP Dashboard</h2>
              <p className="text-xs text-slate-400">Sales performance & pipeline analytics</p>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
            <div className={`${UI.card} ${UI.cardPad}`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Filters</div>
                  <span className={UI.pill}>Auto-update</span>
                </div>
                <MultiSelect label="Sales Rep" options={mergedOptions.salesReps} selected={salesReps} onChange={setSalesReps} placeholder="All" />
                <MultiSelect label="CC Setter" options={mergedOptions.ccSetters} selected={ccSetters} onChange={setCcSetters} placeholder="All" />
                <MultiSelect label="Status" options={mergedOptions.statuses} selected={statuses} onChange={setStatuses} placeholder="All" />
                <MultiSelect label="Installer" options={mergedOptions.installers} selected={installers} onChange={setInstallers} placeholder="All" />
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <div className="text-sm font-semibold text-slate-700">Start Date</div>
                  <input type="date" className={UI.control} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <div className="text-sm font-semibold text-slate-700">End Date</div>
                  <input type="date" className={UI.control} value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-2">
                    <button className={UI.buttonPrimary} onClick={loadRows}>Apply</button>
                    <button className={UI.buttonGhost} onClick={clearAll}>Clear</button>
                  </div>
                  <button className={UI.buttonGhost} onClick={loadRows}>Refresh</button>
                </div>
                {msg && <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">{msg}</div>}
              </div>
            </div>

            <div className={`${UI.card} ${UI.cardPad}`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <KpiBox title="TOTAL DEALS" value={String(totals.totalDeals)} />
                <KpiBox title="TOTAL REVENUE" value={money(totals.totalRevenue)} />
                <KpiBox title="REVENUE PAID" value={money(totals.totalRevenuePaid)} />
                <KpiBox title="% PAID" value={pct(totals.percentPaid)} />
              </div>

              <div className="mt-3 rounded-xl border border-slate-200/60 overflow-hidden">
                <div className="bg-slate-50/70 border-b border-slate-200/60 py-2 text-center font-semibold tracking-wide text-slate-800">
                  <span className="mr-6">ACTIVE TOTALS: {summary.activeTotal}</span>
                  <span className="ml-6">OVERALL TOTALS: {summary.overallTotal}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="p-3 lg:border-r border-slate-200/60">
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <SummaryLine label="Pending" count={summary.pending} pct={summary.pendingPctActive} pctColor="text-emerald-700" />
                      <SummaryLine label="Partial P2 Paid" count={summary.partialP2Paid} pct={summary.partialP2PaidPctActive} pctColor="text-emerald-700" />
                      <SummaryLine label="P2 Ready" count={summary.p2Ready} pct={summary.p2ReadyPctActive} pctColor="text-emerald-700" />
                      <SummaryLine label="P2 Paid" count={summary.p2Paid} pct={summary.p2PaidPctActive} pctColor="text-emerald-700" />
                    </div>
                    <div className="pt-3 text-[10px] text-slate-500 text-center">* % vs Active Totals Only</div>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                      <SummaryLine label="On Hold" count={summary.onHold} pct={summary.onHoldPctOverall} pctColor="text-sky-800" />
                      <SummaryLine label="Issue" count={summary.issue} pct={summary.issuePctOverall} pctColor="text-sky-800" />
                      <SummaryLine label="Canceled" count={summary.canceled} pct={summary.canceledPctOverall} pctColor="text-sky-800" />
                      <div />
                    </div>
                    <div className="pt-3 text-[10px] text-slate-500 text-center">* % vs Overall Totals</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">Note: Percent Paid = Revenue (Paid) / Total Revenue × 100. 50/50 Split applies when both Agent and App Setter are filled.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="h-full overflow-auto">
          <table className="min-w-[3600px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200/60">
              <tr className="text-left text-slate-700">
                {HEADERS.map((h, i) => (
                  <th key={h.label} onClick={() => handleSort(i)}
                    className={`px-3 py-2 whitespace-nowrap border-r border-slate-200/60 font-semibold cursor-pointer select-none hover:bg-slate-100/80 transition-colors ${i === 24 ? "border-l-[3px] border-l-slate-800" : ""} ${i === HEADERS.length - 1 ? "border-r-0" : ""}`}>
                    <span className="inline-flex items-center gap-1">
                      {h.label}
                      {sortCol === i ? (
                        <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">⇅</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Totals Row */}
              <tr className="bg-gray-800 text-white border-b border-gray-900 font-semibold">
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">TOTALS</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{totals.totalDeals}</td>
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalRevenue)}</td>
                <td className="px-3 py-2 border-r border-gray-700" />
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalRevenuePaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{pct(totals.percentPaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalRevenueUnpaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalGP)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalGPPaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.totalGPUnpaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.visionaryTotal)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.visionaryPaidOut)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.visionaryPending)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.agentTotal)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.agentPaidOut)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.agentPending)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700 border-l-[3px] border-l-white/40">{money(totals.splitRevenue)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitRevenuePaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitRevenueUnpaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitGP)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitGPPaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitGPUnpaid)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitPayTotal)}</td>
                <td className="px-3 py-2 whitespace-nowrap border-r border-gray-700">{money(totals.splitPaidOut)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{money(totals.splitPending)}</td>
              </tr>

              {loading ? (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={HEADERS.length}>Loading…</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={HEADERS.length}>No results.</td></tr>
              ) : (
                sortedRows.map(r => (
                  <tr key={r.id} className={`${statusClass(r.status)} border-b border-slate-200/60 transition`}>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.company ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.customer_name ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.sales_rep ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.appointment_setter ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.call_center_appointment_setter ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.status ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{num(r.kw_system, 2)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{num(r.net_price_per_watt, 2)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{formatDateMMDDYY(r.date_closed)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.paymentTimeline ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.totalRevenue)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{formatDateMMDDYY(r.paid_nova_nrg_p2_rev_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.revenuePaid)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.percentPaid == null ? "" : pct(r.percentPaid)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.revenueUnpaid)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.grossProfit)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.gpPaid)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.gpUnpaid)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.visionaryTotal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.visionaryPaidOut)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.visionaryPending)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.agentTotal)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.agentPaidOut)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{money(r.agentPending)}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60 border-l-[3px] border-l-slate-800">{r.hasSplit ? money(r.splitRevenue) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitRevenuePaid) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitRevenueUnpaid) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitGP) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitGPPaid) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitGPUnpaid) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitPayTotal) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-r border-slate-200/60">{r.hasSplit ? money(r.splitPaidOut) : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.hasSplit ? money(r.splitPending) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>{/* end rounded card wrapper */}
    </div>
  );
}

function KpiBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm">
      <div className="text-[11px] text-slate-500">{title}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SummaryLine({ label, count, pct, pctColor }: { label: string; count: number; pct: number; pctColor: string }) {
  return (
    <>
      <div className="font-semibold text-slate-800">{label}</div>
      <div className="flex justify-end gap-4">
        <div className="w-10 text-right font-semibold text-slate-800">{count}</div>
        <div className={`w-16 text-right font-semibold ${pctColor}`}>{pct.toFixed(2)}%</div>
      </div>
    </>
  );
}
