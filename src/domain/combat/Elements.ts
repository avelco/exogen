export type Element = 'earth' | 'fire' | 'air' | 'water' | 'neutral'

export const ELEMENTS: readonly Element[] = [
  'earth',
  'fire',
  'air',
  'water',
  'neutral',
]

export type ElementResistances = Record<Element, number>

export function zeroResistances(): ElementResistances {
  return { earth: 0, fire: 0, air: 0, water: 0, neutral: 0 }
}

export function normalizeResistances(raw: unknown): ElementResistances {
  const out = zeroResistances()
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Partial<Record<Element, unknown>>
  for (const el of ELEMENTS) {
    const v = src[el]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[el] = Math.max(-100, Math.min(100, Math.round(v)))
    }
  }
  return out
}

export const ELEMENT_COLOR: Record<Element, string> = {
  earth: '#8B7355',
  fire: '#EF4444',
  air: '#67E8F9',
  water: '#3B82F6',
  neutral: '#A0AAB5',
}

export const ELEMENT_ABBR_KEY: Record<Element, string> = {
  earth: 'element.abbr.earth',
  fire: 'element.abbr.fire',
  air: 'element.abbr.air',
  water: 'element.abbr.water',
  neutral: 'element.abbr.neutral',
}

/** Damage after resistance: round(base × (1 − resist/100)), clamped ≥ 0. */
export function resistDamage(base: number, resistPct: number): number {
  if (base <= 0) return 0
  return Math.max(0, Math.round(base * (1 - resistPct / 100)))
}
