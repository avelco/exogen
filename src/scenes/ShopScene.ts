import Phaser from 'phaser'
import { getRunState, getSceneData, renderDebugHeader } from '../debug'
import { SaveSystem } from '../systems/SaveSystem'
import { addPixelText } from '../ui/pixelText'
import { pickRandomPassiveIds } from '../domain/progression/Passives'
import { markCurrentNodeCleared } from './MapScene'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { passiveName, t } from '../i18n/I18n'
import { enableTouchTarget } from '../ui/touchTarget'
import type { RunState } from '../domain/progression/RunState'
import { syncRunStateDerived } from '../domain/progression/RunState'
import { AudioSystem } from '../systems/AudioSystem'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { TutorialBanner } from '../ui/TutorialBanner'

interface ShopOffer {
  label: string
  enabled: boolean
  apply: () => void
}

export class ShopScene extends Phaser.Scene {
  private locked = false
  private postCombat = false
  private soulsGained = 0
  private picked = false

  constructor() {
    super('ShopScene')
  }

  init() {
    this.locked = false
    this.picked = false
  }

  create() {
    const { width, height } = this.cameras.main
    const cx = width / 2
    const data = getSceneData(this)
    const rs = getRunState(this)
    if (!rs) {
      this.scene.start('MenuScene')
      return
    }
    this.postCombat = !!data.postCombat
    this.soulsGained = data.soulsGained ?? 0

    renderDebugHeader(this, rs)

    addPixelText(this, cx, 28, t(this.postCombat ? 'shop.postTitle' : 'shop.title'), {
      fontSize: '12px',
      color: '#ffcc66',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    if (this.postCombat && this.soulsGained > 0) {
      addPixelText(this, cx, 46, t('shop.soulsGained', { n: this.soulsGained }), {
        fontSize: '8px',
        color: '#88ffaa',
      }).setOrigin(0.5)
    }

    addPixelText(
      this,
      cx,
      this.postCombat && this.soulsGained > 0 ? 60 : 48,
      t('shop.pickFree'),
      {
        fontSize: '8px',
        color: '#aaaaaa',
      },
    ).setOrigin(0.5)

    const offers = this.postCombat
      ? this.standardOffers(rs)
      : this.mapShopOffers(rs)

    offers.forEach((o, i) => {
      const y = 96 + i * 32
      const offer = addPixelText(this, cx, y, `[${i + 1}] ${o.label}`, {
        fontSize: '8px',
        color: o.enabled ? '#dddddd' : '#555555',
        wordWrap: { width: width - 40 },
        align: 'center',
      }).setOrigin(0.5)
      if (o.enabled) {
        enableTouchTarget(offer, { min: 28 })
        offer.on('pointerdown', () => this.pick(rs, o.apply))
      }
    })

    const exit = addPixelText(this, cx, height - 28, t('shop.exit'), {
      fontSize: '10px',
      color: '#dddddd',
    }).setOrigin(0.5)
    enableTouchTarget(exit, { min: 36 })
    exit.on('pointerover', () => exit.setColor('#ffffff'))
    exit.on('pointerout', () => exit.setColor('#dddddd'))
    exit.on('pointerdown', () => this.leave(rs))

    const keys: Record<string, () => void> = {
      'keydown-ZERO': () => this.leave(rs),
    }
    offers.forEach((o, i) => {
      if (i >= 9) return
      const key = `keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][i]}`
      keys[key] = () => {
        if (o.enabled) this.pick(rs, o.apply)
      }
    })
    bindSceneKeys(this, keys)

    if (this.postCombat && !MetaProgression.isTutorialDone()) {
      const tip = new TutorialBanner(this)
      tip.show('tutorial.souls', () => {
        MetaProgression.completeTutorial()
        tip.destroy()
      })
    }
  }

  /** Equal-value free buffs: heal 35% / +1 def / +1 dmg. */
  private standardOffers(rs: RunState): ShopOffer[] {
    const healAmt = Math.max(1, Math.floor(rs.maxHp * 0.35))
    return [
      {
        label: t('shop.healFree', { n: healAmt }),
        enabled: rs.hp < rs.maxHp,
        apply: () => {
          rs.hp = Math.min(rs.maxHp, rs.hp + healAmt)
        },
      },
      {
        label: t('shop.defFree'),
        enabled: true,
        apply: () => {
          rs.bonusDefFlat += 1
          rs.heroShield += 1
        },
      },
      {
        label: t('shop.dmgFree'),
        enabled: true,
        apply: () => {
          rs.bonusDmgFlat += 1
        },
      },
    ]
  }

  private mapShopOffers(rs: RunState): ShopOffer[] {
    const offers = this.standardOffers(rs)
    const [pid] = pickRandomPassiveIds(1, rs.passives, () => Math.random())
    if (pid) {
      // Rotate: replace def with passive sometimes so map shops stay varied
      offers[1] = {
        label: t('shop.passiveFree', { name: passiveName(pid) }),
        enabled: true,
        apply: () => {
          if (!rs.passives.includes(pid)) rs.passives.push(pid)
        },
      }
    }
    return offers
  }

  private pick(rs: RunState, apply: () => void) {
    if (this.locked || this.picked) return
    this.picked = true
    apply()
    syncRunStateDerived(rs)
    AudioSystem.play('select')
    SaveSystem.save('quicksave', rs)
    this.leave(rs)
  }

  private leave(rs: RunState) {
    if (this.locked) return
    this.locked = true
    markCurrentNodeCleared(rs)
    rs.pendingNodeKind = null
    SaveSystem.save('quicksave', rs)
    AudioSystem.play('ui')
    this.scene.start('MapScene', { runState: rs })
  }
}
