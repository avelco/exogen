import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { addBackButton } from '../ui/BackButton'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { openPack } from '../domain/cards/Packs'
import { GEAR, gearDef } from '../domain/items/Equipment'
import { GEAR_SLOTS, type GearSlot } from '../domain/items/Item'
import { gearName, t, tKey } from '../i18n/I18n'

export const PACK_GOLD_BASE = 40
export const FRAGMENT_GOLD_COST = 25

/** Pack price grows quadratically with campaign depth: 40 + depth²/9. */
export function packGoldCost(): number {
  const d = MetaProgression.getCampaignFloor()
  return PACK_GOLD_BASE + Math.floor((d * d) / 9)
}

function gearGoldCost(rarity: string): number {
  if (rarity === 'legendary') return 120
  if (rarity === 'rare') return 70
  return 35
}

type Tab = 'packs' | 'gear' | 'fragments'

export class StoreScene extends Phaser.Scene {
  private tab: Tab = 'packs'
  private statusTxt!: Phaser.GameObjects.Text
  private goldTxt!: Phaser.GameObjects.Text
  private content: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('StoreScene')
  }

  create() {
    const { width } = this.cameras.main
    const cx = width / 2

    addPixelText(this, cx, 12, t('store.title'), {
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.goldTxt = addPixelText(this, cx, 28, '', {
      fontSize: '8px',
      color: '#ffcc66',
    }).setOrigin(0.5)

    this.statusTxt = addPixelText(this, cx, 42, '', {
      fontSize: '8px',
      color: '#aaaaaa',
      wordWrap: { width: width - 16 },
      align: 'center',
    }).setOrigin(0.5)

    const tabs: Tab[] = ['packs', 'gear', 'fragments']
    tabs.forEach((tab, i) => {
      const x = 45 + i * 90
      const label = addPixelText(this, x, 60, tKey(`store.tab.${tab}`, tab), {
        fontSize: '8px',
        color: '#88aacc',
      }).setOrigin(0.5)
      enableTouchTarget(label, { min: 22 })
      label.on('pointerdown', () => {
        this.tab = tab
        AudioSystem.play('ui')
        this.refresh()
      })
    })

    addBackButton(this, () => this.scene.start('MenuScene'))
    bindSceneKeys(this, {
      'keydown-ESC': () => this.scene.start('MenuScene'),
    })

    this.refresh()
  }

  private clearContent() {
    for (const o of this.content) o.destroy()
    this.content = []
  }

  private refresh() {
    this.clearContent()
    const gold = MetaProgression.getGold()
    this.goldTxt.setText(t('menu.gold', { n: gold }))
    this.statusTxt.setText(t('store.hint'))

    if (this.tab === 'packs') this.drawPacks()
    else if (this.tab === 'gear') this.drawGear()
    else this.drawFragments()
  }

  private drawPacks() {
    const { width } = this.cameras.main
    const cx = width / 2
    const label = addPixelText(
      this,
      cx,
      120,
      t('store.packOffer', { n: packGoldCost() }),
      { fontSize: '8px', color: '#dddddd' },
    ).setOrigin(0.5)
    this.content.push(label)

    const btn = addPixelText(this, cx, 160, t('store.buyPack'), {
      fontSize: '8px',
      color: '#88ff88',
    }).setOrigin(0.5)
    enableTouchTarget(btn, { min: 28 })
    btn.on('pointerdown', () => this.buyPack())
    this.content.push(btn)
  }

  private buyPack() {
    if (!MetaProgression.spendGold(packGoldCost())) {
      AudioSystem.play('ui')
      this.statusTxt.setText(t('store.noGold'))
      return
    }
    const cards = openPack(Math.random, 'standard', MetaProgression.getCampaignFloor())
    MetaProgression.addCardsToCollection(cards)
    AudioSystem.play('coin')
    this.statusTxt.setText(t('store.packBought', { n: cards.length }))
    this.refresh()
  }

  private drawGear() {
    const { width } = this.cameras.main
    const owned = MetaProgression.ownedGearIds()
    GEAR.forEach((g, i) => {
      const y = 86 + i * 18
      if (y > 400) return
      const cost = gearGoldCost(g.rarity)
      const have = owned.has(g.id)
      const suffix = have
        ? t('store.gearDup', { n: 3 })
        : t('store.gearBuy', { n: cost })
      const line = addPixelText(
        this,
        12,
        y,
        `${gearName(g.id)} · ${suffix}`,
        {
          fontSize: '8px',
          color: have ? '#aaccff' : '#dddddd',
          wordWrap: { width: width - 24 },
        },
      )
      enableTouchTarget(line, { min: 18 })
      line.on('pointerdown', () => this.buyGear(g.id, cost, have))
      this.content.push(line)
    })
  }

  private buyGear(gearId: string, cost: number, duplicate: boolean) {
    const def = gearDef(gearId)
    if (!def) return
    if (!MetaProgression.spendGold(cost)) {
      AudioSystem.play('ui')
      this.statusTxt.setText(t('store.noGold'))
      return
    }
    if (duplicate) {
      MetaProgression.addFragments(def.slot, 3)
      AudioSystem.play('coin')
      this.statusTxt.setText(t('store.fragGained', { slot: def.slot, n: 3 }))
    } else {
      MetaProgression.addGearToBag(gearId)
      AudioSystem.play('select')
      this.statusTxt.setText(t('store.gearBought', { name: gearName(gearId) }))
    }
    this.refresh()
  }

  private drawFragments() {
    const frags = MetaProgression.getFragments()
    GEAR_SLOTS.forEach((slot, i) => {
      const y = 100 + i * 28
      const line = addPixelText(
        this,
        this.cameras.main.width / 2,
        y,
        t('store.fragOffer', {
          slot,
          stock: frags[slot],
          n: FRAGMENT_GOLD_COST,
        }),
        { fontSize: '8px', color: '#dddddd' },
      ).setOrigin(0.5)
      enableTouchTarget(line, { min: 24 })
      line.on('pointerdown', () => this.buyFragment(slot))
      this.content.push(line)
    })
  }

  private buyFragment(slot: GearSlot) {
    if (!MetaProgression.spendGold(FRAGMENT_GOLD_COST)) {
      AudioSystem.play('ui')
      this.statusTxt.setText(t('store.noGold'))
      return
    }
    MetaProgression.addFragments(slot, 1)
    AudioSystem.play('coin')
    this.statusTxt.setText(t('store.fragGained', { slot, n: 1 }))
    this.refresh()
  }
}
