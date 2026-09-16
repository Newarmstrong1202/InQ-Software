"use strict";
/* ============================ MASTER LOOKUPS ============================ */
const ARTS=[...new Set([...M.ART.map(x=>x.a),...M.WB.map(x=>x.a)])].filter(Boolean).sort();
const SOFT_IDX={}; M.ART.forEach(x=>{SOFT_IDX[x.a+"|"+x.t]=x; (SOFT_IDX[x.a]=SOFT_IDX[x.a]||[]).push&&0});
const SOFT_BY_ART={}; M.ART.forEach(x=>(SOFT_BY_ART[x.a]=SOFT_BY_ART[x.a]||[]).push(x));
const WB_BY_ART={}; M.WB.forEach(x=>(WB_BY_ART[x.a]=WB_BY_ART[x.a]||[]).push(x));
const TANNERIES=["ETT","ETI","ETX","ETH"];
const SOFT_TOL=0.5;

function thicknessesFor(a){
  const s=new Set();
  (SOFT_BY_ART[a]||[]).forEach(x=>x.t&&s.add(x.t));
  (WB_BY_ART[a]||[]).forEach(x=>x.t&&s.add(x.t));
  return [...s].sort();
}
/* The softness master holds more than one row for 131 article+thickness keys — some are a
   different target per customer, some are conflicting duplicates. Prefer the row whose brand
   matches the lot's customer; if several still match, average them and report how many, so the
   operator can see the master needs cleaning rather than getting one row picked silently. */
function softStd(a,t,customer){
  const all=SOFT_BY_ART[a]||[];
  let c=all.filter(x=>x.t===t); if(!c.length)c=all; if(!c.length)return null;
  if(customer){const byB=c.filter(x=>x.b===customer); if(byB.length)c=byB}
  if(c.length===1)return {...c[0],n:1};
  const avg=i=>{const v=c.map(x=>x.s[i]).filter(x=>x!=null);return v.length?Math.round(v.reduce((p,q)=>p+q,0)/v.length*10)/10:null};
  return {a,t,b:c[0].b,s:[avg(0),avg(1),avg(2)],n:c.length,brands:[...new Set(c.map(x=>x.b))]};
}
function wbStd(a,t,tan){
  const l=WB_BY_ART[a]||[];
  return l.find(x=>x.t===t&&x.ty===tan) || l.find(x=>x.t===t) || l.find(x=>x.ty===tan) || l[0] || null;
}
function coloursFor(a){
  if(!a) return [];
  if(M.COL[a]) return M.COL[a];
  const hit=Object.keys(M.COL).filter(k=>k.startsWith(a)||a.startsWith(k));
  return hit.length?hit.flatMap(k=>M.COL[k]):[];
}
function brandFor(a,t){ const s=softStd(a,t); if(s&&s.b) return s.b; const w=(WB_BY_ART[a]||[])[0]; return w?w.bd:"" }

/* ============================ CONFIG ============================ */
const SUB_RANGES=(()=>{const a=new Set();for(let i=4;i<=24;i++)a.add((i/10).toFixed(1)+"-"+((i+2)/10).toFixed(1));
  M.ART.forEach(x=>x.t&&a.add(x.t)); M.WB.forEach(x=>x.t&&a.add(x.t)); return [...a].sort()})();
const WB_GRADES=["A","P","G","M","L","TR"];
const DEC3=[["ACCEPTED","รับได้","pass"],["ACCEPTED WO","รับแบบมีเงื่อนไข","near"],["REJECTED","ไม่รับ","fail"]];
const COEF_TARGET=83, DENSITY_DEFAULT=0.90;
const GRADE_KEYS=["G1","G2","G3","G4","G5","G6","G7","G8"];

const SOFT_ROWS=[
 {k:"SOFT_N",en:"Softness – neck",th:"ความนุ่ม (คอ)",t:"num",u:"",soft:0},
 {k:"SOFT_B",en:"Softness – belly",th:"ความนุ่ม (ท้อง)",t:"num",u:"",soft:1},
 {k:"SOFT_BU",en:"Softness – butt",th:"ความนุ่ม (สะโพก)",t:"num",u:"",soft:2}
];

const STAGES=[
{code:"WBTO",nm:"Wet-blue",th:"เวทบลู",full:"Wet-blue Receiving",fullTh:"รับหนังเวทบลู",
 groups:[
  {g:"Selection vs wet-blue standard",gth:"เทียบมาตรฐานการเลือกเวทบลู",rows:[
    {k:"HIDES",en:"Hide type",th:"ชนิดหนังดิบ",t:"auto",src:["h","ah","ch","nh"]},
    {k:"SUPPLIER",en:"Supplier",th:"ผู้ขาย",t:"auto",src:["sp","asp","csp","nsp"]},
    {k:"MATCODE",en:"Material code",th:"รหัสวัสดุ",t:"auto",src:["mc","amc","cmc","nmc"]},
    {k:"WB_GRADE",en:"Wet-blue grade",th:"เกรดเวทบลู",t:"pick",opts:WB_GRADES},
    {k:"ORIGIN",en:"Country of origin",th:"ประเทศต้นทาง",t:"txt"}
  ]},
  {g:"Measured",gth:"ค่าที่วัดได้",rows:[
    {k:"THK_IN",en:"Substance received",th:"ความหนาที่รับเข้า",t:"meas",u:"MM",std:[1.4,1.6],fromSub:true},
    {k:"MOIST",en:"Moisture",th:"ความชื้น",t:"meas",u:"%",std:[45,60]},
    {k:"SHRINK",en:"Shrinkage temp",th:"อุณหภูมิหดตัว",t:"minonly",u:"°C",std:[95,null]},
    {k:"PH",en:"pH",th:"ค่าความเป็นกรด-ด่าง",t:"num",u:"",std:[3.5,4.2]}
  ]},
  {g:"Appearance",gth:"ภาพรวมหนัง",rows:[
    {k:"APPEAR",en:"Overall appearance",th:"ภาพรวมหนัง",t:"sel3"},
    {k:"CLEAN",en:"Free from mould / stain",th:"ไม่มีรา / คราบ",t:"pf"},
    {k:"TRIM_IN",en:"Trim condition",th:"สภาพการทริม",t:"pick",opts:["GOOD","FAIR","POOR"],good:["GOOD"]}
  ]}],
 counts:[{k:"PCS_RCV",en:"Pieces received",th:"จำนวนที่รับ",u:"PCS"},{k:"PCS_ACC",en:"Pieces accepted",th:"จำนวนที่รับไว้",u:"PCS"},{k:"SF_RCV",en:"Area received",th:"พื้นที่ที่รับ",u:"SF"}],
 decision:{k:"WB_DEC",en:"WBTO decision",th:"ผลตัดสิน WBTO"}},

{code:"RTO",nm:"Retanning",th:"รีแทน / ย้อม",full:"Retanning Hand-over",fullTh:"รับหนังเข้ารีแทน",
 groups:[
  {g:"After shaving",gth:"หลังเชฟวิ่ง",rows:[
    {k:"THK_SHV",en:"Shaved substance",th:"ความหนาหลังเชฟ",t:"meas",u:"MM",std:[1.4,1.6],fromSub:true},
    {k:"MOIST",en:"Moisture",th:"ความชื้น",t:"meas",u:"%",std:[45,60]},
    {k:"APPEAR",en:"Overall appearance",th:"ภาพรวมหนัง",t:"sel3"},
    {k:"TRIM_Q",en:"Trim quality",th:"คุณภาพการทริม",t:"pick",opts:["GOOD","FAIR","POOR"],good:["GOOD"]},
    {k:"PCS_OK",en:"Piece count complete",th:"จำนวนหนังครบ",t:"pf"}
  ]},
  {g:"Wet-end process control",gth:"ควบคุมกระบวนการเปียก",rows:[
    {k:"PH_UTIL",en:"pH – utilization",th:"pH ช่วงรีแทน",t:"num",u:"",std:[4.0,5.0]},
    {k:"PH_DYE",en:"pH – dyeing",th:"pH ช่วงย้อมสี",t:"num",u:"",std:[4.5,5.5]},
    {k:"PH_FAT",en:"pH – fatliquoring",th:"pH ช่วงเติมน้ำมัน",t:"num",u:"",std:[4.5,5.5]},
    {k:"PH_FIX",en:"pH – fixing",th:"pH ช่วงตรึง",t:"num",u:"",std:[3.4,3.9]},
    {k:"PH_FIN",en:"Final pH",th:"pH สุดท้าย",t:"num",u:"",std:[3.5,4.0]},
    {k:"LEAD",en:"Retan lead time",th:"เวลาที่ใช้รีแทน",t:"num",u:"HR",std:[0,24]}
  ]}],
 counts:[{k:"PCS_IN",en:"Pieces in",th:"จำนวนเข้า",u:"PCS"},{k:"SF_IN",en:"Area in",th:"พื้นที่เข้า",u:"SF"},{k:"RECIPE",en:"Recipe / formula no.",th:"เลขสูตร",u:"",text:true}],
 decision:{k:"RTO_DEC",en:"RTO decision",th:"ผลตัดสิน RTO"}},

{code:"CTO",nm:"Crust",th:"หนังแห้ง / คลัสต์",full:"Crust Check-point",fullTh:"จุดตรวจหนังแห้ง",
 groups:[
  {g:"Conformity",gth:"ความถูกต้อง",rows:[
    {k:"COL_MATCH",en:"Colour match vs standard",th:"สีใกล้เคียงมาตรฐาน",t:"sel3"},
    {k:"ART_OK",en:"Article correctness",th:"ถูกต้องตามอาร์ติเคิล",t:"sel3"},
    {k:"TOPDYE",en:"Top dye required",th:"ต้องท็อปดายหรือไม่",t:"pick",opts:["NO","YES"],good:["NO"]}
  ]},
  {g:"Physical",gth:"ค่าทางกายภาพ",rows:[
    ...SOFT_ROWS,
    {k:"BREAK",en:"Break / loose grain 1–5",th:"เบรค / ผิวหลวม (น้อย = ดี)",t:"minonly",u:"LV",std:[null,2],maxOnly:true},
    {k:"SUB",en:"Substance actual",th:"ความหนาที่วัดจริง",t:"meas",u:"MM",std:[1.4,1.6],fromSub:true},
    {k:"MOIST",en:"Moisture",th:"ความชื้น",t:"meas",u:"%",std:[12,16]},
    {k:"APPEAR",en:"Overall appearance",th:"ภาพรวมหนัง",t:"sel3"}
  ]}],
 counts:[{k:"PCS_IN",en:"Pieces checked",th:"จำนวนที่ตรวจ",u:"PCS"},{k:"SF_IN",en:"Area checked",th:"พื้นที่ที่ตรวจ",u:"SF"},{k:"SF_AFF",en:"Affected area",th:"พื้นที่ที่มีปัญหา",u:"SF"}],
 decision:{k:"CTO_DEC",en:"CTO decision",th:"ผลตัดสิน CTO"}},

{code:"FHO",nm:"Finishing",th:"ตกแต่งผิว",full:"Finishing Hand-over",fullTh:"จุดตรวจหลังฟินิชชิ่ง — ต้องเป๊ะที่สุด",
 groups:[
  {g:"Conformity",gth:"ความถูกต้อง",rows:[
    {k:"COL_FIN",en:"Final colour accurate",th:"สีขั้นสุดท้ายถูกต้อง",t:"pf"},
    {k:"TAPE",en:"Tape test (finish adhesion)",th:"เทปเทส — การยึดเกาะชั้นสี",t:"pf"},
    {k:"ART_OK",en:"Article conforms to standard",th:"อาร์ติเคิลตรงมาตรฐาน",t:"pf"},
    {k:"RUB",en:"Rub test – dry",th:"ทดสอบการขัดถูแบบแห้ง",t:"pf"}
  ]},
  {g:"Physical",gth:"ค่าทางกายภาพ",rows:[
    {k:"THK",en:"Thickness",th:"ความหนา",t:"meas",u:"MM",std:[1.4,1.6],fromSub:true},
    ...SOFT_ROWS,
    {k:"MOIST",en:"Moisture",th:"ความชื้น",t:"meas",u:"%",std:[12,16]},
    {k:"GLOSS",en:"Gloss 1–5",th:"ความเงา",t:"meas",u:"",std:[2,4]},
    {k:"HAND",en:"Hand feel",th:"สัมผัสมือ",t:"sel3"},
    {k:"APPEAR",en:"Overall appearance",th:"ภาพรวมหนัง",t:"sel3"}
  ]}],
 counts:[{k:"PCS_IN",en:"Pieces checked",th:"จำนวนที่ตรวจ",u:"PCS"},{k:"SF_IN",en:"Area checked",th:"พื้นที่ที่ตรวจ",u:"SF"},{k:"SF_AFF",en:"Affected area",th:"พื้นที่ที่มีปัญหา",u:"SF"}],
 decision:{k:"FHO_DEC",en:"FHO decision",th:"ผลตัดสิน FHO"}},

{code:"GIP",nm:"Grading",th:"เกรดดิ้ง / แพ็ค",full:"Grading & Packing",fullTh:"เกรดหนังและบรรจุ",
 groups:[
  {g:"Appearance – same checks as FHO",gth:"ตรวจเหมือน FHO",rows:[
    {k:"THK",en:"Thickness",th:"ความหนา",t:"meas",u:"MM",std:[1.4,1.6],fromSub:true},
    ...SOFT_ROWS,
    {k:"MOIST",en:"Moisture",th:"ความชื้น",t:"meas",u:"%",std:[12,16]},
    {k:"COL_FIN",en:"Colour vs standard",th:"สีเทียบมาตรฐาน",t:"sel3"},
    {k:"TAPE",en:"Tape test",th:"เทปเทส",t:"pf"}
  ]}],
 decision:{k:"GIP_DEC",en:"GIP decision",th:"ผลตัดสิน GIP"}},

{code:"PD-TRL",nm:"Trial / R&D",th:"ทดลอง / พัฒนา",full:"Trial & Development",fullTh:"งานทดลองและพัฒนา",trial:true}
];

const EXAMPLES=[
 {lot:"5042918",stg:"CTO",res:"fail",txt:"DRITTON · BREAK 4 · LG LOOSE GRAIN · COLOUR ACCEPTED WO",foot:"12 SEPT, 22:06 · AFFECTED 420 SF · HOLD"},
 {lot:"5042931",stg:"FHO",res:"pass",txt:"DRITTON · TAPE PASS · ALL VALUES IN STANDARD",foot:"12 SEPT, 22:06 · RELEASED TO GIP"},
 {lot:"5043002",stg:"GIP",res:"near",txt:"CAMELIA · COEFFICIENT 83.9% · FTT 91.2%",foot:"12 SEPT, 21:40 · CLOSE TO LIMIT"}
];

/* ============================ STATE ============================ */
let ONLINE=false,LOCAL=[],stage=STAGES[0],V={},rejects=[],mainDef="",stdOverride={},SPEC=null,SOFT=null;
const SESSION=getSession();
const $=(s,r=document)=>r.querySelector(s);
const el=(t,c,h)=>{const n=document.createElement(t);if(c)n.className=c;if(h!=null)n.innerHTML=h;return n};
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:null};
const f1=n=>n==null?"—":(Math.round(n*10)/10).toFixed(1);
const f2=n=>n==null?"—":(Math.round(n*100)/100).toFixed(2);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const slug=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9_.\-+:@~]/g,"_").slice(0,60)||"NA";
function toast(m,err){const t=el("div","toast"+(err?" err":""),m);$("#toast").append(t);setTimeout(()=>t.remove(),3200)}

/* Prominent save-confirmation popup (distinct from the small bottom toast above) — shown
   after a record actually saves to the server, per operator request that a click-away toast
   was too easy to miss. Auto-dismisses, but can also be closed early by click/Escape/Enter. */
function _savedModalEsc(e){if(e.key==="Escape"||e.key==="Enter")hideSavedPopup()}
function hideSavedPopup(){
  const ov=document.getElementById("savedModal");
  if(ov)ov.classList.remove("show");
  document.removeEventListener("keydown",_savedModalEsc);
}
function showSavedPopup(msg){
  let ov=document.getElementById("savedModal");
  if(!ov){
    ov=el("div","modal-overlay");ov.id="savedModal";
    ov.innerHTML='<div class="modal-box" role="alertdialog" aria-live="assertive" aria-label="บันทึกข้อมูลสำเร็จ">'+
      '<div class="modal-ic">✓</div>'+
      '<div class="modal-msg" id="savedModalMsg"></div>'+
      '<button class="btn primary sm" type="button" id="savedModalOk">OK</button></div>';
    document.body.append(ov);
    ov.addEventListener("click",e=>{if(e.target===ov)hideSavedPopup()});
    ov.querySelector("#savedModalOk").addEventListener("click",hideSavedPopup);
  }
  ov.querySelector("#savedModalMsg").textContent=msg||"บันทึกข้อมูลสำเร็จ";
  ov.classList.add("show");
  clearTimeout(ov._t);
  ov._t=setTimeout(hideSavedPopup,2500);
  document.removeEventListener("keydown",_savedModalEsc);
  document.addEventListener("keydown",_savedModalEsc);
}

/* ============================ JUDGEMENT ============================ */
function judgeNum(v,min,max){
  if(v==null) return "";
  const lo=(min==null||min==="")?null:+min, hi=(max==null||max==="")?null:+max;
  if(lo==null&&hi==null) return "";
  const band=(lo!=null&&hi!=null)?Math.abs(hi-lo):Math.abs(hi!=null?hi:lo)||1;
  const m=Math.max(band*0.05,1e-9);
  if((lo==null||v>=lo)&&(hi==null||v<=hi)) return "pass";
  if((lo!=null&&v>=lo-m&&v<lo)||(hi!=null&&v<=hi+m&&v>hi)) return "near";
  return "fail";
}
const worse=(a,b)=>{const o={"":0,pass:1,near:2,fail:3};return o[b]>o[a]?b:a};

function stdFor(row){
  const o=stdOverride[stage.code+"."+row.k];
  if(o) return o;
  if(row.soft!=null&&SOFT&&SOFT.s[row.soft]!=null){const c=SOFT.s[row.soft];return [Math.round((c-SOFT_TOL)*10)/10,Math.round((c+SOFT_TOL)*10)/10]}
  if(row.fromSub&&V.SUBSTANCE){const p=String(V.SUBSTANCE).split("-");if(p.length===2)return [+p[0],+p[1]]}
  return row.std||[null,null];
}
function autoOpts(row){
  if(!SPEC) return {main:"",alts:[]};
  const vals=row.src.map(k=>SPEC[k]||"").filter(Boolean);
  return {main:vals[0]||"",alts:[...new Set(vals.slice(1))]};
}
function rowResult(row){
  const k=row.k,v=V[k];
  if(row.t==="sel3") return v==="ACCEPTED"?"pass":v==="ACCEPTED WO"?"near":v==="REJECTED"?"fail":"";
  if(row.t==="pf") return v==="PASS"?"pass":v==="FAIL"?"fail":"";
  if(row.t==="pick"){if(!v)return"";if(!row.good)return"pass";return row.good.includes(v)?"pass":"fail"}
  if(row.t==="auto"){
    if(!v) return "";
    const {main,alts}=autoOpts(row);
    if(!main) return "";
    if(v===main||main==="ANY") return "pass";
    if(alts.includes(v)) return "near";
    return "fail";
  }
  if(row.t==="txt"){if(!v)return"";const s=V[k+"__STD"];return !s?"pass":(s===v?"pass":"near")}
  const [lo,hi]=stdFor(row);
  if(row.t==="meas"){
    const a=num(V[k+"__FROM"]),b=num(V[k+"__TO"]);
    if(a==null&&b==null) return "";
    let r=""; if(a!=null)r=worse(r,judgeNum(a,lo,hi)); if(b!=null)r=worse(r,judgeNum(b,lo,hi)); return r;
  }
  const a=num(v); if(a==null) return "";
  if(row.maxOnly) return judgeNum(a,null,hi);
  if(row.t==="minonly") return judgeNum(a,lo,null);
  return judgeNum(a,lo,hi);
}
const badge=r=>'<span class="badge '+(r||"")+'">'+(r?r.toUpperCase():"–")+"</span>";

/* ============================ PARAM TABLE ============================ */
function buildParamTable(groups){
  const wrap=el("div","ptw"),tb=el("table","pt");
  tb.innerHTML='<thead><tr>'+
    '<th style="min-width:190px">Parameter <span class="th2">(พารามิเตอร์)</span></th>'+
    '<th class="ctr" style="min-width:150px">Standard <span class="th2">(มาตรฐาน)</span></th>'+
    '<th class="ctr" style="width:46px">Unit</th>'+
    '<th style="min-width:200px">Actual <span class="th2">(ค่าที่ได้)</span></th>'+
    '<th class="ctr" style="width:78px">Result</th></tr></thead>';
  tb.querySelectorAll(".th2").forEach(n=>n.style.cssText="font-family:var(--thai);text-transform:none;letter-spacing:0");
  const body=el("tbody");
  groups.forEach(g=>{
    const gr=el("tr","grp");
    gr.innerHTML='<td colspan="5">'+g.g+' <span style="font-family:var(--thai);text-transform:none;letter-spacing:0">('+g.gth+')</span></td>';
    body.append(gr);
    g.rows.forEach(r=>body.append(buildRow(r)));
  });
  tb.append(body);wrap.append(tb);return wrap;
}
function buildRow(row){
  const tr=el("tr");tr.dataset.row=row.k;
  const id=s=>"f_"+stage.code.replace(/\W/g,"")+"_"+row.k+s;
  const c1=el("td");c1.innerHTML='<div class="pname">'+row.en+'<small>'+row.th+'</small></div>';tr.append(c1);

  const c2=el("td","std ctr");
  if(row.t==="meas"||row.t==="num"||row.t==="minonly"){
    const [lo,hi]=stdFor(row);
    const mk=(which,val,ph)=>{const i=el("input");i.type="number";i.step="0.1";i.inputMode="decimal";i.id=id("_std"+which);
      i.value=val==null?"":val;i.placeholder=ph;
      i.oninput=()=>{const cur=stdFor(row).slice();cur[which==="min"?0:1]=i.value===""?null:+i.value;stdOverride[stage.code+"."+row.k]=cur;recompute()};return i};
    if(row.maxOnly){c2.append(el("span","unit","≤ "),mk("max",hi,"max"))}
    else if(row.t==="minonly"){c2.append(el("span","unit","≥ "),mk("min",lo,"min"))}
    else{c2.append(mk("min",lo,"min"),el("span","unit"," – "),mk("max",hi,"max"))}
    if(row.soft!=null&&SOFT) c2.append(el("span","alt","TARGET "+f1(SOFT.s[row.soft])+" ±"+SOFT_TOL));
  } else if(row.t==="auto"){
    const {main,alts}=autoOpts(row);
    c2.innerHTML=main?'<span class="fromdb">'+esc(main)+'</span>'+(alts.length?'<span class="alt">ALT: '+esc(alts.join(" / "))+'</span>':"")
                     :'<span class="unit">เลือกอาร์ติเคิลก่อน</span>';
  }
  else if(row.t==="sel3") c2.innerHTML='<span class="unit">ACCEPTED</span>';
  else if(row.t==="pf") c2.innerHTML='<span class="unit">PASS</span>';
  else if(row.t==="pick") c2.innerHTML='<span class="unit">'+(row.good?row.good.join(" / "):"ANY")+'</span>';
  else{const i=el("input");i.type="text";i.id=id("_std");i.placeholder="STD";i.style.width="120px";
       i.oninput=()=>{V[row.k+"__STD"]=i.value.toUpperCase();i.value=V[row.k+"__STD"];recompute()};c2.append(i)}
  tr.append(c2);

  const c3=el("td","ctr");c3.innerHTML='<span class="unit">'+(row.u||"–")+'</span>';tr.append(c3);

  const c4=el("td","act");
  if(row.t==="meas"){
    const a=el("input");a.type="number";a.step="0.1";a.inputMode="decimal";a.id=id("_from");a.placeholder="from";
    const b=el("input");b.type="number";b.step="0.1";b.inputMode="decimal";b.id=id("_to");b.placeholder="to";
    a.oninput=()=>setV(row.k+"__FROM",a.value);b.oninput=()=>setV(row.k+"__TO",b.value);
    c4.append(a,el("span","sep","–"),b);
  } else if(row.t==="num"||row.t==="minonly"){
    const a=el("input");a.type="number";a.step="0.1";a.inputMode="decimal";a.id=id("_v");a.placeholder="value";
    a.oninput=()=>setV(row.k,a.value);c4.append(a);
  } else if(row.t==="auto"){
    const {main,alts}=autoOpts(row);
    const opts=[main,...alts].filter(Boolean);
    const a=el("input");a.type="text";a.className="wide";a.id=id("_v");a.placeholder="ACTUAL";
    if(opts.length){const dl=el("datalist");dl.id=id("_dl");dl.innerHTML=opts.map(o=>'<option value="'+esc(o)+'"></option>').join("");c4.append(dl);a.setAttribute("list",dl.id)}
    a.oninput=()=>{a.value=a.value.toUpperCase();setV(row.k,a.value)};c4.append(a);
  } else if(row.t==="txt"){
    const a=el("input");a.type="text";a.className="wide";a.id=id("_v");a.placeholder="ACTUAL";
    a.oninput=()=>{a.value=a.value.toUpperCase();setV(row.k,a.value)};c4.append(a);
  } else {
    const s=el("select");s.id=id("_v");
    const opts=row.t==="sel3"?DEC3.map(d=>d[0]):row.t==="pf"?["PASS","FAIL"]:row.opts;
    s.innerHTML='<option value="">— SELECT —</option>'+opts.map(o=>'<option>'+o+'</option>').join("");
    s.onchange=()=>setV(row.k,s.value);c4.append(s);
  }
  tr.append(c4);
  const c5=el("td","ctr res");c5.innerHTML=badge("");tr.append(c5);
  return tr;
}
function setV(k,val){V[k]=val;recompute();saveDraft()}

/* ============================ LOT HEADER ============================ */
function buildLot(){
  $("#dlArticles").innerHTML=ARTS.map(a=>'<option value="'+esc(a)+'"></option>').join("");
  const g1=$("#lotGrid"),g2=$("#lotGrid2");g1.innerHTML="";g2.innerHTML="";

  const wrapF=(en,th,req)=>{const l=el("label","f");
    l.innerHTML='<span class="lb">'+en+(req?' <span class="req">*</span>':"")+' <span class="th">('+th+')</span></span>';return l};

  // Lot no.
  let l=wrapF("Lot no.","เลขที่ล็อต",true);l.htmlFor="lot_LOT";
  const lot=el("input");lot.type="text";lot.id="lot_LOT";lot.placeholder="5042918";
  lot.oninput=()=>{lot.value=lot.value.toUpperCase();V.LOT=lot.value;saveDraft();pullLot(lot.value)};
  l.append(lot);g1.append(l);

  // Material code (auto-fill article/substance/colour from the MAT lookup table)
  l=wrapF("Material code","รหัสวัสดุ");l.htmlFor="lot_MATCODE";
  const mat=el("input");mat.type="text";mat.id="lot_MATCODE";mat.placeholder="E00602706083";mat.style.textTransform="uppercase";
  mat.oninput=()=>{mat.value=mat.value.toUpperCase()};
  mat.addEventListener("change",()=>applyMaterialLookup(mat.value));
  mat.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();applyMaterialLookup(mat.value)}});
  l.append(mat);l.append(el("div","hint","พิมพ์รหัสวัสดุเต็มแล้วกด Enter — เติมอาร์ติเคิล/ความหนา/สีให้อัตโนมัติ (ถ้ามีในระบบ)"));
  g1.append(l);

  // Article (datalist)
  l=wrapF("Article","รหัสหนัง",true);l.htmlFor="lot_ARTICLE";
  const art=el("input");art.type="text";art.id="lot_ARTICLE";art.placeholder="DRITTON";art.setAttribute("list","dlArticles");
  art.oninput=()=>{art.value=art.value.toUpperCase();V.ARTICLE=art.value;applyArticle(true)};
  l.append(art);l.append(el("div","hint","พิมพ์ 2–3 ตัวอักษรแล้วเลือก — ระบบดึงมาตรฐานให้ทั้งหมด"));
  g1.append(l);

  // Substance
  l=wrapF("Substance range","ช่วงความหนา");l.htmlFor="lot_SUBSTANCE";
  const sub=el("select");sub.id="lot_SUBSTANCE";
  sub.onchange=()=>{V.SUBSTANCE=sub.value;applyArticle(false)};
  l.append(sub);g1.append(l);

  // Colour
  l=wrapF("Colour code","รหัสสี");l.htmlFor="lot_COLOUR";
  const col=el("select");col.id="lot_COLOUR";
  col.onchange=()=>{V.COLOUR=col.value;const o=col.options[col.selectedIndex];V.COLOUR_DESC=o?o.dataset.d||"":"";renderStrip();saveDraft()};
  l.append(col);g1.append(l);

  // Tannery
  l=wrapF("Tannery","โรงงาน");l.htmlFor="lot_TANNERY";
  const tan=el("select");tan.id="lot_TANNERY";
  tan.innerHTML=TANNERIES.map(t=>'<option'+(t==="ETT"?" selected":"")+'>'+t+'</option>').join("");
  V.TANNERY="ETT";tan.onchange=()=>{V.TANNERY=tan.value;applyArticle(false)};
  l.append(tan);g2.append(l);

  // Customer
  l=wrapF("Customer / brand","ลูกค้า");l.htmlFor="lot_CUSTOMER";
  const cus=el("input");cus.type="text";cus.id="lot_CUSTOMER";cus.placeholder="ECCO";
  cus.oninput=()=>{cus.value=cus.value.toUpperCase();V.CUSTOMER=cus.value;clearTimeout(cusT);cusT=setTimeout(()=>applyArticle(false),500);saveDraft()};
  l.append(cus);g2.append(l);

  [["QTY_SF","Quantity","จำนวน — SF"],["PIECES","Pieces","จำนวนแผ่น"]].forEach(([k,en,th])=>{
    const lb=wrapF(en,th);lb.htmlFor="lot_"+k;
    const i=el("input");i.type="number";i.inputMode="decimal";i.id="lot_"+k;i.placeholder="0";
    i.oninput=()=>{V[k]=i.value;saveDraft()};lb.append(i);g2.append(lb);
  });

  const il=wrapF("Inspector","ผู้ตรวจ",true);il.htmlFor="lot_INSPECTOR";
  const inspectorList=window.INSPECTORS||[];
  let ins;
  if(inspectorList.length){
    ins=el("select");ins.id="lot_INSPECTOR";
    ins.innerHTML='<option value="">— SELECT (เลือก) —</option>'+inspectorList.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join("");
    ins.onchange=()=>{V.INSPECTOR=ins.value;try{localStorage.setItem("ett_insp",ins.value)}catch(e){};saveDraft()};
    try{const s=localStorage.getItem("ett_insp");if(s&&inspectorList.includes(s)){ins.value=s;V.INSPECTOR=s}}catch(e){}
    il.append(ins);il.append(el("div","hint","จัดการรายชื่อผู้ตรวจได้ที่หน้า Setup"));
  } else {
    ins=el("input");ins.type="text";ins.id="lot_INSPECTOR";ins.placeholder="NAME";
    ins.oninput=()=>{ins.value=ins.value.toUpperCase();V.INSPECTOR=ins.value;try{localStorage.setItem("ett_insp",ins.value)}catch(e){};saveDraft()};
    try{const s=localStorage.getItem("ett_insp");if(s){ins.value=s;V.INSPECTOR=s}}catch(e){}
    il.append(ins);il.append(el("div","hint","ยังไม่มีรายชื่อผู้ตรวจในระบบ — เพิ่มได้ที่หน้า Setup"));
  }
  g2.append(il);

  const dl=wrapF("Date / time","วันที่ / เวลา");dl.htmlFor="lot_DT";
  const d=el("input");d.type="datetime-local";d.id="lot_DT";d.style.textTransform="none";
  const now=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16);
  d.value=now;V.DT=now;d.oninput=()=>{V.DT=d.value;saveDraft()};dl.append(d);g2.append(dl);

  fillSubstance();fillColours();
  if(hasRole(ROLES.VIEWER)){
    g1.querySelectorAll("input,select").forEach(x=>x.disabled=true);
    g2.querySelectorAll("input,select").forEach(x=>x.disabled=true);
  }
}
function fillSubstance(){
  const sub=$("#lot_SUBSTANCE");if(!sub)return;
  const own=thicknessesFor(V.ARTICLE||"");
  const list=own.length?own:SUB_RANGES;
  sub.innerHTML='<option value="">— SELECT (เลือก) —</option>'+list.map(o=>'<option'+(o===V.SUBSTANCE?" selected":"")+'>'+o+'</option>').join("")+
    (own.length?'<optgroup label="ALL RANGES">'+SUB_RANGES.filter(o=>!own.includes(o)).map(o=>'<option'+(o===V.SUBSTANCE?" selected":"")+'>'+o+'</option>').join("")+'</optgroup>':"");
  if(own.length===1&&!V.SUBSTANCE){V.SUBSTANCE=own[0];sub.value=own[0]}
  sub.classList.toggle("filled",!!V.SUBSTANCE&&own.includes(V.SUBSTANCE));
}
function fillColours(){
  const col=$("#lot_COLOUR");if(!col)return;
  const list=coloursFor(V.ARTICLE||"");
  const act=list.filter(c=>c[2]),ina=list.filter(c=>!c[2]);
  col.innerHTML='<option value="">— SELECT (เลือก) —</option>'+
    act.map(c=>'<option value="'+esc(c[0])+'" data-d="'+esc(c[1])+'"'+(c[0]===V.COLOUR?" selected":"")+'>'+esc(c[0])+' — '+esc(c[1])+'</option>').join("")+
    (ina.length?'<optgroup label="NOT ACTIVE (ไม่ใช้งาน)">'+ina.map(c=>'<option value="'+esc(c[0])+'" data-d="'+esc(c[1])+'"'+(c[0]===V.COLOUR?" selected":"")+'>'+esc(c[0])+' — '+esc(c[1])+'</option>').join("")+'</optgroup>':"");
  col.classList.toggle("filled",!!V.COLOUR);
}
function matLookup(code){
  const c=String(code||"").trim().toUpperCase();
  if(!c) return null;
  const list=(M&&M.MAT)||[];
  return list.find(x=>String(x.mc||"").toUpperCase()===c)||null;
}
function applyMaterialLookup(code){
  const hit=matLookup(code);
  if(!hit){ if(String(code||"").trim()) toast("ไม่พบรหัสวัสดุนี้ในระบบ — กรอกด้วยตนเองได้ตามปกติ",true); return; }
  V.ARTICLE=hit.a||V.ARTICLE;
  const ai=$("#lot_ARTICLE"); if(ai) ai.value=V.ARTICLE;
  applyArticle(true);
  if(hit.t){
    V.SUBSTANCE=hit.t;fillSubstance();
    const su=$("#lot_SUBSTANCE");if(su)su.value=V.SUBSTANCE;
    applyArticle(false);
  }
  if(hit.cc){
    V.COLOUR=String(hit.cc);fillColours();
    const co=$("#lot_COLOUR");
    if(co){co.value=V.COLOUR;const o=co.options[co.selectedIndex];V.COLOUR_DESC=(o&&o.value===V.COLOUR)?(o.dataset.d||""):(hit.cd||"")}
  }
  if(hit.cu&&!V.CUSTOMER){V.CUSTOMER=hit.cu;const cu=$("#lot_CUSTOMER");if(cu)cu.value=hit.cu}
  renderStrip();saveDraft();
  toast("เติมข้อมูลจากรหัสวัสดุแล้ว: "+hit.a+(hit.t?" · "+hit.t:"")+(hit.cc?" · สี "+hit.cc:""));
}
function applyArticle(fresh){
  const a=V.ARTICLE||"";
  if(fresh){const ts=thicknessesFor(a);if(ts.length===1)V.SUBSTANCE=ts[0];else if(!ts.includes(V.SUBSTANCE))V.SUBSTANCE="";V.COLOUR=""}
  fillSubstance();fillColours();
  SOFT=softStd(a,V.SUBSTANCE,V.CUSTOMER);
  SPEC=wbStd(a,V.SUBSTANCE,V.TANNERY||"ETT");
  const b=brandFor(a,V.SUBSTANCE);
  if(b&&!V.CUSTOMER){V.CUSTOMER=b;const c=$("#lot_CUSTOMER");if(c)c.value=b}
  const ai=$("#lot_ARTICLE");if(ai)ai.classList.toggle("filled",!!(SOFT||SPEC));
  renderStrip();renderStage();saveDraft();
}
function renderStrip(){
  const s=$("#strip");
  if(!V.ARTICLE||(!SOFT&&!SPEC)){s.className="strip off";
    s.innerHTML='<div><div class="k">Standard</div><div class="v"><em>เลือกอาร์ติเคิลเพื่อโหลดมาตรฐาน — '+ARTS.length+' รายการในระบบ</em></div></div>';return}
  s.className="strip";
  const cell=(k,v,sub)=>'<div><div class="k">'+k+'</div><div class="v">'+(v||'<em>—</em>')+(sub?' <em>'+sub+'</em>':"")+'</div></div>';
  let h="";
  h+=cell("Article / thickness",esc(V.ARTICLE)+(V.SUBSTANCE?" "+V.SUBSTANCE+" MM":""));
  if(SPEC){
    h+=cell("Catalogue grade",esc(SPEC.g)||"<em>—</em>",SPEC.ty?"· "+SPEC.ty:"");
    h+=cell("Wet-blue standard",esc([SPEC.h,SPEC.sp,SPEC.mc].filter(Boolean).join(" / ")),
            SPEC.amc?"ALT "+esc([SPEC.ah,SPEC.amc].filter(Boolean).join(" / ")):"");
  }
  if(SOFT) h+=cell("Softness N / B / BU",SOFT.s.map(x=>f1(x)).join(" · "),"±"+SOFT_TOL+(SOFT.n>1?" · avg of "+SOFT.n+" rows":(SOFT.b?" · "+esc(SOFT.b):"")));
  const cl=coloursFor(V.ARTICLE);
  h+=cell("Colours on file",cl.filter(c=>c[2]).length+" active",cl.length?"/ "+cl.length+" total":"");
  s.innerHTML=h;
}

/* ============================ STAGE RENDER ============================ */
function renderStage(){
  const b=$("#stageBody");b.innerHTML="";
  $("#stgTitle").innerHTML=stage.code+" — "+stage.full+' <span class="th">('+stage.fullTh+')</span>';
  $("#recId").textContent=stage.code+" · "+(V.LOT||"NO LOT");
  if(stage.trial){renderTrial(b);restore();recompute();lockViewer(b);return}

  b.append(quickbar());
  b.append(sec("Actual vs standard","ค่าที่วัดได้เทียบมาตรฐาน"));
  b.append(buildParamTable(stage.groups));
  if(stage.code==="GIP") renderGIP(b);

  if(stage.counts){
    b.append(sec("Quantities","จำนวน"));
    const g=el("div","grid g3");
    stage.counts.forEach(c=>{
      const l=el("label","f");l.htmlFor="c_"+c.k;
      l.innerHTML='<span class="lb">'+c.en+' <span class="th">('+c.th+')</span>'+(c.u?' <span class="unit">'+c.u+'</span>':"")+'</span>';
      const i=el("input");i.type=c.text?"text":"number";if(!c.text)i.inputMode="decimal";
      i.id="c_"+c.k;i.placeholder=c.text?"—":"0";
      i.oninput=()=>{if(c.text)i.value=i.value.toUpperCase();setV(c.k,i.value)};
      l.append(i);g.append(l);
    });
    b.append(g);
  }

  b.append(sec("Defect / reject reasons","ตำหนิและเหตุผลรีเจค"));
  b.append(buildRejectPicker());

  b.append(sec("Decision & notes","ผลตัดสินและหมายเหตุ"));
  const dg=el("div","grid g2");
  const dl=el("label","f");dl.htmlFor="dec";
  dl.innerHTML='<span class="lb">'+stage.decision.en+' <span class="th">('+stage.decision.th+')</span> <span class="req">*</span></span>';
  const ds=el("select");ds.id="dec";
  ds.innerHTML='<option value="">— SELECT (เลือก) —</option>'+DEC3.map(d=>'<option value="'+d[0]+'">'+d[0]+' ('+d[1]+')</option>').join("");
  ds.onchange=()=>setV("DECISION",ds.value);dl.append(ds);
  const nl=el("label","f");nl.htmlFor="note";
  nl.innerHTML='<span class="lb">Comment <span class="th">(หมายเหตุ / สิ่งที่พบ)</span></span>';
  const nt=el("textarea");nt.id="note";nt.placeholder="สิ่งที่พบ สาเหตุที่สงสัย และสิ่งที่ทำไปแล้ว…";
  nt.oninput=()=>{V.NOTE=nt.value;saveDraft()};nl.append(nt);
  dg.append(dl,nl);b.append(dg);

  b.append(savebar());
  restore();recompute();
  wireEnterKey(b);
  lockViewer(b);
}
function lockViewer(container){
  if(!hasRole(ROLES.VIEWER))return;
  container.querySelectorAll("input,select,textarea,button").forEach(x=>x.disabled=true);
}
function sec(en,th){return el("div","sec",en+' <span class="th">('+th+')</span>')}

function quickbar(){
  const q=el("div","quickbar");
  q.append(el("span","lbl","Quick fill"));
  const all=el("button","btn quick sm");all.type="button";all.innerHTML='✓ All in standard <span class="th">(ทุกค่าตรงมาตรฐาน)</span>';
  all.onclick=fillAllStandard;
  const last=el("button","btn sm");last.type="button";last.innerHTML='Copy last <span class="th">(ทำซ้ำจากล็อตก่อน)</span>';
  last.onclick=copyLast;
  const clr=el("button","btn sm");clr.type="button";clr.innerHTML='Clear <span class="th">(ล้าง)</span>';
  clr.onclick=()=>{const keep=["LOT","ARTICLE","COLOUR","COLOUR_DESC","CUSTOMER","SUBSTANCE","TANNERY","QTY_SF","PIECES","INSPECTOR","DT"];
    const n={};keep.forEach(k=>n[k]=V[k]);V=n;rejects=[];mainDef="";renderStage();saveDraft()};
  q.append(all,last,clr);
  return q;
}
function fillAllStandard(){
  (stage.groups||[]).forEach(g=>g.rows.forEach(r=>{
    if(r.t==="meas"){const [lo,hi]=stdFor(r);if(lo!=null)V[r.k+"__FROM"]=lo;if(hi!=null)V[r.k+"__TO"]=hi}
    else if(r.t==="num"||r.t==="minonly"){const [lo,hi]=stdFor(r);
      const v=r.maxOnly?hi:(r.t==="minonly"?lo:(lo!=null&&hi!=null?Math.round((lo+hi)/2*10)/10:(lo!=null?lo:hi)));
      if(v!=null)V[r.k]=v}
    else if(r.t==="sel3")V[r.k]="ACCEPTED";
    else if(r.t==="pf")V[r.k]="PASS";
    else if(r.t==="pick")V[r.k]=(r.good&&r.good[0])||r.opts[0];
    else if(r.t==="auto"){const {main}=autoOpts(r);if(main)V[r.k]=main}
  }));
  V.DECISION="ACCEPTED";
  renderStage();saveDraft();
  toast("เติมค่ามาตรฐานแล้ว — แก้เฉพาะช่องที่ไม่ตรง");
}
async function copyLast(){
  let src=null;
  const r=await API.getRecords({filters:{stage:stage.code,limit:1}});
  if(r&&r.ok&&r.records.length)src=r.records[0];
  if(!src)src=LOCAL.find(r=>r.stage===stage.code);
  if(!src)return toast("ยังไม่มีบันทึกก่อนหน้าของแผนกนี้",true);
  const sv=src.values||{};
  Object.keys(sv).forEach(k=>{if(!["LOT","DT","NOTE"].includes(k))V[k]=sv[k]});
  rejects=(src.rejects||[]).slice();mainDef=src.mainDefect||"";
  applyArticle(false);toast("คัดลอกจากล็อต "+src.lotNo+" แล้ว");
}

function savebar(){
  const a=el("div","savebar");
  if(hasRole(ROLES.VIEWER)){
    a.append(el("div","hint","บัญชีนี้ดูข้อมูลได้อย่างเดียว (view only) — ไม่สามารถบันทึกได้"));
    return a;
  }
  const save=el("button","btn primary");save.type="button";save.id="btnSave";save.innerHTML='Save record <span class="th">(บันทึก)</span>';
  save.onclick=saveRecord;
  a.append(save);
  if(hasRole(ROLES.ADMIN)){
    const std=el("button","btn");std.type="button";std.innerHTML='Save as article standard <span class="th">(ตั้งเป็นมาตรฐาน)</span>';
    std.onclick=saveStandard;
    a.append(std);
  }
  const v=el("div","verdict");v.innerHTML='Record result <span id="verdict">'+badge("")+'</span>';
  a.append(v);return a;
}

/* ============================ REJECT PICKER ============================ */
function buildRejectPicker(){
  const box=el("div","rjbox");
  const top=el("div","rjsearch");
  const q=el("input");q.type="search";q.id="rjq";q.placeholder="ค้นหา: รหัส CODE, ชื่อ, หรือเลข";
  const gsel=el("select");gsel.id="rjg";
  gsel.innerHTML='<option value="">ALL GROUPS (ทุกกลุ่ม)</option>'+M.GRP.map((g,i)=>i?'<option value="'+i+'">'+g+'</option>':"").join("");
  const ssel=el("select");ssel.id="rjs";
  const n=M.RJ.filter(r=>(r[6]||[]).includes(stage.code)).length;
  ssel.innerHTML=(stage.trial?"":'<option value="1">'+stage.code+' ONLY (แนะนำ '+n+')</option>')+
                 '<option value="">ALL STAGES (ทุกแผนก '+M.RJ.length+')</option>';
  top.append(q,ssel,gsel);
  const list=el("div","rjlist");list.id="rjlist";
  const sel=el("div","rjsel");sel.id="rjsel";
  box.append(top,list,sel);
  q.oninput=gsel.onchange=ssel.onchange=()=>paintRejectList();
  setTimeout(()=>{paintRejectList();paintRejectSel()},0);
  return box;
}
function paintRejectList(){
  const list=$("#rjlist");if(!list)return;
  const q=(($("#rjq")||{}).value||"").trim().toUpperCase();
  const g=(($("#rjg")||{}).value||"");
  const sc=(($("#rjs")||{}).value||"");
  const hits=M.RJ.filter(r=>{
    if(sc&&!(r[6]||[]).includes(stage.code)&&!rejects.includes(r[0])) return false;
    if(g&&String(r[4])!==g) return false;
    if(!q) return true;
    return r[0].includes(q)||r[1].includes(q)||r[2].includes(q)||(r[3]||"").includes(q);
  }).slice(0,160);
  list.innerHTML="";
  if(!hits.length){list.innerHTML='<div class="empty">ไม่พบรหัสที่ค้นหา</div>';return}
  hits.forEach(r=>{
    const b=el("button","rj"+(r[4]===2?" nat":""));b.type="button";
    b.setAttribute("aria-pressed",rejects.includes(r[0])?"true":"false");
    b.innerHTML='<b>'+(r[1]||r[0])+'</b>'+esc(r[2])+(r[3]?' <span style="font-family:var(--thai);opacity:.7">('+esc(r[3])+')</span>':"");
    b.onclick=()=>{const i=rejects.indexOf(r[0]);
      if(i<0){rejects.push(r[0]);if(!mainDef)mainDef=r[0]}
      else{rejects.splice(i,1);if(mainDef===r[0])mainDef=rejects[0]||""}
      b.setAttribute("aria-pressed",i<0?"true":"false");paintRejectSel();saveDraft()};
    list.append(b);
  });
}
function paintRejectSel(){
  const sel=$("#rjsel");if(!sel)return;
  if(!rejects.length){sel.innerHTML='<span class="none">ยังไม่เลือกตำหนิ — คลิกจากรายการด้านบน (ดาว ★ = ตำหนิหลัก)</span>';return}
  sel.innerHTML="";
  rejects.forEach(code=>{
    const r=M.RJ.find(x=>x[0]===code);if(!r)return;
    const t=el("span","rjtag"+(mainDef===code?" main":""));
    t.innerHTML='<span class="star" title="ตั้งเป็นตำหนิหลัก">★</span>'+(r[1]?r[1]+" · ":"")+esc(r[2]);
    const x=el("button");x.type="button";x.textContent="×";x.title="เอาออก";
    x.onclick=()=>{rejects=rejects.filter(c=>c!==code);if(mainDef===code)mainDef=rejects[0]||"";paintRejectList();paintRejectSel();saveDraft()};
    t.querySelector(".star").onclick=()=>{mainDef=code;paintRejectSel();saveDraft()};
    t.append(x);sel.append(t);
  });
}

/* ============================ GIP EXTRAS ============================ */
function renderGIP(b){
  b.append(sec("Area & yield","พื้นที่และผลผลิต"));
  const g=el("div","grid g4");
  [["IN_SF","Total input","พื้นที่เข้า","SF"],["OUT_SF","Total output","พื้นที่ออก","SF"],
   ["TRIM_KG","Trim weight","น้ำหนักเศษทริม","KG"],["DENSITY","Density","ความหนาแน่น","G/CM³"]].forEach(([k,en,th,u])=>{
    const l=el("label","f");l.htmlFor="g_"+k;
    l.innerHTML='<span class="lb">'+en+' <span class="th">('+th+')</span> <span class="unit">'+u+'</span></span>';
    const i=el("input");i.type="number";i.step="0.01";i.inputMode="decimal";i.id="g_"+k;i.placeholder=k==="DENSITY"?String(DENSITY_DEFAULT):"0.00";
    if(k==="DENSITY"&&V.DENSITY==null)V.DENSITY=DENSITY_DEFAULT;
    i.oninput=()=>setV(k,i.value);l.append(i);
    if(k==="TRIM_KG")l.append(el("div","hint","ใส่แค่น้ำหนัก ระบบแปลงเป็นฟุตให้อัตโนมัติ"));
    g.append(l);
  });
  b.append(g);
  const calc=el("div","calc");calc.style.marginTop="14px";
  calc.innerHTML='<div class="calc-row">'+kv("TRIM_SF","Trim area","เศษทริม → ฟุต")+kv("COEF","Coefficient","ค่าสัมประสิทธิ์")+
    kv("FTT","FTT","ผ่านครั้งแรก")+kv("YIELD","Grade 1–3 share","สัดส่วนเกรดดี")+'</div>'+
    '<div style="margin-top:10px;font-family:var(--mono);font-size:10.5px;color:var(--ink-3);line-height:1.7">'+
    'TRIM SF = KG ÷ (THICKNESS MM × DENSITY × 0.092903)<br>'+
    'COEFFICIENT = OUTPUT SF ÷ INPUT SF × 100 · PASS ≥ '+COEF_TARGET+'%<br>'+
    'FTT = (PCS OK − REPAIRED) ÷ TOTAL PCS × 100</div>';
  b.append(calc);

  b.append(sec("Pieces & repair","จำนวนแผ่นและการซ่อม"));
  const g2=el("div","grid g4");
  [["PCS_TOT","Total pieces","จำนวนทั้งหมด"],["PCS_OK","Pieces OK","จำนวนที่ผ่าน"],
   ["PCS_NG","Pieces not OK","จำนวนที่ไม่ผ่าน"],["REP_PCS","Repaired pieces","จำนวนที่ซ่อม"]].forEach(([k,en,th])=>{
    const l=el("label","f");l.htmlFor="g_"+k;
    l.innerHTML='<span class="lb">'+en+' <span class="th">('+th+')</span></span>';
    const i=el("input");i.type="number";i.inputMode="numeric";i.id="g_"+k;i.placeholder="0";i.oninput=()=>setV(k,i.value);
    l.append(i);g2.append(l);
  });
  b.append(g2);
  const g3=el("div","grid g2");g3.style.marginTop="12px";
  const rl=el("label","f");rl.htmlFor="g_REP_HIST";
  rl.innerHTML='<span class="lb">Repair history <span class="th">(มีประวัติการซ่อมหรือไม่)</span></span>';
  const rs=el("select");rs.id="g_REP_HIST";rs.innerHTML='<option value="">— SELECT (เลือก) —</option><option>NO</option><option>YES</option>';
  rs.onchange=()=>setV("REP_HIST",rs.value);rl.append(rs);
  const cl=el("label","f");cl.htmlFor="g_REP_CAT";
  cl.innerHTML='<span class="lb">Repair category <span class="th">(ประเภทการซ่อม)</span></span>';
  const cs=el("select");cs.id="g_REP_CAT";
  cs.innerHTML='<option value="">— SELECT (เลือก) —</option><option value="PRODUCT">PRODUCT (ตัวหนัง — เงา / หนา / นุ่ม)</option><option value="COLOUR">COLOUR (สี)</option><option value="PROCESSING">PROCESSING (เครื่องจักร / กระบวนการ)</option>';
  cs.onchange=()=>setV("REP_CAT",cs.value);cl.append(cs);
  g3.append(rl,cl);b.append(g3);

  b.append(sec("Grade split","การแบ่งเกรด"));
  const wrap=el("div","ptw"),t=el("table","gt");
  t.innerHTML='<thead><tr><th>Grade</th><th style="width:150px">Area (SF)</th><th class="ctr">Share</th><th>Distribution</th></tr></thead>';
  const tb=el("tbody");
  GRADE_KEYS.concat(["REJ"]).forEach(k=>{
    const tr=el("tr",k==="REJ"?"rej":"");
    const inTd=el("td");const i=el("input");i.type="number";i.step="0.01";i.inputMode="decimal";i.id="gr_"+k;i.placeholder="0.00";
    i.oninput=()=>setV("GR_"+k,i.value);inTd.append(i);
    const pTd=el("td","pct ctr");pTd.id="pct_"+k;pTd.textContent="—";
    const bTd=el("td","bar");bTd.innerHTML='<span id="bar_'+k+'" style="width:0"></span>';
    tr.append(el("td",null,k==="REJ"?"REJECT":"GRADE "+k.slice(1)),inTd,pTd,bTd);tb.append(tr);
  });
  t.append(tb);wrap.append(t);b.append(wrap);
  const bal=el("div","calc");bal.style.marginTop="12px";
  bal.innerHTML='<div class="calc-row">'+kv("GR_TOT","Graded total","รวมทุกเกรด")+kv("GR_DIF","Vs output SF","ต่างจากพื้นที่ออก")+'</div>';
  b.append(bal);
}
function kv(id,en,th){return '<div class="kv"><div class="k">'+en+' <span class="th">('+th+')</span></div><div class="v" id="kv_'+id+'">—</div></div>'}

/* ============================ TRIAL ============================ */
function renderTrial(b){
  b.append(sec("Trial identification","ข้อมูลการทดลอง"));
  const g=el("div","grid g3");
  [["TRL_TYPE","Trial type","ประเภทการทดลอง",["MATERIAL","CHEMICAL","MACHINE","RECIPE","PROCESS"]],
   ["TRL_STAGE","Stage involved","แผนกที่เกี่ยวข้อง",["WBTO","RTO","CTO","FHO","GIP"]],
   ["TRL_DRIVER","Driver","ที่มาของการทดลอง",["CUSTOMER CLAIM","INTERNAL DEFECT","COST REDUCTION","NPD","CUSTOMER REQUEST"]]].forEach(([k,en,th,o])=>{
    const l=el("label","f");l.htmlFor="t_"+k;
    l.innerHTML='<span class="lb">'+en+' <span class="th">('+th+')</span></span>';
    const s=el("select");s.id="t_"+k;s.innerHTML='<option value="">— SELECT (เลือก) —</option>'+o.map(x=>'<option>'+x+'</option>').join("");
    s.onchange=()=>setV(k,s.value);l.append(s);g.append(l);
  });
  b.append(g);
  b.append(sec("Target defect / reason","ตำหนิที่ต้องการแก้"));
  b.append(buildRejectPicker());
  const g2=el("div","grid g2");g2.style.marginTop="14px";
  [["TRL_OBJ","Objective","วัตถุประสงค์","ต้องการแก้ปัญหาอะไร / วัดผลอย่างไร"],
   ["TRL_REC","Recipe / setting changed","สูตรหรือค่าที่เปลี่ยน","เคมี ปริมาณ เวลา อุณหภูมิ ค่าเครื่อง"],
   ["TRL_CTRL","Control result","ผลของตัวควบคุม","ผลของสูตรเดิม"],
   ["TRL_RES","Trial result","ผลของการทดลอง","ผลที่ได้จริง"],
   ["TRL_RC","Root cause found","สาเหตุที่พบ","สาเหตุที่แท้จริง"],
   ["TRL_ACT","Action taken / decision","สิ่งที่ทำต่อ","นำไปใช้จริง / ทดลองซ้ำ / ยกเลิก"]].forEach(([k,en,th,ph])=>{
    const l=el("label","f");l.htmlFor="t_"+k;
    l.innerHTML='<span class="lb">'+en+' <span class="th">('+th+')</span></span>';
    const t=el("textarea");t.id="t_"+k;t.placeholder=ph;t.oninput=()=>{V[k]=t.value;saveDraft()};l.append(t);g2.append(l);
  });
  b.append(g2);
  const a=el("div","savebar");
  const save=el("button","btn primary");save.type="button";save.id="btnSave";save.innerHTML='Save trial <span class="th">(บันทึกการทดลอง)</span>';
  save.onclick=saveRecord;a.append(save);b.append(a);
}

/* ============================ RESTORE / ENTER-KEY / DRAFT ============================ */
function restore(){
  const set=(id,val)=>{const n=document.getElementById(id);if(n&&val!=null&&val!==""){n.value=val;if(n.tagName!=="TEXTAREA")n.classList.add("filled")}};
  (stage.groups||[]).forEach(g=>g.rows.forEach(r=>{
    const base="f_"+stage.code.replace(/\W/g,"")+"_"+r.k;
    if(r.t==="meas"){set(base+"_from",V[r.k+"__FROM"]);set(base+"_to",V[r.k+"__TO"])}
    else{set(base+"_v",V[r.k]);if(r.t==="txt")set(base+"_std",V[r.k+"__STD"])}
  }));
  (stage.counts||[]).forEach(c=>set("c_"+c.k,V[c.k]));
  if(stage.code==="GIP"){
    ["IN_SF","OUT_SF","TRIM_KG","DENSITY","PCS_TOT","PCS_OK","PCS_NG","REP_PCS","REP_HIST","REP_CAT"].forEach(k=>set("g_"+k,V[k]));
    GRADE_KEYS.concat(["REJ"]).forEach(k=>set("gr_"+k,V["GR_"+k]));
  }
  if(stage.trial)["TRL_TYPE","TRL_STAGE","TRL_DRIVER","TRL_OBJ","TRL_REC","TRL_CTRL","TRL_RES","TRL_RC","TRL_ACT"].forEach(k=>set("t_"+k,V[k]));
  set("dec",V.DECISION);const n=$("#note");if(n&&V.NOTE)n.value=V.NOTE;
  paintRejectList();paintRejectSel();
}
function wireEnterKey(root){
  root.addEventListener("keydown",e=>{
    if(e.key!=="Enter"||e.target.tagName==="TEXTAREA")return;
    e.preventDefault();
    const f=[...root.querySelectorAll("input,select")].filter(x=>!x.disabled&&x.offsetParent!==null);
    const i=f.indexOf(e.target);if(i>-1&&f[i+1])f[i+1].focus();
  });
}
let cusT=null,draftT=null;
function saveDraft(){clearTimeout(draftT);draftT=setTimeout(()=>{
  try{localStorage.setItem("ett_draft_"+stage.code,JSON.stringify({V,rejects,mainDef}))}catch(e){}},400)}
function loadDraft(){
  try{const s=localStorage.getItem("ett_draft_"+stage.code);if(!s)return false;
    const d=JSON.parse(s);V=d.V||{};rejects=d.rejects||[];mainDef=d.mainDef||"";return true}catch(e){return false}
}

/* ============================ RECOMPUTE ============================ */
function recompute(){
  let overall="";
  if(!stage.trial){
    document.querySelectorAll("#stageBody tr[data-row]").forEach(tr=>{
      const row=findRow(tr.dataset.row);if(!row)return;
      const r=rowResult(row);tr.querySelector(".res").innerHTML=badge(r);overall=worse(overall,r);
    });
    if(V.DECISION)overall=worse(overall,V.DECISION==="ACCEPTED"?"pass":V.DECISION==="ACCEPTED WO"?"near":"fail");
    const vd=$("#verdict");if(vd)vd.innerHTML=badge(overall);
  }
  if(stage.code==="GIP")gipCalc();
  V.__RESULT=overall;
}
function findRow(k){for(const g of (stage.groups||[]))for(const r of g.rows)if(r.k===k)return r;return null}
function thicknessMid(){
  const a=num(V.THK__FROM),b=num(V.THK__TO);
  if(a!=null&&b!=null)return (a+b)/2;if(a!=null)return a;if(b!=null)return b;
  if(V.SUBSTANCE){const p=String(V.SUBSTANCE).split("-");if(p.length===2)return (+p[0]+ +p[1])/2}
  return null;
}
function setKv(id,txt,cls){const n=document.getElementById("kv_"+id);if(!n)return;n.innerHTML=txt;n.className="v"+(cls?" "+cls:"")}
function gipCalc(){
  const inSf=num(V.IN_SF),outSf=num(V.OUT_SF),kg=num(V.TRIM_KG),d=num(V.DENSITY)||DENSITY_DEFAULT,t=thicknessMid();
  let trimSf=null;
  if(kg!=null&&t){trimSf=kg/(t*d*0.092903);setKv("TRIM_SF",f1(trimSf)+' <small>SF</small>')}
  else setKv("TRIM_SF",t?"—":'<small style="font-size:12px">ใส่ความหนาก่อน</small>');
  let coef=null;
  if(inSf&&outSf!=null&&inSf>0){coef=outSf/inSf*100;setKv("COEF",f1(coef)+' <small>%</small>',coef>=COEF_TARGET?"pass":coef>=COEF_TARGET-2?"near":"fail")}
  else setKv("COEF","—");
  const tot=num(V.PCS_TOT),ok=num(V.PCS_OK),rep=num(V.REP_PCS)||0;
  let ftt=null;
  if(tot&&tot>0&&ok!=null){ftt=Math.max(0,ok-rep)/tot*100;setKv("FTT",f1(ftt)+' <small>%</small>',ftt>=95?"pass":ftt>=90?"near":"fail")}
  else setKv("FTT","—");
  let gtot=0,good=0;
  GRADE_KEYS.concat(["REJ"]).forEach(k=>{const v=num(V["GR_"+k])||0;gtot+=v;if(["G1","G2","G3"].includes(k))good+=v});
  GRADE_KEYS.concat(["REJ"]).forEach(k=>{
    const v=num(V["GR_"+k])||0,p=gtot>0?v/gtot*100:0;
    const pn=document.getElementById("pct_"+k);if(pn)pn.textContent=gtot>0?f1(p)+"%":"—";
    const bn=document.getElementById("bar_"+k);if(bn)bn.style.width=(gtot>0?Math.max(p,v>0?2:0):0)+"%";
  });
  setKv("GR_TOT",gtot>0?f2(gtot)+' <small>SF</small>':"—");
  setKv("YIELD",gtot>0?f1(good/gtot*100)+' <small>%</small>':"—",gtot>0?(good/gtot>=0.8?"pass":good/gtot>=0.7?"near":"fail"):"");
  if(outSf!=null&&gtot>0){const dif=gtot-outSf;setKv("GR_DIF",(dif>=0?"+":"")+f2(dif)+' <small>SF</small>',Math.abs(dif)<=Math.max(outSf*0.005,1)?"pass":"fail")}
  else setKv("GR_DIF","—");
  V.__TRIM_SF=trimSf;V.__COEF=coef;V.__FTT=ftt;V.__GTOT=gtot;
}

/* ============================ PERSISTENCE ============================ */
async function boot(){
  try{const sv=localStorage.getItem("ett_stage");const f=STAGES.find(s=>s.code===sv);if(f)stage=f}catch(e){}
  loadDraft();
  buildLot();buildTabs();
  if(V.ARTICLE){SOFT=softStd(V.ARTICLE,V.SUBSTANCE,V.CUSTOMER);SPEC=wbStd(V.ARTICLE,V.SUBSTANCE,V.TANNERY||"ETT")}
  ["LOT","ARTICLE","CUSTOMER","QTY_SF","PIECES","INSPECTOR"].forEach(k=>{const n=$("#lot_"+k);if(n&&V[k])n.value=V[k]});
  const tn=$("#lot_TANNERY");if(tn&&V.TANNERY)tn.value=V.TANNERY;
  fillSubstance();fillColours();renderStrip();renderStage();renderRecent([]);
  $("#railDate").textContent=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}).toUpperCase();
  $("#mdSummary").textContent="อาร์ติเคิล "+ARTS.length+" รายการ · มาตรฐานความนุ่ม "+M.ART.length+" แถว · มาตรฐานเวทบลู "+M.WB.length+" แถว · รหัสสี "+Object.values(M.COL).reduce((a,b)=>a+b.length,0)+" รหัส · เหตุผลรีเจค "+M.RJ.length+" รายการ";
  initTopbar();
  await refreshRecent();
  setInterval(refreshRecent,25000);
}
function initTopbar(){
  if(!SESSION)return;
  const who=$("#whoami");
  if(who)who.innerHTML="<b>"+esc(SESSION.fullName||SESSION.username)+"</b><span class=\"role-badge "+SESSION.role+"\">"+SESSION.role+"</span>";
  const adminLnk=$("#lnkAdmin");if(adminLnk)adminLnk.hidden=!hasRole(ROLES.ADMIN);
  const setupLnk=$("#lnkSetup");if(setupLnk)setupLnk.hidden=!hasRole(ROLES.ADMIN);
  const out=$("#btnLogout");
  if(out)out.onclick=async()=>{try{await API.logout()}catch(e){}clearSession();location.href="login.html"};
}
let RECENT_CACHE=[];
async function refreshRecent(){
  const c=$("#conn");
  const r=await API.getRecords({limit:60});
  if(r&&r.ok){
    ONLINE=true;RECENT_CACHE=r.records;
    if(c){c.className="conn live";$("#connTxt").textContent="Online (เชื่อมต่อแล้ว)"}
    renderRecent(RECENT_CACHE);
  }else{
    ONLINE=false;
    if(c){c.className="conn local";$("#connTxt").textContent="Offline (ออฟไลน์ — โหมดสำรอง)"}
    renderRecent(LOCAL.concat(RECENT_CACHE));
  }
}
async function pullLot(lot){
  if(!lot||lot.length<3)return;
  const r=await API.pullLot(lot);
  if(!r||!r.ok||!r.found){$("#lotState").textContent="NEW LOT";return}
  const d=r.lot;
  ["ARTICLE","COLOUR","CUSTOMER","SUBSTANCE","TANNERY","QTY_SF","PIECES"].forEach(k=>{if(d[k])V[k]=d[k]});
  ["ARTICLE","CUSTOMER","QTY_SF","PIECES"].forEach(k=>{const n=$("#lot_"+k);if(n&&V[k])n.value=V[k]});
  const tn=$("#lot_TANNERY");if(tn&&V.TANNERY)tn.value=V.TANNERY;
  $("#lotState").textContent="LOADED FROM LOT MASTER";
  applyArticle(false);
}
async function saveStandard(){
  if(!hasRole(ROLES.ADMIN))return toast("เฉพาะ Admin เท่านั้นที่ตั้งมาตรฐานได้",true);
  if(!V.ARTICLE)return toast("ใส่อาร์ติเคิลก่อน",true);
  const params={};
  (stage.groups||[]).forEach(g=>g.rows.forEach(r=>{if(["meas","num","minonly"].includes(r.t))params[r.k]=stdFor(r)}));
  const r=await API.saveStandard(V.ARTICLE,V.SUBSTANCE||"",stage.code,params);
  if(r&&r.ok)toast("ตั้งมาตรฐานแล้ว: "+V.ARTICLE+" · "+stage.code);
  else toast("บันทึกไม่สำเร็จ: "+((r&&r.error)||"error"),true);
}
async function saveRecord(){
  if(hasRole(ROLES.VIEWER))return toast("บัญชีนี้ดูข้อมูลได้อย่างเดียว",true);
  if(!V.LOT)return toast("ต้องใส่เลขล็อต",true);
  if(!V.INSPECTOR)return toast("ต้องใส่ชื่อผู้ตรวจ",true);
  if(!stage.trial&&!V.DECISION)return toast("ต้องเลือกผลตัดสิน",true);
  const btn=$("#btnSave");if(btn){btn.disabled=true;btn.textContent="SAVING…"}
  const rj=rejects.map(c=>{const r=M.RJ.find(x=>x[0]===c);return r?{no:r[0],code:r[1],name:r[2],nameTh:r[3]||"",group:M.GRP[r[4]]||"",phase:r[5]||""}:{no:c}});
  const md=M.RJ.find(x=>x[0]===mainDef);
  const rec={
    id:stage.code+"_"+slug(V.LOT)+"_"+Date.now(),lotNo:V.LOT,stage:stage.code,
    article:V.ARTICLE||"",substance:V.SUBSTANCE||"",colour:V.COLOUR||"",colourDesc:V.COLOUR_DESC||"",
    customer:V.CUSTOMER||"",tannery:V.TANNERY||"",inspector:V.INSPECTOR||"",
    ts:new Date().toISOString(),localTime:V.DT||"",
    result:V.__RESULT||"",decision:V.DECISION||"",
    rejects:rejects.slice(),rejectDetail:rj,mainDefect:mainDef,mainDefectName:md?md[2]:"",
    values:Object.fromEntries(Object.entries(V).filter(([k])=>!k.startsWith("__"))),
    computed:{trimSf:V.__TRIM_SF??null,coefficient:V.__COEF??null,ftt:V.__FTT??null,gradedTotal:V.__GTOT??null},
    note:V.NOTE||""
  };
  const done=()=>{if(btn){btn.disabled=false;btn.innerHTML='Save record <span class="th">(บันทึก)</span>'}};
  const r=await API.saveRecord(rec);
  if(!r||!r.ok){
    rec.recordedBy=SESSION?SESSION.username:"";
    LOCAL.unshift(rec);renderRecent(LOCAL.concat(RECENT_CACHE));done();
    return toast("ออฟไลน์ — เก็บไว้ในเครื่องนี้ก่อน "+((r&&r.error)?"("+r.error+")":""),true);
  }
  toast("บันทึกแล้ว · "+rec.stage+" · LOT "+rec.lotNo+" · โดย "+r.recordedBy);
  showSavedPopup("บันทึกข้อมูลสำเร็จ · "+rec.stage+" · LOT "+rec.lotNo);
  resetForNewRecord();
  done();
  refreshRecent();
}
/* Full reset of on-screen data after a successful save (per operator request — the previous
   behaviour only cleared the current stage's inspection fields and kept the lot header, which
   is still available via the small manual "Clear" button for the rare case only the stage
   fields need clearing). This clears the lot header inputs too, recomputes the now-empty
   standards strip, and drops the per-stage draft so a page refresh doesn't bring old data back. */
function resetForNewRecord(){
  V={};rejects=[];mainDef="";SOFT=null;SPEC=null;
  try{localStorage.removeItem("ett_draft_"+stage.code)}catch(e){}
  buildLot();
  const ls=$("#lotState");if(ls)ls.textContent="NEW LOT";
  renderStrip();renderStage();
}

/* ============================ RECENT ============================ */
function renderRecent(list){
  const box=$("#recent");box.innerHTML="";
  const today=new Date().toISOString().slice(0,10);
  const todays=list.filter(r=>(r.ts||"").slice(0,10)===today);
  $("#sChecked").textContent=todays.length;
  $("#sFailed").textContent=todays.filter(r=>r.result==="fail"||r.decision==="REJECTED").length;
  const aff=todays.reduce((a,r)=>a+(parseFloat((r.values||{}).SF_AFF)||0),0);
  $("#sAffected").textContent=aff?Math.round(aff):0;
  if(!list.length){
    EXAMPLES.forEach(x=>{
      const d=el("div","rec");
      d.innerHTML='<div class="rec-t"><span class="lot">'+x.lot+'</span><span class="stg">'+x.stg+'</span>'+badge(x.res)+'<span class="tagex">Example (ตัวอย่าง)</span></div>'+
        '<div class="rec-m">'+x.txt+'</div><div class="rec-f">'+x.foot+'</div>';
      box.append(d);
    });
    return;
  }
  list.slice(0,12).forEach(r=>{
    const c=r.computed||{},bits=[];
    if(r.article)bits.push(esc(r.article));
    if(c.coefficient!=null)bits.push("COEF "+f1(c.coefficient)+"%");
    if(c.ftt!=null)bits.push("FTT "+f1(c.ftt)+"%");
    if(r.mainDefectName)bits.push("★ "+esc(r.mainDefectName));
    else if(r.rejectDetail&&r.rejectDetail.length)bits.push(r.rejectDetail.slice(0,2).map(x=>esc(x.name||x.no)).join(" · "));
    if(!bits.length&&r.decision)bits.push(r.decision);
    const d=el("div","rec");
    d.innerHTML='<div class="rec-t"><span class="lot">'+esc(r.lotNo)+'</span><span class="stg">'+esc(r.stage)+'</span>'+badge(r.result)+'</div>'+
      '<div class="rec-m">'+(bits.join(" · ")||"—")+'</div>'+
      '<div class="rec-f">'+new Date(r.ts).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).toUpperCase()+' · '+esc(r.inspector||"—")+(r.decision?" · "+esc(r.decision):"")+'</div>';
    box.append(d);
  });
}

/* ============================ EXPORT ============================ */
async function doExport(){
  let rows=LOCAL;
  const r=await API.getRecords({limit:5000});
  if(r&&r.ok)rows=r.records.concat(LOCAL);
  if(!rows.length)return toast("ยังไม่มีข้อมูล",true);
  const keys=new Set();rows.forEach(r=>Object.keys(r.values||{}).forEach(k=>keys.add(k)));
  const cols=["ts","lotNo","stage","article","substance","colour","colourDesc","customer","tannery","inspector","recordedBy","result","decision",
    "mainDefect","mainDefectName","rejects","note","computed.trimSf","computed.coefficient","computed.ftt","computed.gradedTotal",
    ...[...keys].map(k=>"v."+k)];
  const q=s=>'"'+String(s==null?"":s).replace(/"/g,'""')+'"';
  const body=rows.map(r=>cols.map(c=>{
    if(c.startsWith("v."))return q((r.values||{})[c.slice(2)]);
    if(c.startsWith("computed."))return q((r.computed||{})[c.split(".")[1]]);
    if(c==="rejects")return q((r.rejectDetail||[]).map(x=>(x.code||x.no)+":"+(x.name||"")).join(" | "));
    return q(r[c]);
  }).join(",")).join("\n");
  const csv="﻿"+cols.join(",")+"\n"+body;
  try{
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="ett-inprocess-"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast("ส่งออก "+rows.length+" รายการแล้ว");
  }catch(e){toast("ส่งออกไม่สำเร็จ",true)}
}

/* ============================ TABS ============================ */
function buildTabs(){
  const box=$("#tabs");box.innerHTML="";
  STAGES.forEach(s=>{
    const b=el("button","tab");b.type="button";b.setAttribute("role","tab");
    b.setAttribute("aria-selected",s===stage?"true":"false");
    b.innerHTML='<span class="code">'+s.code+'</span><span class="nm">'+s.nm+' <span style="font-family:var(--thai)">('+s.th+')</span></span>';
    b.onclick=()=>{
      saveDraft();
      const hdr={};["LOT","ARTICLE","COLOUR","COLOUR_DESC","CUSTOMER","SUBSTANCE","TANNERY","QTY_SF","PIECES","INSPECTOR","DT"].forEach(k=>hdr[k]=V[k]);
      stage=s;try{localStorage.setItem("ett_stage",s.code)}catch(e){}
      if(!loadDraft()){V={};rejects=[];mainDef=""}
      Object.keys(hdr).forEach(k=>{if(hdr[k]!=null&&hdr[k]!=="")V[k]=hdr[k]});
      SOFT=softStd(V.ARTICLE||"",V.SUBSTANCE,V.CUSTOMER);SPEC=wbStd(V.ARTICLE||"",V.SUBSTANCE,V.TANNERY||"ETT");
      buildTabs();renderStrip();renderStage();
    };
    box.append(b);
  });
}
$("#btnExport").onclick=doExport;
boot();
