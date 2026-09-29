import Phaser from 'phaser'
import {
  cardDef,
  cardRarityDef,
  effectsOf,
  type RunCard,
} from '../domain/cards/Card'
import { ELEMENT_COLOR, type Element } from '../domain/combat/Elements'
import { tKey } from '../i18n/I18n'
import { addPixelText } from './pixelText'

const W = 44
const H = 64
const SELECTED_W = 68
const SELECTED_H = 80
const HOLD_DELAY_MS = 420

export type CardSpriteVariant = 'standard' | 'compact' | 'selected'

const EFFECT_STYLE: Record<string, { label: string; color: string }> = {
  damage: { label: 'ATK', color: '#ff7777' },
  poison: { label: 'CON', color: '#99dd55' },
  shield: { label: 'ESC', color: '#77aaff' },
  heal: { label: 'CUR', color: '#66ee99' },
}

function effectLabel(e: { type: string; value: number; element?: Element }): {
  text: string
  color: string
} {
  if (e.type === 'damage') {
    const el = e.element ?? 'neutral'
    const abbr = tKey(`element.abbr.${el}`, el[0]!.toUpperCase())
    return { text: `${abbr}${e.value}`, color: ELEMENT_COLOR[el] }
  }
  if (e.type === 'resist') {
    const el = e.element
    const abbr = el ? tKey(`element.abbr.${el}`, el[0]!.toUpperCase()) : '*'
    return { text: `R${abbr}${e.value}`, color: el ? ELEMENT_COLOR[el] : '#c9a7d8' }
  }
  const effect = EFFECT_STYLE[e.type] ?? {
    label: e.type.slice(0, 3).toUpperCase(),
    color: '#cccccc',
  }
  return { text: `${effect.label} ${e.value}`, color: effect.color }
}

function truncateName(name: string, max: number): string {
  const trimmed = name.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function wrapName(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return name
  let split = 1
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 1; i < words.length; i += 1) {
    const first = words.slice(0, i).join(' ').length
    const second = words.slice(i).join(' ').length
    const score = Math.max(first, second) * 10 + Math.abs(first - second)
    if (score < bestScore) {
      bestScore = score
      split = i
    }
  }
  return `${words.slice(0, split).join(' ')}\n${words.slice(split).join(' ')}`
}

export class CardSprite extends Phaser.GameObjects.Container {
  readonly runCard: RunCard
  private bg: Phaser.GameObjects.Graphics
  private zone: Phaser.GameObjects.Zone
  private selected = false
  private hovered = false
  private enabled = true
  private holdTimer: Phaser.Time.TimerEvent | null = null
  private holdTriggered = false
  private readonly variant: CardSpriteVariant
  private readonly cardWidth: number
  private readonly cardHeight: number
  onTap: (() => void) | null = null
  onHover: (() => void) | null = null
  onHold: (() => void) | null = null

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    card: RunCard,
    variant: CardSpriteVariant = 'standard',
  ) {
    super(scene, x, y)
    this.runCard = card
    this.variant = variant
    this.cardWidth = variant === 'selected' ? SELECTED_W : W
    this.cardHeight = variant === 'selected' ? SELECTED_H : H

    this.bg = scene.add.graphics()
    this.add(this.bg)
    this.redraw()

    if (variant === 'compact') this.addCompactContent(scene)
    else if (variant === 'selected') this.addSelectedContent(scene)
    else this.addStandardContent(scene)

    this.zone = scene.add
      .zone(0, 0, this.cardWidth + 4, this.cardHeight + 4)
      .setInteractive({ useHandCursor: true })
    this.add(this.zone)
    this.zone.on('pointerdown', () => {
      if (!this.enabled) return
      this.holdTriggered = false
      if (!this.onHold) {
        this.onTap?.()
        return
      }
      this.holdTimer = scene.time.delayedCall(HOLD_DELAY_MS, () => {
        this.holdTimer = null
        if (!this.enabled) return
        this.holdTriggered = true
        this.onHold?.()
      })
    })
    this.zone.on('pointerup', () => {
      if (!this.enabled) return
      this.holdTimer?.remove(false)
      this.holdTimer = null
      if (!this.holdTriggered && this.onHold) this.onTap?.()
    })
    this.zone.on('pointerover', () => {
      if (!this.enabled) return
      this.hovered = true
      this.redraw()
      this.onHover?.()
    })
    this.zone.on('pointerout', () => {
      this.holdTimer?.remove(false)
      this.holdTimer = null
      this.hovered = false
      this.redraw()
    })

    scene.add.existing(this)
  }

  setSelected(on: boolean) {
    this.selected = on
    this.redraw()
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.holdTimer?.remove(false)
    this.holdTimer = null
    this.setAlpha(on ? 1 : 0.45)
    if (on) this.zone.setInteractive({ useHandCursor: true })
    else this.zone.disableInteractive()
    this.redraw()
  }

  protected override preDestroy() {
    this.holdTimer?.remove(false)
    this.holdTimer = null
    super.preDestroy()
  }

  private addStandardContent(scene: Phaser.Scene) {
    const leveled = (this.runCard.level ?? 1) > 1
    const name = truncateName(tKey(`card.${this.runCard.defId}.name`, this.runCard.defId), 7)
    const title = addPixelText(scene, 0, -H / 2 + 3, name, {
      fontSize: '8px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0)
    this.add(title)

    if (leveled) {
      const lv = addPixelText(scene, 0, -H / 2 + 14, `N${this.runCard.level}`, {
        fontSize: '8px',
        color: '#ffdd66',
      }).setOrigin(0.5, 0)
      this.add(lv)
    }

    const effects = effectsOf(this.runCard)
    const effectTop = leveled ? 6 : 0
    effects.slice(0, 2).forEach((effect, index) => {
      const { text, color } = effectLabel(effect)
      const txt = addPixelText(scene, 0, effectTop + index * 12, text, {
        fontSize: '8px',
        color,
      }).setOrigin(0.5)
      this.add(txt)
    })
  }

  private addCompactContent(scene: Phaser.Scene) {
    const effects = effectsOf(this.runCard)
    const primary = effects.find(effect => effect.type === 'damage') ?? effects[0]
    if (!primary) return
    this.drawEffectGlyph(scene, 0, -7, primary, 1.3)
    const value = addPixelText(scene, 0, 17, String(primary.value), {
      fontSize: '8px',
      color: this.effectColor(primary),
    }).setOrigin(0.5)
    this.add(value)
    const secondary = effects.find(effect => effect !== primary)
    if (secondary) this.drawEffectGlyph(scene, 14, 19, secondary, 0.55)

    const rarity = cardDef(this.runCard.defId)?.rarity ?? 'common'
    const rarityDef = cardRarityDef(rarity)
    const symbol = scene.add.text(-17, -25, rarityDef.symbol, {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: rarityDef.accentColor ?? rarityDef.color,
    }).setOrigin(0.5)
    this.add(symbol)
  }

  private addSelectedContent(scene: Phaser.Scene) {
    const rarity = cardDef(this.runCard.defId)?.rarity ?? 'common'
    const rarityDef = cardRarityDef(rarity)
    const symbol = scene.add.text(-26, -34, rarityDef.symbol, {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: rarityDef.accentColor ?? rarityDef.color,
    }).setOrigin(0.5)
    this.add(symbol)
    const level = addPixelText(scene, 26, -34, `N${this.runCard.level}`, {
      fontSize: '8px',
      color: '#ffdd66',
    }).setOrigin(0.5)
    this.add(level)

    const name = addPixelText(
      scene,
      0,
      -22,
      wrapName(tKey(`card.${this.runCard.defId}.name`, this.runCard.defId).toUpperCase()),
      {
        fontSize: '8px',
        color: '#ffffff',
        align: 'center',
      },
    ).setOrigin(0.5)
    this.add(name)

    const effects = effectsOf(this.runCard)
    const primary = effects.find(effect => effect.type === 'damage') ?? effects[0]
    if (primary) this.drawEffectGlyph(scene, -24, 7, primary, 0.75)
    effects.slice(0, 2).forEach((effect, index) => {
      const txt = addPixelText(scene, -13, 6 + index * 13, this.selectedEffectText(effect), {
        fontSize: '8px',
        color: this.effectColor(effect),
      }).setOrigin(0, 0.5)
      this.add(txt)
    })
  }

  private drawEffectGlyph(
    scene: Phaser.Scene,
    x: number,
    y: number,
    effect: { type: string; value: number; element?: Element },
    scale: number,
  ) {
    const g = scene.add.graphics()
    const color = Phaser.Display.Color.HexStringToColor(this.effectColor(effect)).color
    const unit = Math.max(1, Math.round(scale * 3))
    g.fillStyle(color, 1)
    switch (effect.type) {
      case 'damage':
        g.fillTriangle(x, y - unit * 3, x - unit, y - unit, x + unit, y - unit)
        g.fillRect(x - Math.floor(unit / 2), y - unit, Math.max(1, unit), unit * 2)
        g.fillRect(x - unit * 2, y + unit, unit * 4, unit)
        g.fillRect(x - Math.floor(unit / 2), y + unit * 2, Math.max(1, unit), unit)
        break
      case 'shield':
        g.fillTriangle(x, y - unit * 3, x - unit * 3, y - unit, x, y + unit * 3)
        g.fillTriangle(x, y - unit * 3, x + unit * 3, y - unit, x, y + unit * 3)
        break
      case 'heal':
        g.fillRect(x - unit, y - unit * 3, unit * 2, unit * 6)
        g.fillRect(x - unit * 3, y - unit, unit * 6, unit * 2)
        break
      case 'poison':
        g.fillRect(x - unit, y - unit * 3, unit * 2, unit * 2)
        g.fillRect(x - unit * 2, y - unit, unit * 4, unit * 4)
        break
      case 'resist':
        g.fillRect(x - unit * 3, y - unit * 2, unit * 6, unit)
        g.fillRect(x - unit * 4, y - unit / 2, unit * 8, unit)
        g.fillRect(x - unit * 3, y + unit, unit * 6, unit)
        break
    }
    this.add(g)
  }

  private selectedEffectText(effect: { type: string; value: number; element?: Element }): string {
    switch (effect.type) {
      case 'damage':
        return `${effect.value} ${tKey(`element.${effect.element ?? 'neutral'}`, 'DAÑO')}`
      case 'shield':
        return `${effect.value} ESCUDO`
      case 'heal':
        return `${effect.value} CURA`
      case 'poison':
        return `${effect.value} CONTAM.`
      case 'resist':
        return `${effect.value}% RESIST.`
      default:
        return `${effect.value}`
    }
  }

  private effectColor(effect: { type: string; element?: Element }): string {
    if (effect.type === 'damage') return ELEMENT_COLOR[effect.element ?? 'neutral']
    if (effect.type === 'shield') return '#77aaff'
    if (effect.type === 'heal') return '#66ee99'
    if (effect.type === 'poison') return '#99dd55'
    if (effect.type === 'resist') return '#c9a7d8'
    return '#cccccc'
  }

  private redraw() {
    this.bg.clear()
    const rarity = cardDef(this.runCard.defId)?.rarity ?? 'common'
    const rarityDef = cardRarityDef(rarity)
    const color = Phaser.Display.Color.HexStringToColor(rarityDef.color).color
    const accent = Phaser.Display.Color.HexStringToColor(
      rarityDef.accentColor ?? rarityDef.color,
    ).color
    const compact = this.variant === 'compact'
    const queued = this.variant === 'selected'
    const fill = queued ? 0x1a2b43 : compact ? 0x18253a : this.selected ? 0x303044 : this.hovered ? 0x29293b : 0x20202f
    const border = queued ? accent : this.selected ? 0xffdd66 : this.hovered ? 0xbbbbcc : 0x666677
    const w = this.cardWidth
    const h = this.cardHeight
    this.bg.fillStyle(fill, 1)
    this.bg.fillRect(-w / 2, -h / 2, w, h)
    this.bg.lineStyle(queued || this.selected ? 2 : 1, border, 1)
    this.bg.strokeRect(-w / 2, -h / 2, w, h)
    this.bg.fillStyle(color, 1)
    if (compact) {
      this.bg.fillRect(-w / 2 + 2, -h / 2 + 2, 6, 6)
      this.bg.fillRect(-w / 2 + 3, h / 2 - 4, w - 6, 2)
    } else {
      this.bg.fillRect(-w / 2 + 3, h / 2 - 4, w - 6, 2)
    }
    if (rarityDef.accentColor || queued) {
      this.bg.lineStyle(1, accent, 1)
      this.bg.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4)
    }
    if (this.variant === 'standard' && (this.runCard.level ?? 1) > 1) {
      this.bg.fillStyle(0x3a3420, 1)
      this.bg.fillRoundedRect(-10, -h / 2 + 13, 20, 10, 2)
      this.bg.lineStyle(1, 0xffdd66, 0.85)
      this.bg.strokeRoundedRect(-10, -h / 2 + 13, 20, 10, 2)
    }
  }

  static get WIDTH() {
    return W
  }

  static get HEIGHT() {
    return H
  }

  static get COMPACT_WIDTH() {
    return W
  }

  static get COMPACT_HEIGHT() {
    return H
  }

  static get SELECTED_WIDTH() {
    return SELECTED_W
  }

  static get SELECTED_HEIGHT() {
    return SELECTED_H
  }
}

export function describeCard(defId: string): string {
  const def = cardDef(defId)
  if (!def) return defId
  return def.effects
    .map(e => {
      if (e.type === 'damage') {
        const el = e.element ?? 'neutral'
        return `${el} ${e.value}`
      }
      return `${e.type} ${e.value}`
    })
    .join(', ')
}
