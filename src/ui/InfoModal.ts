import type Phaser from 'phaser'
import { addPixelText } from './pixelText'
import { enableTouchTarget } from './touchTarget'
import { AudioSystem } from '../systems/AudioSystem'

export interface InfoModalOpts {
  title: string
  body: string
  closeLabel: string
  /** Card height in game px; default 132. Increase for long bodies. */
  cardH?: number
  onClose?: () => void
}

/** Full-screen dim + centered info card with a single close action. */
export function showInfoModal(scene: Phaser.Scene, opts: InfoModalOpts) {
  const { width, height } = scene.cameras.main
  const cx = width / 2
  const root = scene.add.container(0, 0).setDepth(200).setScrollFactor(0)

  const dim = scene.add.graphics()
  dim.fillStyle(0x000000, 0.72)
  dim.fillRect(0, 0, width, height)
  root.add(dim)

  // Swallow taps on the dimmer (close on outside tap).
  const blocker = scene.add
    .zone(cx, height / 2, width, height)
    .setInteractive()
  root.add(blocker)

  const cardW = Math.min(width - 28, 232)
  const cardH = Math.min(opts.cardH ?? 132, height - 40)
  const cardX = (width - cardW) / 2
  const cardY = Math.round(height / 2 - cardH / 2)

  const card = scene.add.graphics()
  card.fillStyle(0x12121c, 0.96)
  card.fillRoundedRect(cardX, cardY, cardW, cardH, 4)
  card.lineStyle(1, 0x7788aa, 1)
  card.strokeRoundedRect(cardX, cardY, cardW, cardH, 4)
  root.add(card)

  const title = addPixelText(scene, cx, cardY + 18, opts.title, {
    fontSize: '8px',
    color: '#ffffff',
    align: 'center',
    wordWrap: { width: cardW - 24 },
  }).setOrigin(0.5, 0.5)
  root.add(title)

  const body = addPixelText(scene, cx, cardY + 34, opts.body, {
    fontSize: '8px',
    color: '#c4cfe4',
    align: 'center',
    lineSpacing: 5,
    wordWrap: { width: cardW - 20 },
  }).setOrigin(0.5, 0)
  root.add(body)

  const btnY = cardY + cardH - 20
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    opts.onClose?.()
    root.destroy()
  }

  const closeBtn = addPixelText(scene, cx, btnY, opts.closeLabel, {
    fontSize: '8px',
    color: '#aaaaaa',
  }).setOrigin(0.5)
  enableTouchTarget(closeBtn, { min: 32 })
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'))
  closeBtn.on('pointerout', () => closeBtn.setColor('#aaaaaa'))
  closeBtn.on('pointerdown', () => {
    AudioSystem.play('ui')
    close()
  })
  root.add(closeBtn)

  blocker.on('pointerdown', () => close())

  return root
}
