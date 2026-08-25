import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { startCampaignRun } from '../domain/progression/startRun'
import {
  endRunPackCount,
  openPack,
  STARTER_PACK_COUNT,
} from '../domain/cards/Packs'
import {
  cardDef,
  cardRarityDef,
  type CardEffect,
} from '../domain/cards/Card'
import { ELEMENT_COLOR } from '../domain/combat/Elements'
import { t, tKey } from '../i18n/I18n'
import type { RunState } from '../domain/progression/RunState'
/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5
 * Reward carousel: one focused, inspectable card; progressive reveal; explicit ownership state.
 */


export type PackMode = 'starter' | 'endRun'

interface PackOpenData {
  mode: PackMode
  runState?: RunState
  victory?: boolean
}

export class PackOpenScene extends Phaser.Scene {
  private mode: PackMode = 'starter'
  private cards: string[] = []
  private launchData: PackOpenData = { mode: 'starter' }
  private totalPacks = 1
  private currentPack = 0
  private phase: 'closed' | 'opening' | 'revealing' | 'revealed' = 'closed'
  private locked = false
  private packGfx: Phaser.GameObjects.Graphics | null = null
  private packCounter!: Phaser.GameObjects.Text
  private packSub!: Phaser.GameObjects.Text
  private hintTxt!: Phaser.GameObjects.Text
  private primaryBtn!: Phaser.GameObjects.Rectangle
  private primaryTxt!: Phaser.GameObjects.Text
  private carouselObjects: Phaser.GameObjects.GameObject[] = []
  private packCards: string[] = []
  private revealedCards: boolean[] = []
  private focusedCard = 0

  constructor() {
    super('PackOpenScene')
  }

  init() {
    this.locked = false
    this.cards = []
    this.currentPack = 0
    this.phase = 'closed'
    this.packGfx = null
    this.carouselObjects = []
    this.packCards = []
    this.revealedCards = []
    this.focusedCard = 0
  }

  create() {
    this.launchData = (this.scene.settings.data ?? {}) as PackOpenData
    this.mode = this.launchData.mode ?? 'starter'
    const { width, height } = this.cameras.main
    const cx = width / 2

    this.cameras.main.setBackgroundColor('#09111f')
    this.drawBackdrop()

    if (this.mode === 'starter') {
      this.totalPacks = STARTER_PACK_COUNT
      addPixelText(this, cx, 18, t('packs.starterTitle'), {
        fontSize: '12px',
        color: '#ffcc66',
      }).setOrigin(0.5)
      this.packSub = addPixelText(this, cx, 38, t('packs.starterSub'), {
        fontSize: '8px',
        color: '#9ca8bd',
        align: 'center',
      }).setOrigin(0.5)
    } else {
      this.totalPacks = endRunPackCount(!!this.launchData.victory)
      addPixelText(this, cx, 18, t('packs.endTitle'), {
        fontSize: '12px',
        color: '#ffcc66',
      }).setOrigin(0.5)
      this.packSub = addPixelText(this, cx, 38, t('packs.endSub', { n: this.totalPacks }), {
        fontSize: '8px',
        color: '#9ca8bd',
        align: 'center',
      }).setOrigin(0.5)
    }

    this.packCounter = addPixelText(this, cx, 60, '', {
      fontSize: '8px',
      color: '#c9a7d8',
    }).setOrigin(0.5)
    this.hintTxt = addPixelText(this, cx, height - 66, '', {
      fontSize: '8px',
      color: '#93a0b8',
      align: 'center',
    }).setOrigin(0.5)

    this.primaryBtn = this.add
      .rectangle(cx, height - 30, 202, 28, 0x4a3158, 1)
      .setStrokeStyle(2, 0xd9a8ef)
      .setInteractive({ useHandCursor: true })
    this.primaryTxt = addPixelText(this, cx, height - 30, '', {
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5)
    this.primaryBtn.on('pointerdown', () => this.primaryAction())
    this.primaryBtn.on('pointerover', () => {
      if (this.primaryBtn.input?.enabled) this.primaryBtn.setFillStyle(0x624072, 1)
    })
    this.primaryBtn.on('pointerout', () => {
      if (this.primaryBtn.input?.enabled) this.primaryBtn.setFillStyle(0x4a3158, 1)
    })

    this.showClosedPack()
    bindSceneKeys(this, {
      'keydown-ENTER': () => this.primaryAction(),
      'keydown-SPACE': () => this.primaryAction(),
      'keydown-LEFT': () => this.moveFocus(-1),
      'keydown-RIGHT': () => this.moveFocus(1),
    })
  }

  private drawBackdrop() {
    const { width, height } = this.cameras.main
    const g = this.add.graphics()
    g.lineStyle(1, 0x1a2a43, 1)
    for (let y = 96; y < height - 82; y += 48) {
      g.lineBetween(12, y, width - 12, y)
      g.fillStyle(0x28415f, 1)
      g.fillRect(12, y - 1, 3, 3)
      g.fillRect(width - 15, y - 1, 3, 3)
    }
    g.lineStyle(1, 0x15223a, 1)
    g.lineBetween(width / 2, 82, width / 2, height - 86)
  }

  private showClosedPack() {
    this.clearPresentation()
    this.phase = 'closed'
    this.packSub.setText(
      this.mode === 'starter'
        ? t('packs.starterSub')
        : t('packs.endSub', { n: this.totalPacks }),
    )
    this.packCounter.setText(
      t('packs.packCounter', {
        current: this.currentPack + 1,
        total: this.totalPacks,
      }),
    )
    this.hintTxt.setText('')
    this.setPrimary(t('packs.open'), 'active')

    const { width } = this.cameras.main
    this.packGfx = this.drawPack(width / 2, 210, false)
    this.packGfx.setScale(0.9).setAlpha(0)
    this.tweens.add({
      targets: this.packGfx,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 240,
      ease: 'Sine.Out',
    })
  }

  private drawPack(x: number, y: number, open: boolean) {
    const g = this.add.graphics().setPosition(x, y)
    g.fillStyle(0x121e33, 1)
    g.fillRect(-58, -42, 116, 84)
    g.fillStyle(0x51375f, 1)
    g.fillRect(-54, -38, 108, 76)
    g.lineStyle(2, 0xd9a8ef, 1)
    g.strokeRect(-54, -38, 108, 76)
    g.fillStyle(0x6a4778, 1)
    if (open) g.fillTriangle(-50, -34, 50, -34, 0, -70)
    else g.fillTriangle(-50, -34, 50, -34, 0, 6)
    g.lineStyle(1, 0xb884cc, 1)
    g.lineBetween(-50, 34, 0, 2)
    g.lineBetween(50, 34, 0, 2)
    g.fillStyle(0xffcc66, 1)
    g.fillCircle(0, 4, 8)
    g.fillStyle(0x51375f, 1)
    g.fillCircle(0, 4, 3)
    return g
  }

  private setPrimary(
    label: string,
    state: 'active' | 'disabled' | 'success',
  ) {
    this.primaryTxt.setText(label)
    if (state === 'disabled') {
      this.primaryTxt.setColor('#78839a')
      this.primaryBtn
        .setFillStyle(0x1a2333, 1)
        .setStrokeStyle(1, 0x4a5870)
        .disableInteractive()
      return
    }
    const success = state === 'success'
    this.primaryTxt.setColor('#ffffff')
    this.primaryBtn
      .setFillStyle(success ? 0x254d42 : 0x4a3158, 1)
      .setStrokeStyle(2, success ? 0x76d2ad : 0xd9a8ef)
      .setInteractive({ useHandCursor: true })
  }

  private primaryAction() {
    if (this.locked || this.phase === 'opening') return
    if (this.phase === 'closed') {
      this.openCurrentPack()
      return
    }
    if (this.phase === 'revealing') {
      if (this.revealedCards.some(Boolean)) this.revealAll()
      return
    }
    if (this.currentPack + 1 < this.totalPacks) {
      this.currentPack += 1
      this.showClosedPack()
      return
    }
    this.finish()
  }

  private openCurrentPack() {
    if (!this.packGfx) return
    this.phase = 'opening'
    this.hintTxt.setText('')
    this.setPrimary(t('packs.opening'), 'disabled')
    AudioSystem.play('select')

    const x = this.packGfx.x
    const y = this.packGfx.y
    this.packGfx.destroy()
    this.packGfx = this.drawPack(x, y, true)
    const openedCards = openPack(
      Math.random,
      this.mode === 'endRun' ? 'endRun' : 'standard',
      this.mode === 'endRun' ? (this.launchData.runState?.floor ?? 1) : 1,
    )
    this.cards.push(...openedCards)

    this.tweens.add({
      targets: this.packGfx,
      y: y - 12,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 180,
      yoyo: true,
      ease: 'Sine.Out',
      onComplete: () => {
        if (!this.packGfx) return
        this.tweens.add({
          targets: this.packGfx,
          alpha: 0,
          scaleX: 0.7,
          scaleY: 0.7,
          duration: 160,
          onComplete: () => {
            this.packGfx?.destroy()
            this.packGfx = null
            this.revealCards(openedCards)
          },
        })
      },
    })
  }

  private revealCards(ids: string[]) {
    this.packCards = ids
    this.revealedCards = ids.map(() => false)
    this.focusedCard = 0
    this.phase = 'revealing'
    this.renderCarousel()
  }

  private renderCarousel(flip = false) {
    this.clearCarousel()
    const { width } = this.cameras.main
    const cx = width / 2
    const cardY = 226
    const revealedCount = this.revealedCards.filter(Boolean).length
    const id = this.packCards[this.focusedCard]
    if (!id) return

    this.packSub.setText(
      this.mode === 'starter'
        ? t('packs.addedArsenal', { n: this.packCards.length })
        : t('packs.addedCollection', { n: this.packCards.length }),
    )
    this.packCounter.setText(
      `${t('packs.packCounter', {
        current: this.currentPack + 1,
        total: this.totalPacks,
      })} · ${t('packs.cardCounter', {
        current: this.focusedCard + 1,
        total: this.packCards.length,
      })}`,
    )

    if (this.focusedCard > 0) {
      this.track(this.drawSideCard(16, cardY, this.revealedCards[this.focusedCard - 1]!))
      this.addNavigation(16, cardY, -1)
    }
    if (this.focusedCard + 1 < this.packCards.length) {
      this.track(this.drawSideCard(width - 16, cardY, this.revealedCards[this.focusedCard + 1]!))
      this.addNavigation(width - 16, cardY, 1)
    }

    const card = this.drawRewardCard(id, this.revealedCards[this.focusedCard]!)
    this.track(card)
    const cardZone = this.add
      .zone(cx, cardY, 204, 238)
      .setInteractive({ useHandCursor: true })
    let pointerDownX = 0
    cardZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointerDownX = pointer.x
    })
    cardZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const delta = pointer.x - pointerDownX
      if (Math.abs(delta) >= 16) {
        this.moveFocus(delta > 0 ? -1 : 1)
      } else {
        this.revealFocused()
      }
    })
    this.track(cardZone)

    if (flip) {
      card.setScale(0.08, 1)
      this.tweens.add({
        targets: card,
        scaleX: 1,
        duration: 150,
        ease: 'Sine.Out',
      })
    }

    this.drawPagination(cx, 368)
    this.hintTxt.setText(
      this.revealedCards[this.focusedCard]
        ? t('packs.inspectHint')
        : t('packs.revealHint'),
    )
    if (revealedCount === this.packCards.length) {
      this.phase = 'revealed'
      const isLast = this.currentPack + 1 >= this.totalPacks
      this.setPrimary(isLast ? t('packs.continue') : t('packs.next'), 'success')
    } else if (revealedCount > 0) {
      this.setPrimary(t('packs.revealAll'), 'active')
    } else {
      this.setPrimary(t('packs.revealHint'), 'disabled')
    }
  }

  private revealFocused() {
    if (this.phase !== 'revealing' || this.revealedCards[this.focusedCard]) return
    this.revealedCards[this.focusedCard] = true
    AudioSystem.play('ui')
    this.renderCarousel(true)
  }

  private revealAll() {
    if (this.phase !== 'revealing') return
    this.revealedCards.fill(true)
    AudioSystem.play('select')
    this.renderCarousel()
  }

  private moveFocus(delta: number) {
    if (this.phase !== 'revealing' && this.phase !== 'revealed') return
    const next = Phaser.Math.Clamp(this.focusedCard + delta, 0, this.packCards.length - 1)
    if (next === this.focusedCard) return
    this.focusedCard = next
    AudioSystem.play('ui')
    this.renderCarousel()
  }

  private drawSideCard(x: number, y: number, revealed: boolean) {
    const g = this.add.graphics()
    const fill = revealed ? 0x253653 : 0x17243b
    const edge = revealed ? 0x779bc6 : 0x4f6381
    g.fillStyle(0x07101e, 1)
    g.fillRect(x - 21, y - 94, 42, 188)
    g.fillStyle(fill, 1)
    g.fillRect(x - 18, y - 90, 36, 180)
    g.lineStyle(2, edge, 1)
    g.strokeRect(x - 18, y - 90, 36, 180)
    g.fillStyle(revealed ? 0x9bb3d1 : 0x354967, 1)
    g.fillRect(x - 11, y - 62, 22, 3)
    g.fillRect(x - 11, y - 53, 22, 3)
    return g
  }

  private addNavigation(x: number, y: number, direction: -1 | 1) {
    const arrow = this.add.graphics()
    arrow.fillStyle(0xc9d7ed, 1)
    if (direction < 0) arrow.fillTriangle(x + 5, y, x - 4, y - 7, x - 4, y + 7)
    else arrow.fillTriangle(x - 5, y, x + 4, y - 7, x + 4, y + 7)
    const zone = this.add
      .zone(x, y, 30, 66)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => this.moveFocus(direction))
    this.track(arrow)
    this.track(zone)
  }

  private drawRewardCard(id: string, revealed: boolean) {
    const { width } = this.cameras.main
    const card = this.add.container(width / 2, 226)
    const def = cardDef(id)
    const rarity = cardRarityDef(def?.rarity ?? 'common')
    const frameColor = this.color(rarity.accentColor ?? rarity.color)
    const g = this.add.graphics()
    card.add(g)
    this.drawTechFrame(g, 204, 238, frameColor)

    if (!revealed || !def) {
      this.drawCardBack(card)
      return card
    }

    const raritySymbol = this.add.text(-76, -110, rarity.symbol, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: rarity.accentColor ?? rarity.color,
    }).setOrigin(0.5)
    card.add(raritySymbol)
    const rarityText = addPixelText(this, -62, -110, tKey(`rarity.${rarity.id}`, rarity.id), {
      fontSize: '8px',
      color: rarity.accentColor ?? rarity.color,
    }).setOrigin(0, 0.5)
    card.add(rarityText)
    const level = addPixelText(this, 74, -110, 'N1', {
      fontSize: '8px',
      color: '#dbe7f8',
    }).setOrigin(1, 0.5)
    card.add(level)

    const primaryEffect = def.effects.find(effect => effect.type === 'damage') ?? def.effects[0]!
    this.drawCardArtwork(card, primaryEffect, frameColor)

    const name = tKey(`card.${id}.name`, id).toUpperCase()
    const nameText = addPixelText(this, 0, -12, this.wrapCardName(name), {
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5, 0.5)
    card.add(nameText)

    def.effects.slice(0, 2).forEach((effect, index) => {
      const rowY = 42 + index * 22
      this.drawEffectIcon(card, -68, rowY, effect)
      const text = addPixelText(this, -50, rowY, this.effectText(effect), {
        fontSize: '8px',
        color: this.effectColor(effect),
      }).setOrigin(0, 0.5)
      card.add(text)
    })

    const added = addPixelText(
      this,
      0,
      98,
      this.mode === 'starter' ? t('packs.addedCardArsenal') : t('packs.addedCardCollection'),
      {
        fontSize: '8px',
        color: '#91cdb6',
      },
    ).setOrigin(0.5)
    card.add(added)
    return card
  }

  private drawTechFrame(g: Phaser.GameObjects.Graphics, width: number, height: number, accent: number) {
    const left = -width / 2
    const top = -height / 2
    g.fillStyle(0x060d18, 1)
    g.fillRect(left + 4, top + 4, width, height)
    g.fillStyle(0x14233a, 1)
    g.fillRect(left + 3, top + 3, width - 6, height - 6)
    g.fillStyle(0x1b2c46, 1)
    g.fillRect(left + 7, top + 7, width - 14, height - 14)
    g.lineStyle(2, accent, 1)
    g.lineBetween(left + 7, top + 2, -left - 7, top + 2)
    g.lineBetween(left + 7, -top - 2, -left - 7, -top - 2)
    g.lineBetween(left + 2, top + 7, left + 2, -top - 7)
    g.lineBetween(-left - 2, top + 7, -left - 2, -top - 7)
    g.fillStyle(accent, 1)
    g.fillRect(left + 2, top + 2, 8, 3)
    g.fillRect(-left - 10, -top - 5, 8, 3)
  }

  private drawCardBack(card: Phaser.GameObjects.Container) {
    const g = this.add.graphics()
    g.fillStyle(0x101b2e, 1)
    g.fillRect(-70, -88, 140, 150)
    g.lineStyle(1, 0x4d6282, 1)
    g.strokeRect(-70, -88, 140, 150)
    g.lineStyle(1, 0x314664, 1)
    for (let y = -72; y <= 42; y += 19) g.lineBetween(-57, y, 57, y)
    g.fillStyle(0xc9a7d8, 1)
    g.fillRect(-19, -34, 38, 38)
    g.fillStyle(0x202f4b, 1)
    g.fillRect(-14, -29, 28, 28)
    const mark = addPixelText(this, 0, -12, '?', {
      fontSize: '16px',
      color: '#d9a8ef',
    }).setOrigin(0.5)
    const reveal = addPixelText(this, 0, 82, t('packs.revealCard'), {
      fontSize: '8px',
      color: '#dbe7f8',
    }).setOrigin(0.5)
    card.add([g, mark, reveal])
  }

  private drawCardArtwork(
    card: Phaser.GameObjects.Container,
    effect: CardEffect,
    accent: number,
  ) {
    const g = this.add.graphics()
    const color = this.color(this.effectColor(effect))
    g.fillStyle(0x0d1829, 1)
    g.fillRect(-70, -91, 140, 62)
    g.lineStyle(1, accent, 1)
    g.strokeRect(-70, -91, 140, 62)
    g.lineStyle(1, 0x2d4668, 1)
    g.lineBetween(-58, -39, -23, -74)
    g.lineBetween(58, -39, 23, -74)
    g.fillStyle(color, 1)
    switch (effect.type) {
      case 'damage':
        g.fillRect(-4, -80, 8, 40)
        g.fillRect(-22, -64, 44, 8)
        g.fillTriangle(0, -88, -13, -66, 13, -66)
        break
      case 'shield':
        g.fillTriangle(0, -84, -25, -66, 0, -36)
        g.fillTriangle(0, -84, 25, -66, 0, -36)
        g.fillStyle(0x163552, 1)
        g.fillTriangle(0, -75, -14, -64, 0, -45)
        g.fillTriangle(0, -75, 14, -64, 0, -45)
        break
      case 'heal':
        g.fillRect(-7, -82, 14, 38)
        g.fillRect(-20, -70, 40, 14)
        break
      case 'poison':
        g.fillRect(-8, -84, 16, 12)
        g.fillRect(-18, -72, 36, 28)
        g.fillStyle(0x163321, 1)
        g.fillRect(-14, -60, 28, 12)
        g.fillStyle(color, 1)
        g.fillRect(-26, -55, 5, 5)
        g.fillRect(21, -68, 5, 5)
        break
      case 'resist':
        g.fillRect(-20, -75, 40, 6)
        g.fillRect(-27, -68, 54, 6)
        g.fillRect(-20, -61, 40, 6)
        g.fillRect(-13, -54, 26, 6)
        break
    }
    card.add(g)
  }

  private drawEffectIcon(card: Phaser.GameObjects.Container, x: number, y: number, effect: CardEffect) {
    const g = this.add.graphics().setPosition(x, y)
    const color = this.color(this.effectColor(effect))
    g.fillStyle(color, 1)
    switch (effect.type) {
      case 'damage':
        g.fillTriangle(0, -8, -3, -2, 3, -2)
        g.fillRect(-1, -2, 2, 7)
        g.fillRect(-5, 4, 10, 2)
        g.fillRect(-1, 6, 2, 2)
        break
      case 'shield':
        g.fillTriangle(0, -7, -7, -2, 0, 7)
        g.fillTriangle(0, -7, 7, -2, 0, 7)
        break
      case 'heal':
        g.fillRect(-2, -7, 4, 14)
        g.fillRect(-7, -2, 14, 4)
        break
      case 'poison':
        g.fillRect(-4, -6, 8, 10)
        g.fillRect(-2, -8, 4, 3)
        g.fillRect(6, -1, 3, 3)
        break
      case 'resist':
        g.fillRect(-6, -6, 12, 3)
        g.fillRect(-8, -2, 16, 3)
        g.fillRect(-6, 2, 12, 3)
        break
    }
    card.add(g)
  }

  private drawPagination(x: number, y: number) {
    const g = this.add.graphics()
    const start = x - ((this.packCards.length - 1) * 14) / 2
    this.packCards.forEach((id, index) => {
      const def = cardDef(id)
      const active = index === this.focusedCard
      const revealed = this.revealedCards[index]
      const color = def
        ? this.color(cardRarityDef(def.rarity).accentColor ?? cardRarityDef(def.rarity).color)
        : 0x7d8da5
      g.fillStyle(active ? color : revealed ? 0x8093ae : 0x33455f, 1)
      g.fillRect(start + index * 14 - 3, y - 3, 6, 6)
      if (active) {
        g.lineStyle(1, 0xffffff, 1)
        g.strokeRect(start + index * 14 - 4, y - 4, 8, 8)
      }
    })
    this.track(g)
  }

  private effectText(effect: CardEffect): string {
    switch (effect.type) {
      case 'damage':
        return `${effect.value} ${tKey('card.effect.damage', 'DAÑO')} · ${tKey(
          `element.${effect.element ?? 'neutral'}`,
          effect.element ?? 'neutral',
        )}`
      case 'shield':
        return `${effect.value} ${tKey('card.effect.shield', 'ESCUDO')}`
      case 'heal':
        return `${effect.value} CURACIÓN`
      case 'poison':
        return `${effect.value} VENENO`
      case 'resist':
        return `${effect.value}% RESIST.`
    }
  }

  private effectColor(effect: CardEffect): string {
    if (effect.type === 'damage') return ELEMENT_COLOR[effect.element ?? 'neutral']
    switch (effect.type) {
      case 'shield':
        return '#77aaff'
      case 'heal':
        return '#66ee99'
      case 'poison':
        return '#99dd55'
      case 'resist':
        return '#c9a7d8'
    }
  }

  private wrapCardName(name: string): string {
    const words = name.trim().split(/\s+/)
    if (words.length < 2) return name
    let bestAt = 1
    let bestScore = Number.POSITIVE_INFINITY
    for (let i = 1; i < words.length; i += 1) {
      const first = words.slice(0, i).join(' ').length
      const second = words.slice(i).join(' ').length
      const score = Math.max(first, second) * 10 + Math.abs(first - second)
      if (score < bestScore) {
        bestScore = score
        bestAt = i
      }
    }
    return `${words.slice(0, bestAt).join(' ')}\n${words.slice(bestAt).join(' ')}`
  }

  private color(hex: string): number {
    return Phaser.Display.Color.HexStringToColor(hex).color
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.carouselObjects.push(object)
    return object
  }

  private clearCarousel() {
    for (const object of this.carouselObjects) object.destroy()
    this.carouselObjects = []
  }

  private clearPresentation() {
    this.packGfx?.destroy()
    this.packGfx = null
    this.clearCarousel()
  }

  private finish() {
    if (this.locked) return
    this.locked = true
    AudioSystem.play('select')

    if (this.mode === 'starter') {
      MetaProgression.commitStarterPacks(this.cards)
      const state = startCampaignRun(1)
      this.scene.start('MapScene', { runState: state })
      return
    }

    MetaProgression.addCardsToCollection(this.cards)
    this.scene.start('DeckScene', { fromEndRun: true })
  }
}
