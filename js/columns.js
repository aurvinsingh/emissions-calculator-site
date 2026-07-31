/* ============================================================================
   js/columns.js — "▦ Edit columns" picker for the FULL-SCREEN view
   2026-07-30i (Aurvin, owner instruction) — PHASE 1: REPORTS only
   ----------------------------------------------------------------------------
   WHAT THIS IS
   A button on the full-screen tab row (right of the From / To / ✕ Clear filters)
   that opens a vertical panel from the right. The panel has two sections:

     1. REGULATION KPI CARDS — which of the four cards at the top of the
        full-screen view are shown. All four start TICKED. Only IMO — CII is
        LOCKED ON (its checkbox is ticked and disabled); FuelEU Maritime, EU ETS
        and UK ETS are all free to untick, so the strip can be taken down to the
        single IMO card. That is the owner's 2026-07-30m instruction, replacing
        the 07-30i rule that also locked FuelEU and EU ETS. The fifth card, Sea
        Cargo Charter, existed between 07-30h and 07-30m and was then deleted.

     2. TABLE COLUMNS — the table's own group headers and, under each, its
        column headers. The list is rebuilt for whichever view is active
        (REPORTS / LEGS / VOYAGES), because the three tables do not have the
        same groups: REPORTS and LEGS have an Eligibility group, VOYAGES does
        not; VOYAGES has a Sea Cargo Charter group, LEGS does not.

   THE FIVE RULES THIS FILE OBEYS
   1. NOTHING is hidden unless the user unticks it. When every box is ticked the
      rendered HTML is BYTE-IDENTICAL to what the app produced before this file
      existed. That is deliberate: tools/verify_*.js and the ~504 in-app
      self-tests assert literal substrings of that HTML, so an untouched default
      state means not one test expectation had to be weakened. If you change
      this file, keep that property — see the SHA check in
      tools/verify_edit_columns.js.
   2. It applies ONLY while the full-screen overlay is open (owner's choice when
      asked). colVis()/kpiVis() below both return true whenever ZNFS.open is
      false, so the ordinary REPORTS / LEGS / VOYAGES tabs, the Workspace and
      every download are completely unaffected. Closing full screen restores
      every column with no state to undo.
   3. It does NOT change any calculation. Hiding a column removes a <td>; the
      engine (computeAll) is never consulted about visibility, and the TOTAL row
      still sums the same underlying numbers. Hiding the EU ETS card does not
      stop EU ETS being computed.
   4. It stores its state under its OWN localStorage key, `emcalc_cols` — NOT
      inside `emcalc_state`. Column choices are a screen preference, not
      workspace data; putting them in emcalc_state would carry them into saved
      workspaces and put the "older saved workspaces must still load" guarantee
      at risk for no benefit.
   5. It does not edit js/engine.js and touches js/ui.js as little as possible —
      ui.js calls out to trColVis() (a four-line helper added there) and nothing
      else. Everything else lives here.

   PHASE 2 — NOT DONE YET (owner agreed to split the work, 2026-07-30):
   LEGS and VOYAGES are CSS grids, not <table>s: every cell carries a hardcoded
   `grid-column:N` / `grid-row:1 / span N`, and the track lists BR_GRID / VW_GRID
   are fixed 20-column strings. Hiding a column there needs a renderer-level
   column REMAPPER (renumber every index, rebuild the track string), which is a
   much larger change than REPORTS needed. EMCOLS_DEFS below already carries the
   LEGS and VOYAGES group/column definitions so the panel can list them, but
   they are marked `phase2:true` and render as disabled rows with an explanatory
   note rather than pretending to work.
   ============================================================================ */

var EMCOLS_KEY = "emcalc_cols";

/* ---------------------------------------------------------------- the model */
/* KPI cards, in the order they render in znfsRenderKpis().

   2026-07-30m (Aurvin, owner instruction) — TWO CHANGES to the 07-30i list:
   (a) the "scc" (Sea Cargo Charter) entry was REMOVED, because the SCC card and
       its drawer were deleted this session at the owner's instruction. The SCC
       TABLE columns and engine.js's R.scc are untouched and still work.
   (b) only "cii" is `locked` now. The 07-30i decision locked cii + fueleu + ets;
       the owner reversed it so the view can be taken all the way down to the one
       IMO card. Every card still starts TICKED — `locked:false` controls whether
       it CAN be unticked, not whether it starts on (see kpiVis(): a key that has
       never been touched is absent from EMCOLS.kpi and therefore visible).
   If a decision here is ever reversed again, flip `locked` and nothing else needs
   to change — the panel and kpiVis() both read this one list. */
var EMCOLS_KPIS = [
  { key:"cii",    label:"IMO — CII",         locked:true  },
  { key:"fueleu", label:"FuelEU Maritime",   locked:false },
  { key:"ets",    label:"EU ETS",            locked:false },
  { key:"ukets",  label:"UK ETS",            locked:false }
];

/* Table columns per view. `pinned` is documentation only — those columns are
   never listed and never hideable, per the owner's instruction: everything up
   to and including Dist stays put in all three views.
   Column `key`s are namespaced by view so REPORTS' "EU ETS" eligibility column
   and LEGS' "EU ETS" group can never collide in the saved preferences. */
var EMCOLS_DEFS = {
  trace: {
    label:  "REPORTS",
    pinned: "Event · Condition · Activity · Port · Voyage No · Cargo · Dist",
    groups: [
      { key:"trace.elig", label:"Eligibility", cols:[
          { key:"trace.elig.ets", label:"EU ETS" },
          { key:"trace.elig.feu", label:"FEU"    },
          { key:"trace.elig.uk",  label:"UK ETS" }
      ]},
      /* 2026-07-30k (Aurvin, owner instruction): the "Fuel" NAME column is NOT listed here and
         cannot be unticked — "the FUEL name header should come by default with anything selected
         here". It is a label column, not a figure: a Total/ME/AE reading with no fuel name beside
         it is unreadable. It therefore rides along with whatever else in this group is ticked,
         and disappears only when the whole group is switched off. That derivation lives in
         trColVis() in js/ui.js (see TR_FUEL_SEL there), not in this list. */
      { key:"trace.fuel", label:"Fuel — Consumption & ROB", cols:[
          { key:"trace.fuel.total", label:"Total"  },
          { key:"trace.fuel.me",    label:"ME"     },
          { key:"trace.fuel.ae",    label:"AE"     },
          { key:"trace.fuel.blr",   label:"Boiler" },
          { key:"trace.fuel.oth",   label:"Others" },
          { key:"trace.fuel.rob",   label:"ROB"    }
      ]}
    ]
  },
  /* ---- phase 2 (listed, not yet wired — see the header note) ---- */
  calcs: {
    label:  "LEGS",
    pinned: "Activity & timeframe · Voyage No · Cargo · Dist",
    phase2: true,
    groups: [
      { key:"calcs.elig", label:"Eligibility", cols:[
          { key:"calcs.elig.ets", label:"EU ETS" },
          { key:"calcs.elig.feu", label:"FEU"    },
          { key:"calcs.elig.uk",  label:"UK ETS" }
      ]},
      { key:"calcs.imo", label:"IMO", cols:[
          { key:"calcs.imo.cii",  label:"CII / Performance" },
          { key:"calcs.imo.eeoi", label:"EEOI"              }
      ]},
      /* 2026-07-30k: "Fuel type" is omitted for the same reason as REPORTS' "Fuel" — it is the
         label for the figures beside it, not a figure. Phase 2 must apply the same derivation. */
      { key:"calcs.fm", label:"Fuel metrics", cols:[
          { key:"calcs.fm.cons",  label:"Cons."     },
          { key:"calcs.fm.co2e",  label:"Total CO₂e" }
      ]},
      { key:"calcs.euets", label:"EU ETS", cols:[
          { key:"calcs.euets.euas", label:"EUAs" }
      ]},
      { key:"calcs.ukets", label:"UK ETS", cols:[
          { key:"calcs.ukets.ukas", label:"UKAs" }
      ]},
      { key:"calcs.feu", label:"FuelEU Maritime", cols:[
          { key:"calcs.feu.elig",   label:"Elig."        },
          { key:"calcs.feu.energy", label:"Energy"       },
          { key:"calcs.feu.eelig",  label:"Elig. energy" },
          { key:"calcs.feu.cb",     label:"CB"           },
          { key:"calcs.feu.pen",    label:"Penalty"      }
      ]}
    ]
  },
  voy: {
    label:  "VOYAGES",
    pinned: "Voyage & timeframe · Voyage No · Dist",
    phase2: true,
    groups: [
      { key:"voy.imo", label:"IMO", cols:[
          { key:"voy.imo.cii",  label:"CII / Performance" },
          { key:"voy.imo.eeoi", label:"EEOI"              }
      ]},
      { key:"voy.fm", label:"Fuel metrics", cols:[   /* "Fuel type" omitted — see calcs.fm above */
          { key:"voy.fm.cons", label:"Cons."      },
          { key:"voy.fm.co2e", label:"Total CO₂e" }
      ]},
      { key:"voy.scc", label:"Sea Cargo Charter", cols:[
          { key:"voy.scc.cargo", label:"Cargo"          },
          { key:"voy.scc.tw",    label:"Transport work" },
          { key:"voy.scc.ttw",   label:"TtW CO₂e"       },
          { key:"voy.scc.wtw",   label:"WtW CO₂e"       }
      ]},
      { key:"voy.euets", label:"EU ETS", cols:[
          { key:"voy.euets.euas", label:"EUAs" }
      ]},
      { key:"voy.ukets", label:"UK ETS", cols:[
          { key:"voy.ukets.ukas", label:"UKAs" }
      ]},
      { key:"voy.feu", label:"FuelEU Maritime", cols:[
          { key:"voy.feu.elig",   label:"Elig."        },
          { key:"voy.feu.energy", label:"Energy"       },
          { key:"voy.feu.eelig",  label:"Elig. energy" },
          { key:"voy.feu.cb",     label:"CB"           },
          { key:"voy.feu.pen",    label:"Penalty"      }
      ]}
    ]
  }
};

/* The saved state. Only entries that are explicitly FALSE mean anything —
   an absent key is "visible", so a preferences blob written by an older build
   (or a future one that adds columns) degrades to "show everything", never to
   "hide something the user never asked to hide". */
var EMCOLS = { open:false, kpi:{}, cols:{} };

function emcolsLoad(){
  try{
    var raw = localStorage.getItem(EMCOLS_KEY);
    if(!raw) return;
    var o = JSON.parse(raw);
    if(o && typeof o === "object"){
      if(o.kpi  && typeof o.kpi  === "object") EMCOLS.kpi  = o.kpi;
      if(o.cols && typeof o.cols === "object") EMCOLS.cols = o.cols;
    }
  }catch(e){ /* corrupt or unavailable storage: fall back to "show everything" */ }
}
function emcolsSave(){
  try{ localStorage.setItem(EMCOLS_KEY, JSON.stringify({ kpi:EMCOLS.kpi, cols:EMCOLS.cols })); }
  catch(e){ /* private mode / quota: the session still works, it just will not persist */ }
}
emcolsLoad();

/* --------------------------------------------------------- the two questions */
/* Both deliberately answer "visible" when the overlay is closed — rule 2 above.
   They are the ONLY entry points the rest of the app uses. */
function kpiVis(key){
  for(var i=0;i<EMCOLS_KPIS.length;i++){
    if(EMCOLS_KPIS[i].key === key && EMCOLS_KPIS[i].locked) return true;
  }
  if(typeof ZNFS === "undefined" || !ZNFS || !ZNFS.open) return true;
  return EMCOLS.kpi[key] !== false;
}
function colVis(key){
  if(typeof ZNFS === "undefined" || !ZNFS || !ZNFS.open) return true;
  return EMCOLS.cols[key] !== false;
}

/* ------------------------------------------------------------- the button */
/* Rendered into the full-screen tab row by znfsFilterHtml(). Kept here rather
   than inline in fullscreen.js so the whole feature is in one file. */
function emcolsButtonHtml(){
  var n = emcolsHiddenCount();
  /* 2026-07-30k: the "on" class is baked in here rather than added to the live node, because
     znfsRenderTabbar() rewrites this whole row on every repaint — a class set on the old node
     would vanish with it, and the button would stop looking pressed while its panel was open. */
  return '<button class="emcols-btn' + (EMCOLS.open ? " on" : "") + '" type="button" ' +
    'title="Choose which regulation KPI cards and which table columns this full-screen view shows. ' +
    'Applies to the full-screen view only — the ordinary tabs and every download keep all columns." ' +
    'aria-haspopup="dialog" onclick="emcolsToggle()">' +
    '<span class="ic" aria-hidden="true">▦</span>Edit columns' +
    (n ? '<span class="badge">' + n + '</span>' : "") +
    '</button>';
}
/* how many things the user has currently turned off — shown as a small count on
   the button so a hidden column can never be silently forgotten about. */
function emcolsHiddenCount(){
  var n = 0, i;
  for(i=0;i<EMCOLS_KPIS.length;i++){
    if(!EMCOLS_KPIS[i].locked && EMCOLS.kpi[EMCOLS_KPIS[i].key] === false) n++;
  }
  var def = EMCOLS_DEFS[(typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace"];
  if(def) def.groups.forEach(function(g){
    g.cols.forEach(function(c){ if(EMCOLS.cols[c.key] === false) n++; });
  });
  return n;
}

/* --------------------------------------------------------------- the panel */
function emcolsBuild(){
  if(document.getElementById("emcols")) return;
  var d = document.createElement("div");
  d.id = "emcols";
  d.className = "noprint";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-label", "Edit columns");
  /* 2026-07-30j (Aurvin, owner instruction): centred floating panel, no dimmed backdrop, capped
     height, and a footer carrying "N of M shown · Show all · Reset" — the four layout answers
     given after the 30i version scrolled sideways. The scope reminder that used to live in the
     footer moved into the header subtitle, where it costs no vertical space in the list. */
  d.innerHTML =
    '<div class="emc-box">' +
      '<div class="emc-head">' +
        '<div class="emc-headrow">' +
          '<b>Edit columns</b>' +
          '<button class="emc-close" type="button" title="Close (Escape)" onclick="emcolsClose()">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="emc-body" id="emcols-body"></div>' +
      '<div class="emc-foot" id="emcols-foot"></div>' +
    '</div>';
  /* a click anywhere outside the panel closes it. The catcher is transparent (owner's choice),
     so this is the only thing making the click-away work. */
  d.addEventListener("click", function(ev){
    if(ev.target === d) emcolsClose();
  });
  document.body.appendChild(d);
}

function emcolsRow(key, label, on, locked, disabled, cls){
  var id = "emc-" + key.replace(/[^a-z0-9]+/gi, "-");
  var lockTip = locked
    ? ' title="Always shown — IMO, FuelEU and EU ETS are the three the owner fixed as permanent."'
    : (disabled ? ' title="Listed for reference. Column picking is not wired up for this view yet — REPORTS first, LEGS and VOYAGES next."' : "");
  return '<label class="emc-row' + (cls ? " " + cls : "") +
    ((locked || disabled) ? " off" : "") + '" for="' + id + '"' + lockTip + '>' +
    '<input type="checkbox" id="' + id + '"' +
      (on ? " checked" : "") + ((locked || disabled) ? " disabled" : "") +
      ' onchange="' + (cls === "emc-grp" ? "emcolsToggleGroup" : (cls === "emc-kpi" ? "emcolsToggleKpi" : "emcolsToggleCol")) +
      '(\'' + key + '\', this.checked)">' +
    '<span class="tx">' + label + '</span>' +
    (locked ? '<span class="lock" aria-label="always shown">🔒</span>' : "") +
    '</label>';
}

/* a section heading with the ⓘ that now carries what used to be a paragraph of body text
   (2026-07-30j, owner's choice — it was costing about a third of the panel's height) */
function emcolsSecHead(label, tip){
  return '<div class="emc-sech"><span>' + label + '</span>' +
    (tip ? '<i class="emc-i" title="' + tip.replace(/"/g,"&quot;") + '">i</i>' : "") + '</div>';
}

function emcolsRender(){
  emcolsBuild();
  var body = document.getElementById("emcols-body"); if(!body) return;
  var view = (typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace";
  var def  = EMCOLS_DEFS[view] || EMCOLS_DEFS.trace;

  var h = '<div class="emc-sec">' +
    emcolsSecHead("Regulation KPI cards",
      "IMO — CII, FuelEU Maritime and EU ETS are permanently shown and cannot be turned off. " +
      "Unticking a card hides the CARD only — the regulation is still calculated in full, and " +
      "its table columns are listed separately below.") +
    EMCOLS_KPIS.map(function(k){
      return emcolsRow(k.key, k.label, k.locked ? true : (EMCOLS.kpi[k.key] !== false), k.locked, false, "emc-kpi");
    }).join("") +
    '</div>';

  h += '<div class="emc-sec">' +
    emcolsSecHead("Table columns — " + def.label,
      "Always shown, and so not listed here: " + def.pinned + ". " +
      "The fuel NAME column is also not listed: it is the label for the figures beside it, so it " +
      "appears whenever anything in its group is ticked and disappears only when the whole group " +
      "is switched off. " +
      "Ticking or unticking a group heading sets every column beneath it.");

  h += def.groups.map(function(g){
    var vis = g.cols.filter(function(c){ return EMCOLS.cols[c.key] !== false; }).length;
    return '<div class="emc-grpwrap">' +
      emcolsRow(g.key, g.label, vis > 0, false, !!def.phase2, "emc-grp") +
      g.cols.map(function(c){
        return emcolsRow(c.key, c.label, EMCOLS.cols[c.key] !== false, false, !!def.phase2, "emc-col");
      }).join("") +
      '</div>';
  }).join("");

  h += '</div>';
  body.innerHTML = h;
  emcolsRenderFoot();
}

/* Footer: "N of M shown · Show all · Reset", mirroring the reference product (2026-07-30j).
   M counts everything the panel lists for the current view — the five KPI cards plus that
   view's selectable columns — because that is exactly the set of ticks the user can see. */
function emcolsTally(){
  var view = (typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace";
  var def  = EMCOLS_DEFS[view] || EMCOLS_DEFS.trace;
  var total = 0, shown = 0;
  EMCOLS_KPIS.forEach(function(k){
    total++;
    if(k.locked || EMCOLS.kpi[k.key] !== false) shown++;
  });
  def.groups.forEach(function(g){
    g.cols.forEach(function(c){
      total++;
      if(EMCOLS.cols[c.key] !== false) shown++;
    });
  });
  return { total:total, shown:shown };
}
function emcolsRenderFoot(){
  var el = document.getElementById("emcols-foot"); if(!el) return;
  var t = emcolsTally();
  var allOn = (t.shown === t.total);
  el.innerHTML =
    '<span class="emc-count">' + t.shown + ' of ' + t.total + ' shown</span>' +
    '<button class="emc-link" type="button"' + (allOn ? " disabled" : "") +
      ' title="Tick everything in this panel" onclick="emcolsShowAll()">Show all</button>' +
    '<button class="emc-link" type="button" title="Back to the starting selection: all four cards and every column"' +
      ' onclick="emcolsReset()">Reset</button>';
}
/* "Show all" and "Reset" do the same thing today, because the default IS everything visible.
   They are kept separate on purpose: if a future default ever hides something, Show all must
   still mean "show me everything" and Reset must still mean "back to the default". */
function emcolsShowAll(){
  var view = (typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace";
  var def  = EMCOLS_DEFS[view] || EMCOLS_DEFS.trace;
  EMCOLS_KPIS.forEach(function(k){ EMCOLS.kpi[k.key] = true; });
  def.groups.forEach(function(g){ g.cols.forEach(function(c){ EMCOLS.cols[c.key] = true; }); });
  emcolsSave();
  emcolsRepaint();
}

/* ------------------------------------------------------------ open / close */
function emcolsToggle(){ if(EMCOLS.open) emcolsClose(); else emcolsOpen(); }

/* 2026-07-30k (Aurvin, owner instruction): "instead of the pop-up coming to the center of the
   screen, it should come to the left of the Edit column near that Edit column button itself."
   The button sits at the RIGHT-hand end of the full-screen tab row, so the panel hangs just
   below it and is RIGHT-ALIGNED to it — i.e. it opens leftwards, into the space that is
   actually free, instead of off the edge of the window.
   This has to be done in JavaScript: the button's position depends on the width of the From/To
   controls beside it, which changes with the date format and the browser's own datetime-local
   widget, so no fixed CSS offset can be correct. Everything here is measurement and clamping —
   there is no state, so it is safe to call as often as needed (open, resize, scroll). */
function emcolsPosition(){
  var d = document.getElementById("emcols"); if(!d) return;
  var box = d.querySelector(".emc-box"); if(!box) return;
  var btn = document.querySelector(".emcols-btn");
  var GAP = 6;      // breathing space between the button and the panel
  var EDGE = 12;    // never come closer than this to the window edge

  if(!btn || !btn.getBoundingClientRect){
    /* no button to anchor to (the overlay is closed, or this was opened from a test) —
       leave the stylesheet's fallback top/right in place rather than guessing */
    box.style.top = ""; box.style.right = ""; box.style.maxHeight = "";
    return;
  }
  var r = btn.getBoundingClientRect();
  var vw = window.innerWidth || document.documentElement.clientWidth;
  var vh = window.innerHeight || document.documentElement.clientHeight;

  /* RIGHT edge of the panel lines up with the right edge of the button, so the panel extends
     to the LEFT. Clamped so a narrow window cannot push it off either side. */
  var right = Math.max(EDGE, vw - r.right);
  var width = Math.min(370, vw - EDGE * 2);
  if(vw - right - width < EDGE) right = Math.max(EDGE, vw - width - EDGE);

  var top = r.bottom + GAP;
  /* how much room is left below the button. If the panel would run off the bottom, shrink it
     rather than let it overflow — and if there is genuinely very little room down there, flip
     it ABOVE the button instead, which is what a picker at the bottom of a tall table needs. */
  var below = vh - top - EDGE;
  var above = r.top - GAP - EDGE;
  var flip  = (below < 260 && above > below);
  var avail = flip ? above : below;
  var h = Math.max(180, Math.min(560, avail));

  box.style.right = right + "px";
  box.style.maxHeight = h + "px";
  box.style.top = (flip ? Math.max(EDGE, r.top - GAP - h) : top) + "px";
  box.style.transformOrigin = flip ? "bottom right" : "top right";
}

function emcolsOpen(){
  emcolsBuild();
  emcolsRender();
  EMCOLS.open = true;
  var d = document.getElementById("emcols");
  d.classList.add("on");
  emcolsPosition();                       // must run AFTER .on — a display:none box measures 0
  var b = document.querySelector(".emcols-btn");
  if(b) b.classList.add("on");
  /* .in on the NEXT frame so the transition actually runs — same two-class pattern (and same
     reason) as #znfs-regdrawer, see css/styles.css. */
  requestAnimationFrame(function(){ d.classList.add("in"); });
}

function emcolsClose(){
  var d = document.getElementById("emcols");
  EMCOLS.open = false;
  var b = document.querySelector(".emcols-btn");
  if(b) b.classList.remove("on");
  if(!d) return;
  d.classList.remove("in");
  setTimeout(function(){ if(!EMCOLS.open) d.classList.remove("on"); }, 200);
  if(b) try{ b.focus(); }catch(e){}
}

/* An anchored panel is only anchored until something moves. Re-measure on resize and on any
   scroll (capture phase, so it catches the full-screen view's own inner scrollers, not just the
   window). Cheap: emcolsPosition() is measurement and arithmetic, and it does nothing at all
   while the panel is closed. */
["resize","scroll"].forEach(function(evt){
  window.addEventListener(evt, function(){ if(EMCOLS.open) emcolsPosition(); }, true);
});

/* ------------------------------------------------------------- the toggles */
function emcolsToggleKpi(key, on){
  for(var i=0;i<EMCOLS_KPIS.length;i++){
    if(EMCOLS_KPIS[i].key === key && EMCOLS_KPIS[i].locked) return;   // locked: ignore
  }
  EMCOLS.kpi[key] = !!on;
  emcolsSave();
  emcolsRepaint();
}
function emcolsToggleCol(key, on){
  EMCOLS.cols[key] = !!on;
  emcolsSave();
  emcolsRepaint();
}
/* a group checkbox sets every column beneath it */
function emcolsToggleGroup(gkey, on){
  var view = (typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace";
  var def  = EMCOLS_DEFS[view] || EMCOLS_DEFS.trace;
  def.groups.forEach(function(g){
    if(g.key !== gkey) return;
    g.cols.forEach(function(c){ EMCOLS.cols[c.key] = !!on; });
  });
  emcolsSave();
  emcolsRepaint();
}
function emcolsReset(){
  EMCOLS.kpi = {};
  EMCOLS.cols = {};
  emcolsSave();
  emcolsRepaint();
}

/* Repaint everything the choice can affect: the active table panel, the KPI row,
   the tab row (it carries the button and its count badge) and the relocated
   Download/ⓘ node, then the panel itself so its checkboxes match the new state.
   Order matters and mirrors znfsTab(): panel first, tab row after it, extras last. */
function emcolsRepaint(){
  if(typeof ZNFS === "undefined" || !ZNFS || !ZNFS.open){ emcolsRender(); return; }
  var t = ZNFS_TABS.filter(function(x){ return x.id === ZNFS.tab; })[0];
  if(t) try{ t.render(); }catch(e){}
  try{ znfsRenderKpis();   }catch(e){}
  try{ znfsRenderTabbar(); }catch(e){}
  try{ znfsMountExtras();  }catch(e){}
  emcolsRender();
  /* 2026-07-30k: znfsRenderTabbar() above rebuilt the row the panel is anchored to, and the
     count badge can change the button's width — so the anchor has to be re-measured, or the
     panel drifts away from its button as you tick things. */
  if(EMCOLS.open) emcolsPosition();
}

/* Escape closes the panel. Registered on document because the panel is a child
   of <body>, not of #znfs — same arrangement as the regulation drawer. Runs in
   the CAPTURE phase and stops propagation so Escape closes THIS panel without
   also closing the whole full-screen overlay underneath it. */
document.addEventListener("keydown", function(ev){
  if(ev.key === "Escape" && EMCOLS.open){ ev.stopPropagation(); emcolsClose(); }
}, true);

/* When full screen closes, the panel must go with it (it is a child of <body>,
   so hiding the overlay would leave it floating over the ordinary calculator —
   exactly the bug znfsClose() already handles for the two trend popups and the
   regulation drawer). Wrapping rather than editing fullscreen.js keeps this
   whole feature in one file, the same technique fullscreen.js itself uses on
   dfRepaint / renderLive. */
if(typeof znfsClose === "function"){
  var _emcolsPrevClose = znfsClose;
  znfsClose = function(){
    if(EMCOLS.open) emcolsClose();
    return _emcolsPrevClose.apply(this, arguments);
  };
}
