import { describe, expect, it } from 'vitest'
import { CombatEngine, toFighter } from '../src/domain/combat/CombatEngine'
import { makeRunCard, resetCardIds } from '../src/domain/cards/Card'
import { makeState } from './helpers'
import { EnemyAI } from '../src/domain/enemies/EnemyAI'
import { zeroResistances } from '../src/domain/combat/Elements'

describe('CombatEngine card resolve', () => {
  it('applies damage through shield then HP', () => {
    resetCardIds()
    const self = toFighter(20, 20, 0, 0)
    const target = toFighter(20, 20, 3, 0)
    const cards = [makeRunCard('bash')] // 5 dmg neutral
    const result = CombatEngine.resolveTurn(cards, self, target)
    expect(result.applied.damage).toBe(2) // 3 absorbed, 2 to hp
    expect(target.hp).toBe(18)
    expect(target.shield).toBe(0)
  })

  it('reduces damage by target resistances', () => {
    resetCardIds()
    const self = toFighter(20, 20, 0, 0)
    const target = toFighter(20, 20, 0, 0, 0, {
      ...zeroResistances(),
      fire: 50,
    })
    // slash = 10 fire → 50% → 5
    const result = CombatEngine.resolveTurn([makeRunCard('slash')], self, target)
    expect(result.applied.damage).toBe(5)
    expect(target.hp).toBe(15)
  })

  it('heals and shields self', () => {
    resetCardIds()
    const self = toFighter(10, 20, 0, 0)
    const target = toFighter(20, 20, 0, 0)
    const cards = [makeRunCard('guard'), makeRunCard('salve')]
    CombatEngine.resolveTurn(cards, self, target)
    expect(self.shield).toBe(5)
    expect(self.hp).toBe(14)
  })

  it('applies heavy_hit bonus via player turn as neutral', () => {
    resetCardIds()
    const state = makeState()
    state.passives.push('heavy_hit')
    state.bonusDmgFlat = 0
    const hero = toFighter(30, 30, 0, 0)
    const enemy = toFighter(50, 50, 0, 0)
    const cards = [makeRunCard('strike')] // 4
    const result = CombatEngine.resolvePlayerTurn(cards, state, hero, enemy)
    expect(result.applied.damage).toBe(6) // 4 + 2 heavy
  })
  it('multiplies card values but leaves flat and heavy bonuses single', () => {
    resetCardIds()
    const state = makeState()
    state.passives.push('heavy_hit')
    state.bonusDmgFlat = 4
    const hero = toFighter(30, 30, 0, 0)
    const enemy = toFighter(50, 50, 0, 0)
    const result = CombatEngine.resolvePlayerTurn(
      [makeRunCard('strike')],
      state,
      hero,
      enemy,
      2,
    )
    expect(result.preview.damage).toBe(8)
    expect(result.applied.damage).toBe(14)
    expect(enemy.hp).toBe(36)
  })
})

describe('EnemyAI', () => {
  it('prefers lethal damage after resistances', () => {
    resetCardIds()
    const hand = [
      makeRunCard('toxin'),
      makeRunCard('crush'), // 22 earth
      makeRunCard('guard'),
    ]
    const self = {
      hp: 20,
      maxHp: 20,
      shield: 0,
      poison: 0,
      resistances: zeroResistances(),
    }
    const target = {
      hp: 10,
      maxHp: 20,
      shield: 0,
      poison: 0,
      resistances: zeroResistances(),
    }
    const plays = EnemyAI.choosePlays(hand, 1, self, target)
    expect(plays[0]!.defId).toBe('crush')
  })
})
