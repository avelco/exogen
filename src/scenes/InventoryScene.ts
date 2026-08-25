import Phaser from 'phaser'
import { addPixelText } from '../ui/pixelText'
import { AudioSystem } from '../systems/AudioSystem'
import { MetaProgression } from '../domain/progression/MetaProgression'
import { gearDef } from '../domain/items/Equipment'
import { runeDef } from '../domain/items/Runes'
import {
  GEAR_SLOTS,
  RARITY_COLORS,
  RUNE_SLOT_COUNT,
  type GearSlot,
} from '../domain/items/Item'
import {
  formatLoadoutCombatExtras,
  sumLoadoutMods,
} from '../domain/progression/Loadout'
import {
  ItemTooltip,
  emptyRuneTooltip,
  emptySlotTooltip,
  gearTooltipContent,
  runeTooltipContent,
  type TooltipContent,
} from '../ui/ItemTooltip'
import { bindSceneKeys } from '../systems/bindSceneKeys'
import { gearName, runeName, slotLabel, t } from '../i18n/I18n'
import { addBackButton } from '../ui/BackButton'
import { enableTouchTarget } from '../ui/touchTarget'
import { gearForgeTooltipLines } from '../domain/items/forgeTooltip'

type SelectedSlot =
  | { kind: 'gear'; slot: GearSlot }
  | { kind: 'rune'; index: number }
  | null

export class InventoryScene extends Phaser.Scene {
  private selected: SelectedSlot = null
  private slotTexts: Phaser.GameObjects.Text[] = []
  private bagTexts: Phaser.GameObjects.Text[] = []
  private statsText!: Phaser.GameObjects.Text
  private fragText!: Phaser.GameObjects.Text
  private tooltip!: ItemTooltip
  private pinned: TooltipContent | null = null

  constructor() {
    super('InventoryScene')
  }

  create() {
    const { width, height } = this.cameras.main
    const cx = width / 2

    addPixelText(this, cx, 12, t('inv.title'), {
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.statsText = addPixelText(this, cx, 28, '', {
      fontSize: '8px',
      color: '#88cc88',
      wordWrap: { width: width - 40 },
      align: 'center',
    }).setOrigin(0.5)

    this.fragText = addPixelText(this, cx, 48, '', {
      fontSize: '8px',
      color: '#aaddff',
      wordWrap: { width: width - 40 },
      align: 'center',
    }).setOrigin(0.5)

    addPixelText(this, cx, height - 12, t('inv.hint'), {
      fontSize: '8px',
      color: '#666666',
    }).setOrigin(0.5)

    this.tooltip = new ItemTooltip(this)

    const goMenu = () => {
      AudioSystem.play('ui')
      this.scene.start('MenuScene')
    }
    addBackButton(this, goMenu)

    bindSceneKeys(this, {
      'keydown-ESC': goMenu,
    })

    this.redraw()
  }

  private bindTooltip(
    target: Phaser.GameObjects.GameObject & {
      x: number
      y: number
      on: (ev: string, fn: (...args: unknown[]) => void) => void
    },
    content: TooltipContent,
    pinOnDown = false,
  ) {
    target.on('pointerover', () => {
      this.tooltip.showAt(target.x, target.y, content)
    })
    target.on('pointerout', () => {
      if (this.pinned) {
        this.tooltip.showAt(12, 46, this.pinned)
      } else {
        this.tooltip.hide()
      }
    })
    if (pinOnDown) {
      target.on('pointerdown', () => {
        this.pinned = content
        this.tooltip.showAt(target.x, target.y, content)
      })
    }
  }

  private redraw() {
    for (const t of this.slotTexts) t.destroy()
    for (const t of this.bagTexts) t.destroy()
    this.slotTexts = []
    this.bagTexts = []
    this.pinned = null
    this.tooltip.hide()

    const meta = MetaProgression.load()
    const mods = sumLoadoutMods(meta.loadout)
    const extras = formatLoadoutCombatExtras(mods)
    this.statsText.setText(
      `HP+${mods.maxHp}  ESC+${mods.defFlat}  DMG+${mods.dmgFlat}  ` +
        `${t('inv.coinsBonus', { n: mods.startGold })}` +
        `  |  ${t('inv.metaGold', { n: MetaProgression.getGold() })}` +
        (extras ? `\n${extras}` : ''),
    )
    const fr = MetaProgression.getFragments()
    this.fragText.setText(
      t('inv.fragments', {
        hat: fr.hat,
        cape: fr.cape,
        belt: fr.belt,
        ring: fr.ring,
        boots: fr.boots,
      }),
    )

    let y = 68
    for (const slot of GEAR_SLOTS) {
      const id = meta.loadout.gear[slot]
      const def = id ? gearDef(id) : undefined
      const label = `${slotLabel(slot)}: ${def ? gearName(def.id) : '-'}`
      const selected =
        this.selected?.kind === 'gear' && this.selected.slot === slot
      const txt = addPixelText(this, 12, y, label, {
        fontSize: '8px',
        color: selected
          ? '#ffffaa'
          : def
            ? RARITY_COLORS[def.rarity]
            : '#888888',
      })
      enableTouchTarget(txt)

      const tip = def
        ? gearTooltipContent({
            ...def,
            name: gearName(def.id),
            forgeLines: gearForgeTooltipLines(def.id),
          })
        : emptySlotTooltip(slot)
      this.bindTooltip(txt, tip, true)

      txt.on('pointerdown', () => this.onGearSlot(slot))
      this.slotTexts.push(txt)

      if (selected) {
        this.pinned = tip
        this.tooltip.showAt(txt.x, txt.y, tip)
      }
      y += 14
    }

    y += 6
    this.slotTexts.push(
      addPixelText(this, 12, y, t('inv.runes'), {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 14

    for (let i = 0; i < RUNE_SLOT_COUNT; i++) {
      const id = meta.loadout.runes[i]
      const def = id ? runeDef(id) : undefined
      const label = `R${i + 1}: ${def ? runeName(def.id) : '-'}`
      const selected =
        this.selected?.kind === 'rune' && this.selected.index === i
      const txt = addPixelText(this, 12, y, label, {
        fontSize: '8px',
        color: selected
          ? '#ffffaa'
          : def
            ? RARITY_COLORS[def.rarity]
            : '#888888',
      })
      enableTouchTarget(txt)

      const tip = def
        ? runeTooltipContent({ ...def, name: runeName(def.id) })
        : emptyRuneTooltip(i)
      this.bindTooltip(txt, tip, true)

      txt.on('pointerdown', () => this.onRuneSlot(i))
      this.slotTexts.push(txt)

      if (selected) {
        this.pinned = tip
        this.tooltip.showAt(txt.x, txt.y, tip)
      }
      y += 14
    }

    y += 10
    this.bagTexts.push(
      addPixelText(this, 12, y, t('inv.bag'), {
        fontSize: '8px',
        color: '#aaaaaa',
      }),
    )
    y += 14

    const bagLines = this.bagEntries(meta)
    let by = y
    const bagBottom = this.cameras.main.height - 40
    if (bagLines.length === 0) {
      const empty = addPixelText(this, 12, by, t('inv.empty'), {
        fontSize: '8px',
        color: '#555555',
      })
      this.bagTexts.push(empty)
    } else {
      for (const entry of bagLines) {
        const txt = addPixelText(this, 12, by, entry.label, {
          fontSize: '8px',
          color: entry.color,
        })
        enableTouchTarget(txt)

        this.bindTooltip(txt, entry.tip)

        txt.on('pointerdown', () => {
          entry.equip()
          AudioSystem.play('select')
          this.redraw()
        })
        this.bagTexts.push(txt)
        by += 12
        if (by > bagBottom) break
      }
    }

    if (this.selected) {
      const unequipLabel = this.canUnequip() ? t('inv.unequip') : ''
      if (unequipLabel) {
        const q = addPixelText(this, 12, this.cameras.main.height - 28, unequipLabel, {
          fontSize: '8px',
          color: '#ffaaaa',
        })
        enableTouchTarget(q)
        q.on('pointerdown', () => {
          this.unequipSelected()
          AudioSystem.play('ui')
          this.redraw()
        })
        this.slotTexts.push(q)
      }
    }
  }

  private bagEntries(meta: ReturnType<typeof MetaProgression.load>): {
    label: string
    color: string
    tip: TooltipContent
    equip: () => void
  }[] {
    const sel = this.selected
    if (!sel) {
      return [
        ...meta.inventory.gear.map(id => {
          const def = gearDef(id)
          return {
            label: def ? `${slotLabel(def.slot)} ${gearName(def.id)}` : id,
            color: def ? RARITY_COLORS[def.rarity] : '#cccccc',
            tip: def
              ? gearTooltipContent({
                  ...def,
                  name: gearName(def.id),
                  forgeLines: gearForgeTooltipLines(def.id),
                })
              : { title: id, lines: [] },
            equip: () => {
              if (def) MetaProgression.equipGear(def.slot, id)
            },
          }
        }),
        ...meta.inventory.runes.map(id => {
          const def = runeDef(id)
          return {
            label: def ? `${t('inv.runeKind')} ${runeName(def.id)}` : id,
            color: def ? RARITY_COLORS[def.rarity] : '#cccccc',
            tip: def
              ? runeTooltipContent({ ...def, name: runeName(def.id) })
              : { title: id, lines: [] },
            equip: () => {
              const idx = meta.loadout.runes.findIndex(r => r === null)
              if (idx >= 0) MetaProgression.equipRune(idx, id)
            },
          }
        }),
      ]
    }

    if (sel.kind === 'gear') {
      return meta.inventory.gear
        .filter(id => gearDef(id)?.slot === sel.slot)
        .map(id => {
          const def = gearDef(id)!
          return {
            label: gearName(def.id),
            color: RARITY_COLORS[def.rarity],
            tip: gearTooltipContent({
              ...def,
              name: gearName(def.id),
              forgeLines: gearForgeTooltipLines(def.id),
            }),
            equip: () => {
              MetaProgression.equipGear(sel.slot, id)
              this.selected = { kind: 'gear', slot: sel.slot }
            },
          }
        })
    }

    return meta.inventory.runes.map(id => {
      const def = runeDef(id)
      return {
        label: def ? runeName(def.id) : id,
        color: def ? RARITY_COLORS[def.rarity] : '#cccccc',
        tip: def ? runeTooltipContent({ ...def, name: runeName(def.id) }) : { title: id, lines: [] },
        equip: () => {
          MetaProgression.equipRune(sel.index, id)
          this.selected = { kind: 'rune', index: sel.index }
        },
      }
    })
  }

  private onGearSlot(slot: GearSlot) {
    AudioSystem.play('ui')
    const meta = MetaProgression.load()
    if (
      this.selected?.kind === 'gear' &&
      this.selected.slot === slot &&
      meta.loadout.gear[slot]
    ) {
      MetaProgression.unequipGear(slot)
      this.selected = { kind: 'gear', slot }
      this.redraw()
      return
    }
    this.selected = { kind: 'gear', slot }
    this.redraw()
  }

  private onRuneSlot(index: number) {
    AudioSystem.play('ui')
    const meta = MetaProgression.load()
    if (
      this.selected?.kind === 'rune' &&
      this.selected.index === index &&
      meta.loadout.runes[index]
    ) {
      MetaProgression.unequipRune(index)
      this.selected = { kind: 'rune', index }
      this.redraw()
      return
    }
    this.selected = { kind: 'rune', index }
    this.redraw()
  }

  private canUnequip(): boolean {
    const meta = MetaProgression.load()
    if (!this.selected) return false
    if (this.selected.kind === 'gear') return !!meta.loadout.gear[this.selected.slot]
    return !!meta.loadout.runes[this.selected.index]
  }

  private unequipSelected() {
    if (!this.selected) return
    if (this.selected.kind === 'gear') {
      MetaProgression.unequipGear(this.selected.slot)
    } else {
      MetaProgression.unequipRune(this.selected.index)
    }
  }
}
