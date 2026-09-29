import {
  RunState,
  ensureHeroResistances,
  syncRunStateDerived,
  type MapSnapshot,
} from '../domain/progression/RunState'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { DEFAULT_ACTION_SLOTS } from '../domain/cards/Deck'
import { normalizeResistances, zeroResistances } from '../domain/combat/Elements'

const PREFIX = 'exogen_save_'
const LEGACY_PREFIX = 'dnd_save_' // pre-rename (dice-and-depths)

/** One-time key rename: moves legacy saves under the new prefix. Idempotent. */
function migrateLegacyKeys(): void {
  const legacy: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(LEGACY_PREFIX)) legacy.push(k)
  }
  for (const k of legacy) {
    const target = PREFIX + k.slice(LEGACY_PREFIX.length)
    if (localStorage.getItem(target) === null) {
      localStorage.setItem(target, localStorage.getItem(k)!)
    }
    localStorage.removeItem(k)
  }
}

export interface SaveSlot {
  key: string
  name: string
  timestamp: number
  floor: number
}

function serialize(state: RunState) {
  return {
    floor: state.floor,
    coins: state.coins,
    maxHp: state.maxHp,
    hp: state.hp,
    seed: state.seed,
    passives: state.passives,
    deckDefs: state.deckDefs,
    actionSlots: state.actionSlots,
    currentNodeId: state.currentNodeId,
    map: state.map,
    secondWindUsedThisFloor: state.secondWindUsedThisFloor,
    pendingNodeKind: state.pendingNodeKind,
    pendingRewardTier: state.pendingRewardTier,
    bonusDefFlat: state.bonusDefFlat,
    bonusDmgFlat: state.bonusDmgFlat,
    heroShield: state.heroShield,
    heroPoison: state.heroPoison,
    heroResistances: state.heroResistances,
    elementDmgBonus: state.elementDmgBonus,
    poisonAmp: state.poisonAmp,
    goldBonusPct: state.goldBonusPct,
    savedAt: Date.now(),
    version: 9,
  }
}

function deserialize(data: Record<string, unknown>): RunState {
  const state = new RunState()
  state.floor = (data.floor as number) ?? 1
  state.coins =
    typeof data.coins === 'number'
      ? data.coins
      : typeof data.gold === 'number'
        ? data.gold
        : 0
  state.maxHp = (data.maxHp as number) ?? 30
  state.hp = (data.hp as number) ?? state.maxHp
  state.seed = (data.seed as number) ?? 0
  state.passives = (data.passives as string[]) ?? []

  // v6+: deckDefs. Legacy v5 dice saves → fall back to meta active deck.
  if (Array.isArray(data.deckDefs) && data.deckDefs.length > 0) {
    state.deckDefs = data.deckDefs.filter((id): id is string => typeof id === 'string')
  } else {
    state.deckDefs = MetaProgression.getActiveDeck()
  }
  state.actionSlots =
    typeof data.actionSlots === 'number'
      ? Math.max(DEFAULT_ACTION_SLOTS, Math.floor(data.actionSlots))
      : MetaProgression.getActionSlots()

  state.currentNodeId = (data.currentNodeId as number | null) ?? null
  state.map = (data.map as MapSnapshot | null) ?? null
  state.secondWindUsedThisFloor = !!(data.secondWindUsedThisFloor)
  state.pendingNodeKind = (data.pendingNodeKind as RunState['pendingNodeKind']) ?? null
  state.pendingRewardTier = (data.pendingRewardTier as RunState['pendingRewardTier']) ?? 'normal'
  state.bonusDefFlat = (data.bonusDefFlat as number) ?? 0
  state.bonusDmgFlat = (data.bonusDmgFlat as number) ?? 0
  state.heroShield = (data.heroShield as number) ?? 0
  state.heroPoison = (data.heroPoison as number) ?? 0
  // v7: heroResistances; older saves → zeros
  state.heroResistances =
    data.heroResistances !== undefined
      ? normalizeResistances(data.heroResistances)
      : zeroResistances()
  // v8: tree combat bonuses
  state.elementDmgBonus =
    data.elementDmgBonus !== undefined
      ? normalizeResistances(data.elementDmgBonus)
      : zeroResistances()
  state.poisonAmp =
    typeof data.poisonAmp === 'number' && Number.isFinite(data.poisonAmp)
      ? Math.max(0, Math.floor(data.poisonAmp))
      : 0
  const goldBonusRaw =
    typeof data.goldBonusPct === 'number'
      ? data.goldBonusPct
      : typeof data.shopDiscountPct === 'number'
        ? data.shopDiscountPct
        : 0
  state.goldBonusPct =
    typeof goldBonusRaw === 'number' && Number.isFinite(goldBonusRaw)
      ? Math.max(0, Math.floor(goldBonusRaw))
      : 0
  ensureHeroResistances(state)
  syncRunStateDerived(state)
  return state
}

export class SaveSystem {
  static save(key: string, state: RunState): void {
    migrateLegacyKeys()
    localStorage.setItem(PREFIX + key, JSON.stringify(serialize(state)))
  }

  static load(key: string): RunState | null {
    migrateLegacyKeys()
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    try {
      return deserialize(JSON.parse(raw) as Record<string, unknown>)
    } catch {
      return null
    }
  }

  static list(): SaveSlot[] {
    migrateLegacyKeys()
    const slots: SaveSlot[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const data = JSON.parse(localStorage.getItem(k)!)
        slots.push({
          key: k.slice(PREFIX.length),
          name: `P${data.floor ?? 1}`,
          timestamp: data.savedAt ?? 0,
          floor: data.floor ?? 1,
        })
      } catch {
        // skip corrupted entries
      }
    }
    slots.sort((a, b) => b.timestamp - a.timestamp)
    return slots
  }

  static delete(key: string): void {
    migrateLegacyKeys()
    localStorage.removeItem(PREFIX + key)
  }

  static abandonQuicksave(): void {
    SaveSystem.delete('quicksave')
  }

  static saveToSlot(slot: number, state: RunState): void {
    SaveSystem.save(`slot_${slot}`, state)
  }

  static loadFromSlot(slot: number): RunState | null {
    return SaveSystem.load(`slot_${slot}`)
  }
}
