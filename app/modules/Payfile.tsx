"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ═══════════════════ TYPES ═══════════════════ */

type DealRow = {
  id: string;
  company: string | null;
  customer_name: string | null;
  sales_rep: string | null;
  appointment_setter: string | null;
  kw_system: number | null;
  agent_cost_basis: number | null;
  agent_cost_basis_sold_at: number | null;
  net_price_per_watt: number | null;
  date_closed: string | null;
  contract_value: number | null;
  total_adders: number | null;
  contract_net_price: number | null;
  rev: number | null;
  gross_profit: number | null;
  status: string | null;
  revenue: number | null;
  paid_nova_nrg_p2_rev_date: string | null;
  paid_nova_nrg_p1_p2_rev_amount: number | null;
  paid_nova_nrg_post_p2_date: string | null;
  paid_nova_nrg_post_p2_rev_amount: number | null;
  agent_pay: number | null;
  paid_agent_p2_date: string | null;
  paid_agent_p1_p2_amount: number | null;
  paid_agent_post_p2_date: string | null;
  paid_agent_post_p2_amount: number | null;
};

type PayfileEntry = {
  id?: string;
  deal_id: string;
  sales_rep: string | null;
  company: string | null;
  customer_name: string | null;
  appointment_setter: string | null;
  kw_system: number | null;
  agent_cost_basis: number | null;
  agent_cost_basis_sold_at: number | null;
  net_price_per_watt: number | null;
  date_closed: string | null;
  install_amount: number | null;
  bonus_amount: number | null;
  commission: number | null;
  credits_additions: number | null;
  advance_repayment: number | null;
  other_deductions: number | null;
  p1_paid_reversal: number | null;
  reversal_type: string | null;
  advance_remaining_balance: number | null;
  note: string | null;
  payment_type: string | null; // "p2" = full P2 (show all details), "post_p2" = remaining payment (hide deal details)
  rep_split_pct: number | null; // Rep gets this % of install_amount, setter gets the rest. Default 50 when setter exists.
};

/** Combined row: deal + its payfile entry (for the table display) */
type MergedRow = DealRow & { pf_install_amount: number | null };

/** For summary page: payfile entry + deal-level financial fields */
type SummaryRow = PayfileEntry & {
  contract_value: number | null;
  total_adders: number | null;
  contract_net_price: number | null;
  revenue: number | null;
  gross_profit: number | null;
  agent_paid_out_commission: number | null;
  paid_nova_nrg_p1_p2_rev_amount: number | null;
  paid_nova_nrg_post_p2_rev_amount: number | null;
};

const STATUSES = ["Pending","P2 Ready","Partial P2 Paid","P2 Paid","On Hold","Issue","Canceled"];

const DEAL_COLS = "id,company,customer_name,sales_rep,appointment_setter,kw_system,agent_cost_basis,agent_cost_basis_sold_at,net_price_per_watt,date_closed,contract_value,total_adders,contract_net_price,rev,gross_profit,status,revenue,paid_nova_nrg_p2_rev_date,paid_nova_nrg_p1_p2_rev_amount,paid_nova_nrg_post_p2_date,paid_nova_nrg_post_p2_rev_amount,agent_pay,paid_agent_p2_date,paid_agent_p1_p2_amount,paid_agent_post_p2_date,paid_agent_post_p2_amount";

/* ═══════════════════ HELPERS ═══════════════════ */

function money(n: number|null|undefined): string {
  if(n===null||n===undefined) return "";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n));
}
function moneyZ(n: number|null|undefined): string { return money(n??0); }
function nf(n: number|null|undefined,d=2): string {
  if(n===null||n===undefined) return "";
  const v=Number(n); return Number.isNaN(v)?"":v.toFixed(d);
}
function fd(iso: string|null|undefined): string {
  if(!iso) return "";
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}
function fds(iso: string|null|undefined): string {
  if(!iso) return "";
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return String(iso);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}
function tid(iso: string|null|undefined): string { if(!iso) return ""; return iso.substring(0,10); }
function s(v: unknown): string { if(v===null||v===undefined) return ""; return String(v); }
function pm(v: string): number|null {
  const r=v.replace(/[,$]/g,"").trim(); if(!r) return null;
  const n=Number(r); return Number.isNaN(n)?null:n;
}
function z(n: number|null|undefined): number { return n??0; }

/* ═══════════════════ PRINT CSS ═══════════════════ */

function injectPrint() {
  if(typeof document==="undefined") return;
  if(document.getElementById("pf-css")) return;
  const el=document.createElement("style"); el.id="pf-css";
  el.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap');
@media print {
  body * { visibility:hidden!important; }
  #pf-print,#pf-print * { visibility:visible!important; }
  #pf-print { position:absolute!important;left:0!important;top:0!important;width:100%!important;z-index:99999!important; }
  @page { size:landscape; margin:0.3in 0.25in; }
  .pf-sheet { page-break-after:always; margin-bottom:0!important; padding-bottom:0!important; border-bottom:none!important; }
  .pf-sheet:last-child { page-break-after:auto; }
  .no-print { display:none!important; }
  * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
}`;
  document.head.appendChild(el);
}

/* ═══════════════════ MAIN ═══════════════════ */

export default function Payfile() {
  const [tab,setTab]=useState<"deals"|"payfile">("deals");
  useEffect(()=>{injectPrint();},[]);
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="no-print px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Pay File</h2>
                <p className="text-xs text-slate-400">Manage deal payouts and generate commission sheets</p>
              </div>
            </div>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(["deals","payfile"] as const).map(t=>(
                <button key={t} onClick={()=>setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tab===t?"bg-white text-slate-900 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
                  {t==="deals"?"Deal Manager":"Generate Payfile"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {tab==="deals"?<DealManager />:<PayfileGenerator />}
      </div>
    </div>
  );
}

/* ═══════════════════ TAB 1: DEAL MANAGER ═══════════════════ */

function DealManager() {
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(false);
  const [allRows,setAllRows]=useState<MergedRow[]>([]);
  const [editDeal,setEditDeal]=useState<DealRow|null>(null);
  const [editPf,setEditPf]=useState<PayfileEntry|null>(null);
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState<string|null>(null);

  function showToast(m:string){setToast(m);setTimeout(()=>setToast(null),3500);}

  /* Load ALL deals on mount, then filter client-side */
  const loadAll=useCallback(async()=>{
    setLoading(true);

    const {data:deals,error}=await supabase.from("deals_view").select(DEAL_COLS)
      .order("date_closed",{ascending:false}).limit(500);
    if(error||!deals){showToast(error?.message??"Load error");setAllRows([]);setLoading(false);return;}

    // Fetch payfile entries for these deals to get install_amount
    const ids=deals.map((d:any)=>d.id);
    let pfMap=new Map<string,number|null>();
    if(ids.length>0){
      const {data:pfs}=await supabase.from("payfile_entries").select("deal_id,install_amount").in("deal_id",ids);
      if(pfs) pfs.forEach((p:any)=>pfMap.set(p.deal_id,p.install_amount));
    }

    const merged:MergedRow[]=deals.map((d:any)=>({...d,pf_install_amount:pfMap.get(d.id)??null}));
    setAllRows(merged);
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  /* Client-side filter by name, rep, company */
  const rows=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return allRows;
    return allRows.filter(r=>
      (r.customer_name?.toLowerCase().includes(q))||
      (r.sales_rep?.toLowerCase().includes(q))||
      (r.company?.toLowerCase().includes(q))||
      (r.appointment_setter?.toLowerCase().includes(q))
    );
  },[allRows,query]);

  /* Open deal: load full deal + payfile entry */
  async function openRow(row:MergedRow){
    const deal:DealRow={...row};
    setEditDeal(deal);

    const {data}=await supabase.from("payfile_entries").select("*").eq("deal_id",deal.id).maybeSingle();
    if(data){
      setEditPf(data as PayfileEntry);
    } else {
      setEditPf({
        deal_id:deal.id,sales_rep:deal.sales_rep,company:deal.company,
        customer_name:deal.customer_name,appointment_setter:deal.appointment_setter,
        kw_system:deal.kw_system,agent_cost_basis:deal.agent_cost_basis,
        agent_cost_basis_sold_at:deal.agent_cost_basis_sold_at,
        net_price_per_watt:deal.net_price_per_watt,date_closed:deal.date_closed,
        install_amount:null,bonus_amount:null,commission:null,credits_additions:null,
        advance_repayment:null,other_deductions:null,p1_paid_reversal:null,
        reversal_type:null,advance_remaining_balance:null,note:null,
        payment_type:null,
        rep_split_pct:deal.appointment_setter?50:null,
      });
    }
    setOpen(true);
  }

  /* Save: update deal fields on deals_view, upsert payfile entry */
  async function handleSave(){
    if(!editDeal||!editPf) return;
    setSaving(true);

    // Update the underlying deals table (not the view)
    const {error:de}=await supabase.from("deals").update({
      sales_rep:editDeal.sales_rep,appointment_setter:editDeal.appointment_setter,
      customer_name:editDeal.customer_name,kw_system:editDeal.kw_system,
      agent_cost_basis:editDeal.agent_cost_basis,agent_cost_basis_sold_at:editDeal.agent_cost_basis_sold_at,
      net_price_per_watt:editDeal.net_price_per_watt,date_closed:editDeal.date_closed,
      contract_value:editDeal.contract_value,total_adders:editDeal.total_adders,
      contract_net_price:editDeal.contract_net_price,rev:editDeal.rev,
      gross_profit:editDeal.gross_profit,status:editDeal.status,revenue:editDeal.revenue,
      paid_nova_nrg_p2_rev_date:editDeal.paid_nova_nrg_p2_rev_date,
      paid_nova_nrg_p1_p2_rev_amount:editDeal.paid_nova_nrg_p1_p2_rev_amount,
      paid_nova_nrg_post_p2_date:editDeal.paid_nova_nrg_post_p2_date,
      paid_nova_nrg_post_p2_rev_amount:editDeal.paid_nova_nrg_post_p2_rev_amount,
      agent_pay:editDeal.agent_pay,paid_agent_p2_date:editDeal.paid_agent_p2_date,
      paid_agent_p1_p2_amount:editDeal.paid_agent_p1_p2_amount,
      paid_agent_post_p2_date:editDeal.paid_agent_post_p2_date,
      paid_agent_post_p2_amount:editDeal.paid_agent_post_p2_amount,
    }).eq("id",editDeal.id);
    if(de){showToast(`Deal save error: ${de.message}`);setSaving(false);return;}

    // Upsert payfile_entries (sync key deal fields in)
    const {error:pe}=await supabase.from("payfile_entries").upsert([{
      ...editPf,
      sales_rep:editDeal.sales_rep,company:editDeal.company,
      customer_name:editDeal.customer_name,appointment_setter:editDeal.appointment_setter,
      kw_system:editDeal.kw_system,agent_cost_basis:editDeal.agent_cost_basis,
      agent_cost_basis_sold_at:editDeal.agent_cost_basis_sold_at,
      net_price_per_watt:editDeal.net_price_per_watt,date_closed:editDeal.date_closed,
      updated_at:new Date().toISOString(),
    }],{onConflict:"deal_id"});
    if(pe){showToast(`Payfile save error: ${pe.message}`);setSaving(false);return;}

    showToast("Saved successfully.");
    setSaving(false);setOpen(false);loadAll();
  }

  function sd<K extends keyof DealRow>(k:K,v:DealRow[K]){setEditDeal(p=>p?{...p,[k]:v}:p);}
  function sp<K extends keyof PayfileEntry>(k:K,v:PayfileEntry[K]){setEditPf(p=>p?{...p,[k]:v}:p);}

  /* Table column config — includes Install Amount from payfile_entries */
  const TC:{l:string;k:string;f?:(v:any)=>string;w?:string}[]=[
    {l:"Sales Rep",k:"sales_rep",w:"9%"},
    {l:"Appointment Setter",k:"appointment_setter",w:"8%"},
    {l:"Customer Name",k:"customer_name",w:"10%"},
    {l:"KW System",k:"kw_system",f:v=>nf(v),w:"5%"},
    {l:"Agent Cost Basis",k:"agent_cost_basis",f:v=>nf(v),w:"6%"},
    {l:"Sold @",k:"agent_cost_basis_sold_at",f:v=>nf(v),w:"4%"},
    {l:"Net Price Per Watt",k:"net_price_per_watt",f:v=>nf(v),w:"5%"},
    {l:"Date Closed",k:"date_closed",f:v=>fds(v),w:"7%"},
    {l:"Contract Value",k:"contract_value",f:v=>money(v),w:"7%"},
    {l:"Total Adders",k:"total_adders",f:v=>money(v),w:"6%"},
    {l:"Contract Net Price",k:"contract_net_price",f:v=>money(v),w:"7%"},
    {l:"Rev",k:"rev",f:v=>money(v),w:"6%"},
    {l:"Gross Profit",k:"gross_profit",f:v=>money(v),w:"7%"},
    {l:"Install Amount",k:"pf_install_amount",f:v=>money(v),w:"7%"},
  ];

  return (
    <div className="no-print px-6 py-5">
      {toast&&<div className="fixed top-4 right-4 z-[9999] bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>}

      {/* Filter */}
      <div className="mb-5">
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Filter Deals</label>
        <input className="w-full max-w-md border border-slate-200/70 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
          placeholder="Filter by customer name, sales rep, or company…" value={query} onChange={e=>setQuery(e.target.value)} />
        <p className="text-[10px] text-slate-400 mt-1">
          {loading?"Loading deals…":`${rows.length} of ${allRows.length} deals shown`}
        </p>
      </div>

      {/* Results Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-slate-800 text-white">
              {TC.map(c=><th key={c.k} className="px-2 py-2 text-left font-semibold whitespace-nowrap" style={{width:c.w}}>{c.l}</th>)}
            </tr></thead>
            <tbody>
              {rows.length===0?(
                <tr><td colSpan={TC.length} className="text-center py-10 text-slate-400 text-xs">
                  {loading?"Loading deals…":query?"No deals match your filter.":"No deals found."}
                </td></tr>
              ):(
                rows.map(r=>(
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onClick={()=>openRow(r)}>
                    {TC.map(c=><td key={c.k} className="px-2 py-2 whitespace-nowrap">{c.f?c.f((r as any)[c.k]):s((r as any)[c.k])}</td>)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ EDIT DIALOG ═══ */}
      {open&&editDeal&&editPf&&(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setOpen(false)} />
          <div className="relative w-[95%] max-w-[1100px] max-h-[calc(100vh-3rem)] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">

            {/* Dialog Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">{editDeal.customer_name??"Deal"}</h2>
                <p className="text-[10px] text-slate-500">{editDeal.sales_rep} · {editDeal.company} · {fds(editDeal.date_closed)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-4 py-1.5 rounded-lg border text-xs font-medium hover:bg-slate-50" onClick={()=>setOpen(false)}>Cancel</button>
                <button className="px-4 py-1.5 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-medium disabled:opacity-50" onClick={handleSave} disabled={saving}>
                  {saving?"Saving…":"Save Changes"}
                </button>
              </div>
            </div>

            {/* Dialog Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {/* Deal fields — all from deals_view */}
              <FS t="Deal Information">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <TF l="Sales Rep" v={editDeal.sales_rep} o={v=>sd("sales_rep",v)} />
                  <TF l="Appointment Setter" v={editDeal.appointment_setter} o={v=>sd("appointment_setter",v)} />
                  <TF l="Customer Name" v={editDeal.customer_name} o={v=>sd("customer_name",v)} />
                  <NF l="KW System" v={editDeal.kw_system} o={v=>sd("kw_system",v)} />
                  <NF l="Agent Cost Basis" v={editDeal.agent_cost_basis} o={v=>sd("agent_cost_basis",v)} />
                  <NF l="Agent Cost Basis Sold @" v={editDeal.agent_cost_basis_sold_at} o={v=>sd("agent_cost_basis_sold_at",v)} />
                  <NF l="Net Price Per Watt" v={editDeal.net_price_per_watt} o={v=>sd("net_price_per_watt",v)} />
                  <DF l="Date Closed" v={editDeal.date_closed} o={v=>sd("date_closed",v)} />
                </div>
              </FS>

              <FS t="Financials">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MoF l="Contract Value" v={editDeal.contract_value} o={v=>sd("contract_value",v)} />
                  <MoF l="Total Adders" v={editDeal.total_adders} o={v=>sd("total_adders",v)} />
                  <MoF l="Contract Net Price" v={editDeal.contract_net_price} o={v=>sd("contract_net_price",v)} />
                  <MoF l="Rev" v={editDeal.rev} o={v=>sd("rev",v)} />
                  <MoF l="Gross Profit" v={editDeal.gross_profit} o={v=>sd("gross_profit",v)} />
                  <SF l="Status" v={editDeal.status??""} opts={STATUSES} o={v=>sd("status",v||null)} />
                  <MoF l="Revenue" v={editDeal.revenue} o={v=>sd("revenue",v)} />
                </div>
              </FS>

              <FS t="Revenue Payments">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DF l="Rev P2 Date" v={editDeal.paid_nova_nrg_p2_rev_date} o={v=>sd("paid_nova_nrg_p2_rev_date",v)} />
                  <MoF l="Rev P2 Amt" v={editDeal.paid_nova_nrg_p1_p2_rev_amount} o={v=>sd("paid_nova_nrg_p1_p2_rev_amount",v)} />
                  <DF l="Rev Post P2 Date" v={editDeal.paid_nova_nrg_post_p2_date} o={v=>sd("paid_nova_nrg_post_p2_date",v)} />
                  <MoF l="Rev Post P2 Amount" v={editDeal.paid_nova_nrg_post_p2_rev_amount} o={v=>sd("paid_nova_nrg_post_p2_rev_amount",v)} />
                </div>
              </FS>

              <FS t="Agent Payments">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MoF l="Agent Pay" v={editDeal.agent_pay} o={v=>sd("agent_pay",v)} />
                  <DF l="Agent Pay P2 Date" v={editDeal.paid_agent_p2_date} o={v=>sd("paid_agent_p2_date",v)} />
                  <MoF l="Agent Pay P2 Amount" v={editDeal.paid_agent_p1_p2_amount} o={v=>sd("paid_agent_p1_p2_amount",v)} />
                  <DF l="Agent Pay Post P2 Date" v={editDeal.paid_agent_post_p2_date} o={v=>sd("paid_agent_post_p2_date",v)} />
                  <MoF l="Agent Pay Post P2 Amount" v={editDeal.paid_agent_post_p2_amount} o={v=>sd("paid_agent_post_p2_amount",v)} />
                </div>
              </FS>

              {/* Payfile-only fields — stored in payfile_entries */}
              <FS t="Payfile — Install & Payouts" a="green">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SF l="Payment Type" v={editPf.payment_type==="p2"?"P2 Full Payment":editPf.payment_type==="post_p2"?"Post P2 Payment":""} opts={["P2 Full Payment","Post P2 Payment"]} o={v=>sp("payment_type",v==="P2 Full Payment"?"p2":v==="Post P2 Payment"?"post_p2":null)} />
                  <MoF l="Install Amount (Total)" v={editPf.install_amount} o={v=>sp("install_amount",v)} />
                  <MoF l="Bonus Amount" v={editPf.bonus_amount} o={v=>sp("bonus_amount",v)} />
                  <MoF l="Commission" v={editPf.commission} o={v=>sp("commission",v)} />
                  <MoF l="Credits / Additions" v={editPf.credits_additions} o={v=>sp("credits_additions",v)} />
                </div>
                {/* Setter split — only shown when setter exists */}
                {editPf.appointment_setter&&(
                  <div className="mt-3 border border-slate-200 bg-slate-50/50 rounded-lg p-3">
                    <div className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider mb-2">Install Amount Split</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Rep Split % ({editPf.sales_rep})</label>
                        <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                          type="number" min={0} max={100}
                          value={editPf.rep_split_pct===null||editPf.rep_split_pct===undefined?"":editPf.rep_split_pct}
                          onChange={e=>{const v=e.target.value.trim();sp("rep_split_pct",v===""?null:Math.min(100,Math.max(0,Number(v))));}} placeholder="50" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Setter % ({editPf.appointment_setter})</label>
                        <div className="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-sm text-slate-600">
                          {editPf.rep_split_pct!==null&&editPf.rep_split_pct!==undefined?100-editPf.rep_split_pct:50}%
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Rep Install</label>
                        <div className="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-sm text-slate-600">
                          {moneyZ(z(editPf.install_amount)*(z(editPf.rep_split_pct)??50)/100)}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-500 block mb-0.5">Setter Install</label>
                        <div className="border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 text-sm text-slate-600">
                          {moneyZ(z(editPf.install_amount)*(100-(z(editPf.rep_split_pct)??50))/100)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {editPf.payment_type==="post_p2"&&(
                  <div className="mt-2 text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
                    ℹ️ Post P2 entries will hide kW, Cost Basis, NPPW, and Date Closed on the commission sheet since they were already shown on the P2 payfile.
                  </div>
                )}
              </FS>

              <FS t="Payfile — Deductions" a="red">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MoF l="Advance Repayment" v={editPf.advance_repayment} o={v=>sp("advance_repayment",v)} />
                  <MoF l="Other Deductions" v={editPf.other_deductions} o={v=>sp("other_deductions",v)} />
                  <MoF l="Reversals (P1 Paid/Reversal)" v={editPf.p1_paid_reversal} o={v=>sp("p1_paid_reversal",v)} />
                  <TF l="Reversal Type" v={editPf.reversal_type} o={v=>sp("reversal_type",v)} ph="e.g. Full, Partial" />
                </div>
              </FS>

              <FS t="Payfile — Notes" a="amber">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Note</label>
                  <textarea className="w-full border border-slate-200/70 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={s(editPf.note)} onChange={e=>sp("note",e.target.value||null)} placeholder="Add notes…" />
                </div>
              </FS>

              {/* Computed summary */}
              <div className="bg-slate-50 rounded-xl border p-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Payfile Summary</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SC l="Total Payouts" v={moneyZ(z(editPf.install_amount)+z(editPf.bonus_amount)+z(editPf.commission)+z(editPf.credits_additions))} c="emerald" />
                  <SC l="Total Deductions" v={moneyZ(z(editPf.advance_repayment)+z(editPf.other_deductions)+z(editPf.p1_paid_reversal))} c="red" />
                  <SC l="Net Pay" v={moneyZ(z(editPf.install_amount)+z(editPf.bonus_amount)+z(editPf.commission)+z(editPf.credits_additions)-z(editPf.advance_repayment)-z(editPf.other_deductions)-z(editPf.p1_paid_reversal))} c="blue" />
                  <SC l="Install Amount" v={moneyZ(editPf.install_amount)} c="gray" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ TAB 2: PAYFILE GENERATOR ═══════════════════ */

function PayfileGenerator() {
  const [payDate,setPayDate]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;});
  const [payType,setPayType]=useState<"p2"|"post_p2">("p2");
  const [rows,setRows]=useState<PayfileEntry[]>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState<string|null>(null);

  /* Advance remaining balances — keyed by rep name */
  const [repAdvBal,setRepAdvBal]=useState<Record<string,number>>({});
  /* General advance remaining balance — FULLY EDITABLE */
  const [genAdvBal,setGenAdvBal]=useState<number>(0);

  const [summaryRows,setSummaryRows]=useState<SummaryRow[]>([]);
  const [filterQuery,setFilterQuery]=useState("");
  const hasMounted=useRef(false);

  /* Find all deals paid on the selected date, then pull their payfile entries */
  async function generate(){
    setLoading(true);setMsg(null);setRows([]);setSummaryRows([]);setRepAdvBal({});setGenAdvBal(0);

    /* Step 1: Query deals_view for deals where the matching payment date = payDate */
    const dateCol=payType==="p2"?"paid_nova_nrg_p2_rev_date":"paid_nova_nrg_post_p2_date";
    const {data:deals,error:dErr}=await supabase
      .from("deals_view")
      .select("id,company,customer_name,sales_rep,appointment_setter,contract_value,total_adders,contract_net_price,revenue,gross_profit,agent_pay,paid_nova_nrg_p1_p2_rev_amount,paid_nova_nrg_post_p2_rev_amount")
      .eq(dateCol,payDate)
      .order("company").order("sales_rep");

    if(dErr){setMsg(`Error querying deals: ${dErr.message}`);setLoading(false);return;}
    if(!deals||deals.length===0){setMsg(`No deals found with ${payType==="p2"?"P2 Rev Date":"Post P2 Date"} = ${fds(payDate)}. Check that deals have this date filled in.`);setLoading(false);return;}

    const dealIds=deals.map((d:any)=>d.id);
    const dealMap=new Map<string,any>();
    deals.forEach((d:any)=>dealMap.set(d.id,d));

    /* Step 2: Fetch payfile_entries for those deals */
    const {data:pfData,error:pfErr}=await supabase
      .from("payfile_entries")
      .select("*")
      .in("deal_id",dealIds)
      .order("sales_rep").order("date_closed");

    if(pfErr){setMsg(`Error querying payfile entries: ${pfErr.message}`);setLoading(false);return;}
    if(!pfData||pfData.length===0){setMsg(`Found ${deals.length} deals on ${fds(payDate)} but none have payfile entries yet. Create entries in the Deal Manager tab first.`);setLoading(false);return;}

    const entries=pfData as PayfileEntry[];
    setRows(entries);

    /* Step 3: Build summary rows */
    const summary:SummaryRow[]=entries.map(pf=>{
      const dl=dealMap.get(pf.deal_id)||{};
      return {
        ...pf,
        contract_value:dl.contract_value??null,
        total_adders:dl.total_adders??null,
        contract_net_price:dl.contract_net_price??null,
        revenue:dl.revenue??null,
        gross_profit:dl.gross_profit??null,
        agent_paid_out_commission:dl.agent_pay??null,
        paid_nova_nrg_p1_p2_rev_amount:dl.paid_nova_nrg_p1_p2_rev_amount??null,
        paid_nova_nrg_post_p2_rev_amount:dl.paid_nova_nrg_post_p2_rev_amount??null,
      };
    });
    setSummaryRows(summary);

    /* Step 4: Initialize advance balances */
    const allNames=new Set<string>();
    entries.forEach(r=>{
      if(r.sales_rep) allNames.add(r.sales_rep);
      if(r.appointment_setter && z(r.install_amount)>0) allNames.add(r.appointment_setter);
    });
    setRepAdvBal(prev=>{const next:{[k:string]:number}={};allNames.forEach(r=>{next[r]=0;});return next;});

    const companies=[...new Set(entries.map(r=>r.company).filter(Boolean))];
    setMsg(`Found ${entries.length} payfile entries across ${companies.join(", ")} for ${payType==="p2"?"P2":"Post P2"} payment date ${fds(payDate)}.`);
    setLoading(false);
  }

  /* Auto-load on mount */
  useEffect(()=>{
    if(!hasMounted.current){ hasMounted.current=true; generate(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  /* Expand rows: for entries with a setter, create two rows — rep row + setter row with split install amounts */
  const expandedRows=useMemo(()=>{
    const out:PayfileEntry[]=[];
    rows.forEach(r=>{
      const setter=r.appointment_setter;
      const pct=r.rep_split_pct??50;
      const totalInstall=z(r.install_amount);
      if(setter && totalInstall>0){
        out.push({...r,install_amount:Math.round(totalInstall*pct/100*100)/100});
        out.push({
          ...r,
          sales_rep:setter,
          appointment_setter:null,
          install_amount:Math.round(totalInstall*(100-pct)/100*100)/100,
          bonus_amount:null,commission:null,credits_additions:null,
          advance_repayment:null,other_deductions:null,p1_paid_reversal:null,
          reversal_type:null,note:r.note?`Split from ${r.sales_rep}`:null,
        });
      } else {
        out.push(r);
      }
    });
    return out;
  },[rows]);

  /* Filter expanded rows by search query (customer, rep, company) */
  const filteredRows=useMemo(()=>{
    const q=filterQuery.trim().toLowerCase();
    if(!q) return expandedRows;
    return expandedRows.filter(r=>
      (r.customer_name?.toLowerCase().includes(q))||
      (r.sales_rep?.toLowerCase().includes(q))||
      (r.company?.toLowerCase().includes(q))||
      (r.appointment_setter?.toLowerCase().includes(q))
    );
  },[expandedRows,filterQuery]);

  const grp=useMemo(()=>{const m=new Map<string,PayfileEntry[]>();filteredRows.forEach(r=>{const k=r.sales_rep??"Unknown";if(!m.has(k))m.set(k,[]);m.get(k)!.push(r);});return m;},[filteredRows]);
  const reps=useMemo(()=>Array.from(grp.keys()).sort(),[grp]);
  const companies=useMemo(()=>[...new Set(rows.map(r=>r.company).filter(Boolean))] as string[],[rows]);

  const hasData=filteredRows.length>0;

  return (
    <>
      <div className="no-print px-6 py-6 space-y-5">
        {/* Controls */}
        <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Generate Commission Sheets</div>
          <div className="flex flex-wrap gap-5 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1.5">Payment Received Date</label>
              <input type="date" className="border border-slate-200/70 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300" value={payDate} onChange={e=>setPayDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1.5">Payment Type</label>
              <select className="border border-slate-200/70 rounded-lg px-3.5 py-2.5 text-sm min-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300" value={payType} onChange={e=>setPayType(e.target.value as "p2"|"post_p2")}>
                <option value="p2">P2 Revenue Payment</option>
                <option value="post_p2">Post P2 Revenue Payment</option>
              </select>
            </div>
            <button className="px-5 py-2.5 rounded-lg bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.99] transition text-xs font-semibold disabled:opacity-50" onClick={generate} disabled={loading}>
              {loading?"Searching…":"Generate"}
            </button>
            {hasData&&<button className="px-5 py-2.5 rounded-lg border text-xs font-semibold hover:bg-slate-50" onClick={()=>window.print()}>🖨️ Print</button>}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Finds all deals where {payType==="p2"?"Rev P2 Date":"Post P2 Date"} matches the selected date, then loads their payfile entries.
          </p>
        </div>

        {msg&&<div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{msg}</div>}

        {/* Search / Filter loaded data */}
        {expandedRows.length>0&&(
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Filter Results</label>
            <input className="w-full max-w-md border border-slate-200/70 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
              placeholder="Type to filter by customer name, rep, company, or setter…" value={filterQuery} onChange={e=>setFilterQuery(e.target.value)} />
            <p className="text-[10px] text-slate-400 mt-1">{filteredRows.length} of {expandedRows.length} entries shown</p>
          </div>
        )}

        {hasData&&(
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Results:</span>
            {companies.map(c=>(
              <span key={c} className="inline-flex items-center gap-1 bg-slate-100 border rounded-full px-3 py-1 text-xs font-medium">{c}</span>
            ))}
            <span className="text-[10px] text-slate-400">{rows.length} deals · {filteredRows.length} entries{filterQuery?" (filtered)":""} · {reps.length} reps</span>
          </div>
        )}

        {/* Advance Remaining Balances — per rep + editable general */}
        {hasData&&reps.length>0&&(
          <div className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Advance Remaining Balances</div>
            <p className="text-[10px] text-slate-400 mb-4">Set per-rep and general balances before printing.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {reps.map(rep=>(
                <div key={rep}>
                  <label className="text-[10px] font-medium text-slate-500 block mb-1">{rep}</label>
                  <input className="w-full border border-slate-200/70 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                    value={repAdvBal[rep]??""} onChange={e=>{const v=pm(e.target.value);setRepAdvBal(prev=>({...prev,[rep]:v??0}));}} placeholder="$0.00" />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">General Advance Remaining (Total)</label>
                <input className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={genAdvBal||""} onChange={e=>{const v=pm(e.target.value);setGenAdvBal(v??0);}} placeholder="$0.00" />
              </div>
              <div className="flex items-end">
                <p className="text-[10px] text-slate-400 pb-2">Editable — enter the actual total advance remaining balance. This is independent of per-rep values.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {hasData&&(
        <div id="pf-print" className="px-6">
          {/* GENERAL COMMISSIONS SHEET */}
          <div className="pf-sheet" style={{marginBottom:"48px",paddingBottom:"24px",borderBottom:"3px solid #d1d5db"}}>
            <PH d={fds(payDate)} t="GENERAL COMMISSIONS SHEET" />
            <table style={tbl}>
              <thead><PHR /></thead>
              <tbody>
                {reps.map(rep=><PRB key={rep} rows={grp.get(rep)!} sp={true} advBal={repAdvBal[rep]??0} />)}
                <PSR rows={filteredRows} lb="Grand Subtotals:" />
              </tbody>
            </table>
            <PGF rows={filteredRows} reps={reps} grp={grp} repAdvBal={repAdvBal} genAdvBal={genAdvBal} summaryRows={summaryRows} companies={companies} />
          </div>

          {/* INDIVIDUAL SHEETS */}
          {reps.map((rep,ri)=>(
            <div key={`i-${rep}`} className="pf-sheet" style={{marginBottom:ri<reps.length-1?"48px":"0",paddingBottom:ri<reps.length-1?"24px":"0",borderBottom:ri<reps.length-1?"3px solid #d1d5db":"none"}}>
              <PH d={fds(payDate)} t={`SALES COMMISSIONS SHEET — ${rep}`} />
              <table style={tbl}>
                <thead><PHR /></thead>
                <tbody><PRB rows={grp.get(rep)!} sp={false} advBal={repAdvBal[rep]??0} /></tbody>
              </table>
              <PRF rows={grp.get(rep)!} advBal={repAdvBal[rep]??0} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ═══════════════════ PRINT TABLE COMPONENTS ═══════════════════
   Design: Muted palette, precision column sizing.

   Column types & alignment:
   TEXT   — left-aligned, flexible width (names, notes)
   MONEY  — right-aligned, uniform 6.2% width, fits "$1,234,567"
   NUM    — right-aligned, narrow 3.5% width (kW, cost basis, NPPW)
   DATE   — center-aligned, 5.2% width (MM/DD/YYYY)
   TAG    — left-aligned, narrow (reversal type)
   ═══════════════════════════════════════════════════════════════ */

const ff="'Lexend','Segoe UI',system-ui,Arial,sans-serif";

/*                        Label             Width   Align  Type */
const COLS:[string,string,string,string][]=[
  ["Sales Rep",          "9%",    "left",   "text"],
  ["Company",            "5.8%",  "left",   "text"],
  ["Customer",           "9%",    "left",   "text"],
  ["Setter",             "6.5%",  "left",   "text"],
  ["kW",                 "3.5%",  "right",  "num"],
  ["Cost Basis",         "3.5%",  "right",  "num"],
  ["NPPW",               "3.5%",  "right",  "num"],
  ["Date Closed",        "5.2%",  "center", "date"],
  ["Install",            "5%",    "right",  "money"],
  ["Bonus",              "5%",    "right",  "money"],
  ["Commission",         "5%",    "right",  "money"],
  ["Credits",            "5%",    "right",  "money"],
  ["Adv. Repay",         "5%",    "right",  "money"],
  ["Deductions",         "5%",    "right",  "money"],
  ["Reversals",          "5%",    "right",  "money"],
  ["Type",               "5.5%",  "left",   "tag"],
  ["Note",               "7%",    "left",   "text"],
];
const COL_COUNT=COLS.length;
const INFO_COUNT=8; /* first 8 are info cols */

/* ── Shared styles ── */
const tbl:React.CSSProperties={width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontFamily:ff,fontSize:"6.8pt",color:"#374151"};

/* Header — info cols lighter, pay cols darker */
function hStyle(i:number):React.CSSProperties{
  return {
    width:COLS[i][1], textAlign:COLS[i][2] as any,
    padding:"4px 4px",fontSize:"5.8pt",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.03em",
    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
    color:"#fff", backgroundColor:i<INFO_COUNT?"#6b7280":"#4b5563",
    borderRight:i<COL_COUNT-1?"0.5px solid rgba(255,255,255,0.15)":"none",
    fontFamily:ff,
  };
}

/* Data cell — alignment from column definition */
function dStyle(i:number,alt:boolean,isPost:boolean):React.CSSProperties{
  return {
    padding:"2.5px 4px",fontSize:"6.8pt",
    textAlign:COLS[i][2] as any,
    color:isPost?"#9ca3af":"#374151",
    fontStyle:isPost?"italic":"normal",
    borderBottom:"0.5px solid #e5e7eb",
    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
    verticalAlign:"middle",fontFamily:ff,
    backgroundColor:alt?"#f9fafb":"transparent",
  };
}

/* Subtotal cell */
function sStyle(i:number):React.CSSProperties{
  return {
    padding:"4px 4px",fontSize:"6.8pt",fontWeight:600,
    textAlign:i>=INFO_COUNT?"right":"left",
    color:"#fff",backgroundColor:"#4b5563",fontFamily:ff,
    borderRight:i<COL_COUNT-1?"0.5px solid rgba(255,255,255,0.08)":"none",
  };
}

/* Advance highlight row */
const acs:React.CSSProperties={
  padding:"2.5px 4px",fontSize:"6.8pt",fontWeight:500,
  backgroundColor:"#fef3c7",color:"#92400e",
  borderBottom:"0.5px solid #fde68a",fontFamily:ff,
};

/* Muted badge colors */
const TEAL="#6b9e9e";
const ROSE="#c9706b";

/* ── Sheet Header ── */
function PH({d,t}:{d:string;t:string}){
  return <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:"8px",paddingBottom:"5px",borderBottom:"1.5px solid #d1d5db",fontFamily:ff}}>
    <div style={{display:"flex",alignItems:"baseline",gap:"12px"}}>
      <span style={{fontWeight:600,fontSize:"10pt",color:"#374151"}}>{d}</span>
      <span style={{fontSize:"8pt",fontWeight:600,color:TEAL,fontStyle:"italic"}}>Nova NRG</span>
    </div>
    <span style={{fontWeight:600,fontSize:"9.5pt",letterSpacing:"0.3px",color:"#374151",textTransform:"uppercase"}}>{t}</span>
  </div>;
}

/* ── Header Row ── */
function PHR(){
  return <tr>{COLS.map((c,i)=><th key={c[0]} style={hStyle(i)}>{c[0]}</th>)}</tr>;
}

/* ── Data row cells ── */
function pfc(r:PayfileEntry):string[]{
  const p=r.payment_type==="post_p2";
  return [
    s(r.sales_rep),s(r.company),s(r.customer_name),s(r.appointment_setter),
    p?"":nf(r.kw_system),
    p?"":nf(r.agent_cost_basis_sold_at),
    p?"":nf(r.net_price_per_watt),
    p?"":fds(r.date_closed),
    money(r.install_amount),money(r.bonus_amount),money(r.commission),money(r.credits_additions),
    money(r.advance_repayment),money(r.other_deductions),money(r.p1_paid_reversal),
    s(r.reversal_type),s(r.note),
  ];
}

function pfs(rows:PayfileEntry[]){
  return {
    inst:rows.reduce((a,r)=>a+z(r.install_amount),0),
    bon:rows.reduce((a,r)=>a+z(r.bonus_amount),0),
    com:rows.reduce((a,r)=>a+z(r.commission),0),
    cred:rows.reduce((a,r)=>a+z(r.credits_additions),0),
    advR:rows.reduce((a,r)=>a+z(r.advance_repayment),0),
    othD:rows.reduce((a,r)=>a+z(r.other_deductions),0),
    rev:rows.reduce((a,r)=>a+z(r.p1_paid_reversal),0),
  };
}

function pfn(x:ReturnType<typeof pfs>){return x.inst+x.bon+x.com+x.cred-x.advR-x.othD-x.rev;}

/* ── Rep Block ── */
function PRB({rows,sp:showSp,advBal}:{rows:PayfileEntry[];sp:boolean;advBal:number}){
  const x=pfs(rows);
  const rep=rows[0]?.sales_rep??"";
  return <>
    {/* Rep label — with extra top padding for clear separation */}
    <tr><td colSpan={COL_COUNT} style={{padding:"14px 4px 3px",fontSize:"8pt",fontWeight:700,color:"#1e293b",borderBottom:"2px solid #64748b",fontFamily:ff,letterSpacing:"0.02em"}}>{rep}</td></tr>
    {/* Data rows */}
    {rows.map((r,i)=>{
      const isPost=r.payment_type==="post_p2";
      const cells=pfc(r);
      return <tr key={r.deal_id+"-"+i}>{cells.map((c,ci)=><td key={ci} style={dStyle(ci,i%2===1,isPost)}>{c}</td>)}</tr>;
    })}
    {/* Advance row */}
    {x.advR>0&&(
      <tr>
        <td style={acs} colSpan={INFO_COUNT}><span style={{fontWeight:600}}>Advance Repayment</span></td>
        <td style={acs} colSpan={4}></td>
        <td style={{...acs,textAlign:"right",fontWeight:600}}>{moneyZ(x.advR)}</td>
        <td style={acs} colSpan={4}></td>
      </tr>
    )}
    {/* Subtotals */}
    <PSR rows={rows} lb="Subtotals" />
    {/* Footer badges */}
    <tr><td colSpan={COL_COUNT} style={{border:"none",padding:"4px 0 0"}}>
      <div style={{display:"flex",gap:"8px",fontFamily:ff}}>
        <span style={{padding:"3px 10px",fontSize:"6.5pt",fontWeight:600,color:"#fff",backgroundColor:TEAL,borderRadius:"2px"}}>Total Paid: {moneyZ(pfn(x))}</span>
        <span style={{padding:"3px 10px",fontSize:"6.5pt",fontWeight:600,color:"#fff",backgroundColor:advBal>0?ROSE:TEAL,borderRadius:"2px"}}>Adv. Remaining: {moneyZ(advBal)}</span>
      </div>
    </td></tr>
    {/* Separator between rep blocks — visible divider line + breathing room */}
    {showSp&&<tr><td colSpan={COL_COUNT} style={{border:"none",padding:"8px 0"}}>
      <div style={{borderBottom:"1.5px solid #cbd5e1",margin:"0 4px"}} />
    </td></tr>}
  </>;
}

/* ── Subtotal Row ── */
function PSR({rows,lb}:{rows:PayfileEntry[];lb:string}){
  const x=pfs(rows);
  const vals=[null,null,null,null,null,null,null,null,x.inst,x.bon,x.com,x.cred,x.advR,x.othD,x.rev,null,null];
  return <tr>
    {vals.map((v,i)=>{
      if(i===0) return <td key={i} colSpan={INFO_COUNT} style={sStyle(0)}>{lb}</td>;
      if(i>0&&i<INFO_COUNT) return null; /* consumed by colspan */
      return <td key={i} style={sStyle(i)}>{v!==null?moneyZ(v):""}</td>;
    })}
  </tr>;
}

/* ── Individual sheet footer ── */
function PRF({rows,advBal}:{rows:PayfileEntry[];advBal:number}){
  const x=pfs(rows);
  return <div style={{display:"flex",justifyContent:"space-between",marginTop:"8px",fontFamily:ff}}>
    <span style={{padding:"4px 14px",fontWeight:600,fontSize:"8pt",color:"#fff",backgroundColor:TEAL,borderRadius:"2px"}}>Total Paid: {moneyZ(pfn(x))}</span>
    <span style={{padding:"4px 14px",fontWeight:600,fontSize:"8pt",color:"#fff",backgroundColor:advBal>0?ROSE:TEAL,borderRadius:"2px"}}>Advance Remaining Balance: {moneyZ(advBal)}</span>
  </div>;
}

function PGF({rows,reps,grp,repAdvBal,genAdvBal,summaryRows,companies}:{rows:PayfileEntry[];reps:string[];grp:Map<string,PayfileEntry[]>;repAdvBal:Record<string,number>;genAdvBal:number;summaryRows:SummaryRow[];companies:string[]}){
  const x=pfs(rows);
  const totalPayout=x.inst+x.bon+x.com+x.cred;
  const netTotal=pfn(x);

  /* Per-company breakdown */
  const coMap=new Map<string,PayfileEntry[]>();
  rows.forEach(r=>{const c=r.company??"Unknown";if(!coMap.has(c))coMap.set(c,[]);coMap.get(c)!.push(r);});

  /* Unique appointment setters */
  const setters=[...new Set(rows.map(r=>r.appointment_setter).filter(Boolean))] as string[];

  /* Summary row totals */
  const sKw=summaryRows.reduce((a,r)=>a+z(r.kw_system),0);
  const sCV=summaryRows.reduce((a,r)=>a+z(r.contract_value),0);
  const sTA=summaryRows.reduce((a,r)=>a+z(r.total_adders),0);
  const sCNP=summaryRows.reduce((a,r)=>a+z(r.contract_net_price),0);
  const sRev=summaryRows.reduce((a,r)=>a+z(r.revenue),0);
  const sGP=summaryRows.reduce((a,r)=>a+z(r.gross_profit),0);
  const sAPC=summaryRows.reduce((a,r)=>a+z(r.agent_paid_out_commission),0);
  const sCount=summaryRows.length;

  const lb:React.CSSProperties={fontWeight:600,fontSize:"7pt",padding:"3px 5px",borderBottom:"0.5px solid #e5e7eb",color:"#374151",fontFamily:ff};
  const lv:React.CSSProperties={fontSize:"7pt",padding:"3px 5px",borderBottom:"0.5px solid #e5e7eb",textAlign:"right",color:"#374151",fontFamily:ff};
  const lh:React.CSSProperties={fontSize:"6pt",fontWeight:600,padding:"4px 5px",color:"#fff",backgroundColor:"#6b7280",fontFamily:ff,textTransform:"uppercase",letterSpacing:"0.04em"};
  const ld:React.CSSProperties={fontSize:"7pt",padding:"3px 5px",borderBottom:"0.5px solid #e5e7eb",color:"#374151",fontFamily:ff};
  const lt:React.CSSProperties={fontSize:"7pt",fontWeight:600,padding:"4px 5px",backgroundColor:"#4b5563",color:"#fff",fontFamily:ff};
  const gh:React.CSSProperties={...lh,backgroundColor:"#6b9e9e"};
  const rh:React.CSSProperties={...lh,backgroundColor:"#c9706b"};

  return <div style={{marginTop:"14px",fontFamily:ff,fontSize:"7pt",color:"#374151"}}>

    {/* ═══ ROW 1: Payout Summary (left) + Grand Total Row (right) ═══ */}
    <div style={{display:"flex",gap:"16px",marginBottom:"12px"}}>

      {/* LEFT: Payout Summary */}
      <div style={{flex:"0 0 30%"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}>
          <span style={{fontSize:"10px",fontWeight:700,color:"#6b9e9e",fontStyle:"italic"}}>Nova NRG</span>
        </div>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <tbody>
            <tr><td style={lb}>TOTAL PAYOUT</td><td style={lv}>{moneyZ(totalPayout)}</td></tr>
            <tr><td style={lb}>Install Amounts</td><td style={lv}>{moneyZ(x.inst)}</td></tr>
            <tr><td style={lb}>Advance Amounts</td><td style={lv}>{moneyZ(0)}</td></tr>
            <tr><td style={lb}>Total Install + Advance Amounts</td><td style={lv}>{moneyZ(x.inst)}</td></tr>
            <tr><td style={lb}>BONUS PAID</td><td style={lv}>{moneyZ(x.bon)}</td></tr>
            <tr><td style={lb}>REVERSALS</td><td style={lv}>{moneyZ(x.rev)}</td></tr>
            <tr><td style={lb}>Advance repayments</td><td style={lv}>{moneyZ(x.advR)}</td></tr>
            <tr><td style={{...lb,fontWeight:700}}>NOVA NRG NET TOTAL<br/><span style={{fontSize:"6px",fontWeight:400}}>(paid out total - reversal)</span></td><td style={{...lv,fontWeight:700}}>{moneyZ(netTotal)}</td></tr>
            <tr><td style={lb}>OWED IN FUTURE</td><td style={lv}>{moneyZ(0)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* RIGHT: Grand Total Row + Company Breakdown */}
      <div style={{flex:1}}>
        {/* Grand Total Row */}
        <table style={{borderCollapse:"collapse",width:"100%",marginBottom:"8px"}}>
          <thead><tr>
            <th style={{...lh,backgroundColor:"#6b9e9e"}}>Install Amount</th>
            <th style={{...lh,backgroundColor:"#6b9e9e"}}>Bonus Amount</th>
            <th style={{...lh,backgroundColor:"#6b9e9e"}}>Agent Payout</th>
            <th style={lh}>Credits/Additions</th>
            <th style={lh}>Advance Amount</th>
            <th style={lh}>Advance Repayments</th>
            <th style={lh}>Deductions</th>
            <th style={lh}>P1 Paid/Reversal</th>
          </tr></thead>
          <tbody><tr>
            <td style={{...ld,fontWeight:700,backgroundColor:"#ecfdf5"}}>{moneyZ(x.inst)}</td>
            <td style={ld}>{moneyZ(x.bon)}</td>
            <td style={ld}>{moneyZ(x.com)}</td>
            <td style={ld}>{moneyZ(x.cred)}</td>
            <td style={ld}>{moneyZ(0)}</td>
            <td style={ld}>{moneyZ(x.advR)}</td>
            <td style={ld}>{moneyZ(x.othD)}</td>
            <td style={ld}>{moneyZ(x.rev)}</td>
          </tr></tbody>
        </table>

        {/* Company Breakdown */}
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <thead><tr>
            <th style={lh}>PAYOUT</th>
            {companies.map(c=><th key={c} style={lh}>{c}</th>)}
            <th style={{...lh,backgroundColor:"#6b9e9e"}}>BONUS</th>
            <th style={{...lh,backgroundColor:"#6b9e9e"}}>ADVANCE</th>
            <th style={lh}></th>
            <th style={lh}>TOTAL</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={{...ld,fontWeight:700}}>Install</td>
              {companies.map(c=>{const cx=pfs(coMap.get(c)??[]);return <td key={c} style={{...ld,backgroundColor:"#ecfdf5"}}>{moneyZ(cx.inst)}</td>;})}
              <td style={ld}></td><td style={ld}></td><td style={ld}></td>
              <td style={{...ld,fontWeight:700}}>{moneyZ(x.inst)}</td>
            </tr>
            <tr>
              <td style={{...ld,fontWeight:700}}>Advance</td>
              {companies.map(c=><td key={c} style={ld}></td>)}
              <td style={ld}>{moneyZ(x.bon)}</td><td style={ld}>{moneyZ(0)}</td><td style={ld}></td>
              <td style={ld}>{moneyZ(0)}</td>
            </tr>
            <tr>
              <td style={{...ld,fontWeight:700}}>Reversals</td>
              {companies.map((c,ci)=><td key={ci} style={ld}></td>)}
              <td style={ld}></td><td style={ld}></td><td style={ld}></td>
              <td style={ld}>{moneyZ(x.rev)}</td>
            </tr>
            <tr>
              <td style={{...ld,fontWeight:700}}>Advance Repayments</td>
              {companies.map(c=>{const cx=pfs(coMap.get(c)??[]);return <td key={c} style={ld}>{moneyZ(cx.advR)}</td>;})}
              <td style={ld}></td><td style={ld}></td><td style={ld}></td>
              <td style={{...ld,fontWeight:700}}>{moneyZ(x.advR)}</td>
            </tr>
            <tr>
              <td style={lt}>TOTALS</td>
              {companies.map(c=>{const cx=pfs(coMap.get(c)??[]);return <td key={c} style={lt}>{moneyZ(pfn(cx))}</td>;})}
              <td style={lt}>{moneyZ(x.bon)}</td><td style={lt}>{moneyZ(0)}</td><td style={lt}></td>
              <td style={lt}>{moneyZ(netTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    {/* ═══ ROW 2: Customer Detail Table ═══ */}
    <div style={{marginBottom:"12px"}}>
      <div style={{fontSize:"7px",fontWeight:700,color:"#666",marginBottom:"2px"}}>Date Sorted From General Commissions Sheet</div>
      <table style={{borderCollapse:"collapse",width:"100%"}}>
        <thead><tr>
          <th style={lh}>Customer Name</th>
          <th style={lh}>KW System</th>
          <th style={lh}>Net Price per Watt</th>
          <th style={lh}>Date Closed</th>
          <th style={lh}>Contract Value</th>
          <th style={lh}>Total Adders</th>
          <th style={lh}>Contract Net Price</th>
          <th style={lh}>Revenue</th>
          <th style={lh}>Gross Profit</th>
          <th style={gh}>Agent Paid Out Commission</th>
          <th style={rh}>Nova NRG Customer Remaining Payout (90%)</th>
          <th style={rh}>Agent Remaining Payout</th>
        </tr></thead>
        <tbody>
          {summaryRows.map((r,i)=>(
            <tr key={i}>
              <td style={ld}>{s(r.customer_name)}</td>
              <td style={ld}>{nf(r.kw_system)}</td>
              <td style={ld}>{nf(r.net_price_per_watt)}</td>
              <td style={ld}>{fds(r.date_closed)}</td>
              <td style={ld}>{money(r.contract_value)}</td>
              <td style={ld}>{money(r.total_adders)}</td>
              <td style={ld}>{money(r.contract_net_price)}</td>
              <td style={ld}>{money(r.revenue)}</td>
              <td style={ld}>{money(r.gross_profit)}</td>
              <td style={{...ld,backgroundColor:"#ecfdf5"}}>{money(r.agent_paid_out_commission)}</td>
              <td style={ld}></td>
              <td style={ld}></td>
            </tr>
          ))}
          {/* Subtotals */}
          <tr>
            <td style={lt}>{sCount}</td>
            <td style={lt}>{nf(sKw)}</td>
            <td style={lt}></td><td style={lt}></td>
            <td style={lt}>{moneyZ(sCV)}</td>
            <td style={lt}>{moneyZ(sTA)}</td>
            <td style={lt}>{moneyZ(sCNP)}</td>
            <td style={lt}>{moneyZ(sRev)}</td>
            <td style={lt}>{moneyZ(sGP)}</td>
            <td style={lt}>{moneyZ(sAPC)}</td>
            <td style={lt}></td>
            <td style={lt}></td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* ═══ ROW 3: Deposited/Remaining (left) + Rep/Setter Summary (right) ═══ */}
    <div style={{display:"flex",gap:"16px"}}>

      {/* LEFT: Deposited / Remaining Balance */}
      <div style={{flex:"0 0 45%"}}>
        <div style={{fontSize:"6pt",fontWeight:600,color:"#9ca3af",marginBottom:"3px",textTransform:"uppercase",letterSpacing:"0.04em",fontFamily:ff}}>Deposited / Remaining Balance</div>
        <table style={{borderCollapse:"collapse",width:"100%",fontFamily:ff}}>
          <thead><tr>
            <th style={lh}>Customer Name</th>
            <th style={lh}>KW System</th>
            <th style={lh}>Deposited Amount</th>
            <th style={lh}>Remaining Balance</th>
          </tr></thead>
          <tbody>
            {summaryRows.map((r,i)=>{
              /* Deposited: show whichever payment applies to this entry */
              const p2Amt=z(r.paid_nova_nrg_p1_p2_rev_amount);
              const postP2Amt=z(r.paid_nova_nrg_post_p2_rev_amount);
              const rev=z(r.revenue);
              let deposited=0;
              if(r.payment_type==="post_p2") deposited=postP2Amt;
              else if(r.payment_type==="p2") deposited=p2Amt;
              else deposited=p2Amt||postP2Amt; // fallback: show whichever is filled

              /* Remaining: only show when P2 is paid but Post P2 is NOT yet done */
              let remaining:number|null=null;
              if(p2Amt>0 && postP2Amt===0 && rev>p2Amt){
                remaining=rev-p2Amt;
              }

              return (
                <tr key={i}>
                  <td style={ld}>{s(r.customer_name)}</td>
                  <td style={ld}>{nf(r.kw_system)}</td>
                  <td style={ld}>{deposited>0?moneyZ(deposited):""}</td>
                  <td style={ld}>{remaining!==null&&remaining>0?moneyZ(remaining):""}</td>
                </tr>
              );
            })}
            {/* Totals */}
            {(()=>{
              let totalDep=0, totalRem=0;
              summaryRows.forEach(r=>{
                const p2=z(r.paid_nova_nrg_p1_p2_rev_amount);
                const postP2=z(r.paid_nova_nrg_post_p2_rev_amount);
                const rev=z(r.revenue);
                if(r.payment_type==="post_p2") totalDep+=postP2;
                else if(r.payment_type==="p2") totalDep+=p2;
                else totalDep+=(p2||postP2);
                if(p2>0 && postP2===0 && rev>p2) totalRem+=(rev-p2);
              });
              return <>
                <tr>
                  <td style={lt}>{sCount}</td>
                  <td style={lt}>{nf(sKw)}</td>
                  <td style={lt}>{totalDep>0?moneyZ(totalDep):""}</td>
                  <td style={lt}>{totalRem>0?moneyZ(totalRem):""}</td>
                </tr>
                <tr><td colSpan={2} style={{...lt,textAlign:"right"}}>TOTAL</td><td style={lt}>{totalDep>0?moneyZ(totalDep):""}</td><td style={lt}>{totalRem>0?moneyZ(totalRem):""}</td></tr>
                <tr><td colSpan={2} style={{...lt,textAlign:"right",backgroundColor:TEAL,color:"#fff"}}>NET</td><td colSpan={2} style={{...lt,backgroundColor:TEAL,color:"#fff"}}>{moneyZ(totalDep-totalRem)}</td></tr>
              </>;
            })()}
          </tbody>
        </table>
      </div>

      {/* RIGHT: Rep + Setter Summary */}
      <div style={{flex:1}}>
        {/* Sales Rep Total Pay */}
        <table style={{borderCollapse:"collapse",width:"100%",marginBottom:"8px"}}>
          <thead><tr>
            <th style={lh}>Sales Rep</th>
            <th style={lh}>Total Pay</th>
          </tr></thead>
          <tbody>
            {reps.map(rep=>{const rx=pfs(grp.get(rep)!);return <tr key={rep}><td style={ld}>{rep}</td><td style={ld}>{moneyZ(pfn(rx))}</td></tr>;})}
          </tbody>
        </table>

        {/* Appointment Setter Total Pay */}
        <table style={{borderCollapse:"collapse",width:"100%",marginBottom:"8px"}}>
          <thead><tr>
            <th style={lh}>Appointment Setter</th>
            <th style={lh}>Total Pay</th>
            <th style={lh}>Date closed</th>
          </tr></thead>
          <tbody>
            {setters.length>0?setters.map(st=>(
              <tr key={st}><td style={ld}>{st}</td><td style={ld}>{moneyZ(0)}</td><td style={ld}></td></tr>
            )):(
              <tr><td colSpan={3} style={ld}>0</td></tr>
            )}
            <tr><td style={lt}></td><td style={lt}>{moneyZ(0)}</td><td style={lt}></td></tr>
          </tbody>
        </table>

        {/* Dividable note */}
        <div style={{fontSize:"7px",color:"#999",textAlign:"right"}}>Dividable bet. Eric and Nahuel</div>
      </div>
    </div>

    {/* Grand totals bar */}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px",fontFamily:ff}}>
      <span style={{padding:"4px 14px",fontWeight:600,fontSize:"8pt",color:"#fff",backgroundColor:TEAL,borderRadius:"2px"}}>Grand Total Paid: {moneyZ(netTotal)}</span>
      <span style={{padding:"4px 14px",fontWeight:600,fontSize:"8pt",color:"#fff",backgroundColor:genAdvBal>0?ROSE:TEAL,borderRadius:"2px"}}>Total Advance Remaining: {moneyZ(genAdvBal)}</span>
    </div>
  </div>;
}

/* ═══════════════════ FORM FIELD COMPONENTS ═══════════════════ */

function FS({t,children,a}:{t:string;children:React.ReactNode;a?:string}){
  const bc=a==="green"?"border-l-slate-600":a==="red"?"border-l-slate-400":a==="amber"?"border-l-slate-300":"border-l-slate-300";
  return <div className={`border rounded-xl overflow-hidden border-l-4 ${bc}`}>
    <div className="px-4 py-2 bg-slate-50 border-b"><div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{t}</div></div>
    <div className="p-4">{children}</div>
  </div>;
}

function TF({l,v,o,ph}:{l:string;v:string|null;o:(v:string|null)=>void;ph?:string}){
  return <div>
    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">{l}</label>
    <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={s(v)} onChange={e=>o(e.target.value||null)} placeholder={ph} />
  </div>;
}

function NF({l,v,o}:{l:string;v:number|null;o:(v:number|null)=>void}){
  return <div>
    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">{l}</label>
    <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={v===null||v===undefined?"":String(v)}
      onChange={e=>{const r=e.target.value.trim();if(!r){o(null);return;}const n=Number(r);if(!Number.isNaN(n))o(n);}}
      placeholder="0.00" />
  </div>;
}

function MoF({l,v,o}:{l:string;v:number|null;o:(v:number|null)=>void}){
  return <div>
    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">{l}</label>
    <input className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={v===null||v===undefined?"":String(v)} onChange={e=>o(pm(e.target.value))} placeholder="$0.00" />
  </div>;
}

function DF({l,v,o}:{l:string;v:string|null;o:(v:string|null)=>void}){
  return <div>
    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">{l}</label>
    <input type="date" className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={tid(v)} onChange={e=>o(e.target.value||null)} />
  </div>;
}

function SF({l,v,opts,o}:{l:string;v:string;opts:string[];o:(v:string)=>void}){
  return <div>
    <label className="text-[10px] font-medium text-slate-500 block mb-0.5">{l}</label>
    <select className="w-full border border-slate-200/70 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={v} onChange={e=>o(e.target.value)}>
      <option value="">— Select —</option>
      {opts.map(op=><option key={op} value={op}>{op}</option>)}
    </select>
  </div>;
}

function SC({l,v,c}:{l:string;v:string;c:string}){
  const bg=c==="emerald"?"bg-slate-50 border-slate-300":c==="red"?"bg-slate-50 border-slate-300":c==="blue"?"bg-slate-50 border-slate-300":c==="amber"?"bg-slate-50 border-slate-200":"bg-slate-50 border-slate-200";
  return <div className={`border rounded-lg p-3 ${bg}`}>
    <div className="text-[10px] text-slate-500 font-medium">{l}</div>
    <div className="text-sm font-bold mt-0.5">{v}</div>
  </div>;
}
