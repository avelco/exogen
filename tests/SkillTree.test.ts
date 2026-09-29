import { describe, expect, it, beforeEach } from 'vitest'
import { MetaProgression } from '../src/domain/progression/MetaProgression'
import {
  applyTreeEffectsToRun,
  canUnlock,
  skillTreeNodes,
  unlockedPassiveIds,
} from '../src/domain/progression/SkillTree'
import { createNewRun } from '../src/domain/progression/RunState'
import {
  getDungeonRecipe,
  MAX_CAMPAIGN_FLOOR,
} from '../src/domain/map/MazeGenerator'
import { advanceFloorAfterBoss } from '../src/domain/progression/advanceDepth'
import { CombatEngine, toFighter } from '../src/domain/combat/CombatEngine'
import { makeRunCard, resetCardIds } from '../src/domain/cards/Card'
import { convertSoulsToGold } from '../src/domain/progression/ShopPricing'
import { zeroResistances } from '../src/domain/combat/Elements'

describe('Skill tree content', () => {
  it('has core, element, and style nodes (~36)', () => {
    const nodes = skillTreeNodes()
    expect(nodes.length).toBe(36)
    expect(nodes.filter(n => n.family === 'core').length).toBe(6)
    expect(nodes.filter(n => n.family === 'element').length).toBe(15)
    expect(nodes.filter(n => n.family === 'style').length).toBe(15)
    expect(nodes.every(n => n.effects.length > 0)).toBe(true)
  })

  it('is a single vertical chain (col 0, linear requires)', () => {
    const nodes = [...skillTreeNodes()].sort((a, b) => a.row - b.row)
    expect(nodes.every(n => n.col === 0)).toBe(true)
    expect(nodes[0]!.requires).toEqual([])
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i]!.row).toBe(i)
      expect(nodes[i]!.requires).toEqual([nodes[i - 1]!.id])
    }
  })

  it('groups tiered nodes by level (all I, then all II, then all III)', () => {
    const nodes = [...skillTreeNodes()].sort((a, b) => a.row - b.row)
    const tiered = nodes.filter(n => /_(1|2|3)$/.test(n.id))
    const levels = tiered.map(n => n.id.match(/_(\d)$/)![1]!)
    expect(levels).toEqual([
      ...'1'.repeat(10).split(''),
      ...'2'.repeat(10).split(''),
      ...'3'.repeat(10).split(''),
    ])
  })
})

describe('Depth progression', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('grants one point per first clear up to 400', () => {
    expect(MetaProgression.grantDepthPoint(1)).toBe(true)
    expect(MetaProgression.grantDepthPoint(1)).toBe(false)
    expect(MetaProgression.getSkillPoints()).toBe(1)
    expect(MetaProgression.grantDepthPoint(400)).toBe(true)
    expect(MetaProgression.grantDepthPoint(401)).toBe(false)
    expect(MetaProgression.load().skillPointsEarned).toBe(2)
  })

  it('unlocks next depth and caps at 400', () => {
    MetaProgression.unlockFloorAfterClear(5)
    expect(MetaProgression.getCampaignFloor()).toBe(6)
    MetaProgression.unlockFloorAfterClear(400)
    expect(MetaProgression.getCampaignFloor()).toBe(400)
  })

  it('ends the run after boss without advancing floor', () => {
    const state = createNewRun(1)
    state.floor = 3
    const result = advanceFloorAfterBoss(state)
    expect(result).toBe('depth_complete')
    expect(state.floor).toBe(3)
    expect(MetaProgression.getCampaignFloor()).toBe(4)
  })

  it('returns victory on final depth clear', () => {
    const state = createNewRun(1)
    state.floor = MAX_CAMPAIGN_FLOOR
    expect(advanceFloorAfterBoss(state)).toBe('victory')
  })

  it('generates recipes for high floors', () => {
    const r50 = getDungeonRecipe(50)
    expect(r50.floor).toBe(50)
    expect(r50.gridW).toBeGreaterThanOrEqual(6)
    expect(getDungeonRecipe(1).floor).toBe(1)
  })
})

describe('Tree effects on run', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applies resist, elementDmg, maxHp, and passives from unlocked nodes', () => {
    const meta = MetaProgression.load()
    meta.skillPoints = 10
    meta.unlockedTreeNodes = ['core_vitality', 'core_heavy', 'el_fire_1', 'el_fire_2']
    MetaProgression.save(meta)

    const state = createNewRun(1)
    applyTreeEffectsToRun(MetaProgression.load(), state)

    expect(state.maxHp).toBe(34)
    expect(state.passives).toContain('heavy_hit')
    expect(state.heroResistances.fire).toBe(5)
    expect(state.elementDmgBonus.fire).toBe(1)
    expect(unlockedPassiveIds(MetaProgression.load())).toContain('heavy_hit')
  })

  it('applies element damage and poison amp in combat', () => {
    resetCardIds()
    const state = createNewRun(1)
    state.elementDmgBonus = { ...zeroResistances(), fire: 2 }
    state.poisonAmp = 1
    const hero = toFighter(30, 30, 0, 0)
    const enemy = toFighter(50, 50, 0, 0)
    // slash = 10 fire → 12 with +2 element bonus
    const dmg = CombatEngine.resolvePlayerTurn(
      [makeRunCard('slash')],
      state,
      hero,
      enemy,
    )
    expect(dmg.applied.damage).toBe(12)

    const foe = toFighter(50, 50, 0, 0)
    const poison = CombatEngine.resolvePlayerTurn(
      [makeRunCard('toxin')],
      state,
      toFighter(30, 30, 0, 0),
      foe,
    )
    expect(poison.applied.poison).toBeGreaterThanOrEqual(1)
    expect(foe.poison).toBe(poison.applied.poison)
  })

  it('converts souls to gold with merchant_friend and tree bonus', () => {
    const state = createNewRun(1)
    state.passives.push('merchant_friend')
    state.goldBonusPct = 10
    // 100 * 1.3 = 130 on victory
    expect(convertSoulsToGold(100, state, true)).toBe(130)
    // defeat 50% then bonus: floor(50 * 1.3) = 65
    expect(convertSoulsToGold(100, state, false)).toBe(65)
  })

  it('migrates orphan tree node ids and refunds points', () => {
    localStorage.setItem(
      'exogen_meta_v1',
      JSON.stringify({
        gold: 0,
        campaignFloor: 3,
        skillPoints: 0,
        skillPointsEarned: 3,
        depthCleared: [1, 2, 3],
        unlockedTreeNodes: ['root_lucky', 'node_heavy'],
        actionSlots: 3,
        tutorialDone: true,
        starterPacksOpened: true,
      }),
    )
    const meta = MetaProgression.load()
    expect(meta.unlockedTreeNodes).toEqual([])
    // earned 3 − 1 slot purchase = 2 spendable
    expect(meta.skillPoints).toBe(2)
    expect(meta.actionSlots).toBe(3)
  })

  it('requires prerequisites to unlock', () => {
    const meta = MetaProgression.load()
    meta.skillPoints = 5
    MetaProgression.save(meta)
    expect(canUnlock(MetaProgression.load(), 'core_heavy')).toBe(false)
    expect(canUnlock(MetaProgression.load(), 'core_vitality')).toBe(true)
    expect(MetaProgression.tryUnlockTreeNode('core_vitality')).toBe(true)
    expect(canUnlock(MetaProgression.load(), 'core_heavy')).toBe(true)
  })
})
