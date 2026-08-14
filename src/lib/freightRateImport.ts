import { freightRateStatus, quoteFixedCharges, type FreightRateRecord } from './freightRates'
import type { Inputs } from './types'

export type FreightImportIssue = { row: number; message: string }
export type FreightImportResult = { records: FreightRateRecord[]; issues: FreightImportIssue[] }

const headers = ['provider','mode','origin','destination','currency','rate','rateUnit','minimumUsd','originChargesUsd','destinationChargesUsd','otherSurchargesUsd','validFrom','validTo','sourceType','receivedAt'] as const

function splitCsvLine(line: string, separator: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1 }
      else quoted = !quoted
    } else if (ch === separator && !quoted) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

function num(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

export function parseFreightRateCsv(text: string): FreightImportResult {
  const clean = text.replace(/^\uFEFF/, '').trim()
  if (!clean) return { records: [], issues: [{ row: 1, message: 'Archivo vacío.' }] }
  const lines = clean.split(/\r?\n/).filter((line) => line.trim())
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const names = splitCsvLine(lines[0], separator)
  const index = new Map(names.map((name, i) => [name.trim(), i]))
  const missing = headers.filter((name) => !index.has(name))
  if (missing.length) return { records: [], issues: [{ row: 1, message: `Faltan columnas: ${missing.join(', ')}` }] }

  const records: FreightRateRecord[] = []
  const issues: FreightImportIssue[] = []
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const row = lineIndex + 1
    const cells = splitCsvLine(lines[lineIndex], separator)
    const get = (name: string) => cells[index.get(name) ?? -1] ?? ''
    const rawMode = normalizeText(get('mode'))
    const mode = rawMode === 'air' ? 'air' : ['sea_lcl','lcl','sea lcl'].includes(rawMode) ? 'sea_lcl' : null
    const rawUnit = normalizeText(get('rateUnit'))
    const rateUnit = rawUnit === 'kg' ? 'kg' : ['wm','w/m'].includes(rawUnit) ? 'wm' : null
    const sourceType = normalizeText(get('sourceType'))
    const currency = get('currency').trim().toUpperCase()
    const numeric = ['rate','minimumUsd','originChargesUsd','destinationChargesUsd','otherSurchargesUsd'].map((field) => [field, num(get(field))] as const)
    const invalidNumber = numeric.find(([, value]) => !Number.isFinite(value) || value < 0)
    if (!mode) { issues.push({ row, message: 'Modo inválido; usar air o sea_lcl.' }); continue }
    if (!rateUnit || (mode === 'air' && rateUnit !== 'kg') || (mode === 'sea_lcl' && rateUnit !== 'wm')) { issues.push({ row, message: 'Unidad incompatible con el modo.' }); continue }
    if (currency !== 'USD') { issues.push({ row, message: 'Sólo USD está soportado en MVP 0.7.' }); continue }
    if (!['quote','rate_sheet','benchmark'].includes(sourceType)) { issues.push({ row, message: 'sourceType inválido.' }); continue }
    if (invalidNumber) { issues.push({ row, message: `${invalidNumber[0]} debe ser un número no negativo.` }); continue }
    if (!get('provider') || !get('origin') || !get('destination')) { issues.push({ row, message: 'Proveedor, origen y destino son obligatorios.' }); continue }

    const record: FreightRateRecord = {
      id: get('id') || `csv-${row}`,
      provider: get('provider'), mode, origin: get('origin'), destination: get('destination'), currency: 'USD',
      rate: num(get('rate')), rateUnit, minimumUsd: num(get('minimumUsd')),
      originChargesUsd: num(get('originChargesUsd')), destinationChargesUsd: num(get('destinationChargesUsd')), otherSurchargesUsd: num(get('otherSurchargesUsd')),
      validFrom: get('validFrom'), validTo: get('validTo'), sourceType: sourceType as FreightRateRecord['sourceType'], receivedAt: get('receivedAt'),
    }
    if (freightRateStatus(record, record.validFrom) === 'invalid') { issues.push({ row, message: 'Fechas o campos de vigencia inválidos.' }); continue }
    records.push(record)
  }
  return { records, issues }
}

export type FreightRateSelection = {
  record: FreightRateRecord
  pendingFixedChargesUsd: number
}

const sourcePriority: Record<FreightRateRecord['sourceType'], number> = { quote: 3, rate_sheet: 2, benchmark: 1 }

export function selectFreightRate(records: FreightRateRecord[], mode: FreightRateRecord['mode'], origin: string, destination: string, asOfIso: string): FreightRateSelection | null {
  const o = normalizeText(origin)
  const d = normalizeText(destination)
  const eligible = records.filter((rate) => rate.mode === mode && normalizeText(rate.origin) === o && normalizeText(rate.destination) === d && freightRateStatus(rate, asOfIso) === 'valid')
  eligible.sort((a, b) => sourcePriority[b.sourceType] - sourcePriority[a.sourceType] || Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.provider.localeCompare(b.provider))
  const record = eligible[0]
  return record ? { record, pendingFixedChargesUsd: quoteFixedCharges(record) } : null
}

export function applyFreightRate(inputs: Inputs, selection: FreightRateSelection): Inputs {
  const rate = selection.record
  if (rate.mode === 'air') return { ...inputs, airUsdKg: rate.rate, airMinimumUsd: rate.minimumUsd }
  return { ...inputs, seaUsdCbm: rate.rate, seaMinimumUsd: rate.minimumUsd }
}
