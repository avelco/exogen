import { MAX_CAMPAIGN_FLOOR } from '../map/MazeGenerator'
import { MetaProgression } from './MetaProgression'
import { convertSoulsToGold } from './ShopPricing'
import type { RunState } from './RunState'

/** Convert remaining run loot to meta gold (victory rate). */
export function convertRunSoulsToGold(state: RunState, victory: boolean): number {
  const gold = convertSoulsToGold(state.coins, state, victory)
  if (gold > 0) MetaProgression.addGold(gold)
  state.coins = 0
  return gold
}

/** One depth per run: grant meta progress and end the run. */
export function advanceFloorAfterBoss(
  state: RunState,
): 'victory' | 'depth_complete' {
  const clearedFloor = state.floor
  MetaProgression.unlockFloorAfterClear(clearedFloor)
  state.secondWindUsedThisFloor = false
  if (clearedFloor >= MAX_CAMPAIGN_FLOOR) return 'victory'
  return 'depth_complete'
}
