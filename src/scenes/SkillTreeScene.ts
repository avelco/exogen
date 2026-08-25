import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { addBackButton } from '../ui/BackButton'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import {
  canUnlock,
  isNodeUnlocked,
  skillTreeNode,
  skillTreeNodes,
  type SkillTreeFamily,
  type SkillTreeNodeDef,
} from '../domain/progression/SkillTree'
import { t, treeNodeDesc, treeNodeName } from '../i18n/I18n'

const PANEL_X = 12
const PANEL_TOP = 52
/** Space reserved under the panel for status + hint + back. */
const FOOTER_H = 56
const PANEL_PAD = 12
const ROW_H = 52
const CHIP_W = 120
const CHIP_H = 36
const ARROW = 4
const COST_GUTTER = 10

/** Wrap long node names so they fit the chip. */
function chipNameLines(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return name
  if (parts.length === 2) return `${parts[0]}\n${parts[1]}`
  return `${parts.slice(0, -1).join(' ')}\n${parts[parts.length - 1]}`
}

const FAMILY_ACCENT: Record<SkillTreeFamily, number> = {
  core: 0xaacc88,
  element: 0x88aadd,
  style: 0xddaa66,
}

type NodeState = 'owned' | 'available' | 'locked'

export class SkillTreeScene extends Phaser.Scene {
  private pointsTxt!: Phaser.GameObjects.Text
  private statusTxt!: Phaser.GameObjects.Text
  private edgeG!: Phaser.GameObjects.Graphics
  private chipG!: Phaser.GameObjects.Graphics
  private nodeLabels = new Map<string, Phaser.GameObjects.Text>()
  private costLabels = new Map<string, Phaser.GameObjects.Text>()
  private originX = 0
  private originY = 0
  private scrollX = 0
  private scrollY = 0
  private maxScrollX = 0
  private maxScrollY = 0
  private panelW = 0
  private panelH = 0
  private viewX = 0
  private viewY = 0
  private viewW = 0
  private viewH = 0
  private maxRow = 0
  private dragStart: { x: number; y: number; sx: number; sy: number } | null =
    null
  private treeContainer!: Phaser.GameObjects.Container
  private treeCam!: Phaser.Cameras.Scene2D.Camera
  private hud: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('SkillTreeScene')
  }

  create() {
    MetaProgression.load()
    const { width, height } = this.cameras.main
    const cx = width / 2
    this.panelW = width - PANEL_X * 2
    this.panelH = height - PANEL_TOP - FOOTER_H
    this.viewX = PANEL_X + 2
    this.viewY = PANEL_TOP + 2
    this.viewW = this.panelW - 4
    this.viewH = this.panelH - 4

    const panel = this.add.graphics().setDepth(0)
    panel.fillStyle(0x161625, 0.95)
    panel.fillRoundedRect(PANEL_X, PANEL_TOP, this.panelW, this.panelH, 6)
    panel.lineStyle(1, 0x3a3a58, 1)
    panel.strokeRoundedRect(PANEL_X, PANEL_TOP, this.panelW, this.panelH, 6)
    this.hud.push(panel)

    // Opaque bars so any leak cannot cover title / footer.
    const topCover = this.add.graphics().setDepth(8)
    topCover.fillStyle(0x0d0d14, 1)
    topCover.fillRect(0, 0, width, PANEL_TOP)
    const botCover = this.add.graphics().setDepth(8)
    botCover.fillStyle(0x0d0d14, 1)
    botCover.fillRect(0, PANEL_TOP + this.panelH, width, FOOTER_H + 8)
    this.hud.push(topCover, botCover)

    this.layoutTree()

    // Clipped camera: only this viewport draws the tree.
    this.treeCam = this.cameras.add(
      this.viewX,
      this.viewY,
      this.viewW,
      this.viewH,
    )
    this.treeCam.setScroll(0, 0)

    this.treeContainer = this.add.container(0, 0).setDepth(1)
    this.edgeG = this.add.graphics()
    this.chipG = this.add.graphics()
    this.treeContainer.add([this.edgeG, this.chipG])
    this.edgeG.setDepth(0)
    this.chipG.setDepth(1)

    const back = addBackButton(this, () => this.scene.start('MenuScene'))
    this.hud.push(back)

    const title = addPixelText(this, cx, 16, t('tree.title'), {
      fontSize: '16px',
      color: '#ffffff',
    })
      .setOrigin(0.5)
      .setDepth(10)
    this.hud.push(title)

    this.pointsTxt = addPixelText(this, cx, 36, '', {
      fontSize: '8px',
      color: '#ffcc66',
    })
      .setOrigin(0.5)
      .setDepth(10)
    this.hud.push(this.pointsTxt)

    this.statusTxt = addPixelText(this, cx, height - 28, '', {
      fontSize: '8px',
      color: '#aaaaaa',
      wordWrap: { width: width - 40 },
      align: 'center',
    })
      .setOrigin(0.5)
      .setDepth(10)
    this.hud.push(this.statusTxt)

    const hint = addPixelText(this, cx, height - 12, t('tree.hint'), {
      fontSize: '8px',
      color: '#666666',
    })
      .setOrigin(0.5)
      .setDepth(10)
    this.hud.push(hint)

    // Main camera: HUD only. Tree camera: tree only.
    this.cameras.main.ignore(this.treeContainer)
    this.treeCam.ignore(this.hud)

    this.drawTree()
    this.refreshHud()
    this.bindScroll()

    bindSceneKeys(this, {
      'keydown-ESC': () => this.scene.start('MenuScene'),
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cameras.remove(this.treeCam)
    })
  }

  /**
   * Content lives in treeCam world space (0,0 = top-left of viewport).
   * Row 0 (root) at the bottom; scroll starts at the base.
   */
  private layoutTree() {
    const nodes = skillTreeNodes()
    this.maxRow = Math.max(...nodes.map(n => n.row), 0)
    const treeContentW = CHIP_W + PANEL_PAD * 2
    const treeContentH = this.maxRow * ROW_H + CHIP_H + PANEL_PAD * 2
    this.originX = this.viewW / 2
    this.originY = PANEL_PAD + CHIP_H / 2
    this.maxScrollX = Math.max(0, treeContentW - this.viewW)
    this.maxScrollY = Math.max(0, treeContentH - this.viewH)
    this.scrollX = 0
    this.scrollY = this.maxScrollY
  }

  private applyScroll() {
    this.treeCam.setScroll(this.scrollX, this.scrollY)
  }

  private pointerInPanel(p: Phaser.Input.Pointer): boolean {
    return (
      p.x >= this.viewX &&
      p.x <= this.viewX + this.viewW &&
      p.y >= this.viewY &&
      p.y <= this.viewY + this.viewH
    )
  }

  private bindScroll() {
    const zone = this.add
      .zone(
        this.viewX + this.viewW / 2,
        this.viewY + this.viewH / 2,
        this.viewW,
        this.viewH,
      )
      .setInteractive()
      .setDepth(0.5)
    this.hud.push(zone)
    this.treeCam.ignore(zone)

    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStart = {
        x: p.x,
        y: p.y,
        sx: this.scrollX,
        sy: this.scrollY,
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !p.isDown) return
      const dx = p.x - this.dragStart.x
      const dy = p.y - this.dragStart.y
      this.scrollX = Phaser.Math.Clamp(
        this.dragStart.sx - dx,
        0,
        this.maxScrollX,
      )
      this.scrollY = Phaser.Math.Clamp(
        this.dragStart.sy - dy,
        0,
        this.maxScrollY,
      )
      this.applyScroll()
    })
    this.input.on('pointerup', () => {
      this.dragStart = null
    })

    this.input.on(
      'wheel',
      (
        p: Phaser.Input.Pointer,
        _gos: unknown,
        dx: number,
        dy: number,
      ) => {
        if (!this.pointerInPanel(p)) return
        this.scrollY = Phaser.Math.Clamp(
          this.scrollY + dy * 0.5,
          0,
          this.maxScrollY,
        )
        this.scrollX = Phaser.Math.Clamp(
          this.scrollX + dx * 0.5,
          0,
          this.maxScrollX,
        )
        this.applyScroll()
      },
    )
  }

  private nodePos(node: SkillTreeNodeDef): { x: number; y: number } {
    return {
      x: Math.round(this.originX),
      y: Math.round(this.originY + (this.maxRow - node.row) * ROW_H),
    }
  }

  private nodeState(node: SkillTreeNodeDef): NodeState {
    const meta = MetaProgression.load()
    if (isNodeUnlocked(meta, node.id)) return 'owned'
    if (canUnlock(meta, node.id)) return 'available'
    return 'locked'
  }

  private edgeColor(from: SkillTreeNodeDef, to: SkillTreeNodeDef): number {
    const a = this.nodeState(from)
    const b = this.nodeState(to)
    if (a === 'owned' && b === 'owned') return 0x66cc88
    if (a === 'owned' && b === 'available') return 0x88aacc
    return 0x3a3a55
  }

  private chipColors(
    state: NodeState,
    family: SkillTreeFamily,
  ): { fill: number; stroke: number; text: string } {
    const accent = FAMILY_ACCENT[family]
    if (state === 'owned') {
      return { fill: 0x1e3a2a, stroke: accent, text: '#88ffaa' }
    }
    if (state === 'available') {
      return { fill: 0x2a2a3a, stroke: accent, text: '#eeeeee' }
    }
    return { fill: 0x1a1a28, stroke: 0x444455, text: '#666677' }
  }

  private drawArrowHeadUp(tipX: number, tipY: number, color: number) {
    this.edgeG.fillStyle(color, 1)
    this.edgeG.fillTriangle(
      tipX,
      tipY,
      tipX - ARROW,
      tipY + ARROW,
      tipX + ARROW,
      tipY + ARROW,
    )
  }

  private drawVerticalEdge(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
  ) {
    const startY = from.y - CHIP_H / 2
    const endY = to.y + CHIP_H / 2
    if (startY <= endY + ARROW) return
    this.edgeG.lineStyle(2, color, 0.95)
    this.edgeG.beginPath()
    this.edgeG.moveTo(from.x, startY)
    this.edgeG.lineTo(to.x, endY + ARROW)
    this.edgeG.strokePath()
    this.drawArrowHeadUp(to.x, endY, color)
  }

  private drawTree() {
    this.edgeG.clear()
    this.chipG.clear()

    for (const node of skillTreeNodes()) {
      const to = this.nodePos(node)
      for (const reqId of node.requires) {
        const req = skillTreeNode(reqId)
        if (!req) continue
        this.drawVerticalEdge(this.nodePos(req), to, this.edgeColor(req, node))
      }
    }

    for (const node of skillTreeNodes()) {
      this.drawNodeChip(node)
    }

    this.treeContainer.sendToBack(this.edgeG)
    this.treeContainer.moveAbove(this.chipG, this.edgeG)
    for (const label of this.nodeLabels.values()) {
      this.treeContainer.bringToTop(label)
    }
    for (const cost of this.costLabels.values()) {
      this.treeContainer.bringToTop(cost)
    }
    this.applyScroll()
  }

  private drawNodeChip(node: SkillTreeNodeDef) {
    const { x, y } = this.nodePos(node)
    const state = this.nodeState(node)
    const colors = this.chipColors(state, node.family)
    const isRoot = node.requires.length === 0

    const left = x - CHIP_W / 2
    const top = y - CHIP_H / 2

    this.chipG.fillStyle(colors.fill, 1)
    this.chipG.fillRoundedRect(left, top, CHIP_W, CHIP_H, 4)
    this.chipG.lineStyle(isRoot ? 2 : 1, colors.stroke, 1)
    this.chipG.strokeRoundedRect(left, top, CHIP_W, CHIP_H, 4)

    if (state === 'available') {
      this.chipG.lineStyle(1, 0xffffff, 0.35)
      this.chipG.strokeRoundedRect(left + 1, top + 1, CHIP_W - 2, CHIP_H - 2, 3)
    }

    const name = chipNameLines(treeNodeName(node.id))
    const nameX = state === 'owned' ? x : x - COST_GUTTER / 2
    let label = this.nodeLabels.get(node.id)
    if (!label) {
      label = addPixelText(this, nameX, y, name, {
        fontSize: '8px',
        color: colors.text,
        align: 'center',
        lineSpacing: 2,
      })
        .setOrigin(0.5)
        .setDepth(2)
      enableTouchTarget(label, { min: 28 })
      label.on('pointerover', () => {
        this.showNodeInfo(node)
        label?.setColor('#ffffff')
      })
      label.on('pointerout', () => {
        label?.setColor(this.chipColors(this.nodeState(node), node.family).text)
      })
      label.on('pointerdown', () => this.onNode(node.id))
      this.nodeLabels.set(node.id, label)
      this.treeContainer.add(label)
      this.treeContainer.bringToTop(label)
    } else {
      label.setText(name)
      label.setColor(colors.text)
      label.setPosition(nameX, y)
    }

    let cost = this.costLabels.get(node.id)
    if (state === 'owned') {
      cost?.setVisible(false)
    } else {
      const costX = left + CHIP_W - 8
      if (!cost) {
        cost = addPixelText(this, costX, y, `${node.cost}`, {
          fontSize: '8px',
          color: '#888899',
        })
          .setOrigin(1, 0.5)
          .setDepth(2)
        this.costLabels.set(node.id, cost)
        this.treeContainer.add(cost)
        this.treeContainer.bringToTop(cost)
      } else {
        cost.setText(`${node.cost}`)
        cost.setColor('#888899')
        cost.setPosition(costX, y)
      }
      cost.setVisible(true)
    }
  }

  private refreshNodes() {
    this.drawTree()
  }

  private showNodeInfo(node: SkillTreeNodeDef) {
    const desc = treeNodeDesc(node.id)
    const state = this.nodeState(node)
    const stateLabel =
      state === 'owned'
        ? t('tree.owned')
        : state === 'available'
          ? t('tree.available')
          : t('tree.locked')
    this.statusTxt.setText(
      `${treeNodeName(node.id)}: ${desc} (${stateLabel})`,
    )
  }

  private onNode(nodeId: string) {
    const node = skillTreeNode(nodeId)
    if (!node) return
    this.showNodeInfo(node)
    if (!MetaProgression.tryUnlockTreeNode(nodeId)) {
      AudioSystem.play('ui')
      return
    }
    AudioSystem.play('select')
    this.refreshHud()
    this.refreshNodes()
    this.showNodeInfo(node)
  }

  private refreshHud() {
    const meta = MetaProgression.load()
    this.pointsTxt.setText(
      t('tree.points', {
        n: meta.skillPoints,
        earned: meta.skillPointsEarned,
      }),
    )
  }
}
