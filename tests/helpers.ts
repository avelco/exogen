import { createNewRun } from '../src/domain/progression/RunState'

export function makeState(seed = 1) {
  const state = createNewRun(seed)
  state.maxHp = 30
  state.hp = 30
  return state
}
