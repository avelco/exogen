import { effectsOf, type RunCard } from '../cards/Card'
import {
  effectiveDamageOf,
  type CombatActor,
} from '../cards/CardEffects'

/**
 * Pick up to `slots` cards from hand.
 * Priority: lethal damage > damage > poison > shield > heal.
 * Damage scoring uses target resistances.
 */
export class EnemyAI {
  static choosePlays(
    hand: RunCard[],
    slots: number,
    self: CombatActor,
    target: CombatActor,
  ): RunCard[] {
    if (slots <= 0 || hand.length === 0) return []

    const remaining = [...hand]
    const chosen: RunCard[] = []

    while (chosen.length < slots && remaining.length > 0) {
      const dmgSoFar = effectiveDamageOf(chosen, target.resistances)
      const lethal = remaining.find(c => {
        const d = effectiveDamageOf([c], target.resistances)
        return dmgSoFar + d >= target.hp + target.shield
      })
      if (lethal) {
        chosen.push(lethal)
        remaining.splice(remaining.indexOf(lethal), 1)
        continue
      }

      remaining.sort(
        (a, b) =>
          scoreCard(b, self, target) - scoreCard(a, self, target),
      )
      const next = remaining.shift()!
      chosen.push(next)
    }

    return chosen
  }
}

function scoreCard(
  card: RunCard,
  self: CombatActor,
  target: CombatActor,
): number {
  let score = 0
  for (const e of effectsOf(card)) {
    switch (e.type) {
      case 'damage':
        score +=
          effectiveDamageOf([card], target.resistances) * 10
        break
      case 'poison':
        score += e.value * 8
        break
      case 'shield':
        score += e.value * (self.shield < 4 ? 6 : 3)
        break
      case 'heal':
        score += e.value * (self.hp < self.maxHp * 0.5 ? 7 : 2)
        break
      case 'resist': {
        // Combat-only resist: worth ~value% of the damage we expect to take.
        const expected = Math.max(4, effectiveDamageOf([card], target.resistances) + 6)
        score += Math.round(e.value * 0.01 * expected) * 5
        break
      }
    }
  }
  return score
}
