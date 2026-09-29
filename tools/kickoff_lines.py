#!/usr/bin/env python3
"""ESPN's kickoff win chance and the closing line: the two pre-game numbers ESPN keeps on
a finished game, and the ones every week is judged by.

  - ESPN's win chance at kickoff: the first point of its in-game win-probability chart
  - the closing market line (spread and total), with the opening line alongside

Neither is a rating read after the fact -- both were fixed before the ball was kicked --
so they are an honest "before". Our own FPI favourite cannot be rebuilt (ESPN only serves
today's ratings), so these weeks carry none.

Two modes:

  backfill <weeks>  weeks played before freezing began (1-3): writes them whole, marked
                    kind:"kickoff". Only fully played weeks; a week already present is
                    never touched.
  settle            weeks frozen by freeze_picks.py: once a game is final, adds `ko`
                    (ESPN's kickoff chance) and `close` (closing line) beside the frozen
                    numbers. The frozen fields themselves -- our FPI favourite and the
                    Wednesday snapshot -- are never changed. Runs on every workflow pass;
                    a game already settled is skipped, so it costs nothing once done.

  python3 tools/kickoff_lines.py backfill 1 2 3
  python3 tools/kickoff_lines.py settle
  (add --dry-run to either to report only)
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


def kept_numbers(event_id, home, away):
    """-> (ko, close, open) for a played game: ESPN's kickoff chance and the lines."""
    s = get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event_id}')
    wp = s.get('winprobability') or []
    ko = None
    if wp:
        h, t = wp[0].get('homeWinPercentage'), wp[0].get('tiePercentage') or 0
        ko = {'home': round(h * 100, 1), 'away': round((1 - h - t) * 100, 1)}
    pc = (s.get('pickcenter') or [None])[0] or {}
    ps = (pc.get('pointSpread') or {}).get('home') or {}
    close = line_from(ps.get('close') or {}, home, away)
    if close is not None:
        close = {**close, 'total': pc.get('overUnder'), 'text': pc.get('details'),
                 'book': (pc.get('provider') or {}).get('name')}
    return ko, close, line_from(ps.get('open') or {}, home, away)


def write(picks):
    with open(OUT, 'w') as fh:
        fh.write('// Pre-game expectations. Weeks from 4 on are frozen before their first kickoff by\n'
                 '// tools/freeze_picks.py (our FPI favourite + a Wednesday snapshot) and, once each\n'
                 '// game is final, gain ESPN\'s kickoff chance (ko) and the closing line (close) from\n'
                 '// tools/kickoff_lines.py settle. Weeks marked kind:"kickoff" (1-3) were played before\n'
                 '// freezing began and hold only those two. Compared with the results in the tower.\n')
        fh.write('export const PICKS2026 = ' + json.dumps(dict(sorted(picks.items(), key=lambda kv: int(kv[0]))),
                                                     separators=(',', ':')) + '\n')
    print(f'wrote {os.path.relpath(OUT, ROOT)}')


def settle(picks, dry):
    changed = 0
    for w, wk in picks.items():
        if wk.get('kind') == 'kickoff':
            continue
        todo = [g for g in wk['games'] if 'ko' not in g]
        if not todo:
            continue
        final = {e['id'] for e in get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
                                      f'?dates={SEASON}&seasontype=2&week={w}').get('events', [])
                 if e['status']['type']['name'] == 'STATUS_FINAL'}
        for g in todo:
            if g['id'] not in final:
                continue
            ko, close, opened = kept_numbers(g['id'], g['home'], g['away'])
            if ko is None and close is None:
                print(f"  wk{w} {g['away']}@{g['home']}: nothing kept yet — will retry")
                continue
            g['ko'], g['close'], g['lineOpen'] = ko, close, opened
            changed += 1
            print(f"  wk{w} {g['away']:>3} @ {g['home']:<3} settled: ESPN at kickoff "
                  f"{ko and ko['home']}% home · close {close and close['fav']} -{close and close['pts']}")
    if not changed:
        print('settle: nothing to settle'); return
    if dry:
        print(f'--dry-run: {changed} games not written'); return
    write(picks)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    picks = load_picks()
    if mode == 'settle':
        return settle(picks, dry)
    if mode != 'backfill':
        print(__doc__); sys.exit(2)
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
            ko, close, opened = kept_numbers(e['id'], home, away)
            g = {'id': e['id'], 'kick': e['date'], 'home': home, 'away': away, 'fpi': None,
                 'espnHome': ko and ko['home'], 'espnAway': ko and ko['away'],
                 'line': close and {**close, 'close': True}, 'lineOpen': opened}
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
    write(picks)


main()
