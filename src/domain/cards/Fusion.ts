import {
  allCardDefs,
  cardDef,
  clampLevel,
  formatCardRef,
  MAX_FUSION_LEVEL,
  parseCardRef,
  type CardRarity,
} from './Card'

const RARITY_ORDER: CardRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'unique',
  'corrupt',
  'ascended',
]

export const FUSE_COST = 2
/** Chance that fusing two high-level cards glitches into a corrupt card. */
export const FUSION_FAIL_CHANCE = 0.1
/** Min level whose fusion can glitch (fusing N5+ produces N6/N7). */
export const FUSION_FAIL_MIN_LEVEL = 5
/** Chance that ascending from unique crits into an ascended card. */
export const ASCEND_CRIT_CHANCE = 0.1
/** Ascension is level-preserving but only allowed for refs up to this level. */
export const ASCEND_MAX_LEVEL = 3

export function nextRarity(rarity: CardRarity): CardRarity | null {
  const i = RARITY_ORDER.indexOf(rarity)
  if (i < 0 || i >= RARITY_ORDER.length - 1) return null
  return RARITY_ORDER[i + 1]!
}

export function cardsOfRarity(rarity: CardRarity): string[] {
  return allCardDefs().filter(d => d.rarity === rarity).map(d => d.id)
}

function addCount(col: Record<string, number>, ref: string, n: number) {
  const next = (col[ref] ?? 0) + n
  if (next <= 0) delete col[ref]
  else col[ref] = next
}

/** Fuse 2 copies of the same ref into 1 copy at level+1. */
export function canFuse(
  collection: Record<string, number>,
  ref: string,
): boolean {
  const parsed = parseCardRef(ref)
  if (!parsed) return false
  if (parsed.level >= MAX_FUSION_LEVEL) return false
  return (collection[ref] ?? 0) >= FUSE_COST
}

function randomCardOfRarity(
  rarity: CardRarity,
  rng: () => number,
): string | null {
  const ids = cardsOfRarity(rarity)
  if (ids.length === 0) return null
  return ids[Math.floor(rng() * ids.length)] ?? null
}

/**
 * Fuse 2 copies into 1 at level+1. Fusing two N5+ cards can glitch
 * (FUSION_FAIL_CHANCE): the pair collapses into a random corrupt N1.
 */
export function fuse(
  collection: Record<string, number>,
  ref: string,
  rng: () => number = Math.random,
): { ok: true; collection: Record<string, number>; result: string; glitched: boolean } | { ok: false; reason: string } {
  if (!canFuse(collection, ref)) {
    return { ok: false, reason: 'cannot_fuse' }
  }
  const parsed = parseCardRef(ref)!
  let glitched = false
  let result: string
  if (
    parsed.level >= FUSION_FAIL_MIN_LEVEL &&
    rng() < FUSION_FAIL_CHANCE
  ) {
    const corruptId = randomCardOfRarity('corrupt', rng)
    result = corruptId ?? formatCardRef(parsed.defId, parsed.level + 1)
    glitched = corruptId != null
  } else {
    result = formatCardRef(parsed.defId, clampLevel(parsed.level + 1))
  }
  const next = { ...collection }
  addCount(next, ref, -FUSE_COST)
  addCount(next, result, 1)
  return { ok: true, collection: next, result, glitched }
}

/**
 * Ascend: spend 2 copies of ref, gain chosenDefId (next rarity) at the
 * SAME level as ref. Only refs up to ASCEND_MAX_LEVEL can ascend, so
 * high-level progress must be fused within each rarity.
 */
export function canAscend(
  collection: Record<string, number>,
  ref: string,
  chosenDefId: string,
): boolean {
  const parsed = parseCardRef(ref)
  if (!parsed) return false
  if (parsed.level > ASCEND_MAX_LEVEL) return false
  const src = cardDef(parsed.defId)
  const chosen = cardDef(chosenDefId)
  if (!src || !chosen) return false
  const next = nextRarity(src.rarity)
  if (!next || chosen.rarity !== next) return false
  return (collection[ref] ?? 0) >= FUSE_COST
}

/**
 * Ascend: spend 2 copies of ref, gain chosenDefId at ref's level.
 * Ascending from unique (into corrupt) can crit (ASCEND_CRIT_CHANCE):
 * the result is a random ascended card at ref's level instead.
 */
export function ascend(
  collection: Record<string, number>,
  ref: string,
  chosenDefId: string,
  rng: () => number = Math.random,
): { ok: true; collection: Record<string, number>; result: string; crit: boolean } | { ok: false; reason: string } {
  if (!canAscend(collection, ref, chosenDefId)) {
    return { ok: false, reason: 'cannot_ascend' }
  }
  const parsed = parseCardRef(ref)!
  const src = cardDef(parsed.defId)!
  let crit = false
  let result = formatCardRef(chosenDefId, parsed.level)
  if (src.rarity === 'unique' && rng() < ASCEND_CRIT_CHANCE) {
    const ascendedId = randomCardOfRarity('ascended', rng)
    if (ascendedId) {
      result = formatCardRef(ascendedId, parsed.level)
      crit = true
    }
  }
  const next = { ...collection }
  addCount(next, ref, -FUSE_COST)
  addCount(next, result, 1)
  return { ok: true, collection: next, result, crit }
}

/** Refs with at least FUSE_COST copies that can still level up. */
export function fuseCandidates(collection: Record<string, number>): string[] {
  return Object.keys(collection)
    .filter(ref => canFuse(collection, ref))
    .sort()
}

/** Refs with at least FUSE_COST copies whose rarity can ascend. */
export function ascendCandidates(collection: Record<string, number>): string[] {
  const out: string[] = []
  for (const [ref, n] of Object.entries(collection)) {
    if (n < FUSE_COST) continue
    const parsed = parseCardRef(ref)
    if (!parsed || parsed.level > ASCEND_MAX_LEVEL) continue
    const def = cardDef(parsed.defId)
    if (!def) continue
    const next = nextRarity(def.rarity)
    if (!next || cardsOfRarity(next).length === 0) continue
    out.push(ref)
  }
  return out.sort()
}
