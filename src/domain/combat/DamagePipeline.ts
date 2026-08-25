import type { Element, ElementResistances } from './Elements'
import { resistDamage } from './Elements'

export interface DamageTarget {
  hp: number
  shield: number
  resistances: ElementResistances
}

/** Apply amount through shield. Returns HP lost. */
export function applyThroughShield(
  target: DamageTarget,
  amount: number,
): number {
  if (amount <= 0) return 0
  const absorbed = Math.min(target.shield, amount)
  target.shield -= absorbed
  const hpLoss = amount - absorbed
  target.hp = Math.max(0, target.hp - hpLoss)
  return hpLoss
}

/**
 * Apply elemental damage: resist first, then shield absorption.
 * Returns HP lost (post-shield).
 */
export function applyElementalDamage(
  target: DamageTarget,
  base: number,
  element: Element,
): number {
  if (base <= 0) return 0
  const resistPct = target.resistances[element] ?? 0
  const adjusted = resistDamage(base, resistPct)
  return applyThroughShield(target, adjusted)
}

/** Preview raw→effective damage for a single hit against resistances. */
export function previewElementalDamage(
  base: number,
  element: Element,
  resistances: ElementResistances,
): number {
  if (base <= 0) return 0
  return resistDamage(base, resistances[element] ?? 0)
}
