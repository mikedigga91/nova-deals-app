"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const COL = {
  id: "id",
  company: "company",
  customer_name: "customer_name",
  status: "status",
  activated: "activated",

  sale_date: "date_closed",
  site_survey: "site_survey_date_completed",
  design_submitted: "design_submitted_date",
  design_ready: "design_ready_date",
  permit_submitted: "permit_submitted_date",
  permit_approved: "permit_approved_date",
  install1: "install_1_racks_date",
  install2: "install_2_panel_landed_date",
  paid: "paid_date",
  pto: "pto_date",
} as const;

type DealRow = {
  id: string;

  company: string | null;
  customer_name: string | null;
  status: string | null;
  activated: string | null;

  date_closed: string | null;
  site_survey_date_completed: string | null;
  design_submitted_date?: string | null;

  design_ready_date?: string | null;
  permit_submitted_date?: string | null;
  permit_approved_date?: string | null;
  install_1_racks_date?: string | null;
  install_2_panel_landed_date?: string | null;
  paid_date?: string | null;
  pto_date?: string | null;

  [key: string]: any;
};

type StatOption =
  | "sale_to_stage_avg"
  | "stage_to_stage_avg"
  | "sale_to_stage_median"
  | "stage_to_stage_median"
  | "sale_to_stage_stddev"
  | "stage_to_stage_stddev";

type StatusFilterMode = "active_only" | "live_only" | "custom";
type AgingMode = "receivable" | "paid";

const STAT_OPTIONS: Array<{ key: StatOption; label: string }> = [
  { key: "sale_to_stage_avg", label: "Sale to Stage Average" },
  { key: "stage_to_stage_avg", label: "Stage to Stage Average" },
  { key: "sale_to_stage_median", label: "Sale to Stage Median" },
  { key: "stage_to_stage_median", label: "Stage to Stage Median" },
  { key: "sale_to_stage_stddev", label: "Sale to Stage Standard Deviation" },
  { key: "stage_to_stage_stddev", label: "Stage to Stage Standard Deviation" },
];

const ACTIVE_STATUSES = ["Pending", "P2 Ready", "Partial P2 Paid", "P2 Paid"] as const;
const LIVE_STATUSES = ["Pending", "P2 Ready", "Partial P2 Paid"] as const;

const AGING_BUCKETS = [
  { key: "<30", min: 0, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61-90", min: 61, max: 90 },
  { key: "91-120", min: 91, max: 120 },
  { key: "121-150", min: 121, max: 150 },
  { key: "151-180", min: 151, max: 180 },
  { key: ">180", min: 181, max: Infinity },
] as const;

function safeLower(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}
function statusNorm(s: string | null | undefined) {
  return (s ?? "").trim();
}
function isActivatedYes(activated: string | null | undefined) {
  return safeLower(activated) === "yes";
}

/**
 * UTC-safe date-only helpers (fixes "-1 day" bug)
 */
function ymdFromUTCDate(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnlyUTC(input: string | null | undefined): number | null {
  if (!input) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return null;
    return Date.UTC(y, mo - 1, d);
  }

  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function toISODateValue(input: string | null | undefined) {
  const ms = parseDateOnlyUTC(input);
  if (ms === null) return "";
  return ymdFromUTCDate(new Date(ms));
}

function normalizeInputDate(valueInput: string) {
  const v = (valueInput ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function utcTodayYMD() {
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return ymdFromUTCDate(new Date(ms));
}

function daysDiff(a: string | null | undefined, b: string | null | undefined) {
  const ma = parseDateOnlyUTC(a);
  const mb = parseDateOnlyUTC(b);
  if (ma === null || mb === null) return null;
  const diffMs = mb - ma;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function nonNeg(n: number | null) {
  if (n === null) return null;
  return n < 0 ? 0 : n;
}
function absOrNull(n: number | null) {
  if (n === null) return null;
  return Math.abs(n);
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}
function median(nums: number[]) {
  if (!nums.length) return null;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}
function stddevSample(nums: number[]) {
  if (nums.length < 2) return null;
  const m = avg(nums)!;
  const variance = nums.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (nums.length - 1);
  return Math.sqrt(variance);
}
function nfmt(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined) return "";
  const v = Number(n);
  if (Number.isNaN(v)) return "";
  return v.toFixed(d);
}

type Durations = {
  sale_to_ss: number | null;
  sale_to_design_submitted: number | null;
  sale_to_design_ready: number | null;
  sale_to_permit_submitted: number | null;
  sale_to_permit_approved: number | null;
  sale_to_install1: number | null;
  sale_to_install2: number | null;
  sale_to_paid: number | null;
  sale_to_pto: number | null;

  ss_to_design_submitted: number | null;
  design_submitted_to_design_ready: number | null;
  design_ready_to_permit_submitted: number | null;
  permit_submitted_to_permit_approved: number | null;
  permit_approved_to_install1: number | null;
  install1_to_install2: number | null;
  install2_to_paid: number | null;
  install2_to_pto: number | null;
};

function computeDurations(r: DealRow): Durations {
  const sale = r[COL.sale_date] as string | null;
  const ss = r[COL.site_survey] as string | null;
  const ds = r[COL.design_submitted] as string | null;
  const dr = r[COL.design_ready] as string | null;
  const ps = r[COL.permit_submitted] as string | null;
  const pa = r[COL.permit_approved] as string | null;
  const i1 = r[COL.install1] as string | null;
  const i2 = r[COL.install2] as string | null;
  const paid = r[COL.paid] as string | null;
  const pto = r[COL.pto] as string | null;

  const sale_to_ss = nonNeg(daysDiff(sale, ss));
  const sale_to_design_submitted = nonNeg(daysDiff(sale, ds));
  const sale_to_design_ready = nonNeg(daysDiff(sale, dr));
  const sale_to_permit_submitted = nonNeg(daysDiff(sale, ps));
  const sale_to_permit_approved = nonNeg(daysDiff(sale, pa));
  const sale_to_install1 = nonNeg(daysDiff(sale, i1));
  const sale_to_install2 = nonNeg(daysDiff(sale, i2));
  const sale_to_paid = nonNeg(daysDiff(sale, paid));
  const sale_to_pto = nonNeg(daysDiff(sale, pto));

  const ss_to_design_submitted = nonNeg(daysDiff(ss, ds));
  const design_submitted_to_design_ready = nonNeg(daysDiff(ds, dr));
  const design_ready_to_permit_submitted = nonNeg(daysDiff(dr, ps));
  const permit_submitted_to_permit_approved = nonNeg(daysDiff(ps, pa));
  const permit_approved_to_install1 = nonNeg(daysDiff(pa, i1));
  const install1_to_install2 = nonNeg(daysDiff(i1, i2));
  const install2_to_paid = nonNeg(daysDiff(i2, paid));
  const install2_to_pto = absOrNull(daysDiff(i2, pto));

  return {
    sale_to_ss,
    sale_to_design_submitted,
    sale_to_design_ready,
    sale_to_permit_submitted,
    sale_to_permit_approved,
    sale_to_install1,
    sale_to_install2,
    sale_to_paid,
    sale_to_pto,
    ss_to_design_submitted,
    design_submitted_to_design_ready,
    design_ready_to_permit_submitted,
    permit_submitted_to_permit_approved,
    permit_approved_to_install1,
    install1_to_install2,
    install2_to_paid,
    install2_to_pto,
  };
}

type StatRow = {
  label: string;
  count: number;
  values: Record<string, number | null>;
};

type AgingRow = {
  label: string;
  buckets: Record<string, number>;
  total: number;
};

const SALE_TO_STAGE_COLS: Array<{ key: keyof Durations; label: string }> = [
  { key: "sale_to_ss", label: "Sale to SS" },
  { key: "sale_to_design_submitted", label: "Sale to Design Submitted" },
  { key: "sale_to_design_ready", label: "Sale to Design Ready" },
  { key: "sale_to_permit_submitted", label: "Sale to Permit Submitted" },
  { key: "sale_to_permit_approved", label: "Sale to Permit Approved" },
  { key: "sale_to_install1", label: "Sale to Install 1" },
  { key: "sale_to_install2", label: "Sale to Install 2" },
  { key: "sale_to_paid", label: "Sale to Paid Date" },
  { key: "sale_to_pto", label: "Sale to PTO" },
];

const STAGE_TO_STAGE_COLS: Array<{ key: keyof Durations; label: string }> = [
  { key: "sale_to_ss", label: "Sale to SS" },
  { key: "ss_to_design_submitted", label: "SS to Design Submitted" },
  { key: "design_submitted_to_design_ready", label: "Design Submitted to Design Ready" },
  { key: "design_ready_to_permit_submitted", label: "Design Ready to Permit Submitted" },
  { key: "permit_submitted_to_permit_approved", label: "Permit Submitted to Permit Approved" },
  { key: "permit_approved_to_install1", label: "Permit Approved to Install 1" },
  { key: "install1_to_install2", label: "Install 1 to Install 2" },
  { key: "install2_to_paid", label: "Install 2 to Paid Date" },
  { key: "install2_to_pto", label: "Install 2 to PTO (ABS)" },
];

function computeStatValue(kind: "avg" | "median" | "stddev", nums: number[]) {
  if (!nums.length) return null;
  if (kind === "avg") return avg(nums);
  if (kind === "median") return median(nums);
  return stddevSample(nums);
}
function getStatKind(opt: StatOption): "avg" | "median" | "stddev" {
  if (opt.includes("median")) return "median";
  if (opt.includes("stddev")) return "stddev";
  return "avg";
}
function usesSaleToStage(opt: StatOption) {
  return opt.startsWith("sale_to_stage");
}

function matchStatus(r: DealRow, mode: StatusFilterMode, selected: string[]) {
  const st = statusNorm(r.status);
  const actYes = isActivatedYes(r.activated);

  if (mode === "active_only") return ACTIVE_STATUSES.includes(st as any);
  if (mode === "live_only") return LIVE_STATUSES.includes(st as any) && !actYes;

  if (!selected.length) return true;
  return selected.includes(st);
}

function isDealsField(fieldKey: string) {
  return fieldKey === COL.customer_name || fieldKey === COL.status || fieldKey === COL.activated || fieldKey === COL.sale_date || fieldKey === COL.site_survey;
}
function isStageField(fieldKey: string) {
  return (
    fieldKey === COL.design_submitted ||
    fieldKey === COL.design_ready ||
    fieldKey === COL.permit_submitted ||
    fieldKey === COL.permit_approved ||
    fieldKey === COL.install1 ||
    fieldKey === COL.install2 ||
    fieldKey === COL.paid ||
    fieldKey === COL.pto
  );
}

function bucketKeyForDays(days: number) {
  for (const b of AGING_BUCKETS) {
    if (days >= b.min && days <= b.max) return b.key;
  }
  return ">180";
}

type NewDealInput = {
  customer_name: string;
  status: string;
  activated: string;
  date_closed: string;
};

export default function SpeedPipeline() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [statOpt, setStatOpt] = useState<StatOption>("sale_to_stage_avg");
  const [nameFilter, setNameFilter] = useState("");
  const [startDate, setStartDate] = useState("2024-07-01");
  const [endDate, setEndDate] = useState("2027-12-31");

  const [statusMode, setStatusMode] = useState<StatusFilterMode>("active_only");
  const [customStatuses, setCustomStatuses] = useState<string[]>([...ACTIVE_STATUSES]);

  const [agingMode, setAgingMode] = useState<AgingMode>("receivable");
  const [chartsCollapsed, setChartsCollapsed] = useState(false);

  // Modal editor state
  const [editingRow, setEditingRow] = useState<DealRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);

  // Add record modal state
  const [adding, setAdding] = useState(false);
  const [newDeal, setNewDeal] = useState<NewDealInput>({
    customer_name: "",
    status: "Pending",
    activated: "",
    date_closed: "",
  });

  // Debounced auto-load
  const debounceRef = useRef<number | null>(null);
  function scheduleLoad() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      load();
    }, 350);
  }

  function openEditor(row: DealRow) {
    setEditingRow(row);
    setEditValues({
      status: row[COL.status] ?? "",
      sale_date: toISODateValue(row[COL.sale_date]),
      site_survey: toISODateValue(row[COL.site_survey]),
      design_submitted: toISODateValue(row[COL.design_submitted]),
      design_ready: toISODateValue(row[COL.design_ready]),
      permit_submitted: toISODateValue(row[COL.permit_submitted]),
      permit_approved: toISODateValue(row[COL.permit_approved]),
      install1: toISODateValue(row[COL.install1]),
      install2: toISODateValue(row[COL.install2]),
      paid: toISODateValue(row[COL.paid]),
      pto: toISODateValue(row[COL.pto]),
      activated: row[COL.activated] ?? "",
    });
  }

  function toggleCustomStatus(s: string) {
    setCustomStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    let q = supabase.from("deals_view").select("*").order("date_closed", { ascending: false }).limit(5000);

    if (startDate) q = q.gte(COL.sale_date, startDate);
    if (endDate) q = q.lte(COL.sale_date, endDate);
    if (nameFilter.trim()) q = q.ilike(COL.customer_name, `%${nameFilter.trim()}%`);

    const { data, error } = await q;

    if (error) {
      setRows([]);
      setMsg(`Load error: ${error.message}`);
    } else {
      setRows((data ?? []) as DealRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto refresh on filters (no need to click Apply)
  useEffect(() => {
    scheduleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFilter, startDate, endDate]);

  useEffect(() => {
    scheduleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusMode, customStatuses]);

  const allStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const s = statusNorm(r.status);
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (statusMode === "active_only") setCustomStatuses([...ACTIVE_STATUSES]);
    if (statusMode === "live_only") setCustomStatuses([...LIVE_STATUSES]);
  }, [statusMode]);

  const display = useMemo(() => {
    const filtered = rows.filter((r) => matchStatus(r, statusMode, customStatuses));
    return filtered.map((r) => ({ ...r, durations: computeDurations(r) }));
  }, [rows, statusMode, customStatuses]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const r of display) {
      const c = (r.company ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [display]);

  const summaryCols = useMemo(() => (usesSaleToStage(statOpt) ? SALE_TO_STAGE_COLS : STAGE_TO_STAGE_COLS), [statOpt]);
  const kind = useMemo(() => getStatKind(statOpt), [statOpt]);

  const statTable = useMemo(() => {
    const buildRow = (label: string, subset: typeof display) => {
      const values: Record<string, number | null> = {};
      for (const c of summaryCols) {
        const nums = subset
          .map((r) => r.durations[c.key])
          .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        values[c.key] = computeStatValue(kind, nums);
      }
      return { label, count: subset.length, values } as StatRow;
    };

    const overall = display;
    const activeOnly = display.filter((r) => ACTIVE_STATUSES.includes(statusNorm(r.status) as any));
    const liveOnly = display.filter(
      (r) => LIVE_STATUSES.includes(statusNorm(r.status) as any) && !isActivatedYes(r.activated)
    );

    const out: StatRow[] = [
      buildRow("OVERALL", overall),
      buildRow("ACTIVE ONLY", activeOnly),
      buildRow("LIVE ONLY", liveOnly),
    ];
    for (const comp of companies) out.push(buildRow(comp, display.filter((r) => (r.company ?? "").trim() === comp)));
    return out;
  }, [display, companies, summaryCols, kind]);

  const agingTable = useMemo(() => {
    const today = utcTodayYMD();

    const buildRow = (label: string, subset: typeof display): AgingRow => {
      const buckets: Record<string, number> = {};
      for (const b of AGING_BUCKETS) buckets[b.key] = 0;

      let total = 0;

      for (const r of subset) {
        const sale = r[COL.sale_date] as string | null;
        const paid = r[COL.paid] as string | null;

        if (!sale) continue;

        if (agingMode === "receivable") {
          if (paid) continue;
          const days = daysDiff(sale, today);
          if (days == null) continue;
          buckets[bucketKeyForDays(Math.max(0, days))] += 1;
          total += 1;
        } else {
          if (!paid) continue;
          const days = daysDiff(sale, paid);
          if (days == null) continue;
          buckets[bucketKeyForDays(Math.max(0, days))] += 1;
          total += 1;
        }
      }

      return { label, buckets, total };
    };

    const overall = display;
    const activeOnly = display.filter((r) => ACTIVE_STATUSES.includes(statusNorm(r.status) as any));
    const liveOnly = display.filter(
      (r) => LIVE_STATUSES.includes(statusNorm(r.status) as any) && !isActivatedYes(r.activated)
    );

    const out: AgingRow[] = [
      buildRow("OVERALL", overall),
      buildRow("ACTIVE ONLY", activeOnly),
      buildRow("LIVE ONLY", liveOnly),
    ];

    for (const comp of companies) {
      out.push(buildRow(comp, display.filter((r) => (r.company ?? "").trim() === comp)));
    }

    return out;
  }, [display, companies, agingMode]);

  async function updateField(rowId: string, fieldKey: string, valueInput: string): Promise<boolean> {
    const isDate = fieldKey === COL.sale_date || fieldKey === COL.site_survey || isStageField(fieldKey);
    const isText = fieldKey === COL.status || fieldKey === COL.activated;
    const value = isText ? (valueInput.trim() || null) : normalizeInputDate(valueInput);

    if (isDealsField(fieldKey)) {
      const payload: Record<string, any> = {};
      payload[fieldKey] = value;

      const { error } = await supabase.from("deals").update(payload).eq("id", rowId);

      if (error) {
        setMsg(`Update error (deals.${fieldKey}): ${error.message}`);
        return false;
      }

      setRows((prev) => prev.map((r) => (r.id === rowId ? ({ ...r, [fieldKey]: value } as DealRow) : r)));
      return true;
    }

    if (isStageField(fieldKey)) {
      const stagePayload: Record<string, any> = {};
      stagePayload[fieldKey] = value;

      const { data: upd, error: updErr } = await supabase
        .from("deal_stages")
        .update(stagePayload)
        .eq("deal_id", rowId)
        .select("deal_id");

      if (updErr) {
        setMsg(`Update error (deal_stages.${fieldKey}): ${updErr.message}`);
        return false;
      }

      if (!upd || upd.length === 0) {
        const insertPayload = { deal_id: rowId, ...stagePayload };
        const { error: insErr } = await supabase.from("deal_stages").insert(insertPayload);

        if (insErr) {
          setMsg(`Insert error (deal_stages.${fieldKey}): ${insErr.message}`);
          return false;
        }
      }

      setRows((prev) => prev.map((r) => (r.id === rowId ? ({ ...r, [fieldKey]: value } as DealRow) : r)));
      return true;
    }

    setMsg(`Unknown field: ${fieldKey}`);
    return false;
  }

  async function addRecord() {
    setMsg(null);

    const name = (newDeal.customer_name ?? "").trim();
    if (!name) {
      setMsg("Add Record: Customer Name is required.");
      return;
    }

    // Check if already exists (exact match)
    const { data: existing, error: exErr } = await supabase
      .from("deals")
      .select("id, customer_name")
      .eq("customer_name", name)
      .limit(1);

    if (exErr) {
      setMsg(`Add Record lookup error: ${exErr.message}`);
      return;
    }

    if (existing && existing.length > 0) {
      setAdding(false);
      await load();
      return;
    }

    const payload: Record<string, any> = {
      customer_name: name,
      status: (newDeal.status ?? "").trim() || null,
      activated: (newDeal.activated ?? "").trim() || null,
      date_closed: normalizeInputDate(newDeal.date_closed) ?? null,
    };

    const { error: insErr } = await supabase.from("deals").insert(payload);

    if (insErr) {
      setMsg(`Add Record insert error: ${insErr.message}`);
      return;
    }

    setAdding(false);
    setNewDeal({ customer_name: "", status: "Pending", activated: "", date_closed: "" });
    await load();
  }

  const STAGE_DATE_HEADERS = [
    "Sale Date",
    "SS Date",
    "Design Submitted Date",
    "Design Ready Date",
    "Permit Submitted Date",
    "Permit Approved Date",
    "Install 1 (Racks) Date",
    "Install 2 Panel Landed Date",
    "Paid Date",
    "PTO Date",
    "Activated",
  ];

  const SALE_TO_STAGE_HEADERS = [
    "Sale to SS",
    "Sale to Design Submitted",
    "Sale to Design Ready",
    "Sale to Permit Submitted",
    "Sale to Permit Approved",
    "Sale to Install 1",
    "Sale to Install 2",
    "Sale to Paid Date",
    "Sale to PTO",
  ];

  const STAGE_TO_STAGE_HEADERS = [
    "Sale to SS",
    "SS to Design Submitted",
    "Design Submitted to Design Ready",
    "Design Ready to Permit Submitted",
    "Permit Submitted to Permit Approved",
    "Permit Approved to Install 1",
    "Install 1 to Install 2",
    "Install 2 to Paid Date",
    "Install 2 to PTO (ABS)",
  ];

  return (
    <div className="p-4 flex flex-col gap-4" style={{ height: "calc(100dvh - 64px)" }}>
      {/* Header */}
      <div className="shrink-0 bg-white rounded-xl border border-slate-200/60 shadow-sm px-5 py-3.5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 flex items-center justify-center shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 tracking-tight">Speed</h2>
            <p className="text-xs text-slate-400">Pipeline speed tracking & stage-to-stage analytics</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Customer Name</label>
            <input
              className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Type customer..."
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">End Date</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col min-w-[220px]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status Filter</label>
            <select
              className="rounded-lg border border-slate-200/70 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={statusMode}
              onChange={(e) => setStatusMode(e.target.value as StatusFilterMode)}
            >
              <option value="active_only">Active Only (default)</option>
              <option value="live_only">Live Only (not Activated)</option>
              <option value="custom">Custom (choose)</option>
            </select>
          </div>

          <button className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition" onClick={load}>
            Apply
          </button>

          <button
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition"
            onClick={() => {
              setNameFilter("");
              setStartDate("2024-07-01");
              setEndDate("2027-12-31");
              setStatOpt("sale_to_stage_avg");
              setStatusMode("active_only");
              setCustomStatuses([...ACTIVE_STATUSES]);
            }}
          >
            Clear
          </button>

          <button
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition"
            onClick={() => setAdding(true)}
          >
            Add Record
          </button>
        </div>

        {statusMode === "custom" && (
          <div className="mt-3 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 mb-2">Select one or more statuses:</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {allStatuses.map((s) => (
                <label key={s} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={customStatuses.includes(s)} onChange={() => toggleCustomStatus(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {statusMode !== "custom" && (
          <div className="mt-2 text-[11px] text-slate-500">
            {statusMode === "active_only"
              ? "Active Only: Pending / P2 Ready / Partial P2 Paid / P2 Paid"
              : "Live Only: Pending / P2 Ready / Partial P2 Paid AND activated != YES"}
          </div>
        )}

        {msg && (
          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-xs">
            {msg}
          </div>
        )}
      </div>

      {/* Collapsible summary & timeline */}
      <div className="shrink-0 bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <button
          type="button"
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition"
          onClick={() => setChartsCollapsed(v => !v)}
        >
          <span className="text-sm font-semibold text-slate-700">Summary &amp; Timeline</span>
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            {chartsCollapsed ? "Show" : "Hide"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${chartsCollapsed ? "" : "rotate-180"}`}><polyline points="6 9 12 15 18 9" /></svg>
          </span>
        </button>
      </div>
      {!chartsCollapsed && (
      <div className="shrink-0 grid grid-cols-[1fr_10px_1fr] gap-0 items-start">
        {/* LEFT: Summary */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold whitespace-nowrap">Progress Summary</div>

              <select
                className="rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-200"
                value={statOpt}
                onChange={(e) => setStatOpt(e.target.value as StatOption)}
              >
                {STAT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[11px] text-slate-500 whitespace-nowrap">{STAT_OPTIONS.find((x) => x.key === statOpt)?.label}</div>
          </div>

          <div className="overflow-x-hidden overflow-y-auto max-h-[320px] thin-scroll">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: "170px" }} />
                {summaryCols.map((c) => (
                  <col key={c.key} style={{ width: "64px" }} />
                ))}
                <col style={{ width: "64px" }} />
              </colgroup>

              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-2 py-2 text-left border border-slate-300/40 sticky top-0 z-20 bg-slate-900">AVG / GROUP</th>

                  {summaryCols.map((c) => (
                    <th
                      key={c.key}
                      className="px-1 py-2 border border-slate-300/40 sticky top-0 z-20 bg-slate-900 text-center"
                    >
                      <div className="header-wrap">{c.label}</div>
                    </th>
                  ))}

                  <th className="px-1 py-2 border border-slate-300/40 sticky top-0 z-20 bg-slate-900 text-center">
                    <div className="header-wrap">Totals</div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {statTable.map((r) => (
                  <tr key={r.label} className="border border-slate-200">
                    <td className="px-2 py-2 border border-slate-200 font-semibold whitespace-nowrap">{r.label}</td>

                    {summaryCols.map((c) => (
                      <td key={c.key} className="px-1 py-2 border border-slate-200 text-center">
                        {r.values[c.key] == null ? "" : nfmt(r.values[c.key], 2)}
                      </td>
                    ))}

                    <td className="px-1 py-2 border border-slate-200 text-center font-semibold">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-200">
            Tip: The main sheet below has a clear divider between Sale→Stage and Stage→Stage.
          </div>
        </div>

        {/* Narrow divider */}
        <div className="h-full bg-gradient-to-b from-black/[0.02] to-black/[0.06] border-l border-r border-slate-200 rounded-sm" />

        {/* RIGHT: Payment Timeline */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold whitespace-nowrap">Payment Timeline</div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-600 whitespace-nowrap">Accounts</div>
              <select
                className="rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-200"
                value={agingMode}
                onChange={(e) => setAgingMode(e.target.value as AgingMode)}
              >
                <option value="receivable">Accounts Receivable</option>
                <option value="paid">Accounts Paid</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-hidden overflow-y-auto max-h-[320px] thin-scroll">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: "170px" }} />
                {AGING_BUCKETS.map((b) => (
                  <col key={b.key} style={{ width: "64px" }} />
                ))}
                <col style={{ width: "64px" }} />
              </colgroup>

              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-2 py-2 text-left border border-slate-300/40 sticky top-0 z-20 bg-slate-900">PAYMENT TIMELINE</th>

                  {AGING_BUCKETS.map((b) => (
                    <th
                      key={b.key}
                      className="px-1 py-2 border border-slate-300/40 sticky top-0 z-20 bg-slate-900 text-center"
                    >
                      <div className="header-wrap">{b.key}</div>
                    </th>
                  ))}

                  <th className="px-1 py-2 border border-slate-300/40 sticky top-0 z-20 bg-slate-900 text-center">
                    <div className="header-wrap">Totals</div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {agingTable.map((r) => (
                  <tr key={r.label} className="border border-slate-200">
                    <td className="px-2 py-2 border border-slate-200 font-semibold whitespace-nowrap">{r.label}</td>

                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className="px-1 py-2 border border-slate-200 text-center">
                        {r.buckets[b.key] || 0}
                      </td>
                    ))}

                    <td className="px-1 py-2 border border-slate-200 text-center font-semibold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-200">&nbsp;</div>
        </div>
      </div>
      )}

      {/* Main sheet */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-slate-200">
          <div className="text-sm font-semibold">Speed Data Sheet</div>
          <div className="text-[11px] text-slate-600">Dates are click-to-edit (modal); computed days update instantly.</div>
        </div>

        <div ref={sheetScrollRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto thin-scroll">
          <table className="min-w-[2460px] w-full text-xs table-fixed">
            <colgroup>
              <col style={{ width: "240px" }} />
              <col style={{ width: "120px" }} />

              {/* 11 stage columns: 10 dates + Activated */}
              {Array.from({ length: 11 }).map((_, i) => (
                <col key={`stage-${i}`} style={{ width: "112px" }} />
              ))}

              <col style={{ width: "10px" }} />

              {/* 9 sale->stage day columns (tight fit up to 5 digits) */}
              {Array.from({ length: 9 }).map((_, i) => (
                <col key={`s2s-${i}`} style={{ width: "72px" }} />
              ))}

              <col style={{ width: "10px" }} />

              {/* 9 stage->stage day columns */}
              {Array.from({ length: 9 }).map((_, i) => (
                <col key={`stg-${i}`} style={{ width: "72px" }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th className="group-head sticky top-0 z-30 bg-slate-50 border border-slate-200 text-center" colSpan={2}>
                  <div className="group-title">Record</div>
                </th>

                <th className="group-head sticky top-0 z-30 bg-slate-50 border border-slate-200 text-center" colSpan={11}>
                  <div className="group-title">Stages (Dates)</div>
                </th>

                <th className="divider-head sticky top-0 z-30" />

                <th className="group-head sticky top-0 z-30 bg-indigo-50 border border-slate-200 text-center" colSpan={9}>
                  <div className="group-title">Sale → Stage (Days)</div>
                </th>

                <th className="divider-head sticky top-0 z-30" />

                <th className="group-head sticky top-0 z-30 bg-emerald-50 border border-slate-200 text-center" colSpan={9}>
                  <div className="group-title">Stage → Stage (Days)</div>
                </th>
              </tr>

              <tr>
                {["Customer Name", "Status"].map((h) => (
                  <th
                    key={h}
                    className="col-head sticky top-[32px] z-20 bg-slate-900 text-white border border-slate-200 text-center"
                  >
                    <div className="header-wrap">{h}</div>
                  </th>
                ))}

                {STAGE_DATE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="col-head sticky top-[32px] z-20 bg-slate-900 text-white border border-slate-200 text-center"
                  >
                    <div className="header-wrap">{h}</div>
                  </th>
                ))}

                <th className="divider-col sticky top-[32px] z-20" />

                {SALE_TO_STAGE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="col-head sticky top-[32px] z-20 bg-slate-900 text-white border border-slate-200 text-center"
                  >
                    <div className="header-wrap">{h}</div>
                  </th>
                ))}

                <th className="divider-col sticky top-[32px] z-20" />

                {STAGE_TO_STAGE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="col-head sticky top-[32px] z-20 bg-slate-900 text-white border border-slate-200 text-center"
                  >
                    <div className="header-wrap">{h}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3" colSpan={2 + 11 + 1 + 9 + 1 + 9}>
                    Loading…
                  </td>
                </tr>
              ) : display.length === 0 ? (
                <tr>
                  <td className="px-3 py-3" colSpan={2 + 11 + 1 + 9 + 1 + 9}>
                    No results.
                  </td>
                </tr>
              ) : (
                display.map((r) => {
                  const d = r.durations as Durations;
                  return (
                    <tr key={r.id} className="row-hover">
                      <td className="px-2 py-2 border border-slate-200 text-left">{r.customer_name ?? ""}</td>
                      <td className="px-2 py-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-50" onClick={() => openEditor(r)}>{r.status ?? ""}</td>

                      <DateDisplayCell value={toISODateValue(r[COL.sale_date])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.site_survey])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.design_submitted])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.design_ready])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.permit_submitted])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.permit_approved])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.install1])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.install2])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.paid])} onClick={() => openEditor(r)} />
                      <DateDisplayCell value={toISODateValue(r[COL.pto])} onClick={() => openEditor(r)} />
                      <td className="px-2 py-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-50" onClick={() => openEditor(r)}>{r.activated ?? ""}</td>

                      <DividerCell />

                      <NumCell v={d.sale_to_ss} />
                      <NumCell v={d.sale_to_design_submitted} />
                      <NumCell v={d.sale_to_design_ready} />
                      <NumCell v={d.sale_to_permit_submitted} />
                      <NumCell v={d.sale_to_permit_approved} />
                      <NumCell v={d.sale_to_install1} />
                      <NumCell v={d.sale_to_install2} />
                      <NumCell v={d.sale_to_paid} />
                      <NumCell v={d.sale_to_pto} />

                      <DividerCell />

                      <NumCell v={d.sale_to_ss} />
                      <NumCell v={d.ss_to_design_submitted} />
                      <NumCell v={d.design_submitted_to_design_ready} />
                      <NumCell v={d.design_ready_to_permit_submitted} />
                      <NumCell v={d.permit_submitted_to_permit_approved} />
                      <NumCell v={d.permit_approved_to_install1} />
                      <NumCell v={d.install1_to_install2} />
                      <NumCell v={d.install2_to_paid} />
                      <NumCell v={d.install2_to_pto} />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 px-4 py-2 text-[11px] text-slate-500 border-t border-slate-200">
          Divider columns clearly separate "Sale → Stage" vs "Stage → Stage".
        </div>
      </div>

      {/* Edit modal */}
      {editingRow && (
        <EditModal
          row={editingRow}
          values={editValues}
          setValues={setEditValues}
          statusOptions={allStatuses}
          onCancel={() => setEditingRow(null)}
          onSave={async () => {
            setMsg(null);
            const scrollTop = sheetScrollRef.current?.scrollTop ?? 0;
            const scrollLeft = sheetScrollRef.current?.scrollLeft ?? 0;
            for (const key in editValues) {
              const colKey = key as keyof typeof COL;
              const ok = await updateField(editingRow.id, COL[colKey], editValues[key]);
              if (!ok) return;
            }
            setEditingRow(null);
            await load();
            requestAnimationFrame(() => {
              if (sheetScrollRef.current) {
                sheetScrollRef.current.scrollTop = scrollTop;
                sheetScrollRef.current.scrollLeft = scrollLeft;
              }
            });
          }}
        />
      )}

      {/* Add Record modal */}
      {adding && (
        <AddRecordModal
          values={newDeal}
          setValues={setNewDeal}
          onCancel={() => setAdding(false)}
          onSave={addRecord}
        />
      )}

      <style jsx global>{`
        .thin-scroll::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }
        .thin-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.25);
          border-radius: 999px;
        }
        .thin-scroll::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.06);
        }

        .header-wrap {
          white-space: normal;
          line-height: 1.15;
          text-align: center;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .group-head {
          height: 32px;
        }
        .group-title {
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #111827;
        }

        .col-head {
          height: 44px;
        }

        .row-hover:hover td {
          background: #f8faff;
        }

        .divider-col,
        .divider-head {
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.06));
          border-left: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0;
        }
      `}</style>
    </div>
  );
}

function DividerCell() {
  return <td className="divider-col" />;
}

function NumCell({ v }: { v: number | null }) {
  return <td className="px-1 py-2 border border-slate-200 text-center">{v == null ? "" : v}</td>;
}

function DateDisplayCell({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <td className="px-1 py-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-50" onClick={onClick}>
      {value || ""}
    </td>
  );
}

function EditModal({
  row,
  values,
  setValues,
  statusOptions,
  onCancel,
  onSave,
}: {
  row: DealRow;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  statusOptions: string[];
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">Edit – {row.customer_name}</div>

        <div className="space-y-2.5">
        {Object.entries(values).map(([key, val]) => {
          const label = key === "status" ? "Status" : key === "activated" ? "Activated" : key.replaceAll("_", " ");
          const inputCls = "flex-1 rounded-lg border border-slate-200/70 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200";
          if (key === "status") {
            return (
              <div key={key} className="flex items-center gap-3">
                <label className="w-[140px] shrink-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">{label}</label>
                <select value={val} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} className={inputCls}>
                  <option value="">— Select —</option>
                  {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            );
          }
          if (key === "activated") {
            return (
              <div key={key} className="flex items-center gap-3">
                <label className="w-[140px] shrink-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">{label}</label>
                <select value={val} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} className={inputCls}>
                  <option value="">—</option>
                  <option value="YES">YES</option>
                </select>
              </div>
            );
          }
          return (
            <div key={key} className="flex items-center gap-3">
              <label className="w-[140px] shrink-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">{label}</label>
              <input type="date" value={val} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} className={inputCls} />
            </div>
          );
        })}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={onCancel}>
            Cancel
          </button>
          <button className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition" onClick={onSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRecordModal({
  values,
  setValues,
  onCancel,
  onSave,
}: {
  values: NewDealInput;
  setValues: React.Dispatch<React.SetStateAction<NewDealInput>>;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="text-base font-semibold text-slate-900">Add Record</div>

        <div className="flex flex-col">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Customer Name</label>
          <input
            value={values.customer_name}
            onChange={(e) => setValues((p) => ({ ...p, customer_name: e.target.value }))}
            className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="Exact customer name"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Sale Date</label>
          <input
            type="date"
            value={values.date_closed}
            onChange={(e) => setValues((p) => ({ ...p, date_closed: e.target.value }))}
            className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
          <input
            value={values.status}
            onChange={(e) => setValues((p) => ({ ...p, status: e.target.value }))}
            className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="Pending / P2 Ready / etc"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Activated</label>
          <input
            value={values.activated}
            onChange={(e) => setValues((p) => ({ ...p, activated: e.target.value }))}
            className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="YES / NO (optional)"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition" onClick={onCancel}>
            Cancel
          </button>

          <button className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition" onClick={onSave}>
            Save Record
          </button>
        </div>
      </div>
    </div>
  );
}
