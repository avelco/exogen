import Phaser from 'phaser'
import { getRunState, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { addPixelText } from '../ui/pixelText'
import type { RunState } from '../domain/progression/RunState'
import { markCurrentNodeCleared } from './MapScene'
import { t, type TranslationKey } from '../i18n/I18n'

const EVENTS: {
  titleKey: TranslationKey
  choices: { labelKey: TranslationKey; apply: (rs: RunState) => void }[]
}[] = [
  {
    titleKey: 'event.sanctuary.title',
    choices: [
      {
        labelKey: 'event.sanctuary.pray',
        apply: (rs: RunState) => {
          rs.hp = Math.min(rs.maxHp, rs.hp + Math.floor(rs.maxHp * 0.15))
        },
      },
      {
        labelKey: 'event.sanctuary.loot',
        apply: (rs: RunState) => {
          rs.coins += 12
          rs.hp = Math.max(1, rs.hp - 3)
        },
      },
    ],
  },
  {
    titleKey: 'event.merchant.title',
    choices: [
      {
        labelKey: 'event.merchant.buy',
        apply: (rs: RunState) => {
          rs.bonusDmgFlat += 1
        },
      },
      {
        labelKey: 'event.merchant.ignore',
        apply: (rs: RunState) => {
          rs.coins += 5
        },
      },
    ],
  },
  {
    titleKey: 'event.trap.title',
    choices: [
      {
        labelKey: 'event.trap.disarm',
        apply: (rs: RunState) => {
          if (Math.random() < 0.5) rs.hp = Math.max(1, rs.hp - 5)
        },
      },
      {
        labelKey: 'event.trap.flee',
        apply: (rs: RunState) => {
          rs.coins += 8
        },
      },
    ],
  },
]

export class EventScene extends Phaser.Scene {
  private locked = false

  constructor() {
    super('EventScene')
  }

  init() {
    this.locked = false
  }

  create() {
    const { width } = this.cameras.main
    const cx = width / 2
    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }

    renderDebugHeader(this, rs)
    const ev = EVENTS[(rs.floor + (rs.currentNodeId ?? 0)) % EVENTS.length]

    addPixelText(this, cx, 40, t(ev.titleKey), {
      fontSize: '10px', color: '#ccaaee', fontStyle: 'bold',
    }).setOrigin(0.5)

    ev.choices.forEach((c, i) => {
      addPixelText(this, cx, 100 + i * 28, `[${i + 1}] ${t(c.labelKey)}`, {
        fontSize: '8px', color: '#dddddd',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.choose(rs, c.apply))
    })
  }

  private choose(rs: RunState, apply: (rs: RunState) => void) {
    if (this.locked) return
    this.locked = true
    apply(rs)
    markCurrentNodeCleared(rs)
    SaveSystem.save('quicksave', rs)
    this.scene.start('MapScene', { runState: rs })
  }
}
