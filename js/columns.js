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
        not. Both LEGS and VOYAGES have a Sea Cargo Charter group, but they are
        NOT the same group: VOYAGES' has 5 columns and is on by default; LEGS'
        has 4 (no Cargo — that table has its own pinned Cargo column) and is OFF
        by default, added 2026-08-06. See EMCOLS_DEFAULT_OFF below.

   THE FIVE RULES THIS FILE OBEYS
   1. THE DEFAULT STATE RENDERS BYTE-IDENTICAL HTML to what the app produced
      before this file existed. tools/verify_*.js and the ~529 in-app self-tests
      assert literal substrings of that HTML, so an untouched default state means
      not one test expectation had to be weakened. If you change this file, keep
      that property — see the SHA check in tools/verify_edit_columns.js.
      Until 2026-08-06 this rule was stated as "nothing is hidden unless the user
      unticks it", which was the same thing because every column started visible.
      It is no longer the same thing: LEGS' Sea Cargo Charter group starts HIDDEN
      (EMCOLS_DEFAULT_OFF below), precisely BECAUSE the Legs table has not rendered
      those columns since 2026-07-26c — hiding them by default is what keeps the
      byte-identical guarantee, and showing them by default would have broken it.
      The invariant is byte-identity with the historical output, not "all ticked".
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
  /* ---- LEGS / VOYAGES ----
     2026-08-01c (Aurvin, owner instruction): the four REGULATION groups — EU ETS, UK ETS,
     FuelEU Maritime and (VOYAGES only) Sea Cargo Charter — are now WIRED UP and hideable,
     down to the individual column, in both of these grid views. The owner's four answers
     this session: (1) only these four groups, not Eligibility / IMO / Fuel metrics;
     (2) group heading AND individual sub-columns; (3) KPI cards and table columns stay
     INDEPENDENT of each other, as decided on 2026-07-30i; (4) surviving columns stretch to
     fill the width freed by a hidden one.
     `phase2` therefore moved from the VIEW to the GROUP — the three groups that are still
     unwired carry `phase2:true` and keep rendering as greyed rows with the explanatory
     tooltip; the four regulation groups do not, and are live. The renderer side is
     `emcPlan()` in js/ui.js (which reads colVis() for exactly the keys listed here) plus the
     EMC_LEGS_COLS / EMC_VOY_COLS key→physical-column maps beside it. If a group is ever
     unlocked or locked again, change `phase2` here AND its entry in that map — those two
     lists are the whole contract. */
  calcs: {
    label:  "LEGS",
    pinned: "Activity & timeframe · Voyage No · Cargo · Dist",
    groups: [
      { key:"calcs.elig", label:"Eligibility", phase2:true, cols:[
          { key:"calcs.elig.ets", label:"EU ETS" },
          { key:"calcs.elig.feu", label:"FEU"    },
          { key:"calcs.elig.uk",  label:"UK ETS" }
      ]},
      { key:"calcs.imo", label:"IMO", phase2:true, cols:[
          { key:"calcs.imo.cii",  label:"CII / Performance" },
          /* 2026-08-01f (Aurvin, owner instruction — unrelated to the VOYAGES SCC merge below,
             fixed while in this file): a separate earlier change made LEGS' own on-screen
             "EEOI" column show kg/nm instead — this placeholder row's LABEL is renamed to match,
             so the disabled picker entry no longer describes a figure the table doesn't render.
             Still phase2:true, still disabled, still not wired to anything — label only. */
          { key:"calcs.imo.eeoi", label:"kg/nm"              }
      ]},
      /* 2026-07-30k: "Fuel type" is omitted for the same reason as REPORTS' "Fuel" — it is the
         label for the figures beside it, not a figure. Phase 2 must apply the same derivation. */
      { key:"calcs.fm", label:"Fuel metrics", phase2:true, cols:[
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
      ]},
      /* 2026-08-06 (Aurvin, owner instruction) — SEA CARGO CHARTER RETURNS TO LEGS, OFF BY
         DEFAULT. This group was DELETED from the Legs table on 2026-07-26c at the owner's own
         instruction (its Cargo column became the standalone column 4 that is still there). The
         owner has now asked for it back, but on three explicit conditions given this session:
           (1) it is NOT shown by default — the user must tick it on in this panel;
           (2) it sits at the FAR RIGHT of the table, after FuelEU (physical columns 21-24) —
               hence last in this list too, so the panel reads in the table's own order;
           (3) Cargo is NOT one of its columns. Legs already has a standalone Cargo column
               (physical 4, "pinned" above) and two identical Cargo columns on one row is
               exactly the duplication 2026-07-26c removed. Voyages keeps its 5-column SCC
               group (voy.scc, with Cargo) because that table has no standalone Cargo column.
         The four keys below are ALL listed in EMCOLS_DEFAULT_OFF and must stay in step with
         EMC_LEGS_SCC_COLS in js/ui.js — key, order and physical column number. Three lists,
         one contract, same as EMC_LEGS_COLS / EMC_VOY_COLS.
         Not `phase2` — this group is fully wired (renderer: emcPlan()'s `optional` argument). */
      { key:"calcs.scc", label:"Sea Cargo Charter", cols:[
          { key:"calcs.scc.wtw",     label:"WtW CO₂e"   },
          { key:"calcs.scc.tw",      label:"T-Work"     },
          { key:"calcs.scc.eeoi",    label:"EEOI (WtW)" },
          { key:"calcs.scc.eeoiImo", label:"EEOI (IMO)" }
      ]}
    ]
  },
  voy: {
    label:  "VOYAGES",
    pinned: "Voyage & timeframe · Voyage No · Dist",
    groups: [
      { key:"voy.imo", label:"IMO", phase2:true, cols:[
          { key:"voy.imo.cii",  label:"CII / Performance" },
          /* 2026-08-01f (Aurvin, owner instruction — unrelated to the Sea Cargo Charter merge
             below, fixed while in this file): a separate earlier change made VOYAGES' own
             on-screen "EEOI" column (physical 6) show kg/nm instead — this placeholder row's
             LABEL is renamed to match. Do NOT confuse this with voy.scc.eeoiImo below, a
             DIFFERENT row about a DIFFERENT column (physical 14, now hideable). Still
             phase2:true, still disabled, still not wired to anything — label only. */
          { key:"voy.imo.eeoi", label:"kg/nm"              }
      ]},
      { key:"voy.fm", label:"Fuel metrics", phase2:true, cols:[   /* "Fuel type" omitted — see calcs.fm above */
          { key:"voy.fm.cons", label:"Cons."      },
          { key:"voy.fm.co2e", label:"Total CO₂e" }
      ]},
      /* 2026-08-01c — THIS LIST WAS WRONG and is corrected here, found while wiring the group
         up. It claimed a "TtW CO₂e" column that the table has NOT rendered since 2026-07-26
         (owner removed it from both grid views; it survives only in the Excel export), and it
         omitted the SCC "EEOI" column that IS rendered. Left as it was, unticking "TtW CO₂e"
         would have hidden nothing and the SCC EEOI could never have been hidden at all. Now
         listed in the table's own left-to-right order — WtW, Cargo, T-Work, EEOI — matching
         voyageGrid()'s columns 10-13 exactly. The EEOI label is qualified "(WtW)" because
         this table carries TWO EEOI columns and the other one is in the IMO group: this is
         the Sea Cargo Charter well-to-wake AR6 figure with ballast carry-in, NOT the IMO
         tank-to-wake CO₂-only one. */
      /* 2026-08-01f (Aurvin, owner instruction — screenshot review): a 5th column,
         voy.scc.eeoiImo ("EEOI (IMO)"), joined this group. It used to be a separate,
         untinted, UNHIDEABLE column (physical 14, right after this group) with its own
         standalone header tag — the owner asked for it to be merged visually into the tan
         Sea Cargo Charter tag and made genuinely hideable, like its 4 neighbours. This key
         MUST match EMC_VOY_COLS's "voy.scc.eeoiImo" entry in js/ui.js exactly, or the picker
         checkbox controls nothing. "EEOI (WtW)" below is left as-is — it already
         distinguishes itself from this new "EEOI (IMO)" neighbour. */
      { key:"voy.scc", label:"Sea Cargo Charter", cols:[
          { key:"voy.scc.wtw",     label:"WtW CO₂e"       },
          { key:"voy.scc.cargo",   label:"Cargo"          },
          { key:"voy.scc.tw",      label:"Transport work" },
          { key:"voy.scc.eeoi",    label:"EEOI (WtW)"     },
          { key:"voy.scc.eeoiImo", label:"EEOI (IMO)"     }
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

/* --------------------------------------------------- DEFAULT-OFF COLUMNS
   2026-08-06 (Aurvin, owner instruction) — the FIRST columns in this app that
   start HIDDEN. Every other column in EMCOLS_DEFS starts visible and an absent
   preference means "show it" (rule 1 at the top of this file). For a key listed
   here the polarity is inverted: an absent preference means "hide it", and only
   an explicit `true` turns it on.

   WHY THIS DOES NOT BREAK RULE 1 (byte-identical default output). Rule 1 says
   the default state must render exactly what the app rendered before this file
   existed. The Legs table has had NO Sea Cargo Charter columns since 2026-07-26c,
   so "hidden by default" IS the historical output — byte for byte. If these
   columns had been added visible-by-default instead, every one of the ~529
   self-tests and both verify_grid_columns.js baseline checks would have had to be
   re-baselined. This is the safer polarity, not just the owner's preference.

   WHY colVis() CHECKS THIS BEFORE THE ZNFS.open EARLY-RETURN. Rule 2 makes column
   hiding a full-screen-only feature: colVis() returns true on the ordinary tabs no
   matter what. A default-off column that inherited that would be permanently
   VISIBLE on the ordinary Legs tab — the exact opposite of the instruction. The
   owner's answer this session was "full-screen only, default off there; never on
   the normal Legs tab", so these keys return FALSE when the overlay is closed.
   Net effect on the ordinary tabs, the Workspace and every download: unchanged —
   they never showed these columns and still never do.

   Keys must match EMC_LEGS_SCC_COLS in js/ui.js exactly. */
var EMCOLS_DEFAULT_OFF = {
  "calcs.scc.wtw":     true,
  "calcs.scc.tw":      true,
  "calcs.scc.eeoi":    true,
  "calcs.scc.eeoiImo": true
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
/* 2026-08-06: is this column ticked in the PANEL? Default-off keys need an explicit
   `true`; every other key is on unless explicitly `false`. This is the checkbox
   state only — it says nothing about the full-screen scope rule, which is colVis()'s
   job. Used by the panel, the tally and the hidden-count badge so all three agree. */
function emcolsColOn(key){
  return EMCOLS_DEFAULT_OFF[key] ? (EMCOLS.cols[key] === true)
                                 : (EMCOLS.cols[key] !== false);
}
function colVis(key){
  /* 2026-08-06 (Aurvin, owner instruction): default-off columns are checked BEFORE the
     full-screen early-return below, so they stay hidden on the ordinary tabs instead of
     inheriting rule 2's unconditional `true`. See EMCOLS_DEFAULT_OFF for the reasoning. */
  if(EMCOLS_DEFAULT_OFF[key]){
    if(typeof ZNFS === "undefined" || !ZNFS || !ZNFS.open) return false;
    return EMCOLS.cols[key] === true;
  }
  if(typeof ZNFS === "undefined" || !ZNFS || !ZNFS.open) return true;
  return EMCOLS.cols[key] !== false;
}

/* ------------------------------------------------------------- the button */
/* Rendered into the full-screen tab row by znfsFilterHtml(). Kept here rather
   than inline in fullscreen.js so the whole feature is in one file. */
function emcolsButtonHtml(){
  /* 2026-08-06e (Aurvin, owner instruction): the numeric badge is REMOVED. "No need to show the
     number in the edit column. People will get used to it if they don't see the KPI column."

     WHAT THE BADGE WAS FOR, so the trade-off is on the record rather than rediscovered: it was
     the only cue that a column was hidden. The owner's reasoning holds for the normal case — the
     picker applies to the FULL-SCREEN view only, so the missing card or column is right there in
     front of you and the count is redundant. The case it covered is the slow one: EMCOLS persists
     to localStorage under `emcalc_cols`, so a choice made weeks ago survives, and someone opening
     full screen much later now has nothing on the button telling them why a KPI card is absent.
     The picker itself still shows every unticked box, so the information is one click away, and
     emcolsHiddenCount() is KEPT (unused by this function) if the cue is ever wanted back.

     2026-07-30k: the "on" class is baked in here rather than added to the live node, because
     znfsRenderTabbar() rewrites this whole row on every repaint — a class set on the old node
     would vanish with it, and the button would stop looking pressed while its panel was open. */
  return '<button class="emcols-btn' + (EMCOLS.open ? " on" : "") + '" type="button" ' +
    'title="Choose which regulation KPI cards and which table columns this full-screen view shows. ' +
    'Applies to the full-screen view only — the ordinary tabs and every download keep all columns." ' +
    'aria-haspopup="dialog" onclick="emcolsToggle()">' +
    '<span class="ic" aria-hidden="true">▦</span>Edit columns' +
    '</button>';
}
/* how many things the user has currently turned off. 2026-08-06e: NO LONGER RENDERED — the owner
   removed the count badge from the button (see emcolsButtonHtml). Kept, and kept correct, because
   it is the only implementation of "what has the user turned off" and reinstating the cue should
   not mean rewriting it. Do not delete it as dead code without reading that note first. */
function emcolsHiddenCount(){
  var n = 0, i;
  for(i=0;i<EMCOLS_KPIS.length;i++){
    if(!EMCOLS_KPIS[i].locked && EMCOLS.kpi[EMCOLS_KPIS[i].key] === false) n++;
  }
  var def = EMCOLS_DEFS[(typeof ZNFS !== "undefined" && ZNFS && ZNFS.tab) || "trace"];
  /* 2026-08-06: default-off columns are deliberately NOT counted here. This badge means
     "N things YOU turned off"; a column that starts off and was never touched is the
     default, not a user choice, and counting it would put a permanent "4" on the button
     on LEGS and train the owner to ignore the badge. `=== false` (not !emcolsColOn) is
     therefore kept on purpose — a default-off column only counts once it has been ticked
     on and then off again, which IS a user choice. */
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
    : (disabled ? ' title="Listed for reference. Column picking is not wired up for this group yet — the four regulation groups (EU ETS, UK ETS, FuelEU Maritime and, on VOYAGES, Sea Cargo Charter) are live; Eligibility, IMO and Fuel metrics are next."' : "");
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

  /* 2026-08-01c: `phase2` is read off the GROUP now, not the view — the four regulation
     groups are wired and interactive while Eligibility / IMO / Fuel metrics stay greyed.
     `def.phase2` is still ORed in so that if a whole view is ever parked again, one flag at
     the view level still disables all of its groups. */
  /* 2026-08-06: both tick states go through emcolsColOn() so a default-off column renders
     UNTICKED on first open (its key is absent from EMCOLS.cols, which for every other
     column means "shown"). Without this the Legs Sea Cargo Charter boxes would look ticked
     while the columns were not actually on screen. */
  h += def.groups.map(function(g){
    var vis = g.cols.filter(function(c){ return emcolsColOn(c.key); }).length;
    var off = !!(def.phase2 || g.phase2);
    return '<div class="emc-grpwrap">' +
      emcolsRow(g.key, g.label, vis > 0, false, off, "emc-grp") +
      g.cols.map(function(c){
        return emcolsRow(c.key, c.label, emcolsColOn(c.key), false, off, "emc-col");
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
      if(emcolsColOn(c.key)) shown++;   /* 2026-08-06: default-off aware, see emcolsColOn */
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
/* "Show all" and "Reset" NO LONGER do the same thing (2026-08-06) — the future the previous
   note anticipated has arrived. LEGS' Sea Cargo Charter group is default-OFF, so:
     • Show all writes `true` for every key, INCLUDING the default-off ones → they appear;
     • Reset empties EMCOLS.cols entirely → the default-off ones go back to hidden, every
       other column goes back to shown.
   Both were already written correctly for this (Show all sets true explicitly; Reset clears
   the object rather than writing trues), so neither function needed changing — only this
   note, which used to claim they were equivalent. */
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
