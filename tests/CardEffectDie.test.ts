import { describe, expect, it } from 'vitest'
import {
  compensateEnemyHpForCardDie,
  rollCardEffectDice,
  rollCardEffectDie,
} from '../src/domain/combat/CardEffectDie'

describe('CardEffectDie', () => {
  it.each([
    [0, 1, 1],
    [0.4, 3, 1],
    [0.5, 4, 2],
    [0.75, 5, 2],
    [0.99, 6, 3],
  ])('maps sample %s to face %s and multiplier ×%s', (sample, face, multiplier) => {
    expect(rollCardEffectDie(() => sample)).toEqual({ face, multiplier })
  })

  it('clamps an RNG sample of 1 to face 6', () => {
    expect(rollCardEffectDie(() => 1)).toEqual({ face: 6, multiplier: 3 })
  })

  it('rolls three dice in sequence', () => {
    const samples = [0, 0.5, 0.99]
    let i = 0
    const rolls = rollCardEffectDice(3, () => samples[i++]!)
    expect(rolls).toEqual([
      { face: 1, multiplier: 1 },
      { face: 4, multiplier: 2 },
      { face: 6, multiplier: 3 },
    ])
  })

  it('compensates enemy HP upward', () => {
    expect(compensateEnemyHpForCardDie(39)).toBe(63)
  })
})
