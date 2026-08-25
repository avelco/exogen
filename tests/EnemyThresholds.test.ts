import { describe, expect, it } from 'vitest'
import {
  Enemy,
  THRESHOLD_PHASE,
  THRESHOLD_VOID,
  thresholdMult,
} from '../src/domain/enemies/Enemy'

describe('difficulty thresholds', () => {
  it('scales enemy stats by depth band', () => {
    expect(thresholdMult(1)).toBe(1)
    expect(thresholdMult(THRESHOLD_VOID - 1)).toBe(1)
    expect(thresholdMult(THRESHOLD_VOID)).toBe(1.5)
    expect(thresholdMult(THRESHOLD_PHASE - 1)).toBe(1.5)
    expect(thresholdMult(THRESHOLD_PHASE)).toBe(2)
  })

  it('gives elites and bosses an extra action slot past depth 100', () => {
    expect(Enemy.forNode('elite', 99, 1).actionSlots).toBe(2)
    expect(Enemy.forNode('elite', THRESHOLD_VOID, 1).actionSlots).toBe(3)
    expect(Enemy.forNode('boss', 99, 1).actionSlots).toBe(3)
    expect(Enemy.forNode('boss', THRESHOLD_VOID, 1).actionSlots).toBe(4)
    expect(Enemy.forNode('combat', THRESHOLD_VOID, 1).actionSlots).toBe(2)
  })

  it('spike enemies are meaningfully tougher', () => {
    const before = Enemy.waveForNode('combat', THRESHOLD_VOID - 1, 7)
    const after = Enemy.waveForNode('combat', THRESHOLD_VOID, 7)
    const hp = (ws: Enemy[]) => ws.reduce((s, e) => s + e.maxHp, 0) / ws.length
    expect(hp(after)).toBeGreaterThan(hp(before) * 1.3)
  })

  it('unlocks templates by minFloor', () => {
    const ids = (floor: number, kind: 'combat' | 'elite' | 'boss', n: number) => {
      const set = new Set<string>()
      for (let seed = 0; seed < n; seed++) {
        for (const e of Enemy.waveForNode(kind, floor, seed)) set.add(e.templateId)
      }
      return set
    }
    expect(ids(1, 'boss', 40)).toEqual(new Set(['golem']))
    expect(ids(150, 'boss', 80)).toContain('gate_keeper')
    expect(ids(150, 'boss', 80)).not.toContain('void_warden')
    expect(ids(350, 'boss', 80)).toContain('void_warden')
    expect(ids(50, 'combat', 60)).toContain('rust_cultist')
    expect(ids(50, 'combat', 60)).not.toContain('ferro_husk')
    expect(ids(150, 'elite', 60)).toContain('susurri_monk')
    expect(ids(350, 'combat', 80)).toContain('echo_twin')
  })

  it('echo enemies start with echo unused', () => {
    const e = Enemy.forNode('combat', THRESHOLD_PHASE, 3)
    expect(e.echoUsed).toBe(false)
  })

  it('caps depth-1 waves at two enemies with two-round HP, except the boss', () => {
    for (let seed = 0; seed < 30; seed++) {
      const wave = Enemy.waveForNode('combat', 1, seed)
      expect(wave.length).toBeGreaterThanOrEqual(1)
      expect(wave.length).toBeLessThanOrEqual(2)
      for (const e of wave) {
        expect(e.maxHp).toBeGreaterThanOrEqual(32)
        expect(e.maxHp).toBeLessThanOrEqual(40)
      }
      const boss = Enemy.waveForNode('boss', 1, seed)
      expect(boss).toHaveLength(1)
      expect(boss[0]!.maxHp).toBeGreaterThan(40)
    }
  })
})
