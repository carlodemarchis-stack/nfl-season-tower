#!/usr/bin/env python3
"""Fill in the pre-game expectations for weeks that were played before we started
freezing them, from the two pre-game numbers ESPN keeps on a finished game:

  - ESPN's win chance at kickoff: the first point of its in-game win-probability chart
  - the closing market line (spread and total), with the opening line alongside

Neither is a rating read after the fact -- both were fixed before the ball was kicked --
so they are an honest "before". Our own FPI favourite cannot be rebuilt (ESPN only serves
today's ratings), so these weeks carry none.

Only fully played weeks are written, and a week already in picks-2026.js is never
touched -- including any week frozen the normal way by freeze_picks.py.

  python3 tools/backfill_kickoff.py 1 2 3            # write those weeks
  python3 tools/backfill_kickoff.py 3 --dry-run      # report only
"""
import json, os, subprocess, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/data/picks-2026.js')
SEASON = 2026
ALIAS = {'WSH': 'WAS', 'LA': 'LAR', 'JAC': 'JAX'}
norm = lambda a: ALIAS.get(a, a)


def get(url):
    out = subprocess.run(['curl', '-s', '--max-time', '30', url],
                         capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else {}


def load_picks():
    if not os.path.exists(OUT):
        return {}
    s = open(OUT).read()
    return json.JSONDecoder().raw_decode(s[s.index('{', s.index('PICKS2026')):])[0]


def line_from(side, home, away):
    """ESPN's '-7' / '+2.5' for the HOME side -> {fav, pts}; pick'em -> fav None."""
    try:
        v = float(str(side['line']).replace('+', ''))
    except (KeyError, TypeError, ValueError):
        return None
    if v == 0:
        return {'fav': None, 'pts': 0.0}
    return {'fav': home if v < 0 else away, 'pts': abs(v)}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    picks = load_picks()
    for w in [int(a) for a in args]:
        if str(w) in picks:
            print(f'week {w}: already in picks-2026.js ({picks[str(w)].get("kind", "frozen")}) — left as is')
            continue
        ev = get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
                 f'?dates={SEASON}&seasontype=2&week={w}').get('events', [])
        if not ev or any(e['status']['type']['name'] != 'STATUS_FINAL' for e in ev):
            print(f'week {w}: not fully played — skipped')
            continue
        games, gaps = [], []
        for e in ev:
            side = {c['homeAway']: c for c in e['competitions'][0]['competitors']}
            home, away = norm(side['home']['team']['abbreviation']), norm(side['away']['team']['abbreviation'])
            s = get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={e["id"]}')
            g = {'id': e['id'], 'kick': e['date'], 'home': home, 'away': away, 'fpi': None}
            wp = s.get('winprobability') or []
            if wp:
                h, t = wp[0].get('homeWinPercentage'), wp[0].get('tiePercentage') or 0
                g['espnHome'] = round(h * 100, 1)
                g['espnAway'] = round((1 - h - t) * 100, 1)
            else:
                g['espnHome'] = g['espnAway'] = None
            pc = (s.get('pickcenter') or [None])[0] or {}
            ps = (pc.get('pointSpread') or {}).get('home') or {}
            close = line_from(ps.get('close') or {}, home, away)
            g['line'] = None if close is None else {**close,
                'total': pc.get('overUnder'), 'text': pc.get('details'),
                'book': (pc.get('provider') or {}).get('name'), 'close': True}
            g['lineOpen'] = line_from(ps.get('open') or {}, home, away)
            if g['espnHome'] is None or g['line'] is None:
                gaps.append(f'{away}@{home}')
            games.append(g)
            e_ = f"ESPN {home} {g['espnHome']}%" if g['espnHome'] is not None else 'ESPN —'
            l_ = (f"close {g['line']['fav']} -{g['line']['pts']}" if g['line'] and g['line']['fav'] else "close pick'em") if g['line'] else 'close —'
            print(f"  wk{w} {away:>3} @ {home:<3}  {e_:18} {l_}")
        if gaps:
            print(f'  week {w}: missing kickoff chance or closing line for {", ".join(gaps)}')
        picks[str(w)] = {'kind': 'kickoff',
                         'frozenAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
                         'games': sorted(games, key=lambda g: (g['kick'], g['away']))}
        print(f'week {w}: {len(games)} games')
    if dry:
        print('--dry-run: nothing written'); return
    with open(OUT, 'w') as fh:
        fh.write('// Pre-game expectations, frozen once per week before its first kickoff by\n'
                 '// tools/freeze_picks.py and never rewritten. Weeks marked kind:"kickoff" were\n'
                 '// played before freezing began and use ESPN\'s kickoff win chance and the closing\n'
                 '// line instead (tools/backfill_kickoff.py). Compared with the results in the tower.\n')
        fh.write('export const PICKS2026 = ' + json.dumps(dict(sorted(picks.items(), key=lambda kv: int(kv[0]))),
                                                     separators=(',', ':')) + '\n')
    print(f'wrote {os.path.relpath(OUT, ROOT)}')


main()
