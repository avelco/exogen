import { beforeEach, describe, expect, it } from 'vitest'
import {
  allCardDefs,
  cardDef,
  cardRarityDef,
  effectsOf,
  formatCardRef,
  makeRunCard,
  MAX_FUSION_LEVEL,
} from '../src/domain/cards/Card'
import {
  ascend,
  ascendCandidates,
  fuse,
  fuseCandidates,
  nextRarity,
} from '../src/domain/cards/Fusion'
import { PACK_WEIGHTS } from '../src/domain/cards/Packs'
import { MetaProgression } from '../src/domain/progression/MetaProgression'

describe('Fusion', () => {
  it('fuses two level-1 into one level-2', () => {
    const col = { strike: 3 }
    const result = fuse(col, 'strike')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result).toBe('strike@2')
    expect(result.collection.strike).toBe(1)
    expect(result.collection['strike@2']).toBe(1)
  })

  it('fuses up to max level then blocks further fuse', () => {
    let col: Record<string, number> = { 'strike@6': 2 }
    const r1 = fuse(col, 'strike@6', () => 0.99)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    col = r1.collection
    expect(col['strike@7']).toBe(1)
    expect(fuse(col, 'strike@7').ok).toBe(false)
  })

  it('ascends two copies into chosen next-rarity card at the same level', () => {
    const col = { 'strike@3': 2 }
    const result = ascend(col, 'strike@3', 'edge_overclock')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result).toBe('edge_overclock@3')
    expect(result.collection['strike@3']).toBeUndefined()
    expect(result.collection['edge_overclock@3']).toBe(1)
  })

  it('lists fuse and ascend candidates', () => {
    const col = { strike: 2, bash: 1, 'toxin@3': 2 }
    expect(fuseCandidates(col)).toContain('strike')
    expect(fuseCandidates(col)).not.toContain('bash')
    expect(ascendCandidates(col)).toContain('strike')
    expect(ascendCandidates(col)).toContain('toxin@3')
    expect(nextRarity('common')).toBe('uncommon')
  })

  it('blocks ascension above N3', () => {
    const col = { 'strike@4': 2 }
    expect(ascend(col, 'strike@4', 'edge_overclock').ok).toBe(false)
    expect(ascendCandidates(col)).not.toContain('strike@4')
    expect(ascendCandidates({ 'strike@3': 2 })).toContain('strike@3')
  })

  it('extends the ladder to corrupt and ascended', () => {
    expect(nextRarity('unique')).toBe('corrupt')
    expect(nextRarity('corrupt')).toBe('ascended')
    expect(nextRarity('ascended')).toBeNull()
  })

  it('glitches high-level fusions into a corrupt card', () => {
    const col = { 'strike@5': 2 }
    const result = fuse(col, 'strike@5', () => 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.glitched).toBe(true)
    const defId = result.result.split('@')[0]!
    expect(cardDef(defId)!.rarity).toBe('corrupt')
    expect(result.collection['strike@5']).toBeUndefined()
  })

  it('never glitches low-level fusions', () => {
    const col = { 'strike@4': 2 }
    const result = fuse(col, 'strike@4', () => 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.glitched).toBe(false)
    expect(result.result).toBe('strike@5')
  })

  it('crits unique ascensions into an ascended card at the same level', () => {
    const col = { 'continuum_scar@2': 2 }
    const result = ascend(col, 'continuum_scar@2', 'glitch_echo', () => 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.crit).toBe(true)
    const [defId, lv] = result.result.split('@')
    expect(cardDef(defId!)!.rarity).toBe('ascended')
    expect(lv).toBe('2')
  })

  it('does not crit non-unique ascensions', () => {
    const col = { strike: 2 }
    const result = ascend(col, 'strike', 'edge_overclock', () => 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.crit).toBe(false)
    expect(result.result).toBe('edge_overclock')
  })

  it('scales effects on leveled run cards', () => {
    const c = makeRunCard('strike', MAX_FUSION_LEVEL)
    expect(effectsOf(c)[0]!.value).toBe(16)
  })
})

describe('cardCollection migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy string[] collection to counts', () => {
    localStorage.setItem(
      'dnd_meta_v1',
      JSON.stringify({
        gold: 10,
        campaignFloor: 1,
        tutorialDone: true,
        starterPacksOpened: true,
        cardCollection: ['strike', 'strike', 'bash'],
        activeDeck: Array.from({ length: 10 }, () => 'strike'),
      }),
    )
    const map = MetaProgression.getCardCollectionMap()
    expect(map.strike).toBe(2)
    expect(map.bash).toBe(1)
  })
})

describe('pack weight balance', () => {
  it('endRun doubles uncommon+ vs standard', () => {
    for (const rarity of ['uncommon', 'rare', 'epic', 'legendary', 'unique'] as const) {
      expect(PACK_WEIGHTS.endRun[rarity]).toBeCloseTo(
        (PACK_WEIGHTS.standard[rarity] ?? 0) * 2,
      )
    }
  })

  it('per-card pack rate decreases with rarity', () => {
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique'] as const
    const counts = new Map<string, number>()
    for (const d of allCardDefs()) {
      if (cardRarityDef(d.rarity).packWeight <= 0) continue
      counts.set(d.rarity, (counts.get(d.rarity) ?? 0) + 1)
    }
    const total = order.reduce(
      (s, r) => s + (PACK_WEIGHTS.standard[r] ?? 0),
      0,
    )
    let prev = Infinity
    for (const r of order) {
      const w = PACK_WEIGHTS.standard[r] ?? 0
      const n = counts.get(r) ?? 1
      const perCard = w / total / n
      expect(perCard).toBeLessThan(prev)
      prev = perCard
    }
  })

  it('budget by rarity roughly follows ×1.5 steps', () => {
    const weights: Record<string, number> = {
      damage: 1,
      shield: 0.9,
      poison: 1.6,
      heal: 1.1,
      resist: 0.2,
    }
    const byRarity = new Map<string, number[]>()
    for (const d of allCardDefs()) {
      if (cardRarityDef(d.rarity).packWeight <= 0) continue
      const budget = d.effects.reduce(
        (s, e) => s + e.value * (weights[e.type] ?? 1),
        0,
      )
      const list = byRarity.get(d.rarity) ?? []
      list.push(budget)
      byRarity.set(d.rarity, list)
    }
    const avg = (r: string) => {
      const list = byRarity.get(r) ?? []
      return list.reduce((a, b) => a + b, 0) / list.length
    }
    expect(avg('uncommon')).toBeGreaterThan(avg('common'))
    expect(avg('rare')).toBeGreaterThan(avg('uncommon'))
    expect(avg('epic')).toBeGreaterThan(avg('rare'))
    expect(avg('legendary')).toBeGreaterThan(avg('epic'))
    expect(avg('unique')).toBeGreaterThan(avg('legendary'))
  })
})

describe('formatCardRef', () => {
  it('omits @1 and includes higher levels', () => {
    expect(formatCardRef('strike', 1)).toBe('strike')
    expect(formatCardRef('strike', 2)).toBe('strike@2')
  })
})
