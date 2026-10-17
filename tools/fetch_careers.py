#!/usr/bin/env python3
"""Career box for every player in the Players film: career totals, best season, draft
and major awards.

    python3 tools/fetch_careers.py 2026

Three ESPN reads per player: the career stats table (totals + one row per season), the
core athlete record (draft year, round, pick, team) and the awards list (NFL MVP,
Offensive/Defensive Player of the Year, Rookie of the Year...). Super Bowl rings come
from tools/fetch_titles.py; the Super Bowl MVP award is skipped here for that reason.
Career totals include the current season, so the results workflow re-runs this.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATS = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/%s/stats"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl"
TEAMS = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams"
ALIAS = {"WSH": "WAS", "LA": "LAR", "JAC": "JAX"}

# per position group: the career numbers worth saying, the stat a best season is
# judged on (and the fewest attempts for a rate stat to count), as [category, key, label]
CAREER = {
    "qb": ([("passing", "passingYards", "pass yds"), ("passing", "passingTouchdowns", "TD")],
           ("passing", "passingYards", "pass yds", 0)),
    "rb": ([("rushing", "rushingYards", "rush yds"), ("rushing", "rushingTouchdowns", "TD")],
           ("rushing", "rushingYards", "rush yds", 0)),
    "wr": ([("receiving", "receivingYards", "rec yds"), ("receiving", "receptions", "catches"),
            ("receiving", "receivingTouchdowns", "TD")],
           ("receiving", "receivingYards", "rec yds", 0)),
    "dl": ([("defensive", "sacks", "sacks"), ("defensive", "totalTackles", "tackles")],
           ("defensive", "sacks", "sacks", 0)),
    "lb": ([("defensive", "totalTackles", "tackles"), ("defensive", "sacks", "sacks")],
           ("defensive", "totalTackles", "tackles", 0)),
    "db": ([("defensive", "interceptions", "INT"), ("defensive", "totalTackles", "tackles")],
           ("defensive", "interceptions", "INT", 0)),
    "pk": ([("kicking", "fieldGoalsMade-fieldGoalAttempts", "FG"), ("kicking", "fieldGoalPct", "%")],
           ("kicking", "fieldGoalsMade-fieldGoalAttempts", "field goals", 0)),
    "p":  ([("punting", "punts", "punts"), ("punting", "grossAvgPuntYards", "yds a punt")],
           ("punting", "grossAvgPuntYards", "yds a punt", 20)),
}


def get(url):
    # curl, not urllib: ESPN 403s Python's default client
    out = subprocess.run(["curl", "-s", "--compressed", "--max-time", "40", url],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {}


def num(s):
    """'31,351' -> 31351, '234-270' -> 234 (made), '64.0' -> 64.0"""
    s = str(s).split("-")[0].replace(",", "")
    try:
        f = float(s)
    except ValueError:
        return 0
    return int(f) if f == int(f) else f


def career(pid, group):
    d = get(STATS % pid)
    cats = {c["name"]: c for c in d.get("categories", [])}
    want, (bc, bk, bl, floor) = CAREER[group]
    out = []
    for cat, key, label in want:
        c = cats.get(cat)
        if c and key in c["names"]:
            out.append([c["totals"][c["names"].index(key)], label])
    best, gp = None, None
    c = cats.get(bc)
    if c and bk in c["names"]:
        i = c["names"].index(bk)
        gp = c["totals"][c["names"].index("gamesPlayed")] if "gamesPlayed" in c["names"] else None
        rows = []
        for r in c.get("statistics", []):
            st = r.get("stats") or []
            if i >= len(st):
                continue
            # a rate stat (punting average) needs a full season behind it
            vol = num(st[c["names"].index("punts")]) if floor and "punts" in c["names"] else floor
            if vol >= floor:
                rows.append((num(st[i]), r["season"]["year"], st[i]))
        if rows:
            v, y, shown = max(rows)
            if v:
                best = [y, shown.split("-")[0], bl]
    return out, best, gp


def draft_and_awards(pid, team_of):
    a = get(f"{CORE}/athletes/{pid}")
    dr = a.get("draft") or {}
    draft = None
    if dr.get("year"):
        tid = (dr.get("team") or {}).get("$ref", "").split("/teams/")[-1].split("?")[0]
        draft = {"y": dr["year"], "r": dr.get("round"), "p": dr.get("selection"), "t": team_of.get(tid)}
    aw = []
    for it in (get(f"{CORE}/athletes/{pid}/awards").get("items") or []):
        x = get(it["$ref"])
        name = x.get("name")
        if not name or name == "Super Bowl MVP":
            continue
        aw.append([name, int(it["$ref"].split("/seasons/")[1].split("/")[0])])
    return draft, sorted(aw, key=lambda t: t[1]), (a.get("debutYear"))


def main(season):
    s = open(os.path.join(ROOT, f"src/data/players-{season}.js")).read()
    P = json.JSONDecoder().raw_decode(s[s.index("{", s.index(f"PLAYERS{season}")):])[0]
    group = {}
    for g in P["groups"]:
        for i in g["ids"]:
            pos = P["players"][i]["pos"]
            group[i] = g["key"] if g["key"] != "k" else ("p" if pos == "P" else "pk")
    team_of = {}
    for lg in get(TEAMS).get("sports", [{}])[0].get("leagues", []):
        for t in lg.get("teams", []):
            t = t["team"]
            team_of[str(t["id"])] = ALIAS.get(t["abbreviation"], t["abbreviation"])

    def one(pid):
        c, best, gp = career(pid, group[pid])
        draft, aw, debut = draft_and_awards(pid, team_of)
        return pid, {"c": c, "best": best, "gp": gp, "d": draft, "aw": aw, "debut": debut}

    with ThreadPoolExecutor(max_workers=8) as ex:
        out = dict(ex.map(one, list(group)))
    thin = [p for p, v in out.items() if not v["c"]]
    if len(thin) > len(out) // 4:
        print(f"career pull thin ({len(thin)} of {len(out)} empty) — not writing", file=sys.stderr)
        sys.exit(1)
    p = os.path.join(ROOT, f"src/data/careers-{season}.js")
    with open(p, "w") as f:
        f.write("// Career box per film player: totals, best season, draft, major awards.\n"
                "// Generated by tools/fetch_careers.py from ESPN.\n")
        f.write(f"export const CAREERS{season} = "
                + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"{len(out)} players, {sum(1 for v in out.values() if v['aw'])} with awards, "
          f"{sum(1 for v in out.values() if v['d'])} drafted -> {os.path.relpath(p, ROOT)}")
    for pid in ("3918298", "3139477"):
        if pid in out:
            print(" ", P["players"][pid]["n"], out[pid])


main(sys.argv[1] if len(sys.argv) > 1 else "2026")
