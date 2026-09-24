#!/usr/bin/env python3
"""NFL season leaders, one leaderboard per position group.

    python3 tools/fetch_players.py 2025

Why groups and not a top-100: the NBA deck works because one number ranks everyone
(points). Football has no such axis -- a left tackle, a nickel corner and a punter
share no stat -- so any single "top 100" would be an invented metric wearing the
clothes of a fact. Each group is therefore ranked by a stat that means something for
that group, and the card shows the numbers that position is actually judged on.

ESPN's byathlete returns EVERY category for each athlete, so one sorted request per
group yields complete players, not just the sorted column.

Each kept player then gets his game log (one request per player), so a card can draw
the season game by game in the tower idiom -- bar height = the stat, opponent colour,
wins above the baseline and losses below -- instead of six season totals alone.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "src", "data")
API = ("https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/"
       "byathlete?region=us&lang=en&contentorigin=espn")
GAMELOG = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/%s/gamelog?season=%s"

# group key, label, ranking stat(s), positions kept, how many cards.
# Linebackers and the secondary are ranked separately on purpose: sorting the whole
# back seven by tackles buries defensive backs almost entirely (a first pass returned
# 23 LBs and one safety), so the secondary gets interceptions, the stat it is judged on.
# Specialists take two boards for the same reason -- kickers never appear on a punting
# board and punters never appear on a kicking one.
GROUPS = [
    # key, label, [(ranking stat, positions kept, how many)]
    ("qb", "Quarterbacks",  [("passing.passingYards",     {"QB"}, 24)]),
    ("rb", "Running backs", [("rushing.rushingYards",     {"RB", "FB"}, 24)]),
    ("wr", "Receivers",     [("receiving.receivingYards", {"WR", "TE"}, 36)]),
    ("dl", "Pass rushers",  [("defensive.sacks",          {"DE", "DT", "EDGE", "NT"}, 24)]),
    ("lb", "Linebackers",   [("defensive.totalTackles",   {"LB", "ILB", "OLB", "MLB"}, 24)]),
    # Passes defended, not interceptions: ESPN does not accept a
    # defensiveinterceptions sort, and PD is the steadier measure anyway.
    ("db", "Secondary",     [("defensive.passesDefended", {"CB", "S", "FS", "SS", "DB"}, 24)]),
    # Two boards with their own quotas -- a kicker never appears on a punting
    # leaderboard, so a single shared board returns kickers only.
    ("k",  "Specialists",   [("kicking.fieldGoalsMade",    {"PK", "K"}, 10),
                             ("punting.grossAvgPuntYards", {"P"}, 6)]),
]


def get(url):
    out = subprocess.run(["curl", "-s", "--max-time", "40", url],
                         capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else {}


def page(season, sort, n):
    d = get(f"{API}&season={season}&seasontype=2&limit={n}&page=1&sort={sort}%3Adesc")
    names = {c["name"]: c["names"] for c in d.get("categories", [])}
    return d.get("athletes", []), names


def flatten(row, names):
    """One athlete -> {category: {statName: value}}, dropping empty categories."""
    out = {}
    for c in row.get("categories", []):
        vals = c.get("values") or []
        keys = names.get(c["name"], [])
        if not vals:
            continue
        out[c["name"]] = {k: v for k, v in zip(keys, vals) if v is not None}
    return out


def num(v):
    """ESPN sends every stat as a string; keep numbers as numbers to halve the file."""
    if v in (None, "", "-", "--"):
        return None
    try:
        f = float(v)
    except ValueError:
        return v
    return int(f) if f == int(f) else round(f, 2)


def gamelog(pid, season):
    """-> (stat-name list, [game, ...]) or (None, []) if ESPN has no log.

    The log's `names` list is flat and already scoped to this athlete, so a name means
    what it means for HIM: `interceptions` is thrown for a quarterback and caught for a
    corner. Players sharing a name list share it in the file (`sigs`) -- otherwise the
    same 16 strings would repeat 170 times.
    """
    d = get(GAMELOG % (pid, season))
    names = d.get("names") or []
    ev = d.get("events") or {}
    if not names or not ev:
        return None, []
    games = []
    for st in d.get("seasonTypes") or []:
        # "2025 Regular Season" / "2025 Postseason"
        post = "post" in (st.get("displayName") or "").lower()
        for cat in st.get("categories") or []:
            for e in cat.get("events") or []:
                meta = ev.get(e.get("eventId")) or {}
                opp = (meta.get("opponent") or {}).get("abbreviation")
                if not opp:
                    continue
                g = {"w": meta.get("week"), "o": opp,
                     "h": 0 if meta.get("atVs") == "@" else 1,
                     "r": meta.get("gameResult"), "s": meta.get("score"),
                     "v": [num(x) for x in e.get("stats") or []]}
                if post:
                    g["p"] = 1
                    g["t"] = meta.get("eventNote")
                games.append(g)
    games.sort(key=lambda g: (g.get("p", 0), g["w"] or 0))
    return names, games


def attach_logs(players, season):
    """One request per player, in parallel -- ESPN has no bulk game-log endpoint."""
    ids = list(players)
    with ThreadPoolExecutor(max_workers=8) as ex:
        logs = list(ex.map(lambda i: gamelog(i, season), ids))
    sigs, index = [], {}
    for pid, (names, games) in zip(ids, logs):
        if not games:
            continue
        k = "\x00".join(names)
        if k not in index:
            index[k] = len(sigs)
            sigs.append(names)
        players[pid]["s"] = index[k]
        players[pid]["g"] = games
    got = sum(1 for p in players.values() if p.get("g"))
    print(f"\n  game logs: {got}/{len(players)} players, "
          f"{sum(len(p.get('g', [])) for p in players.values())} games, "
          f"{len(sigs)} stat layouts")
    return sigs


def main(season):
    players, groups = {}, []
    for key, label, boards in GROUPS:
        kept = []
        for sort, positions, want in boards:
            got = 0
            # over-fetch: the board is league-wide and we keep only this group's
            # positions (a QB tops rushing boards some weeks)
            rows, names = page(season, sort, max(want * 6, 140))
            for r in rows:
                a = r["athlete"]
                pos = (a.get("position") or {}).get("abbreviation")
                if pos not in positions:
                    continue
                pid = str(a["id"])
                if pid in kept:
                    continue
                st = flatten(r, names)
                if not st:
                    continue
                players[pid] = {
                    "id": pid, "n": a.get("displayName"), "pos": pos,
                    "team": r.get("teamShortName") or a.get("teamShortName"),
                    "age": a.get("age"), "st": st,
                }
                kept.append(pid)
                got += 1
                if got >= want:
                    break
        groups.append({"key": key, "label": label,
                       "sort": boards[0][0], "ids": kept})
        print(f"  {label:15} {len(kept):>3} cards   (leader {players[kept[0]]['n']})"
              if kept else f"  {label:15}   0 cards")

    sigs = attach_logs(players, season)
    out = {"season": season, "groups": groups, "sigs": sigs, "players": players}
    p = os.path.join(DATA, f"players-{season}.js")
    with open(p, "w") as f:
        f.write("// NFL season leaders by position group. Generated by tools/fetch_players.py\n")
        f.write("// from ESPN's byathlete leaderboards -- one sorted request per group.\n")
        f.write("export const PLAYERS" + str(season) + " = "
                + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"\n  {len(players)} unique players -> {os.path.relpath(p, os.path.join(HERE, '..'))}"
          f"  ({os.path.getsize(p)/1024:.0f} KB)")


main(sys.argv[1] if len(sys.argv) > 1 else "2025")
