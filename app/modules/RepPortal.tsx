"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";

/* ═══════════════════════════════════════════════════════════
   REP PORTAL — Sales Rep Portal
   View deals with milestone tracking, progress, and details.
   Filter by sales rep, appointment setter, company, date range.
   ═══════════════════════════════════════════════════════════ */

const PORTAL_HEADER_PX = 64;

/* ─── Types ─── */

type DealRow = {
  id: string;
  date_closed: string | null;
  customer_name: string | null;
  sales_rep: string | null;
  company: string | null;
  appointment_setter: string | null;
  call_center_appointment_setter: string | null;
  kw_system: number | null;
  net_price_per_watt: number | null;
  contract_value: number | null;
  total_adders: number | null;
  contract_net_price: number | null;
  agent_payout: number | null;
  status: string | null;
  // Stage milestone dates (from deals_view which joins deal_stages)
  site_survey_date_completed: string | null;
  design_ready_date: string | null;
  permit_submitted_date: string | null;
  permit_approved_date: string | null;
  install_1_racks_date: string | null;
  install_2_panel_landed_date: string | null;
  pto_date: string | null;
  paid_date: string | null;
};

type ColDef = {
  label: string;
  key: keyof DealRow;
  type: "text" | "money" | "num" | "date";
  hideInTable?: boolean;
};

const COLUMNS: ColDef[] = [
  { label: "Customer Name", key: "customer_name", type: "text" },
  { label: "Sales Rep", key: "sales_rep", type: "text" },
  { label: "Company", key: "company", type: "text" },
  { label: "Status", key: "status", type: "text" },
  { label: "kW System", key: "kw_system", type: "num" },
  { label: "Contract Value", key: "contract_value", type: "money" },
  { label: "Net $/W", key: "net_price_per_watt", type: "num" },
  { label: "Agent Payout", key: "agent_payout", type: "money" },
  { label: "Date Closed", key: "date_closed", type: "date" },
  { label: "Appt Setter", key: "appointment_setter", type: "text" },
  { label: "CC Setter", key: "call_center_appointment_setter", type: "text" },
  { label: "Total Adders", key: "total_adders", type: "money", hideInTable: true },
  { label: "Contract Net", key: "contract_net_price", type: "money", hideInTable: true },
];

const TABLE_COLUMNS = COLUMNS.filter((c) => !c.hideInTable);

const SELECT_FIELDS = [
  "id", "date_closed", "customer_name", "sales_rep", "company",
  "appointment_setter", "call_center_appointment_setter",
  "kw_system", "net_price_per_watt", "contract_value",
  "total_adders", "contract_net_price", "agent_payout", "status",
  "site_survey_date_completed", "design_ready_date",
  "permit_submitted_date", "permit_approved_date",
  "install_1_racks_date", "install_2_panel_landed_date",
  "pto_date", "paid_date",
].join(",");

/* ─── Milestone Definitions ─── */

type MilestoneKey =
  | "site_survey_date_completed"
  | "design_ready_date"
  | "permit_submitted_date"
  | "permit_approved_date"
  | "install_1_racks_date"
  | "install_2_panel_landed_date"
  | "pto_date"
  | "paid_date";

const MILESTONES: { key: MilestoneKey; label: string; short: string }[] = [
  { key: "site_survey_date_completed", label: "Site Survey Completed", short: "Survey" },
  { key: "design_ready_date", label: "Design Ready", short: "Design" },
  { key: "permit_submitted_date", label: "Permit Submitted", short: "Perm Sub" },
  { key: "permit_approved_date", label: "Permit Approved", short: "Perm App" },
  { key: "install_1_racks_date", label: "Install 1 (Racks)", short: "Racks" },
  { key: "install_2_panel_landed_date", label: "Install 2 (Panels)", short: "Panels" },
  { key: "pto_date", label: "PTO", short: "PTO" },
  { key: "paid_date", label: "Paid", short: "Paid" },
];

const INACTIVE_STATUSES = ["Cancelled", "Canceled", "Lost", "Rejected", "Duplicate"];
const DEFAULT_START = "2024-08-01";

/* ─── Helpers ─── */

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
function cellVal(row: DealRow, col: ColDef): string {
  const v = row[col.key];
  if (v == null) return "";
  if (col.type === "money") return money(v as number);
  if (col.type === "num") return numFmt(v as number);
  if (col.type === "date") return fmtDate(v as string);
  return String(v);
}

function getProgress(row: DealRow): { completed: number; total: number; pct: number; current: string } {
  let completed = 0;
  let current = "Not Started";
  for (const m of MILESTONES) {
    if (row[m.key]) {
      completed++;
      current = m.short;
    }
  }
  return { completed, total: 8, pct: Math.round((completed / 8) * 100), current };
}

function statusColor(s: string | null): string {
  const st = (s ?? "").toLowerCase();
  if (st.includes("cancel")) return "bg-red-100 text-red-700";
  if (st.includes("p2 paid") || st.includes("complete")) return "bg-emerald-100 text-emerald-700";
  if (st.includes("p2 ready")) return "bg-green-100 text-green-700";
  if (st.includes("partial")) return "bg-lime-100 text-lime-700";
  if (st.includes("pending")) return "bg-blue-100 text-blue-700";
  if (st.includes("hold")) return "bg-yellow-100 text-yellow-700";
  if (st.includes("issue")) return "bg-orange-100 text-orange-700";
  return "bg-slate-100 text-slate-600";
}

function progressColor(pct: number): string {
  if (pct >= 88) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  if (pct >= 25) return "text-orange-500";
  return "text-slate-400";
}

function progressBg(pct: number): string {
  if (pct >= 88) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  if (pct >= 25) return "bg-orange-400";
  return "bg-slate-300";
}

function uniqSorted(vals: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of vals) { const s = (v ?? "").trim(); if (s) set.add(s); }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

const UI = {
  card: "bg-white rounded-xl border border-slate-200/60 shadow-sm",
  control: "w-full rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200",
  buttonPrimary: "px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition",
  buttonGhost: "px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition",
  pill: "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-slate-200/70 bg-slate-50 text-slate-700",
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function RepPortal() {
  useEffect(() => {
    const pb = document.body.style.overflow;
    const ph = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => { document.body.style.overflow = pb; document.documentElement.style.overflow = ph; };
  }, []);

  const { user } = useAuth();

  /* ─── Agent identity resolution ─── */
  const [agentLoading, setAgentLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) { setAgentLoading(false); return; }
    supabase
      .from("portal_users")
      .select("linked_name")
      .eq("email", user.email)
      .single()
      .then(() => {
        setAgentLoading(false);
      });
  }, [user?.email]);

  /* ─── Stable filter options (loaded once, not affected by active filters) ─── */
  const [allOptions, setAllOptions] = useState<{
    salesReps: string[]; setters: string[]; companies: string[]; statuses: string[];
  }>({ salesReps: [], setters: [], companies: [], statuses: [] });

  useEffect(() => {
    supabase
      .from("deals_view")
      .select("sales_rep,appointment_setter,company,status")
      .gte("date_closed", DEFAULT_START)
      .limit(5000)
      .then(({ data }) => {
        if (!data) return;
        setAllOptions({
          salesReps: uniqSorted(data.map((r: Record<string, unknown>) => r.sales_rep as string)),
          setters: uniqSorted(data.map((r: Record<string, unknown>) => r.appointment_setter as string)),
          companies: uniqSorted(data.map((r: Record<string, unknown>) => r.company as string)),
          statuses: uniqSorted(data.map((r: Record<string, unknown>) => r.status as string)),
        });
      });
  }, []);

  /* ─── Data state ─── */
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  /* ─── Filters ─── */
  const [customerQ, setCustomerQ] = useState("");
  const [salesReps, setSalesReps] = useState<string[]>([]);
  const [setters, setSetters] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState("");

  /* NOTE: removed auto pre-fill of Sales Rep filter – users pick their own filters */

  /* ─── Sort ─── */
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* ─── Drawer ─── */
  const [drawerRow, setDrawerRow] = useState<DealRow | null>(null);

  /* ─── Debounce ─── */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── Load deals ─── */
  const load = useCallback(async () => {
    setLoading(true); setMsg(null);

    let q = supabase
      .from("deals_view")
      .select(SELECT_FIELDS)
      .gte("date_closed", startDate || DEFAULT_START)
      .order("date_closed", { ascending: false })
      .limit(5000);

    if (endDate) q = q.lte("date_closed", endDate);
    if (customerQ.trim()) q = q.ilike("customer_name", `%${customerQ.trim()}%`);
    if (salesReps.length) q = q.in("sales_rep", salesReps);
    if (setters.length) q = q.in("appointment_setter", setters);
    if (companies.length) q = q.in("company", companies);
    if (statuses.length) q = q.in("status", statuses);

    const { data, error } = await q;
    if (error) { setRows([]); setMsg(`Error: ${error.message}`); }
    else setRows((data ?? []) as unknown as DealRow[]);
    setLoading(false);
  }, [startDate, endDate, customerQ, salesReps, setters, companies, statuses]);

  useEffect(() => {
    if (agentLoading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load, agentLoading]);

  /* ─── Filter out inactive deals by default ─── */
  const activeRows = useMemo(() => {
    if (statuses.length) return rows; // if user explicitly picks statuses, show them
    return rows.filter((r) => !INACTIVE_STATUSES.includes((r.status ?? "").trim()));
  }, [rows, statuses]);

  /* ─── Options from stable one-time fetch (not affected by filters) ─── */
  const filterOptions = allOptions;

  /* ─── Sort ─── */
  function handleSort(idx: number) {
    if (sortCol === idx) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(idx); setSortDir("desc"); }
  }

  const sortedRows = useMemo(() => {
    const base = activeRows;
    if (sortCol === null) return base;
    const col = TABLE_COLUMNS[sortCol];
    if (!col) return base;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const av = a[col.key]; const bv = b[col.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [activeRows, sortCol, sortDir]);

  /* ─── Summary Stats ─── */
  const stats = useMemo(() => {
    const arr = activeRows;
    const totalContract = arr.reduce((s, r) => s + (r.contract_value ?? 0), 0);
    const totalPayout = arr.reduce((s, r) => s + (r.agent_payout ?? 0), 0);
    const totalKw = arr.reduce((s, r) => s + (r.kw_system ?? 0), 0);
    const avgProgress = arr.length
      ? Math.round(arr.reduce((s, r) => s + getProgress(r).pct, 0) / arr.length)
      : 0;
    return { count: arr.length, totalContract, totalPayout, totalKw, avgProgress };
  }, [activeRows]);

  function clearAll() {
    setSalesReps([]);
    setSetters([]);
    setCompanies([]);
    setStatuses([]);
    setCustomerQ("");
    setStartDate(DEFAULT_START);
    setEndDate("");
  }

  const containerStyle: React.CSSProperties = {
    height: `calc(100dvh - ${PORTAL_HEADER_PX}px)`,
    maxHeight: `calc(100dvh - ${PORTAL_HEADER_PX}px)`,
  };

  return (
    <div className="min-h-0 flex flex-col overflow-hidden bg-slate-50 p-4" style={containerStyle}>
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">

        {/* ══ Sticky Header + Filters ══ */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/60">
          <div className="p-4 space-y-3">

            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 tracking-tight">Sales Rep Portal</h2>
                  <p className="text-xs text-slate-400">
                    Deal tracking with milestones · Filters auto-apply as you type
                  </p>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className={UI.pill}>{loading ? "Loading…" : `${activeRows.length} deals`}</span>
                <button className={UI.buttonGhost} onClick={load}>Refresh</button>
                <button className={UI.buttonGhost} onClick={clearAll}>Clear Filters</button>
              </div>
            </div>

            {msg && <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 text-amber-900 px-3 py-2 text-xs">{msg}</div>}

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Active Deals" value={String(stats.count)} />
              <StatCard label="Total Contract" value={money(stats.totalContract)} />
              <StatCard label="Total Payout" value={money(stats.totalPayout)} accent />
              <StatCard label="Total kW" value={numFmt(stats.totalKw, 1)} />
              <StatCard label="Avg Progress" value={`${stats.avgProgress}%`} />
            </div>

            {/* Filters */}
            <div className={`${UI.card} p-3`}>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Customer Name</div>
                  <input className={UI.control} value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder="Search…" />
                </div>
                <MultiSelect label="Sales Rep" options={filterOptions.salesReps} selected={salesReps} onChange={setSalesReps} />
                <MultiSelect label="Appt Setter" options={filterOptions.setters} selected={setters} onChange={setSetters} />
                <MultiSelect label="Company" options={filterOptions.companies} selected={companies} onChange={setCompanies} />
                <MultiSelect label="Status" options={filterOptions.statuses} selected={statuses} onChange={setStatuses} placeholder="All Active" />
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Start Date</div>
                  <input type="date" className={UI.control} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">End Date</div>
                  <input type="date" className={UI.control} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ Table ══ */}
        <div className="flex-1 min-h-0">
          <div className="h-full overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200/60">
                <tr className="text-left text-slate-700">
                  {TABLE_COLUMNS.map((col, i) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(i)}
                      className={`px-2.5 py-2.5 whitespace-nowrap border-r border-slate-200/60 font-semibold cursor-pointer select-none hover:bg-slate-100/80 transition-colors ${
                        col.type === "money" || col.type === "num" ? "text-right" : ""
                      } ${i === TABLE_COLUMNS.length - 1 ? "border-r-0" : ""}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortCol === i ? (
                          <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-[10px] text-slate-300">⇅</span>
                        )}
                      </span>
                    </th>
                  ))}
                  {/* Progress column */}
                  <th className="px-2.5 py-2.5 whitespace-nowrap border-r border-slate-200/60 font-semibold text-center">
                    Progress
                  </th>
                  {/* Milestones column */}
                  <th className="px-2.5 py-2.5 whitespace-nowrap font-semibold text-center">
                    Milestones
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading || agentLoading ? (
                  <tr>
                    <td className="px-3 py-8 text-slate-400 text-center" colSpan={TABLE_COLUMNS.length + 2}>
                      Loading deals…
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-slate-400 text-center" colSpan={TABLE_COLUMNS.length + 2}>
                      No deals found.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => {
                    const prog = getProgress(r);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setDrawerRow(r)}
                        className={`border-b border-slate-200/40 hover:bg-indigo-50/40 cursor-pointer transition-colors ${
                          drawerRow?.id === r.id ? "bg-indigo-50/60" : ""
                        }`}
                      >
                        {TABLE_COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className={`px-2.5 py-2 whitespace-nowrap border-r border-slate-200/40 ${
                              col.type === "money" || col.type === "num" ? "text-right tabular-nums" : ""
                            }`}
                          >
                            {col.key === "status" ? (
                              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusColor(r.status)}`}>
                                {r.status ?? ""}
                              </span>
                            ) : col.key === "agent_payout" ? (
                              <span className="font-semibold text-emerald-700">{cellVal(r, col)}</span>
                            ) : (
                              cellVal(r, col)
                            )}
                          </td>
                        ))}

                        {/* Progress cell */}
                        <td className="px-2.5 py-2 border-r border-slate-200/40 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <div className={`h-full rounded-full ${progressBg(prog.pct)} transition-all`} style={{ width: `${prog.pct}%` }} />
                            </div>
                            <span className={`text-[10px] font-bold tabular-nums ${progressColor(prog.pct)}`}>
                              {prog.pct}%
                            </span>
                          </div>
                        </td>

                        {/* Milestone dots */}
                        <td className="px-2.5 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {MILESTONES.map((m) => (
                              <div
                                key={m.key}
                                title={`${m.label}: ${r[m.key] ? fmtDate(r[m.key]) : "Pending"}`}
                                className={`w-2 h-2 rounded-full transition-colors ${
                                  r[m.key] ? "bg-emerald-500" : "bg-slate-200"
                                }`}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══ Detail Drawer ══ */}
      {drawerRow && (
        <DealDrawer deal={drawerRow} onClose={() => setDrawerRow(null)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════ */

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-bold mt-0.5 tabular-nums ${accent ? "text-emerald-700" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MULTI SELECT  (same pattern as Sales / SPP)
   ═══════════════════════════════════════════════════════════ */

function MultiSelect({ label, options, selected, onChange, placeholder }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.toLowerCase().includes(t)) : options;
  }, [options, q]);

  const selSet = useMemo(() => new Set(selected), [selected]);

  function toggle(v: string) {
    const next = selSet.has(v) ? selected.filter((x) => x !== v) : [...selected, v];
    next.sort((a, b) => a.localeCompare(b));
    onChange(next);
  }

  const text = selected.length === 0 ? (placeholder ?? "All") : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div ref={ref}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="relative">
        <button type="button" className={`w-full ${UI.control} text-left flex items-center justify-between gap-2`} onClick={() => setOpen((s) => !s)}>
          <span className={`truncate ${selected.length === 0 ? "text-slate-400" : "text-slate-900"}`}>{text}</span>
          <span className="text-slate-400 text-[10px]">▾</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200/70 bg-white shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-200/60">
              <input className={UI.control} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
                <button type="button" className="text-[10px] font-semibold text-slate-600 hover:text-slate-900" onClick={() => onChange([])}>Clear</button>
              </div>
            </div>
            <div className="max-h-56 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-400">No matches.</div>
              ) : (
                filtered.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer select-none">
                    <input type="checkbox" checked={selSet.has(opt)} onChange={() => toggle(opt)} />
                    <span className="truncate">{opt}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DEAL DRAWER — right-side detail panel with timeline
   ═══════════════════════════════════════════════════════════ */

function DealDrawer({ deal, onClose }: { deal: DealRow; onClose: () => void }) {
  const prog = getProgress(deal);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-800 truncate">{deal.customer_name ?? "Untitled"}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {deal.company ?? "No company"} · {deal.sales_rep ?? "No rep"} · Closed {fmtDate(deal.date_closed)}
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 text-lg flex-shrink-0 ml-3" onClick={onClose}>✕</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Progress bar */}
          <div className="rounded-lg border border-slate-200/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Progress</span>
              <span className={`text-xs font-bold ${progressColor(prog.pct)}`}>{prog.completed}/{prog.total} — {prog.pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${progressBg(prog.pct)}`} style={{ width: `${prog.pct}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5">Current stage: <span className="font-medium text-slate-600">{prog.current}</span></div>
          </div>

          {/* Deal info grid */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Deal Information</div>
            <div className="grid grid-cols-2 gap-2">
              {COLUMNS.map((col) => {
                const v = deal[col.key];
                const display = v == null ? "—" : col.type === "money" ? money(v as number) : col.type === "num" ? numFmt(v as number) : col.type === "date" ? fmtDate(v as string) : String(v);
                return (
                  <div key={col.key} className="rounded-lg border border-slate-100 px-2.5 py-2">
                    <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{col.label}</div>
                    <div className={`text-xs font-medium mt-0.5 ${
                      col.key === "agent_payout" ? "text-emerald-700" :
                      col.key === "status" ? "" : "text-slate-800"
                    }`}>
                      {col.key === "status" ? (
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusColor(deal.status)}`}>
                          {deal.status ?? "—"}
                        </span>
                      ) : display}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Milestone Timeline */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Milestone Timeline</div>
            <div className="space-y-0">
              {MILESTONES.map((m, idx) => {
                const dateVal = deal[m.key];
                const completed = !!dateVal;
                const isLast = idx === MILESTONES.length - 1;
                return (
                  <div key={m.key} className="flex gap-3">
                    {/* Track */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                        completed ? "bg-emerald-500 border-emerald-500" : "bg-white border-slate-300"
                      }`} />
                      {!isLast && (
                        <div className={`w-0.5 flex-1 min-h-[24px] ${completed ? "bg-emerald-300" : "bg-slate-200"}`} />
                      )}
                    </div>
                    {/* Label */}
                    <div className="pb-3">
                      <div className={`text-xs font-medium ${completed ? "text-slate-800" : "text-slate-400"}`}>
                        {m.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {dateVal ? fmtDate(dateVal) : "Pending"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 200ms ease-out;
        }
      `}</style>
    </>
  );
}
