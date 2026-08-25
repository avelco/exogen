import type { MapNodeKind } from '../map/NodeTypes'
import {
  normalizeResistances,
  zeroResistances,
  type ElementResistances,
} from '../combat/Elements'

export interface MapNodeSnapshot {
  id: number
  col: number
  kind: MapNodeKind
  x: number
  y: number
  cleared: boolean
}

export interface MapEdgeSnapshot {
  from: number
  to: number
}

export interface MapSnapshot {
  nodes: MapNodeSnapshot[]
  edges: MapEdgeSnapshot[]
}

export type RewardTier = 'normal' | 'elite' | 'boss'

export class RunState {
  floor = 1
  /** Run-only currency (loot). Lost when the run ends. */
  coins = 0
  maxHp = 30
  hp = 30
  seed = 0
  passives: string[] = []
  /** Copy of meta active deck for this run (defIds as RunCards built at start). */
  deckDefs: string[] = []
  /** Action slots for this run (from meta). */
  actionSlots = 2
  currentNodeId: number | null = null
  map: MapSnapshot | null = null
  secondWindUsedThisFloor = false
  pendingNodeKind: MapNodeKind | null = null
  pendingRewardTier: RewardTier = 'normal'
  /** Set when entering depth 100/300 so MapScene can show the threshold banner once. */
  pendingThreshold: number | null = null

  /** Flat DEF from meta gear — remapped as start shield bonus. */
  bonusDefFlat = 0
  /** Flat DMG from meta gear/runes. */
  bonusDmgFlat = 0

  /** Combat-persistent statuses (survive between enemies in a wave). */
  heroShield = 0
  heroPoison = 0

  /** Elemental resistances (%). Player starts at 0 for all. */
  heroResistances: ElementResistances = zeroResistances()

  /** Flat bonus damage per element from skill tree. */
  elementDmgBonus: ElementResistances = zeroResistances()
  /** Extra poison stacks applied when playing poison cards. */
  poisonAmp = 0
  /** Extra % gold when converting loot at end of run (skill tree). */
  goldBonusPct = 0
}

export function syncRunStateDerived(_state: RunState) {
  // No-op kept for call-site compatibility.
}

export function createNewRun(seed = Date.now()): RunState {
  const state = new RunState()
  state.seed = seed
  state.maxHp = 30
  state.hp = 30
  state.heroResistances = zeroResistances()
  state.elementDmgBonus = zeroResistances()
  state.poisonAmp = 0
  state.goldBonusPct = 0
  syncRunStateDerived(state)
  return state
}

export function ensureHeroResistances(state: RunState) {
  state.heroResistances = normalizeResistances(state.heroResistances)
}
