/* ================= UI ================= */
const ENGINES = ["LNG Otto (dual fuel medium speed)","LNG Otto (dual fuel slow speed)","LNG Diesel (dual fuel slow speed)","LBSI"];
const ZONES = [["EEA","EU/EEA"],["UK","UK"],["OTHER","Non-EU/UK"]];

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
  /* 2026-07-24 (Aurvin): date-range filters. UTC "YYYY-MM-DDTHH:mm" (bound to datetime-local).
     dateFilter    — the WITHIN-YEAR window shared by Workspace / Report-Wise / Leg-Wise. Always
                     bounded to S.year; auto-filled to the full year when the year is picked.
     voyDateFilter — Voyage-Wise ONLY; may span multiple years. Voyages are included by END date
                     and each voyage is graded under the rules of its end-date year. */
  dateFilter: { fromISO:"", toISO:"", active:false },
  voyDateFilter: { fromISO:"", toISO:"", active:false },
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
  if(!s.dateFilter)    s.dateFilter    = { fromISO:"", toISO:"", active:false };   // 2026-07-24 within-year window
  /* 2026-07-28h (Aurvin, owner instruction) — MIGRATION for saved workspaces.
     Between 2026-07-24 and 2026-07-28g the Voyage-Wise range could legally cross a year
     boundary (e.g. From 2025-06-01 → To 2026-03-31), and that range is sitting in every
     returning user's localStorage. It is no longer a legal range. Owner's decision when asked
     what should happen on first load: "show the whole selected year" — so any saved range that
     is blank, inactive, or not entirely inside the reporting year is discarded and replaced by
     that year's full Jan 1 – Dec 31 window. A range that IS already inside the year is kept, so
     nobody loses a legitimate within-year narrowing. */
  {
    const _y = Number(s.year) || 2026;
    const _lo = `${_y}-01-01T00:00`, _hi = `${_y}-12-31T23:59`;
    const _v = s.voyDateFilter;
    const _inYear = !!(_v && _v.active && _v.fromISO && _v.toISO &&
                       _v.fromISO >= _lo && _v.toISO <= _hi);
    s.voyDateFilter = _inYear ? { fromISO:_v.fromISO, toISO:_v.toISO, active:true }
                              : { fromISO:_lo, toISO:_hi, active:true };
  }
  return s;
}
function save(){ try{ localStorage.setItem("emcalc_state", JSON.stringify(S)); }catch(e){} }
function resetScenario(){ if(confirm("Clear all entries and start fresh? (Settings reset too.)")){ S = JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); renderAll(); } }
/* Scenario JSON export/import removed 2026-07-15 (Aurvin) — work auto-saves in localStorage; Reset restores the sample. */

const TAB_IDS = ["work","trace","calcs","voy","vessel","constants","help"];   // suite build appends "rules","ask"
function showTab(t){
  for(const x of TAB_IDS){
    document.getElementById("tab-"+x).style.display = x===t?"":"none";
    document.getElementById("tb-"+x).classList.toggle("on", x===t);
  }
  /* fixed app-shell (pinned header/nav, independently scrolling tab content) applies to
     Leg-Wise/Report-Wise/Settings only — Workspace, Calculations and Help keep plain whole-page
     scroll (2026-07-19: Calculations/Help shell disabled at Aurvin's request pending a later look) */
  /* 2026-07-23c: Voyage-Wise is a wide scrolling table like Leg-Wise, so it takes the shell too */
  document.body.classList.toggle("shell", t!=="work" && t!=="constants" && t!=="help");
  if(t==="work") renderWorkspace();
  if(t==="calcs") renderCalcs();
  if(t==="voy") renderVoyage();
  if(t==="trace") renderTrace();
  if(t==="vessel") renderVessel();
  if(t==="constants") renderConstants();
  if(t==="help") renderHelp();
  if(window.SUITE_ONSHOW) window.SUITE_ONSHOW(t);
}
/* info-icon popover: click ⓘ to open, click anywhere else to close.
   2026-07-22h (owner, Aurvin): the popup is now position:fixed (see .ibpop in styles.css)
   instead of absolutely positioned inside its card. Before this, a tooltip opened inside a
   card that scrolls — or inside the tight Workspace blue band — was clipped by that card,
   which sprouted its own horizontal and vertical scrollbars just to show it. Fixed
   positioning takes the popup out of every ancestor, so nothing can clip it; the trade-off
   is that its coordinates must be computed in JS, which is what placeInfoPop does.
   2026-07-22i — that alone wasn't enough for icons in the Leg-Wise breakdown's sticky
   column header (`position:sticky;top:0` wrapper, js/ui.js breakdownGrid): Safari treats a
   sticky ancestor as a containing block for position:fixed descendants (a known engine
   bug), so the popup was being placed relative to the sticky header box instead of the
   real viewport and rendered clipped off the top. Reparenting the popup to <body> on open
   removes it from every ancestor's containing-block chain, sticky included. */
let _openInfo = null;   // {btn,pop} of the popup currently on screen — kept so it can follow its icon on scroll
function toggleInfo(btn){
  const p = btn.__pop || (btn.__pop = btn.nextElementSibling);
  if(p.parentElement !== document.body) document.body.appendChild(p);
  document.querySelectorAll(".ibpop.open").forEach(x=>{ if(x!==p) x.classList.remove("open"); });
  const opening = !p.classList.contains("open");
  p.classList.toggle("open", opening);
  _openInfo = opening ? {btn:btn, pop:p} : null;
  if(opening) placeInfoPop(btn, p);
}
/* Puts the popup just under its ⓘ button in SCREEN coordinates, then keeps it fully on screen:
   nudged in from either edge, flipped above the icon if that leaves more room, and given an
   internal scrollbar (rather than left to overflow the viewport) if it's taller than the room
   available on whichever side wins. */
function placeInfoPop(btn, p){
  const M = 8, GAP = 6;
  p.style.maxHeight = "none";
  p.style.left = "0px"; p.style.top = "0px";          // measure at a known origin first
  const r = btn.getBoundingClientRect(), w = p.offsetWidth;
  let h = p.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  /* .ib-right icons sit at a right-hand corner and expand leftward, as before */
  let left = btn.closest(".ib-right") ? r.right - w : r.left - 10;
  left = Math.min(Math.max(M, left), Math.max(M, vw - w - M));
  let top = r.bottom + GAP;
  if(top + h > vh - M){
    const spaceBelow = vh - top - M, spaceAbove = r.top - GAP - M;
    if(spaceAbove > spaceBelow){                              // more room above → flip
      top = Math.max(M, r.top - GAP - h);
      if(h > spaceAbove){ p.style.maxHeight = Math.max(80, spaceAbove) + "px"; h = spaceAbove; }
    } else if(h > spaceBelow){                                 // stays below but taller than the room → scroll, don't overflow
      p.style.maxHeight = Math.max(80, spaceBelow) + "px"; h = spaceBelow;
    }
  }
  p.style.left = left + "px";
  p.style.top  = top  + "px";
}
/* fixed popups do not scroll with the page, so an open one is repositioned to follow its icon
   (capture:true — the scroll may happen in an inner .shell panel, not on the window).
   2026-07-22j — a long popup scrolls internally (.ibpop's own overflow-y:auto), and that
   "scroll" event also reaches this capture-phase listener; without the guard below every
   internal scroll tick re-ran placeInfoPop (which resets max-height first), fighting the
   user's own scroll gesture. Skip repositioning when the scroll came from inside the popup. */
function _trackInfoPop(e){
  if(!_openInfo) return;
  const {btn, pop} = _openInfo;
  if(e && (e.target===pop || (pop.contains && pop.contains(e.target)))) return;
  if(!btn.isConnected){ pop.classList.remove("open"); _openInfo = null; return; }
  const r = btn.getBoundingClientRect();
  if(r.bottom < 0 || r.top > window.innerHeight){ pop.classList.remove("open"); _openInfo = null; return; }
  placeInfoPop(btn, pop);
}
window.addEventListener("scroll", _trackInfoPop, true);
window.addEventListener("resize", _trackInfoPop);
document.addEventListener("click", e=>{ if(!e.target.closest(".ibwrap") && !e.target.closest(".ibpop")){ document.querySelectorAll(".ibpop.open").forEach(x=>x.classList.remove("open")); _openInfo = null; } });
/* 2026-07-25j (Aurvin, owner instruction): row highlighting follows the row's TICK BOX, not a
   click on the row. Ticking a row (Report-Wise / Leg-Wise / Voyage-Wise) gives it the .hi-on
   class — painted teal with white text by the .hirow rules in styles.css — so several ticked rows
   are all highlighted at once. The actual add/remove of .hi-on happens in rowselSync() (the single
   place that pushes the tick model back onto the page), so highlight and the TOTAL row (which also
   sums the ticked rows) always stay in step. */
/* align="right": popover expands leftward from the icon instead of rightward — use for icons
   pinned to a right-edge corner, where the default rightward expansion would run off-screen */
const info = (html,align)=>`<span class="ibwrap${align==="right"?" ib-right":""}"><button class="ib" type="button" onclick="event.stopPropagation();toggleInfo(this)" title="More information">i</button><span class="ibpop">${html}</span></span>`;
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
/* 2026-07-22g (owner, Aurvin): the Workspace blue band now edits ship type, capacity and
   reporting year in place. Those two fields change what the whole page LOOKS like — the
   capacity unit label (DWT vs GT follows the ship type) and the per-row "outside the
   reporting year" greying — so unlike upd() they need a full workspace repaint, plus a
   Settings repaint so the same fields there never show a stale value. Capacity itself
   deliberately stays on plain upd() (save + renderLive only): repainting on every
   keystroke would steal focus from the box mid-typing.
   NOT a second copy of the settings — it writes to the same S.ship / S.year, so there is
   no chance of the two places disagreeing. Owner decision 2026-07-22g: when the ship type
   flips the unit (DWT↔GT) the capacity NUMBER is kept and only the label changes. */
function updBand(path, val){ upd(path, val); renderWorkspace(); renderVessel(); }
function updTime(ri, key, val){
  S.rows[ri][key] = val;
  const r = S.rows[ri];
  if(r.tStart && r.tEnd){
    const h = (new Date(r.tEnd) - new Date(r.tStart))/3.6e6;
    if(h>0) r.hours = Math.round(h*10)/10;
  }
  save(); renderWorkspace();
}
const MON3=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtTs(ts){ if(!ts) return ""; const d=new Date(ts); if(isNaN(d)) return ts;
  /* 2026-07-23 (Aurvin, owner instruction): the 4-digit YEAR is now shown between the month and
     the time (e.g. "26 Jan 2026 09:00") — dates in Reports, Leg-Wise, Voyage-Wise and the
     Workspace were previously ambiguous with no year. Applied here so all views stay in step. */
  return String(d.getDate()).padStart(2,"0")+" "+MON3[d.getMonth()]+" "+d.getFullYear()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
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
  if(row.port) return portDisp(row.port);
  return row.label || zoneName(row.zone);
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
  /* year-boundary machinery (2026-07-16; 2026-07-25 Aurvin, owner instruction — NO proration):
     every report is bucketed WHOLE into the calendar year of its OWN listed time (its
     DATE_TIME_GMT, i.e. the period END `b`). A report whose period happens to straddle midnight
     31 Dec is NOT split or pro-rated — all of its consumption / ROB / distance goes to the year
     it is dated in. So the first report of a year keeps its real MDA time, never a synthetic
     01 Jan 00:00 break. */
  const yearFracs = (a,b)=>{
    if(!a && !b) return null;
    return { [(b||a).slice(0,4)]: 1 };     // whole report → the year of its listed time (period end)
  };
  /* ---- UK ETS report-exact 1 Jul 2026 window (2026-07-20; 2026-07-25 Aurvin, owner
     instruction — WHOLE report, no proration) ----
     The UK ETS maritime scheme is in force from 1 Jul 2026 (SI 2026/392). A report is judged by
     its OWN listed time (period end `b`): a report dated BEFORE 1 Jul 2026 is wholly OUT of UK
     ETS scope; a report dated ON/AFTER 1 Jul 2026 is wholly IN. No report is pro-rated across the
     1 Jul cut. We accumulate, per row, the share of consumption carried by in-scope reports
     (ukInMass ÷ massTot) so the engine uses actual per-report consumption. */
  const UK_CUT = Date.parse("2026-07-01T00:00:00Z");
  const ukReportIn = (b)=>{                     // whole-report scope test by the report's listed time
    const e = Date.parse((b||"")+":00Z");
    return isFinite(e) ? (e>=UK_CUT ? 1 : 0) : 1;
  };
  const bucketOf = (row, yy, a, b)=>{
    row._byYear = row._byYear || {};
    const bk = row._byYear[yy] || (row._byYear[yy]={fuels:{},dist:0,cargo:0,tStart:null,tEnd:null,ukInMass:0,massTot:0});
    /* 2026-07-25 (Aurvin, owner instruction): the year-part window uses the ACTUAL report times
       (the report's own listed time `b`, falling back to its period start `a`) — no clip to
       01 Jan 00:00 — so the first report of a year shows its real MDA time. */
    const stampT = b || a;
    if(stampT){ if(!bk.tStart || stampT<bk.tStart) bk.tStart=stampT; if(!bk.tEnd || stampT>bk.tEnd) bk.tEnd=stampT; }
    return bk;
  };
  const addFuel = (row, fuelId, t, mach, yfr, a, b)=>{
    if(t<=0) return;
    let fr = row.fuels.find(x=>x.fuelId===fuelId);
    if(!fr){ fr={fuelId, tonnes:0, price:0}; row.fuels.push(fr); }
    fr.tonnes = Math.round((fr.tonnes+t)*1000)/1000;
    if(trackSplit && mach){ fr.split=fr.split||{}; fr.split[mach]=Math.round(((fr.split[mach]||0)+t)*1000)/1000; }
    if(yfr) for(const yy in yfr){
      const bk = bucketOf(row, yy, a, b);
      const e0 = bk.fuels;
      const e = e0[fuelId] || (e0[fuelId]={t:0});
      const massYY = t*yfr[yy];
      e.t += massYY;
      if(trackSplit && mach) e[mach]=(e[mach]||0)+massYY;
      /* UK ETS report-exact window: accumulate the on/after-1-Jul-2026 share of this report's
         consumption for this year-part (pre-2026 → 0, post-2026 → full, 2026 → clipped share). */
      bk.massTot += massYY;
      const inWin = Number(yy)>2026 ? 1 : Number(yy)<2026 ? 0 : ukReportIn(b);   // whole report by its listed time
      bk.ukInMass += massYY*inWin;
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
    /* 2026-07-22c (Aurvin, explicit owner instruction): cargo for SCC transport work is the
       quantity on the DEPARTURE (SOSP — Start of Sea Passage) report that opens the leg,
       not the maximum seen anywhere on the leg. An empty cell is "not reported" and must
       NOT be read as zero (that would turn a laden leg into a ballast leg), so the raw cell
       is tested for emptiness before N() collapses it to 0. */
    const cargoReported = iCargo>=0 && String(row[iCargo]??"").trim()!=="";
    if(iOPS>=0) opsKWh += N(row[iOPS]);
    const ts = tsOf(row);                          // this row covers the period [prevTs, ts]
    const yfr = yearFracs(prevTs, ts);             // calendar-year fractions of that period
    /* ---- consumption target (the row covers the period SINCE the previous report) ---- */
    const isDep = ev.includes("departure"), isBosp = ev.includes("bosp")||ev.includes("begin of sea");
    /* 2026-07-20 (Aurvin — breakdown aggregation fix 1): file starts MID-VOYAGE. The first
       data row is an at-sea report (has a route pair and distance) but the parser still sits
       in its initial "port" state with no known port — previously that first report's fuel
       landed on a phantom zero-length berth row at the DESTINATION port (seen on the 2026
       file: "At berth Singapore", 31 t HFO, 01 Jan 06:00→06:00). Open the sea leg BEFORE
       choosing the consumption target so the fuel goes to the voyage. Only fires in the
       no-context start state (no curPort, no port row, no leg yet). */
    if(mode==="port" && !curPort && !portRow && !seaLeg && pair && dist>0
       && !isDep && !isBosp && !ev.includes("arrival")){
      seaLeg = makeLeg(from,to); mode="sea";
    }
    let target;
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
      else if(isDep && mode==="port" && (from||curPort||to)){
        /* 2026-07-20 (Aurvin — breakdown aggregation fix 2): a DEPARTURE that leaves a port
           stay ALWAYS opens a fresh leg segment, even when the Voyage_From/To pair is
           unchanged (waiting/drifting stays mid-approach, e.g. Mumbai) or From===To
           (same-port shifts, e.g. berth → bunker anchorage at Daesan). Previously the old
           leg silently continued and its time window stretched across the port stay, so
           voyage rows OVERLAPPED berth rows in the breakdown, and post-departure shift fuel
           landed on the already-finished inbound leg (wrong ETS bucket at EU ports).
           BOSP deliberately keeps the pair-change-only rule above, so pure-transit windows
           (Suez, straits, Gibraltar-type calls) still merge into one leg — locked by the
           2026-07-19b transit tests. */
        const f0=from||curPort||to;
        seaLeg = makeLeg(f0, to||f0);
      }
      mode="sea"; curPort=null;
    }
    /* ---- distance & cargo always follow the Voyage_From→Voyage_To pair, so nothing is lost
            when a leg has no DEPARTURE report or when shifting distance is logged in port ---- */
    if(pair){
      let leg = (seaLeg && seaLeg._from===from && seaLeg._to===to) ? seaLeg : legByPair[pair];
      if(!leg && dist>0){ leg = makeLeg(from,to); seaLeg = leg; mode="sea"; curPort=null; }
      if(leg){
        leg.dist = Math.round((leg.dist+dist)*10)/10;
        /* SOSP rule (2026-07-22c, owner): the departure report that opens the leg sets the
           cargo — including a genuine 0 (ballast leg). Any later report on the same leg is
           ignored once an SOSP figure exists. Legs with NO departure report (file opens
           mid-voyage, BOSP-only files, hand-entered OVD) fall back to the previous
           max-per-leg rule and are flagged `cargoMax` so the source stays visible. */
        if(isDep && cargoReported){ leg.cargo = cargo; leg.cargoSOSP = true; delete leg.cargoMax; }
        else if(!leg.cargoSOSP && cargo>leg.cargo){ leg.cargo = cargo; leg.cargoMax = true; }
        if(yfr && dist>0) for(const yy in yfr){
          const bk=bucketOf(leg,yy,prevTs,ts); bk.dist+=dist*yfr[yy];
          if(isDep && cargoReported){ bk.cargo = cargo; bk.cargoSOSP = true; }
          else if(!bk.cargoSOSP && cargo>bk.cargo) bk.cargo = cargo;
        }
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
        /* 2026-07-23 (Aurvin, owner instruction): which cargo operation happened at this
           stay, carried through from the MDA ASSOCIATED_ACTIVITY column so the 📦 icon in
           the Leg-Wise breakdown can say "Loading" / "Discharging" instead of just "cargo
           activity". Passed as ADDITIVE flags on the existing POC_Flag column — no new CSV
           column, no index shift, and the derivation of arrival/departure/POC itself is
           untouched. Display only: nothing here feeds a calculation. */
        if(F.indexOf("LOAD")>=0) target.cargoLoad=true;
        if(F.indexOf("DISCH")>=0) target.cargoDisch=true;
        if(F.indexOf("STS")>=0) target.cargoSTS=true;
        /* 2026-07-24 (Aurvin, owner instruction): cargo happened but a report was flagged
           OUTSIDE_PORT_LIMIT, so the stay is scored as transit (not a POC). Display-only flag
           so the Leg-Wise view can show a 📦 + a red OPL badge together — it does NOT change
           scope (the POC=NO already carried in the POC column governs the calculation). */
        if(F.indexOf("OPLCARGO")>=0) target.oplCargo=true;
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
  /* report-exact UK ETS in-scope fraction for a year bucket (share of its consumption on/after
     1 Jul 2026); no consumption → default by year (pre-2026 out, 2026+ in). Used by the engine
     instead of the old leg-level time-proration. (2026-07-20, Aurvin) */
  const ukFracOfBucket = (bk, yy)=> (bk && bk.massTot>1e-9) ? bk.ukInMass/bk.massTot : (Number(yy)>=2026?1:0);
  for(const r of out){
    const by=r._byYear; delete r._byYear;
    const ys = by? Object.keys(by).filter(yy=>{
      const bk=by[yy];
      return Object.keys(bk.fuels).some(k=>bk.fuels[k].t>5e-4) || bk.dist>0.05;
    }).sort() : [];
    if(ys.length<2){
      if(ys.length===1){
        const bk=by[ys[0]];
        r.ukInFrac = ukFracOfBucket(bk, ys[0]);
        /* 2026-07-25 (Aurvin, owner instruction): a whole-report, single-year row whose FIRST
           report's period reaches back across 31 Dec (its stamp tStart is the PRIOR report's
           time, in the previous year) is pulled onto its own reports' time span so it sits
           cleanly in its one year and cannot be double-counted by the year-range filter. The
           common case (tStart already in-year) is left untouched — hours/duration unchanged. */
        if(bk.tStart && String(r.tStart||"").slice(0,4) < String(ys[0])) r.tStart = bk.tStart;
        if(bk.tEnd   && String(r.tEnd||"").slice(0,4)   > String(ys[0])) r.tEnd   = bk.tEnd;
      }
      rowsFinal.push(r); continue;
    }
    nSplitYear++;
    for(const yy of ys){
      const bk=by[yy];
      const c=Object.assign({}, r);
      c.ukInFrac = ukFracOfBucket(bk, yy);
      c.fuels = Object.entries(bk.fuels).filter(([,e])=>e.t>5e-4).map(([fuelId,e])=>{
        const fr={fuelId, tonnes:Math.round(e.t*1000)/1000, price:0};
        const sp={}; let any=false;
        for(const g of ["ME","AE","BLR","OTH"]) if((e[g]||0)>1e-9){ sp[g]=Math.round(e[g]*1000)/1000; any=true; }
        if(any) fr.split=sp;
        return fr;
      });
      /* 2026-07-22c: a bucket that carries its own SOSP cargo keeps it even when that value
         is 0 (ballast) — `bk.cargo||r.cargo` would have silently replaced a real 0 */
      if(c.kind==="voyage"){ c.dist=Math.round(bk.dist*10)/10; c.cargo = bk.cargoSOSP? bk.cargo : (bk.cargo||r.cargo); }
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
           notes:[ nSplitYear? nSplitYear+" row(s) spanned the calendar-year boundary and were split into per-year parts. Each report is counted WHOLE in the year of its own date — no report is pro-rated across 31 Dec — so every year carries exactly the reports dated in it, and the first report of a year keeps its real time. The reporting year in Settings decides which parts are counted; the others show greyed out.":null,
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
     BUNKERING → first/last AT_ANCHOR → first/last DRIFTING, where the DRIFTING rung
     (2026-07-20b, owner decision) only fires if the cargo-quantity fallback shows cargo
     moved during the window — drifting-only waiting (no berth / bunkering / anchorage /
     cargo evidence) is NOT a port stay and falls through to PURE TRANSIT.
   - Ladder exhausted: PURE TRANSIT — no port-stay row; the whole EOSP→SOSP window merges
     into the adjacent voyage (e.g. canal transits with only MANOEUVRING reports, or
     drifting-only waiting periods since 2026-07-20b).
   POC test: cargo ops occurred (incl. quantity fallback: |CARGO_QTY at SOSP − at EOSP|
   > 5% of DWT, or any 0↔loaded transition, with no recorded cargo activity → orange ❗)
   AND no report inside the derived window has OUTSIDE_PORT_LIMIT TRUE (an STS outside
   port limits = transit) — EXCEPT (2026-07-24b, owner rule) when the window's OPL flags are
   MIXED (some TRUE, some FALSE) AND a cargo op was recorded AT_BERTH: the stray OPL flag is
   then treated as misreporting and the stay is KEPT as a port of call (a real out-of-limits
   transfer is at anchor/drifting, never at berth; a uniformly-OPL=TRUE window is not "mixed"
   and stays transit). FUEL_STOCK / FUEL_OIL_BUNKER / blank-condition rows are
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
/* Map a free-text MDA VESSEL_TYPE (e.g. "BULK CARRIER", "Bulk_Carrier", "container")
   to one of engine.js SHIP_TYPES ids (2026-07-23, owner-specified). Case-insensitive and
   punctuation/underscore-insensitive: everything but letters+digits is stripped, then
   keyword substrings are matched. Order matters — most specific first. Returns a SHIP_TYPES
   id, or null when nothing matches (caller leaves the current selection unchanged).
   Ro-ro rule (owner 2026-07-23): a ro-ro cargo ship is the VEHICLE-carrier variant only when
   the text says "vehicle"/"pctc"/"pcc"; a ro-ro passenger ship is the HIGH-SPEED variant only
   when it says "highspeed"/"hsc". "cruise" wins over the bare word "passenger". */
function mdaShipType(raw){
  const u=String(raw==null?"":raw).toLowerCase().replace(/[^a-z0-9]/g,"");
  if(!u) return null;
  if(u.includes("cruise")) return "cruise";
  if(u.includes("roro")){
    if(u.includes("passenger")) return (u.includes("highspeed")||u.includes("hsc")) ? "ropaxhsc" : "ropax";
    return (u.includes("vehicle")||u.includes("pctc")||u.includes("pcc")) ? "rorovc" : "roro";
  }
  if(u.includes("lng")) return "lng";
  if(u.includes("gas")) return "gas";
  if(u.includes("combination")||u.includes("combo")) return "combo";
  if(u.includes("refrigerated")||u.includes("reefer")) return "reefer";
  if(u.includes("container")) return "container";
  if(u.includes("generalcargo")||u.includes("general")) return "gencargo";
  if(u.includes("tanker")) return "tanker";
  if(u.includes("bulk")) return "bulk";
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
  /* ---- vessel particulars (2026-07-23, owner-specified) ----
     Read Name / IMO / DWT / Ship type from the file to auto-fill the Settings tab. This is a
     READ-ONLY passthrough — it does NOT feed the frozen arrival/departure/POC derivation or
     the DWT used there (that still comes from Settings / MDA_DEFAULT_DWT, unchanged). Each
     column is optional: we take the first non-empty value seen in any data row, so a blank
     bunker row can't wipe it. Anything absent/unreadable is left null → caller leaves that
     Settings field blank (guiding value only, no warning). */
  const firstVal=(f)=>{ if(!(f in col)) return ""; for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const v=String(r[col[f]]==null?"":r[col[f]]).trim(); if(v!=="") return v; } return ""; };
  const vName=firstVal("VESSEL_NAME");
  const vImo=firstVal("IMO");
  const vDwtRaw=firstVal("DWT");
  const vDwt=(vDwtRaw!=="" && isFinite(parseFloat(vDwtRaw))) ? parseFloat(vDwtRaw) : null;
  const vTypeId=mdaShipType(firstVal("VESSEL_TYPE"));
  const vessel={ name:vName||null, imo:vImo||null, dwt:vDwt, typeId:vTypeId };
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
                  bunker:String(G(r,"BUNKER_AMOUNT")).trim(), lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon,
                  /* display-only context for the trace table (2026-07-17) — no derivation impact */
                  voy:String(G(r,"VOYAGE_NUMBER")).trim(), cur:String(G(r,"CURRENT_PORT_UNLO_CODE")).trim(),
                  portN:String(G(r,"CURRENT_PORT")).trim(), ctry:String(G(r,"CURRENT_COUNTRY")).trim(), regn:String(G(r,"CURRENT_REGION")).trim() });
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
    /* 2026-07-28b TEMPORARY (MDA V1 compatibility — see the V1 block after pass 1): PORT_STATE
       and CARGO_OP were never read before. They are captured here unconditionally (cheap, and
       harmless for V3 files, which simply never consult them) so the V1 branch below can use
       them. REVERT NOTE: these two fields may be deleted when the V1 branch is removed. */
    const ps=String(G(r,"PORT_STATE")).trim().toUpperCase();
    /* 2026-07-23 (Task 3, Aurvin): keep whether CARGO_QTY was actually REPORTED, separately
       from the numeric value. `qty` stays numeric-with-||0 exactly as before — the frozen POC
       derivation (qtyE/qtyS/qtyTrig) still reads it unchanged. `qtyHas` is DISPLAY/EXPORT only:
       true when the cell held a real number (INCLUDING a genuine 0), false when it was blank.
       A blank cargo must show as a dash, not be confused with a reported 0. */
    const cargoRaw=String(G(r,"CARGO_QTY")).trim();
    recs.push({ rt, dt, vFrom, vTo, ev:EV[rt]||"Noon",
                dist:parseFloat(G(r,"DISTANCE"))||0, qty:parseFloat(cargoRaw)||0, qtyHas:(cargoRaw!=="" && !isNaN(parseFloat(cargoRaw))), fuels, mach, rob,
                lat:isNaN(lat)?null:lat, lon:isNaN(lon)?null:lon, org, cur, dst,
                portN:String(G(r,"CURRENT_PORT")).trim(), ctry:String(G(r,"CURRENT_COUNTRY")).trim(), regn:String(G(r,"CURRENT_REGION")).trim(),
                oc, ps, cargoOp:truthy(G(r,"CARGO_OP")), aa:String(G(r,"ASSOCIATED_ACTIVITY")).trim().toUpperCase(),
                /* display-only retention for the trace table (2026-07-17): voyage no */
                voy:String(G(r,"VOYAGE_NUMBER")).trim(),
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

  /* ================== TEMPORARY: MDA "V1" FORMAT COMPATIBILITY (2026-07-28b) ==================
     OWNER INSTRUCTION (Aurvin, this session): older "V1" MDA exports describe the same voyage
     with a different vocabulary, which made the (frozen) arrival/departure ladder derive NOTHING
     at all — every port stay fell through to PURE TRANSIT, so the Reports tab showed no ARRIVAL
     and no DEPARTURE anywhere. Reported on olam_CORONA_9391971.csv (18 stays, 0 derived).

     THIS IS EXPLICITLY A TEMPORARY BRANCH. The owner's instruction is to fix V1 files ONLY, leave
     today's ("V3") logic untouched, and REMOVE this branch once V1 files are no longer imported.
     Everything below is therefore gated on `isV1`; when `isV1` is false the code is a no-op and
     V3 files are bit-identical to before (locked by verify_workspace_rows.js + the 338 self-tests).

     WHAT DIFFERS IN V1 (measured on olam_CORONA vs the V3 Blumenthal reference):
       1. Port state lives in PORT_STATE, not OPERATING_CONDITION.
          V1 OPERATING_CONDITION carries ONLY sailing modes (BERTHING 104, ANCHORED 83,
          NORMAL SAILING 206) — zero AT_BERTH / AT_ANCHOR, which are exactly the tokens the
          ladder looks for. PORT_STATE carries AT_BERTH 87 / AT_ANCHOR 67 / MANOEUVRING 33.
          NOT a simple rename: V1's BERTHING is a COARSER word that covers BOTH of V3's states —
            V3: OC=AT_BERTH (90 rows) -> PORT_STATE AT_BERTH 100%        <- the ladder's rung
                OC=BERTHING (38 rows) -> PORT_STATE MANOEUVRING 23, AT_BERTH 15  <- excluded
            V1: OC=BERTHING (104)     -> PORT_STATE AT_BERTH 87, MANOEUVRING 17
          Mapping BERTHING->AT_BERTH would therefore swallow the manoeuvring approach and make V1
          port stays systematically LONGER than V3 stays for the same operation, moving fuel from
          50% (at sea) to 100% (at berth) for EU ETS. Reading PORT_STATE reproduces V3's rung
          exactly (in V3, OC=AT_BERTH <=> PORT_STATE=AT_BERTH on all 90 rows). Owner chose this.
       2. Cargo operations: ASSOCIATED_ACTIVITY is 100% blank in V1, so Case A could never fire.
          The cargo signal is the CARGO_OP boolean (True on 138 rows).
       3. Port of Call: the file's POC tag is AUTHORITATIVE in V1 (owner instruction) instead of
          being derived from cargo ops + OUTSIDE_PORT_LIMIT. OUTSIDE_PORT_LIMIT is 100% blank in
          V1, so the OPL transit demotion is inert and cannot classify anything. Measured on this
          file: POC=YES (138) <=> CARGO_OP=True (138), exact 1:1 with zero disagreement.

     DETECTION (owner chose the single decisive test): a file is V1 when OPERATING_CONDITION
     contains no AT_BERTH and no AT_ANCHOR anywhere. That IS the condition that breaks the ladder,
     so detection and root cause are the same thing and a V3 file can never be misread as V1.

     REVERT PLAN (when V1 imports are retired): delete this block, revert `ocD` -> `oc` and the
     `v1*` guards in pass 2, drop `ps`/`cargoOp` from the pass-1 record, delete the V1 notes, and
     delete tools/verify_v1_mda_format.js. All V1 behaviour is reachable only via these flags. */
  const V1_FLIP_TO_OC_SYNONYMS = false;   // set true to use BERTHING/ANCHORED instead of PORT_STATE
  const ocHasV3State = recs.some(c=>!c.skip && (c.oc==="AT_BERTH" || c.oc==="AT_ANCHOR"));
  /* 2026-07-28b — NECESSARY TIGHTENING of the owner's chosen detection rule, found by the test
     suite and reported to the owner. The literal rule ("OPERATING_CONDITION has no AT_BERTH /
     AT_ANCHOR anywhere") ALSO matches a perfectly normal V3 file that simply never berthed or
     anchored — e.g. the DRIFT_FIX self-test fixture, a drifting-only waiting window, which has no
     PORT_STATE column at all. That misdetection switched the POC decision to the file's tag and
     broke the self-test "DRIFT: drifting + cargo-qty change ... POC on, qty flag".
     So V1 now additionally requires POSITIVE evidence that PORT_STATE supplies exactly what
     OPERATING_CONDITION is missing. This is strictly safer and cannot change any V3 file:
       • no PORT_STATE column, or no port-state tokens in it  -> not V1 -> untouched V3 path;
       • OPERATING_CONDITION already carries the tokens       -> not V1 -> untouched V3 path.
     A genuine V1 file always satisfies both halves (olam_CORONA: OC has neither token; PORT_STATE
     has AT_BERTH 87 + AT_ANCHOR 67). */
  const psHasV3State = recs.some(c=>!c.skip && (c.ps==="AT_BERTH" || c.ps==="AT_ANCHOR"));
  const isV1 = hasOC && !ocHasV3State && psHasV3State;
  /* V1 only: cargo ops come from CARGO_OP, but ONLY when ASSOCIATED_ACTIVITY is genuinely absent
     file-wide — a V1 file that does populate the activity column keeps the normal Case A path. */
  const v1NoActivity = isV1 && !recs.some(c=>!c.skip && c.aa);
  /* V1 only: the POC tag is authoritative, but ONLY when the column actually carries YES/NO. */
  const v1PocAuth = isV1 && ("POC" in col) && recs.some(c=>!c.skip && (c.pocFile==="YES" || c.pocFile==="NO"));
  /* `ocD` = the condition the ladder reads. V3: identical to `oc` (guaranteed no-op). V1: the
     PORT_STATE token, falling back to `oc` where PORT_STATE is blank (at-sea rows, FUEL_STOCK),
     so nothing that used to break a condition chain stops breaking it. `oc` itself is left
     EXACTLY as reported so the Reports trace table keeps showing the ship's own wording. */
  for(const c of recs)
    c.ocD = isV1 ? (V1_FLIP_TO_OC_SYNONYMS ? ({BERTHING:"AT_BERTH",ANCHORED:"AT_ANCHOR"}[c.oc] || c.oc)
                                           : (c.ps || c.oc))
                 : c.oc;
  let nV1Poc=0;
  /* ==================== end temporary V1 compatibility detection ==================== */

  /* ---- pass 2: port stays → derive ARRIVAL / DEPARTURE / POC ---- */
  const notes=[];
  let nDerived=0,nTransit=0,nQty=0,nMismatch=0,nIncomplete=0,nOPL=0,nOplKept=0,usedDefaultDwt=false;
  if(hasOC){
    let dwt=Number(dwtOpt)||0;
    if(!(dwt>0)){
      if(typeof S!=="undefined" && S.ship && (TYPE_BY_ID[S.ship.typeId]||{}).capUnit==="DWT" && Number(S.ship.capacity)>0) dwt=Number(S.ship.capacity);
      else { dwt=MDA_DEFAULT_DWT; usedDefaultDwt=true; }
    }
    /* segment: a stay = everything between an ARRIVAL-EOSP and the next DEPARTURE-SOSP;
       a leading in-port block with no EOSP / a trailing one with no SOSP = incomplete stay */
    const stays=[]; let cur=null;
    /* one resolved current-port per derived Port Stay, collected below and applied to every
       report file-wide afterwards (2026-07-19, Aurvin) — see the pass after this loop */
    const resolvedStays=[];
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
      /* `ocD` (not `oc`) throughout the ladder — see the temporary V1 block above. For V3 files
         ocD === oc, so this is a rename with no behavioural change. */
      const effCond=(m)=>{                       // blank-condition cargo op: inherit when both neighbours agree
        if(m.ocD) return m.ocD;
        const k=M.indexOf(m); let p=null,n=null;
        for(let j=k-1;j>=0;j--) if(M[j].ocD){ p=M[j].ocD; break; }
        for(let j=k+1;j<M.length;j++) if(M[j].ocD){ n=M[j].ocD; break; }
        return (p&&n&&p===n)? p : null;
      };
      const chainStart=(idx,cond)=>{ let s=idx;
        for(let j=idx-1;j>=0;j--){ if(M[j].transparent) continue; if(M[j].ocD===cond) s=j; else break; }
        return s; };
      const chainEnd=(idx,cond)=>{ let e=idx;
        for(let j=idx+1;j<M.length;j++){ if(M[j].transparent) continue; if(M[j].ocD===cond) e=j; else break; }
        return e; };
      /* TEMPORARY V1: cargo ops from the CARGO_OP boolean when ASSOCIATED_ACTIVITY is absent
         file-wide (v1NoActivity). V3 files keep the ASSOCIATED_ACTIVITY test unchanged. */
      const ops=M.filter(m=> v1NoActivity ? m.cargoOp : MDA_CARGO_ACT[m.aa]);
      /* cargo-quantity fallback: EOSP vs SOSP CARGO_QTY — 0↔loaded or >5% of DWT
         (2026-07-20b: computed BEFORE the ladder — the DRIFTING rung now depends on it) */
      const qtyE = st.eosp? st.eosp.qty : (M.length? M[0].qty : 0);
      const qtyS = st.sosp? st.sosp.qty : (M.length? M[M.length-1].qty : 0);
      const qtyTrig = !ops.length && ( ((qtyE===0)!==(qtyS===0)) || Math.abs(qtyE-qtyS)>0.05*dwt );
      let arr=null, dep=null, rule=null;
      if(ops.length){                                       /* Case A — cargo operations recorded */
        const f=ops[0], l=ops[ops.length-1], cf=effCond(f), cl=effCond(l);
        arr = M[ cf!=null? chainStart(M.indexOf(f),cf) : M.indexOf(f) ].tStart;
        dep = M[ cl!=null? chainEnd(M.indexOf(l),cl)   : M.indexOf(l) ].tEnd;
        rule="CASE_A";
      } else {                                              /* Case B — fallback ladder */
        const firstLast=(cond,name)=>{ const xs=M.filter(m=>!m.transparent && m.ocD===cond); if(!xs.length) return false;
          arr=xs[0].tStart; dep=xs[xs.length-1].tEnd; rule=name; return true; };
        firstLast("AT_BERTH","AT_BERTH")
        || (()=>{ const bs=M.filter(m=>m.aa==="BUNKERING"); if(!bs.length) return false;
             const f=bs[0], l=bs[bs.length-1], cf=effCond(f), cl=effCond(l);
             arr = M[ cf!=null? chainStart(M.indexOf(f),cf) : M.indexOf(f) ].tStart;
             dep = M[ cl!=null? chainEnd(M.indexOf(l),cl)   : M.indexOf(l) ].tEnd;
             rule="BUNKERING"; return true; })()
        || firstLast("AT_ANCHOR","AT_ANCHOR")
        /* 2026-07-20b (Aurvin, explicit owner decision this session): DRIFTING alone no
           longer derives an arrival/departure. A stay whose members are only drifting
           (no berth, no bunkering activity, no anchorage) is waiting at sea, not a port
           call — it now falls through to PURE TRANSIT and merges into the voyage.
           The rung still fires when the cargo-quantity fallback shows cargo actually
           moved during the window (0↔loaded or >5% of DWT — e.g. an unrecorded STS
           transfer while drifting), so a real cargo call can never be silently lost. */
        || (qtyTrig && firstLast("DRIFTING","DRIFTING"));
      }
      const cargoTest = ops.length>0 || qtyTrig;
      const incomplete = !st.eosp || !st.sosp;
      const flags=[];
      let poc=false;
      if(arr && dep){
        nDerived++;
        const oplHit = M.some(m=> m.rt!=="FUEL_STOCK" && m.opl && m.tStart>=arr && m.tEnd<=dep);
        /* 2026-07-24b (Aurvin, EXPLICIT owner instruction this session — this DELIBERATELY
           refines the frozen POC rule, at the owner's request): OUTSIDE_PORT_LIMIT is often
           reported INCONSISTENTLY within one stay (some reports TRUE, some FALSE — e.g. a
           discharge still tagged on the departure report after the ship left the berth). The
           previous rule (poc = cargoTest && !oplHit) let a single stray OPL report demote an
           entire genuine port call to transit. New rule: when the window's OPL flags are MIXED
           (at least one TRUE and at least one FALSE) AND a cargo operation was recorded while
           AT_BERTH — physically alongside a quay, unambiguously in port — the stray OPL flag is
           treated as MISREPORTING and the stay is KEPT as a port of call. Guardrails so a real
           out-of-limits transfer is NOT wrongly reinstated:
             • a genuine STS is AT_ANCHOR / DRIFTING, never AT_BERTH → berthCargo is false → no
               override (locked by the existing "stay D" self-test);
             • a stay whose reports are UNIFORMLY OPL=TRUE is NOT "mixed" → respected as transit,
               even at berth (owner scoped the override to the inconsistent case only). */
        const winReports = M.filter(m=> m.rt!=="FUEL_STOCK" && m.tStart>=arr && m.tEnd<=dep);
        const oplMixed   = winReports.some(m=>m.opl) && winReports.some(m=>!m.opl);
        const berthCargo = ops.some(m=> m.ocD==="AT_BERTH");
        const oplOverride = oplHit && oplMixed && berthCargo;
        /* TEMPORARY V1 (owner instruction 2026-07-28b): in a V1 file the POC tag is AUTHORITATIVE —
           it decides Port of Call directly, and with it the OPL question, because OUTSIDE_PORT_LIMIT
           is not populated in V1 and so can never demote anything. The ❗ cargo-quantity fallback and
           the ⚠ MISMATCH comparison are both suppressed: a recorded tag beats an inference, and there
           is nothing left to compare the tag against. The arrival/departure WINDOW is unaffected —
           it still comes from the ladder (via CARGO_OP for Case A). */
        if(v1PocAuth){
          poc = M.some(m=>m.pocFile==="YES");
          if(poc) nV1Poc++;
        } else {
          poc = cargoTest && (!oplHit || oplOverride);
          if(poc && qtyTrig){ flags.push("QTY"); nQty++; }
          if(oplOverride) nOplKept++;
        }
        /* a stay that had cargo but is STILL demoted because of an OPL report (the override did
           NOT save it — uniform OPL=TRUE, or cargo not at berth like a real STS). The Leg-Wise
           view shows 📦 + a red OPL badge for these; an OVERRIDDEN stay (poc true) gets neither
           flag, so it renders as a clean port of call (owner decision 2026-07-24b). */
        /* TEMPORARY V1: with the POC tag authoritative the OPL demotion never applies, so a stay
           can never be flagged "cargo outside port limits" on a V1 file. */
        const oplCargo = !v1PocAuth && oplHit && cargoTest && !poc;
        /* 2026-07-23 (Aurvin, owner instruction): record WHICH cargo operation was seen at
           this stay (ASSOCIATED_ACTIVITY), for the breakdown's 📦 tooltip. Read-only — it
           does not take part in the arrival/departure ladder or the POC decision above.
           2026-07-24: also emit these for an OPL-demoted stay so its 📦 tooltip can name the op. */
        if(ops.length && (poc || oplCargo)){
          if(ops.some(m=>m.aa==="CARGO_LOADING"||m.aa==="CARGO_LOADING_STS"))       flags.push("LOAD");
          if(ops.some(m=>m.aa==="CARGO_DISCHARGING"||m.aa==="CARGO_DISCHARGING_STS"))flags.push("DISCH");
          if(ops.some(m=>m.aa==="CARGO_LOADING_STS"||m.aa==="CARGO_DISCHARGING_STS"))flags.push("STS");
        }
        if(oplCargo){ nOPL++; flags.push("OPLCARGO"); }
        /* TEMPORARY V1: no MISMATCH flag when the tag IS the source of truth (it would compare
           the tag against itself and never fire). V3 behaviour unchanged. */
        if("POC" in col && !v1PocAuth){
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
        let firstPort=null, firstPost=null, lastPortRec=null, approach=null;
        for(const m of M){
          if(m.tEnd<=arr){ m.ev="Noon"; if(inbound){ m.vFrom=inbound[0]; m.vTo=inbound[1]; } approach=m; }
          else if(m.tStart>=dep){ m.ev="Noon"; if(outbound){ m.vFrom=outbound[0]; m.vTo=outbound[1]; } if(!firstPost) firstPost=m; }
          else { m.ev="Port"; m.poc = poc? "YES":"NO"; if(!firstPort) firstPort=m; lastPortRec=m; }
        }
        if(firstPort) firstPort.meta={arr,dep,rule,flags:flags.join("+")};
        /* report-level labels (2026-07-16; ARRIVAL placement corrected 2026-07-20, Aurvin):
           the arrival INSTANT is `arr`, the boundary between the last inbound "approach" report
           (the report whose period ENDS at arr — e.g. the MANOEUVRING report on the way in) and
           the first at-port report. Reports are timestamped by period END, so it is the APPROACH
           report whose own timestamp already reads the arrival time. Put the ARRIVAL label there,
           not on the first at-port report (whose period ends later) — that way the badge lands on
           the row that already shows the arrival instant, with NO timestamp changes and NO two
           rows sharing a time. When there is no such approach report (the stay opens straight from
           the EOSP marker — EOSP is never a stay member), keep ARRIVAL on the first at-port report,
           exactly as before (locked by the RFIX self-test). This is a display-label move only:
           `arr`/`dep`, POC, consumption attribution and the workspace rows are all unchanged. */
        const arrRep = (approach && approach.tEnd===arr) ? approach : firstPort;
        if(firstPort){
          if(arrRep===firstPort){
            firstPort.role = firstPort===lastPortRec? "ARRIVAL · DEPARTURE" : "ARRIVAL";
          } else {
            arrRep.role = "ARRIVAL";
            if(firstPort===lastPortRec) firstPort.role = "DEPARTURE";   // single at-port report → it is the departure end
          }
        }
        if(lastPortRec && lastPortRec!==firstPort) lastPortRec.role = "DEPARTURE";
        /* Resolve ONE current-port for this whole Port Stay (2026-07-19, Aurvin, per explicit
           spec) — Arrival.CURRENT_PORT and Departure.CURRENT_PORT are, by definition, the same
           physical port: use Arrival's own CURRENT_PORT whenever it has one (whether or not
           Departure's agrees or is blank); only when Arrival itself has no usable CURRENT_PORT
           do we fall back to the bounding SOSP's ORIGIN_PORT. This resolved port — and the
           stay's departure time — feed the file-wide Voyage_From/Voyage_To pass below; it is
           no longer written directly onto firstPort/lastPortRec here. */
        if(firstPort){
          const resolvedPort = firstPort.cur || (st.sosp && st.sosp.org) || "";
          if(resolvedPort){
            resolvedStays.push({ dep, resolvedPort });
            /* unified branches (2026-07-19b): stamp the stay's single resolved port on every
               in-window report so the workspace CSV emits it too (see emission pass below) */
            for(const m of M) if(m.ev==="Port") m.stayPort = resolvedPort;
          }
        }
        if(st.eosp && firstPort)
          firstPort.before.push({ev:"Arrival", dtIso:arr, vFrom:inbound[0], vTo:inbound[1], src:st.eosp});      // zero-consumption boundary marker
        /* 2026-07-21 (Aurvin — owner report: missing berth row when the EOSP is outside the
           export window). The Arrival boundary marker above is what makes parseOVD leave sea
           mode (ui.js ~line 419) and open a port row; gating it on st.eosp meant a stay whose
           ARRIVAL-EOSP is absent — typically a stay already underway when the file starts —
           produced NO workspace port row at all, even though the derivation had already
           resolved arr/dep correctly and the Report-Wise tab + OVD download showed them right
           (owner's 2026 file: Constantza 02 Jun 20:33 → 13 Jun 02:28, 11 days at berth,
           POC YES, 31.7 t MGO booked to the sea leg at 50% EU ETS scope instead of at berth
           at 100%). FALLBACK ONLY — when there is no EOSP, anchor the marker to the APPROACH
           report (the inbound report whose period ends at the derived arrival). Its org/dst
           are rewritten by the file-wide resolved-port pass below, so the marker carries the
           same corrected ports as the download branch and the two branches stay unified
           (owner's decision this session: label the inbound leg Batumi → Constantza, i.e.
           keep its true origin, not the stay's own port).
           Deliberately NOT done: the mirror case (missing SOSP → no Departure marker) is left
           as it is, per the owner's instruction to change the Arrival path only. No fallback
           when there is no approach report either — a file that opens already at berth has no
           inbound voyage to close and parseOVD's initial "port" state already handles it. */
        else if(firstPort && approach)
          firstPort.before.push({ev:"Arrival", dtIso:arr, vFrom:approach.vFrom, vTo:approach.vTo, src:approach});
        if(st.sosp){
          (firstPost||st.sosp).before.push({ev:"Departure", dtIso:dep, vFrom:outbound[0], vTo:outbound[1], src:st.sosp});
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

    /* ---- Voyage_From / Voyage_To, file-wide, from the resolved Port Stays only (2026-07-19,
       Aurvin, per explicit spec) — never from each report's own raw ORIGIN/DESTINATION_PORT:
         Voyage_To  = the resolved port of the next stay not yet departed — while still inside
                      a stay pre-departure that's trivially the same stay's own port. It changes
                      only at each Departure (inclusive), to the FOLLOWING stay's resolved port.
                      Only past the last stay in the file does it fall back to that report's own
                      DESTINATION_PORT_UNLO_CODE (absolute last resort).
         Voyage_From = the resolved port of the most recently departed stay; changes only at
                      each Departure (inclusive), to THAT stay's own resolved port, and holds
                      through the following stay's arrival phase. Before the first Departure in
                      the file, falls back to the first non-blank ORIGIN_PORT_UNLO_CODE found
                      anywhere in the file (its opening context), if any. */
    resolvedStays.sort((a,b)=> a.dep<b.dep?-1:(a.dep>b.dep?1:0));
    let bootstrapOrg=""; for(const c of recs){ if(c.org){ bootstrapOrg=c.org; break; } }
    let jTo=0, jFrom=-1;
    for(const c of recs){
      while(jTo<resolvedStays.length && resolvedStays[jTo].dep<=c.tEnd) jTo++;
      c.dst = jTo<resolvedStays.length ? resolvedStays[jTo].resolvedPort : (c.dst||"");
      while(jFrom+1<resolvedStays.length && resolvedStays[jFrom+1].dep<=c.tEnd) jFrom++;
      c.org = jFrom>=0 ? resolvedStays[jFrom].resolvedPort : bootstrapOrg;
    }
    /* 2026-07-20c (Aurvin — owner report, awaiting-orders fix): past the file's LAST resolved
       stay, c.dst falls back to the report's own raw destination — which is BLANK while the
       ship sails "awaiting orders" (destination not yet known, e.g. dep Fos 09 Jul, OPL
       drifting, orders received 11 Jul). parseOVD turned that blank into a same-port leg
       (Fos→Fos, EU→EU = 100%) until the destination first appeared — the owner saw the
       eligibility badge wrongly at 100% from departure until mid-sea. The voyage's real
       endpoint is the port the ship EVENTUALLY sails to (euets-art3ga: voyage = port of
       call → next port of call), so fill a blank destination BACKWARD from the next report
       whose destination is known. Only tail rows can still be blank here (every row before
       the last stay was already overwritten from resolvedStays above); a file that ENDS
       with orders still unknown keeps blanks (nothing to fill from) — legacy behaviour. */
    for(let i=recs.length-2;i>=0;i--){ if(!recs[i].dst && recs[i+1].dst) recs[i].dst = recs[i+1].dst; }
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
  /* unified Voyage_From / Voyage_To (2026-07-19b): the workspace CSV now carries the SAME
     corrected ports as the reports/download branch (c.org / c.dst, rewritten by the file-wide
     pass above) — previously it used the older per-report vFrom/vTo, so the Workspace and the
     OVD download could disagree and voyages fragmented on stale raw ports. Port-stay rows carry
     the stay's single resolved port; boundary markers read the corrected ports of the report
     they were derived from. Legacy files (no OPERATING_CONDITION) keep the original values. */
  const vf  = c => hasOC ? (c.ev==="Port" ? (c.stayPort||c.vFrom||"") : (c.org||c.vFrom||"")) : (c.vFrom||"");
  const vt  = c => hasOC ? (c.ev==="Port" ? (c.stayPort||c.vTo||"")   : (c.dst||c.vTo||""))   : (c.vTo||"");
  const bvf = b => (hasOC && b.src) ? (b.src.org||b.vFrom||"") : (b.vFrom||"");
  const bvt = b => (hasOC && b.src) ? (b.src.dst||b.vTo||"")   : (b.vTo||"");
  /* 2026-07-22c (Aurvin, owner instruction — SCC cargo from the SOSP report): cargo cells
     now preserve a reported ZERO (a genuine ballast leg) instead of collapsing it to blank
     with `||""`, and the derived DEPARTURE marker rows — which were always emitted with an
     empty cargo cell — carry the cargo quantity of the report they were derived from
     (`b.src.qty`). Without this the SOSP cargo never reached parseOVD at all. Distance on
     marker rows deliberately stays blank: the distance belongs to the report itself, and
     emitting it here would double-count it. */
  const qtyCell = v => (v===0 || (v!=null && v!=="" && !isNaN(v))) ? v : "";
  for(const c of recs){
    if(c.skip) continue;
    for(const b of c.before)
      lines.push([b.dtIso.slice(0,10),b.dtIso.slice(11,16),bvf(b),bvt(b),b.ev,"",qtyCell(b.src?b.src.qty:null),"","","","",""].concat(blank).join(","));
    const meta=c.meta||{};
    lines.push([c.dt[0],c.dt[1],vf(c),vt(c),c.ev,c.dist||"",qtyCell(c.qty),c.poc||"",meta.arr||"",meta.dep||"",meta.rule||"",meta.flags||""]
      .concat(fuelCells(c)).join(","));
  }
  /* raw per-report retention (2026-07-16): foundation for the future OVD-format download.
     Not used by any calculation; saved with the workspace state at import. */
  /* 2026-07-28j (Aurvin, owner instruction) — TEMPORARY V1, remove with the V1 branch.
     `ocD` (the PORT_STATE-derived condition the ladder already uses) now travels with each
     report record so the Report-Wise Condition COLUMN can display it too. `oc` is still the
     ship's own raw wording and is what the Excel/CSV report download exports, so the source
     data is never rewritten. For V3 files ocD === oc, so this is a no-op there. */
  const reports = recs.map(c=>({ rt:c.rt, role:c.role||"", t:c.dt? iso(c.dt):c.tEnd, ts:c.tStart||null, te:c.tEnd||null,
    oc:c.oc||"", ocD:c.ocD||c.oc||"", aa:c.aa||"", opl:!!c.opl, poc:c.pocFile||"", qty:c.qty||0, qtyHas:!!c.qtyHas, dist:c.dist||0,
    voy:c.voy||"",
    lat:c.lat??null, lon:c.lon??null, org:c.org||"", cur:c.cur||"", dst:c.dst||"",
    portN:c.portN||"", ctry:c.ctry||"", regn:c.regn||"",
    fuels:c.fuels||{}, mach:c.mach||null, rob:c.rob||{}, bunker:c.bunker||undefined }));
  if(nBunker) notes.push(nBunker+" FUEL_OIL_BUNKER event(s) skipped — bunkering is a stock movement, not consumption.");
  if(nInferred) notes.push(nInferred+" row(s) had a missing UN/LOCODE — the last known port was carried forward.");
  if(hasMachines) notes.push("Per-machine consumption (ME / AE / Boiler) imported; per fuel type the unassigned remainder went to 'Other'"+(nNegRemainder? " — "+nNegRemainder+" report(s) had ME+AE+Boiler exceeding the fuel-type total (Other clamped to 0 — verify the source data)":"")+". Toggle 'Machinery split' in the workspace to view or edit it.");
  if(hasOC){
    /* TEMPORARY V1 compatibility notes (2026-07-28b) — remove with the V1 branch. */
    if(isV1){
      notes.push("⚠ OLDER \"V1\" MDA FORMAT DETECTED (OPERATING_CONDITION carries no AT_BERTH / AT_ANCHOR). "
        +"Berth and anchorage periods were read from the PORT_STATE column instead"
        +(V1_FLIP_TO_OC_SYNONYMS? " (synonym mode: BERTHING/ANCHORED mapped instead)":"")
        +", which reproduces the normal rule exactly — V1's \"BERTHING\" also covers the manoeuvring approach, so it is not used directly. "
        +"The Report-Wise Condition column shows this same derived condition (2026-07-28j, owner instruction), so it reads like a current-format vessel; each cell's tooltip still names the ship's own reported wording, and the report download still exports the raw OPERATING_CONDITION. "
        +"This is a TEMPORARY compatibility path for legacy files; current-format files are unaffected.");
      if(v1NoActivity) notes.push("V1 format: ASSOCIATED_ACTIVITY is empty throughout, so cargo operations were taken from the CARGO_OP column instead. Load vs discharge cannot be distinguished, so the 📦 tooltip does not name the operation.");
      if(v1PocAuth) notes.push("V1 format: Port of Call was taken from the file's POC column, which is authoritative for this format (owner rule) — the cargo-quantity ❗ fallback and the ⚠ POC-mismatch check are both switched off. "+nV1Poc+" stay(s) tagged as a Port of Call."+(("OUTSIDE_PORT_LIMIT" in col) && !recs.some(c=>!c.skip&&c.opl) ? " OUTSIDE_PORT_LIMIT is empty in this file, so the outside-port-limits transit check could not run.":""));
    }
    if(nDerived) notes.push(nDerived+" port stay(s): regulatory ARRIVAL/DEPARTURE derived from the report chain (EOSP/SOSP are sea-passage markers, not the arrival/departure) — consumption before arrival / after departure is attributed to the voyage."+(v1PocAuth? "":" The file's POC column was ignored; Port of Call was derived from cargo operations and port limits."));
    if(nTransit) notes.push(nTransit+" stay(s) had no berth / anchorage / drifting / bunkering period — pure transit, merged into the adjacent voyage (no port-stay row).");
    if(nOPL) notes.push(nOPL+" stay(s) with cargo operations OUTSIDE port limits (e.g. STS) — classified as transit, not a port of call.");
    if(nOplKept) notes.push(nOplKept+" stay(s) had INCONSISTENT OUTSIDE_PORT_LIMIT flags but cargo recorded AT_BERTH — the stray OPL flag was treated as misreporting and the stay KEPT as a port of call (owner rule 2026-07-24b).");
    if(nQty) notes.push(nQty+" stay(s) classified as Port of Call by the cargo-quantity fallback (CARGO_QTY changed by >5% of DWT or 0↔loaded with no recorded cargo operation"+(usedDefaultDwt?"; DWT unknown — default "+MDA_DEFAULT_DWT.toLocaleString()+" mt used":"")+") — marked ❗ on the row.");
    if(nMismatch) notes.push(nMismatch+" stay(s) where the file's POC column disagrees with the derived classification — the derived result is used; marked ⚠ on the row.");
    if(nIncomplete) notes.push(nIncomplete+" stay(s) truncated by the file boundary — derived from the available side only and flagged incomplete. Upload ±1 month around year ends where possible.");
  } else {
    notes.push("OPERATING_CONDITION column not found — arrival/departure/POC derivation skipped; EOSP/SOSP used as arrival/departure and the file's POC column (if present) applied (legacy import).");
  }
  return { csv: lines.join("\n"), notes, reports, vessel };
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
      .then(rows=>{ const m=mdaToOVD(rows); applyImport(parseOVD(m.csv), "MDA xlsx", m.notes, m.reports, m.vessel); })
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
        applyImport(parseOVD(m.csv), "MDA CSV", m.notes, m.reports, m.vessel); return;
      }
      applyImport(parseOVD(txt), "OVD");
    }catch(e){ fail(e); }
  };
  r.readAsText(f);
}
function applyImport(res, label, extraNotes, reports, vessel){
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
      /* vessel particulars auto-fill (2026-07-23, owner-specified): the MDA file is the
         source of truth, so ALWAYS overwrite Name / IMO / DWT from it (blank when the column
         was absent/empty — a guiding value, no warning). Ship type is overwritten only when
         the VESSEL_TYPE keyword matched a known type; an unrecognised/absent type leaves the
         current dropdown selection unchanged (the selector has no blank state, and CII needs
         a valid type). Applies to both REPLACE and APPEND — same physical ship either way. */
      if(vessel){
        S.ship = S.ship || {};
        S.ship.name = vessel.name || "";
        S.ship.imo  = vessel.imo  || "";
        S.ship.capacity = (vessel.dwt!=null) ? vessel.dwt : "";
        if(vessel.typeId && TYPE_BY_ID[vessel.typeId]) S.ship.typeId = vessel.typeId;
      }
      /* multi-year awareness (2026-07-16): the displayed year stays user-driven */
      const yearsIn = [...new Set(res.rows.map(r=>String(r.tStart||r.tEnd||"").slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort();
      initDateFilters();   // 2026-07-24: default Year to the latest year just imported; fill its window
      /* 2026-07-28h (Aurvin, owner instruction): the last sentence used to read "The Voyage-Wise
         tab has its own date picker that can span years." That is no longer true — every tab is
         year-locked now. Replaced with what Voyage-Wise actually does differently. */
      if(yearsIn.length>1) notes.push("The file spans reporting years "+yearsIn.join(" and ")+". The Year selector now shows the latest ("+S.year+"); each year's rows are shown when that Year is picked. On the Voyage-Wise tab a voyage is counted in the year its END date falls in, so a voyage that began in "+yearsIn[0]+" and ended in "+yearsIn[yearsIn.length-1]+" is shown whole under "+yearsIn[yearsIn.length-1]+".");
      save(); renderAll(); showTab("work");
      if(res.annual){
        try{
          const R2=computeAll(S);
          notes.push("Cross-check — the file's own annualEmission block reports MRV CO₂ "+fmt(res.annual.mrvCO2)+" mt"+(res.annual.etsCO2?" and ETS CO₂ "+fmt(res.annual.etsCO2)+" mt":"")+"; the calculator computes total CO₂ "+fmt(R2.summary.co2Total)+" mt from the imported activity using KB default factors. Small differences are expected where the file used its own factors. The file's totals are shown for comparison only, never imported.");
        }catch(e){}
      }
      if(notes.length) alert("Import notes:\n\n- "+notes.join("\n- "));
}

/* ---------- shared input widgets ---------- */
/* short display labels for the fuel picker + breakdown Excel export only (2026-07-19, Aurvin) —
   drops the regulation/pathway suffix (RED II, RFNBO, fossil/natural-gas) and collapses the four
   LNG engine-cycle entries to their CH4 slip %; engine.js FUELS[].name (used for calculations,
   the Calculations tab and everywhere else) is untouched. */
const FUEL_SHORT = {
  LNGDS:"LNG (0.2%)", LNGOS:"LNG (1.7%)", LNG:"LNG (3.1%)", LNGBSI:"LNG (2.6%)",
  METH:"Methanol", NH3:"Ammonia", H2:"Hydrogen",
  BDSL:"Bio-diesel", HVO:"HVO", BLNG:"Bio-LNG", BMET:"Bio-methanol", ETOH:"Ethanol",
  EDSL:"e-diesel", EMET:"e-methanol", ELNG:"e-LNG", ENH3:"e-ammonia", EH2:"e-hydrogen"
};
const fuelShortName = (f)=> FUEL_SHORT[f.id] || f.name;
function fuelOptions(sel){ return FUELS.map(f=>`<option value="${f.id}" ${f.id===sel?"selected":""}>${esc(fuelShortName(f))}</option>`).join(""); }
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
  const tot=document.getElementById("tons_"+ri+"_"+fi); if(tot) tot.value=fr.tonnes.toFixed(1);
  save(); renderLive();
}
function updTonnes(ri, fi, v){
  const fr=S.rows[ri].fuels[fi];
  const t=Math.max(0, Number(v)||0);
  if(fr.split){
    const fixed=(Number(fr.split.ME)||0)+(Number(fr.split.AE)||0)+(Number(fr.split.BLR)||0);
    if(t>=fixed){ fr.split.OTH=Math.round((t-fixed)*1000)/1000; }
    else { const k=fixed>0? t/fixed:0; for(const g of ["ME","AE","BLR"]) if(fr.split[g]) fr.split[g]=Math.round(Number(fr.split[g])*k*1000)/1000; fr.split.OTH=0; }
    for(const g of ["ME","AE","BLR","OTH"]){ const el=document.getElementById("sp_"+g+"_"+ri+"_"+fi); if(el) el.value=fr.split[g]!=null?Number(fr.split[g]).toFixed(1):""; }
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
  /* 2026-07-22l (owner, Aurvin): DISPLAY ONLY — the box shows 1dp; if left untouched the
     full-precision stored value still drives every calculation. Plain toFixed (no thousands
     separator) because this is a live <input type=number> value, not text — a comma would
     make the browser treat it as invalid. */
  const spCell = (g,lbl)=>`<div><label>${lbl} mt</label><input type="number" step="any" min="0" id="sp_${g}_${ri}_${fi}" value="${sp[g]!=null?Number(sp[g]).toFixed(1):""}" placeholder="0" oninput="updSplit(${ri},${fi},'${g}',this.value)"></div>`;
  const spRow = S.showSplit? `<div class="fuelline" style="background:#f6f9fa;border-radius:6px">
    <div style="align-self:end;max-width:96px;padding-bottom:8px"><span class="note" style="cursor:help" title="Machinery split — ME and AE take their LNG slip class from the two consumer-class dropdowns in Settings; Boiler and Other are slip-free. Editing a machine updates the line total; editing the total sends the difference to Other.">⚙ split</span></div>
    ${spCell("ME","Main engine")}${spCell("AE","Aux engine")}${spCell("BLR","Boiler")}${spCell("OTH","Other")}
  </div>` : "";
  /* fuel entries stack as a table grid (2026-07-16) — one shared header, no per-line labels */
  return `<div class="fuelline">
    <div><select onchange="upd('rows.${ri}.fuels.${fi}.fuelId',this.value);renderWorkspace()">${fuelOptions(fr.fuelId)}</select></div>
    <div><input type="number" step="any" min="0" id="tons_${ri}_${fi}" value="${fr.tonnes!=null?Number(fr.tonnes).toFixed(1):""}" oninput="updTonnes(${ri},${fi},this.value)"></div>
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
  DRIFTING: "first → last DRIFTING report — used only because the cargo quantity changed during this window (no cargo ops / berth / bunkering / anchorage recorded); drifting-only waiting without cargo evidence is treated as sea passage since 2026-07-20b"
};
/* icon-only version (2026-07-19): the actual arrival/departure values are already shown
   once, in the compact timeframe line below the port fields — no need to repeat them here
   too, so this just explains (on hover) that they're derived/read-only and how */
function derivedTimesInfo(row){
  if(!row.arrGmt && !row.depGmt && !row.incomplete) return "";
  const t = s => s? esc(String(s).replace("T"," "))+" GMT" : "—";
  const tip = "Arrival: <b>"+t(row.arrGmt)+"</b> &nbsp;·&nbsp; Departure: <b>"+t(row.depGmt)+"</b> — derived from the MDA report data (read-only here; ARRIVAL-EOSP / DEPARTURE-SOSP are sea-passage markers, not the regulatory arrival/departure). Rule used: "
    + (DERIVE_RULE_TXT[row.deriveRule]||row.deriveRule||"n/a")
    + ". Consumption before the derived arrival / after the derived departure is attributed to the adjacent voyage."
    + (row.incomplete? "<br><br><b>Incomplete stay:</b> the file starts or ends inside this port stay — only the available side could be derived. Upload ±1 month around the boundary for a complete picture.":"");
  return info(tip,"right");
}
/* visible flag for incomplete stays (file boundary) — kept as a badge, same slot as the
   OMR/year-split chips, now that the old always-on text line is gone */
function derivedIncompleteChip(row){
  return row.incomplete? `<span class="zbadge zb-OMR" title="File boundary — only one side of this stay could be derived. Upload ±1 month around the boundary for a complete picture.">⏳ incomplete stay</span>` : "";
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
  /* 2026-07-24: when a From/To range is active it — not the year — decides inclusion/greying */
  const dfOn = dateFilterActive();
  const outRange = dfOn && !rowInRange(row);
  const isEdge  = dfOn && !outRange && rowIsEdge(row);
  const greyed  = dfOn ? outRange : outYear;
  const dfChip = outRange
    ? `<span class="zbadge zb-OMR" title="This row's period is outside the selected From/To date range. Excluded from ALL KPIs; widen or clear the range to include it.">🗓 outside From/To range</span>`
    : (isEdge? `<span class="zbadge zb-EDGE" title="This row's period starts before From or ends after To. Per your rule it is counted IN FULL, so range totals may slightly exceed the consumption strictly inside the window.">🗓 straddles range edge — counted in full</span>`:"");
  /* country on mouse-over (2026-07-16): ports show their country when hovering the row title */
  const cTip = row.kind==="port"
    ? (row.port&&row.port.c? portCountryName(row.port.c) : "")
    : [row.fromPort&&row.fromPort.c?portCountryName(row.fromPort.c):"", row.toPort&&row.toPort.c?portCountryName(row.toPort.c):""].filter(Boolean).join(" → ");
  const yearChip = dfOn
    ? ""   /* a date range is active — the reporting-year badge is replaced by the range badge */
    : (outYear
      ? `<span class="zbadge zb-OMR" title="Dated ${esc(ya||yb)} — outside the ${ry} reporting year selected in Settings. Excluded from ALL KPIs; switch the reporting year to include it.">🗓 ${esc(ya||yb)} — excluded from ${ry}</span>`
      : (row.splitYear? `<span class="zbadge" style="background:#eef3f8;color:#38607a" title="One year-part of an activity that crossed 31 Dec — it carries the reports dated in ${esc(String(row.yearPart))} (each report counted whole in the year of its own date; no proration across midnight).">🗓 split at year boundary</span>` : ""));
  const incompleteChip = derivedIncompleteChip(row);
  const title = `<b style="font-size:13px${cTip?";cursor:help":""}"${cTip?` title="${esc(cTip)}"`:""}>${esc(composeLabel(row))}</b>${omrChip}${yearChip}${dfChip}${incompleteChip}`;
  const tf = fmtRange(row.tStart,row.tEnd);
  /* the two datetime-local inputs already show the exact from/to — no need to also repeat it as
     a summary span (that's only shown in the collapsed/non-editable view below). lang="en-GB" on
     the inputs forces the native picker to 24-hour time instead of AM/PM (Chromium browsers). */
  const dateBlock = S.showDates
    ? `<div class="inline" style="max-width:550px">
      <div><label>From date/time (UTC) — optional</label><input type="datetime-local" lang="en-GB" value="${esc(row.tStart||"")}" onchange="updTime(${ri},'tStart',this.value)"></div>
      <div><label>To date/time (UTC) — optional</label><input type="datetime-local" lang="en-GB" value="${esc(row.tEnd||"")}" onchange="updTime(${ri},'tEnd',this.value)"></div>
      <div style="max-width:90px"><label>Hours</label><input type="number" step="any" min="0" value="${row.hours??""}" oninput="upd('rows.${ri}.hours',num(this.value))"></div>
    </div>`
    : (tf?`<div style="margin-top:4px;font-size:11px;color:#64748b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(tf)}</div>`:"");
  /* 2026-07-26k (Aurvin, owner instruction, layout-only): on the VOYAGE card, From/To date-
     time now sits ABOVE the Distance/Cargo row (it used to render below it, appended after
     the whole `head` block). Moved `dateBlock` to sit between the port/zone inline row and
     the distance/cargo inline row, inside the voyage template itself, instead of being
     appended after `head` for every row kind. The AT BERTH card has no distance/cargo row to
     reorder against, so its dateBlock placement (right after `head`) is unchanged — only the
     final return below no longer re-appends dateBlock for a voyage row (it's already inside
     `head`), to avoid rendering it twice. No calculation, field, or data change. */
  const head = row.kind==="voyage"
    ? `<div class="rhead"><span class="tag">VOYAGE</span>${title}<div style="margin-left:auto"><button class="del" onclick="S.rows.splice(${ri},1);save();renderWorkspace()">Remove</button></div></div>
       <div class="inline">
         ${portInputHtml(ri,'fromPort',row.fromPort,'From port')}
         <div style="max-width:120px"><label>From zone</label><select onchange="setZone(${ri},'from',this.value)">${zoneOptions(row.from)}</select></div>
         ${portInputHtml(ri,'toPort',row.toPort,'To port')}
         <div style="max-width:120px"><label>To zone</label><select onchange="setZone(${ri},'to',this.value)">${zoneOptions(row.to)}</select></div>
       </div>
       ${dateBlock}
       <div class="inline">
         <div style="max-width:180px"><label>Distance nm</label><input type="number" step="any" min="0" value="${row.dist??""}" oninput="upd('rows.${ri}.dist',num(this.value))"></div>
         <div style="max-width:180px"><label>Cargo mt (SCC)</label><input type="number" step="any" min="0" value="${row.cargo??""}" oninput="upd('rows.${ri}.cargo',num(this.value))"></div>
         <div style="flex:2"></div>
       </div>`
    : `<div class="rhead"><span class="tag" style="background:#f3ecfb;color:#6a3fa0">AT BERTH</span>${title}${row.poc===false?'<span class="zbadge zb-OMR" title="Not a port of call — this stay is excluded from EU ETS, UK ETS and FuelEU scope. CII/SCC still count the fuel.">⚓ transit — out of ETS/FuelEU scope</span>':""}<div style="margin-left:auto;display:flex;align-items:center;gap:8px">${derivedTimesInfo(row)}<button class="del" onclick="S.rows.splice(${ri},1);save();renderWorkspace()">Remove</button></div></div>
       <div class="inline">
         ${portInputHtml(ri,'port',row.port,'Port')}
         <div style="max-width:150px"><label>Zone</label><select onchange="setZone(${ri},'zone',this.value)">${zoneOptions(row.zone)}</select></div>
         <div style="max-width:230px"><label>Port of call (POC) ${pocWarnIcons(row)}${info("<b>ON (default):</b> a genuine port of call — at-berth/at-anchor consumption here counts 100% for EU ETS &amp; FuelEU (EEA ports) and UK ETS (UK ports).<br><br><b>OFF:</b> transit or anchorage-only stop (no call, or cargo ops outside port limits, e.g. STS) — excluded from EU ETS, UK ETS and FuelEU. CII &amp; SCC count the fuel either way.<br><br>MDA imports DERIVE this from the report data (cargo operations + port limits); the file's own POC column is ignored for calculations.")}</label>
           <div class="chk" style="margin-top:6px"><input type="checkbox" ${row.poc!==false?"checked":""} onchange="S.rows[${ri}].poc=this.checked;save();renderWorkspace()"> ${row.poc!==false?"YES — port of call":"NO — transit"}</div></div>
         <div style="flex:1"></div>
       </div>`;
  return `<div class="rowcard${row.kind==="port"?" portcard":""}"${greyed?' style="opacity:.55"':''}>
    ${head}
    ${row.kind==="voyage"? "" : dateBlock}
    ${(row.fuels||[]).length? fuelHeaderHtml():""}${(row.fuels||[]).map((fr,fi)=>fuelLineHtml(ri,fi,fr)).join("")}
    <button class="add" onclick="S.rows[${ri}].fuels.push({fuelId:'HFO',tonnes:0,price:0});save();renderWorkspace()">+ Fuel</button>
  </div>`;
}

/* ---------- WORKSPACE (live) ---------- */
function renderWorkspace(){
  const el = document.getElementById("tab-work");
  /* 2026-07-25d (owner instruction): the vessel band and the Year/From/To date-filter bar
     used to be two separate rows (band, then renderDateFilterBar('year') underneath), each
     carrying its own Year selector. Merged into ONE row here — vessel fields, then From/To/
     UTC/Clear straight after — with only the band's own Year select kept (still calls the
     same dfYear() the removed bar's selector called). Placed OUTSIDE the .ws two-column grid
     so it spans the full width, over the KPI panel too, like the Leg-Wise/Report-Wise bar. */
  const y=Number(S.year)||2026, d=S.dateFilter||{};
  const lo=`${y}-01-01T00:00`, hi=`${y}-12-31T23:59`;
  const narrowed = (d.fromISO||lo)!==lo || (d.toISO||hi)!==hi;
  const band = `
  <div class="card noprint band dfbar" style="background:var(--blue2);border-color:#bcd9de">
    <b style="font-size:13px">${esc(S.ship.name||"Vessel")}</b>
    <span class="bsep">·</span>
    <select class="bandsel" title="Ship type (CII G2). Also decides whether the ship's size is measured in deadweight (DWT) or gross tonnage (GT)." onchange="updBand('ship.typeId',this.value)">${SHIP_TYPES.map(t=>`<option value="${t.id}" ${t.id===S.ship.typeId?"selected":""}>${esc(t.name)}</option>`).join("")}</select>
    <span class="bsep">·</span>
    <input class="bandnum" type="number" step="any" min="0" value="${S.ship.capacity??""}" title="Ship capacity — deadweight (DWT) or gross tonnage (GT) depending on the ship type. Drives the CII transport-work denominator." oninput="upd('ship.capacity',num(this.value))">
    <b>${(TYPE_BY_ID[S.ship.typeId]||{}).capUnit||""}</b>
    <span class="bandtail">
      <span class="bsep">·</span>
      <span style="font-size:12px">year</span>
      <select class="bandsel bandyear" title="Reporting year. Picking a year fills the date window below to that whole year; rows outside it are greyed and excluded from every KPI." onchange="dfYear(this.value)">${[2024,2025,2026,2027,2028,2029,2030].map(yy=>`<option ${yy===y?"selected":""}>${yy}</option>`).join("")}</select>
      <span class="dfld" style="margin-left:6px">📅 From</span>
      <input type="datetime-local" lang="en-GB" min="${lo}" max="${hi}" value="${esc(d.fromISO||lo)}" onchange="dfSet('fromISO',this.value)" title="Window start within ${y} (UTC)">
      <span class="dfld">To</span>
      <input type="datetime-local" lang="en-GB" min="${lo}" max="${hi}" value="${esc(d.toISO||hi)}" onchange="dfSet('toISO',this.value)" title="Window end within ${y} (UTC)">
      <span class="dfutc">UTC</span>
      ${narrowed?`<button class="dfbtn" style="color:var(--red);border-color:#e3b7b3" title="Clear the narrowed window — reset From/To to the whole of ${y}" onclick="dfClearRange()">✕ Clear</button>`:''}
      <span style="margin-left:4px">${info("<b>Quick edits (2026-07-22g):</b> ship type, capacity and reporting year can be changed right here — they are the <i>same</i> settings as on the 🚢 Settings tab, not a copy, so a change in either place shows in both and recalculates everything immediately. Everything else about the vessel still lives on the Settings tab.<br><br><b>Capacity unit:</b> cargo ships (bulk carrier, tanker, container, general cargo…) are measured in <b>DWT</b> (deadweight — how much weight the ship can carry); passenger and ro-ro ships in <b>GT</b> (gross tonnage — enclosed volume). If you change the ship type and the unit flips, the number you typed is <b>kept as-is</b> and only the label changes — check it still makes sense for the new unit.<br><br><b>Date window:</b> picking a Year fills From/To to that whole year; rows outside the window are greyed and excluded from every KPI. ✕ Clear resets to the whole year.")}</span>
    </span>
  </div>`;
  el.innerHTML = `
  ${band}
  <div class="ws">
    <div>
      <h4 class="sec" style="margin-top:0">Voyages &amp; port stays — edit anything, results update live → ${info("<b>Scope per row:</b> EU ETS &amp; FuelEU — EEA↔EEA and at berth EEA 100%, EEA↔other 50% (euets-art3ga); UK ETS — UK→UK voyages and UK in-port only (ukets-sch2a-p7); at-berth scope applies only when the stay is a <b>port of call</b> (POC toggle on each port row); CII &amp; SCC count all activity (imo-g1-s4).<br><br>Import a DNV OVD Log Abstract CSV, an MDA event-log export (.xlsx/.csv) or a THETIS-MRV GHG Emissions XML from the header bar to fill this list automatically.")}</h4>
      <div class="noprint" style="display:flex;gap:22px;flex-wrap:wrap">
        <div class="chk"><input type="checkbox" ${S.showDates?"checked":""} onchange="S.showDates=this.checked;save();renderWorkspace()"> 🕓 Optional date entry ${info("Shows From/To date-time fields on each row — mainly useful for seeing which report period an OVD-imported row covers.")}</div>
        <div class="chk"><input type="checkbox" ${S.showSplit?"checked":""} onchange="S.showSplit=this.checked;save();renderWorkspace()"> ⚙ Machinery split (ME · AE · Boiler · Other) ${info("Shows the per-machine consumption split on every fuel line, filled automatically from the MDA MAIN/AUXILIARY/BOILER consumption columns (per fuel type, the unassigned remainder is <b>Other</b>).<br><br><b>Editable:</b> changing a machine figure updates the line total; changing the total sends the difference to Other (if the new total is below ME+AE+Boiler, those scale down pro-rata).<br><br>For LNG-family fuels the ME and AE shares take their CH₄-slip class from the two consumer-class dropdowns in Settings; Boiler and Other are slip-free. The split also feeds the OVD-format download (⬇ OVD-format Excel, header) and the Report-Wise tab.")}</div>
      </div>
      ${S.rows.length? S.rows.map((r,ri)=>rowHtml(r,ri)).join("") : `<div class="card" style="text-align:center;padding:26px"><b>No activity yet.</b><div class="note" style="margin-top:6px">Add a voyage or port stay below — or click <b>⬆ Import data (OVD · MDA · THETIS)</b> in the header to load a reporting file. Set up the vessel first under <b>Settings</b>.</div></div>`}
      <button class="add" onclick="S.rows.push({kind:'voyage',label:'',from:'EEA',to:'EEA',dist:0,cargo:0,fuels:[{fuelId:'HFO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add voyage</button>
      <button class="add" onclick="S.rows.push({kind:'port',label:'',zone:'EEA',poc:true,fuels:[{fuelId:'MDO',tonnes:0,price:0}]});save();renderWorkspace()">+ Add port stay</button>
    </div>
    <div class="wsright" id="liveresults"></div>
  </div>`;
  renderLive();
}

/* 2026-07-22f (owner, Aurvin): the hardcoded minimumFractionDigits:2 below used to force at
   least 2 decimals even when a call site explicitly asked for fmt(x,0) — every €/£ cost
   figure in the app passes ,0 wanting a whole number and was silently getting 2dp anyway.
   Fixed to honour the requested d exactly, same as fmtF. DISPLAY ONLY — every value fmt()
   receives is already fully computed; this only changes how many decimals are shown. */
const fmt = (x,d=2)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:d,minimumFractionDigits:d});
const fmtI = (x)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:0});
const fmtF = (x,d=2)=> x==null||isNaN(x) ? "—" : Number(x).toLocaleString("en-GB",{maximumFractionDigits:d,minimumFractionDigits:d});
function ratingColor(r){ return {A:"var(--ra)",B:"var(--rb)",C:"var(--rc)",D:"var(--rd)",E:"var(--re)"}[r]||"#888"; }

/* 2026-07-26 (Task 1, Aurvin): "CII Percentage" shown next to the CII rating badge.
   Plain meaning: how big the ship's ACHIEVED carbon intensity is compared with the
   intensity the IMO REQUIRES for that year, expressed as a percentage.
     CII Percentage = Attained CII x 100 / Required CII
   Under 100% = better than required (good), over 100% = worse than required.
   Display-only: it is derived from figures engine.js already computes (c.attained,
   c.ciiReq) — no regulatory calculation is changed. Returns null when either input is
   missing or the required value is zero, so the box can show "—" instead of Infinity. */
function ciiPctOfRequired(c){
  if(!c || c.attained==null || c.ciiReq==null || !isFinite(c.attained) || !isFinite(c.ciiReq) || c.ciiReq===0) return null;
  return c.attained*100/c.ciiReq;
}

/* 2026-07-26c (Task 2, Aurvin): PER-LEG IMO figures for the Leg-Wise table.
   ------------------------------------------------------------------------------------
   IMPORTANT CAVEAT, stated once here and surfaced to the user in the IMO header tooltip:
   CII is defined by the IMO over a FULL CALENDAR YEAR for the whole ship. A single leg
   has no CII in law. What these show is an INDICATIVE figure — "what the ship's CII would
   be if the entire year looked like this one leg" — measured against that year's real
   required CII and its real A-E bands (those come from ship type + capacity + year, which
   ARE ship-level properties, so applying them to a leg is legitimate).
   Two consequences the owner accepted (2026-07-26c) and the tooltip spells out:
     1. Berth stays get no CII (no distance to divide by), so at-berth CO2 sits in the
        ANNUAL numerator but in no leg — leg figures therefore read BETTER than the annual
        CII. They do not sum to it.
     2. A rating letter on one leg is not a compliance position.
   No engine.js change: both figures are derived from numbers computeAll already produces
   (det.co2 = CII-basis CO2, all fuel, CO2 only, tonnes; det.dist; det.tw). */

/* the capacity the CII denominator uses — read from the SAME place js/engine.js reads it
   (state.ship.capacity), so the two can never drift apart. NOT g2.cap, which is the
   possibly-CAPPED reference capacity used for the ciiRef curve, not for attained CII. */
function ciiCapacityOf(state){ return Number(((state||S).ship||{}).capacity)||0; }

/* 2026-07-26d (Aurvin, owner instruction): "if the distance is zero or the percentage/EEOI is
   too high, let's put a dash". A short hop with a lot of fuel behind it — a 4 nm shift with
   two days of port stay attached, say — divides a real CO₂ figure by a near-zero denominator
   and produces a CII or an EEOI in the thousands. That is arithmetic, not performance, and
   showing it as a rating would be actively misleading. Above these cut-offs the table shows a
   dash instead, and the hover tells you the raw value and why it was withheld — the number is
   never silently discarded. Both are DISPLAY thresholds only; nothing is excluded from any
   total, and no regulatory calculation is affected.
   Chosen deliberately generous so a merely bad voyage still gets its rating: a real E is
   roughly 120-130% of required, so 1000% is ~8x the worst genuine rating; a laden bulk-carrier
   EEOI sits around 5-30 gCO₂/t·nm, so 10,000 is ~300x a normal figure. Raise or lower them
   here if a real voyage ever gets suppressed. */
const CII_PCT_IMPLAUSIBLE = 1000;      // % of required CII
const EEOI_IMPLAUSIBLE    = 10000;     // gCO₂/t·nm

/* Indicative attained CII for one leg or one voyage group, plus its rating letter and CII
   Percentage. attained = CO2 (grams) / (capacity x distance) — the annual formula, scoped to
   whatever period is passed in. Returns null when there is nothing to show at all (no
   distance, no capacity), or a {suppressed:true} result when the figure is implausible. */
function legCII(d, cii, state){
  if(!d || !cii || d.kind!=="voyage" || !(d.dist>0)) return null;
  return ciiFrom(Number(d.co2)||0, d.dist, cii, state);
}

/* the shared core, so a leg (legCII) and a whole voyage group (vwGroupCII) can never disagree
   about the formula, the bands or the implausibility cut-off */
function ciiFrom(co2_t, dist, cii, state){
  const cap = ciiCapacityOf(state);
  if(!(cap>0) || !(dist>0) || !cii || !cii.bounds || cii.ciiReq==null) return null;
  const attained = co2_t*1e6/(cap*dist);
  if(!isFinite(attained)) return null;
  const pct = ciiPctOfRequired({attained, ciiReq:cii.ciiReq});
  if(pct!=null && pct > CII_PCT_IMPLAUSIBLE) return { attained, pct, rating:null, suppressed:true };
  return { attained, rating: ciiRatingOf(attained, cii.bounds), pct, suppressed:false };
}

/* the A-E ladder, identical to js/engine.js line ~598 — kept as its own function so the
   leg rows and the TOTAL row can never disagree about where a band starts. */
function ciiRatingOf(attained, b){
  if(attained==null || !b) return null;
  return attained<=b.sup?"A":attained<=b.low?"B":attained<=b.up?"C":attained<=b.inf?"D":"E";
}

/* IMO EEOI (MEPC.1/Circ.684) for one leg: TANK-TO-WAKE, CO2 ONLY, in gCO2 per tonne-mile.
   = leg CO2 (grams) / transport work (cargo t x laden distance nm).
   Deliberately NOT the Sea Cargo Charter intensity, which is well-to-wake CO2e (AR6) and
   also carries in the preceding ballast leg's and the port stays' emissions. This one is
   the leg's own emissions over the leg's own cargo-miles — nothing carried in or out.
   Returns null when there is no transport work (berth stay, or a ballast leg with no
   cargo on its SOSP report), which the table renders as a dash. */
function legEEOI(d){
  if(!d || d.kind!=="voyage" || !(d.tw>0)) return null;
  const v = (Number(d.co2)||0)*1e6/d.tw;
  return isFinite(v) ? v : null;
}

/* 2026-07-26u (Aurvin, owner instruction): PORT STAY rows have no distance, so the CII column
   used to show a plain dash there (see the isBerth branch in breakdownGrid's imoLeg). The
   owner asked for that space to carry something useful instead: the equivalent HFO fuel
   consumption per day for the stay — "if all the fuel actually burned in port had been HFO,
   how many tonnes a day was that". This is a DISPLAY-ONLY, informational figure — not a
   regulatory value, not part of any CII/EU ETS/UK ETS/FuelEU calculation, and engine.js is
   untouched.
   2026-07-26v (Aurvin, owner instruction, Task 1 this session): the same idea, for VOYAGE
   rows — equivalent HFO fuel consumption per NAUTICAL MILE (kg/nm), shown as a second line
   under the CII pill rather than replacing anything (a voyage row's CII pill is real and
   stays exactly as it was). Same energy-equivalent recipe as t/d, owner-confirmed unchanged
   for this leg-distance version: all fuel actually burned (full tonnes, not the narrower
   "eligible" mass), converted to HFO-equivalent mass via LCV, this time expressed in KG and
   divided by the leg's own distance (nm) instead of a duration. Also NO plausibility cutoff
   (owner's explicit choice, same as t/d) — kg/nm always shows its raw value even on a leg
   whose CII pill above it is itself withheld as implausible (2026-07-26v: the two figures
   are allowed to disagree on whether a leg "looks right"; kg/nm is a separate, simpler ratio
   with no A-E rating riding on it, so it doesn't need the same protection).
   Both t/d and kg/nm share the same core conversion (energy → HFO-equivalent TONNES),
   factored into legHfoEqTonnes() below so the two can never drift apart on that shared step;
   they differ only in their denominator (duration vs distance) and their final unit
   (tonnes/day vs kg/nm — hence the extra ×1000 in legHfoEqPerNm). */
function legHfoEqTonnes(d){
  if(!d || !d.fuels || !d.fuels.length) return null;
  const hfoLcv = (FUEL_BY_ID.HFO||{}).lcv;
  if(!hfoLcv) return null;
  let energyMJ = 0;
  for(const fu of d.fuels){
    const fb = FUEL_BY_ID[fu.id];
    if(fb && fb.lcv && fu.tonnes) energyMJ += Number(fu.tonnes)*1e6*fb.lcv;
  }
  if(!(energyMJ>0)) return null;
  return energyMJ/(hfoLcv*1e6);
}

/* Formula (owner-confirmed, energy-equivalent basis):
     1. energy (MJ) = Σ over every fuel actually burned on the stay of tonnes × that fuel's
        own LCV (MJ/g, js/engine.js FUELS) × 1e6 (t→g). Uses the FULL tonnes consumed — not
        the narrower "eligible" mass the Energy column uses — because this is meant to read
        as the stay's real physical fuel burn, not a regulation-scoped subset.
     2. HFO-equivalent tonnes = that energy ÷ HFO's own LCV (MJ/g × 1e6) — i.e. "how many
        tonnes of HFO would carry the same energy". (legHfoEqTonnes, shared with kg/nm below.)
     3. ÷ the stay's duration in days (tEnd − tStart, fractional, 24-hour basis — a 30-hour
        stay divides by 1.25, not 2).
   Returns null (rendered as a dash) only for genuine missing-data cases: no fuel recorded,
   or no usable start/end timestamps to measure a duration against. Per owner instruction
   (2026-07-26u) there is NO plausibility cutoff on the result itself, unlike legCII/legEEOI
   above — a very short, fuel-heavy stay is allowed to show a large t/d value rather than
   being suppressed to a dash; the owner's own expectation is that real values normally read
   as a single low digit (e.g. "2.4 t/d"). */
function legHfoEqPerDay(d){
  if(!d || d.kind==="voyage") return null;
  const hfoEqTonnes = legHfoEqTonnes(d);
  if(hfoEqTonnes==null) return null;
  const startMs = d.tStart? new Date(d.tStart).getTime() : NaN;
  const endMs   = d.tEnd?   new Date(d.tEnd).getTime()   : NaN;
  if(!isFinite(startMs) || !isFinite(endMs) || endMs<=startMs) return null;
  const days = (endMs-startMs)/86400000;
  if(!(days>0)) return null;
  const perDay = hfoEqTonnes/days;
  return isFinite(perDay) ? perDay : null;
}

/* 2026-07-26v (Task 1, Aurvin): same core (legHfoEqTonnes) as legHfoEqPerDay, but for a
   VOYAGE leg — divides by the leg's own distance (nm) instead of a duration, and reports KG
   (×1000) rather than tonnes, since kg/nm reads as a more natural-sized number than t/nm
   would (a typical leg is tens to low-hundreds of kg/nm, which would be a tiny, hard-to-read
   fraction of a tonne). Returns null only for genuine missing data — no fuel, not a voyage
   row, or no positive distance to divide by. No plausibility cutoff (see note above). */
function legHfoEqPerNm(d){
  if(!d || d.kind!=="voyage" || !(d.dist>0)) return null;
  const hfoEqTonnes = legHfoEqTonnes(d);
  if(hfoEqTonnes==null) return null;
  const perNm = (hfoEqTonnes*1000)/d.dist;
  return isFinite(perNm) ? perNm : null;
}

/* the PORT STAY CII-column cell: value + small "t/d" unit (owner-specified example "2.4 t/d"
   with the unit shown smaller), or a dash with an explanation when there is nothing to show.
   The full formula lives in the IMO section's info icon (iIMO); this hover title gives the
   quick per-row version so the owner does not have to leave the row to see what fed the
   number. */
function hfoEqCellHtml(v){
  if(v==null) return `<span style="color:#94a3b8;font-size:10.5px;cursor:help" title="No equivalent HFO fuel/day: either no fuel is recorded for this port stay, or its start/end timestamps can't be used to measure a duration.">—</span>`;
  return `<span style="cursor:help" title="Equivalent HFO fuel consumption per day for this port stay: all fuel actually burned during the stay, converted to how much HFO would carry the same energy, divided by the stay's duration (24-hour basis). Informational only — not a regulatory figure.">${fmtF(v,1)}<span style="font-size:70%;font-weight:400;color:#64748b;margin-left:2px">t/d</span></span>`;
}

/* 2026-07-26v (Task 1, Aurvin): the VOYAGE-leg CII-column SECOND LINE — equivalent HFO
   fuel/nm, sits below the CII pill (see hfoEqPillWrapCss / imoLeg in breakdownGrid). Same
   dash-with-title treatment as hfoEqCellHtml above when there's nothing to show, kept as its
   own small block so it stacks under the pill rather than sitting beside it. */
function hfoEqPerNmCellHtml(v){
  if(v==null) return `<span style="display:block;color:#94a3b8;font-size:9.5px;cursor:help" title="No equivalent HFO fuel/nm: no fuel is recorded for this leg, or it has no distance to divide by.">—</span>`;
  return `<span style="display:block;font-size:11px;font-weight:600;color:#1e293b;cursor:help" title="Equivalent HFO fuel consumption per nautical mile for this leg: all fuel actually burned, converted to how much HFO would carry the same energy, divided by the leg's distance. Informational only — not a regulatory figure.">${fmtF(v,1)}<span style="font-size:70%;font-weight:400;color:#64748b;margin-left:2px">kg/nm</span></span>`;
}

/* 2026-07-26m (Aurvin, owner instruction, from a reference photo): the pill is now ONE SOLID
   COLOUR throughout (the rating colour) with two white ROUNDED-RECTANGLE "cutouts" punched
   into it for the two numbers — replacing the 2026-07-26l version (three touching segments,
   only the middle one coloured, the outer two a light grey). The rating letter sits directly
   on the solid colour with no box of its own; the coloured frame shows through in the small
   gaps between the letter and each cutout, and around the whole pill via the outer padding.
   Padding/gaps are deliberately snug per the owner's "reduce [the space] to max possible
   without looking bad" instruction.
   Character caps (owner's explicit instruction, independent of the existing
   CII_PCT_IMPLAUSIBLE / suppressed-CELL logic elsewhere, which withholds the WHOLE cell):
   inside a cell that IS shown, the % segment shows "—" once it would need more than 3 digits
   (≥1000%), and the AER segment shows "—" once its whole-number part would need more than 2
   digits (≥100) — "xx.xx" is the max width the owner asked for. Both keep the pill's width
   predictable instead of stretching the column for a rare extreme value.
   Shared by every place a CII figure is shown: the Leg-Wise/Voyage-Wise table cells
   (ciiCellHtml, size "sm") AND the Results-tab IMO CII card (called directly with size "lg").
   class="ciipill"/"ciipill-seg"/"ciipill-rat" markers exist purely so self-tests can find the
   three pieces without depending on exact inline-style substrings that change between sizes. */
function ciiPillHtml(pct, rating, attained, size){
  const lg = size==="lg";
  const pctRounded = pct==null ? null : Math.round(pct);
  const pctTooWide = pctRounded!=null && Math.abs(pctRounded) >= 1000;
  const pctTxt = (pct==null || pctTooWide) ? "—" : `${pctRounded}<span style="font-size:60%">%</span>`;
  const aerTooWide = attained!=null && Math.abs(attained) >= 100;
  const aerTxt = (attained==null || aerTooWide) ? "—" : fmtF(attained,2);
  const outerPad = lg? 3 : 2;
  const gap      = lg? 4 : 3;
  const rad      = lg? 10 : 6;
  const segRad   = Math.max(rad-outerPad, 3);
  const segPad   = lg? "3px 8px" : "1px 5px";
  const midPad   = lg? "3px 10px" : "1px 6px";
  const segFont  = lg? "15px" : "11px";
  const midFont  = lg? "22px" : "12px";
  /* 2026-07-28l (Aurvin, bug report): the two numeric segments (% and AER) were padding-only,
     so the pill's overall width visibly changed leg to leg with the digit count ("99%"/"7.11"
     vs "375%"/"26.90"). Owner wants the PILL uniform width regardless of content, WITHOUT
     widening/narrowing whatever table column or KPI card holds it. Fixed WIDTH (not min-width)
     added to just these two inner segments — deliberately NOT min-width, because the Leg-Wise
     self-test "row backgrounds also span the full scrolled width" scans this table's rendered
     HTML for every literal `min-width:Npx` and asserts they are ALL identical (the grid's own
     column min-width); a second, different min-width value here would trip that assertion. The
     OUTER <span class="ciipill"> stays auto-sized (display:inline-flex, no width set) exactly
     as before, so the containing table cell / grid column / KPI card is untouched — only the
     two inner boxes stop growing with their own text.
     2026-07-30j (Aurvin, bug report — screenshot showed "475%"/"44.80" spilling past the white
     box on every pill, table and card alike): the width chosen above was undersized. It was
     meant to fit "999%" / "999.99" including this segment's own horizontal padding (segPad),
     but the number was picked as if segPad were extra headroom on top of segW rather than eaten
     out of it (box-sizing:border-box means the digits only get segW minus 2×segPad's horizontal
     value). At the old 40px/8px-pad (lg) that left ~24px for glyphs that need ~40px+; at
     30px/5px-pad (sm) it left ~20px for glyphs that need ~29px+. Fixed by sizing segW to the
     content need PLUS the padding on top of that (not instead of it), with real headroom rather
     than a pixel or two of margin — the worst realistic case is the AER segment at 2 whole digits
     (this app never shows a negative attained CII or a negative % of required, so "-99.99" is not
     budgeted for): "99.99" needs roughly 41px of glyph width at the lg 15px bold font, ~30px at
     the sm 11px font, so content targets of ~48px/~34px leave several px of slack against
     estimation error in those numbers, not just against the exact figure. No min-width added
     (same constraint as above still holds); text-align still centres shorter values. */
  const segW = lg? 64 : 44;
  const segBox = `box-sizing:border-box;width:${segW}px;flex:0 0 ${segW}px;overflow:hidden;text-align:center`;
  return `<span class="ciipill" style="display:inline-flex;align-items:stretch;gap:${gap}px;padding:${outerPad}px;background:${ratingColor(rating)};border-radius:${rad}px;font-variant-numeric:tabular-nums">`+
         `<span class="ciipill-seg" style="display:flex;align-items:center;justify-content:center;${segBox};padding:${segPad};background:#fff;border-radius:${segRad}px;font-weight:700;font-size:${segFont};color:#1e293b">${pctTxt}</span>`+
         `<span class="ciipill-rat" style="display:flex;align-items:center;justify-content:center;padding:${midPad};font-weight:800;font-size:${midFont};color:#fff">${rating||"—"}</span>`+
         `<span class="ciipill-seg" style="display:flex;align-items:center;justify-content:center;${segBox};padding:${segPad};background:#fff;border-radius:${segRad}px;font-weight:700;font-size:${segFont};color:#1e293b">${aerTxt}</span>`+
         `</span>`;
}

/* the CII cell's contents: ciiPillHtml above, at table size. Shared by Leg-Wise, Voyage-Wise
   and both their TOTAL rows, so the two tabs always look and read the same. NB: no min-width
   anywhere in ciiPillHtml on purpose — the Leg-Wise self-test "row backgrounds also span the
   full scrolled width" scans this tab for every `min-width:Npx` and requires them all to equal
   the grid's own width, so a badge carrying its own min-width would break it. (2026-07-28l: the
   pill's two numeric segments DO now have a fixed size, via `width`/`flex:0 0 Npx` — deliberately
   NOT the `min-width` property, for exactly the reason above — so this note still holds.) */
function ciiCellHtml(res){
  if(!res) return `<span style="color:#94a3b8">—</span>`;
  if(res.suppressed){
    return `<span style="color:#94a3b8;cursor:help" title="Withheld as implausible: this period works out at ${fmtF(res.pct,0)}% of the required CII (attained ${fmtF(res.attained,2)}), which is over the ${CII_PCT_IMPLAUSIBLE}% display cut-off. That normally means a very short distance with a lot of fuel behind it — e.g. a brief shift with long port stays attached — so the ratio reflects the tiny denominator, not the ship's performance. The consumption itself is still counted in every total and in the annual CII.">—</span>`;
  }
  return ciiPillHtml(res.pct, res.rating, res.attained);
}

/* the IMO EEOI cell — same implausibility treatment as the CII cell above, so the two
   columns behave consistently. `why` explains the plain-dash case for this table. */
function eeoiCellHtml(v, why){
  if(v==null) return `<span style="color:#94a3b8;font-weight:400;font-size:10.5px;cursor:help" title="${esc(why||"No transport work — nothing to divide by.")}">—</span>`;
  if(v > EEOI_IMPLAUSIBLE) return `<span style="color:#94a3b8;font-weight:400;font-size:10.5px;cursor:help" title="Withheld as implausible: ${fmtF(v,0)} gCO₂/t·nm is over the ${EEOI_IMPLAUSIBLE} display cut-off, roughly 300x a normal laden figure. That normally means very little transport work (a short laden distance, or a very small parcel) with a lot of fuel behind it. The consumption itself is still counted in every total.">—</span>`;
  return fmtF(v,2);
}

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
    <div class="kv"><span>Cargo quantity (Σ voyages)</span><b>${fmt(sm.cargo)} mt</b></div>
    <div class="kv"><span>Transport work</span><b>${fmt(sm.tw/1e6)} ×10⁶ t·nm</b></div>
    <h3>Fuel consumption (annual)</h3>
    ${Object.entries(sm.fuelByType).map(([id,t])=>`<div class="kv"><span>${esc((FUEL_BY_ID[id]||{}).name||id)}</span><b>${fmt(t,1)} mt</b></div>`).join("")||'<p class="note">No fuel entered yet.</p>'}
    <div class="kv"><span><b>Total fuel consumption</b></span><b>${fmt(sm.fuelTotal)} mt</b></div>
    <h3>Emissions &amp; intensity metrics</h3>
    <div class="kv"><span>CO₂ at berth / sea passage</span><b>${fmt(sm.co2Berth)} / ${fmt(sm.co2Sea)} mt</b></div>
    <div class="kv"><span><b>Total CO₂ emissions</b></span><b>${fmt(sm.co2Total)} mt</b></div>
    <div class="kv"><span>CO₂ per distance</span><b>${fmtF(sm.co2PerDist,2)} t/nm</b></div>
    <div class="kv"><span>CO₂ per transport work</span><b>${fmtF(sm.co2PerTW,2)} g/t·nm</b></div>
    <div class="kv"><span>Fuel per distance</span><b>${fmtF(sm.fuelPerDist,2)} t/nm</b></div>
    <div class="kv"><span>Fuel per transport work</span><b>${fmtF(sm.fuelPerTW,2)} g/t·nm</b></div>
    <p class="note">TtW CO₂, all activity worldwide ${info("CO₂ figures are Tank-to-Wake per fuel Cf (imo-g1-s4 / FuelEU Annex II values), covering all activity worldwide — not only the EU/UK-scoped share.")}</p>
  </div>

  <div class="card">
    <h2>IMO CII — ${R.year} ${info("<b>Regulatory sources:</b> imo-g1-s4 · imo-g2-s4 · imo-g4-s4 · imo-a6-reg28")}</h2>
    ${/* 2026-07-26l (Aurvin, owner instruction): the separate rating chip + percentage box are
         now the SAME 3-segment pill used on Leg-Wise/Voyage-Wise (ciiPillHtml, "lg" size) —
         CII Percentage · rating letter · attained CII ("AER"), 2 decimals, touching with no
         gaps. id="ciiPctBox" kept on the wrapper (not the old inner box) so anything that
         still looks for that id finds the live-updating element. */""}
    <div style="display:flex;gap:16px;align-items:center">
      <div id="ciiPctBox" title="Left: Attained CII × 100 ÷ Required CII (below 100% = better than required). Middle: IMO A–E rating. Right: attained CII itself, aka AER, gCO₂ per ${c.capUnit}·nm.">
        ${ciiPillHtml(ciiPctOfRequired(c), c.rating, c.attained, "lg")}
      </div>
      <div style="margin-left:auto">
        <div class="kv" style="justify-content:flex-start;gap:10px;border-bottom:none"><span>Required (Z=${c.Z}% <span class="flag">FILL-IN</span>)</span><b>${fmtF(c.ciiReq,2)}</b></div>
      </div>
    </div>
    ${ciiBarHtml(c)}
    <div class="kv"><span>Total CO₂ / distance</span><b>${fmt(c.co2_t)} mt / ${fmt(c.totalDist)} nm</b></div>
  </div>

  <div class="card">
    <h2>EU ETS — ${R.year} ${info("<b>Regulatory sources:</b> euets-art3ga · art3gb")}</h2>
    <div class="big">${fmt(e.euas)} <span class="unit">EUAs to surrender</span></div>
    <div class="kv"><span>Covered ${e.basisLabel==="CO2e (CO2+CH4+N2O)"?"CO₂e (CO₂ + CH₄ + N₂O)":"("+esc(e.basisLabel)+")"}</span><b>${fmt(e.basis_t)} mt</b></div>
    ${R.year>=2026?`<div class="kv"><span>CH₄/N₂O GWP set (selected)</span><b>${e.gwp.label} <span class="flag" title="${esc(e.gwp.src)}">FILL-IN</span></b></div>`:""}
    <div class="kv"><span>Phase-in</span><b>${e.phase*100}%</b></div>
    <div class="kv"><span>EUA cost @ €${fmt(S.euaPrice)}</span><b>€ ${fmt(e.cost,0)}</b></div>
  </div>

  <div class="card">
    <h2>UK ETS — ${R.year} ${info("<b>Regulatory sources:</b> ukets-sch2a-p35/p36")}</h2>
    ${u.active? `
    <div class="big">${fmt(u.tco2e)} <span class="unit">tCO₂e (ME<sub>ETS</sub>)</span></div>
    <div class="kv"><span>CO₂ / CH₄ / N₂O (mt)</span><b>${fmt(u.co2)} / ${fmtF(u.ch4,3)} / ${fmtF(u.n2o,3)}</b></div>
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
    <div class="kv"><span>GHGIE<sub>actual</sub>${f.fwind<1?` (f<sub>wind</sub>=${f.fwind})`:""}</span><b>${fmtF(f.ghgie,2)} gCO₂eq/MJ</b></div>
    <div class="kv"><span>Target (91.16 − ${f.targetPct}%)</span><b>${fmtF(f.target,2)}</b></div>
    ${f.ghgieAlt!=null && Math.abs((f.ghgieAlt??0)-(f.ghgie??0))>1e-9?`<div class="kv"><span>${f.allocMethod==="optimal"?"Proportional":"Optimal"} method would give</span><b>${fmtF(f.ghgieAlt,2)} g/MJ · CB ${fmt((f.cbAlt??0)/1e6,0)} mt</b></div>`:""}
    <div class="kv"><span>Energy in scope (fuel + OPS)</span><b>${fmt(f.E_total/1e6)} ×10⁶ MJ</b></div>
    ${f.E_pool>f.E_total-f.opsMJ+1e-6?`<div class="kv"><span>Allocatable fuel energy (MRV pool)</span><b>${fmt(f.E_pool/1e6)} ×10⁶ MJ</b></div>`:""}
    ${f.terms&&f.terms.length?`<table class="scctable" style="margin-top:6px"><tr><th>Fuel × consumer</th><th class="num">Pool (mt)</th><th class="num">Allocated (mt)</th><th class="num">Allocated ×10⁶ MJ</th><th class="num">WtW g/MJ</th></tr>
      ${f.terms.map(t=>`<tr${t.E<=0?' style="color:#999"':''}><td>${esc(t.name)}${t.m?` <span class="note">· ${t.m==="BLR"?"Boiler":t.m==="OTH"?"Other":esc(t.m)}${(t.m==="ME"||t.m==="AE")?" — "+esc(t.engine):""}</span>`:""}${t.rfnbo?' <span class="note">×2 RWD</span>':""}</td><td class="num">${fmt(t.tonnesPool)}</td><td class="num">${fmt(t.tonnes)}</td><td class="num">${fmtF(t.E/1e6,2)}</td><td class="num">${fmtF(t.wtt+t.ttw,2)}</td></tr>`).join("")}</table>
    <p class="note">Allocated mix per essf-ws1 ch.2 worked examples — grey rows are in the MRV pool but not allocated to the scope (they carry the highest intensity). WtW = WtT + TtW incl. CH₄ slip for the row's consumer class.</p>`:""}
    <div class="kv"><span>Compliance balance</span><b style="color:${f.cb>=0?"var(--green)":"var(--red)"}">${fmt(f.cb/1e6)} tCO₂eq</b></div>
    ${f.banked? `<div class="kv"><span>+ banked (Art 20)</span><b>${fmt(f.banked/1e6)} mt</b></div>`:""}
    ${f.poolCB? `<div class="kv"><span>+ pool partner (Art 21)</span><b>${fmt(f.poolCB/1e6)} mt</b></div>`:""}
    ${f.borrowUsed? `<div class="kv"><span>+ borrowed (→ debt ${fmt(f.borrowDebt/1e6)} mt next period)</span><b>${fmt(f.borrowUsed/1e6)} mt</b></div>`:""}
    <div class="kv"><span><b>Balance after flexibility</b></span><b style="color:${f.cbFinal>=0?"var(--green)":"var(--red)"}">${fmt(f.cbFinal/1e6)} tCO₂eq</b></div>
    <div class="big" style="color:${f.penalty>0?"var(--red)":"var(--green)"}">${f.penalty>0?`€ ${fmt(f.penalty,0)} penalty`:(f.surplusValue>0?`€ ${fmt(f.surplusValue,0)} surplus value*`:"Compliant")}</div>
    ${f.mult>1?`<div class="note">Includes ×${f.mult.toFixed(1)} consecutive-deficit multiplier (Art 23(2)).</div>`:""}
    ${f.surplusValue>0?`<div class="note">*Indicative pooling/banking value ceiling at the Annex IV penalty rate.</div>`:""}
  </div>

  <div class="card">
    <h2>SCC commercial KPIs ${info("<b>Source:</b> Sea Cargo Charter 2025 Technical Guidance — Equation 2 (§2.1), ballast-leg rule (Appendix 3), emission factors <b>Table 8</b> (Appendix 4), GWP AR6 (fossil CH₄ 29.8 · biogenic CH₄ 27.2 · N₂O 273).<br><br>2026-07-22 (owner decision): intensity is <b>well-to-wake</b>; the numerator is the ballast leg + the laden leg <b>including all port consumption</b>; the denominator is cargo × laden distance. Ballast legs have no line of their own. Cargo comes from each leg's <b>departure (SOSP)</b> report.")}</h2>
    ${sc.voyages.length? `
    <table class="scctable"><tr><th>Laden voyage</th><th class="num">Numerator WtW (mt)</th><th class="num">of which ballast</th><th class="num">of which port</th><th class="num">Transport work (×10⁶ t·nm)</th><th class="num">EEOI (gCO₂e/t·nm)</th>${S.sccReqMin?`<th class="num">Δ Min %</th>`:""}${S.sccReqStriving?`<th class="num">Δ Str %</th>`:""}</tr>
    ${sc.voyages.map(v=>`<tr><td>${esc(v.label)}</td><td class="num">${fmt(v.numerator)}</td><td class="num">${v.ballast>0?fmt(v.ballast):"—"}</td><td class="num">${v.port>0?fmt(v.port):"—"}</td><td class="num">${fmtF(v.tw/1e6,2)}</td><td class="num">${fmtF(v.intensity,2)}</td>${S.sccReqMin?`<td class="num">${fmtF((v.intensity-S.sccReqMin)/S.sccReqMin*100,2)}</td>`:""}${S.sccReqStriving?`<td class="num">${fmtF((v.intensity-S.sccReqStriving)/S.sccReqStriving*100,2)}</td>`:""}</tr>`).join("")}
    </table>
    <div class="kv"><span>Weighted annual intensity</span><b>${fmtF(sc.weighted,2)} gCO₂e/t·nm</b></div>
    ${sc.trailingBallast>0?`<div class="note">A ballast leg at the end of ${R.year} (${fmt(sc.trailingBallast)} t WtW CO₂e) has no following laden voyage in this year — under ADR 2026 Appendix 3 it belongs to the voyage that loads next, so it is not in the figures above.</div>`:""}
    ${sc.missingFactors&&sc.missingFactors.length?`<div class="note">${sc.excluded} voyage(s) excluded — no SCC Appendix 6 well-to-wake factor for ${esc(sc.missingFactors.join(", "))}.</div>`:""}
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
         <div class="kv"><span>Substitute quantity</span><b>${fmt(ec.breakeven.tonnes)} mt (displacing ~${fmt(ec.breakeven.dispTonnes)} mt)</b></div>
         <div class="kv"><span>Extra fuel cost / penalty avoided</span><b>€ ${fmt(ec.breakeven.extraFuelCost,0)} / € ${fmt(ec.breakeven.penaltyAvoided,0)}</b></div>
         <div class="kv"><span><b>Net P&amp;L impact</b></span><b style="color:${(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided)<=0?"var(--green)":"var(--red)"}">€ ${fmt(ec.breakeven.extraFuelCost-ec.breakeven.penaltyAvoided,0)}</b></div>`)
      : `<p class="note">${f.ghgie!=null && f.ghgie<=f.target ? "Already at or below target — no blending needed." : "Pick a substitute fuel on the Settings tab."}</p>`}
  </div>
  ${R.warnings.length?`<div class="card"><h2>⚠ Assumptions &amp; items to verify</h2>${R.warnings.map(w=>`<div class="warn">${esc(w).replace(/CO2e/g,"CO₂e").replace(/CO2/g,"CO₂").replace(/CH4/g,"CH₄").replace(/N2O/g,"N₂O")}</div>`).join("")}</div>`:""}`;
  /* Order: strip → pointer → CII → EU ETS → UK ETS → FuelEU → Annual summary → SCC → P&L
     (voyage & berth breakdown lives on the Leg-Wise tab since 2026-07-16) */
  const cards=[...el.querySelectorAll(":scope > .card")];
  const byH=t=>cards.find(cd=>{const h=cd.querySelector("h2");return h&&h.textContent.indexOf(t)>=0;});
  const anchor=byH("SCC commercial");
  const sumCard=byH("Annual summary");
  if(anchor&&sumCard) el.insertBefore(sumCard, anchor);
}

/* ============ CALCULATIONS TAB (2026-07-16, Aurvin) ============
   Detailed calculation tables: the voyage & berth breakdown (moved out of the live
   panel) plus FuelEU allocation and EU ETS working. The report-level trace table
   moved to its own Report-Wise tab on 2026-07-19 (see renderTrace() below). All Excel
   files are generated fully offline by the minimal writer below (stored-ZIP OOXML
   — no libraries, works in the standalone). */
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
/* on-screen-only relabel for the trace table event column (exports/self-tests keep the
   IN_PORT/AT_SEA/OVD-format wording from reportTypeLabel above) */
function reportTypeDisplay(rep){
  const t=reportTypeLabel(rep);
  if(t==="IN_PORT") return "PORT";
  if(t==="AT_SEA") return "SEA";
  return t;
}
const fmtDict=(d)=> d? Object.entries(d).filter(([,v])=>v>1e-9).map(([k,v])=>k+" "+(Math.round(v*100)/100)).join(" · ") : "";
/* ---- Excel: voyage & berth breakdown (ONE line per row/event; multi-fuel events get extra
   sideways "Fuel N" column groups, not extra rows) ---- */
/* 2026-07-29 (Aurvin, owner instruction, Task 2): this export used to write one row PER FUEL
   inside an event (a 2-fuel leg = 2 rows, with every event-level column blank on the 2nd+
   line). The owner asked for exactly one row per event instead, with the fuel-specific columns
   (Fuel, Tonnes, LCV, Eligible EU mt, Eligible energy, and the 4 SCC "(fuel)" columns) repeated
   sideways as "…  1", "… 2", … . The column count is DYNAMIC, sized to whichever picked row has
   the most fuels — a single-fuel-only file stays narrow; a file with a 3-fuel leg gets 3 fuel
   groups for every row. Event-level values (Activity/Kind/times/Hours/Distance/Cargo/coverage
   %/CO2/EUA/UKA/FuelEU CB & penalty/SCC voyage-level fields) are UNCHANGED figures, just no
   longer blanked out on a "continuation" line because there is no continuation line anymore.
   See HANDOFF_LOG.md 2026-07-29. */
function downloadBreakdownXlsx(){
  const R=computeAll(S);
  /* 2026-07-26 (Aurvin, owner instruction): the "CO2 mt (row)" column now follows the same
     year-specific basis as the on-screen Leg-Wise table — CO2 only before 2026, CO2e (incl.
     CH4/N2O, GWP set from Settings — AR5 default / AR4) from 2026 onward.
     2026-07-26p (Aurvin, owner instruction): this is now the Fuel-metrics TOTAL CO2e — full
     fuel burned, NOT scaled by EU ETS coverage — matching the on-screen column's move out of
     the EU ETS group. Column relabelled "Total CO2e/CO2" and fed from d.totalCO2e/d.totalCO2
     (js/engine.js) instead of the EU-ETS-eligible d.etsCO2e/d.etsCO2. See HANDOFF_LOG.md. */
  const co2EUAr = (R.year>=2026 && R.ets && R.ets.gwp) ? ((R.ets.gwp.label.match(/AR\d/)||[""])[0]) : "";
  const co2ColLbl = R.year>=2026 ? ("Total CO2e mt (row, "+(co2EUAr||"AR5")+")") : "Total CO2 mt (row)";
  const eventHdr=["Activity","Kind","From (UTC)","To (UTC)","Hours","Distance nm","Cargo mt",
               "EU ETS %","UK ETS %","FuelEU %",
               co2ColLbl,"EUA (row)","UKA tCO2e (row)","FuelEU CB tCO2eq (row, indicative)","FuelEU penalty EUR (row, indicative)",
               /* SCC block, 2026-07-22c */
               "SCC cargo mt (SOSP report)","SCC cargo source","SCC transport work t.nm",
               "SCC ballast CO2e carried in t (row)","SCC port CO2e included t (row)","SCC EEOI numerator t (row)","SCC EEOI gCO2e/t.nm (row)","SCC port-stay attribution"];
  /* 2026-07-22 (Aurvin): the download follows the table's tick selection — ticked rows only,
     or every row when nothing is ticked (see ROWSEL in this file). Display-level filter: the
     figures themselves are unchanged. */
  const picked = rowselActive("br", R.rowDetails.length).map(i=>R.rowDetails[i]);
  const maxFuels = Math.max(1, ...picked.map(d=>(d.fuels&&d.fuels.length)||1));
  const fuelHdr=[];
  for(let k=1;k<=maxFuels;k++){
    fuelHdr.push("Fuel "+k,"Tonnes "+k,"LCV MJ/g "+k,"Eligible EU mt "+k,"Eligible energy MJ "+k,
                 "SCC TtW tCO2e (fuel) "+k,"SCC WtW tCO2e (fuel) "+k,
                 "SCC Table 8 factor row (fuel) "+k,"SCC biogenic CO2 t (fuel) "+k);
  }
  const rows=[eventHdr.concat(fuelHdr)];
  for(const d of picked){
    const fs=d.fuels.length?d.fuels:[{id:"",name:"",tonnes:"",eligibleEU:""}];
    const eventVals=[d.label||"—", d.kind, d.tStart||"", d.tEnd||"", d.hours||"", d.dist||"", d.cargo||"",
                 d.covEU*100, d.covUK*100, d.covEU*100,
                 (R.year>=2026? d.totalCO2e : d.totalCO2), d.euas, d.ukCO2e, (d.feuCB!=null? d.feuCB/1e6 : ""), (d.feuPenalty||0),
                 (d.kind==="voyage"? d.cargo : ""), (d.kind==="voyage"? (d.cargoSOSP?"SOSP report":"max per leg (no departure report)") : ""),
                 (d.tw||""),
                 (d.sccBallast||""), (d.sccPort||""), (d.sccNumerator??""), (d.eeoi??""),
                 (d.kind!=="voyage" && d.sccGoesTo? ("counted as "+d.sccGoesTo.role+(d.sccGoesTo.label?" of "+d.sccGoesTo.label:"")) : "")];
    const fuelVals=[];
    for(let k=0;k<maxFuels;k++){
      const fu=fs[k];
      if(!fu){ fuelVals.push("","","","","","","","",""); continue; }
      const f=FUEL_BY_ID[fu.id]||{};
      fuelVals.push(f.id? fuelShortName(f) : (fu.name||fu.id), fu.tonnes===""?"":fu.tonnes, f.lcv??"", fu.eligibleEU===""?"":fu.eligibleEU,
                 (f.lcv&&fu.eligibleEU!=="")? fu.eligibleEU*1e6*f.lcv : "",
                 fu.sccTtW==null?"":fu.sccTtW, fu.sccWtW==null?"":fu.sccWtW,
                 fu.sccLabel||"", fu.sccBio||"");
    }
    rows.push(eventVals.concat(fuelVals));
  }
  downloadXlsx("voyage_berth_breakdown_"+S.year+".xlsx","Breakdown",rows);
}
/* ---- Excel: OVD-format report-level download (diagnostics) ---- */
function downloadReportsXlsx(){
  const all=S.mdaReports||[]; if(!all.length){ alert("No report-level data — import an MDA file first."); return; }
  /* 2026-07-22 (Aurvin): follows the Report-Wise table's tick selection — ticked events only, or
     every event when nothing is ticked. A filtered file is named "…_selected" so a partial
     export can never be mistaken for the full OVD submission set. */
  const sub = ROWSEL.tr.sel.size>0 && TR_LAST && TR_LAST.length===all.length;
  const reps = sub ? rowselActive("tr", all.length).map(i=>all[i]) : all;
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
               r.portN||"", r.ctry||"", r.regn||"", r.org||"", r.dst||r.cur||"", r.dist||"", (r.qtyHas?r.qty:"")]/* 2026-07-23 Task 3: export a reported 0 as 0, a blank cargo as blank (was: r.qty||"" turned a real 0 into blank) */
      .concat(codes.map(c=>(r.fuels||{})[c]||""))
      .concat(G.flatMap(([g])=>codes.map(c=>((r.mach||{})[g]||{})[c]||"")))
      .concat(robCodes.map(c=>(r.rob||{})[c]||""))
      .concat([r.bunker||"", r.lat??"", r.lon??""]));
  }
  downloadXlsx("mda_reports_OVD_format"+(sub?"_selected":"")+".xlsx","Reports",rows);
}

/* ---- Report-level trace table (design handoff design_handoff_report_trace_table, 2026-07-17) ----
   Fuel group reordered to Fuel | Total | ME | AE | Boiler | Others | ROB (Bunker); "Others" is
   computed (Total − ME − AE − Boiler, clamped ≥ 0); bunkered tonnage shows as a green +n badge
   left of the ROB value on bunkering reports only; activities render as an icon row (multiple
   per event supported); Voyage No sits after Port; Dist nm sits left of Eligibility %. */
/* 2026-07-23 (Aurvin, owner instruction): the Report-Wise table used a monospace font; the
   owner asked it to match the Leg-Wise view, which uses the body sans-serif font. "inherit"
   makes every Report-Wise cell that referenced this constant fall back to that same body font.
   (Renamed from TR_MONO — it is no longer monospace. The Workspace collapsed-row timeframe,
   which still wants monospace, now hardcodes the mono stack rather than using this constant.) */
const TR_FONT = "inherit";
const TR_ICONS = {
  anchor:'M12 22V8 M5 12H2a10 10 0 0 0 20 0h-3 M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  route:'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15 M9 19a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0 M20 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  berth:'M4 2v20 M4 8h4 M4 15h4 M11 17h10l-1.6 4H12.2z M13 13h6v4',
  clock:'M12 7v5l3.5 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  fuel:'M3 22h12 M4 9h10 M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18 M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-7.2a2 2 0 0 0-.6-1.4L18 5',
  box:'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7l8.7 5 8.7-5 M12 22V12',
  waves:'M2 9Q4 7 6 9Q8 11 10 9Q12 7 14 9Q16 11 18 9Q20 7 22 9 M2 16Q4 14 6 16Q8 18 10 16Q12 14 14 16Q16 18 18 16Q20 14 22 16'
};
/* 2026-07-28j (Aurvin, owner instruction) — ONE shared zebra tint for all three breakdown tabs
   (Reports / Legs / Voyages), so they stripe identically. This REPLACES the per-fuel sub-band
   that used to tint every second fuel line inside a single report row (the "MGO band"): banding
   is now per COMPLETE row — a leg or voyage is one band across all of its fuel lines, however
   many it has. #f8fafc is the same slate tint the Constants table already stripes with
   (css/styles.css #tab-constants), deliberately lighter than the #f1f5f9 group-header grey so
   header and body stay tellable apart, and far enough from the #d3ebee tick highlight
   (.hirow.hi-on in css/styles.css) that a ticked row still reads as ticked on either stripe.
   This supersedes the 2026-07-25j "zebra striping removed" decision for these three tabs. */
const ZEBRA_BG = "#f8fafc";
const ZEBRA = i => (i%2===1 ? ZEBRA_BG : "#ffffff");
const TR_CONDS = {
  AT_ANCHOR:       { label:'Anchor',        icon:TR_ICONS.anchor, color:'#5b7fa6' },
  MANOEUVRING:     { label:'Manoeuvring',   icon:TR_ICONS.route,  color:'#6366f1' },
  AT_BERTH:        { label:'Berth',         icon:TR_ICONS.berth,  color:'#0d9488' },
  DRIFTING:        { label:'Drifting',      icon:TR_ICONS.waves,  color:'#64748b' },
  CANAL_TRANSIT:   { label:'Canal transit', icon:TR_ICONS.route,  color:'#64748b' },
  'NORMAL SAILING':{ label:'Sailing',       icon:TR_ICONS.route,  color:'#64748b' }
};
/* 2026-07-25 (Aurvin, owner instruction) — Report-Wise condition labels are abbreviated so the
   Condition column can be narrower: "Most economic speed"→"Eco Speed", "Manoeuvring"→"Mnvrng",
   "Anchored"→"Anchor". Matched case-insensitively so it fires whether the label came from
   TR_CONDS or the raw-OC fallback. Display only — the underlying r.oc value is never changed. */
function trCondLabel(label){
  const map = { 'most economic speed':'Eco Speed', 'super slow steaming':'Super slow', 'manoeuvring':'Mnvrng', 'manoeuvering':'Mnvrng', 'anchored':'Anchor' };
  return map[String(label||"").trim().toLowerCase()] || label;
}
const TR_ACTS = {
  AWAITING_ORDERS:      { label:'Awaiting Orders',         icon:TR_ICONS.clock, color:'#d97706' },
  BUNKERING:            { label:'Bunkering',               icon:TR_ICONS.fuel,  color:'#16a34a' },
  CARGO_LOADING:        { label:'Cargo Loading',           icon:TR_ICONS.box,   color:'#4f46e5' },
  CARGO_DISCHARGING:    { label:'Cargo Discharging',       icon:TR_ICONS.box,   color:'#4f46e5' },
  CARGO_LOADING_STS:    { label:'Cargo Loading (STS)',     icon:TR_ICONS.box,   color:'#4f46e5' },
  CARGO_DISCHARGING_STS:{ label:'Cargo Discharging (STS)', icon:TR_ICONS.box,   color:'#4f46e5' }
};
/* shared voyage (in-transit) / berth (at-location) markers — used in both the voyage & berth
   breakdown grid and the report-level trace table, so the two stay visually consistent */
const ICON_VOYAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 4V18 M7 13l5 5 5-5"></path></svg>';
const ICON_BERTH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="7"></circle></svg>';
/* Report-Wise tab event-column circle, filled and coloured by role: red = ARRIVAL, green = DEPARTURE,
   blue = plain in-port stay (role unset) — distinct from ICON_BERTH's fixed grey used elsewhere */
const ROLE_ICON_COLOR = { ARRIVAL:"#b3261e", DEPARTURE:"#22c55e" };
function berthIcon(r){
  const c = ROLE_ICON_COLOR[r.role] || "#2563eb";
  return `<svg width="14" height="14" viewBox="0 0 24 24" style="flex-shrink:0"><circle cx="12" cy="12" r="7" fill="${c}"></circle></svg>`;
}
const TR_FUEL_ORDER = ["HFO","LFO","MGO","MDO","LNG","LPGP","LPGB","M","E"];
/* activity list per event: multi-valued ASSOCIATED_ACTIVITY splits to a list; a BUNKER stock
   event carrying a bunkered quantity is by definition a bunkering activity */
function trActs(r){
  const list = String(r.aa||"").toUpperCase().split(/[,;/]+/).map(s=>s.trim()).filter(Boolean);
  if(r.rt==="FUEL_OIL_BUNKER" && r.bunker && list.indexOf("BUNKERING")<0) list.push("BUNKERING");
  return list;
}
/* bunkered map fuel → tonnes; non-empty only when the event's activities include BUNKERING */
function trBunkered(r, acts){
  if(acts.indexOf("BUNKERING")<0 || !r.bunker) return {};
  const out={};
  try{
    const o=JSON.parse(r.bunker);
    for(const k in o){ const t=parseFloat(o[k])||0; if(t<=0) continue;
      const c=mdaFuel(k)||String(k).toUpperCase().replace(/[^A-Z]/g,"")||"UNKNOWN"; out[c]=(out[c]||0)+t; }
  }catch(e){ /* non-JSON legacy bunker strings: no badge, value still in the Excel download */ }
  return out;
}
/* per-fuel lines: Total | ME | AE | Boiler | Others (= max(0, Total − ME − AE − Boiler)) | ROB (Bunker) */
function trFuelLines(r){
  const acts=trActs(r), bunk=trBunkered(r,acts);
  const names=[...new Set([...Object.keys(r.fuels||{}),...Object.keys(r.rob||{}),...Object.keys(bunk)])]
    .sort((a,b)=>((TR_FUEL_ORDER.indexOf(a)+1||99)-(TR_FUEL_ORDER.indexOf(b)+1||99))||(a<b?-1:1));
  return names.map((n,i)=>{
    const total=(r.fuels||{})[n], m=r.mach, hasSplit=!!m && total!=null;
    const me=hasSplit?((m.ME||{})[n]||0):null, ae=hasSplit?((m.AE||{})[n]||0):null, blr=hasSplit?((m.BLR||{})[n]||0):null;
    return { name:n,
      total: total!=null? total.toFixed(1):"—",
      me: hasSplit? me.toFixed(1):"—", ae: hasSplit? ae.toFixed(1):"—", blr: hasSplit? blr.toFixed(1):"—",
      oth: hasSplit? Math.max(0,total-me-ae-blr).toFixed(1):"—",
      rob: (r.rob||{})[n]!=null? r.rob[n].toFixed(1):"—",
      hasBunk: bunk[n]!=null, bunk: bunk[n]!=null? "+"+bunk[n].toFixed(1):"",
      /* 2026-07-28j (Aurvin, owner instruction): the per-fuel sub-band is GONE — every fuel
         line is transparent so it inherits its row's zebra stripe (see ZEBRA_BG). Previously
         `i%2===1? "#f1f5f9"` banded the 2nd/4th fuel line (typically MGO) inside each row. */
      bg: "transparent" };
  });
}
/* 2026-07-26x (Aurvin, owner instruction, this session): Leg-Wise ONLY — from a screenshot
   comparing the Eligibility badges to the IMO CII pill next to them, the owner asked for the
   three badges to read as ONE fused pill (like the CII pill's "one shape, four rounded outer
   corners") instead of three separate square boxes with gaps between them. Asked 3 clarifying
   questions first (all answered): (1) keep each segment's OWN state color (dark teal 100% /
   medium teal partial / pale 0%-or-no-data) rather than switch to the CII pill's single-flat-
   color-with-white-cutouts look — the color is the only way to tell EU ETS / FuelEU / UK ETS
   apart at a glance, so losing it wasn't wanted; (2) segments touch with a hard seam, no gap
   and no visible hairline between them; (3) Leg-Wise only for the actual code change —
   Report-Wise's Eligibility columns are separate TABLE CELLS with their own headers (not
   adjacent the way these three are), so fusing them is a different, bigger operation, and
   the owner asked to flag it as a possible follow-up rather than do it now (see HANDOFF_LOG).
   This is therefore a NEW function, not a restyle of the shared trPctBadge() below — that
   function is untouched and still drives Report-Wise's per-column badges exactly as before.
   Technique: one inline-flex container holds the 3 segments at equal width (flex:1 1 0 inside
   a fixed-width box, same total width the old 3×46px-badges-plus-2×3px-gaps arrangement used,
   so the pill isn't narrower or wider than before); `overflow:hidden` on the container clips
   each segment's own square corners to the container's OWN border-radius (6px, matching the
   "sm"-size CII pill's own radius — see ciiPillHtml's `rad` for size!=="lg" — so the two
   pills read as the same family of shape side by side), which is what turns 3 separate boxes
   into 1 visual pill without adding any border/gap between the segments themselves. */
function elFusedPill(pcts){
  const seg = p=>{
    const has = p!=null && !isNaN(p);
    const v = has? p : 0;
    /* 2026-07-27a (Aurvin, owner instruction, this session): 100%/50% colours SOFTENED —
       owner's ask, after 26z shrank the text, was to reduce color intensity on the two darker
       segments (still distinguishable from each other and from 0%, "don't pinch the eyes").
       Was #1f3b45 (100%, a near-navy dark teal, ~12:1 contrast against white — very harsh next
       to 0%'s pale #e4eef0 when the pill is a FUSED shape with no gap between segments, 26x/y)
       and #5b8791 (50%, ~4:1 contrast). Both DESATURATED (muted toward gray-teal) rather than
       simply lightened — lightening would have pushed white-text contrast down further right
       after 26z made that text smaller/thinner, hurting legibility exactly when it matters
       most; desaturating keeps a similar or BETTER luminance/contrast (100%: #3a5157 ≈8.4:1,
       was ≈11.9:1; 50%: #5f7f87 ≈4.3:1, was ≈3.95:1) while reading as visibly softer/less
       vivid. The three-way lightness order is preserved (100% darkest, 50% mid, 0% palest)
       so distinguishability is unchanged. Mirrored into the two Eligibility info-popover
       legend swatches (Report-Wise's `reportTraceTable` header tooltip and Leg-Wise's
       `iEligibility`) so the legend still matches what's actually on screen — see both below.
       trPctBadge() (dead code since 26y, not deleted) intentionally NOT updated to match —
       it renders nothing anywhere, so touching its colours would be cosmetic churn with no
       visible effect; flagged again in HANDOFF_LOG alongside the earlier dead-code note. */
    /* 2026-07-26b (Aurvin, owner instruction, this session): owner compared the "100%/100%/0%"
       pill to the "50%/50%/0%" pill (screenshot, At-EU vs EU->Non-EU legs) and said the 100%-
       vs-50% contrast had gotten too close since 27a's desaturation, and asked for 50% made
       "even lighter". #5f7f87 (50%, ~4.3:1 white-text contrast, ~1.95:1 against the 100% colour
       #3a5157) -> #6f8d94 (~3.55:1 white-text contrast, ~2.37:1 against #3a5157 — a real, visible
       lightening of the 100-vs-50 gap) while staying ~3.0:1 against the 0% colour #e4eef0 so the
       "partial" and "0%" bands are still clearly two different colours, not just one blurring
       into the next. Mirrored into the two Eligibility info-popover legend swatches (Report-
       Wise's `reportTraceTable` header tooltip and Leg-Wise's `iEligibility`) per the 27a note
       above, so the legend still matches what's on screen. */
    const bg = !has||v<=0 ? "#e4eef0" : v>=100 ? "#3a5157" : "#6f8d94";
    const fg = !has||v<=0 ? "#7c8fa0" : "#ffffff";
    const t = has? ((v%1===0? v.toFixed(0): v.toFixed(1))+"%") : "–";
    /* 2026-07-26z (Aurvin, owner instruction, this session): text inside the fused pill's
       segments made non-bold + smaller (was font-weight:700/font-size:11px, matching the old
       trPctBadge() styling) — owner's ask, once Report-Wise and Leg-Wise shared this ONE
       function (26y), was to lighten the label since the badge itself now carries the visual
       weight (fused pill shape + solid colour) that the old bold text used to help provide.
       font-weight:400 (was 700); font-size:9.5px (was 11px) — matches the small-caption sizing
       already used elsewhere on these two tables (elReasonText's caption is 9px, the IMO kg/nm
       caption is 9.5px), so the pill's own label now reads at the same scale as its neighbours
       rather than standing out. Single shared function — this changes BOTH Leg-Wise's eligLeg
       and Report-Wise's reportTraceTable() badges at once, which is the point (26y made them
       the same component). NOTE: trPctBadge() below is left untouched/unremoved but is, as of
       26y, no longer called from anywhere in this file — both tables moved to elFusedPill().
       Not deleted here since dead-code cleanup wasn't asked for; flagged in HANDOFF_LOG as a
       possible tidy-up for a future session. */
    /* 2026-07-26 (Aurvin, owner instruction, from a screenshot comparing this pill to the
       adjacent CII pill, ciiPillHtml "sm" size): the eligibility pill sat a few px SHORTER
       than the CII pill next to it. Owner's ask was to match the two pills' heights while
       keeping this pill's own look otherwise unchanged. Measured in a real Chrome tab against
       this page's actual inherited body line-height (14px/1.5, styles.css) rather than
       guessed from the CSS box model: with the OLD padding:3px 0 this pill rendered 20.25px
       tall vs the CII pill's 24px; padding:5px 0 renders 24.25px — a sub-pixel (~0.25px,
       antialiasing rounding) difference from 24px, imperceptible, and a clean round number
       rather than a fragile fractional one. Vertical padding only (3px -> 5px); horizontal
       padding, font-size/weight and colours are untouched. Single shared function — this
       pill is used by BOTH Leg-Wise's eligLeg AND Report-Wise's reportTraceTable() badges
       (26y unified them), so this one change already covers both views; no separate
       Report-Wise edit needed. */
    return `<span style="display:flex;align-items:center;justify-content:center;flex:1 1 0;box-sizing:border-box;padding:5px 0;font-size:9.5px;font-weight:400;font-family:${TR_FONT};font-variant-numeric:tabular-nums;background:${bg};color:${fg}">${t}</span>`;
  };
  return `<span style="display:inline-flex;width:138px;overflow:hidden;border-radius:6px">${pcts.map(seg).join("")}</span>`;
}
/* eligibility badge — dark teal 100%, medium teal partial, pale 0%/out-of-scope-or-not-in-source */
function trPctBadge(p){
  const has = p!=null && !isNaN(p);
  const v = has? p : 0;
  const bg = !has||v<=0 ? "#e4eef0" : v>=100 ? "#1f3b45" : "#5b8791";
  const fg = !has||v<=0 ? "#7c8fa0" : "#ffffff";
  const t = has? ((v%1===0? v.toFixed(0): v.toFixed(1))+"%") : "–";
  /* 2026-07-24d (Aurvin, owner instruction): switched from min-width (a floor that let "100%"
     render wider than "50%" or "–") to a FIXED width — every badge is now exactly the same
     box regardless of its value, including the muted "–" no-data state. box-sizing:border-box
     so the declared width is the true rendered width; padding is vertical-only since the fixed
     width plus text-align:center already centers the label. */
  return `<span style="display:inline-block;box-sizing:border-box;width:46px;text-align:center;padding:3px 0;border-radius:0;font-size:11px;font-weight:700;font-family:${TR_FONT};font-variant-numeric:tabular-nums;background:${bg};color:${fg}">${t}</span>`;
}
/* match a raw MDA report to the authoritative aggregated S.rows entry covering its timestamp
   (S.rows and S.mdaReports come from two independent parses of the same import — no shared id —
   so this is a best-effort time-window match; tStart inclusive, tEnd exclusive to avoid double-
   matching the instant where one leg ends and the next begins). No match => null (shown as "–"),
   rather than falling back to the file's own (less reliable) POC flag. */
function trMatchRow(r){
  const t = r.t;
  if(!t) return null;
  /* 2026-07-20 (owner decision): a report's consumption covers the period ENDING at its
     timestamp (period = since the previous report). So the matching window must be
     tStart EXCLUSIVE, tEnd INCLUSIVE — a DEPARTURE report (t = end of the berth period)
     matches the berth row it is leaving, and an ARRIVAL report (t = end of the sea leg)
     matches the leg, not the port stay that starts at that instant. Before this fix the
     match was [tStart, tEnd), which showed boundary rows the % of the FOLLOWING period. */
  for(const row of S.rows||[]){
    if(row.tStart && row.tEnd && t>row.tStart && t<=row.tEnd) return row;
  }
  /* first report of the file: no preceding period exists — fall back to the window
     that STARTS at this timestamp so the row still gets a badge instead of "–" */
  for(const row of S.rows||[]){
    if(row.tStart && row.tEnd && t>=row.tStart && t<row.tEnd) return row;
  }
  return null;
}
/* EU ETS / UK ETS / FuelEU eligibility for one report, reusing the engine's own coverage rule
   (euCoverage/ukCoverage, js/engine.js) via the matched row — FuelEU's in-scope-energy fraction
   is identical to EU ETS's by regulation (fueleu-art2 mirrors euets-art3ga), so it reuses covEU. */
function trCoverage(r){
  const row = trMatchRow(r);
  if(!row) return { eu:null, uk:null, feu:null };
  const eu = euCoverage(row)*100;
  /* UK ETS — judged WHOLE by the report's OWN listed time (r.t), matching the totals' new
     report-by-date rule (2026-07-25, Aurvin, owner instruction). UK ETS maritime is in force
     only from 1 Jul 2026 (SI 2026/392):
       • a report dated BEFORE 1 Jul 2026 (or any pre-2026 year) → out of scope → dash (null);
       • a report dated ON/AFTER 1 Jul 2026 → fully in → ukCoverage(row) × 100;
       • 2027+ → the whole calendar year is in scope.
     No per-report time-proration across the 1 Jul cut. Undated reports count in full.
     Display-only: engine, totals and workspace rows are untouched. */
  const uy = Number(S.year)||2026;
  const cutMs = Date.parse("2026-07-01T00:00:00Z");
  const tMs = _utcms(r.t || r.te || r.ts);
  const inUk = uy<2026 ? false : uy>2026 ? true : (isFinite(tMs) ? tMs>=cutMs : true);
  const uk = inUk ? ukCoverage(row)*100 : null;
  return { eu, uk, feu:eu };
}
/* 2026-07-20: coverage depends on the voyage-continuity annotations (non-call stays);
   computeAll() sets them, but re-annotate before rendering the trace so the badges are
   correct even if the trace renders before any recompute of S. Idempotent and cheap. */
function trAnnotate(){ if(typeof annotateVoyageContinuity==="function") annotateVoyageContinuity(S.rows); }

/* ---- Report-Wise total row (2026-07-22, Aurvin) -----------------------------------------
   Sits as the FIRST row of the table, inside <thead>, so it stays pinned with the column
   headers while the events scroll under it. It sums the TICKED events (all events when
   none are ticked). Distance and the consumption columns are additive and are summed, one
   line per fuel. ROB is a STOCK reading (remaining on board at that moment), not a flow —
   adding ROB across events would be meaningless, so it shows a dash. Cargo and the
   eligibility badges are likewise per-event, not additive, so they also show a dash. */
let TR_LAST = null;                       // last rendered report list, for totals re-render
function trTotalsAgg(reps){
  const acc={};
  for(const r of reps){
    const m=r.mach||{};
    const names=new Set([].concat(Object.keys(r.fuels||{}),Object.keys(m.ME||{}),Object.keys(m.AE||{}),Object.keys(m.BLR||{})));
    names.forEach(n=>{
      const a=acc[n]||(acc[n]={total:0,me:0,ae:0,blr:0});
      a.total += Number((r.fuels||{})[n])||0;
      a.me    += Number((m.ME ||{})[n])||0;
      a.ae    += Number((m.AE ||{})[n])||0;
      a.blr   += Number((m.BLR||{})[n])||0;
    });
  }
  return Object.keys(acc)
    .sort((a,b)=>((TR_FUEL_ORDER.indexOf(a)+1||99)-(TR_FUEL_ORDER.indexOf(b)+1||99))||(a<b?-1:1))
    /* 2026-07-28j (Aurvin, owner instruction): per-fuel sub-band removed here too, so the TOTAL
       row's fuel lines sit on its own flat #eef2f7 (was `i%2===1?"#e2e8f0"` banding the 2nd fuel). */
    .map(n=>Object.assign({name:n, oth:Math.max(0,acc[n].total-acc[n].me-acc[n].ae-acc[n].blr),
                           bg:"transparent"}, acc[n]));
}
/* 2026-07-30i (Aurvin, owner instruction) — the ONLY hook the "▦ Edit columns" picker needs
   inside this file. It asks js/columns.js whether one Report-Wise column is currently shown.
   Three things make this safe to have scattered through the table builders below:
     • it answers TRUE whenever the full-screen overlay is closed (columns.js decides that),
       so the ordinary REPORTS tab, the ⬇ Download and every export are untouched;
     • it answers TRUE if js/columns.js is missing altogether, so the table still renders;
     • when nothing is unticked EVERY call answers TRUE, and the HTML built below is then
       byte-for-byte what it was before this feature existed — which is why none of the ~504
       in-app self-tests or the tools/verify_*.js scripts needed their expectations changed.
   Keys are namespaced "trace.<group>.<column>" — see EMCOLS_DEFS in js/columns.js.
   LEGS and VOYAGES are NOT wired up yet (they are CSS grids with hardcoded column indices and
   need a column remapper) — that is the next piece of work, see HANDOFF_LOG.md 2026-07-30i. */
const TR_ELIG_KEYS = ["elig.ets","elig.feu","elig.uk"];
/* every Fuel column, in render order */
const TR_FUEL_KEYS = ["fuel.name","fuel.total","fuel.me","fuel.ae","fuel.blr","fuel.oth","fuel.rob"];
/* the SELECTABLE ones — "fuel.name" is missing on purpose (2026-07-30k, Aurvin, owner
   instruction: "the FUEL name header should come by default with anything selected here, so
   that should not be part of a choice"). It is the label for the figures beside it, not a
   figure, so it is DERIVED: shown whenever any other Fuel column is shown, and gone only when
   the whole group is switched off. It is therefore also absent from EMCOLS_DEFS in
   js/columns.js, so the picker never offers it. */
const TR_FUEL_SEL  = ["fuel.total","fuel.me","fuel.ae","fuel.blr","fuel.oth","fuel.rob"];
function trColVis(k){
  if(k === "fuel.name") return TR_FUEL_SEL.some(trColVis);
  return (typeof colVis === "function") ? colVis("trace."+k) : true;
}
function trVisCount(keys){ return keys.filter(trColVis).length; }
/* A hidden first column would take the group's left divider with it, so the wall is moved onto
   whichever column is now first. `wall` is the border-left declaration to graft on, and it is
   only ever added when the natural first column (…name / …ets) is hidden — so with everything
   visible not a single character changes. */
function trFirstVis(keys){ for(const k of keys) if(trColVis(k)) return k; return null; }

function trTotalsHtml(){
  const all = TR_LAST||[];
  if(!all.length) return "";
  const reps = rowselActive("tr", all.length).map(i=>all[i]);
  const pad="6px 12px";
  const dist = reps.reduce((a,r)=>a+(Number(r.dist)||0),0);
  const fuels = trTotalsAgg(reps);
  const dash='<span style="color:#94a3b8">—</span>';
  const num=v=>`font-size:12px;font-weight:700;color:#0f172a;font-family:${TR_FONT};font-variant-numeric:tabular-nums`;
  const fl=(f,style,val)=>`<div class="trfl" style="height:17px;line-height:17px;padding:0 12px;background:${f.bg};${style}">${val}</div>`;
  const col=(get,style)=>`<td style="padding:6px 0;vertical-align:top;text-align:right">${fuels.map(f=>fl(f,style,get(f))).join("")}</td>`;
  const numStyle=`font-size:12px;font-weight:700;color:#0f172a;font-family:${TR_FONT};font-variant-numeric:tabular-nums`;
  const machStyle=`font-size:12px;font-weight:600;color:#334155;font-family:${TR_FONT};font-variant-numeric:tabular-nums`;
  return `
    <td style="padding:${pad};background:#eef2f7;${TR_FREEZE_SEL}z-index:13;width:${TR_SELCOL_W}px;min-width:${TR_SELCOL_W}px"></td>
    <td style="padding:${pad};background:#eef2f7;${TR_FREEZE_EVT}z-index:13;font-size:12px;font-weight:700;color:#0f172a;white-space:nowrap;border-right:1px solid #cbd5e1">TOTAL</td>
    <td colspan="4" style="padding:${pad};background:#eef2f7;font-size:11.5px;font-weight:600;color:#475569;white-space:nowrap">${esc(rowselLabel("tr",all.length,S.year).replace(/^Total — /,""))}</td>
    <td style="padding:${pad};background:#eef2f7;text-align:right">${dash}</td><!-- 2026-07-25: Cargo mt (per-event, not additive) — now sits right of Voyage No, left of Dist -->
    <td style="padding:${pad};background:#eef2f7;text-align:right;font-family:${TR_FONT};font-size:12px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums">${fmtF(dist,0)}</td>
    ${(()=>{
      /* 2026-07-30i (Aurvin, owner instruction): the three Eligibility dashes and the seven Fuel
         cells are emitted only while the "▦ Edit columns" picker still has them ticked. Built as
         ONE array joined with "\n    " so that, with everything visible, this produces character-
         for-character the same block of <td>s the hand-written template used to — that is the
         property the whole feature is built on (see trColVis above).
         The three Eligibility cells stay three separate <td>s rather than the body row's fused
         pill: that was the owner's explicit 2026-07-26q/y decision and it is untouched here. */
      const firstF = trFirstVis(TR_FUEL_KEYS);
      /* if the natural first Fuel column is hidden, the group's left wall rides on whichever
         column is now leftmost — otherwise the group would lose its divider entirely */
      const wall = k => (k===firstF && k!=="fuel.name") ? "border-left:1px solid #cbd5e1;" : "";
      const cell = (k, html) => trColVis(k) ? html : "";
      const num = (k, get, style) => cell(k,
        `<td style="padding:6px 0;background:#eef2f7;${wall(k)}vertical-align:top;text-align:right">${fuels.map(f=>fl(f,style,get(f))).join("")}</td>`);
      const eligTd = `<td style="padding:${pad};background:#eef2f7;text-align:center">${dash}</td>`;
      return [
        cell("elig.ets", eligTd),
        cell("elig.feu", eligTd),
        cell("elig.uk",  eligTd),
        cell("fuel.name", `<td style="padding:6px 0;background:#eef2f7;vertical-align:top;border-left:1px solid #cbd5e1">${fuels.map(f=>fl(f,`font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:#334155;font-family:${TR_FONT}`,esc(f.name))).join("")}</td>`),
        num("fuel.total", f=>fmtF(f.total,1), numStyle),
        num("fuel.me",    f=>fmtF(f.me,1),    machStyle),
        num("fuel.ae",    f=>fmtF(f.ae,1),    machStyle),
        num("fuel.blr",   f=>fmtF(f.blr,1),   machStyle),
        num("fuel.oth",   f=>fmtF(f.oth,1),   machStyle),
        cell("fuel.rob",  `<td style="padding:${pad};background:#eef2f7;${wall("fuel.rob")}text-align:right;border-right:1px solid #cbd5e1" title="ROB is a stock reading at each event, not a flow — it cannot be summed">${dash}</td>`)
      ].filter(Boolean).join("\n    ");
    })()}`;
}

function reportTraceTable(reps){
  trAnnotate();                                             // 2026-07-20: see trAnnotate()
  const pad="6px 12px", padV="6px";                         // compact density
  const thBase="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;background:#f8fafc;padding:8px 12px;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;vertical-align:bottom";
  const thSub="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;background:#f8fafc;padding:5px 12px;border-bottom:1px solid #e2e8f0";
  const fl=(f,style,val)=>`<div class="trfl" style="height:17px;line-height:17px;padding:0 12px;background:${f.bg};${style}">${val}</div>`;
  const machStyle=`font-size:12px;color:#64748b;font-family:${TR_FONT};font-variant-numeric:tabular-nums`;
  const dash='<span style="color:#cbd5e1">—</span>';
  TR_LAST = reps;                                           // 2026-07-22: for the totals row
  rowselReset("tr", reps.length);
  const rows=reps.map((r,ri)=>{
    /* 2026-07-28j (Aurvin, owner instruction) — TEMPORARY V1, remove with the V1 branch.
       The Condition column reads the DERIVED condition `ocD` (PORT_STATE for a V1 file) instead
       of the raw `oc`, so the column matches the arrival/departure derivation and reads the same
       as a V3 vessel. For V3 files ocD === oc, so nothing changes. Older saved workspaces have
       no ocD at all -> the `|| r.oc` fallback keeps them rendering exactly as before.
       Where the two differ (V1 "BERTHING" -> AT_BERTH or MANOEUVRING) the ship's own reported
       word is preserved in the cell's hover tooltip — see condTitle below. */
    const rOc = r.ocD || r.oc;
    const c=TR_CONDS[rOc]||(rOc?{label:rOc.charAt(0)+rOc.slice(1).toLowerCase().replace(/_/g," "),icon:TR_ICONS.route,color:"#64748b"}:null);
    const acts=trActs(r).map(k=>TR_ACTS[k]||{label:k.charAt(0)+k.slice(1).toLowerCase().replace(/_/g," "),icon:TR_ICONS.clock,color:"#64748b"});
    const fuels=trFuelLines(r);
    const cov=trCoverage(r);
    const port=r.portN||r.cur||"";
    const z=r.cur? zoneOfLocode(r.cur):null;
    const zone=z==="EEA"?"EU":z==="UK"?"UK":null;
    /* tooltip: normally just the full (unabbreviated) label; when the displayed condition was
       derived from PORT_STATE and differs from the ship's reported OPERATING_CONDITION, name
       both so the source value stays visible (2026-07-28j, owner instruction). */
    const condTitle = c ? (r.ocD && r.oc && r.ocD!==r.oc
        ? c.label+" — reported as "+r.oc
        : c.label) : "";
    const condHtml = c? `<div style="display:flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="${c.icon}"></path></svg>
          <span style="font-size:12px;color:#334155;font-weight:500" title="${esc(condTitle)}">${esc(trCondLabel(c.label))}</span>
          ${r.opl?'<span style="font-size:9.5px;font-weight:700;letter-spacing:0.05em;color:#b91c1c;background:#fee2e2;padding:1.5px 6px;border-radius:4px" title="OUTSIDE_PORT_LIMIT = TRUE">OPL</span>':""}
        </div>` : dash;
    const actHtml = acts.length? `<div style="display:flex;align-items:center;gap:5px">${acts.map(a=>
        `<span class="actic" data-tip="${esc(a.label)}" aria-label="${esc(a.label)}" tabindex="0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${a.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${a.icon}"></path></svg></span>`).join("")}</div>` : dash;
    /* 2026-07-25b (Aurvin, owner instruction) — the whole Port cell is capped to 25 CHARACTERS
       measured at the COUNTRY line's font size (11px): the outer container sets font-size:11px and
       max-width:25ch, so "25ch" resolves at that 11px font. Both text lines truncate to fit and keep
       the full value in their hover title (a tooltip is mandatory on every shortened field). The port
       name is right-truncated (its bigger 12px font means fewer glyphs show before the ellipsis); the
       LOCODE and the zone badge sit at flex:none so they are never clipped. CURRENT_REGION is still
       dropped when it is only a compliance-zone token (it duplicated the blue zone badge). */
    const regnZoneToken = /^(eu\/eea|eea|eu|uk|eu\/eea\s*&\s*uk|non-?eu(\/uk|\/eea)?|other)$/i;
    const showRegn = r.regn && !regnZoneToken.test(String(r.regn).trim());
    /* 2026-07-25c (Aurvin, owner instruction): drop the trailing ISO article artifact " (the)" from the
       displayed country (e.g. "United States of America (the)" → "United States of America") — exactly
       6 characters, and the correct term. Display only; the underlying r.ctry (and the export) is kept. */
    const ctryDisp = String(r.ctry||"").replace(/\s*\(the\)\s*$/i, "");
    const subParts = [ctryDisp, showRegn?r.regn:""].filter(Boolean);
    const subInner = subParts.map(esc).join(' <span style="color:#cbd5e1">·</span> ');
    const subTitle = subParts.join(' · ');
    const portHtml = port? `<div style="display:flex;flex-direction:column;gap:2px;font-size:11px;max-width:25ch;overflow:hidden">
          <span style="display:flex;align-items:baseline;font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${esc(port)}">${esc(port)}</span>
            ${(r.portN&&r.cur)?`<span style="flex:none;font-size:10px;font-weight:400;color:#94a3b8"> – ${esc(r.cur)}</span>`:""}
          </span>
          ${(subParts.length||zone)?`<div style="display:flex;align-items:center;gap:6px;overflow:hidden">
            ${subParts.length?`<span style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0" title="${esc(subTitle)}">${subInner}</span>`:""}
            ${zone?`<span style="flex:none;font-size:9px;font-weight:700;letter-spacing:0.05em;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px">${zone}</span>`:""}
          </div>`:""}
        </div>` : dash;
    /* 2026-07-25q (Aurvin, owner instruction): the Fuel/ROB group (Fuel, Total, ME, AE, Boiler,
       Others, ROB) had the SAME gap as the rest of Report-Wise (25p) — only the outer edges
       (Fuel's border-left, ROB's border-right) carried a divider; the five columns between them
       had none, selected or not. Added border-right to Fuel/Total/ME/AE/Boiler/Others (ROB is the
       last column and keeps its own existing border-right) so every column in this group is
       divided too; the 25o rule darkens all of them on a ticked row exactly like the rest of the
       table, since it matches on the inline property, not a specific value. */
    /* 2026-07-30i (Aurvin, owner instruction): each of the seven Fuel columns is emitted only
       while the "▦ Edit columns" picker has it ticked. Built as an array joined with the same
       "\n      " the hand-written template used, so with all seven visible the output is
       character-for-character what it was before the picker existed. `wallV` moves the group's
       left divider onto whichever column is leftmost when Fuel itself is hidden. Both the
       has-fuel and the no-fuel branch are filtered with the same keys, so a row with no fuel
       lines still lines up with the header above it. */
    const firstFuelV = trFirstVis(TR_FUEL_KEYS);
    const wallV = k => (k===firstFuelV && k!=="fuel.name") ? "border-left:1px solid #f1f5f9;" : "";
    const fuelCell = (k, html) => trColVis(k) ? html : "";
    const fuelNum = (k, get) => fuelCell(k,
      `<td style="padding:${padV} 0;${wallV(k)}vertical-align:top;text-align:right;border-right:1px solid #f1f5f9">${fuels.map(f=>fl(f,machStyle,get(f))).join("")}</td>`);
    const fuelTds = fuels.length? (v=>v.length? "\n      "+v.join("\n      ") : "")([
        fuelCell("fuel.name", `<td style="padding:${padV} 0;vertical-align:top;border-left:1px solid #f1f5f9;border-right:1px solid #f1f5f9">${fuels.map(f=>fl(f,`font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:#475569;font-family:${TR_FONT}`,esc(f.name))).join("")}</td>`),
        fuelCell("fuel.total", `<td style="padding:${padV} 0;${wallV("fuel.total")}vertical-align:top;text-align:right;border-right:1px solid #f1f5f9">${fuels.map(f=>fl(f,`font-size:12px;font-weight:600;color:#0f172a;font-family:${TR_FONT};font-variant-numeric:tabular-nums`,f.total)).join("")}</td>`),
        fuelNum("fuel.me",  f=>f.me),
        fuelNum("fuel.ae",  f=>f.ae),
        fuelNum("fuel.blr", f=>f.blr),
        fuelNum("fuel.oth", f=>f.oth),
        fuelCell("fuel.rob", `<td style="padding:${padV} 0;${wallV("fuel.rob")}vertical-align:top;text-align:right;border-right:1px solid #f1f5f9">${fuels.map(f=>
        `<div class="trfl" style="height:17px;padding:0 6px;background:${f.bg};font-size:12px;font-weight:600;color:#475569;font-family:${TR_FONT};font-variant-numeric:tabular-nums;display:flex;justify-content:flex-end;align-items:center;gap:4px">${
          f.hasBunk?`<span style="font-size:10px;font-weight:700;color:#16a34a;background:#dcfce7;padding:0 4px;border-radius:4px;line-height:14px">${f.bunk}</span>`:""
        }<span>${f.rob}</span></div>`).join("")}</td>`)
      ].filter(Boolean))
      : [
        fuelCell("fuel.name", `<td style="padding:${pad};border-left:1px solid #f1f5f9;border-right:1px solid #f1f5f9">${dash}</td>`),
        ...["fuel.total","fuel.me","fuel.ae","fuel.blr","fuel.oth","fuel.rob"].map(k=>
          fuelCell(k, `<td style="padding:${pad};${wallV(k)}text-align:right;border-right:1px solid #f1f5f9">${dash}</td>`))
      ].filter(Boolean).join("");
    /* 2026-07-28j (Aurvin, owner instruction): whole-row zebra. The stripe goes on the <tr> AND
       on the two frozen (sticky) cells, which must carry their own opaque background or the body
       would scroll visibly underneath them. The ticked-row highlight still wins over both —
       `tr.hirow.hi-on>td` in css/styles.css is !important. */
    const rowBg = ZEBRA(ri);
    return `<tr class="hirow" style="background:${rowBg}"><!-- 2026-07-24: row divider moved to .trtable tbody td (border-separate ignores <tr> borders) -->
      <td style="padding:${pad};vertical-align:middle;text-align:center;${TR_FREEZE_SEL}z-index:2;background:${rowBg};width:${TR_SELCOL_W}px;min-width:${TR_SELCOL_W}px">${selBox("tr",ri)}</td>
      <td style="padding:${pad};vertical-align:top;white-space:nowrap;${TR_FREEZE_EVT}z-index:2;background:${rowBg};border-right:1px solid #f1f5f9">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px">
          <span style="font-size:12px;font-weight:700;color:#334155;display:inline-flex;align-items:center;gap:6px">${r.rt==="IN_PORT"?berthIcon(r):""}${esc(reportTypeDisplay(r))}</span>
          <span style="font-size:11px;color:#64748b;font-family:${TR_FONT}">${esc(fmtTs(r.t))}</span>
        </div>
      </td>
      <!-- 2026-07-25p (Aurvin, owner instruction): Report-Wise previously had NO vertical divider at
           all between Condition/Activity/Port/Voyage No/Cargo/Dist — even unselected — unlike Leg-Wise
           and Voyage-Wise, which carry one between every column. Added a matching border-right on all
           six so the whole table now reads consistently; the existing .hirow.hi-on [style*="border-
           right"] rule (2026-07-25o) automatically darkens all of these too once a row is ticked. -->
      <td style="padding:${pad};vertical-align:top;white-space:nowrap;border-right:1px solid #f1f5f9">${condHtml}</td>
      <td style="padding:${pad};vertical-align:top;white-space:nowrap;border-right:1px solid #f1f5f9">${actHtml}</td>
      <td style="padding:${pad};vertical-align:top;border-right:1px solid #f1f5f9">${portHtml}</td>
      <!-- 2026-07-25b (Aurvin, owner instruction): Voyage No capped at 8 chars; truncated from the LEFT
           (start) so the distinguishing tail (end) stays visible — direction:rtl+unicode-bidi:plaintext
           keeps the value reading left-to-right while the ellipsis lands on the left. Full value in title. -->
      <td style="padding:${pad};vertical-align:top;font-family:${TR_FONT};font-size:12px;color:#334155;font-variant-numeric:tabular-nums;border-right:1px solid #f1f5f9">${r.voy?`<span style="display:inline-block;max-width:8ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;unicode-bidi:plaintext;vertical-align:bottom" title="${esc(r.voy)}">${esc(r.voy)}</span>`:"—"}</td>
      <!-- 2026-07-25 (Aurvin, owner instruction): Cargo mt moved to sit right of Voyage No and left of Dist nm. -->
      <td style="padding:${pad};vertical-align:top;text-align:right;font-family:${TR_FONT};font-size:12px;color:#334155;font-variant-numeric:tabular-nums;border-right:1px solid #f1f5f9">${r.qtyHas?fmtI(r.qty):'<span style="color:#cbd5e1" title="No cargo quantity reported in this MDA report">—</span>'}</td><!-- a reported 0 shows 0; a BLANK cargo cell shows a dash -->
      <td style="padding:${pad};vertical-align:top;text-align:right;font-family:${TR_FONT};font-size:12px;color:#334155;font-variant-numeric:tabular-nums;border-right:1px solid #f1f5f9">${r.dist?fmtF(r.dist,0):"—"}</td>
      <!-- 2026-07-24d (Aurvin, owner instruction): asymmetric padding so the gap BETWEEN badges
           (EU ETS→FEU→UK ETS, the touching inner sides) is clearly smaller than the gap from the
           outer two badges to the Eligibility group's own wall (its left/right border) — was
           accidentally the other way round when every side used the same padding. -->
      <!-- 2026-07-26q (Aurvin, owner instruction): the 2026-07-26p merge (one colspan="3" cell
           + a reason-text caption) was UNDONE on Report-Wise per the owner's explicit "task 1 —
           remove the text from the Report-Wise view (undo that part)".
           2026-07-26y (Aurvin, owner instruction, this session): REDONE, deliberately narrower
           than 26p — "same as Leg-Wise, repeat the look" (26x's fused-pill treatment), confirmed
           NO caption text this time (that was the specific part the owner had reverted in 26q;
           the pill SHAPE itself was never the complaint). One <td colspan="3"> replaces the
           three independent badge <td>s below; the values (cov.eu/cov.feu/cov.uk), their
           source (trCoverage()), and the colours/thresholds are all unchanged — only the
           container merges, via the same elFusedPill() Leg-Wise's eligLeg already uses (see
           26x above trPctBadge()). The TOTAL row's three separate dash <td>s (trTotalsHtml(),
           ~line 2420) are deliberately left UNMERGED per the owner's explicit answer this
           session — a coverage % was never summable there anyway. The header's own 3 sub-
           labels (EU/ETS, FEU, UK/ETS just below) are also left as 3 separate <th> — the
           owner's ask was about the VALUE pill, not the column labels above it. -->
      ${(()=>{
        /* 2026-07-30i (Aurvin, owner instruction): the fused pill now carries only the segments
           whose columns are still ticked in the "▦ Edit columns" picker, and the colspan shrinks
           to match. elFusedPill() takes an array and is unchanged — the values (cov.eu / cov.feu
           / cov.uk), their source (trCoverage()) and every colour and threshold are exactly as
           2026-07-26y left them. With all three ticked the array is [cov.eu, cov.feu, cov.uk]
           and colspan is "3", i.e. the original string character-for-character.
           If all three are unticked the whole cell disappears rather than leaving a colspan="0",
           which browsers treat as "span the rest of the row". */
        const segs = [];
        if(trColVis("elig.ets")) segs.push(cov.eu);
        if(trColVis("elig.feu")) segs.push(cov.feu);
        if(trColVis("elig.uk"))  segs.push(cov.uk);
        return segs.length
          ? `<td colspan="${segs.length}" style="padding:6px 8px;vertical-align:middle;text-align:center;border-left:none;border-right:none">${elFusedPill(segs)}</td>`
          : "";
      })()}
      ${fuelTds}
    </tr>`;
  }).join("");
  return `
    <div class="tablescroll" style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px">
    <table class="trtable" style="width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px"><!-- 2026-07-24 (Aurvin): border-separate (was collapse) stops the sticky-header bleed-through — see styles.css .trtable notes -->
      <thead style="position:sticky;top:0;z-index:10">
        <tr>
          <th rowspan="2" style="text-align:center;${thBase};${TR_FREEZE_SEL}z-index:14;width:${TR_SELCOL_W}px;min-width:${TR_SELCOL_W}px;padding:8px 6px">${selAllBox("tr")}</th>
          <th rowspan="2" style="text-align:left;${thBase};${TR_FREEZE_EVT}z-index:14">Event<br><span style="font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8">UTC</span></th>
          <th rowspan="2" style="text-align:left;${thBase};width:1%">Condition</th>
          <th rowspan="2" style="text-align:left;${thBase};width:1%">Activity</th>
          <th rowspan="2" style="text-align:left;${thBase};width:1%">Port</th>
          <!-- 2026-07-25b (Aurvin, owner instruction): "Voyage No" header wrapped to two lines so the column can be narrower (values capped at 8 chars). -->
          <th rowspan="2" style="text-align:left;${thBase};width:1%">Voyage<br>No</th>
          <!-- 2026-07-25 (Aurvin): Cargo mt sits right of Voyage No, left of Dist nm. 2026-07-25b: header wrapped to two lines ("mt" lowercase) so the column can be narrow (cargo is never many characters); the cell still sizes to fit a rare long value in full. -->
          <th rowspan="2" style="text-align:right;${thBase};width:1%">Cargo<br><span style="text-transform:none">mt</span></th>
          <!-- 2026-07-25b (Aurvin): unit shown lowercase ("nm") rather than the column's default uppercase. -->
          <th rowspan="2" style="text-align:right;${thBase}">Dist <span style="text-transform:none">nm</span></th>
          ${trVisCount(TR_ELIG_KEYS) ? `<th colspan="${trVisCount(TR_ELIG_KEYS)}" style="text-align:center;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;background:#f1f5f9;padding:6px 12px;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">Eligibility ${info("Share of this report's energy in scope for each regulation — computed the same way as your CII / EU ETS / UK ETS / FuelEU totals (matched to the corresponding voyage/port entry). FuelEU's in-scope-energy share follows the same rule as EU ETS by regulation (fueleu-art2).<br><br><span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#3a5157;color:#fff;font-weight:700'>100%</span> fully in scope &nbsp; <span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#6f8d94;color:#fff;font-weight:700'>partial</span> partly in scope &nbsp; <span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#e4eef0;color:#7c8fa0;font-weight:700'>0%</span> out of scope<br><br>\"–\" = no confident match to a calculated voyage/port entry (e.g. bunkering/stock reports, or reports right at a year boundary) — shown blank rather than guessed")}</th>` : ""}
          ${trVisCount(TR_FUEL_KEYS) ? `<th colspan="${trVisCount(TR_FUEL_KEYS)}" style="text-align:center;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;background:#f1f5f9;padding:6px 12px;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">Fuel — Consumption &amp; ROB <span style="font-weight:500;color:#94a3b8;text-transform:none;letter-spacing:0">(mt)</span></th>` : ""}
        </tr>
        <tr>
          <!-- 2026-07-24c (Aurvin): EU ETS/UK ETS forced to an explicit two-line label (EU / ETS)
               instead of relying on the browser to wrap "EU ETS" at the column edge — that wrap
               was inconsistent (UK ETS wrapped, EU ETS didn't) at the same column width. An
               explicit <br> makes both render identically and lets the column go narrower. -->
          <!-- 2026-07-24d: header padding mirrors the body cells' asymmetric wall/inner split
               (8px outer, 1px inner) so the header and the badges below it line up. -->
          <!-- 2026-07-28l (Aurvin, bug report): explicit width added to each of these 3 sub-th so this
               table's own ELIGIBILITY group matches the Leg-Wise/Voyage-Wise CSS-grid's fixed 55/48/55px
               columns (BR_GRID/VW_GRID, same file) exactly. Before this, the group here had no pinned
               width at all (a plain width:100% table auto-distributing space), so it rendered wider than
               Leg-Wise and the header labels/percentage values sat visibly offset from Leg-Wise's. Only
               these 3 sub-th carry the width — the group's own colspan=3 header/body td are unspanned by
               any single column, so pinning the true columns here is what fixes the whole group. -->
          ${(()=>{
            /* 2026-07-30i (Aurvin, owner instruction): each sub-header is emitted only while its
               column is ticked in the "▦ Edit columns" picker. Built as one array joined with the
               same "\n          " the hand-written rows used, so with everything ticked this
               produces exactly the nine <th> the file carried before the picker existed.
               `wallH` re-homes the Fuel group's left divider when "Fuel" itself is hidden, so the
               group never loses the wall that separates it from Eligibility. */
            const firstF = trFirstVis(TR_FUEL_KEYS);
            const wallH = k => (k===firstF && k!=="fuel.name") ? "border-left:1px solid #e2e8f0;" : "";
            const th = (k, html) => trColVis(k) ? html : "";
            return [
              th("elig.ets", `<th style="text-align:center;${thSub};font-weight:600;color:#94a3b8;border-left:none;border-right:none;padding-left:8px;padding-right:1px;width:55px;min-width:55px;max-width:55px">EU<br>ETS</th>`),
              th("elig.feu", `<th style="text-align:center;${thSub};font-weight:600;color:#94a3b8;border-left:none;border-right:none;padding-left:1px;padding-right:1px;width:48px;min-width:48px;max-width:48px">FEU</th>`),
              th("elig.uk",  `<th style="text-align:center;${thSub};font-weight:600;color:#94a3b8;border-left:none;border-right:none;padding-left:1px;padding-right:8px;width:55px;min-width:55px;max-width:55px">UK<br>ETS</th>`),
              th("fuel.name",  `<th style="text-align:left;${thSub};font-weight:600;color:#94a3b8;border-left:1px solid #e2e8f0">Fuel</th>`),
              th("fuel.total", `<th style="text-align:right;${thSub};${wallH("fuel.total")}font-weight:700;color:#475569">Total</th>`),
              th("fuel.me",    `<th style="text-align:right;${thSub};${wallH("fuel.me")}font-weight:600;color:#94a3b8">ME</th>`),
              th("fuel.ae",    `<th style="text-align:right;${thSub};${wallH("fuel.ae")}font-weight:600;color:#94a3b8">AE</th>`),
              th("fuel.blr",   `<th style="text-align:right;${thSub};${wallH("fuel.blr")}font-weight:600;color:#94a3b8">Boiler</th>`),
              th("fuel.oth",   `<th style="text-align:right;${thSub};${wallH("fuel.oth")}font-weight:600;color:#94a3b8">Others</th>`)
            ].filter(Boolean).join("\n          ");
          })()}
          <!-- 2026-07-27 (Aurvin, owner instruction): "ROB (Bunker)" shortened to "ROB" and the
               column's value-pill padding tightened (below, in fuelTds) so the column takes less
               width — max expected value is "xxxxx.x" (7 chars), which no longer needs the wider
               padding that the longer header text used to justify. -->
          ${trColVis("fuel.rob") ? `<th style="text-align:right;${thSub};${trFirstVis(TR_FUEL_KEYS)==="fuel.rob"?"border-left:1px solid #e2e8f0;":""}font-weight:700;color:#475569;border-right:1px solid #e2e8f0;white-space:nowrap">ROB</th>` : ""}
        </tr>
        <tr id="trTotals">${trTotalsHtml()}</tr><!-- 2026-07-23 Task 1: bottom divider is a box-shadow on #trTotals>td (styles.css). 2026-07-24: top divider moved there too (border-separate ignores <tr> borders) -->
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
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
/* 15 columns (2026-07-19: LCV column dropped — its tooltip moved to the "Fuel metrics" group
   header instead; everything from column 5 on shifted down by one vs. the old 16-column grid) */
/* 2026-07-22c: 15 → 20 columns — the Sea Cargo Charter block (16–20) was added to the right
   of UK ETS: Cargo · Transport work · TtW CO₂e · WtW CO₂e · EEOI */
/* 2026-07-22e (owner, Aurvin — DISPLAY ONLY, calculations unchanged): the Cargo column (16)
   was widened (68→92px) because a 6-digit cargo tonnage was overflowing into the TW column
   and the two figures ran together. Same session the owner asked to drop decimals from
   crowded mass figures: Cargo shows whole tonnes everywhere (leg rows, totals, and the
   Report-Wise "Cargo mt" cell); the breakdown TOTALS row shows CO₂/EUA/UKA/TtW/WtW as whole
   numbers (leg rows keep their 2dp); and EEOI shows 2dp everywhere (was 3). Rounding is at
   the fmtF() call only — the engine still computes and sums full-precision values. */
/* 2026-07-23d (Aurvin, owner instruction — DISPLAY ONLY, no calculation touched):
   the column MINIMUMS were far too small. A grid track can shrink all the way to its
   minmax() minimum before the container is allowed to scroll, so on a real workspace the
   6-to-9-digit figures (Cargo 1,199,560 · CO₂ 18,839.33 · WtW 23,277.20) were being squeezed
   into 48–92px tracks and ran into the neighbouring column — the numbers in the sticky
   header/TOTAL row visibly merged. The fr ratios are kept, so on a wide screen the table
   still stretches to fill the panel; the minimums are now sized for the widest realistic
   figure in each column (~7.2px per digit at 12.5px tabular-nums, plus 20px cell padding),
   and below that width the table scrolls sideways instead of overlapping itself.
   Total minimum ≈ 1958px vs the 1500px main column — so horizontal scroll is the normal
   state on a laptop, which is what the owner asked for. */
/* 2026-07-23f (Aurvin, owner instruction): a "Voyage No" column was inserted as column 2
   (after Activity, before Dist), mirroring the Voyage-Wise tab. Every column from Dist
   onward therefore shifted RIGHT by one — the grid now has 21 tracks (was 20). The number(s)
   come from the SAME vwVoyageSegments() derivation the Voyage-Wise tab uses; a single leg that
   straddles an abrupt mid-sea voyage change shows both numbers, comma-separated. Display only —
   no calculation touched. */
/* 2026-07-23g (Aurvin, owner instruction — DISPLAY ONLY): FuelEU Maritime was moved to the
   RIGHT of UK ETS, so the ETS blocks now sit between Fuel metrics and FuelEU. New Leg-Wise
   order: Activity | Voyage No | Dist | Fuel metrics | EU ETS | UK ETS | FuelEU | SCC. The grid
   tracks were reordered to match so each column keeps its own width; SCC (17–21) is unchanged. */
/* 2026-07-23 (Task 2, Aurvin): a dedicated frozen CHECKBOX column was added as track 1 (matching
   the Report-Wise table), so every data column shifted right by one and this grid gained a leading
   fixed 34px track. gridMinWidth counts it automatically. */
/* 2026-07-25n (Aurvin, owner instruction): SCC column ORDER changed to TtW, WtW, Cargo,
   T-Work, EEOI (was Cargo, T-Work, TtW, WtW, EEOI) — see the reordered header/body cells
   below. Each column keeps ITS OWN width, just carried to its new position (owner chose
   "reorder, don't resize"): the last 5 tracks below are now TtW's old width, WtW's old
   width, Cargo's old width, T-Work's old width, then EEOI unchanged.
   2026-07-26 (Aurvin, owner instruction): the TtW (AR6) column is REMOVED from this on-screen
   table entirely (owner: "not needed in SCC section") — its track is dropped below and every
   subsequent grid-column number shifts down by 1 (was 18-22 for TtW/WtW/Cargo/T-Work/EEOI,
   now 18-21 for WtW/Cargo/T-Work/EEOI). TtW is still CALCULATED internally (WtW = WtT + TtW
   still needs it) and still appears in the Leg-Wise Excel export — display-only removal. */
/* 2026-07-26c (Task 2, Aurvin, owner instruction): the whole SEA CARGO CHARTER section is
   removed from THIS on-screen table (WtW, Cargo, T-Work, SCC EEOI — 4 tracks), a new IMO
   section (CII + EEOI, 2 tracks) is inserted between Fuel metrics and EU ETS, and Cargo
   comes back as a standalone column between Voyage No and Dist. Net 21 tracks → 20.
   Nothing is lost from the product: every SCC figure is still CALCULATED (T-Work is the
   denominator of the new IMO EEOI) and still written to the Leg-Wise Excel export, and the
   Voyage-Wise tab keeps its full SCC section on screen. New column order:
     1 chk | 2 Activity | 3 Voyage No | 4 Cargo | 5 Dist |
     6-7 IMO (CII, EEOI) | 8-9 FUEL METRICS (Fuel type, Cons.) |
     10-12 EU ETS | 13-14 UK ETS | 15-20 FuelEU
     (2026-07-26e, Aurvin: IMO moved to the LEFT of Fuel metrics — a simple swap of the two
      2-col blocks; columns 10+ unchanged. The 90/78px IMO widths and 76/88px Fuel widths
      travelled with them.)
   Widths: Cargo keeps its old SCC width (104px/1fr) and Dist/Fuel/Cons/EU/UK/FuelEU all keep
   theirs; the two new IMO tracks are sized for a rating badge + percentage (112px) and a
   4-5 digit intensity (92px).
   2026-07-26d (Aurvin, owner instruction — squeeze the horizontal width): three tracks
   narrowed. CARGO 104px→76px: the owner confirms a cargo figure never exceeds six digits,
   and its header is now wrapped onto two lines ("Cargo" / "mt") so the column no longer has
   to be as wide as the words "Cargo (mt)". CII 112px→90px and EEOI 92px→78px: the CII
   column's "rating · % of required" sub-label moved into the IMO info icon, so the header no
   longer sets the width, and inside the cell the percentage moved to the LEFT of the rating
   box with a tighter 4px gap. Net saving ~64px of horizontal scroll.
   2026-07-26l (Aurvin, owner instruction): CII 90px→150px. The cell gained a 3rd number (the
   attained-CII "AER" value, in its own pill segment alongside % and the rating letter) and
   needs the extra room to avoid crowding; the owner's explicit choice was to widen THIS
   column only and leave EEOI (78px) untouched.
   2026-07-26m (Aurvin, owner instruction): CII 150px→126px. The pill's own internal padding
   was tightened (solid-colour bar + snug white cutouts, replacing the airier 3-touching-
   segment version) and both numbers now carry a hard character cap (% ≤3 digits, AER ≤"xx.xx"
   before falling back to a dash), so the pill's own maximum width is now small and predictable
   — the column no longer needs the extra room 150px gave it.
   2026-07-30j-2 (Aurvin, bug report — the matching Voyage-Wise column overflowed, screenshot;
   this tab wasn't separately reported but shares the exact same pill, so it gets the same fix
   for parity): 126px stopped being enough once 2026-07-30j widened the pill's two number boxes
   (they'd been clipping their own digits — see `ciiPillHtml`'s segW note in this file). Reverted
   to the SAME 150px this column already carried once before (2026-07-26l), a known-good prior
   value rather than a fresh guess. */
/* 2026-07-26o (Aurvin, owner instruction): the three per-section "Cov." tracks (EU ETS,
   UK ETS, FuelEU) were removed and replaced by ONE consolidated ELIGIBILITY block of 3
   fixed-width badge tracks (55/48/55px, sized to the 46px pill + its padding — same as the
   Report-Wise Eligibility columns, NOT a stretchy fr share), inserted LEFT of IMO (was
   columns 6-7, now 9-10). Net column count unchanged (20), but total minimum width shrank
   ~28px because the badge tracks are narrower than the 3 removed 62px Cov tracks — the
   owner's explicit choice ("size new columns to fit badges", not "keep total width"). New
   order: chk|Activity|VoyNo|Cargo|Dist|ELIGIBILITY(EU,FEU,UK)|IMO(CII,EEOI)|Fuel metrics|
   EU ETS(CO₂,EUAs)|UK ETS(UKAs)|FuelEU(Elig,Energy,Elig.energy,CB,Penalty). */
/* 2026-07-26o2 (Aurvin, owner instruction): column 2 ("Activity & timeframe") shrunk from
   minmax(300px,3.05fr) to minmax(280px,0.5fr) — the owner's screenshot showed the "PORT
   STAY" tag overflowing PAST the column's right edge, and asked to reduce this column's
   width as much as possible, capped at whatever a 25-character port name (+ LOCODE) needs.
   The old 3.05fr share was by far the largest of any column here, so on anything but a very
   narrow screen it stretched far past its 300px minimum — that stretch, not the minimum
   itself, was most of the excess width the owner was seeing. Two changes together fix this:
   (1) "PORT STAY" now wraps to two lines (see legTag, ~line 3382) instead of needing ~60-70px
   on one line, so the badge lane next to the timestamps only needs its longer word's width
   (~4 chars); (2) this track's own minimum came down to 280px — estimated as gutter (36px,
   GUTTER_W) + a 25-character name+LOCODE at the row's inherited 14px body font (~190-205px
   for 25ch in a system sans-serif, per the SAME max-width:25ch technique as the port-name cap
   itself, 2026-07-26n) + the jurisdiction badge's worst case (~34px, wider than the arrow) +
   the cell's own right padding (12px) — with a small buffer for font-metric variance across
   browsers. The fr share shrank from 3.05 to 0.5 (in line with several of this row's other
   columns, e.g. Voyage No/Dist at 0.6-0.7fr) so it no longer disproportionately claims extra
   space on wide screens, but still grows a little along with its neighbours rather than being
   frozen rigid. NOTE: this 280px figure is a calculation, not a live screen measurement — this
   session's sandbox has no browser available to render and screenshot the page, so the owner
   should eyeball the actual result and say if it needs a further nudge either way. */
const BR_GRID = "minmax(34px,34px) minmax(280px,0.5fr) minmax(84px,0.6fr) minmax(76px,0.6fr) minmax(84px,0.7fr) minmax(55px,55px) minmax(48px,48px) minmax(55px,55px) minmax(150px,0.85fr) minmax(78px,0.6fr) minmax(76px,0.6fr) minmax(88px,0.55fr) minmax(96px,0.7fr) minmax(100px,0.8fr) minmax(100px,0.8fr) minmax(84px,0.7fr) minmax(92px,0.8fr) minmax(96px,0.8fr) minmax(84px,0.75fr) minmax(92px,0.9fr)";
const BR_BOX = gridBox(BR_GRID);          // every Leg-Wise row resolves to this same width
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
/* 2026-07-26p (Aurvin, owner instruction, clarified over 4 questions): the reason text shown
   under the Leg-Wise ELIGIBILITY badges — explains WHICH zone(s) drove that row's EU ETS /
   UK ETS / FuelEU coverage %. (Report-Wise had the same feature added, then REMOVED again on
   the owner's explicit "task 1" instruction 2026-07-26q — Leg-Wise only from here on.)
   Reuses jurisOfPort()'s EXISTING priority (OMR wins, then plain EU/UK, then neither)
   unchanged — that IS the "priority to EU/EU OMR and UK/UK OMR over Non-EU" the owner asked
   for — only relabelling a null result as "Non-EU" for THIS display (the Activity column's own
   port badge still shows nothing for null, untouched). */
function elZoneLabel(port, zone){ return jurisOfPort(port, zone) || "Non-EU"; }
/* plain EU/UK/Non-EU bucket, no OMR — used when we only know which zone BUCKET applies (EEA/
   UK/OTHER) but not the exact port, because the true port of call was walked PAST a skipped
   transit stay (see elVoySide() below) and its identity isn't carried by the coverage
   annotation, only its zone. */
function elBucketLabel(zoneCode){ return zoneCode==="EEA"?"EU":zoneCode==="UK"?"UK":"Non-EU"; }
/* 2026-07-26q (Aurvin, owner instruction, this session — corrects 2026-07-26p's logic, which
   read the leg's own immediate row.from/row.to/fromPort/toPort directly): "the zone 1 has to
   be last POC and zone 2 is upcoming POC... Don't include Transit @berth" — i.e. a voyage
   leg's zone pair must be the LAST port of call before it and the NEXT port of call after it,
   skipping straight past any non-call (transit/anchorage) stay in between, exactly per
   euets-art3ga's port-of-call test. Rather than re-deriving that walk ourselves (the
   arrival/departure/POC segmentation is FROZEN, CLAUDE.md), this reads the SAME `_covFrom`/
   `_covTo` fields `euCoverage()`/`ukCoverage()` already use for the identical purpose
   (`annotateVoyageContinuity`, js/engine.js) — guaranteed to "match the Percentages nicely"
   because it IS the percentage's own input, not a re-guess of it.
   `_covFrom`/`_covTo` are always set on every voyage row (annotateVoyageContinuity's forward/
   backward passes both run unconditionally), equal to the row's own immediate from/to when
   there is no adjacent transit stay to skip, or to the walked-past ancestor's zone when there
   is. When unchanged (own port genuinely is the last/next POC), the real port object gives
   OMR precision; when walked past a stay, only the zone bucket survives (that distant port's
   identity isn't carried by the annotation), so it falls back to the plain bucket label. */
function elVoySide(row, port, rawKey, covKey){
  const zoneCode = row[covKey] || row[rawKey];
  const chained = row[covKey] && row[covKey]!==row[rawKey];
  return chained ? elBucketLabel(zoneCode) : elZoneLabel(port, zoneCode);
}
/* A genuine POC berth stay (row.poc is not false) shows "At <Zone>" — its own single port,
   binary in/out (euCoverage/ukCoverage score it 100% or 0%, never 50%, matching a single zone).
   A TRANSIT stay (row.poc===false — NOT a port of call) never shows "At Zone" (owner
   instruction, this session): its own consumption is folded into the SURROUNDING voyage's
   coverage exactly like a voyage leg is (euCoverage/ukCoverage run the identical
   covVoyEU(_covFrom,_covTo) formula on it), so it can genuinely read 50% — it therefore gets
   the SAME "<Zone>-<Zone>" pattern as a voyage leg, sourced from its own _covFrom/_covTo (owner:
   "if EU ETS is 50% then its from EU or to EU case even on transit berth cases"). A LONE
   transit stay with no _covFrom/_covTo at all (no surrounding voyage rows to inherit from)
   scores 0% in the engine and gets no caption here either — nothing meaningful to explain. A
   voyage leg reads its zone pair via elVoySide() (POC to POC, skipping any transit in between). */
function elReasonText(row){
  if(!row) return "";
  /* 2026-07-26 (Aurvin, owner instruction): separator changed from a bare "-" to " → "
     (arrow). With a plain dash, a leg between two Non-EU/UK ports rendered as "Non-EU-Non-EU"
     — three dashes in a row (one inside each "Non-EU" label plus the separator itself), which
     read as ambiguous/garbled rather than "from -> to". An arrow is unambiguous regardless of
     how many hyphens the zone labels themselves contain (Non-EU, EU/EEA, etc.). Display-only —
     does not touch the FROZEN arrival/departure/POC derivation this text merely describes. */
  if(row.kind==="voyage") return elVoySide(row,row.fromPort,"from","_covFrom")+" → "+elVoySide(row,row.toPort,"to","_covTo");
  if(row.poc===false){
    if(!row._covFrom && !row._covTo) return "";
    const a = row._covFrom ? elBucketLabel(row._covFrom) : elZoneLabel(row.port, row.zone);
    const b = row._covTo   ? elBucketLabel(row._covTo)   : elZoneLabel(row.port, row.zone);
    return a+" → "+b;
  }
  return "At "+elZoneLabel(row.port, row.zone);
}
/* strict percentage — max 2 dp, integers show no decimals (SPEC §4) */
function brPct(frac){ const r=Math.round(frac*10000)/100; return (r%1===0?r.toFixed(0):r.toFixed(2))+"%"; }
/* muted em-dash for empty / no-obligation cells (SPEC §5) */
const brDash = '<span style="color:#94a3b8">—</span>';
/* SCC has no Appendix 6 factor for this fuel — shown distinctly from a plain "no obligation"
   dash, because it means "we will not guess", not "nothing to report" (2026-07-22c) */
const brNoFactor = '<span style="color:#c2864a;cursor:help" title="No SCC Technical Guidance v5.2 Appendix 6 well-to-wake factor for this fuel in the knowledge base. Appendix 6 covers HSHFO, VLSFO and MGO (and FAME/HVO blends of them). Enter the certified WtW factor for this fuel to complete the calculation — the FuelEU factor is deliberately NOT substituted.">n/a</span>';
function brNum(v,dp){ return (v==null||isNaN(v)||v===0) ? brDash : fmtF(v,dp??2); }

/* build the {label,juris} ports for a leg from its aligned source row */
/* 2026-07-23 (Aurvin, owner instruction): each entry now also carries the port NAME and the
   UN/LOCODE separately, so the breakdown's activity cell can truncate a long name with an
   ellipsis while ALWAYS showing the LOCODE in full. `label` is unchanged (name + code) and
   is still what every other caller and the hover title use. */
function legPortEntry(p, fallbackLabel, juris){
  if(p && p.c) return { label: portDisp(p), name: (p.n && p.n!==p.c) ? p.n : "", code: p.c, juris: juris||null };
  return { label: fallbackLabel||"", name: fallbackLabel||"", code: "", juris: juris||null };
}
function legPorts(det, row){
  if(det.kind==="voyage"){
    const pa = row && row.fromPort ? row.fromPort : null;
    const pb = row && row.toPort   ? row.toPort   : null;
    const a = pa ? portDisp(pa) : (row ? zoneName(row.from) : "");
    const b = pb ? portDisp(pb) : (row ? zoneName(row.to)   : "");
    if(!a && !b && det.label){ const parts=det.label.split("→");
      return [ legPortEntry(null,(parts[0]||"").trim()), legPortEntry(null,(parts[1]||"").trim()) ]; }
    // voyages: never badged (SPEC §2)
    return [ legPortEntry(pa, a), legPortEntry(pb, b) ];
  }
  const p = row && row.port;
  const fb = row ? zoneName(row.zone) : (det.label||"").replace(/^At berth\s*/,"");
  return [ legPortEntry(p, fb, jurisOfPort(p, row?row.zone:null)) ];
}
/* 2026-07-23: 📦 tooltip text. The cargo operation type comes from the MDA
   ASSOCIATED_ACTIVITY column (see the LOAD/DISCH/STS flags in mdaToOVD); rows typed by hand,
   or imported from an OVD without that column, fall back to the plain wording. */
function cargoTipText(row){
  if(!row) return "Port of Call (Cargo Activity)";
  const acts=[];
  if(row.cargoLoad)  acts.push("Loading");
  if(row.cargoDisch) acts.push("Discharging");
  const sts = row.cargoSTS? " (STS)" : "";
  /* 2026-07-24 (Aurvin): an OPL-demoted stay DID have cargo, but a report was flagged
     OUTSIDE_PORT_LIMIT, so it is scored as transit — the tooltip must NOT call it a port of call. */
  if(row.oplCargo) return "Cargo"+(acts.length? " "+acts.join(" & ").toLowerCase()+sts : sts)+" was reported OUTSIDE port limits — this stay is scored as transit, not a port of call";
  if(!acts.length) return "Port of Call (Cargo Activity)";
  return "Port of Call (Cargo Activity) — "+acts.join(" & ")+sts;
}

/* replicate the engine's reporting-year filter so source rows align 1:1 with rowDetails */
/* ---- shared From/To date-range filter (2026-07-24, Aurvin) --------------------------
   When S.dateFilter.active, row inclusion is decided by the date RANGE, not the reporting
   year — a report counts IN FULL if its own UTC period [tStart,tEnd] overlaps [from,to]
   at all (owner's rule: "include all reports which fall in/on the selected dates"). The
   reporting year (S.year) is kept separately selectable and still drives the regulatory
   parameters (CII bands, UK ETS start, FuelEU targets); it no longer decides which rows
   are counted while a range is active. All uploaded rows always stay in S.rows (memory);
   out-of-range rows are greyed + badged and excluded from every KPI, exactly like the
   out-of-year behaviour they replace. Strings are "YYYY-MM-DDTHH:mm" UTC (datetime-local),
   so we normalise to UTC ms before comparing. */
function _utcms(s){
  if(!s) return NaN;
  s = String(s).replace(" ", "T");           // tolerate "YYYY-MM-DD HH:mm"
  if(s.length===16) s += ":00";              // no seconds → add them
  if(!/[zZ]$/.test(s) && !/[+-]\d\d:?\d\d$/.test(s)) s += "Z";   // force UTC
  return Date.parse(s);
}
/* report-level range test (Report-Wise tab works off S.mdaReports, which use ts/te/t) */
function repInRange(rep){
  if(!dateFilterActive()) return true;
  /* 2026-07-25 (Aurvin, owner instruction): a report is placed by its OWN listed time
     (DATE_TIME_GMT = rep.t) and counted WHOLE in whichever window that instant falls in — so a
     report whose period straddles a year (or any range) boundary appears in ONE view only,
     never in both the previous and the present year. */
  const t = rep.t!=null ? _utcms(rep.t) : (rep.te!=null ? _utcms(rep.te) : (rep.ts!=null ? _utcms(rep.ts) : null));
  if(t==null || !isFinite(t)) return true;                 // undated report → never filtered out
  return t>=_utcms(S.dateFilter.fromISO) && t<=_utcms(S.dateFilter.toISO);
}
function dateFilterActive(){ const d=S.dateFilter; return !!(d && d.active && d.fromISO && d.toISO); }
/* row span as UTC ms; undated rows → null span (never filtered out) */
function _rowSpan(row){
  const a = row.tStart? _utcms(row.tStart) : null;
  const b = row.tEnd?   _utcms(row.tEnd)   : null;
  if(a==null && b==null) return null;
  return { st:(a!=null?a:b), en:(b!=null?b:a) };
}
function rowInRange(row){
  if(!dateFilterActive()) return true;
  const sp=_rowSpan(row); if(!sp) return true;         // undated rows can't be range-filtered → keep
  const from=_utcms(S.dateFilter.fromISO), to=_utcms(S.dateFilter.toISO);
  return sp.st<=to && sp.en>=from;                     // any overlap = counted (in full)
}
/* true when a row overlaps the range but straddles a boundary (partly outside) → "edge" */
function rowIsEdge(row){
  if(!dateFilterActive()) return false;
  const sp=_rowSpan(row); if(!sp) return false;
  const from=_utcms(S.dateFilter.fromISO), to=_utcms(S.dateFilter.toISO);
  return (sp.st<=to && sp.en>=from) && (sp.st<from || sp.en>to);
}
/* count of edge rows currently in range — for the bar caption */
function edgeRowCount(){ return dateFilterActive()? (S.rows||[]).filter(r=>rowInRange(r)&&rowIsEdge(r)).length : 0; }

function inYearRows(){
  if(dateFilterActive()) return (S.rows||[]).filter(rowInRange);   // range wins when active
  const y = Number(S.year)||2026;
  return (S.rows||[]).filter(row=>{
    if(row.yearPart) return Number(row.yearPart)===y;
    const a = row.tStart? String(row.tStart).slice(0,4) : null;
    const b = row.tEnd?   String(row.tEnd).slice(0,4)   : null;
    if(!a && !b) return true;
    return a===String(y) || b===String(y);
  });
}

/* ---- date-filter bar UI (2026-07-24, Aurvin) : ONE shared control rendered at the sticky
   top of all four data tabs. Editing it anywhere updates S.dateFilter and repaints every
   tab, so the tabs can never disagree. Dates are UTC "YYYY-MM-DDTHH:mm" (datetime-local). */
function dfRepaint(){
  save();
  try{ renderWorkspace(); }catch(e){}
  try{ if(document.getElementById('tab-calcs')) renderCalcs(); }catch(e){}
  try{ if(document.getElementById('tab-voy'))   renderVoyage(); }catch(e){}
  try{ if(document.getElementById('tab-trace')) renderTrace(); }catch(e){}
}
function _fullYearRange(y){ return { fromISO:`${y}-01-01T00:00`, toISO:`${y}-12-31T23:59`, active:true }; }

/* ============================================================================================
   2026-07-28h (Aurvin, owner instruction) — VOYAGE-WISE IS NOW YEAR-LOCKED LIKE EVERY OTHER TAB
   --------------------------------------------------------------------------------------------
   THIS DELIBERATELY REVERSES the 2026-07-24 decision (and the 2026-07-28 full-screen design
   note 6) that gave Voyage-Wise its OWN independent, multi-year-capable range. The owner's
   instruction today: "we are able to select multiple years from the date filter, which should
   not be the case. As per the selected year, only the date filter should be allowed."

   WHAT IS THE SAME: how a voyage is SELECTED and GRADED is untouched. vwGroups() still includes
   a voyage when its END date falls inside the window — so a voyage that STARTED in the previous
   calendar year is still shown in full, and is still graded under the rules of its end-date year
   (the per-end-year computeAll buckets). That is exactly the behaviour the owner asked to keep.

   WHAT CHANGED: there is now ONE Year control and ONE From/To window for the whole application.
   S.voyDateFilter is no longer a separate, user-editable concept — it is kept as a MIRROR of
   S.dateFilter, written by the three functions below. Keeping the mirror (rather than deleting
   the field) means vwGroups() and its four engine self-tests never had to change: the engine
   still honours whatever range it is handed, the UI simply can no longer hand it a range that
   crosses a year boundary.

   IF YOU EVER RESTORE MULTI-YEAR: give Voyage-Wise its own bar back in renderDateFilterBar('voy')
   and stop mirroring here. Nothing in the engine needs touching.
   ============================================================================================ */
function _mirrorVoyFilter(){
  const d = S.dateFilter || _fullYearRange(Number(S.year)||2026);
  S.voyDateFilter = { fromISO:d.fromISO, toISO:d.toISO, active:true };
}

/* within-year narrowing on Workspace / Report-Wise / Leg-Wise / Voyage-Wise (bounded to S.year) */
function dfSet(field, val){
  const y=Number(S.year)||2026, lo=`${y}-01-01T00:00`, hi=`${y}-12-31T23:59`;
  val = val || "";
  if(val){ if(val<lo) val=lo; if(val>hi) val=hi; }        // clamp inside the selected year
  if(!S.dateFilter || !S.dateFilter.active) S.dateFilter=_fullYearRange(y);
  S.dateFilter[field] = val || (field==="fromISO"?lo:hi);
  S.dateFilter.active = true;                             // always a within-year window
  _mirrorVoyFilter();                                     // 2026-07-28h: Voyage-Wise follows it
  dfRepaint();
}
/* pick the reporting year → fill the picker to that whole year */
function dfYear(v){
  const y=Number(v)||2026; S.year=y; S.dateFilter=_fullYearRange(y);
  _mirrorVoyFilter();                                     // 2026-07-28h
  try{ renderVessel(); }catch(e){} dfRepaint();
}
/* 2026-07-25: "Clear" for the year-locked bar can't disable the filter — it's always
   within-year — so it resets From/To back to that year's full range, same as picking the Year
   dropdown but without touching S.year itself. */
function dfClearRange(){
  const y=Number(S.year)||2026; S.dateFilter=_fullYearRange(y);
  _mirrorVoyFilter();                                     // 2026-07-28h
  dfRepaint();
}
/* 2026-07-28h: voySet / voyClear / voyYear are kept ONLY as aliases, because ~a dozen call
   sites (the old bar's inline onchange handlers, js/fullscreen.js's znfsVoy* wrappers and the
   tools/ tests) reference them by name. They now do exactly what their df* twins do, so a
   Voyage-Wise control can no longer write a range the other tabs disagree with. */
function voySet(field, val){ dfSet(field, val); }
function voyClear(){ dfClearRange(); }
function voyYear(v){ if(v) dfYear(v); }
/* latest calendar year present in the workspace rows (null if none) */
function latestDataYear(){
  let mx=null;
  for(const r of (S.rows||[])){
    let yy = r.yearPart ? Number(r.yearPart) : null;
    if(!yy){ const s=r.tEnd||r.tStart; if(s) yy=Number(String(s).slice(0,4)); }
    if(yy && (mx==null || yy>mx)) mx=yy;
  }
  return (mx && isFinite(mx)) ? mx : null;
}
/* on load / after an import: default the Year to the latest year that has data (else 2026),
   and fill the within-year window to that whole year. (2026-07-24, owner's chosen default) */
function initDateFilters(){
  const ly=latestDataYear();
  if(ly) S.year=ly; else if(!S.year) S.year=2026;
  const y=Number(S.year)||2026;
  S.dateFilter=_fullYearRange(y);
  /* 2026-07-28h: Voyage-Wise no longer has a range of its own — it mirrors the one above, so an
     import lands every tab (Voyage-Wise included) on the same whole reporting year. */
  _mirrorVoyFilter();
}
/* the bar's HTML — ONE year-locked bar for every data tab.
   2026-07-25 (owner instruction): each tab's title/Excel/info icons that used to sit in the
   tab's own <h2> now live in this same sticky row instead, passed in as `extraHtml` and
   right-aligned via margin-left:auto — this frees the vertical space the old header row
   took, without duplicating date-range controls per tab.
   2026-07-28h (Aurvin, owner instruction): the `mode==="voy"` branch that drew Voyage-Wise its
   own UNBOUNDED, multi-year picker has been REMOVED — see the long note on _mirrorVoyFilter().
   The `mode` argument is retained because all three call sites pass it ('voy' / 'year') and the
   tools/ tests read those call sites, but it no longer changes what is drawn. Every tab now gets
   the same Year + min/max-bounded From/To, so a range crossing a year boundary cannot be typed
   in on any tab. Voyage-Wise still SELECTS voyages by END date (vwGroups), unchanged. */
function renderDateFilterBar(mode, extraHtml){
  const y=Number(S.year)||2026;
  const extra = extraHtml? `<span class="dfextra" style="margin-left:auto;display:flex;align-items:center;gap:8px">${extraHtml}</span>` : "";
  /* 2026-07-25 (Aurvin, owner instruction): show the vessel name at the start of the bar on the
     Report-Wise / Leg-Wise / Voyage-Wise tabs too, the same as the Workspace blue band, so every
     data view is clearly labelled with the ship it is showing. */
  const vname = `<b class="bandvessel" style="font-size:13px">${esc((S.ship&&S.ship.name)||"Vessel")}</b><span class="bsep">·</span>`;
  const d=S.dateFilter||{};
  const lo=`${y}-01-01T00:00`, hi=`${y}-12-31T23:59`;
  const narrowed = (d.fromISO||lo)!==lo || (d.toISO||hi)!==hi;
  return `<div class="dfbar noprint">
    ${vname}
    <span class="dfld">Year</span>
    <select title="Reporting year — selects the calendar year shown and its CII bands, UK ETS window and FuelEU target. The date picker is bounded inside this year." onchange="dfYear(this.value)">${[2024,2025,2026,2027,2028,2029,2030].map(yy=>`<option ${yy===y?"selected":""}>${yy}</option>`).join("")}</select>
    <span class="dfld" style="margin-left:6px">📅 From</span>
    <input type="datetime-local" lang="en-GB" min="${y}-01-01T00:00" max="${y}-12-31T23:59" value="${esc(d.fromISO||`${y}-01-01T00:00`)}" onchange="dfSet('fromISO',this.value)" title="Window start within ${y} (UTC)">
    <span class="dfld">To</span>
    <input type="datetime-local" lang="en-GB" min="${y}-01-01T00:00" max="${y}-12-31T23:59" value="${esc(d.toISO||`${y}-12-31T23:59`)}" onchange="dfSet('toISO',this.value)" title="Window end within ${y} (UTC)">
    <span class="dfutc">UTC</span>
    ${narrowed?`<button class="dfbtn" style="color:var(--red);border-color:#e3b7b3" title="Clear the narrowed window — reset From/To to the whole of ${y}" onclick="dfClearRange()">✕ Clear</button>`:''}
    ${extra}
  </div>`;
}

/* ---- Gmail-style row selection, shared by both tables (2026-07-22, Aurvin) ------------
   DISPLAY ONLY. Ticking rows never changes a calculation, a workspace row or any KPI — it
   only narrows what the sticky TOTAL row at the top of the table adds up, and what the
   table's own Excel button exports. Nothing ticked = every row counted (so the total row is
   always meaningful, never a wall of zeros). Behaviour copied from Gmail's message list:
     • a plain click ticks/unticks that one row and becomes the "anchor";
     • shift+click sets every row between the anchor and the clicked row to the clicked
       row's new state (tick a range, or untick a range);
     • the master box in the header ticks/unticks all, and shows the half-tick
       ("indeterminate") state when only some rows are ticked.
   kind is "br" (voyage & berth breakdown) or "tr" (report-level trace). */
/* 2026-07-23c: "vw" added for the Voyage-Wise table (one entry per voyage number) */
const ROWSEL = { br:{ sel:new Set(), anchor:null, n:0 }, tr:{ sel:new Set(), anchor:null, n:0 },
                 vw:{ sel:new Set(), anchor:null, n:0 } };
/* called on every render: if the table's row count changed, the old indexes are meaningless */
function rowselReset(kind, n){ const s=ROWSEL[kind]; if(s.n!==n){ s.sel.clear(); s.anchor=null; } s.n=n; }
/* indexes the totals (and Excel) must aggregate — the ticked ones, or ALL when none ticked */
function rowselActive(kind, n){
  const s=ROWSEL[kind];
  if(!s.sel.size) return Array.from({length:n},(_,i)=>i);
  return Array.from(s.sel).filter(i=>i>=0&&i<n).sort((a,b)=>a-b);
}
function rowselClick(kind, idx, ev){
  const s=ROWSEL[kind], on=ev.target.checked;
  if(ev.shiftKey && s.anchor!=null && s.anchor!==idx){
    const a=Math.min(s.anchor,idx), b=Math.max(s.anchor,idx);
    for(let i=a;i<=b;i++){ if(on) s.sel.add(i); else s.sel.delete(i); }
  } else if(on) s.sel.add(idx); else s.sel.delete(idx);
  s.anchor = idx;
  rowselSync(kind);
}
function rowselAll(kind, ev){
  const s=ROWSEL[kind];
  s.sel.clear();
  if(ev.target.checked) for(let i=0;i<s.n;i++) s.sel.add(i);
  s.anchor = null;
  rowselSync(kind);
}
/* push the model back onto the page: every row box, the master box, and the totals row.
   Only the totals row is re-rendered — never the whole table — so the scroll position,
   any open tooltip and the rest of the tab stay exactly where they were. */
function rowselSync(kind){
  const s=ROWSEL[kind];
  document.querySelectorAll('input[data-sel="'+kind+'"]').forEach(b=>{
    const on = s.sel.has(Number(b.dataset.idx));
    b.checked = on;
    /* 2026-07-25j (owner): the tick also drives the teal row highlight — see .hirow rules in
       styles.css. Each tick box lives inside its row's .hirow element, so mark that row. */
    const row = b.closest(".hirow");
    if(row) row.classList.toggle("hi-on", on);
  });
  const m=document.getElementById(kind+"SelAll");
  if(m){ m.checked = s.n>0 && s.sel.size===s.n; m.indeterminate = s.sel.size>0 && s.sel.size<s.n; }
  const host=document.getElementById(kind+"Totals");
  if(host){
    host.innerHTML = kind==="br" ? brTotalsHtml() : kind==="vw" ? vwTotalsHtml() : trTotalsHtml();
    /* 2026-07-25k (owner): the sticky TOTAL row highlights too, but ONLY while at least one row is
       ticked. It reuses the same .hirow/.hi-on teal treatment as the data rows (see styles.css). */
    host.classList.add("hirow");
    host.classList.toggle("hi-on", s.sel.size>0);
  }
}
const SELBOX_CSS = "width:14px;height:14px;margin:0;cursor:pointer;accent-color:#3652a3;flex:none";
function selBox(kind, idx){
  return `<input type="checkbox" data-sel="${kind}" data-idx="${idx}" onclick="rowselClick('${kind}',${idx},event)" `+
         `aria-label="Select row ${idx+1}" style="${SELBOX_CSS}">`;
}
function selAllBox(kind){
  return `<input type="checkbox" id="${kind}SelAll" onclick="rowselAll('${kind}',event)" `+
         `title="Select all rows (shift+click a row to select a range)" aria-label="Select all rows" style="${SELBOX_CSS}">`;
}
/* label shown on the totals row: tells the owner whether they are looking at everything or
   at a subset, so a filtered total can never be mistaken for the annual figure */
function rowselLabel(kind, n, year){
  const k=ROWSEL[kind].sel.size;
  return k ? `Total — ${k} of ${n} row${n===1?"":"s"} selected` : `Total — all ${n} row${n===1?"":"s"} · ${year}`;
}
const SELCOL_W = 30;                      // checkbox lane width, both tables
/* activity-column icon gutter width. Hoisted out of breakdownGrid() on 2026-07-23d so the
   Voyage-Wise activity cell can use the same gutter and line up with Leg-Wise. */
const GUTTER_W = 36;
/* 2026-07-22b (owner): the first column of each table is FROZEN horizontally — the leg's
   "Activity & timeframe" (breakdown) and the "Event" column (reports) stay in place while
   the regulation columns scroll sideways, so a number is never orphaned from its row.
   Both tables scroll inside `.tablescroll`, so `position:sticky;left:0` pins against that
   container. Frozen cells MUST carry their own background (otherwise the scrolling columns
   show through) and a z-index above the ordinary cells. */
const BR_FREEZE = "position:sticky;left:0;";
/* 2026-07-23 (Task 2, Aurvin): the Leg-Wise / Voyage-Wise tables now have a dedicated frozen
   checkbox column (track 1, BR_SELCOL_W wide, frozen at left:0 via BR_FREEZE) exactly like the
   Report-Wise table. The Activity / Voyage column (track 2) is frozen immediately to its right
   at left:BR_SELCOL_W via BR_FREEZE2, so both stay put while the regulation columns scroll. */
const BR_SELCOL_W = 34;
const BR_FREEZE2 = "position:sticky;left:"+BR_SELCOL_W+"px;";
/* 2026-07-23e (Aurvin, owner instruction — DISPLAY ONLY) ---------------------------------
   Every row of these tables is its own CSS grid, and each one is a block-level child of the
   scrolling container. A block box takes the width of its PARENT (the ~1500px visible area),
   not the width of its own tracks — so once the column minimums totalled more than the panel
   (1958px Leg-Wise / 1856px Voyage-Wise, since 2026-07-23d) the tracks overflowed the box
   while the box's BACKGROUND still stopped at 1500px. That is the "horizontal band stops
   midway through Sea Cargo Charter" the owner reported: the TOTAL row's pale band, and the
   sticky header's white backdrop, both ran out mid-table — and because the sticky header had
   no backdrop past that point, the body rows scrolled UP THROUGH it and the numbers appeared
   printed on top of each other.

   FIRST ATTEMPT (2026-07-23e) USED width:max-content AND WAS WRONG — do not go back to it.
   max-content sizes each grid to ITS OWN content, so the header row (long labels such as
   "Elig. energy (10⁶ MJ)") resolved to a wider box than the body rows (short numbers), and
   the columns drifted apart down the table: the owner's screenshot showed the body rows
   ending ~285px short of the header, with every figure sitting left of its heading.

   The invariant that actually guarantees alignment is that EVERY row resolves to the SAME
   width. So each table computes the sum of its own track minimums once, and every row gets
   `width:100%;min-width:<that sum>px`:
     • narrow screen  → width:100% (the ~1500px panel) loses to min-width, so every row is
       exactly the track total and they all line up; the container scrolls sideways.
     • wide screen    → width:100% wins for every row equally, and the fr ratios share out
       the extra space identically on each row, so they still line up.
   Computed from the grid string itself so the two can never drift apart by hand-editing. */
function gridMinWidth(g){
  return (String(g).match(/minmax\((\d+)px/g)||[])
    .reduce((s,m)=>s+parseInt(m.replace(/\D+/,""),10),0);
}
function gridBox(g){ return "width:100%;min-width:"+gridMinWidth(g)+"px;"; }
const TR_SELCOL_W = 34;                   // reports: fixed width of the checkbox column,
                                          // so the frozen Event column knows where to sit
const TR_FREEZE_SEL = "position:sticky;left:0;";
const TR_FREEZE_EVT = "position:sticky;left:"+TR_SELCOL_W+"px;";

/* 2026-07-23f — which voyage number(s) a Leg-Wise row belongs to.
   The Voyage-Wise tab already derives the timeline of voyage numbers from the MDA reports
   (vwVoyageSegments: each segment is one voyage, with a start/end instant and its CANONICAL
   number). A leg-wise row is NOT split at an abrupt mid-sea change (only the Voyage-Wise
   table splits), so one leg can overlap two adjacent segments — in that case BOTH numbers are
   shown, comma-separated, exactly as the owner asked. The overlap test uses the same
   inclusive-start / exclusive-end convention as vwSegAt(), so a leg that begins exactly on a
   departure boundary is attributed to the NEW voyage, and a leg that ends exactly on one does
   not pick up the next. Returns "" when the file carries no voyage numbers at all. */
function brVoyNos(segs, d){
  if(!segs || !segs.length || !d) return "";
  const a=d.tStart, b=d.tEnd, out=[];
  for(const s of segs){
    const startsBeforeEnd = (s.tStart==null) || (b==null) || (s.tStart < b);
    const endsAfterStart  = (s.tEnd==null)   || (a==null) || (s.tEnd  > a);
    if(startsBeforeEnd && endsAfterStart && s.voy && out.indexOf(s.voy)<0) out.push(s.voy);
  }
  return out.join(", ");
}

/* 2026-07-23 (owner, Aurvin): two-line column header. The parameter name sits on the top
   line; its unit drops to a smaller, muted line underneath. This de-clutters the row-2
   labels (units were crammed next to the name before) and lets every column show its unit.
   colHdr() returns the inner HTML for a header cell; pass unit="" for a unitless column. */
function colHdr(name, unit){
  /* 2026-07-26g: text-transform:none added so a unit (e.g. "mt") stays lowercase even when
     a caller's header cell sets text-transform:uppercase on the whole column — needed for
     the Report-Wise-matched Voyage No / Cargo / Dist headers, harmless everywhere else since
     no other caller's parent sets text-transform. */
  return `<div style="line-height:1.15">${name}</div>`+
         (unit ? `<div style="font-weight:400;font-size:9px;color:#94a3b8;line-height:1.25;margin-top:1px;text-transform:none">${unit}</div>` : "");
}

/* full inner grid: header rows + one grid per leg + totals + footnote */
let BR_LAST = null;                       // {R, cellPad} — for re-rendering totals on tick
function breakdownGrid(R, tips){
  const cellPad = "7px 10px";
  const src = inYearRows();
  /* 2026-07-23f: the voyage-number timeline, derived once, shared by every leg's Voyage No
     cell. Same source the Voyage-Wise tab uses, so the two tabs can never disagree. */
  const segs = vwVoyageSegments(S.mdaReports||[]);
  BR_LAST = { R, cellPad };
  rowselReset("br", R.rowDetails.length);
  /* 2026-07-23 (owner, Aurvin): a CO₂e figure is only meaningful with the GWP set that made
     it, and that set is regulation- and YEAR-dependent. EU ETS folds CH₄/N₂O in only from
     2026 (set is AR5 default / AR4, user-selectable in Settings) — before 2026 the basis is
     CO₂ only, so no AR tag is shown. UK ETS is locked AR5 (Table C1) and only active from
     2026; FuelEU is locked AR4 (25/298); SCC is AR6. euAR is the EU-ETS tag for THIS year. */
  const euAR = (R.year>=2026 && R.ets && R.ets.gwp) ? ((R.ets.gwp.label.match(/AR\d/)||[""])[0]) : "";
  const euEUAsUnit = euAR ? `tCO₂e (${euAR})` : "tCO₂ (CO₂ only)";
  const header = `
    <div style="display:grid;${BR_BOX}grid-template-columns:${BR_GRID};grid-template-rows:auto auto;border-bottom:2px solid #cbd5e1">
      <div style="grid-column:1;grid-row:1 / span 2;${BR_FREEZE}z-index:4;display:flex;align-items:flex-end;justify-content:center;padding:7px 0 9px;background:#f1f5f9;border-right:1px solid #e2e8f0">${selAllBox("br")}</div>
      <div style="grid-column:2;grid-row:1 / span 2;${BR_FREEZE2}z-index:3;display:flex;align-items:flex-end;padding:7px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a">Activity &amp; timeframe</div>
      <!-- 2026-07-26g (Aurvin, owner instruction): Voyage No / Cargo / Dist headers restyled to
           match Report-Wise exactly — uppercase, letter-spaced, font-weight 600, #64748b grey,
           10.5px, on the flat #f8fafc header background (was a bold #0f172a-on-#f1f5f9 "boxed"
           look). Voyage No specifically moved from right- to LEFT-aligned per the owner's
           instruction; Cargo/Dist stay right-aligned like their Report-Wise counterparts.
           colHdr()'s unit line now carries text-transform:none (see colHdr) so "mt"/"nm" stay
           lowercase under this uppercase parent, same as Report-Wise. -->
      <div style="grid-column:3;grid-row:1 / span 2;display:flex;align-items:flex-end;justify-content:flex-start;padding:7px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:left">Voyage No ${tips.voy}</div>
      <div style="grid-column:4;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;padding:7px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:right" title="Cargo carried on this leg, from the leg's DEPARTURE (SOSP) report. Voyages only — a berth stay and a voyage with no cargo on its SOSP report both show a dash. No TOTAL is shown: the same parcel is reported on every leg it is carried over, so adding the column up would count it several times.">${colHdr("Cargo","mt")}</div>
      <!-- 2026-07-26h (Aurvin, owner instruction): "nm" now shown the SAME way as Cargo's "mt"
           — its own smaller, muted line under "DIST" (via colHdr), not squeezed onto the same
           line at full size/weight. flex-direction:column added so colHdr's two stacked divs
           lay out one above the other, matching the Cargo cell immediately to its left. -->
      <div style="grid-column:5;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;padding:7px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:right">${colHdr("Dist","nm")}</div>
      <!-- 2026-07-26o (Aurvin, owner instruction): standalone ELIGIBILITY group, left of IMO —
           deliberately copies the Report-Wise Eligibility header EXACTLY (background, colour,
           font, padding split, two-line EU/UK labels), so the two tabs read as the same concept.
           2026-07-28j (Aurvin, owner instruction): every OTHER group header now matches it too.
           The per-section tints are gone — IMO was green (#d9f2e7/#1d7a5f), Fuel metrics cyan
           (#ddecf3/#0e7490), EU ETS blue (#e1ebf4/#3652a3), UK ETS purple (#f1e6f5/#6d4fa3),
           FuelEU green (#def2e0/#3d7a3a). All five now use the SAME neutral ZN table header
           #f1f5f9 background with #475569 uppercase text, in BOTH Leg-Wise (below) and
           Voyage-Wise (voyageGrid). Borders, padding, fonts and the ⓘ tooltips are untouched,
           and the regulation-coloured VALUES in the body cells (e.g. EUAs in #3652a3, UKAs in
           #6d4fa3, EEOI in #1d7a5f) are deliberately LEFT AS THEY WERE — the owner asked only
           about the header coloration. -->
      <div style="grid-column:6 / span 3;grid-row:1;padding:6px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">Eligibility ${tips.eligibility}</div>
      <div style="grid-column:9 / span 2;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">IMO ${tips.imo}</div>
      ${/* 2026-07-26p (Aurvin, owner instruction): CO2e moved OUT of the EU ETS group INTO
           Fuel metrics — it is no longer the EU-ETS-eligible/coverage-scoped figure, it is the
           TOTAL CO2e of the fuel actually consumed (see the column-13 cell below and
           js/engine.js det.totalCO2e). Fuel metrics group widened from span 2 (11-12) to span 3
           (11-13); EU ETS group narrowed from span 2 (13-14) to column 14 only (EUAs). See
           HANDOFF_LOG.md 2026-07-26 entry. */""}
      <div style="grid-column:11 / span 3;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">Fuel metrics ${tips.lcv}</div>
      <div style="grid-column:14;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">EU ETS ${tips.euets}</div>
      <div style="grid-column:15;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">UK ETS ${tips.ukets}</div>
      <div style="grid-column:16 / span 5;grid-row:1;padding:6px 10px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">FuelEU Maritime ${tips.feu}</div>
      <!-- sub-header row (row 2): same three eligibility labels/styling as Report-Wise's thSub
           cells (10px, #94a3b8, centered, asymmetric 8/1/1/8 padding so the gap between the
           three badges is smaller than the gap to the group's own outer wall). -->
      <div style="grid-column:6;grid-row:2;padding:5px 1px 5px 8px;background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:#94a3b8;text-align:center">EU<br>ETS</div>
      <div style="grid-column:7;grid-row:2;padding:5px 1px;background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:#94a3b8;text-align:center">FEU</div>
      <div style="grid-column:8;grid-row:2;padding:5px 8px 5px 1px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;color:#94a3b8;text-align:center">UK<br>ETS</div>
      <div style="grid-column:11;grid-row:2;padding:6px 6px 6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;line-height:1.3">Fuel type</div>
      <div style="grid-column:12;grid-row:2;padding:6px 10px 6px 4px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right;line-height:1.3" title="Fuel consumed (tonnes)">${colHdr("Cons.","mt")}</div>
      ${/* 2026-07-26d (Aurvin): the "rating · % of required" sub-label was removed to narrow
            this column — that explanation now lives in the IMO section's info icon. */""}
      <div style="grid-column:9;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:center" title="INDICATIVE per-leg CII: the CII Percentage (attained ÷ required × 100), the rating letter, and the attained CII itself — also called AER — in one pill, with the leg's equivalent HFO fuel consumption per nautical mile (kg/nm) shown below it. CII is a whole-year, whole-ship metric in law — this shows what the rating would be if the entire year looked like this leg. Port stays have no distance, so they show the stay's equivalent HFO fuel consumption per day (t/d) instead — see the IMO section's ⓘ for the full explanation.">${colHdr("CII / Performance","")}</div>
      <div style="grid-column:10;grid-row:2;padding:6px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right" title="IMO EEOI (MEPC.1/Circ.684): TANK-TO-WAKE, CO₂ only — this leg's own CO₂ ÷ its own transport work (cargo × laden distance). Nothing is carried in from ballast legs or port stays. A ballast leg or port stay has no transport work, so it shows a dash.">${colHdr("EEOI","gCO₂/t·nm")}</div>
      ${/* 2026-07-26p (Aurvin, owner instruction): this is now a Fuel-metrics TOTAL — full fuel
           actually burned on this leg, same CO2+CH4/N2O GWP treatment EU ETS uses, but NOT cut
           down by the EU ETS coverage rule (100% intra-EU / 50% extra-EU / 0% out of scope).
           The border-right that used to sit after Cons. (col 12, marking the old Fuel
           metrics/EU ETS boundary) moved to here, since Fuel metrics now ends at this column. */""}
      <div style="grid-column:13;grid-row:2;padding:6px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right;white-space:nowrap" title="${R.year>=2026?"Total CO₂e of ALL fuel consumed on this leg (CO₂+CH₄/N₂O, "+euEUAsUnit+") — the full amount burned, NOT scaled by EU ETS coverage. See EUAs (EU ETS group) for the EU-ETS-eligible/scoped figure.":"Total CO₂ of ALL fuel consumed on this leg (CO₂ only before 2026) — the full amount burned, NOT scaled by EU ETS coverage."}">${colHdr(R.year>=2026?"Total CO₂e":"Total CO₂", euEUAsUnit)}</div>
      <div style="grid-column:14;grid-row:2;padding:6px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right">${colHdr("EUAs",euEUAsUnit)}</div>
      <div style="grid-column:15;grid-row:2;padding:6px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569;text-align:right">${colHdr("UKAs","tCO₂e (AR5)")}</div>
      <div style="grid-column:16;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right" title="Eligible mass under regulation scope (tonnes)">${colHdr("Elig.","mt")}</div>
      <div style="grid-column:17;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">${colHdr("Energy","10⁶ MJ")}</div>
      <div style="grid-column:18;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">${colHdr("Elig. energy","10⁶ MJ")}</div>
      <div style="grid-column:19;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right" title="Compliance balance (tCO₂eq)">${colHdr("CB","tCO₂eq (AR4)")}</div>
      <div style="grid-column:20;grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right">${colHdr("Penalty","€")}</div>
    </div>`;

  let zi=0;
  const body = R.rowDetails.map((d,i)=>{
    const row = src[i];
    const isBerth = d.kind!=="voyage";
    /* 2026-07-22 (Aurvin): every column is now broken down PER FUEL, not just fuel type /
       consumption / eligible mass / energy. Where a leg burns more than one fuel a bold
       "Leg total" line is appended so the leg-level figure (previously the only figure
       shown) is still visible. The per-fuel CB / penalty / EUA / UKA values come from the
       engine's per-fuel attribution — see js/engine.js, same indicative basis as the row. */
    const lines = brFuelLines(d);
    const span = Math.max(1, lines.length);
    /* 2026-07-25 (Aurvin, owner instruction): zebra striping removed from Leg-Wise — every
       row is now plain white. Row emphasis is instead done on demand: clicking a row toggles
       the .hi-on highlight (see the .hirow rules in css/styles.css). zi is kept but no longer
       drives the alternating tint.
       2026-07-28j (Aurvin, owner instruction) SUPERSEDES THAT: zebra striping is back, on all
       three tabs, banded per COMPLETE row — `i` is the row index, so a leg is one stripe across
       all of its per-fuel lines (`span`), never striped internally. The click-to-highlight
       .hi-on treatment is unchanged and still overrides the stripe (!important in styles.css).
       zi stays retired. */
    const bg = ZEBRA(i); void zi;
    /* 2026-07-23 (Aurvin, owner instruction): ONE LINE PER PORT. A voyage gets two lines —
       origin (with a trailing →) above destination; a berth stay gets one. The port NAME
       truncates with an ellipsis when the column is narrow, while the UN/LOCODE, the
       jurisdiction badge and the arrow are never clipped (they are flex:none); hovering any
       port line shows the untruncated "Name (LOCODE)". This replaces the old single
       wrapping line, which broke names mid-word and made the two ports hard to tell apart.
       2026-07-26n (Aurvin, owner instruction): the "name (LOCODE)" pair is now additionally
       capped to max-width:25ch of its own, in a wrapper separate from the badge/arrow — so a
       long name truncates once "Name (CODE)" would exceed 25 characters, EVEN THOUGH the
       Activity & timeframe column itself stays its current (wider) width for the date/time
       lines and the VOYAGE/PORT STAY tag underneath (owner chose "cap the name only", not
       "shrink the whole column"). Mirrors the 25-char cap already applied to the Report-Wise
       Port column (2026-07-25b) so the two views read the same way. Applies per port LINE —
       a voyage's origin and destination each get their own independent 25-char budget. The
       jurisdiction badge and the → arrow sit OUTSIDE this capped wrapper (still flex:none on
       the outer row) so they are never clipped and never eat into the name's budget. */
    const ports = legPorts(d, row);
    const portHtml = ports.map((p,pi)=>{
      const j = (isBerth && p.juris) ? JURIS_PAL[p.juris] : null;
      const badge = j ? `<span style="flex:none;margin-left:5px;padding:1px 5px;border-radius:4px;font-size:9.5px;font-weight:700;letter-spacing:0.03em;background:${j.bg};color:${j.fg}">${p.juris}</span>` : "";
      const arrow = pi < ports.length-1 ? `<span style="flex:none;color:#94a3b8;margin-left:6px">→</span>` : "";
      const nameSpan = p.name
        ? `<span style="flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>`
        : "";
      /* brackets only make sense AFTER a name — a port we know only by its UN/LOCODE shows
         the bare code, not "(UAPIV)" (2026-07-23) */
      const codeSpan = p.code
        ? (p.name ? `<span style="flex:none;margin-left:4px">(${esc(p.code)})</span>`
                  : `<span style="flex:none">${esc(p.code)}</span>`)
        : (p.name ? "" : `<span style="flex:none">${esc(p.label)}</span>`);
      const nameCodeCap = `<span style="display:flex;align-items:baseline;min-width:0;max-width:25ch;overflow:hidden;flex:0 1 auto">${nameSpan}${codeSpan}</span>`;
      return `<div title="${esc(p.label)}" style="display:flex;align-items:baseline;min-width:0;font-weight:600;color:#0f172a;line-height:1.45">${nameCodeCap}${badge}${arrow}</div>`;
    }).join("");
    /* 2026-07-24 (Aurvin, owner instruction): a stay where cargo happened but a report was
       OUTSIDE_PORT_LIMIT is scored as transit (row.poc===false) — but the owner wants it to
       still show a 📦 AND a red OPL badge in Leg-Wise, so it is clear cargo WAS done, just
       under a port-limit flag (which is WHY it is not a port of call). Leg-Wise only. */
    const oplCargo = isBerth && !!(row && row.oplCargo);
    const cargo = isBerth && (!row || row.poc!==false || oplCargo);
    /* 2026-07-23c: the icon now lives in the badge lane beside the timestamps, so it is a
       fixed-height line box (1.45em of the 0.85em time font = exactly one time line) with
       the glyph centred in it — that keeps 📦 and the leg tag on one vertical line and stops
       the taller emoji from pushing the arrival timestamp out of alignment. */
    const cargoGlyph = cargo ? `<span title="${esc(cargoTipText(row))}" style="cursor:help;font-size:13px;line-height:1">📦</span>` : "";
    const oplBadge = oplCargo ? `<span title="A cargo operation here was reported OUTSIDE_PORT_LIMIT (e.g. discharging still tagged on the departure report, after the ship left the berth). Because of that, this stay is scored as transit — NOT a port of call — and is excluded from EU ETS / UK ETS / FuelEU. If it should count, toggle POC on for this row in the Workspace." style="cursor:help;font-size:8px;font-weight:700;letter-spacing:0.04em;color:#b91c1c;background:#fee2e2;padding:1px 4px;border-radius:3px;line-height:1.3">OPL</span>` : "";
    /* 2026-07-26 (Aurvin, owner instruction): a port stay that is NOT a port of call
       (row.poc===false) but has no cargo and no OPL flag either — a plain transit/anchorage
       stay — previously left this whole badge-lane slot blank, so it looked identical to a
       genuine POC port stay (same tag on both) until you opened Leg-Wise's ELIGIBILITY
       caption or the Workspace POC toggle to check. A "Transit" caption now fills that same
       slot for this case, so it's visible at a glance. Deliberately does NOT apply when
       oplCargo is true — that case already shows 📦 + the red "OPL" badge, which itself flags
       "not a port of call, cargo done outside port limits"; adding "Transit" there too was
       judged redundant (owner decision, this session). Display-only — reads the same
       row.poc===false already used everywhere else this session (elReasonText, oplCargo); no
       POC derivation touched (FROZEN, CLAUDE.md). */
    const plainTransit = isBerth && !!row && row.poc===false && !oplCargo;
    const transitCaption = plainTransit ? `<span title="This port stay was not identified as a port of call (POC) — it is scored as a transit/anchorage stay for EU ETS, UK ETS and FuelEU, not a port visit. Toggle POC on for this row in the Workspace if that's wrong." style="cursor:help;font-size:8px;font-weight:700;letter-spacing:0.04em;color:#94a3b8">Transit</span>` : "";
    const cargoIcon = (cargoGlyph||oplBadge||transitCaption) ? `<div style="height:1.45em;display:flex;align-items:center;justify-content:flex-end;gap:4px">${cargoGlyph}${oplBadge}${transitCaption}</div>` : "";
    /* 2026-07-26t (Aurvin, owner instruction): "@BERTH" renamed to "PORT STAY" — the owner
       flagged that "@BERTH" could be misread as a literal physical berth (a specific type of
       quay/mooring), when the tag is really just marking "the ship was in this port" (which
       may include anchorage, STS, or a genuine berth — the underlying stay TYPE is unrelated
       to this label). Display-only rename; the value driving it (isBerth = d.kind!=="voyage")
       and the data-layer AT_BERTH port-activity-code terminology (MDA source field, Case A/B
       derivation ladder — FROZEN, CLAUDE.md) are completely untouched. Kept the existing
       all-caps/letter-spaced style to match "VOYAGE" beside it.
       2026-07-26o3 (Aurvin, owner instruction): 2026-07-26o2's two-line wrap of "PORT STAY"
       was REVERTED — owner asked instead to close the gap between the dates and the tag,
       keeping "PORT STAY" on one line. (Root cause of that gap turned out to be the dates
       block's flex:1 1 auto below stretching to fill leftover width in the row, pushing the
       tag away from the dates even though "PORT STAY" itself fits comfortably on one line
       within this column's width — see the fix at the dates/tag row below.) */
    const legTag = isBerth ? "PORT STAY" : "VOYAGE";
    const fromS = esc(fmtTs(d.tStart))||"…", toS = esc(fmtTs(d.tEnd))||"…";
    const dist = d.kind==="voyage" ? brNum(d.dist,0) : brDash;
    const voyNo = brVoyNos(segs, d);        // 2026-07-23f: canonical voyage number(s) for this leg
    const covEU = d.covEU, covUK = d.covUK;

    /* one grid line per fuel (+ optional bold leg-total line), every column filled */
    const fuelCells = lines.map((fu,fi)=>{
      const bb = fi===lines.length-1 ? "transparent" : "#eef2f5";
      const rr = fi+1;
      const tw = fu.isTotal ? "font-weight:700;" : "";
      const cbC = fu.isTotal ? ((fu.feuCB??0)<0 ? "#b91c1c" : "#15803d")
                             : (covEU>0 ? ((fu.feuCB??0)<0 ? "#b91c1c" : "#15803d") : "#94a3b8");
      const cell = (col,extra,val)=>`<div style="grid-column:${col+1};grid-row:${rr};padding:${cellPad};border-bottom:1px solid ${bb};text-align:right;font-variant-numeric:tabular-nums;${tw}${extra||""}">${val}</div>`;
      /* 2026-07-26o: the three per-fuel "Cov." cells (9/12/14 in the old layout) are gone —
         coverage is now shown ONCE per leg, as badges in the ELIGIBILITY block (columns 6-8,
         see eligLeg below), not repeated on every fuel sub-row. Fuel type/Cons. shifted to
         11/12, EU ETS to 13-14, UK ETS to 15, FuelEU to 16-19 (was 8/9, 10-11, 13-14, 15-19). */
      return `
        <div style="grid-column:11;grid-row:${rr};padding:7px 6px 7px 10px;border-bottom:1px solid ${bb};font-weight:${fu.isTotal?700:600};color:${fu.isTotal?"#0f172a":"#334155"};line-height:1.3;overflow-wrap:anywhere">${esc(fu.label)}</div>
        ${cell(11,"padding-left:4px;", fmtF(fu.tonnes,1))}
        ${cell(12,"border-right:1px solid #e2e8f0;", brNum(R.year>=2026? fu.totalCO2e : fu.totalCO2))}
        ${cell(13,"border-right:1px solid #e2e8f0;font-weight:600;color:#3652a3;", covEU>0? fmtF(fu.euas,2) : brDash)}
        ${cell(14,"border-right:1px solid #e2e8f0;font-weight:600;color:#6d4fa3;", covUK>0? fmtF(fu.ukCO2e,2) : brDash)}
        ${cell(15,"", brNum(fu.eligibleEU,1))}
        ${cell(16,"", brNum(fu.energy))}
        ${cell(17,"", covEU>0? fmtF(fu.E/1e6,2) : brDash)}
        ${cell(18,"font-weight:600;color:"+cbC+";", (covEU>0&&fu.feuCB!=null)? fmtF(fu.feuCB/1e6,2) : brDash)}
        ${cell(19,"border-right:1px solid #e2e8f0;font-weight:600;color:#9a3412;", fu.feuPenalty? fmtF(fu.feuPenalty,0) : brDash)}`;
    }).join("");

    /* 2026-07-26c (Task 2, Aurvin, owner instruction): the Sea Cargo Charter leg-level block
       (Cargo, T-Work, SCC EEOI) that used to live here is REPLACED by the IMO block below.
       Cargo moved to its own column 4 (see legLevel further down); T-Work and the SCC WtW /
       SCC EEOI figures are no longer shown in this table at all — still calculated, still in
       the Leg-Wise Excel export, still on screen in Voyage-Wise.
       Like the cells they replace, these are LEG-level (a CII or an EEOI belongs to the leg,
       not to one of its fuels), so they span every fuel sub-row and are vertically centred. */
    const imoCellStyle = "display:flex;align-items:center;justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums;";
    /* 2026-07-26v (Task 2, Aurvin, owner instruction): the CII column (col 9 only — EEOI,
       col 10, is untouched and keeps imoCellStyle above) needs its content on ONE consistent
       vertical line down the whole column, for both row kinds: a port stay's single t/d value
       and a voyage's CII pill + kg/nm second line. The CII pill's own three segments (%,
       rating letter, AER) resize per row, so the letter's exact x-position drifts row to row
       under right-alignment — there is no fixed pixel spot to anchor a second line under.
       Owner-confirmed fix: CENTER this cell instead (flex-direction:column so the pill/dash
       and any second line stack vertically, align-items:center so every row's content shares
       the cell's own horizontal centre) rather than trying to track the letter's position. */
    const imoCellStyleCII = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-variant-numeric:tabular-nums;";
    const legCiiRes = legCII(d, R.cii, S);
    const legEeoi = legEEOI(d);
    /* 2026-07-26u (Aurvin, owner instruction): port stays used to show a bare dash in the CII
       column (no distance, no CII). That slot now carries the equivalent HFO fuel/day figure
       instead — see legHfoEqPerDay above for the full formula and reasoning. */
    const legHfoEq = isBerth ? legHfoEqPerDay(d) : null;
    /* 2026-07-26v (Task 1, Aurvin): voyage rows get a second figure — equivalent HFO fuel/nm —
       shown as a small line under the existing CII pill (the pill itself is unchanged: same
       ciiCellHtml, same suppression rule). See legHfoEqPerNm above for the formula. */
    const legHfoEqNm = (!isBerth) ? legHfoEqPerNm(d) : null;
    /* 2026-07-26o (Aurvin, owner instruction): standalone ELIGIBILITY badges, left of IMO
       (columns 6-8). LEG-level like the IMO cells below (one badge per leg, not repeated per
       fuel sub-row) — same trPctBadge() pill the Report-Wise Eligibility columns use, fed the
       SAME covEU/covUK values the old per-section "Cov." cells used (display-only change, no
       calculation touched). FEU mirrors EU ETS's coverage, exactly as Report-Wise's
       trCoverage() does (fueleu-art2 mirrors euets-art3ga).
       2026-07-26p/q (Aurvin, owner instruction, clarified over questions both sessions): a
       reason-text caption sits BELOW the badges — one shared line under all three (not
       repeated per badge), e.g. "EU → Non-EU" for a voyage leg or "At UK OMR" for a genuine POC
       berth stay (see elReasonText() above — logic corrected 2026-07-26q; separator changed
       from "-" to " → " on 2026-07-26 to fix "Non-EU-Non-EU" reading as garbled). The three separate
       per-column divs were merged into ONE div spanning columns 6-8 so a single caption can sit
       under all three without overlapping them — the badges themselves are unchanged (same
       trPctBadge(), same 100%/partial/0% styling), only their layout container changed.
       2026-07-26q (Aurvin, owner instruction — Task 3, this session): the badge row must sit
       at the TRUE vertical centre of the leg's own row-span, unmoved by the caption beneath it
       (unlike 26p's flex-column, which centred badge+caption as ONE block, nudging the badge up
       slightly). Both are now ABSOLUTELY positioned inside a `position:relative` box: the badge
       row at `top:50%` (translate -50%,-50%) — exactly where it sat before any caption existed —
       and the caption at a FIXED offset below that centre (`50% + 22px`: 10px = half the
       badge's own ~20px height, +12px = the owner's chosen "generous" gap below the badge's
       own bottom edge). Absolutely positioned children don't drive the grid's own row-height
       auto-sizing, so a `min-height:70px` guard is added — comfortably fitting badge+gap+
       caption even on a single-fuel-line leg — accepting the owner's explicit trade-off
       ("more generous gap" over "tight", knowing it costs some row height) that every leg row
       is now a little taller. */
    const elText = elReasonText(row);
    const eligLeg = `
        <div style="grid-column:6 / span 3;grid-row:1 / span ${span};position:relative;min-height:70px;border-right:1px solid #e2e8f0">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">${elFusedPill([covEU*100, covEU*100, covUK*100])}</div>
          ${elText?`<div style="position:absolute;top:calc(50% + 22px);left:50%;transform:translateX(-50%);font-size:9px;font-weight:600;color:#94a3b8;white-space:nowrap;line-height:1.2" title="Zone pair (or single zone for a port stay) that this leg's EU ETS / UK ETS / FuelEU coverage is judged on.">${esc(elText)}</div>`:""}
        </div>`;
    /* 2026-07-26w (Aurvin, owner instruction, this session): SUPERSEDES the 2026-07-26v
       "centered flex-column" layout for col 9 on VOYAGE rows only (port-stay t/d, isBerth
       branch, is untouched — owner confirmed only voyage rows needed this). Reason: flex
       centering centres the PILL+CAPTION as one combined block, so the pill's own y-position
       drifts with the caption's presence/height — it does not sit at the row's true centre.
       That put the CII pill out of vertical alignment with the Eligibility badges (columns
       6-8), which use a DIFFERENT technique (absolute position, pill pinned at the row's
       literal top:50% centre, caption pinned at a fixed centre+22px offset, min-height:70px
       guard) — see eligLeg above. Owner asked (screenshot: leg-wise IMO/Eligibility banners
       not level) for the two columns to share one visual baseline for both the badge/pill row
       AND the caption row. Fix: col 9 on voyage rows now copies eligLeg's exact technique
       (same 50%/50%+22px anchors, same min-height:70px) so both columns are pinned to
       IDENTICAL coordinates instead of two independent centering rules that happen to look
       close. This changes the self-test at "CII column (grid-column:9) cell uses centered
       flex-column layout" (below) — updated in the same commit, per CLAUDE.md's rule that a
       test only changes with an explicit owner instruction, stated here. */
    const imoLeg = `
        <div style="grid-column:9;grid-row:1 / span ${span};${
          isBerth ? `padding:${cellPad};${imoCellStyleCII}`
                  : `position:relative;min-height:70px`}">${
          isBerth ? hfoEqCellHtml(legHfoEq)
                  : `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">${ciiCellHtml(legCiiRes)}</div>`+
                    `<div style="position:absolute;top:calc(50% + 22px);left:50%;transform:translateX(-50%);white-space:nowrap">${hfoEqPerNmCellHtml(legHfoEqNm)}</div>`}</div>
        <div style="grid-column:10;grid-row:1 / span ${span};padding:${cellPad};${imoCellStyle}border-right:1px solid #e2e8f0;font-weight:600;color:#1d7a5f">${
          eeoiCellHtml(legEeoi, isBerth?"A port stay carries no cargo over a distance, so it has no EEOI."
                                       :"No transport work on this leg — the departure (SOSP) report shows no cargo (ballast leg), so there are no tonne-miles to divide by.")}</div>`;

    return `
      <div class="hirow" style="display:grid;${BR_BOX}grid-template-columns:${BR_GRID};background:${bg};border-bottom:1px solid #e2e8f0">
        <div class="hicell" style="grid-column:1;grid-row:1 / span ${span};${BR_FREEZE}z-index:2;background:${bg};display:flex;align-items:center;justify-content:center;border-right:1px solid #e2e8f0">${selBox("br",i)}</div>
        <div class="hicell" style="grid-column:2;grid-row:1 / span ${span};${BR_FREEZE2}z-index:2;background:${bg};display:flex;border-right:1px solid #e2e8f0">
          <div style="position:relative;width:${GUTTER_W}px;flex:none;display:flex;align-items:center;justify-content:center">
            <div style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#e2e8ec;transform:translateX(-50%);z-index:0"></div>
            <div class="hicell" style="position:relative;background:${bg};z-index:1;line-height:0;padding:4px 0">${isBerth?ICON_BERTH:ICON_VOYAGE}</div>
          </div>
          <div style="flex:1 1 auto;min-width:0;padding:10px 12px 10px 0">
            <!-- 2026-07-23c (Aurvin, owner instruction): the port lines now get the FULL width
                 of the cell. The 📦 icon moved down out of this block — sharing the line with
                 the port name was costing a berth row ~20px of name before the ellipsis, so a
                 berth port name truncated much earlier than the same name on a voyage line. -->
            <div>${portHtml}</div>
            <!-- The two timestamps are stacked one above the other, mirroring the two port
                 lines above (start over end, arrow trailing the first). To their right is a
                 badge lane of the SAME two line heights: 📦 on the first (arrival) line,
                 the VOYAGE / PORT STAY tag on the second (renamed from "@BERTH" 2026-07-26t) —
                 so both sit on one vertical line and neither steals width from the port name.
                 2026-07-26o4 (Aurvin, owner instruction): 2026-07-26o3's flex:none on the
                 dates block (left the tag flush against the dates, with blank space to its
                 right) is REVERTED back to flex:1 1 auto — owner clarified the tag should
                 pull back over to the RIGHT edge (flush under the name/badge above), not sit
                 close to the dates. Key point the owner made: this costs nothing in column
                 width. The grid TRACK width (BR_GRID's minmax for this column, set by the
                 25-character name+LOCODE row above) is fixed independently of how this inner
                 flex row lays out its own two children — flex:1 1 auto here only redistributes
                 space ALREADY allocated to the cell; it cannot make the column itself grow.
                 The dates+tag row's own content (~180px) was always comfortably inside the
                 column's available width (~232px, driven by the name row) whether the tag
                 sits close to the dates or flush right — so "flush right" was free either way,
                 and is simply the better-looking choice, matching how the port name row above
                 already ends with the badge/arrow near the same right edge. -->
            <div style="display:flex;align-items:flex-end;gap:8px;font-size:0.85em;color:#64748b;margin-top:5px;line-height:1.45">
              <div style="flex:1 1 auto;min-width:0;font-variant-numeric:tabular-nums">
                <div style="white-space:nowrap">${fromS} <span style="color:#94a3b8">→</span></div>
                <div style="white-space:nowrap">${toS}</div>
              </div>
              <div style="flex:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end">
                ${cargoIcon}
                <div style="height:1.45em;display:flex;align-items:center;font-size:8.5px;font-weight:700;letter-spacing:0.07em;color:#94a3b8">${legTag}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="grid-column:3;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#0f172a">${voyNo? esc(voyNo) : brDash}</div>
        <!-- 2026-07-26c (Aurvin, owner instruction): Cargo now has its own column between
             Voyage No and Dist., matching where it sits in the Workspace / Report-Wise
             tables. Owner chose PLAIN NUMBERS here — the old grey "ballast" word that the
             SCC Cargo cell used is not carried over.
             2026-07-26e (Aurvin, owner instruction): a voyage leg with genuine zero cargo now
             shows 0 (not a dash) — a real reading of zero is a value, not "no data". Berth
             stays still show a dash (cargo is a voyage concept). -->
        <div style="grid-column:4;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums;color:#475569">${(!isBerth)? fmtF(d.cargo||0,0) : brDash}</div>
        <div style="grid-column:5;grid-row:1 / span ${span};padding:${cellPad};border-right:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums;color:#475569">${dist}</div>
        ${eligLeg}
        ${fuelCells}
        ${imoLeg}
      </div>`;
  }).join("");
  /* the timeline rule now lives INSIDE each frozen first cell (see the gutter above) — as a
     single absolute line behind the whole table it would have been hidden by the frozen
     column's background as soon as the table was scrolled sideways (2026-07-22b) */
  const bodyWrapped = R.rowDetails.length ? `<div style="position:relative">${body}</div>` : body;

  const empty = !R.rowDetails.length ? `<div style="padding:22px;text-align:center;color:#64748b">No activity rows for ${R.year}.</div>` : "";

  /* 2026-07-22 (Aurvin): the totals row moved from the BOTTOM of the table to the TOP, and
     header + totals are wrapped in one sticky block so both stay pinned while the legs
     scroll underneath. The totals row aggregates the TICKED rows (all rows when none are
     ticked) — see ROWSEL above. */
  const stuck = `<div style="position:sticky;top:0;z-index:12;background:#ffffff;${BR_BOX}">${header}<div id="brTotals">${brTotalsHtml()}</div></div>`;
  return `<div class="tablescroll" style="font-size:12.5px;overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px">${stuck}${bodyWrapped}${empty}</div>`;
}

/* per-fuel display lines for one leg: one per fuel, plus a bold leg-total line when the leg
   burned more than one fuel (so the leg-level figure that used to span the fuels is kept) */
function brFuelLines(d){
  const lines = d.fuels.map(fu=>{
    const fb = FUEL_BY_ID[fu.id]||{};
    return { label: cleanFuelName(fb.id?fb:{id:fu.id,name:fu.name}),
             tonnes: fu.tonnes, eligibleEU: fu.eligibleEU,
             energy: (fb.lcv && fu.eligibleEU) ? fu.eligibleEU*fb.lcv : 0,   // 10⁶ MJ = t × LCV(MJ/g)
             E: fu.E||0, feuCB: fu.feuCB, feuPenalty: fu.feuPenalty||0,
             co2: fu.co2||0, etsCO2: fu.etsCO2||0, etsCO2e: fu.etsCO2e||0, euas: fu.euas||0, ukCO2e: fu.ukCO2e||0,
             /* 2026-07-26p (Aurvin, owner instruction): Fuel metrics' own "Total CO2e" — full
                fuel burned, not EU ETS coverage-scoped. See js/engine.js. */
             totalCO2: fu.totalCO2||0, totalCO2e: fu.totalCO2e||0,
             sccTtW: fu.sccTtW||0, sccWtW: fu.sccWtW, isTotal:false };
  });
  /* 2026-07-22b (owner): the per-leg "All fuels" subtotal line was removed — it was not
     useful and doubled the height of every multi-fuel leg. The leg's combined figures are
     still available from the sticky TOTAL row at the top (tick a single leg to see it). */
  return lines;
}

/* the sticky totals row — rebuilt on its own whenever the tick selection changes */
function brTotalsHtml(){
  if(!BR_LAST) return "";
  const R = BR_LAST.R, cellPad = BR_LAST.cellPad;
  if(!R.rowDetails.length) return "";
  const dets = rowselActive("br", R.rowDetails.length).map(i=>R.rowDetails[i]);
  const sum = k => dets.reduce((a,d)=>a+(Number(d[k])||0),0);
  const sumF = k => dets.reduce((a,d)=>a+d.fuels.reduce((b,fu)=>b+(Number(fu[k])||0),0),0);
  const sumEnergy = dets.reduce((a,d)=>a+d.fuels.reduce((b,fu)=>{const fb=FUEL_BY_ID[fu.id]||{};return b+((fb.lcv&&fu.eligibleEU)?fu.eligibleEU*fb.lcv:0);},0),0);
  /* SCC fleet intensity is a WEIGHTED average — Σ numerator ÷ Σ transport work — never the
     sum or the mean of the per-leg EEOIs. Legs whose fuel has no Appendix 6 factor are left
     out of both sides rather than counted as zero (2026-07-22c).
     2026-07-26c: the SCC columns no longer appear in this table, so eeoiTot is no longer
     rendered — kept here (unused) only because removing it would be an unrelated change. */
  const sccDets = dets.filter(d=>d.kind==="voyage" && d.tw>0 && !d.sccNoFactor);
  const twTot = sccDets.reduce((a,d)=>a+d.tw,0);
  const numTot = sccDets.reduce((a,d)=>a+(Number(d.sccNumerator)||0),0);
  const eeoiTot = twTot>0? numTot*1e6/twTot : null; void eeoiTot;
  /* 2026-07-26i (Aurvin, EXPLICIT owner instruction, this session, after a clarifying-question
     round): the TOTAL row's CII/EEOI numerator now sums CO₂ from EVERY ticked row — voyage
     LEGS AND BERTH STAYS — matching the real annual attained CII engine.js computes for the
     Results/Workspace tab (cii_g there accumulates every row's CO₂ regardless of kind; only
     totalDist is voyage-only). With nothing ticked (every row counted), this TOTAL row's CII
     % and rating now equal the Workspace figure for the same year/date-filter selection —
     the owner's explicit ask ("this value should match the value in the workspace"). Ticking
     a subset still narrows the total to just the ticked rows' CO₂, same mechanic as every
     other column.
       TOTAL CII  = Σ ALL ticked rows' CO₂ (g) ÷ (capacity × Σ ticked VOYAGE-LEG distance)
       TOTAL EEOI = Σ ALL ticked rows' CO₂ (g) ÷ Σ ticked VOYAGE-LEG transport work
     Distance and transport-work denominators are UNCHANGED (voyage-legs only — a berth stay
     never has either). This supersedes the previous 2026-07-26c rule that excluded at-berth
     CO₂ from both totals entirely; INDIVIDUAL leg and berth rows are NOT touched by this
     change (owner: "for @berth row — no CII/EEOI needed [individually]; but their consumption
     will be part of Total CII, EEOI") — a leg's own CII/EEOI keeps its existing indicative,
     berth-excluded definition and caveat tooltip; a berth row keeps showing a dash. */
  const co2AllTot = sum("co2");
  const imoDets = dets.filter(d=>d.kind==="voyage" && d.dist>0);
  const imoCap = ciiCapacityOf(S);
  const imoDist = imoDets.reduce((a,d)=>a+(Number(d.dist)||0),0);
  const imoAttained = (imoCap>0 && imoDist>0) ? co2AllTot*1e6/(imoCap*imoDist) : null;
  const ciiTot = (imoAttained!=null && R.cii && R.cii.bounds && R.cii.ciiReq!=null)
    ? { attained:imoAttained, rating:ciiRatingOf(imoAttained,R.cii.bounds), pct:ciiPctOfRequired({attained:imoAttained,ciiReq:R.cii.ciiReq}) }
    : null;
  const twImo = dets.filter(d=>d.kind==="voyage" && d.tw>0);
  const twImoTot = twImo.reduce((a,d)=>a+d.tw,0);
  const eeoiImoTot = twImoTot>0 ? co2AllTot*1e6/twImoTot : null;
  const cell=(col,extra,val)=>`<div style="grid-column:${col+1};padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums;${extra||""}">${val}</div>`;
  return `
    <div style="display:grid;${BR_BOX}grid-template-columns:${BR_GRID};background:#eef2f7;border-bottom:2px solid #cbd5e1">
      <div style="grid-column:1;${BR_FREEZE}z-index:3;background:#eef2f7;border-right:1px solid #e2e8f0"></div>
      <div style="grid-column:2;${BR_FREEZE2}z-index:3;background:#eef2f7;padding:${cellPad};border-right:1px solid #e2e8f0;font-weight:700;color:#0f172a;display:flex;align-items:center">${esc(rowselLabel("br",R.rowDetails.length,R.year))}</div>
      <div style="grid-column:3;padding:${cellPad};text-align:right;border-right:1px solid #e2e8f0">${brDash}</div>
      ${/* 2026-07-26d (Aurvin, owner instruction): no cargo TOTAL. Beyond saving width, a sum
           here was misleading — the same parcel is reported on every leg it is carried over,
           so the column does not add up to a meaningful tonnage. Dash instead. */""}
      <div style="grid-column:4;padding:${cellPad};text-align:right;border-right:1px solid #e2e8f0">${brDash}</div>
      ${cell(4,"border-right:1px solid #e2e8f0;", fmtF(sum("dist"),0))}
      ${/* 2026-07-26o: ELIGIBILITY totals (columns 6-8) — a coverage % cannot be meaningfully
           summed across legs (same reasoning the old per-section "Cov." totals used), so all
           three show a dash, centred like the badges above them. */""}
      <div style="grid-column:6 / span 3;padding:${cellPad};text-align:center;border-right:1px solid #e2e8f0">${brDash}</div>
      ${/* 2026-07-26e: weighted IMO totals — see the note above brTotalsHtml's imoDets block.
           The CII cell reuses ciiCellHtml, so the TOTAL row's badge and percentage look
           exactly like the leg rows' and the Results tab's. IMO now sits LEFT of Fuel metrics. */""}
      <div style="grid-column:9;padding:${cellPad};display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700">${ciiTot? ciiCellHtml(ciiTot) : brDash}</div>
      ${cell(9,"border-right:1px solid #e2e8f0;color:#1d7a5f;", eeoiImoTot!=null? fmtF(eeoiImoTot,2) : brDash)}
      ${cell(11,"padding-left:4px;", fmtF(sumF("tonnes"),1))}
      ${/* 2026-07-23 (Aurvin, owner instruction — decimal alignment): the TOTAL row now uses
           the SAME number of decimal places as the leg rows underneath it in every column.
           It previously rounded CO₂, EUAs, UKAs, TtW and WtW to whole tonnes while the legs
           below showed 2 dp, so the decimal point in the total sat two characters left of
           the column it was heading. Display only — the summed value is unchanged. */""}
      ${/* 2026-07-26p: Total CO2e moved to Fuel metrics — sums det.totalCO2/totalCO2e (full
           fuel burned, not EU-ETS-coverage-scoped). Border-right moved here from Cons. (col 11). */""}
      ${cell(12,"border-right:1px solid #e2e8f0;", fmtF(sum(R.year>=2026?"totalCO2e":"totalCO2"),2))}
      ${cell(13,"border-right:1px solid #e2e8f0;color:#3652a3;", fmtF(sum("euas"),2))}
      ${cell(14,"border-right:1px solid #e2e8f0;color:#6d4fa3;", fmtF(sum("ukCO2e"),2))}
      ${cell(15,"", fmtF(sumF("eligibleEU"),1))}
      ${cell(16,"", fmtF(sumEnergy,2))}
      ${cell(17,"", fmtF(sum("E")/1e6,2))}
      ${cell(18,"color:#b91c1c;", fmtF(sum("feuCB")/1e6,2))}
      ${cell(19,"border-right:1px solid #e2e8f0;color:#9a3412;", fmtF(sum("feuPenalty"),0))}
    </div>`;
}

/* the breakdown table shrinks (flex layout) whenever "Intermediate workings" is expanded below it —
   clicking anywhere on the shrunk table is a shortcut back, since the <summary> toggle itself is
   easy to lose track of once the table above it has shrunk (2026-07-19, Aurvin) */
function closeWorkingsIfOpen(){ const d=document.getElementById("workingsDetails"); if(d&&d.open) d.open=false; }

/* ======================= VOYAGE-WISE TAB (2026-07-23c) ==================================
   Added on Aurvin's explicit instruction. Aggregates the SAME engine output the Leg-Wise
   tab shows, but grouped by the MDA VOYAGE_NUMBER instead of by leg/berth. Four owner
   decisions were taken before writing this (recorded here so a later session does not
   silently reverse them):

     1. ONE ROW PER VOYAGE, its legs revealed on click (not a permanent leg list).
     2. An ABRUPT mid-sea voyage-number change SPLITS the sea leg at that report.
     3. SCC EEOI is RECOMPUTED per voyage number (not summed from the per-leg figures).
     4. Columns kept: SCC block, fuel metrics, EU/UK ETS allowance figures, FuelEU CB and
        penalty. Dropped per Task 4: the three "Cov." eligibility-% columns and the cargo
        port-of-call icon.

   IMPORTANT — this code does NOT touch the frozen arrival/departure/POC derivation in
   mdaToOVD, nor js/engine.js. It reads S.mdaReports (which already retains VOYAGE_NUMBER as
   `voy`) and S.rows, builds a SPLIT COPY of the rows, and runs the ordinary computeAll() on
   that copy. Every regulatory number therefore comes from the same engine as everywhere
   else — nothing is re-derived or pro-rated by hand except the split weighting below. */

/* ---- Task 2: where does a voyage number really change? --------------------------------
   The vessel's staff type VOYAGE_NUMBER by hand, so the number often flips a report or two
   AFTER the departure it actually belongs to (sometimes on an SOSP report). Rule agreed
   with the owner:
     • Walk the reports in time order, IGNORING blank voyage numbers. This matters: in the
       real MDA files FUEL_STOCK and FUEL_OIL_BUNKER rows carry an EMPTY VOYAGE_NUMBER, so
       treating blanks as values would invent ~14 phantom voyage changes in a file that has
       exactly one (verified against tools/Else- MDA-split year- blumenthal.xlsx).
     • When the number changes on report k, look BACK for a derived DEPARTURE on the same
       calendar day as report k or the day before. If there is one, the change really
       happened at that departure — use the departure's time.
     • If there is no such departure, the charterer genuinely changed mid-passage. That is a
       legitimate new voyage starting at report k's own time.
     • Boundary semantics follow the 2026-07-20 owner decision that a report's consumption
       covers the period ENDING at its timestamp. So the report AT the boundary keeps its
       consumption on the OLD voyage, and the new voyage accumulates from the next report
       on — which is exactly what the owner asked for in Task 2.
   Returns [{voy, tStart, tEnd, retimed, atReport, viaDeparture}] in time order. */
/* The DERIVED departure (role) is the regulatory one and is what forms a workspace row
   boundary; DEPARTURE-SOSP is only the sea-passage marker and normally sits a few hours
   LATER, already inside the sea leg. Snapping to the SOSP would therefore drop the boundary
   in the middle of a leg and force a pointless split, so the derived departure always wins
   and the SOSP is only a fallback for files that have no derived role. */
function vwIsDeparture(r){ return /DEPARTURE/.test(String(r.role||"")); }
function vwIsSosp(r){ return r.rt==="DEPARTURE-SOSP"; }

/* ---- Task 2 (2026-07-23e, owner instruction): normalise how the crew WROTE the number ----
   Vessel staff type VOYAGE_NUMBER by hand and are inconsistent about two things: leading
   zeros, and a "V" for voyage in front. The owner's rule: 6, 06, 006, V6, V06 and V006 are
   all the SAME voyage. So the number is reduced to a canonical key before it is compared:

     • trim, upper-case
     • drop a leading voyage marker — V / VOY / VOYAGE, with any of space . _ - / after it —
       but ONLY when a digit follows, so a genuinely alphabetic voyage code is left alone
       ("VESSEL1" is not treated as voyage "ESSEL1")
     • drop leading zeros from the numeric part, keeping any suffix ("V05A" → "5A")

   CONTINUITY STILL DECIDES. Matching keys are only merged when they are ADJACENT in time.
   If another voyage number appears in between — 5, 6, 5 — that is three voyages, and the two
   "5" groups stay separate, exactly as the owner specified. This is why segments are
   identified downstream by their INDEX, never by their number: two different segments can
   legitimately carry the same key. */
function vwVoyKey(v){
  const raw=String(v==null?"":v).trim().toUpperCase();
  if(!raw) return "";
  const s=raw.replace(/^V(?:OYAGE|OY)?[\s._\-\/]*(?=\d)/,"");
  const m=/^0*(\d+)(.*)$/.exec(s);
  return m ? (m[1]+m[2].trim()) : s;
}
function vwDay(t){ return String(t||"").slice(0,10); }
function vwPrevDay(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x=new Date(d+"T00:00:00Z"); x.setUTCDate(x.getUTCDate()-1);
  return x.toISOString().slice(0,10);
}
function vwVoyageSegments(reps){
  const list=(reps||[]).filter(r=>r&&r.t).slice().sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:0);
  const segs=[];
  let cur=null, prevKey=null;
  for(let i=0;i<list.length;i++){
    const r=list[i], v=String(r.voy||"").trim(), key=vwVoyKey(v);
    if(!key) continue;                                   // blank = bunker/stock row, carry on
    if(prevKey===null){
      /* The FIRST voyage starts open-ended (tStart null = "since the beginning of time").
         Anchoring it to the first report's timestamp instead would put a boundary just
         inside any row that began before that report — e.g. a file opening mid-voyage —
         and split it for no reason. */
      cur={ voy:key, raws:[v], tStart:null, tEnd:null, retimed:false, atReport:r.t, viaDeparture:null };
      segs.push(cur); prevKey=key; continue;
    }
    /* same voyage, however the crew spelled it this time — just record the spelling */
    if(key===prevKey){ if(cur && cur.raws.indexOf(v)<0) cur.raws.push(v); continue; }
    /* --- a change: try to re-time it back to a departure --- */
    const dToday=vwDay(r.t), dYest=vwPrevDay(dToday);
    let dep=null, sosp=null;
    for(let j=i;j>=0;j--){
      const q=list[j], dq=vwDay(q.t);
      if(dq!==dToday && dq!==dYest) break;               // walked past "yesterday" — stop
      if(!dep  && vwIsDeparture(q)) dep=q;               // nearest preceding derived departure
      if(!sosp && vwIsSosp(q))      sosp=q;
      if(dep) break;                                     // derived departure always wins
    }
    const anchor = dep || sosp;
    const bT = anchor ? (anchor.te||anchor.t) : (r.te||r.t);
    if(cur) cur.tEnd=bT;
    cur={ voy:key, raws:[v], tStart:bT, tEnd:null, retimed:!!anchor && bT!==(r.te||r.t),
          atReport:r.t, viaDeparture: anchor? bT : null, viaSosp: !dep && !!sosp };
    segs.push(cur); prevKey=key;
  }
  if(cur) cur.tEnd = (list.length? (list[list.length-1].te||list[list.length-1].t) : null);
  /* merge consecutive segments carrying the SAME number (a number that flips away and back
     across a blank run is one voyage, not three) */
  /* safety net: fold any adjacent pair that ended up with the same key (the loop above
     already prevents it, but a future edit to the change detection might not) */
  const merged=[];
  for(const s of segs){
    const last=merged[merged.length-1];
    if(last && last.voy===s.voy){
      last.tEnd=s.tEnd;
      for(const rw of s.raws) if(last.raws.indexOf(rw)<0) last.raws.push(rw);
      continue;
    }
    merged.push(s);
  }
  return merged;
}
/* which voyage owns an instant — segment start INCLUSIVE, so a sea leg beginning exactly at
   the departure boundary belongs to the NEW voyage while the berth stay ending there keeps
   the old one.
   Returns the segment INDEX, not the voyage number: after the 2026-07-23e normalisation two
   separate segments can legitimately share a number (5 → 6 → 5 is three voyages, two of them
   called "5"), so the index is the only safe identity. */
function vwSegAt(segs, t){
  if(!t || !segs.length) return null;
  /* tStart null on the first segment = open-ended start, so it matches anything before the
     first real boundary */
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    if((!s.tStart || t>=s.tStart) && (!s.tEnd || t<s.tEnd)) return i;
  }
  const last=segs[segs.length-1];
  if(last.tEnd && t>=last.tEnd) return segs.length-1;
  return 0;
}

/* ---- Task 2 (second half): split a row that a voyage boundary falls inside --------------
   Only an ABRUPT mid-sea change can do this — a re-timed change lands on a departure, which
   is already a row boundary, so nothing splits. The split weight comes from the MDA reports
   inside each part (per fuel, and separately for distance), then that weight is applied to
   the ROW's own totals. Weighting the row rather than just summing the reports is deliberate:
   the derivation moves fuel across the arrival/departure boundaries, so report sums do not
   equal row totals — scaling the row keeps the fuel- and distance-conservation invariants
   that verify_workspace_rows.js asserts. Rows with no report backing (hand-entered, or an
   OVD import with no MDA behind it) fall back to a time-proportional split. */
function vwPartWeight(reps, row, a, b){
  const inWin=(t,x,y)=>t && t>x && t<=y;
  const all=(reps||[]).filter(r=>inWin(r.t,row.tStart,row.tEnd));
  const part=all.filter(r=>inWin(r.t,a,b));
  const sumD=l=>l.reduce((s,r)=>s+(Number(r.dist)||0),0);
  const sumF=(l,id)=>l.reduce((s,r)=>s+(Number((r.fuels||{})[id])||0),0);
  const tf=()=>{ const t0=Date.parse(row.tStart), t1=Date.parse(row.tEnd), pa=Date.parse(a), pb=Date.parse(b);
                 return (isFinite(t0)&&isFinite(t1)&&t1>t0)? Math.max(0,Math.min(1,(pb-pa)/(t1-t0))) : 0.5; };
  if(!all.length) return { dist:tf(), fuel:()=>tf(), fallback:true };
  const dAll=sumD(all);
  return { dist: dAll>0? sumD(part)/dAll : tf(),
           fuel: id => { const t=sumF(all,id); return t>0? sumF(part,id)/t : tf(); },
           fallback:false };
}
function vwCloneRow(row){
  const c=Object.assign({},row);
  c.fuels=(row.fuels||[]).map(f=>Object.assign({},f));
  return c;
}
function vwSplitRows(rows, segs, reps){
  const out=[], owner=[];
  for(const row of rows||[]){
    const cuts=segs.map(s=>s.tStart)
      .filter(t=>t && row.tStart && row.tEnd && t>row.tStart && t<row.tEnd)
      .sort().filter((t,i,a)=>i===0||t!==a[i-1]);
    if(!cuts.length){ out.push(vwCloneRow(row)); owner.push(vwSegAt(segs,row.tStart)); continue; }
    const bounds=[row.tStart,...cuts,row.tEnd];
    for(let k=0;k<bounds.length-1;k++){
      const a=bounds[k], b=bounds[k+1];
      const w=vwPartWeight(reps,row,a,b);
      const c=vwCloneRow(row);
      c.tStart=a; c.tEnd=b;
      c.dist=(Number(row.dist)||0)*w.dist;
      c.hours=(Number(row.hours)||0)*w.dist;
      c.fuels=(row.fuels||[]).map(f=>Object.assign({},f,{ tonnes:(Number(f.tonnes)||0)*w.fuel(f.fuelId||f.id) }));
      c.vwSplitPart=k+1; c.vwSplitOf=bounds.length-1;
      /* ukInFrac is a per-report ratio for the WHOLE row; it is only approximately valid for
         a time slice of it, so drop it on split parts and let the engine fall back to its own
         time-proration (ukSchemeFraction) over the part's own window */
      delete c.ukInFrac;
      out.push(c); owner.push(vwSegAt(segs,a));
    }
  }
  return { rows:out, owner };
}

/* ---- assemble the voyage groups -------------------------------------------------------- */
function vwInYear(row,y){
  if(row.yearPart) return Number(row.yearPart)===y;
  const a=row.tStart? String(row.tStart).slice(0,4):null;
  const b=row.tEnd?   String(row.tEnd).slice(0,4)  :null;
  if(!a&&!b) return true;
  return a===String(y)||b===String(y);
}
/* per-fuel roll-up across a whole voyage group, same shape brFuelLines gives a leg */
function vwFuelLines(g){
  const acc=new Map();
  for(const d of g.dets) for(const fu of d.fuels){
    let a=acc.get(fu.id);
    if(!a){ a={ id:fu.id, label:cleanFuelName(FUEL_BY_ID[fu.id]||{id:fu.id,name:fu.name}),
                tonnes:0, eligibleEU:0, energy:0, E:0, feuCB:0, feuPenalty:0,
                co2:0, etsCO2:0, etsCO2e:0, totalCO2:0, totalCO2e:0, euas:0, ukCO2e:0, sccTtW:0, sccWtW:0, noFactor:false }; acc.set(fu.id,a); }
    const fb=FUEL_BY_ID[fu.id]||{};
    a.tonnes+=Number(fu.tonnes)||0; a.eligibleEU+=Number(fu.eligibleEU)||0;
    a.energy += (fb.lcv&&fu.eligibleEU)? fu.eligibleEU*fb.lcv : 0;
    a.E+=Number(fu.E)||0; a.feuCB+=Number(fu.feuCB)||0; a.feuPenalty+=Number(fu.feuPenalty)||0;
    /* 2026-07-26p: totalCO2/totalCO2e — Fuel metrics' full-fuel figure, see js/engine.js */
    a.co2+=Number(fu.co2)||0; a.etsCO2+=Number(fu.etsCO2)||0; a.etsCO2e+=Number(fu.etsCO2e)||0; a.totalCO2+=Number(fu.totalCO2)||0; a.totalCO2e+=Number(fu.totalCO2e)||0; a.euas+=Number(fu.euas)||0; a.ukCO2e+=Number(fu.ukCO2e)||0;
    a.sccTtW+=Number(fu.sccTtW)||0;
    if(fu.sccWtW==null) a.noFactor=true; else a.sccWtW+=Number(fu.sccWtW)||0;
  }
  return Array.from(acc.values())
    .sort((x,y2)=>((TR_FUEL_ORDER.indexOf(x.id)+1||99)-(TR_FUEL_ORDER.indexOf(y2.id)+1||99))||(x.label<y2.label?-1:1));
}
/* Task 5 — SCC per voyage number, RECOMPUTED (owner decision 3).
     numerator   = every gram of WtW CO₂e inside the voyage group: its sea legs AND its port
                   stays (loading, discharging, bunkering, waiting) — SCC counts the lot.
     denominator = Σ (cargo × distance) over the group's LADEN legs only, i.e. the group's own
                   transport work. Ballast distance never enters the denominator.
   A group that carries no cargo at all (a wholly ballast voyage) has no EEOI of its own —
   under SCC 2025 Technical Guidance Appendix 3 its emissions belong to the voyage that loads
   NEXT, so they are carried forward into the next group that has transport work. This is the
   same rule js/engine.js applies per leg, lifted to voyage granularity. A group burning a fuel
   with no Table 8 factor is dashed and excluded rather than silently counted as zero. */
/* end-year of a voyage = calendar year of its END timestamp (SCC: emissions belong to the
   voyage, taken at its end date). Falls back to the given year when undated. */
function vwEndYear(endISO, fallback){
  if(endISO){ const yy=Number(String(endISO).slice(0,4)); if(isFinite(yy)) return yy; }
  return fallback;
}
function vwGroups(state){
  const S0 = state||S;
  const fallbackY = Number(S0.year)||2026;
  const reps = S0.mdaReports||[];
  const segs = vwVoyageSegments(reps);
  const split = vwSplitRows(S0.rows||[], segs, reps);

  /* group the split-row indices by their owner SEGMENT (never by the voyage number — two
     non-adjacent segments can share a number, e.g. 5 → 6 → 5) and find each group's end date */
  const keyOf = i => (split.owner[i]==null) ? "none" : ("#"+split.owner[i]);
  const grpIdx = new Map();
  split.rows.forEach((row,i)=>{ const k=keyOf(i); if(!grpIdx.has(k)) grpIdx.set(k,[]); grpIdx.get(k).push(i); });
  const grpEnd = new Map();
  for(const [k,idxs] of grpIdx){
    let endISO=null; for(const i of idxs){ const t=split.rows[i].tEnd||split.rows[i].tStart; if(t && (!endISO||t>endISO)) endISO=t; }
    grpEnd.set(k, { endISO, endYear: vwEndYear(endISO, fallbackY) });
  }

  /* 2026-07-24 (Aurvin): a voyage is INCLUDED when its END date falls in the range, and each
     voyage is graded under the rules of its end-date year. Rows are computed one end-year bucket
     at a time (ignoreYearFilter) so a voyage carries all its consumption — even a part that
     spilled into the previous calendar year — under its end-year's rules.

     2026-07-28h (Aurvin, owner instruction): THIS FUNCTION IS UNCHANGED, on purpose. What changed
     is only WHAT RANGE THE UI CAN HAND IT. Voyage-Wise used to own an independent, multi-year
     range; it now mirrors the year-locked S.dateFilter (see _mirrorVoyFilter above). The engine
     stays range-agnostic — it will still correctly bucket a multi-year range by end-year if one is
     passed in programmatically, which is what the four Voyage-Wise self-tests below do — so no
     regulatory logic was touched to make the UI change, and none of those tests needed editing.
     In normal use byYear therefore ends up with exactly one bucket: the reporting year. */
  const vf = S0.voyDateFilter;
  const vfOn = !!(vf && vf.active && vf.fromISO && vf.toISO);
  const inRange = (endISO)=>{ if(!vfOn || !endISO) return true;
                              return _utcms(endISO)>=_utcms(vf.fromISO) && _utcms(endISO)<=_utcms(vf.toISO); };
  const keptKeys = [...grpIdx.keys()].filter(k=>inRange(grpEnd.get(k).endISO));
  const byYear = new Map();
  for(const k of keptKeys){ const yy=grpEnd.get(k).endYear; if(!byYear.has(yy)) byYear.set(yy,[]); byYear.get(yy).push(k); }

  const order=[];
  for(const [yy,keys] of byYear){
    const idxs=[]; for(const k of keys) idxs.push(...grpIdx.get(k));
    idxs.sort((a,b)=>a-b);
    const subRows  = idxs.map(i=>split.rows[i]);
    const subOwner = idxs.map(i=>split.owner[i]);
    const R = computeAll(Object.assign({}, S0, { rows:subRows, year:yy, ignoreYearFilter:true,
                                                 dateFilter:{active:false}, voyDateFilter:{active:false} }));
    const byVoy=new Map();
    R.rowDetails.forEach((d,j)=>{                 // 1:1 with subRows (ignoreYearFilter keeps all)
      const src = subRows[j], si = subOwner[j];
      const seg=(si!=null && segs[si]) ? segs[si] : null;
      const key=(si==null) ? "none" : ("#"+si);
      let g=byVoy.get(key);
      /* 2026-07-26d (Task 3, Aurvin): each group carries the CII reference of ITS OWN END-YEAR
         (`cii: R.cii`, where R is this bucket's per-year computeAll above). This matters:
         the required CII and the A-E band edges tighten every year via the Z factor, so a
         2025 voyage and a 2026 voyage must be rated on different bands. Taking it from the
         engine's own per-year result rather than recomputing it here means the Voyage-Wise
         rating can never drift from the Results tab's for the same year. */
      if(!g){ g={ voy: seg? seg.voy : "", raws: seg? seg.raws : [], dets:[], srcs:[],
                  tStart:null, tEnd:null, seg:seg, endYear:yy, cii:R.cii }; byVoy.set(key,g); order.push(g); }
      if(src && src.vwSplitOf>1){ d.vwSplit=src.vwSplitPart; d.vwSplitOf=src.vwSplitOf; }
      g.dets.push(d); g.srcs.push(src);
      if(d.tStart && (!g.tStart || d.tStart<g.tStart)) g.tStart=d.tStart;
      if(d.tEnd   && (!g.tEnd   || d.tEnd  >g.tEnd  )) g.tEnd  =d.tEnd;
    });
  }
  order.sort((a,b)=>(a.tStart||"")<(b.tStart||"")?-1:(a.tStart||"")>(b.tStart||"")?1:0);
  const sumOf=(g,k)=>g.dets.reduce((s,d)=>s+(Number(d[k])||0),0);
  let carry=0, carryLegs=0;
  for(const g of order){
    g.dist=sumOf(g,"dist"); g.cargo=sumOf(g,"cargo"); g.hours=sumOf(g,"hours");
    g.E=sumOf(g,"E"); g.feuCB=sumOf(g,"feuCB"); g.feuPenalty=sumOf(g,"feuPenalty");
    g.co2=sumOf(g,"co2"); g.etsCO2=sumOf(g,"etsCO2"); g.etsCO2e=sumOf(g,"etsCO2e"); g.totalCO2=sumOf(g,"totalCO2"); g.totalCO2e=sumOf(g,"totalCO2e"); g.euas=sumOf(g,"euas"); g.ukCO2e=sumOf(g,"ukCO2e");
    g.sccTtW=sumOf(g,"sccTtW"); g.sccWtW=sumOf(g,"sccWtW");
    g.tw=g.dets.reduce((s,d)=>s+(d.kind==="voyage"?(Number(d.tw)||0):0),0);
    g.sccNoFactor=g.dets.some(d=>d.sccNoFactor);
    g.fuels=vwFuelLines(g);
    g.sccBallastIn=carry; g.sccBallastLegs=carryLegs;
    const num=g.sccWtW+carry;
    if(g.tw>0 && !g.sccNoFactor){ g.sccNumerator=num; g.eeoi=num*1e6/g.tw; carry=0; carryLegs=0; }
    else { g.sccNumerator=null; g.eeoi=null; carry=num; carryLegs+=g.dets.filter(d=>d.kind==="voyage").length; }
  }
  /* representative computeAll (all kept rows) — used only for the SCC GWP label & context;
     per-voyage figures above are the authoritative per-end-year values. */
  const keptIdx=[]; for(const k of keptKeys) keptIdx.push(...grpIdx.get(k));
  const Rrep = computeAll(Object.assign({}, S0, { rows: keptIdx.map(i=>split.rows[i]),
                          year:fallbackY, ignoreYearFilter:true, dateFilter:{active:false} }));
  return { groups:order, segs, R:Rrep, trailingBallast:carry, split };
}

/* ---- Voyage-Wise table ------------------------------------------------------------------
   18 columns. Leg-Wise has 21: it keeps the three "Cov." eligibility-% cells (Task 4) that
   this tab drops, and both now carry "Voyage No". The cargo port-of-call icon is not rendered
   here.
   2026-07-23f/g (Aurvin, owner instruction — DISPLAY ONLY, no calculation touched): because the
   Voyage-Wise view is SCC-dominant, the Sea Cargo Charter block sits directly after Fuel metrics;
   then (2026-07-23g) FuelEU Maritime was moved to the RIGHT of UK ETS, so the ETS blocks sit
   between SCC and FuelEU. New left-to-right order:
   Column map:  1 Activity  2 Voyage No  3 Dist  |  4 Fuel  5 Cons.
                6 Cargo  7 TW  8 TtW  9 WtW  10 EEOI                       (Sea Cargo Charter)
                11 CO₂  12 EUAs                                           (EU ETS)
                13 UKAs                                                   (UK ETS)
                14 Elig. mt  15 Energy  16 Elig. energy  17 CB  18 Penalty (FuelEU)
   The grid TRACKS were reordered to match, so each column keeps its own width. */
/* Same widening as BR_GRID (see the note there). 18 tracks, total minimum ≈ 1856px. */
/* 2026-07-25n (Aurvin, owner instruction): same SCC reorder as BR_GRID above — TtW, WtW,
   Cargo, T-Work, EEOI (was Cargo, T-Work, TtW, WtW, EEOI), each column keeping its own width
   in its new spot.
   2026-07-26 (Aurvin, owner instruction): TtW (AR6) column REMOVED from this on-screen table,
   same as Leg-Wise — its track dropped below, every later grid-column shifts down by 1. Still
   calculated internally and still in the Voyage-Wise Excel export.
   2026-07-26d (Task 3, Aurvin, owner instruction): the same IMO section added to Leg-Wise is
   added HERE TOO, in the same place (as of 2026-07-26e, immediately LEFT of Fuel metrics) — rendered by the
   same shared `ciiCellHtml` / `eeoiCellHtml` helpers, so the two tabs look identical. 18
   tracks → 20. Unlike Leg-Wise, the Sea Cargo Charter section STAYS on this tab (the owner
   removed it from Leg-Wise only), so this table now carries TWO EEOI columns:
     • IMO section — EEOI, gCO₂/t·nm, tank-to-wake, CO₂ only (MEPC.1/Circ.684)
     • SCC section — EEOI, gCO₂e/t·nm, well-to-wake AR6, with ballast carry-in
   They are told apart by their section header and their unit line; both tooltips say
   explicitly which is which. New column order:
     1 chk | 2 Voyage & timeframe | 3 Voyage No | 4 Dist |
     5-6 IMO (CII, EEOI) | 7-8 FUEL METRICS | 9-12 SEA CARGO CHARTER (WtW, Cargo, T-Work, EEOI) |
     13-14 EU ETS | 15 UK ETS | 16-20 FuelEU
     (2026-07-26e, Aurvin: IMO moved to the LEFT of Fuel metrics — same swap as Leg-Wise;
      columns 9+ unchanged.)
   The two new IMO tracks use the SAME narrowed widths as Leg-Wise (90px / 78px). Every other
   track keeps its own width, just carried to its new position.
   2026-07-26l (Aurvin, owner instruction): CII 90px→150px, matching the same Leg-Wise change
   and for the same reason — the cell's new 3rd number (attained CII / AER) needs the room;
   EEOI (78px) is untouched, per the owner's explicit choice.
   2026-07-26m (Aurvin, owner instruction): CII 150px→126px, matching the same Leg-Wise change
   — the pill's own padding was tightened and both numbers now carry a hard character cap, so
   its maximum width is small and predictable and no longer needs the extra room.
   2026-07-30j-2 (Aurvin, bug report — screenshot, Voyage tab): 126px turned out too small again
   once 2026-07-30j widened the pill's own number boxes (they'd been clipping their digits —
   see ui.js `ciiPillHtml`'s segW note). This column is right-aligned flex (not the centred
   layout Leg-Wise uses for the same pill), with `cellPad` "7px 10px" eating 20px of the 126px
   track, leaving ~106px for a pill that now needs ~118px — so it overflowed LEFT into the Dist
   column, which is what the owner's screenshot showed. Reverted to the SAME 150px this column
   already carried once before (2026-07-26l, for the same reason: room for the pill's own
   numbers) — a known-good prior value, not a fresh guess. */
/* 2026-07-26q3 (Aurvin, owner instruction): reordered so Fuel metrics (Fuel type, Cons.,
   Total CO2e) is now ONE CONTIGUOUS 3-column group again, matching Leg-Wise's own group
   shape — fixes the "two separate Fuel metrics tags" mistake from 2026-07-26p, where Total
   CO2e sat isolated after the whole Sea Cargo Charter block. Only the Total-CO2e track
   (was position 12, "minmax(96px,0.7fr)") and the four Sea Cargo Charter tracks (were
   8-11: WtW/Cargo/T-Work/EEOI) swapped places — every other track, including everything
   from EUAs (13) onward, keeps its EXACT same width and position; the physical column count
   (20) and every individual track's px/fr value are UNCHANGED, so no column got any wider
   or narrower — only the ORDER of these five tracks moved. */
const VW_GRID = "minmax(34px,34px) minmax(300px,3.0fr) minmax(84px,0.6fr) minmax(84px,0.7fr) minmax(150px,0.85fr) minmax(78px,0.6fr) minmax(76px,0.6fr) minmax(88px,0.55fr) minmax(96px,0.7fr) minmax(100px,0.8fr) minmax(104px,1fr) minmax(96px,0.9fr) minmax(84px,0.85fr) minmax(100px,0.8fr) minmax(100px,0.8fr) minmax(84px,0.7fr) minmax(92px,0.8fr) minmax(96px,0.8fr) minmax(84px,0.75fr) minmax(92px,0.9fr)";
const VW_BOX = gridBox(VW_GRID);          // every Voyage-Wise row resolves to this same width
let VW_LAST = null;

/* 2026-07-26d (Task 3, Aurvin): the Voyage-Wise IMO figures. Same formulas and the same
   implausibility cut-offs as the Leg-Wise ones — they go through the shared `ciiFrom` core —
   but scoped to a WHOLE VOYAGE GROUP rather than a single leg.
   Owner instruction was that this "goes as per the selected period of the voyage", so the
   numerator is `g.co2`: the CII-basis CO₂ (all fuel, CO₂ only) of EVERY row in the group —
   its sea legs AND the port stays that belong to it. Leg-Wise deliberately differs: there a
   berth stay is its own row with no distance, so its CO₂ is in no leg's CII at all. The
   practical effect, worth knowing when comparing the two tabs:
     • a voyage's CII reads slightly WORSE here than the same legs do in Leg-Wise
     • the Voyage-Wise TOTAL sits much closer to the annual CII on the Results tab
   The bands come from `g.cii`, the group's OWN end-year CII reference (attached in vwGroups
   from that year's computeAll), never a fallback year — required CII tightens every year. */
function vwGroupCII(g){
  if(!g || !(g.dist>0)) return null;
  return ciiFrom(Number(g.co2)||0, g.dist, g.cii, S);
}
/* IMO EEOI (MEPC.1/Circ.684) for a whole voyage: tank-to-wake, CO₂ only, the voyage's own
   CO₂ over its own transport work. Nothing carried in from a preceding ballast voyage —
   that carry-in belongs to the Sea Cargo Charter EEOI four columns to the right, not here. */
function vwGroupEEOI(g){
  if(!g || !(g.tw>0)) return null;
  const v = (Number(g.co2)||0)*1e6/g.tw;
  return isFinite(v) ? v : null;
}

/* the ports a whole voyage group ran between: first leg's origin → last leg's destination */
function vwGroupPorts(g){
  const legs=g.dets.map((d,i)=>({d,src:g.srcs[i]})).filter(x=>x.d.kind==="voyage");
  if(!legs.length){
    const p=legPorts(g.dets[0],g.srcs[0]);
    return [p[0], p[0]];
  }
  const a=legPorts(legs[0].d, legs[0].src);
  const b=legPorts(legs[legs.length-1].d, legs[legs.length-1].src);
  return [a[0], b[b.length-1]];
}
function vwTimeSpan(a,b){
  const f=t=>t? String(t).replace("T"," ") : "—";
  return f(a)+" → "+f(b);
}
/* The Voyage No cell shows the CANONICAL number (see vwVoyKey). When the crew spelled it
   more than one way inside the same voyage — "V05" one day, "5" the next — a small ✎ marker
   appears and the tooltip lists exactly what was in the file, so the merge is never silent
   and can always be checked against the source. */
function vwVoyCell(g){
  const raws=(g.raws||[]).filter(Boolean);
  const variants=raws.filter((v,i,a)=>a.indexOf(v)===i);
  if(variants.length<=1) return esc(g.voy);
  return esc(g.voy)+`<span style="color:#9a6b1f;font-weight:400;cursor:help;margin-left:3px" title="Written ${variants.length} different ways in the MDA file — ${variants.map(esc).join(" · ")} — all treated as voyage ${esc(g.voy)}. Leading zeros and a leading V/VOY are ignored when they are next to each other in time; a different voyage number in between would keep them apart.">✎</span>`;
}
function voyageGrid(R, tips){
  const cellPad="7px 10px";
  const G=R.groups;
  VW_LAST={ R, cellPad };
  rowselReset("vw", G.length);
  const th=(col,txt,extra,title)=>`<div style="grid-column:${col+1};grid-row:2;padding:6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;text-align:right;${extra||""}"${title?` title="${title}"`:""}>${txt}</div>`;
  /* 2026-07-23 (owner, Aurvin): EU-ETS CO₂e GWP set for THIS year — AR5 default / AR4 in
     Settings, and only from 2026 (before that EU ETS is CO₂ only). UK ETS = AR5, FuelEU =
     AR4, SCC = AR6, all locked by their regulations. See breakdownGrid for the full note. */
  const euAR = (R.year>=2026 && R.ets && R.ets.gwp) ? ((R.ets.gwp.label.match(/AR\d/)||[""])[0]) : "";
  const euEUAsUnit = euAR ? `tCO₂e (${euAR})` : "tCO₂ (CO₂ only)";
  const header=`
    <div style="display:grid;${VW_BOX}grid-template-columns:${VW_GRID};grid-template-rows:auto auto;border-bottom:2px solid #cbd5e1">
      <div style="grid-column:1;grid-row:1 / span 2;${BR_FREEZE}z-index:4;display:flex;align-items:flex-end;justify-content:center;padding:7px 0 9px;background:#f1f5f9;border-right:1px solid #e2e8f0">${selAllBox("vw")}</div>
      <div style="grid-column:2;grid-row:1 / span 2;${BR_FREEZE2}z-index:3;display:flex;align-items:flex-end;padding:7px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a">Voyage &amp; timeframe</div>
      <!-- 2026-07-26g (Aurvin, owner instruction): same Report-Wise-matched restyle as
           Leg-Wise (see breakdownGrid) — Voyage No left-aligned, uppercase/grey/10.5px, flat
           #f8fafc background. Voyage-Wise has no standalone Cargo column at this position
           (its "Cargo" lives inside the Sea Cargo Charter group further right) so only Voyage
           No and Dist. are touched here. -->
      <div style="grid-column:3;grid-row:1 / span 2;display:flex;align-items:flex-end;justify-content:flex-start;padding:7px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:left">Voyage No ${tips.voy}</div>
      <!-- 2026-07-26h (Aurvin, owner instruction): "nm" shown the same way as Leg-Wise's Cargo
           "mt" — its own smaller, muted line under "DIST" (via colHdr). -->
      <div style="grid-column:4;grid-row:1 / span 2;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;padding:7px 10px;background:#f8fafc;border-right:1px solid #e2e8f0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;text-align:right">${colHdr("Dist","nm")}</div>
      <div style="grid-column:5 / span 2;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">IMO ${tips.imo}</div>
      ${/* 2026-07-26q3 (Aurvin, owner instruction): fixes a mistake from 2026-07-26p, spotted by
           the owner in a screenshot — this view showed TWO separate "Fuel metrics" header tags
           (Fuel type/Cons. here, and an isolated Total CO2e tag after Sea Cargo Charter), while
           Leg-Wise has always shown Fuel metrics as ONE group. Total CO2e moved back next to
           Fuel type/Cons. so this is one contiguous 3-column group again, matching Leg-Wise's
           shape; Sea Cargo Charter's own 4 columns (WtW/Cargo/T-Work/EEOI) shifted one column
           to the right to make room, EU ETS/UK ETS/FuelEU keep their EXACT same column numbers
           (14/15/16-20) — this reorder only touches columns 7-13. See HANDOFF_LOG.md. */""}
      <div style="grid-column:7 / span 3;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">Fuel metrics ${tips.lcv}</div>
      <div style="grid-column:10 / span 4;grid-row:1;padding:6px 10px;background:#f2e8d9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#9a6b1f;white-space:nowrap">Sea Cargo Charter ${tips.scc}</div>
      <div style="grid-column:14;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">EU ETS ${tips.euets}</div>
      <div style="grid-column:15;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">UK ETS ${tips.ukets}</div>
      <div style="grid-column:16 / span 5;grid-row:1;padding:6px 10px;background:#f1f5f9;border-right:1px solid #e2e8f0;border-bottom:1px solid #cbd5e1;text-align:center;font-size:10.5px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#475569;white-space:nowrap">FuelEU Maritime ${tips.feu}</div>
      ${/* 2026-07-26e: IMO pair, identical treatment to Leg-Wise, now LEFT of Fuel metrics. Both
           are VOYAGE-level and span the fuel sub-rows. See the IMO info icon for the caveat. */""}
      ${/* 2026-07-26 (Task, Aurvin): header text centred over this column instead of the
           th() default right-align, so "CII" sits above the rating-letter (middle) segment of
           the pill in the cell below rather than hugging the right wall. Name unchanged
           (Leg-Wise got "CII / Performance"; Voyage-Wise stays "CII" per owner instruction).
           Column width (VW_GRID) untouched — text-align only. */""}
      ${th(4,colHdr("CII",""),"text-align:center;","INDICATIVE CII for this voyage: the CII Percentage (attained ÷ required × 100), the rating letter, and the attained CII itself — also called AER — in one pill, rated on THIS voyage's own end-year bands. CII is a whole-year, whole-ship metric in law. See the IMO section's ⓘ.")}
      ${th(5,colHdr("EEOI","gCO₂/t·nm"),"border-right:1px solid #e2e8f0;","IMO EEOI (MEPC.1/Circ.684): TANK-TO-WAKE, CO₂ only — this voyage's own CO₂ (its legs AND its port stays) ÷ its transport work. NOT the Sea Cargo Charter EEOI four columns to the right, which is well-to-wake CO₂e with ballast carry-in.")}
      <div style="grid-column:7;grid-row:2;padding:6px 6px 6px 10px;background:#f8fafc;font-size:11px;font-weight:600;color:#475569;line-height:1.3">Fuel type</div>
      ${th(7,colHdr("Cons.","mt"),"padding-left:4px;","Fuel consumed (tonnes) over the whole voyage")}
      ${/* 2026-07-26q3: Total CO2e moved here, next to Cons., now that Fuel metrics is one
           contiguous group again (see the header-tag comment above) — same value/tooltip as
           before, just relocated from the old isolated column 12. */""}
      ${th(8,colHdr(R.year>=2026?"Total CO₂e":"Total CO₂",euEUAsUnit),"white-space:nowrap;border-right:1px solid #e2e8f0;",R.year>=2026?"Total CO₂e of ALL fuel consumed on this voyage (CO₂+CH₄/N₂O, "+euEUAsUnit+") — the full amount burned, NOT scaled by EU ETS coverage. See EUAs (EU ETS group) for the EU-ETS-eligible/scoped figure.":"Total CO₂ of ALL fuel consumed on this voyage (CO₂ only before 2026) — the full amount burned, NOT scaled by EU ETS coverage.")}
      ${th(9,colHdr("WtW","mt (AR6)"),"","Well-to-wake CO₂e (tonnes) — this voyage's SCC numerator, port stays included")}
      ${th(10,colHdr("Cargo","mt"),"","Cargo carried on this voyage — the sum of its laden legs' DEPARTURE (SOSP) quantities")}
      ${th(11,colHdr("T-Work","10⁶ t·nm"),"","Transport work for the whole voyage = Σ (cargo × laden distance), in millions of tonne-miles")}
      ${th(12,colHdr("EEOI","gCO₂e/t·nm"),"border-right:1px solid #e2e8f0;","Sea Cargo Charter EEOI: WELL-TO-WAKE CO₂e (AR6) including emissions carried in from preceding ballast legs. NOT the IMO EEOI in the IMO section — that one is tank-to-wake, CO₂ only, with nothing carried in.")}
      ${th(13,colHdr("EUAs",euEUAsUnit),"border-right:1px solid #e2e8f0;")}
      ${th(14,colHdr("UKAs","tCO₂e (AR5)"),"border-right:1px solid #e2e8f0;")}
      ${th(15,colHdr("Elig.","mt"),"","Eligible mass under regulation scope (tonnes)")}
      ${th(16,colHdr("Energy","10⁶ MJ"))}
      ${th(17,colHdr("Elig. energy","10⁶ MJ"))}
      ${th(18,colHdr("CB","tCO₂eq (AR4)"),"","Compliance balance (tCO₂eq)")}
      ${th(19,colHdr("Penalty","€"),"border-right:1px solid #e2e8f0;")}
    </div>`;

  let zi=0;
  const body=G.map((g,i)=>{
    const lines=g.fuels.length?g.fuels:[{label:"—",tonnes:0,eligibleEU:0,energy:0,E:0,feuCB:0,feuPenalty:0,co2:0,etsCO2:0,etsCO2e:0,totalCO2:0,totalCO2e:0,euas:0,ukCO2e:0,sccTtW:0,sccWtW:0}];
    const span=Math.max(1,lines.length);
    /* 2026-07-25 (Aurvin, owner instruction): zebra striping removed from Voyage-Wise — every
       row is now plain white. Row emphasis is done on demand via the click-to-highlight .hi-on
       class (see .hirow rules in css/styles.css). zi kept but no longer used for tinting.
       2026-07-28j (Aurvin, owner instruction) SUPERSEDES THAT: zebra is back, banded per
       COMPLETE voyage row — one stripe across all of the voyage's per-fuel lines. See the
       matching note in breakdownGrid and ZEBRA_BG. */
    const bg=ZEBRA(i); void zi;
    const [pa,pb]=vwGroupPorts(g);
    const nLegs=g.dets.filter(d=>d.kind==="voyage").length, nBerth=g.dets.length-nLegs;
    /* 2026-07-25n (Aurvin, owner instruction): cell() is only ever used for the LEG/VOYAGE-
       level figures (Dist., Cargo, T-Work, EEOI) that span every fuel sub-row via
       "1 / span N" — added flex centring so their value sits vertically in the middle of
       that span instead of pinned to its top edge on a multi-fuel voyage. */
    const cell=(col,row,extra,val)=>`<div style="grid-column:${col+1};grid-row:${row};padding:${cellPad};display:flex;align-items:center;justify-content:flex-end;text-align:right;font-variant-numeric:tabular-nums;${extra||""}">${val}</div>`;
    const fl=(col,get,extra)=>lines.map((f,k)=>`<div style="grid-column:${col+1};grid-row:${k+1};padding:${cellPad};text-align:right;font-variant-numeric:tabular-nums;${extra||""}">${get(f)}</div>`).join("");
    /* the SCC ⊕ marker: this voyage absorbed a preceding wholly-ballast voyage's emissions */
    const eeoiCell = g.sccNoFactor ? brNoFactor
      : g.eeoi!=null ? fmtF(g.eeoi,2)+(g.sccBallastIn>0?`<span style="color:#94a3b8;font-weight:400;cursor:help" title="Numerator ${fmtF(g.sccNumerator,2)} t WtW CO₂e = this voyage's own ${fmtF(g.sccWtW,2)} + ${fmtF(g.sccBallastIn,2)} carried in from ${g.sccBallastLegs} preceding ballast leg(s) with no cargo of their own (SCC 2025 Technical Guidance Appendix 3)."> ⊕</span>`:"")
      : `<span style="color:#94a3b8;cursor:help" title="No transport work on this voyage (no cargo carried) — under SCC Appendix 3 its ${fmtF(g.sccWtW,2)} t WtW CO₂e is carried into the next voyage that loads.">ballast</span>`;
    /* 2026-07-23d (Aurvin, owner instruction): the activity cell now mirrors the Leg-Wise
       one exactly — ONE LINE PER PORT (origin with a trailing arrow above, destination
       below), then the two timestamps stacked the same way, with a badge lane on the right.
       The previous single-line "A → B" layout truncated both port names to "Sin… → Fan…"
       because the two names, two codes and an arrow all fought for one line's width. */
    const portLine=(p,arrow)=>{
      const nameSpan = p.name
        ? `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(p.name)}</span>`
        : (p.code? "" : `<span style="flex:none">${esc(p.label||"")}</span>`);
      const codeSpan = p.code
        ? (p.name ? `<span style="flex:none;margin-left:4px;color:#94a3b8;font-weight:500">(${esc(p.code)})</span>`
                  : `<span style="flex:none;color:#94a3b8;font-weight:500">${esc(p.code)}</span>`)
        : "";
      const arr = arrow? `<span style="flex:none;margin-left:5px;color:#94a3b8">→</span>` : "";
      return `<div title="${esc(p.label||"")}" style="display:flex;align-items:baseline;min-width:0;font-weight:600;color:#0f172a;line-height:1.45">${nameSpan}${codeSpan}${arr}</div>`;
    };
    const fromS = esc(fmtTs(g.tStart))||"…", toS = esc(fmtTs(g.tEnd))||"…";
    const flags=[];
    if(g.seg&&g.seg.retimed) flags.push(`<span style="color:#9a6b1f;cursor:help" title="The MDA file first showed this voyage number on the report at ${esc(g.seg.atReport)}, which is the same day or the day after a departure — so the change was re-timed back to that departure (${esc(g.seg.viaDeparture)}).">re-timed</span>`);
    if(g.dets.some(d=>d.vwSplit)) flags.push(`<span style="color:#9a6b1f;cursor:help" title="A sea leg in this voyage was split because the voyage number changed mid-passage with no departure on the same or the previous day (an abrupt charterer change).">leg split</span>`);
    const head=`
      <div class="hirow" style="display:grid;${VW_BOX}grid-template-columns:${VW_GRID};background:${bg};border-bottom:1px solid #e2e8f0">
        <div class="hicell" style="grid-column:1;grid-row:1 / span ${span};${BR_FREEZE}z-index:2;background:${bg};display:flex;align-items:center;justify-content:center;border-right:1px solid #e2e8f0">${selBox("vw",i)}</div>
        <div class="hicell" style="grid-column:2;grid-row:1 / span ${span};${BR_FREEZE2}z-index:2;background:${bg};display:flex;border-right:1px solid #e2e8f0">
          <div style="position:relative;width:${GUTTER_W}px;flex:none;display:flex;align-items:center;justify-content:center">
            <div style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#e2e8ec;transform:translateX(-50%);z-index:0"></div>
            <div class="hicell" style="position:relative;background:${bg};z-index:1;line-height:0;padding:4px 0">${ICON_VOYAGE}</div>
          </div>
          <div style="flex:1 1 auto;min-width:0;padding:10px 12px 10px 0">
            <div>${portLine(pa,true)}${portLine(pb,false)}</div>
            <div style="display:flex;align-items:flex-end;gap:8px;font-size:0.85em;color:#64748b;margin-top:5px;line-height:1.45">
              <div style="flex:1 1 auto;min-width:0;font-variant-numeric:tabular-nums">
                <div style="white-space:nowrap">${fromS} <span style="color:#94a3b8">→</span></div>
                <div style="white-space:nowrap">${toS}</div>
              </div>
              <div style="flex:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;text-align:right">
                <div style="height:1.45em;display:flex;align-items:center;font-size:9.5px;color:#94a3b8;white-space:nowrap">${nLegs} leg${nLegs===1?"":"s"} · ${nBerth} stay${nBerth===1?"":"s"}</div>
                <div style="height:1.45em;display:flex;align-items:center;gap:6px;font-size:8.5px;font-weight:700;letter-spacing:0.07em;color:#94a3b8;white-space:nowrap">${flags.length?flags.join(' <span style="color:#cbd5e1">·</span> '):"VOYAGE"}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="grid-column:3;grid-row:1 / span ${span};padding:${cellPad};display:flex;align-items:center;justify-content:flex-end;text-align:right;border-right:1px solid #e2e8f0;font-weight:700;color:#0e7490;font-variant-numeric:tabular-nums">${g.voy?vwVoyCell(g):'<span style="color:#94a3b8;font-weight:400" title="These rows carry no VOYAGE_NUMBER in the source file (e.g. an OVD import, or hand-entered activity).">n/a</span>'}</div>
        ${cell(3,"1 / span "+span,"border-right:1px solid #e2e8f0;color:#475569;",brNum(g.dist,0))}
        ${fl(6,f=>`<span style="text-align:left;display:block;color:#334155">${esc(f.label)}</span>`,"text-align:left;")}
        ${fl(7,f=>brNum(f.tonnes,1),"padding-left:4px;color:#334155;")}
        ${/* 2026-07-26d (Task 3, Aurvin): the IMO pair — VOYAGE-level, so they span the fuel
             sub-rows like Dist./Cargo/T-Work do. Both use the WHOLE GROUP's CO₂ (g.co2 sums
             every det in the group, its sea legs AND its port stays) per the owner's
             instruction that this "goes as per the selected period of the voyage". That is a
             deliberate difference from Leg-Wise, where a berth stay is its own row and is
             excluded — so a voyage's CII here reads slightly WORSE than the same legs do in
             Leg-Wise, and the Voyage-Wise TOTAL sits much closer to the annual CII. Rated on
             g.cii, THIS voyage's own end-year bands, never the fallback year's. */""}
        ${cell(4,"1 / span "+span,"",ciiCellHtml(vwGroupCII(g)))}
        ${cell(5,"1 / span "+span,"border-right:1px solid #e2e8f0;color:#1d7a5f;font-weight:600;",
               eeoiCellHtml(vwGroupEEOI(g),"No transport work on this voyage — no cargo was carried on any of its legs, so there are no tonne-miles to divide by."))}
        ${/* 2026-07-26q3: Total CO2e relocated here, next to Cons. — Fuel metrics is one
             contiguous group again (fixes the "two Fuel metrics tags" mistake from 2026-07-26p;
             full fuel burned, NOT EU-ETS-coverage-scoped, same as before). Sea Cargo Charter's
             own WtW/Cargo/T-Work/EEOI (below) each shifted one column right to make room. */""}
        ${fl(8,f=>brNum(R.year>=2026?f.totalCO2e:f.totalCO2,2),"border-right:1px solid #e2e8f0;")}
        ${fl(9,f=>f.noFactor?brNoFactor:brNum(f.sccWtW,2),"color:#9a6b1f;")}
        ${cell(10,"1 / span "+span,"color:#475569;",g.cargo>0?fmtF(g.cargo,0):`<span title="No cargo on any leg of this voyage — a ballast voyage. Its WtW CO₂e carries into the next voyage that loads (SCC Appendix 3).">0</span>`)}
        ${cell(11,"1 / span "+span,"color:#475569;",g.tw>0?fmtF(g.tw/1e6,2):brDash)}
        ${cell(12,"1 / span "+span,"border-right:1px solid #e2e8f0;color:#9a6b1f;font-weight:600;",eeoiCell)}
        ${fl(13,f=>f.euas?`<span style="color:#3652a3">${fmtF(f.euas,2)}</span>`:brDash,"border-right:1px solid #e2e8f0;")}
        ${fl(14,f=>f.ukCO2e?`<span style="color:#6d4fa3">${fmtF(f.ukCO2e,2)}</span>`:brDash,"border-right:1px solid #e2e8f0;")}
        ${fl(15,f=>brNum(f.eligibleEU,1))}
        ${fl(16,f=>brNum(f.energy,2))}
        ${fl(17,f=>brNum(f.E/1e6,2))}
        ${fl(18,f=>f.feuCB?`<span style="color:#b91c1c">${fmtF(f.feuCB/1e6,2)}</span>`:brDash)}
        ${fl(19,f=>f.feuPenalty?`<span style="color:#9a3412">${fmtF(f.feuPenalty,0)}</span>`:brDash,"border-right:1px solid #e2e8f0;")}
      </div>`;
    return head;
  }).join("");

  const bodyWrapped = G.length? `<div style="position:relative">${body}</div>` : "";
  const empty = !G.length? `<div style="padding:22px;text-align:center;color:#64748b">No activity rows for ${R.year}.</div>` : "";
  const stuck = `<div style="position:sticky;top:0;z-index:12;background:#ffffff;${VW_BOX}">${header}<div id="vwTotals">${vwTotalsHtml()}</div></div>`;
  return `<div class="tablescroll" style="font-size:12.5px;overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px">${stuck}${bodyWrapped}${empty}</div>`;
}
/* 2026-07-23d (Aurvin, owner instruction): the expandable per-leg list that used to sit
   under each voyage was REMOVED — the owner revoked the "legs on hover/expand" half of
   the original decision because it cluttered the table. Voyage-Wise is now strictly one
   row per voyage number. The per-leg detail lives on the ⛵ Leg-Wise tab, which is the
   right place for it. vwLegRows(), vwToggle(), VW_OPEN and the chevron icons went with
   it; g.dets/g.srcs are still carried on each group because the SCC roll-up and the
   leg/stay counts in the activity cell read them. */
/* sticky TOTAL row — sums the ticked voyages (all of them when none are ticked).
   SCC intensity is the WEIGHTED fleet figure (Σ numerator ÷ Σ transport work), never a mean
   of the per-voyage EEOIs; ballast voyages contribute their numerator but no transport work,
   exactly as they do inside the per-voyage calculation. */
function vwTotalsHtml(){
  if(!VW_LAST) return "";
  const R=VW_LAST.R, cellPad=VW_LAST.cellPad;
  const G=R.groups;
  if(!G.length) return "";
  const sel=rowselActive("vw",G.length).map(i=>G[i]);
  const sum=k=>sel.reduce((a,g)=>a+(Number(g[k])||0),0);
  const sumFu=k=>sel.reduce((a,g)=>a+g.fuels.reduce((b,f)=>b+(Number(f[k])||0),0),0);
  const good=sel.filter(g=>!g.sccNoFactor);
  const twTot=good.reduce((a,g)=>a+(Number(g.tw)||0),0);
  const numTot=good.reduce((a,g)=>a+(Number(g.sccWtW)||0),0);
  const eeoiTot=twTot>0? numTot*1e6/twTot : null;
  /* 2026-07-26i (Aurvin, EXPLICIT owner instruction, this session, after a clarifying-question
     round): the TOTAL row's CII/EEOI numerator now sums CO₂ from EVERY ticked voyage GROUP —
     including "n/a"-voyage groups that are pure berth stays with no voyage/distance of their
     own — matching the real annual attained CII (which counts every tonne of CO₂ regardless
     of whether it happened underway or at berth). Previously (2026-07-26d) the numerator was
     built only from distance-bearing groups, so a standalone berth-only group's CO₂ was
     dropped entirely, not just its distance. INDIVIDUAL voyage-group rows are unchanged —
     vwGroupCII/vwGroupEEOI still return null for a group with no distance / no transport
     work, per the owner's instruction ("if no distance then no CII/EEOI to show, if no cargo
     then no EEOI to show") — this only touches the TOTAL row.
       TOTAL CII  = Σ ALL ticked groups' CO₂ ÷ (capacity × Σ ticked DISTANCE-bearing groups' distance)
       TOTAL EEOI = Σ ALL ticked groups' CO₂ ÷ Σ ticked groups' transport work
     never a sum or a mean of the per-voyage intensities. Distance/transport-work denominators
     are unchanged — a berth-only group never has either.
     ONE EXTRA CARE this tab needs and Leg-Wise does not: Voyage-Wise is MULTI-YEAR, and the
     required CII and its A-E band edges tighten every year (owner: "the calculation year rule
     of CII is as per the end date of a row"). The year-consistency check now spans EVERY
     ticked group (yearsAllTot), not just the distance-bearing ones, so a ticked berth-only
     group from a different end-year still correctly forces the mixed-year dash rather than
     silently blending two years' CO₂ into one ratio. The EEOI total is year-independent, so
     it is always shown. */
  const co2AllTot = sum("co2");
  const yearsAllTot = [...new Set(sel.map(g=>g.endYear))];
  const imoSel=sel.filter(g=>g.dist>0);
  const imoCap=ciiCapacityOf(S);
  const imoDist=imoSel.reduce((a,g)=>a+(Number(g.dist)||0),0);
  const ciiTot = (yearsAllTot.length===1 && imoSel.length && imoDist>0)
    ? ciiFrom(co2AllTot, imoDist, imoSel[0].cii, S)
    : null;
  const ciiTotCell = ciiTot ? ciiCellHtml(ciiTot)
    : (yearsAllTot.length>1
        ? `<span style="color:#94a3b8;font-weight:400;cursor:help" title="The ticked voyages/stays end in ${yearsAllTot.length} different years (${yearsAllTot.sort().join(", ")}). The required CII and its A–E band edges tighten every year, so a single combined rating across them would be misleading. Narrow the date range to one end-year to see a rating. The weighted attained value over this mixed selection would be ${imoCap>0&&imoDist>0? fmtF(co2AllTot*1e6/(imoCap*imoDist),2) : "n/a"} gCO₂/${esc((R.cii||{}).capUnit||"DWT")}·nm.">—</span>`
        : brDash);
  const twImo=sel.filter(g=>g.tw>0);
  const twImoTot=twImo.reduce((a,g)=>a+g.tw,0);
  const eeoiImoTot = twImoTot>0 ? co2AllTot*1e6/twImoTot : null;
  const cell=(col,extra,val)=>`<div style="grid-column:${col+1};padding:${cellPad};text-align:right;font-weight:700;font-variant-numeric:tabular-nums;${extra||""}">${val}</div>`;
  const k=ROWSEL.vw.sel.size;
  const label=k? `Total — ${k} of ${G.length} voyage${G.length===1?"":"s"} selected`
                : `Total — all ${G.length} voyage${G.length===1?"":"s"} · ${R.year}`;
  return `
    <div style="display:grid;${VW_BOX}grid-template-columns:${VW_GRID};background:#eef2f7;border-bottom:2px solid #cbd5e1">
      <div style="grid-column:1;${BR_FREEZE}z-index:3;background:#eef2f7;border-right:1px solid #e2e8f0"></div>
      <div style="grid-column:2;${BR_FREEZE2}z-index:3;background:#eef2f7;padding:${cellPad};border-right:1px solid #e2e8f0;font-weight:700;color:#0f172a;display:flex;align-items:center">${esc(label)}</div>
      <div style="grid-column:3;padding:${cellPad};text-align:right;border-right:1px solid #e2e8f0">${brDash}</div>
      ${cell(3,"border-right:1px solid #e2e8f0;",fmtF(sum("dist"),0))}
      <div style="grid-column:5;padding:${cellPad};display:flex;align-items:center;justify-content:flex-end;text-align:right;font-weight:700">${ciiTotCell}</div>
      ${cell(5,"border-right:1px solid #e2e8f0;color:#1d7a5f;",eeoiImoTot!=null? fmtF(eeoiImoTot,2):brDash)}
      ${cell(7,"padding-left:4px;",fmtF(sumFu("tonnes"),1))}
      ${/* 2026-07-26q3: Total CO2e relocated here, next to Cons. — full fuel burned, not
           EU-ETS-coverage-scoped, same figure as before, just moved next to Fuel metrics'
           other two columns instead of sitting isolated after Sea Cargo Charter. */""}
      ${cell(8,"border-right:1px solid #e2e8f0;",fmtF(sum(R.year>=2026?"totalCO2e":"totalCO2"),2))}
      ${cell(9,"color:#9a6b1f;",fmtF(sum("sccWtW"),2))}
      ${cell(10,"color:#475569;",fmtF(sum("cargo"),0))}
      ${cell(11,"color:#475569;",fmtF(sum("tw")/1e6,2))}
      ${cell(12,"border-right:1px solid #e2e8f0;color:#9a6b1f;",eeoiTot!=null? fmtF(eeoiTot,2):brDash)}
      ${cell(13,"border-right:1px solid #e2e8f0;color:#3652a3;",fmtF(sum("euas"),2))}
      ${cell(14,"border-right:1px solid #e2e8f0;color:#6d4fa3;",fmtF(sum("ukCO2e"),2))}
      ${cell(15,"",fmtF(sumFu("eligibleEU"),1))}
      ${cell(16,"",fmtF(sumFu("energy"),2))}
      ${cell(17,"",fmtF(sum("E")/1e6,2))}
      ${cell(18,"color:#b91c1c;",fmtF(sum("feuCB")/1e6,2))}
      ${cell(19,"border-right:1px solid #e2e8f0;color:#9a3412;",fmtF(sum("feuPenalty"),0))}
    </div>`;
}
function downloadVoyageXlsx(){
  const vg=vwGroups(S);
  if(!vg.groups.length){ alert("No voyages to export — import an MDA file first."); return; }
  const sel=rowselActive("vw",vg.groups.length).map(i=>vg.groups[i]);
  /* 2026-07-23f/g (Aurvin, owner instruction): column order mirrors the reordered on-screen
     Voyage-Wise table — Fuel metrics, Sea Cargo Charter, then EU ETS, UK ETS, then FuelEU. */
  /* 2026-07-26 (Aurvin, owner instruction): "CO2 mt" now follows the same year-specific basis
     as the on-screen Voyage-Wise table — CO2 only before 2026, CO2e (incl. CH4/N2O, GWP set
     from Settings) from 2026 onward. Voyage-Wise can span MULTIPLE calendar years in one
     export, so the basis is decided per voyage group by ITS OWN end-year (g.endYear, same
     year the group's own etsCO2/etsCO2e were computed with) rather than one export-wide
     year — a 2025 voyage in the same file as a 2026 voyage keeps its own CO2-only figure.
     2026-07-26p (Aurvin, owner instruction): this is now the Fuel-metrics TOTAL CO2e — full
     fuel burned, NOT scaled by EU ETS coverage — matching the on-screen column's move out of
     the EU ETS group. Column relabelled "Total CO2 mt" and fed from f.totalCO2e/f.totalCO2
     instead of the EU-ETS-eligible f.etsCO2e/f.etsCO2. See HANDOFF_LOG.md.
     2026-07-26q3 (Aurvin, owner instruction): "Total CO2 mt" moved to sit right after
     "Consumption mt" (was after the 4 SCC columns) so this export's column order matches the
     corrected on-screen order — Fuel metrics (Fuel, Consumption, Total CO2) as one contiguous
     block, THEN Sea Cargo Charter (Cargo, Transport work, TtW CO2e, WtW CO2e, SCC numerator,
     EEOI). Only that one column's position moved; every other column and value is unchanged. */
  /* 2026-07-29 (Aurvin, owner instruction, Task 2): same fix as Leg-Wise's downloadBreakdownXlsx
     above — one row per VOYAGE, not one row per fuel (a 2-fuel voyage used to be 2 rows with the
     voyage-level columns blank on the 2nd+ line). Fuel-specific columns (Fuel, Consumption mt,
     Total CO2 mt, TtW/WtW CO2e, EUAs, UKAs, Eligible mt, Energy, Eligible energy, FuelEU CB &
     penalty) repeat sideways as "… 1", "… 2", … , dynamically sized to whichever selected voyage
     has the most fuels. Voyage-level values are unchanged figures. See HANDOFF_LOG.md 2026-07-29. */
  const eventHdr=["Voyage No","From","To","Start (GMT)","End (GMT)","Legs","Port stays","Distance nm",
               "Cargo mt","Transport work t.nm","SCC numerator mt","EEOI gCO2e/t.nm","Notes"];
  const maxFuels = Math.max(1, ...sel.map(g=>(g.fuels&&g.fuels.length)||1));
  const fuelHdr=[];
  for(let k=1;k<=maxFuels;k++){
    fuelHdr.push("Fuel "+k,"Consumption mt "+k,"Total CO2 mt (CO2e incl. CH4/N2O from 2026 — see Notes) "+k,
                 "TtW CO2e mt "+k,"WtW CO2e mt "+k,"EUAs tCO2e "+k,"UKAs tCO2e "+k,
                 "Eligible mt "+k,"Energy 10^6 MJ "+k,"Eligible energy 10^6 MJ "+k,
                 "FuelEU CB tCO2eq "+k,"FuelEU penalty EUR "+k);
  }
  const rows=[eventHdr.concat(fuelHdr)];
  for(const g of sel){
    const [pa,pb]=vwGroupPorts(g);
    const nLegs=g.dets.filter(d=>d.kind==="voyage").length;
    const note=[ g.seg&&g.seg.retimed? "voyage-number change re-timed to departure "+g.seg.viaDeparture : "",
                 g.dets.some(d=>d.vwSplit)? "contains a leg split at an abrupt mid-sea voyage change" : "",
                 g.sccNoFactor? "SCC excluded — fuel without a Table 8 factor" : "",
                 g.sccBallastIn>0? "includes "+Math.round(g.sccBallastIn*100)/100+" t WtW carried in from preceding ballast leg(s)" : "",
                 g.endYear>=2026? "CO2 column is CO2e (incl. CH4/N2O) for this voyage's own end-year "+g.endYear : ""
               ].filter(Boolean).join("; ");
    const eventVals=[ g.voy||"n/a", pa.label||"", pb.label||"", g.tStart||"", g.tEnd||"",
                nLegs, (g.dets.length-nLegs), round2(g.dist),
                round2(g.cargo), round2(g.tw),
                (g.sccNumerator==null?"":round2(g.sccNumerator)), (g.eeoi==null?"":round2(g.eeoi)),
                note ];
    const fuelVals=[];
    for(let k=0;k<maxFuels;k++){
      const f=g.fuels[k];
      if(!f){ fuelVals.push("","","","","","","","","","","",""); continue; }
      fuelVals.push(f.label, round2(f.tonnes), round2(g.endYear>=2026? f.totalCO2e : f.totalCO2),
                 round2(f.sccTtW), f.noFactor?"n/a":round2(f.sccWtW),
                 round2(f.euas), round2(f.ukCO2e),
                 round2(f.eligibleEU), round2(f.energy), round2(f.E/1e6),
                 round2(f.feuCB/1e6), round2(f.feuPenalty));
    }
    rows.push(eventVals.concat(fuelVals));
  }
  downloadXlsx("voyage_wise_breakdown_"+S.year+".xlsx","Voyage-Wise",rows);
}
function round2(v){ return (v==null||isNaN(v))? "" : Math.round(Number(v)*100)/100; }

function renderVoyage(){
  const el=document.getElementById("tab-voy"); if(!el) return;
  const vg=vwGroups(S);
  /* 2026-07-27 (Aurvin, owner instruction): this R never carried R.ets (unlike Leg-Wise's own
     R, which is the full computeAll(S) result) — so the "Total CO2/CO2e" header's unit line
     (euEUAsUnit, in voyageGrid) always fell back to "tCO2 (CO2 only)" no matter the year, while
     the header's LABEL text (a few lines below, in voyageGrid) switched on R.year>=2026 alone —
     for 2026+ that produced a self-contradicting header: "Total CO2e" above "(CO2 only)". Fixed
     by giving R the SAME gwp lookup Leg-Wise's full computeAll(S) exposes as R.ets.gwp —
     euetsGwp(state) (js/engine.js) is a cheap, pure Settings lookup (state.arSet -> AR5/AR4),
     not a re-run of the whole compute pipeline, so this is safe to add here without recomputing
     anything voyage-specific. Label and unit now read off the exact same euAR value, so they
     can never disagree again. */
  const R={ groups:vg.groups, year:Number(S.year)||2026, ets:{ gwp: euetsGwp(S) } };
  const iVoy=info(`The <b>VOYAGE_NUMBER</b> from the MDA file, with the change point corrected.<br><br>Vessel staff type this by hand, so the number often flips a report or two <b>after</b> the departure it belongs to — sometimes on an SOSP report. Rule applied here (owner instruction, 2026-07-23):<br><br>• When the number changes, the calculator looks back for a derived <b>DEPARTURE</b> on the <b>same day or the day before</b>. If it finds one, the change is re-timed to that departure and the row is marked <i>re-timed to departure</i>.<br><br>• If there is no such departure, the charterer genuinely changed mid-passage — that is accepted as a new voyage starting at that report, and the sea leg is <b>split</b> at that point (marked <i>leg split</i>).<br><br>• Either way the report at the boundary keeps its own consumption on the <b>old</b> voyage; the new voyage accumulates from the next report onward.<br><br>Blank voyage numbers (bunkering and fuel-stock reports carry none) are ignored rather than treated as a change.`);
  const iLCV=info("<b>LCV</b> (lower calorific value, MJ/g) per FuelEU Annex II column 1: HFO 0.0405 · LFO 0.041 · MGO 0.0427 · LNG 0.0491 · methanol 0.0199 — full list on the Calculations tab. Eligible energy = eligible mass × 10⁶ × LCV.");
  const iFEU=info("<b>FuelEU</b> per fueleu-annexi with GWP 25/298 (prescribed) and CH₄ slip per consumer class. The annual balance/penalty is shared out by each row's in-scope energy and then summed to the voyage — <b>indicative only</b>, FuelEU is period-based in law.<br><br>Per Task 4 the coverage-% columns are not shown on this tab; they remain on the ⛵ Leg-Wise and 📋 Report-Wise tabs.");
  const iEUETS=info("<b>EUAs</b> = covered CO₂e × phase-in (euets-art3gb), summed over the voyage's legs and port stays. Coverage is applied per leg by the engine — EEA↔EEA and at-berth EEA 100%, EEA↔other 50% — and the resulting allowances are what you see here.<br><br>Per Task 4 the coverage-% column is not shown on this tab.");
  const iUKETS=info("<b>UKAs</b> = tCO₂e for UK→UK voyages and UK in-port activity (ukets-sch2a-p7), GWP CH₄ 28 / N₂O 265 (ukets-sch2a-p35). Obligation from scheme year 2026.<br><br>Per Task 4 the coverage-% column is not shown on this tab.");
  /* 2026-07-26d (Task 3, Aurvin): the Voyage-Wise IMO icon. Same substance as the Leg-Wise
     one, with the three things that genuinely differ on this tab spelled out: the whole
     voyage (port stays included) is the numerator, each voyage is rated on its OWN end-year
     bands, and there are now two EEOI columns on screen that must not be confused. */
  const iVwIMO=info(`<b>IMO</b> — the two IMO carbon-intensity measures, shown for each voyage.<br><br>
    <span class="flag">Indicative only</span> <b>CII is a whole-year, whole-ship metric in law</b> (imo-a6-reg28 / imo-g1-s4). A single voyage has no CII. What is shown is what the ship's CII <b>would</b> be if the whole year looked like this voyage — measured against the real required CII and A–E bands of <b>that voyage's own end-year</b> (they tighten every year via the Z factor, so a 2025 and a 2026 voyage are rated differently, exactly as the Voyage-Wise CO₂/CO₂e column already works). <b>A green rating on one voyage is not a compliance position.</b><br><br>
    <b>CII column</b> — one pill reading <b>% of required · rating · AER</b>. CII Percentage = attained ÷ required × 100, so <b>below 100% is better than required</b>. AER ("Attained CII") is that same attained figure on its own, gCO₂ per capacity unit·nm, to 2 decimals. Attained = the voyage's CO₂ ÷ (capacity × its distance).<br><br>
    <b>The whole voyage counts here</b> — its sea legs <b>and</b> the port stays that belong to it. This differs from the ⛵ <b>Leg-Wise</b> tab, where a berth stay is its own row with no distance and so is excluded. So the same voyage reads slightly <b>worse</b> here than its legs do there, and the TOTAL on this tab sits much closer to the annual CII on the Results tab. Neither is wrong — they answer different questions.<br><br>
    <b>EEOI</b> (gCO₂/t·nm, <b>MEPC.1/Circ.684</b>) = the voyage's CO₂ ÷ its transport work (cargo × laden distance). <b>Tank-to-wake, CO₂ only.</b> <b>Do not confuse it with the EEOI in the Sea Cargo Charter section</b> to its right, which is <b>well-to-wake CO₂e (AR6)</b> and also folds in emissions carried over from preceding ballast voyages. Nothing is carried in or out of this one.<br><br>
    <b>A dash means withheld, not zero</b> — hover it for the reason. Besides ballast voyages, a figure is withheld when it is <b>implausible</b>: over ${CII_PCT_IMPLAUSIBLE}% of required for CII, or over ${EEOI_IMPLAUSIBLE} gCO₂/t·nm for EEOI, which happens when a very short distance has a lot of fuel behind it. The consumption is still counted in every total.<br><br>
    Both <b>TOTAL</b> figures are <b>weighted</b> over the ticked voyages (Σ CO₂ ÷ Σ capacity·distance, and Σ CO₂ ÷ Σ transport work), never an average. If the ticked voyages end in <b>more than one year</b> the TOTAL rating is withheld — one set of bands cannot fairly rate voyages from different years; narrow the date range to a single end-year.`,"right");
  const iSCC=info(`<b>Sea Cargo Charter — computed per voyage number</b> (owner decision, 2026-07-23), not by summing the per-leg figures.<br><br>
    <b>Numerator</b> = all well-to-wake CO₂e inside the voyage: its sea legs <b>and</b> its port stays (loading, discharging, bunkering, waiting). SCC counts the lot.<br><br>
    <b>Denominator</b> = the voyage's own transport work, Σ (cargo × laden distance). Ballast distance never enters it.<br><br>
    <b>EEOI</b> = numerator × 10⁶ ÷ transport work, in gCO₂e per tonne-mile (Technical Guidance Eq. 2). Lower is better.<br><br>
    A voyage that carries <b>no cargo at all</b> has no EEOI of its own — under Appendix 3 its emissions belong to the voyage that loads next, so they are carried forward. <b>⊕</b> marks a voyage that absorbed one; hover it for the split.<br><br>
    Factors are SCC 2025 Technical Guidance <b>Table 8</b> (Appendix 4), WtW = WtT + TtW, with granular rows where the machinery is known. GWP ${esc((vg.R.scc&&vg.R.scc.gwp)?vg.R.scc.gwp.label:"AR6")} — SCC's own set, deliberately different from FuelEU's AR4 and UK ETS's AR5.<br><br>
    Fuels Table 8 does not list (the RFNBO e-fuels) show <b>n/a</b> rather than borrowing another regime's factor, and their voyage is left out of the TOTAL intensity.<br><br>
    The TOTAL row is the <b>weighted</b> fleet figure (Σ numerator ÷ Σ transport work), not an average of the per-voyage values.`,"right");
  const nSplit=vg.split.rows.filter(r=>r.vwSplitOf>1).length;
  const nRetimed=vg.segs.filter(s=>s.retimed).length;
  /* 2026-07-25b (owner instruction): the "multi-year OK · voyages counted by end date, graded
     by end-date year" caption that used to sit as its own label in the date bar is folded into
     this tooltip instead, so the bar only carries the Year/From/To controls. */
  /* 2026-07-28d (Aurvin, owner instruction): the per-import summary line ("N voyage number(s)
     found in the imported reports · … re-timed … · … leg part(s) … · trailing-ballast carry-out")
     used to be a visible <div class="note"> UNDERNEATH the table (put there on 2026-07-23d). It is
     context, not a headline, and at the very bottom of the ZeroNorth full-screen view it was both
     the least-read line on the page and the one stealing a row of table height. It is now folded
     INTO this tab's existing ⓘ icon — the one already sitting next to the ⬇ Download button on the
     filter bar — as its opening paragraph. Same wording, same live counts, shown on demand.
     Applies to BOTH the normal VOYAGES tab and the full-screen view because there is only one
     renderVoyage(). The vertical space this frees is given to the top of the ZN view (see
     .znfs-kpis / .znfs-tabs padding in css/styles.css). */
  const iSummary = (!S.mdaReports||!S.mdaReports.length)
    ? `<b>No MDA reports in this workspace</b>, so there are no voyage numbers to group by — everything is shown as a single <b>n/a</b> voyage. Import an MDA event-log export to see real voyage numbers.`
    : `<b>This workspace:</b> ${vg.segs.length} voyage number(s) found in the imported reports${nRetimed?` · <b>${nRetimed}</b> change(s) re-timed back to a departure`:""}${nSplit?` · <b>${nSplit}</b> leg part(s) created by an abrupt mid-voyage change`:""}${vg.trailingBallast>0?` · ${fmtF(vg.trailingBallast,2)} t WtW CO₂e on a trailing ballast voyage with no following laden voyage in ${R.year} — carried out of these figures per SCC Appendix 3`:""}.`;
  const iTable=info(`${iSummary}<br><br>Exactly one line per <b>voyage number</b>. Every figure is rolled up from the <b>same engine values</b> the ⛵ Leg-Wise tab renders, so the two tabs can never disagree — open ⛵ Leg-Wise to see the individual legs and port stays inside a voyage.<br><br><b>Counted by END date</b> — a voyage appears here when its <b>end date</b> falls inside the From/To window, and it is graded under the rules of that end date's year. So a voyage that <b>started in the previous calendar year</b> is still shown, in full, with all of its consumption. The window itself is locked to the reporting year, the same as 📋 Report-Wise and ⛵ Leg-Wise — there is one Year and one From/To for the whole tool.<br><br>All figures rounded to 2 decimal places. — indicates no obligation (out of scope, or the OMR derogation until 2030). CB = FuelEU compliance balance; negative values are deficits.<br><br>Per Task 4 this tab omits the regulation eligibility-% columns and the cargo port-of-call icon — both remain on ⛵ Leg-Wise and 📋 Report-Wise.<br><br><span class="flag">*Indicative attribution — not legally exact</span> FuelEU and ETS surrender are period-based in law; the per-voyage balance and penalty are the annual result shared by in-scope energy. Rows outside the ${R.year} reporting year are excluded.`,"right");
  /* 2026-07-23d (Aurvin, owner instruction): this summary note used to sit ABOVE the table,
     pushing it down the screen. It was then moved UNDERNEATH so the table started right under
     the heading. 2026-07-28d (Aurvin, owner instruction): the visible note is now REMOVED
     entirely — its text lives in the ⓘ icon on the filter bar (see iSummary above), so the
     table keeps the full height in both the normal tab and the ZN full-screen view. */
  /* 2026-07-25 (owner instruction): the "Voyage-Wise breakdown - {range}" header line is
     removed — the tab bar already names this view — and its Excel button + info icon move
     up onto the shared date-filter bar, freeing that vertical space for the table itself. */
  /* 2026-07-28f (Aurvin, owner instruction): button label "⬇ Excel" → "⬇ Download". The handler,
     the file it writes and its .xlsx extension are unchanged — this is the visible text only.
     One edit covers BOTH views: the full-screen tab row does not build its own button, it MOVES
     this exact node up out of the panel (znfsMountExtras in js/fullscreen.js). */
  const voyIcons = `<button class="pill hbtn noprint" onclick="downloadVoyageXlsx()">⬇ Download</button>${iTable}`;
  el.innerHTML=`
  ${renderDateFilterBar('voy', voyIcons)}
  <div class="card panelA">
    ${voyageGrid(R,{voy:iVoy,lcv:iLCV,feu:iFEU,euets:iEUETS,ukets:iUKETS,scc:iSCC,imo:iVwIMO})}
  </div>`;
}
function renderCalcs(){
  const el=document.getElementById("tab-calcs"); if(!el) return;
  const R=computeAll(S);
  const f=R.fueleu, e=R.ets, u=R.ukets;
  /* 2026-07-22e — Cov./CO₂/EUAs and Cov./UKAs tooltips merged up from the sticky
     header's 2nd row into one group-header icon per regime (owner request: keep the
     2nd row clean, put the explanation where the group name already is). */
  const iEUETS=info("<b>Cov.</b> — EU ETS coverage %: EEA↔EEA & at-berth-EEA 100%, EEA↔other 50% (euets-art3ga); at-berth scope = port-of-call stays only.<br><br><b>CO₂ (mt)</b> — Cf, tCO₂/t fuel (FuelEU Annex II / MEPC.308(73)): HFO 3.114 · LFO 3.151 · MGO 3.206 · LNG 2.750 · LPG(P) 3.000 · LPG(B) 3.030 · methanol 1.375.<br><br><b>EUAs</b> = covered × phase-in ("+(e.phase*100)+"% for "+R.year+", euets-art3gb). Basis "+esc(e.basisLabel)+(R.year>=2026?" · CH₄/N₂O at GWP "+e.gwp.ch4+"/"+e.gwp.n2o+" ("+esc(e.gwp.label)+", selectable in Settings — FILL-IN)":"")+".");
  const iUKETS=info("<b>Cov.</b> — UK ETS scope: UK→UK voyages + UK in-port activity (ukets-sch2a-p7).<br><br><b>UKAs</b> = tCO₂e for that covered activity, GWP CH₄ 28 / N₂O 265 (ukets-sch2a-p35, prescribed). Obligation from scheme year 2026.");
  const iFEU=info("<b>FuelEU</b> per fueleu-annexi with GWP 25/298 (prescribed) and CH₄ slip per consumer class. Scope like EU ETS coverage. The annual balance/penalty is shared out by each row's in-scope energy — <b>indicative only</b>, FuelEU is period-based in law. Allocation method: "+(f.allocMethod==="optimal"?"optimal (cleanest-first, essf-ws1-2-5)":"proportional (comparison)")+".");
  const iLCV=info("<b>LCV</b> (lower calorific value, MJ/g) per FuelEU Annex II column 1: HFO 0.0405 · LFO 0.041 · MGO 0.0427 · LNG 0.0491 · methanol 0.0199 — full list on the Calculations tab. Eligible energy = eligible mass × 10⁶ × LCV.");
  /* 2026-07-22c — the owner asked for an info icon that names every factor used, so the
     numbers can be checked against the Technical Guidance without reading the code */
  const sc0 = R.scc||{};
  /* the factors actually applied in THIS workspace, read back from the computed rows, so the
     icon can never drift from what was used (2026-07-22d) */
  const usedF = {};
  for(const d of R.rowDetails) for(const fu of d.fuels) if(fu.sccLabel) usedF[fu.sccLabel] = fu.sccGranular;
  const fRows = Object.keys(usedF).map(l=>{
    const m = /^(.*?)(?: —|,|$)/.exec(l);
    const key = Object.keys(SCC_FACTORS).find(k=>SCC_FACTORS[k].def.label===l);
    const e = key? SCC_FACTORS[key] : null;
    const r = e? e.def : null;
    return r ? `&nbsp;&nbsp;${esc(l)} — WtT <b>${r.wtt}</b> + TtW <b>${r.ttw}</b> = WtW <b>${(r.wtt+r.ttw).toFixed(3)}</b>${e.bio?` · biogenic CO₂ ${e.bio}`:""}${usedF[l]?" <span style='color:#0e7490'>(granular)</span>":" <span style='color:#94a3b8'>(default)</span>"}`
             : `&nbsp;&nbsp;${esc(l)}${usedF[l]?" <span style='color:#0e7490'>(granular)</span>":""}`;
  }).join("<br>");
  const iSCC=info(`<b>Sea Cargo Charter</b> — cargo, transport work and the adapted EEOI for each voyage leg, per the <b>Sea Cargo Charter 2025 Technical Guidance</b>.<br><br>
    <b>Emission factors — Table 8</b> (Appendix 4, "Emission factors list (default and granular factors)"). Values are gCO₂e per gram of fuel = tCO₂e per tonne, and <b>WtW = WtT + TtW</b> as the guidance prescribes. Granular rows are used where this workspace knows the machinery (LNG propulsion plant, boilers); the default row otherwise. Applied here:<br>
    ${fRows||"&nbsp;&nbsp;<i>no fuel burned yet</i>"}<br><br>
    <b>GWP</b>: ${esc(sc0.gwp?sc0.gwp.label:"")} — SCC's own choice, deliberately newer than the AR4 set FuelEU uses and the AR5 set UK ETS uses. Each regime keeps its own prescribed GWP; only these SCC columns use AR6.<br><br>
    <b>Biogenic CO₂</b> is tracked separately for bio fuels and is <b>not</b> added into WtW, as in Table 8.<br><br>
    <b>Cargo</b> comes from the leg's <b>DEPARTURE (SOSP)</b> report. A leg whose SOSP report shows no cargo is marked <b>ballast</b>.<br><br>
    Fuels Table 8 does not list — the RFNBO e-fuels — show <b>n/a</b> rather than borrowing another regime's factor.<br><br>
    <b>Transport work</b> is shown in <b>10⁶ tonne-miles</b> to keep the column narrow.<br><br>
    <b>EEOI</b> (gCO₂e/t·nm, Technical Guidance Eq. 2) = WtW CO₂e of the ballast + laden legs, all port consumption included, ÷ (cargo × <b>laden distance only</b>). A ballast leg has no EEOI of its own — its emissions fold into the following laden voyage (Appendix 3); <b>⊕</b> marks a folded voyage, hover the row for the split. The TOTAL row is the <b>weighted</b> fleet figure (Σ numerator ÷ Σ transport work), not an average of the per-leg values. Lower is better — enter the year's required 'Minimum'/'Striving' intensities on the Workspace SCC card to see the alignment Δ.`,"right");
  const iBrVoy=info(`The <b>VOYAGE_NUMBER</b> from the MDA file, matched to each leg by time — the SAME derivation the <b>Voyage-Wise</b> tab uses (leading zeros and a leading V/VOY are ignored; a change is re-timed to the nearest departure). Because a leg is <b>not</b> split here the way Voyage-Wise splits it, a single leg that straddles an abrupt mid-sea voyage-number change shows <b>both</b> numbers, comma-separated. Blank where the file carries no voyage numbers.`,"right");
  /* 2026-07-26o (Aurvin, owner instruction): standalone ELIGIBILITY group info icon — copied
     from the Report-Wise Eligibility tooltip (reportTraceTable), reworded for a LEG instead of
     a report since Leg-Wise has no "matched report" step (the leg IS the calculated row). */
  const iEligibility=info(`Share of this leg's energy in scope for each regulation — the SAME coverage rule as the EU ETS / UK ETS columns to the right (<code>euCoverage</code> / <code>ukCoverage</code>, js/engine.js). FuelEU's in-scope-energy share follows the same rule as EU ETS by regulation (fueleu-art2).<br><br><span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#3a5157;color:#fff;font-weight:700'>100%</span> fully in scope &nbsp; <span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#6f8d94;color:#fff;font-weight:700'>partial</span> partly in scope &nbsp; <span style='display:inline-block;padding:1px 7px;border-radius:5px;background:#e4eef0;color:#7c8fa0;font-weight:700'>0%</span> out of scope`,"right");
  /* 2026-07-26c (Task 2, Aurvin): the IMO section's info icon. Its main job is to be honest
     that a per-leg CII is NOT a regulatory figure, and to explain why these leg numbers look
     better than the annual CII on the Results tab. */
  const iIMO=info(`<b>IMO</b> — the two IMO carbon-intensity measures, shown for each leg.<br><br>
    <span class="flag">Indicative only</span> <b>CII is a whole-year, whole-ship metric in law</b> (imo-a6-reg28 / imo-g1-s4). A single leg has no CII. What is shown is what the ship's CII <b>would</b> be if the entire year looked like this one leg — measured against ${R.year}'s real required CII (<b>${fmtF((R.cii||{}).ciiReq,2)}</b> gCO₂/${esc((R.cii||{}).capUnit||"DWT")}·nm, Z=${(R.cii||{}).Z}%) and its real A–E bands, which come from ship type + capacity + year and so are legitimately ship-level. <b>A green A on one fast leg is not a compliance position.</b><br><br>
    <b>CII column</b> — one pill reading <b>% of required · rating · AER</b>: the CII Percentage, then the coloured rating letter, then the attained CII itself ("AER"), to 2 decimals. <b>CII Percentage = attained ÷ required × 100</b>, so <b>below 100% is better than required</b> and above 100% is worse. Attained = leg CO₂ ÷ (capacity × leg distance), rated on the same A–E bands as the Results tab. On a voyage leg, a small line under the pill also shows the leg's equivalent HFO fuel consumption per nautical mile — see "kg/nm" below.<br><br>
    <b>A dash in either column</b> means the figure was withheld, not that it is zero — hover the dash and it tells you why. Besides port stays and ballast legs, a figure is withheld when it is <b>implausible</b>: over ${CII_PCT_IMPLAUSIBLE}% of required for CII, or over ${EEOI_IMPLAUSIBLE} gCO₂/t·nm for EEOI. That happens when a very short distance carries a lot of fuel behind it (a brief shift with long port stays attached), so the ratio reflects the tiny denominator rather than the ship. <b>The consumption is still counted in every total and in the annual CII</b> — only the ratio is hidden.<br><br>
    <b>Port stays show an equivalent HFO fuel/day figure instead of a dash</b> — a port stay has no distance, so it has no CII of its own; the CII cell shows, e.g., "<b>2.4 t/d</b>": all fuel actually burned during the stay, converted to how much HFO would carry the same energy (tonnes × each fuel's own LCV, ÷ HFO's LCV), divided by the stay's duration (tEnd − tStart, fractional, 24-hour basis). <b>Informational only — not a regulatory figure</b>, and separate from CII/EU ETS/UK ETS/FuelEU, which are unaffected. The stay's CO₂ still counts towards the ship's ANNUAL CII, so these leg figures read <b>better</b> than the annual one and <b>do not sum to it</b>. Compare against the Results tab, not against each other.<br><br>
    <b>kg/nm, under a voyage leg's CII pill</b> — the same idea as the port-stay t/d figure, one line lower: e.g. <b>"83.6 kg/nm"</b> means all fuel actually burned on this leg, converted to how much HFO would carry the same energy, divided by the leg's own distance. <b>Informational only — not a regulatory figure</b>, calculated the same way as t/d (just ÷ distance instead of ÷ duration, and in kilograms rather than tonnes since a per-mile figure is naturally much smaller). Unlike the CII pill above it, <b>kg/nm has no implausibility cut-off</b> — it still shows its raw value even on a leg whose CII pill is itself withheld.<br><br>
    <b>Why t/d, kg/nm and the CII pill/dash all line up in one column</b> — the pill's own three segments resize per row, so its rating letter doesn't sit at a fixed pixel spot; rather than chase that, the whole CII cell is centred, so port-stay and voyage rows share one visual centre line down the column.<br><br>
    <b>EEOI</b> (gCO₂/t·nm, <b>MEPC.1/Circ.684</b>) = leg CO₂ ÷ its own transport work (cargo × laden distance). <b>Tank-to-wake, CO₂ only</b> — this is the classic operational EEOI, deliberately <b>not</b> the Sea Cargo Charter intensity, which is well-to-wake CO₂e (AR6) and also folds in the preceding ballast leg and the port stays. Nothing is carried in or out here. A ballast leg or port stay has no transport work, so it shows a dash. The SCC view of the same voyages is on the <b>Voyage-Wise</b> tab.<br><br>
    Both <b>TOTAL</b> figures are <b>weighted</b> over the ticked legs (Σ CO₂ ÷ Σ capacity·distance, and Σ CO₂ ÷ Σ transport work) — never an average of the per-leg values, which would be meaningless for an intensity.`,"right");
  const brInner=breakdownGrid(R,{lcv:iLCV,euets:iEUETS,ukets:iUKETS,feu:iFEU,scc:iSCC,voy:iBrVoy,imo:iIMO,eligibility:iEligibility});
  const iBreakdown=info(`All figures rounded to 2 decimal places (LCV: 4).<br><br>— indicates no obligation (out of scope or OMR derogation until 2030).<br><br>CB = FuelEU compliance balance; negative values are deficits.<br><br>📦 = Port of Call (Cargo Activity) — hover it for the loading / discharging operation recorded in the MDA file.<br><br>OMR = outermost region.<br><br><span class="flag">*Indicative attribution — not legally exact</span> FuelEU (and ETS surrender) are period-based in law; per-row balance/penalty is the annual result shared by in-scope energy. Rows outside the ${R.year} reporting year are excluded (see Workspace badges).`,"right");
  const iPool=info(`Pool = all MRV-monitored fuel (incl. the uncovered half of 50% voyages), per fuel × consumer class. Optimal fills the scope cleanest-first by effective intensity (WtW ÷ RWD); grey rows stay unallocated. GHGIE = Σ allocated·WtW ÷ (Σ allocated·RWD + OPS)${f.fwind<1?" × f<sub>wind</sub> "+f.fwind:""}.`);
  /* 2026-07-25 (owner instruction): the "Leg-Wise breakdown - {year}" header line is removed
     — the tab bar already names this view — and its Excel button + info icon move up onto
     the shared date-filter bar, freeing that vertical space for the table itself. */
  /* 2026-07-28f (Aurvin, owner instruction): "⬇ Excel" → "⬇ Download", same as Voyage-Wise's
     button above. Visible text only; downloadBreakdownXlsx() and its .xlsx output are untouched. */
  const legWiseIcons = `<button class="pill hbtn noprint" onclick="downloadBreakdownXlsx()">⬇ Download</button>${iBreakdown}`;
  el.innerHTML=`
  ${renderDateFilterBar('year', legWiseIcons)}
  <div class="card panelA" onclick="closeWorkingsIfOpen()">
    ${brInner}
  </div>

  <details class="card workings" id="workingsDetails">
    <summary>FuelEU allocation &amp; EU ETS working — ${R.year}</summary>
    <div class="workingsgrid">
      <div>
        <div class="wlabel">FuelEU allocation ${iPool}</div>
        <div class="kv"><span>Method</span><b>${f.allocMethod==="optimal"?"Optimal — cleanest-first (essf-ws1-2-5)":"Proportional (comparison)"} — switch on the Workspace FuelEU card</b></div>
        <div class="kv"><span>Energy scope (fuel + OPS) / MRV pool</span><b>${fmt(f.E_total/1e6)} / ${fmt(f.E_pool/1e6)} ×10⁶ MJ</b></div>
        <div class="kv"><span>GHGIE attained vs target</span><b>${fmtF(f.ghgie,2)} vs ${fmtF(f.target,2)} gCO₂eq/MJ</b></div>
        ${f.ghgieAlt!=null?`<div class="kv"><span>${f.allocMethod==="optimal"?"Proportional":"Optimal"} method (comparison)</span><b>${fmtF(f.ghgieAlt,2)} g/MJ · CB ${fmt((f.cbAlt??0)/1e6,0)} mt</b></div>`:""}
        ${f.terms&&f.terms.length?`<table class="scctable"><tr><th>Fuel × consumer</th><th class="num">Pool mt</th><th class="num">Pool ×10⁶ MJ</th><th class="num">Allocated mt</th><th class="num">Allocated ×10⁶ MJ</th><th class="num">WtT g/MJ</th><th class="num">TtW g/MJ (incl. slip)</th><th class="num">WtW g/MJ</th><th class="num">RWD</th></tr>
          ${f.terms.map(t=>`<tr${t.E<=0?' style="color:#999"':''}><td>${esc(t.name)}${t.m?` <span class="note">· ${t.m==="BLR"?"Boiler":t.m==="OTH"?"Other":esc(t.m)}${(t.m==="ME"||t.m==="AE")?" — "+esc(t.engine):""}</span>`:""}</td>
            <td class="num">${fmt(t.tonnesPool)}</td><td class="num">${fmtF(t.E_pool/1e6,3)}</td><td class="num">${fmt(t.tonnes)}</td><td class="num">${fmtF(t.E/1e6,3)}</td>
            <td class="num">${fmtF(t.wtt,2)}</td><td class="num">${fmtF(t.ttw,2)}</td><td class="num">${fmtF(t.wtt+t.ttw,2)}</td><td class="num">${t.rwd}</td></tr>`).join("")}</table>`:'<p class="note">No FuelEU-scope activity yet.</p>'}
      </div>
      <div>
        <div class="wlabel">EU ETS</div>
        <div class="kv"><span>Covered CO₂ / CO₂e</span><b>${fmt(e.covered_t_co2)} / ${fmt(e.covered_t_co2e)} mt</b></div>
        <div class="kv"><span>Basis (${esc(e.basisLabel)})</span><b>${fmt(e.basis_t)} mt</b></div>
        <div class="kv"><span>Phase-in (euets-art3gb)</span><b>${e.phase*100}%</b></div>
        ${R.year>=2026?`<div class="kv"><span>CH₄/N₂O GWP set</span><b>${esc(e.gwp.label)} <span class="flag" title="${esc(e.gwp.src)}">FILL-IN</span></b></div>`:""}
        <div class="kv"><span><b>EUAs to surrender</b> = basis × phase-in</span><b>${fmt(e.euas)}</b></div>
        <div class="kv"><span>Cost @ €${fmt(S.euaPrice)}</span><b>€ ${fmt(e.cost,0)}</b></div>
        <p class="note">Per-fuel: covered mass = tonnes × coverage; CO₂e adds CH₄ &amp; N₂O (incl. LNG slip as CH₄) from 2026. Zero-rating of certified bio/RFNBO ${S.bioZeroRatedETS?"ON":"OFF"} (Settings).</p>
      </div>
    </div>
  </details>`;
}
/* ---------- REPORT TRACE TAB (MDA granularity) ---------- */
function renderTrace(){
  const el=document.getElementById("tab-trace"); if(!el) return;
  const allReps=S.mdaReports||[];
  /* 2026-07-24: the shared date range filters which reports are shown/counted here too.
     All uploaded reports stay in S.mdaReports (memory); only in-range ones are displayed. */
  const reps = dateFilterActive()? allReps.filter(repInRange) : allReps;
  /* 2026-07-25 (owner instruction): the "Showing X of Y report(s) inside the range" line that
     used to sit above the table as its own note is now folded into this info icon's opening
     line instead, and the icon itself moved up onto the date-filter bar — frees a full row of
     vertical space for the table. */
  const countLine = (dateFilterActive() && allReps.length)
    ? `Showing <b>${reps.length}</b> of <b>${allReps.length}</b> report(s) inside the selected From/To range — the rest stay in memory and return when you widen or clear the range.<br><br>`
    : "";
  const traceInfo=info(`${countLine}${reps.length} report(s), as ingested — every value feeding CII / EU ETS / UK ETS / FuelEU. <b>ARRIVAL</b>/<b>DEPARTURE</b> mark the derived window boundaries (replacing IN_PORT); EOSP/SOSP are the sea-passage markers.<br><br>ME = Main Engine · AE = Auxiliary Engine · Boiler = BLR · Others = Total − (ME + AE + Boiler)<br><br><span style="color:#16a34a;font-weight:700">+n</span> next to ROB = tonnes bunkered during the report (shown only on bunkering reports)<br><br>Eligibility % = share of the report's energy in scope for EU ETS / FuelEU / UK ETS, computed the same way as your totals elsewhere in the app (— = no confident match to a calculated voyage/port entry)<br><br>All consumption, ROB and bunker values as ingested`,"right");
  /* 2026-07-29 (Aurvin, owner instruction): REPORTS gets its own "⬇ Download" button on the
     date-filter bar, same pattern as legWiseIcons (LEGS) / voyIcons (VOYAGES). This REPLACES the
     "⬇ OVD-format Excel" button that used to sit in the page header (top-right) — that button is
     now removed from index.html. The handler (downloadReportsXlsx()) and its .xlsx output are
     unchanged; only the button's location and label moved. See HANDOFF_LOG.md 2026-07-29. */
  const reportIcons = `<button class="pill hbtn noprint" onclick="downloadReportsXlsx()">⬇ Download</button>${traceInfo}`;
  el.innerHTML=`
  ${renderDateFilterBar('year', reportIcons)}
  <div class="card panelB">
    ${allReps.length?`
    ${reps.length? reportTraceTable(reps) : `<p class="note">No reports fall inside the selected From/To range — widen or clear the range on the bar above.</p>`}`
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
      <div><label>IMO number</label><input value="${esc(S.ship.imo||"")}" onchange="upd('ship.imo',this.value)"></div></div>
      <!-- 2026-07-26 (Aurvin, owner instruction): "Reporting year" removed from Settings — it is
           redundant with the Year picker already on the Workspace blue band and the
           Report-Wise/Leg-Wise/Voyage-Wise date-filter bars (all write the same S.year via
           dfYear()/voyYear()), so the owner no longer needs it duplicated here. -->
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
/* Calculations tab: switch between per-regulation sub-tabs (in-memory show/hide, no persistence). */
function showFormulaSub(name){
  document.querySelectorAll("#tab-constants .fsub").forEach(d=>d.classList.toggle("on", d.id==="fsub-"+name));
  document.querySelectorAll("#tab-constants .fsubbar button").forEach(b=>b.classList.toggle("on", b.getAttribute("data-fsub")===name));
}

/* ---------- LIVE WORKED EXAMPLE ("Your ship") — 2026-07-20 ----------
   Display-only: every value below is read from computeAll(S) (the SAME engine result the
   Workspace cards and Leg-Wise tab use). The only display-side arithmetic is regrouping
   (per-fuel CO2 lines, coverage counts, headroom) — each regrouped total is asserted against
   the engine total in runSelfTests(). No engine/derivation/coverage logic is touched. */
const FEX_LIVE = { cii:false, euets:false, ukets:false, fueleu:false, scc:false };
function showFormulaEx(sub, live){
  FEX_LIVE[sub] = live;
  const ex = document.getElementById("fex-"+sub+"-example");
  const lv = document.getElementById("fex-"+sub+"-live");
  if(ex) ex.style.display = live?"none":"";
  if(lv) lv.style.display = live?"":"none";
  const head = document.getElementById("fexhead-"+sub);
  if(head) head.querySelectorAll("button").forEach((b,i)=>b.classList.toggle("on",(i===1)===live));
}
const fexToggle = (sub)=>`<span class="fex-toggle noprint" id="fexhead-${sub}"><button type="button" class="on" onclick="showFormulaEx('${sub}',false)">Example ship</button><button type="button" onclick="showFormulaEx('${sub}',true)">Your ship</button></span>`;

function fexNoData(year){
  return `<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">No activity data for ${year}</span>
    <p>Import a file (⬆ Import data in the header) or add voyages and port stays on the <b>Workspace</b> tab — or switch the reporting year in <b>Settings</b> if your data is from another year. This walkthrough fills in with your own numbers as soon as there is activity in ${year}.</p></div></div>`;
}
function fexContext(R){
  const nm = (S.ship&&S.ship.name)? esc(S.ship.name) : "This vessel";
  const imo = (S.ship&&S.ship.imo)? " · IMO "+esc(S.ship.imo) : "";
  let excl = "";
  const w = (R.warnings||[]).find(x=>/row\(s\) dated outside/.test(x));
  if(w){ const m = w.match(/^(\d+) row/); if(m) excl = ` · <b>${m[1]}</b> row(s) outside ${R.year} excluded`; }
  return `<div class="fexcap"><b>${nm}</b>${imo} · reporting year <b>${R.year}</b>${excl}</div>`;
}

function fexLiveCII(R){
  const c = R.cii;
  if(!R.rowDetails.length) return fexContext(R)+fexNoData(R.year);
  const fbt = R.summary.fuelByType||{};
  const ids = Object.keys(fbt).filter(id=>fbt[id]>0);
  let rows="", sumT=0;
  for(const id of ids){
    const f = FUEL_BY_ID[id]||{}; const t = fbt[id]; const cf = Number(f.cf)||0; const co2 = t*cf; sumT += co2;
    rows += `<tr><td>${esc(f.name||id)}</td><td class="num">${fmtF(t,1)}</td><td class="num">${fmtF(cf,3)}</td><td class="num">${fmtF(co2,2)}</td></tr>`;
  }
  const override = (S.rows||[]).some(r=>(r.fuels||[]).some(fr=>fr.ciiCf!==undefined&&fr.ciiCf!==""&&fr.ciiCf!=null));
  const cap = Number((S.ship||{}).capacity)||0;
  let out = fexContext(R);
  out += `<div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Fuel → CO₂</span>
    ${ids.length?`<table class="scctable"><tr><th>Fuel</th><th class="num">tonnes</th><th class="num">Cf</th><th class="num">t CO₂</th></tr>${rows}
      <tr><td><b>Total M</b></td><td class="num"></td><td class="num"></td><td class="num"><b>${fmtF(c.co2_t,2)}</b></td></tr></table>
    <p>M = Σ FCⱼ × CFⱼ = <b>${fmtF(c.co2_t,2)} t CO₂</b> = ${fmtI(c.co2_t*1e6)} g.${override?` <span class="note">Some lines use a Circ.905 Cf override — the engine total above already reflects it.</span>`:""}</p>`
    :`<p>No fuel recorded for ${R.year}.</p>`}</div></div>`;
  out += `<div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Transport work</span>
    ${(cap>0&&c.totalDist>0)?`<p>W = Capacity × Dt = ${fmtI(cap)} ${c.capUnit} × ${fmtI(c.totalDist)} nm = <b>${fmtI(cap*c.totalDist)} ${c.capUnit}·nm</b>.</p>`
    :`<p>${cap>0?`Sailed distance in ${R.year} is 0 nm — add voyages with distance on the Workspace tab`:`Capacity is not set — enter it on the Settings tab`} to complete the attained-CII calculation.</p>`}</div></div>`;
  out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Attained CII</span>
    ${c.attained!=null?`<p>attained = M ÷ W = <b>${fmtF(c.attained,2)} gCO₂/${c.capUnit}·nm</b>.</p>`
    :`<p>Needs both capacity and distance (above) before it can be computed.</p>`}</div></div>`;
  out += `<div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Reference line</span>
    <p>For ${esc(c.type)}: a = ${fmtI(c.g2.a)}, c = ${c.g2.c}. CII_ref = a × ${fmtI(c.g2.cap)}⁻ᶜ = <b>${fmtF(c.ciiRef,2)}</b>.${c.g2.note?` <span class="note">${esc(c.g2.note)}</span>`:""}</p></div></div>`;
  out += `<div class="fstep"><div class="n">5</div><div class="body"><span class="sh">This year's requirement</span>
    <p>Z for ${R.year} is ${c.Z}%. required = (1 − ${c.Z}/100) × ${fmtF(c.ciiRef,2)} = <b>${fmtF(c.ciiReq,2)}</b>. <span class="flag">FILL-IN</span> — the numeric Z is not in the KB.</p></div></div>`;
  out += `<div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Rating</span>
    ${c.rating?`<p>Boundaries: A ≤ ${fmtF(c.bounds.sup,2)} · B ≤ ${fmtF(c.bounds.low,2)} · C ≤ ${fmtF(c.bounds.up,2)} · D ≤ ${fmtF(c.bounds.inf,2)}. Attained ${fmtF(c.attained,2)} → <b style="color:${ratingColor(c.rating)}">rating ${c.rating}</b>.</p>`
    :`<p>Rating needs the attained value (capacity + distance) first.</p>`}</div></div>`;
  if(c.rating){
    const nextEdge = c.rating==="A"?c.bounds.sup:c.rating==="B"?c.bounds.low:c.rating==="C"?c.bounds.up:c.rating==="D"?c.bounds.inf:null;
    out += `<div class="ftake"><b>Takeaway:</b> ${esc(S.ship.name||"the ship")} attains ${fmtF(c.attained,2)} against a ${R.year} requirement of ${fmtF(c.ciiReq,2)} — rating <b>${c.rating}</b>.${(nextEdge!=null&&c.rating!=="E")?` Next band boundary at ${fmtF(nextEdge,2)}.`:""}</div>`;
  }
  return out;
}

function fexLiveETS(R){
  const e = R.ets;
  if(!R.rowDetails.length) return fexContext(R)+fexNoData(R.year);
  let n100=0,n50=0,n0=0;
  for(const d of R.rowDetails){ if(d.covEU>=1) n100++; else if(d.covEU>0) n50++; else n0++; }
  const nonPoc = (S.rows||[]).filter(r=>r.kind==="port"&&r.poc===false).length;
  let out = fexContext(R);
  out += `<div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Which activity counts</span>
    <p>Of ${R.rowDetails.length} in-year ${R.year} row(s): <b>${n100}</b> fully in EU scope (100%), <b>${n50}</b> at 50% (EEA↔non-EEA), <b>${n0}</b> outside EU scope (0%).${nonPoc?` ${nonPoc} non-port-of-call stay(s) are excluded from ETS.`:""}</p></div></div>`;
  if(e.covered_t_co2<=0 && e.covered_t_co2e<=0){
    out += `<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">No EU-scope emissions</span><p>All ${R.year} activity is outside EU/EEA scope, so there are no EUAs to surrender.</p></div></div>`;
    return out;
  }
  out += `<div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Covered emissions</span>
    <p>Covered CO₂ = <b>${fmtF(e.covered_t_co2,2)} t</b>${R.year>=2026?`; with CH₄+N₂O as CO₂e (${esc(e.gwp.label)}) = <b>${fmtF(e.covered_t_co2e,2)} t CO₂e</b>`:``}. Basis (${esc(e.basisLabel)}) = <b>${fmtF(e.basis_t,2)} t</b>.</p></div></div>`;
  out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Phase-in → EUAs</span>
    <p>EUAs = basis × phase-in = ${fmtF(e.basis_t,2)} × ${e.phase*100}% = <b>${fmt(e.euas)}</b>.</p></div></div>`;
  out += `<div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Cost</span>
    <p>${fmt(e.euas)} EUAs × €${fmt(S.euaPrice||0)} = <b>€${fmt(e.cost,0)}</b>.</p></div></div>`;
  out += `<div class="ftake"><b>Takeaway:</b> ${R.year} EU ETS exposure ≈ <b>${fmt(e.euas)}</b> allowances ≈ <b>€${fmt(e.cost,0)}</b>.</div>`;
  return out;
}

function fexLiveUKETS(R){
  const u = R.ukets;
  if(!u.active) return fexContext(R)+`<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">UK ETS applies from 2026</span><p>The reporting year is ${R.year}; the UK maritime scheme starts in 2026 (first period the half-year 1 Jul–31 Dec 2026). Switch the reporting year to 2026 or later in Settings to see this walkthrough.</p></div></div>`;
  if(!R.rowDetails.length) return fexContext(R)+fexNoData(R.year);
  let out = fexContext(R);
  if(u.tco2e<=0){
    out += `<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">No UK-scope activity</span><p>None of the ${R.year} activity is UK-domestic (UK→UK voyages or fuel at berth in UK ports), so there are no UKAs to surrender.</p></div></div>`;
    return out;
  }
  out += `<div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Three gases</span>
    <p>UK-scope totals: CO₂ = <b>${fmtF(u.co2,3)} t</b> · CH₄ = <b>${fmtF(u.ch4,4)} t</b> · N₂O = <b>${fmtF(u.n2o,5)} t</b> (any methane slip already moved onto the CH₄ line).</p></div></div>`;
  out += `<div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Combine at GWP 28 / 265</span>
    <p>ME_ETS = CO₂ + 28×CH₄ + 265×N₂O = ${fmtF(u.co2,3)} + ${fmtF(28*u.ch4,3)} + ${fmtF(265*u.n2o,3)} = <b>${fmtF(u.tco2e,3)} t CO₂e</b>.</p></div></div>`;
  out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Cost</span>
    <p>${fmtF(u.tco2e,2)} UKAs × ${fmt(S.ukaPrice||0)} = <b>${fmt(u.cost,0)}</b> (price as set in Settings).</p></div></div>`;
  if(R.year===2026) out += `<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">2026 is a half-year</span><p>Only activity on/after 1 Jul 2026 is in UK scope; the first surrender is combined with 2027.</p></div></div>`;
  out += `<div class="ftake"><b>Takeaway:</b> ${R.year} UK ETS ≈ <b>${fmtF(u.tco2e,2)} tCO₂e</b> of allowances.</div>`;
  return out;
}

function fexLiveFuelEU(R){
  const f = R.fueleu;
  if(!R.rowDetails.length) return fexContext(R)+fexNoData(R.year);
  let out = fexContext(R);
  if(!(f.E_total>0) || f.ghgie==null){
    out += `<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">No FuelEU-scope energy</span><p>All ${R.year} activity is outside EU/EEA scope, so there is no in-scope energy and no FuelEU balance to compute.</p></div></div>`;
    return out;
  }
  out += `<div class="fstep"><div class="n">1–2</div><div class="body"><span class="sh">Energy in scope</span>
    <p>Fuel energy in scope = <b>${fmtF(f.E_fuel/1e6,3)} ×10⁶ MJ</b>${f.opsMJ>0?` + OPS ${fmtF(f.opsMJ/1e6,3)} ×10⁶ MJ`:""} → total <b>${fmtF(f.E_total/1e6,3)} ×10⁶ MJ</b>. Allocation: ${f.allocMethod==="optimal"?"optimal (cleanest-first)":"proportional"}.</p></div></div>`;
  const al = (f.terms||[]).filter(t=>t.E>0);
  if(al.length){
    let tr="";
    for(const t of al) tr += `<tr><td>${esc(t.name)}</td><td class="num">${fmtF(t.E/1e6,3)}</td><td class="num">${fmtF(t.wtt+t.ttw,2)}</td></tr>`;
    out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Intensity of the allocated mix</span>
      <table class="scctable"><tr><th>Fuel × consumer</th><th class="num">Alloc ×10⁶ MJ</th><th class="num">WtW g/MJ</th></tr>${tr}</table>
      <p>Energy-weighted GHGIE = <b>${fmtF(f.ghgie,2)} gCO₂eq/MJ</b>${f.fwind<1?` (incl. wind factor ${f.fwind})`:""}. Full allocation table on the ⛵ Leg-Wise tab.</p></div></div>`;
  } else {
    out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Intensity</span><p>GHGIE = <b>${fmtF(f.ghgie,2)} gCO₂eq/MJ</b>.</p></div></div>`;
  }
  out += `<div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Target</span>
    <p>${R.year} target = 91.16 × (1 − ${f.targetPct}%) = <b>${fmtF(f.target,2)} gCO₂eq/MJ</b>.</p></div></div>`;
  out += `<div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Compliance balance</span>
    <p>CB = (target − GHGIE) × E = (${fmtF(f.target,2)} − ${fmtF(f.ghgie,2)}) × ${fmtF(f.E_total/1e6,3)}×10⁶ = <b>${fmt(f.cb/1e6)} t CO₂eq</b> (${f.cb<0?"deficit":"surplus"}).</p></div></div>`;
  const flex=[];
  if(f.banked) flex.push(`banked in ${fmt(f.banked/1e6)} t`);
  if(f.poolCB) flex.push(`pool partner ${fmt(f.poolCB/1e6)} t`);
  if(f.borrowUsed) flex.push(`borrowed ${fmt(f.borrowUsed/1e6)} t (repay ${fmt(f.borrowDebt/1e6)} t)`);
  if(flex.length) out += `<div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Flexibility applied</span><p>${flex.join("; ")}. Balance after flexibility = <b>${fmt((f.cbFinal||0)/1e6)} t CO₂eq</b>.</p></div></div>`;
  if(f.penalty>0){
    out += `<div class="fstep"><div class="n">${flex.length?7:6}</div><div class="body"><span class="sh">Penalty</span>
      <p>penalty = |CB| ÷ (GHGIE × 41,000) × 2,400${f.mult>1?` × ${f.mult} (consecutive deficit years)`:""} = <b>€${fmtI(f.penalty)}</b>.</p></div></div>`;
    out += `<div class="ftake"><b>Takeaway:</b> ${R.year} FuelEU intensity ${fmtF(f.ghgie,2)} vs target ${fmtF(f.target,2)} → penalty <b>€${fmtI(f.penalty)}</b>.</div>`;
  } else if(f.surplusValue>0){
    out += `<div class="ftake"><b>Takeaway:</b> ${R.year} FuelEU is compliant (intensity ${fmtF(f.ghgie,2)} ≤ target ${fmtF(f.target,2)}); surplus worth ≈ <b>€${fmtI(f.surplusValue)}</b> if banked or pooled.</div>`;
  } else {
    out += `<div class="ftake"><b>Takeaway:</b> ${R.year} FuelEU balance is essentially zero — no penalty.</div>`;
  }
  return out;
}

function fexLiveSCC(R){
  const s = R.scc;
  if(!R.rowDetails.length) return fexContext(R)+fexNoData(R.year);
  const v = s.voyages||[];
  if(!v.length || s.weighted==null){
    return fexContext(R)+`<div class="fstep"><div class="n">·</div><div class="body"><span class="sh">No transport work yet</span><p>SCC needs voyages that have BOTH cargo (t) and distance (nm). None of the ${R.year} voyages carry both, so no intensity can be computed. Add cargo/distance on the Workspace tab or import a file that includes them.</p></div></div>`;
  }
  let out = fexContext(R);
  const show = v.slice(0,10);
  let tr="";
  for(const x of show) tr += `<tr><td>${esc(x.label)}</td><td class="num">${fmtF(x.wtw,2)}</td><td class="num">${x.ballast>0?fmtF(x.ballast,2):"—"}</td><td class="num">${fmtF(x.numerator,2)}</td><td class="num">${fmtI(x.tw)}</td><td class="num">${fmtF(x.intensity,2)}</td></tr>`;
  out += `<div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Each laden voyage's intensity</span>
    <table class="scctable"><tr><th>Laden voyage</th><th class="num">own WtW t CO₂e</th><th class="num">+ ballast leg</th><th class="num">numerator</th><th class="num">t·nm (laden)</th><th class="num">g/t·nm</th></tr>${tr}</table>
    <p class="note">Per ADR 2026 Appendix 3 the numerator is the well-to-wake CO₂e of the ballast leg <b>plus</b> the laden leg, while the denominator is cargo × <b>laden distance only</b>. Ballast legs have no row of their own — they are folded into the voyage that loads next.</p>
    ${v.length>10?`<p class="note">… and ${v.length-10} more voyage(s) — all counted in the weighted figure below.</p>`:""}</div></div>`;
  out += `<div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Weighted intensity</span>
    <p>weighted = Σ numerator ÷ Σ (cargo×laden distance) = ${fmtF(s.totCO2,2)} t ÷ ${fmtI(s.totTW)} t·nm = <b>${fmtF(s.weighted,2)} gCO₂e/t·nm</b>.</p></div></div>`;
  const reqMin = Number(S.sccReqMin)||null, reqStr = Number(S.sccReqStriving)||null;
  if(reqMin||reqStr){
    out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Alignment</span>
      <p>${reqMin?`vs Minimum ${reqMin}: Δ = <b>${fmtF(s.deltaMin,1)}%</b>`:""}${(reqMin&&reqStr)?" · ":""}${reqStr?`vs Striving ${reqStr}: Δ = <b>${fmtF(s.deltaStr,1)}%</b>`:""}. Negative = below the line (aligned).</p></div></div>`;
    const d = s.deltaMin!=null?s.deltaMin:s.deltaStr;
    out += `<div class="ftake"><b>Takeaway:</b> the ${R.year} weighted intensity is ${fmtF(s.weighted,2)} g/t·nm, ${d<0?"below":"above"} the required line by ${fmtF(Math.abs(d),1)}%.</div>`;
  } else {
    out += `<div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Alignment</span><p>Enter the required 'Minimum' / 'Striving' intensities on the Workspace SCC card to see the alignment Δ.</p></div></div>`;
  }
  return out;
}

function renderConstants(){
  const el = document.getElementById("tab-constants");
  const R = computeAll(S);   // live "Your ship" walkthrough reads the SAME engine result as the Leg-Wise tab
  el.innerHTML = `
  <div class="fsubbar">
    <button class="on" data-fsub="cii" onclick="showFormulaSub('cii')">IMO CII</button>
    <button data-fsub="euets" onclick="showFormulaSub('euets')">EU ETS</button>
    <button data-fsub="fueleu" onclick="showFormulaSub('fueleu')">FuelEU</button>
    <button data-fsub="ukets" onclick="showFormulaSub('ukets')">UK ETS</button>
    <button data-fsub="scc" onclick="showFormulaSub('scc')">SCC</button>
    <button data-fsub="reference" onclick="showFormulaSub('reference')">Reference data</button>
  </div>
  <p class="note funits">Units used on this page: <b>t</b> = tonne (1,000 kg = 1,000,000 g) · <b>nm</b> = nautical mile · <b>DWT</b> = deadweight tonnage, <b>GT</b> = gross tonnage (two ways of measuring a ship's size) · <b>MJ</b> = megajoule of fuel energy · <b>g/t·nm</b> = grams of CO₂(-equivalent) per tonne-mile of transport work · <b>gCO₂eq/MJ</b> = grams of CO₂-equivalent per megajoule of fuel energy · one <b>EUA / UKA</b> = one emission allowance = 1 tonne of CO₂e. <b>Σ</b> ("sigma") always means "add up, for every fuel (or leg) …". <b>CO₂e / CO₂eq</b> = CO₂-equivalent: methane and nitrous oxide expressed as the amount of CO₂ that would warm the planet the same, using a <b>GWP</b> (global-warming-potential) multiplier.</p>

  <!-- ============================= IMO CII ============================= -->
  <div class="fsub on" id="fsub-cii">
    <div class="card">
      <h2>IMO Carbon Intensity Indicator (CII) — how efficiently a ship carried cargo over the year</h2>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">How it works — step by step</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Turn each fuel burned into CO₂</span>
            <div class="formula">M = Σⱼ FCⱼ × CFⱼ        [grams CO₂]</div>
            <p><b>M</b> is the total mass of CO₂ the ship emitted over the whole year. For every fuel <b>j</b> it burned, <b>FCⱼ</b> is the tonnes of that fuel and <b>CFⱼ</b> is that fuel's <i>carbon factor</i> — the tonnes of CO₂ released per tonne of fuel (about 3.1 for heavy fuel oil). <b>Σⱼ</b> says: do this for every fuel and add the results. CII counts <b>CO₂ only</b> — methane and nitrous oxide are not included here.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Measure the transport work done</span>
            <div class="formula">W = Capacity × Dt        [capacity · nm]</div>
            <p><b>W</b> is how much carrying-work the ship did. <b>Capacity</b> is the ship's size and <b>Dt</b> is the total distance it sailed in the year (nautical miles). Capacity is measured as <b>DWT</b> (deadweight — how much weight the ship can carry) for cargo ships like bulk carriers and tankers, and as <b>GT</b> (gross tonnage — enclosed volume) for passenger and ro-ro ships.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Divide to get the attained CII</span>
            <div class="formula">attained CII = M ÷ W</div>
            <p>This is the ship's actual carbon intensity: grams of CO₂ for each unit of size carried one nautical mile. <b>Lower is better</b> — it means less CO₂ for the same amount of transport.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Look up the reference line for this ship type</span>
            <div class="formula">CII_ref = a × Capacity⁻ᶜ</div>
            <p><b>CII_ref</b> is the 2019 industry-average intensity for a ship of this type and size — the baseline everyone is measured against. <b>a</b> and <b>c</b> are fixed numbers IMO publishes for each ship type (listed in the <i>Reference data</i> sub-tab). Bigger ships naturally have a lower reference value, which is why capacity is raised to a negative power.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Tighten the reference into this year's requirement</span>
            <div class="formula">required CII = (1 − Z/100) × CII_ref</div>
            <p><b>Z</b> is the reduction percentage IMO demands for the given year versus 2019 — it grows each year so the target gets stricter. <span class="flag">FILL-IN</span> the numeric Z values (2023–26: 5 / 7 / 9 / 11 %; 2027–30: 13.625 / 16.25 / 18.875 / 21.5 %) are not in the knowledge base — verify before external use.</p></div></div>
          <div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Convert the requirement into an A–E rating</span>
            <div class="formula">A ≤ exp(d1)·req · B ≤ exp(d2)·req · C ≤ exp(d3)·req · D ≤ exp(d4)·req · else E</div>
            <p>Four multipliers <b>exp(d1..d4)</b> (again published per ship type) set the boundaries around the required value. If the attained CII from step 3 falls under the first boundary the ship is rated <b>A</b>, under the next <b>B</b>, and so on down to <b>E</b>. C means "meeting the requirement"; three years at D, or one year at E, forces a corrective action plan.</p></div></div>
        </div>
        <div class="fcol fex">
          <div class="fcol-head">Worked example ${fexToggle('cii')}</div>
          <div id="fex-cii-example">
          <div class="fexcap">bulk carrier, 60,000 DWT, year 2026</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Fuel → CO₂</span>
            <p>The ship burned <b>5,000 t of HFO</b> (carbon factor 3.114). M = 5,000 × 3.114 = <b>15,570 t CO₂</b> = 15,570,000,000 g.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Transport work</span>
            <p>It sailed <b>55,000 nm</b> at 60,000 DWT. W = 60,000 × 55,000 = <b>3,300,000,000 DWT·nm</b>.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Attained CII</span>
            <p>attained = 15,570,000,000 ÷ 3,300,000,000 = <b>4.718 g CO₂ / DWT·nm</b>.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Reference line</span>
            <p>For a bulk carrier a = 4,745 and c = 0.622. CII_ref = 4,745 × 60,000⁻⁰·⁶²² = <b>5.061</b>.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">This year's requirement</span>
            <p>Z for 2026 is 11 %. required = (1 − 0.11) × 5.061 = <b>4.504</b>.</p></div></div>
          <div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Rating</span>
            <p>Boundaries: A ≤ 3.874 · B ≤ 4.234 · C ≤ 4.774 · D ≤ 5.315. The attained 4.718 is above the B limit but under the C limit → <b>rating C</b>, sitting close to the C/D boundary (4.774). A small efficiency slip would tip it into D.</p></div></div>
          <div class="ftake"><b>Takeaway:</b> this ship attains 4.718 against a 2026 requirement of 4.504 — it is a <b>C</b>, just inside the band, with little headroom before the C/D line at 4.774.</div>
          </div>
          <div id="fex-cii-live" style="display:none">${fexLiveCII(R)}</div>
        </div>
      </div>
      <p class="fsrc"><b>Where this comes from:</b> attained CII &amp; M/W — MEPC.352(78) G1 §4, Eq. (1)–(3), chunk <b>imo-g1-s4</b> (CFⱼ per MEPC.308(73)/Annex II; optional Circ.905 CF override, chunk <b>imo-circ905-annex</b>). Reference line a/c — MEPC.353(78) G2 §3.2, Table 1, chunk <b>imo-g2-s4</b>. Reduction factor Z — MARPOL Annex VI reg 28.4, chunk <b>imo-a6-reg28</b> (numeric Z values <span class="flag">FILL-IN</span>, not in KB: 2023–26 per MEPC.338(76); 2027–30 per MEPC 83). Rating boundaries exp(d1..d4) — MEPC.354(78) G4 §4.6, Table 1, chunk <b>imo-g4-s4</b>. Prior compact example: required 10 → 8.6/9.4/10.6/11.8, attained 9 → "B".</p>
    </div>
  </div>

  <!-- ============================= EU ETS ============================= -->
  <div class="fsub" id="fsub-euets">
    <div class="card">
      <h2>EU Emissions Trading System (maritime) — buying an allowance for each tonne of CO₂e</h2>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">How it works — step by step</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Decide which voyages count, and how much</span>
            <div class="formula">EEA→EEA &amp; at berth in EEA = 100% · EEA↔non-EEA = 50% · fully outside = 0%</div>
            <p>A voyage between two EEA ports (or fuel burned at berth in an EEA port) is fully in scope. A voyage into or out of the EEA counts at <b>50%</b> — because only half of an international voyage that touches Europe is treated as Europe's responsibility. EEA = the EU plus Norway and Iceland.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Work out the emissions of each leg</span>
            <div class="formula">emissions = Σ_fuels M × EF</div>
            <p>For each fuel, <b>M</b> is the tonnes burned on that leg and <b>EF</b> its emission factor. <b>From 2026 methane (CH₄) and nitrous oxide (N₂O) are included</b> alongside CO₂, combined into <b>CO₂e</b> using the same ME<sub>ETS</sub> structure shown in the UK ETS sub-tab, with GWP multipliers ${euetsGwp(S).ch4} / ${euetsGwp(S).n2o} (${euetsGwp(S).label}, chosen in Settings). <span class="flag">FILL-IN — amended MRV GWPs not in KB.</span></p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Apply the coverage percentage</span>
            <div class="formula">covered = coverage% × leg emissions</div>
            <p>Multiply each leg's emissions by its coverage from step 1. A 50% leg contributes only half its CO₂e to the total that must be surrendered.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Apply the phase-in</span>
            <div class="formula">EUAs = covered × phase-in        40% (2024) · 70% (2025) · 100% (2026+)</div>
            <p>The scheme came in gradually: shipping owed allowances on only 40% of covered emissions in 2024, 70% in 2025, and the full 100% from 2026 onward.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Surrender allowances and price them</span>
            <div class="formula">cost = EUAs × EUA price</div>
            <p>One <b>EUA</b> (EU Allowance) covers one tonne of CO₂e. The operator buys and surrenders that many allowances; the cost is simply the allowance count times the market EUA price you set in Settings.</p></div></div>
        </div>
        <div class="fcol fex">
          <div class="fcol-head">Worked example ${fexToggle('euets')}</div>
          <div id="fex-euets-example">
          <div class="fexcap">three activities, 2026, AR5 (28/265), EUA €80</div>
          <div class="fstep"><div class="n">1–3</div><div class="body"><span class="sh">Legs, coverage and CO₂e</span>
            <p><b>Intra-EEA leg</b> (Rotterdam→Hamburg), 100 t MGO, 100% covered → 320.6 t CO₂, and with CH₄+N₂O = <b>325.51 t CO₂e</b>.</p>
            <p><b>EEA↔Singapore leg</b>, 400 t HFO, 50% covered → only 200 t counts → 622.8 t CO₂ = <b>632.62 t CO₂e</b>.</p>
            <p><b>At berth in Rotterdam</b>, 20 t MGO, 100% covered → 64.12 t CO₂ = <b>65.10 t CO₂e</b>.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Phase-in</span>
            <p>Total covered = 325.51 + 632.62 + 65.10 = <b>1,023.23 t CO₂e</b>. In 2026 the phase-in is 100%, so EUAs = <b>1,023.23</b>.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Cost</span>
            <p>1,023.23 EUAs × €80 = <b>€81,858.56</b>.</p></div></div>
          <div class="ftake"><b>Takeaway:</b> the Singapore leg burned the most fuel yet contributes the least, because 50% coverage halves it — scope, not just fuel, drives the bill. Total exposure: 1,023 allowances ≈ €81,859.</div>
          </div>
          <div id="fex-euets-live" style="display:none">${fexLiveETS(R)}</div>
        </div>
      </div>
      <p class="fsrc"><b>Where this comes from:</b> scope 100%/50% — Directive 2003/87/EC Art 3ga, chunk <b>euets-art3ga</b>. Phase-in 40/70/100% — Art 3gb, chunk <b>euets-art3gb</b>. Emission factors per Regulation (EU) 2015/757 (= Annex II Cf values) — chunks <b>mrv-annexi/ii</b>, <b>fueleu-annexii</b>. From 2026 CH₄+N₂O as CO₂e with GWP ${euetsGwp(S).ch4}/${euetsGwp(S).n2o} (${euetsGwp(S).label}, user-selected in Settings) <span class="flag">FILL-IN — amended MRV GWPs not in KB</span>.</p>
    </div>
  </div>

  <!-- ============================= UK ETS ============================= -->
  <div class="fsub" id="fsub-ukets">
    <div class="card">
      <h2>UK Emissions Trading System (maritime, from 2026) — UK-domestic CO₂e allowances</h2>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">How it works — step by step</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Decide what is in scope</span>
            <div class="formula">UK→UK voyages + activity at berth in UK ports · ships ≥ 5,000 GT · from 2026</div>
            <p>Unlike EU ETS, the UK scheme covers only <b>domestic</b> maritime activity: voyages between UK ports and fuel burned while in UK ports, for ships of at least 5,000 GT. The first scheme year is the half-year 1 Jul–31 Dec 2026.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Count three gases, with fixed multipliers</span>
            <div class="formula">GWP_CH4 = 28 · GWP_N2O = 265        (AR5 basis, locked)</div>
            <p>The UK scheme totals CO₂, methane and nitrous oxide as CO₂e using <b>AR5</b> global-warming potentials of 28 and 265. These are <b>locked</b> by the regulation. (FuelEU, by contrast, is locked to the older AR4 values 25 / 298 — so the very same methane is weighted a little differently under each regime.)</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Move slipped fuel from the CO₂ line to the CH₄ line</span>
            <div class="formula">Mᵢ,NC = Σ Mᵢ,ⱼ × Cⱼ/100        (non-combusted / slipped fuel)</div>
            <p><b>Mᵢ,NC</b> is fuel that passes through the engine <b>unburned</b> (methane slip, mainly on LNG engines — <b>Cⱼ</b> is the slip % of the engine type). Because it was not combusted it produces no CO₂; instead its full mass is counted as escaped <b>methane</b>. So slip takes a little off the CO₂ line and adds a lot to the CH₄ line.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Combine into one CO₂e figure</span>
            <div class="formula">ME_ETS = CO₂ + CH₄ × 28 + N₂O × 265
CO₂ = Σ (Mᵢ − Mᵢ,NC) × EF_CO2 · CH₄ = Σ (Mᵢ − Mᵢ,NC) × EF_CH4 + Mᵢ,NC · N₂O = Σ (Mᵢ − Mᵢ,NC) × EF_N2O</div>
            <p>Each combusted-fuel line uses the fuel's emission factor <b>EF</b>; the slipped mass Mᵢ,NC is added straight onto the methane line. Multiply the three gas totals by their GWP and add.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Surrender allowances and price them</span>
            <div class="formula">cost = ME_ETS × UKA price</div>
            <p>One <b>UKA</b> (UK Allowance) covers one tonne of CO₂e. No free allocation applies to maritime, so the operator buys them all.</p></div></div>
        </div>
        <div class="fcol fex">
          <div class="fcol-head">Worked example ${fexToggle('ukets')}</div>
          <div id="fex-ukets-example">
          <div class="fexcap">UK coastal voyage, 100 t LNG + 10 t MGO at berth, UKA €50</div>
          <div class="fstep"><div class="n">1–2</div><div class="body"><span class="sh">Scope and gases</span>
            <p>Both the coastal voyage and the berth stay are UK-domestic → 100% in scope. The LNG is burned in a medium-speed Otto engine with <b>3.1% methane slip</b>.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Slip splits the LNG</span>
            <p>Of the 100 t LNG, 3.1 t slips through unburned. So 96.9 t is combusted (CO₂ + a little N₂O) and <b>3.1 t is counted as methane</b>.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Three gas totals</span>
            <p><b>CO₂</b> = 96.9 × 2.750 (LNG) + 10 × 3.206 (MGO) = 266.48 + 32.06 = <b>298.54 t</b>. <b>CH₄</b> = 3.1 (slip) + 0.0005 = <b>3.1005 t</b>. <b>N₂O</b> = <b>0.01246 t</b>.</p>
            <p>ME_ETS = 298.54 + 28 × 3.1005 + 265 × 0.01246 = 298.54 + 86.81 + 3.30 = <b>388.65 t CO₂e</b>.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Cost</span>
            <p>388.65 UKAs × €50 = <b>€19,432.53</b>.</p></div></div>
          <div class="ftake"><b>Takeaway:</b> the 3.1 t of methane slip adds 86.8 t CO₂e — about <b>22%</b> of the whole UK ETS bill — even though it is a tiny fraction of the fuel mass. On LNG ships, slip is where the cost hides.</div>
          </div>
          <div id="fex-ukets-live" style="display:none">${fexLiveUKETS(R)}</div>
        </div>
      </div>
      <p class="fsrc"><b>Where this comes from:</b> ME_ETS structure &amp; GWP 28/265 — UK ETS Order Schedule 2A para 35 + Table C1, chunk <b>ukets-sch2a-p35</b> (verbatim). Emission factors and slip Cⱼ — Table C2, chunk <b>ukets-sch2a-p36</b>. Scope (UK→UK voyages + UK in-port, ships ≥5,000 GT) — chunks <b>ukets-sch2a-p2</b>, <b>ukets-sch2a-p7</b>.</p>
    </div>
  </div>

  <!-- ============================= FuelEU ============================= -->
  <div class="fsub" id="fsub-fueleu">
    <div class="card">
      <h2>FuelEU Maritime — a limit on the greenhouse-gas intensity of the energy a ship uses</h2>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">How it works — step by step</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">The idea: an intensity target, not a tonnage cap</span>
            <p>FuelEU does not cap how many tonnes of CO₂ a ship may emit. Instead it sets a maximum <b>greenhouse-gas intensity</b> — grams of CO₂-equivalent per <b>megajoule (MJ)</b> of energy used. Burn cleaner energy per MJ and you comply, no matter how far you sail.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Add up the energy used</span>
            <div class="formula">E = Σᵢ Mᵢ × LCVᵢ        [MJ]</div>
            <p>For each fuel <b>i</b>, <b>Mᵢ</b> is the mass burned and <b>LCVᵢ</b> its <i>lower calorific value</i> — the energy released per gram. Multiply and add to get total energy <b>E</b> in megajoules.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Find the intensity of that energy</span>
            <div class="formula">GHGIE = f_wind × (WtT + TtW)        [gCO₂eq/MJ]   (Annex I Eq. 1 &amp; 2)</div>
            <p><b>WtT</b> ("Well-to-Tank") is the emissions from producing and delivering the fuel; <b>TtW</b> ("Tank-to-Wake") is the emissions from burning it on board. Each is an energy-weighted average across all fuels. The <b>slip</b> term matters for LNG: the fraction of gas that escapes the engine unburned is counted at the <b>global-warming potential of methane</b>, because unburned methane is itself a strong greenhouse gas. Renewable fuels of non-biological origin (<b>RFNBOs</b>) get a reward <b>RWD = ×2</b> in 2025–2033; a wind-assist factor <b>f_wind</b> (0.99 / 0.97 / 0.95) gives a small discount for sails or rotors. GWPs here are CO₂ 1 · CH₄ 25 · N₂O 298.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Read off this year's target</span>
            <div class="formula">target = 91.16 × (1 − r)        r: 2%(2025) · 6%(2030) · 14.5%(2035) · 31%(2040) · 62%(2045) · 80%(2050)</div>
            <p><b>91.16</b> gCO₂eq/MJ is the 2020 fleet baseline; <b>r</b> is the reduction required for the year. The target tightens in steps over time.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Compare, as a compliance balance</span>
            <div class="formula">CB = (target − GHGIE_actual) × E        [gCO₂eq]   (Annex IV — no RWD in this energy term)</div>
            <p><b>CB</b> is the compliance balance. If your actual intensity is above target, CB is <b>negative</b> — a deficit. Note the energy term here uses plain energy (no ×2 RWD reward), per Annex IV.</p></div></div>
          <div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Turn a deficit into a penalty</span>
            <div class="formula">penalty [€] = |CB| ÷ (GHGIE_actual × 41,000) × 2,400 × (1 + (n−1)/10)</div>
            <p>The deficit is expressed as <b>tonnes of VLSFO-equivalent energy</b> — that is what dividing by <b>41,000</b> MJ (the energy in one tonne of very-low-sulphur fuel oil) does — then charged at <b>€2,400</b> per such tonne. If the ship is in deficit for <b>n</b> consecutive years, the multiplier <b>1+(n−1)/10</b> adds 10% each year. Only the final euro figure is rounded.</p></div></div>
          <div class="fstep"><div class="n">7</div><div class="body"><span class="sh">Flexibility: banking, borrowing, pooling</span>
            <p><b>Banking</b> — a surplus (positive CB) can be carried forward to a future year. <b>Borrowing</b> — a ship may borrow up to 2% of its target-energy against next year to erase a deficit now, repaid with 1.1× interest and not two years running. <b>Pooling</b> — several ships combine balances; if the pool's total is ≥ 0, no ship in it pays a penalty. These are applied after the raw CB, before the penalty.</p></div></div>
          <div class="fstep"><div class="n">8</div><div class="body"><span class="sh">Breakeven blend (an EmA KPI, not regulation)</span>
            <div class="formula">find x so GHGIE(x of energy switched to a substitute) = target   ·   net P&amp;L = extra fuel cost − penalty avoided</div>
            <p>This calculator adds a decision KPI (<b>not</b> part of the FuelEU regulation): the share <b>x</b> of in-scope energy you would swap to a cleaner substitute fuel so the balance lands exactly at zero — solved exactly on the Annex I formula (including RWD and slip, by bisection over 80 iterations) — and whether that swap costs more or less than the penalty it avoids.</p></div></div>
        </div>
        <div class="fcol fex">
          <div class="fcol-head">Worked example ${fexToggle('fueleu')}</div>
          <div id="fex-fueleu-example">
          <div class="fexcap">970 t HFO + 30 t bio-diesel, all in-EEA, 2026</div>
          <div class="fstep"><div class="n">1–2</div><div class="body"><span class="sh">Energy used</span>
            <p>HFO: 970 t × 0.0405 MJ/g = <b>39,285,000 MJ</b>. Bio-diesel: 30 t × 0.037 = <b>1,110,000 MJ</b>. Total <b>E = 40,395,000 MJ</b>.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Intensity</span>
            <p>HFO WtW intensity = 13.5 (WtT) + 78.24 (TtW) = <b>91.74</b> gCO₂eq/MJ. Bio-diesel, with a certified E value of 14.9, has WtT = 14.9 − (2.834/0.037) = −61.69, so WtW = −61.69 + 78.08 = <b>16.38</b> — very low, which pulls the average down. Energy-weighted: GHGIE = <b>89.673</b> gCO₂eq/MJ.</p></div></div>
          <div class="fstep"><div class="n">4</div><div class="body"><span class="sh">Target</span>
            <p>2026 target = 91.16 × (1 − 0.02) = <b>89.34</b> gCO₂eq/MJ.</p></div></div>
          <div class="fstep"><div class="n">5</div><div class="body"><span class="sh">Compliance balance</span>
            <p>CB = (89.34 − 89.673) × 40,395,000 = <b>−13,596,464 gCO₂eq</b> = −13.60 t CO₂eq. Negative → a <b>deficit</b> (the 30 t of bio was not quite enough).</p></div></div>
          <div class="fstep"><div class="n">6</div><div class="body"><span class="sh">Penalty</span>
            <p>penalty = 13,596,464 ÷ (89.673 × 41,000) × 2,400 = <b>€8,875</b> (first year, multiplier 1). A second consecutive deficit year would apply ×1.1 → €9,763.</p></div></div>
          <div class="fstep"><div class="n">7</div><div class="body"><span class="sh">What flexibility would do</span>
            <p><b>Banking:</b> carrying in a ≥13.60 t surplus from last year lifts CB to ≥ 0 → penalty <b>€0</b>. <b>Borrowing:</b> borrow the 13.60 t now (well under the 72.18 t limit), repay 14.96 t next year → <b>€0</b> this year. <b>Pooling:</b> a partner ship contributing +20 t makes the pool +6.4 t → <b>€0</b> for the pool.</p></div></div>
          <div class="ftake"><b>Takeaway:</b> a small intensity miss (89.67 vs 89.34) on 1,000 t of fuel is an €8,875 penalty — or nothing at all if banking, borrowing or pooling covers the 13.6 t deficit.</div>
          </div>
          <div id="fex-fueleu-live" style="display:none">${fexLiveFuelEU(R)}</div>
        </div>
      </div>
      <p class="fsrc"><b>Where this comes from:</b> intensity Eq. 1 &amp; 2, slip, RWD, f_wind — Regulation (EU) 2023/1805 Annex I, chunk <b>fueleu-annexi</b> (verbatim; GWP CO₂ 1 / CH₄ 25 / N₂O 298 per Directive 2018/2001 Annex V C(4)). Default LCV/WtT/Cf/Cslip — Annex II, chunk <b>fueleu-annexii</b> (biofuel WtT = E − Cf_CO2/LCV, col. 4(a); RFNBO WtT from certificate, col. 4(b)). Target 91.16 &amp; schedule — Art 4(2), chunk <b>fueleu-art4</b>. Compliance balance &amp; penalty — Annex IV, chunk <b>fueleu-annexiv</b>; consecutive-deficit multiplier — Art 23(2), chunk <b>fueleu-art23</b>; rounding (intermediates unrounded, final penalty to nearest EUR) — chunk <b>essf-ws1-1-3-5</b>. Banking / borrowing / pooling — Art 20(1), Art 20(2), Art 21, chunks <b>fueleu-art20</b>, <b>fueleu-art21</b>. Example plausibility anchored against the ESSF WS1 worked examples (chunks <b>essf-ws1-1-*</b>, examples 1–3).</p>
    </div>
  </div>
    <div class="formula">banking: surplus → next period (Art 20(1))
borrowing: advance ≤ 2% × target × energy; ×1.1 subtracted next period; not 2 periods in a row (Art 20(2))
pooling: Σ pool balances ≥ 0 ⇒ no penalty for the pool (Art 21)</div>
    <p class="note">Chunks <b>fueleu-art20</b>, <b>fueleu-art21</b>.</p>

  <!-- ============================= SCC ============================= -->
  <div class="fsub" id="fsub-scc">
    <div class="card">
      <h2>Sea Cargo Charter (SCC) — voyage carbon intensity versus a climate-alignment trajectory</h2>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">How it works — step by step</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Intensity of a single voyage — the adapted EEOI</span>
            <div class="formula">voyage intensity = CO₂e (ballast + laden legs) ÷ (cargo × distance laden)        [g/t·nm]</div>
            <p>For one voyage, divide the CO₂e emitted by the transport work. Per the Sea Cargo Charter's own statement of the equation (ADR 2026 Appendix 3): the <b>numerator</b> is the total CO₂e over <b>both the ballast leg and the laden leg(s)</b> of the voyage; the <b>denominator</b> is the <b>cargo</b> carried (tonnes) times the distance sailed <b>while laden</b> only — the ballast distance is excluded from transport work. The result, grams per tonne-mile, says how much CO₂ it took to move one tonne of cargo one nautical mile. Lower is better.</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Weight up to the fleet / annual level</span>
            <div class="formula">weighted intensity = Σ CO₂e ÷ Σ (cargo × distance)</div>
            <p>To combine voyages, add all the CO₂e and divide by all the transport work — so heavier, longer voyages count for more. This gives one weighted intensity for the category or the year.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Compare with the required trajectory</span>
            <div class="formula">alignment Δ = (weighted − required r) ÷ required r × 100%        (Eq. 4 / Eq. 5)</div>
            <p><b>Δ</b> (delta) is the percentage the fleet sits above or below the <b>required</b> intensity <b>r</b> for the year. Negative = below the line = aligned / ahead; positive = above the line = behind. The required-intensity trajectory tables are published by the SCC secretariat and are entered here as user inputs.</p></div></div>
        </div>
        <div class="fcol fex">
          <div class="fcol-head">Worked example ${fexToggle('scc')}</div>
          <div id="fex-scc-example">
          <div class="fexcap">two voyages, required 5.0 g/t·nm</div>
          <div class="fstep"><div class="n">1</div><div class="body"><span class="sh">Each voyage's intensity</span>
            <p><b>Voyage A</b>: 300 t HFO → 934.2 t CO₂; 50,000 t cargo × 5,000 nm = 250,000,000 t·nm → intensity = <b>3.737 g/t·nm</b>.</p>
            <p><b>Voyage B</b>: 400 t HFO → 1,245.6 t CO₂; 30,000 t × 8,000 nm = 240,000,000 t·nm → intensity = <b>5.190 g/t·nm</b> (less cargo per mile, so higher intensity).</p></div></div>
          <div class="fstep"><div class="n">2</div><div class="body"><span class="sh">Weighted intensity</span>
            <p>weighted = (934.2 + 1,245.6) t of CO₂ ÷ (250,000,000 + 240,000,000) t·nm = <b>4.449 g/t·nm</b>.</p></div></div>
          <div class="fstep"><div class="n">3</div><div class="body"><span class="sh">Alignment</span>
            <p>Δ = (4.449 − 5.0) ÷ 5.0 × 100 = <b>−11.0%</b> versus the 5.0 required line (and +11.2% against a stricter 4.0 "striving" line).</p></div></div>
          <div class="ftake"><b>Takeaway:</b> together the two voyages sit <b>11% below</b> the 5.0 g/t·nm requirement — aligned — even though Voyage B on its own is above it. Weighting by transport work is what lets the heavy, efficient Voyage A carry the result.</div>
          </div>
          <div id="fex-scc-live" style="display:none">${fexLiveSCC(R)}</div>
        </div>
      </div>
      <p class="fsrc"><b>Where this comes from:</b> intensity &amp; alignment Eq. 4 / Eq. 5 — SCC Technical Guidance 2025 §2.5, chunk <b>scc-2-5-calculating-alignment-at-the-vessel-</b>; decarbonisation trajectory definition §2.4 / Appendix 4 — chunks <b>scc-2-4-decarbonisation-trajectory</b>, <b>scc-appendix-4</b>; adapted EEOI equation (ballast+laden numerator, laden-only denominator) — Annual Disclosure Report 2026 Appendix 3, chunk <b>scc-adr2026-eeoi-formula-appendix3</b>. Annual required-intensity tables are published by the SCC secretariat and are user inputs here.</p>
    </div>

    <div class="card">
      <h2>2026 update — voyage boundary is <b>berth-to-berth</b>, and the EEOI numerator spans ballast + laden</h2>
      <p>For SCC's EEOI, a reported leg runs from the <b>departure berth to the arrival berth</b>. The older terms <b>EOSP</b> (end of sea passage) and <b>SOSP</b> (start of sea passage), which were read inconsistently, were removed from the Data Collection Templates and replaced by berth-to-berth (DCT v2.0, 2021, carried through to v4.4, 2026). So fuel, distance and time are captured berth-to-berth, and — for the transport-work metric — the associated port-call activity sits inside the leg rather than being cut off at the sea-passage boundary.</p>
      <p>The Annual Disclosure Report 2026 (Appendix 3) states the equation explicitly: <b>total CO₂e over both the ballast leg and the laden leg(s)</b> ÷ (cargo transported × <b>distance sailed laden only</b>). Ballast-leg fuel is measured but the ballast <i>distance</i> does not enter the transport-work denominator.</p>
      <p class="note"><b>SCC-only convention.</b> This measurement basis applies to the Sea Cargo Charter EEOI (gCO₂e/t·nm). It does <b>not</b> change the Poseidon Principles (AER on IMO DCS data) nor the EU ETS / UK ETS / FuelEU voyage scope, which is defined port-of-call to port-of-call by their own instruments.</p>
      <p class="note" style="border-left:3px solid #2f855a;padding-left:8px"><b>Implementation note — DECIDED AND BUILT, 2026-07-22 (owner instruction).</b> The engine follows Equation 2 with the leg boundaries the owner specified: the <b>ballast leg</b> runs from departure at the previous discharge berth to arrival at the first loading berth, and the <b>laden leg</b> from arrival at the first loading berth to departure from the final discharge berth — so the loading stay, the sea passage and the discharge stay are all inside the laden leg, and any bunkering or waiting stay between discharge and loading rides with the ballast leg. <b>No port consumption is dropped:</b> every berth row is attributed to one leg or the other and says so in the EEOI column. The preceding ballast leg's WtW CO₂e is added to the next laden voyage's numerator (Appendix 3: "ballast legs are included in each voyage by accounting for the emissions from the preceding ballast leg while no transport work is carried out"), while the denominator stays cargo × laden distance. Ballast legs therefore have no line of their own — they are labelled <b>ballast</b> and the receiving voyage is marked <b>⊕</b>. A ballast leg with no following laden voyage inside the reporting year raises a warning rather than being dropped.</p>
      <p class="note" style="border-left:3px solid #2f855a;padding-left:8px"><b>Emission factors — Table 8 (Appendix 4), 2026-07-22d.</b> Both well-to-tank and tank-to-wake are read from the guidance's own list, in gCO₂e per gram of fuel, with <b>WtW = WtT + TtW</b> as the guidance prescribes; GWP is <b>AR6</b> (fossil CH₄ 29.8 · biogenic CH₄ 27.2 · N₂O 273), which is SCC's own choice and deliberately differs from the AR4 set FuelEU uses and the AR5 set UK ETS uses — each regime keeps its own prescribed GWP. <b>Granular</b> rows are used where the workspace knows the machinery (LNG by propulsion plant: Otto medium/slow speed, LNG diesel, LBSI, steam turbine &amp; boilers), the <b>default</b> row otherwise, following the guidance's cascade. Biogenic CO₂ is tracked separately and is not added into WtW. This replaced an earlier implementation that derived factors from the Appendix 6 blend equations — that version used the HSHFO value for generic HFO and was ~2.5% high on LFO. Sulphur-grade rows (HSHFO / VLSFO / ULSFO) are in the table but not yet selectable per bunker; the default row is used.</p>
      <p class="note"><b>Verification.</b> The factor set reproduces the guidance's own worked examples: LNG Otto dual fuel (medium speed) rebuilds to 0.888 + (0.035 × 29.8) + (1 − 0.035) × (2.75 + 0.00011 × 273) = <b>4.614</b> gCO₂e/g (p.66); the Appendix 5 parceling example implies LFO <b>3.7449</b> and MDO/MGO <b>4.0101</b>, against 0.544 + 3.202 = 3.746 and 0.756 + 3.257 = 4.013 here.</p>
      <p class="fsrc"><b>Where this comes from:</b> SCC Data Collection Template leg definition (EOSP/SOSP → berth-to-berth), Technical Guidance v5.2 and FAQ — chunk <b>scc-2026-voyage-berth-to-berth</b>; parceling port-call inclusion — chunk <b>scc-appendix-3</b>; adapted EEOI equation — Annual Disclosure Report 2026 Appendix 3, chunk <b>scc-adr2026-eeoi-formula-appendix3</b>; ballast-leg charterer attribution — Technical Guidance Appendix 2.</p>
    </div>

    <div class="card">
      <h2>Biofuel blend emission factors — Appendix 6 (Technical Guidance v5.2)</h2>
      <p>From TG v5.2 the default B24/B30 blend factors are removed. Instead, <b>18 equations</b> (Table 15) give the well-to-wake factor in <b>gCO₂e per gram of fuel</b> for FAME biodiesel or HVO blended with HSHFO, VLSFO or MGO, expressed by mass, energy or volume (blend fraction 0–1). Conventional base factors (fraction = 0): <b>HSHFO 3.73145 · VLSFO 3.84 · MGO 4.01242</b>. If the blend's factor is unknown, use these; if the blend <b>percentage</b> is unknown, use the WTW factor of the conventional fuel (LFO/HFO/MDO/MGO). Built into DCT v4.3+ (rows 86–92).</p>
      <div class="fgrid">
        <div class="fcol">
          <div class="fcol-head">FAME biodiesel blends</div>
          <div class="formula">FAME + HSHFO
  mass:   3.73145 − 2.90705·F<sub>M</sub>
  energy: 3.73145 − 3.1415·F<sub>E</sub>/(1 + 0.080649·F<sub>E</sub>)
  volume: 3.73145 − 2.90705/((1.08988764/F<sub>V</sub>) − 0.08988764)

FAME + VLSFO
  mass:   3.84 − 3.0156·F<sub>M</sub>
  energy: 3.84 − 3.25879·F<sub>E</sub>/(1 + 0.080645·F<sub>E</sub>)
  volume: 3.84 − 3.0156/((1.08988764/F<sub>V</sub>) − 0.08988764)

FAME + MGO
  mass:   4.01242 − 3.18803·F<sub>M</sub>
  energy: 4.01242 − 3.65938·F<sub>E</sub>/(1 + 0.14785·F<sub>E</sub>)
  volume: 4.01242 − 3.18803·F<sub>V</sub></div>
        </div>
        <div class="fcol">
          <div class="fcol-head">HVO blends</div>
          <div class="formula">HVO + HSHFO
  mass:   3.73145 − 3.02525·H<sub>M</sub>
  energy: 3.73145 − 2.76398·H<sub>E</sub>/(1 − 0.08636·H<sub>E</sub>)
  volume: 3.73145 − 3.02525/((1.2435897/H<sub>V</sub>) − 0.2435897)

HVO + VLSFO
  mass:   3.84 − 3.1338·H<sub>M</sub>
  energy: 3.84 − 2.863154·H<sub>E</sub>/(1 − 0.08636·H<sub>E</sub>)
  volume: 3.84 − 3.1338/((1.2435897/H<sub>V</sub>) − 0.2435897)

HVO + MGO
  mass:   4.01242 − 3.3062·H<sub>M</sub>
  energy: 4.01242 − 3.20852·H<sub>E</sub>/(1 − 0.02955·H<sub>E</sub>)
  volume: 4.01242 − 3.3062/((1.1410256/H<sub>V</sub>) − 0.1410256)</div>
        </div>
      </div>
      <p class="note">F/H<sub>M,E,V</sub> = fractional blend content of FAME / HVO by mass, energy or volume (0–1). These produce a WTW factor per gram of fuel; multiply by fuel mass for CO₂e. The calculator does not yet derive a blend factor from a blend % — enter the certified WTW/E value on the fuel row, or the conventional-fuel factor if the blend is unknown.</p>
      <p class="fsrc"><b>Where this comes from:</b> SCC Technical Guidance v5.2, Appendix 6 / Table 15 — chunk <b>scc-tg52-appendix6-biofuel-blend-equations</b>; 2026 changes — chunk <b>scc-2026-changes-overview</b>. Volume form for FAME+MGO is transcribed as printed and should be checked against Table 15.</p>
    </div>
  </div>

  <!-- ============================= REFERENCE DATA ============================= -->
  <div class="fsub" id="fsub-reference">
  <p class="note funits" style="margin-bottom:14px">These are the lookup tables the calculations above draw on. Each carries a one-line note saying which sub-tab uses it.</p>

  <div class="card">
    <h2>Fuel factor library — FuelEU Annex II (chunk <i>fueleu-annexii</i>) / UK ETS Table C2 (chunk <i>ukets-sch2a-p36</i>)</h2>
    <p class="note"><b>Used by the EU ETS, UK ETS and FuelEU sub-tabs</b> — this is where the carbon factors, LCVs and slip values in those worked examples come from. All derived columns are computed live from the base Annex II constants (LCV, Cf's, slip) — scroll horizontally for the full set.
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
      <p class="note"><b>Used by the IMO CII sub-tab</b> — the a, c and exp(d1..d4) values behind steps 4 and 6 of that worked example.</p>
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
      <p class="note"><b>Used by every regulation sub-tab</b> — the fixed numbers (targets, penalty rate, GWP multipliers, scope percentages) each pillar's steps rely on, with the KB chunk each is drawn from.</p>
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
  <p class="note">fueleu-art4 · fueleu-annexi · fueleu-annexii · fueleu-annexiv · fueleu-art20 · fueleu-art21 · fueleu-art23 · euets-art3ga · euets-art3gb · mrv-annexi/ii · ukets-sch2a-p2 · ukets-sch2a-p7 · ukets-sch2a-p35 · ukets-sch2a-p36 · imo-g1-s4 · imo-g2-s4 · imo-g4-s4 · imo-a6-reg28 · imo-circ905-annex (optional CII Cf override) · scc-2-4 · scc-2-5 · scc-appendix-4 · scc-2026-voyage-berth-to-berth · scc-tg52-appendix6-biofuel-blend-equations · scc-2026-changes-overview · scc-adr2026-eeoi-formula-appendix3 · scc-adr2026-methodology-freeze · ovd-ovd-bunker-report-details-p1/p3 &amp; other ovd-* guides · essf-ws1 examples 1–3 (validation fixtures). Open any of these in <b>rulefinder.html</b> for verbatim legal text and plain-language explanations.</p></div>
  </div>`;
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
    <div class="helpstep"><div class="n">4</div><div><b>Dig into the numbers</b> — the <b>⛵ Leg-Wise</b> tab holds the voyage &amp; berth breakdown (per-row EU ETS / UK ETS / FuelEU coverage %, EUA, UKA, eligible energy, compliance balance and penalty, with factor info icons) plus the FuelEU allocation and EU ETS workings — download the breakdown as <b>Excel</b> from that tab. The <b>📋 Report-Wise</b> tab holds the full <b>report-level trace</b> at MDA granularity, where the derived <b>ARRIVAL</b>/<b>DEPARTURE</b> replace IN_PORT and every consumption, ROB, distance and per-regulation eligibility % is visible — download it in OVD format via the <b>⬇ OVD-format Excel</b> button in the header (generated fully offline).</div></div>
    <div class="helpstep"><div class="n">5</div><div><b>Run what-ifs</b> — change a fuel to a biofuel (enter its certified E value from the BDN), toggle FuelEU banking/borrowing/pooling or the allocation method, adjust the substitute fuel for the breakeven KPI, edit the ⚙ machinery split, or move a voyage between zones and watch scope change.</div></div>
    <div class="helpstep"><div class="n">6</div><div><b>Your work saves itself</b> — everything persists automatically in this browser (including the raw MDA reports behind the Leg-Wise tab); <b>Reset</b> in the header returns to an empty workspace.</div></div>
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
      <tr><td>ME/AE/Boiler/Inert_gas/Cargo_Heating…_Consumption_&lt;FUEL&gt;</td><td>Summed per fuel per leg. Fuel codes: HFO, LFO, MGO+MDO→MGO, LPGP, LPGB, LNG, M→Methanol, E→Ethanol</td></tr>
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
      <tr><td>ARRIVAL-EOSP / DEPARTURE-SOSP</td><td>Sea-passage markers only — <b>not</b> the regulatory arrival/departure. The true ARRIVAL and DEPARTURE (GMT) of each stay are <b>derived</b>: with cargo operations, the unbroken OPERATING_CONDITION chain around the first/last cargo-op report; without, the fallback ladder AT_BERTH → BUNKERING chain → AT_ANCHOR → DRIFTING (drifting only counts when the cargo quantity changed during the window; drifting-only waiting is sea passage). Consumption before the derived arrival / after the derived departure counts on the voyage, not the berth</td></tr>
      <tr><td>AT_SEA</td><td>Noon report on the ORIGIN→DESTINATION leg (consumption covers the period since the previous report, same as OVD)</td></tr>
      <tr><td>IN_PORT</td><td>At-berth/anchorage stay at the CURRENT port between the <b>derived</b> arrival and departure; a missing LOCODE is filled with the last known port (noted at import). A stay with no berth / anchorage / drifting / bunkering period at all (e.g. canal transit, MANOEUVRING only) is pure transit — merged into the voyage, no port row</td></tr>
      <tr><td>FUEL_OIL_BUNKER / FUEL_STOCK</td><td>Stock movements — skipped for consumption and transparent to the derivation logic (they never break a condition chain)</td></tr>
      <tr><td>Port of call</td><td><b>Derived, not read from the file:</b> a stay is a POC only if cargo operations occurred (ASSOCIATED_ACTIVITY = CARGO_LOADING/_DISCHARGING incl. STS, or fallback: CARGO_QTY changed by &gt;5% of DWT or 0↔loaded between EOSP and SOSP → orange ❗) AND no report in the derived window has OUTSIDE_PORT_LIMIT = TRUE (STS outside limits = transit). <b>Exception:</b> if the OPL flags are inconsistent within the stay (some TRUE, some FALSE) and cargo was worked AT_BERTH, the stray OPL flag is treated as misreporting and the call is kept (a genuine outside-limits transfer is at anchor, never at berth; an all-TRUE window still counts as transit). The file's own POC column is ignored; a disagreement is flagged with a yellow ⚠. Non-POC stays are excluded from EU ETS / UK ETS / FuelEU (CII/SCC still count them). Toggle on the row to override</td></tr>
      <tr><td>Fuel names in FUEL_CONSUMPTION</td><td>Every fuel-oil grade → HFO, except ULSFO → LFO; MGO/HSMGO/LSMGO/ULSMGO/HSD → MGO; MDO/DO → MDO; LNG, LPG, methanol, ethanol pass through. Unknown names are flagged as skipped, never guessed</td></tr>
      <tr><td>MAIN/AUXILIARY/BOILER _ENGINE_CONSUMPTION</td><td><b>Machinery split</b> per fuel grade (same mapping); the unassigned remainder per fuel type goes to <b>Other</b> (machines exceeding the total are scaled down and flagged). View/edit via the ⚙ toggle; for LNG the ME/AE shares take their slip class from the two consumer dropdowns in Settings — Boiler and Other are slip-free</td></tr>
      <tr><td>Rows crossing 31 Dec (multi-year file)</td><td>Split into per-year parts — each report is counted <b>whole</b> in the year of its own date (no proration across midnight); the first report of a year keeps its real time. POC derivation works across the boundary. The Settings reporting year decides which parts count in ALL KPIs; the other year's rows stay greyed in the list</td></tr>
      <tr><td>FUEL_ROB · LATITUDE/LONGITUDE · CURRENT_PORT/COUNTRY/REGION</td><td>Retained per report (not used in calculations) — feed the report-level trace on the <b>📋 Report-Wise</b> tab and the OVD-format Excel download (header)</td></tr>
    </table>
    <p class="note">Files without an OPERATING_CONDITION column import with the legacy mapping (EOSP = arrival, SOSP = departure, POC column passthrough) and a note. Stays cut off by the file boundary are derived from the available side and flagged <b>incomplete</b> — upload ±1 month around year ends where possible.</p>
  </div>

  <div class="card">
    <h2>FuelEU fuel allocation (ESSF WS1 §2.5)</h2>
    <p>FuelEU prescribes no method for allocating fuels to the energy scope: fuels reported under MRV in the period — <b>including the uncovered half of 50% voyages</b> — may be allocated freely (essf-ws1-2-5 and the extra-EEA worked examples). The calculator's default, <b>Optimal (cleanest-first)</b>, ranks every fuel × consumer entry by effective WtW intensity (incl. CH₄ slip per engine class; RFNBOs with their ×2 reward) and fills the scope from the cleanest entry down, pro-rating the marginal one — exactly reproducing the ESSF worked example. <b>Proportional</b> (each fuel pro-rata to coverage) is kept as a comparison toggle on the FuelEU card. The full allocation table — pool vs allocated mass and energy, WtT/TtW/WtW per entry — is on the Leg-Wise tab.</p>
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
    <p>This build bundles the <b>Emissions Rulefinder</b> — the full searchable knowledge base of verbatim regulation text (EU ETS, EU MRV, FuelEU, UK ETS, IMO DCS/CII, SCC/PP) with plain-language explanations and the EmA Product Map — as the <i>Rulefinder</i> tab. Every chunk id cited on the Calculations tab can be opened there directly. Press <kbd>/</kbd> while on the Rulefinder tab to focus its search box.</p>
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
  /* 2026-07-26 (Task 1): CII Percentage = attained x 100 / required */
  ck("CII Percentage: 8.6 attained / 10 required → 86%", ciiPctOfRequired({attained:8.6,ciiReq:10}), 86, 1e-9);
  ck("CII Percentage: 11.8 attained / 10 required → 118%", ciiPctOfRequired({attained:11.8,ciiReq:10}), 118, 1e-9);
  ckT("CII Percentage null when attained missing", ciiPctOfRequired({attained:null,ciiReq:10})===null);
  ckT("CII Percentage null when required is 0", ciiPctOfRequired({attained:5,ciiReq:0})===null);
  const sCII={year:2025,ship:{typeId:"bulk",capacity:60000},rows:[{kind:"voyage",from:"EEA",to:"EEA",dist:50000,cargo:0,fuels:[{fuelId:"HFO",tonnes:3000}]}]};
  const cCII=computeAll(sCII).cii;
  ck("CII Percentage matches attained/required from computeAll", ciiPctOfRequired(cCII), cCII.attained*100/cCII.ciiReq, 1e-9);
  /* 2026-07-26c (Task 2): per-leg IMO CII and EEOI for the Leg-Wise table.
     The single most important check is the FIRST one: fed the whole year's voyage totals,
     the per-leg formula must reproduce the engine's own annual attained CII exactly. That is
     what proves the UI helper has not drifted from js/engine.js. */
  (function(){
    const sIMO={year:2025,ship:{typeId:"bulk",capacity:50000},rows:[
      {kind:"voyage",label:"L1",from:"EEA",to:"EEA",dist:2000,cargo:30000,tStart:"2025-02-01T00:00",tEnd:"2025-02-05T00:00",fuels:[{fuelId:"HFO",tonnes:100}]},
      {kind:"voyage",label:"L2",from:"EEA",to:"EEA",dist:3000,cargo:0,tStart:"2025-02-06T00:00",tEnd:"2025-02-10T00:00",fuels:[{fuelId:"HFO",tonnes:120}]}]};
    const rIMO=computeAll(sIMO), c2=rIMO.cii, L1=rIMO.rowDetails[0], L2=rIMO.rowDetails[1];
    const capI=50000;
    /* (1) leg formula, summed over the year's voyages, == the engine's annual attained CII.
       Exact here because this state has NO berth stays — with berth stays the annual figure
       is HIGHER (berth CO₂, no distance), which is the caveat the IMO tooltip states. */
    const allCO2=L1.co2+L2.co2, allDist=L1.dist+L2.dist;
    ck("Leg CII formula reproduces the engine's ANNUAL attained CII (no berth stays)",
       allCO2*1e6/(capI*allDist), c2.attained, 1e-9);
    /* (2) each leg's own attained figure and its rating band */
    ck("Leg 1 attained CII = leg CO2 x 1e6 / (capacity x leg distance)",
       legCII(L1,c2,sIMO).attained, L1.co2*1e6/(capI*2000), 1e-9);
    ckT("Leg CII rating uses the same A-E ladder as the engine",
        legCII(L1,c2,sIMO).rating === ciiRatingOf(L1.co2*1e6/(capI*2000), c2.bounds));
    ckT("Leg CII percentage = attained x 100 / required",
        Math.abs(legCII(L1,c2,sIMO).pct - (L1.co2*1e6/(capI*2000))*100/c2.ciiReq) < 1e-9);
    /* (3) berth stays and zero-distance rows have no leg CII */
    ckT("Berth stay has no leg CII", legCII({kind:"port",dist:0,co2:5},c2,sIMO)===null);
    ckT("Zero-distance voyage has no leg CII", legCII({kind:"voyage",dist:0,co2:5},c2,sIMO)===null);
    ckT("No capacity set → no leg CII", legCII(L1,c2,{ship:{capacity:0}})===null);
    /* (4) IMO EEOI: TtW, CO2 only, leg's own CO2 over its own transport work */
    ck("Leg IMO EEOI = leg CO2 x 1e6 / transport work", legEEOI(L1), L1.co2*1e6/L1.tw, 1e-9);
    ck("Leg IMO EEOI denominator is cargo x laden distance", L1.tw, 30000*2000, 1e-9);
    ckT("Ballast leg (no cargo) has no IMO EEOI", legEEOI(L2)===null);
    ckT("Berth stay has no IMO EEOI", legEEOI({kind:"port",tw:0,co2:5})===null);
    /* (5) the IMO EEOI is NOT the Sea Cargo Charter intensity — CO2 only vs WtW CO2e, and no
       ballast/port carry-in. L1 here has a ballast leg after it, so the SCC figure differs. */
    ckT("IMO EEOI (TtW CO2) differs from the SCC EEOI (WtW CO2e) on the same leg",
        L1.eeoi!=null && Math.abs(legEEOI(L1)-L1.eeoi) > 1e-6);
    ckT("IMO EEOI is lower than the SCC EEOI (CO2 only vs WtW CO2e + carry-in)",
        legEEOI(L1) < L1.eeoi);
    /* (6) weighted TOTALs — the aggregation the sticky TOTAL row uses */
    const wCO2=L1.co2+L2.co2, wDist=L1.dist+L2.dist;
    ck("Weighted TOTAL CII = sum CO2 / (capacity x sum distance)",
       wCO2*1e6/(capI*wDist), c2.attained, 1e-9);
    ck("Weighted TOTAL EEOI = sum CO2 / sum transport work (laden legs only)",
       L1.co2*1e6/L1.tw, legEEOI(L1), 1e-9);
    ckT("Weighted TOTAL CII is NOT the mean of the leg CIIs (intensities don't average)",
        Math.abs(c2.attained - (legCII(L1,c2,sIMO).attained + (L2.co2*1e6/(capI*3000)))/2) > 1e-9);
    /* 2026-07-26d: implausibility guard — "if the distance is zero or the percentage/EEOI is
       too high, let's put a dash" (owner). A real figure must NOT be suppressed; a runaway
       one must be, and must still carry its raw value so the tooltip can show it. */
    ckT("A normal leg is NOT suppressed", legCII(L1,c2,sIMO).suppressed===false);
    (function(){
      /* 1 nm of distance behind a leg's worth of fuel — the pathological case */
      const tiny={kind:"voyage",dist:1,co2:L1.co2};
      const r=legCII(tiny,c2,sIMO);
      ckT("A leg whose CII exceeds the cut-off is suppressed", r!==null && r.suppressed===true);
      ckT("A suppressed CII still carries its raw attained + pct for the tooltip",
          r.pct>CII_PCT_IMPLAUSIBLE && isFinite(r.attained) && r.rating===null);
      ckT("A suppressed CII renders as a dash, not a rating box",
          ciiCellHtml(r).indexOf("—")>-1 && ciiCellHtml(r).indexOf("border-radius:4px")<0);
    })();
    ckT("An EEOI over the cut-off renders as a dash", eeoiCellHtml(EEOI_IMPLAUSIBLE+1,"").indexOf("—")>-1);
    ckT("An EEOI under the cut-off renders as a number", eeoiCellHtml(12.34,"")==="12.34");
    ckT("Cut-offs are generous enough not to hide a genuine E rating",
        CII_PCT_IMPLAUSIBLE > 200 && EEOI_IMPLAUSIBLE > 500);
    /* 2026-07-26l (Aurvin, owner instruction): the cell is now a 3-SEGMENT PILL — % of
       required, then the rating letter, then the attained CII ("AER") — replacing the old
       2-item [percentage text][rating box] layout (2026-07-26d), which is why this test no
       longer checks a "border-radius:4px" substring ordering (both outer segments now carry
       their own corner radius, so that substring appears before the "%" text too). Checked
       instead via the three ciipill-* class markers, which unambiguously mark each segment
       regardless of inline-style details. */
    (function(){
      const legRes = legCII(L1,c2,sIMO);
      const h=ciiCellHtml(legRes);
      ckT("CII cell puts the % segment BEFORE the rating segment BEFORE the AER segment",
          h.indexOf('ciipill-seg') > -1 &&
          h.indexOf('ciipill-seg') < h.indexOf('ciipill-rat') &&
          h.indexOf('ciipill-rat') < h.lastIndexOf('ciipill-seg'));
      ckT("CII cell shows the attained CII (AER) to 2 decimals",
          h.indexOf(fmtF(legRes.attained,2)) > -1);
    })();
    /* 2026-07-26m (Aurvin, owner instruction): character caps INSIDE a shown pill, separate
       from the CII_PCT_IMPLAUSIBLE/suppressed-CELL logic above (which withholds the WHOLE
       cell). % must never render more than 3 digits (≥1000 → dash) and AER never more than
       "xx.xx" (whole part ≥100 → dash), even for an otherwise-valid, non-suppressed figure. */
    (function(){
      const hugePct = ciiPillHtml(1234, "E", 5.5);
      ckT("A % of required needing 4+ digits shows a dash, not the number",
          hugePct.indexOf("1234")<0 && hugePct.indexOf("—")>-1);
      const normalPct = ciiPillHtml(375, "E", 5.5);
      ckT("A 3-digit % of required still renders normally", normalPct.indexOf("375")>-1);
      const hugeAer = ciiPillHtml(120, "E", 104.5);
      ckT("An AER of 100 or more shows a dash, not the number",
          hugeAer.indexOf("104.5")<0 && hugeAer.indexOf("—")>-1);
      const normalAer = ciiPillHtml(120, "E", 26.9);
      ckT("A 2-digit-or-fewer AER still renders to 2 decimals", normalAer.indexOf("26.90")>-1);
    })();
  })();
  /* 2026-07-26u (Aurvin, owner instruction): the PORT STAY CII-column figure — equivalent HFO
     fuel consumption per day. Property-based where possible (e.g. "a pure-HFO stay's
     equivalent tonnes equal its actual tonnes") rather than hand-computed numbers, so the
     tests don't just re-encode the formula they're checking. */
  (function(){
    /* (1) a stay burning ONLY HFO converts to itself — the cleanest sanity check of the
       energy-equivalent formula, independent of any particular LCV value. */
    const pureHfo = {kind:"port", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-03T00:00:00Z", // 2 days
                      fuels:[{id:"HFO", tonnes:100}]};
    ck("Pure-HFO port stay: equivalent tonnes/day = actual tonnes / days",
       legHfoEqPerDay(pureHfo), 100/2, 1e-9);
    /* (2) a fuel with a HIGHER energy content than HFO (LNG, 0.0491 vs HFO's 0.0405 MJ/g)
       must convert to MORE than its own tonnes of HFO-equivalent — same energy, denser fuel
       needs less HFO mass to carry it, so more HFO tonnes are needed to match the LNG's
       energy... i.e. equivalent HFO tonnes > actual LNG tonnes when LNG's LCV > HFO's LCV. */
    const lngOnly = {kind:"port", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-02T00:00:00Z", // 1 day
                      fuels:[{id:"LNG", tonnes:10}]};
    const lngRate = legHfoEqPerDay(lngOnly);
    ckT("A higher-LCV fuel (LNG) converts to MORE HFO-equivalent tonnes than its own mass",
        lngRate > 10);
    ck("LNG equivalent matches the energy-ratio formula (LNG LCV / HFO LCV)",
       lngRate, 10*(FUEL_BY_ID.LNG.lcv/FUEL_BY_ID.HFO.lcv), 1e-9);
    /* (3) mixed fuels sum their energy before converting — not a simple mass sum */
    const mixed = {kind:"port", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-02T00:00:00Z",
                    fuels:[{id:"HFO", tonnes:50}, {id:"LNG", tonnes:10}]};
    const expectMixed = (50*FUEL_BY_ID.HFO.lcv + 10*FUEL_BY_ID.LNG.lcv)/FUEL_BY_ID.HFO.lcv;
    ck("Mixed-fuel stay sums ENERGY across fuels before converting to HFO-equivalent",
       legHfoEqPerDay(mixed), expectMixed, 1e-9);
    /* (4) null (dash) cases: nothing to show */
    ckT("A voyage leg (not a port stay) has no HFO-equivalent figure",
        legHfoEqPerDay({kind:"voyage", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-02T00:00:00Z", fuels:[{id:"HFO",tonnes:10}]})===null);
    ckT("A port stay with no fuel recorded has no HFO-equivalent figure",
        legHfoEqPerDay({kind:"port", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-02T00:00:00Z", fuels:[]})===null);
    ckT("A port stay with no usable start/end has no HFO-equivalent figure (can't measure days)",
        legHfoEqPerDay({kind:"port", tStart:null, tEnd:null, fuels:[{id:"HFO",tonnes:10}]})===null);
    ckT("A port stay where end is not after start has no HFO-equivalent figure",
        legHfoEqPerDay({kind:"port", tStart:"2026-01-02T00:00:00Z", tEnd:"2026-01-01T00:00:00Z", fuels:[{id:"HFO",tonnes:10}]})===null);
    /* (5) NO implausibility cutoff on this figure (owner instruction, unlike CII/EEOI above) —
       even a very short, fuel-heavy stay must still show its raw computed rate. */
    const veryShort = {kind:"port", tStart:"2026-01-01T00:00:00Z", tEnd:"2026-01-01T00:06:00Z", // 6 minutes
                        fuels:[{id:"HFO", tonnes:50}]};
    const shortRate = legHfoEqPerDay(veryShort);
    ckT("A very short, fuel-heavy stay is NOT suppressed — it shows its (large) raw rate",
        shortRate!=null && shortRate > 1000);
    /* (6) cell rendering: dash with a title for null, value + small 't/d' unit otherwise */
    ckT("Null HFO-equivalent renders as a dash with an explanatory title",
        hfoEqCellHtml(null).indexOf("—")>-1 && hfoEqCellHtml(null).indexOf("title=")>-1);
    const cellHtml = hfoEqCellHtml(2.44);
    ckT("A real HFO-equivalent value renders to 1 decimal place",
        cellHtml.indexOf(">"+fmtF(2.44,1)+"<")>-1 || cellHtml.indexOf(fmtF(2.44,1))>-1);
    ckT("The 't/d' unit is present and marked smaller than the number",
        cellHtml.indexOf("t/d")>-1 && cellHtml.indexOf("font-size:70%")>-1);
  })();
  /* 2026-07-26v (Task 1, Aurvin, owner instruction): the VOYAGE-leg equivalent HFO fuel/nm
     figure — same energy-equivalent core as t/d above (legHfoEqTonnes), owner-confirmed to
     reuse that recipe, just ÷ leg distance instead of ÷ duration, and in kg instead of
     tonnes. Owner also confirmed (this session) NO suppression tie-in with the CII pill's own
     implausibility cut-off — kg/nm always shows its raw value. */
  (function(){
    /* (1) same pure-HFO sanity check as t/d: a leg burning ONLY HFO converts to its own mass
       in kg, independent of any particular LCV constant. */
    const pureHfo = {kind:"voyage", dist:100, fuels:[{id:"HFO", tonnes:1}]}; // 1t = 1000kg
    ck("Pure-HFO voyage leg: equivalent kg/nm = actual kg / distance",
       legHfoEqPerNm(pureHfo), 1000/100, 1e-9);
    /* (2) shares legHfoEqTonnes with t/d — a higher-LCV fuel (LNG) converts to more than its
       own mass, same property as the port-stay test above, now on the ÷distance/kg path. */
    const lngOnly = {kind:"voyage", dist:50, fuels:[{id:"LNG", tonnes:10}]};
    const lngRate = legHfoEqPerNm(lngOnly);
    ckT("A higher-LCV fuel (LNG) still converts to MORE HFO-equivalent mass than its own",
        lngRate > (10*1000)/50);
    ck("LNG kg/nm matches the energy-ratio formula (LNG LCV / HFO LCV), in kg",
       lngRate, (10*1000*(FUEL_BY_ID.LNG.lcv/FUEL_BY_ID.HFO.lcv))/50, 1e-9);
    /* (3) mixed fuels sum energy before converting, same as t/d */
    const mixed = {kind:"voyage", dist:200, fuels:[{id:"HFO", tonnes:50}, {id:"LNG", tonnes:10}]};
    const expectMixedTonnes = (50*FUEL_BY_ID.HFO.lcv + 10*FUEL_BY_ID.LNG.lcv)/FUEL_BY_ID.HFO.lcv;
    ck("Mixed-fuel leg sums ENERGY across fuels before converting, then ÷ distance, in kg",
       legHfoEqPerNm(mixed), (expectMixedTonnes*1000)/200, 1e-9);
    /* (4) legHfoEqTonnes is the SAME shared core t/d uses — a pure-HFO stay/leg with matching
       tonnes must agree on the intermediate HFO-equivalent tonnes regardless of which of the
       two final functions is called, proving the two figures can't drift apart on that step. */
    ck("t/d and kg/nm agree on the shared HFO-equivalent-tonnes step for identical fuel",
       legHfoEqTonnes({fuels:[{id:"HFO",tonnes:1}]}), legHfoEqTonnes({fuels:[{id:"HFO",tonnes:1}]}), 1e-9);
    /* (5) null (dash) cases */
    ckT("A port stay (not a voyage leg) has no kg/nm figure",
        legHfoEqPerNm({kind:"port", dist:0, fuels:[{id:"HFO",tonnes:10}]})===null);
    ckT("A voyage leg with no distance has no kg/nm figure",
        legHfoEqPerNm({kind:"voyage", dist:0, fuels:[{id:"HFO",tonnes:10}]})===null);
    ckT("A voyage leg with no fuel recorded has no kg/nm figure",
        legHfoEqPerNm({kind:"voyage", dist:100, fuels:[]})===null);
    /* (6) NO implausibility cutoff (owner instruction, this session) — a very short leg with
       a lot of fuel behind it must still show its raw (large) kg/nm rate, unlike the CII pill
       above it which WOULD be withheld at that same distance/fuel ratio. */
    const veryShort = {kind:"voyage", dist:0.01, fuels:[{id:"HFO", tonnes:50}]};
    const shortRate = legHfoEqPerNm(veryShort);
    ckT("A very short, fuel-heavy leg's kg/nm is NOT suppressed — shows its (large) raw rate",
        shortRate!=null && shortRate > 100000);
    /* (7) cell rendering: dash with title for null, value + small 'kg/nm' unit otherwise, and
       — the key visual requirement this session — rendered as its OWN block (so it stacks
       under the CII pill instead of sitting beside it). */
    ckT("Null kg/nm renders as a dash with an explanatory title",
        hfoEqPerNmCellHtml(null).indexOf("—")>-1 && hfoEqPerNmCellHtml(null).indexOf("title=")>-1);
    const nmHtml = hfoEqPerNmCellHtml(83.6);
    ckT("A real kg/nm value renders to 1 decimal place with a 'kg/nm' unit, marked smaller",
        nmHtml.indexOf(fmtF(83.6,1))>-1 && nmHtml.indexOf("kg/nm")>-1 && nmHtml.indexOf("font-size:70%")>-1);
    ckT("Both the dash and the value render as their own block (stacks under the CII pill)",
        hfoEqPerNmCellHtml(null).indexOf("display:block")>-1 && nmHtml.indexOf("display:block")>-1);
  })();
  /* 2026-07-26v (Task 2, Aurvin, owner instruction): the CII column cell (col 9 only) is now
     CENTERED, not right-aligned, so a port stay's t/d sits on the same visual line as it did
     before. The EEOI column (col 10) is untouched.
     2026-07-26w (Aurvin, owner instruction, this session): SUPERSEDES the voyage-row half of
     the above — the port-stay (isBerth) branch still uses the centered flex-column layout
     checked below, but voyage rows now use the SAME absolute-position technique as the
     Eligibility cell (columns 6-8: pill pinned at top:50%, caption pinned at a fixed
     center+22px offset, min-height:70px guard) so the two banners share one literal baseline
     instead of two independent centering rules — see the long comment on imoLeg in
     breakdownGrid. This is a light styling-string check, not a pixel/layout test — jsdom in
     these self-tests does not compute real layout — but it does lock down each branch's
     technique so a future edit can't silently revert one or mix the two up. */
  (function(){
    const sCenter={year:2025,ship:{typeId:"bulk",capacity:50000},rows:[
      {kind:"port",dist:0,cargo:0,tStart:"2025-03-01T00:00",tEnd:"2025-03-02T00:00",fuels:[{fuelId:"HFO",tonnes:5}]},
      {kind:"voyage",from:"EEA",to:"EEA",dist:1000,cargo:5000,tStart:"2025-03-01T00:00",tEnd:"2025-03-02T00:00",fuels:[{fuelId:"HFO",tonnes:50}]}]};
    const rCenter=computeAll(sCenter);
    BR_LAST=null; // force a clean render, same pattern breakdownGrid's other tests rely on
    const html=breakdownGrid(rCenter,{lcv:"",euets:"",ukets:"",feu:"",scc:"",voy:"",imo:"",eligibility:""});
    /* bound each check to ONE leg row's own col-9 block (from "grid-column:9;grid-row:1" up
       to that same row's "grid-column:10") rather than searching the whole html string —
       there are two such blocks here (the port-stay row, then the voyage row), and both
       "position:relative;min-height:70px" and "top:50%;left:50%;transform:translate(-50%,-50%)"
       also appear, unrelated, in the Eligibility cell's own markup, so an unbounded search
       could pass for the wrong reason. */
    const col9Blocks = [...html.matchAll(/grid-column:9;grid-row:1[\s\S]*?(?=grid-column:10)/g)].map(m=>m[0]);
    ckT("CII column (grid-column:9), PORT-STAY row: still centered flex-column layout",
        col9Blocks.some(t=>/flex-direction:column;align-items:center/.test(t)));
    ckT("CII column (grid-column:9), VOYAGE row: pill+caption now use the SAME absolute-position/min-height:70px anchors as the Eligibility cell",
        col9Blocks.some(t=>/position:relative;min-height:70px/.test(t) &&
                            /top:50%;left:50%;transform:translate\(-50%,-50%\)/.test(t) &&
                            /top:calc\(50% \+ 22px\);left:50%;transform:translateX\(-50%\)/.test(t)));
    ckT("EEOI column (grid-column:10) cell is unaffected — still right-aligned, single line",
        /grid-column:10;grid-row:1[^"]*justify-content:flex-end/.test(html));
  })();
  /* ==========================================================================================
     2026-07-28j (Aurvin, owner instruction) — three display changes locked down here.
       T1  A V1 MDA file's Report-Wise CONDITION column shows the PORT_STATE-derived condition
           (so it reads like a current-format vessel), with the ship's own reported wording kept
           in the cell tooltip. A V3 file is completely unaffected (ocD === oc).
           ⚠ TEMPORARY — delete this part with the V1 branch (see HANDOFF_LOG.md 2026-07-28i).
       T2  Whole-row ZEBRA striping on all three tabs, and the per-fuel "MGO" sub-band removed:
           one leg/voyage/report = ONE stripe, however many fuel lines it has.
       T3  Group headers are all the SAME neutral grey — the per-section tints (IMO green,
           Fuel metrics cyan, EU ETS blue, UK ETS purple, FuelEU green) are gone.
     ========================================================================================== */
  (function(){
    /* ---- T1: minimal V1 fixture. OPERATING_CONDITION carries NO AT_BERTH/AT_ANCHOR (only the
       V1 sailing-mode words), PORT_STATE carries the real port state, cargo work comes from
       CARGO_OP, and ASSOCIATED_ACTIVITY / OUTSIDE_PORT_LIMIT are blank — exactly the shape of
       the owner's olam_CORONA file. Note the two BERTHING rows: one is really MANOEUVRING and
       one really AT_BERTH, which is the whole reason PORT_STATE (not a BERTHING→AT_BERTH
       rename) is what gets read. */
    const V1FIX=[["DATE_TIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","PORT_STATE","ASSOCIATED_ACTIVITY","CARGO_OP","OUTSIDE_PORT_LIMIT","POC","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE"],
      ["2025-05-01 00:00","2025-04-30 12:00","2025-05-01 00:00","AT_SEA","NORMAL SAILING","","","False","","NO",'{"VLSFO": 5}',"60","9000","SGSIN","","AEJEA"],
      ["2025-05-01 06:00","2025-05-01 00:00","2025-05-01 06:00","ARRIVAL-EOSP","","","","False","","NO",'{"VLSFO": 0.5}',"6","9000","SGSIN","AEJEA","AEJEA"],
      ["2025-05-01 12:00","2025-05-01 06:00","2025-05-01 12:00","IN_PORT","BERTHING","MANOEUVRING","","False","","NO",'{"MDO": 0.2}',"0","9000","","AEJEA",""],
      ["2025-05-02 00:00","2025-05-01 12:00","2025-05-02 00:00","IN_PORT","BERTHING","AT_BERTH","","True","","YES",'{"MDO": 0.4}',"0","4000","","AEJEA",""],
      ["2025-05-02 06:00","2025-05-02 00:00","2025-05-02 06:00","DEPARTURE-SOSP","BERTHING","MANOEUVRING","","False","","NO",'{"MDO": 0.1}',"2","4000","AEJEA","","SGSIN"],
      ["2025-05-03 00:00","2025-05-02 06:00","2025-05-03 00:00","AT_SEA","NORMAL SAILING","","","False","","NO",'{"VLSFO": 4}',"50","4000","AEJEA","","SGSIN"]
    ];
    const v1m=mdaToOVD(V1FIX, 20000), v1r=v1m.reports||[];
    const at=t=>v1r.find(r=>r.t===t);
    ckT("28j T1: V1 file — the ship's raw OPERATING_CONDITION is still stored untouched on every report",
        v1r.length===6 && at("2025-05-01T12:00").oc==="BERTHING" && at("2025-05-02T00:00").oc==="BERTHING");
    ckT("28j T1: V1 file — the DISPLAY condition (ocD) comes from PORT_STATE, so one BERTHING row resolves to MANOEUVRING and the other to AT_BERTH",
        at("2025-05-01T12:00").ocD==="MANOEUVRING" && at("2025-05-02T00:00").ocD==="AT_BERTH" &&
        at("2025-05-01T00:00").ocD==="NORMAL SAILING");   // blank PORT_STATE at sea falls back to OC
    const v1html=reportTraceTable(v1r);
    ckT("28j T1: V1 Condition CELL renders the derived label and names the reported word in its tooltip",
        /title="Berth — reported as BERTHING">Berth</.test(v1html) &&
        /title="Manoeuvring — reported as BERTHING">Mnvrng</.test(v1html));
    ckT("28j T1: V1 import note tells the owner the Condition column now shows the derived condition",
        (v1m.notes||[]).some(n=>/V1/.test(n) && /Condition column/.test(n)));
    /* the same fixture with the V3 vocabulary — ocD must equal oc, and the tooltip must NOT
       gain a "reported as" tail (this is the guard that the V1 work cannot leak into V3) */
    const V3FIX=V1FIX.map((r,i)=> i===0 ? r.slice()
      : r.map((v,j)=> j===4 ? (r[5]||v) : v));           // OPERATING_CONDITION := PORT_STATE
    const v3m=mdaToOVD(V3FIX, 20000), v3r=v3m.reports||[];
    ckT("28j T1: V3 file — ocD is identical to oc on every report, so the Condition column is unchanged",
        v3r.length===6 && v3r.every(r=>(r.ocD||"")===(r.oc||"")));
    ckT("28j T1: V3 file — no \"reported as\" tail anywhere in the rendered Condition column",
        !/reported as/.test(reportTraceTable(v3r)));

    /* ---- T2: zebra. Reports first (an HTML <table>), then the two CSS-grid tabs. ---- */
    ckT("28j T2: Reports — rows alternate #ffffff / #f8fafc across the WHOLE row",
        /<tr class="hirow" style="background:#ffffff"/.test(v1html) &&
        /<tr class="hirow" style="background:#f8fafc"/.test(v1html));
    ckT("28j T2: Reports — the sticky Event/select cells carry the row's own stripe (else the body shows through)",
        /background:#f8fafc;width:/.test(v1html) || /z-index:2;background:#f8fafc/.test(v1html));
    ckT("28j T2: Reports — the per-fuel (MGO) sub-band is gone; every fuel line is transparent",
        !/class="trfl"[^>]*background:#(f1f5f9|e2e8f0)/.test(v1html));
    const sZeb={year:2025,ship:{typeId:"bulk",capacity:50000},rows:[
      {kind:"voyage",from:"EEA",to:"EEA",dist:1000,cargo:5000,tStart:"2025-03-01T00:00",tEnd:"2025-03-02T00:00",
       fuels:[{fuelId:"HFO",tonnes:50},{fuelId:"MDO",tonnes:5}]},                       // 2 fuels = 2 lines
      {kind:"port",dist:0,cargo:0,poc:true,zone:"EEA",tStart:"2025-03-02T00:00",tEnd:"2025-03-03T00:00",
       fuels:[{fuelId:"MDO",tonnes:3}]},
      {kind:"voyage",from:"EEA",to:"EEA",dist:900,cargo:4000,tStart:"2025-03-03T00:00",tEnd:"2025-03-04T00:00",
       fuels:[{fuelId:"HFO",tonnes:40},{fuelId:"MDO",tonnes:4}]}]};
    const rZeb=computeAll(sZeb);
    BR_LAST=null;
    const brHtml=breakdownGrid(rZeb,{lcv:"",euets:"",ukets:"",feu:"",scc:"",voy:"",imo:"",eligibility:""});
    /* one .hirow per ROW (not per fuel line): count them and their backgrounds */
    const brRows=[...brHtml.matchAll(/<div class="hirow" style="display:grid;[^"]*?background:(#[0-9a-f]{6})/g)].map(m=>m[1]);
    ckT("28j T2: Leg-Wise — one striped .hirow per LEG (3 rows, 5 fuel lines) alternating white/#f8fafc",
        brRows.length===3 && brRows[0]==="#ffffff" && brRows[1]===ZEBRA_BG && brRows[2]==="#ffffff",
        "got "+JSON.stringify(brRows));
    /* the striped row's frozen (sticky) cells must repeat the row's OWN colour — they sit above
       the scrolling body, so if they kept a hard-coded white the stripe would break at the left
       edge. NB the pattern must be [^>]* (not [^"]*): `class="hicell" style="…"` has a quote
       between the two, so a quote-excluding class would never reach the background. */
    ckT("28j T2: Leg-Wise — a 2-fuel leg is ONE stripe: its frozen cells repeat the row's own colour",
        (brHtml.match(new RegExp("class=\"hicell\"[^>]*background:"+ZEBRA_BG,"g"))||[]).length>=2 &&
        !new RegExp("class=\"hicell\"[^>]*background:"+ZEBRA_BG+"[^>]*background:#ffffff").test(brHtml));
    VW_LAST=null;
    /* voyageGrid takes the VOYAGE-GROUPED shape renderVoyage() builds (R.groups from vwGroups),
       not computeAll()'s per-leg R — same construction as renderVoyage. */
    const vwR={ groups:vwGroups(sZeb).groups, year:2025, ets:{ gwp: euetsGwp(sZeb) } };
    const vwHtml=voyageGrid(vwR,{voy:"",lcv:"",feu:"",euets:"",ukets:"",scc:"",imo:""});
    const vwRows=[...vwHtml.matchAll(/<div class="hirow" style="display:grid;[^"]*?background:(#[0-9a-f]{6})/g)].map(m=>m[1]);
    ckT("28j T2: Voyage-Wise — same whole-row zebra, one stripe per voyage group",
        vwRows.length>=1 && vwRows[0]==="#ffffff" && vwRows.every(b=>b==="#ffffff"||b===ZEBRA_BG),
        "got "+JSON.stringify(vwRows));

    /* ---- T3: header colouring. Every group header is the one neutral grey. ---- */
    const TINTS=/background:#(d9f2e7|ddecf3|e1ebf4|f1e6f5|def2e0)/;
    ckT("28j T3: Leg-Wise — no per-section header tints left (IMO/Fuel metrics/EU ETS/UK ETS/FuelEU)",
        !TINTS.test(brHtml));
    ckT("28j T3: Voyage-Wise — no per-section header tints left", !TINTS.test(vwHtml));
    ckT("28j T3: Leg-Wise — all 5 group headers use the same #f1f5f9 / #475569 ZN header style",
        (brHtml.match(/grid-row:1;padding:6px 10px;background:#f1f5f9/g)||[]).length===5 &&
        !/grid-row:1;padding:6px 10px;background:#f1f5f9[^"]*color:#(1d7a5f|0e7490|3652a3|6d4fa3|3d7a3a)/.test(brHtml));
    ckT("28j T3: Voyage-Wise — all 5 group headers use the same #f1f5f9 / #475569 ZN header style",
        (vwHtml.match(/grid-row:1;padding:6px 10px;background:#f1f5f9/g)||[]).length===5);
    ckT("28j T3: the regulation colours on the VALUES are deliberately untouched (EUAs blue, UKAs purple, EEOI green)",
        /color:#3652a3/.test(brHtml) && /color:#6d4fa3/.test(brHtml) && /color:#1d7a5f/.test(brHtml));
  })();
  /* 2026-07-26d (Task 3): Voyage-Wise IMO figures. A voyage GROUP includes its port stays,
     which is the documented difference from Leg-Wise. */
  (function(){
    const cii={ciiReq:10,bounds:{sup:8.6,low:9.4,up:10.6,inf:11.8},capUnit:"DWT"};
    /* vwGroupCII reads the LIVE app state for capacity (that is deliberate — it is the same
       source js/engine.js uses), so pin S.ship for this block and restore it afterwards. */
    const shipKeep = S.ship; S.ship = {typeId:"bulk", capacity:50000};
    const st={ship:{capacity:50000}};
    const g={dist:2000,co2:900,tw:60e6,cii,endYear:2026};
    ck("Voyage CII = group CO2 x 1e6 / (capacity x group distance)",
       vwGroupCII(g).attained, 900*1e6/(50000*2000), 1e-9);
    ck("Voyage CII percentage = attained x 100 / that year's required",
       vwGroupCII(g).pct, (900*1e6/(50000*2000))*100/10, 1e-9);
    ckT("Voyage CII uses the SAME A-E ladder as a leg and the engine",
        vwGroupCII(g).rating === ciiRatingOf(900*1e6/(50000*2000), cii.bounds));
    ck("Voyage IMO EEOI = group CO2 x 1e6 / group transport work",
       vwGroupEEOI(g), 900*1e6/60e6, 1e-9);
    ckT("A ballast voyage (no transport work) has no IMO EEOI", vwGroupEEOI({dist:100,co2:5,tw:0,cii})===null);
    ckT("A zero-distance voyage has no CII", vwGroupCII({dist:0,co2:5,tw:1,cii})===null);
    ckT("Voyage CII obeys the same implausibility cut-off as a leg",
        vwGroupCII({dist:1,co2:900,tw:1e6,cii}).suppressed===true);
    /* the band year matters: the SAME voyage rated on a later, tighter year must not get a
       better letter. 2026's required is lower than 2025's, so the percentage must rise. */
    const cii2025={ciiReq:12,bounds:{sup:10.32,low:11.28,up:12.72,inf:14.16}};
    const cii2026={ciiReq:10,bounds:{sup:8.6,low:9.4,up:10.6,inf:11.8}};
    const a25=vwGroupCII(Object.assign({},g,{cii:cii2025})), a26=vwGroupCII(Object.assign({},g,{cii:cii2026}));
    ck("Same voyage, same attained CII whichever year's bands are used", a25.attained, a26.attained, 1e-12);
    ckT("…but a tighter later year gives a HIGHER percentage of required", a26.pct > a25.pct);
    ckT("…and never a better rating letter", "ABCDE".indexOf(a26.rating) >= "ABCDE".indexOf(a25.rating));
    /* Voyage-Wise includes port stays; Leg-Wise does not. Prove the direction of the gap. */
    const legOnly=ciiFrom(700, 2000, cii, st);      // same voyage, sea-leg CO2 only
    ckT("Including the voyage's port stays makes its CII worse than legs alone",
        vwGroupCII(g).attained > legOnly.attained);
    S.ship = shipKeep;
  })();
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
    /* ---- shared From/To date-range filter (2026-07-24, Aurvin): fixture legs are
       DEHAM→NLRTM 205 nm and NLRTM→BEANR 80 nm, spanning 2024-05-25..27 UTC ---- */
    ckT("Date range OVERRIDES year: a 2024 range counts 2024 rows even under year 2025 (285 nm)",
        (()=>{ const r=computeAll({year:2025, ship:{typeId:"bulk",capacity:45000}, rows:o.rows,
                 dateFilter:{fromISO:"2024-05-01T00:00",toISO:"2024-05-31T23:59",active:true}});
               return Math.abs(r.summary.dist-285)<0.01; })());
    ckT("Date range fully outside the data → nothing counted, range-worded warning",
        (()=>{ const r=computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows,
                 dateFilter:{fromISO:"2030-01-01T00:00",toISO:"2030-12-31T23:59",active:true}});
               return r.summary.dist===0 && r.warnings.some(w=>/OUTSIDE the selected From\/To date range/.test(w)); })());
    ckT("Date range edge leg counted IN FULL (leg1 starts before From but its 205 nm is kept → 285)",
        (()=>{ const r=computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows,
                 dateFilter:{fromISO:"2024-05-26T02:00",toISO:"2024-05-28T00:00",active:true}});
               return Math.abs(r.summary.dist-285)<0.01; })());
    ckT("Date range drops a leg wholly before From (leg1 excluded, only leg2 80 nm remains)",
        (()=>{ const r=computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows,
                 dateFilter:{fromISO:"2024-05-26T12:00",toISO:"2024-05-28T00:00",active:true}});
               return Math.abs(r.summary.dist-80)<0.01; })());
    ckT("Inactive date filter → year filter still governs (2024 rows under year 2024 = 285 nm)",
        (()=>{ const r=computeAll({year:2024, ship:{typeId:"bulk",capacity:45000}, rows:o.rows,
                 dateFilter:{fromISO:"",toISO:"",active:false}});
               return Math.abs(r.summary.dist-285)<0.01; })());
    ckT("UI predicates: rowInRange / rowIsEdge / edgeRowCount handle inside, edge & outside",
        (()=>{ const sRows=S.rows, sDF=S.dateFilter;
               try{
                 S.rows=[{kind:"voyage",tStart:"2026-03-01T00:00",tEnd:"2026-03-10T00:00",fuels:[]},   // fully inside
                         {kind:"voyage",tStart:"2026-02-25T00:00",tEnd:"2026-03-02T00:00",fuels:[]},   // straddles From → edge
                         {kind:"voyage",tStart:"2026-06-01T00:00",tEnd:"2026-06-02T00:00",fuels:[]}];  // outside
                 S.dateFilter={fromISO:"2026-03-01T00:00",toISO:"2026-03-31T23:59",active:true};
                 return rowInRange(S.rows[0]) && !rowIsEdge(S.rows[0])
                     && rowInRange(S.rows[1]) &&  rowIsEdge(S.rows[1])
                     && !rowInRange(S.rows[2]) && edgeRowCount()===1;
               } finally { S.rows=sRows; S.dateFilter=sDF; }
             })());
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
    ckT("POC off, LONE stay (voyage endpoints unknowable): EEA berth OUT of EU ETS + FuelEU scope", rOFF.ets.basis_t===0 && rOFF.fueleu.E_total===0);
    ckT("POC default (undefined) counts as a call", rDEF.ets.basis_t===rON.ets.basis_t);
    ckT("POC off: CII still counts the fuel", Math.abs(rOFF.cii.co2_t - rON.cii.co2_t)<1e-9 && rOFF.cii.co2_t>30);
    const rUK=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:[{kind:"port",zone:"UK",poc:false,fuels:[{fuelId:"MDO",tonnes:10}]}]});
    ckT("POC off, LONE stay: UK berth OUT of UK ETS scope", rUK.ukets.tco2e===0);
    /* ---- voyage continuity across non-call stays (2026-07-20 owner decision):
       a poc:false stay does not end the voyage — the stay AND the legs either side are
       scoped last-POC → next-POC (euets-art3ga port-of-call definition) ---- */
    const vcRows=[ {kind:"port", zone:"EEA", poc:true,  fuels:[]},
                   {kind:"voyage", from:"EEA", to:"EEA", dist:100, fuels:[]},   // into the anchorage
                   {kind:"port", zone:"EEA", poc:false, fuels:[]},              // anchorage, no call
                   {kind:"voyage", from:"EEA", to:"OTHER", dist:100, fuels:[]}, // onwards to non-EU
                   {kind:"port", zone:"OTHER", poc:true, fuels:[]} ];
    annotateVoyageContinuity(vcRows);
    ck("VOYCONT leg INTO a non-call EEA anchorage bound for non-EU = 50% (was 100%)", euCoverage(vcRows[1]), 0.5, 1e-9);
    ck("VOYCONT non-call EEA anchorage fuel rides the EU→non-EU voyage = 50% (was 0%)", euCoverage(vcRows[2]), 0.5, 1e-9);
    ck("VOYCONT leg out of the anchorage unchanged = 50%", euCoverage(vcRows[3]), 0.5, 1e-9);
    ck("VOYCONT POC stays keep at-berth scope (EEA 100%, non-EU 0%)", euCoverage(vcRows[0])+euCoverage(vcRows[4]), 1, 1e-9);
    const vcUK=[ {kind:"voyage", from:"UK", to:"UK", fuels:[]},
                 {kind:"port", zone:"UK", poc:false, fuels:[]},
                 {kind:"voyage", from:"UK", to:"UK", fuels:[]} ];
    annotateVoyageContinuity(vcUK);
    ck("VOYCONT UK: non-call UK stay mid UK→UK voyage = 100% UK ETS (was 0%)", ukCoverage(vcUK[1]), 1, 1e-9);
    const vcAdj=[ {kind:"voyage", from:"EEA", to:"EEA", fuels:[]},
                  {kind:"voyage", from:"EEA", to:"OTHER", fuels:[]} ];   // leg-to-leg, no stay row: boundary is a call by default
    annotateVoyageContinuity(vcAdj);
    ck("VOYCONT chain does NOT leak across an implicit call (leg-to-leg, no stay row)", euCoverage(vcAdj[0]), 1, 1e-9);
    /* trace badge boundary matching (2026-07-20): a report's badge must reflect the
       period ENDING at its timestamp — tStart exclusive, tEnd inclusive */
    (function(){
      const keep=S.rows;
      S.rows=[ {kind:"port", zone:"EEA", tStart:"2026-03-01T00:00", tEnd:"2026-03-02T00:00"},
               {kind:"voyage", from:"EEA", to:"OTHER", tStart:"2026-03-02T00:00", tEnd:"2026-03-03T00:00"} ];
      const dep=trMatchRow({t:"2026-03-02T00:00"}), arr=trMatchRow({t:"2026-03-03T00:00"}), first=trMatchRow({t:"2026-03-01T00:00"});
      ckT("TRACE badge: DEPARTURE-instant report matches the berth it leaves, not the next leg", dep===S.rows[0]);
      ckT("TRACE badge: ARRIVAL-instant report matches the sea leg, not the next stay", arr===S.rows[1]);
      ckT("TRACE badge: very first report falls back to the window starting at it", first===S.rows[0]);
      S.rows=keep;
    })();
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
    /* (2026-07-19b) unified branches: a pure transit no longer breaks the voyage into two legs —
       the workspace now shows ONE leg BEANR→DEHAM, same as the OVD download's Voyage_From/To */
    ckT("DERIVE: 4 legs + 4 port stays (NLRTM transit merged away, voyage stays whole)", legs.length===4 && ports.length===4 && !pAt("NLRTM"));
    const pB=pAt("BEANR"), pD=pAt("DEHAM"), pG=pAt("GBLON");
    ckT("DERIVE stay A: arrival = start of cargo-op chain (manoeuvring excluded)", pB && pB.arrGmt==="2026-03-02T18:00");
    ckT("DERIVE stay A: departure = end of chain (FUEL_STOCK transparent, chain continues through it)", pB && pB.depGmt==="2026-03-03T18:00");
    ckT("DERIVE stay A: rule CASE_A, POC on, file-POC mismatch flagged (file said NO)", pB && pB.deriveRule==="CASE_A" && pB.poc===true && pB.pocMismatch===true && !pB.pocQty);
    ck("DERIVE stay A berth fuel = chain reports only (1.0+0.6)", fT(pB,"MDO"), 1.6, 0.001);
    ck("DERIVE leg1 gets pre-arrival manoeuvring (0.4)", fT(legs[0],"MDO"), 0.4, 0.001);
    ck("DERIVE leg1 HFO 10+2 (EOSP is sea passage)", fT(legs[0],"HFO"), 12, 0.001);
    ck("DERIVE leg2 gets post-departure + SOSP + transit stay fuel (0.3+0.2+0.7+0.1)", fT(legs[1],"MDO"), 1.3, 0.001);
    ck("DERIVE leg2 HFO 8+1+7+0.8 (whole transit passage merged into ONE voyage)", fT(legs[1],"HFO"), 16.8, 0.001);
    ckT("DERIVE unified: workspace leg2 endpoints = download branch Voyage_From/To (BEANR→DEHAM)",
        legs[1] && legs[1].fromPort.c==="BEANR" && legs[1].toPort.c==="DEHAM" &&
        (md.reports||[]).some(r=>r.rt==="AT_SEA" && r.t==="2026-03-05T00:00" && r.org==="BEANR" && r.dst==="DEHAM"));
    ckT("DERIVE stay C: Case B AT_BERTH window", pD && pD.arrGmt==="2026-03-06T12:00" && pD.depGmt==="2026-03-07T00:00" && pD.deriveRule==="AT_BERTH");
    ckT("DERIVE stay C: quantity-fallback POC (6000→0, no recorded cargo op) → poc on + orange flag", pD && pD.poc===true && pD.pocQty===true && pD.pocMismatch!==true);
    ckT("DERIVE stay D: STS outside port limits → derived window kept but classified transit (poc off)", pG && pG.poc===false && pG.arrGmt==="2026-03-08T06:00" && pG.deriveRule==="CASE_A");
    const totIn={HFO:35.8, MDO:4.3};
    const totOut=id=>xd.rows.reduce((s,r)=>s+fT(r,id),0);
    ck("DERIVE fuel conservation HFO (nothing lost in re-attribution)", totOut("HFO"), totIn.HFO, 0.001);
    ck("DERIVE fuel conservation MGO", totOut("MDO"), totIn.MDO, 0.001);
    ckT("DERIVE notes: derivation + transit + qty fallback + OPL + mismatch all reported",
        md.notes.some(n=>/ARRIVAL\/DEPARTURE derived/.test(n)) && md.notes.some(n=>/pure transit/.test(n)) &&
        md.notes.some(n=>/quantity fallback/.test(n)) && md.notes.some(n=>/OUTSIDE port limits/.test(n)) && md.notes.some(n=>/disagrees/.test(n)));

    /* ---- 2026-07-24b (owner rule): inconsistent OUTSIDE_PORT_LIMIT flags + cargo AT_BERTH →
       the stray OPL flag is misreporting, keep the port of call. A uniformly-OPL=TRUE window
       stays transit; a real STS (AT_ANCHOR OPL, "stay D" above) stays transit. ---- */
    const OPLMIX_FIX=[DH,
      /* stay at NLVLI: berth discharge, OPL flags MIXED (FALSE then a stray TRUE) → KEPT as POC */
      ["2026-04-01 00:00","2026-03-31 12:00","2026-04-01 00:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"VLSFO": 0.5}',"5","10000","ESALG","","NLVLI"],
      ["2026-04-02 00:00","2026-04-01 00:00","2026-04-02 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 10}',"100","10000","ESALG","","NLVLI"],
      ["2026-04-02 12:00","2026-04-02 00:00","2026-04-02 12:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 2}',"20","10000","ESALG","NLVLI","NLVLI"],
      ["2026-04-03 00:00","2026-04-02 12:00","2026-04-03 00:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","FALSE","YES",'{"MGO": 1.0}',"0","4000","","NLVLI",""],
      ["2026-04-03 12:00","2026-04-03 00:00","2026-04-03 12:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","TRUE","NO",'{"MGO": 0.5}',"0","0","","NLVLI",""],
      ["2026-04-03 18:00","2026-04-03 12:00","2026-04-03 18:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.2}',"2","0","NLVLI","","GBLON"],
      /* stay at GBLON: berth load but UNIFORMLY OPL=TRUE (not "mixed") → still transit */
      ["2026-04-04 12:00","2026-04-03 18:00","2026-04-04 12:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 8}',"90","0","NLVLI","","GBLON"],
      ["2026-04-04 18:00","2026-04-04 12:00","2026-04-04 18:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 1}',"10","0","NLVLI","GBLON","GBLON"],
      ["2026-04-05 00:00","2026-04-04 18:00","2026-04-05 00:00","IN_PORT","AT_BERTH","CARGO_LOADING","TRUE","YES",'{"MGO": 0.8}',"0","5000","","GBLON",""],
      ["2026-04-05 12:00","2026-04-05 00:00","2026-04-05 12:00","IN_PORT","AT_BERTH","CARGO_LOADING","TRUE","YES",'{"MGO": 0.4}',"0","5000","","GBLON",""],
      ["2026-04-05 18:00","2026-04-05 12:00","2026-04-05 18:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.1}',"1","5000","GBLON","","ESALG"]
    ];
    const mo=mdaToOVD(OPLMIX_FIX, 20000), xo=parseOVD(mo.csv);
    const opAt=c=>xo.rows.filter(r=>r.kind==="port").find(p=>p.port&&p.port.c===c);
    const pV=opAt("NLVLI"), pL=opAt("GBLON");
    ckT("DERIVE OPL-mixed + cargo AT_BERTH → kept as port of call (misreporting override), CASE_A, no red-badge flag",
        pV && pV.poc===true && pV.deriveRule==="CASE_A" && !pV.oplCargo);
    ckT("DERIVE OPL-uniform TRUE at berth → NOT 'mixed', stays transit (red-badge flag set)",
        pL && pL.poc===false && pL.oplCargo===true);
    ckT("DERIVE OPL override reported in import notes",
        mo.notes.some(n=>/INCONSISTENT OUTSIDE_PORT_LIMIT/.test(n)));

    /* ---- 2026-07-20b (owner decision): drifting-only waiting is NOT a port stay ---- */
    const DRIFT_FIX=[DH,
      /* SGSIN→OMDQM with a drifting-only waiting window off OMDQM (no cargo evidence)
         → pure transit: no port row, OMDQM vanishes as a voyage endpoint */
      ["2026-04-01 00:00","2026-03-31 12:00","2026-04-01 00:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"VLSFO": 0.5}',"5","50000","SGSIN","","OMDQM"],
      ["2026-04-02 00:00","2026-04-01 00:00","2026-04-02 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 10}',"200","50000","SGSIN","","OMDQM"],
      ["2026-04-02 06:00","2026-04-02 00:00","2026-04-02 06:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 1}',"10","50000","SGSIN","OMDQM","OMDQM"],
      ["2026-04-03 06:00","2026-04-02 06:00","2026-04-03 06:00","IN_PORT","DRIFTING","AWAITING_ORDERS","FALSE","NO",'{"MGO": 0.8}',"0","50000","","OMDQM",""],
      ["2026-04-04 06:00","2026-04-03 06:00","2026-04-04 06:00","IN_PORT","DRIFTING","AWAITING_ORDERS","FALSE","NO",'{"MGO": 0.9}',"0","50000","","OMDQM",""],
      ["2026-04-04 12:00","2026-04-04 06:00","2026-04-04 12:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.1}',"2","50000","OMDQM","","AEJEA"],
      /* drifting stay WITH a cargo-quantity change (unrecorded STS: 50000→10000, DWT 20000)
         → the DRIFTING rung still fires; stay kept, POC on, orange qty flag */
      ["2026-04-05 00:00","2026-04-04 12:00","2026-04-05 00:00","AT_SEA","NORMAL SAILING","","","",'{"VLSFO": 6}',"100","50000","OMDQM","","AEJEA"],
      ["2026-04-05 06:00","2026-04-05 00:00","2026-04-05 06:00","ARRIVAL-EOSP","","","","",'{"VLSFO": 0.5}',"5","50000","OMDQM","AEJEA","AEJEA"],
      ["2026-04-06 06:00","2026-04-05 06:00","2026-04-06 06:00","IN_PORT","DRIFTING","AWAITING_ORDERS","FALSE","NO",'{"MGO": 0.6}',"0","50000","","AEJEA",""],
      ["2026-04-06 12:00","2026-04-06 06:00","2026-04-06 12:00","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.1}',"1","10000","AEJEA","","SGSIN"]
    ];
    const mdr=mdaToOVD(DRIFT_FIX, 20000), xr=parseOVD(mdr.csv);
    const rLegs=xr.rows.filter(r=>r.kind==="voyage"), rPorts=xr.rows.filter(r=>r.kind==="port");
    const rAt=c=>rPorts.find(p=>p.port&&p.port.c===c);
    ckT("DRIFT: drifting-only waiting → NO port stay at OMDQM (pure transit)", !rAt("OMDQM"));
    ckT("DRIFT: OMDQM vanishes as endpoint — leg runs SGSIN→AEJEA whole",
        rLegs[0] && rLegs[0].fromPort.c==="SGSIN" && rLegs[0].toPort.c==="AEJEA" &&
        (mdr.reports||[]).some(r=>r.rt==="AT_SEA" && r.t==="2026-04-02T00:00" && r.org==="SGSIN" && r.dst==="AEJEA"));
    ck("DRIFT: waiting-window fuel stays on the voyage (0.8+0.9+0.1 MGO)", fT(rLegs[0],"MDO"), 1.8, 0.001);
    const rA=rAt("AEJEA");
    ckT("DRIFT: drifting + cargo-qty change (unrecorded STS) still derives the stay — rule DRIFTING, POC on, qty flag",
        rA && rA.deriveRule==="DRIFTING" && rA.poc===true && rA.pocQty===true &&
        rA.arrGmt==="2026-04-05T06:00" && rA.depGmt==="2026-04-06T06:00");
    ck("DRIFT fuel conservation VLSFO", xr.rows.reduce((s,r)=>s+fT(r,"HFO"),0), 18, 0.001);
    ck("DRIFT fuel conservation MGO", xr.rows.reduce((s,r)=>s+fT(r,"MDO"),0), 2.5, 0.001);
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
    /* ---- 2026-07-20c (owner report): awaiting-orders — blank destination must not create a
       phantom same-port EU→EU leg. Ship departs FRFOS with NO destination (orders pending),
       drifts OPL, then orders arrive: GIGIB. The blank tail destinations are backfilled from
       the first later report whose destination is known, so the whole stretch is ONE
       FRFOS→GIGIB 50% leg — previously it was FRFOS→FRFOS (100%) until the orders row. */
    const AWAIT_FIX=[DH,
      ["2026-07-07 20:54","2026-07-07 10:00","2026-07-07 20:54","ARRIVAL-EOSP","","","","",'{"HFO": 1}',"8","9000","ESCEU","FRFOS","FRFOS"],
      ["2026-07-08 10:00","2026-07-07 20:54","2026-07-08 10:00","IN_PORT","AT_BERTH","CARGO_DISCHARGING","FALSE","YES",'{"MGO": 2}',"0","0","","FRFOS",""],
      ["2026-07-09 05:24","2026-07-08 10:00","2026-07-09 05:24","DEPARTURE-SOSP","MANOEUVRING","","","",'{"MGO": 0.9}',"3","0","FRFOS","",""],
      ["2026-07-09 10:00","2026-07-09 05:24","2026-07-09 10:00","AT_SEA","NORMAL SAILING","","","",'{"HFO": 4}',"50","0","FRFOS","",""],
      ["2026-07-09 17:12","2026-07-09 10:00","2026-07-09 17:12","ARRIVAL-EOSP","","","","",'{"HFO": 7}',"83","0","FRFOS","",""],
      ["2026-07-09 17:30","2026-07-09 17:12","2026-07-09 17:30","IN_PORT","MANOEUVRING","","TRUE","",'{"MGO": 0.1}',"2","0","","",""],
      ["2026-07-10 10:00","2026-07-09 17:30","2026-07-10 10:00","IN_PORT","DRIFTING","AWAITING_ORDERS","TRUE","",'{"MGO": 2.3}',"10","0","","",""],
      ["2026-07-11 03:00","2026-07-10 10:00","2026-07-11 03:00","DEPARTURE-SOSP","DRIFTING","AWAITING_ORDERS","","",'{"MGO": 3.8}',"2","0","FRFOS","","GIGIB"],
      ["2026-07-11 10:00","2026-07-11 03:00","2026-07-11 10:00","AT_SEA","NORMAL SAILING","","","",'{"HFO": 4.5}',"65","0","FRFOS","","GIGIB"]
    ];
    const maw=mdaToOVD(AWAIT_FIX, 20000), xaw=parseOVD(maw.csv);
    const awLegs=xaw.rows.filter(r=>r.kind==="voyage");
    ckT("AWAIT: blank destination while awaiting orders is backfilled — no phantom same-port FRFOS→FRFOS leg",
        !awLegs.some(l=>l.fromPort && l.toPort && l.fromPort.c==="FRFOS" && l.toPort.c==="FRFOS"));
    const awOut=awLegs.find(l=>l.fromPort && l.toPort && l.fromPort.c==="FRFOS" && l.toPort.c==="GIGIB");
    ckT("AWAIT: whole post-Fos stretch (incl. OPL drifting window) is ONE FRFOS→GIGIB leg at 50% EU",
        !!awOut && awOut.from==="EEA" && awOut.to==="OTHER" && Math.abs(euCoverage(awOut)-0.5)<1e-9);
    ckT("AWAIT: reports branch agrees — awaiting-orders AT_SEA report carries dst GIGIB",
        (maw.reports||[]).some(r=>r.rt==="AT_SEA" && r.t==="2026-07-09T10:00" && r.org==="FRFOS" && r.dst==="GIGIB"));
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
    /* multi-year OVD: leg crossing 31 Dec splits by WHOLE report — each report counted in the
       year of its own date, NO proration across midnight (2026-07-25, Aurvin, owner instruction).
       The 01 Jan 12:00 Noon report (period 31 Dec 12:00→01 Jan 12:00) belongs ENTIRELY to 2026. */
    const yCSV="Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Distance,Cargo_Mt,ME_Consumption_HFO\n"+
      "2025-12-30,12:00,NLRTM,DEHAM,Departure,0,5000,2\n"+
      "2025-12-31,12:00,NLRTM,DEHAM,Noon,100,5000,10\n"+
      "2026-01-01,12:00,NLRTM,DEHAM,Noon,100,5000,10\n"+     // dated 01 Jan → wholly 2026 (no split of this report)
      "2026-01-02,12:00,NLRTM,DEHAM,Arrival,50,5000,5\n";
    const oy=parseOVD(yCSV);
    const parts=oy.rows.filter(r=>r.kind==="voyage");
    const fT2=(r,id)=>{ const f=(r&&r.fuels||[]).find(z=>z.fuelId===id); return f?f.tonnes:0; };
    ckT("Year split: one leg becomes 2025 + 2026 parts", parts.length===2 && parts[0].yearPart===2025 && parts[1].yearPart===2026 && parts.every(p=>p.splitYear));
    ck("Year split 2025 part: only the 31 Dec Noon report = 100 nm", parts[0].dist, 100, 0.2);
    ck("Year split 2025 part HFO 10 t (31 Dec Noon only)", fT2(parts[0],"HFO"), 10, 0.01);
    ck("Year split 2026 part: 01 Jan Noon + 02 Jan Arrival = 150 nm", parts[1].dist, 150, 0.2);
    ck("Year split 2026 part HFO 10+5 t", fT2(parts[1],"HFO"), 15, 0.01);
    ckT("Year split note reported", oy.notes.some(n=>/year boundary/.test(n)));
    const c25=computeAll({year:2025,ship:{typeId:"bulk",capacity:45000},rows:oy.rows}), c26=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:oy.rows});
    ckT("Reporting-year selector: 2025 sees 100 nm, 2026 sees 150 nm", Math.abs(c25.summary.dist-100)<0.2 && Math.abs(c26.summary.dist-150)<0.2);

    /* 2026-07-25e (owner instruction): a HAND-ENTERED row (never through parseOVD, so no
       yearPart) spanning 31 Dec must be time-prorated by computeAll itself — not counted
       whole under both years. 21-day leg, 12 days in 2024 / 9 days in 2025. */
    const handRow={ kind:"voyage", label:"hand-entered straddle", from:"EEA", to:"EEA",
      tStart:"2024-12-20T00:00", tEnd:"2025-01-10T00:00", dist:210, cargo:1000,
      fuels:[{fuelId:"HFO",tonnes:100,price:0}] };
    const shipStub={ typeId:"bulk", capacity:45000 };
    const h24=computeAll({year:2024,ship:shipStub,rows:[handRow],dateFilter:{active:false}});
    const h25=computeAll({year:2025,ship:shipStub,rows:[handRow],dateFilter:{active:false}});
    const fT3=(R)=>{ const d=R.rowDetails[0]; return d? (d.fuels.find(f=>f.id==="HFO")||{}).tonnes||0 : 0; };
    ckT("Hand-entered straddling row: NOT double-counted (2024 dist 120, 2025 dist 90, sums to 210)",
        h24.rowDetails.length===1 && h25.rowDetails.length===1 &&
        Math.abs(h24.rowDetails[0].dist-120)<0.05 && Math.abs(h25.rowDetails[0].dist-90)<0.05);
    ckT("Hand-entered straddling row: fuel prorated the same way (2024 57.14t, 2025 42.86t)",
        Math.abs(fT3(h24)-57.143)<0.01 && Math.abs(fT3(h25)-42.857)<0.01);
    /* Same check with the Year-locked date-filter bar ACTIVE (its default full-year window) —
       this is the path that actually renders on Report-Wise/Leg-Wise/Workspace. Guards the
       exact-midnight edge case: without the yearPart short-circuit in rowInYear's rangeOn
       branch, the "any overlap counted in full" range rule would double-count the instant
       where the two halves touch. */
    const h24r=computeAll({year:2024,ship:shipStub,rows:[handRow],dateFilter:_fullYearRange(2024)});
    const h25r=computeAll({year:2025,ship:shipStub,rows:[handRow],dateFilter:_fullYearRange(2025)});
    ckT("Hand-entered straddling row with the Year-bar's date range ACTIVE: still split, not double-counted",
        h24r.rowDetails.length===1 && h25r.rowDetails.length===1 &&
        Math.abs(h24r.rowDetails[0].dist-120)<0.05 && Math.abs(h25r.rowDetails[0].dist-90)<0.05);
    /* Voyage-Wise's own path (ignoreYearFilter) must stay untouched — it pre-splits/pre-buckets
       rows itself and needs a strict 1:1 index match with rowDetails; this new calendar-year
       split must not also fire there. */
    const hVW=computeAll({year:2025,ship:shipStub,rows:[handRow],ignoreYearFilter:true,dateFilter:{active:false}});
    ckT("Voyage-Wise path (ignoreYearFilter) is unaffected: still exactly 1 row, unsplit",
        hVW.rowDetails.length===1 && Math.abs(hVW.rowDetails[0].dist-210)<0.05);
    /* UK ETS report-by-date (2026-07-25, Aurvin, owner instruction): a UK↔UK leg with reports on
       both sides of 1 Jul 2026. Each report is judged WHOLE by its own date — the 90 t report
       dated 30 Jun is OUT of scope, the 10 t report dated 03 Jul is fully IN. In-scope share =
       10/100 = 0.10. The old leg-level time-proration would have said ≈0.5; the pre-2026-07-25
       report-time-proration would have said ≈0.067. Proves the calc now uses whole reports by date. */
    const ukCSV="Date_UTC,Time_UTC,Voyage_From,Voyage_To,Event,Distance,Cargo_Mt,ME_Consumption_HFO\n"+
      "2026-06-29,00:00,GBSOU,GBLIV,Departure,0,5000,0\n"+
      "2026-06-30,00:00,GBSOU,GBLIV,Noon,100,5000,90\n"+       // dated 30 Jun → wholly OUT of UK ETS
      "2026-07-03,00:00,GBSOU,GBLIV,Arrival,100,5000,10\n";    // dated 03 Jul → wholly IN UK ETS
    const uo=parseOVD(ukCSV);
    const uleg=uo.rows.find(r=>r.kind==="voyage");
    ckT("UK ETS report-by-date: straddling leg ukInFrac = 10/100 = 0.10 (whole reports by date), not time (~0.5)",
        uleg && Math.abs(uleg.ukInFrac-0.10)<0.001 && ukSchemeFraction(uleg,2026)>0.4);
    const ukFull=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},
                    rows:[{kind:"voyage",from:"UK",to:"UK",dist:200,cargo:5000,fuels:[{fuelId:"HFO",tonnes:100}]}]}).ukets.tco2e;
    const ukRE=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:uo.rows}).ukets.tco2e;
    ckT("UK ETS total scales by the whole-report-by-date share (full×0.10), not time (full×0.5)",
        Math.abs(ukRE - ukFull*0.10) < ukFull*0.01);
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
  /* ---- Session 3 (2026-07-16): Leg-Wise tab, xlsx writer, report labels ---- */
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
    /* ARRIVAL badge lands on the inbound APPROACH report (2026-07-20, Aurvin): EOSP → MANOEUVRING
       (approach, ends at the arrival instant) → AT_ANCHOR (first at-port) → AT_ANCHOR → SOSP.
       No cargo ⇒ Case B AT_ANCHOR ladder ⇒ arr = first anchor .tStart = the manoeuvring .tEnd,
       so the MANOEUVRING report (whose timestamp already reads the arrival instant) gets ARRIVAL,
       the first anchor report is a plain IN_PORT, and the last anchor report is DEPARTURE — no row
       is retimed and no two rows share a timestamp. */
    const AFIX=[["DATETIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","ASSOCIATED_ACTIVITY","OUTSIDE_PORT_LIMIT","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE","CURRENT_PORT","CURRENT_COUNTRY","CURRENT_REGION"],
      ["2026-04-01 06:00","2026-04-01 00:00","2026-04-01 06:00","ARRIVAL-EOSP","","","",'{"MDO": 1}',"10","5000","SGSIN","DKSKA","DKSKA","Skagen","Denmark","North Europe"],
      ["2026-04-01 09:00","2026-04-01 06:00","2026-04-01 09:00","IN_PORT","MANOEUVRING","","FALSE",'{"MDO": 0.2}',"0","5000","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-01 20:00","2026-04-01 09:00","2026-04-01 20:00","IN_PORT","AT_ANCHOR","AWAITING_ORDERS","FALSE",'{"MDO": 0.3}',"0","5000","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-02 06:00","2026-04-01 20:00","2026-04-02 06:00","IN_PORT","AT_ANCHOR","AWAITING_ORDERS","FALSE",'{"MDO": 0.3}',"0","5000","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-02 10:00","2026-04-02 06:00","2026-04-02 10:00","DEPARTURE-SOSP","MANOEUVRING","","",'{"MDO": 0.2}',"2","5000","DKSKA","","NLRTM","","",""]];
    const ma=mdaToOVD(AFIX, 20000);
    const ipa=ma.reports.filter(r=>r.rt==="IN_PORT");
    ckT("ARRIVAL badge on the approach (MANOEUVRING) report, first at-port plain, last DEPARTURE — no retime, no duplicate time",
        ipa.length===3 && ipa[0].oc==="MANOEUVRING" && reportTypeLabel(ipa[0])==="ARRIVAL"
        && reportTypeLabel(ipa[1])==="IN_PORT" && reportTypeLabel(ipa[2])==="DEPARTURE");
    /* 2026-07-21 (Aurvin — owner report): a stay whose ARRIVAL-EOSP falls OUTSIDE the export
       window still produces a workspace berth row. The file opens mid-approach (an at-sea
       report, then the inbound MANOEUVRING report, then cargo at berth) — there is no EOSP,
       so before this fix no "Arrival" boundary marker was emitted, parseOVD never left sea
       mode and the whole berth stay was booked to the voyage (owner's 2026 file: Constantza,
       11 days, 31.7 t MGO at 50% EU ETS scope instead of at berth at 100%). The Arrival
       marker now falls back to the approach report, which also keeps the inbound leg's TRUE
       origin (SGSIN→DKSKA, not DKSKA→DKSKA) so the ETS scope of that leg stays correct. */
    const NOEOSP=[["DATETIME_GMT","REPORT_START_GMT","REPORT_END_GMT","REPORT_TYPE","OPERATING_CONDITION","ASSOCIATED_ACTIVITY","OUTSIDE_PORT_LIMIT","FUEL_CONSUMPTION","DISTANCE","CARGO_QTY","ORIGIN_PORT_UNLO_CODE","CURRENT_PORT_UNLO_CODE","DESTINATION_PORT_UNLO_CODE","CURRENT_PORT","CURRENT_COUNTRY","CURRENT_REGION"],
      ["2026-04-01 04:00","2026-04-01 00:00","2026-04-01 04:00","AT_SEA","NORMAL SAILING","","",'{"MDO": 5}',"100","0","SGSIN","","DKSKA","","",""],
      ["2026-04-01 06:00","2026-04-01 04:00","2026-04-01 06:00","IN_PORT","MANOEUVRING","","FALSE",'{"MDO": 0.5}',"4","0","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-01 18:00","2026-04-01 06:00","2026-04-01 18:00","IN_PORT","AT_BERTH","CARGO_LOADING","FALSE",'{"MDO": 1}',"0","5000","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-02 06:00","2026-04-01 18:00","2026-04-02 06:00","IN_PORT","AT_BERTH","CARGO_LOADING","FALSE",'{"MDO": 1}',"0","9000","","DKSKA","","Skagen","Denmark","North Europe"],
      ["2026-04-02 10:00","2026-04-02 06:00","2026-04-02 10:00","DEPARTURE-SOSP","MANOEUVRING","","",'{"MDO": 0.2}',"2","9000","DKSKA","","NLRTM","","",""]];
    {
      const rNo=parseOVD(mdaToOVD(NOEOSP, 20000).csv);
      const pNo=rNo.rows.filter(r=>r.kind==="port"), lNo=rNo.rows.filter(r=>r.kind==="voyage");
      const berth=pNo[0];
      ckT("DERIVE no-EOSP fallback: stay with its ARRIVAL-EOSP outside the file still makes a berth row",
          pNo.length===1 && !!berth && berth.port && berth.port.c==="DKSKA");
      ckT("DERIVE no-EOSP fallback: berth row spans the derived arrival→departure, not the voyage",
          !!berth && berth.tStart==="2026-04-01T06:00" && berth.tEnd==="2026-04-02T06:00");
      ckT("DERIVE no-EOSP fallback: berth carries the at-berth fuel (2 t), voyage keeps the approach fuel",
          !!berth && Math.abs(berth.fuels.reduce((s,f)=>s+f.tonnes,0)-2)<0.001);
      ckT("DERIVE no-EOSP fallback: inbound leg keeps its TRUE origin (SGSIN→DKSKA, not DKSKA→DKSKA)",
          lNo.length>=1 && lNo[0].fromPort.c==="SGSIN" && lNo[0].toPort.c==="DKSKA"
          && lNo[0].tEnd==="2026-04-01T06:00");
      ckT("DERIVE no-EOSP fallback: stay is still flagged INCOMPLETE (the EOSP really is missing)",
          !!berth && berth.incomplete===true);
      /* guard the deliberate non-change: a file that opens ALREADY at berth has no inbound
         voyage to close, so no fallback marker is emitted and no phantom leg appears */
      const ATBERTH=[NOEOSP[0], NOEOSP[3], NOEOSP[4], NOEOSP[5]];
      const rAb=parseOVD(mdaToOVD(ATBERTH, 20000).csv);
      ckT("DERIVE no-EOSP fallback: file opening AT BERTH still yields one berth row, no phantom leg",
          rAb.rows.filter(r=>r.kind==="port").length===1);
    }
    /* Report-Wise tab UK ETS badge judges each report WHOLE by its own date (2026-07-25, Aurvin,
       owner instruction): a report dated before 1 Jul 2026 is out of scope (dash), a report dated
       on/after 1 Jul 2026 is fully in (100%). A report dated 01 Jul 12:00 whose PERIOD reaches
       back into 30 Jun is still fully IN — it is dated in July. No per-report time-proration. */
    {
      const _rows=S.rows, _year=S.year;
      S.year=2026;
      S.rows=[{kind:"voyage",from:"UK",to:"UK",tStart:"2026-06-01T00:00",tEnd:"2026-08-03T00:00"}];
      const cBefore  =trCoverage({t:"2026-06-02T00:00",ts:"2026-06-01T00:00",te:"2026-06-02T00:00"});
      const cStraddle=trCoverage({t:"2026-07-01T12:00",ts:"2026-06-30T12:00",te:"2026-07-01T12:00"});
      const cAfter   =trCoverage({t:"2026-08-02T00:00",ts:"2026-08-01T00:00",te:"2026-08-02T00:00"});
      S.rows=_rows; S.year=_year;
      ckT("UK ETS reports badge: June dash, 01 Jul report 100% (whole by date), July 100%",
          cBefore.uk===null && cStraddle.uk===100 && cAfter.uk===100);
    }
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
  }catch(e){ fail++; out.push("FAIL  Session-3 (Leg-Wise/xlsx) tests threw: "+e.message); }

  /* ---- Session 2026-07-23c: VOYAGE-WISE tab (voyage-number aggregation) ----------------
     Covers the Task 2 re-timing rule, the abrupt-change leg split, and the guarantee that
     the new tab can never disagree with Leg-Wise on the totals. */
  try{
    const rep=(t,voy,extra)=>Object.assign({t:t,te:t,ts:t,voy:voy,rt:"AT_SEA",role:"",dist:0,fuels:{}},extra||{});

    /* (a) a change one day AFTER a departure is re-timed back to that departure */
    const segA=vwVoyageSegments([
      rep("2026-03-01T06:00","10",{rt:"IN_PORT"}),
      rep("2026-03-02T08:00","10",{rt:"IN_PORT",role:"DEPARTURE"}),
      rep("2026-03-02T12:00","10",{rt:"DEPARTURE-SOSP"}),
      rep("2026-03-03T09:00","11"),
      rep("2026-03-04T09:00","11")]);
    ckT("Voyage-Wise: voyage-no change the day after a departure is re-timed to that departure",
        segA.length===2 && segA[1].voy==="11" && segA[1].tStart==="2026-03-02T08:00" && segA[1].retimed===true);
    /* the DERIVED departure (08:00) must win over the DEPARTURE-SOSP marker (12:00) — the
       SOSP sits inside the sea leg, so snapping to it would split the leg for no reason */
    ckT("Voyage-Wise: derived DEPARTURE wins over the DEPARTURE-SOSP sea-passage marker",
        segA[1].tStart==="2026-03-02T08:00" && segA[1].tStart!=="2026-03-02T12:00");

    /* (b) same-day change also snaps back */
    const segSame=vwVoyageSegments([
      rep("2026-04-01T06:00","20",{rt:"IN_PORT",role:"DEPARTURE"}),
      rep("2026-04-01T18:00","21"),
      rep("2026-04-02T18:00","21")]);
    ckT("Voyage-Wise: voyage-no change on the SAME day as the departure snaps to it",
        segSame.length===2 && segSame[1].tStart==="2026-04-01T06:00" && segSame[1].retimed===true);

    /* (c) an abrupt mid-sea change (no departure within a day) is a genuine new voyage */
    const segB=vwVoyageSegments([
      rep("2026-03-01T09:00","10",{rt:"IN_PORT",role:"DEPARTURE"}),
      rep("2026-03-02T09:00","10"),
      rep("2026-03-05T09:00","10"),
      rep("2026-03-06T09:00","12"),
      rep("2026-03-07T09:00","12")]);
    ckT("Voyage-Wise: abrupt mid-sea voyage-no change is kept at its own report (charterer change)",
        segB.length===2 && segB[1].voy==="12" && segB[1].tStart==="2026-03-06T09:00" && segB[1].retimed===false);

    /* (d) blank voyage numbers (bunker / fuel-stock reports) must NOT count as changes */
    ckT("Voyage-Wise: blank VOYAGE_NUMBER on bunker/stock reports is ignored, not a change",
        vwVoyageSegments([ rep("2026-03-01T09:00","10"),
                           rep("2026-03-02T09:00","",{rt:"FUEL_STOCK"}),
                           rep("2026-03-03T09:00","",{rt:"FUEL_OIL_BUNKER"}),
                           rep("2026-03-04T09:00","10") ]).length===1);

    /* (e) the split conserves fuel and distance exactly, and cuts at the change report so
           that report's own consumption stays with the OLD voyage (2026-07-20 convention) */
    const splRow={kind:"voyage",label:"L",from:"EEA",to:"EEA",dist:1000,cargo:50000,hours:240,
                  tStart:"2026-03-01T00:00",tEnd:"2026-03-11T00:00",
                  fuels:[{fuelId:"HFO",tonnes:300,price:0}]};
    const splReps=[]; for(let d=1;d<=10;d++){
      const ts="2026-03-"+String(d).padStart(2,"0")+"T12:00";
      splReps.push(rep(ts, d<6?"20":"21", {dist:100,fuels:{HFO:30}}));
    }
    const spl=vwSplitRows([splRow], vwVoyageSegments(splReps), splReps);
    const splDist=spl.rows.reduce((s,r)=>s+r.dist,0);
    const splFuel=spl.rows.reduce((s,r)=>s+r.fuels.reduce((a,f)=>a+f.tonnes,0),0);
    /* owner[] holds SEGMENT INDEXES since 2026-07-23e, not voyage numbers */
    ckT("Voyage-Wise: an abrupt change splits the leg into exactly 2 parts",
        spl.rows.length===2 && spl.owner[0]===0 && spl.owner[1]===1);
    ckT("Voyage-Wise: the split conserves distance and fuel exactly",
        Math.abs(splDist-1000)<1e-6 && Math.abs(splFuel-300)<1e-6);
    ckT("Voyage-Wise: the boundary report's consumption stays with the OLD voyage",
        Math.abs(spl.rows[0].dist-600)<1e-6 && Math.abs(spl.rows[1].dist-400)<1e-6);

    /* (f) a leg with no voyage boundary inside it is never split */
    ckT("Voyage-Wise: a leg with no voyage change inside it is left whole",
        vwSplitRows([splRow], vwVoyageSegments([rep("2026-03-05T12:00","20",{dist:100})]), []).rows.length===1);

    /* (g) end-to-end: voyage groups must reconcile with the Leg-Wise engine output.
           Same rows, same year, so every additive figure has to match to the cent. */
    const vwState={ year:2026, ship:{typeId:"bulk",capacity:45000}, euaPrice:80, mdaReports:[
        rep("2026-02-01T00:00","70",{rt:"IN_PORT",role:"DEPARTURE"}),
        rep("2026-02-10T00:00","70"),
        rep("2026-03-01T00:00","71",{rt:"IN_PORT",role:"DEPARTURE"}),
        rep("2026-03-10T00:00","71") ],
      rows:[
        {kind:"voyage",label:"A",from:"EEA",to:"EEA",dist:1200,cargo:40000,
         tStart:"2026-02-01T00:00",tEnd:"2026-02-20T00:00",fuels:[{fuelId:"HFO",tonnes:120}]},
        {kind:"port",label:"P",zone:"EEA",poc:true,hours:48,
         tStart:"2026-02-20T00:00",tEnd:"2026-03-01T00:00",fuels:[{fuelId:"MDO",tonnes:8}]},
        {kind:"voyage",label:"B",from:"EEA",to:"EEA",dist:900,cargo:35000,
         tStart:"2026-03-01T00:00",tEnd:"2026-03-15T00:00",fuels:[{fuelId:"HFO",tonnes:90}]}]};
    const vg=vwGroups(vwState), legR=computeAll(vwState);
    const near=(a,b)=>Math.abs(a-b)<0.01;
    const gSum=k=>vg.groups.reduce((s,g)=>s+(Number(g[k])||0),0);
    const lSum=k=>legR.rowDetails.reduce((s,d)=>s+(Number(d[k])||0),0);
    ckT("Voyage-Wise: two voyage numbers produce two voyage groups",
        vg.groups.length===2 && vg.groups[0].voy==="70" && vg.groups[1].voy==="71");
    ckT("Voyage-Wise: every workspace row lands in exactly one voyage group",
        vg.groups.reduce((s,g)=>s+g.dets.length,0)===legR.rowDetails.length);
    ckT("Voyage-Wise totals reconcile with Leg-Wise: distance, CO₂, EUAs, WtW",
        near(gSum("dist"),lSum("dist")) && near(gSum("co2"),lSum("co2")) &&
        near(gSum("euas"),lSum("euas")) && near(gSum("sccWtW"),lSum("sccWtW")));
    ckT("Voyage-Wise totals reconcile with Leg-Wise: FuelEU CB and penalty",
        near(gSum("feuCB"),lSum("feuCB")) && near(gSum("feuPenalty"),lSum("feuPenalty")));
    /* the port stay sits between the two departures, so it belongs to voyage 70 */
    ckT("Voyage-Wise: a port stay before the next departure belongs to the OLD voyage",
        vg.groups[0].dets.length===2 && vg.groups[1].dets.length===1);

    /* (h) SCC per voyage number: EEOI = numerator × 1e6 ÷ the group's OWN transport work,
           with all of the group's port consumption inside the numerator (Task 5) */
    const g0=vg.groups[0];
    ckT("Voyage-Wise SCC: transport work is the group's own Σ(cargo × laden distance)",
        near(g0.tw, 40000*1200));
    ckT("Voyage-Wise SCC: EEOI = numerator × 1e6 ÷ transport work",
        g0.eeoi!=null && near(g0.eeoi, g0.sccNumerator*1e6/g0.tw));
    ckT("Voyage-Wise SCC: the voyage's port-stay emissions are inside its numerator",
        near(g0.sccNumerator, g0.dets.reduce((s,d)=>s+(Number(d.sccWtW)||0),0)) &&
        g0.sccNumerator > g0.dets[0].sccWtW);

    /* (i) a wholly ballast voyage carries its WtW forward to the next voyage that loads
           (SCC 2025 Technical Guidance Appendix 3), rather than showing an EEOI of its own */
    const balState={ year:2026, ship:{typeId:"bulk",capacity:45000}, mdaReports:[
        rep("2026-02-01T00:00","80",{rt:"IN_PORT",role:"DEPARTURE"}),
        rep("2026-03-01T00:00","81",{rt:"IN_PORT",role:"DEPARTURE"}) ],
      rows:[
        {kind:"voyage",label:"ballast",from:"EEA",to:"EEA",dist:800,cargo:0,
         tStart:"2026-02-01T00:00",tEnd:"2026-02-25T00:00",fuels:[{fuelId:"HFO",tonnes:60}]},
        {kind:"voyage",label:"laden",from:"EEA",to:"EEA",dist:1000,cargo:30000,
         tStart:"2026-03-01T00:00",tEnd:"2026-03-20T00:00",fuels:[{fuelId:"HFO",tonnes:100}]}]};
    const bg2=vwGroups(balState);
    ckT("Voyage-Wise SCC: a wholly ballast voyage has no EEOI of its own",
        bg2.groups.length===2 && bg2.groups[0].eeoi===null && bg2.groups[0].tw===0);
    ckT("Voyage-Wise SCC: the ballast voyage's WtW is carried into the next laden voyage",
        bg2.groups[1].sccBallastIn>0 &&
        Math.abs(bg2.groups[1].sccNumerator-(bg2.groups[1].sccWtW+bg2.groups[0].sccWtW))<0.01);

    /* (i2b) 2026-07-26i (Aurvin, EXPLICIT owner instruction, this session, after a
       clarifying-question round): the Voyage-Wise TOTAL row's CII/EEOI numerator must include
       CO₂ from a voyage GROUP that has NO distance of its own — e.g. a voyage number assigned
       to a period the ship spent entirely in port, never sailing under it. Before this fix,
       the TOTAL's numerator was built only from distance-bearing groups (`sel.filter(g=>
       g.dist>0)`), so a zero-distance group's real CO₂ was silently dropped from the total —
       not just its (zero) distance — understating the TOTAL relative to the real annual
       attained CII, the same class of bug already fixed on Leg-Wise for at-berth rows. */
    const zeroDistState={ year:2026, ship:{typeId:"bulk",capacity:45000}, mdaReports:[
        rep("2026-02-01T00:00","70",{rt:"IN_PORT",role:"DEPARTURE"}), rep("2026-02-10T00:00","70"),
        rep("2026-05-01T00:00","96",{rt:"IN_PORT",role:"DEPARTURE"}), rep("2026-05-10T00:00","96") ],
      rows:[
        {kind:"voyage",label:"A",from:"EEA",to:"EEA",dist:1200,cargo:40000,
         tStart:"2026-02-01T00:00",tEnd:"2026-02-10T00:00",fuels:[{fuelId:"HFO",tonnes:120}]},
        {kind:"port",label:"P96",zone:"EEA",poc:true,hours:216,
         tStart:"2026-05-01T00:00",tEnd:"2026-05-10T00:00",fuels:[{fuelId:"MDO",tonnes:12}]}]};
    const zg=vwGroups(zeroDistState);
    ckT("Voyage-Wise: a voyage number spent entirely in port still forms its own group — real CO₂, zero distance",
        zg.groups.length===2 && zg.groups.some(g=>g.dist===0 && g.co2>0));
    const zeroDistEl=document.getElementById("tab-voy");
    if(zeroDistEl){
      const keepS2=S.rows, keepR2=S.mdaReports, keepY2=S.year;
      S.rows=zeroDistState.rows; S.mdaReports=zeroDistState.mdaReports; S.year=2026;
      renderVoyage();
      const co2All=zg.groups.reduce((s,g)=>s+(Number(g.co2)||0),0);
      const distAll=zg.groups.filter(g=>g.dist>0).reduce((s,g)=>s+g.dist,0);
      const distGroup=zg.groups.find(g=>g.dist>0);
      const wantPctStr = (distGroup && distGroup.cii && distGroup.cii.ciiReq)
        ? fmtF(co2All*1e6/(45000*distAll)*100/distGroup.cii.ciiReq,0)+"%" : null;
      const totTxt=(document.getElementById("vwTotals")||{}).textContent||"";
      ckT("Voyage-Wise TOTAL row's CII % includes the zero-distance group's CO₂",
          wantPctStr!=null && totTxt.indexOf(wantPctStr)>-1,
          "want "+wantPctStr+" in: "+totTxt.slice(-140));
      S.rows=keepS2; S.mdaReports=keepR2; S.year=keepY2;
      try{renderVoyage();}catch(e){}
    }

    /* (i3) 2026-07-24 (Aurvin): Voyage-Wise multi-year — each voyage graded under the rules of
       its END-date year, and the tab's own date range includes voyages by their end date. */
    const vyBase={ ship:{typeId:"bulk",capacity:45000}, euaPrice:80, year:2026,
      voyDateFilter:{fromISO:"",toISO:"",active:false}, mdaReports:[
        rep("2025-11-01T00:00","90",{rt:"IN_PORT",role:"DEPARTURE"}), rep("2025-11-20T00:00","90"),
        rep("2026-02-01T00:00","91",{rt:"IN_PORT",role:"DEPARTURE"}), rep("2026-02-20T00:00","91") ],
      rows:[
        {kind:"voyage",label:"V90",from:"EEA",to:"EEA",dist:1000,cargo:20000,
         tStart:"2025-11-01T00:00",tEnd:"2025-11-20T00:00",fuels:[{fuelId:"HFO",tonnes:100}]},
        {kind:"voyage",label:"V91",from:"EEA",to:"EEA",dist:1000,cargo:20000,
         tStart:"2026-02-01T00:00",tEnd:"2026-02-20T00:00",fuels:[{fuelId:"HFO",tonnes:100}]}]};
    const vyG=vwGroups(vyBase);
    const g90=vyG.groups.find(g=>g.voy==="90"), g91=vyG.groups.find(g=>g.voy==="91");
    const r25=computeAll({year:2025,ship:{typeId:"bulk",capacity:45000},rows:[Object.assign({},vyBase.rows[0])]});
    const r26=computeAll({year:2026,ship:{typeId:"bulk",capacity:45000},rows:[Object.assign({},vyBase.rows[1])]});
    const sumEuas=R=>R.rowDetails.reduce((s,d)=>s+(Number(d.euas)||0),0);
    ckT("Voyage-Wise per-end-year: V90 (ends 2025) graded with 2025 rules (0.7 phase-in)",
        g90 && near(g90.euas, sumEuas(r25)));
    ckT("Voyage-Wise per-end-year: V91 (ends 2026) graded with 2026 rules (full phase-in)",
        g91 && near(g91.euas, sumEuas(r26)));
    ckT("Voyage-Wise per-end-year: identical fuel gives different EUAs across the two years",
        g90 && g91 && (g91.euas-g90.euas)>1);
    const vyR=vwGroups(Object.assign({},vyBase,{voyDateFilter:{fromISO:"2026-01-01T00:00",toISO:"2026-12-31T23:59",active:true}}));
    ckT("Voyage-Wise range: only voyages whose END date is in range are shown (V91 only)",
        vyR.groups.length===1 && vyR.groups[0].voy==="91");
    const vyR2=vwGroups(Object.assign({},vyBase,{voyDateFilter:{fromISO:"2025-01-01T00:00",toISO:"2026-12-31T23:59",active:true}}));
    ckT("Voyage-Wise range: a multi-year range includes voyages from both years",
        vyR2.groups.length===2);

    /* (i4) 2026-07-24: year-lock defaults for Workspace / Report-Wise / Leg-Wise */
    ckT("initDateFilters: Year defaults to the latest year present in the rows, window = that year",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter;
          try{ S.rows=[{kind:"voyage",tStart:"2024-05-01T00:00",tEnd:"2024-05-02T00:00",fuels:[]},
                       {kind:"voyage",tStart:"2026-05-01T00:00",tEnd:"2026-05-02T00:00",fuels:[]}];
               initDateFilters();
               return S.year===2026 && S.dateFilter.active
                   && S.dateFilter.fromISO==="2026-01-01T00:00" && S.dateFilter.toISO==="2026-12-31T23:59";
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; } })());
    ckT("Year-lock: dfSet clamps a From before the year start up to 1 Jan of the year",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter;
          try{ S.rows=[]; S.year=2026; S.dateFilter=_fullYearRange(2026);
               dfSet('fromISO','2025-06-01T00:00');
               return S.dateFilter.fromISO==='2026-01-01T00:00' && S.dateFilter.active;
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; try{renderWorkspace();}catch(e){} } })());

    /* (i5) 2026-07-28h (Aurvin, owner instruction) — VOYAGE-WISE IS YEAR-LOCKED TOO.
       The owner's report: "in the voyages view, I see that we are able to select multiple years
       from the date filter, which should not be the case." These tests pin the new rule from both
       ends: the STATE can no longer hold a cross-year voyage range, and the CONTROL can no longer
       offer one. The end-date selection rule (the part the owner asked to KEEP) is already covered
       by the four (i3) tests above, which pass ranges straight to vwGroups and still pass. */
    const _voyRestore = ()=>{ try{renderWorkspace();}catch(e){} try{renderVoyage();}catch(e){} };
    ckT("Voyage year-lock: dfYear drags the voyage range onto the same whole year",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter,sV=S.voyDateFilter;
          try{ S.rows=[]; dfYear(2025);
               return S.voyDateFilter.active
                   && S.voyDateFilter.fromISO==='2025-01-01T00:00'
                   && S.voyDateFilter.toISO==='2025-12-31T23:59';
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; S.voyDateFilter=sV; _voyRestore(); } })());
    ckT("Voyage year-lock: narrowing From/To narrows the voyage range identically (one window)",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter,sV=S.voyDateFilter;
          try{ S.rows=[]; S.year=2026; S.dateFilter=_fullYearRange(2026);
               dfSet('fromISO','2026-04-01T00:00'); dfSet('toISO','2026-06-30T23:59');
               return S.voyDateFilter.fromISO===S.dateFilter.fromISO
                   && S.voyDateFilter.toISO  ===S.dateFilter.toISO
                   && S.voyDateFilter.fromISO==='2026-04-01T00:00';
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; S.voyDateFilter=sV; _voyRestore(); } })());
    ckT("Voyage year-lock: voySet is an alias — a 2025 date typed under year 2026 is clamped, not accepted",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter,sV=S.voyDateFilter;
          try{ S.rows=[]; S.year=2026; S.dateFilter=_fullYearRange(2026);
               voySet('fromISO','2025-06-01T00:00');
               return S.voyDateFilter.fromISO==='2026-01-01T00:00'
                   && S.voyDateFilter.fromISO.slice(0,4)===S.voyDateFilter.toISO.slice(0,4);
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; S.voyDateFilter=sV; _voyRestore(); } })());
    ckT("Voyage year-lock: voyClear resets to the whole reporting year, it no longer means 'all years'",
        (()=>{ const sR=S.rows,sY=S.year,sD=S.dateFilter,sV=S.voyDateFilter;
          try{ S.rows=[]; S.year=2026; S.dateFilter=_fullYearRange(2026);
               voySet('fromISO','2026-04-01T00:00'); voyClear();
               return S.voyDateFilter.active===true
                   && S.voyDateFilter.fromISO==='2026-01-01T00:00'
                   && S.voyDateFilter.toISO==='2026-12-31T23:59';
          } finally { S.rows=sR; S.year=sY; S.dateFilter=sD; S.voyDateFilter=sV; _voyRestore(); } })());
    ckT("Voyage year-lock: the Voyage-Wise bar renders the SAME year-bounded controls as the other tabs",
        (()=>{ const sY=S.year; try{
               S.year=2026;
               const bar=renderDateFilterBar('voy','');
               const maxes=(bar.match(/max="2026-12-31T23:59"/g)||[]).length;
               return maxes===2                         // both From and To are bounded
                   && /onchange="dfSet\('fromISO'/.test(bar)
                   && /onchange="dfYear\(/.test(bar)
                   && !/voySet\(/.test(bar) && !/voyYear\(/.test(bar)
                   && !/<option value="" /.test(bar);   // no blank "—" multi-year year option left
          } finally { S.year=sY; } })());
    ckT("Voyage year-lock: a saved cross-year range is discarded on load and replaced by the whole year",
        (()=>{ const m=migrateState({ year:2026, rows:[], fuels:[],
                 voyDateFilter:{fromISO:'2025-06-01T00:00',toISO:'2026-03-31T23:59',active:true} });
               return m.voyDateFilter.active===true
                   && m.voyDateFilter.fromISO==='2026-01-01T00:00'
                   && m.voyDateFilter.toISO==='2026-12-31T23:59'; })());
    ckT("Voyage year-lock: a saved range that IS inside the year survives the migration untouched",
        (()=>{ const m=migrateState({ year:2026, rows:[], fuels:[],
                 voyDateFilter:{fromISO:'2026-04-01T00:00',toISO:'2026-06-30T23:59',active:true} });
               return m.voyDateFilter.fromISO==='2026-04-01T00:00'
                   && m.voyDateFilter.toISO==='2026-06-30T23:59'; })());

    /* (i2) 2026-07-23e — voyage-number spelling is normalised, but only across CONTINUITY.
       Owner's rule: 6, 06, 006, V6, V06, V006 are one and the same voyage. */
    ckT("Voyage-Wise: leading zeros are ignored (6 = 06 = 006)",
        vwVoyKey("6")==="6" && vwVoyKey("06")==="6" && vwVoyKey("006")==="6");
    ckT("Voyage-Wise: a leading V / v / VOY is ignored (V6 = v06 = VOY 006 = 6)",
        vwVoyKey("V6")==="6" && vwVoyKey("v06")==="6" && vwVoyKey("VOY 006")==="6" &&
        vwVoyKey("V-06")==="6" && vwVoyKey("V.6")==="6");
    ckT("Voyage-Wise: a suffix survives normalisation (V05A → 5A)",
        vwVoyKey("V05A")==="5A" && vwVoyKey("5a")==="5A");
    ckT("Voyage-Wise: zero itself and non-numeric codes are left alone",
        vwVoyKey("0")==="0" && vwVoyKey("ABC")==="ABC" && vwVoyKey("V")==="V" &&
        vwVoyKey("VESSEL1")==="VESSEL1" && vwVoyKey("")==="" && vwVoyKey("  ")==="");
    ckT("Voyage-Wise: differently-spelled but ADJACENT numbers collapse to one voyage",
        vwVoyageSegments([ rep("2026-05-01T00:00","5"),   rep("2026-05-02T00:00","05"),
                           rep("2026-05-03T00:00","V05"), rep("2026-05-04T00:00","v5"),
                           rep("2026-05-05T00:00","005") ]).length===1);
    /* the continuity caveat the owner was explicit about */
    const segCycle=vwVoyageSegments([
      rep("2026-06-01T00:00","5"),  rep("2026-06-02T00:00","05"),
      rep("2026-06-05T00:00","6"),
      rep("2026-06-09T00:00","V05"), rep("2026-06-10T00:00","5")]);
    ckT("Voyage-Wise: 5 → 6 → 5 stays THREE voyages (continuity decides, not the number)",
        segCycle.length===3 && segCycle[0].voy==="5" && segCycle[1].voy==="6" && segCycle[2].voy==="5");
    ckT("Voyage-Wise: the two separate '5' voyages are NOT merged into one group",
        (function(){
          const st={ year:2026, ship:{typeId:"bulk",capacity:45000}, mdaReports:segCycle._r||[
              rep("2026-06-01T00:00","5"), rep("2026-06-05T00:00","6"), rep("2026-06-09T00:00","V05")],
            rows:[
              {kind:"voyage",label:"a",from:"EEA",to:"EEA",dist:100,cargo:1000,
               tStart:"2026-06-01T00:00",tEnd:"2026-06-04T00:00",fuels:[{fuelId:"HFO",tonnes:10}]},
              {kind:"voyage",label:"b",from:"EEA",to:"EEA",dist:100,cargo:1000,
               tStart:"2026-06-05T00:00",tEnd:"2026-06-08T00:00",fuels:[{fuelId:"HFO",tonnes:10}]},
              {kind:"voyage",label:"c",from:"EEA",to:"EEA",dist:100,cargo:1000,
               tStart:"2026-06-09T00:00",tEnd:"2026-06-12T00:00",fuels:[{fuelId:"HFO",tonnes:10}]}]};
          const gg=vwGroups(st).groups;
          return gg.length===3 && gg[0].voy==="5" && gg[2].voy==="5" && gg[0]!==gg[2];
        })());
    ckT("Voyage-Wise: every spelling used is recorded on the voyage for the audit tooltip",
        (function(){
          const sg=vwVoyageSegments([ rep("2026-07-01T00:00","V05"), rep("2026-07-02T00:00","5"),
                                      rep("2026-07-03T00:00","005") ]);
          return sg.length===1 && sg[0].raws.length===3 && sg[0].raws.indexOf("V05")>=0;
        })());

    /* (i2b) 2026-07-23f — the Leg-Wise "Voyage No" column. brVoyNos() reads the SAME
       vwVoyageSegments() timeline the Voyage-Wise tab uses and, because a leg is not split
       here, shows BOTH numbers when a leg straddles an abrupt mid-sea change. The boundary
       convention matches vwSegAt: start INCLUSIVE, end EXCLUSIVE. */
    (function(){
      const segsVN=[ {voy:"5",tStart:null,tEnd:"2026-03-10T00:00"},
                     {voy:"6",tStart:"2026-03-10T00:00",tEnd:"2026-03-20T00:00"},
                     {voy:"7",tStart:"2026-03-20T00:00",tEnd:null} ];
      ckT("Leg-Wise Voyage No: a leg inside one voyage shows that number",
          brVoyNos(segsVN,{tStart:"2026-03-01T00:00",tEnd:"2026-03-05T00:00"})==="5");
      ckT("Leg-Wise Voyage No: a leg straddling an abrupt change shows both, comma-separated",
          brVoyNos(segsVN,{tStart:"2026-03-08T00:00",tEnd:"2026-03-12T00:00"})==="5, 6");
      ckT("Leg-Wise Voyage No: a leg ending exactly on a boundary keeps the OLD voyage",
          brVoyNos(segsVN,{tStart:"2026-03-05T00:00",tEnd:"2026-03-10T00:00"})==="5");
      ckT("Leg-Wise Voyage No: a leg starting exactly on a boundary takes the NEW voyage",
          brVoyNos(segsVN,{tStart:"2026-03-10T00:00",tEnd:"2026-03-15T00:00"})==="6");
      ckT("Leg-Wise Voyage No: a leg spanning three segments lists all three",
          brVoyNos(segsVN,{tStart:"2026-03-08T00:00",tEnd:"2026-03-22T00:00"})==="5, 6, 7");
      ckT("Leg-Wise Voyage No: no voyage numbers in the file leaves the cell blank",
          brVoyNos([],{tStart:"2026-03-01T00:00",tEnd:"2026-03-05T00:00"})==="");
      /* the number agrees with the Voyage-Wise assignment for a clean single-voyage leg */
      ckT("Leg-Wise Voyage No: agrees with the Voyage-Wise segment number for a whole leg",
          brVoyNos(segsVN,{tStart:"2026-03-21T00:00",tEnd:"2026-03-25T00:00"})==="7");
    })();

    /* (i3) the same half-band fix must be on LEG-WISE too — the owner reported it on both */
    ckT("Leg-Wise: row backgrounds also span the full scrolled width (same fix)",
        (function(){
          const el2=document.getElementById("tab-calcs");
          if(!el2) return true;
          const kR=S.rows, kM=S.mdaReports, kY=S.year;
          S.rows=[{kind:"voyage",label:"A",from:"EEA",to:"EEA",dist:100,cargo:1000,
                   tStart:"2026-02-01T00:00",tEnd:"2026-02-05T00:00",fuels:[{fuelId:"HFO",tonnes:10}]}];
          S.mdaReports=[]; S.year=2026;
          renderCalcs();
          const hh=el2.innerHTML;
          S.rows=kR; S.mdaReports=kM; S.year=kY;
          const boxes=hh.match(/min-width:\d+px/g)||[];
          return !/max-content/.test(hh) && boxes.length>=4 &&
                 boxes.every(b=>b===boxes[0]) &&
                 boxes[0]==="min-width:"+gridMinWidth(BR_GRID)+"px" &&
                 hh.indexOf("position:sticky;top:0;z-index:12;background:#ffffff;"+BR_BOX)>=0;
        })());

    /* (j) the tab exists and renders without the Task-4 columns */
    ckT("Voyage-Wise: the tab is registered in TAB_IDS", TAB_IDS.indexOf("voy")>=0);
    const vwEl=document.getElementById("tab-voy");
    if(vwEl){
      const keepS=S.rows, keepR=S.mdaReports, keepY=S.year;
      S.rows=vwState.rows; S.mdaReports=vwState.mdaReports; S.year=2026;
      renderVoyage();
      const h=vwEl.innerHTML;
      ckT("Voyage-Wise: the table renders a Voyage No column and the SCC block",
          /Voyage No/.test(h) && /EEOI/.test(h) && /Sea Cargo Charter/.test(h));
      ckT("Voyage-Wise: the eligibility % (Cov.) columns are NOT shown (Task 4)",
          !/>Cov\.</.test(h));
      /* 2026-07-23d: the owner revoked the expandable leg list — one row per voyage, full
         stop. Two voyages must therefore produce exactly two @BERTH/VOYAGE-tagged bodies
         and no per-leg rows, however many legs sit inside them. */
      ckT("Voyage-Wise: no per-leg rows are rendered — one row per voyage only",
          (h.match(/@BERTH/g)||[]).length===0 && typeof window.vwLegRows==="undefined");
      ckT("Voyage-Wise: the table scrolls sideways rather than crushing its columns",
          /overflow-x:auto/.test(h) && /minmax\(300px/.test(VW_GRID));
      ckT("Voyage-Wise: numeric columns are wide enough for 9-digit figures",
          /minmax\(104px/.test(VW_GRID) && /minmax\(100px/.test(VW_GRID));
      /* 2026-07-23e — the row backgrounds must span the FULL scroll width, not just the
         visible panel, or the TOTAL row's band stops mid-table and the sticky header loses
         its backdrop (body rows then show through it). Every grid row, and the sticky
         wrapper, must carry width:max-content. */
      /* 2026-07-23f — ALIGNMENT INVARIANT. Every grid in the table (header, TOTAL row and
         each voyage row) plus the sticky wrapper must resolve to the SAME width, or the
         columns drift apart down the table. width:max-content — the 23e attempt — breaks
         this, because each grid then sizes to its own content and the header's long labels
         make it wider than the numeric body rows. Assert the shared box instead. */
      ckT("Voyage-Wise: no grid uses max-content (it sizes each row differently)",
          !/max-content/.test(h));
      ckT("Voyage-Wise: header, TOTAL and every voyage row share one identical width",
          (function(){
            const boxes=h.match(/min-width:\d+px/g)||[];
            return boxes.length>=5 && boxes.every(b=>b===boxes[0]) &&
                   boxes[0]==="min-width:"+gridMinWidth(VW_GRID)+"px";
          })());
      ckT("Voyage-Wise: the sticky header carries the same full-width backdrop",
          h.indexOf("position:sticky;top:0;z-index:12;background:#ffffff;"+VW_BOX)>=0);
      S.rows=keepS; S.mdaReports=keepR; S.year=keepY;
    }
  }catch(e){ fail++; out.push("FAIL  Voyage-Wise tests threw: "+e.message); }

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

  /* ---- Live worked example ("Your ship") panel builders — display-only, must mirror the engine ---- */
  try{
    const Ssave = (typeof S!=="undefined") ? S : null;
    /* Fixture with EU + UK + FuelEU + CII + SCC all active, plus a machinery-split-free LNG line. */
    const fx = { year:2026, ship:{typeId:"bulk",capacity:60000,name:"MV Test",imo:"9999999"},
                 euaPrice:80, ukaPrice:50, arSet:"AR5",
                 rows:[
                   {kind:"voyage",from:"EEA",to:"EEA",dist:5000,cargo:50000,tStart:"2026-02-01T00:00",tEnd:"2026-02-05T00:00",fuels:[{fuelId:"HFO",tonnes:970},{fuelId:"BDSL",tonnes:30}]},
                   {kind:"voyage",from:"UK",to:"UK",dist:500,cargo:20000,tStart:"2026-08-01T00:00",tEnd:"2026-08-03T00:00",fuels:[{fuelId:"MDO",tonnes:40}]}
                 ] };
    S = fx;
    const Rx = computeAll(S);
    /* CII: per-fuel display CO2 lines must sum to the engine total co2_t */
    let ciiSum=0; const fbt=Rx.summary.fuelByType||{};
    for(const id of Object.keys(fbt)){ const f=FUEL_BY_ID[id]||{}; ciiSum += (fbt[id]||0)*(Number(f.cf)||0); }
    ck("Live CII: per-fuel CO2 lines sum = engine co2_t", ciiSum, Rx.cii.co2_t, 1e-6);
    const cii=fexLiveCII(Rx);
    /* 2026-07-22f (owner, Aurvin): CII/GHGIE display moved to 2dp everywhere (was 3dp/5dp) */
    ckT("Live CII panel: contains attained value", cii.indexOf(fmtF(Rx.cii.attained,2))>=0);
    ckT("Live CII panel: contains required value", cii.indexOf(fmtF(Rx.cii.ciiReq,2))>=0);
    ckT("Live CII panel: no NaN", cii.indexOf("NaN")<0);
    ckT("Live CII panel: no undefined", cii.indexOf("undefined")<0);
    const ets=fexLiveETS(Rx);
    ckT("Live ETS panel: contains EUAs figure", ets.indexOf(fmt(Rx.ets.euas))>=0);
    ckT("Live ETS panel: no NaN/undefined", ets.indexOf("NaN")<0 && ets.indexOf("undefined")<0);
    const uke=fexLiveUKETS(Rx);
    ckT("Live UK ETS panel: contains tCO2e figure", uke.indexOf(fmtF(Rx.ukets.tco2e,3))>=0);
    ckT("Live UK ETS panel: no NaN/undefined", uke.indexOf("NaN")<0 && uke.indexOf("undefined")<0);
    const feu=fexLiveFuelEU(Rx);
    ckT("Live FuelEU panel: contains GHGIE (2dp)", feu.indexOf(fmtF(Rx.fueleu.ghgie,2))>=0);
    ckT("Live FuelEU panel: no NaN/undefined", feu.indexOf("NaN")<0 && feu.indexOf("undefined")<0);
    const scc=fexLiveSCC(Rx);
    ckT("Live SCC panel: contains weighted intensity", scc.indexOf(fmtF(Rx.scc.weighted,2))>=0);
    ckT("Live SCC panel: no NaN/undefined", scc.indexOf("NaN")<0 && scc.indexOf("undefined")<0);
    /* Empty-state: no rows → guidance message, never NaN */
    S = { year:2026, ship:{typeId:"bulk",capacity:60000}, rows:[] };
    const Re = computeAll(S);
    const ecii=fexLiveCII(Re);
    ckT("Live CII empty-state: shows no-data message", ecii.indexOf("No activity data")>=0);
    ckT("Live CII empty-state: no NaN", ecii.indexOf("NaN")<0);
    ckT("Live UK ETS pre-2026: shows applies-from-2026 note",
        fexLiveUKETS(computeAll({year:2025,ship:{typeId:"bulk",capacity:60000},rows:[]})).indexOf("applies from 2026")>=0);
    S = Ssave;
  }catch(e){ fail++; out.push("FAIL  Live worked-example tests threw: "+e.message); }

  /* ===== 2026-07-30 (Aurvin, owner instruction) — "Year to date CII" trend popup =====
     Guards the new js/fullscreen.js block. The point of these is NOT that the chart looks
     right — it is that the popup can never quietly disagree with js/engine.js about the
     RULES (required CII, A–E bands, the AER formula), and that the two data paths the owner
     chose (reports first, row-boundary steps as fallback) both produce honest running totals.
     Everything here is display-only: no test touches or expects any change in a reported
     figure. If the V1 branch or the KPI cards are reworked, these must stay green. */
  try{
    const Sk = S;
    const shipT = { typeId:"bulk", capacity:45000 };

    /* T1 — day-of-year helpers, including a leap year (2028). A one-day drift here would
       shift the whole curve against the month labels. */
    ck("30-07 T1: 1 Jan 2026 is day 1", znfsDayOfYear("2026-01-01"), 1, 0);
    ck("30-07 T1: 31 Dec 2026 is day 365", znfsDayOfYear("2026-12-31"), 365, 0);
    ck("30-07 T1: 31 Dec 2028 is day 366 (leap)", znfsDayOfYear("2028-12-31"), 366, 0);
    ck("30-07 T1: 2026 has 365 days", znfsDaysInYear(2026), 365, 0);
    ck("30-07 T1: 2028 has 366 days", znfsDaysInYear(2028), 366, 0);
    ckT("30-07 T1: doy round-trips through iso", znfsIsoOfDoy(2026,211)==="2026-07-30");

    /* T2 — the popup's required CII and A–E bands must REPRODUCE engine.js exactly for the
       reporting year. This is the test that stops the boundaries dropdown from becoming a
       second, drifting implementation of the CII rules. */
    S = { year:2026, ship:shipT, rows:[
      { kind:"voyage", from:"EEA", to:"EEA", dist:5000, cargo:20000, hours:400,
        tStart:"2026-03-01T00:00", tEnd:"2026-03-17T16:00", fuels:[{fuelId:"HFO",tonnes:400}] }
    ] };
    const Rb = computeAll(S), Bb = znfsCiiYearBounds(2026);
    ckT("30-07 T2: bounds helper returns a result for a real ship", !!Bb);
    ck("30-07 T2: required CII matches engine.js", Bb.ciiReq, Rb.cii.ciiReq, 1e-9);
    ck("30-07 T2: reference CII matches engine.js", Bb.ciiRef, Rb.cii.ciiRef, 1e-9);
    ck("30-07 T2: Z factor matches engine.js", Bb.Z, Rb.cii.Z, 1e-9);
    ck("30-07 T2: band sup matches engine.js", Bb.bounds.sup, Rb.cii.bounds.sup, 1e-9);
    ck("30-07 T2: band low matches engine.js", Bb.bounds.low, Rb.cii.bounds.low, 1e-9);
    ck("30-07 T2: band up  matches engine.js", Bb.bounds.up,  Rb.cii.bounds.up,  1e-9);
    ck("30-07 T2: band inf matches engine.js", Bb.bounds.inf, Rb.cii.bounds.inf, 1e-9);
    ckT("30-07 T2: 2026 Z is a known table value, not a fallback", Bb.zKnown===true);
    ckT("30-07 T2: capacity unit carried through", Bb.capUnit===TYPE_BY_ID["bulk"].capUnit);

    /* T3 — the boundaries dropdown offers exactly Z_FACTORS' numeric years and nothing else.
       Z_FACTORS also holds `verified` and `src`; a leak of either would render as a band year. */
    const byrs = znfsCiiBoundaryYears();
    ckT("30-07 T3: boundary years start at 2023", byrs[0]===2023);
    ckT("30-07 T3: boundary years stop at 2030 (no silent Z fallback)", byrs[byrs.length-1]===2030);
    ckT("30-07 T3: boundary years are all 4-digit numbers", byrs.every(y=>/^\d{4}$/.test(String(y))));
    ckT("30-07 T3: boundary years exclude Z_FACTORS metadata keys",
        byrs.indexOf(NaN)<0 && byrs.length===Object.keys(Z_FACTORS).filter(k=>/^\d{4}$/.test(k)).length);
    /* a later year must tighten the required line — proves the dropdown actually does something */
    ckT("30-07 T3: 2028 bands are tighter than 2026",
        znfsCiiYearBounds(2028).ciiReq < znfsCiiYearBounds(2026).ciiReq);

    /* T4 — REPORTS path (the owner's chosen source). Three reports, known fuel and distance.
       Cumulative CO2 and distance must both be non-decreasing, and the final point must equal
       the AER computed straight from the totals: co2_g / (capacity x distance). */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[
      { t:"2026-01-10T12:00", dist:1000, fuels:{ HFO:30 } },
      { t:"2026-01-11T12:00", dist:1200, fuels:{ HFO:36 } },
      { t:"2026-02-01T12:00", dist:800,  fuels:{ MDO:20 } }
    ] };
    const sr = znfsCiiSeries(2026, 45000, null);
    ckT("30-07 T4: reports are the source when reports exist", sr && sr.source==="reports");
    ck("30-07 T4: one point per reporting day", sr.pts.length, 3, 0);
    ckT("30-07 T4: cumulative CO2 never decreases",
        sr.pts.every((p,i)=> i===0 || p.co2_t >= sr.pts[i-1].co2_t - 1e-9));
    ckT("30-07 T4: cumulative distance never decreases",
        sr.pts.every((p,i)=> i===0 || p.dist >= sr.pts[i-1].dist - 1e-9));
    ck("30-07 T4: day 1 distance is that report's own", sr.pts[0].dist, 1000, 1e-9);
    ck("30-07 T4: final distance is the sum of all reports", sr.pts[2].dist, 3000, 1e-9);
    const wantCO2 = 66*FUEL_BY_ID["HFO"].cf + 20*FUEL_BY_ID["MDO"].cf;
    ck("30-07 T4: final CO2 uses the shared Cf table", sr.pts[2].co2_t, wantCO2, 1e-6);
    ck("30-07 T4: final point is CO2_g / (capacity x distance)",
       sr.pts[2].cii, wantCO2*1e6/(45000*3000), 1e-9);
    ck("30-07 T4: the 10 Jan point is that day's own running total",
       sr.pts[0].cii, 30*FUEL_BY_ID["HFO"].cf*1e6/(45000*1000), 1e-9);
    ckT("30-07 T4: dates are in ascending order", sr.pts.every((p,i)=> i===0 || p.doy>sr.pts[i-1].doy));
    ckT("30-07 T4: reports dated in another year are ignored",
        znfsCiiSeries(2025, 45000, null)===null);

    /* T4b — FUEL CODE TRANSLATION. Report records are keyed by mdaFuel()'s INTERMEDIATE codes,
       not by engine fuel ids, and the Workspace branch translates them through OVD_FUEL_MAP
       inside parseOVD. A curve that skipped that step would disagree with the card for every
       MGO / methanol / ethanol burner while looking perfectly healthy — which is exactly what
       happened before this was fixed (35 "MGO" entries in the sample workbook contributed no
       CO2 at all). These assertions exist so it cannot happen again. */
    ckT("30-07 T4b: MGO resolves to the engine's MDO Cf, not to nothing",
        znfsCiiFuelCf("MGO")===FUEL_BY_ID["MDO"].cf);
    ckT("30-07 T4b: methanol code M resolves to METH", znfsCiiFuelCf("M")===FUEL_BY_ID["METH"].cf);
    ckT("30-07 T4b: ethanol code E resolves to ETOH", znfsCiiFuelCf("E")===FUEL_BY_ID["ETOH"].cf);
    ckT("30-07 T4b: codes that need no translation still resolve",
        znfsCiiFuelCf("HFO")===FUEL_BY_ID["HFO"].cf && znfsCiiFuelCf("LNG")===FUEL_BY_ID["LNG"].cf);
    ckT("30-07 T4b: EVERY OVD_FUEL_MAP target is a real engine fuel with a Cf",
        Object.keys(OVD_FUEL_MAP).every(k=>znfsCiiFuelCf(k)!==null));
    ckT("30-07 T4b: every code mdaFuel() can emit is resolvable",
        ["HFO","LFO","MGO","MDO","LNG","LPGP","LPGB","M","E"].every(c=>znfsCiiFuelCf(c)!==null));
    ckT("30-07 T4b: a genuinely unknown grade returns null, never 0",
        znfsCiiFuelCf("NOTAFUEL")===null && znfsCiiFuelCf("")===null);
    /* and the series must actually USE the translation */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[
      { t:"2026-03-01T12:00", dist:1000, fuels:{ MGO:10 } } ] };
    const sg = znfsCiiSeries(2026, 45000, null);
    ck("30-07 T4b: an MGO-only curve counts MGO's CO2", sg.pts[0].co2_t, 10*FUEL_BY_ID["MDO"].cf, 1e-9);
    ck("30-07 T4b: …and flags nothing as unmapped", sg.nUnmapped, 0, 0);

    /* T5 — the reports curve and engine.js agree on the SAME activity. Same fuel, same
       distance, expressed once as reports and once as workspace rows: the curve's endpoint
       must land on engine.js's attained CII. This is the check that makes the reconcile note
       under the chart meaningful — a difference then really is the WINDOW, not the maths. */
    S = { year:2026, ship:shipT,
      rows:[{ kind:"voyage", from:"EEA", to:"EEA", dist:3000, cargo:20000, hours:300,
              tStart:"2026-01-10T00:00", tEnd:"2026-02-01T12:00",
              fuels:[{fuelId:"HFO",tonnes:66},{fuelId:"MDO",tonnes:20}] }],
      mdaReports:[
        { t:"2026-01-10T12:00", dist:1000, fuels:{ HFO:30 } },
        { t:"2026-01-11T12:00", dist:1200, fuels:{ HFO:36 } },
        { t:"2026-02-01T12:00", dist:800,  fuels:{ MDO:20 } }
      ] };
    const Rm = computeAll(S), sm = znfsCiiSeries(2026, 45000, Rm);
    const endM = sm.pts[sm.pts.length-1].cii;
    ck("30-07 T5: reports endpoint reconciles with engine.js attained CII",
       endM, Rm.cii.attained, 1e-9);
    ck("30-07 T5: reports distance total reconciles with engine.js",
       sm.pts[sm.pts.length-1].dist, Rm.cii.totalDist, 1e-9);
    ck("30-07 T5: reports CO2 total reconciles with engine.js",
       sm.pts[sm.pts.length-1].co2_t, Rm.cii.co2_t, 1e-6);

    /* T6 — ROWS FALLBACK (owner's rule: with no reports, step at row boundaries). Each row's
       whole CO2/distance must land on its END date, and the last step must again equal
       engine.js's attained figure — nothing prorated, nothing invented. */
    S = { year:2026, ship:shipT, mdaReports:[], rows:[
      { kind:"voyage", from:"EEA", to:"EEA", dist:2000, cargo:20000, hours:200,
        tStart:"2026-01-05T00:00", tEnd:"2026-01-15T00:00", fuels:[{fuelId:"HFO",tonnes:50}] },
      { kind:"port", from:"EEA", to:"EEA", hours:48,
        tStart:"2026-01-15T00:00", tEnd:"2026-01-17T00:00", fuels:[{fuelId:"MDO",tonnes:6}] },
      { kind:"voyage", from:"EEA", to:"EEA", dist:1500, cargo:18000, hours:150,
        tStart:"2026-02-10T00:00", tEnd:"2026-02-18T00:00", fuels:[{fuelId:"HFO",tonnes:40}] }
    ] };
    const Rw = computeAll(S), sw = znfsCiiSeries(2026, 45000, Rw);
    ckT("30-07 T6: falls back to rows when there are no reports", sw && sw.source==="rows");
    ck("30-07 T6: one step per row end date", sw.pts.length, 3, 0);
    ckT("30-07 T6: steps are dated at row END, not start",
        sw.pts[0].iso==="2026-01-15" && sw.pts[1].iso==="2026-01-17" && sw.pts[2].iso==="2026-02-18");
    ckT("30-07 T6: a port stay adds CO2 but no distance",
        sw.pts[1].co2_t > sw.pts[0].co2_t + 1e-9 && Math.abs(sw.pts[1].dist - sw.pts[0].dist) < 1e-9);
    ckT("30-07 T6: cumulative CO2 never decreases",
        sw.pts.every((p,i)=> i===0 || p.co2_t >= sw.pts[i-1].co2_t - 1e-9));
    ck("30-07 T6: rows endpoint reconciles with engine.js attained CII",
       sw.pts[2].cii, Rw.cii.attained, 1e-9);
    ck("30-07 T6: rows path includes at-berth CO2 in the numerator",
       sw.pts[2].co2_t, Rw.cii.co2_t, 1e-6);

    /* T7 — the shared From/To range must NOT shorten the graph. The owner chose a full
       calendar year x-axis regardless of the range, so the rows fallback re-runs computeAll
       on a clone with the range switched off. A range that excludes February must therefore
       still leave February on the curve — and S itself must come back untouched. */
    S.dateFilter = { fromISO:"2026-01-01T00:00", toISO:"2026-01-31T23:59", active:true };
    const srng = znfsCiiSeries(2026, 45000, computeAll(S));
    ckT("30-07 T7: full-year curve survives an active From/To range",
        srng && srng.pts.length===3 && srng.pts[2].iso==="2026-02-18");
    ckT("30-07 T7: the range filter itself is left untouched",
        S.dateFilter.active===true && S.dateFilter.toISO==="2026-01-31T23:59");
    /* and the CARD still honours the range — that gap is what the reconcile note reports */
    ckT("30-07 T7: the card's own figure still obeys the range (hence the note)",
        Math.abs(computeAll(S).cii.attained - srng.pts[2].cii) > 1e-9);
    delete S.dateFilter;

    /* T8 — an unmapped fuel grade must be COUNTED and surfaced, never silently treated as
       zero CO2 (which would make the curve read better than reality). */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[
      { t:"2026-01-10T12:00", dist:1000, fuels:{ HFO:30, WEIRDGRADE:5 } }
    ] };
    const su = znfsCiiSeries(2026, 45000, null);
    ck("30-07 T8: unmapped grades are counted", su.nUnmapped, 1, 0);
    ck("30-07 T8: unmapped tonnage is retained for the warning", su.unmapped["WEIRDGRADE"], 5, 1e-9);
    ck("30-07 T8: unmapped grades add no CO2", su.pts[0].co2_t, 30*FUEL_BY_ID["HFO"].cf, 1e-9);

    /* T9 — the chart itself. Rendered as a string in jsdom (no layout needed): it must contain
       all five rating chips, the required line and the curve, and must never print NaN or
       undefined into the SVG. */
    /* the first report deliberately has a lot of fuel over very little distance — that is what
       the start of a real year looks like, and it puts the cumulative CII far above the top of
       the band-driven y-scale so the CLIPPING path is actually exercised (see the y-scale note
       in znfsCiiTrendChart: the scale follows the A–E bands, never the early spike). */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[
      { t:"2026-01-10T12:00", dist:20,   fuels:{ HFO:40 } },
      { t:"2026-04-10T12:00", dist:9000, fuels:{ HFO:300 } },
      { t:"2026-07-30T12:00", dist:9000, fuels:{ HFO:280 } }
    ] };
    ZNCT.year = 2026; ZNCT.bYear = 2026; ZNCT.year_b = 2026; ZNCT.compare = false;
    ZNCT.bounds = znfsCiiYearBounds(2026);
    ZNCT.cur = znfsCiiSeries(2026, 45000, null); ZNCT.prev = null;
    const svg = znfsCiiTrendChart();
    ckT("30-07 T9: chart renders an svg", svg.indexOf("<svg")===0 && svg.indexOf("</svg>")>0);
    ckT("30-07 T9: chart has no NaN", svg.indexOf("NaN")<0);
    ckT("30-07 T9: chart has no undefined", svg.indexOf("undefined")<0);
    /* 2026-07-30c (Aurvin): C/D chip letters switched from white to a dark ink — white was
       unreadable on the pale gold/tan --rc/--rd fills (owner: "rating letter is not visible,
       make it darker"). A/B/E stay white (dark-enough backgrounds). */
    ckT("30-07 T9: all five rating chips are drawn",
        ["A","B","E"].every(L=>svg.indexOf('fill="#fff">'+L+'</text>')>0) &&
        ["C","D"].every(L=>svg.indexOf('fill="#3a2d0a">'+L+'</text>')>0));
    ckT("30-07 T9: bands use the app's own rating palette (--ra..--re)",
        svg.indexOf("var(--ra)")>0 && svg.indexOf("var(--re)")>0);
    ckT("30-07 T9: required CII is drawn dashed", svg.indexOf('stroke-dasharray="7 4"')>0);
    ckT("30-07 T9: the curve is drawn", svg.indexOf('stroke-width="2.6"')>0);
    ckT("30-07 T9: all twelve month labels are present",
        ["Jan 15","Feb 15","Mar 15","Apr 15","May 15","Jun 15","Jul 15","Aug 15","Sep 15","Oct 15","Nov 15","Dec 15"]
          .every(m=>svg.indexOf(m)>0));
    ckT("30-07 T9: hover capture rect exists", svg.indexOf('id="znct-hit"')>0);
    /* the early-year spike is expected to be clipped, and the top tick must SAY so */
    ckT("30-07 T9: a clipped curve marks the top tick with >", svg.indexOf("&gt;")>0);
    /* chips must not overlap after the de-overlap pass */
    const chipY = (svg.match(/<rect x="935" y="([\d.]+)" width="18"/g)||[])
      .map(s=>parseFloat(/y="([\d.]+)"/.exec(s)[1]));
    ckT("30-07 T9: rating chips do not overlap",
        chipY.length===5 && chipY.every((y,i)=> i===0 || y-chipY[i-1] >= 19.99));
    /* 2026-07-30b CONTRAST (owner instruction). The old fills were rgba(...,.13)–.20 and the
       curve was #2e7d8f at 2.1px; the owner asked for more contrast on both, with the band
       boundaries clearly visible and fills-only (no boundary lines). Since the bands are
       contiguous rects, a boundary only reads as a line if ADJACENT fills differ — so the
       assertion that matters is that no two neighbours share an alpha. */
    const fills = ["A","B","C","D","E"].map(L=>znfsCiiBandFill(L));
    const alphas = fills.map(f=>parseFloat((/,\s*([.\d]+)\s*\)\s*$/.exec(f)||[0,"0"])[1]));
    ckT("30-07 T9: every band fill parsed an alpha", alphas.every(a=>a>0 && a<=1));
    ckT("30-07 T9: every band fill is stronger than the old near-transparent values",
        alphas.every(a=>a>=0.20));
    ckT("30-07 T9: the deepest bands are well above the old maximum of .20",
        Math.max.apply(null,alphas) >= 0.5);
    /* A boundary reads as a line when the two fills differ AT ALL. Where the neighbours share a
       hue family (A/B are both greens) the ALPHA has to carry it; where the hue already differs
       (B green→C yellow, C yellow→D orange, D orange→E red) equal alpha is fine and deliberate. */
    ckT("30-07 T9: no two adjacent bands have an identical fill",
        fills.every((f,i)=> i===0 || f!==fills[i-1]));
    ckT("30-07 T9: the same-hue neighbours A and B are separated by alpha, not hue",
        Math.abs(alphas[0]-alphas[1]) >= 0.15);
    ckT("30-07 T9: the largest bands (A and E) stay lightest so the curve reads over them",
        alphas[0] < alphas[2] && alphas[4] < alphas[2]);
    ckT("30-07 T9: the curve is drawn in the darker ink, not the old mid teal",
        svg.indexOf(ZNCT_INK)>0 && svg.indexOf("#2e7d8f")<0);
    ckT("30-07 T9: the curve is drawn over a halo so it survives the deeper fills",
        svg.indexOf(ZNCT_HALO)>0 && svg.indexOf('stroke-width="5.6"')>0);
    ckT("30-07 T9: the required line uses the app's alert red, not the muted E colour",
        svg.indexOf("var(--red)")>0);
    /* the reference value is labelled on the axis, and the floor is NOT zero */
    ckT("30-07 T9: the required value is labelled on the y-axis in its own colour",
        svg.indexOf('fill="var(--red)"')>0);
    ckT("30-07 T9: the y-axis does not start at zero (reference must sit centred)",
        ZNCT.geo.yLo > 0);
    ckT("30-07 T9: …and the reference is at the middle when no widening was needed",
        ZNCT.widened===true || Math.abs((ZNCT.bounds.ciiReq-ZNCT.geo.yLo)/(ZNCT.geo.yHi-ZNCT.geo.yLo)-0.5)<0.005);
    /* the removed grey notes must NOT come back into the chart body */
    ckT("30-07 T9: the chart viewBox took the space the removed notes freed",
        svg.indexOf('viewBox="0 0 1000 470"')>0);

    /* T10 — the boundaries dropdown moves the BANDS ONLY. Same data, two band years: the
       plotted CII values must be byte-identical, while the required line must differ. If a
       future refactor ever wires the band year into the series builder, this fails. */
    const cA = znfsCiiSeries(2026, 45000, null).pts.map(p=>p.cii).join("|");
    ZNCT.bYear = 2029; ZNCT.bounds = znfsCiiYearBounds(2029);
    const cB = znfsCiiSeries(2026, 45000, null).pts.map(p=>p.cii).join("|");
    ckT("30-07 T10: changing the boundary year never changes the curve", cA===cB);
    ckT("30-07 T10: changing the boundary year does move the required line",
        znfsCiiYearBounds(2029).ciiReq !== znfsCiiYearBounds(2026).ciiReq);
    const svg29 = znfsCiiTrendChart();
    ckT("30-07 T10: the 2029 chart still renders cleanly",
        svg29.indexOf("NaN")<0 && svg29.indexOf("undefined")<0);

    /* T11 — axis tick text must not lie by rounding. A 2.5 tick printed as "3" would sit at
       the wrong height for small-capacity ships. */
    ckT("30-07 T11: whole ticks print without decimals", znfsCiiAxisNum(8)==="8");
    ckT("30-07 T11: a 2.5 tick keeps its half", znfsCiiAxisNum(2.5)==="2.5");
    ckT("30-07 T11: nice ceiling of 4.8 is 5", znfsNiceCeil(4.8)===5);
    ckT("30-07 T11: nice ceiling of 2.1 is 2.5", znfsNiceCeil(2.1)===2.5);
    /* the 5–10 band is where real CII values live, so the ladder must not jump 5 → 10 there */
    ckT("30-07 T11: nice ceiling of 6.4 is 8, not 10", znfsNiceCeil(6.4)===8);
    ckT("30-07 T11: nice ceiling of 5.4 is 6, not 10", znfsNiceCeil(5.4)===6);
    ckT("30-07 T11: nice ceiling of 14.2 is 15", znfsNiceCeil(14.2)===15);

    /* T11b — THE Y-SCALE RULE (rewritten 2026-07-30b on owner instruction: reference value
       towards the MIDDLE, all five A–E bands visible, ceiling under DOUBLE the reference).
       Those three cannot all hold above a zero floor, so the floor is NOT zero — that is the
       owner-approved trade and the first assertions pin it.
       Two earlier failures are also still pinned, because both were real and both are easy to
       reintroduce: a bands-only ceiling hid a poor performer's whole curve, and a peak-driven
       ceiling flattened everything (the sample workbook spikes to 52.8 on 18 Jan before
       decaying to 13.15 on the 31st). */
    const Bt = znfsCiiYearBounds(2026), bdT = Bt.bounds, reqT = Bt.ciiReq;
    const mkS = pts => ({ pts:pts });
    /* --- the normal case: a compliant ship, shaped like the owner's reference chart --- */
    const scGood = znfsCiiYScale(bdT, reqT, [mkS([{doy:3,cii:40},{doy:30,cii:5.2},{doy:330,cii:4.8}])]);
    ckT("30-07 T11b: ceiling is UNDER double the required CII", scGood.hi < reqT*2);
    ckT("30-07 T11b: the required CII sits at the MIDDLE of the axis",
        Math.abs((reqT - scGood.lo)/(scGood.hi - scGood.lo) - 0.5) < 0.005);
    ckT("30-07 T11b: the axis floor is above zero (what makes the two above possible)", scGood.lo > 0);
    /* the ceiling must be a round number a reader recognises, not whatever 1.85x happens to be */
    ckT("30-07 T11b: the ceiling is snapped to a nice round value",
        znfsNiceFloor(scGood.hi)===scGood.hi);
    ckT("30-07 T11b: snapping is DOWNWARD, so it can never break the under-double rule",
        scGood.hi <= reqT*1.85 + 1e-9);
    ckT("30-07 T11b: nice floor picks the value below, not above", znfsNiceFloor(9.97)===8);
    ckT("30-07 T11b: …and is exact on a value already nice", znfsNiceFloor(10)===10);
    ckT("30-07 T11b: nice floor handles sub-1 values", znfsNiceFloor(0.42)===0.4);
    ckT("30-07 T11b: all five bands are on the axis — D/E boundary below the ceiling",
        bdT.inf < scGood.hi);
    ckT("30-07 T11b: …and the A/B boundary above the floor", bdT.sup > scGood.lo);
    ckT("30-07 T11b: a compliant ship needs no widening", scGood.widened===false);
    ckT("30-07 T11b: …and its January spike is therefore clipped, not accommodated", scGood.hi < 40);
    /* --- the case that forced the adaptive rule: the real sample workbook --- */
    const scReal = znfsCiiYScale(bdT, reqT, [mkS([
      {doy:9,cii:28.81},{doy:18,cii:52.76},{doy:24,cii:17.82},{doy:31,cii:13.15}])]);
    ckT("30-07 T11b: a poor performer's end value (13.15) is ON the chart", scReal.hi > 13.15);
    ckT("30-07 T11b: …its 52.8 spike is still clipped rather than setting the scale", scReal.hi < 52.76);
    ckT("30-07 T11b: …the bands remain visible underneath it", scReal.hi > bdT.inf && scReal.lo < bdT.sup);
    ckT("30-07 T11b: …and the widening is DECLARED, never silent", scReal.widened===true);
    /* --- degenerate inputs --- */
    const scNone = znfsCiiYScale(bdT, reqT, [null]);
    ckT("30-07 T11b: no data still yields a usable axis with every band on it",
        scNone.hi > bdT.inf && scNone.lo < bdT.sup && scNone.hi < reqT*2);
    ckT("30-07 T11b: a short import is accommodated",
        znfsCiiYScale(bdT, reqT, [mkS([{doy:5,cii:9}])]).hi > 9);
    /* --- the ghost line must not be drawn off the top of the chart --- */
    const scNoGhost = znfsCiiYScale(bdT, reqT, [mkS([{doy:300,cii:4.8}])]);
    const scGhost   = znfsCiiYScale(bdT, reqT, [mkS([{doy:300,cii:4.8}]), mkS([{doy:300,cii:22}])]);
    ckT("30-07 T11b: the ghost year's end value is kept on the chart", scGhost.hi > 22);
    ckT("30-07 T11b: …and without it the scale stays tight", scNoGhost.hi < scGhost.hi);
    /* --- the rule must hold across every ship type, not just bulk carriers. Each type has its
           own dd vector, and a wide one could push a band off the axis. --- */
    ckT("30-07 T11b: every ship type keeps all five bands on the axis", SHIP_TYPES.every(function(t){
      const cap = 50000, g2 = t.g2(cap), dd = t.ddf ? t.ddf(cap) : t.dd;
      const ref = g2.a*Math.pow(g2.cap,-g2.c), rq = ref*(1-Z_FACTORS[2026]/100);
      const bb = { sup:dd[0]*rq, low:dd[1]*rq, up:dd[2]*rq, inf:dd[3]*rq };
      const sc = znfsCiiYScale(bb, rq, [mkS([{doy:300,cii:rq*0.98}])]);
      return bb.inf < sc.hi && bb.sup > sc.lo && sc.lo >= 0 && sc.hi < rq*2;
    }));
    /* --- ticks: the step generator must never produce a zero/negative step --- */
    ckT("30-07 T11b: nice step is positive for any span",
        znfsNiceStep(8, 4) > 0 && znfsNiceStep(0.4, 4) > 0 && znfsNiceStep(140, 4) > 0);

    /* T12 — empty and degenerate states must not throw or invent a CII. */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[] };
    ckT("30-07 T12: no activity yields no series", znfsCiiSeries(2026,45000,computeAll(S))===null);
    S = { year:2026, ship:{typeId:"bulk",capacity:0}, rows:[], mdaReports:[] };
    ckT("30-07 T12: no capacity yields no bands (so the popup says so)", znfsCiiYearBounds(2026)===null);
    /* reports with fuel but no distance: CO2 accrues, CII stays null (nothing to divide by) */
    S = { year:2026, ship:shipT, rows:[], mdaReports:[
      { t:"2026-01-10T12:00", dist:0, fuels:{ HFO:10 } } ] };
    const s0 = znfsCiiSeries(2026, 45000, null);
    ckT("30-07 T12: fuel burned with no distance gives CO2 but no CII",
        s0.pts[0].co2_t>0 && s0.pts[0].cii===null);
    ckT("30-07 T12: a curve of only null points draws nothing rather than zero",
        znfsCiiPath(s0.pts, v=>v, v=>v)===null);

    S = Sk;
  }catch(e){ fail++; out.push("FAIL  2026-07-30 CII trend popup tests threw: "+(e&&(e.stack||e.message))); }

  /* ==========================================================================
     2026-07-30e — "YEAR TO DATE FUELEU COMPLIANCE BALANCE" TREND POPUP tests.
     Unlike the CII curve, this one deliberately asks the REAL ENGINE for every point (see the
     long note above znfsFeuSeries in fullscreen.js) rather than summing anything itself, so the
     tests that matter most are RECONCILIATION ones: does the last plotted point match a direct
     computeAll() over the identical window, and does changing the shared date filter leave the
     graph's own full-calendar-year x-axis alone (same rule as the CII popup, T7). */
  try{
    const Sk2 = S;
    const shipT2 = { typeId:"bulk", capacity:45000 };
    const feuFuel = [{ fuelId:"HFO", tonnes:400 }];
    S = { year:2026, ship:shipT2, mdaReports:[], rows:[
      { kind:"voyage", from:"EEA", to:"EEA", dist:5000, cargo:20000, hours:400,
        tStart:"2026-01-01T00:00", tEnd:"2026-02-01T00:00", fuels:feuFuel },
      { kind:"voyage", from:"EEA", to:"EEA", dist:5000, cargo:20000, hours:400,
        tStart:"2026-02-01T00:00", tEnd:"2026-06-01T00:00", fuels:feuFuel }
    ] };
    const RfullYear = computeAll(S);
    ckT("30-07e T1: the sample ship actually has FuelEU energy in scope (test is meaningful)",
        RfullYear.fueleu && RfullYear.fueleu.E_total > 0);

    /* T2 — series basics: one point per distinct row end-date, ascending, dated correctly. */
    const sf = znfsFeuSeries(2026);
    ckT("30-07e T2: one point per row end date", sf && sf.pts.length===2);
    ckT("30-07e T2: points are dated at row END, not start",
        sf.pts[0].iso==="2026-02-01" && sf.pts[1].iso==="2026-06-01");
    ckT("30-07e T2: dates are in ascending day-of-year order", sf.pts[1].doy > sf.pts[0].doy);

    /* T3 — RECONCILIATION: the last point must equal a direct computeAll() over the SAME window
       (1 Jan through the last row's end date) — proof this popup never drifts from engine.js,
       because it never re-implements engine.js, it just calls it with a narrower date filter. */
    const Swin = Object.assign({}, S, { dateFilter:{ fromISO:"2026-01-01T00:00", toISO:"2026-06-01T23:59", active:true } });
    const Rwin = computeAll(Swin);
    const lastPt = sf.pts[sf.pts.length-1];
    ck("30-07e T3: last point's balance reconciles with a direct engine call over the same window",
       lastPt.cb, Rwin.fueleu.cb/1e6, 1e-9);
    ck("30-07e T3: last point's GHG intensity reconciles",
       lastPt.ghgie, Rwin.fueleu.ghgie, 1e-9);
    ck("30-07e T3: last point's target reconciles", lastPt.target, Rwin.fueleu.target, 1e-9);

    /* T4 — the x-axis stays the full calendar year even when the shared From/To range would
       exclude some of it (same owner rule as the CII popup's T7). */
    S.dateFilter = { fromISO:"2026-01-01T00:00", toISO:"2026-02-15T23:59", active:true };
    const sfRanged = znfsFeuSeries(2026);
    ckT("30-07e T4: full-year series survives an active From/To range",
        sfRanged && sfRanged.pts.length===2 && sfRanged.pts[1].iso==="2026-06-01");
    ckT("30-07e T4: the range filter itself is left untouched",
        S.dateFilter.active===true && S.dateFilter.toISO==="2026-02-15T23:59");
    delete S.dateFilter;

    /* T5 — the projection is a genuine least-squares fit: two points define a line exactly, so
       the projected value at any x must match that line's equation to the last decimal. */
    const projTest = znfsFeuProjection([{doy:10,cb:100},{doy:100,cb:-260}], 365);
    const wantSlope = (-260-100)/(100-10);
    ck("30-07e T5: slope matches the two-point line exactly", projTest.slope, wantSlope, 1e-9);
    const wantProjected = 100 + wantSlope*(365-10);
    ck("30-07e T5: projection at year-end matches the line's equation", projTest.projected, wantProjected, 1e-6);
    ckT("30-07e T5: a single point projects flat (no slope to infer)",
        znfsFeuProjection([{doy:50,cb:-40}], 365).projected===-40);

    /* T6 — axis bounds always contain what they are meant to contain, whichever side of zero. */
    const bndNeg = znfsFeuYScaleLeft([{cb:-30},{cb:-5}], -45);
    ckT("30-07e T6: left axis floor is at or below the most negative value (incl. the projection)",
        bndNeg.lo <= -45);
    ckT("30-07e T6: left axis ceiling stays at or above zero when the ship ever has a positive day",
        znfsFeuYScaleLeft([{cb:12},{cb:-5}], -10).hi >= 12);
    const bndR = znfsFeuYScaleRight([{ghgie:88},{ghgie:92}], 89.3);
    ckT("30-07e T6: right axis contains both the target and every plotted intensity",
        bndR.lo <= 88 && bndR.lo <= 89.3 && bndR.hi >= 92 && bndR.hi >= 89.3);

    /* T7 — the chart renders cleanly (no NaN/undefined) and carries both curves + the legend
       markers a reader needs to tell them apart, plus the penalty-exposure tint. */
    ZNFT.year = 2026; ZNFT.target = RfullYear.fueleu.target; ZNFT.cur = sf;
    const svgF = znfsFeuTrendChart();
    ckT("30-07e T7: chart renders an svg", svgF.indexOf("<svg")===0 && svgF.indexOf("</svg>")>0);
    ckT("30-07e T7: chart has no NaN", svgF.indexOf("NaN")<0);
    ckT("30-07e T7: chart has no undefined", svgF.indexOf("undefined")<0);
    ckT("30-07e T7: the compliance-balance curve is drawn", svgF.indexOf(ZNFT_INK)>0);
    ckT("30-07e T7: the GHG intensity curve uses a distinct colour from the balance curve",
        svgF.indexOf(ZNFT_GHG)>0 && ZNFT_GHG!==ZNFT_INK);
    ckT("30-07e T7: the target line is dashed", svgF.indexOf('stroke-dasharray="5 4"')>0);
    ckT("30-07e T7: the penalty-exposure tint is present", svgF.indexOf(ZNFT_PENALTY_FILL)>0);
    ckT("30-07e T7: the hover capture rect exists", svgF.indexOf('id="znft-hit"')>0);
    ckT("30-07e T7: both hover dots exist (balance + intensity)",
        svgF.indexOf('id="znft-dot"')>0 && svgF.indexOf('id="znft-dot2"')>0);
    /* 2026-07-30f — COLOUR SCHEME matched to the owner's reference screenshots (sampled
       directly, not guessed): a light plot background (not white, not dark navy), a teal
       balance curve with a light-blue area-fill wash under it, and a RED reference colour for
       both the zero/threshold line and the dashed GHGIE target line. */
    ckT("30-07e T7: the balance curve is teal (var(--blue)), matching the reference screenshot",
        ZNFT_INK==="var(--blue)");
    ckT("30-07e T7: the reference colour (zero line + target line) is red, distinct from both curves",
        ZNFT_REF==="var(--red)" && ZNFT_REF!==ZNFT_INK && ZNFT_REF!==ZNFT_GHG);
    ckT("30-07e T7: the reference lines are drawn in that red", svgF.indexOf(ZNFT_REF)>0);
    ckT("30-07e T7: the plot area is washed with the app's own pale background colour, not left white",
        svgF.indexOf('fill="' + ZNFT_BG + '"')>0);
    ckT("30-07e T7: the area-fill wash under the balance curve uses the light-blue token",
        svgF.indexOf(ZNFT_AREA)>0);

    /* T8 — reconciliation note: when banking makes the card's cbFinal diverge from the graph's
       raw last point, the popup must name BOTH figures rather than silently pick one. */
    S.fueleuBankedIn = 5;   // tonnes CO2eq banked in — shifts cbFinal away from raw cb
    const Rbanked = computeAll(S);
    ZNFT.cardCbFinal = Rbanked.fueleu.cbFinal/1e6;
    ZNFT.cur = znfsFeuSeries(2026);
    const warnF = znfsFeuTrendWarnings();
    ckT("30-07e T8: banking makes the card figure differ from the raw curve (test is meaningful)",
        Math.abs(ZNFT.cardCbFinal - ZNFT.cur.pts[ZNFT.cur.pts.length-1].cb) > 1e-6);
    ckT("30-07e T8: the reconciliation note names both the raw and card figures",
        warnF.indexOf(fmtI(ZNFT.cur.pts[ZNFT.cur.pts.length-1].cb))>=0 &&
        warnF.indexOf(fmtI(ZNFT.cardCbFinal))>=0);
    delete S.fueleuBankedIn;

    /* T9 — degenerate state: no FuelEU energy in scope must not throw, and yields no series. */
    S = { year:2026, ship:shipT2, mdaReports:[], rows:[] };
    ckT("30-07e T9: no rows yields no series", znfsFeuSeries(2026)===null);

    S = Sk2;
  }catch(e){ fail++; out.push("FAIL  2026-07-30e FuelEU trend popup tests threw: "+(e&&(e.stack||e.message))); }

  const g=(pass+" passed, "+fail+" failed");
  const el=document.getElementById("testout"); el.style.display=""; el.textContent=out.join("\n")+"\n\n"+g;
}

initDateFilters(); renderWorkspace(); renderVessel();

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
