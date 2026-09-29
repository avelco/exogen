import { describe, expect, it, beforeEach } from 'vitest'
import {
  allAffixes,
  affixDef,
  formatAffix,
  isValidAffix,
} from '../src/domain/items/Affixes'
import { MetaProgression } from '../src/domain/progression/MetaProgression'
import { applyLoadoutToRun, sumLoadoutMods } from '../src/domain/progression/Loadout'
import { createNewRun } from '../src/domain/progression/RunState'

describe('Forge affix pool', () => {
  it('has expected counts per tier and no dice leftovers', () => {
    const all = allAffixes()
    expect(all.filter(a => a.tier === 'common')).toHaveLength(4)
    expect(all.filter(a => a.tier === 'blue')).toHaveLength(9)
    expect(all.filter(a => a.tier === 'purple')).toHaveLength(9)
    expect(all.filter(a => a.tier === 'gold')).toHaveLength(6)
    expect(all.every(isValidAffix)).toBe(true)
    expect(all.some(a => (a.stat as string) === 'diceAtk')).toBe(false)
    expect(all.some(a => (a.stat as string) === 'rerollAtk')).toBe(false)
    expect(affixDef('dice_legend')).toBeUndefined()
    expect(affixDef('reroll_unique')).toBeUndefined()
    expect(affixDef('poison_unique')).toBeDefined()
    expect(affixDef('resist_all_legend')).toBeDefined()
  })

  it('formats resist, element damage, and poison', () => {
    expect(formatAffix(affixDef('resist_fire_m')!)).toBe('+3% R.T')
    expect(formatAffix(affixDef('edmg_earth_u')!)).toBe('+1 DMG G')
    expect(formatAffix(affixDef('poison_unique')!)).toBe('+1 CONTAM.')
    expect(formatAffix(affixDef('resist_all_legend')!)).toBe('+5% R.*')
    expect(formatAffix(affixDef('edmg_all_legend')!)).toBe('+1 DMG *')
    expect(formatAffix(affixDef('hp_s')!)).toBe('+2 HP')
  })
})

describe('Forge affixes on loadout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('applies resist and poisonAmp from forged gear', () => {
    const meta = MetaProgression.load()
    meta.loadout.gear.hat = 'hat_cloth'
    meta.loadout.gear.cape = 'cape_rag'
    meta.gearForge = {
      hat_cloth: { appliedAffixId: 'resist_fire_m', pendingAffixId: null },
      cape_rag: { appliedAffixId: 'poison_unique', pendingAffixId: null },
    }
    MetaProgression.save(meta)

    const mods = sumLoadoutMods(MetaProgression.load().loadout)
    expect(mods.resistances.fire).toBe(3)
    expect(mods.poisonAmp).toBe(1)

    const state = createNewRun(1)
    applyLoadoutToRun(state)
    expect(state.heroResistances.fire).toBe(3)
    expect(state.poisonAmp).toBe(1)
  })

  it('applies all-element damage from gold affix', () => {
    const meta = MetaProgression.load()
    meta.loadout.gear.ring = 'ring_copper'
    meta.gearForge = {
      ring_copper: { appliedAffixId: 'edmg_all_legend', pendingAffixId: null },
    }
    MetaProgression.save(meta)

    const state = createNewRun(1)
    applyLoadoutToRun(state)
    expect(state.elementDmgBonus.fire).toBe(1)
    expect(state.elementDmgBonus.water).toBe(1)
    expect(state.bonusDmgFlat).toBe(1) // ring base
  })
})
