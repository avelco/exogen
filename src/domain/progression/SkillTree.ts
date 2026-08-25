import skillTreeData from '../../data/skillTree.json'
import { passiveDef } from './Passives'
import type { MetaSave } from './MetaProgression'
import type { Element } from '../combat/Elements'
import { ELEMENTS } from '../combat/Elements'
import type { RunState } from './RunState'

export type SkillTreeEffect =
  | { type: 'passive'; id: string }
  | { type: 'maxHp'; value: number }
  | { type: 'bonusDmgFlat'; value: number }
  | { type: 'startShield'; value: number }
  | { type: 'startCoins'; value: number }
  | { type: 'resist'; element: Element | 'all'; value: number }
  | { type: 'elementDmg'; element: Element; value: number }
  | { type: 'poisonAmp'; value: number }
  | { type: 'goldBonus'; value: number }

export type SkillTreeFamily = 'core' | 'element' | 'style'

export interface SkillTreeNodeDef {
  id: string
  cost: number
  requires: string[]
  col: number
  row: number
  family: SkillTreeFamily
  effects: SkillTreeEffect[]
}

const NODES: SkillTreeNodeDef[] = (
  skillTreeData as { nodes: SkillTreeNodeDef[] }
).nodes

export function skillTreeNodes(): SkillTreeNodeDef[] {
  return NODES
}

export function skillTreeNode(id: string): SkillTreeNodeDef | undefined {
  return NODES.find(n => n.id === id)
}

export function isNodeUnlocked(meta: MetaSave, nodeId: string): boolean {
  return meta.unlockedTreeNodes.includes(nodeId)
}

function effectsValid(effects: SkillTreeEffect[]): boolean {
  if (!Array.isArray(effects) || effects.length === 0) return false
  for (const e of effects) {
    if (!e || typeof e !== 'object' || !('type' in e)) return false
    switch (e.type) {
      case 'passive':
        if (typeof e.id !== 'string' || !passiveDef(e.id)) return false
        break
      case 'maxHp':
      case 'bonusDmgFlat':
      case 'startShield':
      case 'startCoins':
      case 'poisonAmp':
      case 'goldBonus':
        if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return false
        break
      case 'resist':
        if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return false
        if (e.element !== 'all' && !ELEMENTS.includes(e.element as Element)) {
          return false
        }
        break
      case 'elementDmg':
        if (typeof e.value !== 'number' || !Number.isFinite(e.value)) return false
        if (!ELEMENTS.includes(e.element as Element)) return false
        break
      default:
        return false
    }
  }
  return true
}

export function canUnlock(meta: MetaSave, nodeId: string): boolean {
  const node = skillTreeNode(nodeId)
  if (!node) return false
  if (!effectsValid(node.effects)) return false
  if (meta.unlockedTreeNodes.includes(nodeId)) return false
  if (meta.skillPoints < node.cost) return false
  return node.requires.every(req => meta.unlockedTreeNodes.includes(req))
}

/** Passive ids granted by purchased tree nodes (unique). */
export function unlockedPassiveIds(meta: MetaSave): string[] {
  const ids = setFromEffects(meta, e => (e.type === 'passive' ? e.id : null))
  return ids
}

function setFromEffects(
  meta: MetaSave,
  pick: (e: SkillTreeEffect) => string | null,
): string[] {
  const ids = new Set<string>()
  for (const nodeId of meta.unlockedTreeNodes) {
    const node = skillTreeNode(nodeId)
    if (!node) continue
    for (const e of node.effects) {
      const id = pick(e)
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

/** Apply all unlocked tree node effects onto a run state. */
export function applyTreeEffectsToRun(meta: MetaSave, state: RunState) {
  for (const nodeId of meta.unlockedTreeNodes) {
    const node = skillTreeNode(nodeId)
    if (!node) continue
    for (const e of node.effects) {
      applyOneEffect(state, e)
    }
  }
}

function applyOneEffect(state: RunState, e: SkillTreeEffect) {
  switch (e.type) {
    case 'passive':
      if (!state.passives.includes(e.id)) state.passives.push(e.id)
      break
    case 'maxHp':
      state.maxHp += e.value
      state.hp = Math.min(state.maxHp, state.hp + e.value)
      break
    case 'bonusDmgFlat':
      state.bonusDmgFlat += e.value
      break
    case 'startShield':
      state.heroShield += e.value
      break
    case 'startCoins':
      state.coins += e.value
      break
    case 'resist':
      if (e.element === 'all') {
        for (const el of ELEMENTS) {
          state.heroResistances[el] = Math.max(
            -100,
            Math.min(100, state.heroResistances[el] + e.value),
          )
        }
      } else {
        state.heroResistances[e.element] = Math.max(
          -100,
          Math.min(100, state.heroResistances[e.element] + e.value),
        )
      }
      break
    case 'elementDmg':
      state.elementDmgBonus[e.element] += e.value
      break
    case 'poisonAmp':
      state.poisonAmp += e.value
      break
    case 'goldBonus':
      state.goldBonusPct += e.value
      break
  }
}
