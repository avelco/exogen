import Phaser from 'phaser'
import { getRunState, applyPassiveOnKill, trySecondWind } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { HealthBar } from '../ui/HealthBar'
import { CardSprite } from '../ui/CardSprite'
import { DamageNumbers } from '../ui/DamageNumbers'
import { addPixelText } from '../ui/pixelText'
import { Enemy } from '../domain/enemies/Enemy'
import { EnemyAI } from '../domain/enemies/EnemyAI'
import { CombatEngine, toFighter } from '../domain/combat/CombatEngine'
import {
  rollCardEffectDice,
  type CardEffectDieFace,
  type CardEffectDieRoll,
  type CardEffectMultiplier,
} from '../domain/combat/CardEffectDie'
import type { RunState } from '../domain/progression/RunState'
import { rollCombatSouls } from '../domain/progression/CombatRewards'
import { AudioSystem } from '../systems/AudioSystem'
import { preferReducedMotion } from '../systems/Device'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { enemyName, t, tKey } from '../i18n/I18n'
import { showConfirmModal } from '../ui/ConfirmModal'
import { showInfoModal } from '../ui/InfoModal'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { TutorialBanner } from '../ui/TutorialBanner'
import {
  createCombatDeck,
  endTurnDraw,
  fillHand,
  playFromHand,
  slottedCards,
  unplaySlot,
  type CombatDeck,
} from '../domain/cards/Deck'
import { previewCardsVs, COMBAT_RESIST_CAP } from '../domain/cards/CardEffects'
import {
  cardDef,
  cardRarityDef,
  effectsOf,
  type CardEffect,
  type RunCard,
} from '../domain/cards/Card'
import {
  ELEMENTS,
  ELEMENT_COLOR,
  zeroResistances,
  type Element,
  type ElementResistances,
} from '../domain/combat/Elements'

const ENEMY_ARENA_Y = 78
const HERO_ARENA_Y = 168
const ENEMY_SCALE = 0.7
const HERO_SCALE = 1.15
const QUEUE_X = 22
const QUEUE_STEP_Y = 18
const ENEMY_BAR_W = 110
const HERO_BAR_W = 130
const BAR_H = 9
const ACTION_PANEL_TOP = 210
const SLOT_Y = 256
const PREVIEW_Y = 314
const DIE_PIPS: Record<CardEffectDieFace, ReadonlyArray<readonly [number, number]>> = {
  1: [[0, 0]],
  2: [[-4, -4], [4, 4]],
  3: [[-4, -4], [0, 0], [4, 4]],
  4: [[-4, -4], [4, -4], [-4, 4], [4, 4]],
  5: [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]],
  6: [[-4, -5], [-4, 0], [-4, 5], [4, -5], [4, 0], [4, 5]],
}
const END_TURN_Y = 358
const HAND_LABEL_Y = 386
const HAND_Y = 428

type PreviewStat = {
  type: CardEffect['type']
  value: number
  color: string
}
type CardEffectDiePhase = 'idle' | 'rolling' | 'pickTwo' | 'pickOne' | 'reveal'

type DieEntry = {
  gfx: Phaser.GameObjects.Graphics
  backTxt: Phaser.GameObjects.Text | null
  zone: Phaser.GameObjects.Zone
}

export class CombatScene extends Phaser.Scene {
  private state!: RunState
  private enemy!: Enemy
  private wave: Enemy[] = []

  private heroHpBar!: HealthBar
  private enemyHpBar!: HealthBar

  private deck!: CombatDeck
  private handSprites: CardSprite[] = []
  private slotSprites: (CardSprite | null)[] = []
  private slotZones: Phaser.GameObjects.Rectangle[] = []

  private endTurnBtn!: Phaser.GameObjects.Rectangle
  private endTurnTxt!: Phaser.GameObjects.Text
  private previewTxt!: Phaser.GameObjects.Text
  private previewGfx!: Phaser.GameObjects.Graphics
  private previewValueTexts: Phaser.GameObjects.Text[] = []
  private cardEffectDiePhase: CardEffectDiePhase = 'idle'
  private pendingDiePlayed: RunCard[] | null = null
  private pendingDiceRolls: CardEffectDieRoll[] = []
  private dieEntries: DieEntry[] = []
  private pickedDieIndices: number[] = []
  private keptDieIndex = -1
  private inspectionObjects: Phaser.GameObjects.GameObject[] = []
  private cardAnimating = false
  private attacking = false

  private heroGfx!: Phaser.GameObjects.Graphics
  private enemyGfx!: Phaser.GameObjects.Graphics
  private queueGfx: Phaser.GameObjects.Graphics[] = []
  private pathGfx!: Phaser.GameObjects.Graphics
  private shakeTimers = new Map<object, Phaser.Time.TimerEvent>()
  private shakeRests = new Map<object, { x: number; y: number }>()

  private heroArenaX = 135
  private enemyArenaX = 135
  private abandonOpen = false
  private resistInfoOpen = false
  private enemyDeck!: CombatDeck
  private statusTxt!: Phaser.GameObjects.Text
  /** Combat-only resist from cards (lost when the fight ends). */
  private combatResists: ElementResistances = zeroResistances()

  constructor() {
    super('CombatScene')
  }

  init() {
    this.handSprites = []
    this.slotSprites = []
    this.slotZones = []
    this.previewValueTexts = []
    this.cardEffectDiePhase = 'idle'
    this.pendingDiePlayed = null
    this.pendingDiceRolls = []
    this.dieEntries = []
    this.pickedDieIndices = []
    this.keptDieIndex = -1
    this.inspectionObjects = []
    this.cardAnimating = false
    this.wave = []
    this.queueGfx = []
    this.attacking = false
    this.abandonOpen = false
    this.resistInfoOpen = false
    this.combatResists = zeroResistances()
    this.shakeTimers.clear()
    this.shakeRests.clear()
    this.children.removeAll(true)
  }

  /** Permanent resists + combat-only card resists (fresh object each call). */
  private heroCombatResistances(): ElementResistances {
    const out = { ...this.state.heroResistances }
    for (const el of ELEMENTS) {
      out[el] = (out[el] ?? 0) + this.combatResists[el]
    }
    return out
  }

  private gainCombatResists(granted: Partial<ElementResistances>) {
    for (const el of ELEMENTS) {
      const v = granted[el]
      if (!v) continue
      this.combatResists[el] = Math.min(
        COMBAT_RESIST_CAP,
        this.combatResists[el] + v,
      )
    }
  }

  create() {
    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }
    this.state = rs

    const kind = this.state.pendingNodeKind ?? 'combat'
    this.wave = Enemy.waveForNode(kind, this.state.floor, this.state.seed)
    this.enemy = this.wave[0]!

    this.deck = createCombatDeck(this.state.deckDefs, this.state.actionSlots)
    fillHand(this.deck)
    this.enemyDeck = createCombatDeck(this.enemy.deckDefs, this.enemy.actionSlots)
    fillHand(this.enemyDeck)

    this.drawArena()
    this.drawBars()
    this.drawCardUi()
    this.bindEnemyBars()
    this.refreshHandUi()
    this.updatePreview()
    this.enableInput()

    // Start-of-combat poison tick (none yet)
    this.applyHeroShieldBar()

    // Depth 300+: ambient phase leak poisons the hero every combat.
    if (this.state.floor >= 300) {
      this.state.heroPoison += 2
      this.updateStatusTxt()
      const warn = addPixelText(this, this.cameras.main.width / 2, 200, t('combat.phaseLeak'), {
        fontSize: '8px',
        color: '#88cc44',
      }).setOrigin(0.5).setDepth(50)
      this.tweens.add({ targets: warn, alpha: 0, y: 188, duration: 1600, onComplete: () => warn.destroy() })
    }

    this.drawPauseButton()

    bindSceneKeys(this, {
      'keydown-ESC': () => this.promptAbandonFight(),
      'keydown-ENTER': () => this.onEndTurn(),
      'keydown-SPACE': () => this.onEndTurn(),
    })

    if (!MetaProgression.isTutorialDone() && this.state.floor === 1) {
      const tip = new TutorialBanner(this)
      tip.show('tutorial.combat', () => tip.destroy())
    }
  }

  private drawPauseButton() {
    const { width } = this.cameras.main
    const size = 22
    const x = width - size - 6
    const y = 6
    const root = this.add.container(x, y).setDepth(50)

    const bg = this.add.graphics()
    const drawBg = (hover: boolean) => {
      bg.clear()
      bg.fillStyle(hover ? 0x2a2a3a : 0x12121c, 0.9)
      bg.fillRoundedRect(0, 0, size, size, 3)
      bg.lineStyle(1, hover ? 0xaaaacc : 0x777788, 1)
      bg.strokeRoundedRect(0, 0, size, size, 3)
    }
    drawBg(false)
    root.add(bg)

    const bars = this.add.graphics()
    const drawBars = (hover: boolean) => {
      bars.clear()
      bars.fillStyle(hover ? 0xffffff : 0xdddddd, 1)
      bars.fillRect(6, 5, 4, 12)
      bars.fillRect(12, 5, 4, 12)
    }
    drawBars(false)
    root.add(bars)

    const zone = this.add
      .zone(size / 2, size / 2, 36, 36)
      .setInteractive({ useHandCursor: true })
    root.add(zone)
    zone.on('pointerover', () => { drawBg(true); drawBars(true) })
    zone.on('pointerout', () => { drawBg(false); drawBars(false) })
    zone.on('pointerdown', () => {
      AudioSystem.play('ui')
      this.promptAbandonFight()
    })
  }

  private promptAbandonFight() {
    if (this.abandonOpen || this.attacking) return
    this.abandonOpen = true
    showConfirmModal(this, {
      title: t('combat.abandonTitle'),
      body: t('combat.abandonBody'),
      confirmLabel: t('combat.abandonConfirm'),
      cancelLabel: t('combat.abandonCancel'),
      onConfirm: () => {
        SaveSystem.abandonQuicksave()
        this.scene.start('GameOverScene', { runState: this.state, victory: false })
      },
      onCancel: () => {
        this.abandonOpen = false
      },
    })
  }

  private drawArena() {
    const { width } = this.cameras.main
    this.heroArenaX = width * 0.35
    this.enemyArenaX = width * 0.65
    this.pathGfx = this.add.graphics().setDepth(0)
    this.drawPerspectivePath(width / 2, 40, 200)

    this.heroGfx = this.drawCharacter(this.heroArenaX, HERO_ARENA_Y, HERO_SCALE, 0x6688cc)
    this.enemyGfx = this.drawCharacter(this.enemyArenaX, ENEMY_ARENA_Y, ENEMY_SCALE, 0xcc6666)

    this.redrawEnemyQueue()
  }

  private drawPerspectivePath(cx: number, topY: number, botY: number) {
    this.pathGfx.clear()
    this.pathGfx.fillStyle(0x2a2a3a, 1)
    this.pathGfx.fillTriangle(cx - 20, topY, cx + 20, topY, cx + 80, botY)
    this.pathGfx.fillTriangle(cx - 20, topY, cx - 80, botY, cx + 80, botY)
  }

  private drawCharacter(
    x: number,
    y: number,
    scale: number,
    color: number,
  ): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(3)
    g.fillStyle(color, 1)
    g.fillCircle(x, y - 10 * scale, 10 * scale)
    g.fillRoundedRect(x - 8 * scale, y, 16 * scale, 20 * scale, 2)
    return g
  }

  private redrawEnemyQueue() {
    for (const g of this.queueGfx) g.destroy()
    this.queueGfx = []
    for (let i = 1; i < this.wave.length; i++) {
      const g = this.add.graphics().setDepth(2)
      g.fillStyle(0x884444, 0.8)
      g.fillCircle(QUEUE_X, ENEMY_ARENA_Y + (i - 1) * QUEUE_STEP_Y, 6)
      this.queueGfx.push(g)
    }
  }

  private drawBars() {
    const { width } = this.cameras.main
    // Enemy: name + HP + ESC + resists stacked above the sprite.
    this.enemyHpBar = new HealthBar(
      this,
      this.enemyArenaX - ENEMY_BAR_W / 2,
      18,
      ENEMY_BAR_W,
      BAR_H,
      this.enemy.maxHp,
      0xcc4444,
      enemyName(this.enemy.templateId),
    )
    this.enemyHpBar.setDepth(6)
    this.enemyHpBar.setValue(this.enemy.hp)
    this.enemyHpBar.setDefense(this.enemy.shield)
    this.enemyHpBar.setResistances(this.enemy.resistances)
    this.enemyHpBar.setResistHoldHandler(el => this.showResistInfo(el, 'enemy'))

    // Hero: same stack, clear of the action panel.
    this.heroHpBar = new HealthBar(
      this,
      this.heroArenaX - HERO_BAR_W / 2,
      HERO_ARENA_Y - 52,
      HERO_BAR_W,
      BAR_H,
      this.state.maxHp,
      0x44cc66,
      t('player.name'),
    )
    this.heroHpBar.setDepth(6)
    this.heroHpBar.setValue(this.state.hp)
    this.heroHpBar.setDefense(this.state.heroShield)
    this.heroHpBar.setResistances(this.heroCombatResistances())
    this.heroHpBar.setResistHoldHandler(el => this.showResistInfo(el, 'hero'))

    this.statusTxt = addPixelText(this, width / 2, ACTION_PANEL_TOP - 8, '', {
      fontSize: '8px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(8)
    this.updateStatusTxt()
  }

  private showResistInfo(el: Element, owner: 'hero' | 'enemy') {
    if (this.resistInfoOpen || this.abandonOpen) return
    this.resistInfoOpen = true
    const elementName = tKey(`element.${el}`, el).toUpperCase()
    const lines: string[] = []
    if (owner === 'hero') {
      const base = this.state.heroResistances[el] ?? 0
      const cards = this.combatResists[el]
      lines.push(t('combat.resist.base', { n: base }))
      lines.push(t('combat.resist.cards', { n: cards }))
      lines.push(t('combat.resist.total', { n: base + cards }))
    } else {
      lines.push(t('combat.resist.innate', { n: this.enemy.resistances[el] ?? 0 }))
    }
    showInfoModal(this, {
      title: t('combat.resist.title', { element: elementName }),
      body: lines.join('\n'),
      closeLabel: t('ui.close'),
      onClose: () => {
        this.resistInfoOpen = false
      },
    })
  }

  private bindEnemyBars() {
    this.enemyHpBar.setMax(this.enemy.maxHp)
    this.enemyHpBar.setValue(this.enemy.hp)
    this.enemyHpBar.setDefense(this.enemy.shield)
    this.enemyHpBar.setLabel(enemyName(this.enemy.templateId))
    this.enemyHpBar.setResistances(this.enemy.resistances)
  }

  private applyHeroShieldBar() {
    this.heroHpBar.setValue(this.state.hp)
    this.heroHpBar.setDefense(this.state.heroShield)
    this.heroHpBar.setResistances(this.heroCombatResistances())
  }

  private updateStatusTxt() {
    const parts: string[] = []
    if (this.state.heroPoison > 0) parts.push(`P${this.state.heroPoison}`)
    if (this.enemy.poison > 0) parts.push(`eP${this.enemy.poison}`)
    this.statusTxt.setText(parts.join(' · '))
  }

  private drawCardUi() {
    const { width } = this.cameras.main
    const cx = width / 2

    this.add
      .rectangle(cx, ACTION_PANEL_TOP + 84, width - 16, 168, 0x121220, 0.94)
      .setStrokeStyle(1, 0x3f4055)
      .setDepth(3)

    const n = this.state.actionSlots
    const gap = 8
    const slotW = CardSprite.SELECTED_WIDTH
    const totalW = n * slotW + (n - 1) * gap
    const startX = cx - totalW / 2 + slotW / 2
    this.slotSprites = Array.from({ length: n }, () => null)
    this.slotZones = []
    for (let i = 0; i < n; i++) {
      const x = startX + i * (slotW + gap)
      const rect = this.add
        .rectangle(x, SLOT_Y, slotW, CardSprite.SELECTED_HEIGHT, 0x191925, 1)
        .setStrokeStyle(1, 0x5b5d72)
        .setDepth(4)
        .setInteractive({ useHandCursor: true })
      addPixelText(this, x, SLOT_Y, `${i + 1}`, {
        fontSize: '8px',
        color: '#4d4f62',
      }).setOrigin(0.5).setDepth(5)
      rect.on('pointerdown', () => this.onSlotTap(i))
      this.slotZones.push(rect)

      if (i + 1 < n) {
        const arrow = this.add.graphics().setDepth(5)
        const arrowX = x + slotW / 2 + gap / 2
        arrow.fillStyle(0x65728b, 1)
        arrow.fillTriangle(arrowX - 3, SLOT_Y, arrowX + 3, SLOT_Y - 4, arrowX + 3, SLOT_Y + 4)
      }
    }

    this.previewTxt = addPixelText(this, cx, PREVIEW_Y - 8, t('combat.preview'), {
      fontSize: '8px',
      color: '#899bb5',
    }).setOrigin(0.5).setDepth(8)
    this.previewGfx = this.add.graphics().setDepth(8)

    this.endTurnBtn = this.add
      .rectangle(cx, END_TURN_Y, 116, 28, 0x24472f, 1)
      .setStrokeStyle(1, 0x66bb77)
      .setInteractive({ useHandCursor: true })
      .setDepth(7)
    this.endTurnBtn.on('pointerdown', () => this.onEndTurn())
    this.endTurnBtn.on('pointerover', () => {
      if (!this.attacking && !this.cardAnimating) this.endTurnBtn.setFillStyle(0x2f5b3d, 1)
    })
    this.endTurnBtn.on('pointerout', () => {
      if (!this.attacking && !this.cardAnimating) this.endTurnBtn.setFillStyle(0x24472f, 1)
    })

    this.endTurnTxt = addPixelText(this, cx, END_TURN_Y, t('combat.dieRoll'), {
      fontSize: '8px',
      color: '#baf2c4',
    }).setOrigin(0.5).setDepth(8)

    addPixelText(this, cx, HAND_LABEL_Y, t('combat.pickCards'), {
      fontSize: '8px',
      color: '#8990aa',
    }).setOrigin(0.5).setDepth(8)
  }

  private refreshHandUi() {
    for (const sprite of this.handSprites) sprite.destroy()
    this.handSprites = []
    const { width } = this.cameras.main
    const n = this.deck.hand.length
    if (n === 0) return
    const gap = 4
    const totalW = n * CardSprite.COMPACT_WIDTH + (n - 1) * gap
    const startX = width / 2 - totalW / 2 + CardSprite.COMPACT_WIDTH / 2
    this.deck.hand.forEach((card, index) => {
      const sprite = new CardSprite(
        this,
        startX + index * (CardSprite.COMPACT_WIDTH + gap),
        HAND_Y,
        card,
        'compact',
      )
      sprite.setDepth(10)
      sprite.setEnabled(!this.attacking)
      sprite.onTap = () => this.onHandTap(card.id, sprite)
      sprite.onHold = () => {
        if (!this.cardAnimating) this.showCardInspection(card)
      }
      this.handSprites.push(sprite)
    })
  }

  private refreshSlotUi() {
    for (let i = 0; i < this.slotSprites.length; i++) {
      this.slotSprites[i]?.destroy()
      this.slotSprites[i] = null
    }
    const { width } = this.cameras.main
    const n = this.state.actionSlots
    const gap = 8
    const slotW = CardSprite.SELECTED_WIDTH
    const totalW = n * slotW + (n - 1) * gap
    const startX = width / 2 - totalW / 2 + slotW / 2
    for (let i = 0; i < n; i++) {
      const card = this.deck.slots[i]
      const zone = this.slotZones[i]!
      if (!card) {
        zone.setFillStyle(0x191925, 1).setStrokeStyle(1, 0x5b5d72)
        continue
      }
      const rarity = cardDef(card.defId)?.rarity ?? 'common'
      const color = Phaser.Display.Color.HexStringToColor(
        cardRarityDef(rarity).accentColor ?? cardRarityDef(rarity).color,
      ).color
      zone.setFillStyle(0x20324b, 1).setStrokeStyle(2, color)
      const sprite = new CardSprite(
        this,
        startX + i * (slotW + gap),
        SLOT_Y,
        card,
        'selected',
      )
      sprite.setDepth(12)
      sprite.setSelected(true)
      sprite.setEnabled(!this.attacking)
      sprite.onTap = () => this.onSlotTap(i, sprite)
      this.slotSprites[i] = sprite
    }
  }

  private onHandTap(cardId: string, sprite?: CardSprite) {
    if (this.attacking || this.cardAnimating) return
    const targetIndex = this.deck.slots.findIndex(slot => slot == null)
    if (targetIndex < 0 || !playFromHand(this.deck, cardId)) return
    AudioSystem.play('select')
    if (!sprite) {
      this.refreshHandUi()
      this.refreshSlotUi()
      this.updatePreview()
      return
    }
    this.animateCardTransition(
      sprite,
      this.slotZones[targetIndex]!.x,
      SLOT_Y,
      CardSprite.SELECTED_WIDTH / CardSprite.COMPACT_WIDTH,
    )
  }

  private onSlotTap(index: number, sprite?: CardSprite) {
    if (this.attacking || this.cardAnimating) return
    if (!unplaySlot(this.deck, index)) return
    AudioSystem.play('ui')
    if (!sprite) {
      this.refreshHandUi()
      this.refreshSlotUi()
      this.updatePreview()
      return
    }
    const n = this.deck.hand.length
    const gap = 4
    const totalW = n * CardSprite.COMPACT_WIDTH + (n - 1) * gap
    const targetX =
      this.cameras.main.width / 2 -
      totalW / 2 +
      CardSprite.COMPACT_WIDTH / 2 +
      (n - 1) * (CardSprite.COMPACT_WIDTH + gap)
    this.animateCardTransition(
      sprite,
      targetX,
      HAND_Y,
      CardSprite.COMPACT_WIDTH / CardSprite.SELECTED_WIDTH,
    )
  }

  private updatePreview() {
    const cards = slottedCards(this.deck)
    const preview = previewCardsVs(cards, this.enemy.resistances, {
      elementDmgBonus: this.state.elementDmgBonus,
      poisonAmp: this.state.poisonAmp,
    })
    const stats: PreviewStat[] = []
    if (preview.damage) stats.push({ type: 'damage', value: preview.damage, color: '#ff7777' })
    if (preview.poison) stats.push({ type: 'poison', value: preview.poison, color: '#99dd55' })
    if (preview.shield) stats.push({ type: 'shield', value: preview.shield, color: '#77aaff' })
    if (preview.heal) stats.push({ type: 'heal', value: preview.heal, color: '#66ee99' })
    for (const element of ELEMENTS) {
      const value = preview.resist[element]
      if (value) stats.push({ type: 'resist', value, color: ELEMENT_COLOR[element] })
    }
    this.renderPreviewStats(stats)
  }

  private animateCardTransition(
    sprite: CardSprite,
    x: number,
    y: number,
    scale: number,
  ) {
    this.cardAnimating = true
    sprite.setDepth(24)
    this.tweens.add({
      targets: sprite,
      x,
      y,
      scaleX: scale,
      scaleY: scale,
      duration: 180,
      ease: 'Sine.Out',
      onComplete: () => {
        this.cardAnimating = false
        this.refreshHandUi()
        this.refreshSlotUi()
        this.updatePreview()
      },
    })
  }

  private clearPreviewRow() {
    for (const text of this.previewValueTexts) text.destroy()
    this.previewValueTexts = []
    this.previewGfx.clear()
  }

  private drawCardEffectDieFace(
    graphics: Phaser.GameObjects.Graphics,
    face: CardEffectDieFace,
  ) {
    graphics.clear()
    graphics.fillStyle(0x0b1220, 1)
    graphics.fillRect(-9, -9, 18, 18)
    graphics.fillStyle(0x344b6a, 1)
    graphics.fillRect(-7, -7, 14, 14)
    graphics.lineStyle(2, 0xd9a8ef, 1)
    graphics.strokeRect(-8, -8, 16, 16)
    graphics.fillStyle(0xf4d6ff, 1)
    for (const [x, y] of DIE_PIPS[face]) {
      graphics.fillRect(x - 1, y - 1, 3, 3)
    }
  }

  private drawCardEffectDieBack(graphics: Phaser.GameObjects.Graphics) {
    graphics.clear()
    graphics.fillStyle(0x1b1226, 1)
    graphics.fillRect(-9, -9, 18, 18)
    graphics.fillStyle(0x332147, 1)
    graphics.fillRect(-7, -7, 14, 14)
    graphics.lineStyle(2, 0x8a6ab0, 1)
    graphics.strokeRect(-8, -8, 16, 16)
  }

  private renderPreviewStats(stats: PreviewStat[]) {
    this.clearPreviewRow()
    this.previewTxt.setPosition(this.cameras.main.width / 2, PREVIEW_Y - 8).setDepth(8)
    this.previewTxt.setText(stats.length ? t('combat.preview') : `${t('combat.preview')} · —`)
    if (stats.length === 0) return

    const widths = stats.map(stat => 14 + String(stat.value).length * 5)
    const totalW = widths.reduce((sum, width) => sum + width, 0) + (stats.length - 1) * 7
    let x = this.cameras.main.width / 2 - totalW / 2
    stats.forEach((stat, index) => {
      this.drawCombatEffectIcon(this.previewGfx, x + 4, PREVIEW_Y + 6, stat.type, stat.color)
      const value = addPixelText(this, x + 12, PREVIEW_Y + 6, String(stat.value), {
        fontSize: '8px',
        color: stat.color,
      }).setOrigin(0, 0.5).setDepth(8)
      this.previewValueTexts.push(value)
      x += widths[index]! + 7
    })
  }

  private showCardInspection(card: RunCard) {
    this.hideCardInspection()
    const def = cardDef(card.defId)
    if (!def) return

    const { width } = this.cameras.main
    const cx = width / 2
    const rarity = cardRarityDef(def.rarity)
    const accent = Phaser.Display.Color.HexStringToColor(
      rarity.accentColor ?? rarity.color,
    ).color
    const panel = this.add.graphics().setDepth(30)
    panel.fillStyle(0x0c1628, 0.98)
    panel.fillRect(12, 220, width - 24, 112)
    panel.lineStyle(2, accent, 1)
    panel.strokeRect(12, 220, width - 24, 112)
    this.inspectionObjects.push(panel)

    const symbol = this.add.text(26, 230, rarity.symbol, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: rarity.accentColor ?? rarity.color,
    }).setOrigin(0.5).setDepth(31)
    const title = addPixelText(
      this,
      40,
      230,
      tKey(`card.${card.defId}.name`, card.defId).toUpperCase(),
      { fontSize: '8px', color: '#ffffff' },
    ).setOrigin(0, 0.5).setDepth(31)
    const rarityTxt = addPixelText(this, width - 24, 230, tKey(`rarity.${def.rarity}`, def.rarity), {
      fontSize: '8px',
      color: rarity.accentColor ?? rarity.color,
    }).setOrigin(1, 0.5).setDepth(31)
    this.inspectionObjects.push(symbol, title, rarityTxt)

    effectsOf(card).slice(0, 2).forEach((effect, index) => {
      const y = 261 + index * 20
      this.drawCombatEffectIcon(panel, 30, y, effect.type, this.effectColor(effect))
      const text = addPixelText(this, 42, y, this.inspectionEffectText(effect), {
        fontSize: '8px',
        color: this.effectColor(effect),
      }).setOrigin(0, 0.5).setDepth(31)
      this.inspectionObjects.push(text)
    })
    const hint = addPixelText(this, cx, 316, t('combat.inspectRelease'), {
      fontSize: '8px',
      color: '#93a0b8',
    }).setOrigin(0.5).setDepth(31)
    this.inspectionObjects.push(hint)
    this.input.once('pointerup', () => this.hideCardInspection())
  }

  private hideCardInspection() {
    for (const object of this.inspectionObjects) object.destroy()
    this.inspectionObjects = []
  }

  private inspectionEffectText(effect: CardEffect): string {
    switch (effect.type) {
      case 'damage':
        return `${effect.value} DAÑO · ${tKey(
          `element.${effect.element ?? 'neutral'}`,
          effect.element ?? 'neutral',
        )}`
      case 'shield':
        return `${effect.value} ESCUDO`
      case 'heal':
        return `${effect.value} CURACIÓN`
      case 'poison':
        return `${effect.value} VENENO`
      case 'resist':
        return `${effect.value}% RESISTENCIA`
    }
  }

  private effectColor(effect: CardEffect): string {
    if (effect.type === 'damage') return ELEMENT_COLOR[effect.element ?? 'neutral']
    if (effect.type === 'shield') return '#77aaff'
    if (effect.type === 'heal') return '#66ee99'
    if (effect.type === 'poison') return '#99dd55'
    return '#c9a7d8'
  }

  private drawCombatEffectIcon(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    type: CardEffect['type'],
    color: string,
  ) {
    const value = Phaser.Display.Color.HexStringToColor(color).color
    graphics.fillStyle(value, 1)
    switch (type) {
      case 'damage':
        graphics.fillTriangle(x, y - 6, x - 2, y - 2, x + 2, y - 2)
        graphics.fillRect(x - 1, y - 2, 2, 5)
        graphics.fillRect(x - 4, y + 2, 8, 2)
        graphics.fillRect(x - 1, y + 4, 2, 2)
        break
      case 'shield':
        graphics.fillTriangle(x, y - 6, x - 6, y - 2, x, y + 6)
        graphics.fillTriangle(x, y - 6, x + 6, y - 2, x, y + 6)
        break
      case 'heal':
        graphics.fillRect(x - 2, y - 6, 4, 12)
        graphics.fillRect(x - 6, y - 2, 12, 4)
        break
      case 'poison':
        graphics.fillRect(x - 3, y - 6, 6, 10)
        graphics.fillRect(x - 1, y - 8, 2, 3)
        break
      case 'resist':
        graphics.fillRect(x - 5, y - 4, 10, 2)
        graphics.fillRect(x - 7, y - 1, 14, 2)
        graphics.fillRect(x - 5, y + 2, 10, 2)
        break
    }
  }

  private enableInput() {
    this.attacking = false
    this.restoreEndTurnButtonLayout()
    this.endTurnBtn.setInteractive({ useHandCursor: true })
    this.endTurnBtn.setFillStyle(0x24472f, 1)
    this.endTurnBtn.setStrokeStyle(1, 0x66bb77)
    this.endTurnTxt.setColor('#baf2c4')
    this.endTurnTxt.setText(t('combat.dieRoll'))
    for (const card of [...this.handSprites, ...this.slotSprites]) {
      card?.setEnabled(true)
    }
  }

  private disableInput() {
    this.attacking = true
    this.endTurnBtn.disableInteractive()
    this.endTurnBtn.setFillStyle(0x20222a, 1)
    this.endTurnBtn.setStrokeStyle(1, 0x444653)
    this.endTurnTxt.setColor('#666666')
    for (const card of [...this.handSprites, ...this.slotSprites]) {
      card?.setEnabled(false)
    }
  }

  private restoreEndTurnButtonLayout() {
    const cx = this.cameras.main.width / 2
    this.endTurnBtn.setPosition(cx, END_TURN_Y).setDisplaySize(116, 28)
    this.endTurnTxt.setPosition(cx, END_TURN_Y)
  }

  private clearPendingDiceUi() {
    for (const entry of this.dieEntries) {
      entry.gfx.destroy()
      entry.backTxt?.destroy()
      entry.zone.destroy()
    }
    this.dieEntries = []
    this.pickedDieIndices = []
    this.keptDieIndex = -1
    this.pendingDiceRolls = []
    this.pendingDiePlayed = null
    this.cardEffectDiePhase = 'idle'
    this.restoreEndTurnButtonLayout()
  }

  private onEndTurn() {
    if (this.cardEffectDiePhase === 'reveal') {
      this.confirmDieAttack()
      return
    }
    if (this.cardEffectDiePhase !== 'idle' || this.attacking || this.cardAnimating) return
    const played = slottedCards(this.deck)
    if (played.length === 0) return
    this.disableInput()
    AudioSystem.play('attack')
    this.pendingDiePlayed = played
    this.rollPendingDice()
  }

  private rollPendingDice() {
    if (this.cardEffectDiePhase !== 'idle' || !this.pendingDiePlayed) return
    this.cardEffectDiePhase = 'rolling'
    this.endTurnBtn.disableInteractive()
    this.endTurnTxt.setColor('#666666')
    this.pendingDiceRolls = rollCardEffectDice(3)
    this.pickedDieIndices = []
    this.clearPreviewRow()

    const { width } = this.cameras.main
    const cx = width / 2
    const dieY = PREVIEW_Y + 4
    const xs = [cx - 30, cx, cx + 30]
    this.previewTxt.setPosition(cx, PREVIEW_Y - 12).setDepth(20)
    this.previewTxt.setText(t('combat.dieRolling'))
    AudioSystem.play('dice')

    this.dieEntries = xs.map((x, i) => {
      const gfx = this.add.graphics().setPosition(x, dieY).setDepth(20)
      this.drawCardEffectDieFace(gfx, 1)
      const zone = this.add
        .zone(x, dieY, 24, 24)
        .setInteractive({ useHandCursor: true })
        .setDepth(22)
      zone.on('pointerdown', () => this.onDieTap(i))
      return { gfx, backTxt: null, zone }
    })

    const reducedMotion = preferReducedMotion()
    this.tweens.add({
      targets: this.dieEntries.map(e => e.gfx),
      scaleX: 1.12,
      scaleY: 1.12,
      angle: 360,
      duration: reducedMotion ? 140 : 280,
      ease: 'Sine.InOut',
      onComplete: () => {
        for (const entry of this.dieEntries) {
          this.drawCardEffectDieBack(entry.gfx)
          entry.gfx.setScale(1).setAngle(0)
          entry.backTxt = addPixelText(this, entry.gfx.x, entry.gfx.y, '?', {
            fontSize: '8px',
            color: '#b491d4',
          }).setOrigin(0.5).setDepth(21)
        }
        this.cardEffectDiePhase = 'pickTwo'
        this.previewTxt.setText(t('combat.diePickTwo'))
      },
    })
  }

  private revealDieFace(index: number) {
    const entry = this.dieEntries[index]
    const roll = this.pendingDiceRolls[index]
    if (!entry || !roll) return
    entry.backTxt?.destroy()
    entry.backTxt = null
    this.drawCardEffectDieFace(entry.gfx, roll.face)
  }

  private onDieTap(index: number) {
    const roll = this.pendingDiceRolls[index]
    if (!roll) return
    if (this.cardEffectDiePhase === 'pickTwo') {
      if (this.pickedDieIndices.includes(index)) return
      this.pickedDieIndices.push(index)
      this.revealDieFace(index)
      AudioSystem.play('select')
      if (this.pickedDieIndices.length === 2) {
        const leftover = this.dieEntries.findIndex((_, i) => !this.pickedDieIndices.includes(i))
        if (leftover >= 0) this.dieEntries[leftover]!.gfx.setAlpha(0.4)
        this.cardEffectDiePhase = 'pickOne'
        this.previewTxt.setText(t('combat.diePickOne'))
      }
      return
    }
    if (this.cardEffectDiePhase === 'pickOne' || this.cardEffectDiePhase === 'reveal') {
      if (!this.pickedDieIndices.includes(index)) return
      const firstSelection = this.cardEffectDiePhase === 'pickOne'
      this.cardEffectDiePhase = 'reveal'
      this.keptDieIndex = index
      AudioSystem.play('select')
      for (const [i, entry] of this.dieEntries.entries()) {
        if (!this.pickedDieIndices.includes(i)) {
          if (firstSelection) this.revealDieFace(i)
          entry.gfx.setAlpha(0.45).setScale(1)
        } else if (i === index) {
          entry.gfx.setAlpha(1).setScale(1.2)
        } else {
          entry.gfx.setAlpha(0.45).setScale(1)
        }
      }
      this.previewTxt.setText(t('combat.dieResult', {
        face: roll.face,
        multiplier: roll.multiplier,
      }))
      if (firstSelection) {
        this.restoreEndTurnButtonLayout()
        this.endTurnBtn.setInteractive({ useHandCursor: true })
        this.endTurnBtn.setFillStyle(0x24472f, 1)
        this.endTurnBtn.setStrokeStyle(1, 0x66bb77)
        this.endTurnTxt.setColor('#baf2c4')
        this.endTurnTxt.setText(t('combat.attack'))
      }
    }
  }

  private confirmDieAttack() {
    if (this.cardEffectDiePhase !== 'reveal') return
    const played = this.pendingDiePlayed
    const roll = this.pendingDiceRolls[this.keptDieIndex]
    this.clearPendingDiceUi()
    this.disableInput()
    if (played && roll) this.resolveRolledPlayerTurn(played, roll.multiplier)
  }

  private resolveRolledPlayerTurn(
    played: RunCard[],
    multiplier: CardEffectMultiplier,
  ) {
    // Poison tick on enemy at start of our resolve (their start-of-turn already done)
    const hero = toFighter(
      this.state.hp,
      this.state.maxHp,
      this.state.heroShield,
      this.state.heroPoison,
      this.state.bonusDmgFlat,
      this.heroCombatResistances(),
    )
    const foe = toFighter(
      this.enemy.hp,
      this.enemy.maxHp,
      this.enemy.shield,
      this.enemy.poison,
      0,
      this.enemy.resistances,
    )

    const result = CombatEngine.resolvePlayerTurn(
      played,
      this.state,
      hero,
      foe,
      multiplier,
    )
    this.state.hp = hero.hp
    this.state.heroShield = hero.shield
    this.state.heroPoison = hero.poison
    this.enemy.hp = foe.hp
    this.enemy.shield = foe.shield
    this.enemy.poison = foe.poison
    this.gainCombatResists(result.applied.resist)

    if (result.applied.damage > 0) {
      DamageNumbers.show(this, this.enemyArenaX, ENEMY_ARENA_Y - 48, result.applied.damage, '#ff4444')
      this.shakeTarget(this.enemyGfx)
      AudioSystem.play('hit')
    }
    if (result.applied.heal > 0) {
      DamageNumbers.show(this, this.heroArenaX, HERO_ARENA_Y - 48, result.applied.heal, '#66ff99')
    }
    this.applyHeroShieldBar()
    this.bindEnemyBars()
    this.updateStatusTxt()

    endTurnDraw(this.deck)
    this.refreshHandUi()
    this.refreshSlotUi()
    this.updatePreview()

    if (!this.enemy.alive) {
      this.time.delayedCall(400, () => this.onEnemyKilled())
      return
    }

    this.tryEcho()

    if (this.enemy.skill === 'split') {
      this.enemy.bonusDef += 2
    }

    this.time.delayedCall(450, () => this.runEnemyTurn())
  }

  private runEnemyTurn() {
    this.endTurnTxt.setText(t('combat.enemyTurn'))

    const enemyActor = {
      hp: this.enemy.hp,
      maxHp: this.enemy.maxHp,
      shield: this.enemy.shield,
      poison: this.enemy.poison,
      resistances: this.enemy.resistances,
    }
    const pDmg = CombatEngine.startTurnPoison(enemyActor)
    this.enemy.hp = enemyActor.hp
    this.enemy.poison = enemyActor.poison
    if (pDmg > 0) {
      DamageNumbers.show(this, this.enemyArenaX, ENEMY_ARENA_Y - 40, pDmg, '#88cc44')
      this.bindEnemyBars()
    }
    if (!this.enemy.alive) {
      this.time.delayedCall(300, () => this.onEnemyKilled())
      return
    }

    this.tryEcho()

    const choice = EnemyAI.choosePlays(
      this.enemyDeck.hand,
      this.enemy.actionSlots,
      {
        hp: this.enemy.hp,
        maxHp: this.enemy.maxHp,
        shield: this.enemy.shield,
        poison: this.enemy.poison,
        resistances: this.enemy.resistances,
      },
      {
        hp: this.state.hp,
        maxHp: this.state.maxHp,
        shield: this.state.heroShield,
        poison: this.state.heroPoison,
        resistances: this.heroCombatResistances(),
      },
    )

    // Visually move chosen cards into "slots" briefly
    for (const c of choice) {
      playFromHand(this.enemyDeck, c.id)
    }

    this.time.delayedCall(500, () => {
      const hero = toFighter(
        this.state.hp,
        this.state.maxHp,
        this.state.heroShield,
        this.state.heroPoison,
        0,
        this.heroCombatResistances(),
      )
      const foe = toFighter(
        this.enemy.hp,
        this.enemy.maxHp,
        this.enemy.shield,
        this.enemy.poison,
        0,
        this.enemy.resistances,
      )
      const result = CombatEngine.resolveTurn(choice, foe, hero)

      this.state.hp = hero.hp
      this.state.heroShield = hero.shield
      this.state.heroPoison = hero.poison
      this.enemy.hp = foe.hp
      this.enemy.shield = foe.shield
      this.enemy.poison = foe.poison

      if (result.applied.damage > 0) {
        DamageNumbers.show(this, this.heroArenaX, HERO_ARENA_Y - 48, result.applied.damage, '#ff4444')
        this.shakeTarget(this.heroGfx)
        AudioSystem.play('hit')
      }
      this.applyHeroShieldBar()
      this.bindEnemyBars()
      this.updateStatusTxt()

      if (this.enemy.skill === 'steal' && result.applied.damage > 0) {
        const stolen = Math.min(5, this.state.coins)
        this.state.coins -= stolen
      }

      endTurnDraw(this.enemyDeck)

      if (this.state.hp <= 0) {
        trySecondWind(this.state)
        this.applyHeroShieldBar()
        if (this.state.hp <= 0) {
          this.time.delayedCall(300, () => this.onHeroKilled())
          return
        }
      }

      // Hero poison tick at start of next player turn
      const heroActor = {
        hp: this.state.hp,
        maxHp: this.state.maxHp,
        shield: this.state.heroShield,
        poison: this.state.heroPoison,
        resistances: this.state.heroResistances,
      }
      const hPoison = CombatEngine.startTurnPoison(heroActor)
      this.state.hp = heroActor.hp
      this.state.heroPoison = heroActor.poison
      if (hPoison > 0) {
        DamageNumbers.show(this, this.heroArenaX, HERO_ARENA_Y - 40, hPoison, '#88cc44')
        this.applyHeroShieldBar()
      }
      this.updateStatusTxt()

      if (this.state.hp <= 0) {
        this.time.delayedCall(300, () => this.onHeroKilled())
        return
      }

      SaveSystem.save('quicksave', this.state)
      this.enableInput()
    })
  }

  private onHeroKilled() {
    SaveSystem.abandonQuicksave()
    AudioSystem.play('ko')
    this.time.delayedCall(400, () => {
      this.scene.start('GameOverScene', { runState: this.state, victory: false })
    })
  }

  private onEnemyKilled() {
    applyPassiveOnKill(this.state)
    this.applyHeroShieldBar()
    SaveSystem.save('quicksave', this.state)
    AudioSystem.play('ko')

    const koTxt = addPixelText(this, this.enemyArenaX, ENEMY_ARENA_Y - 48, t('combat.ko'), {
      fontSize: '16px',
      color: '#ffcc44',
    }).setOrigin(0.5).setDepth(50)

    this.tweens.add({
      targets: [this.enemyGfx, koTxt],
      alpha: 0,
      y: '-=24',
      duration: 320,
      onComplete: () => {
        koTxt.destroy()
        this.wave.shift()
        if (this.wave.length === 0) {
          if (this.state.pendingRewardTier === 'boss') {
            this.scene.start('RewardScene', { runState: this.state })
            return
          }
          const souls = rollCombatSouls(
            this.state.pendingRewardTier,
            this.state.floor,
          )
          this.state.coins += souls
          SaveSystem.save('quicksave', this.state)
          this.scene.start('ShopScene', {
            runState: this.state,
            postCombat: true,
            soulsGained: souls,
          })
          return
        }
        this.enemy = this.wave[0]!
        this.spawnNextEnemy()
      },
    })
  }

  /** 'echo' skill: first time the enemy drops to 50% HP it summons a copy. */
  private tryEcho() {
    const e = this.enemy
    if (e.skill !== 'echo' || e.echoUsed || !e.alive) return
    if (e.hp > e.maxHp / 2) return
    e.echoUsed = true
    const kind = this.state.pendingNodeKind ?? 'combat'
    const copy = Enemy.forNode(kind, this.state.floor, this.state.seed, this.wave.length + 100)
    copy.maxHp = e.maxHp
    copy.hp = Math.max(1, Math.floor(e.maxHp / 2))
    copy.echoUsed = true
    this.wave.push(copy)
    this.redrawEnemyQueue()
    AudioSystem.play('ui')
    const txt = addPixelText(this, this.enemyArenaX, ENEMY_ARENA_Y - 62, t('combat.echo'), {
      fontSize: '8px',
      color: '#c9a7d8',
    }).setOrigin(0.5).setDepth(50)
    this.tweens.add({ targets: txt, alpha: 0, y: '-=12', duration: 900, onComplete: () => txt.destroy() })
  }

  private spawnNextEnemy() {
    this.enemyDeck = createCombatDeck(this.enemy.deckDefs, this.enemy.actionSlots)
    fillHand(this.enemyDeck)
    this.enemyGfx.destroy()
    this.enemyGfx = this.drawCharacter(this.enemyArenaX, ENEMY_ARENA_Y, ENEMY_SCALE, 0xcc6666)
    this.bindEnemyBars()
    this.redrawEnemyQueue()
    this.enableInput()
  }

  private shakeTarget(target: Phaser.GameObjects.Graphics) {
    const rest = this.shakeRests.get(target) ?? { x: target.x, y: target.y }
    this.shakeRests.set(target, rest)
    this.shakeTimers.get(target)?.remove(false)
    const start = this.time.now
    const duration = 180
    const intensity = 3
    const event = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const t = this.time.now - start
        if (t >= duration) {
          target.x = rest.x
          target.y = rest.y
          this.shakeRests.delete(target)
          this.shakeTimers.delete(target)
          event.remove()
          return
        }
        const damp = 1 - t / duration
        target.x = rest.x + (Math.random() * 2 - 1) * intensity * damp
        target.y = rest.y + (Math.random() * 2 - 1) * intensity * damp
      },
    })
    this.shakeTimers.set(target, event)
  }
}
