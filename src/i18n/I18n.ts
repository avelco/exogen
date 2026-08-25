import { es, type TranslationKey } from './locales/es'
import { en } from './locales/en'
import { gearDef } from '../domain/items/Equipment'
import { runeDef } from '../domain/items/Runes'
import type { GearSlot, Rarity } from '../domain/items/Item'

export type { TranslationKey }
export type Locale = 'es' | 'en'

const TABLES: Record<Locale, Record<TranslationKey, string>> = { es, en }

let current: Locale = 'es'

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale) {
  current = locale === 'en' ? 'en' : 'es'
}

export function t(
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  let s = TABLES[current][key] ?? TABLES.es[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

export function tKey(key: string, fallback?: string): string {
  if (key in TABLES[current] || key in TABLES.es) {
    return t(key as TranslationKey)
  }
  return fallback ?? key
}

export function gearName(id: string): string {
  return tKey(`gear.${id}.name`, gearDef(id)?.name ?? id)
}

export function runeName(id: string): string {
  return tKey(`rune.${id}.name`, runeDef(id)?.name ?? id)
}

export function passiveName(id: string): string {
  return tKey(`passive.${id}.name`, id)
}

export function passiveDesc(id: string): string {
  return tKey(`passive.${id}.desc`, '')
}

export function treeNodeName(id: string): string {
  return tKey(`tree.node.${id}.name`, id)
}

export function treeNodeDesc(id: string): string {
  return tKey(`tree.node.${id}.desc`, '')
}

export function abilityName(id: string): string {
  return tKey(`ability.${id}.name`, id)
}

export function abilityDesc(id: string): string {
  return tKey(`ability.${id}.desc`, '')
}

export function enemyName(id: string): string {
  return tKey(`enemy.${id}`, id)
}

export function slotLabel(slot: GearSlot): string {
  return t(`slot.${slot}` as TranslationKey)
}

export function roleLabel(slot: GearSlot): string {
  return t(`role.${slot}` as TranslationKey)
}

export function rarityLabel(rarity: Rarity): string {
  return t(`rarity.${rarity}` as TranslationKey)
}
