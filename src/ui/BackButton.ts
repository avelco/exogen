import type Phaser from 'phaser'
import { addPixelText } from './pixelText'
import { t } from '../i18n/I18n'
import { AudioSystem } from '../systems/AudioSystem'

/** Bottom-left back chip — large enough for thumbs on a 270×480 canvas. */
export function addBackButton(
  scene: Phaser.Scene,
  onBack: () => void,
  opts: { x?: number; y?: number; labelKey?: 'ui.back' } = {},
) {
  const key = opts.labelKey ?? 'ui.back'
  const label = t(key)

  const padX = 7
  const padY = 5
  const measure = addPixelText(scene, 0, 0, label, {
    fontSize: '8px',
    color: '#dddddd',
  }).setVisible(false)
  const textW = Math.max(8, Math.ceil(measure.width))
  const textH = Math.max(8, Math.ceil(measure.height))
  measure.destroy()

  const bw = Math.max(34, textW + padX * 2)
  const bh = Math.max(20, textH + padY * 2)
  // Thumb-friendly hit box (game px); scales up with FIT on phones.
  const hitW = Math.max(44, bw + 10)
  const hitH = Math.max(36, bh + 10)

  const { height } = scene.cameras.main
  // Default: bottom-left corner.
  const x = opts.x ?? 4
  const y = opts.y ?? height - bh - 4

  const root = scene.add.container(x, y).setDepth(50).setScrollFactor(0)

  const bg = scene.add.graphics()
  bg.fillStyle(0x12121c, 0.82)
  bg.fillRoundedRect(0, 0, bw, bh, 3)
  bg.lineStyle(1, 0x777788, 1)
  bg.strokeRoundedRect(0, 0, bw, bh, 3)
  root.add(bg)

  const txt = addPixelText(scene, bw / 2, bh / 2, label, {
    fontSize: '8px',
    color: '#dddddd',
  }).setOrigin(0.5)
  root.add(txt)

  const zone = scene.add
    .zone(bw / 2, bh / 2, hitW, hitH)
    .setInteractive({ useHandCursor: true })
  root.add(zone)

  const setHover = (on: boolean) => {
    txt.setColor(on ? '#ffffff' : '#dddddd')
    bg.clear()
    bg.fillStyle(on ? 0x2a2a3a : 0x12121c, 0.9)
    bg.fillRoundedRect(0, 0, bw, bh, 3)
    bg.lineStyle(1, on ? 0xaaaacc : 0x777788, 1)
    bg.strokeRoundedRect(0, 0, bw, bh, 3)
  }

  zone.on('pointerover', () => setHover(true))
  zone.on('pointerout', () => setHover(false))
  zone.on('pointerdown', () => {
    AudioSystem.play('ui')
    onBack()
  })

  return root
}
