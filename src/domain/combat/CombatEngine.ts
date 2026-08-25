import {
  previewCards,
  previewCardsVs,
  resolveCardPlays,
  tickPoison,
  type CardPlayBonuses,
  type CombatActor,
  type TurnPreview,
} from '../cards/CardEffects'
import type { RunCard } from '../cards/Card'
import type { RunState } from '../progression/RunState'
import { hasPassive } from '../progression/Passives'
import { applyElementalDamage } from './DamagePipeline'
import {
  zeroResistances,
  type ElementResistances,
} from './Elements'
import type { CardEffectMultiplier } from './CardEffectDie'

export type { CombatActor, TurnPreview }

export interface CombatFighter extends CombatActor {
  bonusDmgFlat: number
}

export interface TurnResolveResult {
  preview: TurnPreview
  applied: TurnPreview
  targetDead: boolean
  selfDead: boolean
}

export function toFighter(
  hp: number,
  maxHp: number,
  shield: number,
  poison: number,
  bonusDmgFlat = 0,
  resistances: ElementResistances = zeroResistances(),
): CombatFighter {
  return { hp, maxHp, shield, poison, resistances, bonusDmgFlat }
}

function bonusesFromState(
  state: RunState,
  cardEffectMultiplier: CardEffectMultiplier,
): CardPlayBonuses {
  return {
    elementDmgBonus: state.elementDmgBonus,
    poisonAmp: state.poisonAmp,
    cardEffectMultiplier,
  }
}

export class CombatEngine {
  static preview(cards: RunCard[], bonuses?: CardPlayBonuses): TurnPreview {
    return previewCards(cards, bonuses)
  }

  static previewVs(
    cards: RunCard[],
    targetResistances: ElementResistances,
    bonuses?: CardPlayBonuses,
  ): TurnPreview {
    return previewCardsVs(cards, targetResistances, bonuses)
  }

  /**
   * Tick poison on actor at start of their turn.
   * Returns damage taken from poison.
   */
  static startTurnPoison(actor: CombatActor): number {
    return tickPoison(actor)
  }

  /**
   * Resolve slotted cards. Flat bonus damage from loadout is added once
   * after card damage if any damage card was played (neutral element).
   */
  static resolveTurn(
    cards: RunCard[],
    self: CombatFighter,
    target: CombatFighter,
    opts?: { heavyHit?: boolean; bonuses?: CardPlayBonuses },
  ): TurnResolveResult {
    const bonuses = opts?.bonuses
    const preview = previewCardsVs(cards, target.resistances, bonuses)
    const applied = resolveCardPlays(cards, self, target, bonuses)

    if (preview.damage > 0 && self.bonusDmgFlat > 0) {
      applied.damage += applyElementalDamage(
        target,
        self.bonusDmgFlat,
        'neutral',
      )
    }
    if (preview.damage > 0 && opts?.heavyHit) {
      applied.damage += applyElementalDamage(target, 2, 'neutral')
    }

    return {
      preview,
      applied,
      targetDead: target.hp <= 0,
      selfDead: self.hp <= 0,
    }
  }

  static resolvePlayerTurn(
    cards: RunCard[],
    state: RunState,
    hero: CombatFighter,
    enemy: CombatFighter,
    cardEffectMultiplier: CardEffectMultiplier = 1,
  ): TurnResolveResult {
    hero.bonusDmgFlat = state.bonusDmgFlat
    // Caller provides hero.resistances (permanent + combat-only, merged).
    return CombatEngine.resolveTurn(cards, hero, enemy, {
      heavyHit: hasPassive(state, 'heavy_hit'),
      bonuses: bonusesFromState(state, cardEffectMultiplier),
    })
  }
}
