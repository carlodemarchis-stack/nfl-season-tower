import React from 'react'
import { css } from './css'

// ---------------------------------------------------------------------------
// NFL Season Tower — faithful React port of the design-handoff prototype.
//
// The prototype was authored against an in-house component runtime (template + a
// `class Component extends DCLogic`). This is a near 1:1 port to a React class:
//   - every logic method is carried over essentially verbatim
//   - `renderVals()` still computes the full "vals" object (incl. the load-bearing
//     zone-sizing math), and render() consumes it as JSX
//   - the FLIP re-sort uses getSnapshotBeforeUpdate / componentDidUpdate, exactly
//     as the original did
// Inline styles are kept as the prototype's finalized CSS strings and parsed by css().
// ---------------------------------------------------------------------------

type Orientation = 'auto' | 'towers' | 'rows'

interface Props {
  season: '2024' | '2025' | '2026'
  colorMode: 'result' | 'opponent'
  pendingMode: 'ceiling' | 'stack'
  lossReverse: boolean
  orientation: Orientation
  tieHalf: boolean
  scoreLabels: boolean
  showByes: boolean
  editScores: boolean
  seed: number
}

type Dict = Record<string, any>

interface State {
  TEAMS26: Dict | null
  TEAMS25: Dict | null
  RES25: Dict | null
  MAX25: number
  TEAMS24: Dict | null
  RES24: Dict | null
  MAX24: number
  DET24: Dict | null
  DET25?: Dict | null
  results: Dict
  cw: number
  ch: number
  pop: Dict | null
  seed: number
  throughWeek: number | null
  userSort: any
  playing: boolean
  ROST: Dict | null
  teamPop: string | null
  teamTab: 'roster' | 'schedule' | 'info'
  rUnit: string
  rQuery: string
  rPos: string
  rPosOpen: boolean
  seasonSel: string | null
  seasonOpen: boolean
  groupBy?: 'league' | 'conf' | 'div'
  rankBy?: 'pct' | 'wins'
}

export class SeasonTower extends React.Component<Props, State> {
  chartRef = React.createRef<HTMLDivElement>()
  _measure!: () => void
  _ro?: ResizeObserver
  _mt: any = null
  _timer: any = null

  state: State = {
    TEAMS26: null, TEAMS25: null, RES25: null, MAX25: 18, TEAMS24: null, RES24: null, MAX24: 18,
    DET24: null, results: {}, cw: 1280, ch: 600, pop: null, seed: 20260913, throughWeek: null,
    userSort: null, playing: false, ROST: null, teamPop: null, teamTab: 'roster', rUnit: 'all',
    rQuery: '', rPos: 'all', rPosOpen: false, seasonSel: null, seasonOpen: false,
    groupBy: 'div', rankBy: 'wins',
  }

  componentDidMount() {
    Promise.all([
      import('./data/schedule-2026.js').then(m => ({ T26: m.TEAMS })).catch(() => ({ T26: null })),
      import('./data/schedule-2025.js').then(m => ({ T25: m.TEAMS2025, R25: m.RESULTS2025, MAX25: m.MAXWEEK2025 })),
      import('./data/details-2025.js').then(m => ({ DET: m.DETAILS2025 })).catch(() => ({ DET: {} })),
      import('./data/rosters-2025.js').then(m => ({ R: m.ROSTERS2025 })).catch(() => ({ R: {} })),
      import('./data/schedule-2024.js').then(m => ({ T24: m.TEAMS2024, R24: m.RESULTS2024, MAX24: m.MAXWEEK2024 })).catch(() => ({ T24: null, R24: {}, MAX24: 18 })),
      import('./data/details-2024.js').then(m => ({ DET: m.DETAILS2024 })).catch(() => ({ DET: {} })),
    ]).then(([a, b, c, d, e, f]: any[]) => {
      this.setState({ TEAMS26: a.T26, TEAMS25: b.T25, RES25: b.R25, MAX25: b.MAX25, DET25: c.DET, ROST: d.R, TEAMS24: e.T24, RES24: e.R24, MAX24: e.MAX24, DET24: f.DET }, () => {
        // default the week to the latest available for the active season
        this.buildThrough(this.defaultWeek())
      })
    }).catch(err => console.error('data load failed', err))
    const el = this.chartRef.current
    this._measure = () => {
      const c = this.chartRef.current; if (!c) return
      const w = Math.round(c.clientWidth - 32), h = Math.round(c.clientHeight - 20)
      if (w > 40 && h > 40) this.setState(s => (w === s.cw && h === s.ch) ? null : { cw: w, ch: h } as any)
    }
    if (el && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._measure())
      this._ro.observe(el)
    }
    // The ref can attach after mount; retry until the real size is picked up so the tower is
    // never laid out against the 600px state default (which overflows a short viewport).
    let tries = 0
    this._mt = setInterval(() => {
      this._measure()
      if (this.chartRef.current || ++tries > 20) {
        if (this.chartRef.current && !this._ro && window.ResizeObserver) { this._ro = new ResizeObserver(() => this._measure()); this._ro.observe(this.chartRef.current) }
        clearInterval(this._mt); this._mt = null
      }
    }, 60)
    requestAnimationFrame(() => this._measure())
    window.addEventListener('keydown', this.onKey)
  }

  season() { const s = this.state.seasonSel || this.props.season || '2025'; return (s === '2024' || s === '2026') ? s : '2025' }
  activeTeams() { const s = this.season(); return s === '2026' ? this.state.TEAMS26 : s === '2024' ? this.state.TEAMS24 : this.state.TEAMS25 }
  maxWeek() { const s = this.season(); return s === '2026' ? 18 : s === '2024' ? (this.state.MAX24 || 18) : (this.state.MAX25 || 18) }
  defaultWeek() { return this.season() === '2026' ? 0 : this.maxWeek() }
  pickSeason(y: string) { if (y === this.season()) { this.setState({ seasonOpen: false }); return } if (this._timer) { clearInterval(this._timer); this._timer = null } this.setState({ seasonSel: y, seasonOpen: false, playing: false, pop: null, teamPop: null }, () => this.buildThrough(this.defaultWeek())) }
  componentWillUnmount() { if (this._ro) this._ro.disconnect(); if (this._mt) clearInterval(this._mt); if (this._timer) clearInterval(this._timer); window.removeEventListener('keydown', this.onKey) }

  hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
  mulberry32(a: number) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

  // Reveal / generate results through week n.
  //  2025 / 2024 -> real final scores  |  2026 -> deterministically simulated from the seed
  buildThrough(n: number) {
    const T = this.activeTeams(); if (!T) return
    n = Math.max(0, Math.min(this.maxWeek(), n))
    const r: Dict = {}
    if (this.season() === '2025' || this.season() === '2024') {
      const R = (this.season() === '2024' ? this.state.RES24 : this.state.RES25) || {}
      for (const ab of Object.keys(T)) {
        for (const g of T[ab].games) {
          if (g.w > n) continue; const k = this.keyOf(ab, g.w); const real = R[k]; if (real) r[k] = { ...real }
        }
      }
    } else {
      const seed = this.props.seed || 20260913; const done = new Set<string>()
      for (const ab of Object.keys(T)) {
        for (const g of T[ab].games) {
          if (g.w > n) continue
          const pair = [ab, g.opp].sort(); const id = g.w + '|' + pair.join('|'); if (done.has(id)) continue; done.add(id)
          const rnd = this.mulberry32(this.hashStr(id + ':' + seed))
          let a, b; if (rnd() < 0.03) { a = b = 17 + Math.floor(rnd() * 11) }
          else { const win = rnd() < 0.5; const hi = 17 + Math.floor(rnd() * 21); let lo = 6 + Math.floor(rnd() * Math.max(1, hi - 9)); if (lo >= hi) lo = hi - 3; a = win ? hi : lo; b = win ? lo : hi }
          const k0 = this.keyOf(pair[0], g.w), k1 = this.keyOf(pair[1], g.w)
          r[k0] = { us: a, them: b, res: this.infer(a, b), hasU: true, hasT: true }
          r[k1] = { us: b, them: a, res: this.infer(b, a), hasU: true, hasT: true }
        }
      }
    }
    this.setState({ results: r, throughWeek: n, pop: null })
  }
  togglePlay() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }); return }
    const mx = this.maxWeek()
    if ((this.state.throughWeek || 0) >= mx) this.buildThrough(0)
    this.setState({ playing: true })
    this._timer = setInterval(() => {
      const n = Math.min(mx, (this.state.throughWeek || 0) + 1); this.buildThrough(n)
      if (n >= mx) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }) }
    }, 950)
  }
  // Manual one-week step (‹ / › buttons and ← / → keys). Stops playback first.
  stepWeek(delta: number) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; this.setState({ playing: false }) }
    const cur = this.state.throughWeek == null ? this.defaultWeek() : this.state.throughWeek
    this.buildThrough(cur + delta) // buildThrough clamps to [0, maxWeek]
  }
  onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    // Don't hijack arrows while typing in a field or while a modal is open.
    const t = e.target as HTMLElement | null
    const tag = t && t.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return
    if (this.state.pop || this.state.teamPop) return
    e.preventDefault()
    this.stepWeek(e.key === 'ArrowRight' ? 1 : -1)
  }

  getSnapshotBeforeUpdate() {
    const root = this.chartRef.current; if (!root) return null
    const m: Dict = {}; root.querySelectorAll('[data-team]').forEach(el => { const r = (el as HTMLElement).getBoundingClientRect(); m[el.getAttribute('data-team')!] = { x: r.left, y: r.top } })
    return m
  }
  componentDidUpdate(pp: Props, _ps: State, snap: Dict | null) {
    // re-seed when the season prop changes
    if (pp && pp.season !== this.props.season) { this.setState({ seasonSel: null }, () => this.buildThrough(this.defaultWeek())); return }
    // re-generate the 2026 sim when the seed prop changes
    if (pp && pp.seed !== this.props.seed) { this.buildThrough(this.state.throughWeek == null ? this.defaultWeek() : this.state.throughWeek); return }
    if (!snap) return; const root = this.chartRef.current; if (!root) return
    root.querySelectorAll('[data-team]').forEach(el => {
      const ab = el.getAttribute('data-team')!; const prev = snap[ab]; if (!prev) return
      const node = el as HTMLElement
      const r = node.getBoundingClientRect(); const dx = prev.x - r.left, dy = prev.y - r.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      node.style.transition = 'none'; node.style.transform = `translate(${dx}px,${dy}px)`
      requestAnimationFrame(() => { node.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)'; node.style.transform = '' })
    })
  }

  fmtEt(et: string) {
    if (!et) return ''; const m = et.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\s*([A-Z]+)?$/); if (!m) return et
    const [, Y, Mo, D, H, Mi, TZ] = m; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const date = `${MON[(+Mo) - 1]} ${+D}, ${Y}`; if (H === '00' && Mi === '00') return date
    let h = (+H) % 12; if (h === 0) h = 12; const ap = (+H) >= 12 ? 'PM' : 'AM'; const mm = Mi === '00' ? '' : (':' + Mi)
    return `${date} · ${h}${mm} ${ap}${TZ ? (' ' + TZ) : ''}`
  }
  keyOf(a: string, w: number) { return a + ':' + w }
  getRes(a: string, w: number) { return this.state.results[this.keyOf(a, w)] || null }
  infer(us: number, them: number) { return us > them ? 'W' : us < them ? 'L' : 'T' }
  pn(v: any) { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isNaN(n) ? null : n }
  statNum(s: any) { if (s == null) return null; s = String(s); const t = s.match(/^(\d+):(\d+)$/); if (t) return (+t[1]) * 60 + (+t[2]); const m = s.match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null }
  mix(hex: string, to: string, t: number) { const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const a = p(hex), b = p(to); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('') }
  contrast(hex: string) { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return ((r * 299 + g * 587 + b * 114) / 1000) > 150 ? '#16181d' : '#ffffff' }

  applyScore(abbr: string, w: number, us: number | null, them: number | null) {
    const T = this.activeTeams(); if (!T) return; const t = T[abbr]; const g = t.games.find((x: any) => x.w === w); if (!g) return; const opp = g.opp
    this.setState(s => {
      const r = { ...s.results }; const k = this.keyOf(abbr, w), ok = this.keyOf(opp, w)
      const uNull = (us === null || us === undefined || Number.isNaN(us)), tNull = (them === null || them === undefined || Number.isNaN(them))
      if (uNull && tNull) { delete r[k]; delete r[ok]; return { results: r } }
      const U = uNull ? 0 : us as number, TH = tNull ? 0 : them as number
      r[k] = { us: U, them: TH, res: this.infer(U, TH), hasU: !uNull, hasT: !tNull }
      r[ok] = { us: TH, them: U, res: this.infer(TH, U), hasU: !tNull, hasT: !uNull }
      return { results: r }
    })
  }
  applyField(which: string, val: any) {
    const p = this.state.pop; if (!p) return; const r = this.getRes(p.abbr, p.w) || {}
    const us = which === 'us' ? this.pn(val) : (r.hasU === false ? null : (r.us == null ? null : r.us))
    const them = which === 'them' ? this.pn(val) : (r.hasT === false ? null : (r.them == null ? null : r.them))
    this.applyScore(p.abbr, p.w, us, them)
  }
  quick(res: string) { const p = this.state.pop; if (!p) return; if (res === 'W') this.applyScore(p.abbr, p.w, 24, 17); else if (res === 'L') this.applyScore(p.abbr, p.w, 17, 24); else this.applyScore(p.abbr, p.w, 20, 20) }
  clearGame() { const p = this.state.pop; if (p) this.applyScore(p.abbr, p.w, null, null) }

  openPop(abbr: string, w: number) {
    const t = this.activeTeams()![abbr]; const g = t.games.find((x: any) => x.w === w); if (!g) return
    this.setState({ pop: { abbr, w, opp: g.opp, oppFull: g.oppFull, ha: g.ha, net: g.net, et: g.et } })
  }
  closePop() { this.setState({ pop: null }) }

  openTeam(abbr: string) { this.setState({ teamPop: abbr, teamTab: 'roster', rUnit: 'all', rQuery: '', rPos: 'all', rPosOpen: false }) }
  closeTeam() { this.setState({ teamPop: null }) }
  teamRecord(abbr: string) {
    const t = this.activeTeams()![abbr]; let W = 0, L = 0, Ti = 0
    for (const g of t.games) { const r = this.getRes(abbr, g.w); if (!r) continue; if (r.res === 'W') W++; else if (r.res === 'L') L++; else Ti++ }
    return { W, L, Ti, str: Ti ? `${W}-${L}-${Ti}` : `${W}-${L}` }
  }
  buildTeamModal(): Dict | null {
    const abbr = this.state.teamPop; if (!abbr) return null
    const T = this.activeTeams(); if (!T || !T[abbr]) return null
    const t = T[abbr]; const prim = t.primary || '#15181d'; const txt = this.contrast(prim)
    const rost = (this.state.ROST && this.state.ROST[abbr]) || null
    const rec = this.teamRecord(abbr)
    const played = rec.W + rec.L + rec.Ti
    const soft = this.mix(prim, '#ffffff', .9)
    const POS_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'T', 'OT', 'LT', 'RT', 'G', 'OG', 'LG', 'RG', 'C', 'OL', 'LS', 'DE', 'DT', 'NT', 'DL', 'EDGE', 'OLB', 'ILB', 'MLB', 'LB', 'CB', 'S', 'FS', 'SS', 'DB', 'K', 'P']
    const posRank = (p: string) => { const i = POS_ORDER.indexOf(p); return i < 0 ? 99 : i }
    const UNITS: [string, string][] = [['all', 'All'], ['offense', 'Offense'], ['defense', 'Defense'], ['specialTeam', 'Special Teams']]
    const unitChips = UNITS.map(([k, l]) => ({
      k, l, active: this.state.rUnit === k,
      style: `padding:7px 14px;border-radius:9px;border:none;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;` +
        (this.state.rUnit === k ? `background:${prim};color:${txt};` : `background:#F1F2F4;color:#5c616b;`),
      onClick: () => this.setState({ rUnit: k, rPos: 'all', rPosOpen: false }),
    }))
    let posList: string[] = []; let posOptions: Dict[] = []
    if (rost) {
      const q0 = (this.state.rQuery || '').trim().toLowerCase()
      const base = rost.players.filter((p: any) => {
        if (this.state.rUnit !== 'all' && p.u !== this.state.rUnit) return false
        if (q0 && !(p.n.toLowerCase().includes(q0) || (p.col || '').toLowerCase().includes(q0) || (p.pos || '').toLowerCase().includes(q0))) return false
        return true
      })
      const cnt: Dict = {}; for (const p of base) { cnt[p.pos] = (cnt[p.pos] || 0) + 1 }
      posList = Object.keys(cnt).sort((a, b) => posRank(a) - posRank(b) || (a < b ? -1 : 1))
    }
    const rPosSel = this.state.rPos || 'all'
    posOptions = ([['all', 'All positions']] as [string, string][]).concat(posList.map(p => [p, p] as [string, string])).map(([k, l]) => ({
      k, l, active: k === rPosSel,
      style: `display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 11px;border:none;border-radius:7px;background:${k === rPosSel ? '#F1F3F5' : '#fff'};color:#15181d;font-size:12.5px;font-weight:${k === rPosSel ? 800 : 600};cursor:pointer;text-align:left;width:100%;font-family:inherit;`,
      tick: k === rPosSel ? '✓' : '',
      onClick: () => this.setState({ rPos: k, rPosOpen: false }),
    }))
    const posDdLabel = rPosSel === 'all' ? 'All positions' : rPosSel
    const posDdBtnStyle = `display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;border:1px solid ${this.state.rPosOpen ? prim : '#E2E4E8'};background:${this.state.rPosOpen ? soft : '#fff'};color:#15181d;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap;font-family:inherit;transition:border-color .15s,background .15s;`
    const posDdArrow = `font-size:9px;color:#9298a1;display:inline-block;transition:transform .18s;transform:rotate(${this.state.rPosOpen ? 180 : 0}deg);`
    let groups: Dict[] = []; let total = 0
    if (rost) {
      const q = (this.state.rQuery || '').trim().toLowerCase()
      const players = rost.players.filter((p: any) => {
        if (this.state.rUnit !== 'all' && p.u !== this.state.rUnit) return false
        if (rPosSel !== 'all' && p.pos !== rPosSel) return false
        if (q && !(p.n.toLowerCase().includes(q) || (p.col || '').toLowerCase().includes(q) || (p.pos || '').toLowerCase().includes(q))) return false
        return true
      })
      total = players.length
      const byPos: Dict = {}
      for (const p of players) { (byPos[p.pos] = byPos[p.pos] || []).push(p) }
      groups = Object.keys(byPos).sort((a, b) => posRank(a) - posRank(b) || (a < b ? -1 : 1)).map(pos => {
        const arr = byPos[pos].sort((a: any, b: any) => { const ja = parseInt(a.j || 999, 10), jb = parseInt(b.j || 999, 10); return (ja || 999) - (jb || 999) })
        return {
          pos, count: arr.length,
          players: arr.map((p: any) => {
            const meta = [p.age != null ? p.age + ' yrs' : null, p.ht, p.wt, p.col, (p.exp != null ? (p.exp === 0 ? 'Rookie' : p.exp + ' yr' + (p.exp > 1 ? 's' : '')) : null)].filter(Boolean).join('  ·  ')
            return {
              id: p.id, name: p.n, jersey: p.j ? ('#' + p.j) : '', pos: p.pos, meta,
              avatarStyle: `width:42px;height:42px;flex:0 0 42px;border-radius:50%;background:${soft} url('https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png') center top/cover no-repeat;`,
              inactive: (p.st && p.st !== 'Active'),
            }
          }),
        }
      })
    }
    return {
      abbr, name: t.name, prim, txt, rec: rec.str, div: `${t.conf} ${t.div === 'N' ? 'North' : t.div === 'S' ? 'South' : t.div === 'E' ? 'East' : t.div === 'W' ? 'West' : t.div}`,
      coach: (rost && rost.coach) || '—', count: (rost && rost.count) || 0,
      headStyle: `background:linear-gradient(135deg,${prim} 0%,${this.mix(prim, '#000000', .25)} 100%);color:${txt};`,
      badgeStyle: `background:${txt === '#ffffff' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.08)'};color:${txt};`,
      hasRost: !!rost, unitChips, groups, total, played,
      posOptions, posDdLabel, posDdBtnStyle, posDdArrow, posDdOpen: this.state.rPosOpen,
      onTogglePosDd: () => this.setState(s => ({ rPosOpen: !s.rPosOpen })),
      tabRoster: this.state.teamTab === 'roster', tabSched: this.state.teamTab === 'schedule', tabInfo: this.state.teamTab === 'info',
      tRoster: this.teamTabStyle('roster'), tSched: this.teamTabStyle('schedule'), tInfo: this.teamTabStyle('info'),
      sched: this.buildTeamSchedule(abbr),
      infoRows: [{ k: 'Head coach', v: (rost && rost.coach) || '—' }, { k: 'Division', v: `${t.conf} ${t.div === 'N' ? 'North' : t.div === 'S' ? 'South' : t.div === 'E' ? 'East' : 'West'}` }, { k: 'Record', v: rec.str }, { k: 'Roster size', v: String((rost && rost.count) || 0) }],
    }
  }
  teamTabStyle(tab: string) {
    const prim = (() => { const T = this.activeTeams(); const a = this.state.teamPop; return (a && T && T[a] && T[a].primary) || '#15181d' })()
    const on = this.state.teamTab === tab
    return `flex:1;padding:12px 0;border:none;background:none;cursor:pointer;font-size:12.5px;font-weight:${on ? 800 : 600};color:${on ? '#15181d' : '#9298a1'};border-bottom:2.5px solid ${on ? prim : 'transparent'};transition:color .15s;`
  }
  buildTeamSchedule(abbr: string) {
    const t = this.activeTeams()![abbr]
    return t.games.slice().sort((a: any, b: any) => a.w - b.w).map((g: any) => {
      const r = this.getRes(abbr, g.w)
      const res = r ? r.res : null
      const c = res === 'W' ? ['#E7F4EC', '#1F8A4C'] : res === 'L' ? ['#FBEAE9', '#C23A2E'] : res === 'T' ? ['#F2E4BC', '#7C6320'] : ['#F1F2F4', '#9298a1']
      return {
        w: 'Wk ' + g.w, ha: g.ha === 'H' ? 'vs' : '@', opp: g.opp,
        score: r ? `${r.us}–${r.them}` : '—',
        badge: res || '—',
        badgeStyle: `flex:0 0 26px;text-align:center;font-size:10px;font-weight:800;color:${c[1]};background:${c[0]};border-radius:6px;padding:3px 0;`,
        onClick: () => this.setState({ teamPop: null, pop: { abbr, w: g.w, opp: g.opp, oppFull: g.oppFull, ha: g.ha, net: g.net, et: g.et } }),
      }
    })
  }
  reset() { if (this._timer) { clearInterval(this._timer); this._timer = null } this.setState({ results: {}, pop: null, throughWeek: 0, playing: false }) }

  renderVals(): Dict {
    const S = this.state, T = this.activeTeams()
    const seasonYr = this.season()
    const groupBy = S.groupBy || 'league'
    const rankBy = S.rankBy || 'pct'
    const colorMode = this.props.colorMode === 'opponent' ? 'opponent' : 'result'
    const lossReverse = this.props.lossReverse !== false
    const pendCeiling = this.props.pendingMode !== 'stack'
    const orientProp = this.props.orientation || 'auto'
    const tieHalf = this.props.tieHalf !== false
    const showScore = this.props.scoreLabels !== false
    const showByes = this.props.showByes !== false
    const canEdit = this.props.editScores !== false
    const mx = this.maxWeek()
    const seg = (on: boolean) => `padding:7px 11px;border:none;background:${on ? '#15181d' : '#fff'};color:${on ? '#fff' : '#727781'};font-size:12px;font-weight:700;cursor:pointer;`
    const tw = S.throughWeek == null ? this.defaultWeek() : S.throughWeek
    const orient = orientProp === 'towers' ? 'v' : orientProp === 'rows' ? 'h' : ((S.cw || 1280) < 820 ? 'h' : 'v')
    const base: Dict = {
      subtitle: seasonYr === '2026'
        ? 'Simulated 2026 season — fixtures are real, scores are generated. Drag the week slider to replay week by week.'
        : `Real ${seasonYr} results — wins build the block up, losses hang below the line. Drag the week slider to replay the season week by week.`,
      loadingText: `Loading ${seasonYr} schedule…`,
      segLeagueStyle: seg(groupBy === 'league'), segConfStyle: seg(groupBy === 'conf'), segDivStyle: seg(groupBy === 'div'),
      segPctStyle: seg(rankBy === 'pct'), segWinsStyle: seg(rankBy === 'wins'),
      grpLeague: () => this.setState({ groupBy: 'league' }), grpConf: () => this.setState({ groupBy: 'conf' }), grpDiv: () => this.setState({ groupBy: 'div' }),
      rankPct: () => this.setState({ rankBy: 'pct' }), rankWins: () => this.setState({ rankBy: 'wins' }),
      onReset: () => this.reset(), onPlay: () => this.togglePlay(),
      onStepBack: () => this.stepWeek(-1), onStepFwd: () => this.stepWeek(1),
      stepBackDisabled: tw <= 0, stepFwdDisabled: tw >= mx,
      onSlide: (e: any) => this.buildThrough(parseInt(e.target.value, 10) || 0),
      throughWeek: tw, sliderMax: mx, playLabel: S.playing ? '❘❘' : '▶',
      weekLabel: tw === 0 ? 'Through: —' : (tw >= mx ? 'Full season' : ('Through Wk ' + tw)),
      resultMode: colorMode !== 'opponent', oppMode: colorMode === 'opponent',
      seasonYr,
      seasonOpen: S.seasonOpen,
      onToggleSeason: () => this.setState(s => ({ seasonOpen: !s.seasonOpen })),
      seasonBtnStyle: `display:inline-flex;align-items:center;gap:4px;padding:1px 7px 1px 9px;border:1px solid ${S.seasonOpen ? '#15181d' : '#E4E7EB'};border-radius:8px;background:${S.seasonOpen ? '#F5F6F4' : '#fff'};color:#15181d;font-size:21px;font-weight:900;letter-spacing:-.3px;cursor:pointer;font-family:inherit;line-height:1.15;transition:border-color .15s,background .15s;`,
      seasonArrowStyle: `font-size:11px;color:#9298a1;display:inline-block;transition:transform .18s;transform:rotate(${S.seasonOpen ? 180 : 0}deg);`,
      seasonList: ([['2026', '2026'], ['2025', '2025'], ['2024', '2024']] as [string, string][]).map(([y, l]) => ({
        y, label: l, active: y === seasonYr, onClick: () => this.pickSeason(y),
        style: `display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 12px;border:none;border-radius:8px;background:${y === seasonYr ? '#F1F3F5' : '#fff'};color:#15181d;font-size:13.5px;font-weight:${y === seasonYr ? 800 : 600};cursor:pointer;text-align:left;width:100%;font-family:inherit;`,
        tick: y === seasonYr ? '✓' : '',
      })),
    }
    if (!T) { return { ...base, loading: true, teamsSorted: [], showBaseline: false, colsWrapStyle: '', playedStr: '', leaderAbbr: '', leaderRec: '', pop: null } }

    const list = Object.values(T).map((t: any) => {
      const wins: any[] = [], losses: any[] = [], ties: any[] = [], pend: any[] = []
      for (const g of t.games) {
        const r = this.getRes(t.abbr, g.w)
        if (!r) pend.push(g); else if (r.res === 'W') wins.push(g); else if (r.res === 'L') losses.push(g); else ties.push(g)
      }
      const W = wins.length, L = losses.length, Ti = ties.length, played = W + L + Ti
      const pct = played ? (W + 0.5 * Ti) / played : 0
      let bye: any = null
      if (showByes) {
        const weeksSet = new Set(t.games.map((g: any) => g.w))
        let byeW: number | null = null; for (let w = 1; w <= mx; w++) { if (!weeksSet.has(w)) { byeW = w; break } }
        if (byeW) {
          const next = t.games.filter((g: any) => g.w > byeW!).sort((a: any, b: any) => a.w - b.w)[0]
          const nextIn = next && this.getRes(t.abbr, next.w)
          if (!nextIn) bye = { w: byeW, opp: 'BYE', oppFull: 'Bye week', ha: '' }
        }
      }
      return { t, wins, losses, ties, pend, bye, W, L, Ti, played, pct }
    })
    list.sort((x, y) => {
      if (groupBy === 'conf' || groupBy === 'div') { if (x.t.conf !== y.t.conf) return x.t.conf < y.t.conf ? -1 : 1 }
      if (groupBy === 'div') { if (x.t.div !== y.t.div) return x.t.div < y.t.div ? -1 : 1 }
      if (rankBy === 'wins') { if (y.W !== x.W) return y.W - x.W }
      if (y.pct !== x.pct) return y.pct - x.pct
      if (y.W !== x.W) return y.W - x.W
      if (x.L !== y.L) return x.L - y.L
      return x.t.abbr < y.t.abbr ? -1 : 1
    })

    let maxAbove = 1, maxBelow = 1
    for (const e of list) { const a = e.pend.length + e.W + e.Ti + (e.bye ? 1 : 0), b = e.L; if (a > maxAbove) maxAbove = a; if (b > maxBelow) maxBelow = b }

    // Prefer the live measurement when it is available — state.ch can still be the default.
    const liveH = this.chartRef.current ? Math.round(this.chartRef.current.clientHeight - 20) : 0
    const chartH = (liveH > 40 ? liveH : (S.ch || 600)), chartW = S.cw || 1200
    const labelH = 44
    const usableH = Math.max(160, chartH - labelH - 8)
    // Split usable height proportionally to the tallest stack on each side. Ceiling mode
    // inserts one empty row above the played tower, so budget that extra row or the top clips.
    const gapRows = pendCeiling ? 1 : 0
    const aboveRows = maxAbove + gapRows
    let aboveFrac = aboveRows / (aboveRows + maxBelow); aboveFrac = Math.max(0.45, Math.min(0.85, aboveFrac))
    const abovePx = Math.round(usableH * aboveFrac), belowPx = usableH - abovePx
    // Each cell eats 1px margin + ~2px zone padding — subtract so the full stack fits.
    const capA = (abovePx - 3) / aboveRows - 1
    const capB = (belowPx - 3) / maxBelow - 1
    let cellH = Math.min(capA, capB); cellH = Math.max(8, Math.min(26, cellH))
    // Hard guard: never let the three stacked zones exceed the column height.
    const totalRows = aboveRows + maxBelow
    const fitH = (chartH - labelH - 8 - 6) / Math.max(1, totalRows) - 1
    if (fitH >= 8 && cellH > fitH) cellH = fitH
    // cellH is clamped at 26px; on a tall chart the proportional zones exceed what the rows
    // need. Shrink each zone to its rows; the column pins to the bottom so the baseline holds.
    const abovePxFit = Math.min(abovePx, Math.round(aboveRows * (cellH + 1) + 3))
    const belowPxFit = Math.min(belowPx, Math.round(maxBelow * (cellH + 1) + 3))
    const colW = Math.max(24, Math.min(56, (chartW - 6 * 32) / 32))
    const rowH = Math.max(28, Math.min(40, (chartH - 4) / 32))
    const grouped = (groupBy === 'conf' || groupBy === 'div')
    const groupKey = (t: any) => groupBy === 'div' ? (t.conf + t.div) : t.conf
    const cellW = 27, labelW = grouped ? 98 : 78

    const fsFor = (h: number) => Math.max(6.5, Math.min(11, h * 0.46))
    const mkCell = (t: any, prim: string, txt: string, g: any, type: string): Dict => {
      const r = this.getRes(t.abbr, g.w); const arrow = g.ha === 'A' ? '@' : ''
      const cur = type === 'bye' ? 'default' : 'pointer'
      let l1: string, l2: string
      if (type === 'pend') { l1 = g.opp; l2 = String(g.w) }
      else if (type === 'win') { l1 = g.opp; l2 = showScore && r ? (r.us + '-' + r.them) : 'W' }
      else if (type === 'loss') { l1 = g.opp; l2 = showScore && r ? (r.us + '-' + r.them) : 'L' }
      else if (type === 'bye') { l1 = 'BYE'; l2 = String(g.w) }
      else { l1 = g.opp; l2 = '' }
      let atMark = (type === 'bye') ? '' : arrow
      let bg: string, color: string, border: string
      if (type === 'bye') { bg = '#F0F1F3'; color = '#9BA0A9'; border = '1px dashed #D0D3D8' }
      else if (colorMode === 'opponent') {
        const oppPrim = (T[g.opp] && T[g.opp].primary) || '#8A8F98'
        if (type === 'pend') { bg = '#ffffff'; color = oppPrim; border = '1px solid ' + this.mix(oppPrim, '#ffffff', 0.55) }
        else if (type === 'tie') { bg = this.mix(oppPrim, '#ffffff', 0.18); border = '1px solid rgba(0,0,0,.1)'; color = this.contrast(bg) }
        else if (type === 'loss' && lossReverse) { bg = '#ffffff'; color = oppPrim; border = '1.5px solid #E5484D' }
        else { bg = oppPrim; border = '1px solid rgba(0,0,0,.14)'; color = this.contrast(oppPrim) }
      } else {
        if (type === 'pend') { bg = '#EDEFF2'; color = '#9BA0A9'; border = '1px solid #E4E7EB' }
        else if (type === 'win') { bg = prim; color = txt; border = '1px solid rgba(0,0,0,.06)' }
        else if (type === 'loss') { bg = '#FBEAE9'; color = '#C23A2E'; border = '1px solid #F3D3CF' }
        else { bg = '#F2E4BC'; color = '#7C6320'; border = '1px solid #E7D39A' }
      }
      let style: string
      if (orient === 'v') {
        let h = cellH; if (type === 'tie' && tieHalf) h = Math.max(9, cellH * 0.55)
        let fs = fsFor(h); if (type === 'tie') fs = Math.min(13, h * 0.82); if (h < 15.5 && type !== 'tie' && type !== 'bye') { l1 = ''; atMark = '' }
        style = `width:100%;height:${h}px;min-height:${h}px;margin-bottom:1px;border-radius:3px;background:${bg};color:${color};border:${border};display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;cursor:${cur};font-size:${fs}px;line-height:1;`
      } else {
        const w = cellW, h = rowH - 8; let fs = fsFor(h); if (type === 'tie') fs = Math.min(13, h * 0.82); if (h < 15.5 && type !== 'tie' && type !== 'bye') { l1 = ''; atMark = '' }
        style = `width:${w}px;min-width:${w}px;height:${h}px;margin-right:1px;border-radius:3px;background:${bg};color:${color};border:${border};display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;cursor:${cur};font-size:${fs}px;line-height:1;`
      }
      let sA = l2, sMid = '', sB = '', sAStyle = 'opacity:.82;', sBStyle = ''
      if ((type === 'win' || type === 'loss') && r && showScore) {
        sA = String(r.us); sB = String(r.them); sMid = '–'
        const usWin = r.us > r.them
        sAStyle = usWin ? 'font-weight:800;' : ''
        sBStyle = usWin ? '' : 'font-weight:800;'
      }
      const resTxt = r ? (' · ' + r.res + ' ' + r.us + '-' + r.them) : ' · to play'
      const title = type === 'bye' ? `Week ${g.w} · Bye week` : `Wk ${g.w} · ${g.ha === 'A' ? '@ ' : 'vs '}${g.oppFull}${resTxt}${g.net ? (' · ' + g.net) : ''}`
      return { key: t.abbr + '-' + g.w, l1, l2, atMark, sA, sMid, sB, sAStyle, sBStyle, style, title, onClick: type === 'bye' ? (() => {}) : (() => this.openPop(t.abbr, g.w)) }
    }

    const teamsSorted = list.map((e, i) => {
      const t = e.t, prim = t.primary, txt = this.contrast(prim)
      const isGroupStart = grouped && i > 0 && groupKey(list[i - 1].t) !== groupKey(t)
      const tag = groupBy === 'div' ? (t.conf + ' ' + t.div) : t.conf
      const rankText = grouped ? tag : String(i + 1)
      let z1: Dict[], z2: Dict[]
      if (orient === 'v') {
        const pendItems = e.pend.map((g: any) => ({ g, ty: 'pend' })); if (e.bye) pendItems.push({ g: e.bye, ty: 'bye' })
        const pendC = pendItems.sort((a: any, b: any) => b.g.w - a.g.w).map((x: any) => mkCell(t, prim, txt, x.g, x.ty))
        // Ceiling mode: upcoming block hangs top-aligned; auto margin leaves ≥1 empty line.
        if (pendCeiling && pendC.length) {
          const last = pendC[pendC.length - 1]; last.style = last.style.replace('margin-bottom:1px;', 'margin-bottom:auto;')
        }
        const tieC = [...e.ties].sort((a, b) => b.w - a.w).map(g => mkCell(t, prim, txt, g, 'tie'))
        const winC = [...e.wins].sort((a, b) => b.w - a.w).map(g => mkCell(t, prim, txt, g, 'win'))
        z1 = [...pendC, ...tieC, ...winC]
        z2 = [...e.losses].sort((a, b) => a.w - b.w).map(g => mkCell(t, prim, txt, g, 'loss'))
      } else {
        z1 = [...e.losses].sort((a, b) => a.w - b.w).map(g => mkCell(t, prim, txt, g, 'loss'))
        const winC = [...e.wins].sort((a, b) => a.w - b.w).map(g => mkCell(t, prim, txt, g, 'win'))
        const tieC = [...e.ties].sort((a, b) => a.w - b.w).map(g => mkCell(t, prim, txt, g, 'tie'))
        const pendItemsH = e.pend.map((g: any) => ({ g, ty: 'pend' })); if (e.bye) pendItemsH.push({ g: e.bye, ty: 'bye' })
        const pendC = pendItemsH.sort((a: any, b: any) => a.g.w - b.g.w).map((x: any) => mkCell(t, prim, txt, x.g, x.ty))
        if (pendCeiling && pendC.length) {
          const first = pendC[0]; first.style = 'margin-left:auto;' + first.style
        }
        z2 = [...winC, ...tieC, ...pendC]
      }
      const recordStr = e.Ti ? `${e.W}-${e.L}-${e.Ti}` : `${e.W}-${e.L}`
      let colStyle: string, z1Style: string, z2Style: string, divStyle: string, labelStyle: string, rankStyle: string, abbrStyle: string, recStyle: string
      if (orient === 'v') {
        colStyle = `flex:0 0 ${colW}px;height:100%;display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;${isGroupStart ? 'margin-left:16px;' : ''}`
        z1Style = `order:0;flex:0 0 ${abovePxFit}px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;padding-bottom:2px;`
        labelStyle = `order:1;flex:0 0 ${labelH}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:#fff;border:1px solid #E4E7EB;border-top:3px solid ${prim};border-bottom:3px solid ${prim};border-radius:4px;box-shadow:0 1px 2px rgba(20,22,28,.05);cursor:pointer;`
        divStyle = `order:2;height:0;`
        z2Style = `order:3;flex:0 0 ${belowPxFit}px;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden;padding-top:2px;`
        rankStyle = grouped ? `font-size:8.5px;font-weight:400;letter-spacing:.3px;color:${prim};` : 'font-size:9px;color:#B0B4BC;font-weight:700;'
        abbrStyle = `font-size:${colW < 32 ? 10 : 12}px;font-weight:900;color:#1b1e24;letter-spacing:.3px;`
        recStyle = 'font-size:9px;color:#727781;font-weight:600;font-variant-numeric:tabular-nums;'
      } else {
        colStyle = `flex:0 0 ${rowH}px;width:100%;display:flex;flex-direction:row;align-items:center;${isGroupStart ? 'margin-top:12px;' : ''}`
        z1Style = 'order:0;flex:0 1 auto;max-width:42%;display:flex;flex-direction:row;justify-content:flex-end;align-items:center;overflow-x:auto;overflow-y:hidden;'
        labelStyle = `order:1;flex:0 0 ${labelW}px;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;background:#fff;border:1px solid #E4E7EB;border-left:4px solid ${prim};border-right:4px solid ${prim};border-radius:4px;margin:0 4px;cursor:pointer;`
        divStyle = 'display:none;'
        z2Style = 'order:2;flex:1 1 auto;display:flex;flex-direction:row;justify-content:flex-start;align-items:center;overflow-x:auto;overflow-y:hidden;'
        rankStyle = grouped ? `font-size:9px;font-weight:400;letter-spacing:.3px;color:${prim};text-align:right;flex:0 0 auto;` : 'font-size:10px;color:#B0B4BC;font-weight:700;width:16px;text-align:right;flex:0 0 auto;'
        abbrStyle = 'font-size:12px;font-weight:900;color:#1b1e24;width:30px;flex:0 0 auto;'
        recStyle = 'font-size:10px;color:#727781;font-weight:600;font-variant-numeric:tabular-nums;flex:0 0 auto;'
      }
      return { abbr: t.abbr, rank: rankText, recordStr, onLabel: () => this.openTeam(t.abbr), colStyle, z1, z2, z1Style, z2Style, divStyle, labelStyle, rankStyle, abbrStyle, recStyle }
    })

    const decided = list.reduce((a, e) => a + e.played, 0) / 2
    const playedStr = `${decided} / 272 games`
    const leader = list[0]

    // detail modal
    const STAT_DEFS: [string, string][] = [['First downs', 'first_downs'], ['Total yards', 'total_yards'], ['Passing yards', 'passing_yards'], ['Rushing yards', 'rushing_yards'], ['Yards / play', 'yards_per_play'], ['3rd down', 'third_down_eff'], ['4th down', 'fourth_down_eff'], ['Red zone', 'red_zone_made_att'], ['Sacks (yds)', 'sacks_yards_lost'], ['Penalties', 'penalties'], ['Turnovers', 'turnovers'], ['Time of poss.', 'time_of_possession']]
    const pop = S.pop; let popU = '', popTH = '', popTeam = '', popOpp = ''
    let popWeek = '', popHa = '', popResBadge = '', popResStyle = '', popMetaShow = false
    let popTeamColor = '#8A8F98', popOppColor = '#8A8F98', popTeamTxt = '#fff', popOppTxt = '#fff'
    let popHasDetail = false; const popQ: Dict[] = []; let popRowT: Dict[] = []; let popRowO: Dict[] = []; let popStats: Dict[] = []; let popLineShow = false
    let popTeamName = '', popOppName = '', popScoreA = '—', popScoreB = '—', popUW = '', popTW = '', popTeamDim = '', popOppDim = '', popAccentStyle = ''; let popChips: Dict[] = []
    if (pop) {
      const r = this.getRes(pop.abbr, pop.w)
      popU = r ? (r.hasU === false ? '' : String(r.us)) : ''
      popTH = r ? (r.hasT === false ? '' : String(r.them)) : ''
      popTeam = pop.abbr; popOpp = pop.opp
      popWeek = `Week ${pop.w}`
      popHa = pop.ha === 'A' ? `at ${pop.oppFull || pop.opp}` : `vs ${pop.oppFull || pop.opp}`
      const tp = (T[pop.abbr] && T[pop.abbr].primary) || '#8A8F98'
      const op = (T[pop.opp] && T[pop.opp].primary) || '#8A8F98'
      popTeamColor = tp; popOppColor = op; popTeamTxt = this.contrast(tp); popOppTxt = this.contrast(op)
      popTeamName = (T[pop.abbr] && T[pop.abbr].name) || pop.abbr; popOppName = pop.oppFull || pop.opp
      popAccentStyle = `height:5px;background:linear-gradient(90deg,${tp} 0%,${tp} 46%,${op} 54%,${op} 100%);`
      if (r) {
        popScoreA = String(r.us); popScoreB = String(r.them)
        if (r.res === 'W') { popOppDim = 'opacity:.4;'; popTW = 'color:#C7CBD1;' }
        else if (r.res === 'L') { popTeamDim = 'opacity:.4;'; popUW = 'color:#C7CBD1;' }
        const lbl = r.res === 'W' ? 'WIN' : r.res === 'L' ? 'LOSS' : 'TIE'
        const c = r.res === 'W' ? ['#E7F4EC', '#1F8A4C', '#CDE9D6'] : r.res === 'L' ? ['#FBEAE9', '#C23A2E', '#F3D3CF'] : ['#F2E4BC', '#7C6320', '#E7D39A']
        popResBadge = lbl; popResStyle = `background:${c[0]};color:${c[1]};`
      } else { popResBadge = 'TO PLAY'; popResStyle = 'background:#EDEFF2;color:#727781;' }
      const det = (seasonYr === '2025' ? (S.DET25 || {}) : seasonYr === '2024' ? (S.DET24 || {}) : {})[pop.abbr + ':' + pop.w]
      const metaBits: string[] = []
      if (det) { const d = this.fmtEt(det.et); if (d) metaBits.push(d); if (det.venue) metaBits.push(det.venue); if (det.net) metaBits.push(det.net) }
      else { const d = this.fmtEt(pop.et); if (d) metaBits.push(d); if (pop.net) metaBits.push(pop.net) }
      popMetaShow = metaBits.length > 0; popChips = metaBits.map(v => ({ v }))
      if (det && det.lt && r) {
        popHasDetail = true; popLineShow = true
        const qn = Math.max(det.lt.length, det.lo.length)
        for (let i = 0; i < qn; i++) popQ.push({ label: i < 4 ? ('Q' + (i + 1)) : 'OT' })
        popQ.push({ label: 'F' })
        popRowT = det.lt.map((v: any) => ({ v: String(v), style: 'flex:1;text-align:center;font-variant-numeric:tabular-nums;color:#3a3f47;' }))
        popRowT.push({ v: String(r.us), style: 'flex:1;text-align:center;font-variant-numeric:tabular-nums;font-weight:900;color:#15181d;' })
        popRowO = det.lo.map((v: any) => ({ v: String(v), style: 'flex:1;text-align:center;font-variant-numeric:tabular-nums;color:#3a3f47;' }))
        popRowO.push({ v: String(r.them), style: 'flex:1;text-align:center;font-variant-numeric:tabular-nums;font-weight:900;color:#15181d;' })
        popStats = STAT_DEFS.filter(([, k]) => det.ts[k] != null || det.os[k] != null).map(([label, key]) => {
          const av = det.ts[key] ?? '—', bv = det.os[key] ?? '—'
          const an = this.statNum(det.ts[key]), bn = this.statNum(det.os[key])
          let aFrac = 50, aLead = false, bLead = false
          if (an != null && bn != null) { const tot = an + bn; if (tot > 0) aFrac = Math.round(an / tot * 100); aLead = an > bn; bLead = bn > an }
          aFrac = Math.max(6, Math.min(94, aFrac))
          const aStyle = `font-size:13px;font-variant-numeric:tabular-nums;font-weight:${aLead ? 800 : 600};color:${aLead ? '#15181d' : '#A2A7B0'};flex:0 0 58px;`
          const bStyle = `font-size:13px;font-variant-numeric:tabular-nums;font-weight:${bLead ? 800 : 600};color:${bLead ? '#15181d' : '#A2A7B0'};flex:0 0 58px;text-align:right;`
          const aBarStyle = `width:${aFrac}%;background:${aLead ? tp : this.mix(tp, '#ffffff', .4)};border-radius:4px;transition:width .3s ease;`
          const bBarStyle = `flex:1;background:${bLead ? op : this.mix(op, '#ffffff', .4)};border-radius:4px;`
          return { label, a: av, b: bv, aStyle, bStyle, aBarStyle, bBarStyle }
        })
      }
    }

    return {
      ...base, loading: false, orient, teamsSorted,
      popWeek, popHa, popResBadge, popResStyle, popMetaShow,
      popTeamColor, popOppColor, popTeamTxt, popOppTxt,
      popTeamName, popOppName, popScoreA, popScoreB, popUW, popTW, popTeamDim, popOppDim, popAccentStyle, popChips,
      popHasDetail, popQ, popRowT, popRowO, popStats, popLineShow, canEdit,
      showBaseline: false,
      baselineStyle: `position:absolute;left:16px;right:16px;top:${6 + abovePxFit}px;height:0;border-top:2px dashed #C4C8CE;z-index:1;pointer-events:none;`,
      baselineLabelStyle: `position:absolute;right:18px;top:${6 + abovePxFit - 16}px;font-size:9.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#B0B4BC;z-index:1;pointer-events:none;`,
      colsWrapStyle: orient === 'v' ? 'display:flex;flex-direction:row;gap:2px;align-items:stretch;height:100%;min-width:100%;' : 'display:flex;flex-direction:column;gap:2px;',
      playedStr, leaderAbbr: leader.t.abbr, leaderRec: (leader.Ti ? `${leader.W}-${leader.L}-${leader.Ti}` : `${leader.W}-${leader.L}`),
      pop, popU, popTH, popTeam, popOpp,
      popSetUs: (e: any) => this.applyField('us', e.target.value), popSetTh: (e: any) => this.applyField('them', e.target.value),
      popW: () => this.quick('W'), popL: () => this.quick('L'), popT: () => this.quick('T'), popClear: () => this.clearGame(), popClose: () => this.closePop(),
      tm: this.buildTeamModal(), tmClose: () => this.closeTeam(),
      tmRoster: () => this.setState({ teamTab: 'roster' }), tmSched: () => this.setState({ teamTab: 'schedule' }), tmInfo: () => this.setState({ teamTab: 'info' }),
      rQuery: this.state.rQuery, rSetQuery: (e: any) => this.setState({ rQuery: e.target.value }),
    }
  }

  render() {
    const v = this.renderVals()
    const mStop = (e: React.MouseEvent) => e.stopPropagation()
    const stepBtn = (disabled: boolean): React.CSSProperties => ({ width: '20px', height: '26px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#22262d', fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.28 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit' })
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F6F4' }}>

        {/* ---------- header ---------- */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '15px 18px 9px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '21px', fontWeight: 900, letterSpacing: '-.3px', color: '#15181d' }}>
              <span>NFL</span>
              <button onClick={v.onToggleSeason} style={css(v.seasonBtnStyle)}><span>{v.seasonYr}</span><span style={css(v.seasonArrowStyle)}>▾</span></button>
              <span style={{ color: '#B0B4BC' }}>·</span>
              <span>Season Tower</span>
              {v.seasonOpen && (
                <>
                  <div onClick={v.onToggleSeason} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 7px)', left: '46px', zIndex: 80, minWidth: '148px', background: '#fff', border: '1px solid #E4E7EB', borderRadius: '12px', boxShadow: '0 14px 36px rgba(20,22,28,.17)', padding: '5px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9298a1', padding: '5px 10px 7px' }}>Season</div>
                    {v.seasonList.map((s: any) => (
                      <button key={s.y} onClick={s.onClick} style={css(s.style)}><span>{s.label}</span><span style={{ color: '#0080C6', fontWeight: 900, fontSize: '13px' }}>{s.tick}</span></button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#727781', marginTop: '3px', maxWidth: '640px' }}>{v.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '5px 11px 5px 9px', border: '1px solid #D7DAE0', borderRadius: '8px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button onClick={v.onStepBack} disabled={v.stepBackDisabled} title="Previous week (←)" aria-label="Previous week" style={stepBtn(v.stepBackDisabled)}>‹</button>
                <button onClick={v.onPlay} title="Play / pause" aria-label="Play / pause" style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid #15181d', background: '#15181d', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{v.playLabel}</button>
                <button onClick={v.onStepFwd} disabled={v.stepFwdDisabled} title="Next week (→)" aria-label="Next week" style={stepBtn(v.stepFwdDisabled)}>›</button>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#22262d', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', minWidth: '78px' }}>{v.weekLabel}</span>
              <input type="range" min={0} max={v.sliderMax} step={1} value={v.throughWeek} onChange={v.onSlide} style={{ width: '150px', accentColor: '#15181d', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#9298a1' }}>Group</span>
              <div style={{ display: 'flex', border: '1px solid #D7DAE0', borderRadius: '8px', overflow: 'hidden' }}>
                <button onClick={v.grpLeague} style={css(v.segLeagueStyle)}>League</button>
                <button onClick={v.grpConf} style={css(v.segConfStyle)}>Conference</button>
                <button onClick={v.grpDiv} style={css(v.segDivStyle)}>Division</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#9298a1' }}>Rank</span>
              <div style={{ display: 'flex', border: '1px solid #D7DAE0', borderRadius: '8px', overflow: 'hidden' }}>
                <button onClick={v.rankPct} style={css(v.segPctStyle)}>Win %</button>
                <button onClick={v.rankWins} style={css(v.segWinsStyle)}>Wins</button>
              </div>
            </div>
            <button onClick={v.onReset} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #D7DAE0', background: '#fff', color: '#727781', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Reset</button>
          </div>
        </div>

        {/* ---------- legend ---------- */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '0 18px 10px', fontSize: '11px', color: '#727781', flexWrap: 'wrap' }}>
          {v.resultMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '13px', height: '13px', borderRadius: '3px', background: 'linear-gradient(135deg,#0080C6,#4F2683)' }} />Win — team color</span>}
          {v.resultMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '13px', height: '13px', borderRadius: '3px', background: '#FBEAE9', border: '1px solid #F3D3CF' }} />Loss (below line)</span>}
          {v.oppMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '13px', height: '13px', borderRadius: '3px', background: 'linear-gradient(135deg,#97233F,#0080C6,#203731)' }} />Each box — opponent’s color</span>}
          {v.oppMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>Above the line = win · below = loss · faded = still to play</span>}
          {v.resultMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '13px', height: '13px', borderRadius: '3px', background: '#F2E4BC', border: '1px solid #E7D39A' }} />Tie</span>}
          {v.resultMode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '13px', height: '13px', borderRadius: '3px', background: '#EDEFF2', border: '1px solid #E4E7EB' }} />To play</span>}
          <span style={{ marginLeft: '2px', color: '#9298a1' }}>Press ▶ or drag the week slider to watch the season unfold · click any cell to enter a score.</span>
          <span style={{ marginLeft: 'auto', color: '#22262d', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v.playedStr} · Leader: {v.leaderAbbr} {v.leaderRec}</span>
        </div>

        {v.loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9298a1', fontSize: '14px' }}>{v.loadingText}</div>}

        {/* ---------- chart ---------- */}
        <div ref={this.chartRef} style={{ position: 'relative', flex: '1 1 0', minHeight: 0, overflow: 'auto', padding: '6px 16px 14px' }}>
          {v.showBaseline && <div style={css(v.baselineStyle)} />}
          {v.showBaseline && <div style={css(v.baselineLabelStyle)}>baseline · 0</div>}

          <div style={css(v.colsWrapStyle)}>
            {v.teamsSorted.map((t: any) => (
              <div key={t.abbr} data-team={t.abbr} style={css(t.colStyle)}>
                <div style={css(t.z1Style)}>
                  {t.z1.map((c: any) => <Cell key={c.key} c={c} />)}
                </div>
                <div style={css(t.labelStyle)} onClick={t.onLabel}>
                  <span style={css(t.rankStyle)}>{t.rank}</span>
                  <span style={css(t.abbrStyle)}>{t.abbr}</span>
                  <span style={css(t.recStyle)}>{t.recordStr}</span>
                </div>
                <div style={css(t.divStyle)} />
                <div style={css(t.z2Style)}>
                  {t.z2.map((c: any) => <Cell key={c.key} c={c} />)}
                </div>
              </div>
            ))}
          </div>

          {/* ---------- game detail modal ---------- */}
          {v.pop && (
            <div onClick={v.popClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,21,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
              <div onClick={mStop} style={{ position: 'relative', width: 'min(500px,95vw)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: '20px', boxShadow: '0 30px 80px rgba(14,16,21,.42)' }}>
                <div style={css(v.popAccentStyle)} />
                <span onClick={v.popClose} style={{ position: 'absolute', top: '15px', right: '16px', cursor: 'pointer', color: '#B0B4BC', fontSize: '19px', lineHeight: 1, zIndex: 3, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#F3F4F6' }}>×</span>

                <div style={{ padding: '24px 26px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.4px', padding: '5px 14px', borderRadius: '20px', ...css(v.popResStyle) }}>{v.popResBadge}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', textAlign: 'center', ...css(v.popTeamDim) }}>
                      <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: v.popTeamColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: v.popTeamTxt, fontSize: '11px', fontWeight: 900, letterSpacing: '.3px' }}>{v.popTeam}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#727781', lineHeight: 1.25, maxWidth: '110px' }}>{v.popTeamName}</span>
                    </div>
                    <span style={{ fontSize: '46px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: '#15181d', ...css(v.popUW) }}>{v.popScoreA}</span>
                    <span style={{ fontSize: '20px', fontWeight: 400, color: '#D0D3D8' }}>–</span>
                    <span style={{ fontSize: '46px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: '#15181d', ...css(v.popTW) }}>{v.popScoreB}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', textAlign: 'center', ...css(v.popOppDim) }}>
                      <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: v.popOppColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: v.popOppTxt, fontSize: '11px', fontWeight: 900, letterSpacing: '.3px' }}>{v.popOpp}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#727781', lineHeight: 1.25, maxWidth: '110px' }}>{v.popOppName}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', fontWeight: 700, color: '#15181d' }}>{v.popWeek} <span style={{ color: '#9298a1', fontWeight: 500 }}>{v.popHa}</span></div>
                  {v.popMetaShow && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '11px' }}>
                      {v.popChips.map((c: any, i: number) => <span key={i} style={{ fontSize: '10.5px', fontWeight: 600, color: '#5c616b', background: '#F3F4F6', padding: '5px 11px', borderRadius: '7px' }}>{c.v}</span>)}
                    </div>
                  )}
                </div>

                {v.popLineShow && (
                  <div style={{ padding: '4px 26px 8px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.9px', color: '#B0B4BC', marginBottom: '8px' }}>SCORING BY QUARTER</div>
                    <div style={{ border: '1px solid #EDEFF2', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', background: '#FAFAF9', padding: '7px 13px' }}>
                        <span style={{ flex: '0 0 48px' }} />
                        {v.popQ.map((q: any, i: number) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: 800, color: '#9298a1', letterSpacing: '.4px' }}>{q.label}</span>)}
                      </div>
                      <div style={{ display: 'flex', padding: '8px 13px', alignItems: 'center' }}>
                        <span style={{ flex: '0 0 48px', fontSize: '11px', fontWeight: 900, color: v.popTeamColor }}>{v.popTeam}</span>
                        {v.popRowT.map((c: any, i: number) => <span key={i} style={css(c.style)}>{c.v}</span>)}
                      </div>
                      <div style={{ display: 'flex', padding: '8px 13px', alignItems: 'center', borderTop: '1px solid #EDEFF2' }}>
                        <span style={{ flex: '0 0 48px', fontSize: '11px', fontWeight: 900, color: v.popOppColor }}>{v.popOpp}</span>
                        {v.popRowO.map((c: any, i: number) => <span key={i} style={css(c.style)}>{c.v}</span>)}
                      </div>
                    </div>
                  </div>
                )}

                {v.popHasDetail && (
                  <div style={{ padding: '10px 26px 6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: v.popTeamColor }}>{v.popTeam}</span>
                      <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.9px', color: '#B0B4BC' }}>TEAM STATS</span>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: v.popOppColor }}>{v.popOpp}</span>
                    </div>
                    {v.popStats.map((s: any, i: number) => (
                      <div key={i} style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={css(s.aStyle)}>{s.a}</span>
                          <span style={{ flex: 1, textAlign: 'center', fontSize: '9.5px', fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: '#9298a1' }}>{s.label}</span>
                          <span style={css(s.bStyle)}>{s.b}</span>
                        </div>
                        <div style={{ display: 'flex', height: '5px', gap: '2px' }}>
                          <div style={css(s.aBarStyle)} />
                          <div style={css(s.bBarStyle)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {v.canEdit && (
                  <div style={{ padding: '16px 26px 22px', borderTop: '1px solid #EDEFF2', marginTop: '10px', background: '#FAFAF9', borderRadius: '0 0 20px 20px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.9px', color: '#9298a1', marginBottom: '12px' }}>EDIT · WHAT-IF</div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center', marginBottom: '13px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '9px', color: '#9298a1', fontWeight: 700 }}>{v.popTeam}</span><input type="number" value={v.popU} onChange={v.popSetUs} style={{ width: '60px', padding: '8px', border: '1px solid #E2E4E8', borderRadius: '9px', fontSize: '16px', fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', color: '#15181d', background: '#fff' }} /></div>
                      <span style={{ color: '#C4C8CE', fontWeight: 700, marginTop: '15px' }}>–</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '9px', color: '#9298a1', fontWeight: 700 }}>{v.popOpp}</span><input type="number" value={v.popTH} onChange={v.popSetTh} style={{ width: '60px', padding: '8px', border: '1px solid #E2E4E8', borderRadius: '9px', fontSize: '16px', fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', color: '#15181d', background: '#fff' }} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '7px' }}>
                      <button onClick={v.popW} style={{ flex: 1, padding: '8px 0', borderRadius: '9px', border: '1px solid #CDE9D6', background: '#E7F4EC', color: '#1F8A4C', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Win</button>
                      <button onClick={v.popL} style={{ flex: 1, padding: '8px 0', borderRadius: '9px', border: '1px solid #F3D3CF', background: '#FBEAE9', color: '#C23A2E', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Loss</button>
                      <button onClick={v.popT} style={{ flex: 1, padding: '8px 0', borderRadius: '9px', border: '1px solid #E7D39A', background: '#F2E4BC', color: '#7C6320', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Tie</button>
                      <button onClick={v.popClear} style={{ flex: '0 0 auto', padding: '8px 11px', borderRadius: '9px', border: '1px solid #E2E4E8', background: '#fff', color: '#9298a1', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Clear</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- team modal ---------- */}
          {v.tm && (
            <div onClick={v.tmClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,16,21,.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
              <div onClick={mStop} style={{ position: 'relative', width: 'min(560px,96vw)', height: 'min(760px,90vh)', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(14,16,21,.42)' }}>

                <div style={{ ...css(v.tm.headStyle), padding: '22px 24px 20px', flex: '0 0 auto', position: 'relative' }}>
                  <span onClick={v.tmClose} style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', fontSize: '18px', lineHeight: 1, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', ...css(v.tm.badgeStyle) }}>×</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ width: '52px', height: '52px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, letterSpacing: '.3px', ...css(v.tm.badgeStyle) }}>{v.tm.abbr}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '.2px', lineHeight: 1.15 }}>{v.tm.name}</div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11.5px', fontWeight: 600, opacity: .9 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.tm.rec}</span>
                        <span style={{ opacity: .5 }}>·</span>
                        <span>{v.tm.div}</span>
                        <span style={{ opacity: .5 }}>·</span>
                        <span>{v.tm.coach}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flex: '0 0 auto', background: '#fff', borderBottom: '1px solid #EDEFF2', padding: '0 12px' }}>
                  <button onClick={v.tmRoster} style={css(v.tm.tRoster)}>Roster</button>
                  <button onClick={v.tmSched} style={css(v.tm.tSched)}>Schedule</button>
                  <button onClick={v.tmInfo} style={css(v.tm.tInfo)}>Info</button>
                </div>

                <div style={{ flex: '1 1 auto', overflowY: 'auto', background: '#FBFBFC' }}>

                  {v.tm.tabRoster && (
                    <>
                      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#FBFBFC', padding: '14px 22px 10px', borderBottom: '1px solid #F1F2F4' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#9298a1' }}>{v.tm.count} players</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#9298a1', fontVariantNumeric: 'tabular-nums' }}>{v.tm.played} reg. season games played</span>
                        </div>
                        <input value={v.rQuery} onChange={v.rSetQuery} placeholder="Search players, college…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', border: '1px solid #E2E4E8', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit', color: '#15181d', background: '#fff', marginBottom: '10px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', flex: 1 }}>
                            {v.tm.unitChips.map((c: any) => <button key={c.k} onClick={c.onClick} style={css(c.style)}>{c.l}</button>)}
                          </div>
                          <div style={{ position: 'relative', flex: '0 0 auto' }}>
                            <button onClick={v.tm.onTogglePosDd} style={css(v.tm.posDdBtnStyle)}><span>{v.tm.posDdLabel}</span><span style={css(v.tm.posDdArrow)}>▾</span></button>
                            {v.tm.posDdOpen && (
                              <>
                                <div onClick={v.tm.onTogglePosDd} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, minWidth: '172px', maxHeight: '280px', overflowY: 'auto', background: '#fff', border: '1px solid #E4E7EB', borderRadius: '11px', boxShadow: '0 14px 36px rgba(20,22,28,.17)', padding: '5px' }}>
                                  {v.tm.posOptions.map((o: any) => <button key={o.k} onClick={o.onClick} style={css(o.style)}><span>{o.l}</span><span style={{ color: '#0080C6', fontWeight: 900, fontSize: '12px' }}>{o.tick}</span></button>)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {v.tm.hasRost && (
                        <div style={{ padding: '6px 22px 22px' }}>
                          {v.tm.groups.map((g: any) => (
                            <React.Fragment key={g.pos}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 4px' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '.7px', color: '#9298a1' }}>{g.pos}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#C0C4CB' }}>{g.count}</span>
                                <span style={{ flex: 1, height: '1px', background: '#EDEFF2' }} />
                              </div>
                              {g.players.map((p: any) => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '9px 0', borderTop: '1px solid #F3F4F6' }}>
                                  <div style={css(p.avatarStyle)} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#15181d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#B0B4BC', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>{p.jersey}</span>
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: '#9298a1', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.meta}</div>
                                  </div>
                                  <span style={{ flex: '0 0 auto', fontSize: '10px', fontWeight: 800, letterSpacing: '.3px', color: '#5c616b', background: '#F1F2F4', padding: '4px 9px', borderRadius: '7px' }}>{p.pos}</span>
                                </div>
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {v.tm.tabSched && (
                    <div style={{ padding: '14px 22px 22px' }}>
                      {v.tm.sched.map((g: any, i: number) => (
                        <div key={i} onClick={g.onClick} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderTop: '1px solid #F3F4F6', cursor: 'pointer' }}>
                          <span style={{ flex: '0 0 42px', fontSize: '11px', fontWeight: 700, color: '#9298a1', fontVariantNumeric: 'tabular-nums' }}>{g.w}</span>
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: '#15181d' }}><span style={{ color: '#B0B4BC', fontWeight: 600 }}>{g.ha}</span> {g.opp}</span>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#5c616b', fontVariantNumeric: 'tabular-nums' }}>{g.score}</span>
                          <span style={css(g.badgeStyle)}>{g.badge}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {v.tm.tabInfo && (
                    <div style={{ padding: '14px 22px 22px' }}>
                      {v.tm.infoRows.map((r: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid #F3F4F6' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#9298a1' }}>{r.k}</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#15181d' }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}

// A single game cell — opponent headline + score/week line, with the away `@` marker as a
// smaller glyph and the winning score number emphasized.
function Cell({ c }: { c: any }) {
  return (
    <div style={css(c.style)} onClick={c.onClick} title={c.title}>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ fontSize: '.72em', fontWeight: 700, opacity: .72, letterSpacing: '-.02em' }}>{c.atMark}</span>{c.l1}
      </span>
      <span style={{ fontSize: '.78em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <span style={css(c.sAStyle)}>{c.sA}</span>{c.sMid}<span style={css(c.sBStyle)}>{c.sB}</span>
      </span>
    </div>
  )
}
