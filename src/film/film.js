import { TEAMS } from '../data/schedule-2026.js'
import { RESULTS2026 as RESULTS } from '../data/results-2026.js'
import { ROSTERS2026 as ROSTERS } from '../data/rosters-2026.js'
import { PLAYERS2026 as PLAYERS } from '../data/players-2026.js'
import { KEYPLAYERS2026 as KEYS } from '../data/keyplayers-2026.js'
import { TITLES } from '../data/titles.js'
import { CAREERS2026 as CAREERS } from '../data/careers-2026.js'

/* Two films share this script: players.html (the leaders, by position group) and
   clubs.html (a card per club). The page says which one it is. */
const MODE=document.body.dataset.film==='clubs'?'clubs':'players'

const TEAL='#13b3a6', RED='#ef4b52', AMBER='#d9a13a'

/* ---- colour helpers ---- */
const hx=h=>{h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
const to=([r,g,b])=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')
const mix=(a,b,t)=>{const A=hx(a),B=hx(b);return to([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t])}
const lum=h=>{const[r,g,b]=hx(h);return(r*299+g*587+b*114)/1000}
const ink=h=>lum(h)>150?'#12151a':'#ffffff'
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
// encodeURIComponent leaves single quotes intact, which would break the single-quoted
// onerror JS string — replace them so the data URI is safe to inline.
const SIL="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='42' height='42'><rect width='42' height='42' rx='21' fill='#2a2d34'/><circle cx='21' cy='16' r='7' fill='#565c66'/><path d='M7 40c1.5-9 26.5-9 28 0z' fill='#565c66'/></svg>").replace(/'/g,"%27")

const DIVNAME={N:'North',S:'South',E:'East',W:'West'}
const POS_ORDER=['QB','RB','FB','WR','TE','T','OT','LT','RT','G','OG','LG','RG','C','OL','LS','DE','DT','NT','DL','EDGE','OLB','ILB','MLB','LB','CB','S','FS','SS','DB','K','P']
const posRank=p=>{const i=POS_ORDER.indexOf(p);return i<0?99:i}
const UNITS=[['offense','Offense'],['defense','Defense'],['specialTeam','Special Teams'],['injuredReserveOrOut','Reserve / Out']]

const MAXW=18
// The season is live: the latest week with a final score is "now", and the film
// opens there. Everything after it is still to play.
const LASTW=Math.max(1,...Object.keys(RESULTS).map(k=>+k.split(':')[1]))
let curWeek=LASTW
// "Through week X" model, exactly like the Season Tower: weeks after X are still to play
// (rendered as upcoming tower cells) and do not count toward standings. No simulation.
const resOf=(abbr,w)=> (w<=curWeek ? (RESULTS[abbr+':'+w]||null) : null)

/* ---- per-team stats through the selected week (values only) ---- */
let stat={}, ranked=[], seed={}
function computeStats(week){
  curWeek=week; stat={}
  for(const abbr in TEAMS){
    const t=TEAMS[abbr]
    const st={W:0,L:0,T:0,PF:0,PA:0,played:0,home:{W:0,L:0,T:0},away:{W:0,L:0,T:0},div:{W:0,L:0,T:0}}
    const games=[]
    for(const g of t.games){ const r=resOf(abbr,g.w); if(!r) continue
      st.played++; st.PF+=r.us; st.PA+=r.them
      const kk=r.res==='W'?'W':r.res==='L'?'L':'T'; st[kk]++
      st[g.ha==='H'?'home':'away'][kk]++
      const o=TEAMS[g.opp]; if(o&&o.conf===t.conf&&o.div===t.div) st.div[kk]++
      games.push({w:g.w,res:r.res})
    }
    games.sort((a,b)=>a.w-b.w)
    let cur=0,mx=0; for(const p of games){ if(p.res==='W'){cur++;mx=Math.max(mx,cur)} else cur=0 }
    st.streak=mx; st.pct=st.played?(st.W+0.5*st.T)/st.played:0; st.diff=st.PF-st.PA
    stat[abbr]=st
  }
}
// Deck order + playoff seeds are FROZEN at the latest played week — changing the week only updates
// each card's values in place, so the cards never reshuffle.
function freezeRanking(){
  // Deck order = the towers' League · Wins order (same comparator as rankCmp there), so a
  // team sits at the same number on both pages.
  ranked=Object.keys(TEAMS).sort((a,b)=>{
    const A=stat[a],B=stat[b]
    if(B.W!==A.W) return B.W-A.W
    if(B.pct!==A.pct) return B.pct-A.pct
    if(A.L!==B.L) return A.L-B.L
    return a<b?-1:1
  })
  // Seeds follow the NFL's own rule, win percentage -- not the deck's wins order, which
  // would favour a team that has simply played more games (byes fall unevenly).
  const byPct=Object.keys(TEAMS).sort((a,b)=>{
    const A=stat[a],B=stat[b]
    if(B.pct!==A.pct) return B.pct-A.pct
    if(B.W!==A.W) return B.W-A.W
    if(A.L!==B.L) return A.L-B.L
    return a<b?-1:1
  })
  seed={}
  for(const conf of ['AFC','NFC']){
    const confTeams=byPct.filter(a=>TEAMS[a].conf===conf)
    const seen={}, winners=[]
    for(const a of confTeams){ const d=TEAMS[a].div; if(!seen[d]){ seen[d]=1; winners.push(a) } }
    winners.forEach((a,i)=>seed[a]={n:i+1,kind:'div'})
    confTeams.filter(a=>!winners.includes(a)).slice(0,3).forEach((a,i)=>seed[a]={n:i+5,kind:'wc'})
  }
}
const rec=s=>`${s.W}-${s.L}${s.T?'-'+s.T:''}`

/* ---- card pieces ---- */
function twScore(r){ const w=r.us>r.them
  return `<b style="${w?'':'opacity:.6;font-weight:700'}">${r.us}</b><i>–</i><b style="${w?'opacity:.6;font-weight:700':''}">${r.them}</b>` }
function towerCell(abbr,ty,g,I,soft,maxDiff){
  if(ty==='bye') return `<div class="tw-row"><div class="tw-c bye" style="color:${I}" title="Week ${g.w} · Bye"><span class="tw-wk">${g.w}</span><span class="tw-o">BYE</span></div></div>`
  if(ty==='up'){ // still-to-play game — tower "upcoming" style: white cell, opponent-colour text
    const o2=TEAMS[g.opp], op2=(o2&&o2.primary)||'#8A8F98', at2=g.ha==='A'?'<span class="at">@</span>':''
    return `<div class="tw-row"><div class="tw-c up" style="background:#ffffff;color:${op2};border:1px solid ${mix(op2,'#ffffff',.55)}" title="Wk ${g.w} · ${g.ha==='A'?'@ ':'vs '}${g.oppFull} · to play"><span class="tw-wk">${g.w}</span><span class="tw-o">${at2}${g.opp}</span><span class="tw-s" style="opacity:.4">–</span></div></div>`
  }
  const r=resOf(abbr,g.w), o=TEAMS[g.opp], op=(o&&o.primary)||'#8A8F98', diff=r.us-r.them
  let bg,color,bd
  if(ty==='win'){ bg=op; color=ink(op); bd='1px solid rgba(0,0,0,.18)' }
  else if(ty==='loss'){ bg='#ffffff'; color=op; bd='1.6px solid '+RED }
  else { bg=mix(op,'#ffffff',.18); color=ink(bg); bd='1px solid rgba(0,0,0,.12)' }
  const at=g.ha==='A'?'<span class="at">@</span>':''
  const barW=Math.max(3,Math.round(Math.abs(diff)/maxDiff*90))
  const sign=diff>0?'+':diff<0?'−':'±'
  const title=`Wk ${g.w} · ${g.ha==='A'?'@ ':'vs '}${g.oppFull} · ${ty==='tie'?'Tied '+r.us+'-'+r.them:r.res+' '+r.us+'-'+r.them+' ('+sign+Math.abs(diff)+')'}`
  const barI=`<i style="width:${barW}px;background:${op};box-shadow:0 0 0 1px rgba(${soft},.16)"></i>`
  const barB=`<b style="color:${I}">${sign}${Math.abs(diff)}</b>`
  const bar = ty==='tie'
    ? `<span class="tw-bar right" title="Tied"><b style="color:${I};opacity:.66;letter-spacing:.4px">TIED</b></span>`
    : ty==='loss'
      ? `<span class="tw-bar left" title="${sign}${Math.abs(diff)} pts">${barB}${barI}</span>`
      : `<span class="tw-bar right" title="${sign}${Math.abs(diff)} pts">${barI}${barB}</span>`
  return `<div class="tw-row"><div class="tw-c" style="background:${bg};color:${color};border:${bd};box-shadow:0 0 0 1px rgba(${soft},.12)" title="${title}"><span class="tw-wk">${g.w}</span><span class="tw-o">${at}${g.opp}</span><span class="tw-s">${twScore(r)}</span></div>${bar}</div>`
}
// One team's tower: wins+ties above the baseline (calendar order, latest on top),
// losses below (earliest nearest the baseline), bye at the ceiling. Any week>18 game
// (postseason) buckets naturally into wins/losses, so the slot is future-proof.
function towerCol(abbr,I,soft){
  const t=TEAMS[abbr]
  const wins=[],losses=[],ties=[],upc=[]; const wk=new Set(); let maxDiff=1
  for(const g of t.games){ if(g.w<=18) wk.add(g.w); const r=resOf(abbr,g.w)
    if(!r){ upc.push(g); continue }                      // week > selected -> to play
    maxDiff=Math.max(maxDiff,Math.abs(r.us-r.them))
    if(r.res==='W')wins.push(g); else if(r.res==='L')losses.push(g); else ties.push(g) }
  let bye=null; for(let w=1;w<=18;w++){ if(!wk.has(w)){ bye=w; break } }
  // wins on top (week desc), then ties sitting right on the line between wins and losses
  const above=[...[...wins].sort((a,b)=>b.w-a.w).map(g=>['win',g]), ...[...ties].sort((a,b)=>b.w-a.w).map(g=>['tie',g])]
  const below=[...losses].sort((a,b)=>a.w-b.w)
  // ceiling: to-play games + the bye, latest week on top (tower "upcoming" block)
  const ceil=[...upc.map(g=>['up',g]), ...(bye?[['bye',{w:bye}]]:[])].sort((a,b)=>b[1].w-a[1].w)
  let top=''; ceil.forEach(([ty,g])=>top+=towerCell(abbr,ty,g,I,soft,maxDiff))
  let play=''; above.forEach(([ty,g])=>play+=towerCell(abbr,ty,g,I,soft,maxDiff))
  const gap=(upc.length&&play)?'<div class="tw-gap"></div>':''   // separate upcoming from the played tower
  let dn=''; below.forEach(g=>dn+=towerCell(abbr,'loss',g,I,soft,maxDiff))
  return `<div class="tower"><div class="tw-z">${top}${gap}${play}</div><div class="tw-base"><span class="tw-lbl lost">Lost</span><span class="tw-rule"></span><span class="tw-lbl won">Won</span></div><div class="tw-z">${dn}</div></div>`
}
const CATS=[['offense','Offense'],['defense','Defense'],['specialTeam','Special teams'],['injuredReserveOrOut','Reserve / out']]
/* Key players: no stat ranks a whole football roster, so every club gets the same twelve
   slots, each filled by its leader on what that position is judged on (fetch_keyplayers.py).
   A tile opens the player's own card when he is one of the film's leaders. */
const KROWS=[['Offense',['qb','rb','rec','k']],['Defense',['pr','tk','db']]]
function keyTile(k,abbr,I,soft){
  const jersey=((ROSTERS[abbr]||{players:[]}).players.find(p=>p.id===k.id)||{}).j
  const inDeck=!!PLAYERS.players[k.id]
  const tag=inDeck?'a':'div'
  return `<${tag} class="kp" ${inDeck?`href="./players.html#${k.id}"`:''} style="background:rgba(${soft},.08);color:${I}"
      title="${k.n} · ${k.pos} · ${k.v} ${k.u} · ${k.sub} · ${k.gp} games${inDeck?' — open his card':''}">
    <span class="kp-shot"><img loading="lazy" src="https://a.espncdn.com/i/headshots/nfl/players/full/${k.id}.png" alt="" onerror="this.onerror=null;this.src='${SIL}'"></span>
    <span class="kp-pos">${k.pos}${jersey?' · #'+jersey:''}</span>
    <span class="kp-n">${k.n}</span>
    <span class="kp-v"><b>${k.v}</b>${k.u}</span>
    <span class="kp-sub">${k.sub}</span>
  </${tag}>`
}
function rosterCol(abbr,I,soft){
  const R=ROSTERS[abbr], K=KEYS[abbr]||[]
  const head=`<div class="rhead"><span>Players</span><span>${R?R.count+' on the roster':''}</span></div>`
  let key=''
  KROWS.forEach(([label,slots])=>{
    const ts=K.filter(k=>slots.includes(k.slot)).sort((a,b)=>slots.indexOf(a.slot)-slots.indexOf(b.slot))
    if(ts.length) key+=`<div class="rsec">${label}</div><div class="kgrid">${ts.map(k=>keyTile(k,abbr,I,soft)).join('')}</div>`
  })
  let full=''
  if(R) CATS.forEach(([u,label])=>{
    const ps=R.players.filter(p=>p.u===u).sort((a,b)=>posRank(a.pos)-posRank(b.pos)||(+(a.j||999))-(+(b.j||999)))
    if(!ps.length) return
    let grid=''
    ps.forEach(p=>{ grid+=`<div class="pl" style="background:rgba(${soft},.07);color:${I}"><span class="num">${p.j||''}</span><img class="pic" loading="lazy" src="https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png" onerror="this.onerror=null;this.src='${SIL}'"><span class="pn">${p.n}</span><span class="pos" style="background:rgba(${soft},.14)">${p.pos}</span></div>` })
    full+=`<div class="rsec">${label} · ${ps.length}</div><div class="rgrid">${grid}</div>`
  })
  const tabs=`<button class="rtab key" data-tab="key">Key players<b>${K.length}</b></button>`
    +(R?`<button class="rtab full" data-tab="full">Full roster<b>${R.count}</b></button>`:'')
  const cats=`<div class="rcat key">${key||'<div class="rna">No season stats yet.</div>'}</div>`
    +(R?`<div class="rcat full">${full}</div>`:'')
  return `<div class="roster">${head}<div class="rtabs">${tabs}</div><div class="rcats">${cats}</div></div>`
}
function panel(abbr,I,soft){
  const s=stat[abbr]
  const bar=(lbl,d)=>{ const tot=(d.W+d.L+d.T)||1
    return `<div class="splrow"><span class="sl">${lbl}</span><div class="spl-track">`+
      `<i style="width:${d.W/tot*100}%;background:${TEAL}"></i><i style="width:${d.T/tot*100}%;background:${AMBER}"></i><i style="width:${d.L/tot*100}%;background:${RED}"></i></div>`+
      `<span class="sv">${rec(d)}</span></div>` }
  const tile=(k,v)=>`<div class="stile" style="background:rgba(${soft},.13)"><span class="k">${k}</span><span class="v">${v}</span></div>`
  return `<div class="rpanel"><div class="ph">Season splits</div>
    <div class="splbars">${bar('Home',s.home)}${bar('Away',s.away)}${bar('Division',s.div)}</div>
    <div class="stiles">${tile('PF',s.PF)}${tile('PA',s.PA)}${tile('Diff',(s.diff>=0?'+':'')+s.diff)}${tile('Streak',s.streak)}</div>
  </div>`
}

/* ---- build the deck ---- */
const track=document.getElementById('track')
/* The deck: every leader first, grouped by position, then the 32 club cards.
   DECK is the single source of truth for order, so navigation, the jump menu, the
   section tabs and the hash all read from the same list and cannot disagree. */
let DECK=[]
function buildDeck(){
 track.innerHTML=''
 DECK=[]
 if(MODE==='players') PLAYERS.groups.forEach(g=>{
  g.ids.forEach((pid,i)=>{
   const pl=PLAYERS.players[pid]; if(!pl) return
   const slide=el('div','slide'); slide.appendChild(playerCard(pl,g.label,i+1))
   track.appendChild(slide)
   DECK.push({kind:'player',id:pid,group:g.key,label:g.label,name:pl.n,
              team:pl.team,rank:i+1})
  })
 })
 if(MODE==='clubs') ranked.forEach((abbr,idx)=>{
  const t=TEAMS[abbr], prim=t.primary, I=ink(prim), soft=(I==='#ffffff'?'255,255,255':'0,0,0'), s=stat[abbr]
  const sd=seed[abbr]
  const divTxt=`${t.conf} ${DIVNAME[t.div]||t.div}`
  const zone = sd
    ? `<span class="tb-zone" style="background:${sd.kind==='div'?TEAL:'rgba('+soft+',.14)'};color:${sd.kind==='div'?'#06211d':I};box-shadow:${sd.kind==='wc'?'inset 0 0 0 1.4px '+TEAL:'none'}">${sd.kind==='div'?'★ '+divTxt+' · #'+sd.n:'Wild Card · #'+sd.n}</span>`
    : `<span class="tb-zone" style="background:rgba(${soft},.12);color:${I};opacity:.85">${divTxt}</span>`

  const card=el('div','card')
  card.style.background=`linear-gradient(150deg, ${mix(prim,'#ffffff',0.20)} 0%, ${prim} 47%, ${mix(prim,'#000000',0.20)} 100%)`
  card.style.color=I
  card.innerHTML=`<div class="glow"></div>
    <div class="logo-bg" style="--tone:${I==='#ffffff'?'255,255,255':'18,20,26'}"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png" alt="" onerror="this.closest('.logo-bg').remove()"></div>
    <div class="topbar">
      <div class="tb-tile" style="background:rgba(255,255,255,.94);color:${prim}"><img class="tb-logo" src="https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png" alt="${abbr}" onerror="this.onerror=null;this.parentNode.textContent='${abbr}'"></div>
      <div class="tb-id"><div class="tb-name">${t.name} ${zone}</div>
        <div class="tb-sub">NFL · 2026 · ${curWeek>=MAXW?'Season Film':'Through Wk '+curWeek} · ${(ROSTERS[abbr]&&ROSTERS[abbr].coach)||'—'}</div></div>
      <div class="tb-spacer"></div>
      <div class="tb-right">
        <span class="tb-rankbig"><small>#</small><b>${idx+1}</b></span>
        <div class="tb-rec"><b>${rec(s)}</b><br><span class="pf">${s.PF} PF · ${s.PA} PA · ${(s.diff>=0?'+':'')}${s.diff}</span></div>
      </div>
    </div>
    <div class="grid">
      <div class="leftcol"><div class="lbl">Season tower · wins ↑ · losses ↓ · opponent colour</div>${towerCol(abbr,I,soft)}</div>
      <div class="rightcol">${rosterCol(abbr,I,soft)}${panel(abbr,I,soft)}</div>
    </div>`
  const slide=el('div','slide'); slide.appendChild(card); track.appendChild(slide)
  DECK.push({kind:'team',abbr,name:t.name,rank:idx+1})
 })
}

/* ---- player cards -------------------------------------------------------------
   Each group shows the numbers its position is actually judged on: a corner's card
   has no rushing yards on it, a punter's has no touchdowns. [label, category, stat,
   decimals] -- a null stat means "derive it", handled in statVal below. */
const STATSET={
  qb:[['Yards','passing','passingYards',0],['TD','passing','passingTouchdowns',0],
      ['INT','passing','interceptions',0],['Comp %','passing','completionPct',1],
      ['Yds/att','passing','yardsPerPassAttempt',1],['Rating','passing','QBRating',1]],
  rb:[['Rush yds','rushing','rushingYards',0],['TD','rushing','rushingTouchdowns',0],
      ['Yds/carry','rushing','yardsPerRushAttempt',1],['Carries','rushing','rushingAttempts',0],
      ['Longest','rushing','longRushing',0],['Rec yds','receiving','receivingYards',0]],
  wr:[['Rec yds','receiving','receivingYards',0],['Catches','receiving','receptions',0],
      ['TD','receiving','receivingTouchdowns',0],['Yds/catch','receiving','yardsPerReception',1],
      ['After catch','receiving','receivingYardsAfterCatch',0],['Longest','receiving','longReception',0]],
  dl:[['Sacks','defensive','sacks',1],['Tackles for loss','defensive','tacklesForLoss',0],
      ['Tackles','defensive','totalTackles',0],['Solo','defensive','soloTackles',0],
      ['Passes def','defensive','passesDefended',0],['Forced fum','general','fumblesForced',0]],
  lb:[['Tackles','defensive','totalTackles',0],['Solo','defensive','soloTackles',0],
      ['Sacks','defensive','sacks',1],['Tackles for loss','defensive','tacklesForLoss',0],
      ['Passes def','defensive','passesDefended',0],['Int','defensiveinterceptions','interceptions',0]],
  db:[['Passes def','defensive','passesDefended',0],['Int','defensiveinterceptions','interceptions',0],
      ['Tackles','defensive','totalTackles',0],['Solo','defensive','soloTackles',0],
      ['Int yards','defensiveinterceptions','interceptionYards',0],
      ['Forced fum','general','fumblesForced',0]],
  pk:[['FG made','kicking','fieldGoalsMade',0],['Attempts','kicking','fieldGoalAttempts',0],
      ['FG %','kicking','fieldGoalPct',1],['Longest','kicking','longFieldGoalMade',0],
      ['From 50+','kicking','fieldGoalsMade50',0],['Extra pts','kicking','extraPointsMade',0]],
  p:[['Gross avg','punting','grossAvgPuntYards',1],['Net avg','punting','netAvgPuntYards',1],
     ['Punts','punting','punts',0],['Inside 20','punting','puntsInside20',0],
     ['Longest','punting','longPunt',0],['Touchbacks','punting','touchbacks',0]],
}
const gkeyOf=p=> p.pos==='P' ? 'p' : (p.pos==='PK'||p.pos==='K') ? 'pk'
  : (PLAYERS.groups.find(g=>g.ids.includes(p.id))||{}).key || 'qb'
const setFor=p=> STATSET[gkeyOf(p)] || STATSET.qb
/* The other side of each player's game: a short second row of numbers the six boxes leave
   out -- a quarterback's legs, a running back's hands, a receiver's workload. */
const MORESET={
  qb:['On the run',[['Rush yds','rushing','rushingYards',0],['Rush TD','rushing','rushingTouchdowns',0],
      ['Yds/carry','rushing','yardsPerRushAttempt',1],['Sacked','passing','sacks',0],['Longest pass','passing','longPassing',0]]],
  rb:['As a receiver',[['Catches','receiving','receptions',0],['Targets','receiving','receivingTargets',0],
      ['Rec TD','receiving','receivingTouchdowns',0],['Rush 1st downs','rushing','rushingFirstDowns',0],['Fumbles lost','rushing','rushingFumblesLost',0]]],
  wr:['Workload',[['Targets','receiving','receivingTargets',0],['1st downs','receiving','receivingFirstDowns',0],
      ['Yds/game','receiving','receivingYardsPerGame',1],['Big plays','receiving','receivingBigPlays',0],['Fumbles lost','receiving','receivingFumblesLost',0]]],
  dl:['Also',[['Assisted','defensive','assistTackles',0],['Sack yds','defensive','sackYards',0],
      ['Fum recovered','general','fumblesRecovered',0],['Int','defensiveinterceptions','interceptions',0]]],
  lb:['Also',[['Assisted','defensive','assistTackles',0],['Forced fum','general','fumblesForced',0],
      ['Fum recovered','general','fumblesRecovered',0],['Int yards','defensiveinterceptions','interceptionYards',0]]],
  db:['Also',[['Assisted','defensive','assistTackles',0],['Tackles for loss','defensive','tacklesForLoss',0],
      ['Sacks','defensive','sacks',1],['Fum recovered','general','fumblesRecovered',0],['Pick-sixes','defensiveinterceptions','interceptionTouchdowns',0]]],
  pk:['Scoring',[['Points','scoring','totalPoints',0],['Pts/game','scoring','totalPointsPerGame',1],
      ['From 40-49','kicking','fieldGoalsMade40_49',0],['XP %','kicking','extraPointPct',1]]],
  p:['Also',[['Punt yds','punting','puntYards',0],['Fair catches','punting','fairCatches',0],
      ['Returned','punting','puntReturns',0],['Blocked','punting','puntsBlocked',0]]],
}
/* Where a number sits among the player's own group: 3rd of 24 quarterbacks. Lower is
   better only for the mistakes. */
const LOWER=new Set(['passing.interceptions','passing.sacks','rushing.rushingFumblesLost','receiving.receivingFumblesLost'])
const GROUPNOUN={qb:'QBs',rb:'RBs',wr:'receivers',dl:'pass rushers',lb:'linebackers',db:'DBs',pk:'kickers',p:'punters'}
const ordinal=n=>n+(['th','st','nd','rd'][((n%100)-20)%10]||['th','st','nd','rd'][n%100]||'th')
function rankIn(p,cat,key){
  const g=gkeyOf(p), v=statVal(p,cat,key); if(v==null) return null
  const pool=Object.values(PLAYERS.players).filter(q=>gkeyOf(q)===g&&statVal(q,cat,key)!=null)
  const low=LOWER.has(cat+'.'+key)
  const r=1+pool.filter(q=>low?statVal(q,cat,key)<v:statVal(q,cat,key)>v).length
  return `${ordinal(r)}${low?' fewest':''} of ${pool.length}`
}
/* Bio from the club roster: number, age, size, college, years in the league. */
const BIO={}
for(const ab in ROSTERS) for(const r of ROSTERS[ab].players) BIO[r.id]=r
function bioOf(p){
  const b=BIO[p.id]; if(!b) return ''
  const exp=b.exp===0?'Rookie':b.exp?`${b.exp} yrs`:null
  const rows=[b.age?['Age',b.age]:null, b.ht?['Height',b.ht.replace("' ",'′').replace('"','″')]:null,
    b.wt?['Weight',b.wt.replace(' lbs','')+' lb']:null, exp?['In the NFL',exp]:null,
    b.col?['College',b.col]:null].filter(Boolean)
  return `<div class="pbio">${rows.map(([k,v])=>
    `<div class="pbio-c${k==='College'?' wide':''}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`
}
/* Super Bowl champions get the gold: a ring for every Super Bowl he played in and won
   (tools/fetch_titles.py reads the winner's game roster), and his Super Bowl MVPs. */
const GOLD='#E9C46A'
const LOMBARDI=`<svg class="lomb" viewBox="0 0 24 44" aria-hidden="true"><g fill="#E9C46A"><ellipse cx="12" cy="8" rx="5.2" ry="8" transform="rotate(-28 12 8)"/>
  <path d="M10.6 15.5h2.8l1.3 16.5H9.3z"/><rect x="6.5" y="32" width="11" height="2.6" rx="1"/>
  <path d="M5.5 35.4h13l1.6 7.6H3.9z"/></g></svg>`
const ringsOf=p=>(TITLES.rings[p.id]||[]).slice().sort()
const sbMvpOf=p=>(TITLES.mvp[p.id]||[]).slice().sort()
const MEDAL=`<svg class="lomb" viewBox="0 0 24 44" aria-hidden="true"><g fill="currentColor">
  <path d="M7 2h10l-2.5 13h-5z" opacity=".55"/><circle cx="12" cy="26" r="10"/></g>
  <path d="M12 19.5l2 4.2 4.6.6-3.4 3.2.9 4.5-4.1-2.3-4.1 2.3.9-4.5-3.4-3.2 4.6-.6z" fill="rgba(0,0,0,.35)"/></svg>`
const AWNAME={'NFL MVP':'NFL MVP','NFL Offensive Player of the Year':'Offensive Player of the Year',
  'NFL Defensive Player of the Year':'Defensive Player of the Year','NFL Offensive Rookie of the Year':'Offensive Rookie of the Year',
  'NFL Defensive Rookie of the Year':'Defensive Rookie of the Year','NFL Comeback Player of the Year':'Comeback Player of the Year',
  'Walter Payton NFL Man of the Year':'Man of the Year'}
// "NFL MVP 2018 · 2022", one entry per award, in the order they were first won
function awardsOf(c){
  const by={}; (c&&c.aw||[]).forEach(([n,y])=>{ const k=AWNAME[n]||n; (by[k]=by[k]||[]).push(y) })
  return Object.entries(by).map(([k,ys])=>`${k} ${ys.join(' · ')}`)
}
/* One box for every player, the plinth his portrait stands on. Gold for a Super Bowl
   champion, silver for a major award, plain otherwise -- and always the career so far,
   the best season and how he came into the league. */
function careerBox(p,extra){
  const c=CAREERS[p.id], r=ringsOf(p), m=sbMvpOf(p), aw=awardsOf(c), sb=y=>TITLES.sb[y]||{}
  const tier=r.length?'gold':aw.length?'silver':'plain'
  let head
  if(tier==='gold') head=`${LOMBARDI}<div class="pc-hd"><b>${r.length>1?r.length+'× ':''}Super Bowl champion</b>
      <div class="prings-c">${r.map(y=>`<span class="ring" title="Super Bowl ${sb(y).sb} · ${y} season · ${sb(y).win} ${sb(y).score} ${sb(y).lose}">${sb(y).sb}</span>`).join('')}</div></div>`
  else if(tier==='silver') head=`${MEDAL}<div class="pc-hd"><b>${aw[0]}</b>${aw.length>1?`<div class="pc-aw">${aw.slice(1).join(' &middot; ')}</div>`:''}</div>`
  else head=''
  // the career told in order: how he arrived, what he has done, his best year, honours
  const rows=[]
  if(c) rows.push(['Drafted', c.d ? `<b>${c.d.y}</b> · round ${c.d.r}, pick ${c.d.p}${c.d.t?' · '+c.d.t:''}`
                                  : `<b>Undrafted</b>${c.debut?' · in the NFL since '+c.debut:''}`])
  if(c&&c.c.length) rows.push(['Career',c.c.map(([v,l])=>`<b>${v}</b> ${l}`).join(' · ')+(c.gp?` · <b>${c.gp}</b> games`:'')])
  if(c&&c.best) rows.push(['Best season',`<b>${c.best[1]}</b> ${c.best[2]} · ${c.best[0]}`])
  if(tier==='gold'&&m.length) rows.push(['SB MVP',`<span class="gold">★ ${m.map(y=>sb(y).sb).join(' · ')}</span>`])
  if(tier==='gold'&&aw.length) rows.push(['Awards',aw.join(' · ')])
  return `<div class="pcareer ${tier}${extra?' '+extra:''}">${head?`<div class="pc-top">${head}</div>`:''}
    ${bioOf(p)}
    <div class="pc-rows">${rows.map(([k,v])=>`<div class="pc-row"><span>${k}</span><em>${v}</em></div>`).join('')}</div></div>`
}
// The shirt number, as big as the card allows, behind the portrait -- outlined, so it
// reads as the jersey without fighting the face in front of it.
const jerseyOf=p=>(BIO[p.id]||{}).j||''
const statVal=(p,cat,key)=>{ const v=(p.st[cat]||{})[key]; return (v==null)?null:v }
const fmtStat=(v,dp)=> v==null ? '—'
  : (dp?Number(v).toFixed(dp):Math.round(v).toLocaleString('en-US'))

/* The one number each group's season is told through, game by game.
   Cornerbacks are ranked on passes defended but charted on tackles: a chart of
   0s and 1s says nothing, and tackles is the stat a corner posts every week. */
const CHARTSTAT={ qb:['passingYards','Passing yards'], rb:['rushingYards','Rushing yards'],
  wr:['receivingYards','Receiving yards'], dl:['sacks','Sacks'], lb:['totalTackles','Tackles'],
  db:['totalTackles','Tackles'], pk:['totalKickingPoints','Kicking points'],
  p:['puntsInside20','Punts inside the 20'] }
const PORND={1:'WC',2:'DIV',3:'CC',5:'SB'}
const gameVal=(p,g,key)=>{ const names=PLAYERS.sigs[p.s]||[]; const i=names.indexOf(key)
  return i<0 ? null : g.v[i] }

/* A player's season in the tower idiom: one bar per game, its LENGTH the stat and its
   SIDE the result -- wins above the line, losses below, in the opponent's colour. So a
   career game in a defeat hangs, and a quiet win sits small on top. Weeks he did not
   play stay as empty slots, because an absence is part of the season too. */
function playerChart(p,I,soft){
  const [key,label]=CHARTSTAT[gkeyOf(p)]||CHARTSTAT.qb
  const log=p.g||[]; if(!log.length) return ''
  const byWk={}; log.forEach(g=>{ if(!g.p) byWk[g.w]=g })
  const post=log.filter(g=>g.p)
  const sched=(TEAMS[p.team]||{}).games||[]
  const weeks=new Set(sched.map(g=>g.w).filter(w=>w<=18))
  const slots=[]
  for(let w=1;w<=18;w++){
    if(byWk[w]) slots.push(['g',byWk[w],w])
    else slots.push([!weeks.has(w)?'bye':w>LASTW?'next':'out',null,w])
  }
  if(post.length){ slots.push(['div',null,null]); post.forEach(g=>slots.push(['g',g,g.w])) }
  let max=1; log.forEach(g=>{ const v=gameVal(p,g,key)||0; if(v>max) max=v })
  // y axis: three or four round values; bars scale to the top one so they read against it
  const raw=max/4, mag=10**Math.floor(Math.log10(raw)), m=raw/mag
  const step=(m<=1?1:m<=2?2:m<=5?5:10)*mag, top=Math.ceil(max/step-1e-9)*step
  const dp=step<1?1:0, ticks=[]
  for(let t=step; t<=top+1e-9; t+=step) ticks.push(t)
  const grid=`<div class="pc-grid">${ticks.map(t=>`<i style="bottom:${t/top*100}%"></i>`
    +`<b style="bottom:${t/top*100}%">${fmtStat(t,dp)}</b>`).join('')}<b style="bottom:0">0</b></div>`
  const best=log.reduce((a,g)=>(gameVal(p,g,key)||0)>(gameVal(p,a,key)||0)?g:a,log[0])
  const cols=slots.map(([ty,g,w])=>{
    if(ty==='div') return `<div class="pc-div"><span>Playoffs</span></div>`
    if(!g) return `<div class="pc-col"><div class="pc-h"></div>`
      +`<div class="pc-res none" title="Week ${w} · ${ty==='bye'?'Bye week':ty==='next'?'Still to play':'Did not play'}">${ty==='bye'?'·':ty==='next'?'':'–'}</div>`
      +`<div class="pc-wk out">${w}</div></div>`
    const v=gameVal(p,g,key)||0
    const o=TEAMS[g.o]||{}, op=o.primary||'#8A8F98'
    // every bar rises: the number is the number. The result lives on the axis instead.
    const h=Math.max(v>0?4:0,Math.round(v/top*100))
    const bar=`<i style="height:${h}%;background:${op};`
      +`border:1.4px solid rgba(${soft},.18);box-shadow:0 0 0 1px rgba(${soft},.10)"></i>`
    const res=g.r==='W'?'W':g.r==='L'?'L':'T'   // the chip names the opponent; its colour is the result
    const ttl=`${g.p?(g.t||'Playoffs'):'Week '+w} · ${g.h?'vs ':'@ '}${g.o} · ${g.r} ${g.s} · `
      +`${fmtStat(v,key==='sacks'?1:0)} ${label.toLowerCase()}`
    return `<div class="pc-col" title="${ttl}">`
      +`<div class="pc-h">${bar}</div>`
      +`<div class="pc-res ${res}">${g.o}</div>`
      +`<div class="pc-wk">${g.p?(PORND[w]||'P'):w}</div></div>`
  }).join('')
  return `<div class="pchart">
    <div class="pc-head"><span class="pc-t">${label}, game by game</span>
      <span class="pc-max">Best ${fmtStat(gameVal(p,best,key),key==='sacks'?1:0)} ${best.h?'vs ':'@ '}${best.o}</span></div>
    <div class="pc-plot">${grid}${cols}<div class="pc-rule"></div></div>
    <div class="pc-key"><span class="W">Won</span><span class="L">Lost</span><span class="T">Tied</span>
      <span class="op">Opponent on the axis, bar in their colour</span></div>
  </div>`
}

/* One card per leader, in the team's colours so a player reads as part of his club. */
function playerCard(p, gLabel, rank){
  const t=TEAMS[p.team]||{}, prim=t.primary||'#3a3f47', I=ink(prim)
  const soft=(I==='#ffffff'?'255,255,255':'0,0,0')
  const games=statVal(p,'general','gamesPlayed')
  const card=el('div','card pcard')
  card.style.setProperty('--cardbg',prim)
  card.style.background=`linear-gradient(150deg, ${mix(prim,'#ffffff',0.20)} 0%, ${prim} 47%, ${mix(prim,'#000000',0.20)} 100%)`
  card.style.color=I
  card.innerHTML=`<div class="glow"></div>
    <div class="logo-bg" style="--tone:${I==='#ffffff'?'255,255,255':'18,20,26'}"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/${(p.team||'').toLowerCase()}.png" alt="" onerror="this.closest('.logo-bg').remove()"></div>
    <div class="topbar">
      <div class="tb-tile" style="background:rgba(255,255,255,.94);color:${prim}"><img class="tb-logo" src="https://a.espncdn.com/i/teamlogos/nfl/500/${(p.team||'').toLowerCase()}.png" alt="${p.team}" onerror="this.onerror=null;this.parentNode.textContent='${p.team}'"></div>
      <div class="tb-id"><div class="tb-name">${p.n} <span class="tb-zone" style="background:rgba(${soft},.14);color:${I}">${jerseyOf(p)?'#'+jerseyOf(p)+' · ':''}${p.pos} · ${p.team}</span>${ringsOf(p).length?`<span class="tb-ring" title="Super Bowl champion">${LOMBARDI}${ringsOf(p).length>1?'×'+ringsOf(p).length:''}</span>`:''}</div>
        <div class="tb-sub">NFL · 2026 · ${gLabel} · #${rank} by ${gLabel.toLowerCase()==='specialists'?'their board':'the group stat'}</div></div>
      <div class="tb-spacer"></div>
      <div class="tb-right">
        <span class="tb-rankbig"><small>#</small><b>${rank}</b></span>
        <div class="tb-rec"><b>${games!=null?games:'—'}</b><br><span class="pf">games played</span></div>
      </div>
    </div>
    <div class="pbody">
      <div class="pshot"><div class="pfig">${jerseyOf(p)?`<div class="pjersey" style="${ringsOf(p).length
          ? `color:rgba(233,196,106,.12);-webkit-text-stroke:2.5px ${GOLD}`   // a champion's number is gold
          : `color:rgba(${soft},.09);-webkit-text-stroke:2px rgba(${soft},.42)`}">${jerseyOf(p)}</div>`:''}<img src="https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png" alt="${p.n}" onerror="this.style.display='none'"></div>${careerBox(p)}</div>
      ${careerBox(p,'m')}
      <div class="pright">
        <div class="pstats">${setFor(p).map(([lab,cat,key,dp])=>{ const rk=rankIn(p,cat,key)
          return `
          <div class="pst"><b>${fmtStat(statVal(p,cat,key),dp)}</b><span>${lab}</span>${rk?`<em title="Rank among the ${GROUPNOUN[gkeyOf(p)]||'players'} in this film">${rk} ${GROUPNOUN[gkeyOf(p)]||''}</em>`:''}</div>` }).join('')}</div>
        ${(()=>{ const m=MORESET[gkeyOf(p)]; if(!m) return ''
          return `<div class="pmore"><span class="pmore-t">${m[0]}</span>${m[1].map(([lab,cat,key,dp])=>
            `<span class="pm"><b>${fmtStat(statVal(p,cat,key),dp)}</b>${lab}</span>`).join('')}</div>` })()}
        ${playerChart(p,I,soft)}
      </div>
    </div>`
  return card
}

/* ---- film controls ---- */
const N=()=>DECK.length
const firstOf=kind=>Math.max(0,DECK.findIndex(c=>c.kind===kind))
const firstGroup=key=>Math.max(0,DECK.findIndex(c=>c.group===key))
const $=id=>document.getElementById(id)
let idx=0, playing=false, timer=null
// Deep-link the current card via the URL hash (#DEN or #18) so reload / share reopens it.
function idxFromHash(){
  const raw=decodeURIComponent((location.hash||'').replace(/^#/,'')).trim()
  if(!raw) return 0
  if(/^(teams|clubs)$/i.test(raw)) return Math.max(0,DECK.findIndex(c=>c.kind==='team'))
  if(/^players$/i.test(raw)) return 0
  const t=DECK.findIndex(c=>c.kind==='team'&&c.abbr===raw.toUpperCase()); if(t>=0) return t
  const p=DECK.findIndex(c=>c.id===raw); if(p>=0) return p
  const n=parseInt(raw,10); if(!isNaN(n)&&n>=1&&n<=DECK.length) return n-1
  return 0
}
function render(){
  track.style.transform=`translateX(${-idx*100}%)`
  const c=DECK[idx]; if(!c) return
  const isT=c.kind==='team', t=isT?TEAMS[c.abbr]:TEAMS[c.team]
  $('count').querySelector('.crumb').innerHTML=`<b>${idx+1}</b> / ${DECK.length}`
  $('pname').textContent=c.name
  $('pdot').style.background=(t&&t.primary)||'#888'
  $('b-prev').disabled=idx===0; $('b-next').disabled=idx===DECK.length-1
  ;[...track.children].forEach((n,i)=>n.classList.toggle('live',Math.abs(i-idx)<=1))
  // the section tab for whatever we are looking at
  ;[...document.querySelectorAll('.sectab')].forEach(b=>
    b.classList.toggle('on', b.dataset.kind===c.kind))
  ;[...document.querySelectorAll('.grptab')].forEach(b=>
    b.classList.toggle('on', b.dataset.group===c.group))
  const want='#'+(isT?c.abbr:c.id); if(location.hash!==want) history.replaceState(null,'',want)
}
function go(i){ idx=Math.max(0,Math.min(DECK.length-1,i)); render() }
function setPlay(p){ playing=p
  $('b-play').innerHTML = p
    ? '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z"/></svg>'
  clearInterval(timer)
  if(p) timer=setInterval(()=>{ if(idx>=DECK.length-1){setPlay(false);return} go(idx+1) },3500) }
$('b-prev').onclick=()=>{setPlay(false);go(idx-1)}
$('b-next').onclick=()=>{setPlay(false);go(idx+1)}
$('b-first').onclick=()=>{setPlay(false);go(0)}
$('b-play').onclick=()=>setPlay(!playing)

/* Season / Clubs / Players -- Season is the towers page these films hang off; Clubs and
   Players are the two films, each linking to the other. */
function buildTabs(){
  const bar=$('sectabs'); if(!bar) return
  bar.innerHTML=''
  const home=el('a','sectab link'); home.textContent='Season ↗'
  home.href='./index.html'; home.title='Season Tower — all 32 clubs at once'
  bar.appendChild(home)
  // the two films, each a link to the other; the current one just goes back to its start
  ;[['Clubs','team','./clubs.html'],['Players','player','./players.html']]
    .forEach(([lab,kind,href])=>{
      const b=el('a','sectab'); b.textContent=lab; b.dataset.kind=kind; b.href=href
      if((kind==='player')===(MODE==='players')) b.onclick=e=>{ e.preventDefault(); setPlay(false); go(0) }
      bar.appendChild(b)
    })
  // one chip per position group, so a reader can land straight on the receivers
  if(MODE==='players') PLAYERS.groups.forEach(g=>{
    const b=el('button','grptab'); b.textContent=g.label; b.title=`${g.ids.length} cards`
    b.dataset.group=g.key
    b.onclick=()=>{ setPlay(false); go(firstGroup(g.key)) }
    bar.appendChild(b)
  })
  const cred=el('div','tb-cred')
  cred.innerHTML='Produced with passion by A guy with a scarf (Carlo De Marchis) \u00b7 '
    +'<a href="#" onclick="openCredits();return false">Credits</a>'
  bar.appendChild(cred)
}

/* ---- modals: jump, help, more, credits (the family's chrome) ---- */
function openModal(id){ setPlay(false); $(id).classList.add('on') }
window.closeModal=id=>$(id).classList.remove('on')
function closeMods(){ document.querySelectorAll('.modal.on').forEach(m=>m.classList.remove('on')) }
document.querySelectorAll('.modal').forEach(m=>
  m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('on') }))

/* Every card searchable by name, club, position and section: with 205 cards a list you
   scroll is no use -- the one you want is the one you can type. */
let INDEX=[]
function buildIndex(){
  INDEX=DECK.map((c,i)=>{
    const isT=c.kind==='team', t=isT?TEAMS[c.abbr]:TEAMS[c.team]
    return { n:i+1, name:c.name, colour:(t&&t.primary)||'#888',
      meta:isT ? `${t.conf} ${DIVNAME[t.div]||t.div} · ${rec(stat[c.abbr])}`
               : `${c.label} · #${c.rank} · ${c.team}`,
      hay:(isT ? `${c.name} ${c.abbr} clubs teams ${t.conf} ${DIVNAME[t.div]||''}`
               : `${c.name} ${c.team} ${c.label} ${(PLAYERS.players[c.id]||{}).pos||''}`).toLowerCase() }
  })
}
let jSel=0
function jMatches(){
  const q=$('jq').value.trim().toLowerCase()
  if(!q) return INDEX
  if(/^\d+$/.test(q)) return INDEX.filter(r=>String(r.n).startsWith(q)).slice(0,60)
  return INDEX.filter(r=>r.hay.includes(q)).slice(0,60)
}
function jRender(rows){
  $('jlist').innerHTML = rows.map((r,i)=>
    `<div class="jrow ${i===jSel?'sel':''}" data-n="${r.n}"><span class="jn">${r.n}</span>`
    +`<span class="jd" style="background:${r.colour}"></span>`
    +`<span><b>${r.name}</b></span><span class="jt">${r.meta}</span></div>`).join('')
    || `<div class="jrow"><span class="jn">—</span><span class="jd"></span><span>No card matches that.</span><span></span></div>`
}
function openJump(){
  buildIndex(); jSel=0
  const q=$('jq'); q.value=''; jRender(INDEX)
  openModal('jmodal'); setTimeout(()=>q.focus(),40)
  const cur=$('jlist').children[idx]; if(cur) cur.scrollIntoView({block:'nearest'})
}
$('jq').addEventListener('input',()=>{ jSel=0; jRender(jMatches()) })
$('jq').addEventListener('keydown',e=>{
  const rows=jMatches()
  if(e.key==='ArrowDown'){ e.preventDefault(); jSel=Math.min(rows.length-1,jSel+1); jRender(rows)
    document.querySelector('.jrow.sel')?.scrollIntoView({block:'nearest'}) }
  if(e.key==='ArrowUp'){ e.preventDefault(); jSel=Math.max(0,jSel-1); jRender(rows)
    document.querySelector('.jrow.sel')?.scrollIntoView({block:'nearest'}) }
  if(e.key==='Enter'&&rows[jSel]){ closeModal('jmodal'); go(rows[jSel].n-1) }
})
$('jlist').addEventListener('click',e=>{
  const row=e.target.closest('.jrow[data-n]')
  if(row){ closeModal('jmodal'); go(+row.dataset.n-1) }
})

function openHelp(){
  const nP=Object.keys(PLAYERS.players).length
  $('hbody').innerHTML=`
    <h3>How to watch</h3>
    ${MODE==='players'
      ? `<p>This is a film, not a page. ${nP} cards: the season's leaders in seven position
      groups. There is no NFL top 100 here on purpose &mdash; no single number ranks a left
      tackle against a nickel corner, so each group is ranked on a stat that means something
      for it.</p>`
      : `<p>This is a film, not a page. One card for each of the 32 clubs, in the towers'
      order: most wins first.</p>`}
    <h5>Navigate</h5>
    <ul>
      <li><b>&rarr;</b> or <b>space</b> &mdash; next card &nbsp;&middot;&nbsp; <b>&larr;</b> &mdash; previous</li>
      <li><b>Home</b> / <b>End</b> &mdash; first / last card</li>
      <li><b>g</b> or <b>/</b> &mdash; jump to any card by name or number (or click the counter)</li>
      <li><b>f</b> &mdash; fullscreen &nbsp;&middot;&nbsp; <b>h</b> or <b>?</b> &mdash; this panel &nbsp;&middot;&nbsp; <b>Esc</b> &mdash; close</li>
      <li>On a touchscreen, <b>swipe</b> left and right</li>
      <li><b>Clubs</b> and <b>Players</b> at the top switch between the two films;
        <b>Season &#8599;</b> goes to the Season Tower, where all 32 clubs stand side by side</li>
      <li>Every card has its own address &mdash; copy the address bar to link one</li>
    </ul>
    ${MODE==='players'?`<h5>On a player card</h5>
    <ul>
      <li>The chart is his season: <b>one bar per game</b>, its height the stat, always
        in the <b>opponent's colour</b>. On the axis beneath it the opponent is named,
        and that chip is <b style="color:var(--won)">green</b> when the club won,
        <b style="color:var(--lost)">red</b> when it lost and
        <b style="color:var(--tied)">grey</b> for a tie.</li>
      <li>Weeks he did not play stay as empty slots, because an absence is part of the
        season too. The postseason sits past the divider: <b>WC &middot; DIV &middot; CC &middot; SB</b>.</li>
      <li>Hover any bar for the week, the opponent, the score and the number.</li>
    </ul>`:`<h5>On a club card</h5>
    <ul>
      <li>The tower is that club's season: <b>wins stack up</b> in the opponent's colour,
        <b>losses hang below</b> the line, the bye sits at the ceiling.</li>
      <li><b>Key players</b> are the same twelve slots for every club &mdash; quarterback,
        running back, three receivers and the kicker; two pass rushers, two tacklers and two
        defensive backs &mdash; each filled by the club's leader on that position's stat.
        A tile with a hover outline opens that player's own card. <b>Full roster</b> lists
        everyone.</li>
      <li>The <b>match week</b> selector in the control bar rewinds the season &mdash;
        weeks after it are shown as still to play.</li>
    </ul>`}`
  openModal('hmodal')
}
window.openCredits=function(){
  $('cbody').innerHTML=`
    <h3>Credits</h3>
    <p>Produced with passion by <a href="https://aguywithascarf.substack.com/" target="_blank"
      rel="noopener">A guy with a scarf</a> (Carlo De Marchis).</p>
    <h5>Data</h5>
    <p>Schedules, results, rosters, season leaders and per-game logs from ESPN's public
      endpoints; logos and headshots from ESPN's CDN. Nothing here is affiliated with or
      endorsed by the NFL or its clubs.</p>
    <h5>The rest of the family</h5>
    <p><a href="https://dataviz.aguywithascarf.com/" target="_blank" rel="noopener">dataviz.aguywithascarf.com</a></p>`
  openModal('cmodal')
}
$('count').onclick=openJump
$('b-help').onclick=openHelp
$('b-more').onclick=()=>openModal('mmodal')

/* roster category tabs (global — one delegated handler for all cards) */
document.documentElement.setAttribute('data-rtab','key')
track.addEventListener('click',e=>{ const t=e.target.closest('.rtab'); if(t) document.documentElement.setAttribute('data-rtab', t.dataset.tab) })

/* fullscreen */
function toggleFs(){ const d=document; if(d.fullscreenElement){ d.exitFullscreen&&d.exitFullscreen() } else { d.documentElement.requestFullscreen&&d.documentElement.requestFullscreen() } }
$('b-full').onclick=toggleFs

addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeMods(); return }
  if(document.querySelector('.modal.on')) return      // the jump field owns the keyboard
  if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();setPlay(false);go(idx+1)}
  else if(e.key==='ArrowLeft'){setPlay(false);go(idx-1)}
  else if(e.key==='Home'){setPlay(false);go(0)}
  else if(e.key==='End'){setPlay(false);go(DECK.length-1)}
  else if(e.key==='g'||e.key==='/'){e.preventDefault();openJump()}
  else if(e.key==='h'||e.key==='?'){openHelp()}
  else if(e.key==='f'||e.key==='F'){toggleFs()}
})
let x0=null
addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true})
addEventListener('touchend',e=>{ if(x0==null)return; const dx=e.changedTouches[0].clientX-x0; if(Math.abs(dx)>50){setPlay(false);go(idx+(dx<0?1:-1))} x0=null },{passive:true})

// back/forward or a manually edited hash re-syncs the deck
addEventListener('hashchange',()=>{ const i=idxFromHash(); if(i!==idx){ setPlay(false); idx=i; render() } })

/* ---- match-week selector (later weeks simulated) ---- */
const wk=$('wk')
for(let w=LASTW; w>=1; w--){ const o=document.createElement('option'); o.value=w; o.textContent=w>=MAXW?'Full':('Wk '+w); wk.appendChild(o) }
wk.value=LASTW
function rebuild(week){
  computeStats(week); buildDeck(); buildTabs(); render()   // frozen order — stay on the current card
}
wk.onchange=()=>{ setPlay(false); rebuild(+wk.value) }
if(MODE==='players') wk.style.display='none'   // the week only rewinds the club cards

computeStats(LASTW); freezeRanking()   // ranking + seeds frozen at the latest week
buildDeck(); buildTabs()
idx=idxFromHash()
render()
