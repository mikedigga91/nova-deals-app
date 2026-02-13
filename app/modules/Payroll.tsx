"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PH = 64;
const DAYS = ["mon","tue","wed","thu","fri"] as const;
const DL = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const SUB_FIELDS = ["prep","afk","off","snr","ot","bonus","commission"] as const;
const DEFAULT_PS = ["Direct Deposit","Wise","Remitly","Paypal","CashApp"];
const TEAMS = ["NovaNRG","MHHS"] as const;
const DHM_FIELDS = ["prep","afk","off"] as const;

const DEPARTMENTS = ["Finance","Operation","Human Resources","Call Center","Contingencies"] as const;
const POSITIONS_BY_DEPT:Record<string,string[]> = {
  "Finance":["Chief Accountant","Payroll Accountant","Auditor"],
  "Operation":["Operations Manager","Project Manager","Accounts Coordinator","Project Coordinator","Scheduling Coordinator","Utilities Coordinator","Bank Coordinator","Permitting Coordinator"],
  "Human Resources":["Human Resources Manager","Recruitment Coordinator","Recruiter"],
  "Call Center":["CC Manager","Appointment Setter"],
  "Contingencies":["Videographer","Leads Generator"],
};
const DEPT_ORDER = ["Finance","Operation","Human Resources","Call Center","Contingencies"];

type Staff={id:string;name:string;team:string;status:"Active"|"OFF"|"SNR";weekly_rate:number;pay_style:string;snr_date:string|null;department:string;position:string;sign_on_date:string|null};
type PW={
  id:string;staff_id:string;week_start:string;
  mon_prep:number;mon_afk:number;mon_off:number;mon_snr:number;mon_ot:number;mon_bonus:number;mon_commission:number;
  tue_prep:number;tue_afk:number;tue_off:number;tue_snr:number;tue_ot:number;tue_bonus:number;tue_commission:number;
  wed_prep:number;wed_afk:number;wed_off:number;wed_snr:number;wed_ot:number;wed_bonus:number;wed_commission:number;
  thu_prep:number;thu_afk:number;thu_off:number;thu_snr:number;thu_ot:number;thu_bonus:number;thu_commission:number;
  fri_prep:number;fri_afk:number;fri_off:number;fri_snr:number;fri_ot:number;fri_bonus:number;fri_commission:number;
  amount_paid:number;date_paid:string|null;pay_style:string;notes:string|null;
  bonus_notes:string|null;ot_reason:string|null;
};
type Comm={id:string;payroll_week_id:string;account_name:string;commission_rate:number;commission_amount:number;notes:string|null};

function getMonday(d:Date){const dt=new Date(d);const day=dt.getDay();dt.setDate(dt.getDate()-day+(day===0?-6:1));dt.setHours(0,0,0,0);return dt;}
function fi(d:Date){return d.toISOString().slice(0,10);}
function ad(d:Date,n:number){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function fs(iso:string){const p=iso.split("-");return`${p[1]}/${p[2]}`;}
function ff(iso:string){if(!iso)return"";const p=iso.split("-");return`${p[1]}/${p[2]}/${p[0].slice(-2)}`;}
function $(n:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);}
function n2(v:any):number{const n=Number(v);return Number.isNaN(n)?0:Math.round(n*100)/100;}
function gv(pw:PW,d:typeof DAYS[number],s:typeof SUB_FIELDS[number]):number{return(pw as any)[`${d}_${s}`]??0;}
/* Find SNR day index (-1 = none). Days from SNR onward count as full deduction. */
function snrDayIdx(pw:PW):number{for(let i=0;i<DAYS.length;i++)if(gv(pw,DAYS[i],"snr")>0)return i;return-1;}
function calc(pw:PW,hourlyRate:number=0){let ot=0,bn=0,cm=0,dedHrs=0;const si=snrDayIdx(pw);for(let i=0;i<DAYS.length;i++){const d=DAYS[i];if(si>=0&&i>=si){dedHrs+=8;continue;}ot+=gv(pw,d,"ot");bn+=gv(pw,d,"bonus");cm+=gv(pw,d,"commission");dedHrs+=gv(pw,d,"prep")+gv(pw,d,"afk")+gv(pw,d,"off");}const ded=n2(dedHrs*hourlyRate);const workDays=si>=0?si:5;return{ot,bn,cm,add:ot+bn+cm,ded,dedHrs,workDays,snrDay:si};}
function hoursToDHM(hrs:number):{d:number;h:number;m:number}{if(!hrs)return{d:0,h:0,m:0};const t=Math.round(hrs*60);const d=Math.floor(t/480);const r=t-d*480;return{d,h:Math.floor(r/60),m:r%60};}
function dhmToHours(d:number,h:number,m:number):number{return n2(d*8+h+m/60);}
function daysStr(pw:PW):string{const ab=["M","T","W","Th","F"];const parts:string[]=[];const si=snrDayIdx(pw);for(let i=0;i<DAYS.length;i++){const d=DAYS[i];if(si>=0&&i>si)continue;/* skip days after SNR */const segs:string[]=[];if(gv(pw,d,"snr")>0){parts.push(`${ab[i]} SNR`);continue;}const prep=gv(pw,d,"prep");if(prep>0)segs.push(`Prep ${prep} Hr`);const afk=gv(pw,d,"afk");if(afk>0)segs.push(`AFK ${afk} Hr`);const off=gv(pw,d,"off");if(off>=8)segs.push("Off Day");else if(off>0)segs.push(`Off ${off} Hr`);const ot=gv(pw,d,"ot");if(ot>0)segs.push(`O/T $${ot}`);const bn=gv(pw,d,"bonus");if(bn>0)segs.push(`Bonus $${bn}`);const cm=gv(pw,d,"commission");if(cm>0)segs.push(`Comm $${cm}`);if(segs.length)parts.push(`${ab[i]} ${segs.join(", ")}`);}return parts.join("; ");}

export type PayrollTeamSummary={team:string;totalPay:number;totalPaid:number;unpaid:number;totalComms:number;byPayStyle:{style:string;amount:number}[]};

const UI={
  card:"bg-white rounded-xl border border-slate-200/60 shadow-sm",
  ctrl:"w-full rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200",
  mini:"w-16 rounded border border-slate-200 px-1.5 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-slate-300 tabular-nums",
  bp:"px-3 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:bg-slate-800 active:scale-[0.99] transition",
  bg:"px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50 active:scale-[0.99] transition",
  bd:"px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 active:scale-[0.99] transition",
  pill:"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border border-slate-200/70 bg-slate-50 text-slate-700",
};

export default function Payroll(){
  useEffect(()=>{const a=document.body.style.overflow;const b=document.documentElement.style.overflow;document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";return()=>{document.body.style.overflow=a;document.documentElement.style.overflow=b;};},[]);

  const[staff,setStaff]=useState<Staff[]>([]);
  const[weeks,setWeeks]=useState<PW[]>([]);
  const[comms,setComms]=useState<Comm[]>([]);
  const[loading,setLoading]=useState(true);
  const[msg,setMsg]=useState<{t:string;ok:boolean}|null>(null);
  const[selWeek,setSelWeek]=useState(()=>fi(getMonday(new Date())));
  const[searchQ,setSearchQ]=useState("");
  const[teamFilter,setTeamFilter]=useState<string>("");
  const[editPW,setEditPW]=useState<PW|null>(null);
  const[editComms,setEditComms]=useState<Comm[]>([]);
  const[editStaff,setEditStaff]=useState<Staff|null>(null);
  const[saving,setSaving]=useState(false);
  const[showStaff,setShowStaff]=useState(false);
  const[newName,setNewName]=useState("");
  const[newTeam,setNewTeam]=useState<string>("NovaNRG");
  const[newDept,setNewDept]=useState<string>("Call Center");
  const[newPos,setNewPos]=useState<string>("Appointment Setter");
  const[newSignOn,setNewSignOn]=useState<string>("");
  const[impLoading,setImpLoading]=useState(false);
  const[custPS,setCustPS]=useState<string[]>([]);
  const[custPositions,setCustPositions]=useState<string[]>([]);
  const[showOther,setShowOther]=useState(false);
  const[otherPS,setOtherPS]=useState("");
  const[viewMode,setViewMode]=useState<"week"|"month">("week");
  const[selMonth,setSelMonth]=useState(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
  const[monthWeeks,setMonthWeeks]=useState<PW[]>([]);
  const[monthComms,setMonthComms]=useState<Comm[]>([]);
  const[monthLoading,setMonthLoading]=useState(false);
  const[delConfirm,setDelConfirm]=useState(false);
  const[impNames,setImpNames]=useState<string[]>([]);
  const[impSelected,setImpSelected]=useState<Set<string>>(new Set());
  const[showImport,setShowImport]=useState(false);
  const[lastImportIds,setLastImportIds]=useState<string[]>([]);
  const[newPosCustom,setNewPosCustom]=useState(false);
  const[newPosText,setNewPosText]=useState("");
  const[custPosEdit,setCustPosEdit]=useState<string|null>(null);
  const[custPosVal,setCustPosVal]=useState("");
  const[delStaffId,setDelStaffId]=useState<string|null>(null);
  const[sortCol,setSortCol]=useState<"name"|"team"|"dept"|"status">("name");
  const[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const[draftStaff,setDraftStaff]=useState<Staff[]>([]);
  const[dirtyIds,setDirtyIds]=useState<Set<string>>(new Set());

  const allPS=useMemo(()=>{const s=new Set([...DEFAULT_PS,...custPS]);staff.forEach(x=>{if(x.pay_style)s.add(x.pay_style);});weeks.forEach(x=>{if(x.pay_style)s.add(x.pay_style);});return Array.from(s).sort();},[custPS,staff,weeks]);
  /* Dynamic positions: merge defaults + custom + existing from DB */
  const positionsFor=useCallback((dept:string):string[]=>{
    const base=POSITIONS_BY_DEPT[dept]||[];
    const fromDB=staff.filter(s=>s.department===dept&&s.position&&!base.includes(s.position)).map(s=>s.position);
    const custom=custPositions.filter(p=>!base.includes(p)&&!fromDB.includes(p));
    return[...base,...new Set([...fromDB,...custom])];
  },[staff,custPositions]);

  const flash=(t:string,ok=true)=>{setMsg({t,ok});setTimeout(()=>setMsg(null),3000);};
  function parsePW(x:any):PW{const o:any={...x};for(const d of DAYS)for(const s of SUB_FIELDS)o[`${d}_${s}`]=n2(o[`${d}_${s}`]);o.amount_paid=n2(o.amount_paid);o.pay_style=o.pay_style??"";o.bonus_notes=o.bonus_notes??"";o.ot_reason=o.ot_reason??"";return o as PW;}

  const loadStaff=useCallback(async()=>{
    const{data}=await supabase.from("cc_payroll_staff").select("*").order("name");
    if(data)setStaff(data.map((s:any)=>({...s,weekly_rate:n2(s.weekly_rate),pay_style:s.pay_style??"",team:s.team??"NovaNRG",snr_date:s.snr_date??null,department:s.department??"Call Center",position:s.position??"",sign_on_date:s.sign_on_date??null})));
  },[]);

  const loadWeek=useCallback(async()=>{
    setLoading(true);
    const{data:w}=await supabase.from("cc_payroll_weeks").select("*").eq("week_start",selWeek);
    let pw=(w??[]).map(parsePW);
    if(staff.length>0){
      const staffIds=new Set(staff.map(s=>s.id));
      const orphans=pw.filter(x=>!staffIds.has(x.staff_id));
      if(orphans.length){await supabase.from("cc_payroll_weeks").delete().in("id",orphans.map(o=>o.id));pw=pw.filter(x=>staffIds.has(x.staff_id));}
      const ex=new Set(pw.map(x=>x.staff_id));
      const missing=staff.filter(s=>(s.status==="Active"||s.status==="OFF")&&!ex.has(s.id));
      if(missing.length){const rows=missing.map(s=>({staff_id:s.id,week_start:selWeek,pay_style:s.pay_style||""}));const{data:ins}=await supabase.from("cc_payroll_weeks").insert(rows).select("*");if(ins)pw=[...pw,...ins.map(parsePW)];}
    }
    setWeeks(pw);
    if(pw.length){const ids=pw.map(x=>x.id);const{data:c}=await supabase.from("cc_payroll_commissions").select("*").in("payroll_week_id",ids);setComms((c??[]).map((x:any)=>({...x,commission_rate:n2(x.commission_rate),commission_amount:n2(x.commission_amount)})));}else setComms([]);
    setLoading(false);
  },[selWeek,staff]);

  const loadMonth=useCallback(async()=>{
    setMonthLoading(true);
    const[y,m]=selMonth.split("-").map(Number);const start=`${y}-${String(m).padStart(2,"0")}-01`;const end=`${y}-${String(m).padStart(2,"0")}-${new Date(y,m,0).getDate()}`;
    const{data:w}=await supabase.from("cc_payroll_weeks").select("*").gte("week_start",start).lte("week_start",end);
    const pw=(w??[]).map(parsePW);setMonthWeeks(pw);
    if(pw.length){const ids=pw.map(x=>x.id);const{data:c}=await supabase.from("cc_payroll_commissions").select("*").in("payroll_week_id",ids);setMonthComms((c??[]).map((x:any)=>({...x,commission_rate:n2(x.commission_rate),commission_amount:n2(x.commission_amount)})));}else setMonthComms([]);
    setMonthLoading(false);
  },[selMonth]);

  useEffect(()=>{loadStaff();},[loadStaff]);
  useEffect(()=>{loadWeek();},[loadWeek]);
  useEffect(()=>{if(viewMode==="month")loadMonth();},[viewMode,loadMonth]);

  async function openImportPicker(){setImpLoading(true);const{data}=await supabase.from("deals_view").select("call_center_appointment_setter").not("call_center_appointment_setter","is",null);if(!data){flash("No data",false);setImpLoading(false);return;}const names=[...new Set(data.map((d:any)=>d.call_center_appointment_setter?.trim()).filter(Boolean))].sort() as string[];const ex=new Set(staff.map(s=>s.name));const nw=names.filter(n=>!ex.has(n));if(!nw.length){flash("All already imported.");setImpLoading(false);return;}setImpNames(nw);setImpSelected(new Set());setShowImport(true);setImpLoading(false);}
  async function confirmImport(){if(impSelected.size===0)return;setSaving(true);const rows=[...impSelected].map(n=>({name:n,team:"NovaNRG",status:"Active",weekly_rate:0,pay_style:"Wise",department:"Call Center",position:"Appointment Setter"}));const{data:ins,error}=await supabase.from("cc_payroll_staff").insert(rows).select("id");if(error){flash(error.message,false);setSaving(false);return;}setLastImportIds((ins??[]).map((r:any)=>r.id));flash(`Imported ${impSelected.size} staff.`);setSaving(false);setShowImport(false);loadStaff();}
  async function undoLastImport(){if(!lastImportIds.length)return;setSaving(true);await supabase.from("cc_payroll_weeks").delete().in("staff_id",lastImportIds);await supabase.from("cc_payroll_staff").delete().in("id",lastImportIds);flash(`Undid ${lastImportIds.length} imports.`);setLastImportIds([]);setSaving(false);loadStaff();}
  async function deleteStaffMember(id:string){setSaving(true);await supabase.from("cc_payroll_weeks").delete().eq("staff_id",id);await supabase.from("cc_payroll_staff").delete().eq("id",id);flash("Deleted.");setDelStaffId(null);setSaving(false);loadStaff();}

  async function addStaffFn(){if(!newName.trim())return;const{error}=await supabase.from("cc_payroll_staff").insert({name:newName.trim(),team:newTeam,status:"Active",weekly_rate:0,pay_style:"Wise",department:newDept,position:newPos,sign_on_date:newSignOn||null});if(error)flash(error.message,false);else{setNewName("");setNewSignOn("");loadStaff().then(()=>{/* refresh draft */const refresh=async()=>{const{data}=await supabase.from("cc_payroll_staff").select("*").order("name");if(data){const parsed=data.map((s:any)=>({...s,weekly_rate:n2(s.weekly_rate),pay_style:s.pay_style??"",team:s.team??"NovaNRG",snr_date:s.snr_date??null,department:s.department??"Call Center",position:s.position??"",sign_on_date:s.sign_on_date??null}));setStaff(parsed);setDraftStaff(parsed.map(s=>({...s})));setDirtyIds(new Set());}};refresh();});}}

  /* Draft-based staff editing — changes are local until Save All */
  function openStaffDialog(){setDraftStaff(staff.map(s=>({...s})));setDirtyIds(new Set());setShowStaff(true);}
  function updDraft(id:string,f:string,v:any){
    setDraftStaff(prev=>prev.map(s=>{
      if(s.id!==id)return s;
      const u={...s,[f]:v};
      if(f==="status"){if(v==="SNR")u.snr_date=new Date().toISOString().slice(0,10);else u.snr_date=null;}
      if(f==="department"){const fp=(POSITIONS_BY_DEPT[v as string]||[])[0]||"";u.position=fp;}
      return u;
    }));
    setDirtyIds(prev=>{const n=new Set(prev);n.add(id);return n;});
  }

  async function saveAllStaff(){
    if(!dirtyIds.size){flash("No changes to save.");setShowStaff(false);loadWeek();return;}
    setSaving(true);
    let errors=0;
    for(const id of dirtyIds){
      const d=draftStaff.find(s=>s.id===id);const orig=staff.find(s=>s.id===id);if(!d)continue;
      const{error}=await supabase.from("cc_payroll_staff").update({
        team:d.team,department:d.department,position:d.position,status:d.status,
        snr_date:d.snr_date,weekly_rate:d.weekly_rate,pay_style:d.pay_style,
        sign_on_date:d.sign_on_date,updated_at:new Date().toISOString()
      }).eq("id",id);
      if(error){errors++;continue;}
      /* If pay_style changed, also update current week's payroll entry */
      if(orig&&d.pay_style!==orig.pay_style){
        await supabase.from("cc_payroll_weeks").update({pay_style:d.pay_style,updated_at:new Date().toISOString()}).eq("staff_id",id).eq("week_start",selWeek);
      }
    }
    if(errors)flash(`${errors} update(s) failed.`,false);
    else flash(`Saved ${dirtyIds.size} change(s).`);
    setSaving(false);setDirtyIds(new Set());
    await loadStaff();setShowStaff(false);loadWeek();
  }

  function cancelStaffDialog(){setDraftStaff([]);setDirtyIds(new Set());setShowStaff(false);loadWeek();}

  /* Legacy single-field updStaff for edit dialog SNR auto-set */
  async function updStaff(id:string,f:string,v:any){
    const upd:any={[f]:v,updated_at:new Date().toISOString()};
    if(f==="status"){if(v==="SNR")upd.snr_date=new Date().toISOString().slice(0,10);else upd.snr_date=null;}
    const{error}=await supabase.from("cc_payroll_staff").update(upd).eq("id",id);if(error)flash(error.message,false);else loadStaff();
  }

  async function savePW(){
    if(!editPW||!editStaff)return;setSaving(true);
    const p:any={};for(const d of DAYS)for(const s of SUB_FIELDS)p[`${d}_${s}`]=n2((editPW as any)[`${d}_${s}`]);
    p.amount_paid=n2(editPW.amount_paid);p.date_paid=editPW.date_paid||null;p.pay_style=editPW.pay_style||"";p.notes=editPW.notes||null;p.bonus_notes=editPW.bonus_notes||null;p.ot_reason=editPW.ot_reason||null;p.updated_at=new Date().toISOString();
    const{error}=await supabase.from("cc_payroll_weeks").update(p).eq("id",editPW.id);
    if(error){flash(error.message,false);setSaving(false);return;}
    /* Save weekly_rate and pay_style if changed */
    const origStaff=staff.find(s=>s.id===editStaff.id);
    if(origStaff){
      const staffUpd:any={};
      if(origStaff.weekly_rate!==editStaff.weekly_rate)staffUpd.weekly_rate=editStaff.weekly_rate;
      if(editPW.pay_style&&editPW.pay_style!==origStaff.pay_style)staffUpd.pay_style=editPW.pay_style;
      if(Object.keys(staffUpd).length){staffUpd.updated_at=new Date().toISOString();await supabase.from("cc_payroll_staff").update(staffUpd).eq("id",editStaff.id);}
    }
    /* Auto-set staff to SNR if an SNR day is marked */
    const si=snrDayIdx(editPW);
    if(si>=0&&editStaff.status!=="SNR"){
      const ws=new Date(editPW.week_start+"T00:00:00");
      const snrDate=fi(ad(ws,si));
      await supabase.from("cc_payroll_staff").update({status:"SNR",snr_date:snrDate,updated_at:new Date().toISOString()}).eq("id",editStaff.id);
      loadStaff();
    }
    await supabase.from("cc_payroll_commissions").delete().eq("payroll_week_id",editPW.id);
    if(editComms.length)await supabase.from("cc_payroll_commissions").insert(editComms.map(c=>({payroll_week_id:editPW.id,account_name:c.account_name,commission_rate:0,commission_amount:n2(c.commission_amount),notes:c.notes})));
    flash("Saved!");setSaving(false);setEditPW(null);loadWeek();
  }
  async function deleteEntry(){if(!editPW)return;setSaving(true);await supabase.from("cc_payroll_commissions").delete().eq("payroll_week_id",editPW.id);await supabase.from("cc_payroll_weeks").delete().eq("id",editPW.id);flash("Entry deleted.");setSaving(false);setEditPW(null);setDelConfirm(false);loadWeek();}

  const sMap=useMemo(()=>new Map(staff.map(s=>[s.id,s])),[staff]);
  const wDates=useMemo(()=>{const m=new Date(selWeek+"T00:00:00");return DAYS.map((_,i)=>fi(ad(m,i)));},[selWeek]);
  function prev(){const d=new Date(selWeek+"T00:00:00");d.setDate(d.getDate()-7);setSelWeek(fi(d));}
  function next(){const d=new Date(selWeek+"T00:00:00");d.setDate(d.getDate()+7);setSelWeek(fi(d));}
  const filtered=useMemo(()=>{let r=weeks;if(searchQ.trim()){const q=searchQ.toLowerCase();r=r.filter(pw=>{const s=sMap.get(pw.staff_id);return s&&s.name.toLowerCase().includes(q);});}if(teamFilter)r=r.filter(pw=>{const s=sMap.get(pw.staff_id);return s&&s.team===teamFilter;});
    return[...r].sort((a,b)=>{const sa=sMap.get(a.staff_id);const sb=sMap.get(b.staff_id);if(!sa||!sb)return 0;let va="",vb="";if(sortCol==="name"){va=sa.name;vb=sb.name;}else if(sortCol==="team"){va=sa.team;vb=sb.team;}else if(sortCol==="dept"){va=sa.department;vb=sb.department;}else{va=sa.status;vb=sb.status;}const c=va.localeCompare(vb);return sortDir==="asc"?c:-c;});
  },[weeks,searchQ,teamFilter,sMap,sortCol,sortDir]);
  function toggleSort(col:"name"|"team"|"dept"|"status"){if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("asc");}}

  /* ═══ SUMMARIES ═══ */
  function buildSummary(pwList:PW[],commList:Comm[]){
    const byTeam=new Map<string,{pay:number;paid:number;commsAmt:number;add:number;ded:number;byPS:Map<string,number>}>();
    for(const t of TEAMS)byTeam.set(t,{pay:0,paid:0,commsAmt:0,add:0,ded:0,byPS:new Map()});
    for(const pw of pwList){const s=sMap.get(pw.staff_id);if(!s)continue;const t=calc(pw,s.weekly_rate/5/8);const c=commList.filter(x=>x.payroll_week_id===pw.id);const ca=c.reduce((a,x)=>a+x.commission_amount,0);const total=s.weekly_rate+t.add+ca-t.ded;const team=s.team||"NovaNRG";const entry=byTeam.get(team)??{pay:0,paid:0,commsAmt:0,add:0,ded:0,byPS:new Map()};entry.pay+=total;entry.paid+=pw.amount_paid;entry.commsAmt+=ca;entry.add+=t.add;entry.ded+=t.ded;const ps=pw.pay_style||s.pay_style||"Unset";entry.byPS.set(ps,(entry.byPS.get(ps)??0)+total);byTeam.set(team,entry);}
    return Array.from(byTeam.entries()).map(([team,v])=>({team,...v,unpaid:v.pay-v.paid,byPS:Array.from(v.byPS.entries()).sort((a,b)=>b[1]-a[1])}));
  }
  const weekSummary=useMemo(()=>buildSummary(weeks,comms),[weeks,comms,sMap]);
  const mSummary=useMemo(()=>buildSummary(monthWeeks,monthComms),[monthWeeks,monthComms,sMap]);

  /* Build overview rows grouped by department, sorted by sign_on_date */
  type ORow={name:string;team:string;dept:string;position:string;signOn:string;week:string;days:string;pay:number;paid:number;datePaid:string;ps:string;detailNotes:string};
  function buildRows(pwList:PW[],commList:Comm[]):ORow[]{
    return pwList.map(pw=>{
      const s=sMap.get(pw.staff_id);if(!s)return null;
      const t=calc(pw,s.weekly_rate/5/8);const c=commList.filter(x=>x.payroll_week_id===pw.id);
      const ca=c.reduce((a,x)=>a+x.commission_amount,0);const total=s.weekly_rate+t.add+ca-t.ded;
      const np:string[]=[];if(t.bn>0)np.push(`Bonus: $${t.bn}${pw.bonus_notes?` (${pw.bonus_notes})`:""}`);if(t.ot>0)np.push(`O/T: $${t.ot}${pw.ot_reason?` (${pw.ot_reason})`:""}`);if(c.length)np.push(`Commission ${c.map(x=>`${x.account_name} $${x.commission_amount}`).join(", ")}`);
      return{name:s.name,team:s.team,dept:s.department||"Call Center",position:s.position||"",signOn:s.sign_on_date||"9999-12-31",week:ff(pw.week_start),days:daysStr(pw),pay:total,paid:pw.amount_paid,datePaid:pw.date_paid?ff(pw.date_paid):"",ps:s.pay_style||pw.pay_style||"",detailNotes:np.join(" | ")} as ORow;
    }).filter(Boolean).sort((a,b)=>{
      /* Within same dept: managers/chiefs/leads first, then by sign-on date */
      const isLead=(pos:string)=>/manager|chief|lead|director|head/i.test(pos)?0:1;
      const la=isLead(a!.position),lb=isLead(b!.position);
      if(la!==lb)return la-lb;
      return(a!.signOn).localeCompare(b!.signOn);
    }) as ORow[];
  }
  const weekRows=useMemo(()=>buildRows(weeks,comms),[weeks,comms,sMap]);
  const monthRows=useMemo(()=>buildRows(monthWeeks,monthComms),[monthWeeks,monthComms,sMap]);
  /* ═══ PAYSLIP PRINTING ═══ */
  function buildPayslipHTML(pwList:{pw:PW;s:Staff;pc:Comm[]}[]):string{
    const weekLabel=`${ff(wDates[0])} – ${ff(wDates[4])}`;
    const slips=pwList.map(({pw,s,pc})=>{
      const t=calc(pw,s.weekly_rate/5/8);
      const ca=pc.reduce((a,x)=>a+x.commission_amount,0);
      const tot=s.weekly_rate+t.add+ca-t.ded;
      const ds=daysStr(pw);
      const teamColor=s.team==="NovaNRG"?"#2563eb":"#d97706";
      const commRows=pc.map(c=>`<tr><td style="padding:2px 6px;border:1px solid #e2e8f0">${c.account_name}</td><td style="padding:2px 6px;border:1px solid #e2e8f0;text-align:right">${$(c.commission_amount)}</td><td style="padding:2px 6px;border:1px solid #e2e8f0">${c.notes||""}</td></tr>`).join("");
      return `
      <div style="page-break-after:always;page-break-inside:avoid;font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:24px 0">
        <div style="border:2px solid #334155;border-radius:8px;overflow:hidden">
          <!-- Header -->
          <div style="background:#1e293b;color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
            <div><div style="font-size:16px;font-weight:700">${s.name}</div><div style="font-size:10px;opacity:0.8;margin-top:2px">${s.department} · ${s.position}</div></div>
            <div style="text-align:right"><span style="background:${teamColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">${s.team}</span><div style="font-size:10px;opacity:0.7;margin-top:4px">Status: ${s.status}</div></div>
          </div>
          <!-- Week & Rate -->
          <div style="display:flex;justify-content:space-between;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <div><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Week of</div><div style="font-size:13px;font-weight:600">${ff(pw.week_start)} <span style="color:#94a3b8;font-weight:400;font-size:11px">(${weekLabel})</span></div></div>
            <div style="text-align:right"><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Weekly Rate</div><div style="font-size:13px;font-weight:700">${$(s.weekly_rate)}</div></div>
          </div>
          <!-- Days Worked -->
          ${ds?`<div style="padding:8px 16px;border-bottom:1px solid #e2e8f0"><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b;margin-bottom:4px">Days Worked</div><div style="font-size:11px;color:#334155">${ds}</div></div>`:""}
          <!-- Computation Table -->
          <div style="padding:10px 16px;border-bottom:1px solid #e2e8f0">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <tr style="background:#f1f5f9"><td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;width:50%">Weekly Rate</td><td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${$(s.weekly_rate)}</td></tr>
              ${t.ot>0?`<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;color:#059669">+ Overtime${pw.ot_reason?` (${pw.ot_reason})`:""}</td><td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#059669">+ ${$(t.ot)}</td></tr>`:""}
              ${t.bn>0?`<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;color:#059669">+ Bonus${pw.bonus_notes?` (${pw.bonus_notes})`:""}</td><td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#059669">+ ${$(t.bn)}</td></tr>`:""}
              ${ca>0?`<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;color:#059669">+ Commissions</td><td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#059669">+ ${$(ca)}</td></tr>`:""}
              ${t.ded>0?`<tr><td style="padding:6px 8px;border:1px solid #e2e8f0;color:#dc2626">− Deductions (${t.dedHrs} hrs)</td><td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#dc2626">− ${$(t.ded)}</td></tr>`:""}
              <tr style="background:#eff6ff"><td style="padding:8px;border:2px solid #93c5fd;font-weight:700;font-size:12px">TOTAL PAY</td><td style="padding:8px;border:2px solid #93c5fd;text-align:right;font-weight:700;font-size:15px;color:#1e40af">${$(tot)}</td></tr>
            </table>
          </div>
          ${pc.length?`
          <div style="padding:8px 16px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b;margin-bottom:4px">Commission Details</div>
            <table style="width:100%;border-collapse:collapse;font-size:10px">
              <tr style="background:#f1f5f9"><th style="padding:3px 6px;border:1px solid #e2e8f0;text-align:left">Account</th><th style="padding:3px 6px;border:1px solid #e2e8f0;text-align:right">Amount</th><th style="padding:3px 6px;border:1px solid #e2e8f0;text-align:left">Notes</th></tr>
              ${commRows}
            </table>
          </div>`:""}
          <!-- Payment Info -->
          <div style="padding:10px 16px;background:#f8fafc;display:flex;gap:24px;font-size:11px">
            <div><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Amount Paid</div><div style="font-weight:700;font-size:13px;color:${pw.amount_paid>=tot&&tot>0?"#16a34a":"#1e293b"}">${pw.amount_paid>0?$(pw.amount_paid):"—"}</div></div>
            <div><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Date Paid</div><div style="font-weight:600">${pw.date_paid?ff(pw.date_paid):"—"}</div></div>
            <div><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Pay Style</div><div style="font-weight:600">${pw.pay_style||s.pay_style||"—"}</div></div>
            ${pw.notes?`<div><div style="font-size:9px;text-transform:uppercase;font-weight:600;color:#64748b">Notes</div><div>${pw.notes}</div></div>`:""}
          </div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:8px;color:#94a3b8">Payslip generated ${new Date().toLocaleString()}</div>
      </div>`;
    });
    return `<!DOCTYPE html><html><head><title>Payslips – Week of ${ff(selWeek)}</title><style>@media print{@page{margin:12mm}body{margin:0}}body{font-family:system-ui,sans-serif;}</style></head><body>${slips.join("")}</body></html>`;
  }

  function printPayslip(pwId:string){
    const pw=weeks.find(x=>x.id===pwId);if(!pw)return;
    const s=sMap.get(pw.staff_id);if(!s)return;
    const pc=comms.filter(x=>x.payroll_week_id===pw.id);
    const html=buildPayslipHTML([{pw,s,pc}]);
    const win=window.open("","_blank","width=800,height=600");
    if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),300);}
  }

  function printAllPayslips(){
    const items=filtered.map(pw=>{
      const s=sMap.get(pw.staff_id);if(!s)return null;
      const pc=comms.filter(x=>x.payroll_week_id===pw.id);
      return{pw,s,pc};
    }).filter(Boolean) as {pw:PW;s:Staff;pc:Comm[]}[];
    if(!items.length){flash("No entries to print.",false);return;}
    const html=buildPayslipHTML(items);
    const win=window.open("","_blank","width=800,height=600");
    if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),300);}
  }

  function printReport(){window.print();}
  const cStyle:React.CSSProperties={height:`calc(100dvh - ${PH}px)`,maxHeight:`calc(100dvh - ${PH}px)`};

  /* Summary cards side by side */
  function SummaryBlock({title,data,color}:{title:string;data:{pay:number;paid:number;unpaid:number;commsAmt:number;add:number;ded:number;byPS:[string,number][]};color:string}){
    return(<div className={`rounded-lg border p-3 ${color}`}><div className="text-[10px] font-bold uppercase tracking-wider mb-2 opacity-70">{title}</div><div className="grid grid-cols-3 gap-2 text-xs mb-2"><div><div className="text-[9px] uppercase font-semibold opacity-60">Total Pay</div><div className="font-bold text-lg">{$(data.pay)}</div></div><div><div className="text-[9px] uppercase font-semibold opacity-60">Paid</div><div className="font-bold text-lg">{$(data.paid)}</div></div><div><div className="text-[9px] uppercase font-semibold opacity-60">Unpaid</div><div className="font-bold text-lg">{$(data.unpaid)}</div></div></div><div className="grid grid-cols-3 gap-2 text-xs mb-1"><div><div className="text-[9px] uppercase font-semibold opacity-50">Addable</div><div className="font-semibold">{$(data.add)}</div></div><div><div className="text-[9px] uppercase font-semibold opacity-50">Deductible</div><div className="font-semibold">{$(data.ded)}</div></div><div><div className="text-[9px] uppercase font-semibold opacity-50">Commissions</div><div className="font-semibold">{$(data.commsAmt)}</div></div></div>{data.byPS.length>0&&<div className="flex flex-wrap gap-1 mt-1">{data.byPS.map(([s,a])=><span key={s} className="rounded bg-white/50 px-1.5 py-0.5 text-[9px] font-semibold">{s}: {$(a)}</span>)}</div>}</div>);
  }

  /* Overview table — side by side: NovaNRG left, MHHS right */
  function OverviewTable({rows,summary,id}:{rows:ORow[];summary:{team:string;pay:number;paid:number;unpaid:number;byPS:[string,number][]}[];id:string}){
    const deptColors:Record<string,string>={"Finance":"bg-indigo-100 text-indigo-800","Operation":"bg-sky-100 text-sky-800","Human Resources":"bg-pink-100 text-pink-800","Call Center":"bg-emerald-100 text-emerald-800","Contingencies":"bg-orange-100 text-orange-800"};
    const TH="px-1.5 py-1 text-[9px] font-bold border-r border-lime-400/50";
    const TD="px-1.5 py-1 border-r border-slate-200/40 text-[10px]";
    const cols=[{w:"22%",l:"Name",a:"text-left"},{w:"12%",l:"Week",a:"text-left"},{w:"26%",l:"Days Worked",a:"text-left"},{w:"12%",l:"Pay",a:"text-right"},{w:"12%",l:"Paid",a:"text-right"},{w:"8%",l:"Style",a:"text-left"},{w:"8%",l:"Notes",a:"text-left"}];

    function TeamTable({tRows}:{tRows:ORow[]}){
      return(<table className="w-full text-xs border-collapse table-fixed"><colgroup>{cols.map((c,i)=><col key={i} style={{width:c.w}} />)}</colgroup><tbody>
        {tRows.map((r,i)=>(<tr key={i} className={`border-b border-slate-200/50 ${r.paid>=r.pay&&r.pay>0?"bg-lime-50/60":""} hover:bg-slate-50`}>
          <td className={`${TD} font-medium truncate`}>{r.name}</td>
          <td className={`${TD} tabular-nums`}>{r.week}</td>
          <td className={`${TD} text-slate-600 truncate`} title={r.days}>{r.days}</td>
          <td className={`${TD} text-right tabular-nums font-semibold`}>{$(r.pay)}</td>
          <td className={`${TD} text-right tabular-nums`}>{r.paid>0?$(r.paid):""}</td>
          <td className={`${TD}`}>{r.ps}</td>
          <td className={`${TD} border-r-0 text-slate-600 truncate`} title={r.detailNotes}>{r.detailNotes}</td>
        </tr>))}
      </tbody></table>);
    }

    function TeamPanel({team,color}:{team:string;color:string}){
      const teamRows=rows.filter(r=>r.team===team);
      const ts=summary.find(s=>s.team===team);
      if(!teamRows.length&&!ts)return <div className="flex-1 min-w-0" />;
      return(
        <div className="flex-1 min-w-0 border border-slate-200 rounded-lg overflow-hidden">
          <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 ${color}`}>{team} ({teamRows.length})</div>
          {/* Shared header */}
          <table className="w-full text-xs border-collapse table-fixed"><colgroup>{cols.map((c,i)=><col key={i} style={{width:c.w}} />)}</colgroup><thead><tr className="bg-lime-300/80 text-slate-900">{cols.map((c,i)=><th key={i} className={`${TH} ${c.a} ${i===cols.length-1?"border-r-0":""}`}>{c.l}</th>)}</tr></thead></table>
          {DEPT_ORDER.map(dept=>{
            const dRows=teamRows.filter(r=>r.dept===dept);
            if(!dRows.length)return null;
            return(<div key={dept}>
              <div className={`text-[9px] font-bold uppercase px-2 py-0.5 ${deptColors[dept]||"bg-slate-100 text-slate-700"}`}>{dept}</div>
              <TeamTable tRows={dRows} />
            </div>);
          })}
          {ts&&<div className="flex justify-between items-center px-2 py-1.5 border-t-2 border-slate-400 bg-slate-100">
            <span className="text-[10px] font-bold">{team} TOTAL</span>
            <div className="flex gap-3 text-[10px] tabular-nums">
              <span>Pay: <b>{$(ts.pay)}</b></span>
              <span>Paid: <b>{$(ts.paid)}</b></span>
              <span className={ts.unpaid>0?"text-red-600 font-bold":""}>Unpaid: {$(ts.unpaid)}</span>
            </div>
          </div>}
          {ts&&ts.byPS.length>0&&<div className="flex flex-wrap gap-1 px-2 py-1 bg-slate-50 border-t border-slate-200">{ts.byPS.map(([s,a])=><span key={s} className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold border border-slate-200">{s}: {$(a)}</span>)}</div>}
        </div>
      );
    }

    return(<div id={id}>
      <div className="flex gap-3">
        <TeamPanel team="NovaNRG" color="bg-blue-100 text-blue-800" />
        <TeamPanel team="MHHS" color="bg-amber-100 text-amber-800" />
      </div>
      {rows.length>0&&<div className="flex justify-between px-3 py-2 mt-2 border-t-2 border-slate-500 bg-slate-200 rounded text-sm font-bold"><span>GRAND TOTAL</span><span className="tabular-nums">{$(rows.reduce((a,r)=>a+r.pay,0))}</span></div>}
    </div>);
  }

  return(
    <div className="min-h-0 flex flex-col overflow-hidden bg-slate-50" style={cStyle}>
      <style>{`@media print{body *{visibility:hidden}#print-area,#print-area *{visibility:visible}#print-area{position:absolute;left:0;top:0;width:100%}}`}</style>
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200/60 overflow-y-auto max-h-[60vh]">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div><div className="text-base font-semibold text-slate-900">Payroll</div><div className="text-[11px] text-slate-500">Weekly & monthly payroll · Click row to edit</div></div>
            <div className="flex gap-2 items-center">
              <span className={UI.pill}>{loading?"…":`${weeks.length} entries`}</span>
              <button className={UI.bg} onClick={openStaffDialog}>Manage Staff</button>
              <button className={UI.bg} onClick={printReport}>🖨 Print</button>
              <button className={UI.bg} onClick={printAllPayslips}>🧾 Payslips</button>
              <button className={`${UI.bg} ${viewMode==="week"?"ring-2 ring-slate-400":""}`} onClick={()=>setViewMode("week")}>Weekly</button>
              <button className={`${UI.bg} ${viewMode==="month"?"ring-2 ring-slate-400":""}`} onClick={()=>setViewMode("month")}>Monthly</button>
            </div>
          </div>
          {msg&&<div className={`rounded-lg px-3 py-2 text-xs ${msg.ok?"bg-emerald-50 text-emerald-700 border border-emerald-200":"bg-red-50 text-red-700 border border-red-200"}`}>{msg.t}</div>}

          {viewMode==="week"?(<>
            <div className={`${UI.card} p-3`}><div className="flex items-center gap-3 flex-wrap">
              <button className={UI.bg} onClick={prev}>← Prev</button>
              <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">Week of</span><input type="date" className={`${UI.ctrl} w-40`} value={selWeek} onChange={e=>{const d=new Date(e.target.value+"T00:00:00");setSelWeek(fi(getMonday(d)));}} /><span className="text-xs text-slate-500">{ff(wDates[0])} – {ff(wDates[4])}</span></div>
              <button className={UI.bg} onClick={next}>Next →</button>
              <div className="ml-4 flex items-center gap-2"><input className={`${UI.ctrl} w-44`} placeholder="Search name…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} /><select className={`${UI.ctrl} w-32`} value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="">All Teams</option><option value="NovaNRG">NovaNRG</option><option value="MHHS">MHHS</option></select>{(searchQ||teamFilter)&&<button className="text-[10px] text-slate-400 hover:text-slate-600" onClick={()=>{setSearchQ("");setTeamFilter("");}}>Clear</button>}</div>
            </div></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{weekSummary.map(s=><SummaryBlock key={s.team} title={s.team} data={s} color={s.team==="NovaNRG"?"bg-blue-50 border-blue-200 text-blue-900":"bg-amber-50 border-amber-200 text-amber-900"} />)}</div>
            <div id="print-area"><OverviewTable rows={weekRows} summary={weekSummary} id="wo" /></div>
          </>):(<>
            <div className={`${UI.card} p-3 flex items-center gap-3`}><span className="text-sm font-semibold text-slate-800">Month</span><input type="month" className={`${UI.ctrl} w-44`} value={selMonth} onChange={e=>setSelMonth(e.target.value)} /><button className={UI.bg} onClick={loadMonth} disabled={monthLoading}>{monthLoading?"Loading…":"Refresh"}</button><span className={UI.pill}>{monthWeeks.length} entries</span></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{mSummary.map(s=><SummaryBlock key={s.team} title={`${s.team} — ${selMonth}`} data={s} color={s.team==="NovaNRG"?"bg-blue-50 border-blue-200 text-blue-900":"bg-amber-50 border-amber-200 text-amber-900"} />)}</div>
            <div id="print-area"><OverviewTable rows={monthRows} summary={mSummary} id="mo" /></div>
          </>)}
        </div>
      </div>

      {/* ═══ DETAIL TABLE ═══ */}
      {viewMode==="week"&&(
      <div className="px-4 pt-3 pb-1"><div className="border-t-2 border-slate-400"></div><div className="flex items-center gap-3 mt-2 mb-1"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Detail Table · Click row to edit · Click header to sort</span><input className="rounded border border-slate-200 px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-slate-300 w-44" placeholder="🔍 Search name…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} />{searchQ&&<button className="text-[9px] text-slate-400 hover:text-slate-600" onClick={()=>setSearchQ("")}>✕ Clear</button>}</div></div>)}
      {viewMode==="week"&&(
      <div className="flex-1 min-h-0 px-4 pb-2"><div className={`${UI.card} h-full overflow-auto`}>
        <table className="w-full text-xs border-collapse table-fixed" style={{minWidth:"1450px"}}>
          <colgroup>
            <col style={{width:"220px"}} />{/* Name */}
            <col style={{width:"75px"}} />{/* Team */}
            <col style={{width:"90px"}} />{/* Dept */}
            <col style={{width:"60px"}} />{/* Status */}
            <col style={{width:"85px"}} />{/* Weekly Rate */}
            {DAYS.map(d=>[...DHM_FIELDS.map(sf=><col key={`${d}-${sf}`} style={{width:"35px"}} />),<col key={`${d}-snr`} style={{width:"22px"}} />])}{/* 20 day cols (P,A,O,S per day) */}
            <col style={{width:"85px"}} />{/* O/T */}
            <col style={{width:"85px"}} />{/* Bonus */}
            <col style={{width:"85px"}} />{/* Comms */}
            <col style={{width:"85px"}} />{/* Ded */}
            <col style={{width:"85px"}} />{/* Pay */}
            <col style={{width:"85px"}} />{/* Paid */}
            <col style={{width:"90px"}} />{/* Date */}
            <col style={{width:"58px"}} />{/* Style */}
            <col />{/* Notes - takes remaining */}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
            <tr className="border-b border-slate-200/60">
              <th className="px-1.5 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 select-none" rowSpan={2} onClick={()=>toggleSort("name")}>Name {sortCol==="name"?(sortDir==="asc"?"▲":"▼"):""}</th>
              <th className="px-1 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 select-none" rowSpan={2} onClick={()=>toggleSort("team")}>Team {sortCol==="team"?(sortDir==="asc"?"▲":"▼"):""}</th>
              <th className="px-1 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 select-none" rowSpan={2} onClick={()=>toggleSort("dept")}>Dept {sortCol==="dept"?(sortDir==="asc"?"▲":"▼"):""}</th>
              <th className="px-1 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 select-none" rowSpan={2} onClick={()=>toggleSort("status")}>Status {sortCol==="status"?(sortDir==="asc"?"▲":"▼"):""}</th>
              <th className="px-1 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Weekly</th>
              {DAYS.map((d,i)=><th key={d} colSpan={4} className="px-0 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60 bg-slate-50/50 text-[9px]">{DL[i]} <span className="font-normal text-slate-400">({fs(wDates[i])})</span></th>)}
              <th className="px-1 py-1.5 text-center font-semibold text-emerald-700 border-r border-slate-200/60 bg-emerald-50" rowSpan={2}>O/T</th>
              <th className="px-1 py-1.5 text-center font-semibold text-emerald-700 border-r border-slate-200/60 bg-emerald-50" rowSpan={2}>Bonus</th>
              <th className="px-1 py-1.5 text-center font-semibold text-emerald-700 border-r border-slate-200/60 bg-emerald-50" rowSpan={2}>Commission</th>
              <th className="px-1 py-1.5 text-center font-semibold text-red-600 border-r border-slate-200/60 bg-red-50" rowSpan={2}>Deduction</th>
              <th className="px-1 py-1.5 text-right font-semibold text-slate-800 border-r border-slate-200/60 bg-blue-50" rowSpan={2}>Pay</th>
              <th className="px-1 py-1.5 text-right font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Paid</th>
              <th className="px-1 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Date</th>
              <th className="px-1 py-1.5 text-center font-semibold text-slate-700 border-r border-slate-200/60" rowSpan={2}>Style</th>
              <th className="px-1.5 py-1.5 text-left font-semibold text-slate-700" rowSpan={2}>Notes</th>
            </tr>
            <tr className="border-b-2 border-slate-300">{DAYS.map(d=>[...["Prep","AFK","Off"].map((sl,si)=><th key={`${d}-${si}`} className="px-0 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider border-r border-slate-200/40 text-red-500 bg-red-50/20">{sl}</th>),<th key={`${d}-s`} className="px-0 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider border-r border-slate-200/40 text-gray-600 bg-gray-50/40">SNR</th>]).flat()}</tr>
          </thead>
          <tbody>
            {loading?<tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={30}>Loading…</td></tr>
            :filtered.length===0?<tr><td className="px-3 py-8 text-slate-400 text-center" colSpan={30}>No entries. Add staff via Manage Staff.</td></tr>
            :filtered.map(pw=>{
              const s=sMap.get(pw.staff_id);if(!s)return null;
              const t=calc(pw,s.weekly_rate/5/8);const pc=comms.filter(x=>x.payroll_week_id===pw.id);const ca=pc.reduce((a,x)=>a+x.commission_amount,0);const total=s.weekly_rate+t.add+ca-t.ded;
              const sc=s.status==="Active"?"bg-emerald-100 text-emerald-700":s.status==="OFF"?"bg-amber-100 text-amber-700":"bg-gray-200 text-gray-500";
              const tc=s.team==="NovaNRG"?"text-blue-700":"text-amber-700";
              const np:string[]=[];if(t.bn>0)np.push(`Bonus $${t.bn}${pw.bonus_notes?` (${pw.bonus_notes})`:""}`);if(t.ot>0)np.push(`O/T $${t.ot}${pw.ot_reason?` (${pw.ot_reason})`:""}`);if(pc.length)np.push(`Comm: ${pc.map(x=>`${x.account_name} $${x.commission_amount}`).join(", ")}`);
              return(
                <tr key={pw.id} onClick={()=>{setEditPW({...pw,pay_style:s.pay_style||pw.pay_style||""});setEditComms(pc.map(c=>({...c})));setEditStaff(s);setShowOther(false);setDelConfirm(false);}} className="border-b border-slate-200/40 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                  <td className="px-1.5 py-1.5 whitespace-nowrap font-medium border-r border-slate-200/40 truncate">{s.name}</td>
                  <td className={`px-1 py-1.5 text-center border-r border-slate-200/40 text-[9px] font-bold ${tc}`}>{s.team}</td>
                  <td className="px-1 py-1.5 text-center border-r border-slate-200/40 text-[9px] truncate">{s.department}</td>
                  <td className="px-1 py-1.5 text-center border-r border-slate-200/40"><span className={`text-[8px] px-1 py-0.5 rounded font-bold ${sc}`}>{s.status}</span></td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 tabular-nums">{$(s.weekly_rate)}</td>
                  {DAYS.map((d,di)=>{const si=snrDayIdx(pw);const isAfterSnr=si>=0&&di>si;const isSnrDay=si===di;return[...DHM_FIELDS.map(sf=>{const v=isAfterSnr?0:gv(pw,d,sf);return<td key={`${d}-${sf}`} className={`px-0 py-1.5 text-center border-r border-slate-200/30 tabular-nums ${isAfterSnr?"text-gray-300 bg-gray-50/50":v>0?"text-red-600 font-semibold":"text-slate-300"}`}>{v||""}</td>;}),<td key={`${d}-snr`} className={`px-0 py-1.5 text-center border-r border-slate-200/30 ${isSnrDay?"text-gray-800 font-bold bg-gray-200":"text-slate-300"}`}>{isSnrDay?"✕":""}</td>];}).flat()}<td className="px-1 py-1.5 text-right border-r border-slate-200/40 font-semibold text-emerald-700 bg-emerald-50/30 tabular-nums">{t.ot>0?$(t.ot):""}</td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 font-semibold text-emerald-700 bg-emerald-50/30 tabular-nums">{t.bn>0?$(t.bn):""}</td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 font-semibold text-emerald-700 bg-emerald-50/30 tabular-nums">{ca>0?$(ca):""}</td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 font-semibold text-red-600 bg-red-50/30 tabular-nums">{t.ded>0?$(t.ded):""}</td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 font-bold text-slate-900 bg-blue-50/30 tabular-nums">{$(total)}</td>
                  <td className="px-1 py-1.5 text-right border-r border-slate-200/40 tabular-nums">{pw.amount_paid>0?$(pw.amount_paid):""}</td>
                  <td className="px-1 py-1.5 text-center border-r border-slate-200/40 tabular-nums text-[9px]">{pw.date_paid?ff(pw.date_paid):""}</td>
                  <td className="px-1 py-1.5 text-center border-r border-slate-200/40 text-[9px]">{(s.pay_style||pw.pay_style)&&<span className="font-medium">{s.pay_style||pw.pay_style}</span>}</td>
                  <td className="px-1.5 py-1.5 text-[9px] text-slate-600 break-words" style={{wordBreak:"break-word"}}>{np.join(" | ")}</td>
                </tr>);
            })}
          </tbody>
        </table>
      </div></div>)}

      {/* EDIT DIALOG */}
      {editPW&&editStaff&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>{setEditPW(null);setEditStaff(null);}}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col" onClick={ev=>ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0">
              <div><div className="text-sm font-semibold text-slate-800">{editStaff.name} <span className={`text-[10px] ml-1 px-1.5 py-0.5 rounded font-bold ${editStaff.team==="NovaNRG"?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700"}`}>{editStaff.team}</span> <span className="text-[10px] text-slate-400">{editStaff.department} · {editStaff.position}</span> — Week of {ff(editPW.week_start)}</div></div>
              <button className="text-slate-400 hover:text-slate-600 text-lg" onClick={()=>{setEditPW(null);setEditStaff(null);}}>✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Weekly Rate — editable */}
              <div className="rounded-lg border border-slate-200 bg-blue-50/40 p-3 flex items-center gap-4">
                <div><label className="text-[9px] font-semibold text-blue-700 uppercase">Weekly Rate ($)</label><input type="number" step="any" className={`${UI.ctrl} !w-32 font-bold text-blue-900`} value={editStaff.weekly_rate||""} onChange={e=>setEditStaff(s=>s?{...s,weekly_rate:n2(e.target.value)}:s)} /></div>
                <div className="text-[10px] text-slate-500 space-x-3"><span>Hourly: <b>{$(editStaff.weekly_rate/5/8)}</b></span><span>Daily: <b>{$(editStaff.weekly_rate/5)}</b></span><span>Monthly: <b>{$(editStaff.weekly_rate*4)}</b></span><span>Yearly: <b>{$(editStaff.weekly_rate*52)}</b></span></div>
              </div>
              <div><div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Daily Deductions</div><div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden"><thead><tr className="bg-slate-50"><th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200" rowSpan={2}>Day</th>{["Prep","AFK","Off"].map(l=><th key={l} colSpan={3} className="px-1 py-1 text-center font-semibold text-red-600 border-r border-slate-200">{l}</th>)}<th className="px-2 py-1 text-center font-semibold text-gray-700 border-r border-slate-200" rowSpan={2}>SNR</th></tr><tr className="bg-slate-50 border-t border-slate-200">{["Prep","AFK","Off"].map(l=>["D","H","M"].map(u=><th key={`${l}-${u}`} className="px-1 py-0.5 text-center text-[8px] font-semibold text-red-400 border-r border-slate-200/60 uppercase">{u}</th>)).flat()}</tr></thead>
                <tbody>{DAYS.map((d,di)=>{const snrIdx=snrDayIdx(editPW);const isAfterSnr=snrIdx>=0&&di>snrIdx;const isSnrDay=snrIdx===di;return(<tr key={d} className={`border-t border-slate-200 ${isAfterSnr?"bg-gray-100 opacity-50":""}`}><td className="px-2 py-1.5 font-medium border-r border-slate-200 bg-slate-50/50 whitespace-nowrap">{DL[di]} <span className="text-slate-400 text-[9px]">{fs(wDates[di])}</span></td>{DHM_FIELDS.map(sf=>{const val=(editPW as any)[`${d}_${sf}`]||0;const dhm=hoursToDHM(val);const upd=(nd:number,nh:number,nm:number)=>{setEditPW(p=>p?{...p,[`${d}_${sf}`]:dhmToHours(nd,nh,nm)}:p);};return[<td key={`${sf}-d`} className="px-0.5 py-1 text-center border-r border-slate-200/40"><input type="number" min="0" step="1" className="w-10 rounded border border-slate-200 px-1 py-0.5 text-xs text-center outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-gray-100 disabled:text-gray-400" disabled={isAfterSnr||isSnrDay} value={isAfterSnr?"":dhm.d||""} onChange={e=>upd(n2(e.target.value),dhm.h,dhm.m)} /></td>,<td key={`${sf}-h`} className="px-0.5 py-1 text-center border-r border-slate-200/40"><input type="number" min="0" max="8" step="1" className="w-10 rounded border border-slate-200 px-1 py-0.5 text-xs text-center outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-gray-100 disabled:text-gray-400" disabled={isAfterSnr||isSnrDay} value={isAfterSnr?"":dhm.h||""} onChange={e=>upd(dhm.d,n2(e.target.value),dhm.m)} /></td>,<td key={`${sf}-m`} className="px-0.5 py-1 text-center border-r border-slate-200"><input type="number" min="0" max="59" step="1" className="w-10 rounded border border-slate-200 px-1 py-0.5 text-xs text-center outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-gray-100 disabled:text-gray-400" disabled={isAfterSnr||isSnrDay} value={isAfterSnr?"":dhm.m||""} onChange={e=>upd(dhm.d,dhm.h,n2(e.target.value))} /></td>];}).flat()}<td className="px-2 py-1 text-center border-r border-slate-200"><input type="checkbox" className="rounded border-gray-300 text-gray-700 cursor-pointer" disabled={isAfterSnr} checked={gv(editPW,d,"snr")>0} onChange={e=>{const checked=e.target.checked;setEditPW(p=>{if(!p)return p;const u={...p,[`${d}_snr`]:checked?1:0};/* If checking SNR, clear all days after */if(checked){for(let j=di+1;j<DAYS.length;j++){const nd=DAYS[j];for(const sf of[...DHM_FIELDS,"snr","ot","bonus","commission"]as const)(u as any)[`${nd}_${sf}`]=0;}/* Also clear this day's deductions */for(const sf of DHM_FIELDS)(u as any)[`${d}_${sf}`]=0;}return u;});}} /></td></tr>);})}</tbody></table></div><div className="mt-1 text-[9px] text-slate-400">D = Days (8hrs each) · H = Hours · M = Minutes · SNR = marks termination, zeros out that day + remaining days</div></div>
              <div><div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Overtime & Bonus</div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-slate-200 p-3 space-y-2"><div className="flex-1"><label className="text-[9px] font-semibold text-emerald-600 uppercase">O/T Amount ($)</label><input type="number" step="any" className={UI.ctrl} value={(editPW as any).mon_ot||""} onChange={e=>setEditPW(p=>p?{...p,mon_ot:n2(e.target.value),tue_ot:0,wed_ot:0,thu_ot:0,fri_ot:0}:p)} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">O/T Reason</label><input className={UI.ctrl} placeholder="Why was overtime worked?" value={editPW.ot_reason??""} onChange={e=>setEditPW(p=>p?{...p,ot_reason:e.target.value||null}:p)} /></div></div><div className="rounded-lg border border-slate-200 p-3 space-y-2"><div className="flex-1"><label className="text-[9px] font-semibold text-emerald-600 uppercase">Bonus Amount ($)</label><input type="number" step="any" className={UI.ctrl} value={(editPW as any).mon_bonus||""} onChange={e=>setEditPW(p=>p?{...p,mon_bonus:n2(e.target.value),tue_bonus:0,wed_bonus:0,thu_bonus:0,fri_bonus:0}:p)} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Bonus Note</label><input className={UI.ctrl} placeholder="e.g. Week Challenge Winner" value={editPW.bonus_notes??""} onChange={e=>setEditPW(p=>p?{...p,bonus_notes:e.target.value||null}:p)} /></div></div></div></div>
              <div><div className="flex items-center justify-between mb-2"><div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Commissions</div><button className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800" onClick={()=>setEditComms(c=>[...c,{id:`n-${Date.now()}`,payroll_week_id:editPW.id,account_name:"",commission_rate:0,commission_amount:0,notes:null}])}>+ Add</button></div>{editComms.length===0?<div className="text-xs text-slate-400 italic">No commissions.</div>:<div className="space-y-2">{editComms.map((c,ci)=><div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/50"><div className="flex-1 grid grid-cols-3 gap-2"><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Account Name</label><input className={UI.ctrl} value={c.account_name} onChange={e=>{const a=[...editComms];a[ci]={...a[ci],account_name:e.target.value};setEditComms(a);}} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Amount ($)</label><input type="number" step="any" className={UI.ctrl} value={c.commission_amount||""} onChange={e=>{const a=[...editComms];a[ci]={...a[ci],commission_amount:n2(e.target.value)};setEditComms(a);}} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Notes</label><input className={UI.ctrl} value={c.notes??""} onChange={e=>{const a=[...editComms];a[ci]={...a[ci],notes:e.target.value||null};setEditComms(a);}} /></div></div><button className="text-red-400 hover:text-red-600 text-sm px-1" onClick={()=>setEditComms(x=>x.filter((_,i)=>i!==ci))}>✕</button></div>)}</div>}</div>
              <div><div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment</div>
                {(()=>{const t=calc(editPW,editStaff.weekly_rate/5/8);const ca=editComms.reduce((a,c)=>a+c.commission_amount,0);const tot=editStaff.weekly_rate+t.add+ca-t.ded;return(<div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 p-3 mb-3 flex items-center justify-between"><div className="flex items-center gap-1 text-xs text-slate-700 flex-wrap"><span className="font-semibold">{$(editStaff.weekly_rate)}</span><span className="text-slate-400">+</span><span className="text-emerald-700 font-semibold">{$(t.ot)}<span className="text-[9px] font-normal"> O/T</span></span><span className="text-slate-400">+</span><span className="text-emerald-700 font-semibold">{$(t.bn)}<span className="text-[9px] font-normal"> Bonus</span></span><span className="text-slate-400">+</span><span className="text-emerald-700 font-semibold">{$(ca)}<span className="text-[9px] font-normal"> Comm</span></span><span className="text-slate-400">−</span><span className="text-red-600 font-semibold">{$(t.ded)}<span className="text-[9px] font-normal"> Ded</span></span></div><div className="text-right"><div className="text-[9px] text-blue-600 uppercase font-bold">Total Pay</div><div className="text-xl font-bold text-blue-800">{$(tot)}</div></div></div>);})()}
                <div className="grid grid-cols-4 gap-3"><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Amount Paid</label><input type="number" step="any" className={UI.ctrl} value={editPW.amount_paid||""} onChange={e=>setEditPW(p=>p?{...p,amount_paid:n2(e.target.value)}:p)} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Date Paid</label><input type="date" className={UI.ctrl} value={editPW.date_paid??""} onChange={e=>setEditPW(p=>p?{...p,date_paid:e.target.value||null}:p)} /></div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Pay Style</label>{showOther?<div className="flex gap-1"><input className={UI.ctrl} placeholder="Custom…" value={otherPS} onChange={e=>setOtherPS(e.target.value)} /><button className={UI.bp} onClick={()=>{if(otherPS.trim()){setCustPS(p=>[...p,otherPS.trim()]);setEditPW(p=>p?{...p,pay_style:otherPS.trim()}:p);setShowOther(false);setOtherPS("");}}}>OK</button><button className={UI.bg} onClick={()=>{setShowOther(false);setOtherPS("");}}>✕</button></div>:<select className={UI.ctrl} value={editPW.pay_style||""} onChange={e=>{if(e.target.value==="__other__")setShowOther(true);else setEditPW(p=>p?{...p,pay_style:e.target.value}:p);}}><option value="">Select…</option>{allPS.map(ps=><option key={ps} value={ps}>{ps}</option>)}<option value="__other__">Other…</option></select>}</div><div><label className="text-[9px] font-semibold text-slate-500 uppercase">Notes</label><input className={UI.ctrl} value={editPW.notes??""} onChange={e=>setEditPW(p=>p?{...p,notes:e.target.value||null}:p)} /></div></div></div>
              {(()=>{const t=calc(editPW,editStaff.weekly_rate/5/8);const ca=editComms.reduce((a,c)=>a+c.commission_amount,0);const tot=editStaff.weekly_rate+t.add+ca-t.ded;return(<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-5 gap-3 text-xs"><div><div className="text-[9px] text-slate-400 uppercase font-semibold">Weekly Rate</div><div className="font-bold">{$(editStaff.weekly_rate)}</div></div><div><div className="text-[9px] text-emerald-600 uppercase font-semibold">Addable</div><div className="font-bold text-emerald-700">{$(t.add)}</div></div><div><div className="text-[9px] text-slate-400 uppercase font-semibold">Commissions</div><div className="font-bold">{$(ca)}</div></div><div><div className="text-[9px] text-red-500 uppercase font-semibold">Deductible</div><div className="font-bold text-red-600">{$(t.ded)}</div></div><div><div className="text-[9px] text-blue-700 uppercase font-semibold">TOTAL</div><div className="font-bold text-lg text-blue-800">{$(tot)}</div></div></div>);})()}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0"><div className="flex items-center gap-3">{delConfirm?(<div className="flex items-center gap-2"><span className="text-xs text-red-600 font-semibold">Delete this entry?</span><button className={UI.bd} onClick={deleteEntry}>Yes, Delete</button><button className={UI.bg} onClick={()=>setDelConfirm(false)}>No</button></div>):(<><button className="text-xs text-red-500 hover:text-red-700 underline" onClick={()=>setDelConfirm(true)}>Delete Entry</button><button className="text-xs text-slate-500 hover:text-slate-700 underline ml-2" onClick={()=>printPayslip(editPW.id)}>🧾 Print Payslip</button></>)}</div><div className="flex gap-2"><button className={UI.bg} onClick={()=>{setEditPW(null);setEditStaff(null);}}>Cancel</button><button className={UI.bp} onClick={savePW} disabled={saving}>{saving?"Saving…":"Save"}</button></div></div>
          </div>
        </div>
      )}

      {/* STAFF MANAGEMENT */}
      {showStaff&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={cancelStaffDialog}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col" onClick={ev=>ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">Manage Payroll Staff</span>{dirtyIds.size>0&&<span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{dirtyIds.size} unsaved change{dirtyIds.size>1?"s":""}</span>}</div><button className="text-slate-400 hover:text-slate-600 text-lg" onClick={cancelStaffDialog}>✕</button></div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <button className={UI.bg} onClick={openImportPicker} disabled={impLoading}>{impLoading?"Loading…":"Import from Deals"}</button>
                {lastImportIds.length>0&&<button className="text-xs text-red-500 hover:text-red-700 underline" onClick={undoLastImport}>Undo last import ({lastImportIds.length})</button>}
              </div>
              <div className="flex items-center gap-2 flex-wrap border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                <input className={`${UI.ctrl} !w-36`} placeholder="Name…" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addStaffFn();}} />
                <select className={`${UI.ctrl} !w-24`} value={newTeam} onChange={e=>setNewTeam(e.target.value)}><option value="NovaNRG">NovaNRG</option><option value="MHHS">MHHS</option></select>
                <select className={`${UI.ctrl} !w-32`} value={newDept} onChange={e=>{setNewDept(e.target.value);const pos=POSITIONS_BY_DEPT[e.target.value];setNewPos(pos?pos[0]:"");}}>{DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}</select>
                {newPosCustom?<div className="flex items-center gap-1"><input className={`${UI.ctrl} !w-32`} autoFocus placeholder="Custom…" value={newPosText} onChange={e=>setNewPosText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newPosText.trim()){setCustPositions(p=>[...p,newPosText.trim()]);setNewPos(newPosText.trim());setNewPosCustom(false);setNewPosText("");}}} /><button className="text-[9px] bg-slate-900 text-white rounded px-1.5 py-0.5" onClick={()=>{if(newPosText.trim()){setCustPositions(p=>[...p,newPosText.trim()]);setNewPos(newPosText.trim());setNewPosCustom(false);setNewPosText("");}}}>OK</button><button className="text-[9px] text-slate-500" onClick={()=>{setNewPosCustom(false);setNewPosText("");}}>✕</button></div>
                :<select className={`${UI.ctrl} !w-40`} value={newPos} onChange={e=>{if(e.target.value==="__other__"){setNewPosCustom(true);setNewPosText("");}else setNewPos(e.target.value);}}>{positionsFor(newDept).map(p=><option key={p} value={p}>{p}</option>)}<option value="__other__">Others…</option></select>}
                <input type="date" className={`${UI.ctrl} !w-32`} value={newSignOn} onChange={e=>setNewSignOn(e.target.value)} title="Sign-On Date" />
                <button className={UI.bp} onClick={addStaffFn}>+ Add</button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-2 py-2 text-left font-semibold">Name</th><th className="px-2 py-2 text-center font-semibold w-20">Team</th><th className="px-2 py-2 text-center font-semibold w-28">Department</th><th className="px-2 py-2 text-center font-semibold w-36">Position</th><th className="px-2 py-2 text-center font-semibold w-24">Sign-On</th><th className="px-2 py-2 text-center font-semibold w-20">Status</th><th className="px-2 py-2 text-center font-semibold w-20">SNR Date</th><th className="px-2 py-2 text-right font-semibold w-24">Weekly</th><th className="px-2 py-2 text-center font-semibold w-24">Pay Style</th><th className="px-2 py-2 text-right font-semibold w-16">Hourly</th><th className="px-2 py-2 text-right font-semibold w-16">Daily</th><th className="px-2 py-2 text-right font-semibold w-20">Monthly</th><th className="px-2 py-2 w-8"></th></tr></thead>
              <tbody>
                {draftStaff.map(s=>{
                  const posOpts=positionsFor(s.department);const isDirty=dirtyIds.has(s.id);
                  return(<tr key={s.id} className={`border-t border-slate-200 ${isDirty?"bg-amber-50/60":""}`}>
                  <td className="px-2 py-2 font-medium">{s.name}{isDirty&&<span className="ml-1 text-[8px] text-amber-600">●</span>}</td>
                  <td className="px-2 py-2 text-center"><select className="text-[10px] font-bold rounded px-1 py-0.5 border border-slate-200 bg-white" value={s.team} onChange={e=>updDraft(s.id,"team",e.target.value)}><option value="NovaNRG">NovaNRG</option><option value="MHHS">MHHS</option></select></td>
                  <td className="px-2 py-2 text-center"><select className="text-[10px] rounded px-1 py-0.5 border border-slate-200 bg-white" value={s.department||""} onChange={e=>updDraft(s.id,"department",e.target.value)}>{!s.department&&<option value="">— Select —</option>}{DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}</select></td>
                  <td className="px-2 py-2 text-center">{custPosEdit===s.id?<div className="flex gap-1 items-center"><input className="text-[10px] rounded px-1 py-0.5 border border-slate-200 bg-white w-24" autoFocus value={custPosVal} onChange={e=>setCustPosVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&custPosVal.trim()){setCustPositions(p=>[...p,custPosVal.trim()]);updDraft(s.id,"position",custPosVal.trim());setCustPosEdit(null);setCustPosVal("");}}} /><button className="text-[9px] bg-slate-900 text-white rounded px-1 py-0.5" onClick={()=>{if(custPosVal.trim()){setCustPositions(p=>[...p,custPosVal.trim()]);updDraft(s.id,"position",custPosVal.trim());setCustPosEdit(null);setCustPosVal("");}}}>OK</button><button className="text-[9px] text-slate-500" onClick={()=>{setCustPosEdit(null);setCustPosVal("");}}>✕</button></div>:<select className="text-[10px] rounded px-1 py-0.5 border border-slate-200 bg-white" value={s.position||""} onChange={e=>{if(e.target.value==="__other__"){setCustPosEdit(s.id);setCustPosVal("");}else updDraft(s.id,"position",e.target.value);}}>{!s.position&&<option value="">— Select —</option>}{posOpts.map(p=><option key={p} value={p}>{p}</option>)}{s.position&&!posOpts.includes(s.position)&&<option value={s.position}>{s.position}</option>}<option value="__other__">Others…</option></select>}</td>
                  <td className="px-2 py-2 text-center"><input type="date" className="text-[10px] rounded px-1 py-0.5 border border-slate-200 bg-white w-28" value={s.sign_on_date||""} onChange={e=>updDraft(s.id,"sign_on_date",e.target.value||null)} /></td>
                  <td className="px-2 py-2 text-center"><select className="text-[10px] font-bold rounded px-1 py-0.5 border border-slate-200 bg-white" value={s.status} onChange={e=>updDraft(s.id,"status",e.target.value)}><option value="Active">Active</option><option value="OFF">OFF</option><option value="SNR">SNR</option></select></td>
                  <td className="px-2 py-2 text-center text-[10px] tabular-nums text-slate-500">{s.snr_date?ff(s.snr_date):""}</td>
                  <td className="px-2 py-2"><input type="number" step="any" className="w-full text-right text-xs border border-slate-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-slate-300" value={s.weekly_rate||""} onChange={e=>updDraft(s.id,"weekly_rate",n2(e.target.value))} /></td>
                  <td className="px-2 py-2 text-center"><select className="text-[10px] rounded px-1 py-0.5 border border-slate-200 bg-white" value={s.pay_style||""} onChange={e=>updDraft(s.id,"pay_style",e.target.value)}><option value="">Select…</option>{allPS.map(ps=><option key={ps} value={ps}>{ps}</option>)}</select></td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{$(s.weekly_rate/5/8)}</td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{$(s.weekly_rate/5)}</td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{$(s.weekly_rate*4)}</td>
                  <td className="px-1 py-2 text-center whitespace-nowrap">{delStaffId===s.id?<span className="inline-flex items-center gap-1"><button className="text-[9px] bg-red-600 text-white rounded px-1.5 py-0.5 hover:bg-red-700" onClick={()=>deleteStaffMember(s.id)}>Delete</button><button className="text-[9px] text-slate-500 hover:text-slate-700" onClick={()=>setDelStaffId(null)}>No</button></span>:<button className="text-red-400 hover:text-red-600 text-sm" title="Delete" onClick={()=>setDelStaffId(s.id)}>✕</button>}</td>
                </tr>);})}
                {!draftStaff.length&&<tr><td className="px-3 py-4 text-slate-400 text-center" colSpan={13}>No staff yet.</td></tr>}
              </tbody></table></div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0">
              <div className="text-[10px] text-slate-400">{dirtyIds.size>0?`${dirtyIds.size} unsaved change${dirtyIds.size>1?"s":""}`:""}</div>
              <div className="flex gap-2">
                <button className={UI.bg} onClick={cancelStaffDialog}>Cancel</button>
                <button className={`${UI.bp} ${!dirtyIds.size?"opacity-50 cursor-not-allowed":""}`} onClick={saveAllStaff} disabled={saving||!dirtyIds.size}>{saving?"Saving…":"Save All"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PICKER */}
      {showImport&&(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={()=>setShowImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={ev=>ev.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 flex-shrink-0"><div className="text-sm font-semibold text-slate-800">Select Names to Import</div><button className="text-slate-400 hover:text-slate-600 text-lg" onClick={()=>setShowImport(false)}>✕</button></div>
            <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2"><button className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold" onClick={()=>setImpSelected(new Set(impNames))}>Select All</button><span className="text-slate-300">|</span><button className="text-[10px] text-slate-500 hover:text-slate-700 font-semibold" onClick={()=>setImpSelected(new Set())}>Clear</button><span className="ml-auto text-[10px] text-slate-500">{impSelected.size}/{impNames.length}</span></div>
            <div className="overflow-y-auto flex-1 px-5 py-2">{impNames.map(name=>(<label key={name} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer"><input type="checkbox" className="rounded border-slate-300" checked={impSelected.has(name)} onChange={e=>{const s=new Set(impSelected);if(e.target.checked)s.add(name);else s.delete(name);setImpSelected(s);}} /><span className="text-sm">{name}</span></label>))}</div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl flex-shrink-0"><button className={UI.bg} onClick={()=>setShowImport(false)}>Cancel</button><button className={UI.bp} onClick={confirmImport} disabled={saving||impSelected.size===0}>{saving?"…":`Import ${impSelected.size}`}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
