import { AFFIX_TIER_COLORS, affixDef, formatAffix } from './Affixes'
import { MetaProgression } from '../progression/MetaProgression'
import { t } from '../../i18n/I18n'

/** Extra tooltip lines for forge applied/pending affixes. */
export function gearForgeTooltipLines(
  gearId: string,
): { text: string; color: string }[] {
  const forge = MetaProgression.getForgeState(gearId)
  const lines: { text: string; color: string }[] = []
  if (forge.appliedAffixId) {
    const a = affixDef(forge.appliedAffixId)
    if (a) {
      lines.push({
        text: `${t('forge.applied')}: ${formatAffix(a)}`,
        color: AFFIX_TIER_COLORS[a.tier],
      })
    }
  }
  if (forge.pendingAffixId) {
    const a = affixDef(forge.pendingAffixId)
    if (a) {
      lines.push({
        text: `${t('forge.pending')}: ${formatAffix(a)}`,
        color: AFFIX_TIER_COLORS[a.tier],
      })
    }
  }
  return lines
}
