/* ============================================================
   EMISSIONS CALCULATOR — CALCULATION CORE (pure functions)
   Grounded in _RULEFINDER_BUILD/knowledge_base.json chunks.
   Every constant carries a `src` (chunk_id) and `verified` flag.
   verified:false  => FILL-IN from outside the KB — confirm before
                      external use (see Constants tab in the UI).
   ============================================================ */

const GWP_FUELEU = { ch4: 25, n2o: 298, src: "fueleu-annexi (Directive (EU) 2018/2001 Annex V C(4)); values as applied in essf-ws1-example-1", verified: true };
const GWP_UKETS  = { ch4: 28, n2o: 265, src: "ukets-sch2a-p35 Table C1 (verbatim: 28 tCO2e/tCH4, 265 tCO2e/tN2O)", verified: true };
// EU ETS CO2e (CH4+N2O in scope from 2026): amended MRV GWP values not yet chunked in KB.
// The GWP set applied here is USER-SELECTABLE (state.arSet: "AR5" default | "AR4") because the
// exact amended-MRV values are an unverified FILL-IN either way. FuelEU (AR4-era 25/298, verbatim
// fueleu-annexi) and UK ETS (AR5 28/265, verbatim ukets-sch2a-p35 Table C1) are LOCKED — those
// regulations prescribe their GWP set; a user choice there would produce non-compliant numbers.
const GWP_SETS = {
  AR5: { ch4: 28, n2o: 265, label: "IPCC AR5 (28 / 265)", src: "FILL-IN: EU MRV amended GWPs not in KB; AR5 values as in UK ETS Table C1 used as proxy", verified: false },
  AR4: { ch4: 25, n2o: 298, label: "IPCC AR4 (25 / 298)", src: "FILL-IN: EU MRV amended GWPs not in KB; AR4 values as in RED II Annex V / FuelEU", verified: false }
};
function euetsGwp(state){ return GWP_SETS[(state&&state.arSet)==="AR4" ? "AR4" : "AR5"]; }

/* ---------- FUEL LIBRARY ----------
   lcv [MJ/g], wtt [gCO2eq/MJ], cf/ch4/n2o [g/gFuel]  — FuelEU Annex II (chunk fueleu-annexii)
   TtW EFs identical in UK ETS Table C2 (chunk ukets-sch2a-p36).
   TBM/N-A cells resolved per Annex II rule: "highest default value of the fuel class
   in the same column" (fossil class: CH4 0.00005, N2O 0.00018).
   bio:  WtT = E − cf/lcv  (Annex II col.4(a)); E is a user input from the BDN/RED II cert.
   rfnbo: WtT is a user input (cert per Art 10); RWD=2 in GHG-intensity denominator 2025–2033 (fueleu-annexi).
   slip: Cslip % by fuel-consumer class (Annex II col.9 / Table C2 col.6). */
const SLIP = { "LNG Otto (dual fuel medium speed)": 3.1, "LNG Otto (dual fuel slow speed)": 1.7, "LNG Diesel (dual fuel slow speed)": 0.2, "LBSI": 2.6, src: "fueleu-annexii / ukets-sch2a-p36", verified: true };

const FUELS = [
  { id:"HFO",  name:"HFO (ISO 8217 RME–RMK)",  cls:"Fossil", lcv:0.0405, wtt:13.5, cf:3.114, ch4:0.00005, n2o:0.00018 },
  { id:"LFO",  name:"LFO (ISO 8217 RMA–RMD)",  cls:"Fossil", lcv:0.041,  wtt:13.2, cf:3.151, ch4:0.00005, n2o:0.00018 },
  { id:"MDO",  name:"MDO/MGO (ISO 8217 DMX–DMB)", cls:"Fossil", lcv:0.0427, wtt:14.4, cf:3.206, ch4:0.00005, n2o:0.00018 },
  { id:"LNG",  name:"LNG (fossil)", cls:"Fossil", lcv:0.0491, wtt:18.5, cf:2.750, ch4:0, n2o:0.00011, slip:true },
  { id:"LPGP", name:"LPG (Propane)", cls:"Fossil", lcv:0.046, wtt:7.8, cf:3.000, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"LPGB", name:"LPG (Butane)",  cls:"Fossil", lcv:0.046, wtt:7.8, cf:3.030, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"METH", name:"Methanol (fossil, natural gas)", cls:"Fossil", lcv:0.0199, wtt:31.3, cf:1.375, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"NH3",  name:"Ammonia (fossil, natural gas)", cls:"Fossil", lcv:0.0186, wtt:121, cf:0, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"H2",   name:"Hydrogen (fossil, natural gas)", cls:"Fossil", lcv:0.12, wtt:132, cf:0, ch4:0, n2o:0.00018, tbm:["n2o"] },
  { id:"BDSL", name:"Bio-diesel (RED II pathway)", cls:"Biofuel", bio:true, lcv:0.037, eDefault:14.9, cf:2.834, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"],
    lcvNote:"LCV 0.037 MJ/g as used in essf-ws1-example-3 (RED II Annex III value)", eNote:"E default 14.9 gCO2eq/MJ is the ILLUSTRATIVE value from essf-ws1-example-3 — replace with the certified E value from your BDN" },
  { id:"HVO",  name:"HVO (RED II pathway)", cls:"Biofuel", bio:true, lcv:0.044, eDefault:null, cf:3.115, ch4:0.00005, n2o:0.00018,
    lcvNote:"FILL-IN: LCV 44 MJ/kg per RED II Annex III — not in KB, verify" },
  { id:"BLNG", name:"Bio-LNG (RED II pathway)", cls:"Biofuel", bio:true, lcv:0.050, eDefault:15.0, cf:2.750, ch4:0, n2o:0.00011, slip:true,
    lcvNote:"LCV 0.050 MJ/g as used in essf-ws1 biomethane examples", eNote:"E default 15.0 is the ILLUSTRATIVE value from essf-ws1 examples — use certified value" },
  { id:"BMET", name:"Bio-methanol (RED II pathway)", cls:"Biofuel", bio:true, lcv:0.020, eDefault:null, cf:1.375, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"],
    lcvNote:"FILL-IN: LCV 20 MJ/kg per RED II Annex III — not in KB, verify" },
  { id:"ETOH", name:"Ethanol (RED II pathway)", cls:"Biofuel", bio:true, lcv:0.027, eDefault:null, cf:1.913, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"],
    lcvNote:"FILL-IN: LCV 27 MJ/kg per RED II Annex III — not in KB, verify" },
  { id:"EDSL", name:"e-diesel (RFNBO)", cls:"RFNBO", rfnbo:true, lcv:0.0427, wttDefault:null, cf:3.206, ch4:0.00005, n2o:0.00018, wttNote:"WtT per RFNBO certificate (fueleu-annexii col.4(b)) — user input" },
  { id:"EMET", name:"e-methanol (RFNBO)", cls:"RFNBO", rfnbo:true, lcv:0.0199, wttDefault:null, cf:1.375, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"ELNG", name:"e-LNG (RFNBO)", cls:"RFNBO", rfnbo:true, lcv:0.0491, wttDefault:null, cf:2.750, ch4:0, n2o:0.00011, slip:true },
  { id:"ENH3", name:"e-ammonia (RFNBO)", cls:"RFNBO", rfnbo:true, lcv:0.0186, wttDefault:null, cf:0, ch4:0.00005, n2o:0.00018, tbm:["ch4","n2o"] },
  { id:"EH2",  name:"e-hydrogen (RFNBO)", cls:"RFNBO", rfnbo:true, lcv:0.12, wttDefault:null, cf:0, ch4:0, n2o:0.00018, tbm:["n2o"] },
  { id:"CUST", name:"Custom fuel (enter all factors)", cls:"Custom", custom:true, lcv:0.040, wtt:0, cf:0, ch4:0, n2o:0 }
];
const FUEL_BY_ID = Object.fromEntries(FUELS.map(f=>[f.id,f]));

/* ---------- CII: G2 reference-line parameters (chunk imo-g2-s4, MEPC.353(78) Table 1)
   and G4 dd vectors (chunk imo-g4-s4, MEPC.354(78) Table 1). ---------- */
const SHIP_TYPES = [
  { id:"bulk", name:"Bulk carrier", capUnit:"DWT", g2:(c)=> c>=279000? {a:4745,c:0.622,cap:279000} : {a:4745,c:0.622,cap:c}, dd:[0.86,0.94,1.06,1.18] },
  { id:"gas",  name:"Gas carrier", capUnit:"DWT", g2:(c)=> c>=65000? {a:14405e7,c:2.071,cap:c} : {a:8104,c:0.639,cap:c}, ddf:(c)=> c>=65000? [0.81,0.91,1.12,1.44] : [0.85,0.95,1.06,1.25] },
  { id:"tanker", name:"Tanker", capUnit:"DWT", g2:(c)=>({a:5247,c:0.610,cap:c}), dd:[0.82,0.93,1.08,1.28] },
  { id:"container", name:"Container ship", capUnit:"DWT", g2:(c)=>({a:1984,c:0.489,cap:c}), dd:[0.83,0.94,1.07,1.19] },
  { id:"gencargo", name:"General cargo ship", capUnit:"DWT", g2:(c)=> c>=20000? {a:31948,c:0.792,cap:c} : {a:588,c:0.3885,cap:c}, dd:[0.83,0.94,1.06,1.19] },
  { id:"reefer", name:"Refrigerated cargo carrier", capUnit:"DWT", g2:(c)=>({a:4600,c:0.557,cap:c}), dd:[0.78,0.91,1.07,1.20] },
  { id:"combo", name:"Combination carrier", capUnit:"DWT", g2:(c)=>({a:5119,c:0.622,cap:c}), dd:[0.87,0.96,1.06,1.14] },
  { id:"lng",  name:"LNG carrier", capUnit:"DWT",
    g2:(c)=> c>=100000? {a:9.827,c:0.0,cap:c} : (c>=65000? {a:14479e10,c:2.673,cap:c} : {a:14479e10,c:2.673,cap:65000, note:"KB text shows a=14779E10 for <65k DWT — official G2 commonly cited as 14479×10^10 (extraction ambiguity). VERIFY."}),
    ddf:(c)=> c>=100000? [0.89,0.98,1.06,1.13] : [0.78,0.92,1.10,1.37] },
  { id:"rorovc", name:"Ro-ro cargo ship (vehicle carrier)", capUnit:"GT", g2:(c)=> c>=57700? {a:3627,c:0.590,cap:57700} : (c>=30000? {a:3627,c:0.590,cap:c} : {a:330,c:0.329,cap:c}), dd:[0.86,0.94,1.06,1.16] },
  { id:"roro", name:"Ro-ro cargo ship", capUnit:"GT", g2:(c)=>({a:1967,c:0.485,cap:c}), dd:[0.76,0.89,1.08,1.27] },
  { id:"ropax", name:"Ro-ro passenger ship", capUnit:"GT", g2:(c)=>({a:2023,c:0.460,cap:c}), dd:[0.76,0.92,1.14,1.30] },
  { id:"ropaxhsc", name:"Ro-ro passenger — high-speed craft (SOLAS X)", capUnit:"GT", g2:(c)=>({a:4196,c:0.460,cap:c}), dd:[0.76,0.92,1.14,1.30] },
  { id:"cruise", name:"Cruise passenger ship", capUnit:"GT", g2:(c)=>({a:930,c:0.383,cap:c}), dd:[0.87,0.95,1.06,1.16] }
];
const TYPE_BY_ID = Object.fromEntries(SHIP_TYPES.map(t=>[t.id,t]));

/* Z reduction factors, % vs 2019 reference (formula in chunk imo-a6-reg28; NUMERIC values
   NOT in KB). FILL-INS: 2023–2026 per MEPC.338(76); 2027–2030 per MEPC 83 (2025) — VERIFY. */
const Z_FACTORS = { 2023:5, 2024:7, 2025:9, 2026:11, 2027:13.625, 2028:16.25, 2029:18.875, 2030:21.5, verified:false,
  src:"FILL-IN: imo-a6-reg28 defines the formula; numeric Z values not in KB (MEPC.338(76); 2027-30 per MEPC 83)" };

/* FuelEU Art 4(2) targets: 91.16 gCO2eq/MJ reference reduced by schedule (chunk fueleu-art4). */
const FUELEU_REF = 91.16;
function fueleuTargetPct(year){ if(year>=2050) return 80; if(year>=2045) return 62; if(year>=2040) return 31; if(year>=2035) return 14.5; if(year>=2030) return 6; if(year>=2025) return 2; return 0; }
function fueleuTarget(year){ return FUELEU_REF * (1 - fueleuTargetPct(year)/100); }

/* EU ETS phase-in (chunk euets-art3gb): 40% (2024), 70% (2025), 100% (2026+). */
function etsPhaseIn(year){ if(year>=2026) return 1.0; if(year===2025) return 0.7; if(year===2024) return 0.4; return 0; }

/* Wind reward factor fwind (chunk fueleu-annexi): 0.99 / 0.97 / 0.95 by PWind/PProp. */
function fwindFactor(ratio){ if(!ratio||ratio<0.05) return 1.0; if(ratio>=0.15) return 0.95; if(ratio>=0.10) return 0.97; return 0.99; }

/* ---------- per-fuel derived factors ---------- */
function slipPct(fuel, engine){ return fuel.slip ? (SLIP[engine] ?? 0) : 0; }
function wttOf(fuel, userE, userWtt){
  if(fuel.bio){ const E = (userE==null||userE==="") ? (fuel.eDefault ?? 0) : Number(userE); return E - fuel.cf/fuel.lcv; }
  if(fuel.rfnbo || fuel.custom){ return (userWtt==null||userWtt==="") ? (fuel.wtt ?? 0) : Number(userWtt); }
  return fuel.wtt;
}
/* FuelEU TtW intensity gCO2eq/MJ incl. slip (fueleu-annexi Eq.1/Eq.2; Csf: CO2=0,N2O=0,CH4=1) */
function ttwIntensity(fuel, engine){
  const s = slipPct(fuel, engine)/100;
  return ((1-s)*(fuel.cf + GWP_FUELEU.ch4*fuel.ch4 + GWP_FUELEU.n2o*fuel.n2o) + s*GWP_FUELEU.ch4) / fuel.lcv;
}

/* ---------- scope coverage ----------
   EU ETS (euets-art3ga) & FuelEU: EEA→EEA 100%, EEA↔other 50%, at berth EEA 100%.
   UK ETS (ukets-sch2a-p7): UK→UK voyages + UK in-port activity only. */
function euCoverage(row){
  if(row.kind==="port") return row.zone==="EEA" ? 1 : 0;
  const a=row.from==="EEA", b=row.to==="EEA";
  return (a&&b)?1:((a||b)?0.5:0);
}
function ukCoverage(row){
  if(row.kind==="port") return row.zone==="UK" ? 1 : 0;
  return (row.from==="UK"&&row.to==="UK")?1:0;
}

/* ---------- MAIN ---------- */
function computeAll(state){
  const y = Number(state.year)||2026;
  const GWP_EUETS = euetsGwp(state);   // user-selected AR set (EU ETS 2026+ CO2e only — see note above)
  const warn = [];
  const resolveFuel = (fr)=>{
    const base = FUEL_BY_ID[fr.fuelId]; if(!base) return null;
    const f = Object.assign({}, base);
    if(base.custom){ f.lcv=Number(fr.lcv)||0.04; f.cf=Number(fr.cf)||0; f.ch4=Number(fr.ch4)||0; f.n2o=Number(fr.n2o)||0; f.wtt=Number(fr.wtt)||0; }
    return f;
  };

  /* ---- aggregate per row ---- */
  let cii_g=0, totalDist=0, fuelCostAll=0;
  let ets_t_co2=0, ets_t_co2e=0, uk_co2=0, uk_ch4=0, uk_n2o=0;
  const feu = { terms:[], E_plain:0, E_rwd:0, num:0 }; // FuelEU accumulators (grams, MJ)
  const sccVoyages = [];
  const rowDetails = [];
  const sum = { hoursSea:0, hoursPort:0, cargo:0, tw:0, co2Sea:0, co2Berth:0, fuelByType:{}, fuelTotal:0, tMin:null, tMax:null };

  for(const row of state.rows||[]){
    const covEU = euCoverage(row), covUK = ukCoverage(row);
    const det = { kind:row.kind, label:row.label||"", covEU, covUK, tStart:row.tStart||"", tEnd:row.tEnd||"", hours:Number(row.hours)||0,
                  dist:row.kind==="voyage"?(Number(row.dist)||0):0, cargo:row.kind==="voyage"?(Number(row.cargo)||0):0,
                  fuels:[], co2:0, etsCO2:0, etsCO2e:0, ukCO2e:0, E:0 };
    if(row.kind==="voyage"){ totalDist += det.dist; sum.hoursSea += det.hours; sum.cargo += det.cargo; }
    else sum.hoursPort += det.hours;
    if(row.tStart && (!sum.tMin || row.tStart<sum.tMin)) sum.tMin = row.tStart;
    if(row.tEnd && (!sum.tMax || row.tEnd>sum.tMax)) sum.tMax = row.tEnd;

    for(const fr of row.fuels||[]){
      const f = resolveFuel(fr); if(!f) continue;
      const t = Number(fr.tonnes)||0; if(t<=0) continue;
      const engine = fr.engine || state.lngEngineDefault || "LNG Otto (dual fuel medium speed)";
      const s = slipPct(f, engine)/100;
      const price = Number(fr.price)||0; fuelCostAll += t*price;
      sum.fuelByType[f.id] = (sum.fuelByType[f.id]||0)+t; sum.fuelTotal += t;
      det.fuels.push({ id:f.id, name:f.name, tonnes:t, eligibleEU: t*covEU, eligibleUK: t*covUK });
      /* CII: all fuel, CO2 only (imo-g1-s4). Optional Circ.905 override via fr.ciiCf. */
      const cfCII = (fr.ciiCf!==undefined && fr.ciiCf!=="" && fr.ciiCf!=null) ? Number(fr.ciiCf) : f.cf;
      cii_g += t*1e6*cfCII;
      det.co2 += t*cfCII;
      /* EU ETS */
      if(covEU>0){
        const mt = t*covEU;
        const zero = state.bioZeroRatedETS && (f.bio||f.rfnbo);
        const efCO2 = zero?0:f.cf, efCH4 = zero?0:f.ch4, efN2O = zero?0:f.n2o;
        const mNC = mt*s;
        const co2e = (mt-mNC)*efCO2 + GWP_EUETS.ch4*((mt-mNC)*efCH4 + (zero?0:mNC)) + GWP_EUETS.n2o*(mt-mNC)*efN2O;
        ets_t_co2 += mt*efCO2; ets_t_co2e += co2e;
        det.etsCO2 += mt*efCO2; det.etsCO2e += co2e;
      }
      /* UK ETS (ukets-sch2a-p35) */
      if(covUK>0){
        const m = t*covUK, mNC = m*s;
        uk_co2 += (m-mNC)*f.cf; uk_ch4 += (m-mNC)*f.ch4 + mNC; uk_n2o += (m-mNC)*f.n2o;
        det.ukCO2e += (m-mNC)*f.cf + GWP_UKETS.ch4*((m-mNC)*f.ch4 + mNC) + GWP_UKETS.n2o*(m-mNC)*f.n2o;
      }
      /* FuelEU (fueleu-annexi) */
      if(covEU>0){
        const Mg = t*1e6*covEU;
        const E  = Mg*f.lcv;
        const wtt = wttOf(f, fr.E, fr.wtt);
        const ttw = ttwIntensity(f, engine);
        const rwd = (f.rfnbo && y>=2025 && y<=2033) ? 2 : 1;
        feu.terms.push({ id:f.id, name:f.name, E, wtt, ttw, rwd, tonnes:t*covEU, price, bio:f.bio||false, rfnbo:f.rfnbo||false });
        feu.E_plain += E; feu.E_rwd += E*rwd; feu.num += E*(wtt+ttw);
        det.E += E;
      }
    }
    if(row.kind==="voyage") sum.co2Sea += det.co2; else sum.co2Berth += det.co2;
    if(row.kind==="voyage" && det.cargo>0 && det.dist>0){
      const tw = det.cargo*det.dist;
      sum.tw += tw;
      sccVoyages.push({ label:det.label||("Voyage "+(sccVoyages.length+1)), co2:det.co2, tw, intensity: det.co2*1e6/tw });
    }
    rowDetails.push(det);
  }

  /* ---- CII ---- */
  const type = TYPE_BY_ID[(state.ship||{}).typeId] || SHIP_TYPES[0];
  const cap = Number((state.ship||{}).capacity)||0;
  const g2 = type.g2(cap);
  const dd = type.ddf ? type.ddf(cap) : type.dd;
  const ciiRef = g2.a * Math.pow(g2.cap, -g2.c);
  const Z = Z_FACTORS[y] ?? Z_FACTORS[2030] ?? 0;
  const ciiReq = ciiRef*(1 - Z/100);
  const attainedActual = (cap>0 && totalDist>0) ? cii_g/(cap*totalDist) : null;
  const bounds = { sup: dd[0]*ciiReq, low: dd[1]*ciiReq, up: dd[2]*ciiReq, inf: dd[3]*ciiReq };
  let rating=null;
  if(attainedActual!=null){
    rating = attainedActual<=bounds.sup?"A":attainedActual<=bounds.low?"B":attainedActual<=bounds.up?"C":attainedActual<=bounds.inf?"D":"E";
  }
  if(g2.note) warn.push("CII: "+g2.note);
  warn.push("CII Z factor for "+y+" ("+Z+"%) is a FILL-IN — numeric Z values are not in the KB ("+Z_FACTORS.src+").");

  /* ---- EU ETS ---- */
  const phase = etsPhaseIn(y);
  const etsBasis_t = y>=2026 ? ets_t_co2e : ets_t_co2;
  const euas = etsBasis_t*phase;
  const etsCost = euas*(Number(state.euaPrice)||0);
  if(y>=2026) warn.push("EU ETS 2026+: CO2e includes CH4/N2O using GWP "+GWP_EUETS.ch4+"/"+GWP_EUETS.n2o+" ("+GWP_EUETS.label+", selected in Vessel & settings) — the amended EU MRV GWP values are not in the KB; either set is a FILL-IN proxy. VERIFY. FuelEU (25/298) and UK ETS (28/265) GWPs are prescribed by regulation and are NOT affected by this selection.");
  if(state.bioZeroRatedETS) warn.push("EU ETS: biofuels/RFNBO zero-rated assumes RED II-compliant certification (MRR sustainability rules — simplification).");

  /* ---- UK ETS ---- */
  const ukets_t = uk_co2 + GWP_UKETS.ch4*uk_ch4 + GWP_UKETS.n2o*uk_n2o;
  const ukCost = ukets_t*(Number(state.ukaPrice)||0);
  const ukActive = y>=2026;

  /* ---- FuelEU ---- */
  const fwind = fwindFactor(Number(state.windRatio)||0);
  const opsMJ = Number(state.opsMJ)||0;
  const T = fueleuTarget(y);
  let ghgie=null, cb=null, penalty=0, penaltyBase=0;
  const E_total = feu.E_plain + opsMJ;
  /* essf-ws1-1-3-5 rounding rule: do NOT round intermediate results; only the final
     penalty is rounded (to the nearest integer). ESSF example tables show 5-dp
     display-rounded values, so results can differ from the printed tables by <0.001%. */
  if(E_total>0){
    ghgie = fwind * feu.num/(feu.E_rwd + opsMJ);      // OPS numerator term set to zero per Annex I
    cb = (T - ghgie)*E_total;                          // gCO2eq (Annex IV A)
  }
  const n = Math.max(1, Number(state.deficitPeriods)||1);
  const mult = 1+(n-1)/10;                             // Art 23(2)
  let cbAfter = cb;
  const banked = (Number(state.fueleuBankedIn)||0)*1e6;
  if(cbAfter!=null) cbAfter += banked;
  const poolCB = (Number(state.poolPartnerCB)||0)*1e6;
  const cbPooled = cbAfter!=null? cbAfter+poolCB : null;
  let borrowUsed=0, borrowDebt=0, borrowLimit=0;
  if(cbAfter!=null && cbAfter<0 && state.fueleuBorrow){
    borrowLimit = 0.02*T*E_total;                      // Art 20(2)(a)
    borrowUsed = Math.min(-cbAfter, borrowLimit);
    borrowDebt = borrowUsed*1.1;                       // Art 20(2)
  }
  const cbFinal = cbPooled!=null? cbPooled + borrowUsed : null;
  if(cbFinal!=null && cbFinal<0 && ghgie>0){
    penaltyBase = (-cbFinal)/(ghgie*41000)*2400;       // Annex IV B
    penalty = Math.round(penaltyBase*mult);            // final penalty rounded to nearest EUR
  }
  const surplusValue = (cbFinal!=null && cbFinal>0 && ghgie>0) ? cbFinal/(ghgie*41000)*2400 : 0;

  /* ---- per-row attribution (INDICATIVE — FuelEU/ETS are period-based in law) ---- */
  for(const det of rowDetails){
    det.euas = (y>=2026? det.etsCO2e : det.etsCO2)*phase;
    const share = E_total>0? det.E/E_total : 0;        // OPS energy share stays unattributed
    det.feuCB = cb!=null? cb*share : null;             // gCO2eq, pre-flexibility
    det.feuPenalty = penalty>0? penalty*share : 0;     // € share of the final annual penalty
  }

  /* ---- SCC ---- */
  const sccTotTW = sccVoyages.reduce((s,v)=>s+v.tw,0);
  const sccTotCO2 = sccVoyages.reduce((s,v)=>s+v.co2,0);
  const sccWeighted = sccTotTW>0? sccTotCO2*1e6/sccTotTW : null;
  const reqMin = Number(state.sccReqMin)||null, reqStr = Number(state.sccReqStriving)||null;
  const sccDeltaMin = (sccWeighted!=null&&reqMin)? (sccWeighted-reqMin)/reqMin*100 : null;
  const sccDeltaStr = (sccWeighted!=null&&reqStr)? (sccWeighted-reqStr)/reqStr*100 : null;

  /* ---- annual summary ---- */
  const co2Total = sum.co2Sea + sum.co2Berth;
  const distIce = Number(state.distIce)||0;
  const summary = {
    dist: totalDist, distIce, hoursSea: sum.hoursSea, hoursPort: sum.hoursPort,
    cargo: sum.cargo, tw: sum.tw,
    co2Sea: sum.co2Sea, co2Berth: sum.co2Berth, co2Total,
    fuelByType: sum.fuelByType, fuelTotal: sum.fuelTotal,
    co2PerDist: totalDist>0? co2Total/totalDist : null,               // t/nm
    co2PerTW: sum.tw>0? co2Total*1e6/sum.tw : null,                   // g/t·nm
    fuelPerDist: totalDist>0? sum.fuelTotal/totalDist : null,         // t/nm
    fuelPerTW: sum.tw>0? sum.fuelTotal*1e6/sum.tw : null,             // g/t·nm
    tMin: sum.tMin, tMax: sum.tMax
  };

  /* ---- Breakeven blend (numeric solve) ---- */
  let breakeven=null;
  if(ghgie!=null && ghgie>T && state.breakevenFuelId){
    const bf = FUEL_BY_ID[state.breakevenFuelId];
    if(bf){
      const engine = state.breakevenEngine || state.lngEngineDefault || "LNG Otto (dual fuel medium speed)";
      const bwtt = wttOf(bf, state.breakevenE, state.breakevenWtt);
      const bttw = ttwIntensity(bf, engine);
      const brwd = (bf.rfnbo && y>=2025 && y<=2033)?2:1;
      const gAt = (x)=>{
        const num = feu.num*(1-x) + feu.E_plain*x*(bwtt+bttw);
        const den = feu.E_rwd*(1-x) + feu.E_plain*x*brwd + opsMJ;
        return fwind*num/den;
      };
      if(gAt(1) <= T){
        let lo=0, hi=1;
        for(let i=0;i<80;i++){ const mid=(lo+hi)/2; if(gAt(mid)>T) lo=mid; else hi=mid; }
        const x=(lo+hi)/2;
        const E_sub = feu.E_plain*x;
        const tonnes = E_sub/bf.lcv/1e6;
        const dispTonnes = feu.terms.reduce((s,t)=>s+t.tonnes,0)*x;
        const priceSub = Number(state.breakevenPrice)||0;
        const avgPriceDisp = feu.terms.reduce((s,t)=>s+t.tonnes*t.price,0)/Math.max(1e-9,feu.terms.reduce((s,t)=>s+t.tonnes,0));
        breakeven = { fuel:bf.name, share:x, tonnes, dispTonnes, intensityAt:gAt(x),
          extraFuelCost: tonnes*priceSub - dispTonnes*avgPriceDisp,
          penaltyAvoided: penalty };
      } else {
        breakeven = { fuel:bf.name, impossible:true, intensityAt:gAt(1) };
      }
    }
  }

  return {
    year:y, warnings:warn, rowDetails, summary,
    cii:{ type:type.name, capUnit:type.capUnit, ciiRef, Z, ciiReq, attained:attainedActual, bounds, rating, totalDist, co2_t:cii_g/1e6, g2 },
    ets:{ covered_t_co2:ets_t_co2, covered_t_co2e:ets_t_co2e, basis_t:etsBasis_t, phase, euas, cost:etsCost, basisLabel: y>=2026?"CO2e (CO2+CH4+N2O)":"CO2 only (CH4/N2O from 2026)", gwp:GWP_EUETS },
    ukets:{ active:ukActive, tco2e:ukets_t, co2:uk_co2, ch4:uk_ch4, n2o:uk_n2o, cost:ukCost },
    fueleu:{ target:T, targetPct:fueleuTargetPct(y), ghgie, E_total, E_fuel:feu.E_plain, opsMJ, cb, banked, poolCB, borrowUsed, borrowDebt, borrowLimit, cbFinal, penalty, penaltyBase, mult, surplusValue, fwind, terms:feu.terms },
    scc:{ voyages:sccVoyages, weighted:sccWeighted, totTW:sccTotTW, totCO2:sccTotCO2, deltaMin:sccDeltaMin, deltaStr:sccDeltaStr },
    econ:{ fuelCostAll, etsCost, ukCost, fueleuPenalty:penalty, surplusValue, total: fuelCostAll+etsCost+ukCost+penalty-surplusValue, breakeven }
  };
}

/* browser build */
