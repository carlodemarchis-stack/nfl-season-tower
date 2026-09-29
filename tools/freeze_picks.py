#!/usr/bin/env python3
"""Freeze the pre-game expectations for the next NFL week, so they can be compared with
the results afterwards.

A rating read AFTER a game already contains that game's result, so the only honest
"before" is one written down before kickoff. Once per week, in the gap between Monday
night's game and Thursday's kickoff, this records for every game of the coming week:

  - ESPN's Matchup Predictor: each side's win chance, home field included (ESPN's number)
  - the market line: spread and over/under from ESPN's pick centre (DraftKings)
  - our own FPI favourite: the rating gap on a neutral field, as the tower shows it

Rules that keep the record honest:
  - Only the NEAREST unplayed week is ever frozen, and only once the week before it is
    over -- so ratings are as fresh as they can be.
  - Only within 48h of that week's first kickoff (i.e. from Wednesday): late enough to
    include ESPN's post-weekend rating update.
  - Never once any game of the week has kicked off.
  - A frozen week is never rewritten. There is no --force.

  python3 tools/freeze_picks.py            # freeze if the window is open
  python3 tools/freeze_picks.py --dry-run  # show what would be frozen, ignoring the 48h window
"""
import json, os, subprocess, sys
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/data/picks-2026.js')
FPI = os.path.join(ROOT, 'src/data/fpi-2026.js')
SEASON, WEEKS = 2026, 18
WINDOW = timedelta(hours=48)
SD = 13.5          # usual spread of NFL results around the expected margin, in points

ALIAS = {'WSH': 'WAS', 'LA': 'LAR', 'JAC': 'JAX'}
norm = lambda a: ALIAS.get(a, a)


def get(url):
    # curl, not urllib: ESPN 403s Python's default client
    out = subprocess.run(['curl', '-s', '--max-time', '30', url],
                         capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else {}


def load_js(path, name):
    if not os.path.exists(path):
        return None
    s = open(path).read()
    return json.JSONDecoder().raw_decode(s[s.index('{', s.index(name)):])[0]


def phi(x):
    from math import erf, sqrt
    return 0.5 * (1 + erf(x / sqrt(2)))


def scoreboard(week):
    return get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
               f'?dates={SEASON}&seasontype=2&week={week}').get('events', [])


def main():
    dry = '--dry-run' in sys.argv
    now = datetime.now(timezone.utc)
    picks = load_js(OUT, 'PICKS2026') or {}
    fpi = load_js(FPI, 'FPI2026')
    if not fpi:
        print('no fpi-2026.js — run tools/fetch_fpi.py first', file=sys.stderr)
        sys.exit(1)

    # The nearest week that still has an unfinished game is the only candidate.
    target, events = None, None
    for w in range(1, WEEKS + 1):
        ev = scoreboard(w)
        if any(e['status']['type']['name'] != 'STATUS_FINAL' for e in ev):
            target, events = w, ev
            break
    if target is None:
        print('season over — nothing to freeze'); return
    if str(target) in picks:
        print(f'week {target} already frozen at {picks[str(target)]["frozenAt"]} — nothing to do'); return
    started = [e['shortName'] for e in events if e['status']['type']['name'] != 'STATUS_SCHEDULED']
    if started:
        print(f'week {target} has already kicked off ({", ".join(started)}) — too late to freeze it honestly')
        return
    first = min(datetime.fromisoformat(e['date'].replace('Z', '+00:00')) for e in events)
    if first - now > WINDOW and not dry:
        print(f'week {target}: first kickoff {first:%a %d %b %H:%M} UTC is more than 48h away — '
              f'freezing from {first - WINDOW:%a %d %b %H:%M} UTC')
        return

    F = fpi['teams']
    games = []
    for e in events:
        comp = e['competitions'][0]
        side = {c['homeAway']: c for c in comp['competitors']}
        home, away = norm(side['home']['team']['abbreviation']), norm(side['away']['team']['abbreviation'])
        s = get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={e["id"]}')

        g = {'id': e['id'], 'kick': e['date'], 'home': home, 'away': away}

        # ESPN Matchup Predictor, home field included
        pr = s.get('predictor') or {}
        try:
            g['espnHome'] = round(float(pr['homeTeam']['gameProjection']), 1)
            g['espnAway'] = round(float(pr['awayTeam']['gameProjection']), 1)
        except (KeyError, TypeError, ValueError):
            g['espnHome'] = g['espnAway'] = None

        # Market line. ESPN's spread is from the home side's point of view: negative = home favoured.
        pc = (s.get('pickcenter') or [None])[0]
        if pc and pc.get('spread') is not None:
            home_fav = bool((pc.get('homeTeamOdds') or {}).get('favorite'))
            pts = abs(float(pc['spread']))
            # a pick'em (spread 0) has no favourite
            g['line'] = {'fav': None if pts == 0 else (home if home_fav else away), 'pts': pts,
                         'total': pc.get('overUnder'), 'text': pc.get('details'),
                         'book': (pc.get('provider') or {}).get('name')}
        else:
            g['line'] = None

        # Our own number: the FPI gap, neutral field (what the tower's game card shows)
        if home in F and away in F:
            gap = F[home]['fpi'] - F[away]['fpi']
            fav = home if gap >= 0 else away
            g['fpi'] = {'fav': fav, 'pts': round(abs(gap), 1), 'p': round(phi(abs(gap) / SD) * 100)}
        else:
            g['fpi'] = None
        games.append(g)

    entry = {'frozenAt': now.strftime('%Y-%m-%dT%H:%MZ'), 'fpiUpdated': fpi.get('updated'),
             'games': sorted(games, key=lambda g: (g['kick'], g['away']))}

    for g in entry['games']:
        e = f"ESPN {g['home']} {g['espnHome']}% / {g['away']} {g['espnAway']}%" if g['espnHome'] is not None else 'ESPN —'
        l = (f"line {g['line']['fav']} -{g['line']['pts']}" if g['line']['fav'] else 'line pick\'em') if g['line'] else 'line —'
        f = f"FPI {g['fpi']['fav']} by {g['fpi']['pts']}" if g['fpi'] else 'FPI —'
        print(f"  {g['away']:>3} @ {g['home']:<3}  {e:34} {l:16} {f}")
    missing = [f"{g['away']}@{g['home']}" for g in games if g['espnHome'] is None or g['line'] is None]
    if missing:
        print(f'  (no predictor or line yet for: {", ".join(missing)})')

    if dry:
        print(f'\n--dry-run: week {target} not written'); return
    picks[str(target)] = entry
    with open(OUT, 'w') as fh:
        fh.write('// Pre-game expectations, frozen once per week before its first kickoff by\n'
                 '// tools/freeze_picks.py and never rewritten. Compared with the results in the tower.\n')
        fh.write('export const PICKS2026 = ' + json.dumps(picks, separators=(',', ':')) + '\n')
    print(f'\nfroze week {target}: {len(games)} games -> {os.path.relpath(OUT, ROOT)}')


main()
