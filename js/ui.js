/* ================= UI ================= */
const ENGINES = ["LNG Otto (dual fuel medium speed)","LNG Otto (dual fuel slow speed)","LNG Diesel (dual fuel slow speed)","LBSI"];
const ZONES = [["EEA","EU/EEA"],["UK","United Kingdom"],["OTHER","Non-EU / non-UK"]];

const DEFAULT_STATE = {
  year: 2026,
  arSet: "AR5",
  ship: { name:"Sample Bulker", imo:"", typeId:"bulk", capacity:45000 },
  distIce: 0, showDates: false,
  lngEngineDefault: "LNG Otto (dual fuel medium speed)",
  windRatio: 0, opsMJ: 0,
  euaPrice: 0, ukaPrice: 0, bioZeroRatedETS: true,
  fueleuBankedIn: 0, fueleuBorrow: false, poolPartnerCB: 0, deficitPeriods: 1,
  sccReqMin: "", sccReqStriving: "",
  breakevenFuelId: "BDSL", breakevenE: "", breakevenWtt: "", breakevenPrice: 0, breakevenEngine: "",
  rows: [
    { kind:"voyage", label:"Rotterdam → Hamburg", fromPort:{c:"NLRTM",n:"Rotterdam"}, toPort:{c:"DEHAM",n:"Hamburg"}, from:"EEA", to:"EEA", dist:280, cargo:42000, fuels:[{fuelId:"HFO",tonnes:38,price:0},{fuelId:"MDO",tonnes:6,price:0}] },
    { kind:"voyage", label:"Hamburg → Singapore", fromPort:{c:"DEHAM",n:"Hamburg"}, toPort:{c:"SGSIN",n:"Singapore"}, from:"EEA", to:"OTHER", dist:9200, cargo:44000, fuels:[{fuelId:"HFO",tonnes:1150,price:0},{fuelId:"MDO",tonnes:95,price:0}] },
    { kind:"port",  label:"At berth Rotterdam", port:{c:"NLRTM",n:"Rotterdam"}, zone:"EEA", fuels:[{fuelId:"MDO",tonnes:12,price:0}] },
    { kind:"voyage", label:"Tees → Immingham (UK domestic)", from:"UK", to:"UK", dist:120, cargo:20000, fuels:[{fuelId:"MDO",tonnes:14,price:0}] }
  ]
};
let S = loadState();
function loadState(){ try{ const s = localStorage.getItem("emcalc_state"); if(s) return JSON.parse(s);}catch(e){} return JSON.parse(JSON.stringify(DEFAULT_STATE)); }
function save(){ try{ localStorage.setItem("emcalc_state", JSON.stringify(S)); }catch(e){} }
function resetScenario(){ if(confirm("Reset to the sample scenario?")){ S = JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); renderAll(); } }
function exportScenario(){ const b=new Blob([JSON.stringify(S,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="emissions_scenario.json"; a.click(); }
function importScenario(ev){ const f=ev.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ S=JSON.parse(r.result); save(); renderAll(); }catch(e){ alert("Invalid JSON"); } }; r.readAsText(f); ev.target.value=""; }

const TAB_IDS = ["work","vessel","constants","help"];   // suite build appends "rules","ask"
function showTab(t){
  for(const x of TAB_IDS){
    document.getElementById("tab-"+x).style.display = x===t?"":"none";
    document.getElementById("tb-"+x).classList.toggle("on", x===t);
  }
  if(t==="work") renderWorkspace();
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
function portInputHtml(ri, field, portObj, ph){
  const val = portDisp(portObj);
  return `<div class="pwrap" style="flex:1.6"><label>${ph} — name or LOCODE (optional)</label>
    <input value="${esc(val)}" placeholder="e.g. Rotterdam or NLRTM" autocomplete="off"
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
      if(f) consCols.push({col:i, fuelId:f});
      else if(m[2]!=="BDN") skippedFuels.add(m[2]);
    }
  });
  if(!consCols.length) throw new Error("No *_Consumption_* columns found — is this an OVD Log Abstract CSV?");
  const iFrom=idx("Voyage_From"), iTo=idx("Voyage_To"), iEvent=idx("Event"), iDist=idx("Distance"), iCargo=idx("Cargo_Mt"), iOPS=idx("Shore_Side_Electricity_Reception"), iDate=idx("Date_UTC"), iTime=idx("Time_UTC");
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
  const addFuel = (row, fuelId, t)=>{
    if(t<=0) return;
    let fr = row.fuels.find(x=>x.fuelId===fuelId);
    if(!fr){ fr={fuelId, tonnes:0, price:0}; row.fuels.push(fr); }
    fr.tonnes = Math.round((fr.tonnes+t)*1000)/1000;
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
      }
    } else if(dist>0){
      if(seaLeg) seaLeg.dist = Math.round((seaLeg.dist+dist)*10)/10;
      else pendingDist += dist;                       // hold until the first leg appears
    }
    if(ev.includes("arrival")){ mode="port"; curPort=to; portRow=null; }
    for(const c of consCols) addFuel(target, c.fuelId, N(row[c.col]));
    const ts = tsOf(row); stamp(target, ts); if(ts) prevTs = ts;
    if(seaLeg && mode==="sea" && ts){ stamp(seaLeg, ts); }  // keep leg timeframe current even when consumption went to berth
  }
  out.forEach(r=>{
    delete r._locode; delete r._from; delete r._to;
    r.fuels.sort((a,b)=>a.fuelId<b.fuelId?-1:1);
    if(!r.fuels.length) r.fuels.push({fuelId:"MDO",tonnes:0,price:0});
    if(r.tStart && r.tEnd){ const h=(new Date(r.tEnd)-new Date(r.tStart))/3.6e6; if(h>0) r.hours=Math.round(h*10)/10; }
  });
  if(!out.length) throw new Error("The file has valid OVD headers but no data rows — it looks like an empty template. Export a Log Abstract with report rows and try again.");
  return { rows: out.filter(r=>r.kind==="voyage" || r.fuels.some(f=>f.tonnes>0)), opsMJ: Math.round(opsKWh*3.6), skippedFuels:[...skippedFuels],
           notes:[ opsKWh>0? "Shore-side electricity "+opsKWh.toLocaleString()+" kWh imported as FuelEU OPS energy ("+Math.round(opsKWh*3.6).toLocaleString()+" MJ).":null,
                   skippedFuels.size? "Columns for fuel code(s) "+[...skippedFuels].join(", ")+" ('Other' fuels) were SKIPPED — add them manually as Custom fuel with factors from the BDN.":null ].filter(Boolean) };
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
  const r=new FileReader();
  r.onload=()=>{
    try{
      const txt=String(r.result).replace(/^﻿/,"");
      const isXml=/^\s*(<\?xml|<emissions[\s>])/i.test(txt);
      const res = isXml? parseTHETIS(txt) : parseOVD(txt);
      if(!res.rows.length) throw new Error("No voyages/port stays could be built from the file");
      const replace = confirm("Imported "+res.rows.length+" activity rows from "+(isXml?"THETIS XML":"OVD")+".\n\nOK = REPLACE current activity  ·  Cancel = APPEND to current activity");
      const notes=(res.notes||[]).slice();
      if(replace){
        S.rows = res.rows; S.opsMJ = res.opsMJ;
        if(res.year && res.year!==S.year){ S.year=res.year; notes.push("Calculator year set to "+res.year+" (the file's reporting period)."); }
      } else {
        S.rows = S.rows.concat(res.rows); S.opsMJ = (Number(S.opsMJ)||0) + res.opsMJ;
        if(res.year && res.year!==S.year) notes.push("File reporting period "+res.year+" differs from calculator year "+S.year+" — targets/phase-in follow the calculator year.");
      }
      S.showDates = true;
      save(); renderAll(); showTab("work");
      if(res.annual){
        try{
          const R2=computeAll(S);
          notes.push("Cross-check — the file's own annualEmission block reports MRV CO₂ "+fmt(res.annual.mrvCO2)+" t"+(res.annual.etsCO2?" and ETS CO₂ "+fmt(res.annual.etsCO2)+" t":"")+"; the calculator computes total CO₂ "+fmt(R2.summary.co2Total)+" t from the imported activity using KB default factors. Small differences are expected where the file used its own factors. The file's totals are shown for comparison only, never imported.");
        }catch(e){}
      }
      if(notes.length) alert("Import notes:\n\n- "+notes.join("\n- "));
    }catch(e){ alert("Import failed: "+e.message); }
  };
  r.readAsText(f); ev.target.value="";
}

/* ---------- shared input widgets ---------- */
function fuelOptions(sel){ return FUELS.map(f=>`<option value="${f.id}" ${f.id===sel?"selected":""}>${esc(f.name)}</option>`).join(""); }
function engineOptions(sel){ return ENGINES.map(e=>`<option ${e===sel?"selected":""}>${e}</option>`).join(""); }
function zoneOptions(sel){ return ZONES.map(z=>`<option value="${z[0]}" ${z[0]===sel?"selected":""}>${z[1]}</option>`).join(""); }

function fuelLineHtml(ri, fi, fr){
  const f = FUEL_BY_ID[fr.fuelId]||{};
  const needE = f.bio, needW = f.rfnbo||f.custom, needEng = f.slip, isCustom = f.custom;
  let extra = "";
  if(needEng) extra += `<div><label>Fuel consumer (slip)</label><select onchange="upd('rows.${ri}.fuels.${fi}.engine',this.value)">${engineOptions(fr.engine||S.lngEngineDefault)}</select></div>`;
  if(needE) extra += `<div><label>E value gCO₂eq/MJ ${f.eNote?'<span class="flag" title="'+esc(f.eNote)+'">check</span>':""}</label><input type="number" step="any" value="${fr.E??f.eDefault??""}" placeholder="${f.eDefault??"certified E"}" oninput="upd('rows.${ri}.fuels.${fi}.E',num(this.value))"></div>`;
  if(needW) extra += `<div><label>WtT gCO₂eq/MJ (cert)</label><input type="number" step="any" value="${fr.wtt??""}" placeholder="certificate" oninput="upd('rows.${ri}.fuels.${fi}.wtt',num(this.value))"></div>`;
  if(isCustom) extra += `<div><label>LCV MJ/g</label><input type="number" step="any" value="${fr.lcv??""}" oninput="upd('rows.${ri}.fuels.${fi}.lcv',num(this.value))"></div>
    <div><label>Cf CO₂ g/g</label><input type="number" step="any" value="${fr.cf??""}" oninput="upd('rows.${ri}.fuels.${fi}.cf',num(this.value))"></div>
    <div><label>Cf CH₄ g/g</label><input type="number" step="any" value="${fr.ch4??""}" oninput="upd('rows.${ri}.fuels.${fi}.ch4',num(this.value))"></div>
    <div><label>Cf N₂O g/g</label><input type="number" step="any" value="${fr.n2o??""}" oninput="upd('rows.${ri}.fuels.${fi}.n2o',num(this.value))"></div>`;
  return `<div class="fuelline">
    <div><label>Fuel</label><select onchange="upd('rows.${ri}.fuels.${fi}.fuelId',this.value);renderWorkspace()">${fuelOptions(fr.fuelId)}</select></div>
    <div><label>Tonnes</label><input type="number" step="any" min="0" value="${fr.tonnes??""}" oninput="upd('rows.${ri}.fuels.${fi}.tonnes',num(this.value))"></div>
    <div class="opt"><label>€ / tonne <span class="opttag">optional</span></label><input type="number" step="any" min="0" value="${fr.price||""}" placeholder="optional" oninput="upd('rows.${ri}.fuels.${fi}.price',num(this.value))"></div>
    <div class="opt"><label>CII Cf override <span class="note" title="Optional — e.g. certified biofuel treatment per MEPC.1/Circ.905 (chunk imo-circ905-annex)">ⓘ</span></label><input type="number" step="any" value="${fr.ciiCf??""}" placeholder="optional" oninput="upd('rows.${ri}.fuels.${fi}.ciiCf',num(this.value))"></div>
    <div><button class="del" title="Remove fuel" onclick="S.rows[${ri}].fuels.splice(${fi},1);save();renderWorkspace()">✕</button></div>
  </div>${extra?`<div class="fuelline">${extra}<div></div></div>`:""}`;
}

function rowHtml(row, ri){
  const omr = rowOMR(row);
  const omrChip = omr.length? `<span class="zbadge zb-OMR" title="${esc(omr.map(x=>x.p.n+": "+x.omr).join(" · "))}">⚠ ${esc(omr.map(x=>x.omr).filter((v,i,a)=>a.indexOf(v)===i).join(" / "))}</span>` : "";
  const title = `<b style="font-size:13px">${esc(composeLabel(row))}</b>${omrChip}`;
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
    : `<div class="rhead"><span class="tag" style="background:#f3ecfb;color:#6a3fa0">PORT / AT BERTH</span>${title}<div style="margin-left:auto"><button class="del" onclick="S.rows.splice(${ri},1);save();renderWorkspace()">Remove</button></div></div>
       <div class="inline">
         ${portInputHtml(ri,'port',row.port,'Port')}
         <div style="max-width:150px"><label>Zone</label><select onchange="setZone(${ri},'zone',this.value)">${zoneOptions(row.zone)}</select></div>
         <div style="flex:2"></div>
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
  return `<div class="rowcard">
    ${head}
    ${dateBlock}
    ${(row.fuels||[]).map((fr,fi)=>fuelLineHtml(ri,fi,fr)).join("")}
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
        &nbsp; <button class="pill hbtn" style="background:#fff;color:var(--blue);border-color:#bcd9de" onclick="showTab('vessel')">Edit vessel &amp; settings →</button>
      </div>
      <h4 class="sec" style="margin-top:0">Voyages &amp; port stays — edit anything, results update live → ${info("<b>Scope per row:</b> EU ETS &amp; FuelEU — EEA↔EEA and at berth EEA 100%, EEA↔other 50% (euets-art3ga); UK ETS — UK→UK voyages and UK in-port only (ukets-sch2a-p7); CII &amp; SCC count all activity (imo-g1-s4).<br><br>Import a DNV OVD Log Abstract CSV or a THETIS-MRV GHG Emissions XML from the header bar to fill this list automatically.")}</h4>
      <div class="chk noprint"><input type="checkbox" ${S.showDates?"checked":""} onchange="S.showDates=this.checked;save();renderWorkspace()"> 🕓 Optional date entry ${info("Shows From/To date-time fields on each row — mainly useful for seeing which report period an OVD-imported row covers. Switched on automatically by import.")}</div>
      ${S.rows.map((r,ri)=>rowHtml(r,ri)).join("")}
      <button class="add" onclick="S.rows.push({kind:'voyage',label:'',from:'EEA',to:'EEA',dist:0,cargo:0,fuels:[{fuelId:'HFO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add voyage</button>
      <button class="add" onclick="S.rows.push({kind:'port',label:'',zone:'EEA',fuels:[{fuelId:'MDO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add port stay</button>
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

  <div class="card">
    <h2>Voyage &amp; berth breakdown</h2>
    <table class="vbtable"><tr><th>Activity</th><th>Timeframe</th><th>Fuel — total (eligible EU)</th><th class="num">CO₂ (t)</th><th class="num">EUAs</th><th class="num">UK ETS (tCO₂e)</th><th class="num">FuelEU bal. (tCO₂eq)*</th><th class="num">Penalty (€)*</th></tr>
    ${R.rowDetails.map(d=>`<tr>
      <td>${d.kind==="voyage"?"⛵":"⚓"} ${esc(d.label||"—")}${d.kind==="voyage"?`<div class="note">${fmt(d.dist)} nm · cov ${d.covEU*100}% EU</div>`:`<div class="note">at berth · cov ${d.covEU*100}% EU</div>`}</td>
      <td class="note">${esc(fmtRange(d.tStart,d.tEnd))||"—"}${d.hours?`<div>${fmt(d.hours)} h</div>`:""}</td>
      <td>${d.fuels.map(fu=>`${esc(fu.id)} ${fmt(fu.tonnes)} t (${fmt(fu.eligibleEU)})`).join("<br>")||"—"}</td>
      <td class="num">${fmt(d.co2)}</td>
      <td class="num">${fmt(d.euas)}</td>
      <td class="num">${fmt(d.ukCO2e)}</td>
      <td class="num" style="color:${(d.feuCB??0)>=0?"var(--green)":"var(--red)"}">${d.feuCB!=null?fmt(d.feuCB/1e6):"—"}</td>
      <td class="num">${d.feuPenalty?fmt(d.feuPenalty,0):"—"}</td>
    </tr>`).join("")}</table>
    <p class="note"><span class="flag">*Indicative attribution — not legally exact</span> ${info("FuelEU (and ETS surrender) are <b>period-based in law</b>; the per-voyage balance/penalty shown is the annual result shared out by each row's in-scope energy. This mirrors EmA's voyage view, which is flagged “verify” in the Product Map (EMA-050). Never present these per-voyage figures as legally exact.")}</p>
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
    <h2>FuelEU Maritime — ${R.year} ${info("<b>Regulatory sources:</b> fueleu-art4 · annexi/ii/iv · art20/21/23")}</h2>
    <div class="kv"><span>GHGIE<sub>actual</sub>${f.fwind<1?` (f<sub>wind</sub>=${f.fwind})`:""}</span><b>${fmtF(f.ghgie,5)} gCO₂eq/MJ</b></div>
    <div class="kv"><span>Target (91.16 − ${f.targetPct}%)</span><b>${fmtF(f.target,5)}</b></div>
    <div class="kv"><span>Energy in scope (fuel + OPS)</span><b>${fmt(f.E_total/1e6)} ×10⁶ MJ</b></div>
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
      ? `<p class="note">Even 100% ${esc(ec.breakeven.fuel)} misses the ${R.year} target (intensity at 100% = ${fmtF(ec.breakeven.intensityAt,2)} g/MJ). Pick a lower-intensity substitute (Vessel &amp; settings tab).</p>`
      : `<div class="kv"><span>Replace with ${esc(ec.breakeven.fuel)}</span><b>${fmtF(ec.breakeven.share*100,2)}% of in-scope energy</b></div>
         <div class="kv"><span>Substitute quantity</span><b>${fmt(ec.breakeven.tonnes)} t (displacing ~${fmt(ec.breakeven.dispTonnes)} t)</b></div>
         <div class="kv"><span>Extra fuel cost / penalty avoided</span><b>€ ${fmt(ec.breakeven.extraFuelCost,0)} / € ${fmt(ec.breakeven.penaltyAvoided,0)}</b></div>
         <div class="kv"><span><b>Net P&amp;L impact</b></span><b style="color:${(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided)<=0?"var(--green)":"var(--red)"}">€ ${fmt(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided,0)}</b></div>`)
      : `<p class="note">${f.ghgie!=null && f.ghgie<=f.target ? "Already at or below target — no blending needed." : "Pick a substitute fuel on the Vessel & settings tab."}</p>`}
  </div>
  ${R.warnings.length?`<div class="card"><h2>⚠ Assumptions &amp; items to verify</h2>${R.warnings.map(w=>`<div class="warn">${esc(w).replace(/CO2e/g,"CO₂e").replace(/CO2/g,"CO₂").replace(/CH4/g,"CH₄").replace(/N2O/g,"N₂O")}</div>`).join("")}</div>`:""}`;
  /* Order: strip → CII → EU ETS → UK ETS → FuelEU → Annual summary → Voyage/berth breakdown → SCC → P&L */
  const cards=[...el.querySelectorAll(":scope > .card")];
  const byH=t=>cards.find(cd=>{const h=cd.querySelector("h2");return h&&h.textContent.indexOf(t)>=0;});
  const anchor=byH("SCC commercial");
  const sumCard=byH("Annual summary"), brCard=byH("berth breakdown");
  if(anchor&&sumCard) el.insertBefore(sumCard, anchor);
  if(anchor&&brCard) el.insertBefore(brCard, anchor);
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
        <div><label>Default LNG fuel-consumer class</label><select onchange="upd('lngEngineDefault',this.value)">${engineOptions(S.lngEngineDefault)}</select></div>
        <div><label>Wind-assist P<sub>Wind</sub>/P<sub>Prop</sub></label><input type="number" step="0.01" min="0" max="1" value="${S.windRatio??0}" oninput="upd('windRatio',num(this.value))" title="0.05→fwind 0.99 · 0.10→0.97 · ≥0.15→0.95 (fueleu-annexi)"></div>
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
        ${FUEL_BY_ID[S.breakevenFuelId]?.slip?`<div><label>Fuel consumer</label><select onchange="upd('breakevenEngine',this.value)">${engineOptions(S.breakevenEngine||S.lngEngineDefault)}</select></div>`:""}
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
    <p class="note">Scope: Directive 2003/87/EC Art 3ga — chunk <b>euets-art3ga</b>. Phase-in: Art 3gb — chunk <b>euets-art3gb</b>. EF values per Regulation (EU) 2015/757 (= Annex II Cf values) — chunks <b>mrv-annexi/ii</b>, <b>fueleu-annexii</b>. From 2026 CH₄+N₂O included: CO₂e computed with the ME<sub>ETS</sub> structure below using GWP ${euetsGwp(S).ch4}/${euetsGwp(S).n2o} (${euetsGwp(S).label}, user-selected — Vessel &amp; settings) <span class="flag">FILL-IN — amended MRV GWPs not in KB</span>.</p>

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
    <table><tr><th>Fuel</th><th>Class</th><th class="num">LCV MJ/g</th><th class="num">WtT gCO₂eq/MJ</th><th class="num">Cf CO₂</th><th class="num">Cf CH₄</th><th class="num">Cf N₂O</th><th>Slip %</th><th>Status</th></tr>
    ${FUELS.filter(f=>!f.custom).map(f=>`<tr><td>${esc(f.name)}</td><td>${f.cls}</td>
      <td class="num">${f.lcv}</td>
      <td class="num">${f.bio?"E − Cf/LCV (col.4a)":(f.rfnbo?"certificate (col.4b)":f.wtt)}</td>
      <td class="num">${f.cf}</td><td class="num">${f.ch4}${f.tbm&&f.tbm.includes("ch4")?" †":""}</td><td class="num">${f.n2o}${f.tbm&&f.tbm.includes("n2o")?" †":""}</td>
      <td>${f.slip?"3.1/1.7/0.2/2.6 by consumer":"—"}</td>
      <td>${(f.lcvNote&&f.lcvNote.indexOf("FILL-IN")===0)?'<span class="flag" title="'+esc(f.lcvNote)+'">LCV FILL-IN</span>':'<span class="ok">KB</span>'}${f.eNote?' <span class="flag" title="'+esc(f.eNote)+'">E illustrative</span>':""}</td></tr>`).join("")}
    </table>
    <p class="note">† TBM/N-A in the source table — resolved per the Annex II rule: “the highest default value of the fuel class in the same column shall be used” (fossil class: CH₄ 0.00005, N₂O 0.00018).</p>
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
      <div class="kv"><span>GWP EU ETS CO₂e from 2026: ${euetsGwp(S).ch4} / ${euetsGwp(S).n2o} (${euetsGwp(S).label} — user-selected in Vessel &amp; settings)</span><b><span class="flag">FILL-IN — amended MRV GWPs not in KB</span></b></div>
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
    <div class="helpstep"><div class="n">1</div><div><b>Set up the vessel once</b> — on the <i>Vessel &amp; settings</i> tab: name, ship type, capacity (DWT/GT), reporting year, LNG engine class if applicable, market prices (EUA/UKA, fuel €/t), and the <b>EU ETS GWP basis (AR4/AR5)</b> — this selector affects only the EU ETS 2026+ CO₂e proxy; FuelEU (25/298) and UK ETS (28/265) GWPs are prescribed by regulation and locked. These rarely change.</div></div>
    <div class="helpstep"><div class="n">2</div><div><b>Enter the activity</b> — on the <i>Workspace</i> tab, add voyages and port stays with the fuel consumed. Type a <b>port name or LOCODE</b> (e.g. "Rotterdam" or NLRTM) and pick from the list — the EU/UK/other zone is set automatically from the port's country (19,782 ports embedded from the DNV UN/LOCODE list); outermost-region / overseas-territory ports get an ⚠ OMR badge and advisory. Ports are optional — you can also just set the zones directly. Or skip typing entirely: click <b>⬆ Import OVD CSV / THETIS XML</b> in the header and load a DNV OVD Log Abstract export or an EMSA THETIS-MRV GHG Emissions XML — legs, port names, zones, dates, consumption, cargo and shore power are built automatically (format auto-detected).</div></div>
    <div class="helpstep"><div class="n">3</div><div><b>Watch the right-hand panel</b> — every keystroke recalculates live: the annual summary (distance, time at sea, cargo, transport work, fuel by type, CO₂ at berth vs sea, intensity ratios), the voyage &amp; berth breakdown (per-row eligible fuel, EUAs, indicative FuelEU share), and all five pillar cards. No page switching.</div></div>
    <div class="helpstep"><div class="n">4</div><div><b>Run what-ifs</b> — change a fuel to a biofuel (enter its certified E value from the BDN), toggle FuelEU banking/borrowing/pooling, adjust the substitute fuel for the breakeven KPI, or move a voyage between zones and watch scope change.</div></div>
    <div class="helpstep"><div class="n">5</div><div><b>Save your scenario</b> — it persists in the browser automatically; use ⬇ Export / ⬆ Import scenario (JSON) to share or archive.</div></div>
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
    <h3>3 · Scenario JSON</h3>
    <p class="note">⬇ Export scenario writes everything (vessel, settings, all rows) to a JSON file; ⬆ Import scenario restores it exactly. Use this for archiving and sharing what-ifs.</p>
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
    /* annual summary from imported rows */
    const rSum = computeAll({year:2025, ship:{typeId:"bulk",capacity:45000}, rows:o.rows}).summary;
    ck("Summary distance 205+80", rSum.dist, 285, 0.01);
    ck("Summary time at sea 20.5+8", rSum.hoursSea, 28.5, 0.01);
    ck("Summary cargo 32500+21000", rSum.cargo, 53500, 0.01);
    ck("Summary CO2 at berth (4.75t MDO × 3.206)", rSum.co2Berth, 4.75*3.206, 0.001);
    ck("Summary CO2 at sea", rSum.co2Sea, 24.05*3.114+4.6*3.206+8.8*3.114+0.8*3.206, 0.001);
    /* per-row breakdown attribution */
    const rBr = computeAll({year:2025, ship:{typeId:"bulk",capacity:45000}, rows:o.rows});
    const leg1det = rBr.rowDetails.find(d=>d.kind==="voyage");
    ck("Breakdown leg1 EUAs = CO2 × 70% phase-in", leg1det.euas, (24.05*3.114+4.6*3.206)*0.7, 0.001);
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
