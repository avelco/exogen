import Phaser from 'phaser'
import { pixelTextStyle, applyPixelTextSharpness } from './pixelText'
import { combatTextStyle, applyCombatTextSharpness } from './combatText'
import {
  ELEMENTS,
  ELEMENT_COLOR,
  type Element,
  type ElementResistances,
} from '../domain/combat/Elements'
import { tKey } from '../i18n/I18n'

export type UiFont = 'pixel' | 'combat'

/** Vertical space used below the HP bar when resists are shown. */
export const RESIST_ROW_H = 14

function labelStyle(font: UiFont, size: string, color: string) {
  return font === 'combat'
    ? combatTextStyle({ fontSize: size, color })
    : pixelTextStyle({ fontSize: size, color })
}

function sharpen(txt: Phaser.GameObjects.Text, font: UiFont) {
  if (font === 'combat') applyCombatTextSharpness(txt)
  else applyPixelTextSharpness(txt)
}

export class HealthBar extends Phaser.GameObjects.Container {
  private bgGfx: Phaser.GameObjects.Graphics
  private fillGfx: Phaser.GameObjects.Graphics
  private resistGfx: Phaser.GameObjects.Graphics
  private hpText: Phaser.GameObjects.Text
  private nameText: Phaser.GameObjects.Text
  private shieldText: Phaser.GameObjects.Text
  private resistLabels: Phaser.GameObjects.Text[] = []
  private resistZones: Phaser.GameObjects.Zone[] = []
  private resistHoldHandler: ((el: Element) => void) | null = null
  private resistHoldTimer: Phaser.Time.TimerEvent | null = null

  private _maxValue: number
  private _value: number
  private barW: number
  private barH: number
  private color: number
  private uiFont: UiFont
  private resistances: ElementResistances | null = null

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    maxValue: number,
    color: number,
    label: string,
    uiFont: UiFont = 'pixel',
  ) {
    super(scene, x, y)

    this.barW = w
    this.barH = h
    this._maxValue = maxValue
    this._value = maxValue
    this.color = color
    this.uiFont = uiFont

    this.bgGfx = scene.add.graphics()
    this.add(this.bgGfx)

    this.fillGfx = scene.add.graphics()
    this.add(this.fillGfx)

    this.resistGfx = scene.add.graphics()
    this.add(this.resistGfx)

    this.nameText = scene.add.text(
      0,
      -12,
      label,
      labelStyle(uiFont, '8px', '#eeeeee'),
    )
    this.nameText.setOrigin(0, 0.5)
    sharpen(this.nameText, uiFont)
    this.add(this.nameText)

    this.shieldText = scene.add.text(
      w,
      -12,
      '',
      labelStyle(uiFont, '8px', '#88ccff'),
    )
    this.shieldText.setOrigin(1, 0.5)
    sharpen(this.shieldText, uiFont)
    this.add(this.shieldText)

    this.hpText = scene.add.text(
      w / 2,
      h / 2,
      '',
      labelStyle(uiFont, '8px', '#ffffff'),
    )
    this.hpText.setOrigin(0.5)
    sharpen(this.hpText, uiFont)
    this.add(this.hpText)

    this.redraw()
    scene.add.existing(this)
  }

  setValue(value: number) {
    this._value = Phaser.Math.Clamp(value, 0, this._maxValue)
    this.redraw()
  }

  setMax(max: number) {
    this._maxValue = max
    this._value = Math.min(this._value, max)
    this.redraw()
  }

  /** Shield / ESC shown on the name row (right). */
  setDefense(def: number) {
    this.shieldText.setText(def > 0 ? `ESC ${def}` : '')
  }

  setResistances(res: ElementResistances) {
    this.resistances = res
    this.layoutResistRow()
  }

  /** Long-press a resist box to inspect its composition. */
  setResistHoldHandler(handler: (el: Element) => void) {
    this.resistHoldHandler = handler
    this.layoutResistRow()
  }

  private cancelResistHold() {
    this.resistHoldTimer?.remove(false)
    this.resistHoldTimer = null
  }

  setLabel(label: string) {
    this.nameText.setText(label)
  }

  get value(): number {
    return this._value
  }

  private layoutResistRow() {
    for (const txt of this.resistLabels) txt.destroy()
    this.resistLabels = []
    for (const zone of this.resistZones) zone.destroy()
    this.resistZones = []
    this.cancelResistHold()
    this.resistGfx.clear()
    if (!this.resistances) return

    const y = this.barH + 3
    const gap = 2
    const boxW = Math.floor((this.barW - gap * (ELEMENTS.length - 1)) / ELEMENTS.length)
    const boxH = 11

    ELEMENTS.forEach((el, i) => {
      const x = i * (boxW + gap)
      const pct = this.resistances![el]
      const color = Phaser.Display.Color.HexStringToColor(ELEMENT_COLOR[el]).color
      this.resistGfx.fillStyle(0x12121c, 0.95)
      this.resistGfx.fillRoundedRect(x, y, boxW, boxH, 2)
      this.resistGfx.lineStyle(1, color, 1)
      this.resistGfx.strokeRoundedRect(x, y, boxW, boxH, 2)

      const abbr = tKey(`element.abbr.${el}`, el[0]!.toUpperCase())
      const label = this.scene.add.text(
        x + boxW / 2,
        y + boxH / 2,
        `${abbr}${pct}`,
        labelStyle(this.uiFont, '8px', ELEMENT_COLOR[el]),
      )
      label.setOrigin(0.5)
      sharpen(label, this.uiFont)
      this.add(label)
      this.resistLabels.push(label)

      if (this.resistHoldHandler) {
        const zone = this.scene.add
          .zone(x + boxW / 2, y + boxH / 2, boxW + gap, boxH + 4)
          .setInteractive({ useHandCursor: true })
        zone.on('pointerdown', () => {
          this.cancelResistHold()
          this.resistHoldTimer = this.scene.time.delayedCall(420, () => {
            this.resistHoldTimer = null
            this.resistHoldHandler?.(el)
          })
        })
        zone.on('pointerup', () => this.cancelResistHold())
        zone.on('pointerout', () => this.cancelResistHold())
        this.add(zone)
        this.resistZones.push(zone)
      }
    })
  }

  private redraw() {
    const pct = this._maxValue > 0 ? this._value / this._maxValue : 0

    this.bgGfx.clear()
    this.bgGfx.fillStyle(0x222222, 1)
    this.bgGfx.fillRoundedRect(0, 0, this.barW, this.barH, 2)

    this.fillGfx.clear()
    this.fillGfx.fillStyle(this.color, 1)
    this.fillGfx.fillRoundedRect(0, 0, Math.round(this.barW * pct), this.barH, 2)

    this.hpText.setText(`${this._value}/${this._maxValue}`)
  }
}
