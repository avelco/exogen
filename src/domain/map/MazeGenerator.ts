import recipesData from '../../data/dungeonRecipes.json'
import type { MapNodeKind } from './NodeTypes'
import type { MapEdgeSnapshot, MapNodeSnapshot, MapSnapshot } from '../progression/RunState'

export const MAX_CAMPAIGN_FLOOR = 400

const PAD_X = 28
const PAD_Y = 36
const CELL_W = 42
const CELL_H = 48

export type RoomKind = Exclude<MapNodeKind, 'start' | 'boss'>

export interface DungeonRecipe {
  floor: number
  gridW: number
  gridH: number
  rooms: Partial<Record<RoomKind, number>>
  loops: number
}

const RECIPES = (recipesData as { floors: DungeonRecipe[] }).floors

/** Soft growth for depths beyond the authored recipes (6–100). */
function recipeForHighFloor(floor: number): DungeonRecipe {
  const t = floor - 5
  return {
    floor,
    gridW: Math.min(8, 6 + Math.floor(t / 20)),
    gridH: Math.min(12, 9 + Math.floor(t / 15)),
    rooms: {
      combat: Math.min(18, 11 + Math.floor(t / 8)),
      elite: Math.min(5, 3 + Math.floor(t / 25)),
      shop: 1,
      rest: Math.min(3, 2 + Math.floor(t / 40)),
      event: Math.min(3, 2 + Math.floor(t / 30)),
    },
    loops: Math.min(5, 3 + Math.floor(t / 30)),
  }
}

type Cell = { gx: number; gy: number }

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cellKey(c: Cell): string {
  return `${c.gx},${c.gy}`
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function roomCount(rooms: DungeonRecipe['rooms']): number {
  let n = 0
  for (const v of Object.values(rooms)) n += v ?? 0
  return n
}

function roomBag(rooms: DungeonRecipe['rooms']): RoomKind[] {
  const bag: RoomKind[] = []
  const kinds: RoomKind[] = ['combat', 'elite', 'event', 'shop', 'rest']
  for (const k of kinds) {
    const c = rooms[k] ?? 0
    for (let i = 0; i < c; i++) bag.push(k)
  }
  return bag
}

export function getDungeonRecipe(floor: number): DungeonRecipe {
  const f = Math.max(1, Math.min(MAX_CAMPAIGN_FLOOR, Math.floor(floor)))
  const r = RECIPES.find(x => x.floor === f)
  if (r) return r
  return recipeForHighFloor(f)
}

function neighbors4(c: Cell, w: number, h: number): Cell[] {
  const out: Cell[] = []
  if (c.gx > 0) out.push({ gx: c.gx - 1, gy: c.gy })
  if (c.gx < w - 1) out.push({ gx: c.gx + 1, gy: c.gy })
  if (c.gy > 0) out.push({ gx: c.gx, gy: c.gy - 1 })
  if (c.gy < h - 1) out.push({ gx: c.gx, gy: c.gy + 1 })
  return out
}

/** Minimal manhattan corridor start→boss, then grow to exactly `total` cells. */
function pickConnectedCells(
  w: number,
  h: number,
  total: number,
  start: Cell,
  boss: Cell,
  rng: () => number,
): Cell[] {
  const set = new Map<string, Cell>()
  let cx = start.gx
  let cy = start.gy
  set.set(cellKey(start), start)
  while (cx !== boss.gx || cy !== boss.gy) {
    // Randomize axis order when both need movement.
    const moveX = cx !== boss.gx
    const moveY = cy !== boss.gy
    if (moveX && moveY) {
      if (rng() < 0.5) cx += boss.gx > cx ? 1 : -1
      else cy += boss.gy > cy ? 1 : -1
    } else if (moveX) {
      cx += boss.gx > cx ? 1 : -1
    } else {
      cy += boss.gy > cy ? 1 : -1
    }
    set.set(cellKey({ gx: cx, gy: cy }), { gx: cx, gy: cy })
  }

  const frontierOf = () => {
    const f: Cell[] = []
    const seen = new Set<string>()
    for (const c of set.values()) {
      for (const n of neighbors4(c, w, h)) {
        const k = cellKey(n)
        if (set.has(k) || seen.has(k)) continue
        seen.add(k)
        f.push(n)
      }
    }
    return f
  }

  while (set.size < total) {
    const frontier = frontierOf()
    if (frontier.length === 0) break
    const pick = frontier[Math.floor(rng() * frontier.length)]!
    set.set(cellKey(pick), pick)
  }

  return [...set.values()]
}

function buildSpanningTree(
  cells: Cell[],
  w: number,
  h: number,
  rng: () => number,
): Array<[string, string]> {
  const keys = cells.map(cellKey)
  const keySet = new Set(keys)
  const cellByKey = new Map(cells.map(c => [cellKey(c), c]))

  const startKey = keys[0]!
  const inTree = new Set<string>([startKey])
  const edges: Array<[string, string]> = []

  while (inTree.size < keys.length) {
    const candidates: Array<[string, string]> = []
    for (const k of inTree) {
      const c = cellByKey.get(k)!
      for (const n of neighbors4(c, w, h)) {
        const nk = cellKey(n)
        if (!keySet.has(nk) || inTree.has(nk)) continue
        candidates.push([k, nk])
      }
    }
    if (candidates.length === 0) break
    const [a, b] = candidates[Math.floor(rng() * candidates.length)]!
    edges.push([a, b])
    inTree.add(b)
  }
  return edges
}

function addLoops(
  cells: Cell[],
  tree: Array<[string, string]>,
  w: number,
  h: number,
  loops: number,
  rng: () => number,
): Array<[string, string]> {
  const edgeSet = new Set(tree.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)))
  const keySet = new Set(cells.map(cellKey))
  const candidates: Array<[string, string]> = []

  for (const c of cells) {
    const ak = cellKey(c)
    for (const n of neighbors4(c, w, h)) {
      const bk = cellKey(n)
      if (!keySet.has(bk) || ak >= bk) continue
      const id = `${ak}|${bk}`
      if (edgeSet.has(id)) continue
      candidates.push([ak, bk])
    }
  }

  const picked = shuffle(candidates, rng).slice(0, Math.max(0, loops))
  return [...tree, ...picked]
}

function canReach(
  edges: Array<[string, string]>,
  from: string,
  to: string,
): boolean {
  const adj = new Map<string, string[]>()
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const q = [from]
  const seen = new Set(q)
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) return true
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue
      seen.add(n)
      q.push(n)
    }
  }
  return false
}

/** Pixel width of a generated map snapshot. */
export function mapWorldWidth(map: MapSnapshot): number {
  if (map.nodes.length === 0) return 270
  const maxX = Math.max(...map.nodes.map(n => n.x))
  return Math.max(270, maxX + PAD_X)
}

export function mapWorldHeight(map: MapSnapshot): number {
  if (map.nodes.length === 0) return 480
  const maxY = Math.max(...map.nodes.map(n => n.y))
  return Math.max(480, maxY + PAD_Y)
}

/**
 * Procedural maze of room-nodes for a campaign floor.
 * Same (floor, seed) ⇒ same layout.
 */
export function generateDungeonMap(floor: number, seed: number): MapSnapshot {
  const recipe = getDungeonRecipe(floor)
  const rng = mulberry32((seed ^ (floor * 0x9e3779b9)) >>> 0)
  const { gridW: w, gridH: h } = recipe
  const baseRooms = roomCount(recipe.rooms)
  const total = 2 + baseRooms

  if (w * h < total) {
    throw new Error(
      `[maze] floor ${floor}: grid ${w}x${h} too small for ${total} rooms`,
    )
  }

  // Portrait maze: start at top, boss at bottom.
  const start: Cell = {
    gx: Math.min(w - 1, Math.max(0, Math.floor(w / 2) + Math.floor(rng() * 3) - 1)),
    gy: 0,
  }
  const boss: Cell = {
    gx: Math.min(w - 1, Math.max(0, Math.floor(w / 2) + Math.floor(rng() * 3) - 1)),
    gy: h - 1,
  }

  const cells = pickConnectedCells(w, h, total, start, boss, rng)
  const startKey = cellKey(start)
  const bossKey = cellKey(boss)

  const tree = buildSpanningTree(cells, w, h, rng)
  const edges = addLoops(cells, tree, w, h, recipe.loops, rng)

  const bag = shuffle(roomBag(recipe.rooms), rng)
  while (bag.length < Math.max(0, cells.length - 2)) bag.push('combat')

  const nodeByKey = new Map<string, MapNodeSnapshot>()
  let nextId = 0

  for (const c of cells) {
    const k = cellKey(c)
    let kind: MapNodeKind
    if (k === startKey) kind = 'start'
    else if (k === bossKey) kind = 'boss'
    else kind = bag.pop() ?? 'combat'

    nodeByKey.set(k, {
      id: nextId++,
      col: c.gx,
      kind,
      x: PAD_X + c.gx * CELL_W,
      y: PAD_Y + c.gy * CELL_H,
      cleared: kind === 'start',
    })
  }

  const mapEdges: MapEdgeSnapshot[] = []
  const seen = new Set<string>()
  for (const [a, b] of edges) {
    const na = nodeByKey.get(a)
    const nb = nodeByKey.get(b)
    if (!na || !nb) continue
    const id = na.id < nb.id ? `${na.id}-${nb.id}` : `${nb.id}-${na.id}`
    if (seen.has(id)) continue
    seen.add(id)
    mapEdges.push({ from: na.id, to: nb.id })
  }

  const nodes = [...nodeByKey.values()].sort((a, b) => a.id - b.id)
  const map: MapSnapshot = { nodes, edges: mapEdges }

  if (!canReach(
    mapEdges.map(e => [String(e.from), String(e.to)]),
    String(nodes.find(n => n.kind === 'start')!.id),
    String(nodes.find(n => n.kind === 'boss')!.id),
  )) {
    throw new Error(`[maze] floor ${floor}: boss not reachable from start`)
  }

  return map
}

/** Undirected adjacency helper. */
export function nodesAdjacent(
  edges: MapEdgeSnapshot[],
  a: number,
  b: number,
): boolean {
  return edges.some(
    e => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  )
}
