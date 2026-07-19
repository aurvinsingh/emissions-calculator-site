# Maritime Emissions Calculator — site-folder rules for Claude

**First: read `../CLAUDE.md` (project root) and `../tools/TESTING.md` — they are the
master rules (testing workflow, branch-unification invariant, frozen logic). This file
only adds site-specific detail.** (Updated 2026-07-19; the old version of this file said
"never touch parsers/import logic" — that rule applied to design-only sessions and is
superseded: logic work in `js/ui.js` is allowed when the owner asks for it, under the
root rules.)

Static site, no build step, no framework, no external requests. Deploys to Vercel as-is.

## File map

| File | What it is | Notes |
|---|---|---|
| `index.html` | Page skeleton: lock screen, header, nav, tab containers | Design changes welcome |
| `css/styles.css` | All styling | Primary design surface |
| `js/ui.js` | Tab rendering, event handlers, import (OVD CSV / MDA xlsx / THETIS XML), localStorage state, access gate, and the MDA pipeline (`mdaToOVD`, `parseOVD`) | Logic edits only when the owner asks; arrival/departure derivation is FROZEN (root CLAUDE.md); always test headlessly |
| `js/engine.js` | Calculation engine: CII, EU ETS, FuelEU, UK ETS, SCC; fuel factors | Edit only on explicit owner request, citing regulation chunk IDs |
| `js/ports_data.js` | Generated port LOCODE data | Never edit, never read into context (363 KB) |

## Hard rules

1. Never rename an `id`, `class` used by JS selectors, or `onclick`/`onchange` handler
   without tracing every reference first.
2. Scripts are classic (non-module), load-order dependent: `ports_data.js` →
   `engine.js` → `ui.js`. Do not reorder, do not convert to ES modules.
3. No frameworks, no bundlers, no CDN dependencies. Must keep working offline from `file://`.
4. localStorage keys `emcalc_state` and `emx_g` are load-bearing. Do not rename.
5. After any site change, rebuild the standalone: `python3 ../build_standalone.py`
   (never hand-edit `../standalone/emissions_calculator.html`).

## After every change, verify (in this order)

1. `node --check js/ui.js` (and any other edited JS)
2. The headless suite from the project root:
   `node tools/run_site_tests.js && node tools/run_standalone_tests.js && node tools/verify_workspace_rows.js`
3. Open `index.html` in a browser, unlock, confirm: all tabs render, ⬆ Import data works
   for OVD CSV / MDA xlsx / THETIS XML, Reset works, no console errors.
