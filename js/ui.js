/* ================= UI ================= */
const ENGINES = ["LNG Otto (dual fuel medium speed)","LNG Otto (dual fuel slow speed)","LNG Diesel (dual fuel slow speed)","LBSI"];
const ZONES = [["EEA","EU/EEA"],["UK","United Kingdom"],["OTHER","Non-EU / non-UK"]];

/* Calculator starts EMPTY (2026-07-15, Aurvin) — no sample rows; Reset also returns to empty. */
const DEFAULT_STATE = {
  year: 2026,
  arSet: "AR5",
  ship: { name:"", imo:"", typeId:"bulk", capacity:45000 },
  distIce: 0, showDates: false, showSplit: false,
  lngEngineDefault: "LNG Otto (dual fuel medium speed)",
  lngEngineDefaultAux: "LNG Otto (dual fuel medium speed)",
  fueleuAlloc: "optimal",
  mdaReports: [],
  windRatio: 0, opsMJ: 0,
  euaPrice: 0, ukaPrice: 0, bioZeroRatedETS: true,
  fueleuBankedIn: 0, fueleuBorrow: false, poolPartnerCB: 0, deficitPeriods: 1,
  sccReqMin: "", sccReqStriving: "",
  breakevenFuelId: "BDSL", breakevenE: "", breakevenWtt: "", breakevenPrice: 0, breakevenEngine: "",
  rows: []
};
let S = loadState();
function loadState(){
  try{
    const s = localStorage.getItem("emcalc_state");
    if(s){ return migrateState(JSON.parse(s)); }
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
/* Saved-state migration: before 2026-07-15 LNG was one fuel with a per-row consumer
   selector (fr.engine). Map old LNG rows to the matching engine-class fuel id. */
function migrateState(s){
  const map = { "LNG Otto (dual fuel medium speed)":"LNG", "LNG Otto (dual fuel slow speed)":"LNGOS",
                "LNG Diesel (dual fuel slow speed)":"LNGDS", "LBSI":"LNGBSI" };
  for(const row of s.rows||[]) for(const fr of row.fuels||[])
    if(fr.fuelId==="LNG" && fr.engine && map[fr.engine]) fr.fuelId = map[fr.engine];
  /* 2026-07-16 additions: AE consumer class, FuelEU allocation method, machinery split */
  if(!s.lngEngineDefaultAux) s.lngEngineDefaultAux = s.lngEngineDefault || "LNG Otto (dual fuel medium speed)";
  if(!s.fueleuAlloc) s.fueleuAlloc = "optimal";
  if(s.showSplit===undefined) s.showSplit = false;
  if(!s.mdaReports) s.mdaReports = [];
  return s;
}
function save(){ try{ localStorage.setItem("emcalc_state", JSON.stringify(S)); }catch(e){} }
function resetScenario(){ if(confirm("Clear all entries and start fresh? (Settings reset too.)")){ S = JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); renderAll(); } }
/* Scenario JSON export/import removed 2026-07-15 (Aurvin) — work auto-saves in localStorage; Reset restores the sample. */

const TAB_IDS = ["work","calcs","vessel","constants","help"];   // suite build appends "rules","ask"
function showTab(t){
  for(const x of TAB_IDS){
    document.getElementById("tab-"+x).style.display = x===t?"":"none";
    document.getElementById("tb-"+x).classList.toggle("on", x===t);
  }
  if(t==="work") renderWorkspace();
  if(t==="calcs") renderCalcs();
  if(t==="vessel") renderVessel();
  if(t==="constants") renderConstants();
  if(t==="help") renderHelp();
  if(window.SUITE_ONSHOW) window.SUITE_ONSHOW(t);
}
/* info-icon popover: click ⓘ to open, click anywhere else to close */
function toggleInfo(btn){
  const p = btn.nextElementSibling;
  document.querySelectorAll(".ibpop.open").forEach(x=>{ if(x!==p) x.classList.remove("open"); });
  p.classList.toggle("open");
}
document.addEventListener("click", e=>{ if(!e.target.closest(".ibwrap")) document.querySelectorAll(".ibpop.open").forEach(x=>x.classList.remove("open")); });
const info = (html)=>`<span class="ibwrap"><button class="ib" type="button" onclick="event.stopPropagation();toggleInfo(this)" title="More information">i</button><span class="ibpop">${html}</span></span>`;
function renderAll(){ renderWorkspace(); renderVessel(); }
const esc = s => String(s??"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function upd(path, val){
  const parts = path.split("."); let o = S;
  for(let i=0;i<parts.length-1;i++){ o = o[isNaN(parts[i])?parts[i]:Number(parts[i])]; }
  const last = parts[parts.length-1];
  o[isNaN(last)?last:Number(last)] = val;
  save(); renderLive();
}
function num(v){ return v===""?"":Number(v); }
function updTime(ri, key, val){
  S.rows[ri][key] = val;
  const r = S.rows[ri];
  if(r.tStart && r.tEnd){
    const h = (new Date(r.tEnd) - new Date(r.tStart))/3.6e6;
    if(h>0) r.hours = Math.round(h*10)/10;
  }
  save(); renderWorkspace();
}
function fmtTs(ts){ if(!ts) return ""; const d=new Date(ts); if(isNaN(d)) return ts;
  return d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function fmtRange(a,b){ if(!a&&!b) return ""; return (a?fmtTs(a):"…")+" – "+(b?fmtTs(b):"…"); }

/* ---------- port picker widgets ---------- */
function zoneName(z){ return z==="EEA"?"EU/EEA":z==="UK"?"UK":"Non-EU/UK"; }
function portDisp(p){ return !p ? "" : (p.n && p.n!==p.c ? p.n+" ("+p.c+")" : p.c); }
function composeLabel(row){
  if(row.kind==="voyage"){
    if(row.fromPort||row.toPort){
      const a=row.fromPort? portDisp(row.fromPort) : zoneName(row.from);
      const b=row.toPort? portDisp(row.toPort) : zoneName(row.to);
      return a+" → "+b;
    }
    return row.label || (zoneName(row.from)+" → "+zoneName(row.to));
  }
  if(row.port) return "At berth "+portDisp(row.port);
  return row.label || ("At berth — "+zoneName(row.zone));
}
function rowOMR(row){
  return [row.fromPort,row.toPort,row.port].filter(Boolean)
    .map(p=>({p, omr:portOMR(p.c)})).filter(x=>x.omr);
}
function portCountryName(code){
  const ci = countryInfo((code||"").slice(0,2).toUpperCase());
  return ci? ci[0] : "";
}
function portInputHtml(ri, field, portObj, ph){
  const val = portDisp(portObj);
  const cn = portObj && portObj.c ? portCountryName(portObj.c) : "";
  return `<div class="pwrap" style="flex:1.6"><label>${ph} — name or LOCODE (optional)</label>
    <input value="${esc(val)}" placeholder="e.g. Rotterdam or NLRTM" autocomplete="off"${cn?` title="${esc(cn)}"`:""}
      oninput="portType(this,${ri},'${field}')" onblur="portBlur(this,${ri},'${field}')">
    <div class="plist" style="display:none"></div></div>`;
}
function portType(inp, ri, field){
  const box=inp.nextElementSibling;
  const res=portSearch(inp.value);
  if(!res.length){ box.style.display="none"; box.innerHTML=""; return; }
  box.innerHTML=res.map(p=>{
    const cc=p[0].slice(0,2), ci=countryInfo(cc), cn=ci?ci[0]:cc;
    const omr=portOMR(p[0]), z=zoneOfLocode(p[0]);
    return `<div onmousedown="portPick(${ri},'${field}','${p[0]}')">${esc(p[1])} — <b>${p[0]}</b> <span class="cc">(${esc(cn)})</span><span class="zbadge ${omr?'zb-OMR':'zb-'+z}">${omr||z}</span></div>`;
  }).join("");
  box.style.display="";
}
function portPick(ri, field, code){
  const row=S.rows[ri]; if(!row) return;
  row[field]={ c:code, n:portName(code)||code };
  const z=zoneOfLocode(code);
  if(row.kind==="voyage"){ if(field==="fromPort") row.from=z; else if(field==="toPort") row.to=z; }
  else row.zone=z;
  row.label=composeLabel(row);
  save(); renderWorkspace();
}
function portBlur(inp, ri, field){
  setTimeout(()=>{
    const box=inp.nextElementSibling; if(box){ box.style.display="none"; }
    const row=S.rows[ri]; if(!row) return;
    if(inp.value.trim()==="" && row[field]){ delete row[field]; row.label=composeLabel(row); save(); renderWorkspace(); }
  },200);
}
function setZone(ri, key, val){
  const row=S.rows[ri]; row[key]=val;
  row.label=composeLabel(row);
  save(); renderWorkspace();
}

/* ============ OVD LOG ABSTRACT IMPORT ============
   Built against DNV OVD Log Abstract CSV (samples: DNV_OVD-Log-Abstract-Sample.csv, OVD LA.csv;
   field semantics per OVD how-to guide chunks ovd-* in the KB).
   - one row per report (Departure / Noon / Arrival / ...)
   - consumption columns <Consumer>_Consumption_<FUEL> in metric tonnes since previous report
   - Voyage_From / Voyage_To are UN/LOCODEs -> zone from the 2-letter country prefix
   - Distance in nm since previous report; Cargo_Mt cargo on board
   - Shore_Side_Electricity_Reception in kWh -> FuelEU OPS energy (x3.6 MJ)
   Sea/port attribution: a report's consumption covers the period SINCE the previous report.
   Departure-report consumption -> at berth (pre-departure); reports after a Departure -> sea leg;
   reports after an Arrival -> at berth at the arrival port. */
const EEA_CC = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","NO","IS"]);
/* Country info from the embedded 'PORT LOCODE DNV.xlsx' table: [name, class(EU|UK|EU OMR|UK OMR|""), EEA flag] */
function countryInfo(cc){ return (typeof COUNTRY!=="undefined" && COUNTRY[cc]) || null; }
function zoneOfLocode(code){
  const cc=(code||"").trim().slice(0,2).toUpperCase();
  const ci=countryInfo(cc);
  if(ci){ if(ci[2]==="EEA") return "EEA"; if(ci[1]==="UK") return "UK"; return "OTHER"; }  // EU OMR / UK OMR / others → OTHER zone by default, with a verify warning shown
  if(cc==="GB") return "UK"; return EEA_CC.has(cc)?"EEA":"OTHER";
}
function portOMR(code){
  const ci=countryInfo((code||"").slice(0,2).toUpperCase());
  return ci && ci[1] && ci[1].indexOf("OMR")>=0 ? ci[1] : null;   // "EU OMR" | "UK OMR" | null
}
/* ---- port name search over the embedded UN/LOCODE list ---- */
let _PORTS=null, _PORT_BY_CODE=null;
function portIndex(){
  if(_PORTS) return _PORTS;
  _PORTS=[]; _PORT_BY_CODE={};
  if(typeof PORT_DB!=="undefined"){
    for(const line of PORT_DB.split("\n")){
      const i=line.indexOf("|"); if(i<0) continue;
      const c=line.slice(0,i), n=line.slice(i+1);
      const e=[c,n,n.toLowerCase(),c.toLowerCase()];
      _PORTS.push(e); _PORT_BY_CODE[c]=n;
    }
  }
  return _PORTS;
}
function portName(code){ portIndex(); return _PORT_BY_CODE[(code||"").toUpperCase()] || null; }
function portSearch(q, limit){
  q=(q||"").trim().toLowerCase(); if(q.length<2) return [];
  limit=limit||15;
  const starts=[], contains=[];
  for(const p of portIndex()){
    if(p[2].startsWith(q)||p[3].startsWith(q)) { starts.push(p); if(starts.length>=limit) break; }
    else if(contains.length<limit && (p[2].includes(q)||p[3].includes(q))) contains.push(p);
  }
  return starts.concat(contains).slice(0,limit);
}
const OVD_FUEL_MAP = { HFO:"HFO", LFO:"LFO", MGO:"MDO", MDO:"MDO", LPGP:"LPGP", LPGB:"LPGB", LNG:"LNG", M:"METH", E:"ETOH" };

function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  text = text.replace(/^﻿/,"");
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=ch; }
    else if(ch==='"') q=true;
    else if(ch===','){ row.push(cell); cell=""; }
    else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&text[i+1]==='\n') i++; row.push(cell); cell=""; if(row.length>1||row[0]!=="") rows.push(row); row=[]; }
    else cell+=ch;
  }
  if(cell!==""||row.length){ row.push(cell); if(row.length>1||row[0]!=="") rows.push(row); }
  return rows;
}

function parseOVD(text){
  const rows = parseCSV(text);
  if(rows.length<2) throw new Error("No data rows found");
  const H = rows[0].map(h=>h.trim());
  const idx = n => H.indexOf(n);
  const consCols = [];   // {col, fuelId, raw}
  const skippedFuels = new Set();
  H.forEach((h,i)=>{
    const m = h.match(/^([A-Za-z_]+)_Consumption_([A-Z]+)(?:_[Tt]ype)?$/);
    if(m && !/_type$/i.test(h) && !/_BDN_?$/i.test(h)){
      const f = OVD_FUEL_MAP[m[2]];
      /* consumer prefix → machinery group (2026-07-16): ME / AE(+DG) / Boiler / Other */
      const pfx = m[1].toUpperCase();
      const mach = pfx==="ME"? "ME" : (pfx==="AE"||/^DG/.test(pfx)? "AE" : (/^BOILER/.test(pfx)? "BLR" : "OTH"));
      if(f) consCols.push({col:i, fuelId:f, mach});
      else if(m[2]!=="BDN") skippedFuels.add(m[2]);
    }
  });
  if(!consCols.length) throw new Error("No *_Consumption_* columns found — is this an OVD Log Abstract CSV?");
  /* track a per-fuel machinery split only when the file distinguishes ≥2 consumer groups */
  const trackSplit = new Set(consCols.map(c=>c.mach)).size > 1;
  const iFrom=idx("Voyage_From"), iTo=idx("Voyage_To"), iEvent=idx("Event"), iDist=idx("Distance"), iCargo=idx("Cargo_Mt"), iOPS=idx("Shore_Side_Electricity_Reception"), iDate=idx("Date_UTC"), iTime=idx("Time_UTC"), iPOC=idx("POC");
  /* optional derived-metadata columns written by the MDA importer (arrival/departure derivation) */
  const iArrG=idx("Arr_GMT"), iDepG=idx("Dep_GMT"), iRuleG=idx("Derive_Rule"), iFlagG=idx("POC_Flag");
  if(iFrom<0||iTo<0||iEvent<0) throw new Error("Missing Voyage_From / Voyage_To / Event columns");
  const N = v => { const x=parseFloat(String(v).replace(",",".")); return isNaN(x)?0:x; };

  const out=[]; let mode="port"; let seaLeg=null; let portRow=null; let opsKWh=0; let curPort=null; let prevTs=null;
  const legByPair={}; let pendingDist=0;   // distance reported before any leg exists (e.g. file starts mid-voyage)
  const tsOf = (row)=>{
    if(iDate<0) return null;
    const d=(row[iDate]||"").trim(); if(!d) return null;
    let t=(iTime>=0?(row[iTime]||"").trim():"")||"00:00";
    if(t.length===4&&t.indexOf(":")===1) t="0"+t;
    return d+"T"+t.slice(0,5);
  };
  const stamp = (target, ts)=>{
    if(!target||!ts) return;
    if(!target.tStart) target.tStart = prevTs || ts;
    target.tEnd = ts;
  };
  const getPortRow = (locode)=>{
    const zone = zoneOfLocode(locode);
    if(portRow && portRow._locode===locode) return portRow;
    portRow = { kind:"port", zone, fuels:[], _locode:locode };
    if(locode) portRow.port = { c:locode, n:portName(locode)||locode };
    portRow.label = "At berth "+(locode? portDisp(portRow.port) : zoneName(zone));
    out.push(portRow); return portRow;
  };
  /* year-boundary machinery (2026-07-16): every addition is bucketed by calendar year so
     multi-year rows can be split report-exactly; a report period that itself straddles
     midnight 31 Dec is pro-rated by time. */
  const yearFracs = (a,b)=>{
    if(!a && !b) return null;
    if(!a || !b || a.slice(0,4)===b.slice(0,4)) return { [(b||a).slice(0,4)]: 1 };
    const A=Date.parse(a+":00Z"), B=Date.parse(b+":00Z");
    if(!(B>A)) return { [b.slice(0,4)]: 1 };
    const out={}; let t0=A;
    for(let yy=Number(a.slice(0,4)); yy<Number(b.slice(0,4)); yy++){
      const bd=Date.parse((yy+1)+"-01-01T00:00:00Z");
      out[yy]=(Math.min(bd,B)-t0)/(B-A); t0=bd;
    }
    out[b.slice(0,4)]=(B-t0)/(B-A);
    return out;
  };
  const bucketOf = (row, yy, a, b)=>{
    row._byYear = row._byYear || {};
    const bk = row._byYear[yy] || (row._byYear[yy]={fuels:{},dist:0,cargo:0,tStart:null,tEnd:null});
    const segA = (a && a.slice(0,4)===String(yy)) ? a : yy+"-01-01T00:00";
    const segB = (b && b.slice(0,4)===String(yy)) ? b : (Number(yy)+1)+"-01-01T00:00";
    if(!bk.tStart || segA<bk.tStart) bk.tStart=segA;
    if(!bk.tEnd || segB>bk.tEnd) bk.tEnd=segB;
    return bk;
  };
  const addFuel = (row, fuelId, t, mach, yfr, a, b)=>{
    if(t<=0) return;
    let fr = row.fuels.find(x=>x.fuelId===fuelId);
    if(!fr){ fr={fuelId, tonnes:0, price:0}; row.fuels.push(fr); }
    fr.tonnes = Math.round((fr.tonnes+t)*1000)/1000;
    if(trackSplit && mach){ fr.split=fr.split||{}; fr.split[mach]=Math.round(((fr.split[mach]||0)+t)*1000)/1000; }
    if(yfr) for(const yy in yfr){
      const e0 = bucketOf(row, yy, a, b).fuels;
      const e = e0[fuelId] || (e0[fuelId]={t:0});
      e.t += t*yfr[yy];
      if(trackSplit && mach) e[mach]=(e[mach]||0)+t*yfr[yy];
    }
  };
  const makeLeg = (from,to)=>{
    const leg = { kind:"voyage", from:zoneOfLocode(from), to:zoneOfLocode(to), dist:0, cargo:0, fuels:[], _from:from, _to:to,
                  fromPort:{ c:from, n:portName(from)||from }, toPort:{ c:to, n:portName(to)||to } };
    leg.label = portDisp(leg.fromPort)+" → "+portDisp(leg.toPort);
    out.push(leg); legByPair[from+"|"+to]=leg;
    if(pendingDist>0){ leg.dist=Math.round(pendingDist*10)/10; pendingDist=0; }
    return leg;
  };
  for(let r=1;r<rows.length;r++){
    const row = rows[r]; if(row.length<3) continue;
    const from=(row[iFrom]||"").trim(), to=(row[iTo]||"").trim(), ev=(row[iEvent]||"").trim().toLowerCase();
    const pair = (from&&to&&from!==to)? from+"|"+to : null;
    const dist = iDist>=0? N(row[iDist]) : 0;
    const cargo = iCargo>=0? N(row[iCargo]) : 0;
    if(iOPS>=0) opsKWh += N(row[iOPS]);
    const ts = tsOf(row);                          // this row covers the period [prevTs, ts]
    const yfr = yearFracs(prevTs, ts);             // calendar-year fractions of that period
    /* ---- consumption target (the row covers the period SINCE the previous report) ---- */
    let target;
    const isDep = ev.includes("departure"), isBosp = ev.includes("bosp")||ev.includes("begin of sea");
    if(isDep || (isBosp && mode!=="sea")){
      target = getPortRow(from||curPort||to);        // pre-departure / pre-BOSP period was at berth or anchorage
    } else if(ev.includes("arrival")){
      target = seaLeg || getPortRow(to);             // sailing period ends at arrival
    } else {
      target = (mode==="sea" && seaLeg) ? seaLeg : getPortRow(curPort||to);
    }
    /* ---- leg lifecycle: DEPARTURE or BOSP starts/continues a sea leg (some reports have BOSP but no DEPARTURE) ---- */
    if(isDep || isBosp){
      if(pair && (!seaLeg || seaLeg._from!==from || seaLeg._to!==to)) seaLeg = makeLeg(from,to); // always a fresh leg — same route may be sailed again later in the year
      mode="sea"; curPort=null;
    }
    /* ---- distance & cargo always follow the Voyage_From→Voyage_To pair, so nothing is lost
            when a leg has no DEPARTURE report or when shifting distance is logged in port ---- */
    if(pair){
      let leg = (seaLeg && seaLeg._from===from && seaLeg._to===to) ? seaLeg : legByPair[pair];
      if(!leg && dist>0){ leg = makeLeg(from,to); seaLeg = leg; mode="sea"; curPort=null; }
      if(leg){
        leg.dist = Math.round((leg.dist+dist)*10)/10;
        if(cargo>leg.cargo) leg.cargo=cargo;
        if(yfr && dist>0) for(const yy in yfr){ const bk=bucketOf(leg,yy,prevTs,ts); bk.dist+=dist*yfr[yy]; if(cargo>bk.cargo) bk.cargo=cargo; }
      }
    } else if(dist>0){
      if(seaLeg){
        seaLeg.dist = Math.round((seaLeg.dist+dist)*10)/10;
        if(yfr) for(const yy in yfr){ bucketOf(seaLeg,yy,prevTs,ts).dist += dist*yfr[yy]; }
      }
      else pendingDist += dist;                       // hold until the first leg appears
    }
    if(ev.includes("arrival")){ mode="port"; curPort=to; portRow=null; }
    for(const c of consCols) addFuel(target, c.fuelId, N(row[c.col]), c.mach, yfr, prevTs, ts);
    /* optional POC column (MDA passthrough): a stay is a port of call if ANY of its reports
       says YES (anchorage NO + berth YES = one call); all-NO = transit, out of ETS/FuelEU scope */
    if(iPOC>=0 && target && target.kind==="port"){
      const v=String(row[iPOC]||"").trim().toUpperCase();
      if(v==="YES") target.poc=true; else if(v==="NO" && target.poc!==true) target.poc=false;
    }
    /* derived arrival/departure metadata (MDA imports): attach to the port stay row */
    if(target && target.kind==="port"){
      if(iArrG>=0 && String(row[iArrG]||"").trim() && !target.arrGmt) target.arrGmt=String(row[iArrG]).trim();
      if(iDepG>=0 && String(row[iDepG]||"").trim() && !target.depGmt) target.depGmt=String(row[iDepG]).trim();
      if(iRuleG>=0 && String(row[iRuleG]||"").trim() && !target.deriveRule) target.deriveRule=String(row[iRuleG]).trim();
      if(iFlagG>=0 && String(row[iFlagG]||"").trim()){
        const F=String(row[iFlagG]);
        if(F.indexOf("QTY")>=0) target.pocQty=true;
        if(F.indexOf("MISMATCH")>=0) target.pocMismatch=true;
        if(F.indexOf("INCOMPLETE")>=0) target.incomplete=true;
      }
    }
    stamp(target, ts); if(ts) prevTs = ts;
    if(seaLeg && mode==="sea" && ts){ stamp(seaLeg, ts); }  // keep leg timeframe current even when consumption went to berth
  }
  /* ---- year-boundary split (2026-07-16, Aurvin): rows spanning 31 Dec / 1 Jan are split
     into per-year parts, report-exactly, so each calendar year carries only the
     consumption that occurred in it. The reporting-year selector decides which parts
     count; the derived POC / arrival / departure metadata is copied to both parts. ---- */
  let nSplitYear=0;
  const rowsFinal=[];
  for(const r of out){
    const by=r._byYear; delete r._byYear;
    const ys = by? Object.keys(by).filter(yy=>{
      const bk=by[yy];
      return Object.keys(bk.fuels).some(k=>bk.fuels[k].t>5e-4) || bk.dist>0.05;
    }).sort() : [];
    if(ys.length<2){ rowsFinal.push(r); continue; }
    nSplitYear++;
    for(const yy of ys){
      const bk=by[yy];
      const c=Object.assign({}, r);
      c.fuels = Object.entries(bk.fuels).filter(([,e])=>e.t>5e-4).map(([fuelId,e])=>{
        const fr={fuelId, tonnes:Math.round(e.t*1000)/1000, price:0};
        const sp={}; let any=false;
        for(const g of ["ME","AE","BLR","OTH"]) if((e[g]||0)>1e-9){ sp[g]=Math.round(e[g]*1000)/1000; any=true; }
        if(any) fr.split=sp;
        return fr;
      });
      if(c.kind==="voyage"){ c.dist=Math.round(bk.dist*10)/10; c.cargo=bk.cargo||r.cargo; }
      c.tStart=bk.tStart||r.tStart; c.tEnd=bk.tEnd||r.tEnd;
      delete c.hours;
      c.splitYear=true; c.yearPart=Number(yy);
      rowsFinal.push(c);
    }
  }
  rowsFinal.forEach(r=>{
    delete r._locode; delete r._from; delete r._to;
    if(r.kind==="port" && r.poc===undefined) r.poc=true;   // no POC info => a stay IS a call
    r.fuels.sort((a,b)=>a.fuelId<b.fuelId?-1:1);
    if(!r.fuels.length) r.fuels.push({fuelId:"MDO",tonnes:0,price:0});
    if(r.tStart && r.tEnd){ const h=(new Date(r.tEnd)-new Date(r.tStart))/3.6e6; if(h>0) r.hours=Math.round(h*10)/10; }
  });
  if(!rowsFinal.length) throw new Error("The file has valid OVD headers but no data rows — it looks like an empty template. Export a Log Abstract with report rows and try again.");
  const keptRows = rowsFinal.filter(r=>r.kind==="voyage" || r.fuels.some(f=>f.tonnes>0));
  const nNonPoc = keptRows.filter(r=>r.kind==="port" && r.poc===false).length;
  return { rows: keptRows, opsMJ: Math.round(opsKWh*3.6), skippedFuels:[...skippedFuels],
           notes:[ nSplitYear? nSplitYear+" row(s) spanned the calendar-year boundary and were split into per-year parts (each year carries exactly the consumption that occurred in it — straddling report periods pro-rated by time). The reporting year in Settings decides which parts are counted; the others show greyed out.":null,
                   opsKWh>0? "Shore-side electricity "+opsKWh.toLocaleString()+" kWh imported as FuelEU OPS energy ("+Math.round(opsKWh*3.6).toLocaleString()+" MJ).":null,
                   nNonPoc? nNonPoc+" port stay(s) marked NOT a port of call (transit / anchorage-only / cargo ops outside port limits) — excluded from EU ETS / UK ETS / FuelEU scope. Toggle POC on the row to change.":null,
                   skippedFuels.size? "Columns for fuel code(s) "+[...skippedFuels].join(", ")+" ('Other' fuels) were SKIPPED — add them manually as Custom fuel with factors from the BDN.":null ].filter(Boolean) };
}

/* ============ MDA EVENT-LOG IMPORT (.xlsx or .csv) ============
   MDA export: one row per report period; fuel consumption as JSON dicts ({"MGO": 0.65});
   ORIGIN/CURRENT/DESTINATION UN/LOCODEs; REPORT_TYPE drives the event mapping.
   Strategy: translate MDA rows into OVD Log Abstract rows in memory, then feed the SAME
   parseOVD pipeline used for DNV files — one tested code path for both formats.
   Columns are looked up BY NAME, so files with extra/future fields import unchanged as
   long as the core columns below are present; unknown columns are simply ignored.
   Fuel-grade mapping (agreed 2026-07-15): every fuel-oil grade EXCEPT ULSFO → HFO;
   ULSFO → LFO; MGO/HSMGO/LSMGO/ULSMGO/HSD/gasoil → MGO; MDO/DO/diesel → MDO.
   Unknown fuel names keep their own column and are flagged as skipped at import.

   ---- ARRIVAL / DEPARTURE / PORT-OF-CALL DERIVATION (agreed with Aurvin 2026-07-16) ----
   ARRIVAL-EOSP = End of Sea Passage and DEPARTURE-SOSP = Start of Sea Passage — NOT the
   regulatory arrival/departure. The true ARRIVAL and DEPARTURE (GMT) are derived from the
   report chain of each port stay (all reports between an EOSP and the next SOSP):
   - Case A (cargo operations recorded — ASSOCIATED_ACTIVITY in CARGO_LOADING/_STS,
     CARGO_DISCHARGING/_STS): unbroken OPERATING_CONDITION chain backwards from the first
     cargo-op report → ARRIVAL = chain-start REPORT_START_GMT; forwards from the last
     cargo-op report → DEPARTURE = chain-end REPORT_END_GMT. Chains are clamped at the
     EOSP end / SOSP start. Multiple cargo clusters in one stay = one operation.
   - Case B (no cargo ops), fallback ladder: first/last AT_BERTH → condition chain around
     BUNKERING → first/last AT_ANCHOR → first/last DRIFTING.
   - Ladder exhausted: PURE TRANSIT — no port-stay row; the whole EOSP→SOSP window merges
     into the adjacent voyage (e.g. canal transits with only MANOEUVRING reports).
   POC test: cargo ops occurred (incl. quantity fallback: |CARGO_QTY at SOSP − at EOSP|
   > 5% of DWT, or any 0↔loaded transition, with no recorded cargo activity → orange ❗)
   AND no report inside the derived window has OUTSIDE_PORT_LIMIT TRUE (an STS outside
   port limits = transit). FUEL_STOCK / FUEL_OIL_BUNKER / blank-condition rows are
   transparent to all chain and POC logic. The file's own POC column is IGNORED for
   calculations — it is only compared against the derived result (mismatch → yellow ⚠).
   Consumption before the derived ARRIVAL / after the derived DEPARTURE is attributed to
   the sea leg, not the berth (this changes EU ETS 50%-leg vs 100%-berth attribution).
   Files without an OPERATING_CONDITION column import with the legacy EOSP=Arrival /
   SOSP=Departure mapping and POC passthrough, with a note. */
const MDA_REQUIRED = ["REPORT_TYPE","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE"];
const MDA_CARGO_ACT = {CARGO_DISCHARGING:1,CARGO_DISCHARGING_STS:1,CARGO_LOADING:1,CARGO_LOADING_STS:1};
const MDA_DEFAULT_DWT = 20000;   // 5%-of-DWT fallback when vessel capacity is unset or in GT
function mdaFuel(name){
  const u=String(name).toUpperCase().replace(/[^A-Z]/g,"");
  if(u==="ULSFO") return "LFO";
  if(/FO$/.test(u)||/^IFO/.test(u)||/^RM/.test(u)) return "HFO";
  if(/MGO$/.test(u)||["MGO","GO","HSD","GASOIL","DMA","DMX","DMZ"].indexOf(u)>=0) return "MGO";
  if(/MDO$/.test(u)||["MDO","DO","DMB","DIESEL"].indexOf(u)>=0) return "MDO";
  if(u==="LNG") return "LNG";
  if(u==="LPG"||u==="LPGP") return "LPGP";
  if(u==="LPGB") return "LPGB";
  if(["METHANOL","MEOH","M"].indexOf(u)>=0) return "M";
  if(["ETHANOL","ETOH","E"].indexOf(u)>=0) return "E";
  return null;
}
function mdaDate(v){ /* Excel serial number (days since 1899-12-30, xlsx) or date string (csv) -> ["YYYY-MM-DD","HH:MM"] */
  let d;
  if(typeof v==="number" || /^\d+(\.\d+)?$/.test(String(v).trim())){
    d=new Date(Date.UTC(1899,11,30) + Math.round(parseFloat(v)*86400000));
  } else {
    const s=String(v).trim().replace(" ","T");
    d=new Date(/Z$|[+-]\d\d:?\d\d$/.test(s)? s : s+"Z");
  }
  if(isNaN(d)) return null;
  const p=x=>String(x).padStart(2,"0");
  return [d.getUTCFullYear()+"-"+p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate()), p(d.getUTCHours())+":"+p(d.getUTCMinutes())];
}
function mdaToOVD(rows, dwtOpt){ /* rows: array of arrays (from parseCSV or xlsxToRows); returns {csv, notes} */
  let hi=-1, dtName=null;
  for(let i=0;i<rows.length && i<25;i++){
    const h=(rows[i]||[]).map(c=>String(c==null?"":c).trim());
    const dn = h.indexOf("DATE_TIME_GMT")>=0? "DATE_TIME_GMT" : (h.indexOf("DATETIME_GMT")>=0? "DATETIME_GMT" : null);
    if(dn && h.indexOf("REPORT_TYPE")>=0){ hi=i; dtName=dn; break; }
  }
  if(hi<0) throw new Error("Not an MDA export — no header row with DATE_TIME_GMT / REPORT_TYPE found");
  const H=rows[hi].map(c=>String(c==null?"":c).trim());
  const col={}; H.forEach((h,i)=>{ if(h && !(h in col)) col[h]=i; });
  const missing=MDA_REQUIRED.filter(c=>!(c in col));
  if(missing.length) throw new Error("MDA file is missing required column(s): "+missing.join(", "));
  const G=(r,f)=>{ const v=(f in col)? r[col[f]] : null; return v==null?"":v; };
  const EV={"DEPARTURE-SOSP":"Departure","ARRIVAL-EOSP":"Arrival","AT_SEA":"Noon","IN_PORT":"Port"};
  const iso = dt => dt? dt[0]+"T"+dt[1] : null;
  const truthy = v => { const s=String(v).trim().toUpperCase(); return s==="TRUE"||s==="1"||s==="YES"; };
  const hasOC = "OPERATING_CONDITION" in col;
  /* per-machine consumption columns (2026-07-16): JSON dicts like FUEL_CONSUMPTION */
  const MACH_COLS = { ME:"MAIN_ENGINE_CONSUMPTION", AE:"AUXILIARY_ENGINE_CONSUMPTION", BLR:"BOILER_CONSUMPTION" };
  const hasMachines = Object.values(MACH_COLS).some(c=>c in col);
  /* parse a JSON fuel dict with the standard grade mapping; register=false keeps codes
     (e.g. ROB) out of the consumption column set */
  const parseFuels=(raw,rowNo,register)=>{
    const out={}; const s=String(raw==null?"":raw).trim(); if(!s) return out;
    let o; try{ o=JSON.parse(s); }catch(e){ throw new Error("MDA row "+rowNo+": fuel dict is not valid JSON: "+s.slice(0,40)); }
    for(const k in o){
      const t=parseFloat(o[k])||0; if(t<=0) continue;
      const code=mdaFuel(k) || (String(k).toUpperCase().replace(/[^A-Z]/g,"")||"UNKNOWN"); // unmapped keep their own code -> flagged as skipped downstream
      out[code]=(out[code]||0)+t; if(register) used[code]=1;
    }
    return out;
  };

  /* ---- pass 1: parse every report row ---- */
  const recs=[], used={}; let lastPort="", nBunker=0, nInferred=0, nNegRemainder=0;
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i]; if(!r) continue;
    const dtRaw=G(r,dtName); if(String(dtRaw).trim()==="") continue;
    const rt=String(G(r,"REPORT_TYPE")).trim();
    const dt=mdaDate(dtRaw);
    if(!dt) throw new Error("MDA row "+(i+1)+": unreadable "+dtName+" value '"+dtRaw+"'");
    const lat=parseFloat(G(r,"LATITUDE")), lon=parseFloat(G(r,"LONGITUDE"));
    const rob=parseFuels(G(r,"FUEL_ROB"), i+1, false);         // retained for the future OVD download; not used in calculations
    if(rt==="FUEL_OIL_BUNKER"){                                 // stock movement, not consumption; transparent to all derivation logic
      nBunker++;
      recs.push({ skip:true, rt, dt, tEnd:iso(dt), fuels:{}, rob,
                  bunker:String(G(r,"BUNKER_AMOUNT")).trim(), lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon });
      continue;
    }
    const org=String(G(r,"ORIGIN_PORT_UNLO_CODE")).trim(), cur=String(G(r,"CURRENT_PORT_UNLO_CODE")).trim(), dst=String(G(r,"DESTINATION_PORT_UNLO_CODE")).trim();
    let vFrom, vTo;
    if(rt==="IN_PORT"){ const p=cur||lastPort||dst; if(!cur) nInferred++; vFrom=vTo=p; if(p) lastPort=p; }
    else { vFrom=org||lastPort; vTo=dst||cur; if(!org) nInferred++; if(rt==="ARRIVAL-EOSP"&&(cur||dst)) lastPort=cur||dst; }
    const fuels=parseFuels(G(r,"FUEL_CONSUMPTION"), i+1, true);
    /* machinery split (2026-07-16): same fuel-grade mapping per machine; per fuel type,
       Other = total − (ME+AE+Boiler), clamped at 0 (negatives counted and flagged) */
    let mach=null;
    if(hasMachines){
      mach={ ME:parseFuels(G(r,MACH_COLS.ME), i+1, true), AE:parseFuels(G(r,MACH_COLS.AE), i+1, true), BLR:parseFuels(G(r,MACH_COLS.BLR), i+1, true), OTH:{} };
      for(const c2 in fuels){
        const sMach = (mach.ME[c2]||0)+(mach.AE[c2]||0)+(mach.BLR[c2]||0);
        const rem = fuels[c2] - sMach;
        if(rem < -1e-6){                                   // machines exceed the fuel-type total:
          nNegRemainder++;                                 // clamp Other to 0 and scale machines down
          const k = sMach>0? fuels[c2]/sMach : 0;          // pro-rata so totals are conserved
          for(const g of ["ME","AE","BLR"]) if(mach[g][c2]) mach[g][c2]*=k;
        } else if(rem > 1e-9) mach.OTH[c2]=rem;
      }
    }
    const startRaw=String(G(r,"REPORT_START_GMT")).trim(), endRaw=String(G(r,"REPORT_END_GMT")).trim();
    const oc=String(G(r,"OPERATING_CONDITION")).trim().toUpperCase();
    recs.push({ rt, dt, vFrom, vTo, ev:EV[rt]||"Noon",
                dist:parseFloat(G(r,"DISTANCE"))||0, qty:parseFloat(G(r,"CARGO_QTY"))||0, fuels, mach, rob,
                lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon, org, cur, dst,
                portN:String(G(r,"CURRENT_PORT")).trim(), ctry:String(G(r,"CURRENT_COUNTRY")).trim(), regn:String(G(r,"CURRENT_REGION")).trim(),
                oc, aa:String(G(r,"ASSOCIATED_ACTIVITY")).trim().toUpperCase(),
                opl:truthy(G(r,"OUTSIDE_PORT_LIMIT")),
                pocFile:String(G(r,"POC")).trim().toUpperCase(),
                tEnd: endRaw!==""? (iso(mdaDate(endRaw))||iso(dt)) : iso(dt),
                tStartOwn: startRaw!==""? iso(mdaDate(startRaw)) : null,
                transparent: rt==="FUEL_STOCK" || !oc,      // transparent rows never make or break a condition chain
                poc:"", meta:null, before:[] });
  }
  if(!recs.some(c=>!c.skip)) throw new Error("No MDA report rows found below the header");
  /* period start: explicit REPORT_START_GMT, else the previous report's end */
  let prevEnd=null;
  for(const c of recs){ if(c.skip){ c.tStart=c.tEnd; continue; } c.tStart = c.tStartOwn || prevEnd || c.tEnd; if(c.rt!=="FUEL_STOCK") prevEnd=c.tEnd; }

  /* ---- pass 2: port stays → derive ARRIVAL / DEPARTURE / POC ---- */
  const notes=[];
  let nDerived=0,nTransit=0,nQty=0,nMismatch=0,nIncomplete=0,nOPL=0,usedDefaultDwt=false;
  if(hasOC){
    let dwt=Number(dwtOpt)||0;
    if(!(dwt>0)){
      if(typeof S!=="undefined" && S.ship && (TYPE_BY_ID[S.ship.typeId]||{}).capUnit==="DWT" && Number(S.ship.capacity)>0) dwt=Number(S.ship.capacity);
      else { dwt=MDA_DEFAULT_DWT; usedDefaultDwt=true; }
    }
    /* segment: a stay = everything between an ARRIVAL-EOSP and the next DEPARTURE-SOSP;
       a leading in-port block with no EOSP / a trailing one with no SOSP = incomplete stay */
    const stays=[]; let cur=null;
    for(const c of recs){
      if(c.skip) continue;                                  // bunker events: transparent to segmentation too
      if(c.rt==="ARRIVAL-EOSP"){ if(cur && cur.members.length) stays.push(cur); cur={eosp:c, members:[], sosp:null}; }
      else if(c.rt==="DEPARTURE-SOSP"){ if(cur){ cur.sosp=c; if(cur.members.length||cur.eosp) stays.push(cur); cur=null; } }
      else if(c.rt==="AT_SEA"){ if(cur && !cur.eosp){ if(cur.members.length) stays.push(cur); cur=null; } }
      else if(cur){ cur.members.push(c); }
      else if(c.rt==="IN_PORT" || c.rt==="FUEL_STOCK"){ cur={eosp:null, members:[c], sosp:null}; }
    }
    if(cur && (cur.members.length||cur.eosp)) stays.push(cur);

    for(const st of stays){
      const M=st.members;
      /* chain helpers — transparent rows are skipped, never break a chain */
      const effCond=(m)=>{                       // blank-condition cargo op: inherit when both neighbours agree
        if(m.oc) return m.oc;
        const k=M.indexOf(m); let p=null,n=null;
        for(let j=k-1;j>=0;j--) if(M[j].oc){ p=M[j].oc; break; }
        for(let j=k+1;j<M.length;j++) if(M[j].oc){ n=M[j].oc; break; }
        return (p&&n&&p===n)? p : null;
      };
      const chainStart=(idx,cond)=>{ let s=idx;
        for(let j=idx-1;j>=0;j--){ if(M[j].transparent) continue; if(M[j].oc===cond) s=j; else break; }
        return s; };
      const chainEnd=(idx,cond)=>{ let e=idx;
        for(let j=idx+1;j<M.length;j++){ if(M[j].transparent) continue; if(M[j].oc===cond) e=j; else break; }
        return e; };
      const ops=M.filter(m=>MDA_CARGO_ACT[m.aa]);
      let arr=null, dep=null, rule=null;
      if(ops.length){                                       /* Case A — cargo operations recorded */
        const f=ops[0], l=ops[ops.length-1], cf=effCond(f), cl=effCond(l);
        arr = M[ cf!=null? chainStart(M.indexOf(f),cf) : M.indexOf(f) ].tStart;
        dep = M[ cl!=null? chainEnd(M.indexOf(l),cl)   : M.indexOf(l) ].tEnd;
        rule="CASE_A";
      } else {                                              /* Case B — fallback ladder */
        const firstLast=(cond,name)=>{ const xs=M.filter(m=>!m.transparent && m.oc===cond); if(!xs.length) return false;
          arr=xs[0].tStart; dep=xs[xs.length-1].tEnd; rule=name; return true; };
        firstLast("AT_BERTH","AT_BERTH")
        || (()=>{ const bs=M.filter(m=>m.aa==="BUNKERING"); if(!bs.length) return false;
             const f=bs[0], l=bs[bs.length-1], cf=effCond(f), cl=effCond(l);
             arr = M[ cf!=null? chainStart(M.indexOf(f),cf) : M.indexOf(f) ].tStart;
             dep = M[ cl!=null? chainEnd(M.indexOf(l),cl)   : M.indexOf(l) ].tEnd;
             rule="BUNKERING"; return true; })()
        || firstLast("AT_ANCHOR","AT_ANCHOR")
        || firstLast("DRIFTING","DRIFTING");
      }
      /* cargo-quantity fallback: EOSP vs SOSP CARGO_QTY — 0↔loaded or >5% of DWT */
      const qtyE = st.eosp? st.eosp.qty : (M.length? M[0].qty : 0);
      const qtyS = st.sosp? st.sosp.qty : (M.length? M[M.length-1].qty : 0);
      const qtyTrig = !ops.length && ( ((qtyE===0)!==(qtyS===0)) || Math.abs(qtyE-qtyS)>0.05*dwt );
      const cargoTest = ops.length>0 || qtyTrig;
      const incomplete = !st.eosp || !st.sosp;
      const flags=[];
      let poc=false;
      if(arr && dep){
        nDerived++;
        const oplHit = M.some(m=> m.rt!=="FUEL_STOCK" && m.opl && m.tStart>=arr && m.tEnd<=dep);
        poc = cargoTest && !oplHit;
        if(poc && qtyTrig){ flags.push("QTY"); nQty++; }
        if(oplHit && cargoTest) nOPL++;
        if("POC" in col){
          const filePoc = M.some(m=>m.pocFile==="YES");
          if(filePoc!==poc){ flags.push("MISMATCH"); nMismatch++; }
        }
      }
      if(incomplete){ flags.push("INCOMPLETE"); nIncomplete++; }

      if(arr && dep){
        /* the port stay = derived ARRIVAL → DEPARTURE only; everything outside goes to the voyage */
        const inbound  = st.eosp? [st.eosp.vFrom, st.eosp.vTo] : null;
        const outbound = st.sosp? [st.sosp.vFrom, st.sosp.vTo] : null;
        if(st.eosp) st.eosp.ev="Noon";                     // EOSP is a sea-passage marker, not the arrival
        let firstPort=null, firstPost=null, lastPortRec=null;
        for(const m of M){
          if(m.tEnd<=arr){ m.ev="Noon"; if(inbound){ m.vFrom=inbound[0]; m.vTo=inbound[1]; } }
          else if(m.tStart>=dep){ m.ev="Noon"; if(outbound){ m.vFrom=outbound[0]; m.vTo=outbound[1]; } if(!firstPost) firstPost=m; }
          else { m.ev="Port"; m.poc = poc? "YES":"NO"; if(!firstPort) firstPort=m; lastPortRec=m; }
        }
        if(firstPort) firstPort.meta={arr,dep,rule,flags:flags.join("+")};
        /* report-level labels (2026-07-16): the derived window boundaries replace IN_PORT
           in the Calculations report table */
        if(firstPort) firstPort.role = firstPort===lastPortRec? "ARRIVAL · DEPARTURE" : "ARRIVAL";
        if(lastPortRec && lastPortRec!==firstPort) lastPortRec.role = "DEPARTURE";
        if(st.eosp && firstPort)
          firstPort.before.push({ev:"Arrival", dtIso:arr, vFrom:inbound[0], vTo:inbound[1]});      // zero-consumption boundary marker
        if(st.sosp){
          (firstPost||st.sosp).before.push({ev:"Departure", dtIso:dep, vFrom:outbound[0], vTo:outbound[1]});
          st.sosp.ev="Noon";                               // pre-SOSP period is already at sea (post-departure)
        }
      } else if(st.eosp && st.sosp){
        /* ladder exhausted → PURE TRANSIT: no port stay; the whole window stays on the voyage */
        nTransit++;
        st.eosp.ev="Noon";
        for(const m of M){ m.ev="Noon"; m.vFrom=st.eosp.vFrom; m.vTo=st.eosp.vTo; }
        st.sosp.ev="BOSP";                                 // starts the next leg; its consumption stays on the inbound leg
      } else {
        /* truncated by the file boundary AND underivable — keep the legacy port stay, flagged */
        let fp=null;
        for(const m of M){ if(m.ev==="Port"){ m.poc = cargoTest? "YES":"NO"; if(!fp) fp=m; } }
        if(fp) fp.meta={arr:null,dep:null,rule:null,flags:flags.join("+")};
      }
    }
  } else {
    /* legacy import — POC passthrough from the file's own column */
    for(const c of recs){ if(c.rt==="IN_PORT" && (c.pocFile==="YES"||c.pocFile==="NO")) c.poc=c.pocFile; }
  }

  /* ---- pass 3: emit the intermediate OVD CSV ---- */
  const ORDER=["HFO","LFO","MGO","MDO","LNG","LPGP","LPGB","M","E"];
  const codes=Object.keys(used).sort((a,b)=>{ const x=ORDER.indexOf(a), y=ORDER.indexOf(b); return ((x<0?99:x)-(y<0?99:y)) || (a<b?-1:1); });
  /* with machine columns the consumption travels per consumer (OVD-style prefixes) so
     parseOVD can rebuild the ME/AE/Boiler/Other split; without, one ME_ column as before */
  const GROUPS = hasMachines? [["ME","ME_Consumption_"],["AE","AE_Consumption_"],["BLR","Boiler_Consumption_"],["OTH","Other_Consumption_"]] : [[null,"ME_Consumption_"]];
  const fuelHdr = GROUPS.map(g=>codes.map(c=>","+g[1]+c).join("")).join("");
  const lines=["Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Distance,Cargo_Mt,POC,Arr_GMT,Dep_GMT,Derive_Rule,POC_Flag"+fuelHdr];
  const blank=GROUPS.map(()=>codes.map(()=> "")).flat();
  const rnd = v => v? Math.round(v*1000)/1000 : "";
  const fuelCells = c => GROUPS.map(([g])=>codes.map(k=> rnd(g? ((c.mach||{})[g]||{})[k] : c.fuels[k]))).flat();
  for(const c of recs){
    if(c.skip) continue;
    for(const b of c.before)
      lines.push([b.dtIso.slice(0,10),b.dtIso.slice(11,16),b.vFrom||"",b.vTo||"",b.ev,"","","","","","",""].concat(blank).join(","));
    const meta=c.meta||{};
    lines.push([c.dt[0],c.dt[1],c.vFrom||"",c.vTo||"",c.ev,c.dist||"",c.qty||"",c.poc||"",meta.arr||"",meta.dep||"",meta.rule||"",meta.flags||""]
      .concat(fuelCells(c)).join(","));
  }
  /* raw per-report retention (2026-07-16): foundation for the future OVD-format download.
     Not used by any calculation; saved with the workspace state at import. */
  const reports = recs.map(c=>({ rt:c.rt, role:c.role||"", t:c.dt? iso(c.dt):c.tEnd, ts:c.tStart||null, te:c.tEnd||null,
    oc:c.oc||"", aa:c.aa||"", opl:!!c.opl, poc:c.pocFile||"", qty:c.qty||0, dist:c.dist||0,
    lat:c.lat??null, lon:c.lon??null, org:c.org||"", cur:c.cur||"", dst:c.dst||"",
    portN:c.portN||"", ctry:c.ctry||"", regn:c.regn||"",
    fuels:c.fuels||{}, mach:c.mach||null, rob:c.rob||{}, bunker:c.bunker||undefined }));
  if(nBunker) notes.push(nBunker+" FUEL_OIL_BUNKER event(s) skipped — bunkering is a stock movement, not consumption.");
  if(nInferred) notes.push(nInferred+" row(s) had a missing UN/LOCODE — the last known port was carried forward.");
  if(hasMachines) notes.push("Per-machine consumption (ME / AE / Boiler) imported; per fuel type the unassigned remainder went to 'Other'"+(nNegRemainder? " — "+nNegRemainder+" report(s) had ME+AE+Boiler exceeding the fuel-type total (Other clamped to 0 — verify the source data)":"")+". Toggle 'Machinery split' in the workspace to view or edit it.");
  if(hasOC){
    if(nDerived) notes.push(nDerived+" port stay(s): regulatory ARRIVAL/DEPARTURE derived from the report chain (EOSP/SOSP are sea-passage markers, not the arrival/departure) — consumption before arrival / after departure is attributed to the voyage. The file's POC column was ignored; Port of Call was derived from cargo operations and port limits.");
    if(nTransit) notes.push(nTransit+" stay(s) had no berth / anchorage / drifting / bunkering period — pure transit, merged into the adjacent voyage (no port-stay row).");
    if(nOPL) notes.push(nOPL+" stay(s) with cargo operations OUTSIDE port limits (e.g. STS) — classified as transit, not a port of call.");
    if(nQty) notes.push(nQty+" stay(s) classified as Port of Call by the cargo-quantity fallback (CARGO_QTY changed by >5% of DWT or 0↔loaded with no recorded cargo operation"+(usedDefaultDwt?"; DWT unknown — default "+MDA_DEFAULT_DWT.toLocaleString()+" t used":"")+") — marked ❗ on the row.");
    if(nMismatch) notes.push(nMismatch+" stay(s) where the file's POC column disagrees with the derived classification — the derived result is used; marked ⚠ on the row.");
    if(nIncomplete) notes.push(nIncomplete+" stay(s) truncated by the file boundary — derived from the available side only and flagged incomplete. Upload ±1 month around year ends where possible.");
  } else {
    notes.push("OPERATING_CONDITION column not found — arrival/departure/POC derivation skipped; EOSP/SOSP used as arrival/departure and the file's POC column (if present) applied (legacy import).");
  }
  return { csv: lines.join("\n"), notes, reports };
}

/* ---- minimal .xlsx reader (ZIP + worksheet XML), no external libraries ----
   Uses the browser's built-in DecompressionStream("deflate-raw"); values are returned
   raw (shared strings resolved, numbers as strings) — mdaToOVD handles Excel serial dates. */
async function xlsxToRows(buf){
  if(typeof DecompressionStream==="undefined")
    throw new Error("This browser cannot read .xlsx directly — open the file in Excel, save as CSV, and import that instead.");
  const u8=new Uint8Array(buf), dv=new DataView(buf);
  let e=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-65558);i--){ if(dv.getUint32(i,true)===0x06054b50){ e=i; break; } }
  if(e<0) throw new Error("Not a valid .xlsx file (ZIP end record not found)");
  const count=dv.getUint16(e+10,true); let off=dv.getUint32(e+16,true);
  const entries={};
  for(let k=0;k<count;k++){
    if(dv.getUint32(off,true)!==0x02014b50) break;
    const method=dv.getUint16(off+10,true), csize=dv.getUint32(off+20,true),
          nlen=dv.getUint16(off+28,true), xlen=dv.getUint16(off+30,true), clen=dv.getUint16(off+32,true),
          lho=dv.getUint32(off+42,true),
          name=new TextDecoder().decode(u8.subarray(off+46,off+46+nlen));
    entries[name]={method,csize,lho};
    off+=46+nlen+xlen+clen;
  }
  async function file(name){
    const en=entries[name]; if(!en) return null;
    const lnlen=dv.getUint16(en.lho+26,true), lxlen=dv.getUint16(en.lho+28,true);
    const start=en.lho+30+lnlen+lxlen, comp=u8.slice(start,start+en.csize);
    if(en.method===0) return new TextDecoder("utf-8").decode(comp);
    if(en.method!==8) throw new Error("Unsupported ZIP compression method in xlsx ("+en.method+")");
    const ds=new DecompressionStream("deflate-raw");
    const wr=ds.writable.getWriter(); wr.write(comp); wr.close();
    const rd=ds.readable.getReader(); const chunks=[]; let total=0;
    for(;;){ const {done,value}=await rd.read(); if(done) break; chunks.push(value); total+=value.length; }
    const all=new Uint8Array(total); let p=0;
    for(const c of chunks){ all.set(c,p); p+=c.length; }
    return new TextDecoder("utf-8").decode(all);
  }
  const px=t=>new DOMParser().parseFromString(t,"application/xml");
  const shared=[]; const sst=await file("xl/sharedStrings.xml");
  if(sst){ const els=px(sst).getElementsByTagName("si");
    for(let i=0;i<els.length;i++){ const ts=els[i].getElementsByTagName("t"); let s=""; for(let j=0;j<ts.length;j++) s+=ts[j].textContent; shared.push(s); } }
  let sheetPath="xl/worksheets/sheet1.xml";
  try{
    const wbx=px(await file("xl/workbook.xml")), relx=px(await file("xl/_rels/workbook.xml.rels"));
    const sh=wbx.getElementsByTagName("sheet")[0];
    const rid=sh&&(sh.getAttribute("r:id")||sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"));
    const rels=relx.getElementsByTagName("Relationship");
    for(let i=0;i<rels.length;i++) if(rels[i].getAttribute("Id")===rid){
      let t=rels[i].getAttribute("Target");
      if(t.indexOf("/")===0) t=t.slice(1); else if(t.indexOf("xl/")!==0) t="xl/"+t;
      sheetPath=t; break;
    }
  }catch(err){}
  const sx=await file(sheetPath);
  if(!sx) throw new Error("Worksheet not found inside the xlsx");
  const rowEls=px(sx).getElementsByTagName("row"), rows=[];
  const colOf=ref=>{ let c=0; for(let i=0;i<ref.length;i++){ const ch=ref.charCodeAt(i); if(ch>=65&&ch<=90) c=c*26+ch-64; else break; } return c-1; };
  for(let i=0;i<rowEls.length;i++){
    const cells=rowEls[i].getElementsByTagName("c"), r=[];
    for(let j=0;j<cells.length;j++){
      const c=cells[j], t=c.getAttribute("t")||"", ref=c.getAttribute("r")||"", ci=ref?colOf(ref):j;
      let v="";
      if(t==="inlineStr"){ const is=c.getElementsByTagName("t"); for(let k=0;k<is.length;k++) v+=is[k].textContent; }
      else { const ve=c.getElementsByTagName("v")[0]; v=ve?ve.textContent:""; if(t==="s") v=shared[parseInt(v,10)]!==undefined?shared[parseInt(v,10)]:""; }
      r[ci]=v;
    }
    rows.push(r);
  }
  return rows;
}

/* ============ THETIS-MRV "GHG Emissions" XML IMPORT ============
   Built against the EMSA THETIS-MRV bulk-upload XML (Documentation XML MRV v11.3, EMSA;
   sample: ANNA-META-THETIS_EU_Emissions_9514406_2026.xml). Imports ACTIVITY DATA ONLY:
   voyages (ports, distance, sea time, fuel tonnes, mass cargo), port calls (fuel, hours)
   and OPS energy. The file's embedded LCV / ttwEf / wttEf values are deliberately NOT
   used — the calculator applies its own KB-grounded factors (working agreement).
   The annualEmission block is never imported; its CO2 totals are reported as a cross-check.
   Dates are "DD-MM-YYYY HH:MM:SS" GMT per the EMSA spec. amount is tonnes (M_TONNES) or
   m3 (converted via the mandatory density attribute). reportTypeConsumption=false entries
   carry CO2 only (no fuel) and are skipped with a note.
   NOTE: the full fuelTypeCode picklist lives in EMSA's separate "Bulk data picklists"
   document (not on hand) — the map below covers the sample codes + MRV fuel families;
   anything unrecognised is reported at import, never guessed. */
const THETIS_FUEL_MAP = { HFO:"HFO", LFO:"LFO", MDO:"MDO", MGO:"MDO", LNG:"LNG",
  LPG:"LPGP", LPG_PROPANE:"LPGP", LPG_BUTANE:"LPGB", PROPANE:"LPGP", BUTANE:"LPGB",
  METHANOL:"METH", ETHANOL:"ETOH" };
function thetisDate(s){ /* "DD-MM-YYYY HH:MM:SS" (GMT) -> "YYYY-MM-DDTHH:MM" */
  const m=(s||"").trim().match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/);
  return m ? m[3]+"-"+m[2]+"-"+m[1]+"T"+(m[4]||"00")+":"+(m[5]||"00") : null;
}
function parseTHETIS(text){
  const doc = new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length) throw new Error("The XML could not be parsed — is the file intact?");
  const ships = [...doc.getElementsByTagName("shipEmissions")];
  if(!ships.length) throw new Error("No <shipEmissions> element found — is this a THETIS-MRV GHG Emissions XML?");
  const ship = ships[0];
  const kid  = (el,tag)=>{ for(const c of el.children) if(c.tagName===tag) return c; return null; };
  const kids = (el,tag)=>[...el.children].filter(c=>c.tagName===tag);
  const tx   = (el,tag)=>{ const c=kid(el,tag); return c? c.textContent.trim() : ""; };
  const num  = (el,tag)=>{ const v=parseFloat(tx(el,tag).replace(",",".")); return isNaN(v)?0:v; };
  const skippedFuels=new Set(), cargoSkipped=new Set(); let co2Only=0, noDensity=0;
  const fuelsFrom = (container)=>{
    const fuels=[];
    for(const em of kids(container,"emissions")){
      if(tx(em,"reportTypeConsumption").toLowerCase()==="false"){ co2Only++; continue; }
      const code=(tx(em,"fuelTypeCode")||"").toUpperCase().replace(/[^A-Z_]/g,"");
      const fid=THETIS_FUEL_MAP[code];
      if(!fid){ skippedFuels.add(code||"(blank)"); continue; }
      let amt=num(em,"amount");
      const unit=(tx(em,"measuringUnitCode")||"M_TONNES").toUpperCase();
      if(unit!=="M_TONNES"){                       // m3 etc. — density (t/m3) is mandatory per the EMSA spec
        const den=num(em,"density");
        if(den>0) amt=amt*den; else { noDensity++; continue; }
      }
      if(amt<=0) continue;
      let fr=fuels.find(x=>x.fuelId===fid);
      if(!fr){ fr={fuelId:fid,tonnes:0,price:0}; fuels.push(fr); }
      fr.tonnes=Math.round((fr.tonnes+amt)*1000)/1000;
    }
    fuels.sort((a,b)=>a.fuelId<b.fuelId?-1:1);
    return fuels;
  };
  const out=[];
  for(const v of kids(ship,"voyageEmission")){
    const from=tx(v,"departurePortCode"), to=tx(v,"arrivalPortCode");
    const row={ kind:"voyage", from:zoneOfLocode(from||tx(v,"departureCountryCode")+"___"),
                to:zoneOfLocode(to||tx(v,"arrivalCountryCode")+"___"),
                dist:Math.round(num(v,"distanceTravelNavigation")*10)/10, cargo:0, fuels:fuelsFrom(v),
                fromPort:{c:from, n:tx(v,"departurePortName")||portName(from)||from},
                toPort:{c:to, n:tx(v,"arrivalPortName")||portName(to)||to} };
    row.label=portDisp(row.fromPort)+" → "+portDisp(row.toPort);
    row.tStart=thetisDate(tx(v,"atd")); row.tEnd=thetisDate(tx(v,"ata"));
    const hrs=num(v,"timeAtSeaNavigation")+num(v,"timeAtSeaAnchorage");
    if(hrs>0) row.hours=Math.round(hrs*10)/10;
    for(const cw of kids(v,"voyageCargoAndTransportWork")){
      const cf=tx(cw,"cargoFieldCode");
      if(/CARGO_MASS/.test(cf)) row.cargo=num(cw,"cargoValue");   // mass basis (tonnes) only
      else if(cf) cargoSkipped.add(cf);
    }
    if(!row.fuels.length) row.fuels.push({fuelId:"MDO",tonnes:0,price:0});
    out.push(row);
  }
  for(const p of kids(ship,"portEmission")){
    const code=tx(p,"portCode");
    const zone=zoneOfLocode(code||tx(p,"countryCode")+"___");
    const row={ kind:"port", zone, fuels:fuelsFrom(p) };
    if(code) row.port={c:code, n:tx(p,"portName")||portName(code)||code};
    row.label="At berth "+(row.port? portDisp(row.port) : (tx(p,"portName")||zoneName(zone)));
    row.tStart=thetisDate(tx(p,"ata")); row.tEnd=thetisDate(tx(p,"atd"));   // port stay runs arrival -> departure
    const hq=num(p,"timeAtQuayside")+num(p,"timeAtBerthAtAnchorage");
    if(hq>0) row.hours=Math.round(hq*10)/10;
    else if(row.tStart&&row.tEnd){ const h=(new Date(row.tEnd)-new Date(row.tStart))/3.6e6; if(h>0) row.hours=Math.round(h*10)/10; }
    if(!row.fuels.length) row.fuels.push({fuelId:"MDO",tonnes:0,price:0});
    out.push(row);
  }
  if(out.length && out.every(r=>r.tStart)) out.sort((a,b)=> a.tStart<b.tStart?-1:1);
  /* OPS from Substitute Sources of Energy (amount in MWh per the EMSA spec) */
  let opsMJ=0;
  for(const s of ship.getElementsByTagName("sses")) if(tx(s,"sseType").toUpperCase()==="OPS") opsMJ+=num(s,"amount")*3600;
  /* annualEmission -> cross-check totals only (never imported) */
  const ann=kid(ship,"annualEmission"); let annual=null, year=null;
  if(ann){
    year=parseInt(tx(ann,"reportingPeriod"))||null;
    let mrvCO2=0, etsCO2=0;
    for(const el of ann.children){
      const n=el.tagName;
      if(!/^mrvEmissions|^etsEmissions/.test(n)) continue;    // etsCcs*/etsCcu* (captured CO2) excluded
      if(/AtBerth$/.test(n)) continue;   // *WithinEeaPortAtBerth is a SUBSET of *WithinEeaPort (EMSA doc v11.3) — summing both double-counts
      let co2=0;
      for(const e of el.getElementsByTagName("entry")){
        const k=kid(e,"key"), val=kid(e,"value");
        if(k && k.textContent.trim()==="CO2") co2+=parseFloat(val?val.textContent:"")||0;
      }
      if(n.slice(0,3)==="mrv") mrvCO2+=co2; else etsCO2+=co2;
    }
    annual={year, mrvCO2:Math.round(mrvCO2*100)/100, etsCO2:Math.round(etsCO2*100)/100};
  }
  const imo=ship.getAttribute("shipImoNumber")||"?";
  const notes=[ "THETIS-MRV XML for ship IMO "+imo+(year? " · reporting period "+year:"")+". Activity data imported; the calculator applies its own KB-grounded factors (the file's LCV/EF values are not used).",
    ships.length>1? (ships.length-1)+" further ship(s) in the file were SKIPPED — the calculator models one vessel at a time.":null,
    opsMJ>0? "OPS shore power "+Math.round(opsMJ).toLocaleString("en-GB")+" MJ imported as FuelEU OPS energy.":null,
    co2Only? co2Only+" entr"+(co2Only>1?"ies":"y")+" reported as CO₂-only (reportTypeConsumption=false) SKIPPED — the calculator needs fuel quantities; add those fuels manually.":null,
    noDensity? noDensity+" non-tonnes fuel entr"+(noDensity>1?"ies":"y")+" without a density SKIPPED — cannot convert to tonnes.":null,
    skippedFuels.size? "Unrecognised fuel code(s) "+[...skippedFuels].join(", ")+" SKIPPED — add manually as Custom fuel with certified values (EMSA picklist codes beyond the mapped set).":null,
    cargoSkipped.size? "Transport-work basis "+[...cargoSkipped].join(", ")+" is not mass-based — cargo not imported for those voyages; enter cargo tonnes manually for CII/SCC.":null
  ].filter(Boolean);
  return { rows: out.filter(r=>r.kind==="voyage"||r.fuels.some(f=>f.tonnes>0)),
           opsMJ:Math.round(opsMJ), skippedFuels:[...skippedFuels], notes, annual, imo, year };
}

function importOVDFile(ev){
  const f=ev.target.files[0]; if(!f) return;
  ev.target.value="";
  const fail=e=>alert("Import failed: "+e.message);
  if(/\.xlsx$/i.test(f.name)){                            // MDA event-log workbook
    const fr=new FileReader();
    fr.onload=()=>{ xlsxToRows(fr.result)
      .then(rows=>{ const m=mdaToOVD(rows); applyImport(parseOVD(m.csv), "MDA xlsx", m.notes, m.reports); })
      .catch(fail); };
    fr.readAsArrayBuffer(f);
    return;
  }
  const r=new FileReader();
  r.onload=()=>{
    try{
      const txt=String(r.result).replace(/^﻿/,"");
      if(/^\s*(<\?xml|<emissions[\s>])/i.test(txt)){ applyImport(parseTHETIS(txt), "THETIS XML"); return; }
      if(/DATE_?TIME_GMT/.test(txt.slice(0,5000))){       // MDA saved as CSV (DATE_TIME_GMT or DATETIME_GMT header)
        const m=mdaToOVD(parseCSV(txt));
        applyImport(parseOVD(m.csv), "MDA CSV", m.notes, m.reports); return;
      }
      applyImport(parseOVD(txt), "OVD");
    }catch(e){ fail(e); }
  };
  r.readAsText(f);
}
function applyImport(res, label, extraNotes, reports){
      if(!res.rows.length) throw new Error("No voyages/port stays could be built from the file");
      const replace = confirm("Imported "+res.rows.length+" activity rows from "+label+".\n\nOK = REPLACE current activity  ·  Cancel = APPEND to current activity");
      const notes=(extraNotes||[]).concat(res.notes||[]);
      if(replace){
        S.rows = res.rows; S.opsMJ = res.opsMJ;
        S.mdaReports = reports || [];                     // raw per-report retention for the future OVD download
        if(res.year && res.year!==S.year){ S.year=res.year; notes.push("Calculator year set to "+res.year+" (the file's reporting period)."); }
      } else {
        S.rows = S.rows.concat(res.rows); S.opsMJ = (Number(S.opsMJ)||0) + res.opsMJ;
        if(reports && reports.length) S.mdaReports = (S.mdaReports||[]).concat(reports);
        if(res.year && res.year!==S.year) notes.push("File reporting period "+res.year+" differs from calculator year "+S.year+" — targets/phase-in follow the calculator year.");
      }
      /* multi-year awareness (2026-07-16): the displayed year stays user-driven */
      const yearsIn = [...new Set(res.rows.map(r=>String(r.tStart||r.tEnd||"").slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort();
      if(yearsIn.length>1) notes.push("The file spans reporting years "+yearsIn.join(" and ")+". The reporting year selected in Settings ("+S.year+") decides which rows are calculated — rows of the other year(s) stay in the list, greyed out, and are included the moment you switch the year.");
      save(); renderAll(); showTab("work");
      if(res.annual){
        try{
          const R2=computeAll(S);
          notes.push("Cross-check — the file's own annualEmission block reports MRV CO₂ "+fmt(res.annual.mrvCO2)+" t"+(res.annual.etsCO2?" and ETS CO₂ "+fmt(res.annual.etsCO2)+" t":"")+"; the calculator computes total CO₂ "+fmt(R2.summary.co2Total)+" t from the imported activity using KB default factors. Small differences are expected where the file used its own factors. The file's totals are shown for comparison only, never imported.");
        }catch(e){}
      }
      if(notes.length) alert("Import notes:\n\n- "+notes.join("\n- "));
}

/* ---------- shared input widgets ---------- */
function fuelOptions(sel){ return FUELS.map(f=>`<option value="${f.id}" ${f.id===sel?"selected":""}>${esc(f.name)}</option>`).join(""); }
function engineOptions(sel){ return ENGINES.map(e=>`<option ${e===sel?"selected":""}>${e}</option>`).join(""); }
function zoneOptions(sel){ return ZONES.map(z=>`<option value="${z[0]}" ${z[0]===sel?"selected":""}>${z[1]}</option>`).join(""); }

/* ---- machinery split editing (2026-07-16, Aurvin) ----
   Split fields drive the total; editing the total sends the delta to Other.
   If the new total is below ME+AE+Boiler, those scale down pro-rata and Other = 0. */
function updSplit(ri, fi, g, v){
  const fr=S.rows[ri].fuels[fi];
  fr.split = fr.split||{};
  fr.split[g] = Math.max(0, Number(v)||0);
  fr.tonnes = Math.round(["ME","AE","BLR","OTH"].reduce((s,k)=>s+(Number(fr.split[k])||0),0)*1000)/1000;
  const tot=document.getElementById("tons_"+ri+"_"+fi); if(tot) tot.value=fr.tonnes;
  save(); renderLive();
}
function updTonnes(ri, fi, v){
  const fr=S.rows[ri].fuels[fi];
  const t=Math.max(0, Number(v)||0);
  if(fr.split){
    const fixed=(Number(fr.split.ME)||0)+(Number(fr.split.AE)||0)+(Number(fr.split.BLR)||0);
    if(t>=fixed){ fr.split.OTH=Math.round((t-fixed)*1000)/1000; }
    else { const k=fixed>0? t/fixed:0; for(const g of ["ME","AE","BLR"]) if(fr.split[g]) fr.split[g]=Math.round(Number(fr.split[g])*k*1000)/1000; fr.split.OTH=0; }
    for(const g of ["ME","AE","BLR","OTH"]){ const el=document.getElementById("sp_"+g+"_"+ri+"_"+fi); if(el) el.value=fr.split[g]??""; }
  }
  fr.tonnes=t; save(); renderLive();
}

function fuelLineHtml(ri, fi, fr){
  const f = FUEL_BY_ID[fr.fuelId]||{};
  const needE = f.bio, needW = f.rfnbo||f.custom, needEng = f.slip && !f.engineClass, isCustom = f.custom;
  let extra = "";
  if(needEng) extra += `<div><label>Fuel consumer (slip)</label><select onchange="upd('rows.${ri}.fuels.${fi}.engine',this.value)">${engineOptions(fr.engine||S.lngEngineDefault)}</select></div>`;
  if(needE) extra += `<div><label>E value gCO₂eq/MJ ${f.eNote?'<span class="flag" title="'+esc(f.eNote)+'">check</span>':""}</label><input type="number" step="any" value="${fr.E??f.eDefault??""}" placeholder="${f.eDefault??"certified E"}" oninput="upd('rows.${ri}.fuels.${fi}.E',num(this.value))"></div>`;
  if(needW) extra += `<div><label>WtT gCO₂eq/MJ (cert)</label><input type="number" step="any" value="${fr.wtt??""}" placeholder="certificate" oninput="upd('rows.${ri}.fuels.${fi}.wtt',num(this.value))"></div>`;
  if(isCustom) extra += `<div><label>LCV MJ/g</label><input type="number" step="any" value="${fr.lcv??""}" oninput="upd('rows.${ri}.fuels.${fi}.lcv',num(this.value))"></div>
    <div><label>Cf CO₂ g/g</label><input type="number" step="any" value="${fr.cf??""}" oninput="upd('rows.${ri}.fuels.${fi}.cf',num(this.value))"></div>
    <div><label>Cf CH₄ g/g</label><input type="number" step="any" value="${fr.ch4??""}" oninput="upd('rows.${ri}.fuels.${fi}.ch4',num(this.value))"></div>
    <div><label>Cf N₂O g/g</label><input type="number" step="any" value="${fr.n2o??""}" oninput="upd('rows.${ri}.fuels.${fi}.n2o',num(this.value))"></div>`;
  const sp = fr.split||{};
  const spCell = (g,lbl)=>`<div><label>${lbl} t</label><input type="number" step="any" min="0" id="sp_${g}_${ri}_${fi}" value="${sp[g]??""}" placeholder="0" oninput="updSplit(${ri},${fi},'${g}',this.value)"></div>`;
  const spRow = S.showSplit? `<div class="fuelline" style="background:#f6f9fa;border-radius:6px">
    <div style="align-self:end;max-width:96px;padding-bottom:8px"><span class="note" style="cursor:help" title="Machinery split — ME and AE take their LNG slip class from the two consumer-class dropdowns in Settings; Boiler and Other are slip-free. Editing a machine updates the line total; editing the total sends the difference to Other.">⚙ split</span></div>
    ${spCell("ME","Main engine")}${spCell("AE","Aux engine")}${spCell("BLR","Boiler")}${spCell("OTH","Other")}
  </div>` : "";
  /* fuel entries stack as a table grid (2026-07-16) — one shared header, no per-line labels */
  return `<div class="fuelline">
    <div><select onchange="upd('rows.${ri}.fuels.${fi}.fuelId',this.value);renderWorkspace()">${fuelOptions(fr.fuelId)}</select></div>
    <div><input type="number" step="any" min="0" id="tons_${ri}_${fi}" value="${fr.tonnes??""}" oninput="updTonnes(${ri},${fi},this.value)"></div>
    <div class="opt"><input type="number" step="any" min="0" value="${fr.price||""}" placeholder="optional" oninput="upd('rows.${ri}.fuels.${fi}.price',num(this.value))"></div>
    <div class="opt"><input type="number" step="any" value="${fr.ciiCf??""}" placeholder="optional" oninput="upd('rows.${ri}.fuels.${fi}.ciiCf',num(this.value))"></div>
    <div><button class="del" title="Remove fuel" onclick="S.rows[${ri}].fuels.splice(${fi},1);save();renderWorkspace()">✕</button></div>
  </div>${spRow}${extra?`<div class="fuelline">${extra}<div></div></div>`:""}`;
}
function fuelHeaderHtml(){
  return `<div class="fuelline fuelhdr">
    <div>Fuel</div><div>Tonnes</div><div class="opt">€ / tonne <span class="opttag">optional</span></div>
    <div class="opt">CII Cf override <span class="note" style="cursor:help" title="Optional — e.g. certified biofuel treatment per MEPC.1/Circ.905 (chunk imo-circ905-annex)">ⓘ</span></div><div></div>
  </div>`;
}

/* ---- derived arrival/departure display (MDA imports) ---- */
const DERIVE_RULE_TXT = {
  CASE_A:   "unbroken OPERATING_CONDITION chain around the cargo-operation reports (Case A)",
  AT_BERTH: "first → last AT_BERTH report (no cargo operations recorded)",
  BUNKERING:"OPERATING_CONDITION chain containing the bunkering report (no cargo ops / berth)",
  AT_ANCHOR:"first → last AT_ANCHOR report (no cargo ops / berth / bunkering)",
  DRIFTING: "first → last DRIFTING report (no cargo ops / berth / bunkering / anchorage)"
};
function derivedTimesHtml(row){
  if(!row.arrGmt && !row.depGmt && !row.incomplete) return "";
  const t = s => s? esc(String(s).replace("T"," "))+" GMT" : "—";
  const tip = "Derived from the MDA report data — ARRIVAL-EOSP / DEPARTURE-SOSP are sea-passage markers, not the regulatory arrival/departure. Rule used: "
    + (DERIVE_RULE_TXT[row.deriveRule]||row.deriveRule||"n/a")
    + ". Consumption before the derived arrival / after the derived departure is attributed to the adjacent voyage."
    + (row.incomplete? "<br><br><b>Incomplete stay:</b> the file starts or ends inside this port stay — only the available side could be derived. Upload ±1 month around the boundary for a complete picture.":"");
  return `<div class="note" style="margin:2px 0 4px">⚓ Arrival: <b>${t(row.arrGmt)}</b> &nbsp;·&nbsp; Departure: <b>${t(row.depGmt)}</b> <span style="color:#888">(derived, read-only)</span>${row.incomplete?' <span style="color:#c9a300;font-weight:600">· incomplete stay (file boundary)</span>':""} ${info(tip)}</div>`;
}
function pocWarnIcons(row){
  let s="";
  if(row.pocQty) s+=`<span style="color:#e67e22;cursor:help;font-weight:700" title="Port of Call set by the cargo-quantity fallback: CARGO_QTY changed between arrival (EOSP) and departure (SOSP) by more than 5% of DWT (or 0 ↔ loaded) without any recorded cargo-operation activity. Verify this stay against the port log.">❗</span> `;
  if(row.pocMismatch) s+=`<span style="color:#c9a300;cursor:help;font-weight:700" title="The file's own POC column disagrees with the derived Port-of-Call classification. The derived result (cargo operations + port limits) is used for all calculations; the file's POC column is ignored.">⚠</span> `;
  return s;
}

function rowHtml(row, ri){
  const omr = rowOMR(row);
  const omrChip = omr.length? `<span class="zbadge zb-OMR" title="${esc(omr.map(x=>x.p.n+": "+x.omr).join(" · "))}">⚠ ${esc(omr.map(x=>x.omr).filter((v,i,a)=>a.indexOf(v)===i).join(" / "))}</span>` : "";
  /* reporting-year state (2026-07-16): multi-year imports keep all rows; out-of-year rows
     are greyed and excluded from every KPI until the year selector matches them */
  const ry=String(S.year), ya=row.tStart?String(row.tStart).slice(0,4):null, yb=row.tEnd?String(row.tEnd).slice(0,4):null;
  const outYear = row.yearPart? String(row.yearPart)!==ry : ((ya||yb) && ya!==ry && yb!==ry);
  /* country on mouse-over (2026-07-16): ports show their country when hovering the row title */
  const cTip = row.kind==="port"
    ? (row.port&&row.port.c? portCountryName(row.port.c) : "")
    : [row.fromPort&&row.fromPort.c?portCountryName(row.fromPort.c):"", row.toPort&&row.toPort.c?portCountryName(row.toPort.c):""].filter(Boolean).join(" → ");
  const yearChip = outYear
    ? `<span class="zbadge zb-OMR" title="Dated ${esc(ya||yb)} — outside the ${ry} reporting year selected in Settings. Excluded from ALL KPIs; switch the reporting year to include it.">🗓 ${esc(ya||yb)} — excluded from ${ry}</span>`
    : (row.splitYear? `<span class="zbadge" style="background:#eef3f8;color:#38607a" title="One year-part of an activity that crossed 31 Dec — it carries exactly the consumption that occurred in ${esc(String(row.yearPart))} (straddling report periods pro-rated by time).">🗓 split at year boundary</span>` : "");
  const title = `<b style="font-size:13px${cTip?";cursor:help":""}"${cTip?` title="${esc(cTip)}"`:""}>${esc(composeLabel(row))}</b>${omrChip}${yearChip}`;
  const head = row.kind==="voyage"
    ? `<div class="rhead"><span class="tag">VOYAGE</span>${title}<div style="margin-left:auto"><button class="del" onclick="S.rows.splice(${ri},1);save();renderWorkspace()">Remove</button></div></div>
       <div class="inline">
         ${portInputHtml(ri,'fromPort',row.fromPort,'From port')}
         <div style="max-width:120px"><label>From zone</label><select onchange="setZone(${ri},'from',this.value)">${zoneOptions(row.from)}</select></div>
         ${portInputHtml(ri,'toPort',row.toPort,'To port')}
         <div style="max-width:120px"><label>To zone</label><select onchange="setZone(${ri},'to',this.value)">${zoneOptions(row.to)}</select></div>
       </div>
       <div class="inline">
         <div style="max-width:180px"><label>Distance nm</label><input type="number" step="any" min="0" value="${row.dist??""}" oninput="upd('rows.${ri}.dist',num(this.value))"></div>
         <div style="max-width:180px"><label>Cargo t (SCC)</label><input type="number" step="any" min="0" value="${row.cargo??""}" oninput="upd('rows.${ri}.cargo',num(this.value))"></div>
         <div style="flex:2"></div>
       </div>`
    : `<div class="rhead"><span class="tag" style="background:#f3ecfb;color:#6a3fa0">PORT / AT BERTH</span>${title}${row.poc===false?'<span class="zbadge zb-OMR" title="Not a port of call — this stay is excluded from EU ETS, UK ETS and FuelEU scope. CII/SCC still count the fuel.">⚓ transit — out of ETS/FuelEU scope</span>':""}<div style="margin-left:auto"><button class="del" onclick="S.rows.splice(${ri},1);save();renderWorkspace()">Remove</button></div></div>
       ${derivedTimesHtml(row)}
       <div class="inline">
         ${portInputHtml(ri,'port',row.port,'Port')}
         <div style="max-width:150px"><label>Zone</label><select onchange="setZone(${ri},'zone',this.value)">${zoneOptions(row.zone)}</select></div>
         <div style="max-width:230px"><label>Port of call (POC) ${pocWarnIcons(row)}${info("<b>ON (default):</b> a genuine port of call — at-berth/at-anchor consumption here counts 100% for EU ETS &amp; FuelEU (EEA ports) and UK ETS (UK ports).<br><br><b>OFF:</b> transit or anchorage-only stop (no call, or cargo ops outside port limits, e.g. STS) — excluded from EU ETS, UK ETS and FuelEU. CII &amp; SCC count the fuel either way.<br><br>MDA imports DERIVE this from the report data (cargo operations + port limits); the file's own POC column is ignored for calculations.")}</label>
           <div class="chk" style="margin-top:6px"><input type="checkbox" ${row.poc!==false?"checked":""} onchange="S.rows[${ri}].poc=this.checked;save();renderWorkspace()"> ${row.poc!==false?"YES — port of call":"NO — transit"}</div></div>
         <div style="flex:1"></div>
       </div>`;
  const tf = fmtRange(row.tStart,row.tEnd);
  const dateBlock = S.showDates
    ? `<div class="inline" style="max-width:640px">
      <div><label>From date/time (UTC) — optional</label><input type="datetime-local" value="${esc(row.tStart||"")}" onchange="updTime(${ri},'tStart',this.value)"></div>
      <div><label>To date/time (UTC) — optional</label><input type="datetime-local" value="${esc(row.tEnd||"")}" onchange="updTime(${ri},'tEnd',this.value)"></div>
      <div style="max-width:90px"><label>Hours</label><input type="number" step="any" min="0" value="${row.hours??""}" oninput="upd('rows.${ri}.hours',num(this.value))"></div>
      <div style="align-self:end;padding-bottom:7px"><span class="note">${tf?("🕓 "+esc(tf)):"no timeframe set"}</span></div>
    </div>`
    : (tf?`<div class="note" style="margin-top:4px">🕓 ${esc(tf)}${row.hours?" · "+fmt(row.hours)+" h":""}</div>`:"");
  return `<div class="rowcard${row.kind==="port"?" portcard":""}"${outYear?' style="opacity:.55"':''}>
    ${head}
    ${dateBlock}
    ${(row.fuels||[]).length? fuelHeaderHtml():""}${(row.fuels||[]).map((fr,fi)=>fuelLineHtml(ri,fi,fr)).join("")}
    <button class="add" onclick="S.rows[${ri}].fuels.push({fuelId:'HFO',tonnes:0,price:0});save();renderWorkspace()">+ Fuel</button>
  </div>`;
}

/* ---------- WORKSPACE (live) ---------- */
function renderWorkspace(){
  const el = document.getElementById("tab-work");
  el.innerHTML = `
  <div class="ws">
    <div>
      <div class="card noprint" style="background:var(--blue2);border-color:#bcd9de">
        <b>${esc(S.ship.name||"Vessel")}</b> · ${(TYPE_BY_ID[S.ship.typeId]||{}).name||""} · ${fmtI(S.ship.capacity)} ${(TYPE_BY_ID[S.ship.typeId]||{}).capUnit||""} · year <b>${S.year}</b>
        &nbsp; <button class="pill hbtn" style="background:#fff;color:var(--blue);border-color:#bcd9de" onclick="showTab('vessel')">Edit settings →</button>
      </div>
      <h4 class="sec" style="margin-top:0">Voyages &amp; port stays — edit anything, results update live → ${info("<b>Scope per row:</b> EU ETS &amp; FuelEU — EEA↔EEA and at berth EEA 100%, EEA↔other 50% (euets-art3ga); UK ETS — UK→UK voyages and UK in-port only (ukets-sch2a-p7); at-berth scope applies only when the stay is a <b>port of call</b> (POC toggle on each port row); CII &amp; SCC count all activity (imo-g1-s4).<br><br>Import a DNV OVD Log Abstract CSV, an MDA event-log export (.xlsx/.csv) or a THETIS-MRV GHG Emissions XML from the header bar to fill this list automatically.")}</h4>
      <div class="noprint" style="display:flex;gap:22px;flex-wrap:wrap">
        <div class="chk"><input type="checkbox" ${S.showDates?"checked":""} onchange="S.showDates=this.checked;save();renderWorkspace()"> 🕓 Optional date entry ${info("Shows From/To date-time fields on each row — mainly useful for seeing which report period an OVD-imported row covers.")}</div>
        <div class="chk"><input type="checkbox" ${S.showSplit?"checked":""} onchange="S.showSplit=this.checked;save();renderWorkspace()"> ⚙ Machinery split (ME · AE · Boiler · Other) ${info("Shows the per-machine consumption split on every fuel line, filled automatically from the MDA MAIN/AUXILIARY/BOILER consumption columns (per fuel type, the unassigned remainder is <b>Other</b>).<br><br><b>Editable:</b> changing a machine figure updates the line total; changing the total sends the difference to Other (if the new total is below ME+AE+Boiler, those scale down pro-rata).<br><br>For LNG-family fuels the ME and AE shares take their CH₄-slip class from the two consumer-class dropdowns in Settings; Boiler and Other are slip-free. The split also feeds the OVD-format download on the Calculations tab.")}</div>
      </div>
      ${S.rows.length? S.rows.map((r,ri)=>rowHtml(r,ri)).join("") : `<div class="card" style="text-align:center;padding:26px"><b>No activity yet.</b><div class="note" style="margin-top:6px">Add a voyage or port stay below — or click <b>⬆ Import data (OVD · MDA · THETIS)</b> in the header to load a reporting file. Set up the vessel first under <b>Settings</b>.</div></div>`}
      <button class="add" onclick="S.rows.push({kind:'voyage',label:'',from:'EEA',to:'EEA',dist:0,cargo:0,fuels:[{fuelId:'HFO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add voyage</button>
      <button class="add" onclick="S.rows.push({kind:'port',label:'',zone:'EEA',poc:true,fuels:[{fuelId:'MDO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add port stay</button>
    </div>
    <div class="wsright" id="liveresults"></div>
  </div>`;
  renderLive();
}

const fmt = (x,d=2)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:Math.max(d,2),minimumFractionDigits:2});
const fmtI = (x)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:0});
const fmtF = (x,d=2)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:d,minimumFractionDigits:d});
function ratingColor(r){ return {A:"var(--ra)",B:"var(--rb)",C:"var(--rc)",D:"var(--rd)",E:"var(--re)"}[r]||"#888"; }

function ciiBarHtml(c){
  if(c.attained==null) return "<p class='note'>Enter capacity, distance and fuel to compute CII.</p>";
  const max = Math.max(c.bounds.inf*1.25, c.attained*1.1);
  const segs = [ [0,c.bounds.sup,"var(--ra)","A"], [c.bounds.sup,c.bounds.low,"var(--rb)","B"], [c.bounds.low,c.bounds.up,"var(--rc)","C"], [c.bounds.up,c.bounds.inf,"var(--rd)","D"], [c.bounds.inf,max,"var(--re)","E"] ];
  const pct = v=> (v/max*100);
  return `<div style="position:relative;margin-top:26px"><div class="ciibar">
    ${segs.map(s=>`<div style="width:${pct(s[1]-s[0])}%;background:${s[2]}">${s[3]}</div>`).join("")}
  </div><div class="marker" style="left:${pct(c.attained)}%"></div><div class="mlabel" style="left:${pct(c.attained)}%">${fmtF(c.attained,2)}</div></div>
  <div class="note">A≤${fmtF(c.bounds.sup)} · B≤${fmtF(c.bounds.low)} · C≤${fmtF(c.bounds.up)} · D≤${fmtF(c.bounds.inf)} gCO₂/${c.capUnit}·nm</div>`;
}

function renderLive(){
  const el = document.getElementById("liveresults"); if(!el) return;
  const R = computeAll(S);
  /* OMR / overseas-territory advisories from selected ports (badge + warning only — no automatic scope change) */
  S.rows.forEach(r=>{
    const hits=rowOMR(r);
    if(hits.length) R.warnings.push("'"+composeLabel(r)+"': "+hits.map(x=>x.p.n+" ("+x.p.c+") is "+x.omr).join(", ")+
      " — outermost-region / overseas-territory treatment may differ (EU ETS Art 12 & FuelEU Art 2 exemptions are Member-State opt-ins; UK overseas territories & crown dependencies sit outside UK ETS 'UK jurisdiction'). Scope NOT changed automatically — verify and adjust the zone dropdown if needed.");
  });
  const f = R.fueleu, e = R.ets, u = R.ukets, c = R.cii, sc = R.scc, ec = R.econ, sm = R.summary;
  el.innerHTML = `
  <div class="strip">
    <div class="sbox" style="grid-column:span 2"><div class="v">${fmt(e.euas,0)}</div><div class="l">EUA <b>tCO₂e</b></div></div>
    <div class="sbox" style="grid-column:span 2"><div class="v">${fmt(u.tco2e,0)}</div><div class="l">UKA <b>tCO₂e</b></div></div>
    <div class="sbox" style="grid-column:span 2"><div class="v">${fmtF(sc.weighted,2)}</div><div class="l">EEOI <b>gCO₂/t·nm</b></div></div>
    <div class="sbox" style="grid-column:span 3"><div class="v" style="color:${(f.cbFinal??0)>=0?"var(--green)":"var(--red)"}">${fmt((f.cbFinal??0)/1e6,0)}</div><div class="l">FEU-CB <b>tCO₂eq</b></div></div>
    <div class="sbox" style="grid-column:span 3"><div class="v" style="color:${f.penalty>0?"var(--red)":"var(--green)"}">${f.penalty>0?"€"+fmtI(f.penalty):"OK"}</div><div class="l">FEU PENALTY <b>€</b></div></div>
  </div>

  <div class="card">
    <h2>Annual summary — ${R.year} (reporting period)</h2>
    <h3>Vessel &amp; reporting particulars</h3>
    <div class="kv"><span>Vessel / IMO</span><b>${esc(S.ship.name||"—")}${S.ship.imo?" · IMO "+esc(S.ship.imo):""}</b></div>
    ${sm.tMin||sm.tMax?`<div class="kv"><span>Activity timeframe</span><b>${esc(fmtRange(sm.tMin,sm.tMax))}</b></div>`:""}
    <h3>Vessel performance</h3>
    <div class="kv"><span>Distance travelled</span><b>${fmt(sm.dist)} nm</b></div>
    <div class="kv"><span>Distance through ice</span><b>${fmt(sm.distIce)} nm</b></div>
    <div class="kv"><span>Time at sea${sm.hoursPort?" / at berth":""}</span><b>${fmt(sm.hoursSea)} h${sm.hoursPort?" / "+fmt(sm.hoursPort)+" h":""}</b></div>
    <div class="kv"><span>Cargo quantity (Σ voyages)</span><b>${fmt(sm.cargo)} t</b></div>
    <div class="kv"><span>Transport work</span><b>${fmt(sm.tw/1e6)} ×10⁶ t·nm</b></div>
    <h3>Fuel consumption (annual)</h3>
    ${Object.entries(sm.fuelByType).map(([id,t])=>`<div class="kv"><span>${esc((FUEL_BY_ID[id]||{}).name||id)}</span><b>${fmt(t)} t</b></div>`).join("")||'<p class="note">No fuel entered yet.</p>'}
    <div class="kv"><span><b>Total fuel consumption</b></span><b>${fmt(sm.fuelTotal)} t</b></div>
    <h3>Emissions &amp; intensity metrics</h3>
    <div class="kv"><span>CO₂ at berth / sea passage</span><b>${fmt(sm.co2Berth)} / ${fmt(sm.co2Sea)} t</b></div>
    <div class="kv"><span><b>Total CO₂ emissions</b></span><b>${fmt(sm.co2Total)} t</b></div>
    <div class="kv"><span>CO₂ per distance</span><b>${fmtF(sm.co2PerDist,2)} t/nm</b></div>
    <div class="kv"><span>CO₂ per transport work</span><b>${fmtF(sm.co2PerTW,2)} g/t·nm</b></div>
    <div class="kv"><span>Fuel per distance</span><b>${fmtF(sm.fuelPerDist,2)} t/nm</b></div>
    <div class="kv"><span>Fuel per transport work</span><b>${fmtF(sm.fuelPerTW,2)} g/t·nm</b></div>
    <p class="note">TtW CO₂, all activity worldwide ${info("CO₂ figures are Tank-to-Wake per fuel Cf (imo-g1-s4 / FuelEU Annex II values), covering all activity worldwide — not only the EU/UK-scoped share.")}</p>
  </div>

  <div class="card noprint" style="padding:10px 16px">
    <span class="note">📊 The detailed <b>voyage &amp; berth breakdown</b> (per-row ETS %, EUA/UKA, eligible energy, CB, penalty), the FuelEU allocation working and the report-level trace moved to the <b>🧮 Calculations</b> tab — with Excel downloads.</span>
    <button class="pill hbtn" style="margin-left:8px" onclick="showTab('calcs')">Open Calculations →</button>
  </div>

  <div class="card">
    <h2>IMO CII — ${R.year} ${info("<b>Regulatory sources:</b> imo-g1-s4 · imo-g2-s4 · imo-g4-s4 · imo-a6-reg28")}</h2>
    <div style="display:flex;gap:16px;align-items:center">
      <span class="badge" style="background:${ratingColor(c.rating)}">${c.rating??"—"}</span>
      <div style="flex:1">
        <div class="kv"><span>Attained CII</span><b>${fmtF(c.attained,3)} gCO₂/${c.capUnit}·nm</b></div>
        <div class="kv"><span>Required (Z=${c.Z}% <span class="flag">FILL-IN</span>)</span><b>${fmtF(c.ciiReq,3)}</b></div>
      </div>
    </div>
    ${ciiBarHtml(c)}
    <div class="kv"><span>Total CO₂ / distance</span><b>${fmt(c.co2_t)} t / ${fmt(c.totalDist)} nm</b></div>
  </div>

  <div class="card">
    <h2>EU ETS — ${R.year} ${info("<b>Regulatory sources:</b> euets-art3ga · art3gb")}</h2>
    <div class="big">${fmt(e.euas)} <span class="unit">EUAs to surrender</span></div>
    <div class="kv"><span>Covered ${e.basisLabel==="CO2e (CO2+CH4+N2O)"?"CO₂e (CO₂ + CH₄ + N₂O)":"("+esc(e.basisLabel)+")"}</span><b>${fmt(e.basis_t)} t</b></div>
    ${R.year>=2026?`<div class="kv"><span>CH₄/N₂O GWP set (selected)</span><b>${e.gwp.label} <span class="flag" title="${esc(e.gwp.src)}">FILL-IN</span></b></div>`:""}
    <div class="kv"><span>Phase-in</span><b>${e.phase*100}%</b></div>
    <div class="kv"><span>EUA cost @ €${fmt(S.euaPrice)}</span><b>€ ${fmt(e.cost,0)}</b></div>
  </div>

  <div class="card">
    <h2>UK ETS — ${R.year} ${info("<b>Regulatory sources:</b> ukets-sch2a-p35/p36")}</h2>
    ${u.active? `
    <div class="big">${fmt(u.tco2e)} <span class="unit">tCO₂e (ME<sub>ETS</sub>)</span></div>
    <div class="kv"><span>CO₂ / CH₄ / N₂O (t)</span><b>${fmt(u.co2)} / ${fmtF(u.ch4,3)} / ${fmtF(u.n2o,3)}</b></div>
    <div class="kv"><span>UKA cost @ £${fmt(S.ukaPrice)}</span><b>£ ${fmt(u.cost,0)}</b></div>`
    : `<p class="note">Applies from scheme year 2026. Computed: ${fmt(u.tco2e)} t CO₂e — no obligation for ${R.year}.</p>`}
  </div>

  <div class="card">
    <h2>FuelEU Maritime — ${R.year} ${info("<b>Regulatory sources:</b> fueleu-art4 · annexi/ii/iv · art20/21/23 · essf-ws1 ch.2 (fuel allocation)")}</h2>
    <div class="kv"><span>Fuel allocation ${info("FuelEU prescribes no allocation method (essf-ws1-2-5): fuels reported under MRV in the period — including the uncovered half of 50% voyages — may be <b>freely allocated</b> to fill the FuelEU energy scope.<br><br><b>Optimal (default):</b> fills the scope cleanest-first by effective WtW intensity incl. CH₄ slip per consumer; RFNBOs rank with their ×2 reward. Reproduces the ESSF worked examples.<br><br><b>Proportional:</b> every fuel contributes pro-rata to coverage — the calculator's previous behaviour, kept for comparison.")}</span>
      <b><select onchange="upd('fueleuAlloc',this.value)" style="font-size:12px;padding:2px 4px">
        <option value="optimal" ${f.allocMethod==="optimal"?"selected":""}>Optimal — cleanest-first (ESSF WS1 §2.5)</option>
        <option value="proportional" ${f.allocMethod==="proportional"?"selected":""}>Proportional (comparison)</option>
      </select></b></div>
    <div class="kv"><span>GHGIE<sub>actual</sub>${f.fwind<1?` (f<sub>wind</sub>=${f.fwind})`:""}</span><b>${fmtF(f.ghgie,5)} gCO₂eq/MJ</b></div>
    <div class="kv"><span>Target (91.16 − ${f.targetPct}%)</span><b>${fmtF(f.target,5)}</b></div>
    ${f.ghgieAlt!=null && Math.abs((f.ghgieAlt??0)-(f.ghgie??0))>1e-9?`<div class="kv"><span>${f.allocMethod==="optimal"?"Proportional":"Optimal"} method would give</span><b>${fmtF(f.ghgieAlt,5)} g/MJ · CB ${fmt((f.cbAlt??0)/1e6,0)} t</b></div>`:""}
    <div class="kv"><span>Energy in scope (fuel + OPS)</span><b>${fmt(f.E_total/1e6)} ×10⁶ MJ</b></div>
    ${f.E_pool>f.E_total-f.opsMJ+1e-6?`<div class="kv"><span>Allocatable fuel energy (MRV pool)</span><b>${fmt(f.E_pool/1e6)} ×10⁶ MJ</b></div>`:""}
    ${f.terms&&f.terms.length?`<table class="scctable" style="margin-top:6px"><tr><th>Fuel × consumer</th><th class="num">Pool (t)</th><th class="num">Allocated (t)</th><th class="num">Allocated ×10⁶ MJ</th><th class="num">WtW g/MJ</th></tr>
      ${f.terms.map(t=>`<tr${t.E<=0?' style="color:#999"':''}><td>${esc(t.name)}${t.m?` <span class="note">· ${t.m==="BLR"?"Boiler":t.m==="OTH"?"Other":esc(t.m)}${(t.m==="ME"||t.m==="AE")?" — "+esc(t.engine):""}</span>`:""}${t.rfnbo?' <span class="note">×2 RWD</span>':""}</td><td class="num">${fmt(t.tonnesPool)}</td><td class="num">${fmt(t.tonnes)}</td><td class="num">${fmtF(t.E/1e6,2)}</td><td class="num">${fmtF(t.wtt+t.ttw,2)}</td></tr>`).join("")}</table>
    <p class="note">Allocated mix per essf-ws1 ch.2 worked examples — grey rows are in the MRV pool but not allocated to the scope (they carry the highest intensity). WtW = WtT + TtW incl. CH₄ slip for the row's consumer class.</p>`:""}
    <div class="kv"><span>Compliance balance</span><b style="color:${f.cb>=0?"var(--green)":"var(--red)"}">${fmt(f.cb/1e6)} tCO₂eq</b></div>
    ${f.banked? `<div class="kv"><span>+ banked (Art 20)</span><b>${fmt(f.banked/1e6)} t</b></div>`:""}
    ${f.poolCB? `<div class="kv"><span>+ pool partner (Art 21)</span><b>${fmt(f.poolCB/1e6)} t</b></div>`:""}
    ${f.borrowUsed? `<div class="kv"><span>+ borrowed (→ debt ${fmt(f.borrowDebt/1e6)} t next period)</span><b>${fmt(f.borrowUsed/1e6)} t</b></div>`:""}
    <div class="kv"><span><b>Balance after flexibility</b></span><b style="color:${f.cbFinal>=0?"var(--green)":"var(--red)"}">${fmt(f.cbFinal/1e6)} tCO₂eq</b></div>
    <div class="big" style="color:${f.penalty>0?"var(--red)":"var(--green)"}">${f.penalty>0?`€ ${fmt(f.penalty,0)} penalty`:(f.surplusValue>0?`€ ${fmt(f.surplusValue,0)} surplus value*`:"Compliant")}</div>
    ${f.mult>1?`<div class="note">Includes ×${f.mult.toFixed(1)} consecutive-deficit multiplier (Art 23(2)).</div>`:""}
    ${f.surplusValue>0?`<div class="note">*Indicative pooling/banking value ceiling at the Annex IV penalty rate.</div>`:""}
  </div>

  <div class="card">
    <h2>SCC commercial KPIs ${info("<b>Regulatory sources:</b> scc-2-5 Eq. 4–5")}</h2>
    ${sc.voyages.length? `
    <table class="scctable"><tr><th>Voyage</th><th class="num">CO₂ (t)</th><th class="num">Transport work (×10⁶ t·nm)</th><th class="num">Intensity (gCO₂/t·nm)</th>${S.sccReqMin?`<th class="num">Δ Min %</th>`:""}${S.sccReqStriving?`<th class="num">Δ Str %</th>`:""}</tr>
    ${sc.voyages.map(v=>`<tr><td>${esc(v.label)}</td><td class="num">${fmt(v.co2)}</td><td class="num">${fmtF(v.tw/1e6,2)}</td><td class="num">${fmtF(v.intensity,2)}</td>${S.sccReqMin?`<td class="num">${fmtF((v.intensity-S.sccReqMin)/S.sccReqMin*100,2)}</td>`:""}${S.sccReqStriving?`<td class="num">${fmtF((v.intensity-S.sccReqStriving)/S.sccReqStriving*100,2)}</td>`:""}</tr>`).join("")}
    </table>
    <div class="kv"><span>Weighted annual intensity</span><b>${fmtF(sc.weighted,2)} gCO₂/t·nm</b></div>
    ${sc.deltaMin!=null?`<div class="kv"><span>Δ vs 'Minimum'</span><b style="color:${sc.deltaMin<=0?"var(--green)":"var(--red)"}">${fmtF(sc.deltaMin,2)}%</b></div>`:""}
    ${sc.deltaStr!=null?`<div class="kv"><span>Δ vs 'Striving'</span><b style="color:${sc.deltaStr<=0?"var(--green)":"var(--red)"}">${fmtF(sc.deltaStr,2)}%</b></div>`:""}`
    : `<p class="note">Add voyages with cargo and distance for per-voyage intensity.</p>`}
  </div>

  <div class="card">
    <h2>Voyage P&amp;L &amp; compliance breakeven</h2>
    <div class="kv"><span>Fuel cost (all activity)</span><b>€ ${fmt(ec.fuelCostAll,0)}</b></div>
    <div class="kv"><span>EU ETS + UK ETS cost</span><b>€ ${fmt(ec.etsCost,0)} + ${fmt(ec.ukCost,0)}</b></div>
    <div class="kv"><span>FuelEU penalty</span><b>€ ${fmt(ec.fueleuPenalty,0)}</b></div>
    ${ec.surplusValue?`<div class="kv"><span>FuelEU surplus value (indicative)</span><b>− € ${fmt(ec.surplusValue,0)}</b></div>`:""}
    <div class="kv"><span><b>Total compliance-inclusive cost</b></span><b>€ ${fmt(ec.total,0)}</b></div>
    <h3>Breakeven to zero FuelEU balance</h3>
    ${ec.breakeven? (ec.breakeven.impossible
      ? `<p class="note">Even 100% ${esc(ec.breakeven.fuel)} misses the ${R.year} target (intensity at 100% = ${fmtF(ec.breakeven.intensityAt,2)} g/MJ). Pick a lower-intensity substitute (Settings tab).</p>`
      : `<div class="kv"><span>Replace with ${esc(ec.breakeven.fuel)}</span><b>${fmtF(ec.breakeven.share*100,2)}% of in-scope energy</b></div>
         <div class="kv"><span>Substitute quantity</span><b>${fmt(ec.breakeven.tonnes)} t (displacing ~${fmt(ec.breakeven.dispTonnes)} t)</b></div>
         <div class="kv"><span>Extra fuel cost / penalty avoided</span><b>€ ${fmt(ec.breakeven.extraFuelCost,0)} / € ${fmt(ec.breakeven.penaltyAvoided,0)}</b></div>
         <div class="kv"><span><b>Net P&amp;L impact</b></span><b style="color:${(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided)<=0?"var(--green)":"var(--red)"}">€ ${fmt(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided,0)}</b></div>`)
      : `<p class="note">${f.ghgie!=null && f.ghgie<=f.target ? "Already at or below target — no blending needed." : "Pick a substitute fuel on the Settings tab."}</p>`}
  </div>
  ${R.warnings.length?`<div class="card"><h2>⚠ Assumptions &amp; items to verify</h2>${R.warnings.map(w=>`<div class="warn">${esc(w).replace(/CO2e/g,"CO₂e").replace(/CO2/g,"CO₂").replace(/CH4/g,"CH₄").replace(/N2O/g,"N₂O")}</div>`).join("")}</div>`:""}`;
  /* Order: strip → pointer → CII → EU ETS → UK ETS → FuelEU → Annual summary → SCC → P&L
     (voyage & berth breakdown lives on the Calculations tab since 2026-07-16) */
  const cards=[...el.querySelectorAll(":scope > .card")];
  const byH=t=>cards.find(cd=>{const h=cd.querySelector("h2");return h&&h.textContent.indexOf(t)>=0;});
  const anchor=byH("SCC commercial");
  const sumCard=byH("Annual summary");
  if(anchor&&sumCard) el.insertBefore(sumCard, anchor);
}

/* ============ CALCULATIONS TAB (2026-07-16, Aurvin) ============
   Detailed calculation tables: the voyage & berth breakdown (moved out of the live
   panel), FuelEU allocation and EU ETS working, and a report-level trace table with
   OVD-format Excel download. All Excel files are generated fully offline by the
   minimal writer below (stored-ZIP OOXML — no libraries, works in the standalone). */
function crc32(u8){
  let T=crc32.T;
  if(!T){ T=crc32.T=new Int32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); T[n]=c; } }
  let crc=-1;
  for(let i=0;i<u8.length;i++) crc=(crc>>>8)^T[(crc^u8[i])&0xFF];
  return (crc^-1)>>>0;
}
function zipStore(files){ /* files: [{name, data:Uint8Array}] -> Blob (ZIP, method 0) */
  const enc=new TextEncoder(), chunks=[], central=[]; let off=0;
  const le16=v=>[v&255,(v>>8)&255], le32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255];
  for(const f of files){
    const name=enc.encode(f.name), crc=crc32(f.data), sz=f.data.length;
    const local=new Uint8Array([0x50,0x4b,3,4, 20,0, 0,0, 0,0, 0,0,0,0].concat(le32(crc),le32(sz),le32(sz),le16(name.length),[0,0]));
    chunks.push(local,name,f.data);
    central.push({name,crc,sz,off});
    off+=local.length+name.length+sz;
  }
  const cstart=off;
  for(const c of central){
    const hdr=new Uint8Array([0x50,0x4b,1,2, 20,0, 20,0, 0,0, 0,0, 0,0,0,0].concat(le32(c.crc),le32(c.sz),le32(c.sz),le16(c.name.length),[0,0, 0,0, 0,0, 0,0, 0,0,0,0],le32(c.off)));
    chunks.push(hdr,c.name); off+=hdr.length+c.name.length;
  }
  chunks.push(new Uint8Array([0x50,0x4b,5,6, 0,0, 0,0].concat(le16(central.length),le16(central.length),le32(off-cstart),le32(cstart),[0,0])));
  return new Blob(chunks,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function xlsxBlob(sheetName, rows){ /* rows: array of arrays; row 0 = bold frozen header */
  const eX=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const colRef=i=>{ let s=""; i++; while(i){ s=String.fromCharCode(65+(i-1)%26)+s; i=Math.floor((i-1)/26); } return s; };
  const body=rows.map((r,ri)=>`<row r="${ri+1}">`+r.map((v,ci)=>{
    if(v==null||v==="") return "";
    const ref=colRef(ci)+(ri+1), st=ri===0?' s="1"':'';
    if(typeof v==="number"&&isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${eX(v)}</t></is></c>`;
  }).join("")+"</row>").join("");
  const enc=s=>new TextEncoder().encode(s);
  const files=[
    {name:"[Content_Types].xml", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)},
    {name:"_rels/.rels", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)},
    {name:"xl/workbook.xml", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${eX(sheetName.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`)},
    {name:"xl/_rels/workbook.xml.rels", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)},
    {name:"xl/styles.xml", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`)},
    {name:"xl/worksheets/sheet1.xml", data:enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`)}
  ];
  return zipStore(files);
}
function downloadXlsx(fname, sheetName, rows){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(xlsxBlob(sheetName, rows));
  a.download=fname;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
/* report-type label: derived ARRIVAL/DEPARTURE replace IN_PORT; EOSP/SOSP are shown as
   the sea-passage markers they are */
function reportTypeLabel(rep){
  if(rep.rt==="ARRIVAL-EOSP") return "EOSP";
  if(rep.rt==="DEPARTURE-SOSP") return "SOSP";
  if(rep.rt==="FUEL_OIL_BUNKER") return "BUNKER";
  if(rep.rt==="IN_PORT") return rep.role||"IN_PORT";
  return rep.rt;
}
const fmtDict=(d)=> d? Object.entries(d).filter(([,v])=>v>1e-9).map(([k,v])=>k+" "+(Math.round(v*100)/100)).join(" · ") : "";
/* ---- Excel: voyage & berth breakdown (one line per row × fuel; row totals on first line) ---- */
function downloadBreakdownXlsx(){
  const R=computeAll(S);
  const rows=[["Activity","Kind","From (UTC)","To (UTC)","Hours","Distance nm","Cargo t",
               "EU ETS %","UK ETS %","FuelEU %","Fuel","Tonnes","LCV MJ/g","Eligible EU t","Eligible energy MJ",
               "CO2 t (row)","EUA (row)","UKA tCO2e (row)","FuelEU CB tCO2eq (row, indicative)","FuelEU penalty EUR (row, indicative)"]];
  for(const d of R.rowDetails){
    const fs=d.fuels.length?d.fuels:[{id:"",name:"",tonnes:"",eligibleEU:""}];
    fs.forEach((fu,i)=>{
      const f=FUEL_BY_ID[fu.id]||{};
      rows.push([d.label||"—", d.kind, d.tStart||"", d.tEnd||"", i? "":(d.hours||""), i? "":(d.dist||""), i? "":(d.cargo||""),
                 i? "":d.covEU*100, i? "":d.covUK*100, i? "":d.covEU*100,
                 fu.name||fu.id, fu.tonnes===""?"":fu.tonnes, f.lcv??"", fu.eligibleEU===""?"":fu.eligibleEU,
                 (f.lcv&&fu.eligibleEU!=="")? fu.eligibleEU*1e6*f.lcv : "",
                 i? "":d.co2, i? "":d.euas, i? "":d.ukCO2e, i? "":(d.feuCB!=null? d.feuCB/1e6 : ""), i? "":(d.feuPenalty||0)]);
    });
  }
  downloadXlsx("voyage_berth_breakdown_"+S.year+".xlsx","Breakdown",rows);
}
/* ---- Excel: OVD-format report-level download (diagnostics) ---- */
function downloadReportsXlsx(){
  const reps=S.mdaReports||[]; if(!reps.length){ alert("No report-level data — import an MDA file first."); return; }
  const codes=[...new Set(reps.flatMap(r=>Object.keys(r.fuels||{})))].sort();
  const robCodes=[...new Set(reps.flatMap(r=>Object.keys(r.rob||{})))].sort();
  const G=[["ME","ME_Consumption_"],["AE","AE_Consumption_"],["BLR","Boiler_Consumption_"],["OTH","Other_Consumption_"]];
  const hdr=["Date_Time_GMT","Report_Start_GMT","Report_End_GMT","Report_Type","Operating_Condition","Associated_Activity",
             "Outside_Port_Limit","POC_file","Current_Port","Current_Country","Current_Region","Voyage_From","Voyage_To",
             "Distance","Cargo_Mt"]
    .concat(codes.map(c=>"Total_Consumption_"+c))
    .concat(G.flatMap(([g,p])=>codes.map(c=>p+c)))
    .concat(robCodes.map(c=>"ROB_"+c))
    .concat(["Bunker_Amount","Latitude","Longitude"]);
  const rows=[hdr];
  for(const r of reps){
    rows.push([r.t||"", r.ts||"", r.te||"", reportTypeLabel(r), r.oc||"", r.aa||"", r.opl?"TRUE":"", r.poc||"",
               r.portN||"", r.ctry||"", r.regn||"", r.org||"", r.dst||r.cur||"", r.dist||"", r.qty||""]
      .concat(codes.map(c=>(r.fuels||{})[c]||""))
      .concat(G.flatMap(([g])=>codes.map(c=>((r.mach||{})[g]||{})[c]||"")))
      .concat(robCodes.map(c=>(r.rob||{})[c]||""))
      .concat([r.bunker||"", r.lat??"", r.lon??""]));
  }
  downloadXlsx("mda_reports_OVD_format.xlsx","Reports",rows);
}

/* ---- Voyage & berth breakdown: 16-column CSS-grid layout (handoff SPEC.md, 2026-07-17) ----
   Maps the engine's rowDetails + the aligned in-year source rows onto the leg/fuel model:
   ports [{label,juris}], per-fuel rows (rowspan via grid-row spans), leg-level results.
   Jurisdiction badge is shown on BERTH rows only, never on voyages (SPEC §2). */
const JURIS_PAL = {
  'EU':     { bg:'#eef2fa', fg:'#3652a3' },
  'UK':     { bg:'#f4f1fa', fg:'#6d4fa3' },
  'EU OMR': { bg:'#e7f4f4', fg:'#0e7490' },
  'UK OMR': { bg:'#faf0f4', fg:'#a34f6d' },
};
const BR_GRID = "minmax(150px,2.6fr) minmax(64px,0.7fr) minmax(90px,0.9fr) minmax(54px,0.7fr) minmax(58px,0.6fr) minmax(48px,0.55fr) minmax(54px,0.7fr) minmax(54px,0.8fr) minmax(54px,0.8fr) minmax(54px,0.75fr) minmax(62px,0.9fr) minmax(48px,0.55fr) minmax(54px,0.7fr) minmax(54px,0.8fr) minmax(48px,0.55fr) minmax(54px,0.8fr)";
/* clean generic fuel name — strip the ISO 8217 / engine-cycle parenthetical (SPEC §1) */
function cleanFuelName(f){ return String(f.name||f.id||"").split(" (")[0].trim() || (f.id||""); }
/* jurisdiction of a berth port: OMR wins, else EU/UK zone, else null (no badge) */
function jurisOfPort(port, zone){
  if(port && port.c){
    const omr = portOMR(port.c); if(omr) return omr;
    const z = zoneOfLocode(port.c);
    return z==="EEA"?"EU":z==="UK"?"UK":null;
  }
  if(zone) return zone==="EEA"?"EU":zone==="UK"?"UK":null;
  return null;
}
/* strict percentage — max 2 dp, integers show no decimals (SPEC §4) */
function brPct(frac){ const r=Math.round(frac*10000)/100; return (r%1===0?r.toFixed(0):r.toFixed(2))+"%"; }
/* muted em-dash for empty / no-obligation cells (SPEC §5) */
const brDash = '<span style="color:#94a3b8">—</span>';
function brNum(v,dp){ return (v==null||isNaN(v)||v===0) ? brDash : fmtF(v,dp||2); }

/* build the {label,juris} ports for a leg from its aligned source row */
function legPorts(det, row){
  if(det.kind==="voyage"){
    const a = row && row.fromPort ? portDisp(row.fromPort) : (row ? zoneName(row.from) : "");
    const b = row && row.toPort   ? portDisp(row.toPort)   : (row ? zoneName(row.to)   : "");
    if(!a && !b && det.label){ const parts=det.label.split("→"); return [{label:(parts[0]||"").trim(),juris:null},{label:(parts[1]||"").trim(),juris:null}]; }
    return [{label:a, juris:null},{label:b, juris:null}];      // voyages: never badged (SPEC §2)
  }
  const p = row && row.port;
  const label = p ? portDisp(p) : (row ? zoneName(row.zone) : (det.label||"").replace(/^At berth\s*/,""));
  return [{ label, juris: jurisOfPort(p, row?row.zone:null) }];
}

/* replicate the engine's reporting-year filter so source rows align 1:1 with rowDetails */
function inYearRows(){
  const y = Number(S.year)||2026;
  return (S.rows||[]).filter(row=>{
    if(row.yearPart) return Number(row.yearPart)===y;
    const a = row.tStart? String(row.tStart).slice(0,4) : null;
    const b = row.tEnd?   String(row.tEnd).slice(0,4)   : null;
    if(!a && !b) return true;
    return a===String(y) || b===String(y);
  });
}

/* full inner grid: header rows + one grid per leg + totals + footnote */
function breakdownGrid(R, tips){
  const cellPad = "10px 12px";
  const src = inYearRows();
  const header = `
    <div style="display:grid;grid-template-columns:${BR_GRID};grid-template-rows:auto auto;border-bottom:2px solid #cbd5e1">
      <div style="grid-column:1;grid-row:1 / span 2;display:flex;align-items:flex-end;padding:10px 12px;background:#f1f5f9;border-right:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a">Activity &amp; timeframe</div>
      <div style="grid-column:2;grid-row:1 / span 2;display:flex;align-items:flex-end;justify-content:flex-end;padding:10px 12px;background:#f1f5f9;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right">Dist. (nm)</div>
      <div style="grid-column:3 / span 3;grid-row:1;padding:8px 12px;background:#ecf6f7;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#0e7490;white-space:nowrap">Fuel metrics</div>
      <div style="grid-column:6 / span 6;grid-row:1;padding:8px 12px;background:#f0f7ef;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#3d7a3a;white-space:nowrap">FuelEU Maritime ${tips.feu}</div>
      <div style="grid-column:12 / span 3;grid-row:1;padding:8px 12px;background:#eef2fa;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#3652a3;white-space:nowrap">EU ETS</div>
      <div style="grid-column:15 / span 2;grid-row:1;padding:8px 12px;background:#f4f1fa;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#6d4fa3;white-space:nowrap">UK ETS</div>
      <div style="grid-column:3;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;white-space:nowrap">Fuel type</div>
      <div style="grid-column:4;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right" title="Fuel consumed (tonnes)">Cons. t</div>
      <div style="grid-column:5;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right;white-space:nowrap;border-right:1px solid #e2e8f0">LCV ${tips.lcv}</div>
      <div style="grid-column:6;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">Cov.</div>
      <div style="grid-column:7;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right" title="Eligible mass under regulation scope (tonnes)">Elig. t</div>
      <div style="grid-column:8;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">Energy (10⁶ MJ)</div>
      <div style="grid-column:9;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">Elig. energy (10⁶ MJ)</div>
      <div style="grid-column:10;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right" title="Compliance balance (tCO₂eq)">CB</div>
      <div style="grid-column:11;grid-row:2;padding:8px 12px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right">Penalty (€)</div>
      <div style="grid-column:12;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">Cov.</div>
      <div style="grid-column:13;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right;white-space:nowrap">CO₂ (t) ${tips.cf}</div>
      <div style="grid-column:14;grid-row:2;padding:8px 12px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right">EUAs (tCO₂e) ${tips.eua}</div>
      <div style="grid-column:15;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">Cov.</div>
      <div style="grid-column:16;grid-row:2;padding:8px 12px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">UKAs (tCO₂e) ${tips.uka}</div>
    </div>`;

  let zi=0;
  const body = R.rowDetails.map((d,i)=>{
    const row = src[i];
    const isBerth = d.kind!=="voyage";
    const span = Math.max(1, d.fuels.length);
    const bg = (zi++ % 2 === 1) ? "#fafcfd" : "#ffffff";
    const ports = legPorts(d, row);
    const portHtml = ports.map((p,pi)=>{
      const j = (isBerth && p.juris) ? JURIS_PAL[p.juris] : null;
      const badge = j ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;border-radius:4px;font-size:9.5px;font-weight:700;letter-spacing:0.03em;vertical-align:1px;background:${j.bg};color:${j.fg}">${p.juris}</span>` : "";
      const arrow = pi < ports.length-1 ? `<span style="color:#94a3b8;margin:0 6px">→</span>` : "";
      return esc(p.label)+badge+arrow;
    }).join("");
    const cargo = isBerth && (!row || row.poc!==false);
    const cargoIcon = cargo ? `<span title="Port of call (cargo activity)" style="cursor:help;font-size:13px;line-height:1.35;flex:none">📦</span>` : "";
    const legTag = isBerth ? "@BERTH" : "VOYAGE";
    const fromS = esc(fmtTs(d.tStart))||"…", toS = esc(fmtTs(d.tEnd))||"…";
    const dist = d.kind==="voyage" ? brNum(d.dist) : brDash;
    const covEU = d.covEU, covUK = d.covUK;

    const fuelCells = d.fuels.map((fu,fi)=>{
      const fb = FUEL_BY_ID[fu.id]||{};
      const bb = fi===d.fuels.length-1 ? "transparent" : "#eef2f5";
      const rr = fi+1;
      const energy = (fb.lcv && fu.eligibleEU) ? fu.eligibleEU*fb.lcv : 0;   // 10⁶ MJ = t × LCV(MJ/g)
      return `
        <div style="grid-column:3;grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};font-weight:600;color:#334155;white-space:nowrap">${esc(cleanFuelName(fb.id?fb:{id:fu.id,name:fu.name}))}</div>
        <div style="grid-column:4;grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};text-align:right;font-variant-numeric:tabular-nums">${fmtF(fu.tonnes,2)}</div>
        <div style="grid-column:5;grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};text-align:right;font-variant-numeric:tabular-nums;color:#64748b;border-right:1px solid #e2e8f0">${fb.lcv!=null?fmtF(fb.lcv,4):brDash}</div>
        <div style="grid-column:7;grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};text-align:right;font-variant-numeric:tabular-nums">${brNum(fu.eligibleEU)}</div>
        <div style="grid-column:8;grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};text-align:right;font-variant-numeric:tabular-nums">${brNum(energy)}</div>`;
    }).join("");

    const cbColor = covEU>0 ? ((d.feuCB??0)<0 ? "#b91c1c" : "#15803d") : "#94a3b8";
    return `
      <div style="display:grid;grid-template-columns:${BR_GRID};background:${bg};border-bottom:1px solid #e2e8f0">
        <div style="grid-column:1;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <span style="flex:1 1 auto;min-width:0;font-weight:600;color:#0f172a;line-height:1.5;overflow-wrap:anywhere">${isBerth?"⚓":"⛴"} ${portHtml}</span>
            ${cargoIcon}
          </div>
          <div style="display:flex;flex-wrap:wrap;column-gap:8px;font-size:0.85em;color:#64748b;margin-top:4px;line-height:1.5"><span style="white-space:nowrap">${fromS} <span style="color:#94a3b8">→</span></span><span style="white-space:nowrap">${toS}</span><span style="margin-left:auto;align-self:flex-end;font-size:8.5px;font-weight:700;letter-spacing:0.07em;color:#94a3b8">${legTag}</span></div>
        </div>
        <div style="grid-column:2;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;color:#475569">${dist}</div>
        ${fuelCells}
        <div style="grid-column:6;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;color:#475569">${brPct(covEU)}</div>
        <div style="grid-column:9;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums">${covEU>0?fmtF(d.E/1e6,2):brDash}</div>
        <div style="grid-column:10;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${cbColor}">${(covEU>0&&d.feuCB!=null)?fmtF(d.feuCB/1e6,2):brDash}</div>
        <div style="grid-column:11;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#9a3412">${d.feuPenalty?fmtF(d.feuPenalty,2):brDash}</div>
        <div style="grid-column:12;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;color:#475569">${brPct(covEU)}</div>
        <div style="grid-column:13;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums">${brNum(d.co2)}</div>
        <div style="grid-column:14;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#3652a3">${covEU>0?fmtF(d.euas,2):brDash}</div>
        <div style="grid-column:15;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;color:#475569">${brPct(covUK)}</div>
        <div style="grid-column:16;grid-row:1 / span ${span};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#6d4fa3">${covUK>0?fmtF(d.ukCO2e,2):brDash}</div>
      </div>`;
  }).join("");

  const empty = !R.rowDetails.length ? `<div style="padding:22px;text-align:center;color:#64748b">No activity rows for ${R.year}.</div>` : "";

  // Totals
  const sum = k => R.rowDetails.reduce((a,d)=>a+(Number(d[k])||0),0);
  const sumF = k => R.rowDetails.reduce((a,d)=>a+d.fuels.reduce((b,fu)=>b+(Number(fu[k])||0),0),0);
  const sumEnergy = R.rowDetails.reduce((a,d)=>a+d.fuels.reduce((b,fu)=>{const fb=FUEL_BY_ID[fu.id]||{};return b+((fb.lcv&&fu.eligibleEU)?fu.eligibleEU*fb.lcv:0);},0),0);
  const totals = R.rowDetails.length ? `
    <div style="display:grid;grid-template-columns:${BR_GRID};background:#f8fafc;border-top:1px solid #cbd5e1">
      <div style="grid-column:1;padding:${cellPad};border-right:1px solid #e2e8f0;font-weight:700;color:#0f172a">Totals — ${R.year}</div>
      <div style="grid-column:2;padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sum("dist"),2)}</div>
      <div style="grid-column:4;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sumF("tonnes"),2)}</div>
      <div style="grid-column:5;padding:${cellPad};text-align:right;border-right:1px solid #e2e8f0">${brDash}</div>
      <div style="grid-column:6;padding:${cellPad};text-align:right">${brDash}</div>
      <div style="grid-column:7;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sumF("eligibleEU"),2)}</div>
      <div style="grid-column:8;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sumEnergy,2)}</div>
      <div style="grid-column:9;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sum("E")/1e6,2)}</div>
      <div style="grid-column:10;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#b91c1c">${fmtF(sum("feuCB")/1e6,2)}</div>
      <div style="grid-column:11;padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#9a3412">${fmtF(sum("feuPenalty"),2)}</div>
      <div style="grid-column:12;padding:${cellPad};text-align:right">${brDash}</div>
      <div style="grid-column:13;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${fmtF(sum("co2"),2)}</div>
      <div style="grid-column:14;padding:${cellPad};border-right:1px solid #e2e8f0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#3652a3">${fmtF(sum("euas"),2)}</div>
      <div style="grid-column:15;padding:${cellPad};text-align:right">${brDash}</div>
      <div style="grid-column:16;padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#6d4fa3">${fmtF(sum("ukCO2e"),2)}</div>
    </div>` : "";

  return `<div style="font-size:12.5px;overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px">${header}${body}${empty}${totals}</div>
    <div style="padding:10px 2px 0;font-size:11.5px;color:#64748b;display:flex;gap:18px;flex-wrap:wrap">
      <span>All figures rounded to 2 decimal places (LCV: 4).</span>
      <span>— indicates no obligation (out of scope or OMR derogation until 2030).</span>
      <span>CB = FuelEU compliance balance; negative values are deficits.</span>
      <span>📦 = port of call (cargo activity).</span>
      <span>OMR = outermost region.</span>
    </div>`;
}

function renderCalcs(){
  const el=document.getElementById("tab-calcs"); if(!el) return;
  const R=computeAll(S);
  const f=R.fueleu, e=R.ets, u=R.ukets;
  const iCf=info("<b>CO₂ conversion factors (Cf, tCO₂/t fuel)</b> per FuelEU Annex II / MEPC.308(73): HFO 3.114 · LFO 3.151 · MDO/MGO 3.206 · LNG 2.750 · LPG(P) 3.000 · LPG(B) 3.030 · methanol 1.375. CII uses Cf only (CO₂); optional per-line Circ.905 override applies to CII.");
  const iEUA=info("<b>EUA</b> = covered emissions × phase-in ("+(e.phase*100)+"% for "+R.year+", euets-art3gb). Basis "+esc(e.basisLabel)+(R.year>=2026?" with CH₄/N₂O at GWP "+e.gwp.ch4+"/"+e.gwp.n2o+" ("+esc(e.gwp.label)+", selectable in Settings — FILL-IN)":"")+". Coverage: EEA↔EEA & at-berth-EEA 100%, EEA↔other 50% (euets-art3ga); at-berth scope only for port-of-call stays.");
  const iUKA=info("<b>UKA</b> = tCO₂e for UK-scope activity (UK→UK voyages + UK in-port, ukets-sch2a-p7) with GWP CH₄ 28 / N₂O 265 (ukets-sch2a-p35, prescribed). Obligation applies from scheme year 2026.");
  const iFEU=info("<b>FuelEU</b> per fueleu-annexi with GWP 25/298 (prescribed) and CH₄ slip per consumer class. Scope like EU ETS coverage. The annual balance/penalty is shared out by each row's in-scope energy — <b>indicative only</b>, FuelEU is period-based in law. Allocation method: "+(f.allocMethod==="optimal"?"optimal (cleanest-first, essf-ws1-2-5)":"proportional (comparison)")+".");
  const iLCV=info("<b>LCV</b> (lower calorific value, MJ/g) per FuelEU Annex II column 1: HFO 0.0405 · LFO 0.041 · MDO/MGO 0.0427 · LNG 0.0491 · methanol 0.0199 — full list on the Formulas tab. Eligible energy = eligible mass × 10⁶ × LCV.");
  const brInner=breakdownGrid(R,{lcv:iLCV,cf:iCf,eua:iEUA,uka:iUKA,feu:iFEU});
  const reps=S.mdaReports||[];
  const repRows=reps.map(r=>`<tr>
      <td class="note">${esc((r.t||"").replace("T"," "))}</td>
      <td><b>${esc(reportTypeLabel(r))}</b>${r.role?'':''}</td>
      <td class="note">${esc(r.oc||"—")}</td>
      <td class="note">${esc(r.aa||"—")}${r.opl?' <span class="flag" title="OUTSIDE_PORT_LIMIT = TRUE">OPL</span>':""}</td>
      <td class="num">${r.qty?fmt(r.qty):"—"}</td>
      <td>${esc(r.portN||r.cur||"—")}${(r.ctry||r.regn)?`<div class="note">${esc([r.ctry,r.regn].filter(Boolean).join(" · "))}</div>`:""}</td>
      <td class="note">${fmtDict(r.fuels)||"—"}${r.mach?`<div class="note" style="color:#8a97a1">ME ${fmtDict(r.mach.ME)||"0"} · AE ${fmtDict(r.mach.AE)||"0"} · BLR ${fmtDict(r.mach.BLR)||"0"} · OTH ${fmtDict(r.mach.OTH)||"0"}</div>`:""}${r.bunker?`<div class="note">bunkered: ${esc(r.bunker)}</div>`:""}</td>
      <td class="note">${fmtDict(r.rob)||"—"}</td>
      <td class="num">${r.dist?fmt(r.dist):"—"}</td>
    </tr>`).join("");
  el.innerHTML=`
  <div class="card">
    <h2>Voyage &amp; berth breakdown — ${R.year}
      <button class="pill hbtn noprint" style="float:right" onclick="downloadBreakdownXlsx()">⬇ Excel</button></h2>
    ${brInner}
    <p class="note" style="margin-top:10px"><span class="flag">*Indicative attribution — not legally exact</span> FuelEU (and ETS surrender) are period-based in law; per-row balance/penalty is the annual result shared by in-scope energy. Rows outside the ${R.year} reporting year are excluded (see Workspace badges).</p>
  </div>

  <div class="card">
    <h2>FuelEU allocation working — ${R.year}</h2>
    <div class="kv"><span>Method</span><b>${f.allocMethod==="optimal"?"Optimal — cleanest-first (essf-ws1-2-5)":"Proportional (comparison)"} — switch on the Workspace FuelEU card</b></div>
    <div class="kv"><span>Energy scope (fuel + OPS) / MRV pool</span><b>${fmt(f.E_total/1e6)} / ${fmt(f.E_pool/1e6)} ×10⁶ MJ</b></div>
    <div class="kv"><span>GHGIE attained vs target</span><b>${fmtF(f.ghgie,5)} vs ${fmtF(f.target,5)} gCO₂eq/MJ</b></div>
    ${f.ghgieAlt!=null?`<div class="kv"><span>${f.allocMethod==="optimal"?"Proportional":"Optimal"} method (comparison)</span><b>${fmtF(f.ghgieAlt,5)} g/MJ · CB ${fmt((f.cbAlt??0)/1e6,0)} t</b></div>`:""}
    ${f.terms&&f.terms.length?`<table class="scctable"><tr><th>Fuel × consumer</th><th class="num">Pool t</th><th class="num">Pool ×10⁶ MJ</th><th class="num">Allocated t</th><th class="num">Allocated ×10⁶ MJ</th><th class="num">WtT g/MJ</th><th class="num">TtW g/MJ (incl. slip)</th><th class="num">WtW g/MJ</th><th class="num">RWD</th></tr>
      ${f.terms.map(t=>`<tr${t.E<=0?' style="color:#999"':''}><td>${esc(t.name)}${t.m?` <span class="note">· ${t.m==="BLR"?"Boiler":t.m==="OTH"?"Other":esc(t.m)}${(t.m==="ME"||t.m==="AE")?" — "+esc(t.engine):""}</span>`:""}</td>
        <td class="num">${fmt(t.tonnesPool)}</td><td class="num">${fmtF(t.E_pool/1e6,3)}</td><td class="num">${fmt(t.tonnes)}</td><td class="num">${fmtF(t.E/1e6,3)}</td>
        <td class="num">${fmtF(t.wtt,2)}</td><td class="num">${fmtF(t.ttw,2)}</td><td class="num">${fmtF(t.wtt+t.ttw,2)}</td><td class="num">${t.rwd}</td></tr>`).join("")}</table>
    <p class="note">Pool = all MRV-monitored fuel (incl. the uncovered half of 50% voyages), per fuel × consumer class. Optimal fills the scope cleanest-first by effective intensity (WtW ÷ RWD); grey rows stay unallocated. GHGIE = Σ allocated·WtW ÷ (Σ allocated·RWD + OPS)${f.fwind<1?" × f<sub>wind</sub> "+f.fwind:""}.</p>`:'<p class="note">No FuelEU-scope activity yet.</p>'}
  </div>

  <div class="card">
    <h2>EU ETS working — ${R.year}</h2>
    <div class="kv"><span>Covered CO₂ / CO₂e</span><b>${fmt(e.covered_t_co2)} / ${fmt(e.covered_t_co2e)} t</b></div>
    <div class="kv"><span>Basis (${esc(e.basisLabel)})</span><b>${fmt(e.basis_t)} t</b></div>
    <div class="kv"><span>Phase-in (euets-art3gb)</span><b>${e.phase*100}%</b></div>
    ${R.year>=2026?`<div class="kv"><span>CH₄/N₂O GWP set</span><b>${esc(e.gwp.label)} <span class="flag" title="${esc(e.gwp.src)}">FILL-IN</span></b></div>`:""}
    <div class="kv"><span><b>EUAs to surrender</b> = basis × phase-in</span><b>${fmt(e.euas)}</b></div>
    <div class="kv"><span>Cost @ €${fmt(S.euaPrice)}</span><b>€ ${fmt(e.cost,0)}</b></div>
    <p class="note">Per-fuel: covered mass = tonnes × coverage; CO₂e adds CH₄ &amp; N₂O (incl. LNG slip as CH₄) from 2026. Zero-rating of certified bio/RFNBO ${S.bioZeroRatedETS?"ON":"OFF"} (Settings).</p>
  </div>

  <div class="card">
    <h2>Report-level trace (MDA granularity)
      <button class="pill hbtn noprint" style="float:right" onclick="downloadReportsXlsx()">⬇ OVD-format Excel</button></h2>
    ${reps.length?`
    <p class="note">${reps.length} report(s), as ingested — every value feeding CII / EU ETS / UK ETS / FuelEU. <b>ARRIVAL</b>/<b>DEPARTURE</b> mark the derived window boundaries (replacing IN_PORT); EOSP/SOSP are the sea-passage markers.</p>
    <table class="vbtable">
      <tr><th>Report end (GMT)</th><th>Type</th><th>Operating condition</th><th>Associated activity</th><th class="num">Cargo t</th><th>Port</th><th>Consumption t (ME·AE·BLR·OTH)</th><th>ROB t</th><th class="num">Dist nm</th></tr>
      ${repRows}
    </table>`
    :`<p class="note">No report-level data in this workspace. Import an MDA event-log export (.xlsx or .csv) — the raw reports are retained at import (since 2026-07-16). Manually entered rows and DNV-OVD/THETIS imports appear only in the voyage &amp; berth breakdown above.</p>`}
  </div>`;
}

/* ---------- VESSEL & SETTINGS TAB ---------- */
function renderVessel(){
  const el = document.getElementById("tab-vessel");
  const type = TYPE_BY_ID[S.ship.typeId]||SHIP_TYPES[0];
  el.innerHTML = `
  <div class="grid">
    <div class="card">
      <h2>Vessel particulars</h2>
      <div class="inline"><div><label>Vessel name</label><input value="${esc(S.ship.name||"")}" onchange="upd('ship.name',this.value)"></div>
      <div><label>IMO number</label><input value="${esc(S.ship.imo||"")}" onchange="upd('ship.imo',this.value)"></div>
      <div><label>Reporting year</label><select onchange="upd('year',Number(this.value));renderVessel()">${[2024,2025,2026,2027,2028,2029,2030].map(y=>`<option ${y===S.year?"selected":""}>${y}</option>`).join("")}</select></div></div>
      <div class="inline">
        <div><label>Ship type (CII G2)</label><select onchange="upd('ship.typeId',this.value);renderVessel()">${SHIP_TYPES.map(t=>`<option value="${t.id}" ${t.id===S.ship.typeId?"selected":""}>${t.name}</option>`).join("")}</select></div>
        <div><label>Capacity (${type.capUnit})</label><input type="number" step="any" min="0" value="${S.ship.capacity??""}" oninput="upd('ship.capacity',num(this.value))"></div>
      </div>
      <div class="inline">
        <div><label>Main-engine consumer class (LNG slip) ${info("Drives the CH₄-slip class for the <b>main-engine share</b> of LNG-family fuels whenever a machinery split is present (MDA imports / the ⚙ Machinery split editor), and remains the default for bio-LNG / e-LNG lines without a picked consumer. Fossil LNG lines without a split keep the engine cycle chosen in the fuel name itself.")}</label><select onchange="upd('lngEngineDefault',this.value)">${engineOptions(S.lngEngineDefault)}</select></div>
        <div><label>Auxiliary-engine consumer class (LNG slip) ${info("Drives the CH₄-slip class for the <b>auxiliary-engine share</b> of LNG-family fuels whenever a machinery split is present. Boiler and 'Other' shares are slip-free — Annex II slip factors apply to engines only (agreed 2026-07-16).")}</label><select onchange="upd('lngEngineDefaultAux',this.value)">${engineOptions(S.lngEngineDefaultAux||S.lngEngineDefault)}</select></div>
      </div>
      <div class="inline">
        <div><label>Wind-assist P<sub>Wind</sub>/P<sub>Prop</sub></label><input type="number" step="0.01" min="0" max="1" value="${S.windRatio??0}" oninput="upd('windRatio',num(this.value))" title="0.05→fwind 0.99 · 0.10→0.97 · ≥0.15→0.95 (fueleu-annexi)"></div>
        <div></div>
      </div>
      <div class="inline">
        <div><label>OPS electricity (MJ, FuelEU) ${info("Onshore power supply electricity delivered, in MJ, counted in the FuelEU energy denominator (Annex I). Auto-filled by OVD import (kWh × 3.6) and THETIS XML import (MWh × 3,600).")}</label><input type="number" step="any" min="0" value="${S.opsMJ??0}" oninput="upd('opsMJ',num(this.value))"></div>
        <div><label>Distance through ice (nm) ${info("Annual distance travelled through ice — reporting only; no correction factor is applied in this version (G5 corrections are a known simplification).")}</label><input type="number" step="any" min="0" value="${S.distIce??0}" oninput="upd('distIce',num(this.value))"></div>
      </div>
    </div>
    <div class="card">
      <h2>Market &amp; compliance settings</h2>
      <div class="inline">
        <div><label>EUA price € / tCO₂e</label><input type="number" step="any" min="0" value="${S.euaPrice??0}" oninput="upd('euaPrice',num(this.value))"></div>
        <div><label>UKA price £(€) / tCO₂e</label><input type="number" step="any" min="0" value="${S.ukaPrice??0}" oninput="upd('ukaPrice',num(this.value))"></div>
      </div>
      <h3>GWP basis (AR4 / AR5) ${info("<b>Which calculations does this switch?</b> Only the EU ETS 2026+ CO₂e conversion of CH₄ and N₂O — the amended EU MRV GWP values are not yet in the knowledge base, so either set is a flagged FILL-IN proxy.<br><br><b>Locked by regulation (NOT affected):</b><br>· FuelEU Maritime — GWP 25/298 (AR4-era values prescribed via RED II Annex V; chunk fueleu-annexi, verbatim)<br>· UK ETS — GWP 28/265 (AR5 values prescribed in Schedule 2A Table C1; chunk ukets-sch2a-p35, verbatim)<br>· IMO CII — CO₂ only, no GWP applies.<br><br>A free AR4/AR5 choice on those three would produce non-compliant numbers, so it is deliberately not offered.")}</h3>
      <div class="inline">
        <div><label>EU ETS CO₂e GWP set (2026+) <span class="flag" title="Amended EU MRV GWP values not in KB — either set is a proxy. VERIFY.">FILL-IN</span></label>
          <select onchange="upd('arSet',this.value);renderVessel()">
            <option value="AR5" ${S.arSet!=="AR4"?"selected":""}>AR5 — CH₄ 28 · N₂O 265 (default)</option>
            <option value="AR4" ${S.arSet==="AR4"?"selected":""}>AR4 — CH₄ 25 · N₂O 298</option>
          </select></div>
        <div><label>Prescribed (read-only)</label><div class="note" style="padding-top:6px">FuelEU 25/298 <span class="ok">fueleu-annexi</span> · UK ETS 28/265 <span class="ok">ukets-sch2a-p35</span> · CII CO₂-only</div></div>
      </div>
      <div class="chk"><input type="checkbox" ${S.bioZeroRatedETS?"checked":""} onchange="upd('bioZeroRatedETS',this.checked)"> Zero-rate certified biofuels / RFNBO in EU ETS <span class="flag" title="Assumes RED II-compliant certification; MRR sustainability rules — simplification">FILL-IN</span></div>
      <h3>FuelEU flexibility (Art 20 / 21 / 23)</h3>
      <div class="inline">
        <div><label>Banked surplus brought in (tCO₂eq)</label><input type="number" step="any" value="${S.fueleuBankedIn??0}" oninput="upd('fueleuBankedIn',num(this.value))"></div>
        <div><label>Pool partner balance (tCO₂eq, +/−)</label><input type="number" step="any" value="${S.poolPartnerCB??0}" oninput="upd('poolPartnerCB',num(this.value))"></div>
      </div>
      <div class="inline">
        <div class="chk" style="margin-top:20px"><input type="checkbox" ${S.fueleuBorrow?"checked":""} onchange="upd('fueleuBorrow',this.checked)"> Borrow advance surplus (max 2%, ×1.1 payback)</div>
        <div><label>Consecutive deficit periods n</label><input type="number" min="1" step="1" value="${S.deficitPeriods??1}" oninput="upd('deficitPeriods',num(this.value))" title="Penalty × (1+(n−1)/10) — fueleu-art23"></div>
      </div>
      <h3>SCC required intensity (from current SCC trajectory tables — user input)</h3>
      <div class="inline">
        <div><label>'Minimum' gCO₂e/t·nm</label><input type="number" step="any" value="${S.sccReqMin??""}" oninput="upd('sccReqMin',num(this.value))"></div>
        <div><label>'Striving' gCO₂e/t·nm</label><input type="number" step="any" value="${S.sccReqStriving??""}" oninput="upd('sccReqStriving',num(this.value))"></div>
      </div>
      <h3>Breakeven substitute fuel</h3>
      <div class="inline">
        <div><label>Substitute fuel</label><select onchange="upd('breakevenFuelId',this.value);renderVessel()">${fuelOptions(S.breakevenFuelId)}</select></div>
        <div><label>€ / tonne</label><input type="number" step="any" min="0" value="${S.breakevenPrice??0}" oninput="upd('breakevenPrice',num(this.value))"></div>
      </div>
      <div class="inline">
        ${FUEL_BY_ID[S.breakevenFuelId]?.bio?`<div><label>E value gCO₂eq/MJ</label><input type="number" step="any" value="${S.breakevenE??""}" placeholder="${FUEL_BY_ID[S.breakevenFuelId].eDefault??"certified"}" oninput="upd('breakevenE',num(this.value))"></div>`:""}
        ${FUEL_BY_ID[S.breakevenFuelId]?.rfnbo?`<div><label>WtT gCO₂eq/MJ (cert)</label><input type="number" step="any" value="${S.breakevenWtt??""}" oninput="upd('breakevenWtt',num(this.value))"></div>`:""}
        ${(FUEL_BY_ID[S.breakevenFuelId]?.slip && !FUEL_BY_ID[S.breakevenFuelId]?.engineClass)?`<div><label>Fuel consumer</label><select onchange="upd('breakevenEngine',this.value)">${engineOptions(S.breakevenEngine||S.lngEngineDefault)}</select></div>`:""}
        <div></div>
      </div>
    </div>
  </div>`;
}

/* ---------- FORMULAS / CONSTANTS / PROVENANCE TAB ---------- */
function renderConstants(){
  const el = document.getElementById("tab-constants");
  el.innerHTML = `
  <div class="card">
    <h2>Formulas implemented (with regulatory references)</h2>

    <h3>IMO CII</h3>
    <div class="formula">attained CII = M / W                      M = Σⱼ FCⱼ × CFⱼ   [gCO₂]      W = Capacity × Dt   [Capacity·nm]</div>
    <p class="note">MEPC.352(78) G1 §4, Eq. (1)–(3) — chunk <b>imo-g1-s4</b>. Capacity = DWT or GT per ship type; Dt = annual distance; CFⱼ per MEPC.308(73)/Annex II values.</p>
    <div class="formula">CII_ref = a · Capacity⁻ᶜ</div>
    <p class="note">MEPC.353(78) G2 §3.2 Eq. (1), a/c per Table 1 — chunk <b>imo-g2-s4</b>.</p>
    <div class="formula">required CII = (1 − Z/100) · CII_ref</div>
    <p class="note">MARPOL Annex VI reg 28.4 — chunk <b>imo-a6-reg28</b>. Numeric Z values <span class="flag">FILL-IN</span> (2023–26: 5/7/9/11% per MEPC.338(76); 2027–30: 13.625/16.25/18.875/21.5% per MEPC 83 — neither in KB).</p>
    <div class="formula">superior = exp(d1)·required   lower = exp(d2)·required   upper = exp(d3)·required   inferior = exp(d4)·required
rating: attained ≤ superior → A · ≤ lower → B · ≤ upper → C · ≤ inferior → D · else → E</div>
    <p class="note">MEPC.354(78) G4 §4.6 Eq. (3), exp(d) per Table 1 — chunk <b>imo-g4-s4</b>. Worked example: required 10 → 8.6/9.4/10.6/11.8, attained 9 → "B".</p>

    <h3>EU ETS (maritime)</h3>
    <div class="formula">covered emissions = Σ_legs coverage × Σ_fuels M × EF        coverage: EEA→EEA &amp; at berth EEA = 100% · EEA↔other = 50%
EUAs = covered × phase-in                                    phase-in: 2024 = 40% · 2025 = 70% · 2026+ = 100%</div>
    <p class="note">Scope: Directive 2003/87/EC Art 3ga — chunk <b>euets-art3ga</b>. Phase-in: Art 3gb — chunk <b>euets-art3gb</b>. EF values per Regulation (EU) 2015/757 (= Annex II Cf values) — chunks <b>mrv-annexi/ii</b>, <b>fueleu-annexii</b>. From 2026 CH₄+N₂O included: CO₂e computed with the ME<sub>ETS</sub> structure below using GWP ${euetsGwp(S).ch4}/${euetsGwp(S).n2o} (${euetsGwp(S).label}, user-selected — Settings) <span class="flag">FILL-IN — amended MRV GWPs not in KB</span>.</p>

    <h3>UK ETS (maritime, from 2026)</h3>
    <div class="formula">ME_ETS = CO₂_ETS + CH₄_ETS × GWP_CH4 + N₂O_ETS × GWP_N2O          GWP_CH4 = 28 · GWP_N2O = 265
CO₂_ETS = Σᵢ (Mᵢ − Mᵢ,NC) × EF_CO2,i
CH₄_ETS = Σᵢ (Mᵢ − Mᵢ,NC) × EF_CH4,i + CH4_S          CH4_S = Mᵢ,NC
N₂O_ETS = Σᵢ (Mᵢ − Mᵢ,NC) × EF_N2O,i                  Mᵢ,NC = Σᵢ Σⱼ Mᵢ,ⱼ × Cⱼ/100  (slipped fuel)</div>
    <p class="note">UK ETS Order Schedule 2A para 35 + Table C1 — chunk <b>ukets-sch2a-p35</b> (verbatim). EF and Cⱼ values per Table C2 — chunk <b>ukets-sch2a-p36</b>. Scope: UK→UK voyages + UK in-port, ships ≥5,000 GT — chunks <b>ukets-sch2a-p2/p7</b>.</p>

    <h3>FuelEU Maritime</h3>
    <div class="formula">GHG intensity [gCO₂eq/MJ] = f_wind × (WtT + TtW)                                       (Annex I Eq. 1)
WtT  = [Σᵢ Mᵢ·CO2eq_WtT,i·LCVᵢ + Σₖ Eₖ·CO2eq_elec,k] / [Σᵢ Mᵢ·LCVᵢ·RWDᵢ + Σₖ Eₖ]      (elec numerator term = 0)
TtW  = Σᵢⱼ Mᵢ,ⱼ·[(1−Cslipⱼ/100)·CO2eq_TtW,i,j + (Cslipⱼ/100)·CO2eq_TtWslip,i,j] / [same denominator]
CO2eq_TtW,i,j    = Cf_CO2·GWP_CO2 + Cf_CH4·GWP_CH4 + Cf_N2O·GWP_N2O                    (Annex I Eq. 2)
CO2eq_TtWslip,i,j: Csf_CO2 = 0 · Csf_N2O = 0 · Csf_CH4 = 1  →  slip term = GWP_CH4 per g slipped
GWP: CO₂ 1 · CH₄ 25 · N₂O 298 (Directive 2018/2001 Annex V C(4))
RWDᵢ = 2 for RFNBO 2025–2033, else 1 · f_wind = 0.99 / 0.97 / 0.95 by P_Wind/P_Prop</div>
    <p class="note">Regulation (EU) 2023/1805 Annex I — chunk <b>fueleu-annexi</b> (verbatim). Default LCV/WtT/Cf/Cslip values: Annex II — chunk <b>fueleu-annexii</b>. Biofuel WtT = E − Cf_CO2/LCV (Annex II col. 4(a)); RFNBO WtT from certificate (col. 4(b)).</p>
    <div class="formula">target = 91.16 × (1 − r)      r: 2% (2025) · 6% (2030) · 14.5% (2035) · 31% (2040) · 62% (2045) · 80% (2050)</div>
    <p class="note">Art 4(2) — chunk <b>fueleu-art4</b>.</p>
    <div class="formula">Compliance balance [gCO₂eq] = (GHGIE_target − GHGIE_actual) × [Σᵢ Mᵢ·LCVᵢ + Σₖ Eₖ]     (Annex IV A — no RWD here)
FuelEU penalty [EUR] = |CB| / (GHGIE_actual × 41 000) × 2 400 × (1 + (n−1)/10)</div>
    <p class="note">Annex IV — chunk <b>fueleu-annexiv</b>; consecutive-deficit multiplier Art 23(2) — chunk <b>fueleu-art23</b>. Rounding: intermediates unrounded, final penalty to nearest EUR — chunk <b>essf-ws1-1-3-5</b>.</p>
    <div class="formula">banking: surplus → next period (Art 20(1))
borrowing: advance ≤ 2% × target × energy; ×1.1 subtracted next period; not 2 periods in a row (Art 20(2))
pooling: Σ pool balances ≥ 0 ⇒ no penalty for the pool (Art 21)</div>
    <p class="note">Chunks <b>fueleu-art20</b>, <b>fueleu-art21</b>.</p>

    <h3>SCC / Sea Cargo Charter</h3>
    <div class="formula">voyage intensity = CO₂e / (cargo × distance)   [g/t·nm]
category / annual alignment Δ = (weighted intensity − required r) / r × 100%     (Eq. 4 / Eq. 5)</div>
    <p class="note">SCC Technical Guidance 2025 §2.5 — chunk <b>scc-2-5</b>; trajectory definition §2.4 / Appendix 4 — chunks <b>scc-2-4</b>, <b>scc-appendix-4</b>. Annual required-intensity tables are published by the SCC secretariat and are user inputs here.</p>

    <h3>Breakeven blend (EmA KPI — derived, not a regulatory formula)</h3>
    <div class="formula">find x ∈ [0,1]:  GHGIE(mix with x of in-scope energy replaced by substitute) = target   (bisection, 80 iters)
substitute tonnes = x × E_total / LCV_sub · net P&amp;L = extra fuel cost − penalty avoided</div>
    <p class="note">Exact solve on the Annex I formula incl. RWD and slip; proportional displacement of the existing mix.</p>
  </div>

  <div class="card">
    <h2>Fuel factor library — FuelEU Annex II (chunk <i>fueleu-annexii</i>) / UK ETS Table C2 (chunk <i>ukets-sch2a-p36</i>)</h2>
    <p class="note">All derived columns are computed live from the base Annex II constants (LCV, Cf's, slip) — scroll horizontally for the full set.
    <b>Factor (t/t)</b> = tonnes CO₂eq per tonne of fuel · <b>Intensity (gCO₂eq/MJ)</b> = factor ÷ LCV.
    TtW includes methane slip: (1−s)·(Cf<sub>CO₂</sub> + GWP<sub>CH₄</sub>·Cf<sub>CH₄</sub> + GWP<sub>N₂O</sub>·Cf<sub>N₂O</sub>) + s·GWP<sub>CH₄</sub>.
    <b>AR4</b> = GWP 25/298 (FuelEU / RED II basis) · <b>AR5</b> = GWP 28/265 (UK ETS Table C1 basis). WtW = WtT + TtW.</p>
    <div class="tablewrap"><table><tr>
      <th>Fuel</th><th>Class</th><th class="num">LCV (MJ/g)</th><th class="num">Slip %</th>
      <th class="num">Cf CO₂ (t/t)</th><th class="num">Cf CH₄ (t/t)</th><th class="num">Cf N₂O (t/t)</th>
      <th class="num">TtW Factor AR4 (t/t)</th><th class="num">TtW Factor AR5 (t/t)</th>
      <th class="num">TtW Intensity AR4 (gCO₂eq/MJ)</th><th class="num">TtW Intensity AR5 (gCO₂eq/MJ)</th>
      <th class="num">WtT Factor (t/t)</th><th class="num">WtT Intensity (gCO₂eq/MJ)</th>
      <th class="num">WtW Factor AR4 (t/t)</th><th class="num">WtW Factor AR5 (t/t)</th>
      <th class="num">WtW Intensity AR4 (gCO₂eq/MJ)</th><th class="num">WtW Intensity AR5 (gCO₂eq/MJ)</th>
    </tr>
    ${FUELS.filter(f=>!f.custom).map(f=>{
      const AR4={ch4:25,n2o:298}, AR5={ch4:28,n2o:265};
      const cls = f.engineClass || S.lngEngineDefault || "LNG Otto (dual fuel medium speed)";
      const s = (f.slip? (SLIP[cls]??0) : 0)/100;
      const ttwF = g => (1-s)*(f.cf + g.ch4*f.ch4 + g.n2o*f.n2o) + s*g.ch4;
      const ttw4=ttwF(AR4), ttw5=ttwF(AR5);
      const wttI = f.bio ? (f.eDefault!=null ? f.eDefault - f.cf/f.lcv : null) : (f.rfnbo ? null : f.wtt);
      const wttF = wttI!=null ? wttI*f.lcv : null;
      const n=(x,d)=> x==null? "—" : Number(x).toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d});
      const wttCell = wttI!=null? n(wttI,2) : (f.bio? "E − Cf/LCV (col.4a)" : "certificate (col.4b)");
      const wttFCell= wttF!=null? n(wttF,4) : "—";
      const wtw = (t,w)=> w!=null? n(t+w,4) : "—";
      const wtwI= (t,w)=> w!=null? n(t/f.lcv+w,2) : "—";
      const slipNote = f.slip && !f.engineClass ? ' <span class="note" title="bio-/e-LNG: slip follows the consumer selected on the row; shown here for the current default class">*</span>' : "";
      return `<tr><td>${esc(f.name)}${(f.lcvNote&&f.lcvNote.indexOf("FILL-IN")===0)?' <span class="flag" title="'+esc(f.lcvNote)+'">LCV FILL-IN</span>':""}${f.eNote?' <span class="flag" title="'+esc(f.eNote)+'">E illustrative</span>':""}</td><td>${f.cls}</td>
      <td class="num">${n(f.lcv,4)}</td><td class="num">${f.slip? n(s*100,1)+slipNote : "—"}</td>
      <td class="num">${n(f.cf,3)}</td><td class="num">${n(f.ch4,5)}${f.tbm&&f.tbm.includes("ch4")?" †":""}</td><td class="num">${n(f.n2o,5)}${f.tbm&&f.tbm.includes("n2o")?" †":""}</td>
      <td class="num">${n(ttw4,4)}</td><td class="num">${n(ttw5,4)}</td>
      <td class="num">${n(ttw4/f.lcv,2)}</td><td class="num">${n(ttw5/f.lcv,2)}</td>
      <td class="num">${wttFCell}</td><td class="num">${wttCell}</td>
      <td class="num">${wtw(ttw4,wttF)}</td><td class="num">${wtw(ttw5,wttF)}</td>
      <td class="num">${wtwI(ttw4,wttI)}</td><td class="num">${wtwI(ttw5,wttI)}</td></tr>`;}).join("")}
    </table></div>
    <p class="note">† TBM/N-A in the source table — resolved per the Annex II rule: “the highest default value of the fuel class in the same column shall be used” (fossil class: CH₄ 0.00005, N₂O 0.00018).
    * Bio-LNG / e-LNG slip depends on the fuel consumer chosen on each row — the table shows the current default class (${esc(S.lngEngineDefault||"LNG Otto (dual fuel medium speed)")}).
    Fossil LNG rows carry their engine cycle in the fuel itself: slip 0.2% (Low speed diesel) · 1.7% (Low speed Otto) · 3.1% (Medium speed Otto) · 2.6% (LBSI).
    Biofuel WtT uses the illustrative default E where shown — replace with the certified BDN value on the row. FuelEU compliance always uses AR4-basis GWPs (25/298, locked); UK ETS uses AR5-basis (28/265, locked); the AR4/AR5 columns here are for reference and Scope-inventory comparison.</p>
  </div>

  <div class="grid">
    <div class="card"><h2>CII reference-line &amp; rating parameters</h2>
      <table><tr><th>Ship type</th><th>Capacity</th><th class="num">a</th><th class="num">c</th><th class="num">exp(d1..d4)</th></tr>
      <tr><td>Bulk carrier (cap 279k)</td><td>DWT</td><td class="num">4745</td><td class="num">0.622</td><td class="num">0.86/0.94/1.06/1.18</td></tr>
      <tr><td>Gas carrier ≥65k / &lt;65k</td><td>DWT</td><td class="num">14405×10⁷ / 8104</td><td class="num">2.071 / 0.639</td><td class="num">0.81..1.44 / 0.85..1.25</td></tr>
      <tr><td>Tanker</td><td>DWT</td><td class="num">5247</td><td class="num">0.610</td><td class="num">0.82/0.93/1.08/1.28</td></tr>
      <tr><td>Container ship</td><td>DWT</td><td class="num">1984</td><td class="num">0.489</td><td class="num">0.83/0.94/1.07/1.19</td></tr>
      <tr><td>General cargo ≥20k / &lt;20k</td><td>DWT</td><td class="num">31948 / 588</td><td class="num">0.792 / 0.3885</td><td class="num">0.83/0.94/1.06/1.19</td></tr>
      <tr><td>Refrigerated cargo</td><td>DWT</td><td class="num">4600</td><td class="num">0.557</td><td class="num">0.78/0.91/1.07/1.20</td></tr>
      <tr><td>Combination carrier</td><td>DWT</td><td class="num">5119</td><td class="num">0.622</td><td class="num">0.87/0.96/1.06/1.14</td></tr>
      <tr><td>LNG ≥100k / &lt;100k</td><td>DWT</td><td class="num">9.827 / 14479×10¹⁰ <span class="flag" title="KB extraction shows 14779E10 for <65k; official commonly cited 14479×10^10">?</span></td><td class="num">0.0 / 2.673</td><td class="num">0.89..1.13 / 0.78..1.37</td></tr>
      <tr><td>Ro-ro cargo (VC) ≥57.7k(cap)/≥30k/&lt;30k</td><td>GT</td><td class="num">3627 / 3627 / 330</td><td class="num">0.590 / 0.590 / 0.329</td><td class="num">0.86/0.94/1.06/1.16</td></tr>
      <tr><td>Ro-ro cargo</td><td>GT</td><td class="num">1967</td><td class="num">0.485</td><td class="num">0.76/0.89/1.08/1.27</td></tr>
      <tr><td>Ro-ro passenger / HSC</td><td>GT</td><td class="num">2023 / 4196</td><td class="num">0.460</td><td class="num">0.76/0.92/1.14/1.30</td></tr>
      <tr><td>Cruise passenger</td><td>GT</td><td class="num">930</td><td class="num">0.383</td><td class="num">0.87/0.95/1.06/1.16</td></tr></table>
      <p class="note">a/c: MEPC.353(78) Table 1 (chunk imo-g2-s4). exp(d): MEPC.354(78) Table 1 (chunk imo-g4-s4).</p>
    </div>
    <div class="card"><h2>Regulatory scalars &amp; GWPs</h2>
      <div class="kv"><span>FuelEU reference 91.16; reduction schedule 2025→2050</span><b><span class="ok">fueleu-art4</span></b></div>
      <div class="kv"><span>FuelEU penalty €2,400 / tVLSFO-eq (41,000 MJ)</span><b><span class="ok">fueleu-annexiv</span></b></div>
      <div class="kv"><span>Deficit multiplier 1+(n−1)/10</span><b><span class="ok">fueleu-art23</span></b></div>
      <div class="kv"><span>Borrow limit 2%×target×energy · payback ×1.1</span><b><span class="ok">fueleu-art20</span></b></div>
      <div class="kv"><span>RWD ×2 (RFNBO 2025–33) · f<sub>wind</sub> 0.99/0.97/0.95</span><b><span class="ok">fueleu-annexi</span></b></div>
      <div class="kv"><span>EU ETS scope 100%/50% · phase-in 40/70/100%</span><b><span class="ok">euets-art3ga / art3gb</span></b></div>
      <div class="kv"><span>GWP FuelEU: CH₄ 25 · N₂O 298</span><b><span class="ok">fueleu-annexi / RED II</span></b></div>
      <div class="kv"><span>GWP UK ETS: CH₄ 28 · N₂O 265</span><b><span class="ok">ukets-sch2a-p35 Table C1</span></b></div>
      <div class="kv"><span>GWP EU ETS CO₂e from 2026: ${euetsGwp(S).ch4} / ${euetsGwp(S).n2o} (${euetsGwp(S).label} — user-selected in Settings)</span><b><span class="flag">FILL-IN — amended MRV GWPs not in KB</span></b></div>
      <div class="kv"><span>CII Z factors (all years)</span><b><span class="flag">FILL-IN — not in KB</span></b></div>
      <div class="kv"><span>UK ETS: UK→UK + in-port, ≥5,000 GT, from 2026</span><b><span class="ok">ukets-sch2a-p2/p7</span></b></div>
      <div class="kv"><span>OVD field semantics (import)</span><b><span class="ok">ovd-* chunks + DNV sample files</span></b></div>
    </div>
  </div>
  <div class="card"><h2>Source chunks used</h2>
  <p class="note">fueleu-art4 · fueleu-annexi · fueleu-annexii · fueleu-annexiv · fueleu-art20 · fueleu-art21 · fueleu-art23 · euets-art3ga · euets-art3gb · mrv-annexi/ii · ukets-sch2a-p2 · ukets-sch2a-p7 · ukets-sch2a-p35 · ukets-sch2a-p36 · imo-g1-s4 · imo-g2-s4 · imo-g4-s4 · imo-a6-reg28 · imo-circ905-annex (optional CII Cf override) · scc-2-4 · scc-2-5 · scc-appendix-4 · ovd-ovd-bunker-report-details-p1/p3 &amp; other ovd-* guides · essf-ws1 examples 1–3 (validation fixtures). Open any of these in <b>rulefinder.html</b> for verbatim legal text and plain-language explanations.</p></div>`;
}

/* ---------- HELP TAB + SELF-TEST ---------- */
function renderHelp(){
  const el = document.getElementById("tab-help");
  el.innerHTML = `
  <div class="card">
    <h2>Quick start</h2>
    <div class="helpstep"><div class="n">1</div><div><b>Set up the vessel once</b> — on the <i>Settings</i> tab: name, ship type, capacity (DWT/GT), <b>reporting year</b> (with multi-year imports it decides which rows are calculated — the rest grey out), the <b>Main-engine and Auxiliary-engine LNG consumer classes</b> (they drive CH₄ slip for the machinery split), market prices (EUA/UKA, fuel €/t), and the <b>EU ETS GWP basis (AR4/AR5)</b> — this selector affects only the EU ETS 2026+ CO₂e proxy; FuelEU (25/298) and UK ETS (28/265) GWPs are prescribed by regulation and locked. These rarely change.</div></div>
    <div class="helpstep"><div class="n">2</div><div><b>Enter the activity</b> — on the <i>Workspace</i> tab, add voyages and port stays with the fuel consumed. Type a <b>port name or LOCODE</b> (e.g. "Rotterdam" or NLRTM) and pick from the list — the EU/UK/other zone is set automatically from the port's country (19,782 ports embedded from the DNV UN/LOCODE list); outermost-region / overseas-territory ports get an ⚠ OMR badge and advisory. Ports are optional — you can also just set the zones directly. Or skip typing entirely: click <b>⬆ Import data</b> in the header and load a DNV OVD Log Abstract CSV, an MDA event-log export (.xlsx or .csv) or an EMSA THETIS-MRV GHG Emissions XML — legs, port names, zones, dates, consumption, cargo and shore power are built automatically (format auto-detected).</div></div>
    <div class="helpstep"><div class="n">3</div><div><b>Watch the right-hand panel</b> — every keystroke recalculates live: the annual summary (distance, time at sea, cargo, transport work, fuel by type, CO₂ at berth vs sea, intensity ratios) and all five pillar cards, including the <b>FuelEU allocation selector</b> (optimal cleanest-first per ESSF WS1 §2.5, or proportional for comparison) with the allocated-mix table. No page switching.</div></div>
    <div class="helpstep"><div class="n">4</div><div><b>Dig into the numbers</b> — the <b>🧮 Calculations</b> tab holds the full working: the voyage &amp; berth breakdown (per-row EU ETS / UK ETS / FuelEU coverage %, EUA, UKA, LCV, eligible energy, compliance balance and penalty, with factor info icons), the FuelEU allocation working, the EU ETS working, and a <b>report-level trace</b> at MDA granularity where the derived <b>ARRIVAL</b>/<b>DEPARTURE</b> replace IN_PORT and every consumption, ROB and distance is visible. Both tables download as <b>Excel</b> (generated fully offline — the report table in OVD format for diagnostics).</div></div>
    <div class="helpstep"><div class="n">5</div><div><b>Run what-ifs</b> — change a fuel to a biofuel (enter its certified E value from the BDN), toggle FuelEU banking/borrowing/pooling or the allocation method, adjust the substitute fuel for the breakeven KPI, edit the ⚙ machinery split, or move a voyage between zones and watch scope change.</div></div>
    <div class="helpstep"><div class="n">6</div><div><b>Your work saves itself</b> — everything persists automatically in this browser (including the raw MDA reports behind the Calculations tab); <b>Reset</b> in the header returns to an empty workspace.</div></div>
  </div>

  <div class="card">
    <h2>Importing data — formats</h2>
    <h3>1 · DNV OVD Log Abstract (CSV) — recommended</h3>
    <p>The importer reads the standard <b>OVD Log Abstract</b> CSV (as produced by DNV's OVD template / CSV File Converter; built and tested against <i>DNV_OVD-Log-Abstract-Sample.csv</i> and <i>OVD LA.csv</i> in the ovd folder). What it uses:</p>
    <table>
      <tr><th>OVD column(s)</th><th>Used for</th></tr>
      <tr><td>Date_UTC / Time_UTC</td><td>Per-row From/To date-time and hours — shown on each voyage/port row and in the annual 'Activity timeframe' / 'Time at sea'</td></tr>
      <tr><td>Voyage_From / Voyage_To (UN/LOCODE)</td><td>Leg identity + zone from the 2-letter country prefix: EU-27 + NO + IS → EEA · GB → UK · else OTHER</td></tr>
      <tr><td>Event (Departure / Noon / Arrival …)</td><td>Sea vs at-berth attribution: a report covers the period since the previous report — Departure-report consumption goes to the berth being left; reports after Arrival go to the arrival berth; the rest to the sea leg</td></tr>
      <tr><td>Distance</td><td>Summed per leg (nm)</td></tr>
      <tr><td>Cargo_Mt</td><td>Max per leg → SCC transport work</td></tr>
      <tr><td>ME/AE/Boiler/Inert_gas/Cargo_Heating…_Consumption_&lt;FUEL&gt;</td><td>Summed per fuel per leg. Fuel codes: HFO, LFO, MGO+MDO→MDO/MGO, LPGP, LPGB, LNG, M→Methanol, E→Ethanol</td></tr>
      <tr><td>Shore_Side_Electricity_Reception (kWh)</td><td>× 3.6 → FuelEU OPS energy (MJ)</td></tr>
    </table>
    <p class="note"><b>Not imported (add manually):</b> "O" (other) fuel columns — biofuel/e-fuel components reported via the OVD Bunker Report with EU_GHG_Intensity / EU_Lower_Calorific_Value / BDN fields (see chunk ovd-ovd-bunker-report-details-p3) are not in the Log Abstract, so add such fuels as rows here with the certified E/WtT values; ROB fields; weather; EEOI cargo corrections. On import you choose <b>Replace</b> or <b>Append</b>, and any skipped columns are listed.</p>
    <h3>2 · THETIS-MRV GHG Emissions XML</h3>
    <p>The same ⬆ Import button also accepts the <b>EMSA THETIS-MRV bulk-upload XML</b> ("GHG Emissions" data type, per EMSA's <i>Documentation XML MRV v11.3</i>; built and tested against <i>ANNA-META-THETIS_EU_Emissions_9514406_2026.xml</i>). The format is auto-detected. What it uses:</p>
    <table>
      <tr><th>XML element</th><th>Used for</th></tr>
      <tr><td>voyageEmission — departure/arrivalPortCode &amp; names</td><td>Voyage row identity; zone from the LOCODE country prefix (same rules as OVD); OMR advisory applies</td></tr>
      <tr><td>atd / ata ("DD-MM-YYYY HH:MM:SS", GMT)</td><td>Per-row From/To date-time; hours from timeAtSeaNavigation + timeAtSeaAnchorage</td></tr>
      <tr><td>distanceTravelNavigation</td><td>Leg distance (nm)</td></tr>
      <tr><td>emissions (reportTypeConsumption=true) — amount, measuringUnitCode, density, fuelTypeCode</td><td>Fuel tonnes per leg/port call (m³ converted via density). Mapped codes: HFO, LFO, MDO/MGO→MDO, LNG, LPG (propane/butane), Methanol, Ethanol — anything else is reported at import, never guessed</td></tr>
      <tr><td>voyageCargoAndTransportWork (CARGO_MASS… codes)</td><td>Cargo tonnes → SCC/CII transport work. Non-mass bases (DWT, pax, volume) are reported, not imported</td></tr>
      <tr><td>portEmission — portCode, ata→atd, timeAtQuayside</td><td>At-berth rows with fuel and hours</td></tr>
      <tr><td>sses (sseType=OPS, amount MWh)</td><td>× 3,600 → FuelEU OPS energy (MJ)</td></tr>
      <tr><td>annualEmission — reportingPeriod, MRV/ETS CO₂ totals</td><td>Reporting period sets the calculator year (on Replace); CO₂ totals are shown as a <b>cross-check note only</b> — never imported</td></tr>
    </table>
    <p class="note"><b>Deliberately NOT used:</b> the file's own lcv / ttwEf / wttEmissionFactor / slip values — the calculator always applies its KB-grounded factors so imported and hand-entered activity are computed identically. Entries with reportTypeConsumption=false (CO₂-only, no fuel quantity) are skipped with a note. The full EMSA fuelTypeCode picklist is a separate EMSA document; unmapped codes are listed at import so nothing is silently dropped.</p>
    <h3>3 · MDA event log (.xlsx or .csv)</h3>
    <p>The same ⬆ Import button also accepts an <b>MDA event-log export</b> — the workbook with one row per report period, fuel consumption as JSON (e.g. <code>{"MGO": 0.65}</code>) and ORIGIN/CURRENT/DESTINATION UN/LOCODEs. Upload the .xlsx directly (read fully in your browser — no data leaves your machine) or a CSV saved from it. Columns are matched <b>by name</b>, so files with extra fields import fine; unknown columns are ignored. Required: DATE_TIME_GMT (or DATETIME_GMT), REPORT_TYPE, FUEL_CONSUMPTION, DISTANCE, CARGO_QTY and the three *_PORT_UNLO_CODE columns.</p>
    <table>
      <tr><th>MDA</th><th>Becomes</th></tr>
      <tr><td>ARRIVAL-EOSP / DEPARTURE-SOSP</td><td>Sea-passage markers only — <b>not</b> the regulatory arrival/departure. The true ARRIVAL and DEPARTURE (GMT) of each stay are <b>derived</b>: with cargo operations, the unbroken OPERATING_CONDITION chain around the first/last cargo-op report; without, the fallback ladder AT_BERTH → BUNKERING chain → AT_ANCHOR → DRIFTING. Consumption before the derived arrival / after the derived departure counts on the voyage, not the berth</td></tr>
      <tr><td>AT_SEA</td><td>Noon report on the ORIGIN→DESTINATION leg (consumption covers the period since the previous report, same as OVD)</td></tr>
      <tr><td>IN_PORT</td><td>At-berth/anchorage stay at the CURRENT port between the <b>derived</b> arrival and departure; a missing LOCODE is filled with the last known port (noted at import). A stay with no berth / anchorage / drifting / bunkering period at all (e.g. canal transit, MANOEUVRING only) is pure transit — merged into the voyage, no port row</td></tr>
      <tr><td>FUEL_OIL_BUNKER / FUEL_STOCK</td><td>Stock movements — skipped for consumption and transparent to the derivation logic (they never break a condition chain)</td></tr>
      <tr><td>Port of call</td><td><b>Derived, not read from the file:</b> a stay is a POC only if cargo operations occurred (ASSOCIATED_ACTIVITY = CARGO_LOADING/_DISCHARGING incl. STS, or fallback: CARGO_QTY changed by &gt;5% of DWT or 0↔loaded between EOSP and SOSP → orange ❗) AND no report in the derived window has OUTSIDE_PORT_LIMIT = TRUE (STS outside limits = transit). The file's own POC column is ignored; a disagreement is flagged with a yellow ⚠. Non-POC stays are excluded from EU ETS / UK ETS / FuelEU (CII/SCC still count them). Toggle on the row to override</td></tr>
      <tr><td>Fuel names in FUEL_CONSUMPTION</td><td>Every fuel-oil grade → HFO, except ULSFO → LFO; MGO/HSMGO/LSMGO/ULSMGO/HSD → MGO; MDO/DO → MDO; LNG, LPG, methanol, ethanol pass through. Unknown names are flagged as skipped, never guessed</td></tr>
      <tr><td>MAIN/AUXILIARY/BOILER _ENGINE_CONSUMPTION</td><td><b>Machinery split</b> per fuel grade (same mapping); the unassigned remainder per fuel type goes to <b>Other</b> (machines exceeding the total are scaled down and flagged). View/edit via the ⚙ toggle; for LNG the ME/AE shares take their slip class from the two consumer dropdowns in Settings — Boiler and Other are slip-free</td></tr>
      <tr><td>Rows crossing 31 Dec (multi-year file)</td><td>Split into per-year parts, <b>report-exactly</b> (a report period straddling midnight is pro-rated by time). POC derivation works across the boundary. The Settings reporting year decides which parts count in ALL KPIs; the other year's rows stay greyed in the list</td></tr>
      <tr><td>FUEL_ROB · LATITUDE/LONGITUDE · CURRENT_PORT/COUNTRY/REGION</td><td>Retained per report (not used in calculations) — feed the report-level trace and the OVD-format Excel download on the Calculations tab</td></tr>
    </table>
    <p class="note">Files without an OPERATING_CONDITION column import with the legacy mapping (EOSP = arrival, SOSP = departure, POC column passthrough) and a note. Stays cut off by the file boundary are derived from the available side and flagged <b>incomplete</b> — upload ±1 month around year ends where possible.</p>
  </div>

  <div class="card">
    <h2>FuelEU fuel allocation (ESSF WS1 §2.5)</h2>
    <p>FuelEU prescribes no method for allocating fuels to the energy scope: fuels reported under MRV in the period — <b>including the uncovered half of 50% voyages</b> — may be allocated freely (essf-ws1-2-5 and the extra-EEA worked examples). The calculator's default, <b>Optimal (cleanest-first)</b>, ranks every fuel × consumer entry by effective WtW intensity (incl. CH₄ slip per engine class; RFNBOs with their ×2 reward) and fills the scope from the cleanest entry down, pro-rating the marginal one — exactly reproducing the ESSF worked example. <b>Proportional</b> (each fuel pro-rata to coverage) is kept as a comparison toggle on the FuelEU card. The full allocation table — pool vs allocated mass and energy, WtT/TtW/WtW per entry — is on the Calculations tab.</p>
  </div>

  <div class="card">
    <h2>Reading the results</h2>
    <p><b>CII</b> — the coloured bar shows the A–E bands for your ship type/year; the black marker is the attained value. <b>EU ETS</b> — covered emissions × phase-in = EUAs; 2026+ includes CH₄/N₂O. <b>UK ETS</b> — ME<sub>ETS</sub> in tCO₂e for UK domestic activity, from 2026. <b>FuelEU</b> — intensity vs target; negative balance → penalty (after banking/borrowing/pooling you configured). <b>SCC</b> — per-voyage gCO₂/t·nm vs the trajectory values you enter. <b>Breakeven</b> — the % of in-scope energy to switch to your chosen substitute fuel so the FuelEU balance is exactly zero, and what that costs vs the penalty it avoids.</p>
    <p><span class="ok">KB</span> = value taken verbatim from the regulatory knowledge base (chunk id shown). <span class="flag">FILL-IN</span> = value not in the KB — verify before external use. The ⚠ card lists every assumption active in the current calculation.</p>
    <h3>Known simplifications (v1)</h3>
    <p class="note">CII correction factors (G5: ice class, STS, port exclusions) not applied — use the CII Cf override or adjust inputs. FuelEU RFNBO 2% subtarget (2034, conditional) and Art 6 OPS-at-berth penalty not modelled. EU ETS ignores transhipment-port and outermost-region derogations; assumes ship ≥5,000 GT. SCC/PP trajectory tables are user inputs. OVD import: voyage legs that both start and end outside the EEA/UK are still counted for CII/SCC but carry no ETS/FuelEU scope.</p>
  </div>

  <div class="card">
    <h2>Self-test against KB worked examples</h2>
    <p class="note">Recomputes the ESSF WS1 worked examples (chunks essf-ws1-example-1/-2), the MEPC.354(78) rating example, the SCC voyage example, scope/phase-in rules, the OVD import against the DNV sample rows, and the THETIS-MRV XML import against an EMSA-sample-derived fixture. ESSF tables print 5-dp display-rounded values, so FuelEU comparisons allow &lt;0.001% tolerance.</p>
    <button class="add" onclick="runSelfTests()">▶ Run self-tests</button>
    <div id="testout" class="testres" style="display:none;margin-top:10px"></div>
  </div>
  ${window.SUITE_PRESENT?`
  <div class="card">
    <h2>📖 Rulefinder &amp; 💬 Ask tabs (suite build)</h2>
    <p>This build bundles the <b>Emissions Rulefinder</b> — the full searchable knowledge base of verbatim regulation text (EU ETS, EU MRV, FuelEU, UK ETS, IMO DCS/CII, SCC/PP) with plain-language explanations and the EmA Product Map — as the <i>Rulefinder</i> tab. Every chunk id cited on the Formulas tab can be opened there directly. Press <kbd>/</kbd> while on the Rulefinder tab to focus its search box.</p>
    <p>The <b>Ask</b> tab answers questions from the same knowledge base: offline it retrieves and quotes the most relevant chunks with citations; optionally, paste an LLM API key (Anthropic or OpenAI) to get composed answers — the key is stored only in your browser and questions + retrieved extracts are sent to that provider <b>only when you use LLM mode</b>. Without a key the tool remains fully offline.</p>
  </div>`:""}`;
}

const OVD_TEST_SAMPLE = `IMO,Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Time_Since_Previous_Report,Time_Elapsed_Anchoring,Distance,Cargo_Mt,ME_Consumption_HFO,ME_Consumption_MGO,AE_Consumption_HFO,AE_Consumption_MGO,Boiler_Consumption_MGO,Cargo_Heating_Consumption_MGO,HFO_ROB,MGO_ROB,Duration_Shore_Side_Electricity_Reception,Shore_Side_Electricity_Reception
1234567,2024-05-25,07:30,DEHAM,NLRTM,Departure,19.5,,0,32500,0,,0,1.55,0.4,0.2,217,128,,
1234567,2024-05-25,11:00,DEHAM,NLRTM,Noon,3.5,,35,32500,3.85,2.5,1.5,0.35,0,,211.65,125.15,,
1234567,2024-05-26,04:00,DEHAM,NLRTM,Arrival,17,3,170,32500,18.7,0,0,1.65,0.05,0.05,192.95,123.45,,
1234567,2024-05-26,11:00,DEHAM,NLRTM,Noon,7,,0,21000,,,0,0.55,0.15,0.1,192.95,122.75,6,3000
1234567,2024-05-27,03:00,NLRTM,BEANR,Departure,16,,0,21000,0,,0,1.3,0.3,0.2,193.4,121.15,15,7000
1234567,2024-05-27,11:00,NLRTM,BEANR,Noon,8,,80,21000,8.8,,0,0.8,0,,184.6,120.35,,`;

const THETIS_TEST_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<emissions><shipEmissions shipImoNumber="9514406">
  <voyageEmission>
    <departurePortName>Pivdennyi</departurePortName><arrivalPortName>Ravenna</arrivalPortName>
    <atd>14-04-2026 13:00:00</atd><ata>21-04-2026 12:00:00</ata>
    <timeAtSeaNavigation>123.47</timeAtSeaNavigation><timeAtSeaAnchorage>22.03</timeAtSeaAnchorage>
    <distanceTravelNavigation>1482.9</distanceTravelNavigation>
    <departureCountryCode>UA</departureCountryCode><departurePortCode>UAPIV</departurePortCode>
    <arrivalCountryCode>IT</arrivalCountryCode><arrivalPortCode>ITRAN</arrivalPortCode>
    <emissions><amount>42.4</amount><measuringUnitCode>M_TONNES</measuringUnitCode><fuelTypeCode>HFO</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption><lcv>0.0405</lcv></emissions>
    <emissions><amount>74.8</amount><measuringUnitCode>M_TONNES</measuringUnitCode><fuelTypeCode>MGO</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption></emissions>
    <emissions><amount>10</amount><measuringUnitCode>M3</measuringUnitCode><density>0.9</density><fuelTypeCode>MGO</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption></emissions>
    <emissions><amount>5</amount><measuringUnitCode>M_TONNES</measuringUnitCode><fuelTypeCode>BIOFUEL_X</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption></emissions>
    <emissions><co2Emissions>12.3</co2Emissions><fuelTypeCode>HFO</fuelTypeCode><reportTypeConsumption>false</reportTypeConsumption></emissions>
    <voyageCargoAndTransportWork><cargoValue>42.64</cargoValue><cargoFieldCode>CARGO_MASS_TRANSPORT_WORK_MASS</cargoFieldCode></voyageCargoAndTransportWork>
    <sses><sseType>OPS</sseType><amount>10</amount></sses>
  </voyageEmission>
  <portEmission>
    <portName>Ravenna</portName><portCode>ITRAN</portCode>
    <atd>30-04-2026 05:00:00</atd><ata>21-04-2026 12:00:00</ata>
    <countryCode>IT</countryCode><timeAtQuayside>209</timeAtQuayside>
    <emissions><amount>20.2</amount><portActivityCode>AT_BERTH</portActivityCode><measuringUnitCode>M_TONNES</measuringUnitCode><fuelTypeCode>MGO</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption></emissions>
    <emissions><amount>2</amount><portActivityCode>AT_BERTH</portActivityCode><measuringUnitCode>M_TONNES</measuringUnitCode><fuelTypeCode>MGO</fuelTypeCode><reportTypeConsumption>true</reportTypeConsumption></emissions>
  </portEmission>
  <annualEmission>
    <reportingPeriod>2026</reportingPeriod>
    <mrvEmissionsDepartEeaPort><emissionPerGhg><entry><key>CO2</key><value>365.42</value></entry><entry><key>CH4</key><value>0.01</value></entry></emissionPerGhg></mrvEmissionsDepartEeaPort>
    <mrvEmissionsWithinEeaPort><emissionPerGhg><entry><key>CO2</key><value>72.26</value></entry></emissionPerGhg></mrvEmissionsWithinEeaPort>
    <mrvEmissionsWithinEeaPortAtBerth><emissionPerGhg><entry><key>CO2</key><value>72.26</value></entry></emissionPerGhg></mrvEmissionsWithinEeaPortAtBerth>
    <etsEmissionsDepartEeaPort><emissionPerGhg><entry><key>CO2</key><value>437.68</value></entry></emissionPerGhg></etsEmissionsDepartEeaPort>
    <etsEmissionsWithinEeaPortAtBerth><emissionPerGhg><entry><key>CO2</key><value>50</value></entry></emissionPerGhg></etsEmissionsWithinEeaPortAtBerth>
    <etsCcsDepartEeaPort><emissionPerGhg><entry><key>CO2</key><value>99</value></entry></emissionPerGhg></etsCcsDepartEeaPort>
  </annualEmission>
</shipEmissions></emissions>`;

function runSelfTests(){
  const out=[]; let pass=0, fail=0;
  const ck=(name,got,want,tol)=>{ const ok=Math.abs(got-want)<=tol; ok?pass++:fail++; out.push((ok?"PASS":"FAIL")+"  "+name+"  got "+got+"  want "+want); };
  const ckT=(name,cond)=>{ cond?pass++:fail++; out.push((cond?"PASS":"FAIL")+"  "+name); };
  const s1={year:2025,ship:{typeId:"bulk",capacity:60000},rows:[{kind:"voyage",from:"EEA",to:"EEA",dist:0,cargo:0,fuels:[{fuelId:"HFO",tonnes:12000},{fuelId:"MDO",tonnes:1400}]}]};
  const r1=computeAll(s1);
  ck("ESSF Ex1 energy in scope (MJ)", r1.fueleu.E_total, 545780000, 1);
  ck("ESSF Ex1 GHG intensity", r1.fueleu.ghgie, 91.63722, 0.0001);
  ck("ESSF Ex1 compliance balance (g)", r1.fueleu.cb, -1255523227.6, 6000);
  ck("ESSF Ex1 penalty (EUR)", r1.fueleu.penalty, 802011, 5);
  ck("ESSF Ex2 TtW LNG Otto slow-speed", ttwIntensity(FUEL_BY_ID["LNG"],"LNG Otto (dual fuel slow speed)"), 64.36808, 0.0001);
  ck("ESSF Ex2 TtW LNG Otto medium-speed", ttwIntensity(FUEL_BY_ID["LNG"],"LNG Otto (dual fuel medium speed)"), 70.70293, 0.0001);
  ck("G4 example: bulk req 10 → superior 8.6", TYPE_BY_ID["bulk"].dd[0]*10, 8.6, 1e-9);
  ck("G4 example: bulk req 10 → inferior 11.8", TYPE_BY_ID["bulk"].dd[3]*10, 11.8, 1e-9);
  ck("SCC example: 1233.2t / 76.98 Mtnm → 16.02", 1233.2e6/76.98e6, 16.02, 0.01);
  ck("FuelEU target 2025", fueleuTarget(2025), 89.3368, 1e-9);
  ck("FuelEU target 2030", fueleuTarget(2030), 85.6904, 1e-9);
  ck("EU ETS phase-in 2024", etsPhaseIn(2024), 0.4, 0);
  const s3={year:2025,ship:{typeId:"tanker",capacity:50000},rows:[{kind:"voyage",from:"EEA",to:"OTHER",dist:1000,cargo:0,fuels:[{fuelId:"HFO",tonnes:1000}]}]};
  ck("EU ETS 50% leg: 1000t HFO → 1557 tCO2", computeAll(s3).ets.covered_t_co2, 1557, 0.001);
  const s4={year:2026,ship:{typeId:"lng",capacity:80000},lngEngineDefault:"LNG Otto (dual fuel medium speed)",rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,fuels:[{fuelId:"LNG",tonnes:100}]}]};
  ck("UK ETS ME_ETS: 100t LNG Otto MS", computeAll(s4).ukets.tco2e, 96.9*2.75+28*3.1+265*(96.9*0.00011), 0.001);
  /* AR4/AR5 GWP selector — affects EU ETS 2026+ CO2e ONLY; FuelEU & UK ETS locked */
  const sAR={year:2026,ship:{typeId:"lng",capacity:80000},lngEngineDefault:"LNG Otto (dual fuel medium speed)",rows:[{kind:"voyage",from:"EEA",to:"EEA",dist:500,cargo:0,fuels:[{fuelId:"LNG",tonnes:100}]}]};
  const rAR5=computeAll(Object.assign({},sAR,{arSet:"AR5"})), rAR4=computeAll(Object.assign({},sAR,{arSet:"AR4"})), rARdef=computeAll(sAR);
  ck("EU ETS CO2e AR5 (default): 100t LNG", rAR5.ets.covered_t_co2e, 96.9*2.75+28*3.1+265*(96.9*0.00011), 0.001);
  ck("EU ETS CO2e AR4: 100t LNG", rAR4.ets.covered_t_co2e, 96.9*2.75+25*3.1+298*(96.9*0.00011), 0.001);
  ck("AR set omitted → defaults to AR5", rARdef.ets.covered_t_co2e, rAR5.ets.covered_t_co2e, 1e-9);
  ck("FuelEU GHGIE locked — identical under AR4/AR5", rAR4.fueleu.ghgie, rAR5.fueleu.ghgie, 1e-12);
  ck("UK ETS locked — identical under AR4/AR5", computeAll(Object.assign({},s4,{arSet:"AR4"})).ukets.tco2e, computeAll(s4).ukets.tco2e, 1e-12);
  /* OVD import against the DNV sample rows */
  try{
    const o = parseOVD(OVD_TEST_SAMPLE);
    const voy = o.rows.filter(r=>r.kind==="voyage"), prt = o.rows.filter(r=>r.kind==="port");
    ckT("OVD: 2 sea legs + port stays built ("+voy.length+" voyages, "+prt.length+" ports)", voy.length===2 && prt.length>=2);
    const l1 = voy[0];
    ck("OVD leg1 distance 35+170", l1.dist, 205, 0.001);
    ck("OVD leg1 HFO 3.85+1.5+18.7", (l1.fuels.find(f=>f.fuelId==="HFO")||{}).tonnes||0, 24.05, 0.001);
    ck("OVD leg1 MGO→MDO 2.5+0.35+1.75", (l1.fuels.find(f=>f.fuelId==="MDO")||{}).tonnes||0, 4.6, 0.001);
    ck("OVD leg1 cargo", l1.cargo, 32500, 0.001);
    ckT("OVD leg1 zones EEA→EEA (DEHAM→NLRTM)", l1.from==="EEA"&&l1.to==="EEA");
    const pHAM = prt[0];
    ck("OVD berth Hamburg MGO 1.55+0.4+0.2", (pHAM.fuels.find(f=>f.fuelId==="MDO")||{}).tonnes||0, 2.15, 0.001);
    ck("OVD OPS 10,000 kWh → 36,000 MJ", o.opsMJ, 36000, 0.5);
    ckT("OVD zone helper: GBIMM→UK, SGSIN→OTHER, NOOSL→EEA", zoneOfLocode("GBIMM")==="UK"&&zoneOfLocode("SGSIN")==="OTHER"&&zoneOfLocode("NOOSL")==="EEA");
    /* port picker / LOCODE database */
    ckT("Port DB loaded (>19,000 ports)", portIndex().length>19000);
    ckT("portSearch 'hamburg' → DEHAM first", (portSearch("hamburg")[0]||[])[0]==="DEHAM");
    ckT("portSearch by code 'nlrtm' → Rotterdam", (portSearch("nlrtm")[0]||[])[1]==="Rotterdam");
    ckT("portName lookup NLRTM → Rotterdam", portName("NLRTM")==="Rotterdam");
    ckT("OMR classes: GI…→UK OMR · RE…→EU OMR · NL…→none", portOMR("GIGIB")==="UK OMR"&&portOMR("REREU")==="EU OMR"&&portOMR("NLRTM")===null);
    ckT("OVD import fills port names (Hamburg→Rotterdam)", !!(l1.fromPort&&l1.fromPort.n==="Hamburg"&&l1.toPort&&l1.toPort.n==="Rotterdam"));
    ckT("OVD leg1 timeframe 25/05 07:30 → 26/05 04:00", l1.tStart==="2024-05-25T07:30"&&l1.tEnd==="2024-05-26T04:00");
    ck("OVD leg1 hours", l1.hours, 20.5, 0.01);
    /* legs with NO departure report (BOSP-only) and shifting distance in port must not lose distance */
    const bospCSV = "IMO,Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Distance,Cargo_Mt,ME_Consumption_HFO\n"+
      "1,2025-01-01,08:00,,,NOON,1,0,0\n"+                       // orphan shifting distance before any leg
      "1,2025-01-01,12:00,AAAAA,BBBBB,BOSP,93,1000,2\n"+          // voyage starts with BOSP, no DEPARTURE row
      "1,2025-01-02,12:00,AAAAA,BBBBB,NOON,280,1000,10\n"+
      "1,2025-01-03,06:00,AAAAA,BBBBB,EOSP,50,1000,5\n"+
      "1,2025-01-03,10:00,AAAAA,BBBBB,ARRIVAL,40,1000,1\n";
    const ob = parseOVD(bospCSV);
    const bl = ob.rows.find(r=>r.kind==="voyage");
    ck("OVD BOSP-only leg distance 1+93+280+50+40", bl?bl.dist:0, 464, 0.01);
    ck("OVD BOSP-only leg total dist across rows", ob.rows.filter(r=>r.kind==="voyage").reduce((s,r)=>s+r.dist,0), 464, 0.01);
    /* annual summary from imported rows — year 2024 matches the fixture dates (rows outside
       the reporting year are excluded from all KPIs since the 2026-07-16 multi-year change) */
    const rSum = computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows}).summary;
    ck("Summary distance 205+80", rSum.dist, 285, 0.01);
    ck("Summary time at sea 20.5+8", rSum.hoursSea, 28.5, 0.01);
    ck("Summary cargo 32500+21000", rSum.cargo, 53500, 0.01);
    ck("Summary CO2 at berth (4.75t MDO × 3.206)", rSum.co2Berth, 4.75*3.206, 0.001);
    ck("Summary CO2 at sea", rSum.co2Sea, 24.05*3.114+4.6*3.206+8.8*3.114+0.8*3.206, 0.001);
    ckT("Year filter: 2024-dated rows excluded from a 2025 computation (with warning)",
        (()=>{ const r=computeAll({year:2025, ship:{typeId:"bulk",capacity:45000}, rows:o.rows});
               return r.summary.dist===0 && r.warnings.some(w=>/EXCLUDED from ALL KPIs/.test(w)); })());
    /* per-row breakdown attribution */
    const rBr = computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows});
    const leg1det = rBr.rowDetails.find(d=>d.kind==="voyage");
    ck("Breakdown leg1 EUAs = CO2 × 40% phase-in (2024)", leg1det.euas, (24.05*3.114+4.6*3.206)*0.4, 0.001);
    const cbSum = rBr.rowDetails.reduce((s,d)=>s+(d.feuCB||0),0);
    ck("Breakdown indicative CB sums to annual CB", cbSum, rBr.fueleu.cb, Math.abs(rBr.fueleu.cb)*1e-9+1);
  }catch(e){ fail++; out.push("FAIL  OVD import threw: "+e.message); }
  /* THETIS-MRV XML import (fixture derived from ANNA-META-THETIS_EU_Emissions_9514406_2026.xml) */
  try{
    const x = parseTHETIS(THETIS_TEST_SAMPLE);
    const voy = x.rows.filter(r=>r.kind==="voyage"), prt = x.rows.filter(r=>r.kind==="port");
    ckT("THETIS: 1 voyage + 1 port call built", voy.length===1 && prt.length===1);
    const v1=voy[0], p1=prt[0];
    ckT("THETIS voyage zones UAPIV→OTHER, ITRAN→EEA", v1.from==="OTHER"&&v1.to==="EEA");
    ck("THETIS voyage distance", v1.dist, 1482.9, 0.001);
    ck("THETIS voyage HFO 42.4 t", (v1.fuels.find(f=>f.fuelId==="HFO")||{}).tonnes||0, 42.4, 0.001);
    ck("THETIS MGO→MDO 74.8 t + 10 m³×0.9", (v1.fuels.find(f=>f.fuelId==="MDO")||{}).tonnes||0, 83.8, 0.001);
    ckT("THETIS unknown fuel code reported, not guessed", x.skippedFuels.indexOf("BIOFUEL_X")>=0);
    ck("THETIS voyage hours 123.47+22.03", v1.hours, 145.5, 0.01);
    ckT("THETIS date DD-MM-YYYY HH:MM:SS → ISO", v1.tStart==="2026-04-14T13:00"&&v1.tEnd==="2026-04-21T12:00");
    ck("THETIS cargo (CARGO_MASS…)", v1.cargo, 42.64, 0.001);
    ck("THETIS port MDO 20.2+2", (p1.fuels.find(f=>f.fuelId==="MDO")||{}).tonnes||0, 22.2, 0.001);
    ck("THETIS port hours = timeAtQuayside", p1.hours, 209, 0.01);
    ckT("THETIS rows sorted chronologically (voyage before port)", x.rows[0].kind==="voyage"&&x.rows[1].kind==="port");
    ck("THETIS OPS 10 MWh → 36,000 MJ", x.opsMJ, 36000, 0.5);
    ckT("THETIS annual cross-check: AtBerth subset NOT double-counted (MRV 365.42+72.26, ETS 437.68)", !!x.annual && x.annual.year===2026 && Math.abs(x.annual.mrvCO2-437.68)<0.001 && Math.abs(x.annual.etsCO2-437.68)<0.001);
    ckT("THETIS CO₂-only entries skipped with note", x.notes.some(n=>n.indexOf("CO₂-only")>=0));
  }catch(e){ fail++; out.push("FAIL  THETIS XML import threw: "+e.message); }
  /* ---- empty start / LNG engine classes / POC scope (added 2026-07-15) ---- */
  try{
    ckT("Default state starts EMPTY (no rows) and computes without error", DEFAULT_STATE.rows.length===0 && !!computeAll(JSON.parse(JSON.stringify(DEFAULT_STATE))));
    const lngUK = id => computeAll({year:2026,ship:{typeId:"lng",capacity:80000},rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,fuels:[{fuelId:id,tonnes:100}]}]}).ukets.tco2e;
    ck("LNG Low-speed diesel (slip 0.2%): UK ETS CO2e for 100 t", lngUK("LNGDS"), 282.9592, 0.001);
    ckT("LNG class slip ordering: diesel-slow < Otto-slow < LBSI < Otto-medium (UK CO2e)",
        lngUK("LNGDS")<lngUK("LNGOS") && lngUK("LNGOS")<lngUK("LNGBSI") && lngUK("LNGBSI")<lngUK("LNG"));
    const lngGhgie = id => computeAll({year:2026,ship:{typeId:"lng",capacity:80000},rows:[{kind:"voyage",from:"EEA",to:"EEA",dist:500,cargo:0,fuels:[{fuelId:id,tonnes:100}]}]}).fueleu.ghgie;
    ckT("FuelEU intensity follows the LNG engine class (diesel-slow cleanest)",
        lngGhgie("LNGDS")<lngGhgie("LNGOS") && lngGhgie("LNGOS")<lngGhgie("LNGBSI") && lngGhgie("LNGBSI")<lngGhgie("LNG"));
    ckT("engineClass wins over lngEngineDefault", Math.abs(computeAll({year:2026,ship:{typeId:"lng",capacity:80000},lngEngineDefault:"LBSI",rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,fuels:[{fuelId:"LNGDS",tonnes:100}]}]}).ukets.tco2e - 282.9592) < 0.001);
    ckT("saved-state migration maps old LNG+engine to new fuel id",
        migrateState({rows:[{kind:"voyage",fuels:[{fuelId:"LNG",engine:"LNG Diesel (dual fuel slow speed)"}]}]}).rows[0].fuels[0].fuelId==="LNGDS");
    const pocState = poc => ({year:2026,ship:{typeId:"bulk",capacity:45000},rows:[{kind:"port",zone:"EEA",poc,fuels:[{fuelId:"MDO",tonnes:10}]}]});
    const rON=computeAll(pocState(true)), rOFF=computeAll(pocState(false)), rDEF=computeAll(pocState(undefined));
    ckT("POC on: EEA berth in EU ETS + FuelEU scope", rON.ets.basis_t>31 && rON.fueleu.E_total>0);
    ckT("POC off: EEA berth OUT of EU ETS + FuelEU scope", rOFF.ets.basis_t===0 && rOFF.fueleu.E_total===0);
    ckT("POC default (undefined) counts as a call", rDEF.ets.basis_t===rON.ets.basis_t);
    ckT("POC off: CII still counts the fuel", Math.abs(rOFF.cii.co2_t - rON.cii.co2_t)<1e-9 && rOFF.cii.co2_t>30);
    const rUK=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:[{kind:"port",zone:"UK",poc:false,fuels:[{fuelId:"MDO",tonnes:10}]}]});
    ckT("POC off: UK berth OUT of UK ETS scope", rUK.ukets.tco2e===0);
  }catch(e){ fail++; out.push("FAIL  LNG-class/POC tests threw: "+e.message); }
  /* ---- MDA import fixtures (added 2026-07-15 with the native MDA import) ---- */
  try{
    ckT("MDA date: Excel serial 46023 → 2026-01-01", (mdaDate(46023)||[])[0]==="2026-01-01");
    ckT("MDA date: serial fraction 46023.5 → 12:00", (mdaDate(46023.5)||[])[1]==="12:00");
    ckT("MDA date: string '2026-01-02 10:15' parses", String(mdaDate("2026-01-02 10:15"))==="2026-01-02,10:15");
    ckT("MDA fuel map: VLSFO→HFO, ULSFO→LFO, LSMGO→MGO, DO→MDO, BIOX→null",
        mdaFuel("VLSFO")==="HFO"&&mdaFuel("ULSFO")==="LFO"&&mdaFuel("LSMGO")==="MGO"&&mdaFuel("DO")==="MDO"&&mdaFuel("BIOX")===null);
    const MDA_FIX=[
      ["ROW","DATE_TIME_GMT","REPORT_TYPE","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE","POC","FUTURE_EXTRA_FIELD"],
      ["1","2026-01-01 10:00","IN_PORT",'{"MGO": 1.0}',"0","0","","EGDAM","","NO","ignore-me"],
      ["2","2026-01-02 06:00","DEPARTURE-SOSP",'{"VLSFO": 0.5}',"5","10000","EGDAM","","BEANR","",""],
      ["3","2026-01-03 12:00","AT_SEA",'{"VLSFO": 10.0}',"100","10000","","","BEANR","",""],
      ["4","2026-01-04 09:00","FUEL_OIL_BUNKER","","","","","","","",""],
      ["5","2026-01-05 08:00","ARRIVAL-EOSP",'{"ULSFO": 2.0}',"20","10000","EGDAM","BEANR","BEANR","",""],
      ["6","2026-01-06 10:00","IN_PORT",'{"BIOX": 1.5}',"0","0","","","","YES",""]
    ];
    const m=mdaToOVD(MDA_FIX), x=parseOVD(m.csv);
    const legsM=x.rows.filter(r=>r.kind==="voyage"), portsM=x.rows.filter(r=>r.kind==="port");
    ckT("MDA fixture: 1 sea leg + 1 port stay built (extra column ignored)", legsM.length===1&&portsM.length===1);
    ck("MDA leg distance 125 nm (dep 5 + noon 100 + arr 20)", legsM[0]?legsM[0].dist:0, 125, 0.01);
    ck("MDA leg cargo 10,000 t", legsM[0]?legsM[0].cargo:0, 10000, 0.01);
    const fT=(r,id)=>{ const f=(r&&r.fuels||[]).find(z=>z.fuelId===id); return f?f.tonnes:0; };
    ck("MDA leg VLSFO→HFO 10.0 t at sea", fT(legsM[0],"HFO"), 10.0, 0.001);
    ck("MDA leg ULSFO→LFO 2.0 t (arrival report)", fT(legsM[0],"LFO"), 2.0, 0.001);
    ck("MDA berth MGO 1.0 t (as MDO id)", fT(portsM[0],"MDO"), 1.0, 0.001);
    ck("MDA berth pre-departure VLSFO→HFO 0.5 t", fT(portsM[0],"HFO"), 0.5, 0.001);
    ckT("MDA unknown fuel BIOX flagged as skipped, not guessed", x.skippedFuels.indexOf("BIOX")>=0);
    ckT("MDA notes: bunker skipped + LOCODE carried forward + legacy (no OPERATING_CONDITION) note", m.notes.length===3 && /BUNKER/.test(m.notes[0]) && /carried forward/.test(m.notes[1]) && /derivation skipped/.test(m.notes[2]));
    ckT("MDA zones: EGDAM→BEANR = OTHER→EEA", legsM[0]&&legsM[0].from==="OTHER"&&legsM[0].to==="EEA");
    ckT("MDA POC NO (anchorage-only stay) → poc:false on the imported row", portsM[0]&&portsM[0].poc===false);
    ckT("import notes flag the non-POC stay", x.notes.some(n=>/NOT a port of call/.test(n)));
    ckT("OVD import without POC column defaults poc:true", parseOVD(OVD_TEST_SAMPLE).rows.filter(r=>r.kind==="port").every(r=>r.poc===true));
    const mdaCsvText='DATE_TIME_GMT,REPORT_TYPE,FUEL_CONSUMPTION,DISTANCE,CARGO_QTY,ORIGIN_PORT_UNLO_CODE,CURRENT_PORT_UNLO_CODE,DESTINATION_PORT_UNLO_CODE\n"2026-02-01 10:00",IN_PORT,"{""MDO"": 2.5}",0,0,,NLRTM,';
    const x2=parseOVD(mdaToOVD(parseCSV(mdaCsvText)).csv);
    ck("MDA-as-CSV path: quoted JSON parsed, MDO 2.5 t at NLRTM", fT(x2.rows[0],"MDO"), 2.5, 0.001);
    ckT("MDA missing-column error is explicit", (()=>{ try{ mdaToOVD([["DATE_TIME_GMT","REPORT_TYPE"],["x","IN_PORT"]]); return false; }catch(e){ return /missing required column/.test(e.message); } })());
  }catch(e){ fail++; out.push("FAIL  MDA import threw: "+e.message); }
  /* ---- MDA arrival/departure/POC derivation (added 2026-07-16) ---- */
  try{
    const DH=["DATE_TIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","ASSOCIATED_ACTIVITY","OUTSIDE_PORT_LIMIT","POC","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE"];
    const DER_FIX=[DH,
      /* leg 1 EGDAM→BEANR, stay A at BEANR: Case A chain (berth cargo op, FUEL_STOCK transparent, manoeuvring outside chain) */
      ["2026-03-01 00:00","2026-02-28 12:00","2026-03-01 00:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"VLSFO": 0.5}',"5","10000","EGDAM","","BEANR"],
      ["2026-03-02 00:00","2026-03-01 00:00","2026-03-02 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 10}',"100","10000","EGDAM","","BEANR"],
      ["2026-03-02 12:00","2026-03-02 00:00","2026-03-02 12:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 2}',"20","10000","EGDAM","BEANR","BEANR"],
      ["2026-03-02 18:00","2026-03-02 12:00","2026-03-02 18:00","IN_PORT","MANOEUVRING","","FALSE","",'{"MGO": 0.4}',"0","10000","","BEANR",""],
      ["2026-03-03 06:00","2026-03-02 18:00","2026-03-03 06:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","FALSE","NO",'{"MGO": 1.0}',"0","6000","","BEANR",""],
      ["2026-03-03 12:00","2026-03-03 06:00","2026-03-03 12:00","FUEL_STOCK","","","","","","","","","BEANR",""],
      ["2026-03-03 18:00","2026-03-03 12:00","2026-03-03 18:00","IN_PORT","AT_BERTH","","FALSE","",'{"MGO": 0.6}',"0","6000","","BEANR",""],
      ["2026-03-04 00:00","2026-03-03 18:00","2026-03-04 00:00","IN_PORT","MANOEUVRING","","FALSE","",'{"MGO": 0.3}',"0","6000","","BEANR",""],
      ["2026-03-04 06:00","2026-03-04 00:00","2026-03-04 06:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.2}',"2","6000","BEANR","","NLRTM"],
      /* leg 2 BEANR→NLRTM, stay B at NLRTM: manoeuvring only → pure transit, merged into voyage */
      ["2026-03-05 00:00","2026-03-04 06:00","2026-03-05 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 8}',"90","6000","BEANR","","NLRTM"],
      ["2026-03-05 06:00","2026-03-05 00:00","2026-03-05 06:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 1}',"10","6000","BEANR","NLRTM","NLRTM"],
      ["2026-03-05 12:00","2026-03-05 06:00","2026-03-05 12:00","IN_PORT","MANOEUVRING","","FALSE","NO",'{"MGO": 0.7}',"0","6000","","NLRTM",""],
      ["2026-03-05 18:00","2026-03-05 12:00","2026-03-05 18:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.1}',"3","6000","NLRTM","","DEHAM"],
      /* leg 3 NLRTM→DEHAM, stay C at DEHAM: no cargo activity but qty 6000→0 → Case B AT_BERTH + quantity-fallback POC */
      ["2026-03-06 06:00","2026-03-05 18:00","2026-03-06 06:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 7}',"80","6000","NLRTM","","DEHAM"],
      ["2026-03-06 12:00","2026-03-06 06:00","2026-03-06 12:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 0.8}',"8","6000","NLRTM","DEHAM","DEHAM"],
      ["2026-03-06 18:00","2026-03-06 12:00","2026-03-06 18:00","IN_PORT","AT_BERTH","","FALSE","YES",'{"MDO": 0.2}',"0","6000","","DEHAM",""],
      ["2026-03-07 00:00","2026-03-06 18:00","2026-03-07 00:00","IN_PORT","AT_BERTH","","FALSE","YES",'{"MDO": 0.2}',"0","0","","DEHAM",""],
      ["2026-03-07 06:00","2026-03-07 00:00","2026-03-07 06:00","DEPARTURE-SOSP","MANOEUVRING","","","","","1","0","DEHAM","","GBLON"],
      /* leg 4 DEHAM→GBLON, stay D at GBLON: STS cargo op OUTSIDE port limits → derived window but transit (poc off) */
      ["2026-03-08 00:00","2026-03-07 06:00","2026-03-08 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 6}',"70","0","DEHAM","","GBLON"],
      ["2026-03-08 06:00","2026-03-08 00:00","2026-03-08 06:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 0.5}',"5","0","DEHAM","GBLON","GBLON"],
      ["2026-03-08 18:00","2026-03-08 06:00","2026-03-08 18:00","IN_PORT","AT_ANCHOR","CARGO_LOADING_STS","TRUE","YES",'{"MDO": 0.5}',"0","8000","","GBLON",""],
      ["2026-03-09 00:00","2026-03-08 18:00","2026-03-09 00:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MDO": 0.1}',"1","8000","GBLON","","ESALG"]
    ];
    const md=mdaToOVD(DER_FIX, 20000), xd=parseOVD(md.csv);
    const fT=(r,id)=>{ const f=(r&&r.fuels||[]).find(z=>z.fuelId===id); return f?f.tonnes:0; };
    const legs=xd.rows.filter(r=>r.kind==="voyage"), ports=xd.rows.filter(r=>r.kind==="port");
    const pAt=c=>ports.find(p=>p.port&&p.port.c===c);
    ckT("DERIVE: 5 legs + 4 port stays (NLRTM transit merged away)", legs.length===5 && ports.length===4 && !pAt("NLRTM"));
    const pB=pAt("BEANR"), pD=pAt("DEHAM"), pG=pAt("GBLON");
    ckT("DERIVE stay A: arrival = start of cargo-op chain (manoeuvring excluded)", pB && pB.arrGmt==="2026-03-02T18:00");
    ckT("DERIVE stay A: departure = end of chain (FUEL_STOCK transparent, chain continues through it)", pB && pB.depGmt==="2026-03-03T18:00");
    ckT("DERIVE stay A: rule CASE_A, POC on, file-POC mismatch flagged (file said NO)", pB && pB.deriveRule==="CASE_A" && pB.poc===true && pB.pocMismatch===true && !pB.pocQty);
    ck("DERIVE stay A berth fuel = chain reports only (1.0+0.6)", fT(pB,"MDO"), 1.6, 0.001);
    ck("DERIVE leg1 gets pre-arrival manoeuvring (0.4)", fT(legs[0],"MDO"), 0.4, 0.001);
    ck("DERIVE leg1 HFO 10+2 (EOSP is sea passage)", fT(legs[0],"HFO"), 12, 0.001);
    ck("DERIVE leg2 gets post-departure + SOSP + transit stay fuel (0.3+0.2+0.7+0.1)", fT(legs[1],"MDO"), 1.3, 0.001);
    ck("DERIVE leg2 HFO 8+1 (transit EOSP merged into voyage)", fT(legs[1],"HFO"), 9, 0.001);
    ckT("DERIVE stay C: Case B AT_BERTH window", pD && pD.arrGmt==="2026-03-06T12:00" && pD.depGmt==="2026-03-07T00:00" && pD.deriveRule==="AT_BERTH");
    ckT("DERIVE stay C: quantity-fallback POC (6000→0, no recorded cargo op) → poc on + orange flag", pD && pD.poc===true && pD.pocQty===true && pD.pocMismatch!==true);
    ckT("DERIVE stay D: STS outside port limits → derived window kept but classified transit (poc off)", pG && pG.poc===false && pG.arrGmt==="2026-03-08T06:00" && pG.deriveRule==="CASE_A");
    const totIn={HFO:35.8, MDO:4.3};
    const totOut=id=>xd.rows.reduce((s,r)=>s+fT(r,id),0);
    ck("DERIVE fuel conservation HFO (nothing lost in re-attribution)", totOut("HFO"), totIn.HFO, 0.001);
    ck("DERIVE fuel conservation MDO/MGO", totOut("MDO"), totIn.MDO, 0.001);
    ckT("DERIVE notes: derivation + transit + qty fallback + OPL + mismatch all reported",
        md.notes.some(n=>/ARRIVAL\/DEPARTURE derived/.test(n)) && md.notes.some(n=>/pure transit/.test(n)) &&
        md.notes.some(n=>/quantity fallback/.test(n)) && md.notes.some(n=>/OUTSIDE port limits/.test(n)) && md.notes.some(n=>/disagrees/.test(n)));
    /* DATETIME_GMT header variant + incomplete stay at file end */
    const INC_FIX=[["DATETIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","ASSOCIATED_ACTIVITY","OUTSIDE_PORT_LIMIT","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE"],
      ["2026-06-01 00:00","2026-05-31 12:00","2026-06-01 00:00","AT_SEA","NORMAL SAILING","","",'{"VLSFO": 5}',"60","9000","SGSIN","","AEJEA"],
      ["2026-06-01 06:00","2026-06-01 00:00","2026-06-01 06:00","ARRIVAL-EOSP","","","",'{"VLSFO": 0.5}',"6","9000","SGSIN","AEJEA","AEJEA"],
      ["2026-06-01 12:00","2026-06-01 06:00","2026-06-01 12:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","FALSE",'{"MDO": 0.3}',"0","4000","","AEJEA",""]
    ];
    const xi=parseOVD(mdaToOVD(INC_FIX, 20000).csv);
    const pI=xi.rows.find(r=>r.kind==="port" && r.arrGmt);   // skip the legacy leading row a mid-voyage file start creates
    ckT("DERIVE: DATETIME_GMT header accepted; truncated stay derived one-sided + flagged incomplete",
        !!pI && pI.arrGmt==="2026-06-01T06:00" && pI.incomplete===true && pI.poc===true);
  }catch(e){ fail++; out.push("FAIL  MDA derivation tests threw: "+e.message); }
  /* ---- Session 2 (2026-07-16): FuelEU allocation · machinery split · multi-year ---- */
  try{
    /* ESSF WS1 Chapter 2, extra-EEA Example 2 (Tables 18/19): LNG across engines with
       different slip, US↔FR voyages (50%) + FR port call (100%). Published WtW values:
       LNG 0.0% 75.18 · LNG 0.2% 76.08 · LNG 3.1% 89.20 · MDO 90.77 · HFO 91.74 g/MJ;
       scope 118,905 GJ of 231,195 GJ; optimal allocation = all 0.0% + 99,265 GJ of 0.2%. */
    const essfVoy = ()=>({kind:"voyage",from:"OTHER",to:"EEA",dist:4000,cargo:0,fuels:[
      {fuelId:"LNG",tonnes:2200,split:{ME:1500,AE:500,BLR:200}},{fuelId:"MDO",tonnes:100}]});
    const v2=essfVoy(); v2.from="EEA"; v2.to="OTHER";
    const essfState={year:2025,ship:{typeId:"lng",capacity:80000},
      lngEngineDefault:"LNG Diesel (dual fuel slow speed)", lngEngineDefaultAux:"LNG Otto (dual fuel medium speed)",
      fueleuAlloc:"optimal",
      rows:[essfVoy(),
            {kind:"port",zone:"EEA",poc:true,fuels:[{fuelId:"LNG",tonnes:50,split:{AE:50}},{fuelId:"HFO",tonnes:50},{fuelId:"MDO",tonnes:50}]},
            v2]};
    const rE=computeAll(essfState), fE=rE.fueleu;
    ck("ESSF ex.2: energy scope 118,905 GJ (×10⁶ MJ)", fE.E_total/1e6, 118.905, 0.005);
    ck("ESSF ex.2: allocatable MRV pool 231,195 GJ (×10⁶ MJ)", fE.E_pool/1e6, 231.195, 0.005);
    const tBLR=fE.terms.find(t=>t.id==="LNG"&&t.m==="BLR"), tME=fE.terms.find(t=>t.id==="LNG"&&t.m==="ME"), tAE=fE.terms.find(t=>t.id==="LNG"&&t.m==="AE");
    ckT("ESSF ex.2: zero-slip boiler LNG fully allocated (19,640 GJ)", !!tBLR && Math.abs(tBLR.E-19.64e6)<2e4 && Math.abs(tBLR.E-tBLR.E_pool)<1);
    ckT("ESSF ex.2: 0.2%-slip ME LNG allocated 99,265 of 147,300 GJ (marginal entry pro-rata)", !!tME && Math.abs(tME.E-99.265e6)<3e4 && Math.abs(tME.E_pool-147.3e6)<3e4);
    ckT("ESSF ex.2: 3.1%-slip AE LNG, MDO and HFO excluded (0 allocated)",
        !!tAE && tAE.E===0 && fE.terms.filter(t=>t.id!=="LNG").every(t=>t.E===0));
    ck("ESSF ex.2: optimal GHGIE ≈ 75.93 g/MJ (Table 19 intensities)", fE.ghgie, (19640*75.18+99265*76.08)/118905, 0.02);
    ck("ESSF ex.2: proportional comparison ≈ 80.04 g/MJ", fE.ghgieAlt, 80.04, 0.05);
    ckT("ESSF ex.2: optimal beats proportional; CBs ordered accordingly", fE.ghgie<fE.ghgieAlt && fE.cb>fE.cbAlt);
    const rP=computeAll(Object.assign({},essfState,{fueleuAlloc:"proportional"}));
    ckT("Allocation toggle: proportional method selected = previous behaviour", Math.abs(rP.fueleu.ghgie-fE.ghgieAlt)<1e-9 && rP.fueleu.allocMethod==="proportional" && Math.abs(rP.fueleu.ghgieAlt-fE.ghgie)<1e-9);
    ckT("ESSF WtW intensities match the published table (75.18/76.08/89.20 ±0.01)",
        Math.abs((tBLR.wtt+tBLR.ttw)-75.18)<0.01 && Math.abs((tME.wtt+tME.ttw)-76.08)<0.01 && Math.abs((tAE.wtt+tAE.ttw)-89.20)<0.01);
    /* machinery split drives slip outside FuelEU too (UK ETS CH4) */
    const ukSplit = computeAll({year:2026,ship:{typeId:"lng",capacity:80000},lngEngineDefault:"LNG Diesel (dual fuel slow speed)",
      rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,fuels:[{fuelId:"LNG",tonnes:100,split:{ME:100}}]}]}).ukets.tco2e;
    ck("Machinery split: 100 t LNG all-ME with diesel-slow ME class = LNGDS result", ukSplit, 282.9592, 0.001);
    /* split editing rules (updTonnes / updSplit) */
    const keepRows=S.rows;
    S.rows=[{kind:"voyage",from:"EEA",to:"EEA",dist:0,cargo:0,fuels:[{fuelId:"HFO",tonnes:10,split:{ME:6,AE:3,BLR:1}}]}];
    updTonnes(0,0,"12");
    ckT("Edit total 10→12: delta goes to Other", S.rows[0].fuels[0].split.OTH===2 && S.rows[0].fuels[0].tonnes===12);
    updTonnes(0,0,"5");
    ckT("Edit total 12→5 (< ME+AE+BLR): machines scale pro-rata, Other 0",
        S.rows[0].fuels[0].split.ME===3 && S.rows[0].fuels[0].split.AE===1.5 && S.rows[0].fuels[0].split.BLR===0.5 && S.rows[0].fuels[0].split.OTH===0);
    updSplit(0,0,"AE","2.5");
    ck("Edit a machine: total follows the split (3+2.5+0.5+0)", S.rows[0].fuels[0].tonnes, 6, 0.001);
    S.rows=keepRows; save();
    /* multi-year OVD: leg crossing 31 Dec splits report-exactly (straddling period pro-rated) */
    const yCSV="Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Distance,Cargo_Mt,ME_Consumption_HFO\n"+
      "2025-12-30,12:00,NLRTM,DEHAM,Departure,0,5000,2\n"+
      "2025-12-31,12:00,NLRTM,DEHAM,Noon,100,5000,10\n"+
      "2026-01-01,12:00,NLRTM,DEHAM,Noon,100,5000,10\n"+     // covers 31Dec12:00→01Jan12:00 → half in each year
      "2026-01-02,12:00,NLRTM,DEHAM,Arrival,50,5000,5\n";
    const oy=parseOVD(yCSV);
    const parts=oy.rows.filter(r=>r.kind==="voyage");
    const fT2=(r,id)=>{ const f=(r&&r.fuels||[]).find(z=>z.fuelId===id); return f?f.tonnes:0; };
    ckT("Year split: one leg becomes 2025 + 2026 parts", parts.length===2 && parts[0].yearPart===2025 && parts[1].yearPart===2026 && parts.every(p=>p.splitYear));
    ck("Year split 2025 part: 100 + half of the straddling period = 150 nm", parts[0].dist, 150, 0.2);
    ck("Year split 2025 part HFO 10+5 t", fT2(parts[0],"HFO"), 15, 0.01);
    ck("Year split 2026 part: 50 + half = 100 nm", parts[1].dist, 100, 0.2);
    ck("Year split 2026 part HFO 5+5 t", fT2(parts[1],"HFO"), 10, 0.01);
    ckT("Year split note reported", oy.notes.some(n=>/year boundary/.test(n)));
    const c25=computeAll({year:2025,ship:{typeId:"bulk",capacity:45000},rows:oy.rows}), c26=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:oy.rows});
    ckT("Reporting-year selector: 2025 sees 150 nm, 2026 sees 100 nm", Math.abs(c25.summary.dist-150)<0.2 && Math.abs(c26.summary.dist-100)<0.2);
    /* MDA per-machine columns + raw report retention */
    const MH=["DATE_TIME_GMT","REPORT_TYPE","OPERATING_CONDITION","FUEL_CONSUMPTION","MAIN_ENGINE_CONSUMPTION","AUXILIARY_ENGINE_CONSUMPTION","BOILER_CONSUMPTION","FUEL_ROB","LATITUDE","LONGITUDE","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE"];
    const MFIX=[MH,
      ["2026-02-01 06:00","IN_PORT","AT_BERTH",'{"MGO": 2.0}',"",'{"MGO": 1.2}','{"MGO": 0.3}','{"MGO": 100}',"51.9","4.5","0","0","","NLRTM",""],
      ["2026-02-01 12:00","DEPARTURE-SOSP","MANOEUVRING",'{"VLSFO": 1.0}','{"VLSFO": 0.9}','{"VLSFO": 0.2}',"",'{"VLSFO": 500}',"51.95","4.2","5","0","NLRTM","","DEHAM"],
      ["2026-02-02 12:00","AT_SEA","NORMAL SAILING",'{"VLSFO": 10}','{"VLSFO": 8}','{"VLSFO": 1.5}','{"VLSFO": 0.5}','{"VLSFO": 490}',"53.1","3.1","120","0","NLRTM","","DEHAM"]];
    const mm=mdaToOVD(MFIX, 20000), xm=parseOVD(mm.csv);
    const pN=xm.rows.find(r=>r.kind==="port");
    const frN=pN&&pN.fuels.find(f=>f.fuelId==="MDO");
    ckT("MDA machine split: berth MGO 2.0 t → AE 1.2 / BLR 0.3 / Other 0.5", !!frN && frN.tonnes===2 && frN.split && frN.split.AE===1.2 && frN.split.BLR===0.3 && frN.split.OTH===0.5);
    const legM=xm.rows.find(r=>r.kind==="voyage");
    const frL=legM&&legM.fuels.find(f=>f.fuelId==="HFO");
    /* leg = SOSP report (1.0 t, over-allocated 0.9+0.2 scaled to 0.818/0.182) + sea report (10 t) */
    ckT("MDA machine split: sea VLSFO→HFO 11 t → ME 8.818 / AE 1.682 / BLR 0.5 (over-allocation scaled)",
        !!frL && Math.abs(frL.tonnes-11)<0.01 && frL.split && Math.abs(frL.split.ME-8.818)<0.01 && Math.abs(frL.split.AE-1.682)<0.01 && frL.split.BLR===0.5);
    ckT("MDA negative remainder (0.9+0.2 > 1.0) clamped + flagged", mm.notes.some(n=>/exceeding the fuel-type total/.test(n)));
    ckT("Raw reports retained: 3 rows with lat/lon, ROB and machine dicts (OVD-download foundation)",
        mm.reports.length===3 && mm.reports[0].lat===51.9 && mm.reports[0].rob.MGO===100 && mm.reports[2].mach.ME.HFO===8 && mm.reports[1].qty===0);
  }catch(e){ fail++; out.push("FAIL  Session-2 (allocation/split/multi-year) tests threw: "+e.message); }
  /* ---- Session 3 (2026-07-16): Calculations tab, xlsx writer, report labels ---- */
  try{
    ckT("CRC32 test vector '123456789' → 0xCBF43926", crc32(new TextEncoder().encode("123456789"))===0xCBF43926);
    ckT("report-type labels: EOSP / SOSP / derived ARRIVAL / BUNKER",
        reportTypeLabel({rt:"ARRIVAL-EOSP"})==="EOSP" && reportTypeLabel({rt:"DEPARTURE-SOSP"})==="SOSP" &&
        reportTypeLabel({rt:"IN_PORT",role:"ARRIVAL"})==="ARRIVAL" && reportTypeLabel({rt:"IN_PORT"})==="IN_PORT" &&
        reportTypeLabel({rt:"FUEL_OIL_BUNKER"})==="BUNKER");
    /* derived roles land on the retained reports */
    const RFIX=[["DATETIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","ASSOCIATED_ACTIVITY","OUTSIDE_PORT_LIMIT","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE","CURRENT_PORT","CURRENT_COUNTRY","CURRENT_REGION"],
      ["2026-04-01 06:00","2026-04-01 00:00","2026-04-01 06:00","ARRIVAL-EOSP","","","",'{"MDO": 1}',"10","5000","SGSIN","BEANR","BEANR","Antwerp","Belgium","North Europe"],
      ["2026-04-01 12:00","2026-04-01 06:00","2026-04-01 12:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","FALSE",'{"MDO": 0.5}',"0","2000","","BEANR","","Antwerp","Belgium","North Europe"],
      ["2026-04-01 18:00","2026-04-01 12:00","2026-04-01 18:00","IN_PORT","AT_BERTH","","FALSE",'{"MDO": 0.4}',"0","2000","","BEANR","","Antwerp","Belgium","North Europe"],
      ["2026-04-02 00:00","2026-04-01 18:00","2026-04-02 00:00","DEPARTURE-SOSP","MANOEUVRING","","",'{"MDO": 0.2}',"2","2000","BEANR","","NLRTM","","",""]];
    const mr=mdaToOVD(RFIX, 20000);
    const inport=mr.reports.filter(r=>r.rt==="IN_PORT");
    ckT("derived window boundaries labelled on reports (ARRIVAL first, DEPARTURE last)",
        inport.length===2 && reportTypeLabel(inport[0])==="ARRIVAL" && reportTypeLabel(inport[1])==="DEPARTURE");
    ckT("reports carry CURRENT_PORT / COUNTRY / REGION for the trace table",
        inport[0].portN==="Antwerp" && inport[0].ctry==="Belgium" && inport[0].regn==="North Europe");
    /* async tail: write an xlsx with our offline writer, read it back with the app's own reader */
    (async ()=>{
      const el2=document.getElementById("testout");
      try{
        const buf=await xlsxBlob("T",[["A","B"],["x",1.5],["y",2]]).arrayBuffer();
        const rr=await xlsxToRows(buf);
        const ok=rr.length===3 && rr[0][0]==="A" && String(rr[1][1])==="1.5" && rr[2][0]==="y";
        if(el2) el2.textContent += "\n"+(ok?"PASS":"FAIL")+"  xlsx writer round-trip through the app's own reader (async)";
      }catch(err){ if(el2) el2.textContent += "\nFAIL  xlsx round-trip threw: "+err.message; }
    })();
  }catch(e){ fail++; out.push("FAIL  Session-3 (Calculations/xlsx) tests threw: "+e.message); }
  /* ---- UK ETS currency (checked 2026-07-16 vs SI 2026/392, in force 1 Jul 2026) ---- */
  try{
    const ukState = y => ({year:y, ship:{typeId:"bulk",capacity:45000}, rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,fuels:[{fuelId:"MDO",tonnes:10}]}]});
    const r26=computeAll(ukState(2026)), r27=computeAll(ukState(2027));
    ckT("UK ETS: UK→UK domestic voyage 100% in scope, GWP 28/265", r26.ukets.tco2e>32 && r26.ukets.active);
    ckT("UK ETS: UK port of call (at berth) 100% in scope",
        computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:[{kind:"port",zone:"UK",poc:true,fuels:[{fuelId:"MDO",tonnes:10}]}]}).ukets.tco2e>32);
    ckT("UK ETS: 2026 half-year (1 Jul–31 Dec) warning shown", r26.warnings.some(w=>/first maritime scheme year is the half-year 1 Jul/.test(w)));
    ckT("UK ETS: NI↔GB / GT / offshore simplifications flagged", r26.warnings.some(w=>/NI↔GB voyages get a 50%/.test(w)));
    ckT("UK ETS: no half-year warning for full-year 2027", !r27.warnings.some(w=>/half-year 1 Jul/.test(w)) && r27.warnings.some(w=>/NI↔GB/.test(w)));
    ckT("UK ETS: not active before 2026", computeAll(ukState(2025)).ukets.active===false);
    /* 2026 half-year gate (SI 2026/392 in force 1 Jul 2026) — DATED rows */
    const ukDated=(a,b,y2)=>({year:y2,ship:{typeId:"bulk",capacity:45000},rows:[{kind:"voyage",from:"UK",to:"UK",dist:500,cargo:0,tStart:a,tEnd:b,fuels:[{fuelId:"MDO",tonnes:10}]}]});
    const full26=r26.ukets.tco2e;   // undated 2026 baseline = full scope
    ckT("UK ETS gate: voyage wholly BEFORE 1 Jul 2026 → 0 in UK scope",
        computeAll(ukDated("2026-03-01T00:00","2026-03-05T00:00",2026)).ukets.tco2e===0);
    ckT("UK ETS gate: voyage wholly ON/AFTER 1 Jul 2026 → full scope",
        Math.abs(computeAll(ukDated("2026-08-01T00:00","2026-08-05T00:00",2026)).ukets.tco2e-full26)<1e-6);
    ckT("UK ETS gate: voyage straddling 1 Jul (29 Jun 00:00→3 Jul 00:00, 4 days; 2 after cut) → 50% time-pro-rated",
        Math.abs(computeAll(ukDated("2026-06-29T00:00","2026-07-03T00:00",2026)).ukets.tco2e-full26*0.5)<full26*1e-3);
    ckT("UK ETS gate: same dated voyage counts FULL in 2027 (no half-year gate)",
        Math.abs(computeAll(ukDated("2027-03-01T00:00","2027-03-05T00:00",2027)).ukets.tco2e-full26)<1e-6);
    ckT("UK ETS gate: pre-1-Jul row still counts for CII (all activity) even when 0 for UK ETS",
        computeAll(ukDated("2026-03-01T00:00","2026-03-05T00:00",2026)).cii.co2_t>30);
    ckT("UK ETS gate: straddling-row warning notes time-pro-ration",
        computeAll(ukDated("2026-06-29T00:00","2026-07-03T00:00",2026)).warnings.some(w=>/time-pro-rated/.test(w)));
  }catch(e){ fail++; out.push("FAIL  UK ETS currency tests threw: "+e.message); }
  const g=(pass+" passed, "+fail+" failed");
  const el=document.getElementById("testout"); el.style.display=""; el.textContent=out.join("\n")+"\n\n"+g;
}

renderWorkspace(); renderVessel();

/* ---------- access gate (deterrent-level; daily rotating code) ---------- */
(function(){
  const _s=[97,117,114,118,105,110];                       // key prefix (char codes)
  function codesFor(offsets){
    return offsets.map(off=>{
      const d=new Date(Date.now()+off*864e5);
      const dd=String(d.getDate()).padStart(2,"0"), mm=String(d.getMonth()+1).padStart(2,"0");
      return String.fromCharCode.apply(null,_s)+dd+mm;     // local date, ±1 day accepted
    });
  }
  async function dig(t){
    const s="emx#v1|"+t;
    try{
      if(window.crypto&&crypto.subtle){
        const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
        return Array.prototype.map.call(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
      }
    }catch(e){}
    let h=2166136261>>>0;                                   // FNV-1a fallback (older engines)
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    return "f"+h.toString(16);
  }
  function unlock(){ const l=document.getElementById("lock"); if(l) l.remove(); document.body.classList.remove("locked"); }
  window.__gateUnlock = unlock; // used by automated self-verification
  async function init(){
    const valid = await Promise.all(codesFor([-1,0,1]).map(dig));
    let stored=null; try{ stored=localStorage.getItem("emx_g"); }catch(e){}
    if(stored && valid.indexOf(stored)>=0){ unlock(); return; }
    const btn=document.getElementById("lockbtn"), pw=document.getElementById("lockpw"), err=document.getElementById("lockerr");
    if(!btn){ unlock(); return; }
    const tryIt=async()=>{
      const h=await dig((pw.value||"").trim().toLowerCase());
      if(valid.indexOf(h)>=0){ try{ localStorage.setItem("emx_g",h); }catch(e){} unlock(); }
      else { err.textContent="Incorrect code — codes change daily."; pw.value=""; pw.focus(); }
    };
    btn.addEventListener("click",tryIt);
    pw.addEventListener("keydown",e=>{ if(e.key==="Enter") tryIt(); });
    pw.focus();
  }
  init();
})();
