import type { CustomsProfile, NcmTariffProfile } from './customsClassification'
export type ManualNcmRow = [string, string, ...unknown[]]
export type ManualNcmIndex = { meta: { source: string; sourceDate: string }; records: ManualNcmRow[] }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function searchManualNcm(index: ManualNcmIndex, query: string, chapter: string) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  return index.records.filter(([code, label]) => (!chapter || code.startsWith(chapter)) && terms.every(term => normalize(`${code} ${code.replace(/\./g, '')} ${label}`).includes(term))).slice(0, 60)
}
export function manualNcmProfile(base: CustomsProfile, index: ManualNcmIndex, code: string): CustomsProfile {
  const row = index.records.find(row => row[0] === code)
  if (!row || !/^\d{4}\.\d{2}\.\d{2}$/.test(code)) throw new Error('Elegí una posición del nomenclador.')
  if (row.length < 12 || row.slice(2, 10).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Esta posición no tiene aranceles completos. Elegí otra posición o revisala con un despachante.')
  const tariff: NcmTariffProfile = { aecPct: row[2] as number, diePct: row[3] as number, tePct: row[4] as number, diiPct: row[5] as number, vatPct: row[6] as number, vatAdditionalPct: row[7] as number, gainsPct: row[8] as number, iibbPct: row[9] as number, internalTax: row[10] as string | number | null, capitalGoodEligible: row[11] === true || row[11] === 1 || row[11] === 'SI' }
  return { ...base, ncmCandidate: code, description: row[1], classificationConfidence: 'medium', tariff, dutyRatePct: tariff.diePct, dutyRateStatus: 'candidate', statisticsRatePct: tariff.tePct, vatRatePct: tariff.vatPct, vatAdditionalRatePct: tariff.vatAdditionalPct, gainsRatePct: tariff.gainsPct, iibbRatePct: tariff.iibbPct, capitalGoodEligible: tariff.capitalGoodEligible, simOpeningCandidate: null, simOpeningConfidence: 'missing', simAlternatives: [], simSource: 'Selección manual NCM; apertura SIM pendiente.', alternatives: [], missingFacts: [], source: `${index.meta.source} · selección confirmada por el usuario`, catalogSourceDate: index.meta.sourceDate, rationale: [`El usuario seleccionó ${code}: ${row[1]}. Existencia y aranceles validados contra el catálogo; adecuación al producto confirmada por el usuario.`] }
}
