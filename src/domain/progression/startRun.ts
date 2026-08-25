import { createNewRun, syncRunStateDerived, type RunState } from './RunState'
import { MetaProgression } from './MetaProgression'
import { applyLoadoutToRun } from './Loadout'
import { loadDungeonMap } from '../map/DungeonMap'
import { SaveSystem } from '../../systems/SaveSystem'
import { THRESHOLD_PHASE, THRESHOLD_VOID } from '../enemies/Enemy'

/** Build a fresh campaign run (fixed 30 HP profile) and quicksave it. */
export function startCampaignRun(floor?: number): RunState {
  const state = createNewRun()
  applyLoadoutToRun(state)
  // Tree bonuses after loadout so startShield/maxHp stack instead of being overwritten.
  MetaProgression.applyStartBonuses(state)
  state.floor = floor ?? MetaProgression.getCampaignFloor()
  state.pendingThreshold =
    state.floor === THRESHOLD_VOID || state.floor === THRESHOLD_PHASE
      ? state.floor
      : null
  syncRunStateDerived(state)
  state.map = loadDungeonMap(state.floor, state.seed)
  const start = state.map.nodes.find(n => n.kind === 'start')
  state.currentNodeId = start?.id ?? null
  SaveSystem.save('quicksave', state)
  return state
}
