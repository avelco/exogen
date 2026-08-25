import { describe, expect, it } from 'vitest'
import {
  applyElementalDamage,
  previewElementalDamage,
} from '../src/domain/combat/DamagePipeline'
import { resistDamage, zeroResistances } from '../src/domain/combat/Elements'
import { allCardDefs } from '../src/domain/cards/Card'
import { Enemy } from '../src/domain/enemies/Enemy'

describe('DamagePipeline', () => {
  it('computes resistance reduction', () => {
    expect(resistDamage(10, 0)).toBe(10)
    expect(resistDamage(10, 15)).toBe(9)
    expect(resistDamage(10, 50)).toBe(5)
    expect(resistDamage(10, 100)).toBe(0)
    expect(resistDamage(9, 50)).toBe(5) // round
  })

  it('applies elemental damage through shield after resist', () => {
    const target = {
      hp: 20,
      shield: 2,
      resistances: { ...zeroResistances(), fire: 50 },
    }
    // 10 fire → 5 after resist → 2 absorbed → 3 HP
    const lost = applyElementalDamage(target, 10, 'fire')
    expect(lost).toBe(3)
    expect(target.shield).toBe(0)
    expect(target.hp).toBe(17)
  })

  it('previews effective damage without mutating', () => {
    const res = { ...zeroResistances(), earth: 15 }
    expect(previewElementalDamage(14, 'earth', res)).toBe(12)
  })

  it('requires element on every damage card effect', () => {
    for (const def of allCardDefs()) {
      for (const e of def.effects) {
        if (e.type === 'damage') {
          expect(e.element).toBeTruthy()
        }
      }
    }
  })

  it('copies thematic resistances onto spawned enemies', () => {
    const enemy = Enemy.forNode('boss', 1, 1, 0)
    expect(enemy.resistances.earth).toBeGreaterThanOrEqual(0)
    expect(enemy.resistances.earth).toBeLessThanOrEqual(15)
    // golem is the only boss template
    if (enemy.templateId === 'golem') {
      expect(enemy.resistances.earth).toBe(15)
    }
  })
})
