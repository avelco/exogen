import { gearDef } from '../items/Equipment'
import { runeDef } from '../items/Runes'
import { affixDef, type AffixDef } from '../items/Affixes'
import { GEAR_SLOTS, RUNE_SLOT_COUNT, type GearSlot } from '../items/Item'
import { MetaProgression, type MetaLoadout } from './MetaProgression'
import { syncRunStateDerived, type RunState } from './RunState'
import {
  ELEMENTS,
  ELEMENT_ABBR_KEY,
  zeroResistances,
  type Element,
  type ElementResistances,
} from '../combat/Elements'
import { tKey } from '../../i18n/I18n'

export type GearLoadout = Record<GearSlot, string | null>
export type RuneLoadout = [string | null, string | null, string | null]

export interface LoadoutMods {
  maxHp: number
  defFlat: number
  dmgFlat: number
  startGold: number
  poisonAmp: number
  resistances: ElementResistances
  elementDmgBonus: ElementResistances
}

export function emptyGearLoadout(): GearLoadout {
  return { hat: null, cape: null, belt: null, ring: null, boots: null }
}

export function emptyRuneLoadout(): RuneLoadout {
  return [null, null, null]
}

export function emptyLoadoutMods(): LoadoutMods {
  return {
    maxHp: 0,
    defFlat: 0,
    dmgFlat: 0,
    startGold: 0,
    poisonAmp: 0,
    resistances: zeroResistances(),
    elementDmgBonus: zeroResistances(),
  }
}

function addResist(
  target: ElementResistances,
  element: Element | 'all' | undefined,
  value: number,
) {
  if (!element || element === 'all') {
    for (const el of ELEMENTS) target[el] += value
    return
  }
  target[element] += value
}

function addFlatMods(
  target: LoadoutMods,
  mods: { stat: string; value: number }[],
) {
  for (const m of mods) {
    if (m.stat === 'maxHp') target.maxHp += m.value
    else if (m.stat === 'defFlat') target.defFlat += m.value
    else if (m.stat === 'dmgFlat') target.dmgFlat += m.value
    else if (m.stat === 'startGold') target.startGold += m.value
  }
}

function addAffix(target: LoadoutMods, affix: AffixDef) {
  switch (affix.stat) {
    case 'maxHp':
    case 'defFlat':
    case 'dmgFlat':
    case 'startGold':
      addFlatMods(target, [{ stat: affix.stat, value: affix.value }])
      break
    case 'poisonAmp':
      target.poisonAmp += affix.value
      break
    case 'resist':
      addResist(target.resistances, affix.element, affix.value)
      break
    case 'elementDmg':
      addResist(target.elementDmgBonus, affix.element, affix.value)
      break
  }
}

export function sumLoadoutMods(loadout: MetaLoadout): LoadoutMods {
  const total = emptyLoadoutMods()
  for (const slot of GEAR_SLOTS) {
    const id = loadout.gear[slot]
    if (!id) continue
    const def = gearDef(id)
    if (def) addFlatMods(total, def.mods)
    const forge = MetaProgression.getForgeState(id)
    if (forge.appliedAffixId) {
      const affix = affixDef(forge.appliedAffixId)
      if (affix) addAffix(total, affix)
    }
  }
  for (let i = 0; i < RUNE_SLOT_COUNT; i++) {
    const id = loadout.runes[i]
    if (!id) continue
    const def = runeDef(id)
    if (def) addFlatMods(total, def.mods)
  }
  return total
}

/** Bake current meta loadout into run (call after meta unlocks). */
export function applyLoadoutToRun(state: RunState) {
  const meta = MetaProgression.load()
  const mods = sumLoadoutMods(meta.loadout)

  state.maxHp += mods.maxHp
  state.hp = state.maxHp
  state.coins += mods.startGold
  state.bonusDefFlat = mods.defFlat
  state.bonusDmgFlat = mods.dmgFlat
  state.deckDefs = [...meta.activeDeck]
  state.actionSlots = meta.actionSlots
  state.heroShield = mods.defFlat
  state.poisonAmp += mods.poisonAmp
  for (const el of ELEMENTS) {
    state.heroResistances[el] += mods.resistances[el]
    state.elementDmgBonus[el] += mods.elementDmgBonus[el]
  }
  syncRunStateDerived(state)
}

/** Compact summary of elemental / poison bonuses for inventory HUD. */
export function formatLoadoutCombatExtras(mods: LoadoutMods): string {
  const parts: string[] = []
  if (mods.poisonAmp > 0) parts.push(`VEN+${mods.poisonAmp}`)
  const resistBits: string[] = []
  const edmgBits: string[] = []
  for (const el of ELEMENTS) {
    const abbr = tKey(ELEMENT_ABBR_KEY[el], el[0]!.toUpperCase())
    if (mods.resistances[el] > 0) {
      resistBits.push(`${abbr}${mods.resistances[el]}`)
    }
    if (mods.elementDmgBonus[el] > 0) {
      edmgBits.push(`${abbr}${mods.elementDmgBonus[el]}`)
    }
  }
  if (resistBits.length) parts.push(`R:${resistBits.join('/')}`)
  if (edmgBits.length) parts.push(`E:${edmgBits.join('/')}`)
  return parts.join('  ')
}
