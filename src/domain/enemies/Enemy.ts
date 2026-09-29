import enemiesData from '../../data/enemies.json'
import type { MapNodeKind } from '../map/NodeTypes'
import type { RewardTier } from '../progression/RunState'
import {
  normalizeResistances,
  zeroResistances,
  type ElementResistances,
} from '../combat/Elements'
import { compensateEnemyHpForCardDie } from '../combat/CardEffectDie'

export type EnemySkill = 'split' | 'bone_toss' | 'steal' | 'phase' | 'slam' | 'echo'

interface EnemyTemplate {
  id: string
  name: string
  roles: string[]
  /** First campaign depth at which this template can appear. */
  minFloor?: number
  baseHp: number
  baseDef: number
  skill: EnemySkill
  resistances?: ElementResistances
}

const TEMPLATES = enemiesData as EnemyTemplate[]

/** Difficulty spikes: sector 100 (immune response) and 300 (critical Drift). */
export const THRESHOLD_VOID = 100
export const THRESHOLD_PHASE = 300

export function thresholdMult(floor: number): number {
  if (floor >= THRESHOLD_PHASE) return 2
  if (floor >= THRESHOLD_VOID) return 1.5
  return 1
}

const ENEMY_DECKS: Record<string, string[]> = {
  normal: [
    'strike', 'strike', 'bash', 'guard', 'toxin',
    'salve', 'venom', 'barrier', 'slash', 'mend',
  ],
  elite: [
    'bash', 'slash', 'venom', 'plague', 'barrier',
    'fortify', 'poison_stab', 'shield_bash', 'mend', 'phase_insulator',
  ],
  boss: [
    'crush', 'slash', 'plague', 'blight', 'aegis',
    'fortify', 'poison_stab', 'shield_bash', 'restore', 'void_weave',
  ],
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Enemy {
  templateId: string
  name: string
  maxHp: number
  hp: number
  defense: number
  skill: EnemySkill
  /** Card def ids for this enemy's combat deck. */
  deckDefs: string[]
  actionSlots: number
  turnCount = 0
  bonusDef = 0
  shield = 0
  poison = 0
  resistances: ElementResistances
  /** 'echo' skill: true once the copy has been summoned. */
  echoUsed = false

  constructor(
    templateId: string,
    name: string,
    hp: number,
    defense: number,
    skill: EnemySkill,
    deckDefs: string[],
    actionSlots: number,
    resistances: ElementResistances = zeroResistances(),
  ) {
    this.templateId = templateId
    this.name = name
    this.maxHp = hp
    this.hp = hp
    this.defense = defense
    this.skill = skill
    this.deckDefs = deckDefs
    this.actionSlots = actionSlots
    this.resistances = resistances
  }

  get totalDefense(): number {
    return this.defense + this.bonusDef
  }

  get alive(): boolean {
    return this.hp > 0
  }

  static forNode(
    kind: MapNodeKind,
    floor: number,
    seed: number,
    index = 0,
  ): Enemy {
    const rng = mulberry32(seed + floor * 131 + index * 97)
    let role = 'combat'
    if (kind === 'elite') role = 'elite'
    if (kind === 'boss') role = 'boss'

    const pool = TEMPLATES.filter(
      t => t.roles.includes(role) && (t.minFloor ?? 1) <= floor,
    )
    const tpl = pool[Math.floor(rng() * pool.length)] ?? TEMPLATES[0]!

    const scale = kind === 'boss' ? 1.55 : kind === 'elite' ? 1.15 : 1
    const mult = thresholdMult(floor)
    const baseHp = 28 + Math.floor(rng() * 10)
    // Sublinear depth growth so high floors stay hard, not endless.
    const depthHp = Math.floor(6 * Math.pow(Math.max(1, floor), 0.72))
    const depthDef = Math.floor(0.35 * Math.pow(Math.max(1, floor), 0.65))
    const generatedHp = Math.floor((baseHp + depthHp) * scale * mult + rng() * 3)
    let hp = compensateEnemyHpForCardDie(generatedHp)
    if (floor === 1 && kind !== 'boss') {
      // Tutorial depth: every non-boss wave dies in ~2 player rounds.
      hp = 32 + Math.floor(rng() * 9)
    }
    const def = Math.floor((tpl.baseDef + depthDef) * scale * mult)
    const deckKey = kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : 'normal'
    // Past the first threshold, elites and bosses play one extra card per turn.
    const actionSlots = (kind === 'boss' ? 3 : 2) + (floor >= THRESHOLD_VOID && kind !== 'combat' ? 1 : 0)
    const resistances = normalizeResistances(tpl.resistances)

    return new Enemy(
      tpl.id,
      tpl.name,
      hp,
      def,
      tpl.skill,
      [...ENEMY_DECKS[deckKey]!],
      actionSlots,
      resistances,
    )
  }

  static waveForNode(
    kind: MapNodeKind,
    floor: number,
    seed: number,
  ): Enemy[] {
    const rng = mulberry32(seed + floor * 131 + 17)
    let count = 2
    if (kind === 'boss') {
      count = 1
    } else if (floor === 1) {
      // Tutorial depth: 1–2 enemies per wave.
      count = 1 + (rng() < 0.5 ? 1 : 0)
    } else if (kind === 'elite') {
      count = 2 + (rng() < 0.5 ? 1 : 0)
    } else {
      count = 2 + (rng() < 0.55 ? 1 : 0)
    }
    return Array.from({ length: count }, (_, i) =>
      Enemy.forNode(kind, floor, seed, i),
    )
  }

  static tierForKind(kind: MapNodeKind): RewardTier {
    if (kind === 'boss') return 'boss'
    if (kind === 'elite') return 'elite'
    return 'normal'
  }
}
