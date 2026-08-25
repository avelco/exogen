import { effectsOf, type RunCard } from './Card'
import {
  applyElementalDamage,
  applyThroughShield,
  previewElementalDamage,
} from '../combat/DamagePipeline'
import type { Element, ElementResistances } from '../combat/Elements'
import { ELEMENTS, zeroResistances } from '../combat/Elements'
import type { CardEffectMultiplier } from '../combat/CardEffectDie'

export interface CombatActor {
  hp: number
  maxHp: number
  shield: number
  poison: number
  resistances: ElementResistances
}

export interface TurnPreview {
  damage: number
  poison: number
  shield: number
  heal: number
  /** Combat-only elemental resist granted to self (%), per element. */
  resist: Partial<ElementResistances>
}

/** Resist gained in combat caps at this % per element. */
export const COMBAT_RESIST_CAP = 50

function emptyPreview(): TurnPreview {
  return { damage: 0, poison: 0, shield: 0, heal: 0, resist: {} }
}

function addPreviewResist(out: TurnPreview, value: number, element?: Element) {
  if (element) out.resist[element] = (out.resist[element] ?? 0) + value
  else for (const el of ELEMENTS) out.resist[el] = (out.resist[el] ?? 0) + value
}

export function makeActor(
  hp: number,
  maxHp: number,
  shield = 0,
  poison = 0,
  resistances: ElementResistances = zeroResistances(),
): CombatActor {
  return { hp, maxHp, shield, poison, resistances }
}

export interface CardPlayBonuses {
  elementDmgBonus?: ElementResistances
  poisonAmp?: number
  cardEffectMultiplier?: CardEffectMultiplier
}

function dmgBonusFor(
  el: Element,
  bonuses?: CardPlayBonuses,
): number {
  return bonuses?.elementDmgBonus?.[el] ?? 0
}

/** Raw preview (no resist). */
export function previewCards(
  cards: RunCard[],
  bonuses?: CardPlayBonuses,
): TurnPreview {
  const out = emptyPreview()
  for (const card of cards) {
    for (const e of effectsOf(card)) {
      const scaledValue = e.value * (bonuses?.cardEffectMultiplier ?? 1)
      if (e.type === 'damage') {
        const el = (e.element ?? 'neutral') as Element
        out.damage += scaledValue + dmgBonusFor(el, bonuses)
      } else if (e.type === 'poison') {
        out.poison += scaledValue + (bonuses?.poisonAmp ?? 0)
      } else if (e.type === 'resist') {
        addPreviewResist(out, scaledValue, e.element)
      } else {
        out[e.type] += scaledValue
      }
    }
  }
  return out
}

/** Preview damage after target resistances (shield not simulated). */
export function previewCardsVs(
  cards: RunCard[],
  targetResistances: ElementResistances,
  bonuses?: CardPlayBonuses,
): TurnPreview {
  const out = emptyPreview()
  for (const card of cards) {
    for (const e of effectsOf(card)) {
      const scaledValue = e.value * (bonuses?.cardEffectMultiplier ?? 1)
      if (e.type === 'damage') {
        const el = (e.element ?? 'neutral') as Element
        const raw = scaledValue + dmgBonusFor(el, bonuses)
        out.damage += previewElementalDamage(raw, el, targetResistances)
      } else if (e.type === 'poison') {
        out.poison += scaledValue + (bonuses?.poisonAmp ?? 0)
      } else if (e.type === 'resist') {
        addPreviewResist(out, scaledValue, e.element)
      } else {
        out[e.type] += scaledValue
      }
    }
  }
  return out
}

/** Apply damage through shield. Returns HP lost. */
export function applyDamage(target: CombatActor, amount: number): number {
  return applyThroughShield(target, amount)
}

export function applyHeal(target: CombatActor, amount: number): number {
  if (amount <= 0) return 0
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  return target.hp - before
}

export function applyShield(target: CombatActor, amount: number): void {
  if (amount > 0) target.shield += amount
}

export function applyPoison(target: CombatActor, amount: number): void {
  if (amount > 0) target.poison += amount
}

/** Combat-only resist: adds value% to element (or all), capped at COMBAT_RESIST_CAP. */
export function applyResist(
  target: CombatActor,
  value: number,
  element?: Element,
): void {
  if (value <= 0) return
  const els = element ? [element] : ELEMENTS
  for (const el of els) {
    target.resistances[el] = Math.min(
      COMBAT_RESIST_CAP,
      (target.resistances[el] ?? 0) + value,
    )
  }
}

/**
 * Resolve slotted cards in order against target (damage/poison)
 * and self (shield/heal).
 */
export function resolveCardPlays(
  cards: RunCard[],
  self: CombatActor,
  target: CombatActor,
  bonuses?: CardPlayBonuses,
): TurnPreview {
  const applied = emptyPreview()
  for (const card of cards) {
    for (const e of effectsOf(card)) {
      const scaledValue = e.value * (bonuses?.cardEffectMultiplier ?? 1)
      switch (e.type) {
        case 'damage': {
          const el = (e.element ?? 'neutral') as Element
          const raw = scaledValue + dmgBonusFor(el, bonuses)
          applied.damage += applyElementalDamage(target, raw, el)
          break
        }
        case 'poison': {
          const amt = scaledValue + (bonuses?.poisonAmp ?? 0)
          applyPoison(target, amt)
          applied.poison += amt
          break
        }
        case 'shield':
          applyShield(self, scaledValue)
          applied.shield += scaledValue
          break
        case 'heal':
          applied.heal += applyHeal(self, scaledValue)
          break
        case 'resist':
          applyResist(self, scaledValue, e.element)
          addPreviewResist(applied, scaledValue, e.element)
          break
      }
    }
  }
  return applied
}

/** Poison tick at start of actor's turn: lose HP equal to stacks, then −1 stack. */
export function tickPoison(actor: CombatActor): number {
  if (actor.poison <= 0) return 0
  const dmg = actor.poison
  actor.hp = Math.max(0, actor.hp - dmg)
  actor.poison = Math.max(0, actor.poison - 1)
  return dmg
}

/** Effective damage sum for AI lethal checks. */
export function effectiveDamageOf(
  cards: RunCard[],
  targetResistances: ElementResistances,
): number {
  return previewCardsVs(cards, targetResistances).damage
}
