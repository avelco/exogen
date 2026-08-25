#!/usr/bin/env node
/**
 * Balance simulator for Núcleos del Silencio.
 *
 * Reads real card data from src/data/cards.json and replicates the economy:
 *   - packs: 5 cards, weights from src/domain/cards/Packs.ts (PACK_WEIGHTS)
 *   - end of run: 2 packs on victory, 1 on defeat (endRunPackCount)
 *   - store: pack price 40 + 2*depth (StoreScene.packGoldCost)
 *   - souls per combat: src/domain/progression/CombatRewards.ts
 *   - rooms per depth: src/data/dungeonRecipes.json + MazeGenerator.recipeForHighFloor
 *   - fusion: 2 same -> +1 level up to MAX_FUSION_LEVEL=7 (Card.ts)
 *     fusing N5+ has 10% glitch -> random corrupt N1 (Fusion.ts)
 *   - ascension: 2xN7 -> chosen N1 of next rarity; unique->corrupt has
 *     10% crit -> random ascended N1 (Fusion.ts)
 *   - difficulty spikes x1.5 @100, x2 @300 (Enemy.ts thresholdMult)
 *   - card effect die: D6 faces 1–3 ×1, 4–5 ×2, 6 ×3; expected ×5/3;
 *     enemy HP compensation ×1.6 (src/domain/combat/CardEffectDie.ts)
 *
 * Keep constants in sync with the files above when balance changes.
 *
 * Usage: node scripts/balance-sim.mjs [runs]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARDS = JSON.parse(readFileSync(join(ROOT, 'src/data/cards.json'), 'utf8'))
const RECIPES = JSON.parse(readFileSync(join(ROOT, 'src/data/dungeonRecipes.json'), 'utf8')).floors

// --- constants mirrored from src/domain (see header) ---
const MAX_LEVEL = 7
const FUSE_FAIL_CHANCE = 0.1
const FUSE_FAIL_MIN_LEVEL = 5
const ASCEND_CRIT_CHANCE = 0.1
const ASCEND_MAX_LEVEL = 3
const PACK_GOLD = depth => 40 + Math.floor(depth * depth / 9)
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique', 'corrupt', 'ascended']
const W_STANDARD = { common: 48, uncommon: 12.6, rare: 18, epic: 6.3, legendary: 6, unique: 1.8, corrupt: 0, ascended: 0 }
const W_ENDRUN = { common: 48, uncommon: 25.2, rare: 36, epic: 12.6, legendary: 12, unique: 3.6, corrupt: 0, ascended: 0 }
const MAX_DEPTH = 400
const CARD_EFFECT_DIE_EXPECTED_MULTIPLIER = 5 / 3
const CARD_EFFECT_DIE_ENEMY_HP_MULTIPLIER = 1.6

const DEFS = CARDS.map(c => ({ id: c.id, r: c.rarity }))
const byRarity = r => DEFS.filter(d => d.r === r)

function rarityDepthScale(r, depth) {
  const d = Math.max(1, depth)
  switch (r) {
    case 'rare': return 1 + d / 200
    case 'epic': return 1 + d / 150
    case 'legendary': return 1 + d / 300
    case 'unique': return 1 + d / 300
    default: return 1
  }
}

function openPack(weights, depth = 1) {
  const out = []
  const w = r => weights[r] * rarityDepthScale(r, depth)
  const total = ORDER.reduce((s, r) => s + w(r), 0)
  for (let i = 0; i < 5; i++) {
    let roll = Math.random() * total
    let rarity = 'common'
    for (const r of ORDER) { roll -= w(r); if (roll <= 0) { rarity = r; break } }
    const pool = byRarity(rarity)
    if (!pool.length) { i--; continue }
    out.push(pool[Math.floor(Math.random() * pool.length)].id)
  }
  return out
}

function rooms(depth) {
  if (depth <= RECIPES.length) {
    const r = RECIPES[depth - 1].rooms
    return { combat: r.combat, elite: r.elite }
  }
  const t = depth - 5
  return { combat: Math.min(18, 11 + Math.floor(t / 8)), elite: Math.min(5, 3 + Math.floor(t / 25)) }
}

function soulsPerDepth(depth, clear) {
  const { combat, elite } = rooms(depth)
  const normal = 11 + 3 * depth + (5 + depth) / 2
  const eliteR = 18 + 3 * depth + (8 + depth) / 2
  return Math.round((combat * normal + elite * eliteR) * clear)
}

const n1eq = (col, id) => {
  let s = 0
  for (let lv = 1; lv <= MAX_LEVEL; lv++) {
    const ref = lv === 1 ? id : `${id}@${lv}`
    s += (col[ref] ?? 0) * 2 ** (lv - 1)
  }
  return s
}
const BASE_TIERS = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique'])
const tierDone = (col, r) =>
  BASE_TIERS.has(r)
    ? byRarity(r).every(d => (col[`${d.id}@${MAX_LEVEL}`] ?? 0) >= 1)
    : byRarity(r).every(d => n1eq(col, d.id) >= 1)
const maxed = col => ORDER.every(r => tierDone(col, r))

const randOf = r => {
  const pool = byRarity(r)
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null
}

function optimize(col, stats) {
  // A few passes suffice: fusion chains flow upward, then surplus ascends.
  const neediest = rarity => {
    const pool = byRarity(rarity)
    if (!pool.length) return null
    const sorted = [...pool].sort((a, b) => n1eq(col, a.id) - n1eq(col, b.id))
    const target = sorted[0]
    return n1eq(col, target.id) < 2 ** (MAX_LEVEL - 1) ? target : null
  }
  for (let pass = 0; pass < 6; pass++) {
    // 1) ascend surplus pairs at ANY level once the def owns its N7
    for (const d of DEFS) {
      const i = ORDER.indexOf(d.r)
      if (i < 0 || i >= ORDER.length - 1) continue
      if ((col[`${d.id}@${MAX_LEVEL}`] ?? 0) < 1) continue
      for (let lv = 1; lv <= ASCEND_MAX_LEVEL; lv++) {
        const ref = lv === 1 ? d.id : `${d.id}@${lv}`
        while ((col[ref] ?? 0) >= 2) {
          const target = neediest(ORDER[i + 1])
          if (!target) break
          col[ref] -= 2
          let gain = lv === 1 ? target.id : `${target.id}@${lv}`
          if (stats) stats.ascensions++
          if (d.r === 'unique' && Math.random() < ASCEND_CRIT_CHANCE && byRarity('ascended').length) {
            gain = lv === 1 ? randOf('ascended') : `${randOf('ascended')}@${lv}`
            if (stats) stats.crits++
          }
          col[gain] = (col[gain] ?? 0) + 1
        }
      }
    }
    // 2) fuse pairs upward (with glitch into corrupt at high levels)
    for (const d of DEFS) {
      for (let lv = 1; lv < MAX_LEVEL; lv++) {
        const ref = lv === 1 ? d.id : `${d.id}@${lv}`
        while ((col[ref] ?? 0) >= 2) {
          col[ref] -= 2
          let up
          if (lv >= FUSE_FAIL_MIN_LEVEL && Math.random() < FUSE_FAIL_CHANCE && byRarity('corrupt').length) {
            up = randOf('corrupt')
          } else {
            up = `${d.id}@${lv + 1}`
          }
          col[up] = (col[up] ?? 0) + 1
        }
      }
    }
  }
}

function simulate(winRate, clear) {
  const col = {}
  const stats = { ascensions: 0, crits: 0 }
  for (const id of openPack(W_STANDARD)) col[id] = (col[id] ?? 0) + 1
  for (const id of openPack(W_STANDARD)) col[id] = (col[id] ?? 0) + 1
  const tierAt = {}
  let depth = 1
  let runs = 0
  while (!maxed(col) && runs < 8000) {
    runs++
    const win = Math.random() < winRate
    const gold = Math.floor(soulsPerDepth(depth, clear) * (win ? 1 : 0.5))
    const packs = (win ? 2 : 1) + Math.floor(gold / PACK_GOLD(depth))
    for (let p = 0; p < packs; p++) {
      const profile = p < (win ? 2 : 1) ? W_ENDRUN : W_STANDARD
      for (const id of openPack(profile, depth)) col[id] = (col[id] ?? 0) + 1
    }
    optimize(col, stats)
    for (const r of ORDER) {
      if (!(r in tierAt) && tierDone(col, r)) tierAt[r] = depth
    }
    if (maxed(col)) return { depth, runs, tierAt, stats }
    if (win) depth = Math.min(MAX_DEPTH, depth + 1)
  }
  return { depth, runs, tierAt, stats, maxed: maxed(col) }
}

function batch(label, winRate, clear, n) {
  const ds = []
  const rs = []
  const tiers = new Map(ORDER.map(r => [r, []]))
  let unfinished = 0
  for (let i = 0; i < n; i++) {
    const r = simulate(winRate, clear)
    if (r.maxed === false) unfinished++
    ds.push(r.depth)
    rs.push(r.runs)
    for (const t of ORDER) {
      if (r.tierAt[t] != null) tiers.get(t).push(r.tierAt[t])
    }
  }
  ds.sort((a, b) => a - b)
  rs.sort((a, b) => a - b)
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))]
  const avg = arr => Math.round(arr.reduce((s, x) => s + x, 0) / arr.length)
  const med = arr => (arr.length ? q([...arr].sort((a, b) => a - b), 0.5) : '-')
  console.log(`${label}: maxeo media=${avg(ds)} mediana=${q(ds, 0.5)} p90=${q(ds, 0.9)} | runs media=${avg(rs)}${unfinished ? ` | sin maxear: ${unfinished}/${n}` : ''}`)
  console.log(`   tiers (mediana prof.): ${ORDER.map(r => `${r}=${med(tiers.get(r))}`).join(' ')}`)
  const sample = simulate(winRate, clear)
  console.log(`   muestra: ascensiones=${sample.stats.ascensions} crits=${sample.stats.crits} tiers=${JSON.stringify(sample.tierAt)}`)
}

// --- combat pacing: base and card-die turns to kill per depth band ---
function baseEnemyHp(depth, kind) {
  const scale = kind === 'boss' ? 1.55 : kind === 'elite' ? 1.15 : 1
  const mult = depth >= 300 ? 2 : depth >= 100 ? 1.5 : 1
  return Math.floor((33 + Math.floor(6 * Math.pow(depth, 0.72))) * scale * mult)
}
function enemyHpWithCardDie(depth, kind) {
  return Math.ceil(baseEnemyHp(depth, kind) * CARD_EFFECT_DIE_ENEMY_HP_MULTIPLIER)
}
function cardDamagePerTurn(avgCardLevel) {
  return 3 * 12 * (1 + 0.5 * (avgCardLevel - 1))
}
function basePlayerDmgPerTurn(avgCardLevel) {
  // 3 slots, avg damage card base ~12, level curve x(1+0.5*(lv-1)), +10 flat
  return Math.round(cardDamagePerTurn(avgCardLevel) + 10)
}
function playerDmgPerTurnWithCardDie(avgCardLevel) {
  return Math.round(
    cardDamagePerTurn(avgCardLevel) * CARD_EFFECT_DIE_EXPECTED_MULTIPLIER + 10,
  )
}

console.log('=== Ritmo de combate (turnos por enemigo, mazo medio por banda) ===')
for (const [depth, lv] of [[1, 1], [50, 2], [100, 3], [150, 4], [300, 6], [400, 7]]) {
  const baseDmg = basePlayerDmgPerTurn(lv)
  const dieDmg = playerDmgPerTurnWithCardDie(lv)
  const line = ['combat', 'elite', 'boss']
    .map(kind => {
      const baseHp = baseEnemyHp(depth, kind)
      const dieHp = enemyHpWithCardDie(depth, kind)
      const baseTurns = Math.ceil(baseHp / baseDmg)
      const dieTurns = Math.ceil(dieHp / dieDmg)
      return `${kind}: base ${baseTurns}t (HP ${baseHp}, ${baseDmg} dmg/t) · dado ${dieTurns}t (HP ${dieHp}, ${dieDmg} dmg/t)`
    })
    .join(' · ')
  console.log(`d${depth} N${lv} → ${line}`)
}

console.log('\n=== Colección: profundidad a la que todo está a N7 ===')
const N = Number(process.argv[2] ?? 200)
batch('bueno (80% victorias, clear 70%)', 0.8, 0.7, N)
batch('medio (60% victorias, clear 60%)', 0.6, 0.6, N)
batch('casual (40% victorias, clear 50%)', 0.4, 0.5, N)
