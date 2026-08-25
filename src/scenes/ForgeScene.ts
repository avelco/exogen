import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { addBackButton } from '../ui/BackButton'
import { enableTouchTarget } from '../ui/touchTarget'
import { AudioSystem } from '../systems/AudioSystem'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { gearDef } from '../domain/items/Equipment'
import {
  AFFIX_TIER_COLORS,
  FORGE_REROLL_COST,
  affixDef,
  formatAffix,
} from '../domain/items/Affixes'
import { formatMods, RARITY_COLORS } from '../domain/items/Item'
import { gearName, slotLabel, t } from '../i18n/I18n'

export class ForgeScene extends Phaser.Scene {
  private selectedId: string | null = null
  private ui: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('ForgeScene')
  }

  create() {
    MetaProgression.load()
    const { width } = this.cameras.main
    const cx = width / 2

    addBackButton(this, () => this.scene.start('MenuScene'))

    addPixelText(this, cx, 14, t('forge.title'), {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)

    const owned = MetaProgression.listOwnedGearIds()
    if (owned.length > 0 && !this.selectedId) {
      this.selectedId = owned[0]
    }

    this.refresh()

    bindSceneKeys(this, {
      'keydown-ESC': () => this.scene.start('MenuScene'),
    })
  }

  private clearUi() {
    for (const obj of this.ui) obj.destroy()
    this.ui = []
  }

  private addUi<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.ui.push(obj)
    return obj
  }

  private refresh() {
    this.clearUi()
    const meta = MetaProgression.load()
    const owned = MetaProgression.listOwnedGearIds().sort((a, b) => {
      const da = gearDef(a)
      const db = gearDef(b)
      if (!da || !db) return a.localeCompare(b)
      if (da.slot !== db.slot) {
        return da.slot.localeCompare(db.slot)
      }
      return a.localeCompare(b)
    })

    if (owned.length === 0) {
      this.addUi(
        addPixelText(this, this.cameras.main.width / 2, 120, t('forge.empty'), {
          fontSize: '8px',
          color: '#888888',
        }).setOrigin(0.5),
      )
      return
    }

    if (!this.selectedId || !owned.includes(this.selectedId)) {
      this.selectedId = owned[0]
    }

    let y = 36
    this.addUi(
      addPixelText(this, 12, y, t('forge.owned'), {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 14

    const listBottom = 200
    for (const id of owned) {
      const def = gearDef(id)
      if (!def) continue
      const selected = id === this.selectedId
      const label = `${slotLabel(def.slot)} ${gearName(def.id)}`
      const txt = this.addUi(
        addPixelText(this, 12, y, label, {
          fontSize: '8px',
          color: selected ? '#ffffaa' : RARITY_COLORS[def.rarity],
        }),
      )
      enableTouchTarget(txt)
      txt.on('pointerdown', () => {
        AudioSystem.play('ui')
        this.selectedId = id
        this.refresh()
      })
      y += 13
      if (y > listBottom) break
    }

    this.drawDetail(meta)
  }

  private drawDetail(meta: ReturnType<typeof MetaProgression.load>) {
    const id = this.selectedId
    if (!id) return
    const def = gearDef(id)
    if (!def) return

    const forge = MetaProgression.getForgeState(id)
    const frags = meta.fragments[def.slot] ?? 0
    const x = 12
    let y = 220
    const { width, height } = this.cameras.main
    const cx = width / 2

    this.addUi(
      addPixelText(this, x, y, gearName(def.id), {
        fontSize: '10px',
        color: RARITY_COLORS[def.rarity],
      }),
    )
    y += 14
    this.addUi(
      addPixelText(this, x, y, `${slotLabel(def.slot)} · ${t('forge.base')}`, {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 12
    for (const line of formatMods(def.mods)) {
      this.addUi(
        addPixelText(this, x, y, line, {
          fontSize: '8px',
          color: '#ccffcc',
        }),
      )
      y += 11
    }

    y += 4
    this.addUi(
      addPixelText(this, x, y, t('forge.applied'), {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 12
    if (forge.appliedAffixId) {
      const a = affixDef(forge.appliedAffixId)
      if (a) {
        this.addUi(
          addPixelText(this, x, y, formatAffix(a), {
            fontSize: '8px',
            color: AFFIX_TIER_COLORS[a.tier],
          }),
        )
      }
    } else {
      this.addUi(
        addPixelText(this, x, y, t('forge.none'), {
          fontSize: '8px',
          color: '#666666',
        }),
      )
    }
    y += 14

    this.addUi(
      addPixelText(this, x, y, t('forge.pending'), {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 12
    if (forge.pendingAffixId) {
      const a = affixDef(forge.pendingAffixId)
      if (a) {
        this.addUi(
          addPixelText(this, x, y, formatAffix(a), {
            fontSize: '8px',
            color: AFFIX_TIER_COLORS[a.tier],
          }),
        )
      }
    } else {
      this.addUi(
        addPixelText(this, x, y, t('forge.none'), {
          fontSize: '8px',
          color: '#666666',
        }),
      )
    }
    y += 16

    this.addUi(
      addPixelText(
        this,
        x,
        y,
        t('forge.frags', { n: frags, cost: FORGE_REROLL_COST }),
        {
          fontSize: '8px',
          color: frags >= FORGE_REROLL_COST ? '#ffcc66' : '#ff6666',
        },
      ),
    )
    y += 18

    const canReroll = frags >= FORGE_REROLL_COST
    const rerollBtn = this.addUi(
      addPixelText(this, x, y, t('forge.reroll'), {
        fontSize: '10px',
        color: canReroll ? '#66ffaa' : '#555555',
      }),
    )
    if (canReroll) {
      enableTouchTarget(rerollBtn, { min: 24 })
      rerollBtn.on('pointerdown', () => {
        if (!this.selectedId) return
        const result = MetaProgression.rerollForge(this.selectedId)
        if (result) {
          AudioSystem.play('select')
          this.refresh()
        }
      })
    }

    const applyBtn = this.addUi(
      addPixelText(this, x + 100, y, t('forge.apply'), {
        fontSize: '10px',
        color: forge.pendingAffixId ? '#66aaff' : '#555555',
      }),
    )
    if (forge.pendingAffixId) {
      enableTouchTarget(applyBtn, { min: 24 })
      applyBtn.on('pointerdown', () => {
        if (!this.selectedId) return
        if (MetaProgression.applyForge(this.selectedId)) {
          AudioSystem.play('select')
          this.refresh()
        }
      })
    }

    this.addUi(
      addPixelText(this, cx, height - 12, t('forge.hint'), {
        fontSize: '8px',
        color: '#666666',
      }).setOrigin(0.5),
    )
  }
}
