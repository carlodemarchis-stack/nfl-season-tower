# NFL Season Tower

Interactive single-page visualization of an NFL regular season. All 32 teams are drawn as
vertical "towers" of one cell per game on a shared baseline: **wins stack upward, losses hang
downward, upcoming games hang from a ceiling above the win stack.** A week slider (with a play
button) animates the season unfolding; teams re-sort live by win % or win count with a FLIP
animation, and group by league / conference / division. Clicking a game cell opens a box score;
clicking a team label opens a roster browser.

Built from `../design_handoff_nfl_season_tower/` (prototype spec + data) as a **Vite + React + TS**
static site.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build & deploy

```bash
npm run build    # tsc type-check + vite build -> dist/
npm run preview  # preview the production build locally
```

`dist/` is a static bundle. `vite.config.ts` uses `base: './'` (relative paths), so it works from
a GitHub Pages sub-path **and** any static host with no config change.

- **GitHub Pages:** push `dist/` to the pages branch (or use an action). Relative base means no
  `base` tweak per repo name is needed.
- **Railway / nginx / etc.:** serve `dist/` as static files (`npx serve -s dist`).

The `details-*` (~485 KB each) and `rosters-2025` (~371 KB) modules are **dynamically imported**,
so they land as separate lazy chunks — the chart renders from the small schedule modules and the
box-score / roster detail arrives on demand. Do not refactor them into a static import.

## Architecture

Faithful port of the prototype's single component. `src/SeasonTower.tsx` is one React class that
carries over the prototype logic essentially verbatim — including the load-bearing zone-sizing
math (`renderVals()`) and the FLIP re-sort (`getSnapshotBeforeUpdate` / `componentDidUpdate`).

The prototype authored every inline style as a CSS **string**; React needs style **objects**, so
`src/css.ts` parses those finalized strings at render time rather than hand-transcribing ~80 of
them (where a single typo silently breaks the layout).

```
src/
  main.tsx          # mounts <SeasonTower/> with the tweakable props as defaults
  SeasonTower.tsx   # the whole app: chart, game-detail modal, team/roster modal
  css.ts            # CSS-string -> React style-object parser
  data/             # ES-module data (dynamic-imported); kept as-is from the handoff
    schedule-2024.js  TEAMS2024 / RESULTS2024 / MAXWEEK2024   (real, completed)
    schedule-2025.js  TEAMS2025 / RESULTS2025 / MAXWEEK2025   (real, completed)
    schedule-2026.js  TEAMS                                   (real fixtures, no results)
    details-2024.js   DETAILS2024
    details-2025.js   DETAILS2025
    rosters-2025.js   ROSTERS2025
```

Tweakable props (`colorMode`, `pendingMode`, `orientation`, `tieHalf`, `showByes`, `editScores`,
`seed`, …) are set in `src/main.tsx`. `season` also switches at runtime from the title dropdown.

## Notes / deviations from the prototype

- **Subtitle text** — the shipped prototype code left the subtitle empty; the reference
  screenshots show one, so a subtitle is included ("Real 2025 results — …").
- **2026 is simulated.** Fixtures are real; scores are generated from a seeded PRNG. It is labeled
  as simulated in the subtitle. For a fully public site, decide whether to keep the 2026 season or
  drop it (remove the `2026` entry from the season dropdown list and the loader).
- **Player headshots** load from ESPN's CDN by id. Verify licensing before shipping publicly, or
  drop the photo and keep the soft-color monogram background.
- The prototype's dead code (`simulate()`, `setOrient()`) and unused `userSort` path were not
  ported.
