import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { getRunState, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { nodeColor, nodeName, nodeIcon } from '../domain/map/FloorGenerator'
import {
  dungeonMapHeight,
  dungeonMapWidth,
  loadDungeonMap,
} from '../domain/map/DungeonMap'
import { nodesAdjacent } from '../domain/map/MazeGenerator'
import type { MapNodeKind } from '../domain/map/NodeTypes'
import type { MapNodeSnapshot, RunState } from '../domain/progression/RunState'
import { Enemy } from '../domain/enemies/Enemy'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { addBackButton } from '../ui/BackButton'
import { TutorialBanner } from '../ui/TutorialBanner'
import { t } from '../i18n/I18n'

const NODE_R = 8

export class MapScene extends Phaser.Scene {
  private nodes: MapNodeSnapshot[] = []
  private edges: { from: number; to: number }[] = []
  private hoveredNodeId: number | null = null
  private nodeG!: Phaser.GameObjects.Graphics
  private edgeG!: Phaser.GameObjects.Graphics
  private fogG!: Phaser.GameObjects.Graphics
  private runState!: RunState
  private labels = new Map<number, Phaser.GameObjects.Text>()
  private icons = new Map<number, Phaser.GameObjects.Text>()
  private fogLabels = new Map<number, Phaser.GameObjects.Text>()
  private mapWidth = 270
  private mapHeight = 480
  private panning = false
  private panMoved = false
  private panLastX = 0
  private panLastY = 0
  private tutorial: TutorialBanner | null = null
  private tutorialBlocked = false

  constructor() {
    super('MapScene')
  }

  init() {
    this.children.removeAll(true)
    this.hoveredNodeId = null
    this.labels.clear()
    this.icons.clear()
    this.fogLabels.clear()
    this.panning = false
    this.panMoved = false
    this.tutorial?.destroy()
    this.tutorial = null
    this.tutorialBlocked = false
  }

  create() {
    const { width, height } = this.cameras.main

    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }
    this.runState = rs

    if (!this.runState.map) {
      this.runState.map = loadDungeonMap(this.runState.floor, this.runState.seed)
      const start = this.runState.map.nodes.find(n => n.kind === 'start')
      this.runState.currentNodeId = start?.id ?? null
    }

    this.nodes = this.runState.map.nodes
    this.edges = this.runState.map.edges
    this.mapWidth = dungeonMapWidth(this.runState.map)
    this.mapHeight = dungeonMapHeight(this.runState.map)

    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight)
    this.centerOnCurrentNode(false)

    renderDebugHeader(this, this.runState)

    this.edgeG = this.add.graphics()
    this.edgeG.setDepth(0)

    this.fogG = this.add.graphics()
    this.fogG.setDepth(0.5)

    this.nodeG = this.add.graphics()
    this.nodeG.setDepth(1)

    for (const node of this.nodes) {
      const icon = addPixelText(this, node.x, node.y, nodeIcon(node.kind), {
        fontSize: '8px',
        color: '#111111',
      }).setOrigin(0.5).setDepth(3)
      this.icons.set(node.id, icon)

      const label = addPixelText(this, node.x, node.y + NODE_R + 4, nodeName(node.kind), {
        fontSize: '8px',
        color: '#777777',
      }).setOrigin(0.5, 0).setDepth(2)
      this.labels.set(node.id, label)

      const fogLabel = addPixelText(this, node.x, node.y + NODE_R + 4, '???', {
        fontSize: '8px',
        color: '#556677',
      }).setOrigin(0.5, 0).setDepth(2).setVisible(false)
      this.fogLabels.set(node.id, fogLabel)
    }

    this.redrawMap()

    addBackButton(this, () => this.scene.start('MenuScene'))

    addPixelText(this, width / 2, height - 10, t('map.hint'), {
      fontSize: '8px',
      color: '#777777',
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.panning = true
      this.panMoved = false
      this.panLastX = pointer.x
      this.panLastY = pointer.y
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.panning && !this.panMoved && !this.tutorialBlocked) {
        const id = this.hitTest(pointer.worldX, pointer.worldY)
        if (id !== null) {
          const node = this.nodes.find(n => n.id === id)!
          this.selectNode(node)
        }
      }
      this.panning = false
      this.panMoved = false
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.panning && pointer.isDown) {
        const dx = pointer.x - this.panLastX
        const dy = pointer.y - this.panLastY
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.panMoved = true
        this.cameras.main.scrollX -= dx
        this.cameras.main.scrollY -= dy
        this.panLastX = pointer.x
        this.panLastY = pointer.y
      }

      const prev = this.hoveredNodeId
      this.hoveredNodeId = this.hitTest(pointer.worldX, pointer.worldY)
      if (prev !== this.hoveredNodeId) this.redrawMap()
    })

    bindSceneKeys(this, {
      'keydown-ESC': () => this.scene.start('MenuScene'),
      'keydown-LEFT': () => {
        this.cameras.main.scrollX -= 40
      },
      'keydown-RIGHT': () => {
        this.cameras.main.scrollX += 40
      },
      'keydown-UP': () => {
        this.cameras.main.scrollY -= 40
      },
      'keydown-DOWN': () => {
        this.cameras.main.scrollY += 40
      },
    })
    SaveSystem.save('quicksave', this.runState)
    this.maybeShowThresholdBanner()
    this.maybeStartTutorial()
  }

  private maybeShowThresholdBanner() {
    const threshold = this.runState.pendingThreshold
    if (!threshold) return
    this.runState.pendingThreshold = null
    SaveSystem.save('quicksave', this.runState)
    const tip = new TutorialBanner(this)
    tip.show(threshold >= 300 ? 'threshold.phase' : 'threshold.void', () => tip.destroy())
  }

  private maybeStartTutorial() {
    if (MetaProgression.isTutorialDone() || this.runState.floor !== 1) return
    this.tutorialBlocked = true
    this.tutorial = new TutorialBanner(this)
    this.tutorial.show('tutorial.map.path', () => {
      this.tutorial?.show('tutorial.map.fog', () => {
        this.tutorialBlocked = false
        this.tutorial?.destroy()
        this.tutorial = null
      })
    })
  }

  private centerOnCurrentNode(smooth: boolean) {
    const cur = this.nodes.find(n => n.id === this.runState.currentNodeId)
      ?? this.nodes.find(n => n.kind === 'start')
    if (!cur) return
    const cam = this.cameras.main
    const targetX = Phaser.Math.Clamp(
      cur.x - cam.width / 2,
      0,
      Math.max(0, this.mapWidth - cam.width),
    )
    const targetY = Phaser.Math.Clamp(
      cur.y - cam.height / 2,
      0,
      Math.max(0, this.mapHeight - cam.height),
    )
    if (smooth) {
      this.tweens.add({
        targets: cam,
        scrollX: targetX,
        scrollY: targetY,
        duration: 220,
        ease: 'Sine.easeOut',
      })
    } else {
      cam.scrollX = targetX
      cam.scrollY = targetY
    }
  }

  private hitTest(wx: number, wy: number): number | null {
    const r = NODE_R + 10
    let best: number | null = null
    let bestDist = r * r
    for (const n of this.nodes) {
      // Only explored or adjacent mystery rooms are targetable / hoverable.
      if (!this.isExplored(n) && !this.isSensed(n)) continue
      const dx = wx - n.x
      const dy = wy - n.y
      const d = dx * dx + dy * dy
      if (d <= bestDist) {
        bestDist = d
        best = n.id
      }
    }
    return best
  }

  /** Visited: start, current, or cleared — full type/exits revealed. */
  private isExplored(node: MapNodeSnapshot): boolean {
    return (
      node.kind === 'start' ||
      node.cleared ||
      node.id === this.runState.currentNodeId
    )
  }

  /** Adjacent to explored: visible as ??? (type & further exits hidden). */
  private isSensed(node: MapNodeSnapshot): boolean {
    if (this.isExplored(node)) return false
    return this.nodes.some(
      n => this.isExplored(n) && nodesAdjacent(this.edges, n.id, node.id),
    )
  }

  /**
   * Stub edges only: explored↔explored, or explored↔sensed.
   * Hides whether a mystery neighbor is a dead end until you enter it.
   */
  private isEdgeVisible(fromId: number, toId: number): boolean {
    const from = this.nodes.find(n => n.id === fromId)
    const to = this.nodes.find(n => n.id === toId)
    if (!from || !to) return false
    const a = this.isExplored(from)
    const b = this.isExplored(to)
    if (a && b) return true
    if (a && this.isSensed(to)) return true
    if (b && this.isSensed(from)) return true
    return false
  }

  private redrawMap() {
    const curId = this.runState.currentNodeId
    this.edgeG.clear()
    this.fogG.clear()
    this.nodeG.clear()

    for (const edge of this.edges) {
      if (!this.isEdgeVisible(edge.from, edge.to)) continue
      const from = this.nodes.find(n => n.id === edge.from)!
      const to = this.nodes.find(n => n.id === edge.to)!

      const active =
        curId !== null &&
        ((edge.from === curId && this.isReachable(to)) ||
          (edge.to === curId && this.isReachable(from)))
      this.edgeG.lineStyle(active ? 2 : 1, active ? 0x8899aa : 0x445566, active ? 1 : 0.7)
      this.edgeG.beginPath()
      this.edgeG.moveTo(from.x, from.y)
      this.edgeG.lineTo(to.x, to.y)
      this.edgeG.strokePath()
    }

    for (const node of this.nodes) {
      const label = this.labels.get(node.id)
      const icon = this.icons.get(node.id)
      const fogLabel = this.fogLabels.get(node.id)
      const explored = this.isExplored(node)
      const sensed = this.isSensed(node)

      if (!explored && !sensed) {
        label?.setVisible(false)
        icon?.setVisible(false)
        fogLabel?.setVisible(false)
        continue
      }

      if (!explored && sensed) {
        // Mystery neighbor: no type spoiler, no exit spoiler.
        label?.setVisible(false)
        icon?.setVisible(false)
        fogLabel?.setVisible(true).setAlpha(0.7)
        this.drawFogNode(node)
        if (this.isReachable(node)) {
          this.nodeG.lineStyle(2, 0xeeeeee, 0.9)
          this.nodeG.strokeCircle(node.x, node.y, NODE_R + 4)
        }
        if (node.id === this.hoveredNodeId && this.isReachable(node)) {
          this.nodeG.lineStyle(2, 0xffffff, 1)
          this.nodeG.strokeCircle(node.x, node.y, NODE_R + 5)
        }
        continue
      }

      fogLabel?.setVisible(false)
      label?.setVisible(true)
      icon?.setVisible(true)

      const reachable = this.isReachable(node)
      const cleared = node.cleared
      let color = nodeColor(node.kind)

      if (node.id === this.hoveredNodeId && reachable) color = 0xffffff
      else if (node.id === curId) color = 0xffffff
      else if (cleared) color = dimColor(color)
      else if (!reachable) color = dimColor(color)

      const r = node.kind === 'boss' ? NODE_R + 2 : NODE_R

      if (reachable) {
        this.nodeG.lineStyle(2, 0xeeeeee, 0.95)
        this.nodeG.strokeCircle(node.x, node.y, r + 3)
      }

      this.nodeG.fillStyle(color, 1)
      this.nodeG.fillCircle(node.x, node.y, r)

      if (label) {
        label.setColor(reachable ? '#dddddd' : cleared ? '#555555' : '#888888')
        label.setAlpha(reachable || cleared ? 1 : 0.7)
      }
      if (icon) {
        icon.setColor(reachable || node.id === curId ? '#111111' : '#222222')
        icon.setAlpha(cleared ? 0.4 : 1)
      }
    }
  }

  private drawFogNode(node: MapNodeSnapshot) {
    const r = NODE_R + 1
    this.fogG.fillStyle(0x3a3a58, 0.28)
    this.fogG.fillCircle(node.x, node.y, r + 8)
    this.fogG.fillStyle(0x2e2e48, 0.4)
    this.fogG.fillCircle(node.x, node.y, r + 4)
    this.nodeG.fillStyle(0x252538, 0.85)
    this.nodeG.fillCircle(node.x, node.y, r)
    this.nodeG.lineStyle(1, 0x4a4a66, 0.5)
    this.nodeG.strokeCircle(node.x, node.y, r)
  }

  private isReachable(node: MapNodeSnapshot): boolean {
    if (this.runState.currentNodeId === null) {
      return node.kind === 'start'
    }
    const cur = this.nodes.find(n => n.id === this.runState.currentNodeId)
    if (!cur) return node.kind === 'start'

    // Re-enter current room only if not cleared yet.
    if (node.id === cur.id) return !cur.cleared

    // Must finish current room before leaving (except start, pre-cleared).
    if (!cur.cleared) return false

    if (!nodesAdjacent(this.edges, cur.id, node.id)) return false

    // Cleared neighbor: walk back. Uncleared: enter room.
    return true
  }

  private selectNode(node: MapNodeSnapshot) {
    if (this.tutorialBlocked) return
    if (!this.isReachable(node)) return

    AudioSystem.unlock()
    AudioSystem.play('map')

    // Backtrack / walk onto cleared node: no room scene.
    if (node.cleared && node.id !== this.runState.currentNodeId) {
      this.runState.currentNodeId = node.id
      this.runState.pendingNodeKind = null
      SaveSystem.save('quicksave', this.runState)
      this.centerOnCurrentNode(true)
      this.redrawMap()
      return
    }

    this.runState.currentNodeId = node.id
    this.runState.pendingNodeKind = node.kind
    SaveSystem.save('quicksave', this.runState)
    this.centerOnCurrentNode(true)
    this.redrawMap()

    this.time.delayedCall(200, () => this.routeToNode(node.kind))
  }

  private routeToNode(kind: MapNodeKind) {
    switch (kind) {
      case 'start':
        // Start is a lobby marker (pre-cleared); should not enter combat.
        break
      case 'combat':
      case 'elite':
      case 'boss':
        this.runState.pendingRewardTier = Enemy.tierForKind(kind)
        this.scene.start('CombatScene', { runState: this.runState })
        break
      case 'shop':
        this.scene.start('ShopScene', { runState: this.runState })
        break
      case 'event':
        this.scene.start('EventScene', { runState: this.runState })
        break
      case 'rest':
        this.scene.start('RestScene', { runState: this.runState })
        break
    }
  }
}

function dimColor(c: number): number {
  const r = ((c >> 16) & 0xff) * 0.32
  const g = ((c >> 8) & 0xff) * 0.32
  const b = (c & 0xff) * 0.32
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

export function markCurrentNodeCleared(state: RunState) {
  if (!state.map || state.currentNodeId === null) return
  const node = state.map.nodes.find(n => n.id === state.currentNodeId)
  if (node) node.cleared = true
}

export { advanceFloorAfterBoss } from '../domain/progression/advanceDepth'
