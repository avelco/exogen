import { makeRunCard, makeRunCardFromRef, type RunCard } from './Card'

export const HAND_SIZE = 5
export const DEFAULT_DECK_SIZE = 10
export const MAX_ACTION_SLOTS = 3
export const DEFAULT_ACTION_SLOTS = 2

export interface CombatDeck {
  draw: RunCard[]
  hand: RunCard[]
  discard: RunCard[]
  slots: (RunCard | null)[]
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

export function createCombatDeck(
  defIds: string[],
  actionSlots = DEFAULT_ACTION_SLOTS,
  rng: () => number = Math.random,
): CombatDeck {
  const draw = defIds
    .map(id => makeRunCardFromRef(id) ?? makeRunCard(id))
    .filter((c): c is RunCard => c != null)
  shuffleInPlace(draw, rng)
  return {
    draw,
    hand: [],
    discard: [],
    slots: Array.from({ length: actionSlots }, () => null),
  }
}

export function reshuffleIfEmpty(deck: CombatDeck, rng: () => number = Math.random): void {
  if (deck.draw.length > 0) return
  if (deck.discard.length === 0) return
  deck.draw = deck.discard.splice(0, deck.discard.length)
  shuffleInPlace(deck.draw, rng)
}

export function drawCards(
  deck: CombatDeck,
  n: number,
  rng: () => number = Math.random,
): RunCard[] {
  const drawn: RunCard[] = []
  for (let i = 0; i < n; i++) {
    reshuffleIfEmpty(deck, rng)
    const c = deck.draw.pop()
    if (!c) break
    deck.hand.push(c)
    drawn.push(c)
  }
  return drawn
}

export function fillHand(
  deck: CombatDeck,
  size = HAND_SIZE,
  rng: () => number = Math.random,
): void {
  const need = Math.max(0, size - deck.hand.length)
  if (need > 0) drawCards(deck, need, rng)
}

/** Move a hand card into the first empty slot. Returns false if full / not in hand. */
export function playFromHand(deck: CombatDeck, cardId: string): boolean {
  const empty = deck.slots.findIndex(s => s == null)
  if (empty < 0) return false
  const idx = deck.hand.findIndex(c => c.id === cardId)
  if (idx < 0) return false
  const [card] = deck.hand.splice(idx, 1)
  deck.slots[empty] = card!
  return true
}

/** Return a slotted card to hand. */
export function unplaySlot(deck: CombatDeck, slotIndex: number): boolean {
  const card = deck.slots[slotIndex]
  if (!card) return false
  deck.slots[slotIndex] = null
  deck.hand.push(card)
  return true
}

export function slottedCards(deck: CombatDeck): RunCard[] {
  return deck.slots.filter((c): c is RunCard => c != null)
}

/** Discard played slots and draw that many cards back into hand. */
export function endTurnDraw(
  deck: CombatDeck,
  rng: () => number = Math.random,
): number {
  const played = slottedCards(deck)
  const n = played.length
  for (let i = 0; i < deck.slots.length; i++) {
    const c = deck.slots[i]
    if (c) {
      deck.discard.push(c)
      deck.slots[i] = null
    }
  }
  if (n > 0) drawCards(deck, n, rng)
  return n
}
