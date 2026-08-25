import Phaser from 'phaser'
import { getRunState, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { addPixelText } from '../ui/pixelText'
import { markCurrentNodeCleared } from './MapScene'
import { t } from '../i18n/I18n'
import type { RunState } from '../domain/progression/RunState'

export class RestScene extends Phaser.Scene {
  private locked = false

  constructor() {
    super('RestScene')
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

    addPixelText(this, cx, 40, t('rest.title'), {
      fontSize: '12px', color: '#66cccc', fontStyle: 'bold',
    }).setOrigin(0.5)

    const healAmt = Math.floor(rs.maxHp * 0.35)
    const choices = [
      {
        label: t('rest.sleep', { n: healAmt }),
        apply: () => {
          rs.hp = Math.min(rs.maxHp, rs.hp + healAmt)
        },
      },
      {
        label: t('rest.guard'),
        apply: () => {
          rs.bonusDefFlat += 1
          rs.heroShield += 1
        },
      },
      {
        label: t('rest.train'),
        apply: () => {
          rs.bonusDmgFlat += 1
        },
      },
    ]

    choices.forEach((c, i) => {
      addPixelText(this, cx, 100 + i * 32, `[${i + 1}] ${c.label}`, {
        fontSize: '8px', color: '#dddddd',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.pick(rs, c.apply))
    })
  }

  private pick(rs: RunState, apply: () => void) {
    if (this.locked) return
    this.locked = true
    apply()
    markCurrentNodeCleared(rs)
    SaveSystem.save('quicksave', rs)
    this.scene.start('MapScene', { runState: rs })
  }
}
