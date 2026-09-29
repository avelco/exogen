import Phaser from 'phaser'
import { getRunState, renderDebugHeader } from '../debug'
import { addPixelText } from '../ui/pixelText'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { t } from '../i18n/I18n'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { SaveSystem } from '../systems/SaveSystem'
import { convertRunSoulsToGold } from '../domain/progression/advanceDepth'
import { MAX_CAMPAIGN_FLOOR } from '../domain/map/MazeGenerator'

interface GameOverData {
  runState?: import('../domain/progression/RunState').RunState
  victory?: boolean
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene')
  }

  create() {
    const { width, height } = this.cameras.main
    const cx = width / 2
    const data = this.scene.settings.data as GameOverData
    const rs = data.runState ?? getRunState(this)
    const victory = !!data.victory

    if (rs) renderDebugHeader(this, rs)

    let goldGained = 0
    if (rs) {
      goldGained = convertRunSoulsToGold(rs, victory)
    }
    SaveSystem.abandonQuicksave()

    if (victory) {
      const depth = rs?.floor ?? 1
      const subKey =
        depth >= MAX_CAMPAIGN_FLOOR ? 'gameover.victoryCampaign' : 'gameover.victorySub'
      addPixelText(this, cx, 48, t('gameover.victory'), {
        fontSize: '14px', color: '#ffcc44', fontStyle: 'bold',
      }).setOrigin(0.5)
      addPixelText(this, cx, 72, t(subKey, { n: depth }), {
        fontSize: '8px', color: '#aaaaaa',
      }).setOrigin(0.5)
    } else {
      addPixelText(this, cx, 48, t('gameover.defeat'), {
        fontSize: '14px', color: '#ff6666', fontStyle: 'bold',
      }).setOrigin(0.5)
    }

    if (goldGained > 0) {
      addPixelText(this, cx, 96, t('gameover.goldGained', { n: goldGained }), {
        fontSize: '8px',
        color: '#ffcc66',
      }).setOrigin(0.5)
    }

    const packBtn = addPixelText(this, cx, height - 56, t('gameover.openPacks'), {
      fontSize: '12px', color: '#ffcc66',
    }).setOrigin(0.5)
    enableTouchTarget(packBtn, { min: 36 })
    packBtn.on('pointerdown', () => {
      AudioSystem.play('select')
      this.scene.start('PackOpenScene', {
        mode: 'endRun',
        runState: rs,
        victory,
      })
    })

    const menuBtn = addPixelText(this, cx, height - 28, t('gameover.menu'), {
      fontSize: '10px', color: '#dddddd',
    }).setOrigin(0.5)
    enableTouchTarget(menuBtn, { min: 28 })
    menuBtn.on('pointerdown', () => {
      AudioSystem.play('ui')
      this.scene.start('MenuScene')
    })
    bindSceneKeys(this, {
      'keydown-ENTER': () =>
        this.scene.start('PackOpenScene', { mode: 'endRun', runState: rs, victory }),
      'keydown-M': () => this.scene.start('MenuScene'),
    })
  }
}
