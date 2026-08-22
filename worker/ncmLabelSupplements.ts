import type { NcmSearchIndex } from './ncmRetrieval'

export type NcmLabelSupplement = {
  code: string
  label: string
  source: string
}

// Data repair for official NCM rows whose generated snapshot label is empty or
// too sparse. Supplements may enrich text only for a code that is already in
// the official ARCA catalog; they can never create a new NCM candidate.
export const OFFICIAL_NCM_LABEL_SUPPLEMENTS: NcmLabelSupplement[] = [
  {
    code: '8516.31.00',
    label: 'Aparatos electrotérmicos para el cuidado del cabello > Secadores para el cabello',
    source: 'Argentina.gob.ar NCM chapter 85 reference',
  },
]

function meaningfulWords(value: string) {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter((word) => word.length >= 4 && !['dema', 'otro', 'otra'].includes(word))
}

export function applyOfficialNcmLabelSupplements(
  index: NcmSearchIndex,
  supplements: NcmLabelSupplement[] = OFFICIAL_NCM_LABEL_SUPPLEMENTS,
): NcmSearchIndex {
  const allowedCodes = new Set(index.records.map(([code]) => code))
  const byCode = new Map(
    supplements
      .filter((item) => /^\d{4}\.\d{2}\.\d{2}$/.test(item.code) && allowedCodes.has(item.code))
      .map((item) => [item.code, item]),
  )

  let applied = 0
  const records: Array<[string, string]> = index.records.map(([code, label]) => {
    const supplement = byCode.get(code)
    if (!supplement || meaningfulWords(label).length >= 2) return [code, label]
    applied += 1
    return [code, supplement.label]
  })

  if (!applied) return index
  return {
    meta: {
      ...index.meta,
      source: `${index.meta.source} · ${applied} official label supplement${applied === 1 ? '' : 's'}`,
    },
    records,
  }
}
