/** Create an editable deck copy, preferring an in-progress draft over saved data. */
export function createDeckDraft(
  savedDeck: readonly string[],
  draft?: readonly string[],
): string[] {
  return [...(draft ?? savedDeck)]
}

/** Return a new draft without the card at `index`. */
export function removeDeckCard(deck: readonly string[], index: number): string[] {
  const next = [...deck]
  if (index >= 0 && index < next.length) next.splice(index, 1)
  return next
}

/** Return a new draft with `cardRef`, or null when the deck is already full. */
export function addDeckCard(
  deck: readonly string[],
  cardRef: string,
  maxSize: number,
): string[] | null {
  if (deck.length >= maxSize) return null
  return [...deck, cardRef]
}
