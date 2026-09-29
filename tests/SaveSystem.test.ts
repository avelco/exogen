import { describe, expect, it } from 'vitest'
import { SaveSystem } from '../src/systems/SaveSystem'
import { makeState } from './helpers'
import { MetaProgression } from '../src/domain/progression/MetaProgression'
import { zeroResistances } from '../src/domain/combat/Elements'

describe('SaveSystem', () => {
  it('roundtrips quicksave with deckDefs and resistances', () => {
    const state = makeState()
    state.floor = 3
    state.hp = 12
    state.deckDefs = ['strike', 'bash', 'guard']
    state.actionSlots = 2
    state.heroResistances = { ...zeroResistances(), fire: 10 }
    SaveSystem.save('quicksave', state)

    const loaded = SaveSystem.load('quicksave')
    expect(loaded).not.toBeNull()
    expect(loaded!.floor).toBe(3)
    expect(loaded!.hp).toBe(12)
    expect(loaded!.deckDefs).toEqual(['strike', 'bash', 'guard'])
    expect(loaded!.heroResistances.fire).toBe(10)
  })

  it('abandonQuicksave clears the run', () => {
    const state = makeState()
    SaveSystem.save('quicksave', state)
    expect(SaveSystem.load('quicksave')).not.toBeNull()
    SaveSystem.abandonQuicksave()
    expect(SaveSystem.load('quicksave')).toBeNull()
  })

  it('migrates legacy v5/v6 saves to zero resistances', () => {
    const raw = {
      floor: 2,
      coins: 10,
      maxHp: 30,
      hp: 20,
      characterName: 'Guerrero',
      seed: 1,
      passives: [],
      dice: [{ id: 'd0', faces: [1, 2, 3, 4, 5, 6], abilityId: null }],
      rerollMax: { atk: 4 },
      version: 5,
      savedAt: Date.now(),
    }
    localStorage.setItem('exogen_save_legacy', JSON.stringify(raw))
    const loaded = SaveSystem.load('legacy')
    expect(loaded).not.toBeNull()
    expect(loaded!.deckDefs.length).toBeGreaterThan(0)
    expect(loaded!.heroResistances).toEqual(zeroResistances())
  })

  it('moves legacy dnd_save_ keys to the exogen_save_ prefix', () => {
    const state = makeState()
    state.floor = 4
    localStorage.setItem(
      'dnd_save_quicksave',
      JSON.stringify({
        floor: 4,
        coins: 5,
        maxHp: 30,
        hp: 22,
        seed: 7,
        passives: [],
        deckDefs: ['strike', 'bash'],
        savedAt: Date.now(),
        version: 9,
      }),
    )
    expect(SaveSystem.load('quicksave')!.floor).toBe(4)
    expect(localStorage.getItem('dnd_save_quicksave')).toBeNull()
    expect(localStorage.getItem('exogen_save_quicksave')).not.toBeNull()
    expect(SaveSystem.list().map(s => s.key)).toContain('quicksave')
    SaveSystem.save('slot_1', state)
    expect(localStorage.getItem('dnd_save_slot_1')).toBeNull()
    expect(SaveSystem.loadFromSlot(1)!.floor).toBe(4)
  })
})

describe('MetaProgression cards', () => {
  it('tracks starter packs flag', () => {
    localStorage.clear()
    const meta = MetaProgression.load()
    expect(meta.starterPacksOpened).toBe(false)
    MetaProgression.commitStarterPacks(
      Array.from({ length: 10 }, () => 'strike'),
    )
    expect(MetaProgression.hasOpenedStarterPacks()).toBe(true)
    expect(MetaProgression.getActiveDeck()).toHaveLength(10)
  })

  it('adopts the legacy dnd_meta_v1 key and renames it', () => {
    localStorage.setItem(
      'dnd_meta_v1',
      JSON.stringify({
        gold: 42,
        campaignFloor: 1,
        tutorialDone: true,
        starterPacksOpened: true,
        cardCollection: { strike: 2 },
        activeDeck: Array.from({ length: 10 }, () => 'strike'),
      }),
    )
    expect(MetaProgression.load().gold).toBe(42)
    expect(localStorage.getItem('dnd_meta_v1')).toBeNull()
    expect(localStorage.getItem('exogen_meta_v1')).not.toBeNull()
    expect(MetaProgression.load().gold).toBe(42)
  })
})
