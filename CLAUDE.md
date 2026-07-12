# Maritime Emissions Calculator — rules for Claude

Static site, no build step, no framework, no external requests. Deploys to Vercel as-is.

## File map

| File | What it is | May you edit it? |
|---|---|---|
| `index.html` | Page skeleton: lock screen, header, nav, empty tab containers | Yes — design changes welcome |
| `css/styles.css` | All styling | Yes — primary design surface |
| `js/ui.js` | Tab rendering (HTML template strings), event handlers, import/export (OVD CSV, THETIS XML, scenario JSON), localStorage state, access gate | **Only the HTML template strings.** Never touch state, calculation calls, parsers, import/export, or the gate logic |
| `js/engine.js` | Calculation engine: CII, EU ETS, FuelEU Maritime, UK ETS, SCC; fuel factors and constants | **Never edit** |
| `js/ports_data.js` | Generated port LOCODE data (from DNV xlsx) | **Never edit, never read into context** (363 KB — reading it wastes tokens) |

## Hard rules

1. Design work touches `css/styles.css`, `index.html`, and template strings in `js/ui.js` only.
2. Never rename an `id`, `class` used by JS selectors, or `onclick`/`onchange` handler without tracing every reference first.
3. Scripts are classic (non-module) and load-order dependent: `ports_data.js` → `engine.js` → `ui.js`. Do not reorder, do not convert to ES modules.
4. No frameworks, no bundlers, no CDN dependencies. The app must keep working offline from `file://`.
5. localStorage keys `emcalc_state` and `emx_g` are load-bearing (saved state + access gate). Do not rename.

## After every change, verify

1. `node --check js/ui.js` (and any other edited JS)
2. Open `index.html` in a browser, unlock, and confirm: all 4 tabs render, Import OVD CSV / THETIS XML works, Export/Import scenario works, Reset works, no console errors.
3. Run the built-in self-test on the Help tab.
