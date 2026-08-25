import { describe, expect, it, beforeEach } from 'vitest'
import { MetaProgression } from '../src/domain/progression/MetaProgression'
import {
  applyLoadoutToRun,
  sumLoadoutMods,
} from '../src/domain/progression/Loadout'
import { createNewRun } from '../src/domain/progression/RunState'
import { RUNES } from '../src/domain/items/Runes'
import { formatMod } from '../src/domain/items/Item'

describe('Loadout card-era stats', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('runes and affixes have no dice leftover stats', () => {
    for (const rune of RUNES) {
      for (const m of rune.mods) {
        expect(['maxHp', 'defFlat', 'dmgFlat', 'startGold']).toContain(m.stat)
      }
    }
    expect(formatMod({ stat: 'defFlat', value: 2 })).toBe('+2 ESC')
  })

  it('applies HP / shield / damage / souls without dice remaps', () => {
    const meta = MetaProgression.load()
    meta.loadout.gear.hat = 'hat_cloth'
    meta.loadout.gear.cape = 'cape_rag'
    meta.loadout.gear.ring = 'ring_copper'
    meta.loadout.gear.boots = 'boots_worn'
    meta.loadout.runes = ['rune_die_I', 'rune_reroll_I', null]
    MetaProgression.save(meta)

    const mods = sumLoadoutMods(MetaProgression.load().loadout)
    expect(mods.maxHp).toBe(3 + 2) // hat + vital rune
    expect(mods.defFlat).toBe(1)
    expect(mods.dmgFlat).toBe(1 + 1) // ring + strike rune
    expect(mods.startGold).toBe(5)
    expect('diceAtk' in mods).toBe(false)

    const state = createNewRun(1)
    applyLoadoutToRun(state)
    expect(state.maxHp).toBe(30 + 5)
    expect(state.heroShield).toBe(1)
    expect(state.bonusDmgFlat).toBe(2)
    expect(state.coins).toBe(5)
  })
})
