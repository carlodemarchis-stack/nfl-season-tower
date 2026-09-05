import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SeasonTower } from './SeasonTower'

// Tweakable props from the design handoff. These were exposed as an editor panel in the
// prototype; here they are build-time defaults. `season` is also switchable at runtime from
// the title dropdown (which overrides this value).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SeasonTower
      season="2026"
      colorMode="opponent"
      pendingMode="ceiling"
      lossReverse={true}
      orientation="auto"
      tieHalf={true}
      scoreLabels={true}
      showByes={true}
      editScores={false}
      seed={20260913}
    />
  </StrictMode>,
)
