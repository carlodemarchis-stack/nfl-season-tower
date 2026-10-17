#!/usr/bin/env python3
"""Each club's key players: the same twelve slots for every team, each filled by the
club's leader on the stat that position is judged on.

    python3 tools/fetch_keyplayers.py 2026

A football roster can't be ranked on one number -- a left tackle has none and a punter's
mean nothing next to a quarterback's -- so instead of sorting 65 players, every club
gets a fixed lineup: QB, RB, three receivers and the kicker on offense; two pass
rushers, two tacklers and two defensive backs on defense.

ESPN's byathlete feed returns every stat category on each row, so one ranked pull per
slot stat (league-wide, deep enough to reach every club's leaders) fills all 32 clubs.
It must be ranked pulls, not a page-by-page sweep: most players tie at zero on any
stat, so ESPN's pages overlap and drop players -- a full sweep lost SF's quarterback.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = ("https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/"
       "byathlete?region=us&lang=en&contentorigin=espn&seasontype=2&limit=200"
       # without this ESPN lists only "qualified" players: no third receivers, no
       # quarterback who took over mid-season
       "&isqualified=false")
# ranking stat -> how deep to read the league table so every club's leaders are in it
PULLS = {"passing.passingYards": 120, "rushing.rushingYards": 300,
         "receiving.receivingYards": 450, "kicking.fieldGoalsMade": 80,
         "defensive.sacks": 400, "defensive.totalTackles": 700,
         "defensive.passesDefended": 450}
ALIAS = {"WSH": "WAS", "LA": "LAR", "JAC": "JAX"}
DB = {"CB", "S", "FS", "SS", "DB"}

# slot key, label, how many, positions kept, ranking stat, then how the tile reads
SLOTS = [
    ("qb",  "Quarterback",  1, {"QB"},                    "passing.passingYards"),
    ("rb",  "Running back", 1, {"RB", "FB"},              "rushing.rushingYards"),
    ("rec", "Receiver",     3, {"WR", "TE"},              "receiving.receivingYards"),
    ("k",   "Kicker",       1, {"K", "PK"},               "kicking.fieldGoalsMade"),
    ("pr",  "Pass rush",    2, None,                      "defensive.sacks"),         # any non-DB
    ("tk",  "Tackles",      2, {"LB", "ILB", "OLB", "MLB"}, "defensive.totalTackles"),
    ("db",  "Coverage",     2, DB,                        "cover"),                   # INT, then PD
]


def get(url):
    # curl, not urllib: ESPN 403s Python's default client
    out = subprocess.run(["curl", "-s", "--max-time", "150", url],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:      # empty or cut off -- the caller treats {} as a failed pull
        return {}


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0
    return int(f) if f == int(f) else round(f, 1)


def fmt(v):
    return f"{v:,}" if isinstance(v, int) else str(v)


def sweep(season):
    # 200-row pages: a 700-row page is ~5 MB and ESPN can take over a minute on it
    jobs = [(sort, page) for sort, n in PULLS.items() for page in range(1, -(-n // 200) + 1)]
    with ThreadPoolExecutor(max_workers=4) as ex:   # more at once and ESPN slows past a minute
        docs = list(ex.map(lambda j: get(f"{API}&season={season}&sort={j[0]}%3Adesc&page={j[1]}"), jobs))
    out = {}
    for d in docs:
        names = {c["name"]: c["names"] for c in d.get("categories", [])}
        for r in d.get("athletes", []):
            a = r["athlete"]
            if str(a["id"]) in out:
                continue
            st = {}
            for c in r.get("categories", []):
                for k, v in zip(names.get(c["name"], []), c.get("values") or []):
                    st[f"{c['name']}.{k}"] = num(v)
            team = r.get("teamShortName") or a.get("teamShortName")
            out[str(a["id"])] = {"id": str(a["id"]), "n": a.get("displayName"),
                                 "pos": (a.get("position") or {}).get("abbreviation"),
                                 "team": ALIAS.get(team, team), "st": st}
    if any(not d.get("athletes") for d in docs):
        print("a league table came back empty — not writing", file=sys.stderr)
        sys.exit(1)
    return list(out.values()), len(docs)


def tile(slot, p):
    s = p["st"]
    g = lambda k: s.get(k, 0)
    if slot == "qb":
        v, u, sub = g("passing.passingYards"), "pass yds", f"{g('passing.passingTouchdowns')} TD · {g('passing.interceptions')} INT"
    elif slot == "rb":
        v, u, sub = g("rushing.rushingYards"), "rush yds", f"{g('rushing.yardsPerRushAttempt')} a carry · {g('rushing.rushingTouchdowns')} TD"
    elif slot == "rec":
        v, u, sub = g("receiving.receivingYards"), "rec yds", f"{g('receiving.receptions')} catches · {g('receiving.receivingTouchdowns')} TD"
    elif slot == "k":
        v, u, sub = g("kicking.fieldGoalsMade"), "field goals", f"{g('kicking.fieldGoalsMade')}/{g('kicking.fieldGoalAttempts')} · long {g('kicking.longFieldGoalMade')}"
    elif slot == "pr":
        v, u, sub = g("defensive.sacks"), "sacks", f"{g('defensive.tacklesForLoss')} TFL · {g('defensive.totalTackles')} tackles"
    elif slot == "tk":
        v, u, sub = g("defensive.totalTackles"), "tackles", f"{g('defensive.tacklesForLoss')} TFL · {g('defensive.sacks')} sacks"
    else:
        v, u, sub = g("defensiveinterceptions.interceptions"), "INT", f"{g('defensive.passesDefended')} passes defended"
    if v == 1:
        u = {"sacks": "sack", "tackles": "tackle", "field goals": "field goal"}.get(u, u)
    return {"slot": slot, "id": p["id"], "n": p["n"], "pos": p["pos"],
            "gp": g("general.gamesPlayed"), "v": fmt(v), "u": u, "sub": sub}


def main(season):
    players, pages = sweep(season)
    print(f"  {len(players)} players from {pages} ranked pulls")
    by_team = {}
    for p in players:
        by_team.setdefault(p["team"], []).append(p)
    out = {}
    for team, ps in sorted(by_team.items()):
        if not team:
            continue
        used, tiles = set(), []
        for key, label, n, pos, stat in SLOTS:
            if stat == "cover":
                rank = lambda p: (p["st"].get("defensiveinterceptions.interceptions", 0),
                                  p["st"].get("defensive.passesDefended", 0))
            else:
                rank = lambda p, stat=stat: p["st"].get(stat, 0)
            pool = [p for p in ps if p["id"] not in used
                    and (p["pos"] in pos if pos else p["pos"] not in DB | {"QB", "RB", "WR", "TE", "K", "P"})
                    and rank(p) not in (0, (0, 0))]
            for p in sorted(pool, key=rank, reverse=True)[:n]:
                used.add(p["id"])
                tiles.append(tile(key, p))
        out[team] = tiles

    # Fail loudly rather than ship cards with empty lineups
    thin = [t for t, v in out.items() if len(v) < 8]
    if len(out) != 32 or thin:
        print(f"key-player pull incomplete: {len(out)} clubs, thin {thin} — not writing", file=sys.stderr)
        sys.exit(1)
    p = os.path.join(ROOT, f"src/data/keyplayers-{season}.js")
    with open(p, "w") as f:
        f.write("// Each club's key players: a fixed lineup filled by the club's leader per slot.\n"
                "// Generated by tools/fetch_keyplayers.py from ESPN's byathlete statistics.\n")
        f.write(f"export const KEYPLAYERS{season} = "
                + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"  32 clubs, {sum(len(v) for v in out.values())} tiles -> {os.path.relpath(p, ROOT)}")
    for t in ("SF", "KC"):
        print(f"  {t}: " + " | ".join(f"{x['slot']} {x['n']} {x['v']} {x['u']}" for x in out[t]))


main(sys.argv[1] if len(sys.argv) > 1 else "2026")
