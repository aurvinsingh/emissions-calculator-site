/* ============================================================================
   js/fullscreen.js — ZeroNorth-style FULL-SCREEN "Vessel Overview" view
   2026-07-28 (Aurvin, owner instruction)
   ----------------------------------------------------------------------------
   WHAT THIS IS
   A presentation shell over the existing calculator that mimics the ZeroNorth
   Emission Analytics "Vessel Overview" page: dark icon rail, vessel header,
   vessel-particulars strip, four regulatory KPI cards (IMO/CII, FuelEU,
   EU ETS, UK ETS) and — underneath — the calculator's OWN three data tables
   (Report-Wise / Leg-Wise / Voyage-Wise) behind tab pills.

   Opened by the ⛶ button at the right-hand end of the nav bar (after ❓ Help).
   Closed by the ✕ button top-right or the Escape key.

   THE THREE DESIGN RULES THIS FILE OBEYS
   1. It does NOT duplicate any table or any calculation. The real DOM nodes
      #tab-trace / #tab-calcs / #tab-voy are physically MOVED into the overlay
      on open and MOVED BACK on close, and the existing renderTrace() /
      renderCalcs() / renderVoyage() are what fill them. getElementById finds a
      node wherever it lives, so every handler, checkbox, Excel button and
      tooltip keeps working untouched. Nothing can drift out of sync because
      there is only one implementation.
   2. It does NOT edit js/ui.js or js/engine.js. To stay fresh when the user
      changes a filter or edits a row it WRAPS two existing global functions
      (dfRepaint and renderLive) at the bottom of this file — classic scripts
      put top-level function declarations on window, so replacing the property
      is enough and the original is still called first.
   3. The KPI numbers come from computeAll(S) — the same engine call the
      Workspace right-hand panel and the Leg-Wise tab make — so full screen can
      never show a different number from the calculator. computeAll already
      honours S.year and S.dateFilter internally (js/engine.js ~line 399), so
      the header's Year / From / To controls filter the KPIs and the tables in
      one move, via the app's own dfYear / dfSet / dfClearRange handlers.

   KNOWN LIMIT (owner-agreed 2026-07-28): the vessel dropdown is DISPLAY ONLY.
   The calculator holds one vessel at a time (S.ship is overwritten by every MDA
   import and rows carry no per-row vessel), so there is nothing to switch to.
   "Ice class" is shown as "—" for the same reason: the app has no ice-class
   field. Ice DISTANCE (used by the CII ice correction) is real and is shown.
   ============================================================================ */

var ZNFS = { built:false, open:false, tab:"trace", wentFullscreen:false, prevTab:"work", home:{} };

/* the three relocatable panels, in the order the owner asked for.
   2026-07-28b (Aurvin, owner instruction): labels renamed to REPORTS / LEGS / VOYAGES and the
   emoji icons dropped, matching the same change made to the calculator's own nav buttons in
   index.html. The ids stay 'trace' / 'calcs' / 'voy' — they map to the #tab-… panel ids and
   are used in ~200 places; only the visible text changed. */
var ZNFS_TABS = [
  { id:"trace", label:"REPORTS", render:function(){ renderTrace();   } },
  { id:"calcs", label:"LEGS",    render:function(){ renderCalcs();   } },
  { id:"voy",   label:"VOYAGES", render:function(){ renderVoyage();  } }
];

/* ---------------------------------------------------------------- icon rail */
/* Decorative (owner-agreed): it reproduces the product chrome so the view reads
   as the real SaaS page. Nothing here is clickable; the leaf = emissions item is
   shown active, as in the reference screenshot. */
function znfsRail(){
  var P = {
    bell:  '<path d="M6 8a5 5 0 0 1 10 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M9 18a2 2 0 0 0 4 0"/>',
    map:   '<path d="M2 5l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M8 3v14M14 5v14"/>',
    list:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
    trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M15 8h5v5"/>',
    check: '<path d="M3 6h11M3 11h11M3 16h7"/><path d="M16 15l2.5 2.5L23 13"/>',
    route: '<path d="M8 21V9a4 4 0 0 1 4-4h5"/><path d="M14 2l3 3-3 3"/><circle cx="8" cy="21" r="1.4"/>',
    fuel:  '<rect x="4" y="4" width="10" height="17" rx="2"/><path d="M7 9h4"/><path d="M14 9h3a2 2 0 0 1 2 2v7a1.6 1.6 0 0 0 3 0v-6"/>',
    wrench:'<path d="M15 3a5 5 0 0 0-4.6 6.9L3 17.3V21h3.7l7.4-7.4A5 5 0 1 0 15 3z"/>',
    leaf:  '<path d="M4 20c0-9 6-15 16-16 1 10-5 16-14 16H4z"/><path d="M4 20C7 15 11 12 16 10"/>',
    docs:  '<rect x="7" y="3" width="13" height="16" rx="2"/><path d="M4 7v13a1 1 0 0 0 1 1h11"/>',
    chat:  '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 20l3-3"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
    gear:  '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };
  var ic = function(k, on){
    return '<div class="znic' + (on ? ' on' : '') + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + P[k] + '</svg></div>';
  };
  return '<aside class="znfs-rail" title="Product navigation (illustrative — not active in this tool)">' +
    '<div class="znlogo">N</div>' +
    ic("bell") + '<div class="znsep"></div>' +
    ic("map") + ic("list") + ic("trend") + '<div class="znsep"></div>' +
    ic("check") + ic("route") + ic("fuel") + ic("wrench") + '<div class="znsep"></div>' +
    ic("leaf", true) + ic("docs") +
    '<div class="znspacer"></div>' + ic("chat") + ic("gear") +
    '</aside>';
}

/* ------------------------------------------------------------- build (once) */
function znfsBuild(){
  if(ZNFS.built) return;
  var d = document.createElement("div");
  d.id = "znfs";
  d.className = "noprint";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-label", "Vessel Overview — full screen");
  d.innerHTML = znfsRail() +
    '<div class="znfs-main">' +
      '<div class="znfs-top" id="znfs-top"></div>' +
      '<div class="znfs-kpis" id="znfs-kpis"></div>' +
      '<div class="znfs-tabs" id="znfs-tabbar"></div>' +
      '<div id="znfs-slot"></div>' +
    '</div>';
  document.body.appendChild(d);
  ZNFS.built = true;
}

/* -------------------------------------------------------- the date controls */
/* 2026-07-28b (Aurvin, owner instruction): these used to live in the header's top-right.
   They now render on the TAB ROW, level with the REPORTS / LEGS / VOYAGES pills, so the
   filter sits immediately above the table it filters. Built as its own function because
   znfsRenderTabbar() repaints on every pill click while znfsRenderHeader() does not.
   The handlers are still the app's own dfYear / dfSet / dfClearRange (via the znfs*
   wrappers), so this is the SAME S.year / S.dateFilter every calculator tab reads. */
var ZNFS_YEARS = [2024,2025,2026,2027,2028,2029,2030];

/* 2026-07-28h (Aurvin, owner instruction) — znfsVoyFilterHtml() IS GONE.
   It drew VOYAGES its own INDEPENDENT, multi-year-capable Year/From/To (S.voyDateFilter), because
   until today a voyage range was allowed to cross a year boundary. The owner's instruction today
   reverses that: "we are able to select multiple years from the date filter, which should not be
   the case." So all three pills now render the SAME year-locked controls below, and there is no
   branch left in znfsFilterHtml(). See the long note on _mirrorVoyFilter() in js/ui.js for the
   full rationale and for what did NOT change (voyages are still selected by END date, so one that
   started in the previous year is still shown whole).

   NOTE FOR ANYONE RESTORING THE OLD BEHAVIOUR: this file is the SECOND half of the change. The
   calculator's own bar is renderDateFilterBar() in js/ui.js. Both must move together, or the two
   views will disagree about the filter — the exact drift the whole full-screen design avoids. */

function znfsFilterHtml(){
  var y = Number(S.year) || 2026;
  var df = S.dateFilter || {};
  var lo = y + "-01-01T00:00", hi = y + "-12-31T23:59";
  var narrowed = (df.fromISO || lo) !== lo || (df.toISO || hi) !== hi;
  var years = ZNFS_YEARS.map(function(yy){
    return '<option ' + (yy === y ? "selected" : "") + '>' + yy + '</option>';
  }).join("");
  return '<span class="znfs-filters">' +
    '<span class="znfs-fld" title="Reporting year — sets the CII bands, the EU ETS phase-in, the UK ETS window and the FuelEU target. Same control as the calculator tabs; changing it here changes it everywhere.">' +
      '<span class="lb">Year</span><select onchange="znfsYear(this.value)">' + years + '</select></span>' +
    '<span class="znfs-fld" title="Window start within ' + y + ' (UTC). Filters the KPI cards and all three tables.">' +
      '<span class="lb">From</span><input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(df.fromISO || lo) + '" onchange="znfsDate(\'fromISO\',this.value)"></span>' +
    '<span class="znfs-fld" title="Window end within ' + y + ' (UTC). Filters the KPI cards and all three tables.">' +
      '<span class="lb">To</span><input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(df.toISO || hi) + '" onchange="znfsDate(\'toISO\',this.value)"></span>' +
    (narrowed ? '<button class="znfs-clear" title="Reset From/To to the whole of ' + y + '" onclick="znfsClearRange()">✕ Clear</button>' : "") +
    '</span>';
}

/* ------------------------------------------------------------------ header */
function znfsRenderHeader(){
  var el = document.getElementById("znfs-top"); if(!el) return;
  var S0 = S, sh = (S0 && S0.ship) || {};
  var type = (typeof TYPE_BY_ID !== "undefined" && TYPE_BY_ID[sh.typeId]) || {};

  var R = null; try{ R = computeAll(S0); }catch(e){}
  var c = (R && R.cii) || {};
  var sm = (R && R.summary) || {};
  var capUnit = type.capUnit || c.capUnit || "DWT";
  var cap = Number(sh.capacity) > 0 ? fmtI(Number(sh.capacity)) + " mt" : "—";
  var latest = sm.tMax ? esc(fmtTs(sm.tMax)) + " UTC" : "—";
  var iceTip = "This calculator has no ice-class field, so there is nothing to display here. " +
               "Ice DISTANCE is modelled and is shown in the next pill — it feeds the CII ice correction.";
  var iceDist = (sm.distIce != null) ? fmtI(sm.distIce) + " nm" : "—";

  /* 2026-07-28b (Aurvin, owner instruction): the top-right no longer carries the display-only
     "VESSEL … · IMO …" pill, nor the Year / From / To controls.
       • The vessel pill was pure duplication — the name is already the H1 immediately to its
         left and the IMO is already in the particulars strip below.
       • The date controls moved DOWN to the tab row (znfsRenderTabbar), so the filter sits
         directly above the table it filters.
     Only the ✕ close button remains up here. */
  el.innerHTML =
    '<div class="znfs-crumbs"><span>Emission Analytics</span><span>/</span><b>Vessel Overview</b></div>' +
    '<div class="znfs-title">' +
      '<h1>' + esc(sh.name || "Vessel") + '</h1><span class="caret">▾</span>' +
      '<div class="znfs-toprt">' +
        '<button class="znfs-close" title="Close full screen and return to the calculator (Escape)" onclick="znfsClose()">✕</button>' +
      '</div>' +
    '</div>' +
    '<div class="znfs-parts">' +
      '<span class="p"><span class="chip">' + esc(type.name || "Ship type not set") + '</span></span>' +
      '<span class="p">IMO<b>' + esc(sh.imo || "—") + '</b></span>' +
      '<span class="p">Capacity (' + esc(capUnit) + ')<b>' + cap + '</b></span>' +
      '<span class="p" title="' + esc(iceTip) + '">Ice class<b>—</b></span>' +
      '<span class="p" title="Distance sailed through ice in the selected window — used by the IMO CII ice correction.">Ice distance<b>' + iceDist + '</b></span>' +
      /* 2026-07-28c (Aurvin, owner instruction): the "Reference AER/CII" pill was removed from
         this strip — not needed now that the IMO card leads with the CII pill itself. The
         reference line is still computed (R.cii.ciiRef) and still drives the required CII; it
         is simply no longer surfaced here. Restore by re-adding a pill reading fmtF(c.ciiRef,3). */
      '<span class="p" title="Timestamp of the most recent activity inside the selected window — the calculator has no live feed, so this is the latest imported/entered report, not a server sync time.">Latest data<b>' + latest + '</b></span>' +
    '</div>';
}

/* filter handlers — thin wrappers so the overlay chrome repaints too. The real work is
   done by the app's own dfYear / dfSet / dfClearRange (js/ui.js), which is why the
   calculator tabs and full screen can never disagree about the filter. */
function znfsYear(v){ dfYear(v); znfsRefresh(true); }
function znfsDate(field, v){ dfSet(field, v); znfsRefresh(true); }
function znfsClearRange(){ dfClearRange(); znfsRefresh(true); }
/* the VOYAGES equivalents (2026-07-28c). 2026-07-28h: VOYAGES no longer has controls of its own,
   so nothing in this file calls these any more — they are kept as aliases because tools/
   verify_fullscreen_view.js drives them by name, and because js/ui.js's voyYear / voySet /
   voyClear are themselves now aliases of dfYear / dfSet / dfClearRange. Everything therefore
   lands on the one year-locked filter. */
function znfsVoyYear(v){ if(v) voyYear(v); else voyClear(); znfsRefresh(true); }
function znfsVoyDate(field, v){ voySet(field, v); znfsRefresh(true); }
function znfsVoyClear(){ voyClear(); znfsRefresh(true); }

/* --------------------------------------------------------------- KPI cards */
function znfsRatingColour(r){
  var m = { A:"#5f9d78", B:"#93b884", C:"#e2cc7e", D:"#dcaa72", E:"#c17570" };
  return m[String(r || "").toUpperCase()] || "#cbd5db";
}
function znfsRenderKpis(){
  var el = document.getElementById("znfs-kpis"); if(!el) return;
  var R; try{ R = computeAll(S); }catch(e){
    el.innerHTML = '<div class="znk"><div class="body"><p class="note">The calculation could not be run: ' + esc(String(e && e.message || e)) + '</p></div></div>';
    return;
  }
  var c = R.cii, e = R.ets, u = R.ukets, f = R.fueleu, sm = R.summary;
  var yr = '<span class="yr">' + R.year + '</span>';
  var rowsIn = (S.rows || []).length;

  if(!rowsIn){
    el.innerHTML = '<div class="znk" style="grid-column:1/-1"><div class="body">' +
      '<p class="note">No voyages or port stays in this workspace yet, so there is nothing to report. Close full screen and use ' +
      '<b>⬆ Import data</b> in the header (OVD · MDA · THETIS), or add rows on the Workspace tab — then reopen this view.</p></div></div>';
    return;
  }

  /* --- 1. IMO / CII ---
     2026-07-28c (Aurvin, owner instruction): the hero is now the calculator's OWN CII pill,
     reused as-is via ciiPillHtml(pct, rating, attained, "lg") from js/ui.js — the same three
     segments (% of required · A–E rating · attained CII) shown on the Workspace panel, Leg-Wise,
     Voyage-Wise and their TOTAL rows. Reusing the function rather than restyling a copy means
     this pill can never drift from the ones in the tables.
     It replaces BOTH the old numeric hero and the separate amber rating chip (the pill already
     carries the rating letter and its background colour is the rating colour). Per the owner's
     choice the unit lives in the tooltip, not beside the pill. znfsRatingColour is consequently
     no longer used here; kept in the file as it is a useful one-liner. */
  var pct = null; try{ pct = ciiPctOfRequired(c); }catch(e2){}
  var pillTip = "Left: attained CII × 100 ÷ required CII (below 100% is better than required). " +
                "Middle: IMO A–E rating for " + R.year + ". Right: the attained CII itself (AER), " +
                "in gCO₂ per " + (c.capUnit || "DWT") + "·nm.";
  var pillHtml = "";
  try{ pillHtml = ciiPillHtml(pct, c.rating, c.attained, "lg"); }catch(e3){
    pillHtml = '<span class="n">' + fmtF(c.attained, 3) + '</span>';   // never leave the card blank
  }
  /* 2026-07-28g (Aurvin, owner instruction), three changes to this card:

     TASK 1 — the "% of required 99.0%" detail row is REMOVED. It was a duplicate: the CII pill's
     own LEFT segment already reads the % of required (that is what 07-28c's pill reuse brought
     in), so the row restated the pill's first number one line below it.

     TASK 3 — the "Required CII 7.180" detail row is REMOVED as a row and shown beside the pill
     instead, in the small `.u` caption style the other cards use for their units. It is context
     for the pill (the line the attained figure is measured against), so it belongs next to it,
     not in the list of headline figures below.

     TASK 2 — "Transport work" is REPLACED by "IMO EEOI". Transport work is a denominator, not a
     result; EEOI is the IMO carbon-intensity measure the owner actually reads, and the tonne-mile
     figure is still visible inside it. Source: `R.summary.co2PerTW` — this is the SAME formula the
     Leg-Wise and Voyage-Wise TOTAL rows use for their IMO EEOI column (`co2AllTot*1e6/twImoTot`,
     js/ui.js): engine.js's `co2Total` is co2Sea+co2Berth (all CO₂, berths included) and `sum.tw`
     accumulates only voyage rows with cargo>0 and dist>0 — identical numerator and denominator.
     So the card cannot disagree with the tables underneath it. It is TtW CO₂ only, per
     MEPC.1/Circ.684 — deliberately NOT the well-to-wake CO₂e EEOI in the Sea Cargo Charter block.
     The same implausibility cut-off the tables apply is honoured here, so the card cannot print a
     figure the table below it would withhold. */
  var eeoiCut = (typeof EEOI_IMPLAUSIBLE === "number") ? EEOI_IMPLAUSIBLE : 10000;
  var eeoiVal = sm.co2PerTW;
  var eeoiTxt = (eeoiVal == null)
    ? '<b class="dim" title="No transport work in this window — nothing to divide by.">—</b>'
    : (eeoiVal > eeoiCut
        ? '<b class="dim" title="Withheld as implausible: ' + fmtF(eeoiVal, 0) + ' gCO₂/t·nm is over the ' + eeoiCut + ' display cut-off. The consumption is still counted in every total.">—</b>'
        : '<b>' + fmtF(eeoiVal, 2) + ' g/t·nm</b>');
  var reqCap = '<span class="u" title="Required CII for this ship type, capacity and year — the reference line × the year\'s Z reduction factor. The pill\'s attained figure is measured against this.">required ' + fmtF(c.ciiReq, 3) + '</span>';
  var imo =
    '<div class="znk"><h3>IMO — CII' + yr + '</h3><div class="body">' +
      '<div class="hero" title="' + esc(pillTip) + '">' + pillHtml + reqCap + '</div>' +
      '<div class="kvz" title="Tank-to-Wake CO₂ over the whole selected window, all activity worldwide — not only the EU/UK-scoped share.">Total CO₂ <b>' + fmtI(c.co2_t) + ' mt</b></div>' +
      '<div class="kvz">Distance <b>' + fmtI(c.totalDist) + ' nm</b></div>' +
      '<div class="kvz" title="IMO EEOI (MEPC.1/Circ.684) — Tank-to-Wake CO₂ ÷ transport work (cargo × laden distance), over this window. Same figure as the IMO EEOI column\'s TOTAL on the LEGS and VOYAGES tables. Not the Sea Cargo Charter EEOI, which is well-to-wake CO₂e.">IMO EEOI ' + eeoiTxt + '</div>' +
    '</div></div>';

  /* --- 2. FuelEU Maritime ---
     2026-07-28c (Aurvin, owner instruction): the COMPLIANCE BALANCE is now the card's headline
     figure instead of the attained GHG intensity. The owner's reasoning is operational — the
     balance (and the penalty that follows from it) is the number that has to be acted on; the
     intensity is how it was arrived at. GHGIE attained is demoted to a detail row (his choice
     of the three options offered), so nothing is lost from the card. */
  var cbT = (f.cbFinal == null ? null : f.cbFinal / 1e6);   // gCO₂eq -> tonnes
  var cbPos = (cbT || 0) >= 0;
  var feu =
    '<div class="znk"><h3>FuelEU Maritime' + yr + '</h3><div class="body">' +
      '<div class="hero" title="Compliance balance after banking / borrowing / pooling. Positive = surplus, negative = deficit. Indicative only — FuelEU is period-based in law.">' +
        '<span class="n ' + (cbT == null ? "dim" : (cbPos ? "pos" : "neg")) + '">' + (cbT == null ? "—" : fmtI(cbT)) + '</span>' +
        '<span class="u">t CO₂eq ' + (cbT == null ? "compliance balance" : (cbPos ? "surplus" : "deficit")) + '</span></div>' +
      '<div class="kvz" title="Article 23 penalty on a remaining deficit, including the multiplier for consecutive deficit years.">Penalty <b class="' + (f.penalty > 0 ? "neg" : "pos") + '">' + (f.penalty > 0 ? "€ " + fmtI(f.penalty) : "None") + '</b></div>' +
      '<div class="kvz" title="Attained well-to-wake GHG intensity of the energy in scope — the figure the compliance balance is derived from.">GHGIE attained <b>' + fmtF(f.ghgie, 2) + ' g/MJ</b></div>' +
      '<div class="kvz" title="91.16 gCO₂eq/MJ reference minus this year\'s reduction (' + f.targetPct + '%).">Target <b>' + fmtF(f.target, 2) + ' g/MJ</b></div>' +
      '<div class="kvz" title="Energy inside the FuelEU scope, fuel plus on-shore power supply.">Energy in scope <b>' + fmtF(f.E_total / 1e6, 1) + ' ×10⁶ MJ</b></div>' +
      /* 2026-07-28g TASK 4 (Aurvin, owner instruction): the "Allocation — Optimal/Proportional"
         row is removed. It reported a SETTING, not a result — the method is chosen on the
         Workspace panel and is still shown there, and it is still named in the LEGS tab's FuelEU
         info icon ("Allocation method: optimal (cleanest-first, essf-ws1-2-5)"). Nothing about
         how the balance is computed changed; f.allocMethod is untouched and still drives it. */
    '</div></div>';

  /* --- 3. EU ETS --- */
  var ets =
    '<div class="znk"><h3>EU ETS' + yr + '</h3><div class="body">' +
      '<div class="hero"><span class="n">' + fmtI(e.euas) + '</span><span class="u">EUAs to surrender</span></div>' +
      '<div class="kvz" title="Emissions inside EU ETS scope on this year\'s basis: ' + esc(e.basisLabel) + '.">Covered <b>' + fmtI(e.basis_t) + ' mt</b></div>' +
      '<div class="kvz" title="Basis of the covered figure for ' + R.year + ' (CH₄ and N₂O join the scope from 2026).">Basis <b class="dim">' + esc(e.basisLabel) + '</b></div>' +
      '<div class="kvz" title="Share of covered emissions that must actually be surrendered in this year (euets-art3gb).">Phase-in <b>' + Math.round(e.phase * 100) + '%</b></div>' +
      '<div class="kvz" title="EUAs × the EUA price set in Settings.">Cost @ €' + fmtI(S.euaPrice) + ' <b>€ ' + fmtI(e.cost) + '</b></div>' +
    '</div></div>';

  /* --- 4. UK ETS --- */
  var uk =
    '<div class="znk"><h3>UK ETS' + yr + '</h3><div class="body">' +
      (u.active
        ? '<div class="hero"><span class="n">' + fmtI(u.tco2e) + '</span><span class="u">UKAs (tCO₂e)</span></div>' +
          '<div class="kvz" title="UK ETS scope: UK→UK voyages plus UK in-port activity (ukets-sch2a-p7).">Covered CO₂e <b>' + fmtI(u.tco2e) + ' mt</b></div>' +
          '<div class="kvz" title="Prescribed GWP: CH₄ 28, N₂O 265 (ukets-sch2a-p35).">CO₂ / CH₄ / N₂O <b>' + fmtI(u.co2) + ' / ' + fmtF(u.ch4, 3) + ' / ' + fmtF(u.n2o, 3) + '</b></div>' +
          '<div class="kvz" title="UKAs × the UKA price set in Settings.">Cost @ £' + fmtI(S.ukaPrice) + ' <b>£ ' + fmtI(u.cost) + '</b></div>'
        : '<div class="hero"><span class="n dim">—</span><span class="u">no obligation in ' + R.year + '</span></div>' +
          '<div class="kvz" title="The UK ETS maritime obligation starts with scheme year 2026.">Obligation starts <b>2026</b></div>' +
          '<div class="kvz" title="Computed anyway, so the exposure is visible before the obligation begins.">Computed CO₂e <b class="dim">' + fmtI(u.tco2e) + ' mt</b></div>') +
    '</div></div>';

  el.innerHTML = imo + feu + ets + uk;
}

/* ---------------------------------------------------- lower section (tabs) */
/* 2026-07-28h (Aurvin) — RESCUE THE RELOCATED TOOLBAR BEFORE THE ROW IS REBUILT.
   znfsRenderTabbar() sets el.innerHTML, which destroys #znfs-extras and, with it, the REAL
   .dfextra node (⬇ Download + ⓘ) that znfsMountExtras() had moved up out of the panel. If the
   panel has not re-rendered since, that node is the only copy in existence and it is simply gone —
   the tab row loses its Download button and its ⓘ, which is what "no tooltip appears" looks like
   from the outside. It went unnoticed until today because nothing used to call znfsRenderTabbar()
   twice between panel renders; voyClear/voySet becoming aliases of dfClearRange/dfSet (which call
   the wrapped dfRepaint, which itself refreshes the overlay) made it a two-refresh path.
   So: put the node back in its panel's .dfbar first, where znfsMountExtras() will find it again.
   If the panel has meanwhile built a FRESH .dfextra, the held one is stale — drop it, so the
   panel can never end up holding two and the mount can never pick the wrong one. */
function _znfsRescueExtras(){
  var slot = document.getElementById("znfs-extras"); if(!slot) return;
  var held = slot.querySelector(".dfextra"); if(!held) return;
  var panel = document.getElementById("tab-" + (held.getAttribute("data-znfstab") || ZNFS.tab));
  var bar = panel && panel.querySelector(".dfbar");
  if(bar && !bar.querySelector(".dfextra")) bar.appendChild(held);        // home again
  else if(held.parentNode) held.parentNode.removeChild(held);             // superseded — discard
}
function znfsRenderTabbar(){
  var el = document.getElementById("znfs-tabbar"); if(!el) return;
  _znfsRescueExtras();                        // 2026-07-28h — MUST precede the innerHTML below
  var pills = ZNFS_TABS.map(function(t){
    return '<button class="tt' + (t.id === ZNFS.tab ? " on" : "") + '" onclick="znfsTab(\'' + t.id + '\')">' + t.label + '</button>';
  }).join("");
  /* Voyage-Wise USED to keep its own multi-year range (S.voyDateFilter), which the header's
     year-locked From/To could not express, so it was spelled out in a small grey caption sitting
     between the pills and the filters:
       "Range shown is the voyage range (can span years). KPI cards follow the reporting year."
     2026-07-28e (Aurvin, owner instruction — "this info is not needed. Keep it in info icon"):
     that caption was REMOVED from the row and znfsInfoNote() appends the wording into the
     relocated ⓘ popup instead, for the VOYAGES pill only.
     2026-07-28h (Aurvin, owner instruction): the multi-year range itself is gone — all three pills
     share the one year-locked filter now, so there is no longer anything for a caption to warn
     about. znfsInfoNote() still runs on VOYAGES, but its text has been rewritten to describe the
     END-DATE selection rule rather than a separate range. */
  /* 2026-07-28b: the Year / From / To controls live on this row (right-aligned), level with the
     pills and directly above the table — moved down from the header's top-right.
     2026-07-28c: #znfs-extras is the landing slot for the active panel's own Excel button and
     info icon, relocated here by znfsMountExtras() — see that function for why. */
  el.innerHTML = pills + znfsFilterHtml() + '<span class="znfs-extras" id="znfs-extras"></span>';
}

/* 2026-07-28c (Aurvin, owner instruction): each panel renders its own toolbar row via
   renderDateFilterBar(mode, extraHtml), whose right-hand `.dfextra` span carries that tab's
   ⬇ Download button (labelled "⬇ Excel" until 2026-07-28f) and ⓘ info icon. That toolbar sat as
   a SECOND row inside the panel, costing
   the table a row of height. This moves the real `.dfextra` NODE up into the tab row, so the
   whole panel toolbar can be hidden by CSS and the table gets that row back.

   Why a node move rather than re-generating the markup here: the Excel buttons and info
   popovers are built per tab inside js/ui.js (voyIcons / legWiseIcons / traceInfo, with their
   own onclick handlers and tooltip content). Moving the real node means this file never has to
   know or duplicate any of that — exactly the same reasoning as moving the whole panels.

   MUST be called AFTER znfsRenderTabbar() (which rewrites #znfs-extras) and after any panel
   re-render (which builds a FRESH .dfextra, orphaning the one already moved). Emptying the
   slot first is what keeps a stale copy from piling up. */
/* 2026-07-28h (Aurvin) — MADE IDEMPOTENT. This fixes the quirk recorded as "pre-existing, not
   fixed" in the 2026-07-28e handover: the old body cleared the slot FIRST and only then looked for
   `.dfbar .dfextra` inside the panel. On a second call with no panel re-render in between, the
   node it wanted had already been moved out of the panel and into the slot — which had just been
   emptied — so the toolbar vanished and the ⓘ went with it.

   Why it stopped being harmless today: voyClear/voySet are now aliases of dfClearRange/dfSet,
   which call the WRAPPED dfRepaint, which already calls znfsRefresh() (and therefore
   znfsMountExtras). The znfsVoy* wrappers then call znfsRefresh(true) a second time — two mounts,
   one render. That emptied the tab row. Rather than unpick the refresh chain, the mount is now
   safe to call any number of times: find the node FIRST (in the panel, or already in the slot),
   and only clear what is genuinely stale. */
function znfsMountExtras(){
  var slot = document.getElementById("znfs-extras");
  if(!slot) return;
  var panel = document.getElementById("tab-" + ZNFS.tab);
  /* Prefer a freshly rendered toolbar still sitting in the panel. Otherwise fall back to one
     already mounted here — but ONLY if it was mounted for the tab that is active now, so a tab
     switch can never leave the previous tab's Download button on the row. */
  var ex = panel && panel.querySelector(".dfbar .dfextra");
  if(!ex){
    var held = slot.querySelector(".dfextra");
    if(held && held.getAttribute("data-znfstab") === ZNFS.tab) ex = held;
  }
  while(slot.firstChild) slot.removeChild(slot.firstChild);   // drop anything stale
  if(ex){
    ex.setAttribute("data-znfstab", ZNFS.tab);                // stamp it for the check above
    slot.appendChild(ex);                                     // re-append survives the clear
  }
  znfsInfoNote();
}

/* 2026-07-28e (Aurvin, owner instruction): the VOYAGES caption that used to sit on the tab row
   is gone; its wording lives in the ⓘ that znfsMountExtras() just moved up here.

   Why the text is appended to the popup HERE rather than added to the popup's source in
   js/ui.js: the sentence about the policy cards is only TRUE inside this overlay. The
   calculator's own VOYAGES tab has no KPI cards, so putting it in renderVoyage()'s ⓘ would put
   a false statement in front of every non-full-screen user. Keeping it in this file keeps the
   overlay's own explanations with the overlay — the same rule the rest of fullscreen.js follows.

   Safe against duplication two ways: renderVoyage() rebuilds a FRESH .dfextra (and therefore a
   fresh .ibpop) on every repaint, so each mount starts from clean markup; and the data flag
   below stops a second append if znfsMountExtras() ever runs twice without a re-render. */
function znfsInfoNote(){
  if(ZNFS.tab !== "voy") return;
  var slot = document.getElementById("znfs-extras"); if(!slot) return;
  var pop = slot.querySelector(".ibpop"); if(!pop) return;
  if(pop.getAttribute("data-znfsnote")) return;
  pop.setAttribute("data-znfsnote", "1");
  var add = document.createElement("span");
  /* 2026-07-28h (Aurvin, owner instruction): rewritten. It used to say this tab was "not locked to
     a single year the way REPORTS and LEGS are", and warned that the cards and the table could be
     showing different windows. Both statements are now false — VOYAGES is year-locked too and the
     window is shared, which is the point of today's change. The paragraph is kept (rather than
     deleted) because the END-DATE rule is the one thing about this tab a reader still needs, and
     it is the reason a voyage starting in the previous year appears here at all. */
  add.innerHTML = "<br><br><b>In this full-screen view:</b> the Year / From / To controls on the " +
    "tab row are the <b>same</b> ones REPORTS and LEGS use — one reporting year, one window, and " +
    "the four policy cards above follow it too. VOYAGES differs only in <b>how</b> that window is " +
    "applied: a voyage is included when its <b>end date</b> falls inside it, so a voyage that " +
    "started in the previous calendar year still appears here in full, graded under its end-date " +
    "year's rules.";
  pop.appendChild(add);
}
function znfsTab(id){
  ZNFS.tab = id;
  ZNFS_TABS.forEach(function(t){
    var n = document.getElementById("tab-" + t.id);
    if(n) n.style.display = (t.id === id) ? "" : "none";
  });
  var t = ZNFS_TABS.filter(function(x){ return x.id === id; })[0];
  if(t) try{ t.render(); }catch(e){}
  /* tab bar AFTER the panel render: the filter controls it draws depend on which tab is active
     (year-locked vs the VOYAGES range), and znfsMountExtras needs the freshly rendered panel */
  znfsRenderTabbar();
  znfsMountExtras();
}

/* ------------------------------------------------------------ open / close */
/* Repaint the overlay chrome. The KPI cards are always safe to redraw; the header and the
   tab row are NOT redrawn while one of their own inputs has focus, otherwise re-rendering
   would yank focus out of a datetime-local box the user is still typing into.
   2026-07-28b: the tab row now holds the date controls, so it needs the same guard the
   header has — before this change only #znfs-top could be "busy". */
function znfsRefresh(force){
  if(!ZNFS.open) return;
  znfsRenderKpis();
  var act = document.activeElement || {};
  var typing = /INPUT|SELECT/.test(act.tagName || "");
  var inside = function(id){
    var n = document.getElementById(id);
    return !force && typing && n && n.contains(act);
  };
  if(!inside("znfs-top")) znfsRenderHeader();
  if(!inside("znfs-tabbar")) znfsRenderTabbar();
  /* always last: a panel re-render (dfRepaint) creates a fresh .dfextra, and znfsRenderTabbar
     wipes the slot — so the relocated toolbar has to be re-mounted after both */
  znfsMountExtras();
}

function znfsOpen(){
  znfsBuild();
  if(ZNFS.open) return;

  /* remember which calculator tab was on, so Close puts the user back there */
  var on = ZNFS_TABS.concat([{id:"work"},{id:"vessel"},{id:"constants"},{id:"help"}]).filter(function(t){
    var b = document.getElementById("tb-" + t.id);
    return b && b.classList.contains("on");
  })[0];
  ZNFS.prevTab = (on && on.id) || "work";

  /* MOVE the real panels into the overlay, remembering exactly where each came
     from (parent + next sibling) so Close can restore the original order. */
  var slot = document.getElementById("znfs-slot");
  ZNFS.home = {};
  ZNFS_TABS.forEach(function(t){
    var n = document.getElementById("tab-" + t.id);
    if(!n) return;
    ZNFS.home[t.id] = { parent:n.parentNode, next:n.nextSibling, display:n.style.display };
    slot.appendChild(n);
  });

  document.body.classList.remove("shell");   // the overlay owns the layout while it is open
  document.body.classList.add("znfs-open");
  document.getElementById("znfs").classList.add("on");
  ZNFS.open = true;

  znfsRenderHeader();
  znfsRenderKpis();
  znfsTab(ZNFS.tab);

  /* real browser fullscreen, requested on <html> (NOT on the overlay) so that the
     info-icon popovers — which toggleInfo reparents to document.body — stay inside
     the fullscreen element and remain visible. */
  try{
    var d = document.documentElement;
    var req = d.requestFullscreen || d.webkitRequestFullscreen || d.msRequestFullscreen;
    if(req && !document.fullscreenElement){
      var p = req.call(d);
      ZNFS.wentFullscreen = true;
      if(p && p.catch) p.catch(function(){ ZNFS.wentFullscreen = false; });   // blocked (e.g. some file:// cases) — overlay still works
    }
  }catch(e){ ZNFS.wentFullscreen = false; }
}

function znfsClose(){
  if(!ZNFS.open) return;
  ZNFS.open = false;

  /* 2026-07-28c: drop the relocated Excel/info node. Every panel rebuilds a fresh one on its
     next render (showTab below re-renders the tab being returned to), so nothing is lost —
     this just stops an orphaned copy sitting in the hidden overlay. */
  var ex = document.getElementById("znfs-extras");
  if(ex) while(ex.firstChild) ex.removeChild(ex.firstChild);

  /* put every panel back exactly where it was */
  ZNFS_TABS.forEach(function(t){
    var n = document.getElementById("tab-" + t.id), h = ZNFS.home[t.id];
    if(!n || !h || !h.parent) return;
    if(h.next && h.next.parentNode === h.parent) h.parent.insertBefore(n, h.next);
    else h.parent.appendChild(n);
  });

  document.getElementById("znfs").classList.remove("on");
  document.body.classList.remove("znfs-open");

  if(ZNFS.wentFullscreen){
    ZNFS.wentFullscreen = false;
    try{
      var x = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if(x && document.fullscreenElement) { var p = x.call(document); if(p && p.catch) p.catch(function(){}); }
    }catch(e){}
  }

  try{ showTab(ZNFS.prevTab); }catch(e){}   // restores display, the .shell body class and re-renders
}

function znfsToggle(){ if(ZNFS.open) znfsClose(); else znfsOpen(); }

/* Escape closes. In real fullscreen most browsers swallow Escape to leave
   fullscreen and never fire keydown, so fullscreenchange is the backstop. */
document.addEventListener("keydown", function(ev){
  if(ZNFS.open && (ev.key === "Escape" || ev.keyCode === 27)){ ev.preventDefault(); znfsClose(); }
}, true);
["fullscreenchange","webkitfullscreenchange","msfullscreenchange"].forEach(function(evt){
  document.addEventListener(evt, function(){
    if(ZNFS.open && ZNFS.wentFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) znfsClose();
  });
});

/* ------------------------------------------------------------------- hooks */
/* Keep the overlay chrome fresh without editing js/ui.js. Top-level function
   declarations in a classic script live on window, and every call inside ui.js
   resolves through the global object — so replacing the property here wraps the
   function for the whole app. The original is always called first; the overlay
   work is wrapped in try/catch so a fault in this file can never break a
   calculator repaint. */
(function(){
  var _dfRepaint = window.dfRepaint;
  if(typeof _dfRepaint === "function"){
    window.dfRepaint = function(){
      var r = _dfRepaint.apply(this, arguments);
      try{ znfsRefresh(); }catch(e){}
      return r;
    };
  }
  var _renderLive = window.renderLive;
  if(typeof _renderLive === "function"){
    window.renderLive = function(){
      var r = _renderLive.apply(this, arguments);
      try{ znfsRefresh(); }catch(e){}
      return r;
    };
  }
})();
