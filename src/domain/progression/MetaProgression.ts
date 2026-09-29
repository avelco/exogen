import { STARTER_GEAR_IDS } from '../items/Equipment'
import { STARTER_RUNE_IDS } from '../items/Runes'
import type { GearSlot } from '../items/Item'
import { GEAR_SLOTS, RUNE_SLOT_COUNT } from '../items/Item'
import { gearDef } from '../items/Equipment'
import { runeDef } from '../items/Runes'
import {
  FORGE_REROLL_COST,
  affixDef,
  rollAffix,
} from '../items/Affixes'
import { setLocale, type Locale } from '../../i18n/I18n'
import {
  applyTreeEffectsToRun,
  canUnlock as skillTreeCanUnlock,
  skillTreeNode,
} from './SkillTree'
import { MAX_CAMPAIGN_FLOOR } from '../map/MazeGenerator'
import {
  cardDef,
  formatCardRef,
  parseCardRef,
  MIN_CARD_LEVEL,
} from '../cards/Card'
import {
  DEFAULT_ACTION_SLOTS,
  MAX_ACTION_SLOTS,
} from '../cards/Deck'
import { DECK_SIZE } from '../cards/Packs'

export interface GearForgeState {
  appliedAffixId: string | null
  pendingAffixId: string | null
}

export type GearLoadoutMap = Record<GearSlot, string | null>
export type RuneLoadoutTuple = [string | null, string | null, string | null]

export interface MetaInventory {
  gear: string[]
  runes: string[]
}

export interface MetaLoadout {
  gear: GearLoadoutMap
  runes: RuneLoadoutTuple
}

export interface MetaSave {
  /** Global game currency (oro). Persists between runs. */
  gold: number
  /** Next depth to start when descending (1–100). */
  campaignFloor: number
  inventory: MetaInventory
  loadout: MetaLoadout
  locale: Locale
  /** Spendable skill-tree points (first clear per floor). */
  skillPoints: number
  /** Total depth points ever earned. */
  skillPointsEarned: number
  /** Floors whose boss already granted a skill point. */
  depthCleared: number[]
  /** Purchased skill-tree node ids. */
  unlockedTreeNodes: string[]
  /** Fragments per gear slot (forge + future set upgrades). */
  fragments: Record<GearSlot, number>
  /** Forge affix state keyed by gear id. */
  gearForge: Record<string, GearForgeState>
  /** First-run onboarding finished (veterans without flag load as true). */
  tutorialDone: boolean
  /** First-account starter packs opened once. */
  starterPacksOpened: boolean
  /** Card refs → count. Ref is "defId" or "defId@level". */
  cardCollection: Record<string, number>
  /** Active deck between runs (card refs, length DECK_SIZE). */
  activeDeck: string[]
  /** Combat action slots (2–3). */
  actionSlots: number
}

const META_KEY = 'exogen_meta_v1'
const LEGACY_META_KEY = 'dnd_meta_v1' // pre-rename (dice-and-depths)

/** One-time key rename: adopts the legacy meta save under the new key. */
function readMetaRaw(): string | null {
  const raw = localStorage.getItem(META_KEY)
  if (raw !== null) return raw
  const legacy = localStorage.getItem(LEGACY_META_KEY)
  if (legacy === null) return null
  localStorage.setItem(META_KEY, legacy)
  localStorage.removeItem(LEGACY_META_KEY)
  return legacy
}

function emptyGearLoadout(): GearLoadoutMap {
  return { hat: null, cape: null, belt: null, ring: null, boots: null }
}

function emptyRuneLoadout(): RuneLoadoutTuple {
  return [null, null, null]
}

function starterInventory(): MetaInventory {
  return {
    gear: [...STARTER_GEAR_IDS],
    runes: [...STARTER_RUNE_IDS],
  }
}

function normalizeDepthCleared(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== 'number') continue
    const n = Math.floor(v)
    if (n >= 1 && n <= MAX_CAMPAIGN_FLOOR && !out.includes(n)) out.push(n)
  }
  return out.sort((a, b) => a - b)
}

function normalizeTreeNodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const id of raw) {
    if (typeof id === 'string' && skillTreeNode(id) && !out.includes(id)) {
      out.push(id)
    }
  }
  return out
}

/** If old tree ids were dropped, refund spendable points (keep slot purchases). */
function migrateOrphanTreeUnlocks(
  rawNodes: unknown,
  unlocked: string[],
  skillPointsEarned: number,
  actionSlots: number,
): { unlocked: string[]; skillPoints: number; migrated: boolean } {
  const rawList = Array.isArray(rawNodes)
    ? rawNodes.filter((id): id is string => typeof id === 'string')
    : []
  const hadOrphans = rawList.some(id => !skillTreeNode(id))
  if (!hadOrphans) {
    return { unlocked, skillPoints: -1, migrated: false }
  }
  const slotsBought = Math.max(0, actionSlots - DEFAULT_ACTION_SLOTS)
  const skillPoints = Math.max(0, skillPointsEarned - slotsBought)
  return { unlocked: [], skillPoints, migrated: true }
}

function emptyFragments(): Record<GearSlot, number> {
  return { hat: 0, cape: 0, belt: 0, ring: 0, boots: 0 }
}

function normalizeFragments(raw: unknown): Record<GearSlot, number> {
  const out = emptyFragments()
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Partial<Record<GearSlot, number>>
  for (const slot of GEAR_SLOTS) {
    const n = obj[slot]
    out[slot] = typeof n === 'number' && n > 0 ? Math.floor(n) : 0
  }
  return out
}

function emptyForgeState(): GearForgeState {
  return { appliedAffixId: null, pendingAffixId: null }
}

function normalizeGearForge(raw: unknown): Record<string, GearForgeState> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, GearForgeState> = {}
  for (const [gearId, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!gearDef(gearId) || !state || typeof state !== 'object') continue
    const s = state as Partial<GearForgeState>
    const applied =
      typeof s.appliedAffixId === 'string' && affixDef(s.appliedAffixId)
        ? s.appliedAffixId
        : null
    const pending =
      typeof s.pendingAffixId === 'string' && affixDef(s.pendingAffixId)
        ? s.pendingAffixId
        : null
    if (applied || pending) {
      out[gearId] = { appliedAffixId: applied, pendingAffixId: pending }
    }
  }
  return out
}

function addCollectionCount(
  out: Record<string, number>,
  ref: string,
  n = 1,
) {
  if (!parseCardRef(ref) || n <= 0) return
  out[ref] = (out[ref] ?? 0) + Math.floor(n)
}

/** Migrate legacy string[] or accept Record<ref, count>. */
function normalizeCardCollection(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === 'string') addCollectionCount(out, id, 1)
    }
    return out
  }
  if (raw && typeof raw === 'object') {
    for (const [ref, n] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n)) {
        addCollectionCount(out, ref, n)
      }
    }
  }
  return out
}

function collectionEntries(collection: Record<string, number>): string[] {
  const out: string[] = []
  for (const [ref, n] of Object.entries(collection)) {
    for (let i = 0; i < n; i++) out.push(ref)
  }
  return out
}

function normalizeActiveDeck(
  raw: unknown,
  collection: Record<string, number>,
): string[] {
  const ids: string[] = []
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === 'string' && parseCardRef(id)) ids.push(id)
    }
  }
  if (ids.length >= DECK_SIZE) return ids.slice(0, DECK_SIZE)
  const deck = [...ids]
  const used = new Map<string, number>()
  for (const id of deck) used.set(id, (used.get(id) ?? 0) + 1)
  for (const [ref, owned] of Object.entries(collection)) {
    while (deck.length < DECK_SIZE && (used.get(ref) ?? 0) < owned) {
      deck.push(ref)
      used.set(ref, (used.get(ref) ?? 0) + 1)
    }
  }
  while (deck.length < DECK_SIZE) deck.push(formatCardRef('strike', MIN_CARD_LEVEL))
  return deck.slice(0, DECK_SIZE)
}

function defaultMeta(): MetaSave {
  return {
    gold: 0,
    campaignFloor: 1,
    inventory: starterInventory(),
    loadout: {
      gear: emptyGearLoadout(),
      runes: emptyRuneLoadout(),
    },
    locale: 'es',
    skillPoints: 0,
    skillPointsEarned: 0,
    depthCleared: [],
    unlockedTreeNodes: [],
    fragments: emptyFragments(),
    gearForge: {},
    tutorialDone: false,
    starterPacksOpened: false,
    cardCollection: {},
    activeDeck: Array.from({ length: DECK_SIZE }, () => 'strike'),
    actionSlots: DEFAULT_ACTION_SLOTS,
  }
}

function normalizeCampaignFloor(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : 1
  return Math.min(MAX_CAMPAIGN_FLOOR, Math.max(1, n))
}

function normalizeLocale(raw: unknown): Locale {
  return raw === 'en' ? 'en' : 'es'
}

function normalizeGearLoadout(raw: unknown): GearLoadoutMap {
  const g = (raw ?? {}) as Partial<Record<GearSlot, string | null>>
  const out = emptyGearLoadout()
  for (const slot of GEAR_SLOTS) {
    const id = g[slot]
    out[slot] = typeof id === 'string' && gearDef(id) ? id : null
  }
  return out
}

function normalizeRuneLoadout(raw: unknown): RuneLoadoutTuple {
  const arr = Array.isArray(raw) ? raw : []
  const out: RuneLoadoutTuple = emptyRuneLoadout()
  for (let i = 0; i < RUNE_SLOT_COUNT; i++) {
    const id = arr[i]
    out[i] = typeof id === 'string' && runeDef(id) ? id : null
  }
  return out
}

function normalizeInventory(raw: unknown, loadout: MetaLoadout): MetaInventory {
  const inv = (raw ?? {}) as Partial<MetaInventory>
  let gear = Array.isArray(inv.gear)
    ? inv.gear.filter((id): id is string => typeof id === 'string' && !!gearDef(id))
    : [...STARTER_GEAR_IDS]
  let runes = Array.isArray(inv.runes)
    ? inv.runes.filter((id): id is string => typeof id === 'string' && !!runeDef(id))
    : [...STARTER_RUNE_IDS]

  // Ensure equipped items exist in bag lists for UI listing of unequipped only
  // Bag = unequipped; equipped live in loadout. Migrate old saves that put all in bag.
  // Starter: if empty after filter and no loadout, reseed.
  const hasAny =
    gear.length > 0 ||
    runes.length > 0 ||
    GEAR_SLOTS.some(s => loadout.gear[s]) ||
    loadout.runes.some(Boolean)

  if (!hasAny) {
    gear = [...STARTER_GEAR_IDS]
    runes = [...STARTER_RUNE_IDS]
  }

  return { gear, runes }
}

export class MetaProgression {
  static load(): MetaSave {
    const raw = readMetaRaw()
    if (!raw) {
      const meta = defaultMeta()
      setLocale(meta.locale)
      return meta
    }
    try {
      const data = JSON.parse(raw) as Partial<MetaSave>
      const loadout: MetaLoadout = {
        gear: normalizeGearLoadout(data.loadout?.gear),
        runes: normalizeRuneLoadout(data.loadout?.runes),
      }
      const collection = normalizeCardCollection(data.cardCollection)
      const slotsRaw =
        typeof data.actionSlots === 'number' ? Math.floor(data.actionSlots) : DEFAULT_ACTION_SLOTS
      const actionSlots = Math.min(
        MAX_ACTION_SLOTS,
        Math.max(DEFAULT_ACTION_SLOTS, slotsRaw),
      )
      const skillPointsEarned =
        typeof data.skillPointsEarned === 'number'
          ? Math.max(0, data.skillPointsEarned)
          : 0
      let unlockedTreeNodes = normalizeTreeNodes(data.unlockedTreeNodes)
      let skillPoints =
        typeof data.skillPoints === 'number' ? Math.max(0, data.skillPoints) : 0
      const migrate = migrateOrphanTreeUnlocks(
        data.unlockedTreeNodes,
        unlockedTreeNodes,
        skillPointsEarned,
        actionSlots,
      )
      if (migrate.migrated) {
        unlockedTreeNodes = migrate.unlocked
        skillPoints = migrate.skillPoints
      }
      const meta: MetaSave = {
        gold: typeof data.gold === 'number' ? data.gold : 0,
        campaignFloor: normalizeCampaignFloor(data.campaignFloor),
        inventory: normalizeInventory(data.inventory, loadout),
        loadout,
        locale: normalizeLocale(data.locale),
        skillPoints,
        skillPointsEarned,
        depthCleared: normalizeDepthCleared(data.depthCleared),
        unlockedTreeNodes,
        fragments: normalizeFragments(data.fragments),
        gearForge: normalizeGearForge(data.gearForge),
        // Existing saves without the field are treated as already onboarded.
        tutorialDone: data.tutorialDone === true || data.tutorialDone === undefined,
        // Existing accounts skip starter packs; only brand-new saves open them.
        starterPacksOpened:
          data.starterPacksOpened === true ||
          (data.starterPacksOpened === undefined && data.tutorialDone !== false),
        cardCollection: collection,
        activeDeck: normalizeActiveDeck(data.activeDeck, collection),
        actionSlots,
      }
      setLocale(meta.locale)
      if (migrate.migrated) MetaProgression.save(meta)
      return meta
    } catch {
      const meta = defaultMeta()
      setLocale(meta.locale)
      return meta
    }
  }

  static save(meta: MetaSave) {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
    localStorage.removeItem(LEGACY_META_KEY)
  }

  static applyStartBonuses(state: import('./RunState').RunState) {
    const meta = MetaProgression.load()
    applyTreeEffectsToRun(meta, state)
  }

  /** First-time boss clear of depth F grants 1 skill point. */
  static grantDepthPoint(clearedFloor: number): boolean {
    const f = Math.floor(clearedFloor)
    if (f < 1 || f > MAX_CAMPAIGN_FLOOR) return false
    const meta = MetaProgression.load()
    if (meta.depthCleared.includes(f)) return false
    meta.depthCleared.push(f)
    meta.depthCleared.sort((a, b) => a - b)
    meta.skillPoints += 1
    meta.skillPointsEarned += 1
    MetaProgression.save(meta)
    return true
  }

  static getSkillPoints(): number {
    return MetaProgression.load().skillPoints
  }

  static tryUnlockTreeNode(nodeId: string): boolean {
    const meta = MetaProgression.load()
    if (!skillTreeCanUnlock(meta, nodeId)) return false
    const node = skillTreeNode(nodeId)
    if (!node) return false
    meta.skillPoints -= node.cost
    meta.unlockedTreeNodes.push(nodeId)
    MetaProgression.save(meta)
    return true
  }

  static getCampaignFloor(): number {
    return MetaProgression.load().campaignFloor
  }

  static isTutorialDone(): boolean {
    return MetaProgression.load().tutorialDone
  }

  static completeTutorial() {
    const meta = MetaProgression.load()
    if (meta.tutorialDone) return
    meta.tutorialDone = true
    MetaProgression.save(meta)
  }

  static getGold(): number {
    return MetaProgression.load().gold
  }

  /** Unlock next depth after clearing `clearedFloor` (boss beaten). Caps at max. */
  static unlockFloorAfterClear(clearedFloor: number) {
    MetaProgression.grantDepthPoint(clearedFloor)
    const meta = MetaProgression.load()
    const next = Math.min(MAX_CAMPAIGN_FLOOR, clearedFloor + 1)
    meta.campaignFloor = Math.max(meta.campaignFloor, next)
    MetaProgression.save(meta)
  }

  static addGold(amount: number) {
    if (amount <= 0) return
    const meta = MetaProgression.load()
    meta.gold += amount
    MetaProgression.save(meta)
  }

  static getFragments(): Record<GearSlot, number> {
    return { ...MetaProgression.load().fragments }
  }

  static addFragments(slot: GearSlot, amount: number): boolean {
    if (!GEAR_SLOTS.includes(slot) || amount <= 0) return false
    const meta = MetaProgression.load()
    meta.fragments[slot] += Math.floor(amount)
    MetaProgression.save(meta)
    return true
  }

  static spendFragments(slot: GearSlot, amount: number): boolean {
    if (!GEAR_SLOTS.includes(slot) || amount <= 0) return false
    const meta = MetaProgression.load()
    if (meta.fragments[slot] < amount) return false
    meta.fragments[slot] -= Math.floor(amount)
    MetaProgression.save(meta)
    return true
  }

  static getForgeState(gearId: string): GearForgeState {
    const meta = MetaProgression.load()
    return meta.gearForge[gearId] ?? emptyForgeState()
  }

  static listOwnedGearIds(): string[] {
    return [...MetaProgression.ownedGearIds()]
  }

  /** Spend slot fragments and roll a new pending affix (does not change applied). */
  static rerollForge(gearId: string): GearForgeState | null {
    const def = gearDef(gearId)
    if (!def || !MetaProgression.ownedGearIds().has(gearId)) return null
    if (!MetaProgression.spendFragments(def.slot, FORGE_REROLL_COST)) return null
    const rolled = rollAffix()
    const meta = MetaProgression.load()
    const prev = meta.gearForge[gearId] ?? emptyForgeState()
    meta.gearForge[gearId] = {
      appliedAffixId: prev.appliedAffixId,
      pendingAffixId: rolled.id,
    }
    MetaProgression.save(meta)
    return meta.gearForge[gearId]
  }

  /** Move pending affix to applied. */
  static applyForge(gearId: string): boolean {
    const meta = MetaProgression.load()
    const state = meta.gearForge[gearId]
    if (!state?.pendingAffixId) return false
    meta.gearForge[gearId] = {
      appliedAffixId: state.pendingAffixId,
      pendingAffixId: null,
    }
    MetaProgression.save(meta)
    return true
  }

  static spendGold(amount: number): boolean {
    const meta = MetaProgression.load()
    if (meta.gold < amount) return false
    meta.gold -= amount
    MetaProgression.save(meta)
    return true
  }

  static setLocale(locale: Locale) {
    const meta = MetaProgression.load()
    meta.locale = locale === 'en' ? 'en' : 'es'
    setLocale(meta.locale)
    MetaProgression.save(meta)
  }

  /** Owned = bag + equipped loadout. */
  static ownedGearIds(): Set<string> {
    const meta = MetaProgression.load()
    const ids = new Set(meta.inventory.gear)
    for (const id of Object.values(meta.loadout.gear)) {
      if (id) ids.add(id)
    }
    return ids
  }

  static ownedRuneIds(): Set<string> {
    const meta = MetaProgression.load()
    const ids = new Set(meta.inventory.runes)
    for (const id of meta.loadout.runes) {
      if (id) ids.add(id)
    }
    return ids
  }

  static addGearToBag(itemId: string): boolean {
    if (!gearDef(itemId)) return false
    const meta = MetaProgression.load()
    if (MetaProgression.ownedGearIds().has(itemId)) return false
    meta.inventory.gear.push(itemId)
    MetaProgression.save(meta)
    return true
  }

  static addRuneToBag(itemId: string): boolean {
    if (!runeDef(itemId)) return false
    const meta = MetaProgression.load()
    if (MetaProgression.ownedRuneIds().has(itemId)) return false
    meta.inventory.runes.push(itemId)
    MetaProgression.save(meta)
    return true
  }

  static equipGear(slot: GearSlot, itemId: string): boolean {
    const meta = MetaProgression.load()
    const def = gearDef(itemId)
    if (!def || def.slot !== slot) return false
    const bagIdx = meta.inventory.gear.indexOf(itemId)
    if (bagIdx < 0) return false

    const prev = meta.loadout.gear[slot]
    meta.inventory.gear.splice(bagIdx, 1)
    if (prev) meta.inventory.gear.push(prev)
    meta.loadout.gear[slot] = itemId
    MetaProgression.save(meta)
    return true
  }

  static unequipGear(slot: GearSlot): boolean {
    const meta = MetaProgression.load()
    const prev = meta.loadout.gear[slot]
    if (!prev) return false
    meta.loadout.gear[slot] = null
    meta.inventory.gear.push(prev)
    MetaProgression.save(meta)
    return true
  }

  static equipRune(slotIndex: number, itemId: string): boolean {
    if (slotIndex < 0 || slotIndex >= RUNE_SLOT_COUNT) return false
    const meta = MetaProgression.load()
    if (!runeDef(itemId)) return false
    const bagIdx = meta.inventory.runes.indexOf(itemId)
    if (bagIdx < 0) return false

    const prev = meta.loadout.runes[slotIndex]
    meta.inventory.runes.splice(bagIdx, 1)
    if (prev) meta.inventory.runes.push(prev)
    meta.loadout.runes[slotIndex] = itemId
    MetaProgression.save(meta)
    return true
  }

  static unequipRune(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= RUNE_SLOT_COUNT) return false
    const meta = MetaProgression.load()
    const prev = meta.loadout.runes[slotIndex]
    if (!prev) return false
    meta.loadout.runes[slotIndex] = null
    meta.inventory.runes.push(prev)
    MetaProgression.save(meta)
    return true
  }

  static hasOpenedStarterPacks(): boolean {
    return MetaProgression.load().starterPacksOpened
  }

  /** Flat list of owned card refs (one entry per copy). */
  static getCardCollection(): string[] {
    return collectionEntries(MetaProgression.load().cardCollection)
  }

  static getCardCollectionMap(): Record<string, number> {
    return { ...MetaProgression.load().cardCollection }
  }

  static getActiveDeck(): string[] {
    return [...MetaProgression.load().activeDeck]
  }

  static getActionSlots(): number {
    return MetaProgression.load().actionSlots
  }

  /** Add pack/store cards as level-1 refs (or pass full refs). */
  static addCardsToCollection(refs: string[]) {
    const meta = MetaProgression.load()
    for (const raw of refs) {
      const parsed = parseCardRef(raw) ?? (cardDef(raw) ? { defId: raw, level: MIN_CARD_LEVEL } : null)
      if (!parsed) continue
      const ref = formatCardRef(parsed.defId, parsed.level)
      addCollectionCount(meta.cardCollection, ref, 1)
    }
    MetaProgression.save(meta)
  }

  static setCardCollection(collection: Record<string, number>) {
    const meta = MetaProgression.load()
    meta.cardCollection = normalizeCardCollection(collection)
    MetaProgression.save(meta)
  }

  static markStarterPacksOpened() {
    const meta = MetaProgression.load()
    meta.starterPacksOpened = true
    MetaProgression.save(meta)
  }

  static setActiveDeck(refs: string[]): boolean {
    const ids = refs.filter(id => !!parseCardRef(id))
    if (ids.length !== DECK_SIZE) return false
    const meta = MetaProgression.load()
    const need = new Map<string, number>()
    for (const id of ids) need.set(id, (need.get(id) ?? 0) + 1)
    for (const [id, n] of need) {
      if ((meta.cardCollection[id] ?? 0) < n) return false
    }
    meta.activeDeck = ids
    MetaProgression.save(meta)
    return true
  }

  /** Cost 1 skill point to unlock +1 action slot (max 3). */
  static tryUnlockActionSlot(): boolean {
    const meta = MetaProgression.load()
    if (meta.actionSlots >= MAX_ACTION_SLOTS) return false
    if (meta.skillPoints < 1) return false
    meta.skillPoints -= 1
    meta.actionSlots += 1
    MetaProgression.save(meta)
    return true
  }

  /** After opening starter packs: set collection + active deck. */
  static commitStarterPacks(defIds: string[], signatureIds: string[] = []) {
    const meta = MetaProgression.load()
    const collection: Record<string, number> = {}
    for (const id of defIds) {
      if (!cardDef(id)) continue
      const ref = formatCardRef(id, MIN_CARD_LEVEL)
      addCollectionCount(collection, ref, 1)
    }
    meta.cardCollection = collection
    const deck: string[] = []
    const used = new Map<string, number>()
    for (const id of signatureIds) {
      const ref = formatCardRef(id, MIN_CARD_LEVEL)
      if ((collection[ref] ?? 0) > (used.get(ref) ?? 0) && deck.length < DECK_SIZE) {
        deck.push(ref)
        used.set(ref, (used.get(ref) ?? 0) + 1)
      }
    }
    for (const [ref, owned] of Object.entries(collection)) {
      while (deck.length < DECK_SIZE && (used.get(ref) ?? 0) < owned) {
        deck.push(ref)
        used.set(ref, (used.get(ref) ?? 0) + 1)
      }
    }
    while (deck.length < DECK_SIZE) deck.push('strike')
    meta.activeDeck = deck.slice(0, DECK_SIZE)
    meta.starterPacksOpened = true
    MetaProgression.save(meta)
  }
}
