import Phaser from 'phaser'
import { RunState, createNewRun, syncRunStateDerived } from './domain/progression/RunState'
import { MetaProgression } from './domain/progression/MetaProgression'
import { loadDungeonMap } from './domain/map/DungeonMap'
import { addPixelText } from './ui/pixelText'
import { applyLoadoutToRun } from './domain/progression/Loadout'
import { t } from './i18n/I18n'

export function renderDebugHeader(scene: Phaser.Scene, rs: RunState) {
  syncRunStateDerived(rs)
  const gold = MetaProgression.getGold()
  const header = `S${rs.floor} | ${t('player.name')} | HP ${rs.hp}/${rs.maxHp} | ${rs.coins}${t('ui.lootAbbr')} | ${gold}a | R${rs.actionSlots}`
  addPixelText(scene, 4, 2, header, {
    fontSize: '8px',
    color: '#88ff88',
  }).setDepth(100).setScrollFactor(0)
}

export function createDebugState(floor = 5): RunState {
  const state = createNewRun(42)
  state.floor = floor
  state.coins = 100 + floor * 30
  applyLoadoutToRun(state)
  MetaProgression.applyStartBonuses(state)
  state.maxHp = Math.max(state.maxHp, 30 + Math.floor(floor * 3))
  state.hp = state.maxHp
  state.map = loadDungeonMap(state.floor, state.seed)
  state.currentNodeId = state.map.nodes.find(n => n.kind === 'start')?.id ?? null
  state.pendingNodeKind = 'combat'
  syncRunStateDerived(state)
  return state
}

export interface SceneData {
  runState?: RunState
  postCombat?: boolean
  soulsGained?: number
}

export function getRunState(scene: Phaser.Scene): RunState | undefined {
  return (scene.scene.settings.data as SceneData | undefined)?.runState
}

export function getSceneData(scene: Phaser.Scene): SceneData {
  return (scene.scene.settings.data as SceneData | undefined) ?? {}
}

export function applyPassiveOnKill(state: RunState) {
  if (state.passives.includes('vampiric')) {
    state.hp = Math.min(state.maxHp, state.hp + 1)
  }
}

export function trySecondWind(state: RunState) {
  if (state.passives.includes('second_wind') && !state.secondWindUsedThisFloor) {
    if (state.hp <= state.maxHp * 0.5) {
      state.secondWindUsedThisFloor = true
      state.hp = Math.min(state.maxHp, state.hp + 5)
    }
  }
}

export { convertSoulsToGold, shopDiscount } from './domain/progression/ShopPricing'
