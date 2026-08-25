import Phaser from 'phaser'
import { getRunState, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { addPixelText } from '../ui/pixelText'
import { enableTouchTarget } from '../ui/touchTarget'
import type { RunState, RewardTier } from '../domain/progression/RunState'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { GEAR, gearDef, type GearDef } from '../domain/items/Equipment'
import { RARITY_COLORS } from '../domain/items/Item'
import { gearForgeTooltipLines } from '../domain/items/forgeTooltip'
import { markCurrentNodeCleared } from './MapScene'
import { advanceFloorAfterBoss } from '../domain/progression/advanceDepth'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { gearName, t } from '../i18n/I18n'
import { ItemTooltip, gearTooltipContent } from '../ui/ItemTooltip'
type RewardKind = 'coins' | 'heal' | 'dmg' | 'def' | 'passive'

interface RewardOption {
  kind: RewardKind
  label: string
  coins?: number
  heal?: number
  passiveId?: string
}

interface ChestPrize {
  gearId: string
  label: string
  /** Already owned — picking grants meta gold instead. */
  duplicate: boolean
  gold?: number
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

function dupGoldAmount(floor: number, rng: () => number): number {
  return 40 + floor * 8 + Math.floor(rng() * 20)
}

function buildOptions(state: RunState, _tier: RewardTier): RewardOption[] {
  const healAmt = Math.floor(state.maxHp * 0.35)
  return [
    { kind: 'heal', label: t('reward.heal', { n: healAmt }), heal: healAmt },
    { kind: 'def', label: t('reward.def') },
    { kind: 'dmg', label: t('reward.dmg') },
  ]
}

function pickGearFromPool(pool: GearDef[], rng: () => number): GearDef | undefined {
  if (pool.length === 0) return undefined
  const rare = pool.filter(g => g.rarity === 'rare')
  return pickOne(rare.length > 0 && rng() < 0.65 ? rare : pool, rng)
}

/** Boss chest: 5 unique set pieces; player picks one into meta bag. */
function buildBossChest(state: RunState): ChestPrize[] {
  const rng = mulberry32(state.seed + state.floor * 91 + 404)
  const owned = MetaProgression.ownedGearIds()
  const offered = new Set<string>()
  const prizes: ChestPrize[] = []

  const take = (pool: GearDef[], duplicate: boolean) => {
    const available = pool.filter(g => !offered.has(g.id))
    const pick = pickGearFromPool(available, rng)
    if (!pick) return false
    offered.add(pick.id)
    const gold = duplicate ? dupGoldAmount(state.floor, rng) : undefined
    prizes.push({
      gearId: pick.id,
      duplicate,
      gold,
      label: duplicate
        ? t('reward.chestDupGold', { name: gearName(pick.id), n: gold ?? 0 })
        : t('reward.chestGear', { name: gearName(pick.id) }),
    })
    return true
  }

  while (prizes.length < 5) {
    const unowned = GEAR.filter(g => !owned.has(g.id) && !offered.has(g.id))
    if (unowned.length > 0) {
      if (!take(unowned, false)) break
      continue
    }
    const ownedPool = GEAR.filter(g => owned.has(g.id) && !offered.has(g.id))
    if (ownedPool.length > 0) {
      if (!take(ownedPool, true)) break
      continue
    }
    break
  }

  return prizes
}

export class RewardScene extends Phaser.Scene {
  private state!: RunState
  private options: RewardOption[] = []
  private chestPrizes: ChestPrize[] = []
  private isChest = false
  private locked = false

  constructor() {
    super('RewardScene')
  }

  init() {
    this.options = []
    this.chestPrizes = []
    this.isChest = false
    this.locked = false
  }

  create() {
    const { height } = this.cameras.main
    const cx = this.cameras.main.width / 2
    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }
    this.state = rs
    renderDebugHeader(this, this.state)

    this.isChest = this.state.pendingRewardTier === 'boss'

    if (this.isChest) {
      this.createChestUi(cx, height)
    } else {
      this.createPickUi(cx, height)
    }
  }

  private createPickUi(cx: number, height: number) {
    this.options = buildOptions(this.state, this.state.pendingRewardTier)

    addPixelText(this, cx, 32, t('reward.title'), {
      fontSize: '16px',
      color: '#ffdd88',
    }).setOrigin(0.5)

    this.options.forEach((opt, i) => {
      const y = 96 + i * 40
      const txt = addPixelText(this, cx, y, `[${i + 1}] ${opt.label}`, {
        fontSize: '16px',
        color: '#eeeeee',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      txt.on('pointerover', () => txt.setColor('#ffffff'))
      txt.on('pointerout', () => txt.setColor('#eeeeee'))
      txt.on('pointerdown', () => this.pick(i))
    })

    addPixelText(this, cx, height - 14, t('reward.hint'), {
      fontSize: '8px',
      color: '#999999',
    }).setOrigin(0.5)

    this.input.keyboard!.once('keydown-ONE', () => this.pick(0))
    this.input.keyboard!.once('keydown-TWO', () => this.pick(1))
    this.input.keyboard!.once('keydown-THREE', () => this.pick(2))
  }

  private createChestUi(cx: number, height: number) {
    this.chestPrizes = buildBossChest(this.state)
    AudioSystem.play('coin')
    const tooltip = new ItemTooltip(this)

    addPixelText(this, cx, 28, t('reward.chestTitle'), {
      fontSize: '16px',
      color: '#ffcc66',
    }).setOrigin(0.5)

    addPixelText(this, cx, 48, t('reward.chestPick'), {
      fontSize: '8px',
      color: '#aaaaaa',
    }).setOrigin(0.5)

    this.chestPrizes.forEach((prize, i) => {
      const y = 72 + i * 28
      const def = gearDef(prize.gearId)
      const color = def ? RARITY_COLORS[def.rarity] : '#dddddd'
      const txt = addPixelText(this, cx, y, `[${i + 1}] ${prize.label}`, {
        fontSize: '8px',
        color,
      }).setOrigin(0.5)
      enableTouchTarget(txt, { min: 24 })

      const tip = def
        ? gearTooltipContent({
            ...def,
            name: gearName(def.id),
            forgeLines: gearForgeTooltipLines(def.id),
          })
        : null

      txt.on('pointerover', () => {
        txt.setColor('#ffffff')
        if (tip) tooltip.showAt(txt.x, txt.y, tip)
      })
      txt.on('pointerout', () => {
        txt.setColor(color)
        tooltip.hide()
      })
      txt.on('pointerdown', () => {
        tooltip.hide()
        this.pickChest(i)
      })
    })

    addPixelText(this, cx, height - 14, t('reward.chestHint'), {
      fontSize: '8px',
      color: '#999999',
    }).setOrigin(0.5)

    bindSceneKeys(this, {
      'keydown-ONE': () => this.pickChest(0),
      'keydown-TWO': () => this.pickChest(1),
      'keydown-THREE': () => this.pickChest(2),
      'keydown-FOUR': () => this.pickChest(3),
      'keydown-FIVE': () => this.pickChest(4),
    })
  }

  private pickChest(index: number) {
    if (this.locked || !this.isChest) return
    const prize = this.chestPrizes[index]
    if (!prize) return
    this.locked = true

    if (prize.duplicate) {
      MetaProgression.addGold(prize.gold ?? 0)
      AudioSystem.play('coin')
    } else {
      MetaProgression.addGearToBag(prize.gearId)
      AudioSystem.play('select')
    }

    this.finishReward()
  }

  private pick(index: number) {
    if (this.locked || this.isChest) return
    const opt = this.options[index]
    if (!opt) return
    this.locked = true

    switch (opt.kind) {
      case 'coins':
        this.state.coins += opt.coins ?? 0
        AudioSystem.play('coin')
        break
      case 'heal':
        this.state.hp = Math.min(this.state.maxHp, this.state.hp + (opt.heal ?? 0))
        AudioSystem.play('heal')
        break
      case 'dmg':
        this.state.bonusDmgFlat += 1
        AudioSystem.play('select')
        break
      case 'def':
        this.state.bonusDefFlat += 1
        this.state.heroShield += 1
        AudioSystem.play('select')
        break
      case 'passive':
        if (opt.passiveId && !this.state.passives.includes(opt.passiveId)) {
          this.state.passives.push(opt.passiveId)
        }
        AudioSystem.play('select')
        break
    }

    this.finishReward()
  }

  private finishReward() {
    markCurrentNodeCleared(this.state)

    if (this.state.pendingRewardTier === 'boss') {
      advanceFloorAfterBoss(this.state)
      SaveSystem.save('quicksave', this.state)
      this.scene.start('GameOverScene', {
        runState: this.state,
        victory: true,
      })
      return
    }

    this.state.pendingNodeKind = null
    SaveSystem.save('quicksave', this.state)
    this.scene.start('MapScene', { runState: this.state })
  }
}
