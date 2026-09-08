# NFL Season Tower — how it works, and the logic behind it

> Working notes for an article. Every number and rule below is taken from the running code
> and the shipped data, not from memory.
> Live: **https://nfl.aguywithascarf.com** · Companion film: **/film.html**

---

## 1. The premise in one sentence

A season is usually shown as a **table**. The Season Tower shows it as a **shape**: every team
becomes a vertical stack of boxes — one box per game — sitting on a shared horizontal baseline.
**Wins build upward. Losses hang downward. Games not yet played hang from the ceiling.**

You read the whole league in one glance, because a good season is literally *tall* and a bad one
is literally *deep*, and you never have to parse a single number to see it.

*[SCREENSHOT: full league view, 2025, Division grouping — the "hero" shot]*

---

## 2. The one design decision everything else follows from

**The baseline is zero, and it is shared by all 32 teams.**

That single constraint generates the entire visual language:

| Thing | Encoding | Why |
|---|---|---|
| Win | box **above** the line | up = good, universally |
| Loss | box **below** the line | down = bad |
| Tie | box above, tinted | rare enough to be a special case (2025 had exactly **one**) |
| Still to play | faded box hanging from the **ceiling** | not yet part of the record, so not touching the line |
| Bye week | grey dashed box at the ceiling | a real gap in the calendar, not a missing game |

Because every column shares the baseline, a team's **record is its silhouette**. You don't compare
14-3 to 3-14 as text; you compare a tall column to an inverted one. Height *is* the record.

*[SCREENSHOT: close-up of 2–3 adjacent towers showing wins up / losses down / ceiling block]*

---

## 3. The data model

Three flat maps, all keyed the same way — `"ABBR:week"`. That one key convention is what makes
everything else cheap.

**Schedule** (`schedule-2025.js`) — 32 teams, each with 17 games across 18 weeks:

```js
"BUF": { abbr, name, primary:"#00338D", secondary, conf:"AFC", div:"E",
         games:[ { w:1, opp:"BAL", oppFull:"Baltimore Ravens", ha:"H",
                   net:"NBC", et:"2025-09-07 20:20 EDT" }, … ] }
```

**Results** (`RESULTS2025`) — one entry per **team per game**, so every game is stored twice, once
from each side:

```js
"DAL:4": { us:40, them:40, res:"T", hasU:true, hasT:true }
"GB:4":  { us:40, them:40, res:"T", hasU:true, hasT:true }
```

Storing both sides looks redundant. It isn't: every lookup in the render path is
"what happened to *this* team in *this* week", which becomes a single hash hit with no
"am I home or away?" branching. 272 games → 544 rows.

**Box scores** (`details-2025.js`, 544 keys) — quarter-by-quarter plus ~20 team stats per side:

```js
"ARI:1": { venue:"Caesars Superdome (New Orleans, LA)", net:"CBS", et:"…",
           lt:[3,14,3,0],           // line score, this team by quarter
           lo:[0,10,0,3],           // line score, opponent
           ts:{ first_downs:"19", third_down_eff:"6-13", total_yards:"276",
                yards_per_play:"4.5", time_of_possession:"33:46", … },
           os:{ … same shape, opponent … } }
```

**Rosters** (`rosters-2025.js`) — 2,925 players, ~91 per team:

```js
"ARI": { coach:"Mike LaFleur", count:91,
         players:[ { id:"5084939",       // ESPN athlete id = headshot id
                     n:"Isaiah Adams", j:"74", pos:"G", u:"offense",
                     age:25, ht:"6' 4\"", wt:"315 lbs",
                     col:"Illinois", exp:3, st:"Active" }, … ] }
```

The heavy files (485 KB of box scores, 371 KB of rosters) are **dynamically imported**, so they
become lazy chunks and never touch the 194 KB main bundle.

---

## 4. The engine: "through week N"

This is the concept the whole app rests on, and it's the thing worth explaining in an article,
because it collapses two features into one.

There is exactly **one** state variable that matters: `throughWeek`. Everything renders as a pure
function of it.

```js
buildThrough(n) {
  const R = resultsForActiveSeason()       // the real results map
  const r = {}
  for (const team of teams)
    for (const g of team.games)
      if (g.w <= n && R[key(team, g.w)])   // ← the entire filter
        r[key] = R[key]
  setState({ results: r, throughWeek: n })
}
```

A game is shown as **played** if and only if two things are true: its week is `<= n`, *and* a real
result exists for it. Anything else is "upcoming" and hangs from the ceiling.

That single predicate gives you, for free:

- **Replay** — drag the slider to week 6 and you see the standings exactly as they were after
  week 6. Not an animation of the final table; a genuine recomputation.
- **A live season** — a season in progress is just "through week N" where N happens to be the last
  week that exists. Unplayed games are *already* the ceiling state. No separate "future" mode.

**There is no simulation.** An earlier version generated plausible scores for unplayed 2026 games
from a seeded PRNG. It was removed. A tower that shows invented results is a tower you can't trust,
and the "upcoming" encoding already communicates "we don't know yet" honestly.

*[SCREENSHOT: same season at Wk 6 and at Full season, side by side — the replay effect]*

---

## 5. Tower geometry (the layout maths)

The hard part isn't drawing boxes; it's that **the baseline must be at the same y for all 32
columns**, while the tallest win-stack and the deepest loss-stack differ wildly, and the whole
thing has to fit an arbitrary viewport without scrolling.

The solution is to size the two zones proportionally to the league's extremes, then clamp:

```js
// 1. league-wide extremes
maxAbove = max over teams of (upcoming + W + T + bye)
maxBelow = max over teams of (L)

// 2. split the usable height in proportion, but never let one side dominate
aboveFrac = (maxAbove + 1) / (maxAbove + 1 + maxBelow)   // +1 row for the ceiling gap
aboveFrac = clamp(aboveFrac, 0.45, 0.85)

// 3. derive a single cell height that satisfies BOTH sides
capA   = (abovePx - 3) / aboveRows - 1
capB   = (belowPx - 3) / maxBelow  - 1
cellH  = clamp(min(capA, capB), 8, 26)
```

Every cell in the league gets the **same** height. That's what makes columns comparable — a box is
a box is a game, so height differences are purely "how many games", never "how big is this cell".

Other clamps: column width `clamp(24…56px)`, and in row mode row height `clamp(28…40px)`.

**Orientation is automatic.** Below 820 px the whole thing rotates: towers become **rows**, wins
extend right, losses extend left, the baseline becomes vertical. Same encoding, same code path,
one ternary.

---

## 6. Colour: every box is the *opponent's* colour

The default palette rule is the app's second-best idea. A box is not coloured by *result* — it's
coloured by **who you played**.

```js
win     → solid opponent primary,  text = contrast(bg)
loss    → white bg, opponent-coloured text, 1.5px red border
tie     → opponent colour mixed 18% into white
upcoming→ white bg, opponent-coloured text, border = opponent mixed 55% into white
bye     → #F0F1F3, grey dashed border
```

Why this matters: it turns each tower into a **schedule**, not just a scoreboard. You can see that
a team's wins came against a cluster of one colour and its losses against another. Strength of
schedule becomes visible without a single derived metric.

Legibility is handled by a luminance test, not by guessing:

```js
contrast(hex) = ((r*299 + g*587 + b*114) / 1000) > 150 ? '#16181d' : '#ffffff'
```

So Pittsburgh's yellow gets dark ink and Baltimore's purple gets white, automatically.

Result-mode colouring (win = your own colour, loss = pale red) still exists as an alternative, and
the legend swaps to match.

---

## 7. Ordering: what goes where inside a column

Subtle, and worth a paragraph in the article because it's where naive versions get it wrong.

- **Wins** are sorted **descending by week**, so week 1 sits *nearest the baseline* and the season
  reads outward from the line. The tower grows the way the season is played.
- **Ties are not a separate block.** They're merged into the win side and sorted by their real
  week, so a tie lands in its true calendar slot among the wins. (2025's only tie — DAL 40–40 GB
  in Week 4 — sits in Dallas's fourth slot, not tacked on at the end.)
- **Losses** are sorted **ascending by week** below the line, mirroring the same
  chronology-outward-from-baseline logic.
- **Upcoming + bye** form a block sorted descending and pinned to the ceiling, with an
  `margin-bottom:auto` on the last cell to guarantee at least one empty row between "to play" and
  "played". That gap is the visual proof that the future isn't touching the record.

---

## 8. Ranking, grouping, and the re-sort

Win percentage counts a tie as half a win — the NFL's own rule:

```js
pct = played ? (W + 0.5*T) / played : 0
```

The comparator is a strict cascade:

```
group (conference, then division, when grouping is on)
  → Wins  (if RANK = Wins)
  → win %                 ← always the next tiebreak
  → more wins
  → fewer losses
  → alphabetical by abbreviation   ← deterministic, never jitters
```

Grouping has three levels — **League** (one row of 32), **Conference** (AFC | NFC), **Division**
(8 blocks of 4). Division is the default, because it's the unit fans actually think in, and the
16 px gap between groups is enough to read the blocks without labels shouting.

**The re-sort is animated with FLIP.** Before each update the app records every column's screen
position (`getSnapshotBeforeUpdate`), then after the DOM changes it computes the delta, applies an
inverse transform, and releases it. Teams visibly *slide* past each other as you scrub weeks.
That motion is the point: you see **when** a team overtook another, which a static table can never
show.

*[SCREENSHOT: mid-scrub, if you have one where the columns are in flight]*

---

## 9. Controls

| Control | Behaviour |
|---|---|
| `‹` `›` | step one week; also **← →** on the keyboard |
| `▶` | play — advances a week every 950 ms, auto-stops at the end; also **Space** |
| slider | jump to any week directly |
| GROUP | League / Conference / Division |
| RANK | Win % / Wins |
| ⛶ | fullscreen (also **F**) |
| ? | help popover: how to read the tower + shortcuts (**Esc** closes) |
| season ▾ | 2026 / 2025 / 2024 |

**The slider is capped at the last week actually played.** For a completed season that's week 18.
For 2026 today it is **0** — so the slider and play button are disabled outright, and the hint
reads *"No games played yet — the season fills in week by week."* You cannot scrub into a future
that hasn't happened. The cap is derived, not configured:

```js
maxWeek() = season === '2026'
  ? highestWeekPresentIn(RESULTS2026)   // 0 today
  : 18
```

---

## 10. The two modals

**Click any box → the game.** Header shows the result badge, both teams, the final score, venue,
network and kickoff time. Then the **line score** (`lt` / `lo`) as a quarter-by-quarter grid, and
the ~20 team stats rendered as **paired comparison bars** — total yards, yards per play, third-down
efficiency, time of possession, turnovers, penalties. Each stat is parsed to a number
(`"6-13"`, `"33:46"` and `"4.5"` all normalise) so the two sides can be drawn to scale against
each other.

*[SCREENSHOT: game modal — box score + stat bars]*

**Click any team name → the team.** Two tabs:
- **Roster** — up to ~91 players with ESPN headshots, filterable by unit (All / Offense / Defense /
  Special Teams), by position, and by a live search box. Positions sort in football order
  (QB, RB, FB, WR, TE, T, G, C, … DE, DT, LB, CB, S, K, P) rather than alphabetically.
- **Schedule** — all 17 games with W/L/T badges and scores; clicking any row jumps straight into
  that game's box score.

*[SCREENSHOT: team modal, roster tab]*
*[SCREENSHOT: team modal, schedule tab]*

---

## 11. Two seasons, two states — the article's best contrast

This is the story to tell, because the same code produces both.

**2025 — a completed season.** 32 teams, 272 games, 18 weeks, every box filled.
The extremes are real and legible at a glance:

| | |
|---|---|
| Best records | **DEN 14-3** (+90), **NE 14-3** (+170), **SEA 14-3** (+191) |
| Worst | **LV, NYJ, TEN 3-14** (LV −191, TEN −194, NYJ −203) |
| Only tie all season | **DAL 40–40 GB**, Week 4 |
| Biggest margin | **MIN 48–10**, Week 3 (+38) |
| Byes | every team plays 17 of 18 weeks; byes fall between weeks 5 and 14 |

Three teams finishing 14-3 is exactly the case the tiebreak cascade exists for — identical height,
separated by point differential in the eye and by the comparator in code.

**2026 — a season that starts tomorrow.** First kickoff **2026-09-09, 20:20 EDT**. The results map
is empty, so:

- every one of the 272 games is "upcoming" and hangs from the ceiling
- all 32 records read 0-0, the counter reads **0 / 272 games**
- the baseline is a clean, unbroken line across the league
- the slider is locked at 0 and play is disabled

It's the same visualisation with the same rules, showing the season as pure potential — 32 identical
blocks of pending fixtures, colour-coded by who each team has to face. As results land in
`results-2026.js`, boxes detach from the ceiling and settle above or below the line, the towers
start to diverge, and the slider's ceiling rises one week at a time.

*[SCREENSHOT: 2026 empty board — the "before" picture]*

> **The pairing is the article.** The empty 2026 board and the finished 2025 board are the same
> code, one variable apart. That's the argument for the "through week N" model in a single image.

---

## 12. The companion: Season Film

A second page (`/film.html`) tells the same season one team at a time — a full-bleed card per team
in ranking order, teal-chromed, navigable with ← →, Space, F.

Each card carries:
- that team's season **as its own tower**, rotated into rows, with the week number on the left and
  the score right-aligned
- **point-differential bars** integrated into each row — wins extend right, losses extend left,
  scaled to the team's biggest margin; ties read `TIED` rather than `±0`
- a **tabbed roster** (Offense / Defense / Special / Reserve) with headshots
- **season splits** as proportional W/T/L bars — overall, home, away, divisional — plus PF, PA,
  differential and current streak
- a computed **playoff seed** badge

Seeding is derived, not stored: within each conference, walk the ranked list, take the first team
seen from each of the four divisions as division winners (seeds 1-4 in ranked order), then the next
three teams as wild cards (seeds 5-7).

---

## 13. Decisions worth defending in the article

1. **Remove the simulation.** Invented scores make a data visualisation into a toy. The honest
   empty state is more interesting than a plausible fake one.
2. **Colour by opponent, not by result.** Costs a legend line, buys strength-of-schedule for free.
3. **Store every game twice.** Denormalisation that removes a branch from the hottest code path.
4. **One cell height for the entire league.** Non-negotiable — the moment cells differ in size,
   height stops meaning "games" and comparison dies.
5. **Cap the slider at reality.** A control that lets you scrub into an empty future is a control
   that teaches the wrong mental model.
6. **Animate the re-sort.** The overtake *is* the drama of a season; a table hides it.
7. **Ties merged by calendar position.** A tie is a game, not a category — it belongs in its week.

---

## 14. Stack, in one line

Vite + React + TypeScript, a single class component carrying the layout maths and FLIP; data as
plain ES modules, dynamically imported; static build deployed to GitHub Pages via Actions on push,
served from `nfl.aguywithascarf.com`; the film page is dependency-free vanilla JS.

---

*Produced with passion by A guy with a scarf (Carlo De Marchis).*
