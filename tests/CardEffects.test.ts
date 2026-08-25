import { describe, expect, it } from 'vitest'
import {
  applyDamage,
  previewCards,
  previewCardsVs,
  resolveCardPlays,
  tickPoison,
  type CombatActor,
} from '../src/domain/cards/CardEffects'
import { makeRunCard, resetCardIds, scaleEffectValue } from '../src/domain/cards/Card'
import { zeroResistances } from '../src/domain/combat/Elements'

function actor(hp = 20, maxHp = 20): CombatActor {
  return { hp, maxHp, shield: 0, poison: 0, resistances: zeroResistances() }
}

describe('CardEffects', () => {
  it('preview sums slotted effects', () => {
    resetCardIds()
    const cards = [makeRunCard('bash'), makeRunCard('toxin')]
    expect(previewCards(cards)).toEqual({
      damage: 5,
      poison: 2,
      shield: 0,
      heal: 0,
      resist: {},
    })
  })

  it('previewCardsVs applies resistances', () => {
    resetCardIds()
    const cards = [makeRunCard('slash')] // 10 fire
    const p = previewCardsVs(cards, { ...zeroResistances(), fire: 50 })
    expect(p.damage).toBe(5)
  })

  it('damage absorbs into shield then HP', () => {
    const t = actor()
    t.shield = 3
    expect(applyDamage(t, 5)).toBe(2)
    expect(t.shield).toBe(0)
    expect(t.hp).toBe(18)
  })

  it('resolveCardPlays applies damage poison shield heal', () => {
    resetCardIds()
    const self = actor(10)
    const target = actor(20)
    const cards = [
      makeRunCard('bash'),
      makeRunCard('guard'),
      makeRunCard('salve'),
      makeRunCard('toxin'),
    ]
    const applied = resolveCardPlays(cards, self, target)
    expect(applied.damage).toBe(5)
    expect(target.hp).toBe(15)
    expect(target.poison).toBe(2)
    expect(self.shield).toBe(5)
    expect(self.hp).toBe(14) // 10+4
  })

  it('resolveCardPlays applies combat resist to self', () => {
    resetCardIds()
    const self = actor(10)
    const target = actor(20)
    const applied = resolveCardPlays([makeRunCard('phase_insulator')], self, target)
    expect(applied.resist.fire).toBe(25)
    expect(self.resistances.fire).toBe(25)
    expect(self.shield).toBe(5)
  })

  it('resist without element covers all elements', () => {
    resetCardIds()
    const self = actor(10)
    const target = actor(20)
    resolveCardPlays([makeRunCard('void_weave')], self, target)
    for (const v of Object.values(self.resistances)) expect(v).toBe(20)
  })

  it('combat resist caps at 50', () => {
    resetCardIds()
    const self = actor(10)
    const target = actor(20)
    const cards = [
      makeRunCard('phase_insulator'),
      makeRunCard('phase_insulator'),
      makeRunCard('phase_insulator'),
    ]
    resolveCardPlays(cards, self, target)
    expect(self.resistances.fire).toBe(50)
  })

  it('previewCardsVs reports incoming resist', () => {
    resetCardIds()
    const p = previewCardsVs([makeRunCard('null_aegis')], zeroResistances())
    expect(p.resist.neutral).toBe(40)
    expect(p.shield).toBe(16)
  })

  it('tickPoison deals stacks then decays and ignores resist', () => {
    const a = actor(20)
    a.poison = 3
    a.resistances.neutral = 100
    expect(tickPoison(a)).toBe(3)
    expect(a.hp).toBe(17)
    expect(a.poison).toBe(2)
  })

  it('scales effect values by fusion level', () => {
    expect(scaleEffectValue(4, 1)).toBe(4)
    expect(scaleEffectValue(4, 2)).toBe(6)
    expect(scaleEffectValue(4, 3)).toBe(8)
  })
  it('scales printed values while leaving additive bonuses single', () => {
    resetCardIds()
    const cards = [
      makeRunCard('slash'),
      makeRunCard('toxin'),
      makeRunCard('guard'),
      makeRunCard('salve'),
    ]
    const bonuses = {
      cardEffectMultiplier: 2 as const,
      elementDmgBonus: { ...zeroResistances(), fire: 4 },
      poisonAmp: 3,
    }
    const resistances = { ...zeroResistances(), fire: 50 }
    expect(previewCardsVs(cards, resistances, bonuses)).toEqual({
      damage: 12,
      poison: 7,
      shield: 10,
      heal: 8,
      resist: {},
    })

    const self = actor(10)
    const target = actor(20)
    target.resistances.fire = 50
    const applied = resolveCardPlays(cards, self, target, bonuses)
    expect(applied.damage).toBe(12)
    expect(applied.poison).toBe(7)
    expect(applied.shield).toBe(10)
    expect(applied.heal).toBe(8)
    expect(target.hp).toBe(8)
    expect(target.poison).toBe(7)
    expect(self.shield).toBe(10)
    expect(self.hp).toBe(18)
  })

  it('doubles phase insulator and still caps resistance at 50', () => {
    resetCardIds()
    const self = actor(10)
    const target = actor(20)
    const applied = resolveCardPlays(
      [makeRunCard('phase_insulator')],
      self,
      target,
      { cardEffectMultiplier: 2 },
    )
    expect(applied.resist.fire).toBe(50)
    expect(self.resistances.fire).toBe(50)
    expect(applied.shield).toBe(10)
  })

  it('keeps current values when the multiplier is explicitly one', () => {
    resetCardIds()
    expect(previewCards(
      [makeRunCard('bash'), makeRunCard('toxin')],
      { cardEffectMultiplier: 1 },
    )).toEqual({
      damage: 5,
      poison: 2,
      shield: 0,
      heal: 0,
      resist: {},
    })
  })
})
