import loreData from '../../data/lore.json'

export type LoreThread = 'archive' | 'nadir'

export const LORE_THREADS: readonly LoreThread[] = ['archive', 'nadir']

export interface LoreChapter {
  id: string
  thread: LoreThread
  /** Campaign floor that unlocks this chapter (MetaProgression.campaignFloor). */
  minFloor: number
}

const CHAPTERS = (loreData as LoreChapter[])
  .slice()
  .sort((a, b) => a.minFloor - b.minFloor)

export function loreChapters(thread: LoreThread): LoreChapter[] {
  return CHAPTERS.filter(c => c.thread === thread)
}

export function isLoreUnlocked(chapter: LoreChapter, campaignFloor: number): boolean {
  return campaignFloor >= chapter.minFloor
}

export function unlockedLoreCount(thread: LoreThread, campaignFloor: number): number {
  return loreChapters(thread).filter(c => isLoreUnlocked(c, campaignFloor)).length
}
