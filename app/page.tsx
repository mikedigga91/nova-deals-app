"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DealRow = {
  id: string;
  created_at: string;

  sales_rep: string | null;
  company: string | null;
  customer_name: string | null;

  appointment_setter: string | null;
  call_center_appointment_setter: string | null;

  kw_system: number | null;
  agent_cost_basis: number | null;
  agent_cost_basis_sold_at: number | null;
  net_price_per_watt: number | null;

  date_closed: string | null;
  contract_value: number | null;
  total_adders: number | null;
  contract_net_price: number | null;

  revenue: number | null;
  gross_profit: number | null;

  status: string | null;
  state: string | null;
  teams: string | null;
  month_year: string | null;
  commission_structure: string | null;

  install_partner: string | null;
  notes: string | null;

  activated: string | null;
  online_deal: string | null;
  call_center_lead: string | null;

  nova_nrg_rev_after_fee_amount: number | null;
  visionary_rev_after_fee_amount: number | null;
  agent_rev_after_fee_amount: number | null;
  gp_percent: number | null;
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function pct(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return `${(n * 100).toFixed(2)}%`;
}

export default function DealsPage() {
  const [rows, setRows] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [ccSetterFilter, setCcSetterFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Add Deal modal
  const [openAdd, setOpenAdd] = useState(false);
  const [salesRepNew, setSalesRepNew] = useState("");
  const [companyNew, setCompanyNew] = useState("");
  const [customerNameNew, setCustomerNameNew] = useState("");
  const [dateClosedNew, setDateClosedNew] = useState(""); // YYYY-MM-DD
  const [kwSystemNew, setKwSystemNew] = useState("");
  const [npwNew, setNpwNew] = useState("");
  const [contractValueNew, setContractValueNew] = useState("");
  const [statusNew, setStatusNew] = useState("");
  const [notesNew, setNotesNew] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);

    let q = supabase
      .from("deals_view")
      .select("*")
      .order("date_closed", { ascending: false })
      .limit(1000);

    if (startDate) q = q.gte("date_closed", startDate);
    if (endDate) q = q.lte("date_closed", endDate);

    if (salesRepFilter) q = q.ilike("sales_rep", `%${salesRepFilter}%`);
    if (ccSetterFilter) q = q.ilike("call_center_appointment_setter", `%${ccSetterFilter}%`);
    if (companyFilter) q = q.ilike("company", `%${companyFilter}%`);
    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, error } = await q;

    if (error) {
      setMsg(`Load error: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as DealRow[]);
    }

    setLoading(false);
  }

  async function addDeal() {
    setMsg(null);

    const payload = {
      sales_rep: salesRepNew || null,
      company: companyNew || null,
      customer_name: customerNameNew || null,
      date_closed: dateClosedNew || null,
      kw_system: kwSystemNew ? Number(kwSystemNew) : null,
      net_price_per_watt: npwNew ? Number(npwNew) : null,
      contract_value: contractValueNew ? Number(contractValueNew) : null,
      status: statusNew || null,
      notes: notesNew || null,
    };

    const { error } = await supabase.from("deals").insert([payload]);

    if (error) {
      setMsg(`Insert error: ${error.message}`);
      return;
    }

    setOpenAdd(false);
    setSalesRepNew("");
    setCompanyNew("");
    setCustomerNameNew("");
    setDateClosedNew("");
    setKwSystemNew("");
    setNpwNew("");
    setContractValueNew("");
    setStatusNew("");
    setNotesNew("");

    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = useMemo(() => {
    const totalDeals = rows.length;
    const totalContract = rows.reduce((a, r) => a + (r.contract_value ?? 0), 0);
    const totalRev = rows.reduce((a, r) => a + (r.revenue ?? 0), 0);
    const totalGP = rows.reduce((a, r) => a + (r.gross_profit ?? 0), 0);
    return { totalDeals, totalContract, totalRev, totalGP };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deals</h1>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-lg border text-sm" onClick={() => setOpenAdd(true)}>
            Add Deal
          </button>
          <button className="px-3 py-2 rounded-lg bg-black text-white text-sm" onClick={() => load()}>
            Refresh
          </button>
        </div>
      </div>

      {msg && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi title="Deals" value={String(kpis.totalDeals)} />
        <Kpi title="Contract Value" value={money(kpis.totalContract)} />
        <Kpi title="Revenue" value={money(kpis.totalRev)} />
        <Kpi title="Gross Profit" value={money(kpis.totalGP)} />
      </div>

      <div className="flex flex-wrap gap-2 items-end bg-white border rounded-xl p-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Start Date</label>
          <input
            type="date"
            className="border rounded-lg px-2 py-1 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">End Date</label>
          <input
            type="date"
            className="border rounded-lg px-2 py-1 text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Sales Rep</label>
          <input
            className="border rounded-lg px-2 py-1 text-sm"
            value={salesRepFilter}
            onChange={(e) => setSalesRepFilter(e.target.value)}
            placeholder="Ace"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">CC Setter</label>
          <input
            className="border rounded-lg px-2 py-1 text-sm"
            value={ccSetterFilter}
            onChange={(e) => setCcSetterFilter(e.target.value)}
            placeholder="Loanny"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Company</label>
          <input
            className="border rounded-lg px-2 py-1 text-sm"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="Nova NRG"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Status</label>
          <input
            className="border rounded-lg px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            placeholder="Closed"
          />
        </div>

        <button className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm" onClick={() => load()}>
          Apply
        </button>

        <button
          className="px-3 py-2 rounded-lg border text-sm"
          onClick={() => {
            setStartDate("");
            setEndDate("");
            setSalesRepFilter("");
            setCcSetterFilter("");
            setCompanyFilter("");
            setStatusFilter("");
          }}
        >
          Clear
        </button>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left">
                {[
                  "Sales Rep",
                  "Company",
                  "Customer",
                  "Setter",
                  "CC Setter",
                  "kW",
                  "Net $/W",
                  "Date Closed",
                  "Contract Value",
                  "Revenue",
                  "Gross Profit",
                  "GP %",
                  "Status",
                  "State",
                  "Teams",
                  "Month/Year",
                  "Install Partner",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3" colSpan={17}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3" colSpan={17}>
                    No results.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{r.sales_rep ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.company ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.customer_name ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.appointment_setter ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.call_center_appointment_setter ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.kw_system ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.net_price_per_watt ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.date_closed ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{money(r.contract_value)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{money(r.revenue)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{money(r.gross_profit)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{pct(r.gp_percent)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.status ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.state ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.teams ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.month_year ?? ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.install_partner ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && <DealDrawer dealId={selectedId} onClose={() => setSelectedId(null)} />}

      {openAdd && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpenAdd(false)} />
          <div className="absolute left-1/2 top-1/2 w-[96%] max-w-[760px] -translate-x-1/2 -translate-y-1/2 bg-white shadow-xl border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Add Deal</div>
              <button className="text-sm px-2 py-1 border rounded-lg" onClick={() => setOpenAdd(false)}>
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-4">
              <TextField label="Sales Rep" value={salesRepNew} onChange={setSalesRepNew} />
              <TextField label="Company" value={companyNew} onChange={setCompanyNew} />
              <TextField label="Customer Name" value={customerNameNew} onChange={setCustomerNameNew} />

              <TextField label="Date Closed (YYYY-MM-DD)" value={dateClosedNew} onChange={setDateClosedNew} />
              <TextField label="KW System" value={kwSystemNew} onChange={setKwSystemNew} />
              <TextField label="Net Price Per Watt" value={npwNew} onChange={setNpwNew} />

              <TextField label="Contract Value" value={contractValueNew} onChange={setContractValueNew} />
              <TextField label="Status" value={statusNew} onChange={setStatusNew} />
              <TextField label="Notes" value={notesNew} onChange={setNotesNew} />
            </div>

            <div className="flex gap-2 pt-4">
              <button className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm" onClick={addDeal}>
                Save
              </button>
              <button className="px-3 py-2 rounded-lg border text-sm" onClick={() => setOpenAdd(false)}>
                Cancel
              </button>
            </div>

            <div className="text-xs text-gray-500 pt-3">
              Tip: Leave formula fields blank in CSV, triggers compute them automatically.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl bg-white p-4">
      <div className="text-xs text-gray-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-600">{label}</label>
      <input className="border rounded-lg px-2 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DealDrawer({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await supabase.from("deals_view").select("*").eq("id", dealId).single();
      setDeal((res.data ?? null) as DealRow | null);
      setLoading(false);
    })();
  }, [dealId]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full md:w-[560px] bg-white shadow-xl border-l p-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Deal Details</div>
          <button className="text-sm px-2 py-1 border rounded-lg" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-sm">Loading…</div>
        ) : !deal ? (
          <div className="py-6 text-sm">Not found.</div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="border rounded-xl p-3">
              <div className="text-xs text-gray-600">Deal ID</div>
              <div className="text-sm break-all">{deal.id}</div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <Info label="Customer" value={deal.customer_name ?? ""} />
                <Info label="Sales Rep" value={deal.sales_rep ?? ""} />
                <Info label="Company" value={deal.company ?? ""} />
                <Info label="Date Closed" value={deal.date_closed ?? ""} />
                <Info label="Status" value={deal.status ?? ""} />
                <Info label="State / Teams" value={`${deal.state ?? ""} ${deal.teams ?? ""}`.trim()} />
              </div>
            </div>

            <div className="border rounded-xl p-3">
              <div className="font-semibold text-sm mb-2">Money</div>
              <div className="grid grid-cols-2 gap-3">
                <Info label="Contract Value" value={money(deal.contract_value)} />
                <Info label="Revenue" value={money(deal.revenue)} />
                <Info label="Gross Profit" value={money(deal.gross_profit)} />
                <Info label="GP %" value={pct(deal.gp_percent)} />
              </div>
            </div>

            <div className="border rounded-xl p-3">
              <div className="font-semibold text-sm mb-2">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{deal.notes ?? ""}</div>
            </div>

            <div className="border rounded-xl p-3">
              <div className="font-semibold text-sm mb-2">Raw Payload</div>
              <pre className="text-xs bg-gray-50 border rounded-lg p-2 overflow-x-auto">
                {JSON.stringify(deal, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
