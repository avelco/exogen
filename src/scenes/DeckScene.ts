import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { enableTouchTarget } from '../ui/touchTarget'
import { addBackButton } from '../ui/BackButton'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { DECK_SIZE } from '../domain/cards/Packs'
import { MAX_ACTION_SLOTS } from '../domain/cards/Deck'
import {
  cardDef,
  cardRarityDef,
  effectsOf,
  makeRunCardFromRef,
  parseCardRef,
} from '../domain/cards/Card'
import { ELEMENT_COLOR } from '../domain/combat/Elements'
import { t, tKey } from '../i18n/I18n'
import { CardSprite } from '../ui/CardSprite'

interface DeckSceneData {
  fromEndRun?: boolean
}

interface SelectedCard {
  id: string
  source: 'deck' | 'collection'
  index: number
}

interface CardView {
  sprite: CardSprite
  source: SelectedCard['source']
  index: number
}

const CARD_COLUMNS = 5
const COLLECTION_PAGE_SIZE = CARD_COLUMNS * 2
const CARD_GAP = 6

const DECK_LABEL_Y = 50
const DECK_ROW_Y = [90, 158]
const MID_DIVIDER_TOP_Y = 193
const DETAIL_NAME_Y = 197
const DETAIL_EFFECTS_Y = 208
const DETAIL_META_Y = 219
const ACTION_BTN_Y = 243
const MID_DIVIDER_BOTTOM_Y = 258
const COLLECTION_LABEL_Y = 265
const COLLECTION_ROW_Y = [305, 373]

export class DeckScene extends Phaser.Scene {
  private deck: string[] = []
  private collection: string[] = []
  private collectionPage = 0
  private selected: SelectedCard | null = null
  private cardViews: CardView[] = []
  private statusTxt!: Phaser.GameObjects.Text
  private detailNameTxt!: Phaser.GameObjects.Text
  private detailMetaTxt!: Phaser.GameObjects.Text
  private detailEffectsTxt!: Phaser.GameObjects.Text
  private actionBtn!: Phaser.GameObjects.Rectangle
  private actionTxt!: Phaser.GameObjects.Text

  constructor() {
    super('DeckScene')
  }

  create() {
    const data = (this.scene.settings.data ?? {}) as DeckSceneData
    const { width, height } = this.cameras.main
    const cx = width / 2

    this.deck = MetaProgression.getActiveDeck()
    this.collection = MetaProgression.getCardCollection()
    this.selected = null
    this.cardViews = []

    addPixelText(this, cx, 10, t('deck.title'), {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5)

    const slots = MetaProgression.getActionSlots()
    addPixelText(this, cx, 26, t('deck.slots', { n: slots, max: MAX_ACTION_SLOTS }), {
      fontSize: '8px',
      color: '#88aacc',
    }).setOrigin(0.5)

    this.statusTxt = addPixelText(this, cx, 38, '', {
      fontSize: '8px',
      color: '#aaaaaa',
      wordWrap: { width: width - 16 },
      align: 'center',
    }).setOrigin(0.5)

    this.createActionBand()
    this.drawCards()

    if (slots < MAX_ACTION_SLOTS) {
      const unlock = addPixelText(
        this,
        cx,
        height - 62,
        t('deck.unlockSlot', { pts: MetaProgression.getSkillPoints() }),
        { fontSize: '8px', color: '#ffcc66' },
      ).setOrigin(0.5)
      enableTouchTarget(unlock, { min: 20 })
      unlock.on('pointerdown', () => {
        if (MetaProgression.tryUnlockActionSlot()) {
          AudioSystem.play('select')
          this.scene.restart(data)
        } else {
          AudioSystem.play('ui')
          this.statusTxt.setText(t('deck.unlockFail'))
        }
      })
    }

    const saveBtn = addPixelText(this, cx, height - 40, t('deck.save'), {
      fontSize: '8px',
      color: '#88cc88',
    }).setOrigin(0.5)
    enableTouchTarget(saveBtn, { min: 28 })
    saveBtn.on('pointerdown', () => {
      if (MetaProgression.setActiveDeck(this.deck)) {
        AudioSystem.play('select')
        this.scene.start('MenuScene')
      } else {
        this.statusTxt.setText(t('deck.saveFail'))
      }
    })

    if (!data.fromEndRun) {
      addBackButton(this, () => this.scene.start('MenuScene'))
    }

    bindSceneKeys(this, {
      'keydown-ESC': () => this.scene.start('MenuScene'),
    })
  }

  private drawCards() {
    const { width } = this.cameras.main
    const cx = width / 2
    addPixelText(this, cx, DECK_LABEL_Y, t('deck.activeCount', {
      n: this.deck.length,
      max: DECK_SIZE,
    }), {
      fontSize: '8px',
      color: '#88ff88',
    }).setOrigin(0.5)

    this.deck.forEach((id, i) => {
      const card = makeRunCardFromRef(id)
      if (!card) return
      const sprite = new CardSprite(
        this,
        this.cardX(i % CARD_COLUMNS),
        DECK_ROW_Y[Math.floor(i / CARD_COLUMNS)] ?? DECK_ROW_Y[1]!,
        card,
      )
      this.bindCard(sprite, { id, source: 'deck', index: i })
    })

    const extras = this.collectionExtras()
    const pageCount = Math.max(1, Math.ceil(extras.length / COLLECTION_PAGE_SIZE))
    this.collectionPage = Phaser.Math.Clamp(this.collectionPage, 0, pageCount - 1)

    addPixelText(this, cx, COLLECTION_LABEL_Y, t('deck.collectionPage', {
      current: this.collectionPage + 1,
      total: pageCount,
    }), {
      fontSize: '8px',
      color: '#88aaff',
    }).setOrigin(0.5)

    if (pageCount > 1) {
      const previous = addPixelText(this, 12, COLLECTION_LABEL_Y, '<', {
        fontSize: '8px',
        color: '#aaccff',
      }).setOrigin(0.5)
      const next = addPixelText(this, width - 12, COLLECTION_LABEL_Y, '>', {
        fontSize: '8px',
        color: '#aaccff',
      }).setOrigin(0.5)
      enableTouchTarget(previous, { min: 24 })
      enableTouchTarget(next, { min: 24 })
      previous.on('pointerdown', () => this.changePage(-1, pageCount))
      next.on('pointerdown', () => this.changePage(1, pageCount))
    }

    const pageStart = this.collectionPage * COLLECTION_PAGE_SIZE
    const visible = extras.slice(pageStart, pageStart + COLLECTION_PAGE_SIZE)
    visible.forEach((entry, i) => {
      const x = this.cardX(i % CARD_COLUMNS)
      const y = COLLECTION_ROW_Y[Math.floor(i / CARD_COLUMNS)] ?? COLLECTION_ROW_Y[1]!
      const card = makeRunCardFromRef(entry.id)
      if (!card) return
      const sprite = new CardSprite(this, x, y, card)
      this.bindCard(sprite, {
        id: entry.id,
        source: 'collection',
        index: pageStart + i,
      })
      addPixelText(this, x + 16, y + 25, `x${entry.free}`, {
        fontSize: '8px',
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(20)
    })

    if (visible.length === 0) {
      addPixelText(this, cx, COLLECTION_ROW_Y[0]!, t('deck.noExtras'), {
        fontSize: '8px',
        color: '#666677',
      }).setOrigin(0.5)
    }

    this.statusTxt.setText(t('deck.selectCard'))
  }

  private createActionBand() {
    const { width } = this.cameras.main
    const cx = width / 2
    for (const y of [MID_DIVIDER_TOP_Y, MID_DIVIDER_BOTTOM_Y]) {
      this.add.rectangle(cx, y, width - 16, 1, 0x45475a, 0.9)
    }

    this.detailNameTxt = addPixelText(this, cx, DETAIL_NAME_Y, '', {
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5, 0)
    this.detailEffectsTxt = addPixelText(this, cx, DETAIL_EFFECTS_Y, '', {
      fontSize: '8px',
      color: '#dddddd',
    }).setOrigin(0.5, 0)
    this.detailMetaTxt = addPixelText(this, cx, DETAIL_META_Y, '', {
      fontSize: '8px',
      color: '#8f91a5',
    }).setOrigin(0.5, 0)

    this.actionBtn = this.add
      .rectangle(cx, ACTION_BTN_Y, 132, 22, 0x1c1c28, 1)
      .setStrokeStyle(1, 0x44445a)
    this.actionTxt = addPixelText(this, cx, ACTION_BTN_Y, '', {
      fontSize: '8px',
      color: '#666677',
    }).setOrigin(0.5)
    this.actionBtn.on('pointerdown', () => this.applySelectedAction())
    this.refreshActionButton()
  }

  private refreshActionButton() {
    if (!this.selected) {
      this.actionBtn.disableInteractive()
      this.actionBtn.setFillStyle(0x1c1c28, 1).setStrokeStyle(1, 0x44445a)
      this.actionTxt.setText(t('deck.actionIdle')).setColor('#666677')
      return
    }
    const removing = this.selected.source === 'deck'
    this.actionBtn.setInteractive({ useHandCursor: true })
    this.actionBtn
      .setFillStyle(removing ? 0x3b2828 : 0x283b31, 1)
      .setStrokeStyle(1, removing ? 0xaa7777 : 0x77aa88)
    this.actionTxt
      .setText(removing ? t('deck.remove') : t('deck.add'))
      .setColor(removing ? '#ddbbbb' : '#bbddc4')
  }

  private bindCard(sprite: CardSprite, selected: SelectedCard) {
    const choose = () => this.selectCard(selected)
    sprite.onTap = () => {
      AudioSystem.play('ui')
      choose()
    }
    sprite.onHover = choose
    this.cardViews.push({
      sprite,
      source: selected.source,
      index: selected.index,
    })
  }

  private selectCard(selected: SelectedCard) {
    this.selected = selected
    for (const view of this.cardViews) {
      view.sprite.setSelected(
        view.source === selected.source && view.index === selected.index,
      )
    }

    const parsed = parseCardRef(selected.id)
    if (!parsed) return
    const def = cardDef(parsed.defId)
    if (!def) return
    const rarity = cardRarityDef(def.rarity)
    const card = makeRunCardFromRef(selected.id)
    const levelSuffix = parsed.level > 1 ? ` N${parsed.level}` : ''
    this.detailNameTxt
      .setText(
        `${rarity.symbol} ${tKey(`card.${parsed.defId}.name`, parsed.defId)}${levelSuffix}`,
      )
      .setColor(rarity.accentColor ?? rarity.color)
    this.detailMetaTxt.setText(
      `${tKey(`rarity.${def.rarity}`, def.rarity)} · ${rarity.technology}`,
    )
    const shown = card ? effectsOf(card) : def.effects
    this.detailEffectsTxt.setText(
      shown
        .map(effect => {
          if (effect.type === 'damage') {
            const el = effect.element ?? 'neutral'
            return `${tKey(`element.${el}`, el)} ${effect.value}`
          }
          return `${tKey(`card.effect.${effect.type}`, effect.type)} ${effect.value}`
        })
        .join(' · '),
    )
    const dmg = shown.find(e => e.type === 'damage')
    if (dmg?.element) {
      this.detailEffectsTxt.setColor(ELEMENT_COLOR[dmg.element])
    } else {
      this.detailEffectsTxt.setColor('#dddddd')
    }
    this.refreshActionButton()
    this.statusTxt.setText(t('deck.hint', { n: this.deck.length, max: DECK_SIZE }))
  }

  private applySelectedAction() {
    if (!this.selected) return
    if (this.selected.source === 'deck') {
      this.deck.splice(this.selected.index, 1)
    } else {
      if (this.deck.length >= DECK_SIZE) {
        this.statusTxt.setText(t('deck.full'))
        return
      }
      this.deck.push(this.selected.id)
    }
    AudioSystem.play('select')
    this.scene.restart(this.scene.settings.data)
  }

  private changePage(direction: number, pageCount: number) {
    this.collectionPage =
      (this.collectionPage + direction + pageCount) % pageCount
    AudioSystem.play('ui')
    this.scene.restart(this.scene.settings.data)
  }

  private collectionExtras(): Array<{ id: string; free: number }> {
    const used = new Map<string, number>()
    for (const id of this.deck) used.set(id, (used.get(id) ?? 0) + 1)
    const have = new Map<string, number>()
    for (const id of this.collection) have.set(id, (have.get(id) ?? 0) + 1)
    return [...have.entries()]
      .map(([id, count]) => ({ id, free: count - (used.get(id) ?? 0) }))
      .filter(entry => entry.free > 0)
  }

  private cardX(column: number): number {
    const { width } = this.cameras.main
    const totalW = 5 * CardSprite.WIDTH + 4 * CARD_GAP
    return width / 2 - totalW / 2 + CardSprite.WIDTH / 2
      + column * (CardSprite.WIDTH + CARD_GAP)
  }
}
