export type NcmTariffRates = [
  aecPct: number,
  statisticsPct: number,
  ivaPct: number,
  ivaAdditionalPct: number,
  profitsPctSource: number,
  iibbPctSource: number,
]

export type NcmTariffConflictVariant = {
  aecPct: number
  statisticsPct: number
  ivaPct: number
  ivaAdditionalPct: number
  profitsPctSource: number
  iibbPctSource: number
  excelRows: number[]
}

export type NcmTariffIndex = {
  meta: {
    source: string
    sourceSheet: string
    sourceDate: string
    tariffSchema: number
    recordCount: number
    conflictCount: number
    recordShape: string
    storage: 'rate-groups-v1'
    chapterSectionDerivedFromCode: boolean
    profitsIibbAreSourceReferenceOnly: boolean
  }
  groups: Array<[rates: NcmTariffRates, concatenated8DigitCodes: string]>
  conflicts: Array<{ code: string; variants: NcmTariffConflictVariant[] }>
}

export type NcmHierarchy = {
  section: string | null
  chapter: string
  heading: string
  subheading: string
}

export type NcmTariffLookup =
  | {
      status: 'available'
      code: string
      hierarchy: NcmHierarchy
      rates: { aecPct: number; statisticsPct: number; ivaPct: number; ivaAdditionalPct: number }
      sourceReference: { profitsPct: number; iibbPct: number; automaticApplicationAllowed: false }
      warnings: string[]
      source: string
      sourceDate: string
    }
  | {
      status: 'conflict'
      code: string
      hierarchy: NcmHierarchy
      variants: NcmTariffConflictVariant[]
      warnings: string[]
      source: string
      sourceDate: string
    }
  | {
      status: 'missing'
      code: string
      hierarchy: NcmHierarchy
      warnings: string[]
      source: string
      sourceDate: string
    }

const NCM_PATTERN = /^\d{4}\.\d{2}\.\d{2}$/
const DIGITS_PATTERN = /^\d+$/

const SECTION_RANGES: Array<[number, number, string]> = [
  [1, 5, 'I'], [6, 14, 'II'], [15, 15, 'III'], [16, 24, 'IV'], [25, 27, 'V'],
  [28, 38, 'VI'], [39, 40, 'VII'], [41, 43, 'VIII'], [44, 46, 'IX'], [47, 49, 'X'],
  [50, 63, 'XI'], [64, 67, 'XII'], [68, 70, 'XIII'], [71, 71, 'XIV'], [72, 83, 'XV'],
  [84, 85, 'XVI'], [86, 89, 'XVII'], [90, 92, 'XVIII'], [93, 93, 'XIX'], [94, 96, 'XX'],
  [97, 97, 'XXI'],
]

function finiteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function formatDigits(digits: string) {
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
}

export function sectionForChapter(chapter: string | number) {
  const numeric = Number(chapter)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 97 || numeric === 77) return null
  return SECTION_RANGES.find(([from, to]) => numeric >= from && numeric <= to)?.[2] || null
}

export function deriveNcmHierarchy(code: string): NcmHierarchy {
  if (!NCM_PATTERN.test(code)) throw new Error('invalid_ncm_code')
  const digits = code.replace(/\D/g, '')
  const chapter = digits.slice(0, 2)
  return { section: sectionForChapter(chapter), chapter, heading: digits.slice(0, 4), subheading: digits.slice(0, 6) }
}

export function validateTariffIndex(index: unknown): asserts index is NcmTariffIndex {
  const raw = index as NcmTariffIndex
  if (!raw || raw.meta?.tariffSchema !== 1 || raw.meta?.storage !== 'rate-groups-v1' || !Array.isArray(raw.groups) || !Array.isArray(raw.conflicts)) {
    throw new Error('NCM tariff index failed schema checks')
  }
  if (raw.meta.conflictCount !== raw.conflicts.length || raw.meta.recordCount < 10_000) {
    throw new Error('NCM tariff index failed record-count checks')
  }
  if (raw.meta.profitsIibbAreSourceReferenceOnly !== true || raw.meta.chapterSectionDerivedFromCode !== true) {
    throw new Error('NCM tariff index failed policy checks')
  }

  let recordCount = 0
  const seen = new Set<string>()
  for (const group of raw.groups) {
    if (!Array.isArray(group) || group.length !== 2 || !Array.isArray(group[0]) || group[0].length !== 6 || !group[0].every(finiteNonNegative)) {
      throw new Error('NCM tariff index contains malformed rate group')
    }
    const digits = group[1]
    if (typeof digits !== 'string' || digits.length % 8 !== 0 || !DIGITS_PATTERN.test(digits)) {
      throw new Error('NCM tariff index contains malformed code group')
    }
    for (let offset = 0; offset < digits.length; offset += 8) {
      const code = formatDigits(digits.slice(offset, offset + 8))
      if (!NCM_PATTERN.test(code)) throw new Error(`NCM tariff index contains malformed code ${code}`)
      if (seen.has(code)) throw new Error(`NCM tariff index contains duplicate ${code}`)
      seen.add(code)
      recordCount += 1
    }
  }
  if (recordCount !== raw.meta.recordCount) throw new Error('NCM tariff index record count does not match compact groups')

  const conflictCodes = new Set<string>()
  for (const conflict of raw.conflicts) {
    if (!conflict || !NCM_PATTERN.test(conflict.code) || !Array.isArray(conflict.variants) || conflict.variants.length < 2) {
      throw new Error('NCM tariff index contains malformed conflict')
    }
    if (seen.has(conflict.code)) throw new Error(`Conflicted NCM ${conflict.code} was promoted into clean tariff records`)
    if (conflictCodes.has(conflict.code)) throw new Error(`Duplicate NCM conflict ${conflict.code}`)
    conflictCodes.add(conflict.code)
  }
}

function ratesForCode(index: NcmTariffIndex, code: string): NcmTariffRates | null {
  const digits = code.replace(/\D/g, '')
  for (const [rates, codes] of index.groups) {
    for (let offset = 0; offset < codes.length; offset += 8) {
      if (codes.slice(offset, offset + 8) === digits) return rates
    }
  }
  return null
}

export function lookupNcmTariff(index: NcmTariffIndex, code: string): NcmTariffLookup {
  validateTariffIndex(index)
  const hierarchy = deriveNcmHierarchy(code)
  const conflict = index.conflicts.find((item) => item.code === code)
  if (conflict) {
    return {
      status: 'conflict', code, hierarchy, variants: conflict.variants,
      warnings: ['La fuente arancelaria contiene valores contradictorios para esta NCM. No se promueve ninguna tasa hasta resolver el conflicto contra una fuente oficial.'],
      source: index.meta.source, sourceDate: index.meta.sourceDate,
    }
  }

  const rates = ratesForCode(index, code)
  if (!rates) {
    return {
      status: 'missing', code, hierarchy,
      warnings: ['La NCM existe como candidata de clasificación pero no tiene una fila arancelaria limpia en esta versión. Economics queda bloqueado.'],
      source: index.meta.source, sourceDate: index.meta.sourceDate,
    }
  }

  return {
    status: 'available', code, hierarchy,
    rates: { aecPct: rates[0], statisticsPct: rates[1], ivaPct: rates[2], ivaAdditionalPct: rates[3] },
    sourceReference: { profitsPct: rates[4], iibbPct: rates[5], automaticApplicationAllowed: false },
    warnings: ['Ganancias e IIBB se conservan sólo como referencia de la planilla fuente; no se aplican automáticamente porque dependen del importador, jurisdicción y operación.'],
    source: index.meta.source, sourceDate: index.meta.sourceDate,
  }
}

let cachedIndex: Promise<NcmTariffIndex> | null = null

export async function loadNcmTariffIndex(requestUrl: string, assets: { fetch: (request: Request) => Promise<Response> }) {
  if (!cachedIndex) {
    cachedIndex = (async () => {
      const url = new URL('/data/ncm-tariffs.json', requestUrl)
      const response = await assets.fetch(new Request(url.toString()))
      if (!response.ok) throw new Error(`NCM tariff index unavailable (${response.status})`)
      const index = await response.json() as NcmTariffIndex
      validateTariffIndex(index)
      return index
    })().catch((error) => {
      cachedIndex = null
      throw error
    })
  }
  return cachedIndex
}

export function resetNcmTariffCacheForTests() { cachedIndex = null }
