import type { CSSProperties } from 'react'

// The prototype authors every inline style as a CSS *string* (its component runtime parsed
// those strings). React needs style *objects*. Rather than hand-transcribe ~80 finalized,
// load-bearing style strings into objects — where a single typo silently breaks the layout —
// we keep the exact strings from the spec and parse them here at render time.
//
// Split each declaration on the FIRST ':' only, so values that contain a colon
// (e.g. `url('https://…')`) survive intact.
export function css(str: string | undefined | null): CSSProperties {
  const out: Record<string, string> = {}
  if (!str) return out as CSSProperties
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const rawKey = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (!rawKey || value === '') continue
    out[toCamel(rawKey)] = value
  }
  return out as CSSProperties
}

function toCamel(prop: string): string {
  // -webkit-font-smoothing -> WebkitFontSmoothing ; background-color -> backgroundColor
  const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return prop.startsWith('-') ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel
}
