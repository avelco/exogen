import { afterEach, describe, expect, it } from 'vitest'
import {
  isLoreUnlocked,
  LORE_THREADS,
  loreChapters,
  unlockedLoreCount,
} from '../src/domain/progression/Lore'
import { setLocale, tKey } from '../src/i18n/I18n'

const THRESHOLDS = [1, 25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400]

afterEach(() => setLocale('es'))

describe('Exogen lore archive', () => {
  it('exposes two complete threads at the authored sector thresholds', () => {
    expect(LORE_THREADS).toEqual(['archive', 'nadir'])

    for (const thread of LORE_THREADS) {
      const chapters = loreChapters(thread)
      expect(chapters).toHaveLength(12)
      expect(chapters.map(chapter => chapter.minFloor)).toEqual(THRESHOLDS)
    }
  })

  it('unlocks chapters from campaign sector progress', () => {
    const chapters = loreChapters('nadir')
    expect(isLoreUnlocked(chapters[0]!, 1)).toBe(true)
    expect(isLoreUnlocked(chapters[1]!, 24)).toBe(false)
    expect(unlockedLoreCount('nadir', 199)).toBe(7)
    expect(unlockedLoreCount('nadir', 400)).toBe(12)
  })

  it.each(['es', 'en'] as const)('has localized title and body for every chapter in %s', locale => {
    setLocale(locale)

    for (const thread of LORE_THREADS) {
      for (const chapter of loreChapters(thread)) {
        const base = `lore.${thread}.${chapter.id}`
        expect(tKey(`${base}.title`, '')).not.toBe('')
        expect(tKey(`${base}.body`, '')).not.toBe('')
      }
    }
  })
})
