/* ============================================================================================
   js/graph.js — the "📈 Trends" popup on the full-screen Vessel Overview  (2026-07-31, Aurvin)

   NAMING (2026-07-31k, owner instruction): the feature is called TRENDS everywhere the user can
   see it — the button, the popup heading, every tooltip and the ⓘ help. The FILE, the `zng*`
   function prefix, the `zng-*` CSS classes, the element ids and the `.znfs-graphbtn` class all
   still say "graph", by the owner's explicit choice when asked: renaming them would touch
   index.html, build_standalone.py and the whole test suite for zero visible difference. So if you
   are searching for this feature by name, search BOTH words.

   WHAT IT IS
   A stacked-panel bar chart over the SAME reports the REPORTS tab shows: one bar per MDA
   report, panels sharing one X axis, one vertical sync line, and a tooltip in every panel at
   the same time.

   WHY PANELS AND NOT ONE CHART
   Distance is nm, consumption and ROB are mt, eligibility is %. They have no common Y scale,
   so each parameter gets its own panel with its own axis. This is also what makes the
   "tooltips in each parameter zone, all at once" behaviour the owner asked for possible.

   OWNER DECISIONS BAKED IN (2026-07-31 session — do not "fix" these without asking):
     • X axis = ONE BAR PER MDA REPORT (not per calendar day, not per leg). Chosen so this
       chart and the REPORTS table are literally the same list of records — no re-aggregation
       exists that could drift from the table.
     • ROB is drawn as STACKED BARS, by explicit owner instruction, even though ROB is a STOCK
       reading and js/ui.js's own Report-Wise total row refuses to sum it ("ROB is a stock
       reading at each event, not a flow"). The stack HEIGHT is therefore not a physical
       quantity — it is the sum of separate tanks. The panel's tooltip and its ⓘ say so. If a
       future session is asked to "make ROB correct", the answer is a LINE per fuel.
     • Fuel checkboxes filter the consumption panels and ROB ONLY. Distance and Eligibility are
       not per-fuel quantities, so they ignore the fuel ticks. Scope checkboxes filter EVERY
       panel (they select which reports are on the chart at all). Parameter checkboxes decide
       which panels exist at all, and the remaining panels re-space to fill the freed height.
     • Reports that match no workspace row (bunkering/stock reports, year boundaries — the ones
       the REPORTS table shows as "–") are ALWAYS shown and are immune to the scope filter, so
       nothing silently disappears.
     • Panels with no data still render (empty, with a caption) rather than being hidden.

   ARCHITECTURE NOTE — READ BEFORE CHANGING
   Eligibility is NOT recomputed here. It calls js/ui.js's own trCoverage(), the exact function
   the Report-Wise Eligibility badges use, which in turn calls the engine's euCoverage() /
   ukCoverage(). That is deliberate: CLAUDE.md's standing rule is that the two import branches
   must never disagree, and the cheapest way to guarantee this chart agrees with the table is to
   never have a second implementation. Zone classification likewise goes through trMatchRow().
   tools/verify_graph_popup.js asserts the agreement and will fail if anyone forks the logic.

   LAYOUT NOTE (2026-07-31b, owner-reported bugs — read before restructuring the DOM)
   The first cut put every panel AND the date axis inside one tall scrolling box. With eight
   panels that made the whole chart ~1000 px tall, so on a normal screen the date axis sat below
   the fold and looked "missing". The body is now THREE nested regions on purpose:
       .zng-panes   — scrolls VERTICALLY (the panels), axis column and plot locked together
       .zng-xrow    — the date axis, PINNED below the panes so it can never scroll out of view
       .zng-scroll  — scrolls HORIZONTALLY (only once bars would go under 9 px)
   The date axis is its own SVG in .zng-xrow, and its horizontal scroll is mirrored from
   .zng-scroll by zngBindScrollSync(). If you merge these back into one box, the date axis
   disappears again — that is the bug this structure exists to fix.
   ============================================================================================ */

var ZNG = { open:false, fuels:null, zones:null, show:null, hi:-1, data:null, panels:null };

/* ---------------------------------------------------------------- scope buckets */
/* Seven buckets, mutually exclusive, derived from the engine's own coverage numbers via the
   matched workspace row. The owner's original list had five; "Non-EU / Non-UK" was added on
   2026-07-31 (owner instruction) because voyages touching neither region score 0 on both and
   would otherwise fall through every checkbox and vanish without explanation.
   2026-07-31d (owner instruction, second round): "Intra-EU" renamed "EU-EU" to read as a pair
   with the new split below, and the old single "Extra-EU" (one EEA end, 50% in scope) split into
   directional "To-EU" / "From-EU" — the owner wants to see WHICH WAY a half-scope leg is going,
   not just that it is half. Direction comes from the SAME euCoverage() inputs the engine already
   used to decide the 0.5, via zngLegSides() below — not a new calculation, just reading which
   side of the existing 0/0.5/1 call was EEA. Every id here doubles as a key into ZNG_ZONE_COL.
   2026-07-31i (owner instruction, THIRD round — Tasks 1 and 2): both the ORDER and four of the
   LABELS were set by the owner, verbatim. Order: To-EU, At-EU, EU-EU, From-EU, At-UK, UK-UK,
   Non EU/UK. Renames: "At EU berth"→"At-EU", "At UK berth"→"At-UK", "Intra-UK"→"UK-UK",
   "Non-EU / Non-UK"→"Non EU/UK" (so every label now reads as an X-Y pair). THE ids DID NOT
   CHANGE — they are keys into ZNG_ZONE_COL, into ZNG.zones (the tick state), and are what
   zngZoneOf() returns, so renaming an id would silently break the colours and the filters.
   The array order is display-only: everything else looks a zone up BY ID, so re-ordering here
   moves the rail checkboxes and nothing else. */
var ZNG_ZONES = [
  { id:"toEU",   label:"To-EU",      hint:"Sea legs (or non-call stays) arriving INTO an EEA port from outside the EEA — 50% in scope." },
  { id:"atEU",   label:"At-EU",      hint:"Port stays at an EEA port of call (at an EU berth) — 100% in scope." },
  { id:"euEU",   label:"EU-EU",      hint:"Sea legs between two EEA ports — 100% in EU ETS / FuelEU scope." },
  { id:"fromEU", label:"From-EU",    hint:"Sea legs (or non-call stays) departing an EEA port for outside the EEA — 50% in scope." },
  { id:"atUK",   label:"At-UK",      hint:"Port stays at a UK port of call (at a UK berth) — 100% in UK ETS scope." },
  { id:"intraUK",label:"UK-UK",      hint:"Sea legs between two UK ports — 100% in UK ETS scope. There is no 50% band in UK ETS." },
  { id:"none",   label:"Non EU/UK",  hint:"Everything scoring 0% for both regimes. Untick to hide, but note your totals then no longer reconcile." }
];

/* ---------------------------------------------------------------- fuel colours */
/* Keyed on the RAW MDA grade name (the same keys js/ui.js's TR_FUEL_ORDER uses), because that
   is what r.fuels / r.rob / r.mach are keyed on. Anything unrecognised falls back to the grey
   cycle so an unusual grade still gets a stable, distinguishable colour.
   2026-07-31d (owner instruction): fuel colours must never read as the same colour as Distance
   or an Eligibility category. Blue and red are now RESERVED for EU/UK scope (ZNG_ZONE_COL below)
   and Distance/the fallback cycle are a neutral zinc-grey with no blue undertone — so HFO/LFO/
   MGO/MDO moved off blue into a brown/amber "oil" family (still visually grouped with each
   other, just no longer visually grouped with the EU chip), and H2 moved off blue-purple into a
   plain violet clearly apart from both blue (EU) and the M/METH lavender. LNG (teal-green), LPG
   (orange), M/METH+E/ETOH (violet/magenta) and the bio fuels (green) were already clear of
   blue/red and are untouched. MGO and MDO still deliberately share one colour — owner instruction
   from the first colour-palette question this session, unaffected by this broader change. */
var ZNG_FUEL_COL = {
  HFO:"#6b4226", LFO:"#8a5a2b", MGO:"#b98246", MDO:"#b98246",
  LNG:"#4fb59d", LNGDS:"#3f9c86", LNGOS:"#5cc4ac", LNGBSI:"#379180",
  LPGP:"#d79a55", LPGB:"#b8763a",
  M:"#9a7cc0", METH:"#9a7cc0", E:"#c47ea0", ETOH:"#c47ea0",
  BDSL:"#8bab4f", HVO:"#a3c265", BLNG:"#6f9c4a", BMET:"#b6cf7e",
  NH3:"#b0759b", H2:"#5b3fa6"
};
var ZNG_FUEL_FALL = ["#9c8465","#b09b7a","#7d6a4f","#c4b190","#8f7a5c","#a68f6b"];
function zngFuelColour(name, i){ return ZNG_FUEL_COL[name] || ZNG_FUEL_FALL[i % ZNG_FUEL_FALL.length]; }

/* ---------------------------------------------------------------- Distance / Eligibility colours */
/* Distance is blue (2026-07-31e, owner instruction — "it should never be similar with the
   consumption"; the fuel palette above contains no blue at all, so it cannot collide with a fuel).

   2026-07-31h (owner screenshot: the four EU bars were indistinguishable) — WHAT WAS WRONG AND
   THE RULE THAT REPLACES IT.
   07-31d coloured the buckets BY FAMILY: four shades of blue for the EU buckets, two of red for
   the UK ones. Shades of one hue are exactly what the eye cannot separate at 3px bar width, so
   To-EU / From-EU / EU-EU / At-EU-berth all read as "some blue". The family idea was mine and it
   was the wrong call — semantic grouping belongs in the LABEL, not in the hue.
   The rule now: every bucket gets its OWN hue, chosen for maximum separation from the other six
   AND from everything else on the popup. Grouping is carried by the rail's text label and the
   tooltip wording, both of which already name the bucket in full.

   The gamut is genuinely crowded, so here is what each choice had to dodge — do not "tidy" these
   into a nicer-looking ramp without re-checking all of it:
     • blue          → Distance (#2563eb). No bucket may be blue.
     • brown/amber   → HFO / LFO / MGO / MDO / LPG, and the unknown-grade fallback tans.
     • teal-green    → the LNG family.
     • yellow-green  → the bio fuels (BDSL / HVO / BLNG / BMET).
     • violet/purple → M / METH and H2.
     • dusty rose / mauve → E / ETOH and NH3.
   What is left, and therefore what these are: charcoal, cyan, stone grey, sage green, crimson,
   wine, grey. (2026-07-31j: To-EU and From-EU were originally fuchsia and gold — the owner's team
   found that pairing too loud/unsober, so they were swapped for a muted stone grey and a muted
   sage green. Deliberately kept OUT of the blue family so Distance still owns blue alone.)
   Crimson and wine are both reds, deliberately — they are the two UK buckets, and they differ in
   LIGHTNESS far more than the old blues did (bright vs very dark), so they stay separable while
   still hinting that they belong together. Stone grey (To-EU) vs the LPG tan and sage green
   (From-EU) vs the bio-fuel yellow-greens are the tightest calls in the set: in both cases the
   bucket colour is deliberately muted/mid-tone rather than saturated, and the two never appear in
   the same panel — only side by side in the rail's checkbox list.

   NOT COLOUR-BLIND SAFE, and this is a real limitation rather than an oversight: crimson/wine vs
   sage green, and stone grey vs the neutral "none" grey, are the classic confusions under
   deuteranopia/protanopia (~8% of men). Charcoal, cyan and grey stay separable. Flagged to the
   owner; the fix, if it is ever needed, is to add a per-bucket SVG pattern (hatch direction / dot
   density) on top of the fill so the distinction does not rest on hue at all — the hatch machinery
   already exists in zngChart() for the excluded-column and unmatched-report cases. */
var ZNG_DIST_COL = "#2563eb";
var ZNG_ZONE_COL = {
  /* keyed BY ID, so the 2026-07-31i re-ordering and re-labelling of ZNG_ZONES did not touch this
     map at all — only the label words in these comments changed. */
  euEU:"#111827",     // charcoal  — EU-EU, 100% both ends
  atEU:"#06b6d4",     // cyan      — At-EU (EU berth), 100%
  toEU:"#78716c",     // warm stone grey — To-EU, the 50% band inbound (2026-07-31j: replaced fuchsia,
                       // owner disliked the pink/gold pair; kept OUT of the blue family on purpose —
                       // see the "no bucket may be blue" rule above, Distance already owns blue)
  fromEU:"#7a8c5e",   // muted sage green — From-EU, the 50% band outbound (2026-07-31j: replaced gold,
                       // same instruction)
  intraUK:"#dc2626",  // crimson   — UK-UK, 100%
  atUK:"#831843",     // wine      — At-UK (UK berth), 100%
  none:"#9ca3af"      // grey      — scores 0% for both regimes; not a compliance category
};
/* fallback only — used if a point's zone is ever something outside the map above (should not
   happen; every zngZoneOf() return value has an entry). Kept in the same families as the
   buckets they stand in for: charcoal for a stray EU row, crimson for a stray UK one. */
var ZNG_EU_COL = "#111827";
var ZNG_UK_COL = "#dc2626";

/* ---------------------------------------------------------------- geometry */
/* 2026-07-31b: the axis column was 74 px and clipped its own labels ("Distance" collided with
   the "nm" unit). Widened, and the unit now sits INSIDE the title line as a lighter tspan
   rather than being right-aligned into the same 74 px. */
var ZNG_AXW   = 106;   // fixed left axis column (never scrolls sideways, so labels stay put)
/* 2026-07-31f (owner instruction, THIRD design of this behaviour — see the long note above
   zngActive() for the full history). ZNG_PH_BASE is a REFERENCE value only, used to compute the
   NORMAL, readable plot height for one panel — the size panels stay at whenever they do not all
   fit and the pane has to scroll (2026-07-31g). It is NOT necessarily the height a panel draws
   at: once the ticked panels fit with room to spare, they grow beyond this to fill the space.
   A panel's real plot height is therefore a per-render number (zngChart() computes it and calls
   it `ph`, caching it on ZNG.panels.ph) — never read this constant directly for geometry. */
var ZNG_PH_BASE = 78;
/* 2026-07-31c (owner screenshot): the title sat only 6px above the plot rect, which on a dense
   8-panel chart read as the panel name "merging" into the bars below it. Widened the title band
   and, in zngAxis(), moved the text further off the plot top — same fix in spirit as widening
   ZNG_AXW for the horizontal clipping issue above, just for the vertical gap this time. */
var ZNG_TTL   = 24;    // title band above each panel — fixed, does not scale with ph
var ZNG_PGAP  = 13;    // breathing room below each panel — fixed, does not scale with ph
var ZNG_TOP   = 8;
var ZNG_XH    = 34;    // the pinned date-axis strip (its own SVG, see the layout note above)
var ZNG_MINSLOT = 9;   // below this the bars stop shrinking and the chart scrolls sideways

/* 2026-07-31g (owner bug report — this replaces 07-31f's fixed constant, which WAS the bug).
   07-31f made the drawing height a fixed 8-panel constant (~928px). On any screen shorter than
   that the pane scrolled no matter what, and because `ph` GREW as panels were unticked, the
   total never shrank — so unticking panels could never remove the scrollbar, which was the whole
   point of the exercise. The owner's rule, in order of preference:
       1. FIRST, fewer panels should simply mean less total height — i.e. the panels below move
          UP and the scrollbar goes away. (Panels stay at their normal, readable size.)
       2. ONLY once everything fits with room to spare should the panels GROW, so the freed
          space is used rather than left blank.
   So the height is no longer a constant at all: it is max(what the ticked panels need at normal
   size, what the pane actually has). Measured live from .zng-panes — hence a function taking the
   measurement, not a constant. `avail` of 0 (element not laid out yet, e.g. the very first
   render before the popup has a box, or jsdom) falls back to the natural size so nothing
   collapses; zngOpen() renders twice for exactly this reason. */
function zngNaturalH(nOn){ return ZNG_TOP + Math.max(1, nOn) * (ZNG_TTL + ZNG_PH_BASE + ZNG_PGAP); }
function zngAvailH(){
  var pane = document.getElementById("zng-panes");
  var h = pane ? pane.clientHeight : 0;
  return (h > 60) ? h : 0;     // 0 = "not measurable yet", callers fall back to natural size
}
/* `ph` is this render's actual per-panel plot height (fixed ZNG_PH_BASE only when all 8 are
   ticked); omit it to read the value zngChart() cached on ZNG.panels for this same render — every
   caller outside zngChart() (zngAxis, zngHoverAt) relies on that cache rather than recomputing. */
function zngPanelTop(i, ph){
  var p = ph; if(p == null) p = (ZNG.panels && ZNG.panels.ph != null) ? ZNG.panels.ph : ZNG_PH_BASE;
  return ZNG_TOP + i * (ZNG_TTL + p + ZNG_PGAP) + ZNG_TTL;
}

/* 2026-07-31g (owner instruction): panels that start UNTICKED on a fresh workspace. The
   per-machine split is the detail view — opt in when you want it. See zngSyncFilters(). */
var ZNG_PANEL_OFF_BY_DEFAULT = { me:1, ae:1, blr:1, oth:1 };

var ZNG_PANELS = [
  { id:"dist", title:"Distance",    unit:"nm", kind:"single" },
  { id:"me",   title:"ME Cons",     unit:"mt", kind:"stack"  },
  { id:"ae",   title:"AE Cons",     unit:"mt", kind:"stack"  },
  { id:"blr",  title:"BLR Cons",    unit:"mt", kind:"stack"  },
  { id:"oth",  title:"Others Cons", unit:"mt", kind:"stack"  },
  { id:"tot",  title:"Total Cons",  unit:"mt", kind:"stack"  },
  { id:"rob",  title:"ROB",         unit:"mt", kind:"stack"  },
  { id:"elig", title:"Eligibility", unit:"%",  kind:"elig"   }
];
/* THIRD design of this behaviour in one day — history, so nobody "fixes" it back to either
   earlier version without reading this:
     2026-07-31b (original): unticking a panel REMOVED it and the rest re-spaced upward at a
       FIXED per-panel height — so the popup got visibly shorter/taller as you ticked things.
     2026-07-31e: reversed on owner instruction — unticking KEPT the panel's row (dimmed
       placeholder), so the popup never resized, but a hidden panel's space just sat there empty
       instead of helping the panels you actually wanted to read (owner's screenshot on a smaller
       screen: 8 fixed-height rows didn't fit, and unticking one didn't help since its space
       wasn't reclaimed).
     2026-07-31f: back to REMOVING a hidden panel entirely — zngActive() filters again — with its
       freed space redistributed across the panels that ARE ticked, which grow taller. But the
       total was pinned to a FIXED ~928px 8-panel constant, taller than most screens, so the pane
       always scrolled AND unticking could never shrink it (the panels just grew instead). That
       missed the owner's actual goal.
     2026-07-31g (this version, owner instruction): zngActive() still filters, but the total is no
       longer a constant — it is max(what the ticked panels need at normal size, what the pane
       actually measures). So unticking FIRST reduces the total and removes the scrollbar
       (preference 1), and only once everything fits with room to spare do the panels grow to use
       it (preference 2). See the note above zngNaturalH() in the geometry section. */
function zngActive(){
  if(!ZNG.show) return ZNG_PANELS.slice();
  return ZNG_PANELS.filter(function(p){ return ZNG.show[p.id] !== false; });
}

/* ---------------------------------------------------------------- small helpers */
function zngEsc(s){
  if(typeof esc === "function"){ try{ return esc(s); }catch(e){} }
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function zngNum(v, dp){
  if(v == null || !isFinite(v)) return "—";
  var n = Number(v);
  return n.toLocaleString("en-GB", { minimumFractionDigits:dp, maximumFractionDigits:dp });
}
/* 2026-07-31c (owner bug report): tooltip rows for the consumption panels used a fixed 1 decimal
   place, so a small "Others" value (Total − ME − AE − BLR, often a few hundredths of an mt) round-
   ed to "0.0" — reading as no consumption even though its bar, scaled against that panel's own
   small axis max, was clearly visible. This mirrors the precision zngAxis() already picks for
   axis labels (fewer decimals once the numbers are large) but keyed on the VALUE itself rather
   than the panel max, since a tiny genuine figure deserves more digits regardless of what else is
   on the same panel. */
function zngValDp(v){
  var av = Math.abs(Number(v) || 0);
  if(av === 0) return 0;
  if(av >= 10) return 1;
  if(av >= 1) return 2;
  return 3;
}
/* a "nice" axis maximum: 1 / 2 / 2.5 / 5 / 10 x a power of ten, so tick labels stay round */
function zngNiceCeil(v){
  if(!(v > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p;
  var m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return m * p;
}
function zngDateLabel(iso){
  if(!iso) return "—";
  var M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var d = String(iso).slice(8,10), m = Number(String(iso).slice(5,7)) - 1;
  return d + " " + (M[m] || "?");
}
function zngStamp(iso){
  if(!iso) return "—";
  return zngDateLabel(iso) + " " + String(iso).slice(0,4) + " " + String(iso).slice(11,16) + " UTC";
}

/* ---------------------------------------------------------------- data build */
/* The report list, filtered by the SAME From/To range the REPORTS tab honours, so the chart
   and the table can never show different date windows. */
function zngReports(){
  var all = (typeof S !== "undefined" && S && S.mdaReports) || [];
  try{
    if(typeof dateFilterActive === "function" && dateFilterActive() && typeof repInRange === "function"){
      return all.filter(repInRange);
    }
  }catch(e){}
  return all;
}

/* 2026-07-31d: the two zone-sides euCoverage() itself used to decide a 0.5 result — read-only,
   for LABELLING which direction a half-scope leg/stay is going. Mirrors euCoverage()'s own two
   branches exactly (engine.js) so "which side was EEA" can never disagree with the 0.5 it is
   describing; the coverage NUMBER always still comes from euCoverage()/trCoverage(), never
   recomputed here. */
function zngLegSides(row){
  if(!row) return { from:null, to:null };
  if(row.kind === "port") return { from: row._covFrom || row.zone, to: row._covTo || row.zone };
  return { from: row._covFrom || row.from, to: row._covTo || row.to };
}
/* Which of the seven buckets a report belongs to. null = no matched workspace row, which the
   owner chose to keep permanently visible rather than bucket or hide. */
function zngZoneOf(rep){
  var row = null;
  try{ row = (typeof trMatchRow === "function") ? trMatchRow(rep) : null; }catch(e){}
  if(!row) return null;
  var eu = 0, uk = 0;
  try{ eu = euCoverage(row); }catch(e){}
  try{ uk = ukCoverage(row); }catch(e){}
  var isPort = row.kind === "port";
  if(eu > 0 && eu < 1){
    /* the 50% band, leg or non-call stay alike — direction from whichever side was EEA */
    var sides = zngLegSides(row);
    if(sides.to === "EEA") return "toEU";       // heading INTO the EEA
    if(sides.from === "EEA") return "fromEU";   // heading OUT of the EEA
    return "toEU";                              // defensive fallback, should be unreachable
  }
  if(uk >= 1) return isPort ? "atUK" : "intraUK";
  if(eu >= 1) return isPort ? "atEU" : "euEU";
  return "none";
}

/* One point per report. Per-fuel figures follow trFuelLines() in js/ui.js EXACTLY, including
   Others = max(0, Total − (ME + AE + BLR)) — so the panels sum back to the table's columns. */
function zngBuild(){
  try{ if(typeof trAnnotate === "function") trAnnotate(); }catch(e){}
  var reps = zngReports();
  var pts = [], fuelSet = {}, anyMach = false;

  for(var i = 0; i < reps.length; i++){
    var r = reps[i], m = r.mach || null;
    if(m) anyMach = true;
    var names = {};
    var add = function(o){ if(o) for(var k in o) if(o.hasOwnProperty(k)) names[k] = 1; };
    add(r.fuels); add(r.rob);
    if(m){ add(m.ME); add(m.AE); add(m.BLR); }

    var p = { t:r.t || r.te || r.ts || null, rep:r, rt:r.rt || "", role:r.role || "",
              dist:Number(r.dist) || 0, me:{}, ae:{}, blr:{}, oth:{}, tot:{}, rob:{} };

    for(var n in names){
      if(!names.hasOwnProperty(n)) continue;
      fuelSet[n] = 1;
      var total = (r.fuels || {})[n];
      var me  = m ? (((m.ME  || {})[n]) || 0) : 0;
      var ae  = m ? (((m.AE  || {})[n]) || 0) : 0;
      var blr = m ? (((m.BLR || {})[n]) || 0) : 0;
      if(total != null){
        p.tot[n] = total;
        if(m){
          p.me[n] = me; p.ae[n] = ae; p.blr[n] = blr;
          p.oth[n] = Math.max(0, total - me - ae - blr);
        }
      }
      var rb = (r.rob || {})[n];
      if(rb != null) p.rob[n] = rb;
    }

    /* eligibility straight from js/ui.js — never recomputed here (see the header note) */
    var cov = { eu:null, uk:null };
    try{ if(typeof trCoverage === "function") cov = trCoverage(r); }catch(e){}
    p.eu = (cov && cov.eu != null && isFinite(cov.eu)) ? cov.eu : null;
    p.uk = (cov && cov.uk != null && isFinite(cov.uk)) ? cov.uk : null;
    p.zone = zngZoneOf(r);
    pts.push(p);
  }

  /* fuel display order: the app's own TR_FUEL_ORDER first, then anything else alphabetically */
  var order = (typeof TR_FUEL_ORDER !== "undefined" && TR_FUEL_ORDER) ? TR_FUEL_ORDER : [];
  var fuels = Object.keys(fuelSet).sort(function(a, b){
    var ia = order.indexOf(a) + 1 || 99, ib = order.indexOf(b) + 1 || 99;
    return (ia - ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  return { pts:pts, fuels:fuels, anyMach:anyMach, nAll:pts.length };
}

/* ---------------------------------------------------------------- filter state */
function zngSyncFilters(D){
  if(!ZNG.fuels) ZNG.fuels = {};
  for(var i = 0; i < D.fuels.length; i++) if(!(D.fuels[i] in ZNG.fuels)) ZNG.fuels[D.fuels[i]] = true;
  if(!ZNG.zones){ ZNG.zones = {}; for(var j = 0; j < ZNG_ZONES.length; j++) ZNG.zones[ZNG_ZONES[j].id] = true; }
  /* 2026-07-31g (owner instruction, widening 2026-07-31e's Others-only rule): the four
     per-machine consumption panels (ME / AE / BLR / Others) all start UNTICKED — they are the
     detail view, opt-in when you actually want the machinery split. The default view is
     Distance + Total Cons + ROB + Eligibility, which is four panels: few enough to fit a normal
     screen without scrolling, and Total Cons still carries the overall burn. */
  if(!ZNG.show){
    ZNG.show = {};
    for(var k = 0; k < ZNG_PANELS.length; k++) ZNG.show[ZNG_PANELS[k].id] = !ZNG_PANEL_OFF_BY_DEFAULT[ZNG_PANELS[k].id];
  }
}
function zngFuelsOn(D){ return D.fuels.filter(function(f){ return ZNG.fuels[f] !== false; }); }
/* 2026-07-31e (owner instruction, reversing 2026-07-31's original scope behaviour): scope ticks
   used to REMOVE a report from the plot entirely, which shrank the X axis and shuffled every
   column after it — the owner reported this as "the axis keeps moving." zngPts() now ALWAYS
   returns every point, in the SAME order, so the X axis (column count, slot width, dates) is
   fixed no matter what is ticked. A ticked-off report's zone is instead marked EXCLUDED —
   zngExcluded() — and drawn as a hatched/greyed column across EVERY panel instead of vanishing,
   so a ruled-out period is still visible where it happened, not gone. Unmatched reports
   (zone === null) can never be excluded, same rule as before. */
function zngPts(D){ return D.pts; }
function zngExcluded(p){ return p.zone != null && ZNG.zones[p.zone] === false; }
/* the subset actually counted as "in scope" right now — used for the rail's summary count and
   for axis-scaling (an excluded period should not stretch the Y axis for the ones you kept) */
function zngActivePts(D){ return D.pts.filter(function(p){ return !zngExcluded(p); }); }

function zngToggleFuel(f, on){ ZNG.fuels[f] = !!on; ZNG.hi = -1; zngRender(); }
function zngToggleZone(z, on){ ZNG.zones[z] = !!on; ZNG.hi = -1; zngRender(); }
/* 2026-07-31g (owner instruction — see the history note above zngActive()): unticking a panel
   removes it from zngActive(). The chart then FIRST gets shorter (removing any scrollbar), and
   only grows the remaining panels once they all fit with space left over — zngChart()'s
   natural-vs-available comparison, not a fixed budget. */
function zngTogglePanel(p, on){ ZNG.show[p] = !!on; ZNG.hi = -1; zngRender(); }
function zngAllFuels(on){
  var D = ZNG.data || zngBuild();
  for(var i = 0; i < D.fuels.length; i++) ZNG.fuels[D.fuels[i]] = !!on;
  ZNG.hi = -1; zngRender();
}
function zngAllZones(on){
  for(var i = 0; i < ZNG_ZONES.length; i++) ZNG.zones[ZNG_ZONES[i].id] = !!on;
  ZNG.hi = -1; zngRender();
}
function zngAllPanels(on){
  for(var i = 0; i < ZNG_PANELS.length; i++) ZNG.show[ZNG_PANELS[i].id] = !!on;
  ZNG.hi = -1; zngRender();
}

/* ---------------------------------------------------------------- per-panel series */
/* Returns, for one panel and one point, the list of {fuel, colour, value} segments to stack
   (bottom first) plus their total. Fuel ticks apply here — and ONLY here, which is exactly why
   Distance and Eligibility (handled separately below) are untouched by them. */
function zngSegs(p, panel, fuelsOn){
  var segs = [], sum = 0;
  if(panel.kind !== "stack") return { segs:segs, sum:sum };
  var bag = p[panel.id] || {};
  for(var i = 0; i < fuelsOn.length; i++){
    var f = fuelsOn[i], v = Number(bag[f]) || 0;
    if(v > 0){ segs.push({ f:f, c:zngFuelColour(f, i), v:v }); sum += v; }
  }
  return { segs:segs, sum:sum };
}
function zngPanelMax(pts, panel, fuelsOn){
  var mx = 0;
  for(var i = 0; i < pts.length; i++){
    if(panel.kind === "single") mx = Math.max(mx, Number(pts[i].dist) || 0);
    else if(panel.kind === "stack") mx = Math.max(mx, zngSegs(pts[i], panel, fuelsOn).sum);
  }
  return mx;
}

/* ---------------------------------------------------------------- per-panel totals */
/* 2026-07-31i (owner instruction — Task 3): one running total per panel, drawn on the SAME
   horizontal row as that panel's name, at the far right of the gap band above the plot.

   WHAT IT SUMS, and why it is exactly this (owner's decisions, asked and answered):
     • SCOPE ticks are honoured — the sum runs over zngActivePts() only, i.e. the columns that are
       NOT greyed out. Untick every zone but To-EU and every total becomes the To-EU total.
     • FUEL ticks are honoured too, because the per-report figure comes from zngSegs(), the same
       function that builds the visible stack. The rule the owner chose: THE TOTAL MUST ALWAYS
       EQUAL WHAT YOU CAN SEE STACKED IN THE BARS. If you ever change one of these, change both.
     • Reports with no confident workspace match are immune to the scope ticks everywhere else in
       this file (see the header note) — they are in zngActivePts() and so they are in the total.

   WHAT DELIBERATELY HAS NO TOTAL (ZNG_NO_TOTAL below) — do not "complete the set":
     • ROB is a STOCK reading, not a flow. Adding this event's tanks to the last event's tanks
       produces a number with no physical meaning. js/ui.js's Report-Wise total row refuses to sum
       ROB for exactly this reason, and this refusal is the same refusal.
     • Eligibility is a PERCENTAGE. Percentages of different reports do not add.
   Both simply render nothing, rather than a "—", so the row stays visually quiet. */
var ZNG_NO_TOTAL = { rob:1, elig:1 };
/* Returns { total:Number, parts:[{f,v,c}] | null }, or null for a panel that must not be totalled.
   `parts` is null for Distance (not a per-fuel quantity); for the consumption panels it carries ONE
   ENTRY PER FUEL IN THE WORKSPACE — including the fuels you have unticked, which report 0.00 rather
   than disappearing (2026-07-31k, owner instruction: "if a particular fuel type is filtered out,
   then that particular fuel value will show zero"). That is why this walks `fuels` (all of them)
   and not `fuelsOn`: a vanishing row would make you re-count the list to notice what is missing,
   whereas an explicit zero says "filtered out" at a glance. The invariant from 07-31i still holds —
   the parts add up to `total`, and `total` is still exactly the visible stack, because an unticked
   fuel contributes 0 to both.
   Colour index is the fuel's position in D.fuels (NOT in fuelsOn), so a swatch here always matches
   the same fuel's swatch in the rail even after other fuels are unticked. */
function zngPanelTotal(pts, panel, fuels, fuelsOn){
  if(ZNG_NO_TOTAL[panel.id]) return null;
  var i, t = 0;
  if(panel.kind === "single"){
    for(i = 0; i < pts.length; i++) t += Number(pts[i].dist) || 0;
    return { total:t, parts:null };
  }
  if(panel.kind !== "stack") return null;   /* an unknown panel kind gets no total, not a wrong one */
  var on = {};
  for(i = 0; i < fuelsOn.length; i++) on[fuelsOn[i]] = 1;
  var parts = [];
  for(var k = 0; k < fuels.length; k++){
    var f = fuels[k], v = 0;
    if(on[f]){
      for(i = 0; i < pts.length; i++){
        var bag = pts[i][panel.id] || {};
        v += Number(bag[f]) || 0;
      }
    }
    t += v;
    parts.push({ f:f, v:v, c:zngFuelColour(f, k), off:!on[f] });
  }
  return { total:t, parts:parts };
}
/* The markup for that layer. These divs are absolutely positioned children of .zng-panes, NOT of
   .zng-inner — that is the whole point and is load-bearing:
     • .zng-panes scrolls VERTICALLY, so a total scrolls up and down with the panel it labels.
     • .zng-inner scrolls HORIZONTALLY, so anything in there slides off-screen sideways on a long
       date range. Putting the totals outside it is what keeps them pinned at the right-hand edge.
   `top` uses the SAME zngPanelTop() geometry the axis labels use, minus the title band, so the
   total and the parameter name are on one row by construction rather than by a tuned offset. */
function zngTotalsLayer(D){
  var P = zngActive(), fuelsOn = zngFuelsOn(D), pts = zngActivePts(D);
  var ph = (ZNG.panels && ZNG.panels.ph != null) ? ZNG.panels.ph : ZNG_PH_BASE;
  var nOff = 0;
  for(var z = 0; z < ZNG_ZONES.length; z++) if(ZNG.zones && ZNG.zones[ZNG_ZONES[z].id] === false) nOff++;
  var scopeNote = nOff
    ? "the " + pts.length + " report(s) left by your Scope ticks"
    : "all " + pts.length + " report(s) in the window (no Scope filter applied)";
  var out = "";
  for(var i = 0; i < P.length; i++){
    var pn = P[i], T = zngPanelTotal(pts, pn, D.fuels, fuelsOn);
    if(T == null) continue;
    /* ONE decimal setting for the whole row, taken from the panel total — so the per-fuel figures
       and the combined figure line up instead of one showing 2 decimals and its neighbour none. */
    var dp = (T.total >= 100) ? 0 : (T.total >= 10 ? 1 : 2);
    var tip = pn.title + " — total over " + scopeNote +
              (T.parts ? ", split by fuel. A fuel you have unticked reads 0.00 rather than " +
                         "disappearing, so the list of fuels never changes shape" : "") +
              ". The combined figure always equals the sum of the bars you can see in this panel.";
    var split = "";
    if(T.parts){
      for(var q = 0; q < T.parts.length; q++){
        var pt = T.parts[q];
        split += '<span class="f' + (pt.off ? " off" : "") + '">' +
                 '<i class="sw" style="background:' + zngEsc(pt.c) + '"></i>' +
                 zngEsc(pt.f) + ' <b>' + zngEsc(zngNum(pt.v, dp)) + '</b></span>';
      }
      split = '<span class="fs">' + split + '</span>';
    }
    out += '<div class="zng-tot" style="top:' + (zngPanelTop(i, ph) - 20) + 'px" title="' + zngEsc(tip) + '">' +
           split +
           /* label wording is the owner's explicit pick (2026-07-31i): "Total 1,234 mt" — the row
              position plus the unit identify the parameter, and the full parameter name is in the
              hover title above. He rejected repeating the panel name in the visible text.
              2026-07-31k: the per-fuel split goes BEFORE it, so the combined figure stays hard
              against the right edge where it has always been and the eye can still scan a column
              of totals down the page. */
           '<span class="t">Total <b>' + zngEsc(zngNum(T.total, dp)) + '</b> ' + zngEsc(pn.unit) + '</span>' +
           '</div>';
  }
  return out;
}

/* ---------------------------------------------------------------- chart SVG (panels only) */
/* The date axis is NOT in this SVG — it is a separate, pinned strip. See the layout note at the
   top of the file for why. */
function zngChart(D){
  /* pts is every report — zngPts() never removes scope-excluded ones (2026-07-31e), so the X
     axis (column count and order) is always the same regardless of Scope ticks. P, by contrast,
     IS filtered to only the TICKED panels (2026-07-31f, reverting 2026-07-31e — see the long
     history note above zngActive()) — a hidden panel is genuinely gone, not dimmed in place. */
  var pts = zngPts(D), activePts = zngActivePts(D), fuelsOn = zngFuelsOn(D), P = zngActive();
  var n = pts.length;
  var nOn = P.length;
  /* 2026-07-31g (owner instruction — see the note above zngNaturalH()): FIT FIRST, THEN GROW.
     `natural` is what the ticked panels need at normal, readable size. `avail` is what the pane
     actually has (0 if not yet measurable).
       • natural >= avail  →  the panels do NOT all fit. Keep them at normal size and let the
         pane scroll. Unticking one genuinely reduces `natural`, so the panels below move UP and
         the scrollbar shrinks and eventually disappears — preference 1.
       • natural <  avail  →  everything fits with room left over. NOW grow the panels to use it,
         so there is no blank space at the bottom — preference 2.
     Either way H is what we actually draw, and `ph` follows from it. */
  var natural = zngNaturalH(nOn);
  var avail = zngAvailH();
  var H = (avail > natural) ? avail : natural;
  var ph = nOn > 0 ? Math.max(20, (H - ZNG_TOP) / nOn - ZNG_TTL - ZNG_PGAP) : ZNG_PH_BASE;

  /* the scroller's usable width, measured live so the chart fits the popup at any size */
  var host = document.getElementById("zng-scroll");
  var availW = (host && host.clientWidth > 40) ? host.clientWidth - 4 : 1000;
  var slot = n > 0 ? Math.max(ZNG_MINSLOT, availW / n) : availW;
  var W = Math.max(availW, n * slot);
  if(n > 0) slot = W / n;
  var barW = Math.max(2, Math.min(26, slot * 0.72));

  var s = [];
  s.push('<svg id="zng-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
          '" xmlns="http://www.w3.org/2000/svg" style="display:block">');

  /* hatch used both for reports that matched no workspace row (thin stub, Eligibility panel
     only, unchanged) AND, since 2026-07-31e, for a scope-EXCLUDED report's whole column in
     EVERY panel (full height) — one visual language for "this period is ruled out here." */
  s.push('<defs><pattern id="zng-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
         '<rect width="5" height="5" fill="#eef2f5"></rect>' +
         '<line x1="0" y1="0" x2="0" y2="5" stroke="#c2cdd5" stroke-width="2"></line></pattern></defs>');

  if(nOn === 0){
    /* every parameter unticked — still the SAME fixed height H, just one explanatory message
       filling it, rather than the whole popup collapsing (that was the pre-07-31 design). */
    s.push('<rect x="0" y="' + ZNG_TOP + '" width="' + W + '" height="' + (H - ZNG_TOP) + '" fill="#fbfcfd"></rect>');
    s.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="12" fill="#a6b2bb">' +
           'Every parameter is unticked. Tick one on the left, or use “all” above the Parameter list.</text>');
    s.push('<line id="zng-sync" x1="-99" y1="' + ZNG_TOP + '" x2="-99" y2="' + H +
           '" stroke="#0e2c40" stroke-width="1" stroke-dasharray="3 3" opacity="0" pointer-events="none"></line>');
    s.push('<rect id="zng-hit" x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent"></rect>');
    s.push("</svg>");
    ZNG.panels = { list:P, maxes:[], slot:slot, barW:barW, W:W, H:H, n:n, pts:pts, ph:ph };
    return s.join("");
  }

  /* per-panel Y maxima, computed once and cached for the axis and tooltip renderers. Uses
     ACTIVE points only (scope-excluded ones don't count) — 2026-07-31e: a ruled-out period
     should not be able to stretch the axis for the period you actually kept.
     2026-07-31c (owner instruction): AE / BLR / Others / Total Cons each auto-ranged off their
     OWN max, so a panel whose real values are small (e.g. Others is usually just ME/AE/BLR
     rounding remainder) stretched to fill the same plot height as ME — making a few hundredths
     of an mt look as visually "tall" as ME's tens of mt. That is the auto-ranging "deception" the
     owner flagged. Fix: floor those four panels' Y-axis range at 20% of ME's own (nice-ceiled)
     range, so ME always reads as visibly the tallest panel. ME and ROB are deliberately NOT
     floored — ME is the reference, and ROB is a stock reading on its own scale (hundreds of mt
     sitting in tanks), not a flow comparable to ME's per-report burn. This floor is about VALUE
     scale, not pixels, so it is unaffected by `ph` — ME's own DATA range is what it floors
     against, whether or not the ME panel itself happens to be ticked right now. */
  var mePanel = null;
  for(var mi = 0; mi < ZNG_PANELS.length; mi++){ if(ZNG_PANELS[mi].id === "me"){ mePanel = ZNG_PANELS[mi]; break; } }
  var meRawMax = mePanel ? zngPanelMax(activePts, mePanel, fuelsOn) : 0;
  /* only floor off a REAL ME range — zngNiceCeil(0) returns 1 as a cosmetic default for an
     empty panel, which is not an actual ME scale to anchor anything to */
  var meAxisMax = meRawMax > 0 ? zngNiceCeil(meRawMax) : 0;
  var ZNG_FLOOR_PCT = 0.20, ZNG_FLOORED = { ae:1, blr:1, oth:1, tot:1 };
  var maxes = P.map(function(pn){
    if(pn.kind === "elig") return 100;
    var raw = zngPanelMax(activePts, pn, fuelsOn);
    if(ZNG_FLOORED[pn.id] && meAxisMax > 0) raw = Math.max(raw, meAxisMax * ZNG_FLOOR_PCT);
    return zngNiceCeil(raw);
  });
  ZNG.panels = { list:P, maxes:maxes, slot:slot, barW:barW, W:W, H:H, n:n, pts:pts, ph:ph };

  for(var pi = 0; pi < P.length; pi++){
    var pn = P[pi], top = zngPanelTop(pi, ph), mx = maxes[pi];
    var Y = (function(t, m){ return function(v){ return t + ph - (m > 0 ? (v / m) * ph : 0); }; })(top, mx);

    /* plot background + gridlines (0 / mid / max; the Eligibility panel's mid IS the 50% band) */
    s.push('<rect x="0" y="' + top + '" width="' + W + '" height="' + ph + '" fill="#fbfcfd"></rect>');
    var ticks = [0, mx / 2, mx];
    for(var ti = 0; ti < ticks.length; ti++){
      var gy = Y(ticks[ti]);
      s.push('<line x1="0" y1="' + gy.toFixed(1) + '" x2="' + W + '" y2="' + gy.toFixed(1) +
             '" stroke="' + (ti === 0 ? "#c8d3da" : "#e7edf1") + '" stroke-width="1"></line>');
    }

    if(pn.kind === "single"){
      for(var i = 0; i < n; i++){
        if(zngExcluded(pts[i])){
          s.push('<rect x="' + (i * slot).toFixed(2) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(2) +
                 '" height="' + ph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var v = Number(pts[i].dist) || 0; if(!(v > 0)) continue;
        var x = i * slot + (slot - barW) / 2, y = Y(v);
        s.push('<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(2) +
               '" height="' + Math.max(0.6, top + ph - y).toFixed(1) + '" fill="' + ZNG_DIST_COL + '"></rect>');
      }
    } else if(pn.kind === "stack"){
      for(var i2 = 0; i2 < n; i2++){
        if(zngExcluded(pts[i2])){
          s.push('<rect x="' + (i2 * slot).toFixed(2) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(2) +
                 '" height="' + ph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var sg = zngSegs(pts[i2], pn, fuelsOn); if(!sg.segs.length) continue;
        var x2 = i2 * slot + (slot - barW) / 2, acc = 0;
        for(var k = 0; k < sg.segs.length; k++){
          var seg = sg.segs[k];
          var yTop = Y(acc + seg.v), yBot = Y(acc);
          acc += seg.v;
          s.push('<rect x="' + x2.toFixed(2) + '" y="' + yTop.toFixed(1) + '" width="' + barW.toFixed(2) +
                 '" height="' + Math.max(0.6, yBot - yTop).toFixed(1) + '" fill="' + seg.c + '"></rect>');
        }
      }
    } else {
      /* eligibility — ONE FULL-WIDTH BAR PER REPORT (2026-07-31h, owner instruction, replacing
         the two half-width EU/UK bars of the original design).

         WHY ONE BAR IS SAFE, i.e. why this cannot hide a UK figure. The owner's reasoning was
         "there will never be a situation when both EU and UK have non-zero %"; that was checked
         against engine.js rather than taken on trust, and it holds STRUCTURALLY, not just for
         this dataset: ukCoverage() > 0 requires BOTH voyage ends to be "UK", while
         euCoverage() > 0 requires at least ONE end to be "EEA", and zoneOfLocode() gives a port
         exactly one zone. So a non-zero UK score forces a zero EU score and vice versa — the two
         are mutually exclusive by construction. `eu > 0 ? eu : uk` therefore never discards a
         real number. verify_graph_popup.js asserts this exclusivity, so if the zone rules ever
         change (a country joining/leaving the EEA, say) the test fails loudly instead of this
         panel quietly dropping UK bars.

         At the owner's stated usage — a full year, ~300 reports at once — the bars are only a
         few px wide, which is the other reason the split bars had to go: half of ~3px is not a
         readable bar. Full width doubles it and lets the bucket colour actually register. */
      for(var i3 = 0; i3 < n; i3++){
        if(zngExcluded(pts[i3])){
          s.push('<rect x="' + (i3 * slot).toFixed(2) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(2) +
                 '" height="' + ph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var p3 = pts[i3], x3 = i3 * slot + (slot - barW) / 2;
        /* colour by the report's own zone bucket — each has its own hue (see ZNG_ZONE_COL) */
        var zCol = ZNG_ZONE_COL[p3.zone] || null;
        if(p3.eu == null && p3.uk == null){
          /* no confident match — the same "–" state the REPORTS table shows, drawn as a low
             hatched stub so the gap is visible instead of looking like a genuine 0% */
          s.push('<rect x="' + x3.toFixed(2) + '" y="' + (top + ph - 5).toFixed(1) + '" width="' + barW.toFixed(2) +
                 '" height="5" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        /* EU takes priority, per owner instruction; UK only when EU is zero/absent */
        var euV = (p3.eu != null && p3.eu > 0) ? p3.eu : null;
        var pct = euV != null ? euV : ((p3.uk != null && p3.uk > 0) ? p3.uk : 0);
        if(!(pct > 0)) continue;                       // genuine 0% both ways — no bar to draw
        var yV = Y(pct);
        s.push('<rect x="' + x3.toFixed(2) + '" y="' + yV.toFixed(1) + '" width="' + barW.toFixed(2) +
               '" height="' + Math.max(0.6, top + ph - yV).toFixed(1) + '" fill="' +
               (zCol || (euV != null ? ZNG_EU_COL : ZNG_UK_COL)) + '"></rect>');
      }
    }
  }

  /* sync line spans every visible panel — one line, so the panels can never read different points */
  s.push('<line id="zng-sync" x1="-99" y1="' + ZNG_TOP + '" x2="-99" y2="' + H +
         '" stroke="#0e2c40" stroke-width="1" stroke-dasharray="3 3" opacity="0" pointer-events="none"></line>');
  s.push('<rect id="zng-hit" x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent"></rect>');
  s.push("</svg>");
  return s.join("");
}

/* the PINNED date axis. Same width and slot as the plot, so the ticks line up; its horizontal
   scroll is mirrored from the plot's scroller by zngBindScrollSync(). */
function zngXAxis(){
  var P = ZNG.panels;
  var W = (P && P.W) || 1000, slot = (P && P.slot) || 1, n = (P && P.n) || 0, pts = (P && P.pts) || [];
  var s = ['<svg width="' + W + '" height="' + ZNG_XH + '" viewBox="0 0 ' + W + ' ' + ZNG_XH +
           '" xmlns="http://www.w3.org/2000/svg" style="display:block">'];
  s.push('<line x1="0" y1="0.5" x2="' + W + '" y2="0.5" stroke="#c8d3da" stroke-width="1"></line>');
  if(n > 0){
    var stride = Math.max(1, Math.ceil(72 / slot)), lastYear = "";
    for(var i = 0; i < n; i += stride){
      var cx = (i + 0.5) * slot, iso = pts[i].t;
      s.push('<line x1="' + cx.toFixed(1) + '" y1="0" x2="' + cx.toFixed(1) + '" y2="4" stroke="#c8d3da" stroke-width="1"></line>');
      s.push('<text x="' + cx.toFixed(1) + '" y="15" text-anchor="middle" font-size="10" fill="#6d7d89">' +
             zngEsc(zngDateLabel(iso)) + '</text>');
      var yr = String(iso || "").slice(0, 4);
      if(yr && yr !== lastYear){
        s.push('<text x="' + cx.toFixed(1) + '" y="28" text-anchor="middle" font-size="10" font-weight="700" fill="#41525e">' +
               zngEsc(yr) + '</text>');
        lastYear = yr;
      }
    }
  }
  s.push("</svg>");
  return s.join("");
}

/* the fixed left column: panel titles and their tick labels. Same geometry constants as the
   plot, so the labels always line up with the gridlines even though this SVG never scrolls
   sideways. The unit is a lighter tspan on the title line — right-aligning it into the column
   clipped the title on the first cut (owner screenshot, 2026-07-31b). */
function zngAxis(){
  var P = ZNG.panels || { list:zngActive(), maxes:zngActive().map(function(){ return 1; }), ph:ZNG_PH_BASE };
  var list = P.list || zngActive();
  var ph = P.ph != null ? P.ph : ZNG_PH_BASE;
  /* 2026-07-31g: read the height zngChart() ACTUALLY used this render (cached on ZNG.panels)
     rather than recomputing it — the two SVGs must agree exactly or the axis labels drift away
     from the gridlines they belong to, and since 07-31g that height depends on a live DOM
     measurement, recomputing here could legitimately produce a different answer. */
  var H = (P.H != null) ? P.H : zngNaturalH(list.length);
  var s = ['<svg width="' + ZNG_AXW + '" height="' + H + '" viewBox="0 0 ' + ZNG_AXW + ' ' + H +
           '" xmlns="http://www.w3.org/2000/svg" style="display:block">'];
  for(var i = 0; i < list.length; i++){
    var pn = list[i], top = zngPanelTop(i, ph), mx = P.maxes[i];
    s.push('<text x="0" y="' + (top - 10) + '" font-size="10.5" font-weight="700" fill="#0e2c40">' + zngEsc(pn.title) +
           ' <tspan font-size="9" font-weight="600" fill="#93a2ac">(' + zngEsc(pn.unit) + ')</tspan></text>');
    var vals = [mx, mx / 2, 0];
    for(var k = 0; k < vals.length; k++){
      var v = vals[k], y = top + ph - (mx > 0 ? (v / mx) * ph : 0);
      var dp = (mx >= 100 || v === 0) ? 0 : (mx >= 10 ? 1 : 2);
      s.push('<text x="' + (ZNG_AXW - 7) + '" y="' + (y + 3.2).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#8a97a1">' +
             zngEsc(zngNum(v, dp)) + '</text>');
    }
  }
  s.push("</svg>");
  return s.join("");
}

/* ---------------------------------------------------------------- left rail */
function zngRail(D){
  /* PARAMETERS first — it is the control that changes the shape of the whole chart, and the
     owner asked for it explicitly (2026-07-31b). Unticking one drops its panel entirely; the
     panels that stay ticked grow to fill the freed space (2026-07-31f — third design of this
     control in one day, see the history note above zngActive() in the geometry section). */
  var panelRows = ZNG_PANELS.map(function(pn){
    var on = ZNG.show[pn.id] !== false;
    return '<label class="zng-ck" title="Show or hide the ' + zngEsc(pn.title) + ' panel. The other ticked panels grow to fill the space it frees — the popup itself never changes size.">' +
      '<input type="checkbox" ' + (on ? "checked " : "") + 'onchange="zngTogglePanel(\'' + pn.id + '\',this.checked)">' +
      '<span>' + zngEsc(pn.title) + '</span>' +
      '<em class="zng-u">' + zngEsc(pn.unit) + '</em></label>';
  }).join("");

  var fuelRows = D.fuels.map(function(f, i){
    var on = ZNG.fuels[f] !== false;
    return '<label class="zng-ck" title="' + zngEsc(f) + ' — shows or hides this fuel&#39;s colour band in the five consumption panels and in ROB. Distance and Eligibility are not per-fuel and are unaffected.">' +
      '<input type="checkbox" ' + (on ? "checked " : "") + 'onchange="zngToggleFuel(\'' + zngEsc(f) + '\',this.checked)">' +
      '<i class="sw" style="background:' + zngFuelColour(f, i) + '"></i>' +
      '<span>' + zngEsc(f) + '</span></label>';
  }).join("");

  /* 2026-07-31d (owner instruction): a colour swatch per zone, same colours the Eligibility
     panel bars use (ZNG_ZONE_COL) — so ticking/unticking a zone here reads against the same
     colour you're looking for in the chart, not just a plain checkbox list. */
  var zoneRows = ZNG_ZONES.map(function(z){
    var on = ZNG.zones[z.id] !== false;
    return '<label class="zng-ck" title="' + zngEsc(z.hint) + '">' +
      '<input type="checkbox" ' + (on ? "checked " : "") + 'onchange="zngToggleZone(\'' + z.id + '\',this.checked)">' +
      '<i class="sw" style="background:' + (ZNG_ZONE_COL[z.id] || "#c3ced4") + '"></i>' +
      '<span>' + zngEsc(z.label) + '</span></label>';
  }).join("");

  var grp = function(title, allFn, rows){
    return '<div class="zng-grp">' +
      '<div class="zng-gh"><span class="t">' + title + '</span>' +
        '<span class="zng-all"><a href="javascript:void(0)" onclick="' + allFn + '(true)">all</a> · ' +
        '<a href="javascript:void(0)" onclick="' + allFn + '(false)">none</a></span></div>' + rows + '</div>';
  };

  /* 2026-07-31e: "shown" now means "active", not "plotted" — every report is always plotted
     (see zngPts()), a scope-unticked one just renders greyed/hatched instead of vanishing. */
  var shown = zngActivePts(D).length;
  var excludedN = D.nAll - shown;
  return '<div class="zng-rail">' +
      grp("Parameter", "zngAllPanels", panelRows) +
      grp("Fuel type", "zngAllFuels", D.fuels.length ? fuelRows : '<p class="zng-empty">No fuel grades in this workspace.</p>') +
      grp("Scope", "zngAllZones", zoneRows) +
      '<p class="zng-count"><b>' + shown + '</b> of <b>' + D.nAll + '</b> report(s) active' +
      (excludedN ? ' <span class="zng-dim2">(' + excludedN + ' excluded, shown hatched)</span>' : '') + '</p>' +
    '</div>';
}

/* ---------------------------------------------------------------- tooltips */
/* One tooltip per visible panel, all positioned at once against the same bar index — this is
   the "all at the same time with sync line" behaviour the owner specified. */
function zngTipHtml(p, panel, fuelsOn){
  var rows = "";
  if(panel.kind === "single"){
    rows = '<div class="r"><span>Distance</span><b>' + zngNum(p.dist, 1) + ' nm</b></div>';
  } else if(panel.kind === "stack"){
    var sg = zngSegs(p, panel, fuelsOn);
    if(!sg.segs.length){
      rows = '<div class="r zng-dim"><span>no value</span><b>—</b></div>';
    } else {
      for(var i = 0; i < sg.segs.length; i++){
        rows += '<div class="r"><i class="sw" style="background:' + sg.segs[i].c + '"></i><span>' +
                zngEsc(sg.segs[i].f) + '</span><b>' + zngNum(sg.segs[i].v, zngValDp(sg.segs[i].v)) + '</b></div>';
      }
      if(sg.segs.length > 1){
        rows += '<div class="r zng-sum"><span>' + (panel.id === "rob" ? "stack" : "total") + '</span><b>' +
                zngNum(sg.sum, zngValDp(sg.sum)) + '</b></div>';
      }
    }
  } else {
    if(p.eu == null && p.uk == null){
      rows = '<div class="r zng-dim"><span>no matched voyage/port entry</span><b>–</b></div>';
    } else {
      /* 2026-07-31d (owner instruction): swatch colour AND the row label now name the specific
         zone bucket (e.g. "EU-EU", "To-EU"), not just the flat regime — the percentage alone
         couldn't tell EU-EU (100%) apart from At EU berth (also 100%), or To-EU from From-EU
         (both 50%). ZNG_ZONE_COL/ZNG_ZONES share the same ids zngZoneOf() returns. */
      var zTip = null;
      for(var zt = 0; zt < ZNG_ZONES.length; zt++) if(ZNG_ZONES[zt].id === p.zone) zTip = ZNG_ZONES[zt];
      var euLbl = (zTip && ZNG_ZONE_COL[zTip.id] && p.eu > 0) ? "EU ETS / FuelEU — " + zTip.label : "EU ETS / FuelEU";
      var ukLbl = (zTip && ZNG_ZONE_COL[zTip.id] && p.uk > 0) ? "UK ETS — " + zTip.label : "UK ETS";
      var euCol = (zTip && p.eu > 0) ? (ZNG_ZONE_COL[zTip.id] || ZNG_EU_COL) : ZNG_EU_COL;
      var ukCol = (zTip && p.uk > 0) ? (ZNG_ZONE_COL[zTip.id] || ZNG_UK_COL) : ZNG_UK_COL;
      rows += '<div class="r"><i class="sw" style="background:' + euCol + '"></i><span>' + zngEsc(euLbl) + '</span><b>' +
              (p.eu == null ? "–" : zngNum(p.eu, p.eu % 1 ? 1 : 0) + "%") + '</b></div>';
      rows += '<div class="r"><i class="sw" style="background:' + ukCol + '"></i><span>' + zngEsc(ukLbl) + '</span><b>' +
              (p.uk == null ? "–" : zngNum(p.uk, p.uk % 1 ? 1 : 0) + "%") + '</b></div>';
    }
  }
  return rows;
}
function zngHoverAt(idx){
  var D = ZNG.data, P = ZNG.panels; if(!D || !P) return;
  var pts = P.pts || zngPts(D), list = P.list || zngActive();
  var line = document.getElementById("zng-sync");
  var head = document.getElementById("zng-head");
  if(idx < 0 || idx >= pts.length){
    if(line) line.setAttribute("opacity", "0");
    if(head) head.innerHTML = '<span class="zng-hint">Hover the chart to read every panel at once.</span>';
    for(var q = 0; q < ZNG_PANELS.length; q++){
      var t0 = document.getElementById("zng-tip-" + ZNG_PANELS[q].id);
      if(t0) t0.classList.remove("on");
    }
    ZNG.hi = -1;
    return;
  }
  ZNG.hi = idx;
  var p = pts[idx], cx = (idx + 0.5) * P.slot, fuelsOn = zngFuelsOn(D);
  if(line){ line.setAttribute("x1", cx); line.setAttribute("x2", cx); line.setAttribute("opacity", "1"); }

  if(head){
    var zoneLbl = "Unmatched";
    for(var z = 0; z < ZNG_ZONES.length; z++) if(ZNG_ZONES[z].id === p.zone) zoneLbl = ZNG_ZONES[z].label;
    /* 2026-07-31c (owner instruction): port/country, straight off the RAW MDA report fields —
       r.portN (CURRENT_PORT) with r.cur (the UN/LOCODE) as a fallback name, and r.ctry
       (CURRENT_COUNTRY) — the exact same fields and "(the)" cleanup js/ui.js's Report-Wise trace
       table already uses (see trTable()'s portHtml/ctryDisp). Shown only when the import actually
       carries them; most manual/DNV-OVD imports won't, and that's fine — the chip just omits. */
    var rep = p.rep || {};
    var portTxt = rep.portN || rep.cur || "";
    var ctryDisp = String(rep.ctry || "").replace(/\s*\(the\)\s*$/i, "");
    var portLbl = [portTxt, ctryDisp].filter(Boolean).join(" — ");
    /* 2026-07-31j (owner instruction): each of the 4 items below now sits in its OWN fixed-width
       grid column (.zng-col, sized by .zng-row in styles.css) instead of packing left-to-right
       in a plain flex row. Before this, a longer/shorter value in an earlier item (e.g. "ARRIVAL"
       vs "IN_PORT") pushed every item after it sideways, so the owner's eye had to re-find each
       field on every hover. All 4 columns are ALWAYS rendered, even when a field is empty (e.g.
       no port on this report), so a slot never collapses and the columns after it never shift. */
    head.innerHTML = '<span class="zng-row">' +
      '<span class="zng-col zng-col-date"><b>' + zngEsc(zngStamp(p.t)) + '</b></span>' +
      '<span class="zng-col zng-col-event"><span class="zng-chip">' + zngEsc(p.role || p.rt || "report") + '</span></span>' +
      '<span class="zng-col zng-col-zone"><span class="zng-chip zng-chip2">' + zngEsc(zoneLbl) + '</span></span>' +
      '<span class="zng-col zng-col-port">' + (portLbl ? '<span class="zng-chip zng-chip3">' + zngEsc(portLbl) + '</span>' : "") + '</span>' +
    '</span>';
  }

  var flip = cx > P.W - 190;
  var excluded = zngExcluded(p);
  /* list is the TICKED-only panel list (2026-07-31f) — a hidden panel has no tooltip element in
     the DOM at all (zngRender() only creates one per panel in zngActive()), so there is nothing
     to skip here any more. A visible panel on a scope-EXCLUDED column shows one plain "excluded"
     line instead of real figures, in every panel at once (consistent with the hatch covering
     that whole column). */
  for(var i = 0; i < list.length; i++){
    var pn = list[i], el = document.getElementById("zng-tip-" + pn.id);
    if(!el) continue;
    el.innerHTML = excluded
      ? '<div class="r zng-dim"><span>excluded — Scope filter</span><b>—</b></div>'
      : zngTipHtml(p, pn, fuelsOn);
    el.style.top = (zngPanelTop(i) + 2) + "px";
    el.style.left = flip ? "" : (cx + 10) + "px";
    el.style.right = flip ? (P.W - cx + 10) + "px" : "";
    el.classList.add("on");
  }
}
function zngBindHover(){
  var hit = document.getElementById("zng-hit"); if(!hit) return;
  var svg = hit.ownerSVGElement;
  var toIdx = function(ev){
    var P = ZNG.panels; if(!P || !P.n) return -1;
    var r = svg.getBoundingClientRect();
    var x = (ev.clientX - r.left) * (P.W / (r.width || P.W));
    return Math.max(0, Math.min(P.n - 1, Math.floor(x / P.slot)));
  };
  hit.addEventListener("mousemove", function(ev){ zngHoverAt(toIdx(ev)); });
  hit.addEventListener("mouseleave", function(){ zngHoverAt(-1); });
}
/* Keep the plot and the pinned date axis lined up horizontally.
   2026-07-31h: the SCROLLBAR now lives on the pinned date row (.zng-xscroll), not on the plot —
   see the CSS note on .zng-scroll for why. So the primary direction is xs -> sc (the user drags
   the pinned bar, the plot follows). The reverse is kept as well, because the plot can still be
   scrolled without its scrollbar — by shift+wheel, a trackpad swipe, or the browser scrolling a
   focused element into view — and the axis must not drift when that happens. `_sync` breaks the
   feedback loop the two-way binding would otherwise create. */
function zngBindScrollSync(){
  var sc = document.getElementById("zng-scroll"), xs = document.getElementById("zng-xscroll");
  if(!sc || !xs) return;
  var lock = false;
  var mirror = function(from, to){
    return function(){
      if(lock) return;
      lock = true;
      to.scrollLeft = from.scrollLeft;
      /* release after the write has been applied, so the scroll event it fires on `to` is the
         one being swallowed rather than a later genuine user scroll */
      setTimeout(function(){ lock = false; }, 0);
    };
  };
  xs.addEventListener("scroll", mirror(xs, sc));
  sc.addEventListener("scroll", mirror(sc, xs));
  /* the plot has no scrollbar of its own any more, so give it a wheel affordance: a horizontal
     (or shift+) wheel over the chart drives the pinned bar, which then drives the plot */
  sc.addEventListener("wheel", function(ev){
    var dx = ev.shiftKey ? ev.deltaY : ev.deltaX;
    if(!dx) return;
    var max = xs.scrollWidth - xs.clientWidth;
    if(max <= 0) return;
    var next = Math.max(0, Math.min(max, xs.scrollLeft + dx));
    if(next === xs.scrollLeft) return;   // already at the end — let the page have the event
    ev.preventDefault();
    xs.scrollLeft = next;
  }, { passive:false });
}

/* ---------------------------------------------------------------- open / close / render */
function zngOpen(){
  var host = document.getElementById("znfs-graph");
  if(!host){
    host = document.createElement("div");
    host.id = "znfs-graph";
    /* backdrop click closes, but only when the press STARTED on the backdrop — so dragging
       off a checkbox or off the chart cannot dismiss it. Same guard as the CII trend popup. */
    host.addEventListener("mousedown", function(ev){ if(ev.target === host) zngClose(); });
    document.body.appendChild(host);
  }
  try{ document.querySelectorAll(".ibpop.open").forEach(function(x){ x.classList.remove("open"); }); }catch(e){}
  ZNG.open = true; ZNG.hi = -1;
  host.classList.add("on");
  zngRender();
  /* the chart is sized from the scroller's measured width, which is only real once the popup
     is laid out — so draw once to get a box, then redraw to fit it exactly. */
  zngRender();
  var btn = document.querySelector("#znfs-graph .znct-close"); if(btn) btn.focus();
  if(!ZNG._resize){
    ZNG._resize = function(){ if(ZNG.open) zngRender(); };
    window.addEventListener("resize", ZNG._resize);
  }
}
function zngClose(){
  ZNG.open = false;
  var host = document.getElementById("znfs-graph");
  if(host) host.classList.remove("on");
  var back = document.querySelector(".znfs-graphbtn"); if(back) back.focus();
}
function zngToggle(){ if(ZNG.open) zngClose(); else zngOpen(); }

function zngRender(){
  var host = document.getElementById("znfs-graph"); if(!host) return;
  var D = ZNG.data = zngBuild();
  zngSyncFilters(D);

  var tip = "";
  try{
    if(typeof info === "function"){
      tip = info(
        "One bar per imported MDA report — the same reports, in the same order and the same " +
        "From/To window, as the <b>REPORTS</b> tab. Panels share one X axis and one sync line, so " +
        "every panel always reads the same report.<br><br>" +
        "<b>Parameter</b> ticks show or hide a panel completely; the panels that stay ticked grow " +
        "to fill the freed space, so the popup's overall height never changes — only how that " +
        "height is divided between the panels you actually want. <b>Fuel</b> ticks change the five " +
        "consumption panels and ROB only — Distance and Eligibility are not per-fuel quantities. " +
        "<b>Scope</b> ticks do not " +
        "remove anything from the timeline: an unticked zone's reports stay in their exact column " +
        "(the X axis never moves) but draw hatched/greyed in every panel, so a ruled-out period is " +
        "still visible where it happened.<br><br>" +
        "<b>Totals</b> sit at the right-hand end of each parameter's own row, split by fuel and then " +
        "combined. They follow both the Scope and the Fuel ticks, so a total always equals the bars " +
        "you can actually see; a fuel you have unticked reads 0 rather than vanishing from the list. " +
        "<b>ROB and Eligibility have no total</b> — ROB is a stock reading and Eligibility a " +
        "percentage, and neither can be meaningfully added up.<br><br>" +
        "<b>ROB is a stock reading, not a flow.</b> It is stacked here by explicit instruction, but the " +
        "stack HEIGHT is the sum of separate tanks and has no physical meaning — read the individual " +
        "bands, not the top of the bar. (The Report-Wise table refuses to total ROB for this reason.)<br><br>" +
        "<b>Eligibility</b> reuses the Report-Wise Eligibility calculation exactly, coloured by the " +
        "specific To-EU / At-EU / EU-EU / From-EU / At-UK / UK-UK bucket, not just the " +
        "percentage. UK ETS has no 50% band — a report is either fully in UK scope or out — and is " +
        "out of scope entirely before 1 Jul 2026. Thin hatched stubs mark reports with no confident " +
        "match to a voyage/port entry (the table's \"–\"); those always stay active and ignore the " +
        "Scope ticks.<br><br>" +
        "<b>ME / AE / BLR / Others</b> need an MDA file carrying per-machine columns, and <b>ROB</b> needs " +
        "FUEL_ROB. Files without them leave those panels empty by design.", "right");
    }
  }catch(e){}

  var head =
    '<div class="znct-head">' +
      '<h4>Trends<span style="color:#7a8896;font-weight:700;font-size:11px;letter-spacing:.05em"> · REPORT TIMELINE</span></h4>' + tip +
      '<div class="znct-ctrls">' +
        '<span id="zng-head" class="zng-readout"><span class="zng-hint">Hover the chart to read every panel at once.</span></span>' +
        '<button type="button" class="znct-close" title="Close (Escape)" aria-label="Close" onclick="zngClose()">✕</button>' +
      '</div>' +
    '</div>';

  /* P is the TICKED-only panel list (zngActive() filters — see the history note above it).
     zngChart() handles the "every parameter unticked" state internally (one centred message
     filling the area) rather than this function special-casing an empty chart column. */
  var body, P = zngActive();
  if(!D.nAll){
    body = '<div class="znct-body"><p class="znct-note">No report-level data in this workspace. ' +
           'The graph plots imported <b>MDA</b> reports — import an MDA event-log export (.xlsx or .csv) ' +
           'and it will fill in. Manually entered rows and DNV-OVD / THETIS imports do not carry ' +
           'report-level ROB or machinery data.</p></div>';
  } else {
    /* 2026-07-31f: zngChart(D) MUST run first and its result be captured, so ZNG.panels.ph is
       fresh (this render's dynamic per-panel height) before tips/caps read it — they used to be
       built first with whatever ph a PREVIOUS render happened to leave cached, which was harmless
       while ph was a fixed constant but would misplace captions now that it varies a lot with
       how many panels are ticked. */
    var chartSvg = zngChart(D);
    var tips = P.map(function(pn){ return '<div class="zng-tip" id="zng-tip-' + pn.id + '"></div>'; }).join("");
    /* deliberate: panels with nothing in them still render (owner's choice) so the layout is
       predictable; these captions explain the blank rather than leaving it bare. A panel that is
       UNTICKED simply is not in P at all any more, so nothing extra needs skipping here. */
    var caps = "";
    if(!D.anyMach){
      var capPh = (ZNG.panels && ZNG.panels.ph != null) ? ZNG.panels.ph : ZNG_PH_BASE;
      P.forEach(function(pn, i){
        if(["me","ae","blr","oth"].indexOf(pn.id) < 0) return;
        caps += '<div class="zng-cap" style="top:' + (zngPanelTop(i, capPh) + capPh / 2 - 8) + 'px">' +
                'No per-machine columns in this import — ME / AE / Boiler / Others are unavailable.</div>';
      });
    }
    body =
      '<div class="znct-body zng-body">' +
        zngRail(D) +
        '<div class="zng-chart">' +
          /* id is load-bearing: zngAvailH() measures THIS element to decide whether the ticked
             panels fit at normal size or should grow (2026-07-31g) */
          '<div class="zng-panes" id="zng-panes">' +
            '<div class="zng-axis">' + zngAxis() + '</div>' +
            '<div class="zng-scroll" id="zng-scroll"><div class="zng-inner">' + chartSvg + tips + caps + '</div></div>' +
            /* 2026-07-31i (owner instruction — Task 3): the per-panel totals. They are children of
               .zng-panes and NOT of .zng-inner on purpose — see the note above zngTotalsLayer().
               Absolutely positioned, so they add nothing to the flex row and cannot change the
               chart's geometry; they only need .zng-panes to be position:relative (styles.css). */
            zngTotalsLayer(D) +
          '</div>' +
          /* the date axis, PINNED under the scrolling panes — see the layout note at the top */
          '<div class="zng-xrow">' +
            '<div class="zng-xpad" style="width:' + ZNG_AXW + 'px">Date</div>' +
            '<div class="zng-xscroll" id="zng-xscroll">' + zngXAxis() + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  host.innerHTML = '<div class="znct-box zng-box" role="dialog" aria-modal="true" aria-label="Trends">' + head + body + '</div>';
  if(D.nAll && P.length){
    /* zngChart() ran before this markup existed, so the axis and the date strip were built from
       the geometry it cached — repaint both now that ZNG.panels is current for these filters. */
    var ax = host.querySelector(".zng-axis"); if(ax) ax.innerHTML = zngAxis();
    var xr = host.querySelector("#zng-xscroll"); if(xr) xr.innerHTML = zngXAxis();
    zngBindHover();
    zngBindScrollSync();
    if(ZNG.hi >= 0) zngHoverAt(ZNG.hi);
  }
}

/* ---------------------------------------------------------------- button mount */
/* js/fullscreen.js rewrites the whole header's innerHTML on every repaint, so the button is
   (re)inserted after each of those repaints rather than being written into that file's markup
   string. Wrapping the global is the same technique fullscreen.js itself uses on dfRepaint and
   columns.js uses on znfsClose — it keeps this feature entirely inside its own file. */
(function(){
  function mountBtn(){
    var rt = document.querySelector(".znfs-partsrt");
    if(!rt || rt.querySelector(".znfs-graphbtn")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "znfs-graphbtn";
    /* the class stays .znfs-graphbtn — internal name, see the NAMING note at the top of the file */
    b.title = "Trends — distance, consumption by fuel, ROB and EU/UK eligibility across every " +
              "imported report, on one shared timeline.";
    b.innerHTML = '<span class="ic">📈</span>Trends';
    b.onclick = function(){ zngToggle(); };
    /* leftmost item in the right-hand header group, ahead of Vessel Reporting / Year / Download */
    rt.insertBefore(b, rt.firstChild);
  }
  var _hdr = window.znfsRenderHeader;
  if(typeof _hdr === "function"){
    window.znfsRenderHeader = function(){
      var r = _hdr.apply(this, arguments);
      try{ mountBtn(); }catch(e){}
      return r;
    };
  }
  /* the overlay may already be on screen when this file finishes loading */
  try{ mountBtn(); }catch(e){}
})();
