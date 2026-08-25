import cardsData from '../../data/cards.json'
import type { Element } from '../combat/Elements'
import { ELEMENTS } from '../combat/Elements'

export type CardRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'unique'
  | 'corrupt'
  | 'ascended'

export interface CardRarityDef {
  id: CardRarity
  symbol: string
  technology: string
  color: string
  accentColor?: string
  appearance: number | null
  packWeight: number
  acquisition: 'pack' | 'fusionFailure' | 'fusionSuccess'
  loreKey: string
}

/** Pack weights sized so per-card rate falls with rarity (8/3/6/3/4/2 defs). */
export const CARD_RARITIES: readonly CardRarityDef[] = [
  {
    id: 'common',
    symbol: '○',
    technology: 'Baseline',
    color: '#A0AAB5',
    appearance: 48,
    packWeight: 48,
    acquisition: 'pack',
    loreKey: 'rarity.common.lore',
  },
  {
    id: 'uncommon',
    symbol: '◇',
    technology: 'Modified',
    color: '#00D2BE',
    appearance: 12.6,
    packWeight: 12.6,
    acquisition: 'pack',
    loreKey: 'rarity.uncommon.lore',
  },
  {
    id: 'rare',
    symbol: '△',
    technology: 'Advanced',
    color: '#3B82F6',
    appearance: 18,
    packWeight: 18,
    acquisition: 'pack',
    loreKey: 'rarity.rare.lore',
  },
  {
    id: 'epic',
    symbol: '⬡',
    technology: 'Exotic',
    color: '#A855F7',
    appearance: 6.3,
    packWeight: 6.3,
    acquisition: 'pack',
    loreKey: 'rarity.epic.lore',
  },
  {
    id: 'legendary',
    symbol: '✦',
    technology: 'Prime',
    color: '#F59E0B',
    appearance: 6,
    packWeight: 6,
    acquisition: 'pack',
    loreKey: 'rarity.legendary.lore',
  },
  {
    id: 'unique',
    symbol: '✹',
    technology: 'Singular',
    color: '#EF4444',
    appearance: 1.8,
    packWeight: 1.8,
    acquisition: 'pack',
    loreKey: 'rarity.unique.lore',
  },
  {
    id: 'corrupt',
    symbol: '✶',
    technology: 'Glitch',
    color: '#1F1F1F',
    accentColor: '#FF0055',
    appearance: null,
    packWeight: 0,
    acquisition: 'fusionFailure',
    loreKey: 'rarity.corrupt.lore',
  },
  {
    id: 'ascended',
    symbol: '✺',
    technology: 'Transcend',
    color: '#FFFFFF',
    accentColor: '#FFD700',
    appearance: null,
    packWeight: 0,
    acquisition: 'fusionSuccess',
    loreKey: 'rarity.ascended.lore',
  },
]

const RARITY_BY_ID = new Map(CARD_RARITIES.map(rarity => [rarity.id, rarity]))

export function cardRarityDef(rarity: CardRarity): CardRarityDef {
  return RARITY_BY_ID.get(rarity)!
}
export type CardEffectType = 'damage' | 'poison' | 'shield' | 'heal' | 'resist'

export interface CardEffect {
  type: CardEffectType
  value: number
  /** Required for damage effects; for resist, absent means all elements. */
  element?: Element
}

export interface CardDef {
  id: string
  rarity: CardRarity
  effects: CardEffect[]
}

export const MAX_FUSION_LEVEL = 7
export const MIN_CARD_LEVEL = 1

export interface RunCard {
  id: string
  defId: string
  /** Fusion level 1–3. Level 1 = base values. */
  level: number
}

/** Storage ref: "strike" (level 1) or "strike@2" / "strike@3". */
export function formatCardRef(defId: string, level = MIN_CARD_LEVEL): string {
  const lv = clampLevel(level)
  return lv <= MIN_CARD_LEVEL ? defId : `${defId}@${lv}`
}

export function parseCardRef(ref: string): { defId: string; level: number } | null {
  if (!ref) return null
  const at = ref.lastIndexOf('@')
  if (at < 0) {
    if (!cardDef(ref)) return null
    return { defId: ref, level: MIN_CARD_LEVEL }
  }
  const defId = ref.slice(0, at)
  const level = Number(ref.slice(at + 1))
  if (!cardDef(defId) || !Number.isFinite(level)) return null
  return { defId, level: clampLevel(level) }
}

export function clampLevel(level: number): number {
  return Math.min(
    MAX_FUSION_LEVEL,
    Math.max(MIN_CARD_LEVEL, Math.floor(level) || MIN_CARD_LEVEL),
  )
}

/** Level 1 = base, level 2 = ×1.5, level 3 = ×2. */
export function scaleEffectValue(value: number, level: number): number {
  const lv = clampLevel(level)
  return Math.round(value * (1 + 0.5 * (lv - 1)))
}

function normalizeEffect(raw: CardEffect): CardEffect {
  if (raw.type === 'resist') {
    const el = raw.element
    const out: CardEffect = { type: 'resist', value: raw.value }
    if (el && (ELEMENTS as readonly string[]).includes(el)) out.element = el
    return out
  }
  if (raw.type !== 'damage') return { type: raw.type, value: raw.value }
  const el = raw.element
  const element =
    el && (ELEMENTS as readonly string[]).includes(el) ? el : 'neutral'
  return { type: 'damage', value: raw.value, element }
}

function normalizeDefs(raw: CardDef[]): CardDef[] {
  return raw.map(def => ({
    ...def,
    effects: def.effects.map(normalizeEffect),
  }))
}

const DEFS = normalizeDefs(cardsData as CardDef[])
const BY_ID = new Map(DEFS.map(d => [d.id, d]))

let nextId = 1

export function allCardDefs(): CardDef[] {
  return DEFS
}

export function cardDef(id: string): CardDef | undefined {
  return BY_ID.get(id)
}

export function makeRunCard(defId: string, level = MIN_CARD_LEVEL): RunCard {
  return { id: `c${nextId++}`, defId, level: clampLevel(level) }
}

export function makeRunCardFromRef(ref: string): RunCard | null {
  const parsed = parseCardRef(ref)
  if (!parsed) return null
  return makeRunCard(parsed.defId, parsed.level)
}

export function makeRunCards(defIds: string[]): RunCard[] {
  return defIds.map(id => makeRunCard(id))
}

export function effectsOf(card: RunCard): CardEffect[] {
  const base = cardDef(card.defId)?.effects ?? []
  const level = clampLevel(card.level ?? MIN_CARD_LEVEL)
  if (level <= MIN_CARD_LEVEL) return base
  return base.map(e => ({
    ...e,
    value: scaleEffectValue(e.value, level),
  }))
}

export function sumEffect(cards: RunCard[], type: CardEffectType): number {
  let total = 0
  for (const c of cards) {
    for (const e of effectsOf(c)) {
      if (e.type === type) total += e.value
    }
  }
  return total
}

/** Reset id counter (tests). */
export function resetCardIds(start = 1) {
  nextId = start
}
