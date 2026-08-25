import { describe, expect, it } from 'vitest'
import {
  CARD_RARITIES,
  allCardDefs,
  cardRarityDef,
} from '../src/domain/cards/Card'
import { openPack, PACK_SIZE } from '../src/domain/cards/Packs'

describe('card rarities', () => {
  it('defines all eight rarity tiers', () => {
    expect(CARD_RARITIES.map(rarity => rarity.id)).toEqual([
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
      'unique',
      'corrupt',
      'ascended',
    ])
    expect(cardRarityDef('corrupt').packWeight).toBe(0)
    expect(cardRarityDef('ascended').packWeight).toBe(0)
  })

  it('never opens fusion-only rarities from packs', () => {
    let call = 0
    const cards = openPack(() => {
      const value = call % 2 === 0 ? 0.999999 : 0
      call += 1
      return value
    })
    expect(cards).toHaveLength(PACK_SIZE)
    for (const id of cards) {
      const rarity = allCardDefs().find(d => d.id === id)?.rarity
      expect(rarity).not.toBe('corrupt')
      expect(rarity).not.toBe('ascended')
    }
  })
})
