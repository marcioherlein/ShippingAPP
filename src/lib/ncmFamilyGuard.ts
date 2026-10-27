import { isKickScooterIdentity } from './productIdentity'

/** Broad compatibility guard only; never selects or validates an NCM. */
export function compatibleNcmChapters(facts: { name?: string | null; category?: string | null; functionText?: string | null }): string[] | null {
  const identity = [facts.name, facts.category, facts.functionText].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (isKickScooterIdentity(facts)) return ['87', '95']
  if (/\b(led|rgb)\b/.test(identity) && /\b(light|lighting|lamp|luz|iluminacion|iluminar|lampara)\b/.test(identity)) return ['85', '90', '94']
  return null
}
