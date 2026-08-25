import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PreloadScene } from './scenes/PreloadScene'
import { MenuScene } from './scenes/MenuScene'
import { MapScene } from './scenes/MapScene'
import { CombatScene } from './scenes/CombatScene'
import { RewardScene } from './scenes/RewardScene'
import { EventScene } from './scenes/EventScene'
import { ShopScene } from './scenes/ShopScene'
import { ForgeScene } from './scenes/ForgeScene'
import { RestScene } from './scenes/RestScene'
import { GameOverScene } from './scenes/GameOverScene'
import { InventoryScene } from './scenes/InventoryScene'
import { SkillTreeScene } from './scenes/SkillTreeScene'
import { FragmentShopScene } from './scenes/FragmentShopScene'
import { OptionsScene } from './scenes/OptionsScene'
import { PackOpenScene } from './scenes/PackOpenScene'
import { DeckScene } from './scenes/DeckScene'
import { StoreScene } from './scenes/StoreScene'
import { AscensionScene } from './scenes/AscensionScene'
import { LoreScene } from './scenes/LoreScene'
import { createDebugState } from './debug'
import { SaveSystem } from './systems/SaveSystem'
import type { RunState } from './domain/progression/RunState'
import { MetaProgression } from './domain/progression/MetaProgression'
import { AudioSystem } from './systems/AudioSystem'
import { syncRotateHintLocale } from './ui/rotateHint'

MetaProgression.load()
syncRotateHintLocale()

const unlockAudio = () => AudioSystem.unlock()
window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true })
window.addEventListener('touchstart', unlockAudio, { once: false, passive: true })

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 270,
  height: 480,
  parent: 'app',
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    MapScene,
    CombatScene,
    RewardScene,
    EventScene,
    ShopScene,
    RestScene,
    ForgeScene,
    GameOverScene,
    InventoryScene,
    SkillTreeScene,
    FragmentShopScene,
    OptionsScene,
    PackOpenScene,
    DeckScene,
    StoreScene,
    AscensionScene,
    LoreScene,
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'app',
    expandParent: false,
    fullscreenTarget: 'app',
  },
})

const refreshScale = () => game.scale.refresh()
window.addEventListener('resize', refreshScale)
window.addEventListener('orientationchange', () => {
  window.setTimeout(refreshScale, 120)
})
window.visualViewport?.addEventListener('resize', refreshScale)

const SHORTCUTS: ReadonlyArray<readonly [string, string, number]> = [
  ['1', 'MapScene', 5],
  ['2', 'CombatScene', 5],
  ['3', 'RewardScene', 5],
  ['4', 'ShopScene', 12],
  ['5', 'EventScene', 5],
  ['6', 'ForgeScene', 5],
  ['7', 'GameOverScene', 5],
  ['8', 'DeckScene', 5],
]

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey) return

  if (e.key === '0' || e.key === 'r' || e.key === 'R') {
    e.preventDefault()
    game.scene.start('MenuScene')
    return
  }

  if (e.key === 's' || e.key === 'S') {
    e.preventDefault()
    // quicksave is auto-written by MapScene on each node click
    const existing = SaveSystem.load('quicksave')
    if (existing) {
      existing.floor = 5
      existing.coins = 200
      SaveSystem.save('quicksave', existing)
      console.log('[quicksave] saved manual snapshot')
    } else {
      SaveSystem.save('quicksave', createDebugState(1))
      console.log('[quicksave] created new save')
    }
    return
  }

  if (e.key === 'l' || e.key === 'L') {
    e.preventDefault()
    const loaded = SaveSystem.load('quicksave')
    if (loaded) {
      game.scene.start('MapScene', { runState: loaded })
      console.log('[quicksave] loaded → MapScene')
    }
    return
  }

  for (const [key, sceneName, floor] of SHORTCUTS) {
    if (e.key === key) {
      e.preventDefault()
      const state: RunState = createDebugState(floor)
      SaveSystem.save('quicksave', state)
      game.scene.start(sceneName, { runState: state })
      return
    }
  }
})
