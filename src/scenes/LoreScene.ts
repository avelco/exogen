import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { addBackButton } from '../ui/BackButton'
import { showInfoModal } from '../ui/InfoModal'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import {
  isLoreUnlocked,
  LORE_THREADS,
  loreChapters,
  unlockedLoreCount,
  type LoreChapter,
  type LoreThread,
} from '../domain/progression/Lore'
import { t, tKey } from '../i18n/I18n'

interface LoreRow {
  chapter: LoreChapter
  unlocked: boolean
  text: Phaser.GameObjects.Text
}

const ROW_TOP = 92
const ROW_STEP = 27

export class LoreScene extends Phaser.Scene {
  private thread: LoreThread = 'archive'
  private rows: LoreRow[] = []
  private tabTexts: Phaser.GameObjects.Text[] = []
  private progressTxt: Phaser.GameObjects.Text | null = null
  private selectedIndex = 0
  private readerOpen = false

  constructor() {
    super('LoreScene')
  }

  init() {
    this.thread = 'archive'
    this.rows = []
    this.tabTexts = []
    this.progressTxt = null
    this.selectedIndex = 0
    this.readerOpen = false
  }

  create() {
    const { width } = this.cameras.main
    const cx = width / 2

    addPixelText(this, cx, 20, t('lore.title'), {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)

    LORE_THREADS.forEach((thread, i) => {
      const tab = addPixelText(this, cx + (i === 0 ? -56 : 56), 48, t(`lore.tab.${thread}`), {
        fontSize: '8px',
        color: '#666666',
      }).setOrigin(0.5)
      enableTouchTarget(tab, { min: 24 })
      tab.on('pointerdown', () => this.setThread(thread))
      this.tabTexts.push(tab)
    })

    this.renderRows()

    addPixelText(this, cx, ROW_TOP + 12 * ROW_STEP + 8, t('lore.hint'), {
      fontSize: '8px',
      color: '#666666',
    }).setOrigin(0.5)

    addBackButton(this, () => this.goMenu())
    bindSceneKeys(this, {
      'keydown-ESC': () => this.goMenu(),
      'keydown-LEFT': () => this.setThread(LORE_THREADS[0]!),
      'keydown-RIGHT': () => this.setThread(LORE_THREADS[1]!),
      'keydown-UP': () => this.move(-1),
      'keydown-DOWN': () => this.move(1),
      'keydown-ENTER': () => this.confirm(this.selectedIndex),
    })
  }

  private setThread(thread: LoreThread) {
    if (this.readerOpen || thread === this.thread) return
    this.thread = thread
    AudioSystem.play('ui')
    this.renderRows()
  }

  private renderRows() {
    const { width } = this.cameras.main
    const cx = width / 2
    const floor = MetaProgression.getCampaignFloor()

    for (const row of this.rows) row.text.destroy()
    this.rows = []
    this.progressTxt?.destroy()

    LORE_THREADS.forEach((thread, i) => {
      this.tabTexts[i]!.setColor(thread === this.thread ? '#ffffff' : '#666666')
    })

    this.progressTxt = addPixelText(this, cx, 68, t('lore.progress', {
      n: unlockedLoreCount(this.thread, floor),
      total: loreChapters(this.thread).length,
      floor,
    }), {
      fontSize: '8px',
      color: '#ffcc66',
    }).setOrigin(0.5)

    loreChapters(this.thread).forEach((chapter, i) => {
      const unlocked = isLoreUnlocked(chapter, floor)
      const label = unlocked
        ? tKey(`lore.${chapter.thread}.${chapter.id}.title`, chapter.id)
        : t('lore.locked', { n: chapter.minFloor })
      const text = addPixelText(this, cx, ROW_TOP + i * ROW_STEP, label, {
        fontSize: '8px',
        color: unlocked ? '#888888' : '#4a4a5c',
        align: 'center',
      }).setOrigin(0.5)
      enableTouchTarget(text, { pad: 6 })
      text.on('pointerover', () => this.select(i))
      text.on('pointerdown', () => this.confirm(i))
      this.rows.push({ chapter, unlocked, text })
    })

    this.selectedIndex = 0
    this.select(0)
  }

  private goMenu() {
    if (this.readerOpen) return
    this.scene.start('MenuScene')
  }

  private move(dir: number) {
    const next = (this.selectedIndex + dir + this.rows.length) % this.rows.length
    this.select(next)
  }

  private select(index: number) {
    const prev = this.rows[this.selectedIndex]
    if (prev) prev.text.setColor(prev.unlocked ? '#888888' : '#4a4a5c')
    this.selectedIndex = index
    const next = this.rows[index]
    if (!next) return
    next.text.setColor(next.unlocked ? '#ffffff' : '#777788')
    AudioSystem.play('ui')
  }

  private confirm(index: number) {
    if (this.readerOpen) return
    const row = this.rows[index]
    if (!row) return
    if (!row.unlocked) {
      AudioSystem.play('block')
      return
    }
    this.readerOpen = true
    AudioSystem.play('select')
    const keyBase = `lore.${row.chapter.thread}.${row.chapter.id}`
    showInfoModal(this, {
      title: tKey(`${keyBase}.title`, row.chapter.id),
      body: tKey(`${keyBase}.body`, ''),
      closeLabel: t('ui.close'),
      cardH: 320,
      onClose: () => {
        this.readerOpen = false
      },
    })
  }
}
