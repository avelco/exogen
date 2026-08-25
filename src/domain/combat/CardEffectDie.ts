export type CardEffectMultiplier = 1 | 2 | 3
export type CardEffectDieFace = 1 | 2 | 3 | 4 | 5 | 6

export interface CardEffectDieRoll {
  face: CardEffectDieFace
  multiplier: CardEffectMultiplier
}

export const CARD_EFFECT_DIE_EXPECTED_MULTIPLIER = 5 / 3
export const CARD_EFFECT_DIE_ENEMY_HP_MULTIPLIER = 1.6

export function rollCardEffectDie(
  rng: () => number = Math.random,
): CardEffectDieRoll {
  const sample = rng()
  const clamped = Number.isNaN(sample)
    ? 0
    : Math.min(1, Math.max(0, sample))
  const face = Math.min(6, Math.floor(clamped * 6) + 1) as CardEffectDieFace
  const multiplier = face <= 3 ? 1 : face <= 5 ? 2 : 3
  return { face, multiplier }
}

export function rollCardEffectDice(
  count = 3,
  rng: () => number = Math.random,
): CardEffectDieRoll[] {
  return Array.from({ length: count }, () => rollCardEffectDie(rng))
}

export function compensateEnemyHpForCardDie(hp: number): number {
  return Math.ceil(hp * CARD_EFFECT_DIE_ENEMY_HP_MULTIPLIER)
}
