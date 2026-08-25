import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { addBackButton } from '../ui/BackButton'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import {
  cardDef,
  formatCardRef,
  makeRunCardFromRef,
  parseCardRef,
} from '../domain/cards/Card'
import {
  ascend,
  ascendCandidates,
  cardsOfRarity,
  fuse,
  fuseCandidates,
  nextRarity,
} from '../domain/cards/Fusion'
import { DECK_SIZE } from '../domain/cards/Packs'
import { CardSprite } from '../ui/CardSprite'
import { t, tKey } from '../i18n/I18n'

export class AscensionScene extends Phaser.Scene {
  private statusTxt!: Phaser.GameObjects.Text
  private content: Phaser.GameObjects.GameObject[] = []
  private choosingAscend: string | null = null

  constructor() {
    super('AscensionScene')
  }

  create() {
    const { width } = this.cameras.main
    const cx = width / 2

    addPixelText(this, cx, 12, t('asc.title'), {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.statusTxt = addPixelText(this, cx, 28, t('asc.hint'), {
      fontSize: '8px',
      color: '#aaaaaa',
      wordWrap: { width: width - 16 },
      align: 'center',
    }).setOrigin(0.5)

    addBackButton(this, () => this.scene.start('MenuScene'))
    bindSceneKeys(this, {
      'keydown-ESC': () => {
        if (this.choosingAscend) {
          this.choosingAscend = null
          this.refresh()
        } else {
          this.scene.start('MenuScene')
        }
      },
    })

    this.refresh()
  }

  private clearContent() {
    for (const o of this.content) o.destroy()
    this.content = []
  }

  private refresh() {
    this.clearContent()
    const collection = MetaProgression.getCardCollectionMap()

    if (this.choosingAscend) {
      this.drawAscendChoices(collection, this.choosingAscend)
      return
    }

    const fuses = fuseCandidates(collection)
    const ascends = ascendCandidates(collection)

    if (fuses.length === 0 && ascends.length === 0) {
      const empty = addPixelText(
        this,
        this.cameras.main.width / 2,
        120,
        t('asc.empty'),
        { fontSize: '8px', color: '#666677' },
      ).setOrigin(0.5)
      this.content.push(empty)
      return
    }

    let y = 52
    if (fuses.length > 0) {
      const header = addPixelText(this, 12, y, t('asc.fuseHeader'), {
        fontSize: '8px',
        color: '#88ff88',
      })
      this.content.push(header)
      y += 16
      for (const ref of fuses.slice(0, 8)) {
        y = this.drawFuseRow(collection, ref, y)
      }
    }

    if (ascends.length > 0) {
      y += 8
      const header = addPixelText(this, 12, y, t('asc.ascendHeader'), {
        fontSize: '8px',
        color: '#ffcc66',
      })
      this.content.push(header)
      y += 16
      for (const ref of ascends.slice(0, 6)) {
        y = this.drawAscendRow(collection, ref, y)
      }
    }
  }

  private drawFuseRow(
    collection: Record<string, number>,
    ref: string,
    y: number,
  ): number {
    const parsed = parseCardRef(ref)
    if (!parsed) return y
    const card = makeRunCardFromRef(ref)
    if (!card) return y
    const sprite = new CardSprite(this, 34, y + 32, card)
    this.content.push(sprite)

    const name = tKey(`card.${parsed.defId}.name`, parsed.defId)
    const count = collection[ref] ?? 0
    const label = addPixelText(
      this,
      70,
      y + 20,
      t('asc.fuseRow', { name, level: parsed.level, n: count }),
      { fontSize: '8px', color: '#dddddd', wordWrap: { width: 120 } },
    )
    this.content.push(label)

    const btn = addPixelText(this, 210, y + 28, t('asc.fuse'), {
      fontSize: '8px',
      color: '#88ff88',
    }).setOrigin(0.5)
    enableTouchTarget(btn, { min: 22 })
    btn.on('pointerdown', () => this.doFuse(ref))
    this.content.push(btn)
    return y + 70
  }

  private drawAscendRow(
    collection: Record<string, number>,
    ref: string,
    y: number,
  ): number {
    const parsed = parseCardRef(ref)
    if (!parsed) return y
    const card = makeRunCardFromRef(ref)
    if (!card) return y
    const sprite = new CardSprite(this, 34, y + 32, card)
    this.content.push(sprite)

    const name = tKey(`card.${parsed.defId}.name`, parsed.defId)
    const count = collection[ref] ?? 0
    const def = cardDef(parsed.defId)
    const next = def ? nextRarity(def.rarity) : null
    const label = addPixelText(
      this,
      70,
      y + 20,
      t('asc.ascendRow', {
        name,
        level: parsed.level,
        n: count,
        rarity: next ?? '?',
      }),
      { fontSize: '8px', color: '#dddddd', wordWrap: { width: 120 } },
    )
    this.content.push(label)

    const btn = addPixelText(this, 210, y + 28, t('asc.ascend'), {
      fontSize: '8px',
      color: '#ffcc66',
    }).setOrigin(0.5)
    enableTouchTarget(btn, { min: 22 })
    btn.on('pointerdown', () => {
      this.choosingAscend = ref
      AudioSystem.play('ui')
      this.refresh()
    })
    this.content.push(btn)
    return y + 70
  }

  private drawAscendChoices(
    collection: Record<string, number>,
    ref: string,
  ) {
    const parsed = parseCardRef(ref)
    const def = parsed ? cardDef(parsed.defId) : undefined
    if (!parsed || !def) return
    const next = nextRarity(def.rarity)
    if (!next) return
    const choices = cardsOfRarity(next)
    const cx = this.cameras.main.width / 2
    const title = addPixelText(
      this,
      cx,
      52,
      t('asc.choose', { rarity: next }),
      { fontSize: '8px', color: '#ffcc66' },
    ).setOrigin(0.5)
    this.content.push(title)

    choices.forEach((id, i) => {
      const col = i % 4
      const row = Math.floor(i / 4)
      const x = 40 + col * 58
      const y = 110 + row * 80
      const card = makeRunCardFromRef(formatCardRef(id, parsed.level))
      if (!card) return
      const sprite = new CardSprite(this, x, y, card)
      sprite.onTap = () => this.doAscend(ref, id)
      this.content.push(sprite)
    })

    // keep collection param used for lint
    void collection
  }

  private doFuse(ref: string) {
    const collection = MetaProgression.getCardCollectionMap()
    const result = fuse(collection, ref)
    if (!result.ok) {
      AudioSystem.play('ui')
      this.statusTxt.setText(t('asc.fail'))
      return
    }
    MetaProgression.setCardCollection(result.collection)
    this.repairActiveDeck()
    AudioSystem.play('select')
    this.statusTxt.setText(
      t(result.glitched ? 'asc.glitch' : 'asc.fused', { ref: result.result }),
    )
    this.refresh()
  }

  private doAscend(ref: string, chosenDefId: string) {
    const collection = MetaProgression.getCardCollectionMap()
    const result = ascend(collection, ref, chosenDefId)
    if (!result.ok) {
      AudioSystem.play('ui')
      this.statusTxt.setText(t('asc.fail'))
      return
    }
    MetaProgression.setCardCollection(result.collection)
    this.repairActiveDeck()
    this.choosingAscend = null
    AudioSystem.play('select')
    this.statusTxt.setText(
      t(result.crit ? 'asc.crit' : 'asc.ascended', { ref: result.result }),
    )
    this.refresh()
  }

  /** Drop deck slots that exceed owned copies after fusion. */
  private repairActiveDeck() {
    const collection = MetaProgression.getCardCollectionMap()
    const deck = MetaProgression.getActiveDeck()
    const used = new Map<string, number>()
    const next: string[] = []
    for (const ref of deck) {
      const have = collection[ref] ?? 0
      const u = used.get(ref) ?? 0
      if (u < have) {
        next.push(ref)
        used.set(ref, u + 1)
      }
    }
    for (const [ref, owned] of Object.entries(collection)) {
      while (next.length < DECK_SIZE && (used.get(ref) ?? 0) < owned) {
        next.push(ref)
        used.set(ref, (used.get(ref) ?? 0) + 1)
      }
    }
    while (next.length < DECK_SIZE) next.push('strike')
    MetaProgression.setActiveDeck(next.slice(0, DECK_SIZE))
  }
}
