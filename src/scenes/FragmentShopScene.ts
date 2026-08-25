import Phaser from 'phaser'
import { getRunState, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { addPixelText } from '../ui/pixelText'
import { enableTouchTarget } from '../ui/touchTarget'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { AudioSystem } from '../systems/AudioSystem'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { GEAR_SLOTS, type GearSlot } from '../domain/items/Item'
import { advanceFloorAfterBoss } from '../domain/progression/advanceDepth'
import { slotLabel, t } from '../i18n/I18n'
import type { RunState } from '../domain/progression/RunState'

const BASE_COST: Record<GearSlot, number> = {
  hat: 25,
  cape: 25,
  belt: 25,
  ring: 30,
  boots: 30,
}

function fragmentCost(slot: GearSlot, floor: number): number {
  return BASE_COST[slot] + (floor - 1) * 5
}

export class FragmentShopScene extends Phaser.Scene {
  private state!: RunState
  private locked = false
  private almasTxt!: Phaser.GameObjects.Text
  private stockTxt!: Phaser.GameObjects.Text
  private offerTexts: Phaser.GameObjects.Text[] = []

  constructor() {
    super('FragmentShopScene')
  }

  init() {
    this.locked = false
    this.offerTexts = []
  }

  create() {
    const { width, height } = this.cameras.main
    const cx = width / 2
    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }
    this.state = rs
    renderDebugHeader(this, this.state)

    addPixelText(this, cx, 20, t('fragmentShop.title'), {
      fontSize: '16px',
      color: '#ffcc66',
    }).setOrigin(0.5)

    this.almasTxt = addPixelText(this, cx, 40, '', {
      fontSize: '8px',
      color: '#aaddff',
    }).setOrigin(0.5)

    this.stockTxt = addPixelText(this, cx, 54, '', {
      fontSize: '8px',
      color: '#aaaaaa',
    }).setOrigin(0.5)

    this.drawOffers(cx)
    this.refreshHud()

    const cont = addPixelText(this, cx, height - 28, t('fragmentShop.continue'), {
      fontSize: '8px',
      color: '#88ff88',
    }).setOrigin(0.5)
    enableTouchTarget(cont)
    cont.on('pointerover', () => cont.setColor('#ccffcc'))
    cont.on('pointerout', () => cont.setColor('#88ff88'))
    cont.on('pointerdown', () => this.continueFlow())

    addPixelText(this, cx, height - 12, t('fragmentShop.hint'), {
      fontSize: '8px',
      color: '#666666',
    }).setOrigin(0.5)

    bindSceneKeys(this, {
      'keydown-ONE': () => this.buy(GEAR_SLOTS[0]),
      'keydown-TWO': () => this.buy(GEAR_SLOTS[1]),
      'keydown-THREE': () => this.buy(GEAR_SLOTS[2]),
      'keydown-FOUR': () => this.buy(GEAR_SLOTS[3]),
      'keydown-FIVE': () => this.buy(GEAR_SLOTS[4]),
      'keydown-ZERO': () => this.continueFlow(),
      'keydown-ENTER': () => this.continueFlow(),
    })
  }

  private drawOffers(cx: number) {
    for (const txt of this.offerTexts) txt.destroy()
    this.offerTexts = []

    GEAR_SLOTS.forEach((slot, i) => {
      const cost = fragmentCost(slot, this.state.floor)
      const can = this.state.coins >= cost
      const label = t('fragmentShop.offer', {
        n: i + 1,
        slot: slotLabel(slot),
        cost,
      })
      const txt = addPixelText(this, cx, 78 + i * 26, label, {
        fontSize: '8px',
        color: can ? '#dddddd' : '#555555',
      }).setOrigin(0.5)
      if (can) {
        enableTouchTarget(txt, { min: 22 })
        txt.on('pointerover', () => txt.setColor('#ffffff'))
        txt.on('pointerout', () => txt.setColor('#dddddd'))
        txt.on('pointerdown', () => this.buy(slot))
      }
      this.offerTexts.push(txt)
    })
  }

  private refreshHud() {
    const fr = MetaProgression.getFragments()
    this.almasTxt.setText(t('fragmentShop.almas', { n: this.state.coins }))
    this.stockTxt.setText(
      t('fragmentShop.stock', {
        hat: fr.hat,
        cape: fr.cape,
        belt: fr.belt,
        ring: fr.ring,
        boots: fr.boots,
      }),
    )
  }

  private buy(slot: GearSlot) {
    if (this.locked) return
    const cost = fragmentCost(slot, this.state.floor)
    if (this.state.coins < cost) {
      AudioSystem.play('ui')
      return
    }
    this.state.coins -= cost
    MetaProgression.addFragments(slot, 1)
    AudioSystem.play('coin')
    SaveSystem.save('quicksave', this.state)
    this.refreshHud()
    this.drawOffers(this.cameras.main.width / 2)
  }

  private continueFlow() {
    if (this.locked) return
    this.locked = true
    AudioSystem.play('select')

    advanceFloorAfterBoss(this.state)
    SaveSystem.save('quicksave', this.state)
    this.scene.start('GameOverScene', {
      runState: this.state,
      victory: true,
    })
  }
}
