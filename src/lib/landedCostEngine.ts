import { importFreightValues } from '../data/importFreightValues'

export type TransportMode = 'fcl' | 'lcl' | 'air'
export type ImportPurpose = 'own_use' | 'resale' | 'unknown'
export type ImportEntityType = 'company' | 'individual' | 'unknown'
export type SensitiveProductCategory = 'none' | 'food' | 'toys' | 'cosmetics' | 'medicines' | 'supplements' | 'unknown'

export type ImporterChecklistInput = {
  purpose: ImportPurpose
  entityType: ImportEntityType
  hasImporterSignature: boolean | null
  sensitiveCategory: SensitiveProductCategory
  gainsExempt?: boolean
  capitalGoodEligible?: boolean
  capitalGoodUse?: boolean
}

export type LandedCostInput = ImporterChecklistInput & {
  originCountry: string
  quantity: number
  unitPriceUsd: number
  unitWeightKg: number
  unitVolumeCbm: number
  dutyRatePct: number
  statisticsRatePct?: number
  vatRatePct?: number
  vatAdditionalRatePct?: number
  gainsRatePct?: number
  iibbRatePct?: number
}

export type FreightRateLookup = {
  country: string
  capital: string
  region: string
  fclContainerUsd: number
  lclUsdPerWm: number
  airUsdPerKg: number
  airMinimumUsd: number
}

export type ModeCostBreakdown = {
  mode: TransportMode
  available: boolean
  reason: string | null
  freightRate: number | null
  freightMinimumUsd: number | null
  freightCostUsd: number
  chargeableUnits: number
  chargeableBasis: 'container' | 'volume_or_weight_measurement' | 'actual_or_volumetric_weight'
  totalWeightKg: number
  totalVolumeCbm: number
  fobUsd: number
  cifUsd: number
  dutyUsd: number
  statisticsUsd: number
  baseVatUsd: number
  vatUsd: number
  vatAdditionalUsd: number
  gainsUsd: number
  iibbUsd: number
  fixedDestinationUsd: number
  noImporterSignatureUsd: number
  sensitiveCategoryUsd: number
  totalCostUsd: number
  unitCostUsd: number
  source: string
}

export type LandedCostComparison = {
  status: 'ok' | 'missing_origin' | 'invalid_input'
  origin: FreightRateLookup | null
  checklist: {
    ownUseOrResaleKnown: boolean
    entityTypeKnown: boolean
    importerSignatureKnown: boolean
    sensitiveCategoryKnown: boolean
    gainsExemptionKnown: boolean
    capitalGoodChoiceKnown: boolean
    needsSensitiveCategoryReview: boolean
    blockers: string[]
  }
  modes: Record<TransportMode, ModeCostBreakdown>
  bestMode: 'lcl' | 'air' | null
  lclVsAir: {
    cheaperMode: 'lcl' | 'air' | null
    savingsUsd: number | null
    savingsPct: number | null
  }
  notes: string[]
}

const sensitiveCategories = new Set<SensitiveProductCategory>(['food', 'toys', 'cosmetics', 'medicines', 'supplements'])

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const rateRows: FreightRateLookup[] = importFreightValues.rates.map((row) => ({
  country: row[0],
  capital: row[1],
  region: row[2],
  fclContainerUsd: row[3],
  lclUsdPerWm: row[4],
  airUsdPerKg: row[5],
  airMinimumUsd: row[6],
}))

export function lookupFreightRate(originCountry: string): FreightRateLookup | null {
  const needle = normalize(originCountry)
  if (!needle) return null
  return rateRows.find((row) => normalize(row.country) === needle)
    || rateRows.find((row) => normalize(row.country).includes(needle) || needle.includes(normalize(row.country)))
    || null
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

function safePct(value: number | undefined, fallback: number) {
  return Math.max(0, Number.isFinite(value ?? NaN) ? Number(value) : fallback) / 100
}

function expensesFor(mode: TransportMode) {
  return importFreightValues.expenses[mode]
}

function fixedExpenseTotal(mode: TransportMode) {
  return Object.values(expensesFor(mode).fixed).reduce((sum, value) => sum + Number(value || 0), 0)
}

function chargeable(mode: TransportMode, input: LandedCostInput) {
  const qty = Math.max(0, input.quantity)
  const totalWeightKg = qty * Math.max(0, input.unitWeightKg)
  const totalVolumeCbm = qty * Math.max(0, input.unitVolumeCbm)
  if (mode === 'fcl') return { totalWeightKg, totalVolumeCbm, units: 1, basis: 'container' as const }
  if (mode === 'lcl') {
    const weightMeasurement = totalWeightKg / 1000
    return { totalWeightKg, totalVolumeCbm, units: Math.max(totalVolumeCbm, weightMeasurement), basis: 'volume_or_weight_measurement' as const }
  }
  const volumetricWeightKg = totalVolumeCbm * (1000 / 6)
  return { totalWeightKg, totalVolumeCbm, units: Math.max(totalWeightKg, volumetricWeightKg), basis: 'actual_or_volumetric_weight' as const }
}

function freightCost(mode: TransportMode, rate: FreightRateLookup, input: LandedCostInput) {
  const base = chargeable(mode, input)
  if (mode === 'fcl') return { ...base, rate: rate.fclContainerUsd, minimum: null as number | null, cost: rate.fclContainerUsd }
  if (mode === 'lcl') return { ...base, rate: rate.lclUsdPerWm, minimum: null as number | null, cost: base.units * rate.lclUsdPerWm }
  const variable = base.units * rate.airUsdPerKg
  return { ...base, rate: rate.airUsdPerKg, minimum: rate.airMinimumUsd, cost: Math.max(variable, rate.airMinimumUsd) }
}

export function calculateLandedCostMode(mode: TransportMode, input: LandedCostInput, rate: FreightRateLookup | null): ModeCostBreakdown {
  const qty = Math.max(0, input.quantity)
  const fobUsd = qty * Math.max(0, input.unitPriceUsd)
  const empty = chargeable(mode, input)
  if (!rate || qty <= 0 || input.unitPriceUsd < 0) {
    return {
      mode,
      available: false,
      reason: !rate ? 'No hay tarifa cargada para el origen.' : 'Cantidad/precio inválido.',
      freightRate: null,
      freightMinimumUsd: null,
      freightCostUsd: 0,
      chargeableUnits: empty.units,
      chargeableBasis: empty.basis,
      totalWeightKg: empty.totalWeightKg,
      totalVolumeCbm: empty.totalVolumeCbm,
      fobUsd,
      cifUsd: fobUsd,
      dutyUsd: 0,
      statisticsUsd: 0,
      baseVatUsd: fobUsd,
      vatUsd: 0,
      vatAdditionalUsd: 0,
      gainsUsd: 0,
      iibbUsd: 0,
      fixedDestinationUsd: 0,
      noImporterSignatureUsd: 0,
      sensitiveCategoryUsd: 0,
      totalCostUsd: fobUsd,
      unitCostUsd: qty ? fobUsd / qty : 0,
      source: importFreightValues.meta.source,
    }
  }

  const freight = freightCost(mode, rate, input)
  const freightCostUsd = roundMoney(freight.cost)
  const cifUsd = roundMoney(fobUsd + freightCostUsd)
  const capitalGoodTreatment = Boolean(input.capitalGoodEligible && input.capitalGoodUse)
  const dutyUsd = roundMoney(cifUsd * safePct(input.dutyRatePct, 0))
  const statisticsUsd = capitalGoodTreatment ? 0 : roundMoney(cifUsd * safePct(input.statisticsRatePct, 3))
  const baseVatUsd = roundMoney(cifUsd + dutyUsd + statisticsUsd)
  const vatUsd = roundMoney(baseVatUsd * safePct(input.vatRatePct, 21))
  const vatAdditionalUsd = capitalGoodTreatment ? 0 : roundMoney(baseVatUsd * safePct(input.vatAdditionalRatePct, 20))
  const gainsUsd = capitalGoodTreatment || input.gainsExempt ? 0 : roundMoney(baseVatUsd * safePct(input.gainsRatePct, 6))
  const iibbUsd = capitalGoodTreatment ? 0 : roundMoney(baseVatUsd * safePct(input.iibbRatePct, 2.5))
  const fixedDestinationUsd = roundMoney(fixedExpenseTotal(mode))
  const noImporterSignatureUsd = input.hasImporterSignature === false ? Number(expensesFor(mode).extras.noImporterSignature || 0) : 0
  const sensitiveCategoryUsd = sensitiveCategories.has(input.sensitiveCategory) ? Number(expensesFor(mode).extras.sensitiveProductCategory || 0) : 0
  const totalCostUsd = roundMoney(baseVatUsd + vatUsd + vatAdditionalUsd + gainsUsd + iibbUsd + fixedDestinationUsd + noImporterSignatureUsd + sensitiveCategoryUsd)

  return {
    mode,
    available: true,
    reason: null,
    freightRate: freight.rate,
    freightMinimumUsd: freight.minimum,
    freightCostUsd,
    chargeableUnits: roundMoney(freight.units),
    chargeableBasis: freight.basis,
    totalWeightKg: roundMoney(freight.totalWeightKg),
    totalVolumeCbm: roundMoney(freight.totalVolumeCbm),
    fobUsd: roundMoney(fobUsd),
    cifUsd,
    dutyUsd,
    statisticsUsd,
    baseVatUsd,
    vatUsd,
    vatAdditionalUsd,
    gainsUsd,
    iibbUsd,
    fixedDestinationUsd,
    noImporterSignatureUsd,
    sensitiveCategoryUsd,
    totalCostUsd,
    unitCostUsd: qty ? roundMoney(totalCostUsd / qty) : 0,
    source: importFreightValues.meta.source,
  }
}

export function compareLandedCost(input: LandedCostInput): LandedCostComparison {
  if (input.quantity <= 0 || input.unitPriceUsd < 0) {
    const emptyModes = ['fcl', 'lcl', 'air'].reduce((acc, mode) => {
      acc[mode as TransportMode] = calculateLandedCostMode(mode as TransportMode, input, null)
      return acc
    }, {} as Record<TransportMode, ModeCostBreakdown>)
    return { status: 'invalid_input', origin: null, checklist: checklistStatus(input), modes: emptyModes, bestMode: null, lclVsAir: { cheaperMode: null, savingsUsd: null, savingsPct: null }, notes: ['Cantidad y precio unitario deben ser mayores o iguales a cero.'] }
  }
  const origin = lookupFreightRate(input.originCountry)
  const modes = {
    fcl: calculateLandedCostMode('fcl', input, origin),
    lcl: calculateLandedCostMode('lcl', input, origin),
    air: calculateLandedCostMode('air', input, origin),
  }
  if (!origin) return { status: 'missing_origin', origin, checklist: checklistStatus(input), modes, bestMode: null, lclVsAir: { cheaperMode: null, savingsUsd: null, savingsPct: null }, notes: ['No encontramos el origen en la tabla Valores.xlsx.'] }

  const lcl = modes.lcl
  const air = modes.air
  const cheaperMode = lcl.totalCostUsd === air.totalCostUsd ? null : lcl.totalCostUsd < air.totalCostUsd ? 'lcl' : 'air'
  const savingsUsd = cheaperMode ? Math.abs(lcl.totalCostUsd - air.totalCostUsd) : null
  const higher = Math.max(lcl.totalCostUsd, air.totalCostUsd)
  const savingsPct = cheaperMode && higher > 0 ? roundMoney((savingsUsd! / higher) * 100) : null

  const taxNote = input.capitalGoodEligible && input.capitalGoodUse
    ? 'Bien de Uso activo: el motor modela sólo derechos e IVA; tasa estadística y percepciones quedan en 0.'
    : input.gainsExempt
      ? 'Exento Ganancias activo: la percepción de Ganancias se modela en 0.'
      : 'Ganancias y Bien de Uso se aplican según el checklist.'

  return {
    status: 'ok',
    origin,
    checklist: checklistStatus(input),
    modes,
    bestMode: cheaperMode,
    lclVsAir: { cheaperMode, savingsUsd: savingsUsd === null ? null : roundMoney(savingsUsd), savingsPct },
    notes: [
      'FCL se calcula como referencia por contenedor entero y nunca define la recomendación principal.',
      'El valor principal para oportunidad compara LCL vs aéreo.',
      'FOB + flete internacional = CIF; derecho y tasa estadística se calculan sobre CIF; IVA/percepciones sobre base IVA.',
      taxNote,
    ],
  }
}

export function checklistStatus(input: ImporterChecklistInput) {
  const needsSensitiveCategoryReview = sensitiveCategories.has(input.sensitiveCategory) || input.sensitiveCategory === 'unknown'
  const blockers: string[] = []
  if (input.purpose === 'unknown') blockers.push('Definir si es uso propio o reventa.')
  if (input.entityType === 'unknown') blockers.push('Definir si opera empresa o persona humana.')
  if (input.hasImporterSignature === null) blockers.push('Definir si tiene firma/importador para la operación.')
  if (input.sensitiveCategory === 'unknown') blockers.push('Confirmar si cae en alimentos, juguetes, cosméticos, medicamentos o suplementos.')
  if (input.capitalGoodUse && !input.capitalGoodEligible) blockers.push('No aplicar Bien de Uso si la NCM no está marcada como Bien de Uso = SI en NCM_APP.')
  return {
    ownUseOrResaleKnown: input.purpose !== 'unknown',
    entityTypeKnown: input.entityType !== 'unknown',
    importerSignatureKnown: input.hasImporterSignature !== null,
    sensitiveCategoryKnown: input.sensitiveCategory !== 'unknown',
    gainsExemptionKnown: typeof input.gainsExempt === 'boolean',
    capitalGoodChoiceKnown: !input.capitalGoodEligible || typeof input.capitalGoodUse === 'boolean',
    needsSensitiveCategoryReview,
    blockers,
  }
}
