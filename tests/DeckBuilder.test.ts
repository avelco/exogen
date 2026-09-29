import { describe, expect, it } from 'vitest'
import {
  addDeckCard,
  createDeckDraft,
  removeDeckCard,
} from '../src/domain/cards/DeckBuilder'

describe('deck builder draft', () => {
  const saved = Array.from({ length: 10 }, (_, i) => `card-${i}`)

  it('keeps a removed card when the editor is recreated', () => {
    const edited = removeDeckCard(createDeckDraft(saved), 3)

    expect(createDeckDraft(saved, edited)).toEqual([
      'card-0',
      'card-1',
      'card-2',
      'card-4',
      'card-5',
      'card-6',
      'card-7',
      'card-8',
      'card-9',
    ])
  })

  it('keeps an added card when the editor is recreated', () => {
    const shortened = removeDeckCard(createDeckDraft(saved), 0)
    const edited = addDeckCard(shortened, 'replacement', 10)

    expect(createDeckDraft(saved, edited)).toEqual([
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'card-5',
      'card-6',
      'card-7',
      'card-8',
      'card-9',
      'replacement',
    ])
  })

  it('does not add beyond the deck-size limit', () => {
    expect(addDeckCard(saved, 'extra', 10)).toBeNull()
  })
})
