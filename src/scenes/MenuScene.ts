import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { startCampaignRun } from '../domain/progression/startRun'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { SaveSystem } from '../systems/SaveSystem'
import { t } from '../i18n/I18n'
import { enableTouchTarget } from '../ui/touchTarget'
import { syncRotateHintLocale } from '../ui/rotateHint'

const SCENE_KEYS = [
  'BootScene',
  'PreloadScene',
  'MenuScene',
  'MapScene',
  'CombatScene',
  'RewardScene',
  'EventScene',
  'ShopScene',
  'ForgeScene',
  'GameOverScene',
  'InventoryScene',
]

const DESCEND_KEY = '__descend__'

interface MenuItem {
  label: string
  sceneKey: string
  text: Phaser.GameObjects.Text
}

export class MenuScene extends Phaser.Scene {
  private items: MenuItem[] = []
  private selectedIndex = 0
  private inputLocked = false

  constructor() {
    super('MenuScene')
  }

  init() {
    this.inputLocked = false
    this.selectedIndex = 0
    this.items = []
  }

  create() {
    MetaProgression.load()
    syncRotateHintLocale()

    // Brand-new players: open starter packs once, then floor 1.
    if (!MetaProgression.hasOpenedStarterPacks()) {
      this.scene.start('PackOpenScene', { mode: 'starter' })
      return
    }
    if (!MetaProgression.isTutorialDone()) {
      const existing = SaveSystem.load('quicksave')
      const state =
        existing && existing.floor === 1
          ? existing
          : startCampaignRun(1)
      this.scene.start('MapScene', { runState: state })
      return
    }

    const { width, height } = this.cameras.main
    const cx = width / 2
    const startY = 84
    const spacing = 24

    const unlock = () => AudioSystem.unlock()
    this.input.on('pointerdown', unlock)

    addPixelText(this, cx, 36, 'EXOGEN', {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)

    addPixelText(this, cx, 58, t('menu.gold', { n: MetaProgression.getGold() }), {
      fontSize: '8px',
      color: '#ffcc66',
    }).setOrigin(0.5)

    const floor = MetaProgression.getCampaignFloor()
    const entries: ReadonlyArray<readonly [string, string]> = [
      [t('menu.descendFloor', { n: floor }), DESCEND_KEY],
      [t('menu.deck'), 'DeckScene'],
      [t('menu.store'), 'StoreScene'],
      [t('menu.ascension'), 'AscensionScene'],
      [t('menu.inventory'), 'InventoryScene'],
      [t('menu.forge'), 'ForgeScene'],
      [t('menu.tree'), 'SkillTreeScene'],
      [t('menu.lore'), 'LoreScene'],
      [t('menu.options'), 'OptionsScene'],
    ]

    this.items = entries.map(([label, sceneKey], i) => {
      const text = addPixelText(this, cx, startY + i * spacing, label, {
        fontSize: '16px',
        color: '#888888',
      }).setOrigin(0.5)
      enableTouchTarget(text, { min: 24 })
      text.on('pointerover', () => this.select(i))
      text.on('pointerdown', () => this.confirm(i))
      return { label, sceneKey, text }
    })

    this.select(0)

    addPixelText(this, cx, height - 12, t('menu.hint'), {
      fontSize: '8px',
      color: '#666666',
    }).setOrigin(0.5)

    const debugKeys = SCENE_KEYS as readonly string[]
    bindSceneKeys(this, {
      keydown: unlock,
      'keydown-UP': () => this.move(-1),
      'keydown-DOWN': () => this.move(1),
      'keydown-ENTER': () => this.confirm(this.selectedIndex),
      'keydown-ONE': () => this.scene.start(debugKeys[0]),
      'keydown-TWO': () => this.scene.start(debugKeys[1]),
      'keydown-THREE': () => this.scene.start(debugKeys[2]),
      'keydown-FOUR': () => this.scene.start(debugKeys[3]),
      'keydown-FIVE': () => this.scene.start(debugKeys[4]),
      'keydown-SIX': () => this.scene.start(debugKeys[5]),
      'keydown-SEVEN': () => this.scene.start(debugKeys[6]),
      'keydown-EIGHT': () => this.scene.start(debugKeys[7]),
      'keydown-NINE': () => this.scene.start(debugKeys[8]),
      'keydown-BACKSPACE': () => this.scene.start(debugKeys[9]),
      'keydown-ESC': () => this.scene.start(debugKeys[10]),
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', unlock)
    })
  }

  private move(dir: number) {
    const next = (this.selectedIndex + dir + this.items.length) % this.items.length
    this.select(next)
  }

  private select(index: number) {
    const changing = index !== this.selectedIndex
    const prev = this.items[this.selectedIndex]
    if (prev && changing) prev.text.setColor('#888888')
    this.selectedIndex = index
    const next = this.items[index]
    if (next) next.text.setColor('#ffffff')
    if (changing) AudioSystem.play('ui')
  }

  private confirm(index: number) {
    if (this.inputLocked) return
    this.inputLocked = true
    const item = this.items[index]
    if (!item) return
    AudioSystem.unlock()
    AudioSystem.play('select')
    this.time.delayedCall(150, () => {
      if (item.sceneKey === DESCEND_KEY) {
        if (!MetaProgression.hasOpenedStarterPacks()) {
          this.scene.start('PackOpenScene', { mode: 'starter' })
          return
        }
        const state = startCampaignRun()
        this.scene.start('MapScene', { runState: state })
        return
      }
      this.scene.start(item.sceneKey)
    })
  }
}
