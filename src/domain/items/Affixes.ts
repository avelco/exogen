import affixesData from '../../data/affixes.json'
import {
  ELEMENTS,
  ELEMENT_ABBR_KEY,
  type Element,
} from '../combat/Elements'
import { formatMod, type ModStat } from './Item'
import { tKey } from '../../i18n/I18n'

export type AffixTier = 'common' | 'blue' | 'purple' | 'gold'

export type AffixStat =
  | ModStat
  | 'poisonAmp'
  | 'resist'
  | 'elementDmg'

export type AffixElement = Element | 'all'

export interface AffixDef {
  id: string
  tier: AffixTier
  stat: AffixStat
  value: number
  element?: AffixElement
}

const AFFIXES: AffixDef[] = (affixesData as { affixes: AffixDef[] }).affixes

/** Roll weights: common 69%, blue 20%, purple 10%, gold 1%. */
const TIER_WEIGHTS: { tier: AffixTier; weight: number }[] = [
  { tier: 'common', weight: 69 },
  { tier: 'blue', weight: 20 },
  { tier: 'purple', weight: 10 },
  { tier: 'gold', weight: 1 },
]

export const AFFIX_TIER_COLORS: Record<AffixTier, string> = {
  common: '#bbbbbb',
  blue: '#66aaff',
  purple: '#cc66ff',
  gold: '#ffcc44',
}

export const FORGE_REROLL_COST = 3

const FLAT_STATS: ModStat[] = ['maxHp', 'defFlat', 'dmgFlat', 'startGold']

export function allAffixes(): AffixDef[] {
  return AFFIXES
}

export function affixDef(id: string): AffixDef | undefined {
  return AFFIXES.find(a => a.id === id)
}

function elementLabel(el: AffixElement): string {
  if (el === 'all') return '*'
  return tKey(ELEMENT_ABBR_KEY[el], el[0]!.toUpperCase())
}

/** Display label for forge UI / tooltips. */
export function formatAffix(affix: AffixDef): string {
  const sign = affix.value >= 0 ? '+' : ''
  switch (affix.stat) {
    case 'maxHp':
    case 'defFlat':
    case 'dmgFlat':
    case 'startGold':
      return formatMod({ stat: affix.stat, value: affix.value })
    case 'poisonAmp':
      return `${sign}${affix.value} ${tKey('card.effect.poison', 'VENENO')}`
    case 'resist': {
      const el = affix.element ?? 'all'
      return `${sign}${affix.value}% R.${elementLabel(el)}`
    }
    case 'elementDmg': {
      const el = affix.element ?? 'all'
      return `${sign}${affix.value} DMG ${elementLabel(el)}`
    }
    default:
      return `${sign}${affix.value}`
  }
}

export function isFlatAffixStat(stat: AffixStat): stat is ModStat {
  return (FLAT_STATS as string[]).includes(stat)
}

export function isValidAffix(a: AffixDef): boolean {
  if (!a || typeof a.value !== 'number' || !Number.isFinite(a.value)) return false
  if (a.stat === 'resist' || a.stat === 'elementDmg') {
    if (a.element === 'all') return true
    return !!a.element && (ELEMENTS as readonly string[]).includes(a.element)
  }
  if (a.stat === 'poisonAmp') return true
  return isFlatAffixStat(a.stat)
}

function pickTier(rng: () => number): AffixTier {
  let r = rng() * 100
  for (const { tier, weight } of TIER_WEIGHTS) {
    r -= weight
    if (r <= 0) return tier
  }
  return 'common'
}

export function rollAffix(rng: () => number = Math.random): AffixDef {
  const tier = pickTier(rng)
  const pool = AFFIXES.filter(a => a.tier === tier)
  const list = pool.length > 0 ? pool : AFFIXES.filter(a => a.tier === 'common')
  return list[Math.floor(rng() * list.length)] ?? AFFIXES[0]!
}
