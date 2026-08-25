import type { RunState } from './RunState'

/**
 * Convert run loot (coins) to meta gold.
 * Victory: 1:1. Defeat: 50%.
 * Bonus from goldBonusPct tree node and merchant_friend (+20%).
 */
export function convertSoulsToGold(
  coins: number,
  state: RunState,
  victory: boolean,
): number {
  const base = Math.max(0, Math.floor(coins))
  const afterOutcome = victory ? base : Math.floor(base * 0.5)
  let mult = 1
  if (state.passives.includes('merchant_friend')) mult += 0.2
  const pct = Math.max(0, Math.min(90, state.goldBonusPct ?? 0))
  if (pct > 0) mult += pct / 100
  return Math.floor(afterOutcome * mult)
}

/** @deprecated Use convertSoulsToGold — kept for debug re-exports during migration. */
export function shopDiscount(_state: RunState): number {
  return 1
}
