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
   field. (Ice DISTANCE used to sit beside it in the particulars strip; the pill
   was removed on 2026-07-31 by owner instruction — see the note at that pill's
   former position. The value itself, sm.distIce, is still computed by the engine
   and still feeds the CII ice correction; only the display was dropped.)
   ============================================================================ */

/* 2026-08-09h: `wentFullscreen` was dropped from this state — the overlay no longer asks the
   browser for real fullscreen (it took Chrome's pinch zoom away; see the note in znfsOpen). */
var ZNFS = { built:false, open:false, tab:"trace", prevTab:"work", home:{} };

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

/* 2026-07-28m (Aurvin, owner instruction — Task 4): the Year selector moved OUT of this function
   and up into the vessel-particulars row (znfsRenderHeader) — see znfsYearHtml() below. From/To
   and the ✕ Clear button stay here, on the tab row, exactly where 2026-07-28b/c put them; only
   Year relocates (owner's explicit choice when asked). */
/* 2026-08-06 (Aurvin, owner instruction) — SINGLE VOYAGE VIEW on the full-screen tab row.
   The panel's own date-filter bar is hidden in full screen (`#znfs-slot .dfbar{display:none}`,
   css/styles.css), so svBarHtml()'s banner never reaches the screen here — this is the
   full-screen half of the same change, and the two must say the same things. The Year selector
   lives up in the header, handled in znfsYearHtml() below.

   2026-08-06c (Aurvin, owner instruction), three changes, all mirrored from js/ui.js's svBarHtml
   — these two bars are the same control drawn twice and must never read or behave differently:
     1. the three placeholder download buttons (⬇ FuelEU / ⬇ EU ETS / ⬇ UK ETS) are REMOVED
        ("I will make this part of the top download itself"). svDownloadsHtml() no longer exists.
     2. the button reads "✕ Reset", not "✕ Exit". It briefly read "✕ Reset View"; the owner
        overruled that on 2026-08-06d — "let this be named as 'Reset' only." The full label
        history and the one risk he knowingly accepted are recorded in svBarHtml (js/ui.js);
        do not re-litigate it here. This button is always enabled: in this view there is always
        a view to leave.
     3. From/To are disabled ONLY when the voyage crosses a year end. For a voyage wholly inside
        one calendar year they are live and bounded to that year, and editing one leaves the view
        (svDateSet, js/ui.js) — the owner's rule that a single-year voyage "merely works like a
        date filter, which we already were doing". */
function znfsSvFilterHtml(){
  var v = SVIEW;
  var y = (typeof svSoleYear === "function") ? svSoleYear() : null;
  var flds;
  if(y == null){
    flds =
      '<span class="znfs-fld" title="The voyage\'s own start. View only, because this voyage crosses a year end and the year-locked filter cannot express that window."><span class="lb">From</span>' +
        '<input type="datetime-local" lang="en-GB" disabled value="' + esc(v.tStart || "") + '"></span>' +
      '<span class="znfs-fld" title="The voyage\'s own end. View only, because this voyage crosses a year end and the year-locked filter cannot express that window."><span class="lb">To</span>' +
        '<input type="datetime-local" lang="en-GB" disabled value="' + esc(v.tEnd || "") + '"></span>';
  }else{
    var lo = y + '-01-01T00:00', hi = y + '-12-31T23:59';
    var tip = esc("The voyage's own start/end. This voyage is wholly inside " + y + ", so you may edit these — doing so leaves single voyage view and continues as an ordinary " + y + " date filter starting from this voyage's window.");
    flds =
      '<span class="znfs-fld" title="' + tip + '"><span class="lb">From</span>' +
        '<input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(v.tStart || lo) + '" onchange="svDateSet(\'fromISO\',this.value)"></span>' +
      '<span class="znfs-fld" title="' + tip + '"><span class="lb">To</span>' +
        '<input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(v.tEnd || hi) + '" onchange="svDateSet(\'toISO\',this.value)"></span>';
  }
  /* 2026-08-06c-ii (Aurvin, owner instruction): the cross-year flag sits here too, in the same
     place relative to the SINGLE VOYAGE VIEW chip. Built by svCrossFlagHtml() in js/ui.js rather
     than copied, so the badge and its tooltip can never drift between the two bars — the whole
     reason this file keeps failing to stay in step is hand-copied markup. Returns "" on a
     single-year voyage. */
  return '<span class="znfs-filters">' +
    '<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:6px;background:#0f3d4c;color:#fff;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap">SINGLE VOYAGE VIEW</span>' +
    '<b style="font-size:13px;color:#0f172a;margin:0 4px">' + esc(v.voy || "(no number)") + '</b>' +
    ((typeof svCrossFlagHtml === "function") ? svCrossFlagHtml() : "") +
    flds +
    '<button class="znfs-clear" title="Leave single voyage view and go back to the Year and From/To window you had before." onclick="svExitAndRepaint()">✕ Reset</button>' +
    ((typeof emcolsButtonHtml === "function") ? emcolsButtonHtml() : "") +
    '</span>';
}
function znfsFilterHtml(){
  if((typeof svActive === "function") && svActive()) return znfsSvFilterHtml();
  var y = Number(S.year) || 2026;
  var df = S.dateFilter || {};
  var lo = y + "-01-01T00:00", hi = y + "-12-31T23:59";
  var narrowed = (df.fromISO || lo) !== lo || (df.toISO || hi) !== hi;
  return '<span class="znfs-filters">' +
    '<span class="znfs-fld" title="Window start within ' + y + ' (UTC). Filters the KPI cards and all three tables.">' +
      '<span class="lb">From</span><input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(df.fromISO || lo) + '" onchange="znfsDate(\'fromISO\',this.value)"></span>' +
    '<span class="znfs-fld" title="Window end within ' + y + ' (UTC). Filters the KPI cards and all three tables.">' +
      '<span class="lb">To</span><input type="datetime-local" lang="en-GB" min="' + lo + '" max="' + hi + '" value="' + esc(df.toISO || hi) + '" onchange="znfsDate(\'toISO\',this.value)"></span>' +
    /* 2026-08-06 (Aurvin, owner instruction): label "✕ Clear" → "✕ Reset". Visible text only —
       the class (.znfs-clear), the handler (znfsClearRange -> dfClearRange) and the behaviour are
       unchanged. Kept in step with renderDateFilterBar() in js/ui.js; the two bars are the same
       control drawn twice and must never read differently. */
    /* 2026-08-06d (Aurvin, owner instruction): always drawn, greyed when there is nothing to
       reset — "it should always be permanently visible so that the date doesn't shift here and
       there… so that the user always remembers its presence." Built by dfResetBtnHtml() in
       js/ui.js so this copy cannot drift from the other two; the `.znfs-clear` class keeps the
       full-screen styling. The handler stays znfsClearRange -> dfClearRange, so behaviour is
       identical to the panel's bar, which is the whole point of sharing the builder. */
    ((typeof dfResetBtnHtml === "function")
      ? dfResetBtnHtml(narrowed, y, "znfs-clear")
      : (narrowed ? '<button class="znfs-clear" title="Reset From/To to the whole of ' + y + '" onclick="znfsClearRange()">✕ Reset</button>' : "")) +
    /* 2026-07-30i (Aurvin, owner instruction): the "▦ Edit columns" button sits at the RIGHT-hand
       end of this filter group, per the owner's screenshot. The markup is built by
       emcolsButtonHtml() in js/columns.js so the whole picker lives in one file; the guard means
       this row still renders normally if columns.js is ever removed or fails to load. */
    ((typeof emcolsButtonHtml === "function") ? emcolsButtonHtml() : "") +
    '</span>';
}
/* 2026-07-28m (Aurvin, owner instruction — Task 4): the Year field, split out of znfsFilterHtml()
   above so it can render in the vessel-particulars row instead of the tab row. Same handler
   (znfsYear -> the app's own dfYear), so it is still the one S.year the whole app reads — moving
   WHERE it renders changes nothing about what it drives. */
function znfsYearHtml(){
  /* 2026-08-06 (Aurvin, owner instruction): "the year button will not display Year in the
     dropdown as voyage can extend into two years." In SINGLE VOYAGE VIEW this renders a BLANK,
     DISABLED select rather than a year that would be a lie for a voyage spanning two of them.

     2026-08-06c (Aurvin, owner instruction) NARROWED THAT to the case it was written for. The
     rule is "only change the behaviour when a single voyage is spanning two different years" —
     so the blank disabled select now appears ONLY for a cross-year voyage. A voyage wholly inside
     one calendar year gets the ordinary dropdown with that year selected, because that year IS
     true of the whole voyage. Changing it still leaves the view (dfYear calls svExit first —
     owner confirmed he wants that kept), so the control is never a dead end either way. The
     cross-year test is svSoleYear(), which reads the per-year BUCKETS, not the date span. */
  if((typeof svActive === "function") && svActive()){
    var sy = (typeof svSoleYear === "function") ? svSoleYear() : null;
    /* 2026-08-06c-ii (Aurvin, owner instruction): "when multi year — allow year to change in the
       Single voyage view, that will also reset the view." So on a cross-year voyage this select is
       LIVE with a BLANK selected option: it shows no year (none is true of the voyage) but offers
       every year, and picking one leaves the view via svYearPick → dfYear → svExit. Mirrors
       svYearHtml() in js/ui.js — see the fuller note there, including why picking 2026 on a
       2025→2026 voyage gives you the whole of 2026 rather than the voyage's 2026 half. */
    if(sy == null){
      var vy = (SVIEW.years || []).join(" · ");
      var xTip = esc("This voyage runs across " + vy + ", so no single year is true of it and none is selected. Picking a year here LEAVES single voyage view and shows the whole of that year — it cannot show you just one year's half of the voyage. Press ✕ Reset on the tab row to go back without changing the year.");
      var xOpts = '<option value="" selected></option>' + ZNFS_YEARS.map(function(yy){
        return '<option>' + yy + '</option>';
      }).join("");
      return '<span class="znfs-fld" title="' + xTip + '">' +
        '<span class="lb">Year</span><select onchange="svYearPick(this.value)">' + xOpts + '</select></span>';
    }
    var syOpts = ZNFS_YEARS.map(function(yy){
      return '<option ' + (yy === sy ? "selected" : "") + '>' + yy + '</option>';
    }).join("");
    return '<span class="znfs-fld" title="This voyage sits wholly inside ' + sy + ', so the ordinary Year selector still applies. Changing it leaves single voyage view and shows the whole of the year you pick.">' +
      '<span class="lb">Year</span><select onchange="znfsYear(this.value)">' + syOpts + '</select></span>';
  }
  var y = Number(S.year) || 2026;
  var years = ZNFS_YEARS.map(function(yy){
    return '<option ' + (yy === y ? "selected" : "") + '>' + yy + '</option>';
  }).join("");
  return '<span class="znfs-fld" title="Reporting year — sets the CII bands, the EU ETS phase-in, the UK ETS window and the FuelEU target. Same control as the calculator tabs; changing it here changes it everywhere.">' +
    '<span class="lb">Year</span><select onchange="znfsYear(this.value)">' + years + '</select></span>';
}

/* ------------------------------------------------------------------ header */
function znfsRenderHeader(){
  var el = document.getElementById("znfs-top"); if(!el) return;
  /* 2026-07-28m: #znfs-extras (the relocated Download button + ⓘ) now lives INSIDE this
     header's own innerHTML (see .znfs-partsrt below), not the tab row's. This function
     rewrites el.innerHTML same as znfsRenderTabbar() always did, so it must rescue the
     real .dfextra node back into its panel FIRST, exactly as _znfsRescueExtras() already
     does for the tab row — otherwise a header repaint (e.g. every znfsRefresh()) would
     destroy the only copy of that node. See the long note above _znfsRescueExtras(). */
  _znfsRescueExtras();
  var S0 = S, sh = (S0 && S0.ship) || {};
  var type = (typeof TYPE_BY_ID !== "undefined" && TYPE_BY_ID[sh.typeId]) || {};

  var R = null; try{ R = computeAll(S0); }catch(e){}
  var c = (R && R.cii) || {};
  var sm = (R && R.summary) || {};
  var capUnit = type.capUnit || c.capUnit || "DWT";
  var cap = Number(sh.capacity) > 0 ? fmtI(Number(sh.capacity)) + " mt" : "—";
  var latest = sm.tMax ? esc(fmtTs(sm.tMax)) + " UTC" : "—";
  /* 2026-07-31 (Aurvin, owner instruction — Task 1): the "Ice distance" pill was removed from
     the particulars strip, so this tooltip no longer points at it. Ice distance is still
     computed (R.summary.distIce) and still feeds the CII ice correction — display only changed. */
  var iceTip = "This calculator has no ice-class field, so there is nothing to display here.";

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
      /* 2026-07-31 (Aurvin, owner instruction — Task 1): the "Ice distance" pill lived here and
         was removed. Restore by re-adding:
           '<span class="p" title="Distance sailed through ice in the selected window — used by
            the IMO CII ice correction.">Ice distance<b>' +
            ((sm.distIce != null) ? fmtI(sm.distIce) + " nm" : "—") + '</b></span>' +
         Nothing in the engine changed: sm.distIce is still computed and still applied. */
      /* 2026-07-28c (Aurvin, owner instruction): the "Reference AER/CII" pill was removed from
         this strip — not needed now that the IMO card leads with the CII pill itself. The
         reference line is still computed (R.cii.ciiRef) and still drives the required CII; it
         is simply no longer surfaced here. Restore by re-adding a pill reading fmtF(c.ciiRef,3). */
      '<span class="p" title="Timestamp of the most recent activity inside the selected window — the calculator has no live feed, so this is the latest imported/entered report, not a server sync time.">Latest data<b>' + latest + '</b></span>' +
      /* 2026-07-28m (Aurvin, owner instruction — Task 4): three items placed on the RIGHT of this
         row, right-aligned via margin-left:auto so they sit clear of the particulars list above.
         Order matches the owner's reference (left to right): a DUMMY "Vessel Reporting" link
         (does nothing — no destination exists to link to yet, per owner's explicit choice when
         asked), the REAL Year selector (moved here from the tab row — see znfsYearHtml() above;
         From/To stay on the tab row, per owner's explicit choice), and the REAL Download button
         (the same relocated .dfextra node znfsMountExtras() already moves per active tab — moved
         from the tab row's #znfs-extras up into this one, single copy, not duplicated, per
         owner's explicit choice). Width/alignment deliberately NOT copied from the reference
         screenshot (owner's own note that its spacing "should not be like the screenshot") — each
         item sizes to its own content, `.znfs-fld`/`.znfs-extras` reuse the existing tab-row
         styling so the group matches the rest of the chrome instead of introducing new sizing. */
      '<span class="znfs-partsrt">' +
        '<a class="znfs-vesselrpt" href="javascript:void(0)" onclick="return false" title="Placeholder — not yet connected to anything">Vessel Reporting <span class="ext">↗</span></a>' +
        znfsYearHtml() +
        '<span class="znfs-extras" id="znfs-extras"></span>' +
      '</span>' +
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
/* 2026-07-30h (Aurvin, owner instruction) — every KPI card is a button that opens its
   regulation drawer (see the REGULATION DETAIL DRAWER section further down this file).
   Built as a helper rather than repeated inline five times so the accessibility attributes
   cannot drift between cards: role/tabindex/keydown are what make the card usable without a
   mouse, and `data-reg` is how znfsRegClose() finds the card again to restore focus.
   NOTE the two `.znk-trendbtn` buttons live INSIDE cards that are now clickable, so their
   onclick handlers begin with event.stopPropagation() — without it, opening a trend chart
   would also open the drawer behind it. */
function znkOpen(reg, what){
  return ' class="znk znk-click" data-reg="' + reg + '" role="button" tabindex="0"' +
         ' aria-label="' + esc(what) + ' — open the reporting detail"' +
         ' onclick="znfsRegOpen(\'' + reg + '\')" onkeydown="znfsRegKey(event,\'' + reg + '\')"';
}
function znfsRenderKpis(){
  var el = document.getElementById("znfs-kpis"); if(!el) return;
  /* 2026-08-06 (Aurvin, owner instruction): in SINGLE VOYAGE VIEW the cards report the ONE
     voyage, not the year — "the top KPI will change as per those dates". svKpiR() (js/ui.js)
     returns an object of exactly this shape, built from the voyage's own per-year computeAll
     buckets, so every card below is unchanged. On a voyage that crosses a year boundary it
     returns the additive figures SUMMED across the two years and the year-specific ratios
     (CII rating/attained/required, FuelEU GHGIE vs target, EU ETS phase-in) set to null, which
     is how these cards already render a withheld figure — owner's instruction, because no single
     year's parameters describe both halves. It returns null when the view is off, so the normal
     path is the same computeAll(S) it always was. */
  var R; try{ R = ((typeof svKpiR === "function") && svKpiR()) || computeAll(S); }catch(e){
    el.innerHTML = '<div class="znk"><div class="body"><p class="note">The calculation could not be run: ' + esc(String(e && e.message || e)) + '</p></div></div>';
    return;
  }
  var c = R.cii, e = R.ets, u = R.ukets, f = R.fueleu, sm = R.summary, sc = R.scc;
  /* 2026-08-01n (Aurvin, owner instruction) — the KPI card stamp reads "Date Filter" instead of
     the year WHENEVER the From/To window has been narrowed inside the reporting year.

     WHY: the four cards are always computed over S.dateFilter, but the stamp only ever said the
     year. With a narrowed window the card showed, say, "2025" beside figures that covered only
     part of 2025 — the owner's instruction is that the stamp must stop claiming a whole year it
     is not reporting. Plain "Date Filter" was his chosen wording (over showing the dates
     themselves, which would not fit the heading), applied to ALL FOUR cards together (they share
     this one `yr` variable), and he explicitly did NOT want the year kept anywhere on the card:
     the Year dropdown sits in the date-filter bar directly above the strip, so it is never
     off-screen.

     WHAT COUNTS AS NARROWED: exactly the same test the date-filter bar itself uses to decide
     whether to draw its "✕ Clear" button (renderDateFilterBar and the Workspace band, js/ui.js) —
     From/To differing from 1 Jan 00:00 / 31 Dec 23:59 of the selected year. Deliberately NOT
     dateFilterActive(), which is TRUE all the time (2026-07-24 made the window always-on and
     year-locked, so `active` is not a "did the user narrow it" signal). Reusing the bar's test
     means the badge and the ✕ Clear button appear and disappear together, and pressing ✕ Clear
     (or picking a Year) puts the year straight back — dfClearRange/dfYear call _fullYearRange,
     which restores the two boundary values this compares against.

     NOT CHANGED: no calculation, no filtering, no card content. R.year still drives the CII
     bands, the UK ETS window and the FuelEU target exactly as before, and is still named in the
     trend-button and pill tooltips further down this function. This is the stamp text only. */
  var _dfy  = Number(R.year) || Number(S.year) || 2026;
  var _dfd  = S.dateFilter || {};
  var _dfLo = _dfy + '-01-01T00:00', _dfHi = _dfy + '-12-31T23:59';
  var _dfNarrowed = (_dfd.fromISO || _dfLo) !== _dfLo || (_dfd.toISO || _dfHi) !== _dfHi;
  /* 2026-08-06: in single voyage view the stamp names the VOYAGE, not the year or the filter —
     the cards are no longer reporting either. Same one `yr` variable, so all four cards change
     together exactly as 2026-08-01n intended. */
  var _sv = (typeof svActive === "function") && svActive() ? SVIEW : null;
  /* 2026-08-06c: the stamp STAYS "Voyage N" for a single-year voyage too, and this is a deliberate
     departure from the owner's "everything" answer — stated to him in the same breath so he can
     overrule it in one line. 2026-08-01n's rule, his own, is that this stamp must stop claiming a
     whole year it is not reporting: a single-voyage view is a narrowed window, so putting "2026"
     on cards that cover one voyage would break that rule in the other direction. Naming the
     voyage is true in both cases. Only the TOOLTIP branches on crossYear. To flip it, replace the
     `'Voyage ' + esc(_sv.voy)` label below with R.year when _sv.crossYear is false. */
  var yr = _sv
    ? '<span class="yr" title="These figures cover voyage ' + esc(_sv.voy) + ' only (' +
        esc(_sv.tStart || '') + ' to ' + esc(_sv.tEnd || '') + ' UTC)' +
        (_sv.crossYear ? ', which runs across ' + _sv.years.join(' and ') +
          '. The year-specific figures — the CII rating, the FuelEU intensity against its target and the EU ETS phase-in % — are withheld on these cards because no single year\'s rules describe both halves. The leg rows in the table below are split at year end and each part IS shown under its own year.'
          : ', which sits wholly inside ' + _sv.years.join(' ') + '. Every figure is calculated under that year\'s rules exactly as it is on the ordinary tabs — nothing is withheld.') +
        ' Press ✕ Reset in the bar below to go back to the whole year.">Voyage ' + esc(_sv.voy) + '</span>'
    : _dfNarrowed
    ? '<span class="yr" title="These figures cover the From/To window set in the date filter above, not the whole of ' + R.year + '. Press ✕ Reset in that bar to go back to the full year.">Date Filter</span>'
    : '<span class="yr">' + R.year + '</span>';
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
     MEPC.1/Circ.684 — deliberately NOT the well-to-wake CO₂e EEOI in the Sea Cargo Charter
     TABLE COLUMNS (07-30m: the SCC card that used to sit beside this one is gone; the columns stay).
     The same implausibility cut-off the tables apply is honoured here, so the card cannot print a
     figure the table below it would withhold. */
  /* 2026-08-01i (Aurvin, owner instruction): the "IMO EEOI" detail row below is REMOVED — one of
     four one-row cuts (one per KPI card) made purely to shrink the strip's height and give the
     table underneath more visible rows. The figure is NOT lost: it is still the TOTAL row of the
     IMO EEOI column on the LEGS/VOYAGES tabs (same `sm.co2PerTW`/`co2AllTot*1e6/twImoTot` formula
     as the long comment above describes), it is simply no longer duplicated up here. The
     eeoiCut/eeoiVal/eeoiTxt build for that row is removed with it — nothing else in this file
     used those variables. */
  /* 2026-07-30n (Aurvin, owner instruction): REVERSES the "beside the pill" placement above
     (07-28g TASK 3). Owner now wants required CII back as a body row, to make room to remove
     the Total CO₂ and Distance rows below and shrink the card — freeing vertical space for the
     table under the KPI strip. reqCap is no longer put in the hero; it is now built as a .kvz
     row instead (see `imo` below) so it is not shown twice. */
  var reqCapTitle = 'Required CII for this ship type, capacity and year — the reference line × the year\'s Z reduction factor. The pill\'s attained figure is measured against this.';
  /* 2026-07-30 (Aurvin, owner instruction) — "Year to date CII" trend button.
     Placement was the owner's explicit choice: RIGHT OF THE PILL, beside "required …", not in
     the card heading (the heading's right edge already holds the year via .znk>h3 .yr, so a
     button there would have collided with it). CSS does the positioning with margin-left:auto
     — see .znk-trendbtn in css/styles.css.
     The button is a DIRECT child of .hero and .hero keeps its own `title` exactly as before.
     An earlier draft wrapped the pill in an inner span to stop the hero's long tooltip firing
     over the button — unnecessary, because an element's OWN title attribute already takes
     precedence over an ancestor's when the pointer is over it. The wrapper also broke
     tools/verify_fullscreen_view.js's check that the CII unit lives in the HERO tooltip
     (owner decision 2026-07-28c: pill only, no visible unit label), which is exactly the
     kind of owner decision that check exists to protect. Do not reintroduce the wrapper.
     2026-07-30f (Aurvin, owner instruction): the button used to be rendered ONLY when
     c.attained was non-null (a capacity and some distance). Owner's instruction: the icon
     must stay VISIBLE even in a year with no eligibility/no computable figure — a ship with no
     capacity set, or a year with no dated activity yet, still gets the button; opening it then
     shows the popup's own existing "nothing to plot" message (znfsCiiTrendRender's `!B` branch,
     or the series builder returning null) instead of hiding the entry point to that message. */
  var trendBtn =
      '<button type="button" class="znk-trendbtn" onclick="event.stopPropagation();znfsCiiTrendOpen()" ' +
        'aria-label="Show the year to date CII graph" ' +
        'title="Show the Year to date CII graph — how the ship\'s cumulative CII moved through ' + R.year +
        ', against the required CII and the A–E rating bands.">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 3v18h18"></path><path d="M7 14l4-5 3 3 5-7"></path></svg></button>';
  /* 2026-07-30n (Aurvin, owner instruction): Total CO₂ and Distance rows REMOVED to shrink the
     card. Required CII row ADDED back (see reqCapTitle above) — net -1 row for this card, same
     reduction as the other three cards took in this same change.
     2026-08-01i (Aurvin, owner instruction): IMO EEOI row REMOVED (see the note above `imo`'s
     old eeoiCut/eeoiVal/eeoiTxt build) — this card is now down to ONE detail row. It is left
     that way rather than padded out: the .znk cards are siblings in the same CSS Grid row
     (.znfs-kpis, css/styles.css) with the browser's default `align-items: stretch`, so this
     card still stretches to match the tallest of the other three cards — it just has empty
     space below Required CII instead of a real second row. Nothing needed adding for that. */
  var imo =
    '<div' + znkOpen("cii", "IMO CII") + '><h3>IMO — CII' + yr + '</h3><div class="body">' +
      '<div class="hero" title="' + esc(pillTip) + '">' + pillHtml + trendBtn + '</div>' +
      '<div class="kvz" title="' + esc(reqCapTitle) + '">Required CII <b>' + fmtF(c.ciiReq, 3) + '</b></div>' +
    '</div></div>';

  /* --- 2. FuelEU Maritime ---
     2026-07-28c (Aurvin, owner instruction): the COMPLIANCE BALANCE is now the card's headline
     figure instead of the attained GHG intensity. The owner's reasoning is operational — the
     balance (and the penalty that follows from it) is the number that has to be acted on; the
     intensity is how it was arrived at. GHGIE attained is demoted to a detail row (his choice
     of the three options offered), so nothing is lost from the card. */
  var cbT = (f.cbFinal == null ? null : f.cbFinal / 1e6);   // gCO₂eq -> tonnes
  var cbPos = (cbT || 0) >= 0;
  /* 2026-07-30e (Aurvin, owner instruction) — "Year to date compliance balance" trend button,
     the FuelEU counterpart of the CII card's trend button above. Same placement rule: right of
     the hero figure, a direct child of .hero, no wrapper span (see the long note on the CII
     trendBtn for why a wrapper is not used).
     2026-07-30f (Aurvin, owner instruction): no longer gated on f.cbFinal != null — same
     reasoning as the CII button above. A year with no FuelEU energy in scope still shows the
     icon; opening it shows the popup's own "no dated activity" message rather than hiding the
     entry point entirely. */
  var feuTrendBtn =
      '<button type="button" class="znk-trendbtn" onclick="event.stopPropagation();znfsFeuTrendOpen()" ' +
        'aria-label="Show the year to date FuelEU compliance balance graph" ' +
        'title="Show the Year to date compliance balance graph — how the balance moved through ' + R.year + ', with penalty exposure and the GHG intensity attained against target.">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 3v18h18"></path><path d="M7 14l4-5 3 3 5-7"></path></svg></button>';
  /* 2026-07-30n (Aurvin, owner instruction): "Energy in scope" row REMOVED to shrink the card.
     Hero unit text changed from "t CO₂eq surplus/deficit" to "t CO₂eq - CB" (CB = compliance
     balance, bold), so the card no longer needs the surplus/deficit word to explain the sign —
     the pos/neg colour class on the number still carries that. */
  var feu =
    '<div' + znkOpen("fueleu", "FuelEU Maritime") + '><h3>FuelEU Maritime' + yr + '</h3><div class="body">' +
      '<div class="hero" title="Compliance balance after banking / borrowing / pooling. Positive = surplus, negative = deficit. Indicative only — FuelEU is period-based in law.">' +
        /* 2026-08-01 (Aurvin, owner instruction): hero number 0dp -> 1dp — this figure has no
           unit touching the number itself (the unit is the small caption to its right); the
           €/£ cost rows elsewhere on these cards keep their inline currency symbol and stay
           at 0dp, untouched. */
        '<span class="n ' + (cbT == null ? "dim" : (cbPos ? "pos" : "neg")) + '">' + (cbT == null ? "—" : fmtF(cbT, 1)) + '</span>' +
        '<span class="u">t CO₂eq - <b>CB</b></span>' + feuTrendBtn + '</div>' +
      '<div class="kvz" title="Article 23 penalty on a remaining deficit, including the multiplier for consecutive deficit years.">Penalty <b class="' + (f.penalty > 0 ? "neg" : "pos") + '">' + (f.penalty > 0 ? "€ " + fmtI(f.penalty) : "None") + '</b></div>' +
      /* 2026-08-01m (Aurvin, owner instruction): the merged "GHGIE attained vs target" row
         (added 2026-08-01i, briefly removed entirely 2026-08-01l, see HANDOFF_LOG.md) is brought
         back but the TARGET half is dropped — owner wants the attained figure kept, just not the
         comparison. Relabelled "GHG Intensity" (owner's wording) showing only f.ghgie. f.target /
         f.targetPct are untouched and simply unused here now; the full attained-vs-target
         comparison is still shown on the Annual Summary card's own "GHGIE attained vs target"
         .kv row (js/ui.js) and in the FuelEU working detail (js/ui.js, workingsgrid). */
      '<div class="kvz" title="Attained well-to-wake GHG intensity of the energy in scope — the figure the compliance balance is derived from.">GHG Intensity <b>' + fmtF(f.ghgie, 2) + ' g/MJ</b></div>' +
      /* 2026-07-28g TASK 4 (Aurvin, owner instruction): the "Allocation — Optimal/Proportional"
         row is removed. It reported a SETTING, not a result — the method is chosen on the
         Workspace panel and is still shown there, and it is still named in the LEGS tab's FuelEU
         info icon ("Allocation method: optimal (cleanest-first, essf-ws1-2-5)"). Nothing about
         how the balance is computed changed; f.allocMethod is untouched and still drives it. */
    '</div></div>';

  /* --- 3. EU ETS ---
     2026-07-30n (Aurvin, owner instruction): "Basis" row REMOVED (basis text folded into the
     "Covered CO2e" row's own title tooltip instead, so it is not lost, just not a row). Hero
     label shortened from "EUAs to surrender" to "EUAs". "Covered" row relabelled "Covered CO2e"
     (owner explicitly declined an "(AR5)" qualifier pending verification of the GWP vintage
     actually used in engine.js — do not add it without checking that first). */
  /* 2026-08-01i (Aurvin, owner instruction): "Phase-in" row REMOVED to shrink the card, one of
     the four same-session cuts. Not lost: still folded into the "Covered CO₂e" row's tooltip
     below, and unchanged as the "EU ETS working" card's own Phase-in row on the Calculations tab
     (js/ui.js) — this only removes the duplicate summary row up here. e.phase itself is
     untouched and still drives e.cost exactly as before. */
  var ets =
    '<div' + znkOpen("ets", "EU ETS") + '><h3>EU ETS' + yr + '</h3><div class="body">' +
      /* 2026-08-01 (Aurvin, owner instruction): hero 0dp -> 1dp, same reasoning as the
         FuelEU CB hero above. The "Covered CO₂e ... mt" row below keeps its inline unit and
         stays untouched. */
      '<div class="hero"><span class="n">' + fmtF(e.euas, 1) + '</span><span class="u">EUAs</span></div>' +
      '<div class="kvz" title="Emissions inside EU ETS scope on this year\'s basis: ' + esc(e.basisLabel) + '. Phase-in (share of covered emissions actually surrendered this year, euets-art3gb): ' + Math.round(e.phase * 100) + '%.">Covered CO₂e <b>' + fmtI(e.basis_t) + ' mt</b></div>' +
      '<div class="kvz" title="EUAs × the EUA price set in Settings.">Cost @ €' + fmtI(S.euaPrice) + ' <b>€ ' + fmtI(e.cost) + '</b></div>' +
    '</div></div>';

  /* --- 4. UK ETS ---
     2026-07-30n (Aurvin, owner instruction): the requested "Basis" row does not exist on this
     card (there never was one — Covered CO₂e / CO2-CH4-N2O breakdown / Cost are the only rows).
     Per the owner's decision, the CO₂/CH₄/N₂O breakdown row is removed instead, as the closest
     equivalent "composition detail" row, so this card takes the same one-row cut as the other
     three. The GWP figures it carried (CH₄ 28, N₂O 265) are still stated in the Covered CO₂e
     row's own tooltip below, so nothing is lost, only demoted out of the row list. Hero label
     shortened from "UKAs (tCO₂e)" to "UKAs". */
  var uk =
    '<div' + znkOpen("ukets", "UK ETS") + '><h3>UK ETS' + yr + '</h3><div class="body">' +
      (u.active
        /* 2026-08-01 (Aurvin, owner instruction): hero 0dp -> 1dp, same reasoning as the EU ETS
           hero above. The "Covered CO₂e ... mt" row below (and the dimmed "Computed CO₂e" row
           in the no-obligation branch) keep their inline unit and stay untouched. */
        ? '<div class="hero"><span class="n">' + fmtF(u.tco2e, 1) + '</span><span class="u">UKAs</span></div>' +
          '<div class="kvz" title="UK ETS scope: UK→UK voyages plus UK in-port activity (ukets-sch2a-p7). Prescribed GWP: CH₄ 28, N₂O 265 (ukets-sch2a-p35). CO₂ / CH₄ / N₂O: ' + fmtI(u.co2) + ' / ' + fmtF(u.ch4, 3) + ' / ' + fmtF(u.n2o, 3) + '.">Covered CO₂e <b>' + fmtI(u.tco2e) + ' mt</b></div>' +
          '<div class="kvz" title="UKAs × the UKA price set in Settings.">Cost @ £' + fmtI(S.ukaPrice) + ' <b>£ ' + fmtI(u.cost) + '</b></div>'
        : '<div class="hero"><span class="n dim">—</span><span class="u">no obligation in ' + R.year + '</span></div>' +
          '<div class="kvz" title="The UK ETS maritime obligation starts with scheme year 2026.">Obligation starts <b>2026</b></div>' +
          '<div class="kvz" title="Computed anyway, so the exposure is visible before the obligation begins.">Computed CO₂e <b class="dim">' + fmtI(u.tco2e) + ' mt</b></div>') +
    '</div></div>';

  /* --- 5. Sea Cargo Charter card: DELETED 2026-07-30m (Aurvin, owner instruction) ---
     It was added on 2026-07-30h and removed the next session: the owner does not use the
     figure and wanted the top strip back to four cards so the table gets the vertical space
     on a laptop screen. What was removed is ONLY the presentation — this card and the SCC
     drawer (znfsRegSccSec, further down this file).
     STILL LIVE, deliberately: engine.js's R.scc (unchanged, still computed on every run) and
     the "SEA CARGO CHARTER" table column group in the Voyages view, which is where the SCC
     numbers are now read. `sc` is therefore still destructured at the top of this function
     and is simply unused here.
     To bring the card back, restore it from _backups/2026-07-30m_pre-scc-removal.zip and
     re-add { key:"scc", ... } to EMCOLS_KPIS in js/columns.js. */

  /* 2026-07-30i (Aurvin, owner instruction), amended 07-30j: which cards are shown is the
     "▦ Edit columns" picker's decision. kpiVis() (js/columns.js) answers TRUE for the IMO card
     always — since 07-30j that is the ONLY permanent one — and TRUE for everything whenever the
     full-screen overlay is closed, so this line is unchanged in every other view. All four cards
     are still BUILT above (and computeAll ran once for all of them), so hiding one costs nothing
     and changes no number; only the concatenation below is filtered. The count of visible cards
     is written to a data attribute so the CSS grid can give them exactly one row at any width —
     see .znfs-kpis in css/styles.css. The guard keeps this working if columns.js is removed. */
  var vis = function(k){ return (typeof kpiVis === "function") ? kpiVis(k) : true; };
  var shown = ["cii", "fueleu", "ets", "ukets"].filter(vis);
  el.setAttribute("data-n", String(shown.length || 1));
  el.innerHTML = (vis("cii") ? imo : "") + (vis("fueleu") ? feu : "") + (vis("ets") ? ets : "") +
                 (vis("ukets") ? uk : "");
}

/* ==========================================================================
   "YEAR TO DATE CII" TREND POPUP — 2026-07-30 (Aurvin, owner instruction)
   ==========================================================================
   WHAT THIS IS, in plain language: the IMO — CII card shows ONE number for the whole
   window. This popup shows how that number GOT there — the ship's cumulative CII plotted
   day by day across the calendar year, against the flat required-CII line and the A–E
   rating bands. Clicking the small graph button in the card opens it; ✕, Escape or a click
   on the dark backdrop closes it.

   OWNER DECISIONS BEHIND THE DESIGN (all taken 2026-07-30, in session):
     1. X-AXIS IS ALWAYS THE FULL CALENDAR YEAR (1 Jan – 31 Dec), even when the shared
        From/To date-range filter is active and the CARD is therefore showing a narrower
        window. The owner accepted the consequence and chose the honest handling: when the
        graph's own year-end figure differs from the card's by more than 0.5% the popup
        prints a note naming BOTH numbers. Nothing is scaled, anchored or hidden to force
        the two to agree — see znfsCiiTrendWarnings().
     2. THE CURVE IS BUILT FROM THE REPORTS, NOT FROM PRORATED WORKSPACE ROWS. S.mdaReports
        already carries, per report, its own date (`t`), its own distance (`dist`) and its
        own fuel dict (`fuels`, already keyed to the calculator's own fuel codes by
        mdaFuel()). So a genuinely per-report cumulative curve needs NO proration and NO
        invented data. Only when there are no reports at all (a hand-built workspace) does
        it fall back to stepping at row boundaries — the owner's stated fallback.
     3. COMPARE WITH PREVIOUS YEAR draws year−1 as a FAINT GHOST LINE ONLY. No second
        required-CII line and no second set of bands: the owner chose shape comparison over
        a full second rating context, which would have doubled the ink on the chart.
     4. THE BOUNDARIES DROPDOWN OFFERS 2023–2030 — exactly the years engine.js has Z values
        for (Z_FACTORS). Past 2030 the engine silently reuses the 2030 factor, which would
        draw confidently wrong bands, so the list stops there.

   REGULATORY NOTE / WHY THIS TOUCHES NO CALCULATION: CII in law (MARPOL Annex VI reg.28,
   imo-a6-reg28) is a FULL-CALENDAR-YEAR figure for the whole ship. A mid-year cumulative
   value has no legal standing — it is the same AER arithmetic applied to the part of the
   year elapsed so far, which is exactly how an operator tracks whether the year is on
   course. This file computes it for DISPLAY ONLY. js/engine.js is not touched, no reported
   figure changes, and every band/required line here is derived with the SAME expressions
   engine.js uses (cited at each helper below) so the popup can never disagree with the card
   about the rules, only — legitimately, and with a printed note — about the window.

   NO CHART LIBRARY IS USED OR CAN BE: the app is classic load-order scripts with no build
   step and must work offline from file://. The chart is hand-rolled inline SVG. */

/* live state for the popup: which boundary year is selected and whether the ghost line is
   on, plus the rendered series so the hover handler can find the nearest point without
   recomputing. Reset on every open. */
var ZNCT = { open:false, bYear:null, compare:false, cur:null, prev:null, geo:null };

/* day of year (1-based) from a "YYYY-MM-DD" string. UTC throughout, like the rest of the
   app's date handling. */
function znfsDayOfYear(iso){
  var s = String(iso || "").slice(0, 10);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if(!m) return null;
  var y = +m[1];
  var ms = Date.UTC(y, +m[2] - 1, +m[3]) - Date.UTC(y, 0, 1);
  return Math.round(ms / 86400000) + 1;
}
function znfsDaysInYear(y){ return (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000; }
function znfsIsoOfDoy(y, doy){
  var d = new Date(Date.UTC(y, 0, 1) + (doy - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
/* "30 Jul 2026" — the popup and its tooltip read dates aloud rather than in ISO, matching
   how the rest of the overlay talks to a non-technical reader. */
function znfsPrettyDate(iso){
  var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  return m ? (+m[3]) + " " + M[+m[2] - 1] + " " + m[1] : String(iso || "");
}

/* ---- required CII and the A–E bands for ANY year -------------------------------------
   Deliberately the SAME four expressions as js/engine.js's CII block (see engine.js, the
   "---- CII ----" section: ciiRef = g2.a * cap^-g2.c; ciiReq = ciiRef*(1-Z/100);
   bounds = dd[0..3] * ciiReq) reading the same globals (TYPE_BY_ID / SHIP_TYPES from the
   SHIP_TYPES table, Z_FACTORS). It is NOT a second implementation of the rules — it is the
   engine's own arithmetic evaluated for a year the engine was not asked about, which is the
   entire point of the boundaries dropdown. A self-test asserts it reproduces engine.js
   exactly for the reporting year (see the 2026-07-30 block in js/ui.js).
   Returns null when there is no capacity, because then there is no CII at all. */
function znfsCiiYearBounds(year){
  var sh = (S && S.ship) || {};
  var type = (typeof TYPE_BY_ID !== "undefined" && TYPE_BY_ID[sh.typeId]) ||
             (typeof SHIP_TYPES !== "undefined" ? SHIP_TYPES[0] : null);
  var cap = Number(sh.capacity) || 0;
  if(!type || !(cap > 0)) return null;
  var g2 = type.g2(cap);
  var dd = type.ddf ? type.ddf(cap) : type.dd;
  var zTable = (typeof Z_FACTORS !== "undefined") ? Z_FACTORS : {};
  var zKnown = (zTable[year] != null);
  var Z = zKnown ? zTable[year] : (zTable[2030] != null ? zTable[2030] : 0);
  var ciiRef = g2.a * Math.pow(g2.cap, -g2.c);
  var ciiReq = ciiRef * (1 - Z / 100);
  return { cap:cap, capUnit:type.capUnit || "DWT", typeName:type.name, year:year,
           ciiRef:ciiRef, Z:Z, zKnown:zKnown, ciiReq:ciiReq,
           bounds:{ sup: dd[0]*ciiReq, low: dd[1]*ciiReq, up: dd[2]*ciiReq, inf: dd[3]*ciiReq } };
}
/* the years the dropdown may offer: exactly the numeric keys of Z_FACTORS (2023–2030).
   Z_FACTORS also carries `verified` and `src` metadata keys — filtered out by the /^\d{4}$/
   test, so adding more metadata there can never leak a bogus year into the dropdown. */
function znfsCiiBoundaryYears(){
  var out = [], k;
  if(typeof Z_FACTORS !== "undefined"){
    for(k in Z_FACTORS) if(/^\d{4}$/.test(k)) out.push(+k);
  }
  out.sort(function(a, b){ return a - b; });
  return out;
}

/* ---- the cumulative series ------------------------------------------------------------
   PREFERRED SOURCE — the reports (owner's instruction). One point per calendar DAY that has
   at least one report (the day's LAST running total), which keeps the SVG small on a full
   year of noon reports while losing nothing visible.
   CO₂ here is CII CO₂: all fuel, CO₂ only, tonnes × Cf — the same basis as engine.js's
   `cii_g += t*1e6*cfCII` (imo-g1-s4). Cf comes from the shared FUEL_BY_ID table, so the
   curve and the card read the same factor for the same fuel.
   FUEL CODES NEED TRANSLATING FIRST — see znfsCiiFuelCf() below. This was a real bug caught
   in preview against the sample workbook: report codes are mdaFuel()'s INTERMEDIATE codes,
   not engine fuel ids, and 35 "MGO" entries were silently contributing zero CO₂.
   KNOWN AND REPORTED LIMITATION: a per-fuel Circ.905 Cf OVERRIDE (fr.ciiCf) can only be
   entered on a WORKSPACE ROW, so it exists in engine.js's figure but not on the raw report
   record. Same for rows typed by hand after the import. Both make the reports curve drift
   from the card, which is precisely what the reconcile note under the chart reports rather
   than papering over. */
/* CO₂ factor for a fuel code as it appears on a REPORT record — with the translation step
   that the workspace branch also performs, which is the whole point of this helper.
   The chain is: the ship's own free-text grade → mdaFuel() → an INTERMEDIATE code (the codes
   used in the intermediate OVD CSV: HFO / LFO / MGO / MDO / LNG / LPGP / LPGB / M / E) →
   OVD_FUEL_MAP → the engine's own fuel id (MGO becomes MDO, M becomes METH, E becomes ETOH;
   the rest are unchanged) → FUEL_BY_ID → Cf.
   Skipping OVD_FUEL_MAP is exactly the divergence CLAUDE.md warns about: the Workspace branch
   applies it inside parseOVD, so a curve that skipped it would disagree with the card for every
   MGO / methanol / ethanol burner while looking perfectly fine. It did, until the 2026-07-30
   preview run against tools/"Else- MDA-split year- blumenthal.xlsx" showed 35 MGO entries
   contributing no CO₂ at all. Guarded by the "30-07 T4b" self-tests.
   Returns null (never 0) when a grade genuinely cannot be resolved, so the caller can COUNT and
   REPORT it rather than quietly flattering the curve. */
function znfsCiiFuelCf(code){
  var c = String(code || "").toUpperCase();
  var id = (typeof OVD_FUEL_MAP !== "undefined" && OVD_FUEL_MAP[c]) ? OVD_FUEL_MAP[c] : c;
  var f = (typeof FUEL_BY_ID !== "undefined") ? FUEL_BY_ID[id] : null;
  return (f && Number(f.cf) > 0) ? Number(f.cf) : null;
}
function znfsCiiSeriesFromReports(year, cap){
  var all = (S && S.mdaReports) || [];
  var reps = [], i;
  for(i = 0; i < all.length; i++){
    var r = all[i];
    if(r && typeof r.t === "string" && r.t.slice(0, 4) === String(year)) reps.push(r);
  }
  if(!reps.length) return null;
  reps.sort(function(a, b){ return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });

  var co2_t = 0, dist = 0, order = [], byDay = {}, unmapped = {}, nUnmapped = 0;
  for(i = 0; i < reps.length; i++){
    var rep = reps[i], fu = rep.fuels || {}, code;
    for(code in fu){
      var t = Number(fu[code]) || 0; if(!(t > 0)) continue;
      var cf = znfsCiiFuelCf(code);
      /* an unresolved grade would otherwise silently contribute 0 CO₂ and quietly flatter the
         curve — counted and surfaced in the popup instead. */
      if(cf == null){ unmapped[code] = (unmapped[code] || 0) + t; nUnmapped++; continue; }
      co2_t += t * cf;
    }
    dist += Number(rep.dist) || 0;
    var day = rep.t.slice(0, 10);
    if(!(day in byDay)) order.push(day);
    byDay[day] = { co2_t:co2_t, dist:dist };
  }
  return { pts: znfsCiiPts(order, byDay, year, cap), source:"reports",
           n:reps.length, unmapped:unmapped, nUnmapped:nUnmapped };
}
/* FALLBACK — no reports in this workspace at all, so there is nothing finer than a row to
   step on. The owner's instruction for this case: "step at the row boundaries". Each row's
   whole CO₂ and distance land on its END date; the curve is a staircase, and every point on
   it is a real cumulative figure with nothing prorated.
   This path reads R.rowDetails, whose det.co2 IS engine.js's CII CO₂ for the row (including
   any Circ.905 Cf override), so where it applies it is the more faithful of the two paths. */
function znfsCiiSeriesFromRows(R, year, cap){
  var ds = (R && R.rowDetails) || [], use = [], i;
  for(i = 0; i < ds.length; i++){
    var d = ds[i], when = String((d && (d.tEnd || d.tStart)) || "");
    if(when.slice(0, 4) === String(year)) use.push({ w:when, d:d });
  }
  if(!use.length) return null;
  use.sort(function(a, b){ return a.w < b.w ? -1 : a.w > b.w ? 1 : 0; });
  var co2_t = 0, dist = 0, order = [], byDay = {};
  for(i = 0; i < use.length; i++){
    co2_t += Number(use[i].d.co2)  || 0;
    dist  += Number(use[i].d.dist) || 0;
    var day = use[i].w.slice(0, 10);
    if(!(day in byDay)) order.push(day);
    byDay[day] = { co2_t:co2_t, dist:dist };
  }
  return { pts: znfsCiiPts(order, byDay, year, cap), source:"rows",
           n:use.length, unmapped:{}, nUnmapped:0 };
}
/* shared tail of both builders: turn the per-day running totals into plottable points.
   attained CII = cumulative CO₂ (grams) ÷ (capacity × cumulative distance) — engine.js's
   `attainedActual = cii_g/(cap*totalDist)`, evaluated at each day instead of once at the
   end. Days before the ship has moved have no CII (nothing to divide by) and stay null. */
function znfsCiiPts(order, byDay, year, cap){
  var out = [], i;
  for(i = 0; i < order.length; i++){
    var a = byDay[order[i]], doy = znfsDayOfYear(order[i]);
    if(doy == null) continue;
    out.push({ iso:order[i], doy:doy, co2_t:a.co2_t, dist:a.dist,
               cii: (a.dist > 0 && cap > 0) ? (a.co2_t * 1e6) / (cap * a.dist) : null });
  }
  return out;
}
/* the series for one year, reports first then rows.
   The rows fallback needs a FULL-YEAR computeAll, but the live R may have been produced with
   the shared From/To range active (which the owner chose to ignore on this graph). computeAll
   is a pure read of the state it is handed, so it is re-run on a SHALLOW CLONE with the range
   switched off and the year forced — S itself is never touched. */
function znfsCiiSeries(year, cap, liveR){
  var s = znfsCiiSeriesFromReports(year, cap);
  if(s && s.pts.length) return s;
  var R = liveR;
  var rangeOn = !!(S && S.dateFilter && S.dateFilter.active && S.dateFilter.fromISO && S.dateFilter.toISO);
  if(!R || rangeOn || Number(S.year) !== Number(year)){
    try{
      var clone = Object.assign({}, S, { year:year, dateFilter:{ fromISO:"", toISO:"", active:false } });
      R = computeAll(clone);
    }catch(e){ if(!liveR) return null; R = liveR; }
  }
  s = znfsCiiSeriesFromRows(R, year, cap);
  return (s && s.pts.length) ? s : null;
}

/* ---- the chart ------------------------------------------------------------------------
   Plain inline SVG on a fixed 1000×470 viewBox, scaled to the box by CSS (width:100%).
   2026-07-30b: the viewBox grew from 430 to 470 and the plot area with it, because the two
   grey notes under the chart were removed (owner instruction) and that vertical space now
   belongs to the drawing.
   Band colours are the app's own rating palette (--ra…--re, the same variables ratingColor()
   in js/ui.js feeds the CII pill). */
var ZNCT_GEO = { x0:64, x1:926, y0:26, y1:400, chipX:944 };
/* BAND FILLS — 2026-07-30b (Aurvin, owner instruction: "the band colour is very light, please
   increase the contrast … the band boundaries should be clearly visible").
   The owner chose STRONGER FILLS ONLY — no separate boundary lines. That constrains how the
   boundaries become visible: the bands are contiguous rects, so a shared edge only reads as a
   line if the two fills differ enough. Uniformly raising every alpha would NOT achieve it —
   A/B are both greens and C/D are both warm, so at equal alpha those pairs merge.
   So the alpha is STEPPED, not uniform, and set against the neighbour it has to separate from:
     A .20 — much the largest region; kept lightest so the curve and the required line stay the
             darkest marks on the chart, and so a compliant curve is not lost in it
     B .42 — double A's, which is what makes the A/B edge (the "superior" boundary) visible
     C .55 — yellow against B's green: hue does the work, alpha adds definition
     D .55 — orange against C's yellow at the same alpha; the hue step is the boundary
     E .30 — the second-largest region, and everything a poor performer's curve sits on top of,
             so it drops back again rather than fighting the line
   If the owner later finds B/C/D still mushy, the fix is one line: a 1px stroke in
   znfsCiiRatingVar(b.l) on each band rect. Deliberately not done — it was offered and declined. */
function znfsCiiBandFill(letter){
  return { A:"rgba(95,157,120,.20)", B:"rgba(147,184,132,.42)", C:"rgba(226,204,126,.55)",
           D:"rgba(220,170,114,.55)", E:"rgba(193,117,112,.30)" }[letter];
}
/* CURVE COLOURS — 2026-07-30b, the other half of the same owner instruction ("on the same
   relationship, increase the contrast with the thread as well"). The old #2e7d8f at 2.1px was
   tuned for near-transparent bands and would lose against the new C/D fills. Now a much darker
   teal, thicker, and drawn over a light halo so it stays legible whichever band it crosses. */
var ZNCT_INK = "#083f4d";     // the curve
var ZNCT_HALO = "#f7fafb";    // the halo drawn beneath it
function znfsCiiRatingVar(letter){
  return { A:"var(--ra)", B:"var(--rb)", C:"var(--rc)", D:"var(--rd)", E:"var(--re)" }[letter] || "#888";
}
/* 2026-07-30c (Aurvin, owner instruction: "the rating letter is not visible, make it darker") —
   the A–E rating letter is drawn white-on-chip everywhere it appears (the hover tooltip's two
   small squares AND the chart's right-edge rating chips). White reads fine on --ra/--rb/--re
   (green/red, dark enough) but disappears on --rc/--rd (#e2cc7e / #dcaa72, both pale gold/tan) —
   that's the "yellow square, no visible letter" bug. Fix: C/D get a dark ink; A/B/E keep white. */
function znfsCiiRatingInk(letter){
  return (letter === "C" || letter === "D") ? "#3a2d0a" : "#fff";
}
/* a "nice" ceiling so the y-axis tops out at a readable round number.
   The ladder is deliberately fine between 5 and 10 (6 and 8 are included): CII values for real
   ships cluster there, and jumping straight from 5 to 10 wasted half the chart's height. */
function znfsNiceCeil(v){
  if(!(v > 0)) return 1;
  var mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
  var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], i;
  for(i = 0; i < steps.length; i++) if(n <= steps[i] + 1e-12) return steps[i] * mag;
  return 10 * mag;
}
/* nice round step for axis ticks over a given span */
function znfsNiceStep(span, want){
  var raw = span / Math.max(1, want || 4);
  var mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  var steps = [1, 2, 2.5, 5, 10], i;
  for(i = 0; i < steps.length; i++) if(n <= steps[i] + 1e-12) return steps[i] * mag;
  return 10 * mag;
}
/* the largest "nice" value NOT above v — the mirror of znfsNiceCeil, used to land the top of
   the axis on a round number the reader recognises (8, 10, 20) instead of whatever 1.85× the
   required CII happens to be (9.97). */
function znfsNiceFloor(v){
  if(!(v > 0)) return 0;
  var mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
  var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], i, out = steps[0] * mag;
  for(i = 0; i < steps.length; i++) if(steps[i] <= n + 1e-12) out = steps[i] * mag;
  return out;
}

/* ================= THE Y-SCALE RULE — 2026-07-30b, owner instruction =================
   The owner asked for three things: the REFERENCE VALUE (required CII) towards the MIDDLE of
   the chart, ALL FIVE A–E bands visible, and the top of the axis LESS THAN DOUBLE the
   reference. Those three cannot all hold if the axis starts at zero — with the reference dead
   centre above a zero floor the top IS exactly double. So the axis FLOOR IS NOT ZERO. This is
   a deliberate, owner-approved departure (the "symmetric around the reference" option):

       floor = ciiReq × (2 − K)      ceiling = ciiReq × K       with K = 1.85

   which puts the dashed reference line exactly halfway up and the ceiling at 1.85× — under
   double, as asked. A CII axis does not need to include zero: zero CII is not a meaningful
   operating point (it would mean a ship that emitted nothing while sailing), and the A band
   still occupies a large visible region above the floor.

   THE ONE CASE THAT BREAKS IT, and what happens instead. A ceiling of 1.85× hides the curve
   completely for any ship running worse than that — the sample workbook attains 13.15 against
   a required 5.39, so a ceiling of 9.97 would show bands and nothing else. That is the bug
   fixed earlier the same day, and it must not come back. The owner chose the adaptive
   handling: keep 1.85× whenever the curve FITS, and WIDEN the ceiling when it does not, with
   the widening declared to the reader (znfsCiiTrendRender prints "scale widened" beside the
   legend, and the top tick keeps its ">" clip marker). The reference then drifts below centre
   — accepted, because a curve nobody can see is worse than an off-centre reference line.

   Guarding both directions: the ceiling is never allowed below the D/E boundary and the floor
   never above the A/B boundary, so "all five bands visible" holds no matter how odd the ship's
   type/capacity combination makes its dd vector.
   `seriesList` is every series on the chart, so switching the ghost line on keeps the previous
   year's end value on the canvas too — otherwise the comparison it exists for is invisible. */
var ZNCT_K = 1.85;
function znfsCiiYScale(bd, ciiReq, seriesList){
  var K = ZNCT_K, widened = false;
  /* CEILING FIRST, then derive the floor. Taking hi = 1.85 × required directly gave axis labels
     like ">9.97", which is the correct number and a poor label. So hi is snapped DOWN to the
     nearest nice value (8, 10, 20 …) — down, never up, so the "under double" rule cannot be
     broken by the rounding — and the floor is then set to keep the reference EXACTLY centred:
         lo = 2 × required − hi      ⇒  (required − lo) / (hi − lo) = 0.5
     Snapping down can only make hi/required smaller than 1.85, never larger, so the ceiling
     stays under double by construction. The band guards below catch the rare case where the
     snap lands too close to the D/E boundary. */
  var hi = znfsNiceFloor(ciiReq * K);
  if(!(hi > 0)) hi = ciiReq * K;
  var lo = 2 * ciiReq - hi;
  /* anchor = the largest END value across the plotted series (the cumulative figure in force
     now — the same quantity the card reports). Deliberately NOT the peak: a cumulative CII in
     the opening days of a year is arithmetically enormous and would flatten everything else. */
  var anchor = 0, i, j, pts, lastCii;
  for(i = 0; i < (seriesList || []).length; i++){
    pts = (seriesList[i] && seriesList[i].pts) || [];
    lastCii = null;
    for(j = 0; j < pts.length; j++) if(pts[j].cii != null) lastCii = pts[j].cii;
    if(lastCii != null && lastCii > anchor) anchor = lastCii;
  }
  if(anchor > hi * 0.97){ hi = znfsNiceCeil(anchor * 1.12); widened = true; }
  /* every band must stay on the canvas */
  if(hi <= bd.inf * 1.03){ hi = bd.inf * 1.10; widened = true; }
  if(lo >= bd.sup * 0.97){ lo = bd.sup * 0.90; }
  if(lo < 0) lo = 0;
  return { lo:lo, hi:hi, widened:widened };
}
/* axis tick text with the FEWEST decimals that still tells the truth. A blunt fmtF(v,0)
   would print a 2.5 tick as "3" and put the label in the wrong place — small-capacity ships
   (low required CII) hit exactly that. */
function znfsCiiAxisNum(v){
  var dp = (Math.abs(v) >= 10 || v % 1 === 0) ? 0 : (Math.abs(Math.round(v * 10) / 10 - v) < 1e-9 ? 1 : 2);
  return fmtF(v, dp);
}
function znfsCiiTrendChart(){
  var B = ZNCT.bounds, cur = ZNCT.cur, prev = ZNCT.prev, G = ZNCT_GEO;
  var year = ZNCT.year, days = znfsDaysInYear(year), bd = B.bounds;
  /* Y SCALE — see znfsCiiYScale(): reference centred between a NON-ZERO floor and a ceiling at
     1.85× it, widened only when a curve would otherwise fall off the top. */
  var sc = znfsCiiYScale(bd, B.ciiReq, [cur, prev]);
  var yLo = sc.lo, yHi = sc.hi, span = yHi - yLo;
  ZNCT.widened = sc.widened;
  var X = function(doy){ return G.x0 + (Math.max(1, Math.min(days, doy)) - 1) / (days - 1) * (G.x1 - G.x0); };
  var Y = function(v){ return G.y1 - (Math.max(yLo, Math.min(yHi, v)) - yLo) / span * (G.y1 - G.y0); };
  var s = [];

  /* --- A–E bands, lowest CII (best) at the bottom.
     The bottom of A and the top of E are the AXIS ends, not 0 and infinity: both bands run off
     the chart in reality, and Y() clamps, so drawing them to the axis ends is what the reader
     sees anyway. --- */
  var bands = [
    { l:"E", lo:bd.inf, hi:yHi },
    { l:"D", lo:bd.up,  hi:bd.inf },
    { l:"C", lo:bd.low, hi:bd.up },
    { l:"B", lo:bd.sup, hi:bd.low },
    { l:"A", lo:yLo,    hi:bd.sup }
  ];
  bands.forEach(function(b){
    var yTop = Y(b.hi), yBot = Y(b.lo);
    s.push('<rect x="' + G.x0 + '" y="' + yTop.toFixed(1) + '" width="' + (G.x1 - G.x0) +
           '" height="' + Math.max(0, yBot - yTop).toFixed(1) + '" fill="' + znfsCiiBandFill(b.l) +
           '" shape-rendering="crispEdges"></rect>');
  });
  s.push('<rect x="' + G.x0 + '" y="' + G.y0 + '" width="' + (G.x1 - G.x0) + '" height="' + (G.y1 - G.y0) +
         '" fill="none" stroke="#b3c0c9"></rect>');

  /* --- y ticks: round values across the visible span, plus the axis ends, plus the reference
     itself picked out in the reference colour. A round tick that would collide with the
     reference label is dropped — the reference is the more useful of the two. --- */
  var anyClipped = false;
  (cur ? cur.pts : []).forEach(function(p){ if(p.cii != null && (p.cii > yHi || p.cii < yLo)) anyClipped = true; });
  var step = znfsNiceStep(span, 4), ticks = [], tv;
  for(tv = Math.ceil(yLo / step) * step; tv <= yHi + 1e-9; tv += step){
    if(tv > yLo + span * 0.04 && tv < yHi - span * 0.04) ticks.push(tv);
  }
  var yRef = Y(B.ciiReq);
  ticks.forEach(function(v){
    if(Math.abs(Y(v) - yRef) < 12) return;                       // would sit on the reference label
    s.push('<text x="' + (G.x0 - 9) + '" y="' + (Y(v) + 3.5).toFixed(1) +
           '" text-anchor="end" font-size="10.5" fill="#7a8896">' + znfsCiiAxisNum(v) + '</text>');
  });
  /* the axis ends. The floor is NOT zero (see znfsCiiYScale) so it is labelled with its real
     value, and the ceiling carries the ">" clip marker when the curve runs past it. */
  s.push('<text x="' + (G.x0 - 9) + '" y="' + (G.y1 + 3.5) +
         '" text-anchor="end" font-size="10.5" fill="#7a8896">' + znfsCiiAxisNum(yLo) + '</text>');
  s.push('<text x="' + (G.x0 - 9) + '" y="' + (G.y0 + 3.5) +
         '" text-anchor="end" font-size="10.5" fill="#7a8896">' +
         (anyClipped ? "&gt;" : "") + znfsCiiAxisNum(yHi) + '</text>');
  /* the reference value, on the axis, in its own colour so the dashed line is self-explanatory */
  s.push('<text x="' + (G.x0 - 9) + '" y="' + (yRef + 3.5).toFixed(1) +
         '" text-anchor="end" font-size="10.5" font-weight="700" fill="var(--red)">' +
         znfsCiiAxisNum(B.ciiReq) + '</text>');
  s.push('<text x="' + G.x0 + '" y="' + (G.y0 - 9) +
         '" font-size="10.5" fill="#3d4d59" font-weight="700">CII (gCO₂/' +
         esc(B.capUnit).toLowerCase() + '·nm)</text>');
  s.push('<text x="' + G.chipX + '" y="' + (G.y0 - 9) +
         '" text-anchor="middle" font-size="10.5" fill="#3d4d59" font-weight="700">Rating</text>');

  /* --- month labels at the 15th, like the reference chart --- */
  var MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for(var m = 0; m < 12; m++){
    var doy = znfsDayOfYear(year + "-" + String(m + 1).padStart(2, "0") + "-15");
    s.push('<text x="' + X(doy).toFixed(1) + '" y="' + (G.y1 + 19) +
           '" text-anchor="middle" font-size="10.5" fill="#7a8896">' + MN[m] + ' 15</text>');
  }

  /* --- "today" divider: only meaningful while the plotted year is still running --- */
  var todayIso = new Date().toISOString().slice(0, 10);
  if(todayIso.slice(0, 4) === String(year)){
    var tx = X(znfsDayOfYear(todayIso)).toFixed(1);
    s.push('<line x1="' + tx + '" y1="' + G.y0 + '" x2="' + tx + '" y2="' + G.y1 +
           '" stroke="#8a9aa6" stroke-width="1"></line>');
  }

  /* --- required CII: flat for the whole year (Z is annual), dashed.
     2026-07-30b: was var(--re) (#c17570), the muted E-band colour — which now sits ON the
     stronger D/E fills and disappeared into them. Uses var(--red) (#b3261e, the app's own
     alert colour) at 2px on a halo, so it reads on any band. --- */
  var yReqPx = Y(B.ciiReq).toFixed(1);
  s.push('<line x1="' + G.x0 + '" y1="' + yReqPx + '" x2="' + G.x1 + '" y2="' + yReqPx +
         '" stroke="' + ZNCT_HALO + '" stroke-width="4" stroke-opacity=".65"></line>');
  s.push('<line x1="' + G.x0 + '" y1="' + yReqPx + '" x2="' + G.x1 + '" y2="' + yReqPx +
         '" stroke="var(--red)" stroke-width="2" stroke-dasharray="7 4"></line>');

  /* --- previous year, ghost only (owner's choice: no second required line, no second bands).
     Given a halo too — against the stronger fills a plain 30%-opacity line vanished. --- */
  if(prev && prev.pts.length){
    var gp = znfsCiiPath(prev.pts, X, Y);
    if(gp){
      s.push('<path d="' + gp + '" fill="none" stroke="' + ZNCT_HALO + '" stroke-width="4" ' +
             'stroke-opacity=".55" stroke-linejoin="round" stroke-linecap="round"></path>');
      s.push('<path d="' + gp + '" fill="none" stroke="' + ZNCT_INK + '" stroke-width="1.8" ' +
             'stroke-opacity=".42" stroke-linejoin="round" stroke-linecap="round"></path>');
    }
  }

  /* --- this year's curve: halo first, then the dark line over it. The halo is what keeps the
     curve legible where it crosses the deepest C/D fills. --- */
  var dPath = cur ? znfsCiiPath(cur.pts, X, Y) : null;
  if(dPath){
    s.push('<path d="' + dPath + '" fill="none" stroke="' + ZNCT_HALO + '" stroke-width="5.6" ' +
           'stroke-opacity=".8" stroke-linejoin="round" stroke-linecap="round"></path>');
    s.push('<path d="' + dPath + '" fill="none" stroke="' + ZNCT_INK + '" stroke-width="2.6" ' +
           'stroke-linejoin="round" stroke-linecap="round"></path>');
  }
  var last = null;
  (cur ? cur.pts : []).forEach(function(p){ if(p.cii != null) last = p; });
  if(last) s.push('<circle cx="' + X(last.doy).toFixed(1) + '" cy="' + Y(last.cii).toFixed(1) +
                  '" r="4.2" fill="' + ZNCT_INK + '" stroke="#fff" stroke-width="1.6"></circle>');

  /* --- rating chips down the right edge, de-overlapped ---
     Band centres are the honest position, but B/C/D are thin slivers (dd vectors sit close
     together) so their chips would sit on top of one another. Pushed apart top-down to a
     minimum spacing, which is why the reference chart shows D/C/B as a tight stack. */
  var chipH = 18, minGap = 20, cy = [];
  bands.forEach(function(b){ cy.push((Y(b.hi) + Y(b.lo)) / 2); });
  for(var i = 1; i < cy.length; i++) if(cy[i] < cy[i - 1] + minGap) cy[i] = cy[i - 1] + minGap;
  var over = cy[cy.length - 1] + chipH / 2 - G.y1;
  if(over > 0) for(var j = 0; j < cy.length; j++) cy[j] -= over;
  bands.forEach(function(b, k){
    s.push('<rect x="' + (G.chipX - 9) + '" y="' + (cy[k] - chipH / 2).toFixed(1) + '" width="18" height="' +
           chipH + '" rx="4" fill="' + znfsCiiRatingVar(b.l) + '"></rect>' +
           '<text x="' + G.chipX + '" y="' + (cy[k] + 4).toFixed(1) +
           '" text-anchor="middle" font-size="11" font-weight="800" fill="' + znfsCiiRatingInk(b.l) + '">' + b.l + '</text>');
  });

  /* --- hover capture: one transparent rect over the plot area --- */
  s.push('<rect id="znct-hit" x="' + G.x0 + '" y="' + G.y0 + '" width="' + (G.x1 - G.x0) + '" height="' +
         (G.y1 - G.y0) + '" fill="transparent" style="cursor:crosshair"></rect>');
  s.push('<line id="znct-cross" x1="0" y1="' + G.y0 + '" x2="0" y2="' + G.y1 +
         '" stroke="#0f2a3a" stroke-width="1" stroke-dasharray="3 3" opacity="0"></line>');
  s.push('<circle id="znct-dot" r="4.4" fill="#fff" stroke="' + ZNCT_INK + '" stroke-width="2.4" opacity="0"></circle>');

  ZNCT.geo = { X:X, Y:Y, yLo:yLo, yHi:yHi, days:days };
  return '<svg viewBox="0 0 1000 470" role="img" aria-label="Year to date CII against the required CII and the A to E rating bands">' +
         s.join("") + '</svg>';
}
/* the curve as an SVG path. Days with no CII yet (ship has not moved) break the line rather
   than being drawn as zero, and a run that re-enters the chart after being clipped starts a
   fresh segment so the clip never draws a false horizontal shelf. */
function znfsCiiPath(pts, X, Y){
  var d = "", pen = false, i;
  for(i = 0; i < pts.length; i++){
    var p = pts[i];
    if(p.cii == null){ pen = false; continue; }
    d += (pen ? "L" : "M") + X(p.doy).toFixed(1) + " " + Y(p.cii).toFixed(1) + " ";
    pen = true;
  }
  return d ? d.trim() : null;
}

/* ---- the last plotted point of the current series (used in several places) ------------- */
function znfsCiiLastPoint(){
  var cur = ZNCT.cur, last = null, i;
  for(i = 0; cur && i < cur.pts.length; i++) if(cur.pts[i].cii != null) last = cur.pts[i];
  return last;
}

/* ---- PROVENANCE, now behind the header's ⓘ ---------------------------------------------
   2026-07-30b (Aurvin, owner instruction): the two GREY notes that used to sit under the
   chart — "Built from N report(s) … last point …" and the "CII is a full calendar year figure
   in law" paragraph — were removed from the body so the chart gets that vertical space.
   Owner's choice of where they go: into an ⓘ in the popup header, using the app's own
   info()/.ibpop pattern, so nothing is actually lost.
   The AMBER warnings did NOT move and are NOT optional — see znfsCiiTrendWarnings(). */
function znfsCiiTrendProvenance(cardAttained, cardYear){
  var cur = ZNCT.cur, last = znfsCiiLastPoint();
  if(!cur) return "";
  var h = "";
  h += "<b>Where this curve comes from</b><br>" + (cur.source === "reports"
    ? cur.n + " report(s) dated in " + ZNCT.year + ", each counted whole on its own date — nothing is " +
      "spread across days or estimated. Cumulative CO₂ is all fuel, CO₂ only (tonnes × Cf), and the " +
      "cumulative CII at any day is that CO₂ ÷ (capacity × distance so far) — the same arithmetic the " +
      "card uses for the year."
    : "this workspace has no imported reports, so the curve steps at row boundaries (" + cur.n +
      " row(s)). Each row's whole CO₂ and distance land on its end date; nothing is pro-rated.");
  if(last){
    h += "<br><br><b>Last point</b><br>" + znfsPrettyDate(last.iso) + " — cumulative CII " +
         fmtF(last.cii, 3) + ", from " + fmtI(last.co2_t) + " mt CO₂ over " + fmtI(last.dist) + " nm.";
  }
  if(cardAttained != null){
    h += "<br><br><b>The card shows</b><br>" + fmtF(cardAttained, 3) + " for " + cardYear +
         ". This graph always covers the whole calendar year; if a From/To range is active the card " +
         "does not, and any difference bigger than 0.5% is called out in amber under the chart.";
  }
  h += "<br><br><b>Scale</b><br>The axis is centred on the required CII (" + fmtF(ZNCT.bounds.ciiReq, 3) +
       "), so it does not start at zero — zero CII is not a meaningful operating point. The top of the " +
       "axis is 1.85× the required CII" + (ZNCT.widened ? ", widened here to fit the curve" : "") +
       ". A cumulative CII in the first days of a year is arithmetically huge, so the opening spike is " +
       "clipped at the top edge and the top tick is marked “&gt;”.";
  h += "<br><br><b>What CII is</b><br>CII is a <b>full calendar year</b> figure in law (MARPOL Annex VI " +
       "reg.28) for the whole ship. A mid-year point is the same calculation over the part of the year " +
       "elapsed so far — useful for seeing whether the year is on course, not a rating in its own right.";
  return h;
}

/* ---- AMBER WARNINGS — kept under the chart, deliberately ------------------------------
   These are not disclaimers, they are correctness safeguards, and one of them is what exposed
   the OVD_FUEL_MAP bug on 2026-07-30. They stay in the body where they cannot be missed. */
function znfsCiiTrendWarnings(cardAttained, cardYear){
  var cur = ZNCT.cur, last = znfsCiiLastPoint();
  if(!cur || !last) return "";
  var out = "";
  var rangeOn = !!(S && S.dateFilter && S.dateFilter.active && S.dateFilter.fromISO && S.dateFilter.toISO);
  var differs = (cardAttained != null) && (Math.abs(last.cii - cardAttained) / Math.abs(cardAttained) > 0.005);
  if(differs){
    out += '<p class="znct-warn">This graph covers the <b>whole of ' + ZNCT.year +
      '</b> and ends at <b>' + fmtF(last.cii, 3) + '</b>. The card shows <b>' + fmtF(cardAttained, 3) +
      '</b>' + (rangeOn ? ' for your selected From/To date range' : ' for ' + cardYear) +
      '. The two figures are measured over different periods, so they are not expected to match — ' +
      'neither has been adjusted to agree with the other.' +
      (cur.source === "reports"
        ? ' A per-fuel Cf override (MEPC.1/Circ.905) or a row typed in by hand also counts in the card but not on this curve, which is built from the raw reports.'
        : '') + '</p>';
  }
  if(cur.nUnmapped){
    var codes = Object.keys(cur.unmapped).join(", ");
    out += '<p class="znct-warn">' + cur.nUnmapped + ' fuel entr(ies) on these reports use a grade the ' +
      'calculator has no CO₂ factor for (' + esc(codes) + '). They contribute <b>no CO₂</b> to this curve, ' +
      'so it reads better than reality until the grade is mapped. Verify the source file.</p>';
  }
  if(!ZNCT.bounds.zKnown){
    out += '<p class="znct-warn">There is no Z reduction factor in the knowledge base for ' + ZNCT.year_b +
      ', so the ' + ZNCT.bounds.Z + '% value for 2030 was reused. The required line and the A–E bands ' +
      'drawn here are a FILL-IN for that year — verify before relying on them.</p>';
  }
  return out;
}

/* ---- open / render / close ------------------------------------------------------------ */
function znfsCiiTrendOpen(){
  var R; try{ R = computeAll(S); }catch(e){ return; }
  ZNCT.year   = Number(R.year);
  ZNCT.bYear  = Number(R.year);        // bands start on the reporting year
  ZNCT.compare = false;
  ZNCT.cardAttained = (R.cii && R.cii.attained != null) ? R.cii.attained : null;
  var host = document.getElementById("znfs-ciitrend");
  if(!host){
    host = document.createElement("div");
    host.id = "znfs-ciitrend";
    /* backdrop click closes — but only a click on the backdrop itself, never one that
       started inside the white box (mousedown target check, so a drag out of the box on a
       select or the chart cannot close it). */
    host.addEventListener("mousedown", function(ev){ if(ev.target === host) znfsCiiTrendClose(); });
    document.body.appendChild(host);
  }
  /* see the z-index note in css/styles.css: an ⓘ balloon left open on the card behind sits
     at 9600 and would otherwise float over the chart. */
  try{ document.querySelectorAll(".ibpop.open").forEach(function(x){ x.classList.remove("open"); }); }catch(e){}
  ZNCT.open = true;
  host.classList.add("on");
  znfsCiiTrendRender();
  var btn = document.querySelector("#znfs-ciitrend .znct-close"); if(btn) btn.focus();
}
function znfsCiiTrendClose(){
  ZNCT.open = false;
  var host = document.getElementById("znfs-ciitrend");
  if(host) host.classList.remove("on");
  var back = document.querySelector(".znk-trendbtn"); if(back) back.focus();
}
/* full repaint of the popup. Cheap enough to run on every control change, which keeps the
   dropdown and the toggle from needing any partial-update logic of their own. */
function znfsCiiTrendRender(){
  var host = document.getElementById("znfs-ciitrend"); if(!host) return;
  var B = znfsCiiYearBounds(ZNCT.bYear);
  if(!B){
    host.innerHTML = '<div class="znct-box"><div class="znct-head"><h4>Year to date CII</h4>' +
      '<button type="button" class="znct-close" title="Close (Escape)" onclick="znfsCiiTrendClose()">✕</button></div>' +
      '<div class="znct-body"><p class="znct-note">No ship capacity is set, so there is no CII to plot. ' +
      'Set the ship type and capacity on the Workspace panel or in Settings.</p></div></div>';
    return;
  }
  ZNCT.bounds = B; ZNCT.year_b = ZNCT.bYear;
  ZNCT.cur  = znfsCiiSeries(ZNCT.year, B.cap, null);
  ZNCT.prev = ZNCT.compare ? znfsCiiSeries(ZNCT.year - 1, B.cap, null) : null;
  var prevAvail = !!znfsCiiSeries(ZNCT.year - 1, B.cap, null);

  var yrs = znfsCiiBoundaryYears(), opts = "";
  yrs.forEach(function(y){
    opts += '<option value="' + y + '"' + (y === ZNCT.bYear ? " selected" : "") + '>' + y + '</option>';
  });
  /* the ⓘ carries everything the two removed grey notes used to say (owner instruction
     2026-07-30b). Built with the app's own info() helper so it looks and behaves like every
     other ⓘ; note the #znfs-ciitrend .ibpop z-index rule in styles.css, without which the
     balloon would open UNDERNEATH this popup. */
  var provTip = "";
  try{ provTip = info(znfsCiiTrendProvenance(ZNCT.cardAttained, ZNCT.year), "right"); }catch(e){}
  var head =
    '<div class="znct-head">' +
      '<h4>Year to date CII<span style="color:#7a8896;font-weight:700;font-size:11px;letter-spacing:.05em"> · ' +
        ZNCT.year + '</span></h4>' + provTip +
      '<div class="znct-ctrls">' +
        '<label class="znct-ctrl" title="' + (prevAvail
          ? 'Overlay ' + (ZNCT.year - 1) + '&#39;s cumulative curve as a faint line, for shape comparison only. It is NOT given its own required-CII line or rating bands (owner&#39;s choice) — read it against ' + ZNCT.year + '&#39;s bands with that in mind.'
          : 'No data for ' + (ZNCT.year - 1) + ' in this workspace, so there is nothing to compare with.') + '">' +
          'Compare with previous year' +
          '<span class="znct-sw"><input type="checkbox" ' + (ZNCT.compare ? "checked " : "") +
            (prevAvail ? "" : "disabled ") + 'onchange="znfsCiiTrendSetCompare(this.checked)"><i></i></span>' +
        '</label>' +
        '<label class="znct-ctrl" title="Which year&#39;s required CII and A–E boundaries to draw the curve against. Changing this NEVER changes the curve — only the reference lines and the coloured bands move, because the Z reduction factor tightens year on year.">' +
          'CII boundaries for year' +
          '<select onchange="znfsCiiTrendSetYear(this.value)">' + opts + '</select>' +
        '</label>' +
        '<button type="button" class="znct-close" title="Close (Escape)" aria-label="Close" onclick="znfsCiiTrendClose()">✕</button>' +
      '</div>' +
    '</div>';

  var legend =
    '<p class="znct-legend">' +
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#2e7d8f" stroke-width="2.1"></line></svg>CII</span>' +
      (ZNCT.compare && prevAvail
        ? '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#2e7d8f" stroke-width="1.6" stroke-opacity=".3"></line></svg>' + (ZNCT.year - 1) + '</span>'
        : "") +
      /* 2026-07-30d (Aurvin, owner instruction): dropped the value/year/Z% after "Required CII" —
         the number is already on the y-axis (dashed line + its own label), and the year is
         already picked in the "CII boundaries for year" selector above. Owner confirmed the
         Z-reduction-factor % is not shown anywhere else in this popup and accepted dropping it
         rather than relocating it. */
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--re)" stroke-width="1.5" stroke-dasharray="5 4"></line></svg>Required CII</span>' +
    '</p>';

  /* the chart must be BUILT before the legend is emitted, because znfsCiiTrendChart() is what
     decides whether the scale had to be widened and the legend reports that. */
  var chartSvg = ZNCT.cur ? znfsCiiTrendChart() : null;
  var chart = chartSvg
    ? '<div class="znct-chart">' + chartSvg + '<div class="znct-tip" id="znct-tip"></div></div>'
    : '<p class="znct-note">There is no dated activity in ' + ZNCT.year + ' to plot. Import an MDA or OVD file, ' +
      'or add dated rows on the Workspace tab.</p>';
  var widenTxt = (chartSvg && ZNCT.widened)
    ? '<span class="znct-widened" title="The axis normally tops out at 1.85× the required CII with the ' +
      'required line dead centre. This ship\'s cumulative CII runs above that, so the top of the axis was ' +
      'raised to keep the curve on the chart — the required line therefore sits below centre here.">' +
      'scale widened to fit the curve</span>'
    : "";

  /* 2026-07-30b (owner instruction): the two grey notes that used to sit here are gone; their
     content now lives behind the header ⓘ (znfsCiiTrendProvenance). Only the amber warnings
     remain in the body, because they are safeguards rather than commentary. */
  host.innerHTML = '<div class="znct-box" role="dialog" aria-modal="true" aria-label="Year to date CII">' +
    head + '<div class="znct-body">' +
    legend.replace("</p>", widenTxt + "</p>") + chart +
    (ZNCT.cur ? znfsCiiTrendWarnings(ZNCT.cardAttained, ZNCT.year) : "") +
    '</div></div>';

  if(ZNCT.cur) znfsCiiTrendBindHover();
}
function znfsCiiTrendSetYear(v){ ZNCT.bYear = Number(v) || ZNCT.year; znfsCiiTrendRender(); }
function znfsCiiTrendSetCompare(on){ ZNCT.compare = !!on; znfsCiiTrendRender(); }

/* ---- hover read-out ------------------------------------------------------------------- */
function znfsCiiTrendBindHover(){
  var hit = document.getElementById("znct-hit"); if(!hit) return;
  var svg = hit.ownerSVGElement;
  hit.addEventListener("mousemove", function(ev){ znfsCiiTrendHover(ev, svg); });
  hit.addEventListener("mouseleave", znfsCiiTrendHoverOff);
}
function znfsCiiTrendHoverOff(){
  ["znct-cross","znct-dot"].forEach(function(id){
    var n = document.getElementById(id); if(n) n.setAttribute("opacity", "0");
  });
  var t = document.getElementById("znct-tip"); if(t) t.classList.remove("on");
}
function znfsCiiTrendHover(ev, svg){
  var geo = ZNCT.geo, cur = ZNCT.cur, B = ZNCT.bounds;
  if(!geo || !cur || !svg) return;
  /* screen px -> viewBox units. getBoundingClientRect is enough here because the SVG is
     scaled uniformly by width:100%;height:auto (no preserveAspectRatio surprises). */
  var box = svg.getBoundingClientRect(); if(!box.width) return;
  var vx = (ev.clientX - box.left) / box.width * 1000;
  var frac = (vx - ZNCT_GEO.x0) / (ZNCT_GEO.x1 - ZNCT_GEO.x0);
  var doy = Math.round(1 + Math.max(0, Math.min(1, frac)) * (geo.days - 1));
  /* nearest plotted point at or before the cursor — the curve is a running total, so the
     value in force on a given day is the last point up to that day. */
  var p = null, i;
  for(i = 0; i < cur.pts.length; i++){
    if(cur.pts[i].doy <= doy && cur.pts[i].cii != null) p = cur.pts[i];
    else if(cur.pts[i].doy > doy) break;
  }
  if(!p){ znfsCiiTrendHoverOff(); return; }
  var px = geo.X(p.doy), py = geo.Y(p.cii);
  var cross = document.getElementById("znct-cross");
  if(cross){ cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("opacity", "1"); }
  var dot = document.getElementById("znct-dot");
  if(dot){ dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("opacity", "1"); }

  var tip = document.getElementById("znct-tip"); if(!tip) return;
  /* 2026-07-30d (Aurvin): dropped the "Required <year> CII" row — the dashed required line plus
     its y-axis label already carry that number in this same popup, so the tooltip repeating it
     was redundant. CO2 and distance split into their own rows (owner instruction) rather than
     one combined "mt / nm" row. rR/chip(rR) accordingly removed — nothing else used them. */
  var rA = ciiRatingOf(p.cii, B.bounds);
  var chip = function(r){
    return '<span class="rt" style="background:' + znfsCiiRatingVar(r) + ';color:' + znfsCiiRatingInk(r) + '">' + (r || "—") + "</span>";
  };
  tip.innerHTML =
    '<div class="d">' + znfsPrettyDate(p.iso) + '</div>' +
    '<div class="r"><span>' + (ZNCT.year === Number(new Date().toISOString().slice(0, 4)) ? "YTD CII" : "Cumulative CII") +
      '</span><b>' + chip(rA) + fmtF(p.cii, 3) + '</b></div>' +
    '<div class="r"><span>CO₂</span><b>' + fmtI(p.co2_t) + ' mt</b></div>' +
    '<div class="r"><span>Distance</span><b>' + fmtI(p.dist) + ' nm</b></div>';
  /* position in the chart wrapper's own coordinates, flipping to the left of the cursor near
     the right edge so the tooltip never leaves the popup. */
  var wrap = tip.parentNode, wb = wrap.getBoundingClientRect();
  var lx = ev.clientX - wb.left + 14, ly = ev.clientY - wb.top - 12;
  tip.classList.add("on");
  if(lx + tip.offsetWidth > wb.width - 4) lx = ev.clientX - wb.left - tip.offsetWidth - 14;
  if(ly + tip.offsetHeight > wb.height - 4) ly = wb.height - tip.offsetHeight - 4;
  tip.style.left = Math.max(0, lx) + "px";
  tip.style.top  = Math.max(0, ly) + "px";
}

/* ==========================================================================
   "YEAR TO DATE FUELEU COMPLIANCE BALANCE" TREND POPUP — 2026-07-30e (owner instruction)
   ==========================================================================
   The FuelEU card shows ONE balance for the whole window. This popup shows how the ship
   got there — the compliance balance plotted through the calendar year, the penalty
   exposure it implies, and (Task 2) the GHG intensity attained against the year's target on
   a second axis. Opened by the small graph button next to the FuelEU hero figure; closed by
   ✕, Escape, or a click on the backdrop — same mechanics as the CII trend popup above, and
   this popup is dismissed alongside it from znfsClose().

   WHY THIS IS BUILT DIFFERENTLY FROM THE CII GRAPH (read this before touching the series
   builder). The CII cumulative curve is pure arithmetic — cumulative CO₂ ÷ (capacity ×
   cumulative distance) — so it could be summed report-by-report with no risk of drifting
   from engine.js. FuelEU cannot: ghgie = fwind × Σ(allocated energy × gPerMJ) ÷ Σ(allocated
   energy × rwd), and the "optimal" allocation ranks the WHOLE pool of fuel entries
   cleanest-first before deciding what counts (engine.js, the FuelEU allocation block above
   "---- CII ----"). Re-implementing that ranking here, second time, is exactly the kind of
   drifting duplicate CLAUDE.md warns against for js/engine.js. So instead this popup asks
   the REAL ENGINE for the answer at each date: it clones state with a date-range filter
   running from 1 Jan to that date and calls computeAll() on the clone. That is the same
   technique the CII popup already uses for its rows-fallback branch (owner-approved
   2026-07-30) — the only difference is it is now the ONLY path, run once per distinct row
   end-date, rather than a single whole-year fallback call.

   OWNER DECISIONS BEHIND THE DESIGN (all taken 2026-07-30, in the clarifying-questions
   round before this was built):
     1. THE PLOTTED BALANCE IS THE RAW `cb` (Annex IV A, before banking / pooling /
        borrowing) — NOT the card's `cbFinal`. Those flexibility mechanisms are one-time,
        whole-year adjustments (state.fueleuBankedIn, state.poolPartnerCB, Art 20 borrowing)
        that do not decompose into a day-by-day series at all; smoothing them in would be
        inventing data, and dropping the balance line entirely would omit the number
        CLAUDE.md's 2026-07-28c note says is "the number that has to be acted on". Since the
        two figures WILL normally disagree, a reconciliation note under the chart names both
        — the same honesty rule the CII popup already applies to its own card-vs-graph gap
        (see znfsFeuTrendWarnings below).
     2. PENALTY is not a second plotted line (owner rejected a second axis or a shaded
        threshold with its own scale — too much clutter for a Euro figure on a t CO₂eq
        chart). Instead the region below zero balance is tinted to mark penalty EXPOSURE,
        and the actual € figure — computed by applying the same Annex IV B formula the
        engine uses, but to the raw `cb` rather than `cbFinal` (consistent with decision 1)
        — appears only in the hover tooltip.
     3. THE Y-AXIS FLOOR is the PROJECTED YEAR-END balance: a plain least-squares straight
        line fitted through the year's plotted points and evaluated at 31 Dec. This is a
        naive trend, explicitly not a regulatory forecast (FuelEU intensity does not move
        linearly — it is described in the popup's ⓘ), but it is what the owner asked for and
        it is drawn as a dotted continuation of the curve so it reads as an extrapolation,
        never as more real data.
     4. TASK 2 — GHG intensity vs the year's target lives ON THE SAME CHART, on a second
        (right-hand) y-axis, plotted in a different colour from the balance curve, with the
        flat target line drawn dashed exactly like the CII popup's required-CII line.

   REGULATORY NOTE: FuelEU (EU 2023/1805) compliance balance is, like CII, an ANNUAL figure
   (Art 4, Annex IV). A mid-year cumulative value has no legal standing on its own — it is
   the same Annex IV A/B arithmetic over the part of the year elapsed so far, useful for
   tracking whether the year is on course. js/engine.js is not touched by this file; every
   figure here comes from calling engine.js's own computeAll() with a narrower window, so
   this popup can never compute a FuelEU number engine.js would disagree with — only, and
   openly, over a different DATE RANGE (raw mid-year cb vs full-year cbFinal). */

var ZNFT = { open:false, year:null, cur:null, geo:null, cardCb:null, cardCbFinal:null, cardPenalty:null };

/* ---- the series: one point per distinct row end-date in the year, each obtained by asking
   the REAL ENGINE for the cumulative FuelEU figures over [1 Jan, that date] ------------- */

/* full-year, filter-free R — the same "ignore any active From/To range, force the year" clone
   the CII popup uses, so the x-axis is always the whole calendar year regardless of what the
   shared date filter is doing to the KPI cards. Used only to enumerate which dates have
   activity; none of ITS FuelEU figures are plotted (that's ZNFT.cardCb/cardCbFinal, taken from
   the LIVE R at open time, which does honour the shared filter — see znfsFeuTrendOpen). */
function znfsFeuFullYearR(year){
  try{
    return computeAll(Object.assign({}, S, { year:year, dateFilter:{ fromISO:"", toISO:"", active:false } }));
  }catch(e){ return null; }
}
/* distinct calendar dates (YYYY-MM-DD) with dated activity in `year`, ascending. Rows with
   neither tEnd nor tStart cannot be dated at all and are excluded from the date list — they
   still count in FULL in every windowed point below (rowInRange's own rule for undated rows;
   see the provenance text), which is the one honest limitation of this approach. */
function znfsFeuDatesInYear(R, year){
  var ds = (R && R.rowDetails) || [], out = [], seen = {}, i;
  for(i = 0; i < ds.length; i++){
    var d = ds[i], when = String((d && (d.tEnd || d.tStart)) || "");
    if(when.slice(0, 4) !== String(year)) continue;
    var day = when.slice(0, 10);
    if(!seen[day]){ seen[day] = true; out.push(day); }
  }
  out.sort();
  return out;
}
/* the cumulative FuelEU figures as of the END of `day` — a fresh computeAll() on a clone with
   an active date-range filter [1 Jan, day 23:59]. cb/ghgie/E_total/target/mult all come
   straight off R.fueleu; nothing here duplicates the allocation or Annex IV maths. */
function znfsFeuPointFor(year, day){
  var clone = Object.assign({}, S, { year:year,
    dateFilter:{ fromISO: year + "-01-01T00:00", toISO: day + "T23:59", active:true } });
  var R; try{ R = computeAll(clone); }catch(e){ return null; }
  var f = R.fueleu || {}, doy = znfsDayOfYear(day);
  if(doy == null) return null;
  var cbT = (f.cb == null) ? null : f.cb / 1e6;              // gCO2eq -> t CO2eq, PRE-flexibility
  /* indicative penalty, Annex IV B applied to the RAW balance (decision 2 above) — not the
     engine's own R.fueleu.penalty, which is based on cbFinal and therefore on flexibility
     mechanisms this curve deliberately excludes. mult (the consecutive-deficit multiplier,
     Art 23(2)) depends only on state.deficitPeriods, not on the window, so reading it off
     this same clone is exact, not an approximation. */
  var pen = 0;
  if(cbT != null && cbT < 0 && f.ghgie > 0){
    var base = (-cbT * 1e6) / (f.ghgie * 41000) * 2400;      // Annex IV B
    pen = base * (f.mult || 1);
  }
  return { iso:day, doy:doy, cb:cbT, ghgie:f.ghgie, target:f.target, E_total:f.E_total, penalty:pen };
}
function znfsFeuSeries(year){
  var R = znfsFeuFullYearR(year);
  var days = znfsFeuDatesInYear(R, year);
  if(!days.length) return null;
  var pts = [], i, p;
  for(i = 0; i < days.length; i++){
    p = znfsFeuPointFor(year, days[i]);
    if(p) pts.push(p);
  }
  return pts.length ? { pts:pts, source:"engine-window", n:pts.length } : null;
}

/* ---- naive linear projection to year-end (decision 3) ---------------------------------
   Ordinary least squares through every plotted (doy, cb) point, evaluated at the last day of
   the year. Deliberately NOT anchored to just the first/last point (a single noisy point
   should not swing the projection) and deliberately NOT anything more sophisticated — the
   owner asked for the same kind of naive YTD trend line the reference screenshot showed. */
function znfsFeuProjection(pts, days){
  var xs = [], ys = [], i;
  for(i = 0; i < pts.length; i++) if(pts[i].cb != null){ xs.push(pts[i].doy); ys.push(pts[i].cb); }
  if(!xs.length) return null;
  if(xs.length === 1) return { slope:0, intercept:ys[0] - 0, projected:ys[0] };
  var n = xs.length, sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for(i = 0; i < n; i++){ sumX += xs[i]; sumY += ys[i]; sumXY += xs[i]*ys[i]; sumXX += xs[i]*xs[i]; }
  var denom = n*sumXX - sumX*sumX;
  var slope = denom !== 0 ? (n*sumXY - sumX*sumY) / denom : 0;
  var intercept = (sumY - slope*sumX) / n;
  return { slope:slope, intercept:intercept, projected: intercept + slope*days };
}

/* ---- axis scaling ----------------------------------------------------------------------
   2026-07-31 (owner instruction) — REWORKED to round to a step derived from the SPAN of the
   data being plotted, not from the absolute magnitude of the values (the old znfsFeuBound /
   znfsNiceFloor/znfsNiceCeil combination snapped to the value's own base-10 decade — e.g. any
   GHG intensity value in the 80s/90s rounded straight to a multiple of 10, so a real change of
   under 1 g/MJ always rendered as a dead-flat line between 80 and 100). znfsNiceStep(span, want)
   already derives its step size from the SPAN's own magnitude, so reusing it here (instead of
   znfsNiceCeil/znfsNiceFloor) is what makes both axes auto-tighten to however much the plotted
   values actually move. */
function znfsFeuAxisFromRange(loRaw, hiRaw, want){
  if(!(hiRaw > loRaw)) hiRaw = loRaw + 1;
  var step = znfsNiceStep(hiRaw - loRaw, want || 5);
  var lo = Math.floor(loRaw / step) * step;
  var hi = Math.ceil(hiRaw / step) * step;
  if(hi <= lo) hi = lo + step;
  return { lo:lo, hi:hi };
}
function znfsFeuYScaleLeft(pts, projected){
  var vals = [0], i;
  for(i = 0; i < pts.length; i++) if(pts[i].cb != null) vals.push(pts[i].cb);
  if(projected != null) vals.push(projected);
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  var span = (mx - mn) || Math.max(1, Math.abs(mx) || 1);
  /* floor tracks the lowest point (real data, or the 31-Dec projection if that runs lower)
     tightly — owner instruction 2026-07-31: the projection should read as sitting at/near the
     bottom of the axis, not lost under a wide margin of empty space below it. */
  var sc = znfsFeuAxisFromRange(mn - span*0.04, mx + span*0.12, 5);
  return { lo: sc.lo, hi: sc.hi };
}
function znfsFeuYScaleRight(pts, target){
  var vals = [target], i;
  for(i = 0; i < pts.length; i++) if(pts[i].ghgie != null) vals.push(pts[i].ghgie);
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  if(mn === mx){ mn -= 0.5; mx += 0.5; }
  var span = mx - mn;
  var sc = znfsFeuAxisFromRange(mn - span*0.2, mx + span*0.2, 5);
  return { lo: sc.lo, hi: sc.hi };
}

/* ---- the chart --------------------------------------------------------------------------
   Same hand-rolled inline SVG approach as the CII chart (no charting library — the app must
   work offline from file://, per CLAUDE.md), on the same 1000×470 viewBox so both popups feel
   like one family. */
/* 2026-07-31 (Aurvin, owner instruction) — RED REMOVED FROM THIS CHART. The owner asked that no
   red appear here at all, and to reuse the app's own existing (non-red) tokens rather than invent
   a separate "ZeroNorth brand" palette (none exists in this project outside styles.css's :root).
   The zero-balance/threshold line and the dashed Target GHGIE line now use var(--amber) instead
   of var(--red) — same "regulatory reference" role, just not red. The penalty-exposure tint below
   zero balance is the amber family at low alpha instead of the old red-family wash. The GHG
   intensity curve keeps a BLUE family (owner's choice, 2026-07-31: "blue but different than
   compliance balance") but a distinctly different shade — a deep steel-navy — from the teal used
   for the compliance-balance curve, so the two lines never read as the same colour. Was
   2026-07-30f's screenshot-matched red/teal/dark-ink scheme; superseded by this instruction. */
var ZNFT_GEO = { x0:74, x1:906, y0:26, y1:400 };
var ZNFT_INK = "var(--blue)";        // the compliance-balance curve — teal
var ZNFT_HALO = ZNCT_HALO;
var ZNFT_GHG = "#1c4f7c";            // GHG intensity curve — a distinct steel-navy blue, different from the teal balance curve (2026-07-31, owner instruction)
var ZNFT_REF = "var(--amber)";       // the regulatory reference colour: the zero/threshold line AND the dashed GHGIE target line — amber, NOT red (2026-07-31, owner instruction: no red in this chart)
var ZNFT_AREA = "var(--blue2)";      // light wash under the balance curve
var ZNFT_BG = "var(--bg)";           // plot-area background wash — this app's own pale blue-grey card colour
var ZNFT_PENALTY_FILL = "rgba(178,106,0,.14)";  // below-zero tint: the amber family (var(--amber) = #b26a00), at low alpha — NOT red (2026-07-31, owner instruction)
function znfsFeuPath(pts, X, Y, field){
  var d = "", pen = false, i;
  for(i = 0; i < pts.length; i++){
    var p = pts[i], v = p[field];
    if(v == null){ pen = false; continue; }
    d += (pen ? "L" : "M") + X(p.doy).toFixed(1) + " " + Y(v).toFixed(1) + " ";
    pen = true;
  }
  return d ? d.trim() : null;
}
function znfsFeuTrendChart(){
  var cur = ZNFT.cur, G = ZNFT_GEO, year = ZNFT.year, days = znfsDaysInYear(year);
  var proj = znfsFeuProjection(cur.pts, days);
  var projected = proj ? proj.projected : null;
  var scL = znfsFeuYScaleLeft(cur.pts, projected);
  var scR = znfsFeuYScaleRight(cur.pts, ZNFT.target);
  ZNFT.scL = scL; ZNFT.scR = scR; ZNFT.projected = projected;
  var X = function(doy){ return G.x0 + (Math.max(1, Math.min(days, doy)) - 1) / (days - 1) * (G.x1 - G.x0); };
  var YL = function(v){ return G.y1 - (Math.max(scL.lo, Math.min(scL.hi, v)) - scL.lo) / (scL.hi - scL.lo) * (G.y1 - G.y0); };
  var YR = function(v){ return G.y1 - (Math.max(scR.lo, Math.min(scR.hi, v)) - scR.lo) / (scR.hi - scR.lo) * (G.y1 - G.y0); };
  var s = [];

  /* --- plot background wash (decision, 2026-07-30f): the reference screenshots are a pale
     blue-grey card, not white — this rect is what makes the popup read like that reference
     rather than like a plain white chart. Drawn FIRST, under everything else. --- */
  s.push('<rect x="' + G.x0 + '" y="' + G.y0 + '" width="' + (G.x1 - G.x0) + '" height="' + (G.y1 - G.y0) +
         '" fill="' + ZNFT_BG + '"></rect>');

  /* --- penalty EXPOSURE tint: everything below zero balance (decision 2) --- */
  var yZero = YL(0);
  s.push('<rect x="' + G.x0 + '" y="' + yZero.toFixed(1) + '" width="' + (G.x1 - G.x0) + '" height="' +
         Math.max(0, G.y1 - yZero).toFixed(1) + '" fill="' + ZNFT_PENALTY_FILL + '" shape-rendering="crispEdges"></rect>');
  /* the zero/threshold line — AMBER (var(--amber)), not red (2026-07-31, owner instruction). */
  s.push('<line x1="' + G.x0 + '" y1="' + yZero.toFixed(1) + '" x2="' + G.x1 + '" y2="' + yZero.toFixed(1) +
         '" stroke="' + ZNFT_REF + '" stroke-width="1.4"></line>');

  /* plot frame, drawn over the wash */
  s.push('<rect x="' + G.x0 + '" y="' + G.y0 + '" width="' + (G.x1 - G.x0) + '" height="' + (G.y1 - G.y0) +
         '" fill="none" stroke="#b3c0c9"></rect>');

  /* --- left axis ticks (balance, t CO2eq) --- */
  var stepL = znfsNiceStep(scL.hi - scL.lo, 4), tv;
  for(tv = Math.ceil(scL.lo / stepL) * stepL; tv <= scL.hi + 1e-9; tv += stepL){
    if(Math.abs(tv) < stepL*1e-6) continue;      // the zero line is already labelled below
    s.push('<text x="' + (G.x0 - 9) + '" y="' + (YL(tv) + 3.5).toFixed(1) +
           '" text-anchor="end" font-size="10.5" fill="#7a8896">' + znfsCiiAxisNum(tv) + '</text>');
  }
  s.push('<text x="' + (G.x0 - 9) + '" y="' + (yZero + 3.5).toFixed(1) +
         '" text-anchor="end" font-size="10.5" font-weight="700" fill="#5c6c7a">0</text>');
  s.push('<text x="' + (G.x0 - 9) + '" y="' + (G.y1 + 3.5) +
         '" text-anchor="end" font-size="10.5" fill="#7a8896">' + znfsCiiAxisNum(scL.lo) + '</text>');
  s.push('<text x="' + G.x0 + '" y="' + (G.y0 - 9) +
         '" font-size="10.5" fill="' + ZNFT_INK + '" font-weight="700">Compliance balance (t CO₂eq)</text>');

  /* --- right axis ticks (GHG intensity, g/MJ) --- */
  var stepR = znfsNiceStep(scR.hi - scR.lo, 4);
  for(tv = Math.ceil(scR.lo / stepR) * stepR; tv <= scR.hi + 1e-9; tv += stepR){
    s.push('<text x="' + (G.x1 + 9) + '" y="' + (YR(tv) + 3.5).toFixed(1) +
           '" text-anchor="start" font-size="10.5" fill="#7a8896">' + znfsCiiAxisNum(tv) + '</text>');
  }
  s.push('<text x="' + G.x1 + '" y="' + (G.y0 - 9) +
         '" text-anchor="end" font-size="10.5" fill="' + ZNFT_GHG + '" font-weight="700">GHG intensity (g/MJ)</text>');

  /* --- month labels --- */
  var MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for(var m = 0; m < 12; m++){
    var doy = znfsDayOfYear(year + "-" + String(m + 1).padStart(2, "0") + "-15");
    s.push('<text x="' + X(doy).toFixed(1) + '" y="' + (G.y1 + 19) +
           '" text-anchor="middle" font-size="10.5" fill="#7a8896">' + MN[m] + ' 15</text>');
  }

  /* --- today divider --- */
  var todayIso = new Date().toISOString().slice(0, 10);
  if(todayIso.slice(0, 4) === String(year)){
    var tx = X(znfsDayOfYear(todayIso)).toFixed(1);
    s.push('<line x1="' + tx + '" y1="' + G.y0 + '" x2="' + tx + '" y2="' + G.y1 +
           '" stroke="#8a9aa6" stroke-width="1" stroke-dasharray="1 3"></line>');
  }

  /* --- target GHG intensity: flat for the year, dashed, right axis (Task 2). AMBER, the same
     colour the zero line above uses — not red (2026-07-31, owner instruction). --- */
  var yTgt = YR(ZNFT.target).toFixed(1);
  s.push('<line x1="' + G.x0 + '" y1="' + yTgt + '" x2="' + G.x1 + '" y2="' + yTgt +
         '" stroke="' + ZNFT_HALO + '" stroke-width="4" stroke-opacity=".65"></line>');
  s.push('<line x1="' + G.x0 + '" y1="' + yTgt + '" x2="' + G.x1 + '" y2="' + yTgt +
         '" stroke="' + ZNFT_REF + '" stroke-width="1.6" stroke-dasharray="5 4"></line>');

  /* --- GHG intensity curve (right axis) — steel-navy, sitting apart from both the teal balance
     curve and the amber reference lines (2026-07-31). --- */
  var ghgPath = znfsFeuPath(cur.pts, X, YR, "ghgie");
  if(ghgPath){
    s.push('<path d="' + ghgPath + '" fill="none" stroke="' + ZNFT_HALO + '" stroke-width="4.4" ' +
           'stroke-opacity=".7" stroke-linejoin="round" stroke-linecap="round"></path>');
    s.push('<path d="' + ghgPath + '" fill="none" stroke="' + ZNFT_GHG + '" stroke-width="2" ' +
           'stroke-linejoin="round" stroke-linecap="round"></path>');
  }

  /* --- area-fill wash under the compliance balance curve (2026-07-30f): the reference
     screenshot shades the region between the curve and the bottom of the chart with a light
     blue wash that fades with depth. Built as one filled path — the curve's own points, then
     straight down to the axis floor and back along the bottom — using a gradient so the wash is
     strongest near the curve and fades out, exactly like the reference. Skips any run of null
     points the same way the stroked curve does (drawn per contiguous run). --- */
  var gradId = "znftArea" + Math.floor(Math.random()*1e9);
  s.push('<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="' + ZNFT_AREA + '" stop-opacity=".85"></stop>' +
         '<stop offset="100%" stop-color="' + ZNFT_AREA + '" stop-opacity="0"></stop></linearGradient></defs>');
  var areaSegs = [], seg = [], i2;
  for(i2 = 0; i2 < cur.pts.length; i2++){
    var pt2 = cur.pts[i2];
    if(pt2.cb == null){ if(seg.length) areaSegs.push(seg); seg = []; continue; }
    seg.push(pt2);
  }
  if(seg.length) areaSegs.push(seg);
  areaSegs.forEach(function(run){
    if(run.length < 1) return;
    var d = "M" + X(run[0].doy).toFixed(1) + " " + YL(run[0].cb).toFixed(1) + " ";
    for(var k = 1; k < run.length; k++) d += "L" + X(run[k].doy).toFixed(1) + " " + YL(run[k].cb).toFixed(1) + " ";
    d += "L" + X(run[run.length-1].doy).toFixed(1) + " " + G.y1 + " L" + X(run[0].doy).toFixed(1) + " " + G.y1 + " Z";
    s.push('<path d="' + d + '" fill="url(#' + gradId + ')" stroke="none"></path>');
  });

  /* --- compliance balance curve (left axis) — the main curve, TEAL to match the reference
     screenshot, drawn last (over the area fill) so it stays on top (2026-07-30f). --- */
  var cbPath = znfsFeuPath(cur.pts, X, YL, "cb");
  if(cbPath){
    s.push('<path d="' + cbPath + '" fill="none" stroke="' + ZNFT_HALO + '" stroke-width="5.6" ' +
           'stroke-opacity=".8" stroke-linejoin="round" stroke-linecap="round"></path>');
    s.push('<path d="' + cbPath + '" fill="none" stroke="' + ZNFT_INK + '" stroke-width="2.6" ' +
           'stroke-linejoin="round" stroke-linecap="round"></path>');
  }
  /* --- projected year-end: a DOTTED continuation from the last real point (decision 3) --- */
  var last = null, i;
  for(i = 0; i < cur.pts.length; i++) if(cur.pts[i].cb != null) last = cur.pts[i];
  if(last && projected != null && days > last.doy){
    s.push('<line x1="' + X(last.doy).toFixed(1) + '" y1="' + YL(last.cb).toFixed(1) + '" x2="' + X(days).toFixed(1) +
           '" y2="' + YL(projected).toFixed(1) + '" stroke="' + ZNFT_INK + '" stroke-width="1.8" ' +
           'stroke-dasharray="2 4" stroke-opacity=".75"></line>');
    s.push('<circle cx="' + X(days).toFixed(1) + '" cy="' + YL(projected).toFixed(1) +
           '" r="3.6" fill="#fff" stroke="' + ZNFT_INK + '" stroke-width="1.8"></circle>');
    /* --- projected-value callout (2026-07-31, owner instruction): name the projected 31-Dec
       number directly on the chart, not just as a dot, so it is unmistakable what the
       extrapolation is projecting. Anchored to the right edge; flips above/below the point
       depending on how close it sits to the top/bottom of the plot area so the label never
       runs off the chart. --- */
    var pjX = X(days), pjY = YL(projected);
    var pjLabel = "Projected 31 Dec: " + fmtI(projected) + " t CO₂eq";
    var pjAbove = (pjY - G.y0) > 22;              // room above? put label there; else below
    var pjTy = pjAbove ? (pjY - 12) : (pjY + 20);
    var pjW = Math.min(190, 7.1 * pjLabel.length + 12);
    s.push('<rect x="' + (pjX - pjW).toFixed(1) + '" y="' + (pjTy - 12).toFixed(1) + '" width="' + pjW.toFixed(1) +
           '" height="16" rx="3" fill="#fff" fill-opacity=".92" stroke="' + ZNFT_INK + '" stroke-opacity=".35"></rect>');
    s.push('<text x="' + (pjX - 6).toFixed(1) + '" y="' + (pjTy - 0.5).toFixed(1) +
           '" text-anchor="end" font-size="10.5" font-weight="700" fill="' + ZNFT_INK + '">' + pjLabel + '</text>');
  }
  if(last){
    s.push('<circle cx="' + X(last.doy).toFixed(1) + '" cy="' + YL(last.cb).toFixed(1) +
           '" r="4.2" fill="' + ZNFT_INK + '" stroke="#fff" stroke-width="1.6"></circle>');
  }

  /* --- hover capture --- */
  s.push('<rect id="znft-hit" x="' + G.x0 + '" y="' + G.y0 + '" width="' + (G.x1 - G.x0) + '" height="' +
         (G.y1 - G.y0) + '" fill="transparent" style="cursor:crosshair"></rect>');
  s.push('<line id="znft-cross" x1="0" y1="' + G.y0 + '" x2="0" y2="' + G.y1 +
         '" stroke="#0f2a3a" stroke-width="1" stroke-dasharray="3 3" opacity="0"></line>');
  s.push('<circle id="znft-dot" r="4.4" fill="#fff" stroke="' + ZNFT_INK + '" stroke-width="2.4" opacity="0"></circle>');
  s.push('<circle id="znft-dot2" r="3.8" fill="#fff" stroke="' + ZNFT_GHG + '" stroke-width="2.2" opacity="0"></circle>');

  ZNFT.geo = { X:X, YL:YL, YR:YR, days:days };
  return '<svg viewBox="0 0 1000 470" role="img" aria-label="Year to date FuelEU compliance balance against penalty exposure and GHG intensity against target">' +
         s.join("") + '</svg>';
}

/* ---- provenance ⓘ + reconciliation note ------------------------------------------------- */
function znfsFeuTrendProvenance(){
  var cur = ZNFT.cur, h = "";
  if(!cur) return "";
  h += "<b>Where this curve comes from</b><br>Each point re-runs the calculator's own FuelEU " +
    "engine (js/engine.js) with the date window narrowed to 1 Jan&nbsp;–&nbsp;that date — " +
    "it is not a second implementation of the allocation or Annex IV rules, just the same engine " +
    "asked about a shorter period. " + cur.n + " dated row-boundary(ies) fall in " + ZNFT.year + ".";
  h += "<br><br><b>What is plotted</b><br>The compliance balance line is the RAW Annex IV A " +
    "balance — before banking, pooling or borrowing. Those are one-time, whole-year adjustments " +
    "and cannot be spread across days without inventing data, so they are deliberately left out " +
    "of the curve (owner decision, 2026-07-30). The card's headline figure includes them; see the " +
    "note under the chart for both numbers.";
  h += "<br><br><b>Penalty</b><br>Shown only in the hover tooltip and as a tint below the zero " +
    "line — an indicative € figure from applying the same Annex IV B formula the card uses, to " +
    "the raw balance rather than the card's flexibility-adjusted one, for the same reason.";
  h += "<br><br><b>Projected year-end</b><br>A plain straight line fitted through this year's " +
    "plotted points (least squares) and read off at 31 Dec — drawn dotted so it is never mistaken " +
    "for real data. It is a naive trend, not a forecast: FuelEU intensity does not actually move " +
    "linearly through a year (it depends on which fuels are burned when), so treat it as \"if the " +
    "year continues exactly as it has so far\", nothing more.";
  h += "<br><br><b>GHG intensity vs target</b><br>The steel-blue line is the cumulative attained " +
    "well-to-wake GHG intensity (g/MJ) on the right-hand axis; the dashed amber line is the year's " +
    "target — both read straight off the same engine call as the balance, at no extra risk of " +
    "disagreeing with the card.";
  h += "<br><br><b>Known limitation</b><br>A row with no date at all cannot be placed on this " +
    "timeline, so the engine counts it in full in every window from day 1 onward (the same rule " +
    "the shared From/To filter already uses) — an undated row can make the opening days of the " +
    "curve read higher than the ship's actual early-year activity.";
  return h;
}
function znfsFeuTrendWarnings(){
  var cur = ZNFT.cur, last = null, i;
  if(!cur) return "";
  for(i = 0; i < cur.pts.length; i++) if(cur.pts[i].cb != null) last = cur.pts[i];
  if(!last) return "";
  var out = "";
  if(ZNFT.cardCbFinal != null){
    out += '<p class="znct-warn">This graph\'s last point is the <b>raw</b> compliance balance ' +
      'on ' + znfsPrettyDate(last.iso) + ': <b>' + fmtI(last.cb) + ' t CO₂eq</b>. The FuelEU card ' +
      'shows <b>' + fmtI(ZNFT.cardCbFinal) + ' t CO₂eq</b> — its figure after banking, pooling and ' +
      'borrowing, which this curve leaves out by design (see the ⓘ). The two are not expected to ' +
      'match; neither has been adjusted to agree with the other.</p>';
  }
  return out;
}

/* ---- open / render / close -------------------------------------------------------------- */
function znfsFeuTrendOpen(){
  var R; try{ R = computeAll(S); }catch(e){ return; }
  ZNFT.year = Number(R.year);
  ZNFT.target = (R.fueleu && R.fueleu.target != null) ? R.fueleu.target : null;
  ZNFT.cardCbFinal = (R.fueleu && R.fueleu.cbFinal != null) ? R.fueleu.cbFinal / 1e6 : null;
  var host = document.getElementById("znfs-feutrend");
  if(!host){
    host = document.createElement("div");
    host.id = "znfs-feutrend";
    host.addEventListener("mousedown", function(ev){ if(ev.target === host) znfsFeuTrendClose(); });
    document.body.appendChild(host);
  }
  try{ document.querySelectorAll(".ibpop.open").forEach(function(x){ x.classList.remove("open"); }); }catch(e){}
  ZNFT.open = true;
  host.classList.add("on");
  znfsFeuTrendRender();
  var btn = document.querySelector("#znfs-feutrend .znct-close"); if(btn) btn.focus();
}
function znfsFeuTrendClose(){
  ZNFT.open = false;
  var host = document.getElementById("znfs-feutrend");
  if(host) host.classList.remove("on");
  var back = document.querySelectorAll(".znk-trendbtn"); if(back && back[1]) back[1].focus();
}
function znfsFeuTrendRender(){
  var host = document.getElementById("znfs-feutrend"); if(!host) return;
  if(ZNFT.target == null){
    host.innerHTML = '<div class="znct-box"><div class="znct-head"><h4>Year to date FuelEU compliance balance</h4>' +
      '<button type="button" class="znct-close" title="Close (Escape)" onclick="znfsFeuTrendClose()">✕</button></div>' +
      '<div class="znct-body"><p class="znct-note">There is no FuelEU energy in scope to plot for this ship/year.</p></div></div>';
    return;
  }
  ZNFT.cur = znfsFeuSeries(ZNFT.year);

  var provTip = "";
  try{ provTip = info(znfsFeuTrendProvenance(), "right"); }catch(e){}
  var head =
    '<div class="znct-head">' +
      '<h4>Year to date compliance balance<span style="color:#7a8896;font-weight:700;font-size:11px;letter-spacing:.05em"> · ' +
        ZNFT.year + '</span></h4>' + provTip +
      '<div class="znct-ctrls">' +
        '<button type="button" class="znct-close" title="Close (Escape)" aria-label="Close" onclick="znfsFeuTrendClose()">✕</button>' +
      '</div>' +
    '</div>';

  var legend =
    '<p class="znct-legend">' +
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="' + ZNFT_INK + '" stroke-width="2.6"></line></svg>Compliance balance</span>' +
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="' + ZNFT_INK + '" stroke-width="1.6" stroke-dasharray="2 3"></line></svg>Projected year-end</span>' +
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="' + ZNFT_GHG + '" stroke-width="2"></line></svg>GHG intensity attained</span>' +
      '<span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="' + ZNFT_REF + '" stroke-width="1.5" stroke-dasharray="5 4"></line></svg>Target GHGIE</span>' +
      '<span style="display:inline-block;width:14px;height:8px;background:' + ZNFT_PENALTY_FILL + ';border-radius:2px"></span><span>Penalty exposure</span>' +
    '</p>';

  var chartSvg = ZNFT.cur ? znfsFeuTrendChart() : null;
  var chart = chartSvg
    ? '<div class="znct-chart">' + chartSvg + '<div class="znct-tip" id="znft-tip"></div></div>'
    : '<p class="znct-note">There is no dated activity in ' + ZNFT.year + ' to plot. Import an MDA or OVD file, ' +
      'or add dated rows on the Workspace tab.</p>';

  /* 2026-07-31 (owner instruction): the bottom reconciliation note (raw vs card compliance
     balance) is removed from this view entirely — no replacement text on the chart. The same
     explanation still lives in the ⓘ provenance tooltip (znfsFeuTrendProvenance, "What is
     plotted" section) for anyone who wants it. znfsFeuTrendWarnings() itself is left in place,
     unused here, in case it is wanted again later — it is not called by anything else. */
  host.innerHTML = '<div class="znct-box" role="dialog" aria-modal="true" aria-label="Year to date FuelEU compliance balance">' +
    head + '<div class="znct-body">' + legend + chart +
    '</div></div>';

  if(ZNFT.cur) znfsFeuTrendBindHover();
}

/* ---- hover read-out ---------------------------------------------------------------------- */
function znfsFeuTrendBindHover(){
  var hit = document.getElementById("znft-hit"); if(!hit) return;
  var svg = hit.ownerSVGElement;
  hit.addEventListener("mousemove", function(ev){ znfsFeuTrendHover(ev, svg); });
  hit.addEventListener("mouseleave", znfsFeuTrendHoverOff);
}
function znfsFeuTrendHoverOff(){
  ["znft-cross","znft-dot","znft-dot2"].forEach(function(id){
    var n = document.getElementById(id); if(n) n.setAttribute("opacity", "0");
  });
  var t = document.getElementById("znft-tip"); if(t) t.classList.remove("on");
}
function znfsFeuTrendHover(ev, svg){
  var geo = ZNFT.geo, cur = ZNFT.cur;
  if(!geo || !cur || !svg) return;
  var box = svg.getBoundingClientRect(); if(!box.width) return;
  var vx = (ev.clientX - box.left) / box.width * 1000;
  var frac = (vx - ZNFT_GEO.x0) / (ZNFT_GEO.x1 - ZNFT_GEO.x0);
  var doy = Math.round(1 + Math.max(0, Math.min(1, frac)) * (geo.days - 1));

  var p = null, i;
  for(i = 0; i < cur.pts.length; i++){
    if(cur.pts[i].doy <= doy && cur.pts[i].cb != null) p = cur.pts[i];
    else if(cur.pts[i].doy > doy) break;
  }
  if(!p){ znfsFeuTrendHoverOff(); return; }
  var px = geo.X(p.doy);
  var cross = document.getElementById("znft-cross");
  if(cross){ cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("opacity", "1"); }
  var dot = document.getElementById("znft-dot");
  if(dot){ dot.setAttribute("cx", px); dot.setAttribute("cy", geo.YL(p.cb)); dot.setAttribute("opacity", "1"); }
  var dot2 = document.getElementById("znft-dot2");
  if(dot2 && p.ghgie != null){ dot2.setAttribute("cx", px); dot2.setAttribute("cy", geo.YR(p.ghgie)); dot2.setAttribute("opacity", "1"); }
  else if(dot2){ dot2.setAttribute("opacity", "0"); }

  var tip = document.getElementById("znft-tip"); if(!tip) return;
  var cbPos = (p.cb || 0) >= 0;
  tip.innerHTML =
    '<div class="d">' + znfsPrettyDate(p.iso) + '</div>' +
    '<div class="r"><span>Balance</span><b style="color:' + (cbPos ? "#8fd0a8" : "#e8a6a1") + '">' + fmtI(p.cb) + ' t CO₂eq</b></div>' +
    '<div class="r"><span>Penalty</span><b>' + (p.penalty > 0 ? "€ " + fmtI(p.penalty) : "None") + '</b></div>' +
    '<div class="r"><span>GHG intensity</span><b>' + (p.ghgie != null ? fmtF(p.ghgie, 2) + ' g/MJ' : "—") + '</b></div>' +
    '<div class="r"><span>Target</span><b>' + fmtF(p.target, 2) + ' g/MJ</b></div>';
  var wrap = tip.parentNode, wb = wrap.getBoundingClientRect();
  var lx = ev.clientX - wb.left + 14, ly = ev.clientY - wb.top - 12;
  tip.classList.add("on");
  if(lx + tip.offsetWidth > wb.width - 4) lx = ev.clientX - wb.left - tip.offsetWidth - 14;
  if(ly + tip.offsetHeight > wb.height - 4) ly = wb.height - tip.offsetHeight - 4;
  tip.style.left = Math.max(0, lx) + "px";
  tip.style.top  = Math.max(0, ly) + "px";
}

/* ---------------------------------------------------- lower section (tabs) */
/* 2026-07-28h (Aurvin) — RESCUE THE RELOCATED TOOLBAR BEFORE THE ROW THAT HOLDS #znfs-extras IS
   REBUILT. Originally written for znfsRenderTabbar() (#znfs-extras used to live on the tab row);
   2026-07-28m moved #znfs-extras up into the header, so znfsRenderHeader() is now the function
   that must call this FIRST, and does (see its top). Kept generic/id-based on purpose — it works
   no matter which container currently holds #znfs-extras.
   What it rescues: znfsRenderTabbar() / znfsRenderHeader() setting el.innerHTML destroys whatever
   is inside, including the REAL .dfextra node (⬇ Download + ⓘ) that znfsMountExtras() had moved
   up out of the panel. If the panel has not re-rendered since, that node is the only copy in
   existence and it is simply gone — the row loses its Download button and its ⓘ, which is what
   "no tooltip appears" looks like from the outside. It went unnoticed until 2026-07-28h because
   nothing used to call the owning render function twice between panel renders; voyClear/voySet
   becoming aliases of dfClearRange/dfSet (which call the wrapped dfRepaint, which itself
   refreshes the overlay) made it a two-refresh path.
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
  /* 2026-07-28m: no longer needs its own _znfsRescueExtras() call — #znfs-extras moved off this
     row (into the header) with 2026-07-28m's Task 4, so this row's own innerHTML rewrite can no
     longer touch it. The rescue now happens in znfsRenderHeader(), which is the function that
     actually owns #znfs-extras' container. */
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
  /* 2026-07-28b: the From / To controls live on this row (right-aligned), level with the
     pills and directly above the table — moved down from the header's top-right.
     2026-07-28m (Aurvin, owner instruction — Task 4): the Year selector and #znfs-extras (the
     landing slot for the active panel's relocated Download button + ⓘ, moved here by
     znfsMountExtras()) BOTH moved OFF this row and up into the vessel-particulars row
     (znfsRenderHeader/.znfs-partsrt) — this row keeps only the pills and From/To/Clear. Nothing
     in znfsMountExtras() itself changed: it still finds #znfs-extras purely by id, so it works
     identically wherever that element physically sits in the DOM. */
  el.innerHTML = pills + znfsFilterHtml();
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

  /* 2026-08-09h (Aurvin, owner instruction) — THE FULLSCREEN API CALL WAS REMOVED HERE.
     ------------------------------------------------------------------------------
     This used to call requestFullscreen() on <html>, which hid Chrome's tab strip and
     URL bar. It was removed because of the side effect: Chrome DELIBERATELY switches its
     own pinch-to-zoom OFF for as long as any page is fullscreen that way (the same rule a
     video player lives under), and no page-side setting can bring it back. The owner
     zooms this view constantly on a trackpad, so losing pinch cost more than the ~90px of
     screen the URL bar takes back.

     The overlay itself does all the real work and always did: #znfs is position:fixed,
     inset:0, z-index 9000, and body.znfs-open hides the header/nav/main behind it. It
     still covers the entire browser window. The only thing that changed is that the
     window is no longer the entire SCREEN — and Chrome's native pinch zoom, Ctrl/⌘ +/−
     and everything else browser-level now work in here exactly as they do on the
     ordinary calculator page.

     If true edge-to-edge is ever wanted for a demo or a screenshot, Chrome's own
     fullscreen (⌘⌃F on a Mac, F11 on Windows) still does it — and, unlike the API call,
     it leaves pinch zoom working. Do NOT re-add requestFullscreen here without asking
     the owner: it silently takes pinch zoom away again. See HANDOFF_LOG.md 2026-08-09h. */
}

function znfsClose(){
  if(!ZNFS.open) return;
  ZNFS.open = false;

  /* 2026-07-30 (Aurvin): the CII trend popup is a child of <body>, not of #znfs, so hiding
     the overlay does not hide it — it would be left floating over the ordinary calculator.
     Dismiss it with its parent. */
  try{ if(ZNCT.open) znfsCiiTrendClose(); }catch(e){}
  /* 2026-07-30e: the FuelEU trend popup is also a child of <body>, for the same reason. */
  try{ if(ZNFT.open) znfsFeuTrendClose(); }catch(e){}
  /* 2026-07-30h: so is the regulation drawer. */
  try{ if(ZNRD.open) znfsRegClose(); }catch(e){}

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

  /* 2026-08-09h: the matching exitFullscreen() went with the requestFullscreen() in
     znfsOpen — see the long note there. Nothing to undo any more: the overlay never
     put the browser into fullscreen in the first place. If the user has pressed ⌘⌃F /
     F11 themselves, that is THEIR window state and closing this overlay must not
     cancel it. */

  try{ showTab(ZNFS.prevTab); }catch(e){}   // restores display, the .shell body class and re-renders
}

function znfsToggle(){ if(ZNFS.open) znfsClose(); else znfsOpen(); }

/* ==========================================================================
   REGULATION DETAIL DRAWER — 2026-07-30 (Aurvin, owner instruction)
   ==========================================================================
   WHAT THIS IS, in plain language: each KPI card shows two or three headline numbers.
   Clicking a card slides a drawer in from the RIGHT carrying everything you would need
   to defend that number to a verifier — the activity data it was built from, the
   regulation's own thresholds and factors, and the arithmetic in between.

   OWNER DECISIONS BEHIND THE DESIGN (all taken 2026-07-30, in session):
     1. READ-ONLY AUDIT TRAIL, not a data-entry form. Nothing in the drawer is editable.
        Inputs are changed where they already live (Workspace panel / Settings); the drawer
        only reports. This is why there is no <input> anywhere below.
     2. SHARED ACTIVITY BLOCK + REGULATION BLOCK. Distance, time, cargo, transport work,
        fuel by type and the intensities are IDENTICAL for every regulation — they all come
        from the one `R.summary` object. So they are rendered ONCE by
        znfsRegActivityHtml() and reused by all four drawers. Copying that block per
        regulation (the layout of the owner's reference screenshot) was rejected in session
        precisely because four copies can drift and one function cannot.
     3. FOUR DRAWERS. A fifth (Sea Cargo Charter) existed for one session — added
        2026-07-30h, deleted 2026-07-30m at the owner's instruction because the figure was
        not used and the fifth card cost the table a row of vertical space on a laptop.
        engine.js still computes R.scc and the SEA CARGO CHARTER table columns still show
        it; there is simply no card or drawer for it.
     4. THE EU/UK ETS SCOPE BUCKETS ARE THE POINT OF THOSE TWO DRAWERS. The reference
        screenshot prints an UNSCOPED total CO2e a few lines above a SCOPED EUA figure with
        nothing between them, which invites the reader to divide the two and report the
        quotient as "the scope factor". It is not one: it is the mix of 100% intra-EEA /
        50% extra-EEA / 0% out-of-scope legs. znfsRegScopeHtml() prints that mix as its own
        table — row counts, gross CO2e and counted CO2e per bucket — so the two figures can
        never be silently divided. Sources: euCoverage()/covVoyEU() and ukCoverage() in
        js/engine.js, surfaced per row as rowDetails[i].covEU / .covUK.
     5. WHEN A REGULATION DOES NOT APPLY the drawer still opens with its full field
        skeleton showing dashes (owner's choice), but ONE PLAIN-LANGUAGE LINE at the top
        of the body names the eligibility test that failed. Dashes alone read as "the
        calculator broke", not "the regulation does not bite" — see znfsRegReasonHtml().

   THIS FILE COMPUTES NOTHING NEW. Every figure below is read straight off the single
   computeAll(S) result the cards and the tables already use, so a drawer cannot disagree
   with the card it opened from. js/engine.js is not touched by this change. */

var ZNRD = { open:false, reg:null };

/* the four drawers, in card order. `label` is the drawer title, `sec` builds the
   regulation-specific section(s) and returns { reason, html } — reason is non-null only
   when the regulation does not bite (owner decision 5 above). */
/* 2026-07-30m: the "scc" entry was deleted with the SCC card — four drawers, not five. */
var ZNRD_REGS = {
  cii:    { label:"IMO — CII",           sec:function(R){ return znfsRegCiiSec(R); } },
  fueleu: { label:"FuelEU Maritime",     sec:function(R){ return znfsRegFeuSec(R); } },
  ets:    { label:"EU ETS",              sec:function(R){ return znfsRegEtsSec(R); } },
  ukets:  { label:"UK ETS",              sec:function(R){ return znfsRegUkSec(R);  } }
};

/* ---- small builders. Deliberately dumb string helpers: the drawer is a report, so the
   markup stays flat and every value goes through fmtI/fmtF/esc from js/ui.js — the same
   formatters the cards and tables use, so rounding cannot differ between the two. ---- */
function znrdKv(label, val, tip){
  return '<div class="znrd-kv"' + (tip ? ' title="' + esc(tip) + '"' : "") + '>' +
         '<span>' + label + '</span><b>' + val + '</b></div>';
}
function znrdSec(title, rows, note){
  return '<div class="znrd-sec"><h5>' + esc(title) + '</h5>' + rows +
         (note ? '<p class="znrd-note">' + note + '</p>' : "") + '</div>';
}
function znrdDash(){ return '<span class="znrd-dim">—</span>'; }
/* a value that is only meaningful when the regulation bites: prints the figure normally,
   or a dash when `on` is false. Keeps the field skeleton identical in both states, which
   is what the owner asked for in decision 5. */
function znrdIf(on, val){ return on ? val : znrdDash(); }

/* ---- the reason line (owner decision 5) ---- */
function znfsRegReasonHtml(txt){
  return txt ? '<p class="znrd-reason">' + txt + '</p>' : "";
}

/* ---- SHARED ACTIVITY DATA (owner decision 2) --------------------------------------------
   One source: R.summary, built by engine.js's single aggregation loop over the rows in the
   selected window. TtW CO2, ALL activity worldwide — deliberately NOT thinned by any
   regulation's coverage factor, and the note says so, because three of the four drawers go
   on to show a scoped figure and the reader must not confuse the two. */
function znfsRegActivityHtml(R){
  var sm = R.summary, rows = "";
  rows += znrdKv("Distance travelled", fmtI(sm.dist) + " nm",
                 "Sum of the distance on every voyage row in the selected window.");
  rows += znrdKv("Distance through ice", fmtI(sm.distIce) + " nm",
                 "Set in Settings. Reported for CII correction purposes; it does not reduce any figure here.");
  rows += znrdKv("Time at sea", fmtF(sm.hoursSea, 1) + " h", "Hours on voyage rows.");
  rows += znrdKv("Time in port", fmtF(sm.hoursPort, 1) + " h", "Hours on port-stay rows.");
  rows += znrdKv("Cargo carried", fmtI(sm.cargo) + " t", "Sum of the cargo quantity on the voyage rows.");
  rows += znrdKv("Transport work",
                 (sm.tw > 0 ? fmtF(sm.tw / 1e6, 2) + " ×10⁶ t·nm" : znrdDash()),
                 "Cargo × laden distance, counting only voyage rows that have BOTH cargo and distance. This is the denominator of every intensity below.");
  rows += znrdKv("Period covered",
                 (sm.tMin && sm.tMax ? esc(String(sm.tMin).slice(0,10)) + " → " + esc(String(sm.tMax).slice(0,10)) : znrdDash()),
                 "Earliest start and latest end among the dated rows in the window (UTC).");
  var fuelRows = "";
  var ids = Object.keys(sm.fuelByType || {});
  ids.sort(function(a,b){ return (sm.fuelByType[b]||0) - (sm.fuelByType[a]||0); });
  ids.forEach(function(id){
    var nm = id; try{ if(FUEL_BY_ID && FUEL_BY_ID[id] && FUEL_BY_ID[id].name) nm = FUEL_BY_ID[id].name; }catch(e){}
    fuelRows += znrdKv(esc(nm), fmtF(sm.fuelByType[id], 2) + " t", "Tonnes of this fuel burned across the window, sea and berth.");
  });
  if(!ids.length) fuelRows = znrdKv("Fuel", znrdDash(), "No fuel rows in this window.");
  fuelRows += '<div class="znrd-kv znrd-tot"><span>Total fuel consumption</span><b>' +
              fmtF(sm.fuelTotal, 2) + ' t</b></div>';

  var iRows = "";
  iRows += znrdKv("CO₂ at berth", fmtF(sm.co2Berth, 2) + " t", "Tank-to-Wake CO₂ on port-stay rows.");
  iRows += znrdKv("CO₂ during sea passage", fmtF(sm.co2Sea, 2) + " t", "Tank-to-Wake CO₂ on voyage rows.");
  iRows += '<div class="znrd-kv znrd-tot" title="Sea + berth. Tank-to-Wake CO₂, worldwide — NOT the EU/UK-scoped share."><span>Total CO₂ emissions</span><b>' +
           fmtF(sm.co2Total, 2) + ' t</b></div>';
  iRows += '<div class="znrd-sub">Intensity</div>';
  iRows += znrdKv("CO₂ per distance", (sm.co2PerDist == null ? znrdDash() : fmtF(sm.co2PerDist, 3) + " t/nm"), "Total CO₂ ÷ distance travelled.");
  iRows += znrdKv("CO₂ per transport work", (sm.co2PerTW == null ? znrdDash() : fmtF(sm.co2PerTW, 2) + " g/t·nm"),
                  "IMO EEOI (MEPC.1/Circ.684) — Tank-to-Wake CO₂ ÷ transport work. Not the Sea Cargo Charter EEOI, which is well-to-wake CO₂e.");
  iRows += znrdKv("Fuel consumption per distance", (sm.fuelPerDist == null ? znrdDash() : fmtF(sm.fuelPerDist, 3) + " t/nm"), "Total fuel ÷ distance travelled.");
  iRows += znrdKv("Fuel consumption per transport work", (sm.fuelPerTW == null ? znrdDash() : fmtF(sm.fuelPerTW, 2) + " g/t·nm"), "Total fuel ÷ transport work.");

  return znrdSec("Vessel performance", rows) +
         znrdSec("Fuel consumption", fuelRows) +
         znrdSec("Emissions and intensity metrics", iRows,
           "Tank-to-Wake CO₂ for <b>all activity worldwide</b> in the selected window. This is the activity data every " +
           "regulation below is built from — it is <b>not</b> scoped to EU or UK coverage. The scoped figures appear in " +
           "the regulation section, with their coverage mix shown separately.");
}

/* ---- EU / UK ETS SCOPE BUCKETS (owner decision 4) ---------------------------------------
   `which` is "EU" or "UK". Buckets every row in the window by its coverage factor and
   prints, per bucket: how many rows, their GROSS CO2e (every tonne burned, det.totalCO2e)
   and the COUNTED CO2e (the scoped figure the regime actually charges, det.etsCO2e /
   det.ukCO2e). Printing all three together is what stops "counted ÷ gross" being mistaken
   for a single statutory percentage.
   EU coverage is 1 / 0.5 / 0 (covVoyEU, engine.js) — intra-EEA, extra-EEA, outside.
   UK coverage is BINARY 1 / 0 (ukCoverage, engine.js: UK→UK voyages and UK in-port only),
   so any fraction strictly between 0 and 1 can only be the 1 Jul 2026 half-year proration.
   The two label sets differ for exactly that reason; do not merge them. */
function znfsRegScopeHtml(R, which){
  var isEU = (which === "EU");
  var buckets = isEU
    ? [{ k:"full",  f:"100%", lbl:"Intra-EEA — 100% counted" },
       { k:"half",  f:"50%",  lbl:"Extra-EEA (one EEA end) — 50% counted" },
       { k:"none",  f:"0%",   lbl:"Outside scope — 0% counted" }]
    : [{ k:"full",  f:"100%", lbl:"UK→UK voyage or UK in-port — 100% counted" },
       { k:"half",  f:"part", lbl:"In scope, time-pro-rated across 1 Jul 2026" },
       { k:"none",  f:"0%",   lbl:"Outside scope — 0% counted" }];
  var acc = { full:{n:0,g:0,c:0}, half:{n:0,g:0,c:0}, none:{n:0,g:0,c:0} };
  (R.rowDetails || []).forEach(function(d){
    var cov = isEU ? (Number(d.covEU) || 0) : (Number(d.covUK) || 0);
    var key = cov >= 1 ? "full" : (cov > 0 ? "half" : "none");
    var counted = isEU ? (Number(d.etsCO2e) || 0) : (Number(d.ukCO2e) || 0);
    acc[key].n++; acc[key].g += (Number(d.totalCO2e) || 0); acc[key].c += counted;
  });
  var tot = { n:0, g:0, c:0 };
  ["full","half","none"].forEach(function(k){ tot.n += acc[k].n; tot.g += acc[k].g; tot.c += acc[k].c; });

  var body = "";
  buckets.forEach(function(b){
    var a = acc[b.k];
    body += '<tr' + (a.n ? "" : ' class="znrd-dim"') + '>' +
            '<td>' + b.lbl + '</td><td class="r">' + b.f + '</td><td class="r">' + a.n + '</td>' +
            '<td class="r">' + fmtF(a.g, 2) + '</td><td class="r">' + fmtF(a.c, 2) + '</td></tr>';
  });
  body += '<tr class="znrd-trtot"><td>Total</td><td class="r"></td><td class="r">' + tot.n +
          '</td><td class="r">' + fmtF(tot.g, 2) + '</td><td class="r">' + fmtF(tot.c, 2) + '</td></tr>';

  var tbl = '<table class="znrd-tbl"><thead><tr><th>Coverage bucket</th><th class="r">Factor</th>' +
            '<th class="r">Rows</th><th class="r">Gross CO₂e (t)</th><th class="r">Counted CO₂e (t)</th></tr></thead>' +
            '<tbody>' + body + '</tbody></table>';

  var note = isEU
    ? 'Gross is every tonne burned on those rows; counted is what EU ETS charges after the coverage factor. ' +
      '<b>Do not divide the counted total by the gross total and report the result as a statutory percentage</b> — ' +
      'there is no single factor, only this mix. Basis: Directive 2003/87/EC as amended by (EU) 2023/959; ' +
      'coverage per <code>covVoyEU()</code> in the engine.'
    : 'UK ETS coverage is binary — a voyage is UK→UK or it is out. Any row in the middle bucket is one whose ' +
      'period straddles <b>1 Jul 2026</b> and has been pro-rated; the fraction comes from the actual per-report ' +
      'consumption where the row was imported, and from time-proration only for hand-entered rows. ' +
      'Basis: SI 2026/392, Sch 2A.';
  return znrdSec("Scope and coverage mix", tbl, note);
}

/* ---- warnings that belong to this regulation -------------------------------------------
   engine.js already emits plain-language warnings (missing SCC factors, undated rows, the
   UK half-year, out-of-year rows). Surfacing the matching ones inside the drawer keeps the
   caveat next to the number it qualifies instead of in a separate list. Matching is by
   prefix/keyword on the warning text, so a warning with no owner simply does not appear. */
function znfsRegWarnHtml(R, re){
  var hits = (R.warnings || []).filter(function(w){ return re.test(String(w)); });
  if(!hits.length) return "";
  return '<div class="znrd-sec"><h5>Caveats on these figures</h5>' +
         hits.map(function(w){ return '<p class="znrd-warn">' + esc(w) + '</p>'; }).join("") + '</div>';
}

/* ---- 1. IMO CII ----------------------------------------------------------------------- */
function znfsRegCiiSec(R){
  var c = R.cii, on = (c.attained != null);
  var pct = null; try{ pct = ciiPctOfRequired(c); }catch(e){}
  var rows = "";
  rows += znrdKv("Ship type", esc(c.type || "—"), "Set on the Workspace panel; it selects the reference line and the dd vectors.");
  rows += znrdKv("Capacity basis", esc(c.capUnit || "—") + (c.g2 && c.g2.cap ? " · " + fmtI(c.g2.cap) : ""),
                 "DWT or GT as the guidelines prescribe for this ship type, and the capacity value actually used.");
  rows += znrdKv("Reference line", (c.g2 ? "a = " + fmtI(c.g2.a) + " · c = " + fmtF(c.g2.c, 3) : znrdDash()),
                 "The 2019 reference-line coefficients for this ship type (MEPC.353(78)).");
  rows += znrdKv("Reference CII", znrdIf(c.ciiRef != null, fmtF(c.ciiRef, 3)), "a × capacity^(−c) — the 2019 reference value before the annual reduction.");
  rows += znrdKv("Z reduction factor for " + R.year, znrdIf(c.Z != null, fmtF(c.Z, 1) + " %"), "The year's reduction against the 2019 reference line (MEPC.338(76), extended by MEPC 83 for 2027–30).");
  rows += znrdKv("Required CII", znrdIf(c.ciiReq != null, fmtF(c.ciiReq, 3)), "Reference CII × (1 − Z/100). The line the attained figure is measured against.");
  rows += znrdKv("Attained CII (AER)", znrdIf(on, fmtF(c.attained, 3)), "Tank-to-Wake CO₂ ÷ (capacity × distance), gCO₂ per capacity·nm — MARPOL Annex VI reg.28.");
  rows += znrdKv("% of required", znrdIf(pct != null, fmtF(pct, 1) + " %"), "Attained × 100 ÷ required. Below 100% is better than required.");
  rows += znrdKv("Rating for " + R.year, on && c.rating ? '<span class="znrd-rate" style="background:' + znfsRatingColour(c.rating) + '">' + esc(c.rating) + '</span>' : znrdDash(),
                 "A–E band the attained figure falls in.");

  var b = c.bounds || {}, bRows = "";
  if(on && b.sup != null){
    bRows += znrdKv("A — superior", "≤ " + fmtF(b.sup, 3), "dd1 × required CII.");
    bRows += znrdKv("B — lower", "≤ " + fmtF(b.low, 3), "dd2 × required CII.");
    bRows += znrdKv("C — upper", "≤ " + fmtF(b.up, 3), "dd3 × required CII. C is the band that meets the requirement.");
    bRows += znrdKv("D — inferior", "≤ " + fmtF(b.inf, 3), "dd4 × required CII. Above this is E.");
    bRows += znrdKv("E", "> " + fmtF(b.inf, 3), "Three consecutive D years, or one E year, triggers a corrective action plan in the SEEMP.");
  } else {
    bRows += znrdKv("A / B / C / D / E boundaries", znrdDash(), "No capacity or no distance in this window, so there are no bands to draw.");
  }

  var oRows = "";
  oRows += znrdKv("Total CO₂ (Tank-to-Wake)", fmtF(c.co2_t, 2) + " t", "All fuel, CO₂ only, worldwide — the CII numerator.");
  oRows += znrdKv("Total distance", fmtI(c.totalDist) + " nm", "The CII denominator's distance term.");

  return {
    reason: on ? null :
      "No attained CII can be computed for " + R.year + ": the ship needs both a capacity (DWT or GT, set on the " +
      "Workspace panel or in Settings) and some dated distance in the window. The regulation still applies — the " +
      "inputs are missing, not the obligation.",
    html: znrdSec("Ship and reference line", rows) +
          znrdSec("A–E rating bands for " + R.year, bRows) +
          znrdSec("CII inputs", oRows,
            "CII is a <b>full-calendar-year, whole-ship</b> figure in law (MARPOL Annex VI reg.28). If the From/To " +
            "filter is narrowed, the figure above is the same arithmetic over part of the year and has no legal standing " +
            "on its own. Scope is worldwide — CII is not an EU or UK measure.")
  };
}

/* ---- 2. FuelEU Maritime --------------------------------------------------------------- */
function znfsRegFeuSec(R){
  var f = R.fueleu, on = (f.ghgie != null);
  var tRows = "";
  tRows += znrdKv("Reference intensity", "91.16 g CO₂eq/MJ", "The 2020 fleet average baseline in Regulation (EU) 2023/1805.");
  tRows += znrdKv("Reduction for " + R.year, fmtF(f.targetPct, 1) + " %", "The year's reduction step under Art.4(2).");
  tRows += znrdKv("Target intensity", fmtF(f.target, 2) + " g/MJ", "91.16 × (1 − reduction). The limit the attained intensity must not exceed.");
  tRows += znrdKv("Attained GHG intensity", znrdIf(on, fmtF(f.ghgie, 2) + " g/MJ"), "Well-to-Wake CO₂eq of the energy in scope ÷ that energy, after the wind reward factor.");
  tRows += znrdKv("Margin to target", znrdIf(on, fmtF(f.target - f.ghgie, 2) + " g/MJ"), "Positive = inside the target. Negative = a deficit before any flexibility.");
  tRows += znrdKv("Wind reward factor", fmtF(f.fwind, 3), "Art.4/Annex I factor for wind-assisted propulsion. 1.000 = none claimed.");

  var eRows = "";
  eRows += znrdKv("Energy in scope", fmtF(f.E_total / 1e6, 2) + " ×10⁶ MJ", "Fuel energy plus on-shore power supply, after the coverage factors.");
  eRows += znrdKv("— of which fuel", fmtF(f.E_fuel / 1e6, 2) + " ×10⁶ MJ", "Σ (tonnes × LCV) × coverage, allocated by the chosen method.");
  eRows += znrdKv("— of which OPS", fmtF(f.opsMJ / 1e6, 2) + " ×10⁶ MJ", "On-shore power supply energy, counted at zero intensity.");
  eRows += znrdKv("Total pool energy", fmtF((f.E_pool || 0) / 1e6, 2) + " ×10⁶ MJ", "All fuel energy burned before coverage — the pool the allocation draws from.");
  eRows += znrdKv("Allocation method", esc(String(f.allocMethod || "—")), "Optimal = cleanest fuel counted into scope first (essf-ws1-2-5). Proportional = pro-rata. Chosen on the Workspace panel.");

  var cbT = function(x){ return x == null ? znrdDash() : fmtF(x / 1e6, 2) + " t CO₂eq"; };
  var bRows = "";
  bRows += znrdKv("Compliance balance, before flexibility", cbT(f.cb), "(target − attained) × energy in scope. Positive = surplus.");
  bRows += znrdKv("Banked surplus brought forward", cbT(f.banked), "Art.20(2) surplus banked from the previous period.");
  bRows += znrdKv("Pooling adjustment", cbT(f.poolCB), "Art.21 pooled balance assigned to this ship.");
  bRows += znrdKv("Borrowing used", cbT(f.borrowUsed), "Art.20(3) advance borrowing applied to this period.");
  bRows += znrdKv("Borrowing limit", cbT(f.borrowLimit), "2% of the target × energy in scope — the Art.20(3) cap.");
  bRows += znrdKv("Borrowing debt carried", cbT(f.borrowDebt), "Borrowed amount that must be repaid next period, with the 1.1 uplift.");
  bRows += '<div class="znrd-kv znrd-tot"><span>Compliance balance, final</span><b>' + cbT(f.cbFinal) + '</b></div>';

  var pRows = "";
  pRows += znrdKv("Penalty base", znrdIf(f.penaltyBase > 0, "€ " + fmtI(f.penaltyBase)), "Deficit ÷ (attained × 41,000) × €2,400 — Art.23(2) and Annex IV.");
  pRows += znrdKv("Consecutive-deficit multiplier", fmtF(f.mult, 2) + " ×", "Art.23(3): 1 + 0.1 × (n − 1) for the nth consecutive deficit period.");
  pRows += znrdKv("Penalty payable", f.penalty > 0 ? '<span class="znrd-neg">€ ' + fmtI(f.penalty) + '</span>' : '<span class="znrd-pos">None</span>', "Penalty base × multiplier.");
  pRows += znrdKv("Surplus value", f.surplusValue > 0 ? '<span class="znrd-pos">€ ' + fmtI(f.surplusValue) + '</span>' : znrdDash(), "Indicative market value of a surplus balance at the price set in Settings.");

  var terms = f.terms || [], fRows = "";
  if(terms.length){
    fRows = '<table class="znrd-tbl"><thead><tr><th>Fuel</th><th class="r">Tonnes in scope</th>' +
            '<th class="r">Energy (×10⁶ MJ)</th><th class="r">Flags</th></tr></thead><tbody>';
    terms.forEach(function(t){
      var flags = [];
      if(t.bio) flags.push("bio");
      if(t.rfnbo) flags.push("RFNBO · RWD 2");
      fRows += '<tr><td>' + esc(String(t.name || t.id || "—")) + '</td><td class="r">' + fmtF(t.tonnes, 2) +
               '</td><td class="r">' + fmtF((t.E || 0) / 1e6, 2) + '</td><td class="r">' +
               (flags.length ? esc(flags.join(" · ")) : '<span class="znrd-dim">—</span>') + '</td></tr>';
    });
    fRows += '</tbody></table>';
  } else {
    fRows = znrdKv("Fuels allocated into scope", znrdDash(), "No fuel energy fell inside the FuelEU scope in this window.");
  }

  return {
    reason: on ? null :
      "No attained GHG intensity for " + R.year + ": no energy fell inside the FuelEU scope in this window. " +
      "FuelEU counts intra-EEA voyages in full, extra-EEA voyages at half and EEA port stays in full — if none of " +
      "the rows here touch an EEA port, there is nothing in scope to measure.",
    html: znrdSec("Target and attained intensity", tRows) +
          znrdSec("Energy in scope", eRows) +
          znrdSec("Compliance balance", bRows) +
          znrdSec("Penalty and surplus", pRows) +
          znrdSec("Fuels allocated into scope", fRows,
            "RFNBO energy carries a reward factor of 2 in the intensity denominator for 2025–2033 (Art.5). " +
            "Bio and RFNBO well-to-tank values must come from the certified BDN, not from a default — check the " +
            "Fuels panel before this goes into a submission.") +
          znrdSec("Reporting note", znrdKv("Basis", "Regulation (EU) 2023/1805", "FuelEU Maritime."),
            "FuelEU is <b>period-based</b> in law and the balance is settled per reporting period, not per voyage. " +
            "Everything above is indicative for the selected window.")
  };
}

/* ---- 3. EU ETS ------------------------------------------------------------------------ */
function znfsRegEtsSec(R){
  var e = R.ets, price = Number(S.euaPrice) || 0;
  var rows = "";
  rows += znrdKv("Covered CO₂", fmtF(e.covered_t_co2, 2) + " t", "CO₂ inside the EU ETS scope after the coverage factors.");
  rows += znrdKv("Covered CO₂e", fmtF(e.covered_t_co2e, 2) + " t", "CO₂ plus CH₄ and N₂O at the prescribed GWPs — in scope from 2026.");
  rows += znrdKv("Basis used for " + R.year, '<span class="znrd-dim">' + esc(e.basisLabel) + '</span>', "CH₄ and N₂O join the EU ETS scope from the 2026 reporting year.");
  rows += '<div class="znrd-kv znrd-tot" title="The figure the phase-in is applied to."><span>Chargeable basis</span><b>' + fmtF(e.basis_t, 2) + ' t</b></div>';
  rows += znrdKv("GWP — CH₄", fmtI(e.gwp && e.gwp.ch4), "Prescribed global warming potential used for methane.");
  rows += znrdKv("GWP — N₂O", fmtI(e.gwp && e.gwp.n2o), "Prescribed global warming potential used for nitrous oxide.");

  var sRows = "";
  sRows += znrdKv("Phase-in for " + R.year, Math.round(e.phase * 100) + " %", "Share of covered emissions actually surrendered this year — Art.3gb. 40% (2024), 70% (2025), 100% (2026 onward).");
  sRows += '<div class="znrd-kv znrd-tot"><span>EUAs to surrender</span><b>' + fmtI(e.euas) + '</b></div>';
  sRows += znrdKv("EUA price (Settings)", "€ " + fmtI(price), "Your assumed price. Not a market quote.");
  sRows += znrdKv("Indicative cost", "€ " + fmtI(e.cost), "EUAs × the price above.");

  return {
    reason: (e.basis_t > 0) ? null :
      "Nothing is inside the EU ETS scope in this window. EU ETS bites on voyages with at least one EEA end and on " +
      "EEA port stays; if every row here sits outside the EEA, the coverage factor is zero for all of them and there " +
      "is no obligation to compute. The coverage table below shows which rows fell where.",
    html: znfsRegScopeHtml(R, "EU") +
          znrdSec("Covered emissions", rows) +
          znrdSec("Surrender obligation", sRows,
            "Basis: Directive 2003/87/EC as amended by Directive (EU) 2023/959, Art.3g–3gg. Applies to ships of " +
            "5,000 GT and above. Allowances for a reporting year are surrendered by <b>30 September</b> of the " +
            "following year, against a verified emissions report.") +
          znfsRegWarnHtml(R, /EU ETS|coverage|EEA|out-of-year|EXCLUDED/i)
  };
}

/* ---- 4. UK ETS ------------------------------------------------------------------------ */
function znfsRegUkSec(R){
  var u = R.ukets, price = Number(S.ukaPrice) || 0, on = !!u.active;
  var nPart = 0;
  (R.rowDetails || []).forEach(function(d){ var c = Number(d.covUK) || 0; if(c > 0 && c < 1) nPart++; });

  var rows = "";
  rows += znrdKv("CO₂", znrdIf(on, fmtF(u.co2, 2) + " t"), "CO₂ on the UK-scoped share.");
  rows += znrdKv("CH₄", znrdIf(on, fmtF(u.ch4, 3) + " t CO₂e"), "Methane, including LNG slip, at GWP 28.");
  rows += znrdKv("N₂O", znrdIf(on, fmtF(u.n2o, 3) + " t CO₂e"), "Nitrous oxide at GWP 265.");
  rows += '<div class="znrd-kv znrd-tot"><span>Total covered CO₂e</span><b>' + znrdIf(on, fmtF(u.tco2e, 2) + " t") + '</b></div>';
  rows += znrdKv("GWP — CH₄ / N₂O", "28 / 265", "Prescribed values, SI 2026/392 Sch 2A para 35.");
  if(!on) rows += znrdKv("Computed CO₂e (no obligation yet)", '<span class="znrd-dim">' + fmtF(u.tco2e, 2) + ' t</span>', "Computed anyway so the exposure is visible before the scheme year opens.");

  var sRows = "";
  sRows += znrdKv("First maritime scheme year", "1 Jul – 31 Dec 2026", "SI 2026/392 brought maritime into UK ETS on 1 Jul 2026, so the first scheme year is a half-year.");
  sRows += znrdKv("Rows pro-rated across 1 Jul 2026", (R.year === 2026 ? String(nPart) : znrdDash()),
                  "Rows whose period straddles the cut. Imported rows are split from the actual per-report consumption; hand-entered rows are pro-rated by time.");
  sRows += '<div class="znrd-kv znrd-tot"><span>UKAs to surrender</span><b>' + znrdIf(on, fmtI(u.tco2e)) + '</b></div>';
  sRows += znrdKv("UKA price (Settings)", "£ " + fmtI(price), "Your assumed price. Not a market quote.");
  sRows += znrdKv("Indicative cost", znrdIf(on, "£ " + fmtI(u.cost)), "UKAs × the price above.");
  sRows += znrdKv("Surrender deadline", "30 Apr 2028", "The 2026 half-year and the 2027 full year are surrendered together by 30 Apr 2028.");

  return {
    reason: on ? null :
      "UK ETS does not bite in " + R.year + ": the maritime obligation starts with the scheme year beginning " +
      "1 Jul 2026 (SI 2026/392). The exposure is computed and shown below so it is visible in advance, but there is " +
      "nothing to surrender for this year.",
    html: znfsRegScopeHtml(R, "UK") +
          znrdSec("Covered emissions", rows) +
          znrdSec("Surrender obligation", sRows,
            "Basis: the Greenhouse Gas Emissions Trading Scheme Order as amended by SI 2026/392, Sch 2A. Scope " +
            "modelled here is <b>UK→UK voyages plus UK in-port activity</b>; UK–EEA voyages are not treated as " +
            "UK-scoped. Verify against your own legal reading before submission.") +
          znfsRegWarnHtml(R, /UK ETS/i)
  };
}

/* ---- 5. Sea Cargo Charter: znfsRegSccSec() DELETED 2026-07-30m (Aurvin, owner
   instruction) together with the SCC card in znfsRenderKpis(). engine.js still computes
   R.scc and the SEA CARGO CHARTER table columns still show it; only this drawer is gone.
   The full function is in _backups/2026-07-30m_pre-scc-removal.zip if it is ever wanted
   back — restore it here and re-add the `scc` entry to ZNRD_REGS above. ---- */

/* ---- open / render / close ------------------------------------------------------------
   Same mechanics as the two trend popups above: a <body>-level host, backdrop mousedown
   closes (target check so a drag out of the panel cannot close it), Escape peels one layer,
   and any open ⓘ balloon on the card behind is dismissed first because .ibpop sits at
   z-index 9600 and would paint over the drawer. */
function znfsRegOpen(reg){
  if(!ZNRD_REGS[reg]) return;
  var host = document.getElementById("znfs-regdrawer");
  if(!host){
    host = document.createElement("div");
    host.id = "znfs-regdrawer";
    host.addEventListener("mousedown", function(ev){ if(ev.target === host) znfsRegClose(); });
    document.body.appendChild(host);
  }
  try{ document.querySelectorAll(".ibpop.open").forEach(function(x){ x.classList.remove("open"); }); }catch(e){}
  ZNRD.open = true; ZNRD.reg = reg;
  host.classList.add("on");
  znfsRegRender();
  /* .in drives the slide; added on the next frame so the transition actually runs. .on is
     applied synchronously above so a DOM check (or a test) never has to wait for it. */
  try{ requestAnimationFrame(function(){ host.classList.add("in"); }); }catch(e){ host.classList.add("in"); }
  var btn = host.querySelector(".znrd-close"); if(btn) btn.focus();
}
function znfsRegClose(){
  var host = document.getElementById("znfs-regdrawer");
  var card = ZNRD.reg;
  ZNRD.open = false; ZNRD.reg = null;
  if(host){
    host.classList.remove("in");
    setTimeout(function(){ if(!ZNRD.open) host.classList.remove("on"); }, 200);
  }
  /* focus back on the card that opened it, so keyboard users are not dropped at the top */
  try{ var c = document.querySelector('#znfs-kpis .znk-click[data-reg="' + card + '"]'); if(c) c.focus(); }catch(e){}
}
/* Enter / Space on a focused card opens its drawer — the cards are role="button", so they
   must answer both keys to be usable without a mouse. */
function znfsRegKey(ev, reg){
  if(!ev) return;
  if(ev.key === "Enter" || ev.key === " " || ev.keyCode === 13 || ev.keyCode === 32){
    ev.preventDefault(); znfsRegOpen(reg);
  }
}
function znfsRegRender(){
  var host = document.getElementById("znfs-regdrawer"); if(!host) return;
  var def = ZNRD_REGS[ZNRD.reg]; if(!def) return;
  var R; try{ R = computeAll(S); }catch(e){
    host.innerHTML = '<div class="znrd-box"><div class="znrd-head"><h4>' + esc(def.label) + '</h4>' +
      '<button type="button" class="znrd-close" title="Close (Escape)" aria-label="Close" onclick="znfsRegClose()">✕</button></div>' +
      '<div class="znrd-body"><p class="znrd-reason">The calculation could not be run: ' +
      esc(String(e && e.message || e)) + '</p></div></div>';
    return;
  }
  var sec; try{ sec = def.sec(R); }catch(e2){ sec = { reason:null, html:'<p class="znrd-reason">This section could not be built: ' + esc(String(e2 && e2.message || e2)) + '</p>' }; }

  /* the regulation picker in the header: switches drawer without closing, which is how the
     owner's reference screenshot behaves (its title is a dropdown). */
  var opts = "";
  Object.keys(ZNRD_REGS).forEach(function(k){
    opts += '<option value="' + k + '"' + (k === ZNRD.reg ? " selected" : "") + '>' + esc(ZNRD_REGS[k].label) + '</option>';
  });

  host.innerHTML =
    '<div class="znrd-box" role="dialog" aria-modal="true" aria-label="' + esc(def.label) + ' reporting detail">' +
      '<div class="znrd-head">' +
        '<select class="znrd-pick" aria-label="Choose a regulation" ' +
          'title="Switch to another regulation without closing the drawer." ' +
          'onchange="znfsRegOpen(this.value)">' + opts + '</select>' +
        '<span class="znrd-yr">' + R.year + '</span>' +
        '<button type="button" class="znrd-close" title="Close (Escape)" aria-label="Close" onclick="znfsRegClose()">✕</button>' +
      '</div>' +
      '<div class="znrd-body">' +
        znfsRegReasonHtml(sec.reason) +
        znfsRegActivityHtml(R) +
        sec.html +
      '</div>' +
    '</div>';
}

/* Escape closes. (Historic note, 2026-08-09h: the second half of this used to matter
   because the overlay put the browser into REAL fullscreen, where most browsers swallow
   Escape to leave fullscreen and never fire keydown — so a fullscreenchange listener was
   the backstop. The overlay no longer does that, so this keydown handler is now the only
   path and Escape reaches it normally. The fullscreenchange backstop that used to sit
   below was deleted with it: if the user presses ⌘⌃F / F11 themselves, leaving that way
   is a change to THEIR window and must not close this overlay.)
   2026-07-30 (Aurvin): the CII trend popup is layered ON TOP of the overlay, so Escape has
   to peel ONE layer at a time — popup first, full screen only once the popup is gone.
   Without this first branch a single Escape would dismiss the whole overlay from under the
   chart, which reads as the app closing itself.
   2026-07-30h: the regulation drawer and the FuelEU trend popup are peeled the same way.
   ZNFT (FuelEU) was MISSING from this handler before today — with that popup open, one
   Escape closed the whole overlay from under it, exactly the failure the note above
   describes for CII. Fixed here rather than left, since the branch is one line. */
document.addEventListener("keydown", function(ev){
  if(ev.key !== "Escape" && ev.keyCode !== 27) return;
  if(ZNRD.open){ ev.preventDefault(); ev.stopPropagation(); znfsRegClose(); return; }
  if(ZNCT.open){ ev.preventDefault(); ev.stopPropagation(); znfsCiiTrendClose(); return; }
  if(typeof ZNFT !== "undefined" && ZNFT.open){ ev.preventDefault(); ev.stopPropagation(); znfsFeuTrendClose(); return; }
  /* 2026-07-31: the Trends popup (js/graph.js — internal name unchanged) is layered on top of the overlay too, so it gets
     the same one-layer-at-a-time peel. It is guarded with typeof because graph.js loads AFTER
     this file — the check must survive graph.js being absent (e.g. a partial build). */
  if(typeof ZNG !== "undefined" && ZNG.open){ ev.preventDefault(); ev.stopPropagation(); zngClose(); return; }
  if(ZNFS.open){ ev.preventDefault(); znfsClose(); }
}, true);

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
