import {
  allCardDefs,
  cardRarityDef,
  type CardDef,
  type CardRarity,
} from './Card'

export const PACK_SIZE = 5
export const STARTER_PACK_COUNT = 2
export const DECK_SIZE = 10

export type PackProfile = 'standard' | 'endRun'

/** Weights by rarity for pack rolls. endRun doubles uncommon+. */
/** Standard mirrors CARD_RARITIES; endRun doubles uncommon+. */
export const PACK_WEIGHTS: Record<PackProfile, Partial<Record<CardRarity, number>>> = {
  standard: {
    common: 48,
    uncommon: 12.6,
    rare: 18,
    epic: 6.3,
    legendary: 6,
    unique: 1.8,
  },
  endRun: {
    common: 48,
    uncommon: 25.2,
    rare: 36,
    epic: 12.6,
    legendary: 12,
    unique: 3.6,
  },
}

function weightFor(rarity: CardRarity, profile: PackProfile): number {
  return PACK_WEIGHTS[profile][rarity] ?? 0
}

/** Deeper depths yield better packs: high rarities scale with depth. */
export function rarityDepthScale(rarity: CardRarity, depth: number): number {
  const d = Math.max(1, depth)
  switch (rarity) {
    case 'rare':
      return 1 + d / 200
    case 'epic':
      return 1 + d / 150
    case 'legendary':
    case 'unique':
      return 1 + d / 300
    default:
      return 1
  }
}

function pickRarity(
  defs: CardDef[],
  rng: () => number,
  profile: PackProfile,
  depth: number,
): CardRarity {
  const available = [...new Set(defs.map(def => def.rarity))]
    .filter(rarity => weightFor(rarity, profile) > 0)
  const total = available.reduce(
    (sum, rarity) => sum + weightFor(rarity, profile) * rarityDepthScale(rarity, depth),
    0,
  )
  let roll = rng() * total
  for (const rarity of available) {
    roll -= weightFor(rarity, profile) * rarityDepthScale(rarity, depth)
    if (roll <= 0) return rarity
  }
  return available[available.length - 1]!
}

function pickWeighted(
  defs: CardDef[],
  rng: () => number,
  profile: PackProfile,
  depth: number,
): CardDef {
  const rarity = pickRarity(defs, rng, profile, depth)
  const pool = defs.filter(def => def.rarity === rarity)
  return pool[Math.floor(rng() * pool.length)]!
}

/** Open one pack → PACK_SIZE card def ids. */
export function openPack(
  rng: () => number = Math.random,
  profile: PackProfile = 'standard',
  depth = 1,
): string[] {
  const pool = allCardDefs().filter(d => cardRarityDef(d.rarity).packWeight > 0)
  const out: string[] = []
  for (let i = 0; i < PACK_SIZE; i++) {
    out.push(pickWeighted(pool, rng, profile, depth).id)
  }
  return out
}

export function openPacks(
  count: number,
  rng: () => number = Math.random,
  profile: PackProfile = 'standard',
  depth = 1,
): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(...openPack(rng, profile, depth))
  return out
}

/** Prefer signature cards when building the first active deck. */
export function buildActiveDeck(
  collection: string[],
  signatureIds: string[] = [],
  size = DECK_SIZE,
): string[] {
  const deck: string[] = []
  for (const id of signatureIds) {
    if (collection.includes(id) && !deck.includes(id) && deck.length < size) {
      deck.push(id)
    }
  }
  for (const id of collection) {
    if (deck.length >= size) break
    const used = deck.filter(x => x === id).length
    const owned = collection.filter(x => x === id).length
    if (used < owned) deck.push(id)
  }
  while (deck.length < size) deck.push('strike')
  return deck.slice(0, size)
}

/** End-of-run pack count: 2 on victory, 1 on defeat. */
export function endRunPackCount(victory: boolean): number {
  return victory ? 2 : 1
}
