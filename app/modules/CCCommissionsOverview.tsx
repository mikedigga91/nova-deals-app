"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DealRow = {
  id: string;
  company: string | null;
  customer_name: string | null;
  status: string | null;
  sales_rep: string | null;
  kw_system: number | null;
  net_price_per_watt: number | null;
  date_closed: string | null;
  call_center_appointment_setter: string | null;
};

/* ── helpers ─────────────────────────────────────────────── */

function money(n: number | null | undefined) {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function num(n: number | null | undefined, d = 2) {
  if (n == null) return "";
  const v = Number(n);
  if (Number.isNaN(v)) return "";
  return v.toFixed(d);
}

function safeLower(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function formatDateMMDDYY(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function hasDate(v: string | null | undefined) {
  return !!(v && String(v).trim());
}

function getPaidSetterDate(r: DealRow) {
  const anyRow = r as any;
  return (
    anyRow.cc_setter_paid_date ??
    anyRow.paid_date_setter ??
    anyRow.setter_paid_date ??
    anyRow.paid_date_cc_setter ??
    null
  ) as string | null;
}

function getPaidManagerDate(r: DealRow) {
  const anyRow = r as any;
  return (
    anyRow.cc_manager_paid_date ??
    anyRow.paid_date_manager ??
    anyRow.manager_paid_date ??
    anyRow.paid_date_cc_manager ??
    null
  ) as string | null;
}

function isCommissionStatus(status: string | null | undefined) {
  const s = safeLower(status);
  return s === "pending" || s === "p2 ready" || s === "partial p2 paid" || s === "p2 paid";
}

function dateLTE(iso: string, yyyy_mm_dd: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(`${yyyy_mm_dd}T23:59:59`);
  return d.getTime() <= cutoff.getTime();
}

function computePayToSetter(r: DealRow) {
  const setter = (r.call_center_appointment_setter ?? "").trim();
  if (!setter) return 0;
  if (!isCommissionStatus(r.status)) return 0;
  if (!r.date_closed) return 0;
  return dateLTE(r.date_closed, "2025-03-31") ? 50 : 100;
}

function computePayToManager(r: DealRow) {
  const setter = (r.call_center_appointment_setter ?? "").trim();
  if (!setter) return 0;
  if (!isCommissionStatus(r.status)) return 0;
  if (!r.date_closed) return 0;
  return dateLTE(r.date_closed, "2025-03-31") ? 0 : 25;
}

function uniqSorted(vals: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of vals) {
    const s = (v ?? "").trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ── row status → style tokens ───────────────────────────── */

type RowStyle = { bg: string; text: string; border: string };

function getRowStyle(
  status: string | null | undefined,
  paidSetterDate?: string | null,
  paidMgrDate?: string | null
): RowStyle {
  const s = safeLower(status);

  if (s === "on hold" || s === "hold")
    return { bg: "rgba(251, 191, 36, 0.18)", text: "#92400e", border: "rgba(251, 191, 36, 0.35)" };
  if (s === "canceled" || s === "cancelled")
    return { bg: "rgba(185, 28, 28, 0.12)", text: "#991b1b", border: "rgba(185, 28, 28, 0.25)" };
  if (s === "pending")
    return { bg: "transparent", text: "#1e293b", border: "transparent" };

  const a = hasDate(paidSetterDate);
  const b = hasDate(paidMgrDate);

  if (a && b) return { bg: "rgba(22, 163, 74, 0.15)", text: "#14532d", border: "rgba(22, 163, 74, 0.3)" };
  if (a || b) return { bg: "rgba(74, 222, 128, 0.12)", text: "#166534", border: "rgba(74, 222, 128, 0.25)" };

  return { bg: "transparent", text: "#1e293b", border: "transparent" };
}

/* ── status badge component ──────────────────────────────── */

function StatusBadge({ status }: { status: string | null }) {
  const s = safeLower(status);
  let bg = "#e2e8f0";
  let color = "#334155";

  if (s === "on hold" || s === "hold") { bg = "#fef3c7"; color = "#92400e"; }
  else if (s === "canceled" || s === "cancelled") { bg = "#fee2e2"; color = "#991b1b"; }
  else if (s === "pending") { bg = "#dbeafe"; color = "#1e40af"; }
  else if (s === "p2 ready") { bg = "#d1fae5"; color = "#065f46"; }
  else if (s === "partial p2 paid") { bg = "#bbf7d0"; color = "#166534"; }
  else if (s === "p2 paid") { bg = "#86efac"; color = "#14532d"; }

  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {status ?? ""}
    </span>
  );
}

/* ── legend swatch ───────────────────────────────────────── */

function LegendSwatch({ bg, label }: { bg: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-7 h-2.5 rounded-sm border border-black/[0.08]"
        style={{ background: bg }}
      />
      <span className="text-[10px] text-slate-500 font-medium">{label}</span>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */

export default function CCCommissionsOverview() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [setterFilter, setSetterFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("2024-07-01");
  const [endDate, setEndDate] = useState("2027-12-31");

  async function load() {
    setLoading(true);
    setMsg(null);

    let q = supabase
      .from("deals_view")
      .select("*")
      .order("date_closed", { ascending: false })
      .limit(5000);

    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);
    if (setterFilter) q = q.eq("call_center_appointment_setter", setterFilter);
    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, error } = await q;

    if (error) {
      setMsg(`Load error: ${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as DealRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => ({
    setters: uniqSorted(rows.map((r) => r.call_center_appointment_setter)),
    statuses: uniqSorted(rows.map((r) => r.status)),
  }), [rows]);

  const displayRows = useMemo(() => {
    return rows.map((r) => {
      const paidSetterDate = getPaidSetterDate(r);
      const paidMgrDate = getPaidManagerDate(r);
      const paySetter = computePayToSetter(r);
      const payMgr = computePayToManager(r);
      const commissionApplicable = paySetter > 0 || payMgr > 0;
      const subtotal = paySetter + payMgr;
      return { ...r, paidSetterDate, paidMgrDate, paySetter, payMgr, subtotal, commissionApplicable };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const totalPaySetter = displayRows.reduce((a, r) => a + (r.paySetter ?? 0), 0);
    const totalPayMgr = displayRows.reduce((a, r) => a + (r.payMgr ?? 0), 0);
    const totalSubtotal = displayRows.reduce((a, r) => a + (r.subtotal ?? 0), 0);
    return { totalPaySetter, totalPayMgr, totalSubtotal };
  }, [displayRows]);

  const COLS = [
    "Installer", "Client Name", "Status", "Agent", "KWS", "NPPW",
    "Closed Date", "Setter", "Pay to Setter", "Paid (Setter)",
    "Pay to Manager", "Paid (Manager)", "Subtotal",
  ];

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight">CC Commissions Overview</h2>
              <p className="text-xs text-slate-400">Track setter &amp; manager payouts</p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <LegendSwatch bg="rgba(74,222,128,0.35)" label="Partial" />
            <LegendSwatch bg="rgba(22,163,74,0.45)" label="Paid" />
            <LegendSwatch bg="rgba(251,191,36,0.4)" label="On Hold" />
            <LegendSwatch bg="rgba(185,28,28,0.3)" label="Canceled" />
          </div>
        </div>

        {/* ── Filters ─────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/95 backdrop-blur">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5 items-end">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Appointment Setter</div>
              <select className="w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" value={setterFilter} onChange={(e) => setSetterFilter(e.target.value)}>
                <option value="">All</option>
                {options.setters.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</div>
              <select className="w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                {options.statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Start Date</div>
              <input type="date" className="w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">End Date</div>
              <input type="date" className="w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-3.5">
            <button className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition" onClick={load}>Apply Filters</button>
            <button
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition"
              onClick={() => {
                setSetterFilter("");
                setStatusFilter("");
                setStartDate("2024-07-01");
                setEndDate("2027-12-31");
              }}
            >
              Reset
            </button>
            <div className="ml-auto text-[10px] text-slate-400 max-w-[480px] leading-snug">
              Commissions apply when Setter exists &amp; status ∈ Pending / P2 Ready / Partial P2 Paid / P2 Paid.
              Cutoff 03/31/25: $50 setter. From 04/01/25: $100 setter / $25 manager.
            </div>
          </div>

          {msg && (
            <div className="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">
              {msg}
            </div>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1440px] border-collapse">
            <thead>
              <tr>
                {COLS.map((h) => (
                  <th key={h} className="px-3 py-2 whitespace-nowrap text-xs font-semibold text-slate-700 uppercase tracking-wider border-b-2 border-slate-200 text-left bg-white/95 backdrop-blur sticky top-0 z-10">{h}</th>
                ))}
              </tr>

              {/* Totals row */}
              <tr>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800" colSpan={8}>
                  <span className="tracking-wider uppercase text-[10px]">Totals</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800">{money(totals.totalPaySetter)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800" />
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800">{money(totals.totalPayMgr)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800" />
                <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-white bg-slate-800">{money(totals.totalSubtotal)}</td>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="text-center py-8 text-slate-400 text-xs" colSpan={13}>
                    <span className="inline-flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Loading…
                    </span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td className="text-center py-8 text-slate-400 text-xs" colSpan={13}>
                    No results found.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => {
                  const rs = getRowStyle(r.status, r.paidSetterDate, r.paidMgrDate);
                  const showSetterPaidDate = r.commissionApplicable ? formatDateMMDDYY(r.paidSetterDate) : "";
                  const showMgrPaidDate = r.commissionApplicable ? formatDateMMDDYY(r.paidMgrDate) : "";

                  const rowTd = (extra?: React.CSSProperties): React.CSSProperties => ({
                    padding: "10px 14px",
                    whiteSpace: "nowrap",
                    fontSize: "0.78rem",
                    color: rs.text,
                    background: rs.bg,
                    borderBottom: rs.border !== "transparent" ? `1px solid ${rs.border}` : "1px solid #f1f5f9",
                    ...extra,
                  });

                  return (
                    <tr key={r.id} className="transition-colors">
                      <td style={rowTd()}>{r.company ?? ""}</td>
                      <td style={rowTd()}>{r.customer_name ?? ""}</td>
                      <td style={rowTd()}><StatusBadge status={r.status} /></td>
                      <td style={rowTd()}>{r.sales_rep ?? ""}</td>
                      <td style={rowTd({ fontVariantNumeric: "tabular-nums" })}>{num(r.kw_system, 2)}</td>
                      <td style={rowTd({ fontVariantNumeric: "tabular-nums" })}>{num(r.net_price_per_watt, 2)}</td>
                      <td style={rowTd({ fontVariantNumeric: "tabular-nums" })}>{formatDateMMDDYY(r.date_closed)}</td>
                      <td style={rowTd()}>{r.call_center_appointment_setter ?? ""}</td>
                      <td style={rowTd({ fontWeight: 600, fontVariantNumeric: "tabular-nums" })}>{r.paySetter ? money(r.paySetter) : ""}</td>
                      <td style={rowTd({ fontVariantNumeric: "tabular-nums" })}>{showSetterPaidDate}</td>
                      <td style={rowTd({ fontWeight: 600, fontVariantNumeric: "tabular-nums" })}>{r.payMgr ? money(r.payMgr) : ""}</td>
                      <td style={rowTd({ fontVariantNumeric: "tabular-nums" })}>{showMgrPaidDate}</td>
                      <td style={rowTd({ fontWeight: 700, fontVariantNumeric: "tabular-nums" })}>{r.subtotal ? money(r.subtotal) : ""}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
          <span className="text-[11px] text-slate-400">
            {displayRows.length} record{displayRows.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-3.5">
            <LegendSwatch bg="#ffffff" label="Unpaid" />
            <LegendSwatch bg="rgba(74,222,128,0.35)" label="Partial" />
            <LegendSwatch bg="rgba(22,163,74,0.45)" label="Paid" />
            <LegendSwatch bg="rgba(251,191,36,0.4)" label="On Hold" />
            <LegendSwatch bg="rgba(185,28,28,0.3)" label="Canceled" />
          </div>
        </div>
      </div>
    </div>
  );
}
