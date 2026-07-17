# Plan: Emissions Calculator → team website on Vercel

Goal: redesign the calculator layout with Claude (design iteration on claude.ai, implementation in VS Code), lose zero features, deploy on Vercel behind the existing passcode gate.

## Phase 0 — DONE (in Cowork)

The 491 KB single-file HTML is split into a clean repo in this folder:

- `index.html` (2.7 KB) — skeleton
- `css/styles.css` (9 KB) — all styling
- `js/ports_data.js` (363 KB) — generated port data, off-limits
- `js/engine.js` (22 KB) — all calculations, off-limits
- `js/ui.js` (94 KB) — rendering templates + import/export + gate
- `CLAUDE.md` — guardrails every VS Code Claude session reads automatically

Verified: reassembling the split files reproduces the original byte-for-byte; all JS passes `node --check`; no external requests, so file:// and Vercel both work unchanged. Upload (OVD CSV, THETIS XML), DNV port data, scenario export/import, and all calculations (CII, EU ETS, FuelEU, UK ETS, SCC) are intact by construction — the code was moved, not rewritten.

## Phase 1 — Baseline check (you, 5 minutes)

Open `index.html` in Chrome, unlock, and click through: all 4 tabs, one OVD CSV import, one THETIS XML import, export + re-import a scenario, run the Help-tab self-test. This is your "before" reference. If anything is off, stop and report it before any design work.

## Phase 2 — Design iteration on claude.ai (free of repo tokens)

1. Run `capture_mockup.js` (instructions inside the file) → get `mockup.html`, a logic-free snapshot of the rendered UI.
2. Upload `mockup.html` to claude.ai and iterate the layout there as an artifact: spacing, colors, typography, card arrangement, header, whatever you want. This is pure vibe-coding with zero risk — the file has no logic to break.
3. Rules for the claude.ai session (paste this into your first message):
   - "Keep every element id and class name exactly as-is. Change only visual styling and layout structure. Do not add JavaScript."
   - Keeping ids/classes intact is what makes Phase 3 cheap and safe.
4. When happy, download the final artifact HTML. That file is your design spec.

## Phase 3 — Apply the design in VS Code with Claude Code

1. Open this folder in VS Code with the Claude Code extension.
2. Recommended plugins: **Frontend Design** (claude.com/plugins/frontend-design) for the implementation, **Design** (claude.com/plugins/design) if you want a critique/accessibility audit pass.
3. Initialize git first — your undo button:
   ```
   git init && git add -A && git commit -m "baseline: verified split of working calculator"
   ```
4. Give Claude the approved mockup and this instruction:
   - "Apply the design in mockup_final.html to this project. Per CLAUDE.md: edit only css/styles.css, index.html, and HTML template strings in js/ui.js. Do not touch engine.js or ports_data.js. Do not rename any id, class, or handler."
5. Token-saving habits:
   - Most design changes are CSS-only. Say "CSS only if possible" — styles.css is 9 KB, cheap to iterate.
   - Never let it read `js/ports_data.js` (CLAUDE.md forbids this; 363 KB of data).
   - One change per prompt; commit after each working step.

## Phase 4 — Verify (after design is applied)

Repeat the Phase 1 checklist exactly, plus: compare against your "before" reference, run the self-test, check the browser console for errors. Ask Claude Code to run `node --check js/ui.js` after any ui.js edit. Only proceed when everything passes.

## Phase 5 — Deploy to Vercel

1. Push the repo to GitHub (private repo).
2. vercel.com → Add New Project → import the repo → Framework preset: **Other** → no build command, output directory: root → Deploy. That's it; it's a static site.
3. Every later `git push` auto-deploys. Share the URL + access code with the team.
4. Notes:
   - The passcode gate ships as-is. It is client-side and weak — fine for casual gating, not real security. Anyone determined can read the JS.
   - localStorage state is per-browser, per-device: each teammate gets their own saved scenarios. Use Export/Import scenario to share setups.

## What could still go wrong

- Renamed id/class during design → an import button or tab dies. Mitigation: the claude.ai rule in Phase 2.3 and CLAUDE.md rule 2.
- Design session "helpfully" rewrites a JS function → regression. Mitigation: CLAUDE.md rule 1 + git commit per step.
- Vercel adds nothing that breaks file uploads or XML parsing — all parsing is client-side FileReader/DOMParser. [CERTAIN]

## Change log — 2026-07-17: Report-level trace table redesign (design_handoff_report_trace_table)

Applied in `js/ui.js` only (no CSS / index.html / engine changes):

- New `reportTraceTable()` renderer (+ `TR_*` constants, `trActs`, `trBunkered`, `trFuelLines`, `trPctSpan`) replaces the old `.vbtable` report trace on the Calculations tab. Pixel styles match the handoff reference (`Report Trace Table.dc.html`).
- Fuel group: `Fuel | Total | ME | AE | Boiler | Others | ROB (Bunker)`; Others = max(0, Total − ME − AE − Boiler), computed at render; green `+n` badge left of ROB shown only when the event's activities include BUNKERING (a FUEL_OIL_BUNKER event with a bunkered qty counts as bunkering).
- Activity cell = horizontal icon row with tooltips (multi-activity ready); Condition cell = icon + label + OPL chip; Port cell = name + country·region + EU/UK zone chip (via existing `zoneOfLocode`); new Voyage No column after Port; Dist nm moved left of Eligibility %; footer legend updated.
- Eligibility % lines (EU ETS / FuelEU / UK ETS) show ingested `EU_ETS_%` / `UK_ETS_%` values; FuelEU has no source column → em-dash.
- **Deliberate, additive exception to CLAUDE.md rule "don't touch import":** the MDA import's *display-only retention* now also keeps `voy` (VOYAGE_NUMBER), `euPct`/`ukPct` (EU_ETS_%/UK_ETS_%), and port context on FUEL_OIL_BUNKER rows. No derivation, calculation, or state key changed. Workspaces saved before this change simply render em-dashes for the new fields until re-import.
- Verified: `node --check`, all 148 built-in self-tests pass (headless jsdom), full-file smoke test with the Blumenthal MDA xlsx (237 reports, 3 bunker badges, 274 fuel lines Others-math checked, badge conditionality confirmed).
- Follow-up (same day): activity icons now show an instant styled hover tooltip with the activity name (`.actic` in css/styles.css, replaces the native `title`; keyboard-focusable with aria-label). `standalone/emissions_calculator.html` regenerated via `build_standalone.py` and verified (all checks + 148 self-tests green).
