"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type AdvanceEntry = {
  id?: string;
  date: string;
  agent_name: string;
  description: "Advance" | "Advance Repayment" | "Opening Balance";
  amount_received_from_agent: number;
  amount_paid_to_agent: number;
  opening_balance_adjustment: number;
  date_in_payroll: string | null;
  remarks: string | null;
};

type AgentSummary = {
  agent_name: string;
  total_advances: number;
  total_repayments: number;
  current_remaining_balance: number;
  transaction_count: number;
  last_transaction_date: string | null;
};

/* ═══════════════════ HELPERS ═══════════════════ */

const z = (v: number | null | undefined): number => v ?? 0;
const money = (v: number | null | undefined): string => {
  const n = z(v);
  if (n === 0) return "";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
};
const moneyZ = (v: number): string => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;
const fds = (d: string | null): string => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
};
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */

export default function Advances() {
  const [tab, setTab] = useState<"summary" | "ledger">("summary");

  return (
    <div className="bg-slate-50">
      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="px-6 flex gap-1 pt-3">
          {(["summary", "ledger"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-xs font-semibold rounded-t-lg transition-colors ${tab === t ? "bg-slate-50 border border-b-0 border-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-600"}`}>
              {t === "summary" ? "Advance Summary" : "Transaction Ledger"}
            </button>
          ))}
        </div>
      </div>

      {tab === "summary" ? <SummaryTab /> : <LedgerTab />}
    </div>
  );
}

/* ═══════════════════ TAB 1: SUMMARY DASHBOARD ═══════════════════ */

/** Per-agent computed stats from deals */
type AgentStats = {
  total_future_revenues: number;
  revenues_paid: number;
  revenues_unpaid: number;
  total_future_gross_profit: number;
  gross_profit_paid: number;
  gross_profit_unpaid: number;
  remaining_payout_total: number;
  remaining_total_paid_out: number;
  remaining_agent_unpaid: number;
  remaining_deals_pre_p2: number;
};

/** Per-agent latest transaction info */
type LatestTx = {
  repayment: number;
  advance: number;
};

const ELIGIBLE_STATUSES = ["Pending", "P2 Ready", "Partial P2 Paid"];

function SummaryTab() {
  const [summaries, setSummaries] = useState<AgentSummary[]>([]);
  const [prevBalances, setPrevBalances] = useState<Map<string, number>>(new Map());
  const [latestTx, setLatestTx] = useState<Map<string, LatestTx>>(new Map());
  const [dealStats, setDealStats] = useState<Map<string, AgentStats>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    /* 1. Agent summaries from DB view */
    const { data: sData } = await supabase.from("advances_summary").select("*").order("agent_name");
    const sums = (sData ?? []) as AgentSummary[];
    setSummaries(sums);

    /* 2. For each agent: get last 2 transactions to compute Previous Balance and Latest Tx */
    const prev = new Map<string, number>();
    const ltx = new Map<string, LatestTx>();
    for (const s of sums) {
      const { data: recent } = await supabase.from("advances")
        .select("amount_paid_to_agent,amount_received_from_agent,opening_balance_adjustment,description")
        .eq("agent_name", s.agent_name)
        .order("date", { ascending: false }).order("created_at", { ascending: false })
        .limit(1);
      if (recent && recent.length > 0) {
        const last = recent[0];
        const lastNet = z(last.amount_paid_to_agent) + z(last.opening_balance_adjustment) - z(last.amount_received_from_agent);
        prev.set(s.agent_name, s.current_remaining_balance - lastNet);
        ltx.set(s.agent_name, {
          repayment: z(last.amount_received_from_agent),
          advance: z(last.amount_paid_to_agent) + z(last.opening_balance_adjustment),
        });
      } else {
        prev.set(s.agent_name, 0);
        ltx.set(s.agent_name, { repayment: 0, advance: 0 });
      }
    }
    setPrevBalances(prev);
    setLatestTx(ltx);

    /* 3. Deal stats — using the EXACT spreadsheet formula logic with setter splits */
    const { data: deals } = await supabase.from("deals_view")
      .select("sales_rep,appointment_setter,status,rev,gross_profit,agent_pay,nova_nrg_rev_after_fee_amount,agent_rev_after_fee_amount");

    const map = new Map<string, AgentStats>();
    const ensure = (name: string) => {
      if (!map.has(name)) map.set(name, {
        total_future_revenues: 0, revenues_paid: 0, revenues_unpaid: 0,
        total_future_gross_profit: 0, gross_profit_paid: 0, gross_profit_unpaid: 0,
        remaining_payout_total: 0, remaining_total_paid_out: 0, remaining_agent_unpaid: 0,
        remaining_deals_pre_p2: 0,
      });
      return map.get(name)!;
    };

    if (deals) {
      for (const d of deals as any[]) {
        const rep = (d.sales_rep ?? "").trim();
        const setter = (d.appointment_setter ?? "").trim();
        const status = (d.status ?? "").trim();
        if (!rep) continue;

        const eligible = ELIGIBLE_STATUSES.some(s => s.toLowerCase() === status.toLowerCase());
        if (!eligible) continue;

        const hasSetter = setter !== "";
        const repShare = hasSetter ? 0.5 : 1;
        const setterShare = hasSetter ? 0.5 : 0;

        const rev = z(d.rev);                                    // Sales!O = rev
        const revPaid = z(d.nova_nrg_rev_after_fee_amount);      // Sales!BF = nova_nrg_rev_after_fee_amount
        const gp = z(d.gross_profit);                            // Sales!P = gross_profit
        const payout = z(d.agent_pay);                           // Sales!S = agent_pay
        const paidOut = z(d.agent_rev_after_fee_amount);         // Sales!CD = agent_rev_after_fee_amount

        // Pre-P2 deals: only Pending and P2 Ready (NOT Partial P2 Paid)
        const prePaid = ["pending", "p2 ready"].includes(status.toLowerCase());

        // Rep attribution
        const sr = ensure(rep);
        sr.total_future_revenues += rev * repShare;
        sr.revenues_paid += revPaid * repShare;
        sr.total_future_gross_profit += gp * repShare;
        sr.remaining_payout_total += payout * repShare;
        sr.remaining_total_paid_out += paidOut * repShare;
        if (prePaid) sr.remaining_deals_pre_p2 += repShare;

        // Setter attribution (if setter exists)
        if (hasSetter && setter) {
          const ss = ensure(setter);
          ss.total_future_revenues += rev * setterShare;
          ss.revenues_paid += revPaid * setterShare;
          ss.total_future_gross_profit += gp * setterShare;
          ss.remaining_payout_total += payout * setterShare;
          ss.remaining_total_paid_out += paidOut * setterShare;
          if (prePaid) ss.remaining_deals_pre_p2 += setterShare;
        }
      }
    }

    // Compute derived fields
    map.forEach(s => {
      s.revenues_unpaid = s.total_future_revenues - s.revenues_paid;
      s.gross_profit_paid = s.revenues_paid - s.remaining_total_paid_out;
      s.gross_profit_unpaid = s.total_future_gross_profit - s.gross_profit_paid;
      s.remaining_agent_unpaid = s.remaining_payout_total - s.remaining_total_paid_out;
    });
    setDealStats(map);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Totals row */
  const totals = useMemo(() => {
    const t = { prevBal: 0, curBal: 0, repay: 0, adv: 0, diff: 0 };
    summaries.forEach(s => {
      t.prevBal += prevBalances.get(s.agent_name) ?? 0;
      t.curBal += s.current_remaining_balance;
      t.repay += s.total_repayments;
      t.adv += s.total_advances;
    });
    t.diff = t.repay - t.adv;
    return t;
  }, [summaries, prevBalances]);

  const dealTotals = useMemo(() => {
    const t: AgentStats = {
      total_future_revenues: 0, revenues_paid: 0, revenues_unpaid: 0,
      total_future_gross_profit: 0, gross_profit_paid: 0, gross_profit_unpaid: 0,
      remaining_payout_total: 0, remaining_total_paid_out: 0, remaining_agent_unpaid: 0,
      remaining_deals_pre_p2: 0,
    };
    dealStats.forEach(s => {
      t.total_future_revenues += s.total_future_revenues;
      t.revenues_paid += s.revenues_paid;
      t.revenues_unpaid += s.revenues_unpaid;
      t.total_future_gross_profit += s.total_future_gross_profit;
      t.gross_profit_paid += s.gross_profit_paid;
      t.gross_profit_unpaid += s.gross_profit_unpaid;
      t.remaining_payout_total += s.remaining_payout_total;
      t.remaining_total_paid_out += s.remaining_total_paid_out;
      t.remaining_agent_unpaid += s.remaining_agent_unpaid;
      t.remaining_deals_pre_p2 += s.remaining_deals_pre_p2;
    });
    return t;
  }, [dealStats]);

  /* Styles */
  const MW = "82px"; // uniform $ column width — fits "$999,999.99" + slim padding
  const hd: React.CSSProperties = {
    padding: "6px 6px", fontSize: "8.5px", fontWeight: 600, textAlign: "center",
    color: "#fff", backgroundColor: "#334155", whiteSpace: "normal",
    borderRight: "0.5px solid rgba(255,255,255,0.1)", textTransform: "uppercase", letterSpacing: "0.02em",
    lineHeight: "1.3",
  };
  const hc: React.CSSProperties = { ...hd, textAlign: "center" };
  const hr: React.CSSProperties = { ...hd, textAlign: "right" };
  const hm: React.CSSProperties = { ...hr, width: MW }; // $ header
  const td: React.CSSProperties = { padding: "4px 5px", fontSize: "10px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const tr: React.CSSProperties = { ...td, textAlign: "right" };
  const tm: React.CSSProperties = { ...tr, width: MW }; // $ data cell
  const tt: React.CSSProperties = { ...tm, fontWeight: 700, backgroundColor: "#dbeafe" }; // $ totals

  if (loading) return <div className="px-6 py-8 text-sm text-slate-400">Loading advance summaries…</div>;

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Advance Summary Dashboard</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Cash advance balances, repayments, and leverage per agent</p>
        </div>
        <button className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={load}>↻ Refresh</button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "110px" }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: "52px" }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: MW }} />
            <col style={{ width: "52px" }} />
            <col style={{ width: "40px" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={hd} rowSpan={2}>Agent Name</th>
              <th style={hm} rowSpan={2}>Previous Remaining Balance</th>
              <th style={hc} colSpan={2}>Latest Transaction</th>
              <th style={hm} rowSpan={2}>Current Remaining Balance</th>
              <th style={hm} rowSpan={2}>Repayments</th>
              <th style={hm} rowSpan={2}>Advances</th>
              <th style={hr} rowSpan={2}>% of Difference</th>
              <th style={hm} rowSpan={2}>Difference</th>
              <th style={hm} rowSpan={2}>Total Future Revenues</th>
              <th style={hm} rowSpan={2}>Revenues (PAID)</th>
              <th style={hm} rowSpan={2}>Revenues (UNPAID)</th>
              <th style={hm} rowSpan={2}>Total Future Gross Profit</th>
              <th style={hm} rowSpan={2}>Gross Profit (PAID)</th>
              <th style={hm} rowSpan={2}>Gross Profit (UNPAID)</th>
              <th style={hm} rowSpan={2}>Remaining Payout Total</th>
              <th style={hm} rowSpan={2}>Remaining Total (PAID OUT)</th>
              <th style={hm} rowSpan={2}>Remaining Agent (UNPAID)</th>
              <th style={hr} rowSpan={2}>% Leverage</th>
              <th style={hr} rowSpan={2}>Deals Pre-P2</th>
            </tr>
            <tr>
              <th style={{ ...hm, backgroundColor: "#475569" }}>Repayment</th>
              <th style={{ ...hm, backgroundColor: "#475569" }}>Advance</th>
            </tr>
          </thead>
          <tbody>
            {/* TOTALS ROW */}
            <tr style={{ backgroundColor: "#dbeafe" }}>
              <td style={{ ...td, fontWeight: 700 }}>TOTALS</td>
              <td style={tt}>{moneyZ(totals.prevBal)}</td>
              <td style={tt}></td><td style={tt}></td>
              <td style={tt}>{moneyZ(totals.curBal)}</td>
              <td style={tt}>{moneyZ(totals.repay)}</td>
              <td style={tt}>{moneyZ(totals.adv)}</td>
              <td style={{ ...tt, width: "52px" }}>{totals.adv > 0 ? pct(totals.repay / totals.adv) : ""}</td>
              <td style={tt}>{moneyZ(totals.diff)}</td>
              <td style={tt}>{moneyZ(dealTotals.total_future_revenues)}</td>
              <td style={tt}>{moneyZ(dealTotals.revenues_paid)}</td>
              <td style={tt}>{moneyZ(dealTotals.revenues_unpaid)}</td>
              <td style={tt}>{moneyZ(dealTotals.total_future_gross_profit)}</td>
              <td style={tt}>{moneyZ(dealTotals.gross_profit_paid)}</td>
              <td style={tt}>{moneyZ(dealTotals.gross_profit_unpaid)}</td>
              <td style={tt}>{moneyZ(dealTotals.remaining_payout_total)}</td>
              <td style={tt}>{moneyZ(dealTotals.remaining_total_paid_out)}</td>
              <td style={tt}>{moneyZ(dealTotals.remaining_agent_unpaid)}</td>
              <td style={{ ...tt, width: "52px" }}></td>
              <td style={{ ...tt, width: "40px" }}>{Math.round(dealTotals.remaining_deals_pre_p2)}</td>
            </tr>
            {/* Spacer */}
            <tr><td colSpan={20} style={{ height: "4px", border: "none" }}></td></tr>
            {/* AGENT ROWS */}
            {summaries.map((s, i) => {
              const prev = prevBalances.get(s.agent_name) ?? 0;
              const lt = latestTx.get(s.agent_name) ?? { repayment: 0, advance: 0 };
              const diff = s.total_repayments - s.total_advances; // Difference = Repayments - Advances
              const ds = dealStats.get(s.agent_name);
              // % Leverage = Difference / Remaining Agent Unpaid Total
              const leverage = ds && ds.remaining_agent_unpaid !== 0 ? diff / ds.remaining_agent_unpaid : 0;
              const leverageAbs = Math.abs(leverage);
              const leverageBg = leverageAbs > 0.5 ? "#ef4444" : leverageAbs > 0.15 ? "#3b82f6" : leverageAbs > 0 ? "#22c55e" : "transparent";

              return (
                <tr key={s.agent_name} style={{ backgroundColor: i % 2 === 1 ? "#f9fafb" : "transparent" }}>
                  <td style={td}>{s.agent_name}</td>
                  <td style={tm}>{moneyZ(prev)}</td>
                  <td style={tm}>{lt.repayment > 0 ? moneyZ(lt.repayment) : ""}</td>
                  <td style={tm}>{lt.advance > 0 ? moneyZ(lt.advance) : ""}</td>
                  <td style={{ ...tm, fontWeight: 600 }}>{moneyZ(s.current_remaining_balance)}</td>
                  <td style={tm}>{moneyZ(s.total_repayments)}</td>
                  <td style={tm}>{moneyZ(s.total_advances)}</td>
                  <td style={tr}>{s.total_advances > 0 ? pct(s.total_repayments / s.total_advances) : ""}</td>
                  <td style={tm}>{moneyZ(diff)}</td>
                  <td style={tm}>{money(ds?.total_future_revenues)}</td>
                  <td style={tm}>{money(ds?.revenues_paid)}</td>
                  <td style={tm}>{money(ds?.revenues_unpaid)}</td>
                  <td style={tm}>{money(ds?.total_future_gross_profit)}</td>
                  <td style={tm}>{money(ds?.gross_profit_paid)}</td>
                  <td style={tm}>{money(ds?.gross_profit_unpaid)}</td>
                  <td style={tm}>{money(ds?.remaining_payout_total)}</td>
                  <td style={tm}>{money(ds?.remaining_total_paid_out)}</td>
                  <td style={tm}>{money(ds?.remaining_agent_unpaid)}</td>
                  <td style={{ ...tr, color: leverageBg !== "transparent" ? "#fff" : "#374151", backgroundColor: leverageBg, fontWeight: 600 }}>
                    {leverage !== 0 ? pct(leverage) : ""}
                  </td>
                  <td style={tr}>{ds ? Math.round(ds.remaining_deals_pre_p2) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 2: TRANSACTION LEDGER ═══════════════════ */

function LedgerTab() {
  const [entries, setEntries] = useState<AdvanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [agents, setAgents] = useState<string[]>([]);

  /* New entry form */
  const blank: AdvanceEntry = {
    date: today(), agent_name: "", description: "Advance",
    amount_received_from_agent: 0, amount_paid_to_agent: 0,
    opening_balance_adjustment: 0, date_in_payroll: null, remarks: null,
  };
  const [form, setForm] = useState<AdvanceEntry>(blank);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("advances").select("*").order("date", { ascending: true }).order("created_at", { ascending: true });
    if (filterAgent) q = q.eq("agent_name", filterAgent);
    const { data } = await q;
    if (data) setEntries(data as AdvanceEntry[]);

    /* Unique agents for filter */
    const { data: ag } = await supabase.from("advances").select("agent_name").order("agent_name");
    if (ag) setAgents([...new Set(ag.map((a: any) => a.agent_name).filter(Boolean))] as string[]);

    setLoading(false);
  }, [filterAgent]);

  useEffect(() => { load(); }, [load]);

  /* Compute running balance per agent */
  const withBalance = useMemo(() => {
    const balances = new Map<string, number>();
    return entries.map(e => {
      const prev = balances.get(e.agent_name) ?? 0;
      const bal = prev + z(e.amount_paid_to_agent) + z(e.opening_balance_adjustment) - z(e.amount_received_from_agent);
      balances.set(e.agent_name, bal);
      return { ...e, running_balance: bal };
    });
  }, [entries]);

  /* Save new entry */
  async function saveEntry() {
    if (!form.agent_name) { setMsg("Agent name is required."); return; }
    setSaving(true); setMsg(null);
    const payload = {
      date: form.date,
      agent_name: form.agent_name,
      description: form.description,
      amount_received_from_agent: form.description === "Advance Repayment" ? z(form.amount_received_from_agent) : 0,
      amount_paid_to_agent: form.description === "Advance" ? z(form.amount_paid_to_agent) : 0,
      opening_balance_adjustment: form.description === "Opening Balance" ? z(form.opening_balance_adjustment) : 0,
      date_in_payroll: form.date_in_payroll || null,
      remarks: form.remarks || null,
    };
    const { error } = await supabase.from("advances").insert(payload);
    if (error) { setMsg(`Error: ${error.message}`); setSaving(false); return; }
    setForm(blank); setShowForm(false); setSaving(false);
    load();
  }

  /* Delete entry — confirmation handled by caller */
  async function deleteEntry(id: string) {
    await supabase.from("advances").delete().eq("id", id);
    load();
  }

  /* Edit dialog */
  const [editEntry, setEditEntry] = useState<AdvanceEntry | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const se = (k: keyof AdvanceEntry, v: any) => setEditEntry(p => p ? { ...p, [k]: v } : p);

  async function updateEntry() {
    if (!editEntry?.id) return;
    setEditSaving(true);
    const payload = {
      date: editEntry.date,
      agent_name: editEntry.agent_name,
      description: editEntry.description,
      amount_received_from_agent: editEntry.description === "Advance Repayment" ? z(editEntry.amount_received_from_agent) : 0,
      amount_paid_to_agent: editEntry.description === "Advance" ? z(editEntry.amount_paid_to_agent) : 0,
      opening_balance_adjustment: editEntry.description === "Opening Balance" ? z(editEntry.opening_balance_adjustment) : 0,
      date_in_payroll: editEntry.date_in_payroll || null,
      remarks: editEntry.remarks || null,
    };
    const { error } = await supabase.from("advances").update(payload).eq("id", editEntry.id);
    if (error) { setMsg(`Error: ${error.message}`); setEditSaving(false); return; }
    setEditEntry(null); setEditSaving(false);
    load();
  }

  /* Agent name suggestions from deals_view */
  const [agentSuggestions, setAgentSuggestions] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("deals_view").select("sales_rep").not("sales_rep", "is", null);
      if (data) setAgentSuggestions([...new Set(data.map((d: any) => d.sales_rep).filter(Boolean))] as string[]);
    })();
  }, []);

  /* Ledger styles — fixed layout for balanced columns */
  const DW = "88px";   // date columns — wider with padding
  const AW = "100px";  // $ amount columns — wider for comfort
  const hd: React.CSSProperties = {
    padding: "8px 8px", fontSize: "9px", fontWeight: 600, textAlign: "center",
    color: "#fff", backgroundColor: "#334155", whiteSpace: "normal",
    borderRight: "0.5px solid rgba(255,255,255,0.15)", textTransform: "uppercase", letterSpacing: "0.03em",
    lineHeight: "1.3",
  };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: "10.5px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#374151" };
  const tr: React.CSSProperties = { ...td, textAlign: "right" };

  return (
    <div className="px-6 py-5 space-y-4">
      {/* Header + Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Advance Transaction Ledger</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">All cash advance and repayment transactions · Click any row to edit</p>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Filter by Agent</label>
            <select className="border border-slate-200/70 rounded-lg px-3 py-2 text-sm min-w-[160px]"
              value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={load}>↻ Refresh</button>
          <button className="px-4 py-2 rounded-lg bg-slate-900 shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-white text-xs font-semibold"
            onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New Entry"}</button>
        </div>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Advance Entry</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Date</label>
              <input type="date" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent Name</label>
              <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={form.agent_name} onChange={e => setForm(p => ({ ...p, agent_name: e.target.value }))}>
                <option value="">Select agent…</option>
                {[...new Set([...agentSuggestions, ...agents])].sort().map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Description</label>
              <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value as any }))}>
                <option value="Advance">Advance</option>
                <option value="Advance Repayment">Advance Repayment</option>
                <option value="Opening Balance">Opening Balance</option>
              </select>
            </div>
            {form.description === "Advance" && (
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Paid to Agent</label>
                <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.amount_paid_to_agent || ""} onChange={e => setForm(p => ({ ...p, amount_paid_to_agent: Number(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
            )}
            {form.description === "Advance Repayment" && (
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Received from Agent</label>
                <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.amount_received_from_agent || ""} onChange={e => setForm(p => ({ ...p, amount_received_from_agent: Number(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
            )}
            {form.description === "Opening Balance" && (
              <div>
                <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Opening Balance Amount</label>
                <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.opening_balance_adjustment || ""} onChange={e => setForm(p => ({ ...p, opening_balance_adjustment: Number(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Date in Payroll</label>
              <input type="date" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={form.date_in_payroll ?? ""} onChange={e => setForm(p => ({ ...p, date_in_payroll: e.target.value || null }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Remarks</label>
              <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={form.remarks ?? ""} onChange={e => setForm(p => ({ ...p, remarks: e.target.value || null }))} placeholder="e.g. New Entry - Cash Advance" />
            </div>
          </div>
          {msg && <div className="text-xs text-red-600">{msg}</div>}
          <button className="px-5 py-2 rounded-lg bg-slate-900 shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-white text-xs font-semibold disabled:opacity-50"
            onClick={saveEntry} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</button>
        </div>
      )}

      {/* Ledger Table */}
      {loading ? (
        <div className="text-sm text-slate-400 py-8">Loading transactions…</div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: DW }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: AW }} />
              <col style={{ width: AW }} />
              <col style={{ width: AW }} />
              <col style={{ width: AW }} />
              <col style={{ width: DW }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={hd}>Date</th>
                <th style={hd}>Agent Name</th>
                <th style={hd}>Description</th>
                <th style={hd}>Received from Agent (Cr)</th>
                <th style={hd}>Paid to Agent (Dr)</th>
                <th style={hd}>Opening Bal. Adj.</th>
                <th style={hd}>Remaining Balance</th>
                <th style={hd}>Date in Payroll</th>
                <th style={hd}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {withBalance.length === 0 ? (
                <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: "32px" }}>No transactions found. Click "+ New Entry" to add one.</td></tr>
              ) : withBalance.map((e, i) => {
                const isRepay = e.description === "Advance Repayment";
                const isOpen = e.description === "Opening Balance";
                return (
                  <tr key={e.id ?? i}
                    style={{ backgroundColor: i % 2 === 1 ? "#f8f9fb" : "transparent", cursor: "pointer", transition: "background-color 0.1s" }}
                    onClick={() => e.id && setEditEntry({ ...e })}
                    onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = "#eef2ff")}
                    onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = i % 2 === 1 ? "#f8f9fb" : "transparent")}
                    title="Click to edit">
                    <td style={{ ...td, textAlign: "center" }}>{fds(e.date)}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{e.agent_name}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-semibold ${isRepay ? "bg-green-100 text-green-700" : isOpen ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {e.description}
                      </span>
                    </td>
                    <td style={{ ...tr, color: isRepay ? "#16a34a" : "#d1d5db" }}>{z(e.amount_received_from_agent) > 0 ? moneyZ(e.amount_received_from_agent) : ""}</td>
                    <td style={{ ...tr, color: !isRepay && !isOpen ? "#dc2626" : "#d1d5db" }}>{z(e.amount_paid_to_agent) > 0 ? moneyZ(e.amount_paid_to_agent) : ""}</td>
                    <td style={tr}>{z(e.opening_balance_adjustment) > 0 ? moneyZ(e.opening_balance_adjustment) : ""}</td>
                    <td style={{ ...tr, fontWeight: 600, color: "#111827" }}>{moneyZ(e.running_balance)}</td>
                    <td style={{ ...td, textAlign: "center" }}>{fds(e.date_in_payroll)}</td>
                    <td style={{ ...td, fontSize: "9.5px", color: "#6b7280" }}>{e.remarks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-400">{withBalance.length} transactions{filterAgent ? ` for ${filterAgent}` : ""}</p>

      {/* ═══ Edit Entry Dialog ═══ */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditEntry(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="text-sm font-semibold text-slate-900">Edit Advance Entry</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{editEntry.agent_name} — {fds(editEntry.date)}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={() => setEditEntry(null)}>✕</button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Date</label>
                  <input type="date" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editEntry.date} onChange={e => se("date", e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Agent Name</label>
                  <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editEntry.agent_name} onChange={e => se("agent_name", e.target.value)}>
                    <option value="">Select agent…</option>
                    {[...new Set([...agentSuggestions, ...agents])].sort().map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Description</label>
                  <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editEntry.description} onChange={e => se("description", e.target.value)}>
                    <option value="Advance">Advance</option>
                    <option value="Advance Repayment">Advance Repayment</option>
                    <option value="Opening Balance">Opening Balance</option>
                  </select>
                </div>
                {editEntry.description === "Advance" && (
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Paid to Agent</label>
                    <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editEntry.amount_paid_to_agent || ""} onChange={e => se("amount_paid_to_agent", Number(e.target.value) || 0)} />
                  </div>
                )}
                {editEntry.description === "Advance Repayment" && (
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Amount Received from Agent</label>
                    <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editEntry.amount_received_from_agent || ""} onChange={e => se("amount_received_from_agent", Number(e.target.value) || 0)} />
                  </div>
                )}
                {editEntry.description === "Opening Balance" && (
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Opening Balance Amount</label>
                    <input type="number" step="0.01" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={editEntry.opening_balance_adjustment || ""} onChange={e => se("opening_balance_adjustment", Number(e.target.value) || 0)} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Date in Payroll</label>
                  <input type="date" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editEntry.date_in_payroll ?? ""} onChange={e => se("date_in_payroll", e.target.value || null)} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Remarks</label>
                  <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={editEntry.remarks ?? ""} onChange={e => se("remarks", e.target.value || null)} placeholder="Notes…" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              <button className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
                onClick={() => {
                  if (editEntry.id && confirm(`Are you sure you want to delete this record?\n\nAgent: ${editEntry.agent_name}\nDate: ${fds(editEntry.date)}\nType: ${editEntry.description}\nAmount: ${moneyZ(z(editEntry.amount_paid_to_agent) + z(editEntry.amount_received_from_agent) + z(editEntry.opening_balance_adjustment))}\n\nThis action cannot be undone.`)) {
                    deleteEntry(editEntry.id); setEditEntry(null);
                  }
                }}>
                Delete Entry
              </button>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-slate-100" onClick={() => setEditEntry(null)}>Cancel</button>
                <button className="px-5 py-2 rounded-lg bg-slate-900 shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-white text-xs font-semibold disabled:opacity-50"
                  onClick={updateEntry} disabled={editSaving}>{editSaving ? "Saving…" : "Save Changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
