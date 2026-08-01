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
     • 2026-08-01: the FIRST panel is EUA/UKA — the allowances to surrender, EU ETS and UK ETS in
       one panel as two series. It is NOT computed in this file: it apportions js/engine.js's own
       per-row, per-fuel `euas` / `ukCO2e` figures to the reports that make up each row. See the
       long note above zngEtsIndex() for the method and its one stated approximation (LNG slip
       within a row). Default ticked panels are now EUA/UKA + Total Cons + Eligibility only.

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
  /* 2026-08-01q (Aurvin, owner instruction, screenshot of the Eligibility ribbon): "EU to EU 100%
     is too dark. Can you make it lighter?" WAS #111827 (near-black charcoal). Shown four shades,
     then four lighter ones when he asked for "more light than C; or a different lighter colour" —
     he chose this soft slate-blue. It is a big lift: L* roughly 11% → 55%, so EU-EU is no longer
     the darkest thing on screen.
     WHY A COOL SLATE AND NOT A NEW HUE: this gamut is almost fully spoken for (read the note above
     ZNG_ZONES and the ZNG_STATE_COL note below). Blue is Distance (#2563eb), cyan is At-EU, sage is
     From-EU, warm stone is To-EU, crimson/wine are the UK pair, plain grey is "none", and the fuel
     panels own the browns, teals, violets and greens. Staying in the cool blue-grey family keeps
     EU-EU clear of every one of those while satisfying the instruction.
     THE ONE HONEST ADJACENCY, flagged rather than hidden (same treatment the To-EU/steel-blue note
     below gets): the OPERATION strip's In-Port cells (#7ea0b7) sit directly beneath this ribbon and
     are a similar lightness. They are separated by being different strips with their own headed
     legends, and this colour is more saturated and slightly darker. The owner was shown exactly
     this adjacency at real scale before choosing, and chose it anyway — do not "fix" it by
     darkening this back down. He also explicitly declined to touch the At Sea / In-Port / At-Berth
     ramp, so that ramp stays as 2026-08-01b set it. */
  euEU:"#6d86a8",     // soft slate-blue — EU-EU, 100% both ends
  atEU:"#06b6d4",     // cyan      — At-EU (EU berth), 100%
  /* 2026-08-01r (Aurvin, owner instruction) — THE 50% PAIR IS NOW GREEN IN / TERRACOTTA OUT.
     Asked for "To-EU should be lighter green, and From-EU should be lighter red — or some other
     option". Shown six green/red pairings, after which his instruction was: "Put the existing FROM
     EU to To-EU. That will work. Suggest some more color for From-EU." So:
        toEU   #78716c warm stone  → #7a8c5e  (the sage that WAS From-EU, moved across)
        fromEU #7a8c5e sage        → #c0674e  (muted terracotta, chosen from six candidates)
     THE POINT OF THE PAIR is directional: the two 50% buckets are the only ones that come in an
     inbound/outbound pair, and they now encode it — green arriving INTO the EEA, warm earth
     LEAVING it. Before this they were a grey and a green, which carried no direction at all.
     WHY TERRACOTTA AND NOT A TRUE RED: red belongs to the UK regime (UK-UK #dc2626, At-UK
     #831843). A saturated red here would let a 50% EU outbound leg read as 100% UK scope, which
     is a compliance misread, not just an ugly one. Terracotta is far enough down in saturation to
     stay clearly apart, and it MATCHES THE SAGE IN CHARACTER — both muted and earthy — so the
     pair reads as a set rather than as two unrelated buckets. Brighter corals and a rose were
     offered and not taken.
     Both still obey the "no bucket may be blue" rule (Distance owns #2563eb). */
  toEU:"#7a8c5e",     // muted sage green — To-EU, the 50% band INBOUND
  fromEU:"#c0674e",   // muted terracotta — From-EU, the 50% band OUTBOUND
  intraUK:"#dc2626",  // crimson   — UK-UK, 100%
  atUK:"#831843",     // wine      — At-UK (UK berth), 100%
  none:"#9ca3af"      // grey      — scores 0% for both regimes; not a compliance category
};
/* fallback only — used if a point's zone is ever something outside the map above (should not
   happen; every zngZoneOf() return value has an entry). Kept in the same families as the
   buckets they stand in for: the EU-EU slate-blue for a stray EU row, crimson for a stray UK one.
   2026-08-01q: tracked euEU from #111827 to #6d86a8 deliberately — the point of this constant is
   that a stray EU row is indistinguishable from the bucket it stands in for, so if you ever change
   euEU above and leave this behind, an unmapped row starts rendering as a colour that means
   nothing to the reader. */
var ZNG_EU_COL = "#6d86a8";
var ZNG_UK_COL = "#dc2626";

/* ---------------------------------------------------------------- operational state (bands) */
/* 2026-08-01b (Aurvin, owner instruction — Task 2): a FOURTH filter dimension, below Scope in the
   rail, splitting the timeline by WHAT THE SHIP WAS DOING rather than by which regime pays for it.
   Three bands, MUTUALLY EXCLUSIVE, so every report lands in exactly one and the three ticks
   partition the timeline with nothing double-counted and nothing homeless.

   THE OWNER'S OWN DEFINITIONS, verbatim from the clarifying round, in the order they were given:
     • At-Berth  — between the derived ARRIVAL and the derived DEPARTURE. This is the SAME window
                   that forms a workspace port-stay row, which is why zngStateOf() below asks
                   trMatchRow() for it rather than re-deriving anything (CLAUDE.md: no second
                   implementation, and the arrival/departure ladder is FROZEN).
     • At Sea    — between SOSP and EOSP, i.e. the sea passage proper.
     • In-Port   — the rest of the port-limit time: between EOSP and Arrival (inbound waiting,
                   anchorage, the manoeuvring approach), between Departure and SOSP (outbound),
                   AND the whole EOSP→SOSP window when no Arrival/Departure could be derived at
                   all (the "pure transit" stay, which the derivation merges into the voyage).

   WHY THIS IS WORTH SEEING. In-Port time is currently attributed to the VOYAGE leg for EU ETS —
   a 50% leg, not a 100% port stay — so an EU port with a long anchorage wait will show a big
   In-Port band sitting inside a To-EU/From-EU scope colour. That is not a bug in either view; it
   is the regulation's own boundary made visible, and it is precisely what the owner asked to be
   able to see. Do NOT "fix" one to agree with the other.

   COLOURS — read the ZNG_ZONE_COL note above first, it explains how crowded this gamut is.
   These three deliberately BREAK that note's "no bucket may be blue" rule, and here is the
   justification, because a reviewer should not have to guess:
     • That rule exists because the Eligibility bars and the Distance bars live in the SAME chart,
       where a blue bucket bar could be mistaken for a Distance bar. These bands are not bars in
       any panel — they are a dedicated strip of their own (see zngBandStrip), which never shares
       a row with Distance or with a fuel.
     • The three states are ORDINAL — open sea → inside port limits → stopped alongside — and a
       light-to-dark ramp of one hue is the correct, readable encoding for an ordinal series. It
       also survives deuteranopia/protanopia far better than the seven scope hues do, because the
       distinction rests on LIGHTNESS, not hue.
     • As a contiguous strip they are read against each OTHER, side by side, which is the case a
       ramp handles well. (2026-07-31h's failure was four shades of blue on isolated 3px bars
       scattered through a panel — the opposite situation.)
   The one honest collision: UPDATED 2026-08-01r. This used to read "the mid steel blue-grey sits
   at a similar LIGHTNESS to the To-EU warm stone grey (#78716c)". That collision is GONE — To-EU
   is no longer a grey at all, it is the sage green #7a8c5e. The note is not simply deleted,
   because the same seat is now taken by a different pair: the mid steel blue-grey (#7ea0b7) sits
   close to the EU-EU slate-blue (#6d86a8, lightened 2026-08-01q) in the ribbon directly above this
   strip. Same mitigation as before — different, separately-headed groups — and the owner was shown
   that exact adjacency at real scale and accepted it. Flagged rather than hidden. */
var ZNG_STATES = [
  { id:"sea",   label:"At Sea",   hint:"Sea passage — between the SOSP (Start of Sea Passage) that opens the leg and the EOSP (End of Sea Passage) that closes it. The EOSP report itself counts here: its period is the passage ending at that point." },
  { id:"port",  label:"In-Port",  hint:"Inside port limits but NOT alongside — between the EOSP and the derived Arrival (inbound waiting, anchorage, the approach), between the derived Departure and the SOSP (outbound), and the whole EOSP→SOSP window when no Arrival/Departure could be derived. Note: this time is attributed to the VOYAGE leg for EU ETS (50%), not to the port stay (100%)." },
  { id:"berth", label:"At-Berth", hint:"Between the derived Arrival and the derived Departure — exactly the window that forms a port-stay row in the Workspace and is scored at 100% when the stay is a Port of Call. Read from that row, never re-derived here." }
];
var ZNG_STATE_COL = {
  sea:  "#bcd3e0",   // pale ice blue-grey  — open water, nothing constraining
  port: "#7ea0b7",   // mid steel blue-grey — inside port limits, waiting
  berth:"#24455c"    // deep navy           — stopped alongside; the 100%-scope end of the ramp
};

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
var ZNG_TTL   = 24;    // title band above a FULL-height panel (scaled per panel — ZNG_CHROME_WT)
var ZNG_PGAP  = 13;    // breathing room below a FULL-height panel (likewise)
var ZNG_TOP   = 8;
var ZNG_XH    = 34;    // the pinned date-axis strip (its own SVG, see the layout note above)
var ZNG_BH    = 26;    // the pinned operational-state band strip (2026-08-01b, see zngBandStrip)
var ZNG_BCELL = ZNG_BH - 11;   // 15 — the Operation strip's visible coloured cells
var ZNG_MINSLOT = 9;   // below this the bars stop shrinking and the chart scrolls sideways

/* 2026-08-01d (Aurvin, owner instruction — the LAST word on Eligibility's height, replacing both
   08-01b and 08-01c). Three instructions in one:

     1. "Fix the eligibility percentage height, as you have already fixed the operations width" —
        i.e. stop it being a share of whatever is left over. It is now a FIXED PIXEL HEIGHT, like
        the Operation strip, and does not move when panels are ticked or the window is resized.
     2. "Keep the height of the eligibility bars double as width of operation strip" — confirmed in
        the clarifying round as measured against the strip's VISIBLE COLOURED CELLS: those are
        ZNG_BCELL (15px), so the Eligibility bars are 2 × 15 = 30px. Written as the arithmetic and
        not as the literal 30, so that if the Operation strip is ever re-sized the stated 2:1
        relationship survives instead of quietly becoming 2.4:1.
     3. "Lock the eligibility, same like operations, and take it out of the parameter selection" —
        it is no longer in ZNG_PANELS at all. It cannot be unticked, it never scrolls out of view,
        and the Parameter group no longer lists it. Eligibility is the one reading that tells you
        WHY a period costs what it costs, so the owner wants it permanently on screen next to the
        Operation band rather than one tick away.

   WHY THIS IS BETTER THAN THE PANEL IT REPLACES, beyond the owner asking: as a panel it competed
   for height with quantities that genuinely need a Y axis to be read (tonnes, allowances). It never
   did — its axis is a fixed 0–100% and every bar is one flat value. As a pinned strip it costs the
   panels nothing at all, and it sits against the Operation strip, which is the other "what kind of
   period was this" reading. The two are now a matched pair, read together, with one shared tooltip.

   Row height = the bars, plus the same 5px top / 6px bottom padding the Operation row uses, so the
   two strips are visually consistent blocks. */
var ZNG_ECELL = ZNG_BCELL * 2;         // 30 — Eligibility bars, twice the Operation cells
var ZNG_EH    = ZNG_ECELL + 11;        // 41 — the whole pinned Eligibility row
var ZNG_EPAD_T = 5;                    // top padding inside both pinned strips

/* 2026-08-01b (Aurvin, owner instruction — Task 1): "reduce the size of eligibility bars by half
   vertically, this will create more space for other graphs."
   Until now EVERY panel drew at one shared height. A panel's height is now weight × the render's
   unit height, and Eligibility's weight is 0.5. Anything not listed weighs 1.
   WHY A WEIGHT AND NOT A SUBTRACTED CONSTANT: the unit height is itself dynamic (it grows when the
   ticked panels fit with room to spare — see the zngNaturalH note below), so a fixed "-39px" would
   make Eligibility a different FRACTION of the others at every window size. A weight keeps the
   owner's "half" true at any size, which is what he actually asked for.
   Eligibility is the right panel to halve: its axis is a fixed 0–100%, its bars are one flat value
   per report rather than a stack to read apart, and the shape you look for in it (which band of
   colour, where the % steps) survives being squat. The freed pixels go to the OTHER ticked panels
   automatically, because they simply take a bigger share of the same total — no other change.

   2026-08-01c (Aurvin, owner instruction — SECOND round): "reduce the eligibility further, to half
   of its present size… cut down the Eligibility height by half IN PROPORTION TO EACH ITEM. No
   change in the width, just change in the overall height."
   So this round halves the WHOLE ROW, not just the plot: the title band, the plot area and the gap
   below all shrink together, and the axis text shrinks with them — the row is a scale model of its
   former self rather than a squashed one. Concretely, per panel row:
                        title    plot    gap     row
       full panel        24  +   78  +   13  =  115
       elig, 08-01b      24  +   39  +   13  =   76     (only the plot was halved)
       elig, 08-01c      12  + 19.5  +  6.5  =   38     (= exactly half of 76) ✓
   THIS IS WHY THERE ARE NOW TWO WEIGHTS AND NOT ONE. Measured against a FULL panel's own items,
   the plot is at 0.25 (halved twice) while the title and gap are at 0.5 (halved once, this round,
   having been left alone in 08-01b). A single uniform factor cannot express that, and forcing one
   would either leave the chrome oversized or overshoot the owner's "half of its present size".
   The saving is real: the row gives back 38px, which on the default three-panel view is ~19px each
   to EUA/UKA and Total Cons.
   ZNG_PH_MIN is the floor the owner asked for (clarifying round, 08-01c): a quarter-weight panel
   on a short window with every panel ticked would otherwise compute down to a few pixels, where
   the bars stop meaning anything. Below the floor the panel simply stops shrinking and the pane
   scrolls instead — the same "fit first, then grow, never shrink past readable" rule the other
   panels have followed since 2026-07-31g.

   2026-08-01d (Aurvin, owner instruction — THIRD and final round): both maps are now EMPTY,
   because Eligibility stopped being a panel altogether — it became the pinned strip described
   above ZNG_EH. The weight machinery is deliberately KEPT rather than deleted: it is the only
   thing that lets a future panel be a different height, it costs nothing when every weight is 1
   (`zngNaturalH` etc. then produce byte-identical output to the pre-08-01b code), and deleting it
   would mean rewriting the same accumulation logic the next time this comes up. Put an id in
   either map to shrink a panel; nothing else needs touching. */
var ZNG_PH_WT     = {};   // plot area, as a fraction of ZNG_PH_BASE   (empty = every panel full)
var ZNG_CHROME_WT = {};   // title band + gap, as a fraction of ZNG_TTL / ZNG_PGAP
var ZNG_PH_MIN    = 16;   // a plot area never draws shorter than this
function zngPanelWt(pn){ var w = pn && ZNG_PH_WT[pn.id]; return (w > 0) ? w : 1; }
function zngChromeWt(pn){ var w = pn && ZNG_CHROME_WT[pn.id]; return (w > 0) ? w : 1; }
function zngTitleH(pn){ return ZNG_TTL * zngChromeWt(pn); }
function zngGapH(pn){ return ZNG_PGAP * zngChromeWt(pn); }
/* the plot height of one panel at a given unit height, floor applied. EVERY height in this file
   goes through here — tops, the drawn rects, the axis ticks, the captions — so the floor can never
   be honoured in one place and ignored in another (which is how a stacked layout goes crooked). */
function zngPlotH(pn, ph){ return Math.max(ZNG_PH_MIN, zngPanelWt(pn) * ph); }
function zngWtSum(list){
  var t = 0;
  for(var i = 0; i < list.length; i++) t += zngPanelWt(list[i]);
  return t || 1;
}
/* the fixed (non-scaling) part of the stack: every panel's title band and gap added up. Comes off
   the available height BEFORE the remainder is shared out by plot weight. */
function zngChromeSum(list){
  var t = 0;
  for(var i = 0; i < list.length; i++) t += zngTitleH(list[i]) + zngGapH(list[i]);
  return t;
}
/* 2026-08-01c: the axis text scales with the row so a quarter-height panel is a scale model, not a
   squashed one — at 12px of title band a 10.5px title would sit on top of its own plot, and three
   9.5px tick labels cannot share 19.5px without colliding.
   The floor is a readability limit, not proportionality: text below ~7px is not readable on a
   normal screen, so shrinking past it would defeat the purpose of drawing the labels at all. In
   practice at the owner's 0.5 chrome weight nothing is clamped — title 10.5→7.9, ticks 9.5→7.1 —
   so this only guards a future, smaller weight. */
function zngFontScale(pn){ return zngChromeWt(pn); }
function zngScaledFont(pn, base, min){
  var v = base * zngFontScale(pn);
  return Math.round(Math.max(min, v) * 10) / 10;
}

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
/* 2026-08-01b: now takes the ticked panel LIST, not a count, because a half-height panel needs
   less natural room than a full one. Title band and gap are FIXED per panel (they hold text, they
   do not scale); only the plot area is weighted. Passing a number still works — an older caller
   would just get the all-weight-1 answer — but every caller in this file passes the list. */
function zngNaturalH(list){
  if(typeof list === "number"){
    var n = Math.max(1, list);
    return ZNG_TOP + n * (ZNG_TTL + ZNG_PGAP + ZNG_PH_BASE);
  }
  if(!list.length) return ZNG_TOP + ZNG_TTL + ZNG_PGAP + ZNG_PH_BASE;
  /* 2026-08-01c: summed panel by panel rather than n × a constant — title bands and gaps now
     differ between panels too (ZNG_CHROME_WT), so there is no single per-panel row height left
     to multiply by. Uses zngPlotH() so the floor is in the natural size as well; without that a
     floored panel would draw taller than the height its own axis SVG was sized to. */
  var h = ZNG_TOP;
  for(var i = 0; i < list.length; i++){
    h += zngTitleH(list[i]) + zngPlotH(list[i], ZNG_PH_BASE) + zngGapH(list[i]);
  }
  return h;
}
function zngAvailH(){
  var pane = document.getElementById("zng-panes");
  var h = pane ? pane.clientHeight : 0;
  return (h > 60) ? h : 0;     // 0 = "not measurable yet", callers fall back to natural size
}
/* `ph` is this render's UNIT plot height — the height of a weight-1 panel. It equals ZNG_PH_BASE
   whenever the ticked panels do not all fit (the pane then scrolls) and grows above it when they
   do fit with room to spare. Omit it to read the value zngChart() cached on ZNG.panels for this
   same render — every caller outside zngChart() (zngAxis, zngHoverAt, the captions, the totals)
   relies on that cache rather than recomputing, because the value depends on a live DOM
   measurement and recomputing could legitimately give a different answer mid-render.

   2026-08-01b: the top of panel i is now an ACCUMULATION over the panels above it, not i × a
   constant, because those panels no longer all have the same height (see ZNG_PH_WT). The list is
   read from the same cache for the same reason — zngChart() sets ZNG.panels BEFORE it draws its
   first panel, precisely so this function is consistent with the SVG being built around it. */
function zngPanelList(){ return (ZNG.panels && ZNG.panels.list) || zngActive(); }
function zngUnitPh(ph){
  if(ph != null) return ph;
  return (ZNG.panels && ZNG.panels.ph != null) ? ZNG.panels.ph : ZNG_PH_BASE;
}
/* the plot height of panel i itself — weight × unit, floored. Use this, never `ph` directly,
   anywhere a height is needed for a SPECIFIC panel (bar geometry, gridlines, caption centring). */
function zngPanelPh(i, ph){
  var list = zngPanelList();
  return zngPlotH(list[i], zngUnitPh(ph));
}
/* 2026-08-01c: the title band is per-panel too, so the top of a panel's PLOT is the accumulated
   rows above it plus THIS panel's own (possibly shrunken) title band — not a constant ZNG_TTL. */
function zngPanelTop(i, ph){
  var p = zngUnitPh(ph), list = zngPanelList(), y = ZNG_TOP, k;
  for(k = 0; k < i && k < list.length; k++){
    y += zngTitleH(list[k]) + zngPlotH(list[k], p) + zngGapH(list[k]);
  }
  /* defensive: if i somehow runs past the cached list (a stale index during a re-render), fall
     back to full-size spacing for the overshoot rather than returning a top of NaN */
  if(i > list.length) y += (i - list.length) * (ZNG_TTL + p + ZNG_PGAP);
  return y + (list[i] ? zngTitleH(list[i]) : ZNG_TTL);
}

/* 2026-07-31g (owner instruction): panels that start UNTICKED on a fresh workspace. The
   per-machine split is the detail view — opt in when you want it. See zngSyncFilters().

   2026-08-01 (owner instruction, with the new EUA/UKA panel): the DEFAULT VIEW is now exactly
   three panels — EUA/UKA, Total Cons, Eligibility. Distance and ROB moved into the opt-in set
   alongside the four per-machine panels: the owner's stated default is "1. EUA/UKA 2. Total
   consumption 3. Eligibility", i.e. the compliance answer, the burn behind it, and the scope
   that connects them. Everything else is one tick away. */
var ZNG_PANEL_OFF_BY_DEFAULT = { dist:1, me:1, ae:1, blr:1, oth:1, rob:1 };

var ZNG_PANELS = [
  /* 2026-08-01 (owner instruction): FIRST panel, above Distance. Allowances to surrender —
     EUAs (EU ETS) and UKAs (UK ETS) — per report. See the zngEtsIndex() note for where the
     numbers come from and why this file does not compute them itself. */
  { id:"ets",  title:"EUA/UKA",     unit:"tCO₂e", kind:"ets" },
  { id:"dist", title:"Distance",    unit:"nm", kind:"single" },
  { id:"me",   title:"ME Cons",     unit:"mt", kind:"stack"  },
  { id:"ae",   title:"AE Cons",     unit:"mt", kind:"stack"  },
  { id:"blr",  title:"BLR Cons",    unit:"mt", kind:"stack"  },
  { id:"oth",  title:"Others Cons", unit:"mt", kind:"stack"  },
  { id:"tot",  title:"Total Cons",  unit:"mt", kind:"stack"  },
  { id:"rob",  title:"ROB",         unit:"mt", kind:"stack"  }
  /* 2026-08-01d (Aurvin, owner instruction): ELIGIBILITY IS NO LONGER A PANEL. It is a pinned
     strip of its own now (zngEligStrip), locked on screen beside the Operation strip and
     deliberately absent from the Parameter list — see the note above ZNG_EH. Do not add it back
     here: two renderers for one quantity is exactly what this file's header note forbids. */
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

/* 2026-08-01b (Aurvin, owner instruction — Task 2): which of the three operational bands a report
   belongs to. See the ZNG_STATES note above for the owner's definitions.

   HOW IT DECIDES, and why in this order:
     1. A stock-only record (FUEL_STOCK / bunkering) or a report with no REPORT_TYPE at all has no
        operational state and returns null. Like an unmatched Scope report, a null-state report is
        ALWAYS plotted and is immune to these ticks — nothing may silently disappear.
     2. AT-BERTH comes from the WORKSPACE ROW, not from this file: trMatchRow() is js/ui.js's own
        report→row matcher (the same one zngZoneOf() and the Eligibility panel use), and a row of
        kind "port" IS the derived Arrival→Departure window. So "At-Berth" here and "port stay"
        in the Workspace, the Leg-Wise table and the EU ETS 100% scoring are the same fact read
        once. The frozen arrival/departure ladder is not touched, copied or second-guessed.
        Row matching also gets the boundary right for free: trMatchRow's window is tStart
        EXCLUSIVE / tEnd INCLUSIVE, so the inbound approach report (whose period ENDS at the
        arrival instant) belongs to the leg, and the departure report (whose period ends at the
        departure instant) belongs to the stay — exactly the owner's "between Arrival and
        Departure".
     3. Everything else splits on the ship's OWN reported type. AT_SEA and ARRIVAL-EOSP are sea
        passage: both describe a period that ends at or during the passage, EOSP being its close.
        IN_PORT and DEPARTURE-SOSP are port-limit time: the inbound wait, the outbound run to the
        SOSP, and — when no Arrival/Departure was derivable — the whole EOSP→SOSP window, which
        the derivation merges into the voyage as pure transit. That is the owner's third In-Port
        case and it needs no special code: such a stay has no port row, so step 2 does not fire.
   The one approximation, stated rather than buried: a report whose row the engine skipped (dated
   outside the reporting year, say) has no matched row, so an at-berth period there reads as
   In-Port. It is the same "no confident match" limit the Eligibility and EUA/UKA panels already
   carry, and it only affects periods that are out of scope anyway. */
function zngStateOf(rep){
  var rt = String((rep && rep.rt) || "").trim().toUpperCase();
  if(!rt || rt === "FUEL_STOCK" || rt === "FUEL_OIL_BUNKER") return null;
  var row = null;
  try{ row = (typeof trMatchRow === "function") ? trMatchRow(rep) : null; }catch(e){}
  if(row && row.kind === "port") return "berth";
  if(rt === "AT_SEA" || rt === "ARRIVAL-EOSP") return "sea";
  return "port";
}

/* ---------------------------------------------------------------- EUA / UKA allowances */
/* 2026-08-01 (owner instruction): the new FIRST panel plots ALLOWANCES TO SURRENDER per report —
   EUAs for EU ETS, UKAs for UK ETS — the same quantity the full-screen EU ETS / UK ETS cards and
   the Leg-Wise "EUAs" column show.

   WHERE THE NUMBERS COME FROM, and why this file does NOT compute them itself.
   The ETS rules (100%/50% coverage, the 40/70/100% phase-in, bio zero-rating, LNG methane slip
   per consumer, the AR4/AR5 GWP choice, the UK 1-Jul-2026 window) all live in js/engine.js and
   are ALREADY applied there, per workspace row and per fuel: computeAll(S).rowDetails[i].fuels[j]
   carries `euas` (covered CO₂e × phase-in, engine.js line ~698) and `ukCO2e` (the UKAs figure the
   UK ETS card prints). This panel therefore ASKS THE ENGINE and apportions, exactly as the
   Eligibility panel asks js/ui.js's trCoverage() instead of re-deriving coverage. CLAUDE.md's
   standing rule: no second implementation of a regulatory calculation.

   THE APPORTIONMENT. A workspace row (a leg or a port stay) is usually several reports long, and
   the chart's X axis is one bar per REPORT. So each report takes the share of its row's allowances
   that matches its share of that row's fuel, per fuel:
       report EUA(fuel) = row.fuels[fuel].euas × (report tonnes of that fuel ÷ row tonnes of it)
   Consequences, stated plainly because they are the honest limits of this figure:
     • Summing every report of a row returns the row's own engine figure exactly, so the panel's
       total agrees with the engine's total. That is what tools/verify_graph_popup.js asserts.
     • It is EXACT for every fuel whose allowances are linear in tonnes (all conventional fuels).
       For LNG only, methane slip differs by consumer (ME vs AE vs boiler), so splitting a row's
       LNG allowances by mass alone is an approximation WITHIN the row — the row total is still
       exact. Making it exact per report would mean re-deriving slip here, i.e. forking the
       engine, which is precisely what the rule above forbids.
     • A report with no confident workspace-row match (the "–" state in the REPORTS table) gets NO
       allowance figure at all — a hatched stub, never a 0 — same treatment Eligibility gives it.
     • A row the engine skipped (dated outside the selected reporting year / date range) likewise
       has no det, so its reports show the stub. That is correct: allowances belong to a year.
   Fuel ticks are honoured (owner instruction 2026-08-01): the per-fuel store below is summed over
   the TICKED fuels only, so the bars and the total always equal each other — the same invariant
   the consumption panels keep. */
function zngEtsKey(o){ return (o.kind || "") + "|" + (o.tStart || "") + "|" + (o.tEnd || ""); }
function zngEtsIndex(){
  var R = null;
  try{ if(typeof computeAll === "function" && typeof S !== "undefined") R = computeAll(S); }catch(e){ R = null; }
  var idx = {}, dets = (R && R.rowDetails) || [];
  for(var i = 0; i < dets.length; i++) idx[zngEtsKey(dets[i])] = dets[i];
  return { idx:idx,
           year:  (R && R.year != null) ? R.year : null,
           phase: (R && R.ets && R.ets.phase != null) ? R.ets.phase : null,
           basis: (R && R.ets && R.ets.basisLabel) ? R.ets.basisLabel : "" };
}

/* One point per report. Per-fuel figures follow trFuelLines() in js/ui.js EXACTLY, including
   Others = max(0, Total − (ME + AE + BLR)) — so the panels sum back to the table's columns. */
function zngBuild(){
  try{ if(typeof trAnnotate === "function") trAnnotate(); }catch(e){}
  var reps = zngReports();
  var pts = [], fuelSet = {}, anyMach = false, anyEts = false;
  /* one engine call for the whole build (2026-08-01) — see the zngEtsIndex() note above */
  var E = zngEtsIndex();

  for(var i = 0; i < reps.length; i++){
    var r = reps[i], m = r.mach || null;
    if(m) anyMach = true;
    var names = {};
    var add = function(o){ if(o) for(var k in o) if(o.hasOwnProperty(k)) names[k] = 1; };
    add(r.fuels); add(r.rob);
    if(m){ add(m.ME); add(m.AE); add(m.BLR); }

    var p = { t:r.t || r.te || r.ts || null, rep:r, rt:r.rt || "", role:r.role || "",
              dist:Number(r.dist) || 0, me:{}, ae:{}, blr:{}, oth:{}, tot:{}, rob:{},
              /* 2026-08-01: per-fuel allowances, filled below. etsRow stays false when this
                 report has no engine-computed row behind it — the panel then draws the same
                 "no confident match" stub the Eligibility panel uses, never a zero. */
              eua:{}, uka:{}, etsRow:false };

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
    /* 2026-08-01b: the operational band (At Sea / In-Port / At-Berth) — see zngStateOf() */
    p.state = zngStateOf(r);

    /* EUA / UKA — apportioned from the matched row's ENGINE figures (see the zngEtsIndex() note).
       trMatchRow() is js/ui.js's own report→row matcher, the same one zngZoneOf() and trCoverage()
       use, so a report can never be on one row here and a different row in the table. */
    var mrow = null;
    try{ if(typeof trMatchRow === "function") mrow = trMatchRow(r); }catch(e){ mrow = null; }
    var det = mrow ? E.idx[zngEtsKey(mrow)] : null;
    if(det && det.fuels && det.fuels.length){
      p.etsRow = true; anyEts = true;
      var feById = {};
      for(var fj = 0; fj < det.fuels.length; fj++) feById[det.fuels[fj].id] = det.fuels[fj];
      for(var fn in p.tot){
        if(!p.tot.hasOwnProperty(fn)) continue;
        /* report fuel CODE → engine fuel ID, through js/ui.js's own OVD_FUEL_MAP (the same map
           the workspace rows were built with at import, so MGO/MDO folding matches exactly) */
        var fid = (typeof OVD_FUEL_MAP !== "undefined" && OVD_FUEL_MAP[fn]) ? OVD_FUEL_MAP[fn] : fn;
        var fe = feById[fid];
        if(!fe || !(Number(fe.tonnes) > 0)) continue;
        var share = (Number(p.tot[fn]) || 0) / Number(fe.tonnes);
        if(!(share > 0)) continue;
        p.eua[fn] = (Number(fe.euas)   || 0) * share;
        p.uka[fn] = (Number(fe.ukCO2e) || 0) * share;
      }
    }
    pts.push(p);
  }

  /* fuel display order: the app's own TR_FUEL_ORDER first, then anything else alphabetically */
  var order = (typeof TR_FUEL_ORDER !== "undefined" && TR_FUEL_ORDER) ? TR_FUEL_ORDER : [];
  var fuels = Object.keys(fuelSet).sort(function(a, b){
    var ia = order.indexOf(a) + 1 || 99, ib = order.indexOf(b) + 1 || 99;
    return (ia - ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  return { pts:pts, fuels:fuels, anyMach:anyMach, nAll:pts.length,
           /* 2026-08-01: reporting year, phase-in and basis wording for the EUA/UKA tooltip and
              its caption — read from the engine result, never restated as a literal here */
           anyEts:anyEts, etsYear:E.year, etsPhase:E.phase, etsBasis:E.basis };
}

/* the ticked-fuel EUA and UKA for one report. Fuel ticks are honoured here and ONLY here, which
   is what keeps "the total equals the bars you can see" true for this panel too (2026-08-01). */
function zngEtsSums(p, fuelsOn){
  var eua = 0, uka = 0;
  for(var i = 0; i < fuelsOn.length; i++){
    eua += Number((p.eua || {})[fuelsOn[i]]) || 0;
    uka += Number((p.uka || {})[fuelsOn[i]]) || 0;
  }
  return { eua:eua, uka:uka, sum:eua + uka };
}

/* ---------------------------------------------------------------- filter state */
function zngSyncFilters(D){
  if(!ZNG.fuels) ZNG.fuels = {};
  for(var i = 0; i < D.fuels.length; i++) if(!(D.fuels[i] in ZNG.fuels)) ZNG.fuels[D.fuels[i]] = true;
  if(!ZNG.zones){ ZNG.zones = {}; for(var j = 0; j < ZNG_ZONES.length; j++) ZNG.zones[ZNG_ZONES[j].id] = true; }
  /* 2026-08-01b: the three operational bands all start TICKED. They partition the timeline, so
     "all on" is the only default that shows the complete picture — unticking is how you isolate
     (e.g. leave only At-Berth to read port consumption on its own). */
  if(!ZNG.states){ ZNG.states = {}; for(var m = 0; m < ZNG_STATES.length; m++) ZNG.states[ZNG_STATES[m].id] = true; }
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
/* 2026-08-01b (owner instruction — Task 2, "AND: both must be ticked"): a report is EXCLUDED if
   EITHER filter rules it out, i.e. it survives only when its Scope bucket AND its operational band
   are both ticked. That is what lets you ask an intersection question — "At-Berth time in EU ports
   only" — which was the owner's stated reason for choosing AND.
   Both halves keep the same immunity rule the Scope filter has had since 2026-07-31e: a report
   whose bucket/band could not be determined (null) can never be excluded by that filter, so an
   unmatched or stock-only report never vanishes without explanation. And, as before, exclusion
   does not remove the column — the X axis never moves; the column just draws hatched. */
function zngZoneExcluded(p){ return p.zone != null && ZNG.zones && ZNG.zones[p.zone] === false; }
function zngStateExcluded(p){ return p.state != null && ZNG.states && ZNG.states[p.state] === false; }
function zngExcluded(p){ return zngZoneExcluded(p) || zngStateExcluded(p); }
/* the subset actually counted as "in scope" right now — used for the rail's summary count and
   for axis-scaling (an excluded period should not stretch the Y axis for the ones you kept) */
function zngActivePts(D){ return D.pts.filter(function(p){ return !zngExcluded(p); }); }

function zngToggleFuel(f, on){ ZNG.fuels[f] = !!on; ZNG.hi = -1; zngRender(); }
function zngToggleZone(z, on){ ZNG.zones[z] = !!on; ZNG.hi = -1; zngRender(); }
function zngToggleState(st, on){ ZNG.states[st] = !!on; ZNG.hi = -1; zngRender(); }
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
function zngAllStates(on){
  for(var i = 0; i < ZNG_STATES.length; i++) ZNG.states[ZNG_STATES[i].id] = !!on;
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
    /* 2026-08-01: EUA and UKA share ONE axis (both are tCO₂e of allowances), so the range is the
       tallest of either series — not their sum, since they are drawn as separate bars. */
    else if(panel.kind === "ets"){
      var e = zngEtsSums(pts[i], fuelsOn);
      mx = Math.max(mx, e.eua, e.uka);
    }
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
  /* 2026-08-01 (owner instruction — "total EUA and total UK, displayed as per the filter
     condition"): the split is by SCHEME, not by fuel, because that is the pair of numbers a
     compliance reader needs. Both follow the Scope and Fuel ticks like every other total here.
     The combined figure is simply EUA + UKA: allowances are a count of tCO₂e certificates, and
     a report can never carry both (a non-zero UK score forces a zero EU score — see the
     exclusivity proof in the Eligibility branch of zngChart), so nothing is double-counted. */
  if(panel.kind === "ets"){
    var eT = 0, uT = 0;
    for(i = 0; i < pts.length; i++){
      var es = zngEtsSums(pts[i], fuelsOn);
      eT += es.eua; uT += es.uka;
    }
    return { total:eT + uT, ets:true,
             parts:[{ f:"EUA", v:eT, c:ZNG_EU_COL, off:false },
                    { f:"UKA", v:uT, c:ZNG_UK_COL, off:false }] };
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
              (T.ets
                 ? ", split into EUAs (EU ETS) and UKAs (UK ETS). Both are allowances to surrender " +
                   "— covered CO₂e × eligibility × phase-in, straight from the engine — and both " +
                   "follow your Fuel ticks. A report is never in both schemes, so the combined " +
                   "figure is just their sum"
                 : (T.parts ? ", split by fuel. A fuel you have unticked reads 0.00 rather than " +
                              "disappearing, so the list of fuels never changes shape" : "")) +
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
  /* 2026-08-01b: `ph` is now the UNIT height (a weight-1 panel). Title bands and gaps are fixed
     per panel and come off the top before the remainder is shared out by weight, so a half-height
     Eligibility panel gives its freed pixels to the other ticked panels — which is exactly the
     "more space for the other graphs" the owner asked for — rather than to blank space. The
     natural-vs-available comparison itself is unchanged (2026-07-31g). */
  var natural = zngNaturalH(P);
  var avail = zngAvailH();
  var H = (avail > natural) ? avail : natural;
  var ph = nOn > 0
    ? Math.max(20, (H - ZNG_TOP - zngChromeSum(P)) / zngWtSum(P))
    : ZNG_PH_BASE;
  /* 2026-08-01c: H is now RE-DERIVED from the rows actually drawn rather than trusted from the
     calculation above, because zngPlotH()'s minimum can make a row taller than its share. If the
     SVG kept the pre-floor height its last panel would be clipped. When no floor binds this is
     arithmetically identical to the old value (the shares add back up to H exactly), so the
     "panels grow to fill the measured space, no blank strip at the bottom" behaviour is
     unchanged — tools/verify_graph_popup.js asserts hGrown === the measured height. */
  if(nOn > 0){
    var drawn = ZNG_TOP;
    for(var hi = 0; hi < P.length; hi++) drawn += zngTitleH(P[hi]) + zngPlotH(P[hi], ph) + zngGapH(P[hi]);
    H = Math.max(H, drawn);
  }

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
    var raw = zngPanelMax(activePts, pn, fuelsOn);
    if(ZNG_FLOORED[pn.id] && meAxisMax > 0) raw = Math.max(raw, meAxisMax * ZNG_FLOOR_PCT);
    return zngNiceCeil(raw);
  });
  ZNG.panels = { list:P, maxes:maxes, slot:slot, barW:barW, W:W, H:H, n:n, pts:pts, ph:ph };

  for(var pi = 0; pi < P.length; pi++){
    /* 2026-08-01b: `pph` is THIS panel's own plot height (weight × the unit `ph`). Everything
       below draws against pph — a stray `ph` in here would make the half-height Eligibility panel
       draw bars taller than its own background. */
    var pn = P[pi], top = zngPanelTop(pi, ph), mx = maxes[pi], pph = zngPlotH(pn, ph);
    var Y = (function(t, m, hh){ return function(v){ return t + hh - (m > 0 ? (v / m) * hh : 0); }; })(top, mx, pph);

    /* plot background + gridlines (0 / mid / max; the Eligibility panel's mid IS the 50% band) */
    s.push('<rect x="0" y="' + top + '" width="' + W + '" height="' + pph + '" fill="#fbfcfd"></rect>');
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
                 '" height="' + pph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var v = Number(pts[i].dist) || 0; if(!(v > 0)) continue;
        var x = i * slot + (slot - barW) / 2, y = Y(v);
        s.push('<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(2) +
               '" height="' + Math.max(0.6, top + pph - y).toFixed(1) + '" fill="' + ZNG_DIST_COL + '"></rect>');
      }
    } else if(pn.kind === "stack"){
      for(var i2 = 0; i2 < n; i2++){
        if(zngExcluded(pts[i2])){
          s.push('<rect x="' + (i2 * slot).toFixed(2) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(2) +
                 '" height="' + pph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
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
    } else if(pn.kind === "ets"){
      /* 2026-08-01 (owner instruction): EUA and UKA in ONE panel, two series.
         EU ETS and UK ETS are mutually exclusive per report — the same structural proof written
         out in the Eligibility branch below (a non-zero UK coverage needs BOTH ends UK, a non-zero
         EU coverage needs at least one end EEA, and a port has exactly one zone). So in practice
         exactly one of the two bars exists and it is drawn FULL WIDTH, which matters at the
         owner's stated usage of ~300 reports at once where a bar is only a few px wide.
         The both-non-zero case is still handled — two half-width bars side by side — so that if
         the zone rules ever change, a real UKA figure is never hidden behind an EUA bar.
         A report with no engine row behind it gets the hatched stub, not a zero (see zngBuild). */
      for(var i4 = 0; i4 < n; i4++){
        if(zngExcluded(pts[i4])){
          s.push('<rect x="' + (i4 * slot).toFixed(2) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(2) +
                 '" height="' + pph.toFixed(1) + '" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var p4 = pts[i4], x4 = i4 * slot + (slot - barW) / 2;
        if(!p4.etsRow){
          s.push('<rect x="' + x4.toFixed(2) + '" y="' + (top + pph - 5).toFixed(1) + '" width="' + barW.toFixed(2) +
                 '" height="5" fill="url(#zng-hatch)"></rect>');
          continue;
        }
        var e4 = zngEtsSums(p4, fuelsOn);
        var both = e4.eua > 0 && e4.uka > 0;
        var bw4 = both ? barW / 2 : barW;
        var draw = function(v, xx, col){
          if(!(v > 0)) return;
          var yy = Y(v);
          s.push('<rect x="' + xx.toFixed(2) + '" y="' + yy.toFixed(1) + '" width="' + bw4.toFixed(2) +
                 '" height="' + Math.max(0.6, top + pph - yy).toFixed(1) + '" fill="' + col + '"></rect>');
        };
        draw(e4.eua, x4, ZNG_EU_COL);
        draw(e4.uka, both ? x4 + bw4 : x4, ZNG_UK_COL);
      }
    }
    /* 2026-08-01d: there is no `else` any more. Eligibility used to be the fall-through branch
       here; it is now the pinned strip zngEligStrip() draws. An unrecognised panel kind therefore
       renders an empty plot rather than being silently drawn as an eligibility chart. */
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

/* the PINNED Eligibility strip (2026-08-01d, Aurvin, owner instruction — see the long note above
   ZNG_ECELL for the three instructions this implements).

   This is the SAME drawing the Eligibility panel used to do, moved out of the scrolling panel stack
   and given a fixed 30px height. Nothing about the numbers changed and nothing is recomputed here:
   `p.eu` / `p.uk` come from js/ui.js's own trCoverage(), exactly as before (see the ARCHITECTURE
   note at the top of this file), and the colour is the report's scope bucket from ZNG_ZONE_COL.

   ONE FULL-HEIGHT BAR PER REPORT, and why that cannot hide a UK figure (carried over from
   2026-07-31h, still true and still asserted by tools/verify_graph_popup.js): the owner's reasoning
   was "there will never be a situation when both EU and UK have non-zero %". That was checked
   against engine.js rather than taken on trust and it holds STRUCTURALLY, not just for one dataset —
   ukCoverage() > 0 requires BOTH voyage ends to be "UK", euCoverage() > 0 requires at least ONE end
   to be "EEA", and zoneOfLocode() gives a port exactly one zone. So a non-zero UK score forces a
   zero EU score and vice versa. `eu > 0 ? eu : uk` therefore never discards a real number, and if
   the zone rules ever change (a country joining or leaving the EEA) the test fails loudly rather
   than this strip quietly dropping UK bars.

   2026-08-01e (Aurvin, owner instruction — Task 2): "let's try to make the eligibility also like a
   stripe with two different widths: 50% and 100%, in the same manner as operation."

   THE GAPS ARE GONE. Cells now fill the WHOLE slot and butt edge to edge, exactly like the
   Operation strip, so consecutive reports in the same scope merge into one continuous band and you
   read a voyage's scope as a length of coloured ribbon rather than as 40 separate bars. The 08-01d
   note this replaces argued the opposite — "bars keep their gaps because this is a chart of a
   VALUE" — and that argument was not wrong so much as it was answering a question the owner has now
   decided differently: eligibility is not really a continuous measurement, it takes exactly three
   values (0%, 50%, 100%), so it behaves far more like a STATE than like a quantity, and the state
   is continuous in time in precisely the way the Operation strip's is. What the gaps used to buy —
   telling one report from the next — is still available from the sync line and the hover card.

   WHAT ENCODES THE PERCENTAGE IS NOW THICKNESS, not bar height against a scale: a 100% report fills
   the band, a 50% report fills half of it, bottom-aligned, so its top edge lands exactly on the 50%
   gridline. That is drawn PROPORTIONALLY (Y(pct)) rather than snapped to two hard-coded cases —
   for the 0/50/100 the regulation actually produces the two are identical, but if a coverage figure
   ever arrives that is neither, this draws the truth instead of rounding it into one of two boxes.

   THE THIRD AND FOURTH CASES, both settled with the owner in the clarifying round:
     • genuine 0% (out of scope for BOTH regimes) — a THIN GREY cell rather than a blank, so the
       ribbon stays continuous across the whole timeline and "out of scope" reads as a deliberate
       state instead of as missing data. Grey is ZNG_ZONE_COL.none, the same colour the rail's
       "Non EU/UK" checkbox shows, so the strip and the legend agree.
     • no confident match — stays HATCHED, and stays visually different from the grey, because
       "we could not match this report to a voyage/port row" is not a compliance answer at all.
   Those two are marked with different classes (zng-ecell / zng-ezero) so tools/verify_graph_popup.js
   can count them apart; nothing styles those classes. */
function zngEligStrip(){
  var P = ZNG.panels;
  var W = (P && P.W) || 1000, slot = (P && P.slot) || 1, n = (P && P.n) || 0, pts = (P && P.pts) || [];
  /* NOTE: P.barW is deliberately NOT used here any more (2026-08-01e) — this strip is a butted
     ribbon, not a bar chart. The consumption panels still use it; do not "restore" it here. */
  var top = ZNG_EPAD_T, h = ZNG_ECELL, bot = top + h;
  var s = ['<svg width="' + W + '" height="' + ZNG_EH + '" viewBox="0 0 ' + W + ' ' + ZNG_EH +
           '" xmlns="http://www.w3.org/2000/svg" style="display:block">'];
  s.push('<defs><pattern id="zng-ehatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
         '<rect width="5" height="5" fill="#eef2f5"></rect>' +
         '<line x1="0" y1="0" x2="0" y2="5" stroke="#c2cdd5" stroke-width="2"></line></pattern></defs>');
  /* plot background, then the 0 / 50 / 100 gridlines. The 50% line is kept and is the reason the
     owner can read a half-scope leg at a glance, even though (his choice, clarifying round) only
     the 100 is LABELLED — the label lives in the pinned pad, not in this scrolling SVG. */
  s.push('<rect x="0" y="' + top + '" width="' + W + '" height="' + h + '" fill="#fbfcfd"></rect>');
  var Y = function(v){ return bot - (Math.max(0, Math.min(100, v)) / 100) * h; };
  var gl = [0, 50, 100];
  for(var g = 0; g < gl.length; g++){
    s.push('<line x1="0" y1="' + Y(gl[g]).toFixed(1) + '" x2="' + W + '" y2="' + Y(gl[g]).toFixed(1) +
           '" stroke="' + (gl[g] === 0 ? "#c8d3da" : "#e7edf1") + '" stroke-width="1"></line>');
  }
  /* 2026-08-01e: every cell is the full slot wide now. The +0.4 closes the hairline seam
     antialiasing leaves between two butted rects — copied deliberately from zngBandStrip(), which
     had the same problem and the same fix, so the two strips line up pixel for pixel. */
  var cellW = (slot + 0.4).toFixed(2);
  for(var i = 0; i < n; i++){
    var p = pts[i], x = i * slot;
    if(zngExcluded(p)){
      s.push('<rect x="' + x.toFixed(2) + '" y="' + top + '" width="' + slot.toFixed(2) +
             '" height="' + h + '" fill="url(#zng-ehatch)"></rect>');
      continue;
    }
    if(p.eu == null && p.uk == null){
      /* no confident match — the same "–" the REPORTS table shows, drawn as a low hatched cell so
         it is visible, and visibly NOT the grey 0% cell below */
      s.push('<rect class="zng-enomatch" x="' + x.toFixed(2) + '" y="' + (bot - 5) + '" width="' + cellW +
             '" height="5" fill="url(#zng-ehatch)"></rect>');
      continue;
    }
    var euV = (p.eu != null && p.eu > 0) ? p.eu : null;              // EU takes priority (owner)
    var pct = euV != null ? euV : ((p.uk != null && p.uk > 0) ? p.uk : 0);
    if(!(pct > 0)){
      /* genuine 0% for both regimes — a thin grey cell keeps the ribbon unbroken (owner choice) */
      s.push('<rect class="zng-ezero" x="' + x.toFixed(2) + '" y="' + (bot - 3) + '" width="' + cellW +
             '" height="3" fill="' + ZNG_ZONE_COL.none + '"><title>' + zngEsc(zngStamp(p.t)) +
             ' — 0% (outside EU and UK ETS scope)</title></rect>');
      continue;
    }
    var yV = Y(pct);
    s.push('<rect class="zng-ecell" x="' + x.toFixed(2) + '" y="' + yV.toFixed(1) + '" width="' + cellW +
           '" height="' + Math.max(0.6, bot - yV).toFixed(1) + '" fill="' +
           (ZNG_ZONE_COL[p.zone] || (euV != null ? ZNG_EU_COL : ZNG_UK_COL)) + '"><title>' +
           zngEsc(zngStamp(p.t)) + " — " + zngNum(pct, pct % 1 ? 1 : 0) + '%</title></rect>');
  }
  s.push('<line id="zng-esync" x1="-99" y1="0" x2="-99" y2="' + ZNG_EH +
         '" stroke="#0e2c40" stroke-width="1" stroke-dasharray="3 3" opacity="0" pointer-events="none"></line>');
  /* its own hit area, so hovering the strip drives the same readout the panels do */
  s.push('<rect class="zng-shit" x="0" y="0" width="' + W + '" height="' + ZNG_EH + '" fill="transparent"></rect>');
  s.push("</svg>");
  return s.join("");
}

/* the PINNED operational-state band strip (2026-08-01b, Aurvin, owner instruction — Task 2).
   Sits between the scrolling panes and the pinned date axis, and scrolls sideways in lockstep with
   both (zngBindScrollSync mirrors all three). One filled cell per report, full slot width and butted
   edge to edge on purpose: the states partition the timeline, so a gap between cells would imply a
   period the ship was in none of them, which cannot happen.

   WHY A STRIP AND NOT A PANEL. The owner asked for this to cost the graphs nothing — a panel would
   take height from the very panels Task 1 just freed space for. A 26px strip reads the whole voyage
   pattern (sea → port → berth → port → sea) at a glance and stays put while the panels scroll.
   An unticked band still draws, but hatched — the same visual language the Scope filter uses for a
   ruled-out column, and the same promise: the X axis never moves and nothing silently disappears.
   A report with no determinable state (a bunkering/stock record) leaves its cell blank rather than
   guessing at one. */
function zngBandStrip(){
  var P = ZNG.panels;
  var W = (P && P.W) || 1000, slot = (P && P.slot) || 1, n = (P && P.n) || 0, pts = (P && P.pts) || [];
  var s = ['<svg width="' + W + '" height="' + ZNG_BH + '" viewBox="0 0 ' + W + ' ' + ZNG_BH +
           '" xmlns="http://www.w3.org/2000/svg" style="display:block">'];
  /* its own hatch pattern id — the panels' one lives in the other SVG and ids do not cross SVGs */
  s.push('<defs><pattern id="zng-bhatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
         '<rect width="5" height="5" fill="#eef2f5"></rect>' +
         '<line x1="0" y1="0" x2="0" y2="5" stroke="#c2cdd5" stroke-width="2"></line></pattern></defs>');
  var y = ZNG_EPAD_T, h = ZNG_BCELL;
  var lbl = {};
  for(var z = 0; z < ZNG_STATES.length; z++) lbl[ZNG_STATES[z].id] = ZNG_STATES[z].label;
  for(var i = 0; i < n; i++){
    var st = pts[i].state;
    if(st == null) continue;                       // no operational state — leave the cell empty
    var off = ZNG.states && ZNG.states[st] === false;
    var x = i * slot;
    /* +0.4 on the width closes the hairline seam antialiasing leaves between butted cells */
    /* the class is not styled anywhere — it exists so tools/verify_graph_popup.js can count the
       cells without also catching the hatch pattern's own inner rect */
    s.push('<rect class="zng-bcell" x="' + x.toFixed(2) + '" y="' + y + '" width="' + (slot + 0.4).toFixed(2) +
           '" height="' + h + '" fill="' + (off ? "url(#zng-bhatch)" : (ZNG_STATE_COL[st] || "#c3ced4")) + '">' +
           '<title>' + zngEsc(zngStamp(pts[i].t)) + " — " + zngEsc(lbl[st] || st) +
           (off ? " (unticked — excluded from every panel)" : "") + '</title></rect>');
  }
  /* the strip's own sync marker, moved by zngHoverAt() — the panels' sync line lives in the other
     SVG and cannot reach across, so without this the strip is the one row you cannot read on hover */
  s.push('<line id="zng-bsync" x1="-99" y1="0" x2="-99" y2="' + ZNG_BH +
         '" stroke="#0e2c40" stroke-width="1" stroke-dasharray="3 3" opacity="0" pointer-events="none"></line>');
  /* 2026-08-01d: hit area, so hovering the band strip drives the readout and the shared card too.
     It must come LAST — an SVG paints in document order, so an earlier transparent rect would sit
     under the cells and still take the events, but a later one is what actually receives them. */
  s.push('<rect class="zng-shit" x="0" y="0" width="' + W + '" height="' + ZNG_BH + '" fill="transparent"></rect>');
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
  var H = (P.H != null) ? P.H : zngNaturalH(list);
  var s = ['<svg width="' + ZNG_AXW + '" height="' + H + '" viewBox="0 0 ' + ZNG_AXW + ' ' + H +
           '" xmlns="http://www.w3.org/2000/svg" style="display:block">'];
  for(var i = 0; i < list.length; i++){
    /* 2026-08-01b: same per-panel height the plot used (weight × unit), or the 0 / 50 / 100 labels
       on the half-height Eligibility panel would sit off its gridlines entirely. */
    var pn = list[i], top = zngPanelTop(i, ph), mx = P.maxes[i], pph = zngPlotH(pn, ph);
    /* 2026-08-01c: title, unit and tick text all scale with the row (zngScaledFont) so a shrunken
       panel is a scale model rather than a squashed one, and the title's 10px lift off the plot
       scales with it too — at a 12px title band the old fixed 10px would have put the baseline
       almost on the plot edge. Full-height panels are unaffected (scale 1 → identical output). */
    var fT = zngScaledFont(pn, 10.5, 7), fU = zngScaledFont(pn, 9, 6.5), fV = zngScaledFont(pn, 9.5, 7);
    s.push('<text x="0" y="' + (top - 10 * zngChromeWt(pn)).toFixed(1) + '" font-size="' + fT +
           '" font-weight="700" fill="#0e2c40">' + zngEsc(pn.title) +
           ' <tspan font-size="' + fU + '" font-weight="600" fill="#93a2ac">(' + zngEsc(pn.unit) + ')</tspan></text>');
    var vals = [mx, mx / 2, 0];
    for(var k = 0; k < vals.length; k++){
      var v = vals[k], y = top + pph - (mx > 0 ? (v / mx) * pph : 0);
      var dp = (mx >= 100 || v === 0) ? 0 : (mx >= 10 ? 1 : 2);
      s.push('<text x="' + (ZNG_AXW - 7) + '" y="' + (y + fV / 3).toFixed(1) + '" text-anchor="end" font-size="' + fV +
             '" fill="#8a97a1">' + zngEsc(zngNum(v, dp)) + '</text>');
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
    return '<label class="zng-ck" title="' + zngEsc(f) + ' — shows or hides this fuel&#39;s colour band in the five consumption panels and in ROB, and removes its share of the EUA/UKA figures (2026-08-01). Distance and Eligibility are not per-fuel and are unaffected.">' +
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

  /* 2026-08-01b (owner instruction — Task 2): the three operational bands, LAST in the rail
     ("on the left pane at the bottom side"). Same swatch treatment as Scope, showing the exact
     colour used in the band strip under the chart. */
  var stateRows = ZNG_STATES.map(function(st){
    var on = ZNG.states[st.id] !== false;
    return '<label class="zng-ck" title="' + zngEsc(st.hint) +
      ' — untick to hatch out these periods in every panel; combined with your Scope ticks, a report is shown only when BOTH allow it.">' +
      '<input type="checkbox" ' + (on ? "checked " : "") + 'onchange="zngToggleState(\'' + st.id + '\',this.checked)">' +
      '<i class="sw" style="background:' + (ZNG_STATE_COL[st.id] || "#c3ced4") + '"></i>' +
      '<span>' + zngEsc(st.label) + '</span></label>';
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
      /* 2026-08-01b: last group, per the owner's "bottom side" instruction. "Operation" rather
         than "Activity" on purpose — "Activity" already names a different column in the LEGS
         view (the port/timeframe one), and reusing it here would invite the two to be confused. */
      grp("Operation", "zngAllStates", stateRows) +
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
  } else if(panel.kind === "ets"){
    /* 2026-08-01: allowances for this report. Per-fuel first (so the fuel ticks are legible in
       the same place the consumption panels show them), then the two scheme lines, then the
       phase-in actually used — read off the engine result, not restated here. */
    if(!p.etsRow){
      rows = '<div class="r zng-dim"><span>no matched voyage/port entry</span><b>–</b></div>';
    } else {
      var eS = zngEtsSums(p, fuelsOn);
      var D0 = ZNG.data || {};
      for(var fi2 = 0; fi2 < fuelsOn.length; fi2++){
        var fN = fuelsOn[fi2];
        var fV = (Number((p.eua || {})[fN]) || 0) + (Number((p.uka || {})[fN]) || 0);
        if(!(fV > 0)) continue;
        rows += '<div class="r"><i class="sw" style="background:' + zngFuelColour(fN, fi2) + '"></i><span>' +
                zngEsc(fN) + '</span><b>' + zngNum(fV, zngValDp(fV)) + '</b></div>';
      }
      rows += '<div class="r"><i class="sw" style="background:' + ZNG_EU_COL + '"></i><span>EUA (EU ETS)</span><b>' +
              zngNum(eS.eua, zngValDp(eS.eua)) + '</b></div>';
      rows += '<div class="r"><i class="sw" style="background:' + ZNG_UK_COL + '"></i><span>UKA (UK ETS)</span><b>' +
              zngNum(eS.uka, zngValDp(eS.uka)) + '</b></div>';
      /* 2026-08-01e (Aurvin, owner instruction — Task 1): the "phase-in <year> <pct>%" row was
         REMOVED. Owner: "for another parameter EUA/UKA tool tip the 'phase-in 100%' is not needed.
         These are extra info." It was never a per-report reading — it is one file-wide constant
         (D0.etsPhase, set once from the reporting year) repeated on every hover, and by 2026 the
         phase-in is 100% anyway, so the row spent a line saying "×1". The figure itself is
         UNCHANGED and still applied inside the engine (engine.js ~698, covered CO₂e × eligibility ×
         phase-in); only the restatement in this card is gone. It is still readable in the panel's
         own ⓘ / total tooltip, which names the year and the basis — see zngTotalsLayer(). */
      if(!(eS.eua > 0) && !(eS.uka > 0)){
        rows += '<div class="r zng-dim"><span>outside EU and UK ETS scope</span><b>0</b></div>';
      }
    }
  }
  /* 2026-08-01d: the old `else` branch here was the Eligibility tooltip. Eligibility is no longer a
     panel, so it has no .zng-tip card — its reading moved into the shared pinned card built by
     zngPinTip() below, together with the Operation band. An unrecognised panel kind now returns no
     rows rather than being rendered as an eligibility readout. */
  return rows;
}
/* 2026-08-01e (Aurvin, owner instruction — Task 1): THE ONE SHARED CARD IS SPLIT BACK INTO TWO,
   AND THE DATE LINE IS DROPPED FROM BOTH. Owner, verbatim: "Remove the date from this card. Split
   Eligibility and operation cards and keep them separate. Let's try this method first."

   WHY THE 08-01d ONE-CARD ARGUMENT NO LONGER APPLIES (it is directly above in the git history and
   a reviewer will ask). That argument was: two cards anchored to two strips ~70px apart must
   collide. It rested on each card being three or four rows tall — a date header, an eligibility
   row, an operation row and sometimes an "excluded" note. Removing the date and giving each card
   exactly ONE reading makes each card ~27px tall, and they are anchored in OPPOSITE directions:

     Eligibility card → .zng-erow, opens UPWARD  (CSS bottom:100%)  — sits over the last ~27px of
                        the panel stack, i.e. the very bottom of Total Cons near its zero line.
     Operation card   → .zng-brow, opens DOWNWARD (CSS top:100%)    — sits over the 34px date axis,
                        which carries no data values, only tick labels.

   So there is now ~70px of strip between them and neither can reach the other, and — the actual
   complaint that started this — the tall card that used to cover the middle of the Total Cons bars
   is gone. Nothing was lost by dropping the date: the hover header (#zng-head, zngHoverAt below)
   already shows the full timestamp of the same instant in its own fixed date column, so the card
   was repeating it three rows lower.

   If either card ever grows a second row again, re-check the clearance before adding it — the
   whole no-collision guarantee here is "one row each", and tools/verify_graph_popup.js pins it. */

/* the Eligibility card. Same figures and same wording as the shared card carried, minus the date.
   2026-08-01e (owner instruction): the scheme names "EU ETS / FuelEU" and "UK ETS" are REPLACED by
   the single word "Eligibility". Owner: "As these things are understood, when the scope text is
   visible." He is right — the zone label that follows it (From-EU / To-EU / EU-EU / At-EU, or
   UK-UK / At-UK) already names the regime unambiguously, and the swatch carries the bucket colour,
   so the scheme name was a third statement of the same fact. Confirmed in the clarifying round:
   swatch + scope text only. NOTE the known limitation this inherits — see the "NOT COLOUR-BLIND
   SAFE" note above ZNG_ZONE_COL: with the scheme name gone, EU vs UK now rests on the zone WORD
   (still fine in greyscale) rather than on the colour, which is if anything an improvement. */
function zngEligTip(p){
  if(!p) return "";
  var rows = "";
  if(p.eu == null && p.uk == null){
    rows += '<div class="r zng-dim"><span>Eligibility</span><b>–</b></div>' +
            '<div class="r zng-dim"><span class="n">no matched voyage/port entry</span></div>';
  } else {
    var zTip = null;
    for(var zt = 0; zt < ZNG_ZONES.length; zt++) if(ZNG_ZONES[zt].id === p.zone) zTip = ZNG_ZONES[zt];
    var euV = (p.eu != null && p.eu > 0) ? p.eu : null;
    var pct = euV != null ? euV : ((p.uk != null && p.uk > 0) ? p.uk : null);
    var lbl = "Eligibility";
    if(zTip) lbl += " — " + zTip.label;
    var col = ZNG_ZONE_COL[p.zone] || (euV != null ? ZNG_EU_COL : ZNG_UK_COL);
    rows += '<div class="r"><i class="sw" style="background:' + col + '"></i><span>' + zngEsc(lbl) + '</span><b>' +
            (pct == null ? "0%" : zngNum(pct, pct % 1 ? 1 : 0) + "%") + '</b></div>';
  }
  /* the exclusion note is split with the cards: the SCOPE filter is an eligibility fact, so it
     belongs here; the OPERATION filter's note moved to the operation card below. Each card now
     explains only the tick that rules its own reading out, which is shorter AND more precise than
     the combined "Scope and Operation" line it replaces. */
  if(zngZoneExcluded(p)){
    rows += '<div class="r zng-dim"><span class="n">excluded — Scope filter</span></div>';
  }
  return rows;
}

/* the Operation card — the other half of the 2026-08-01e split. One row, no date. */
function zngOpTip(p){
  if(!p) return "";
  var rows = "", sLbl = null;
  for(var si = 0; si < ZNG_STATES.length; si++) if(ZNG_STATES[si].id === p.state) sLbl = ZNG_STATES[si].label;
  if(sLbl){
    rows += '<div class="r"><i class="sw" style="background:' + (ZNG_STATE_COL[p.state] || "#c3ced4") +
            '"></i><span>Operation</span><b>' + zngEsc(sLbl) + '</b></div>';
  } else {
    rows += '<div class="r zng-dim"><span>Operation</span><b>–</b></div>';
  }
  if(zngStateExcluded(p)){
    rows += '<div class="r zng-dim"><span class="n">excluded — Operation filter</span></div>';
  }
  return rows;
}

function zngHoverAt(idx){
  var D = ZNG.data, P = ZNG.panels; if(!D || !P) return;
  var pts = P.pts || zngPts(D), list = P.list || zngActive();
  var line = document.getElementById("zng-sync");
  /* 2026-08-01b/d: each pinned strip is a separate SVG, so each needs its own sync marker */
  var bline = document.getElementById("zng-bsync");
  var eline = document.getElementById("zng-esync");
  /* 2026-08-01e: two cards now, one per strip — see the long note above zngEligTip() */
  var etip = document.getElementById("zng-etip");
  var btip = document.getElementById("zng-btip");
  var head = document.getElementById("zng-head");
  if(idx < 0 || idx >= pts.length){
    if(line) line.setAttribute("opacity", "0");
    if(bline) bline.setAttribute("opacity", "0");
    if(eline) eline.setAttribute("opacity", "0");
    if(etip) etip.classList.remove("on");
    if(btip) btip.classList.remove("on");
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
  if(bline){ bline.setAttribute("x1", cx); bline.setAttribute("x2", cx); bline.setAttribute("opacity", "1"); }
  if(eline){ eline.setAttribute("x1", cx); eline.setAttribute("x2", cx); eline.setAttribute("opacity", "1"); }
  /* the two pinned cards. `cx` is in CHART space, which scrolls sideways under the pinned pad, so
     the on-screen x is cx minus how far the strip is scrolled, plus the pad width. Both strips are
     kept at the same scrollLeft by zngBindScrollSync(), so ONE x calculation drives both and the
     two cards stay vertically aligned with each other and with the sync line. Each flips to the
     right-hand side near the end of the timeline, same rule as the panel tips. */
  var esc0 = document.getElementById("zng-escroll");
  var sl = esc0 ? esc0.scrollLeft : 0;
  var vw = esc0 ? esc0.clientWidth : P.W;
  var vx = cx - sl;                                  // x within the strip's visible box
  var flipP = vx > vw - 190;
  var placeTip = function(el, html){
    if(!el) return;
    el.innerHTML = html;
    el.style.left  = flipP ? "" : (ZNG_AXW + vx + 10) + "px";
    el.style.right = flipP ? (vw - vx + 10) + "px" : "";
    el.classList.add("on");
  };
  placeTip(etip, zngEligTip(p));
  placeTip(btip, zngOpTip(p));

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
    /* 2026-08-01b: name WHICH filter ruled the column out — with two filters able to exclude, a
       bare "excluded" leaves you hunting through two lists for the tick you turned off. */
    el.innerHTML = excluded
      ? '<div class="r zng-dim"><span>excluded — ' +
        (zngZoneExcluded(p) ? (zngStateExcluded(p) ? "Scope and Operation" : "Scope") : "Operation") +
        ' filter</span><b>—</b></div>'
      : zngTipHtml(p, pn, fuelsOn);
    el.style.top = (zngPanelTop(i) + 2) + "px";
    el.style.left = flip ? "" : (cx + 10) + "px";
    el.style.right = flip ? (P.W - cx + 10) + "px" : "";
    el.classList.add("on");
  }
}
function zngBindHover(){
  /* 2026-08-01d: THREE hit areas now, not one — the panel stack plus the two pinned strips, which
     are separate SVGs and would otherwise be dead to the mouse. They share one index calculation
     and one handler, so hovering the Eligibility strip lights the same column, the same sync lines
     and the same readout as hovering a panel. Each SVG is measured on its own because they scroll
     independently in the DOM even though zngBindScrollSync keeps them showing the same range. */
  var hits = [];
  var main = document.getElementById("zng-hit"); if(main) hits.push(main);
  var strips = document.querySelectorAll("#znfs-graph rect.zng-shit");
  for(var i = 0; i < strips.length; i++) hits.push(strips[i]);
  if(!hits.length) return;
  var toIdx = function(svg, ev){
    var P = ZNG.panels; if(!P || !P.n) return -1;
    var r = svg.getBoundingClientRect();
    var x = (ev.clientX - r.left) * (P.W / (r.width || P.W));
    return Math.max(0, Math.min(P.n - 1, Math.floor(x / P.slot)));
  };
  hits.forEach(function(hit){
    var svg = hit.ownerSVGElement;
    hit.addEventListener("mousemove", function(ev){ zngHoverAt(toIdx(svg, ev)); });
    hit.addEventListener("mouseleave", function(){ zngHoverAt(-1); });
  });
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
  /* 2026-08-01b/d: the two pinned strips are further elements on the same timeline. Each is
     optional here (a null just drops out of the list) so this function still works if either strip
     is ever removed, and adding a third would be one more push. */
  var bs = document.getElementById("zng-bscroll");
  var es = document.getElementById("zng-escroll");
  var all = [sc, xs]; if(bs) all.push(bs); if(es) all.push(es);
  var lock = false;
  var mirror = function(from){
    return function(){
      if(lock) return;
      lock = true;
      for(var i = 0; i < all.length; i++) if(all[i] !== from) all[i].scrollLeft = from.scrollLeft;
      /* release after the write has been applied, so the scroll event it fires on the others is
         the one being swallowed rather than a later genuine user scroll */
      setTimeout(function(){ lock = false; }, 0);
    };
  };
  xs.addEventListener("scroll", mirror(xs));
  sc.addEventListener("scroll", mirror(sc));
  if(bs) bs.addEventListener("scroll", mirror(bs));
  if(es) es.addEventListener("scroll", mirror(es));
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
        "height is divided between the panels you actually want. On a fresh workspace two are " +
        "ticked — <b>EUA/UKA</b> and <b>Total Cons</b> — and the rest are one tick away. " +
        "(Eligibility is not in this list: it is permanently on screen as a locked strip — see " +
        "below.) <b>Fuel</b> ticks change the five " +
        "consumption panels, ROB and EUA/UKA — Distance and Eligibility are not per-fuel quantities. " +
        "<b>Scope</b> ticks do not " +
        "remove anything from the timeline: an unticked zone's reports stay in their exact column " +
        "(the X axis never moves) but draw hatched/greyed in every panel, so a ruled-out period is " +
        "still visible where it happened.<br><br>" +
        "<b>Operation</b> splits the same timeline by what the ship was DOING, in three " +
        "mutually exclusive bands drawn as the colour strip under the chart: <b>At Sea</b> " +
        "(SOSP → EOSP), <b>In-Port</b> (inside port limits but not alongside — EOSP → Arrival, " +
        "Departure → SOSP, and the whole window when no Arrival/Departure could be derived) and " +
        "<b>At-Berth</b> (Arrival → Departure, the same window that forms a port-stay row). It " +
        "combines with Scope by AND — a report is shown only when both its zone and its band are " +
        "ticked — so you can isolate, say, At-Berth time in EU ports. Worth knowing: <b>In-Port " +
        "time is charged to the voyage leg, not the port stay</b>, so an EU call with a long " +
        "anchorage wait shows In-Port sitting inside a 50% To-EU/From-EU colour. That is the " +
        "regulation's own boundary, not a discrepancy.<br><br>" +
        "<b>Totals</b> sit at the right-hand end of each parameter's own row, split by fuel and then " +
        "combined. They follow both the Scope and the Fuel ticks, so a total always equals the bars " +
        "you can actually see; a fuel you have unticked reads 0 rather than vanishing from the list. " +
        "<b>ROB has no total</b> — it is a stock reading, and adding one event's tanks to the " +
        "next event's produces a number with no physical meaning. (Eligibility has none either, " +
        "percentages not being addable, but it is no longer a panel so there is no row to omit.)" +
        "<br><br>" +
        "<b>ROB is a stock reading, not a flow.</b> It is stacked here by explicit instruction, but the " +
        "stack HEIGHT is the sum of separate tanks and has no physical meaning — read the individual " +
        "bands, not the top of the bar. (The Report-Wise table refuses to total ROB for this reason.)<br><br>" +
        "<b>EUA/UKA</b> are ALLOWANCES TO SURRENDER — covered CO₂e × eligibility × the year's " +
        "phase-in (40% 2024 · 70% 2025 · 100% 2026+) — the same figures the EU ETS and UK ETS cards " +
        "show. They are not recalculated here: each report takes its share of its own voyage/port " +
        "entry's engine-computed allowances, in proportion to the fuel it burned, so the panel " +
        "total agrees with the calculator. EU and UK never both apply to one report. Reports with " +
        "no matched entry, and periods outside the reporting year, show a hatched stub rather than " +
        "a misleading zero.<br><br>" +
        "<b>Eligibility</b> reuses the Report-Wise Eligibility calculation exactly, coloured by the " +
        "specific To-EU / At-EU / EU-EU / From-EU / At-UK / UK-UK bucket, not just the " +
        "percentage. UK ETS has no 50% band — a report is either fully in UK scope or out — and is " +
        "out of scope entirely before 1 Jul 2026. Thin hatched stubs mark reports with no confident " +
        "match to a voyage/port entry (the table's \"–\"); those always stay active and ignore the " +
        "Scope ticks. It is <b>not a panel</b> — it is a locked strip of its own, directly above " +
        "the Operation band, at a fixed height (twice the Operation cells). It cannot be unticked " +
        "and never scrolls out of view, because it is the reading that explains WHY a period costs " +
        "what it costs. Only the 100% mark is labelled; the 50% gridline is still drawn, which is " +
        "what a half-scope leg lines up against. Hovering either strip opens <b>one shared card</b> " +
        "with both the eligibility figure and the operation band — they describe the same instant, " +
        "so they are shown together.<br><br>" +
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
    var capPh = (ZNG.panels && ZNG.panels.ph != null) ? ZNG.panels.ph : ZNG_PH_BASE;
    if(!D.anyMach){
      P.forEach(function(pn, i){
        if(["me","ae","blr","oth"].indexOf(pn.id) < 0) return;
        caps += '<div class="zng-cap" style="top:' + (zngPanelTop(i, capPh) + zngPanelPh(i, capPh) / 2 - 8) + 'px">' +
                'No per-machine columns in this import — ME / AE / Boiler / Others are unavailable.</div>';
      });
    }
    /* 2026-08-01: same courtesy for the new panel — say WHY it is blank instead of leaving the
       owner to guess. It is blank when no report could be tied to a voyage/port entry the engine
       counted for the selected reporting year (e.g. a stock-only import, or a year with no rows). */
    if(!D.anyEts){
      P.forEach(function(pn, i){
        if(pn.id !== "ets") return;
        caps += '<div class="zng-cap" style="top:' + (zngPanelTop(i, capPh) + zngPanelPh(i, capPh) / 2 - 8) + 'px">' +
                'No reports could be matched to a voyage/port entry in the selected reporting year — ' +
                'EUA/UKA are unavailable.</div>';
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
          /* 2026-08-01d: the two PINNED strips, in the order the owner chose — Eligibility first,
             then Operation, then the dates. Both are locked on screen (they never scroll out of
             view like a panel can) and both are outside .zng-panes, so they cost the panels no
             height at all. 2026-08-01e: each now owns its OWN one-row hover card — #zng-etip opens
             upward off this row, #zng-btip opens downward off the Operation row into the date axis.
             See the note above zngEligTip() for why that cannot collide. */
          '<div class="zng-erow">' +
            '<div class="zng-epad" style="width:' + ZNG_AXW + 'px">Eligibility<em>%</em><i>100</i></div>' +
            '<div class="zng-escroll" id="zng-escroll">' + zngEligStrip() + '</div>' +
            '<div class="zng-ptip zng-etip" id="zng-etip"></div>' +
          '</div>' +
          /* 2026-08-01b: the operational-state band strip, PINNED between the panes and the date
             axis so it is always on screen next to whichever panel you happen to be reading, and
             costs the panels no height. Its horizontal scroll is mirrored with the others. */
          '<div class="zng-brow">' +
            '<div class="zng-xpad" style="width:' + ZNG_AXW + 'px">Operation</div>' +
            '<div class="zng-bscroll" id="zng-bscroll">' + zngBandStrip() + '</div>' +
            '<div class="zng-ptip zng-btip" id="zng-btip"></div>' +
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
  /* 2026-08-01d: no longer gated on P.length. The two pinned strips exist whether or not any PANEL
     is ticked — that is what "locked" means — so they still need their repaint, their hover binding
     and their scroll sync when every Parameter box is off. */
  if(D.nAll){
    /* zngChart() ran before this markup existed, so the axis and the date strip were built from
       the geometry it cached — repaint both now that ZNG.panels is current for these filters. */
    var ax = host.querySelector(".zng-axis"); if(ax) ax.innerHTML = zngAxis();
    var xr = host.querySelector("#zng-xscroll"); if(xr) xr.innerHTML = zngXAxis();
    /* 2026-08-01b/d: both pinned strips are built from the same cached geometry and need the same
       repaint, or on the very first render they keep the previous render's slot width */
    var br = host.querySelector("#zng-bscroll"); if(br) br.innerHTML = zngBandStrip();
    var er = host.querySelector("#zng-escroll"); if(er) er.innerHTML = zngEligStrip();
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
    b.title = "Trends — EUA/UKA allowances, distance, consumption by fuel, ROB and EU/UK " +
              "eligibility across every imported report, on one shared timeline.";
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
