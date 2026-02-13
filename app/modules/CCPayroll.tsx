"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PORTAL_HEADER_PX = 64;
const DAYS = ["mon","tue","wed","thu","fri"] as const;
const DAY_LABELS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const SUB_FIELDS = ["prep","afk","off","ot","bonus","commission"] as const;
const SUB_LABELS = ["Prep","AFK","Off","O/T","Bonus","Comm"];
const DEFAULT_PAY_STYLES = ["Direct Deposit","Wise","Remitly","Paypal","CashApp"];

type Staff = { id:string; name:string; status:"Active"|"OFF"|"SNR"; weekly_rate:number; pay_style:string };
type PayrollWeek = {
  id:string; staff_id:string; week_start:string;
  mon_prep:number;mon_afk:number;mon_off:number;mon_ot:number;mon_bonus:number;mon_commission:number;
  tue_prep:number;tue_afk:number;tue_off:number;tue_ot:number;tue_bonus:number;tue_commission:number;
  wed_prep:number;wed_afk:number;wed_off:number;wed_ot:number;wed_bonus:number;wed_commission:number;
  thu_prep:number;thu_afk:number;thu_off:number;thu_ot:number;thu_bonus:number;thu_commission:number;
  fri_prep:number;fri_afk:number;fri_off:number;fri_ot:number;fri_bonus:number;fri_commission:number;
  amount_paid:number; date_paid:string|null; pay_style:string; notes:string|null;
};
type Commission = { id:string; payroll_week_id:string; account_name:string; commission_rate:number; commission_amount:number; notes:string|null };

function getMonday(d:Date){const dt=new Date(d);const day=dt.getDay();dt.setDate(dt.getDate()-day+(day===0?-6:1));dt.setHours(0,0,0,0);return dt;}
function fmtIso(d:Date){return d.toISOString().slice(0,10);}
function addDays(d:Date,n:number){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function fmtShort(iso:string){const p=iso.split("-");return `${p[1]}/${p[2]}`;}
function fmtFull(iso:string){const p=iso.split("-");return `${p[1]}/${p[2]}/${p[0].slice(-2)}`;}
function money(n:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);}
function n2(v:any):number{const n=Number(v);return Number.isNaN(n)?0:Math.round(n*100)/100;}
function getDayVal(pw:PayrollWeek,day:typeof DAYS[number],sub:typeof SUB_FIELDS[number]):number{return(pw as any)[`${day}_${sub}`]??0;}
function calcTotals(pw:PayrollWeek){
  let totalOT=0,totalBonus=0,totalComm=0,totalDeduct=0;
  for(const d of DAYS){totalOT+=getDayVal(pw,d,"ot");totalBonus+=getDayVal(pw,d,"bonus");totalComm+=getDayVal(pw,d,"commission");totalDeduct+=getDayVal(pw,d,"prep")+getDayVal(pw,d,"afk")+getDayVal(pw,d,"off");}
  return{totalOT,totalBonus,totalComm,totalAddable:totalOT+totalBonus+totalComm,totalDeduct};
}

const UI={
  card:"bg-white rounded-xl border border-slate-200/60 shadow-sm",
  control:"w-full rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200",
  miniInput:"w-16 rounded border border-slate-200 px-1.5 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-slate-300 tabular-nums",
  btnPrimary:"px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition",
  btnGhost:"px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition",
  pill:"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-slate-200/70 bg-slate-50 text-slate-700",
};

export default function CCPayroll(){
  useEffect(()=>{const pb=document.body.style.overflow;const ph=document.documentElement.style.overflow;document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";return()=>{document.body.style.overflow=pb;document.documentElement.style.overflow=ph;};}, []);

  const[staff,setStaff]=useState<Staff[]>([]);
  const[weeks,setWeeks]=useState<PayrollWeek[]>([]);
  const[commissions,setCommissions]=useState<Commission[]>([]);
  const[loading,setLoading]=useState(true);
  const[msg,setMsg]=useState<{text:string;type:"ok"|"err"}|null>(null);
  const[selectedWeek,setSelectedWeek]=useState(()=>fmtIso(getMonday(new Date())));
  const[searchQ,setSearchQ]=useState("");
  const[editPW,setEditPW]=useState<PayrollWeek|null>(null);
  const[editComms,setEditComms]=useState<Commission[]>([]);
  const[editStaff,setEditStaff]=useState<Staff|null>(null);
  const[saving,setSaving]=useState(false);
  const[showStaffMgr,setShowStaffMgr]=useState(false);
  const[newStaffName,setNewStaffName]=useState("");
  const[importLoading,setImportLoading]=useState(false);
  const[customPayStyles,setCustomPayStyles]=useState<string[]>([]);
  const[showOtherInput,setShowOtherInput]=useState(false);
  const[otherPayStyle,setOtherPayStyle]=useState("");

  const allPayStyles = useMemo(()=>{
    const set = new Set([...DEFAULT_PAY_STYLES,...customPayStyles]);
    staff.forEach(s=>{if(s.pay_style&&s.pay_style!=="")set.add(s.pay_style);});
    weeks.forEach(w=>{if(w.pay_style&&w.pay_style!=="")set.add(w.pay_style);});
    return Array.from(set).sort();
  },[customPayStyles,staff,weeks]);

  const flash=(text:string,type:"ok"|"err"="ok")=>{setMsg({text,type});setTimeout(()=>setMsg(null),3000);};

  const loadStaff=useCallback(async()=>{
    const{data}=await supabase.from("cc_payroll_staff").select("*").order("name");
    if(data)setStaff(data.map((s:any)=>({...s,weekly_rate:n2(s.weekly_rate),pay_style:s.pay_style??""})));
  },[]);

  const loadWeek=useCallback(async()=>{
    setLoading(true);
    const{data:wData}=await supabase.from("cc_payroll_weeks").select("*").eq("week_start",selectedWeek);
    const pwList=(wData??[]).map((w:any)=>{
      const out:any={...w};
      for(const d of DAYS)for(const s of SUB_FIELDS)out[`${d}_${s}`]=n2(out[`${d}_${s}`]);
      out.amount_paid=n2(out.amount_paid); out.pay_style=out.pay_style??"";
      return out as PayrollWeek;
    });
    setWeeks(pwList);
    if(pwList.length>0){
      const ids=pwList.map(w=>w.id);
      const{data:cData}=await supabase.from("cc_payroll_commissions").select("*").in("payroll_week_id",ids);
      setCommissions((cData??[]).map((c:any)=>({...c,commission_rate:n2(c.commission_rate),commission_amount:n2(c.commission_amount)})));
    }else{setCommissions([]);}
    setLoading(false);
  },[selectedWeek]);

  useEffect(()=>{loadStaff();},[loadStaff]);
  useEffect(()=>{loadWeek();},[loadWeek]);

  async function generateWeek(){
    setSaving(true);
    const activeStaff=staff.filter(s=>s.status==="Active"||s.status==="OFF");
    if(!activeStaff.length){flash("No active staff.","err");setSaving(false);return;}
    const existing=new Set(weeks.map(w=>w.staff_id));
    const toInsert=activeStaff.filter(s=>!existing.has(s.id));
    if(!toInsert.length){flash("All active staff already have entries.");setSaving(false);return;}
    const rows=toInsert.map(s=>({staff_id:s.id,week_start:selectedWeek,pay_style:s.pay_style||""}));
    const{error}=await supabase.from("cc_payroll_weeks").insert(rows);
    if(error){flash(`Error: ${error.message}`,"err");setSaving(false);return;}
    flash(`Generated ${toInsert.length} entries.`);setSaving(false);loadWeek();
  }

  async function importFromDeals(){
    setImportLoading(true);
    const{data}=await supabase.from("deals_view").select("call_center_appointment_setter").not("call_center_appointment_setter","is",null);
    if(!data){flash("No data found","err");setImportLoading(false);return;}
    const names=[...new Set(data.map((d:any)=>d.call_center_appointment_setter?.trim()).filter(Boolean))];
    const existingNames=new Set(staff.map(s=>s.name));
    const newNames=names.filter(n=>!existingNames.has(n));
    if(!newNames.length){flash("All already imported.");setImportLoading(false);return;}
    const{error}=await supabase.from("cc_payroll_staff").insert(newNames.map(n=>({name:n,status:"Active",weekly_rate:0,pay_style:"Wise"})));
    if(error){flash(`Error: ${error.message}`,"err");setImportLoading(false);return;}
    flash(`Imported ${newNames.length} new staff.`);setImportLoading(false);loadStaff();
  }

  async function addNewStaff(){
    if(!newStaffName.trim())return;
    const{error}=await supabase.from("cc_payroll_staff").insert({name:newStaffName.trim(),status:"Active",weekly_rate:0,pay_style:"Wise"});
    if(error)flash(`Error: ${error.message}`,"err");
    else{setNewStaffName("");loadStaff();}
  }
  async function updateStaffField(id:string,field:string,value:any){
    const{error}=await supabase.from("cc_payroll_staff").update({[field]:value,updated_at:new Date().toISOString()}).eq("id",id);
    if(error)flash(`Error: ${error.message}`,"err"); else loadStaff();
  }

  async function savePayrollEntry(){
    if(!editPW)return;
    setSaving(true);
    const payload:any={};
    for(const d of DAYS)for(const s of SUB_FIELDS)payload[`${d}_${s}`]=n2((editPW as any)[`${d}_${s}`]);
    payload.amount_paid=n2(editPW.amount_paid);
    payload.date_paid=editPW.date_paid||null;
    payload.pay_style=editPW.pay_style||"";
    payload.notes=editPW.notes||null;
    payload.updated_at=new Date().toISOString();
    const{error}=await supabase.from("cc_payroll_weeks").update(payload).eq("id",editPW.id);
    if(error){flash(`Error: ${error.message}`,"err");setSaving(false);return;}
    await supabase.from("cc_payroll_commissions").delete().eq("payroll_week_id",editPW.id);
    if(editComms.length>0){
      const cRows=editComms.map(c=>({payroll_week_id:editPW.id,account_name:c.account_name,commission_rate:n2(c.commission_rate),commission_amount:n2(c.commission_amount),notes:c.notes}));
      await supabase.from("cc_payroll_commissions").insert(cRows);
    }
    flash("Saved!");setSaving(false);setEditPW(null);loadWeek();
  }

  const staffMap=useMemo(()=>new Map(staff.map(s=>[s.id,s])),[staff]);
  const weekDates=useMemo(()=>{const mon=new Date(selectedWeek+"T00:00:00");return DAYS.map((_,i)=>fmtIso(addDays(mon,i)));},[selectedWeek]);
  function prevWeek(){const d=new Date(selectedWeek+"T00:00:00");d.setDate(d.getDate()-7);setSelectedWeek(fmtIso(d));}
  function nextWeek(){const d=new Date(selectedWeek+"T00:00:00");d.setDate(d.getDate()+7);setSelectedWeek(fmtIso(d));}

  /* Filtered rows */
  const filteredWeeks=useMemo(()=>{
    if(!searchQ.trim())return weeks;
    const q=searchQ.trim().toLowerCase();
    return weeks.filter(pw=>{const s=staffMap.get(pw.staff_id);return s&&s.name.toLowerCase().includes(q);});
  },[weeks,searchQ,staffMap]);

  /* Weekly summary */
  const weeklySummary=useMemo(()=>{
    let totalPay=0,totalPaid=0,totalComms=0,totalAddable=0,totalDeduct=0,count=0;
    const byPayStyle=new Map<string,number>();
    for(const pw of weeks){
      const s=staffMap.get(pw.staff_id); if(!s)continue; count++;
      const t=calcTotals(pw);
      const pwComms=commissions.filter(c=>c.payroll_week_id===pw.id);
      const commAmt=pwComms.reduce((a,c)=>a+c.commission_amount,0);
      const total=s.weekly_rate+t.totalAddable+commAmt-t.totalDeduct;
      totalPay+=total; totalPaid+=pw.amount_paid; totalComms+=commAmt;
      totalAddable+=t.totalAddable; totalDeduct+=t.totalDeduct;
      const ps=pw.pay_style||s.pay_style||"Unset";
      byPayStyle.set(ps,(byPayStyle.get(ps)??0)+total);
    }
    return{totalPay,totalPaid,totalComms,totalAddable,totalDeduct,unpaid:totalPay-totalPaid,count,byPayStyle:Array.from(byPayStyle.entries()).sort((a,b)=>b[1]-a[1])};
  },[weeks,commissions,staffMap]);

  /* Person summary for search */
  const personSummary=useMemo(()=>{
    if(!searchQ.trim()||filteredWeeks.length===0)return null;
    let total=0,paid=0,comms=0;
    for(const pw of filteredWeeks){
      const s=staffMap.get(pw.staff_id); if(!s)continue;
      const t=calcTotals(pw);
      const pwComms=commissions.filter(c=>c.payroll_week_id===pw.id);
      const commAmt=pwComms.reduce((a,c)=>a+c.commission_amount,0);
      total+=s.weekly_rate+t.totalAddable+commAmt-t.totalDeduct;
      paid+=pw.amount_paid; comms+=commAmt;
    }
    return{total,paid,unpaid:total-paid,comms};
  },[searchQ,filteredWeeks,commissions,staffMap]);

  const containerStyle:React.CSSProperties={height:`calc(100dvh - ${PORTAL_HEADER_PX}px)`,maxHeight:`calc(100dvh - ${PORTAL_HEADER_PX}px)`};

  /* Compact summary rows for overview table */
  function daysWorked(pw:PayrollWeek):string{
    const abbr=["M","T","W","Th","F"];
    const parts:string[]=[];
    for(let i=0;i<DAYS.length;i++){
      const d=DAYS[i];
      const segs:string[]=[];
      for(const sf of SUB_FIELDS){const v=getDayVal(pw,d,sf);if(v>0)segs.push(`${sf==="ot"?"O/T":sf==="commission"?"Comm":sf.charAt(0).toUpperCase()+sf.slice(1)} ${v}${sf==="bonus"||sf==="commission"?"":""}`);}
      if(segs.length>0)parts.push(`${abbr[i]} ${segs.join(", ")}`);
    }
    // Also append bonus info
    const bonusTotal=DAYS.reduce((a,d)=>a+getDayVal(pw,d,"bonus"),0);
    const commTotal=DAYS.reduce((a,d)=>a+getDayVal(pw,d,"commission"),0);
    const extras:string[]=[];
    if(bonusTotal>0)extras.push(`Bonus $${bonusTotal}`);
    if(commTotal>0)extras.push(`Comm $${commTotal}`);
    const main=parts.join("; ");
    return extras.length>0?`${main}${main?"; ":""}${extras.join("; ")}`:main;
  }

  const summaryRows=useMemo(()=>{
    return weeks.map(pw=>{
      const s=staffMap.get(pw.staff_id); if(!s)return null;
      const t=calcTotals(pw);
      const pwComms=commissions.filter(c=>c.payroll_week_id===pw.id);
      const commAmt=pwComms.reduce((a,c)=>a+c.commission_amount,0);
      const totalAmount=s.weekly_rate+t.totalAddable+commAmt-t.totalDeduct;
      const payStyle=pw.pay_style||s.pay_style||"";
      const commNotes=pwComms.length>0?pwComms.map(c=>`${c.account_name}${c.commission_amount>0?" $"+c.commission_amount:""}`).join(", "):"";
      return{name:s.name,weekWorked:fmtFull(pw.week_start),daysWorked:daysWorked(pw),payAmount:totalAmount,amountPaid:pw.amount_paid,datePaid:pw.date_paid?fmtFull(pw.date_paid):"",payStyle,commNotes};
    }).filter(Boolean) as {name:string;weekWorked:string;daysWorked:string;payAmount:number;amountPaid:number;datePaid:string;payStyle:string;commNotes:string}[];
  },[weeks,commissions,staffMap]);

  return(
    <div className="min-h-0 flex flex-col overflow-hidden bg-slate-50" style={containerStyle}>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-slate-900">CC Payroll</div>
              <div className="text-[11px] text-slate-500">Weekly payroll · Click row to edit · Search to filter by name</div>
            </div>
            <div className="flex gap-2 items-center">
              <span className={UI.pill}>{loading?"Loading…":`${weeks.length} entries`}</span>
              <button className={UI.btnGhost} onClick={()=>setShowStaffMgr(true)}>Manage Staff</button>
              <button className={UI.btnPrimary} onClick={generateWeek} disabled={saving}>{saving?"…":"Generate Week"}</button>
            </div>
          </div>
          {msg&&<div className={`rounded-lg px-3 py-2 text-xs ${msg.type==="err"?"bg-red-50 text-red-700 border border-red-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>{msg.text}</div>}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-3">
            {/* Left: week nav + search */}
            <div className={`${UI.card} p-3 space-y-2`}>
              <div className="flex items-center gap-3">
                <button className={UI.btnGhost} onClick={prevWeek}>← Prev</button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">Week of</span>
                  <input type="date" className={`${UI.control} w-40`} value={selectedWeek} onChange={e=>{const d=new Date(e.target.value+"T00:00:00");setSelectedWeek(fmtIso(getMonday(d)));}} />
                  <span className="text-xs text-slate-500">{fmtFull(weekDates[0])} – {fmtFull(weekDates[4])}</span>
                </div>
                <button className={UI.btnGhost} onClick={nextWeek}>Next →</button>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Search</div>
                <input className={`${UI.control} max-w-xs`} placeholder="Filter by name…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} />
                {searchQ&&<button className="text-[10px] text-slate-400 hover:text-slate-600" onClick={()=>setSearchQ("")}>Clear</button>}
              </div>
              {personSummary&&(
                <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2 grid grid-cols-4 gap-2 text-xs">
                  <div><div className="text-[9px] text-indigo-500 uppercase font-semibold">Total Pay</div><div className="font-bold text-indigo-800">{money(personSummary.total)}</div></div>
                  <div><div className="text-[9px] text-emerald-500 uppercase font-semibold">Paid</div><div className="font-bold text-emerald-700">{money(personSummary.paid)}</div></div>
                  <div><div className="text-[9px] text-red-500 uppercase font-semibold">Unpaid</div><div className="font-bold text-red-600">{money(personSummary.unpaid)}</div></div>
                  <div><div className="text-[9px] text-slate-500 uppercase font-semibold">Commissions</div><div className="font-bold">{money(personSummary.comms)}</div></div>
                </div>
              )}
            </div>

            {/* Right: weekly summary */}
            <div className={`${UI.card} p-3`}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Weekly Summary</div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2"><div className="text-[9px] text-blue-500 uppercase font-semibold">Total Payroll</div><div className="font-bold text-lg text-blue-800">{money(weeklySummary.totalPay)}</div></div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2"><div className="text-[9px] text-emerald-500 uppercase font-semibold">Total Paid</div><div className="font-bold text-lg text-emerald-700">{money(weeklySummary.totalPaid)}</div></div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-2"><div className="text-[9px] text-red-500 uppercase font-semibold">Unpaid</div><div className="font-bold text-lg text-red-600">{money(weeklySummary.unpaid)}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div><div className="text-[9px] text-slate-400 uppercase font-semibold">Addable</div><div className="font-semibold text-emerald-700">{money(weeklySummary.totalAddable)}</div></div>
                <div><div className="text-[9px] text-slate-400 uppercase font-semibold">Deductible</div><div className="font-semibold text-red-600">{money(weeklySummary.totalDeduct)}</div></div>
                <div><div className="text-[9px] text-slate-400 uppercase font-semibold">Commissions</div><div className="font-semibold">{money(weeklySummary.totalComms)}</div></div>
              </div>
              {weeklySummary.byPayStyle.length>0&&(
                <div className="border-t border-slate-200 pt-2">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">By Pay Style</div>
                  <div className="flex flex-wrap gap-2">
                    {weeklySummary.byPayStyle.map(([style,amt])=>(
                      <span key={style} className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px]">
                        <span className="font-semibold text-slate-700">{style}:</span><span className="tabular-nums">{money(amt)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Compact payroll overview */}
          {summaryRows.length>0&&(
            <div className={`${UI.card} p-3`}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Payroll Overview</div>
              <div className="overflow-x-auto max-h-[30vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-lime-300/80 text-slate-900 text-left">
                      <th className="px-2 py-1.5 font-bold border-r border-lime-400/50">Worker Name</th>
                      <th className="px-2 py-1.5 font-bold border-r border-lime-400/50">Week Worked</th>
                      <th className="px-2 py-1.5 font-bold border-r border-lime-400/50">Days Worked</th>
                      <th className="px-2 py-1.5 font-bold text-right border-r border-lime-400/50">Pay Amount</th>
                      <th className="px-2 py-1.5 font-bold text-right border-r border-lime-400/50">Amount Paid</th>
                      <th className="px-2 py-1.5 font-bold border-r border-lime-400/50">Date Paid</th>
                      <th className="px-2 py-1.5 font-bold border-r border-lime-400/50">Pay Style</th>
                      <th className="px-2 py-1.5 font-bold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((r,i)=>(
                      <tr key={i} className={`border-b border-slate-200/50 ${r.amountPaid>=r.payAmount&&r.payAmount>0?"bg-lime-100/40":"bg-white"} hover:bg-slate-50`}>
                        <td className="px-2 py-1.5 font-medium border-r border-slate-200/40 whitespace-nowrap">{r.name}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200/40 tabular-nums">{r.weekWorked}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200/40 text-[10px] text-slate-600 max-w-[320px] truncate" title={r.daysWorked}>{r.daysWorked||""}</td>
                        <td className="px-2 py-1.5 text-right border-r border-slate-200/40 tabular-nums font-semibold">{money(r.payAmount)}</td>
                        <td className="px-2 py-1.5 text-right border-r border-slate-200/40 tabular-nums">{r.amountPaid>0?money(r.amountPaid):""}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200/40 tabular-nums">{r.datePaid}</td>
                        <td className="px-2 py-1.5 border-r border-slate-200/40">{r.payStyle}</td>
                        <td className="px-2 py-1.5 text-[10px] text-slate-500 max-w-[200px] truncate" title={r.commNotes}>{r.commNotes}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {weeklySummary.byPayStyle.map(([style,amt])=>(
                      <tr key={style} className="border-t border-slate-300 bg-slate-50">
                        <td className="px-2 py-1.5 font-bold text-right" colSpan={3}>{style}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{money(amt)}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{money(weeks.reduce((a,pw)=>{const s=staffMap.get(pw.staff_id);return(pw.pay_style||s?.pay_style||"Unset")===style?a+pw.amount_paid:a;},0))}</td>
                        <td colSpan={3}></td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-400 bg-slate-100">
                      <td className="px-2 py-2 font-bold text-right" colSpan={3}>GRAND TOTAL</td>
                      <td className="px-2 py-2 text-right font-bold text-sm tabular-nums">{money(weeklySummary.totalPay)}</td>
                      <td className="px-2 py-2 text-right font-bold text-sm tabular-nums">{money(weeklySummary.totalPaid)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Detail Table */}
      <div className="flex-1 min-h-0 px-4 pb-2">
        <div className={`${UI.card} h-full overflow-auto`}>
          <table className="min-w-[2600px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
              <tr className="border-b border-slate-200/60">
                <th className="px-2 py-1.5 text-left font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>CC App Setter</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Status</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Weekly Rate</th>
                {DAYS.map((d,i)=>(
                  <th key={d} colSpan={6} className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 bg-slate-50/50">
                    {DAY_LABELS[i]} <span className="font-normal text-slate-400">({fmtShort(weekDates[i])})</span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 bg-emerald-50" rowSpan={2}>Addable</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 bg-red-50" rowSpan={2}>Deductible</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Commissions</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-800 border-r border-slate-200/60 bg-blue-50" rowSpan={2}>Pay Amount</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Amt Paid</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Date Paid</th>
                <th className="px-2 py-1.5 text-center font-semibold text-slate-700" rowSpan={2}>Pay Style</th>
              </tr>
              <tr className="border-b-2 border-slate-300">
                {DAYS.map(d=>SUB_LABELS.map((sl,si)=>(
                  <th key={`${d}-${si}`} className={`px-1 py-1 text-center text-[9px] font-semibold uppercase tracking-wider border-r border-slate-200/40 ${si>=3?"text-emerald-600 bg-emerald-50/30":"text-red-500 bg-red-50/20"}`}>{sl}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {loading?(
                <tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={42}>Loading…</td></tr>
              ):filteredWeeks.length===0?(
                <tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={42}>{weeks.length===0?'No payroll entries. Click "Generate Week".':'No results for search.'}</td></tr>
              ):(
                filteredWeeks.map(pw=>{
                  const s=staffMap.get(pw.staff_id); if(!s)return null;
                  const t=calcTotals(pw);
                  const pwComms=commissions.filter(c=>c.payroll_week_id===pw.id);
                  const totalCommAmt=pwComms.reduce((a,c)=>a+c.commission_amount,0);
                  const totalAmount=s.weekly_rate+t.totalAddable+totalCommAmt-t.totalDeduct;
                  const statusColor=s.status==="Active"?"bg-emerald-100 text-emerald-700":s.status==="OFF"?"bg-amber-100 text-amber-700":"bg-gray-200 text-gray-500";
                  const payStyle=pw.pay_style||s.pay_style||"";
                  return(
                    <tr key={pw.id} onClick={()=>{setEditPW({...pw});setEditComms(pwComms.map(c=>({...c})));setEditStaff(s);setShowOtherInput(false);}} className="border-b border-slate-200/40 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                      <td className="px-2 py-2 whitespace-nowrap font-medium border-r border-slate-200/40">{s.name}</td>
                      <td className="px-2 py-2 text-center border-r border-slate-200/40"><span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${statusColor}`}>{s.status}</span></td>
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 tabular-nums">{money(s.weekly_rate)}</td>
                      {DAYS.map(d=>SUB_FIELDS.map((sf,si)=>{
                        const v=getDayVal(pw,d,sf);
                        return <td key={`${d}-${sf}`} className={`px-1 py-2 text-center border-r border-slate-200/30 tabular-nums ${v>0?(si>=3?"text-emerald-700 font-semibold":"text-red-600 font-semibold"):"text-slate-300"}`}>{v||""}</td>;
                      }))}
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 font-semibold text-emerald-700 bg-emerald-50/30 tabular-nums">{money(t.totalAddable)}</td>
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 font-semibold text-red-600 bg-red-50/30 tabular-nums">{money(t.totalDeduct)}</td>
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 tabular-nums">{totalCommAmt>0?money(totalCommAmt):""}{pwComms.length>0&&<span className="text-[9px] text-slate-400 ml-1">({pwComms.length})</span>}</td>
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 font-bold text-slate-900 bg-blue-50/30 tabular-nums">{money(totalAmount)}</td>
                      <td className="px-2 py-2 text-right border-r border-slate-200/40 tabular-nums">{pw.amount_paid>0?money(pw.amount_paid):""}</td>
                      <td className="px-2 py-2 text-center border-r border-slate-200/40 tabular-nums">{pw.date_paid?fmtFull(pw.date_paid):""}</td>
                      <td className="px-2 py-2 text-center text-[10px]">{payStyle&&<span className="bg-slate-100 rounded px-1.5 py-0.5 font-medium">{payStyle}</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ EDIT DIALOG ═══ */}
      {editPW&&editStaff&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>{setEditPW(null);setEditStaff(null);}}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col" onClick={ev=>ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0">
              <div>
                <div className="text-sm font-semibold text-slate-800">{editStaff.name} — Week of {fmtFull(editPW.week_start)}</div>
                <div className="text-[10px] text-slate-400">Weekly: {money(editStaff.weekly_rate)} · Hourly: {money(editStaff.weekly_rate/5/8)} · Daily: {money(editStaff.weekly_rate/5)} · Monthly: {money(editStaff.weekly_rate*4)} · Yearly: {money(editStaff.weekly_rate*52)}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={()=>{setEditPW(null);setEditStaff(null);}}>✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Daily hours */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Daily Hours & Amounts</div>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead><tr className="bg-slate-50">
                    <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200">Day</th>
                    {SUB_LABELS.map((sl,i)=><th key={sl} className={`px-2 py-1.5 text-center font-semibold border-r border-slate-200 ${i>=3?"text-emerald-700":"text-red-600"}`}>{sl}</th>)}
                  </tr></thead>
                  <tbody>
                    {DAYS.map((d,di)=>(
                      <tr key={d} className="border-t border-slate-200">
                        <td className="px-2 py-1.5 font-medium border-r border-slate-200 bg-slate-50/50">{DAY_LABELS[di]} <span className="text-slate-400 text-[9px]">{fmtShort(weekDates[di])}</span></td>
                        {SUB_FIELDS.map(sf=>(
                          <td key={sf} className="px-1 py-1 text-center border-r border-slate-200">
                            <input type="number" step="any" className={UI.miniInput} value={(editPW as any)[`${d}_${sf}`]||""} onChange={e=>setEditPW(p=>p?{...p,[`${d}_${sf}`]:n2(e.target.value)}:p)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Commissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Commissions</div>
                  <button className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800" onClick={()=>setEditComms(c=>[...c,{id:`new-${Date.now()}`,payroll_week_id:editPW.id,account_name:"",commission_rate:0,commission_amount:0,notes:null}])}>+ Add Commission</button>
                </div>
                {editComms.length===0?(<div className="text-xs text-slate-400 italic">No commissions.</div>):(
                  <div className="space-y-2">{editComms.map((c,ci)=>(
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="flex-1 grid grid-cols-4 gap-2">
                        <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Account Name</label><input className={UI.control} value={c.account_name} onChange={e=>{const arr=[...editComms];arr[ci]={...arr[ci],account_name:e.target.value};setEditComms(arr);}} /></div>
                        <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Rate</label><input type="number" step="any" className={UI.control} value={c.commission_rate||""} onChange={e=>{const arr=[...editComms];arr[ci]={...arr[ci],commission_rate:n2(e.target.value)};setEditComms(arr);}} /></div>
                        <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Amount</label><input type="number" step="any" className={UI.control} value={c.commission_amount||""} onChange={e=>{const arr=[...editComms];arr[ci]={...arr[ci],commission_amount:n2(e.target.value)};setEditComms(arr);}} /></div>
                        <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Notes</label><input className={UI.control} value={c.notes??""} onChange={e=>{const arr=[...editComms];arr[ci]={...arr[ci],notes:e.target.value||null};setEditComms(arr);}} /></div>
                      </div>
                      <button className="text-red-400 hover:text-red-600 text-sm px-1" onClick={()=>setEditComms(cc=>cc.filter((_,i)=>i!==ci))}>✕</button>
                    </div>
                  ))}</div>
                )}
              </div>

              {/* Payment + Pay Style */}
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment</div>
                <div className="grid grid-cols-4 gap-3">
                  <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Amount Paid</label><input type="number" step="any" className={UI.control} value={editPW.amount_paid||""} onChange={e=>setEditPW(p=>p?{...p,amount_paid:n2(e.target.value)}:p)} /></div>
                  <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Date Paid</label><input type="date" className={UI.control} value={editPW.date_paid??""} onChange={e=>setEditPW(p=>p?{...p,date_paid:e.target.value||null}:p)} /></div>
                  <div>
                    <label className="text-[9px] font-semibold text-slate-500 uppercase">Pay Style</label>
                    {showOtherInput?(
                      <div className="flex gap-1">
                        <input className={UI.control} placeholder="Enter custom pay style…" value={otherPayStyle} onChange={e=>setOtherPayStyle(e.target.value)} />
                        <button className={UI.btnPrimary} onClick={()=>{if(otherPayStyle.trim()){setCustomPayStyles(p=>[...p,otherPayStyle.trim()]);setEditPW(p=>p?{...p,pay_style:otherPayStyle.trim()}:p);setShowOtherInput(false);setOtherPayStyle("");}}} >OK</button>
                        <button className={UI.btnGhost} onClick={()=>{setShowOtherInput(false);setOtherPayStyle("");}}>✕</button>
                      </div>
                    ):(
                      <select className={UI.control} value={editPW.pay_style||""} onChange={e=>{if(e.target.value==="__other__"){setShowOtherInput(true);}else{setEditPW(p=>p?{...p,pay_style:e.target.value}:p);}}}>
                        <option value="">Select…</option>
                        {allPayStyles.map(ps=><option key={ps} value={ps}>{ps}</option>)}
                        <option value="__other__">Other (specify)…</option>
                      </select>
                    )}
                  </div>
                  <div><label className="text-[9px] font-semibold text-slate-500 uppercase">Notes</label><input className={UI.control} value={editPW.notes??""} onChange={e=>setEditPW(p=>p?{...p,notes:e.target.value||null}:p)} /></div>
                </div>
              </div>

              {/* Computed summary */}
              {(()=>{
                const t=calcTotals(editPW);
                const totalCommAmt=editComms.reduce((a,c)=>a+c.commission_amount,0);
                const totalAmount=editStaff.weekly_rate+t.totalAddable+totalCommAmt-t.totalDeduct;
                return(
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-5 gap-3 text-xs">
                    <div><div className="text-[9px] text-slate-400 uppercase font-semibold">Weekly Rate</div><div className="font-bold">{money(editStaff.weekly_rate)}</div></div>
                    <div><div className="text-[9px] text-emerald-600 uppercase font-semibold">Addable</div><div className="font-bold text-emerald-700">{money(t.totalAddable)}</div></div>
                    <div><div className="text-[9px] text-slate-400 uppercase font-semibold">Commissions</div><div className="font-bold">{money(totalCommAmt)}</div></div>
                    <div><div className="text-[9px] text-red-500 uppercase font-semibold">Deductible</div><div className="font-bold text-red-600">{money(t.totalDeduct)}</div></div>
                    <div><div className="text-[9px] text-blue-700 uppercase font-semibold">TOTAL AMOUNT</div><div className="font-bold text-lg text-blue-800">{money(totalAmount)}</div></div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0">
              <button className={UI.btnGhost} onClick={()=>{setEditPW(null);setEditStaff(null);}}>Cancel</button>
              <button className={UI.btnPrimary} onClick={savePayrollEntry} disabled={saving}>{saving?"Saving…":"Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STAFF MANAGEMENT DIALOG ═══ */}
      {showStaffMgr&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowStaffMgr(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col" onClick={ev=>ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0">
              <div className="text-sm font-semibold text-slate-800">Manage CC Payroll Staff</div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowStaffMgr(false)}>✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <button className={UI.btnGhost} onClick={importFromDeals} disabled={importLoading}>{importLoading?"Importing…":"Import from Deals"}</button>
                <span className="text-[10px] text-slate-400">Pulls all CC App Setters from deals_view</span>
              </div>
              <div className="flex items-center gap-2">
                <input className={`${UI.control} w-64`} placeholder="New staff name…" value={newStaffName} onChange={e=>setNewStaffName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addNewStaff();}} />
                <button className={UI.btnPrimary} onClick={addNewStaff}>+ Add</button>
              </div>
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-center font-semibold w-24">Status</th>
                  <th className="px-3 py-2 text-right font-semibold w-28">Weekly Rate</th>
                  <th className="px-3 py-2 text-center font-semibold w-32">Pay Style</th>
                  <th className="px-3 py-2 text-right font-semibold w-20">Hourly</th>
                  <th className="px-3 py-2 text-right font-semibold w-20">Daily</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">Monthly</th>
                </tr></thead>
                <tbody>
                  {staff.map(s=>{
                    const hr=s.weekly_rate/5/8;const dy=s.weekly_rate/5;const mo=s.weekly_rate*4;
                    return(
                      <tr key={s.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-center">
                          <select className="text-[10px] font-bold rounded px-1.5 py-0.5 border border-slate-200 cursor-pointer bg-white" value={s.status} onChange={e=>updateStaffField(s.id,"status",e.target.value)}>
                            <option value="Active">Active</option><option value="OFF">OFF</option><option value="SNR">SNR</option>
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="number" step="any" className="w-full text-right text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:ring-1 focus:ring-slate-300 outline-none" defaultValue={s.weekly_rate||""} onBlur={e=>updateStaffField(s.id,"weekly_rate",n2(e.target.value))} /></td>
                        <td className="px-3 py-2 text-center">
                          <select className="text-[10px] rounded px-1.5 py-0.5 border border-slate-200 cursor-pointer bg-white" value={s.pay_style||""} onChange={e=>updateStaffField(s.id,"pay_style",e.target.value)}>
                            <option value="">Select…</option>
                            {allPayStyles.map(ps=><option key={ps} value={ps}>{ps}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{money(hr)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{money(dy)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{money(mo)}</td>
                      </tr>
                    );
                  })}
                  {staff.length===0&&<tr><td className="px-3 py-4 text-slate-400 text-center" colSpan={7}>No staff yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0">
              <button className={UI.btnGhost} onClick={()=>setShowStaffMgr(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
