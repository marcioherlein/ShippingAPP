import { compareLandedCost, type LandedCostComparison, type LandedCostInput, type ModeCostBreakdown } from './landedCostEngine'

export type BuyStrategy = 'test' | 'normal' | 'aggressive'

export type QuantityPriceTier = {
  minQuantity: number
  unitPriceUsd: number
}

export type QuantityOptimizerInput = Omit<LandedCostInput, 'quantity' | 'unitPriceUsd'> & {
  quantity: number
  unitPriceUsd: number
  budgetUsd: number
  moq?: number
  unitIncrement?: number
  monthlyDemand?: number
  strategy?: BuyStrategy
  targetStockMonths?: number | null
  localSellPriceUsd?: number
  priceTiers?: QuantityPriceTier[]
}

export type QuantityCandidate = {
  quantity: number
  unitPriceUsd: number
  comparison: LandedCostComparison
  selectedMode: 'lcl' | 'air' | null
  selectedCost: ModeCostBreakdown | null
  totalCostUsd: number
  unitCostUsd: number
  totalVolumeCbm: number
  totalWeightKg: number
  monthsOfStock: number | null
  marginPct: number | null
  affordable: boolean
  score: number
  reasons: string[]
}

export type QuantityOptimization = {
  strategy: BuyStrategy
  budgetUsd: number
  targetStockMonths: number | null
  candidates: QuantityCandidate[]
  affordableCandidates: QuantityCandidate[]
  recommendation: QuantityCandidate | null
  rejected: QuantityCandidate[]
  notes: string[]
}

const strategyMonths: Record<BuyStrategy, number> = {
  test: 1,
  normal: 3,
  aggressive: 6,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor
}

function positiveInt(value: number, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) && value > 0 ? value : fallback))
}

function roundUpToIncrement(value: number, increment: number) {
  const inc = positiveInt(increment, 1)
  return Math.max(inc, Math.ceil(value / inc) * inc)
}

export function unitPriceForQuantity(quantity: number, fallbackUnitPriceUsd: number, priceTiers: QuantityPriceTier[] = []) {
  const valid = priceTiers
    .filter((tier) => tier.minQuantity > 0 && tier.unitPriceUsd > 0)
    .sort((a, b) => a.minQuantity - b.minQuantity)
  let price = fallbackUnitPriceUsd
  for (const tier of valid) {
    if (quantity >= tier.minQuantity) price = tier.unitPriceUsd
  }
  return Math.max(0, price)
}

function strategyTargetMonths(input: QuantityOptimizerInput) {
  const strategy = input.strategy || 'normal'
  if (input.targetStockMonths && input.targetStockMonths > 0) return input.targetStockMonths
  if (input.monthlyDemand && input.monthlyDemand > 0) return strategyMonths[strategy]
  return null
}

function candidateCost(input: QuantityOptimizerInput, quantity: number): QuantityCandidate {
  const unitPriceUsd = unitPriceForQuantity(quantity, input.unitPriceUsd, input.priceTiers)
  const comparison = compareLandedCost({ ...input, quantity, unitPriceUsd })
  const selectedMode = comparison.bestMode
  const selectedCost = selectedMode ? comparison.modes[selectedMode] : null
  const totalCostUsd = selectedCost?.totalCostUsd || 0
  const unitCostUsd = selectedCost?.unitCostUsd || 0
  const monthlyDemand = input.monthlyDemand && input.monthlyDemand > 0 ? input.monthlyDemand : null
  const monthsOfStock = monthlyDemand ? round(quantity / monthlyDemand, 1) : null
  const marginPct = input.localSellPriceUsd && input.localSellPriceUsd > 0 && unitCostUsd > 0
    ? round(((input.localSellPriceUsd - unitCostUsd) / input.localSellPriceUsd) * 100, 1)
    : null
  const budgetUsd = Math.max(0, input.budgetUsd || 0)
  const affordable = budgetUsd <= 0 || totalCostUsd <= budgetUsd
  const totalVolumeCbm = round(quantity * Math.max(0, input.unitVolumeCbm), 3)
  const totalWeightKg = round(quantity * Math.max(0, input.unitWeightKg), 2)
  return {
    quantity,
    unitPriceUsd,
    comparison,
    selectedMode,
    selectedCost,
    totalCostUsd,
    unitCostUsd,
    totalVolumeCbm,
    totalWeightKg,
    monthsOfStock,
    marginPct,
    affordable,
    score: 0,
    reasons: [],
  }
}

function maxAffordableQuantity(input: QuantityOptimizerInput, startQuantity: number, increment: number) {
  if (!input.budgetUsd || input.budgetUsd <= 0) return null
  let low = startQuantity
  let high = startQuantity
  for (let guard = 0; guard < 22; guard += 1) {
    const candidate = candidateCost(input, high)
    if (!candidate.affordable) break
    low = high
    high = high * 2
    if (high > 250000) break
  }
  if (low === startQuantity && !candidateCost(input, low).affordable) return null
  for (let guard = 0; guard < 28 && high - low > increment; guard += 1) {
    const mid = roundUpToIncrement((low + high) / 2, increment)
    const candidate = candidateCost(input, mid)
    if (candidate.affordable) low = mid
    else high = mid - increment
  }
  return roundUpToIncrement(low, increment)
}

export function generateQuantityCandidates(input: QuantityOptimizerInput) {
  const moq = positiveInt(input.moq || input.quantity || 1, 1)
  const increment = positiveInt(input.unitIncrement || 1, 1)
  const current = roundUpToIncrement(input.quantity || moq, increment)
  const values = new Set<number>()
  const add = (value: number) => values.add(Math.max(moq, roundUpToIncrement(value, increment)))

  add(moq)
  add(current)
  ;[2, 3, 5, 8, 10].forEach((multiple) => add(moq * multiple))

  for (const tier of input.priceTiers || []) add(tier.minQuantity)

  if (input.unitVolumeCbm > 0) {
    ;[0.25, 0.5, 1, 1.5, 2, 3, 5].forEach((cbm) => add(cbm / input.unitVolumeCbm))
  }

  const targetMonths = strategyTargetMonths(input)
  if (targetMonths && input.monthlyDemand && input.monthlyDemand > 0) {
    add(input.monthlyDemand * targetMonths)
    add(input.monthlyDemand * Math.max(1, targetMonths - 1))
    add(input.monthlyDemand * (targetMonths + 1))
  }

  const maxBudget = maxAffordableQuantity(input, moq, increment)
  if (maxBudget) {
    add(maxBudget)
    add(maxBudget * 0.75)
    add(maxBudget * 0.5)
  }

  return [...values].filter((value) => value > 0).sort((a, b) => a - b).slice(0, 48)
}

function scoreCandidates(candidates: QuantityCandidate[], input: QuantityOptimizerInput): QuantityCandidate[] {
  const pool = candidates.filter((candidate) => candidate.selectedCost)
  const affordablePool = pool.filter((candidate) => candidate.affordable)
  const scoringPool = affordablePool.length ? affordablePool : pool
  const minUnit = Math.min(...scoringPool.map((candidate) => candidate.unitCostUsd))
  const maxUnit = Math.max(...scoringPool.map((candidate) => candidate.unitCostUsd))
  const targetMonths = strategyTargetMonths(input)

  return candidates.map((candidate) => {
    if (!candidate.selectedCost) return { ...candidate, score: 0, reasons: ['No hay modo accionable para esta cantidad.'] }
    const unitCostRange = Math.max(0.01, maxUnit - minUnit)
    const unitCostScore = 45 * (1 - ((candidate.unitCostUsd - minUnit) / unitCostRange))
    const marginScore = candidate.marginPct === null ? 10 : clamp(candidate.marginPct, 0, 60) / 60 * 25
    const stockScore = targetMonths && candidate.monthsOfStock !== null
      ? 20 * (1 - clamp(Math.abs(candidate.monthsOfStock - targetMonths) / Math.max(1, targetMonths), 0, 1))
      : 10
    const budgetScore = input.budgetUsd > 0
      ? 10 * (1 - clamp(Math.abs((candidate.totalCostUsd / input.budgetUsd) - 0.8) / 0.8, 0, 1))
      : 5
    const affordabilityPenalty = candidate.affordable ? 0 : 45
    const reasons: string[] = []
    if (!candidate.affordable) reasons.push('Supera el presupuesto cargado.')
    if (candidate.quantity === positiveInt(input.moq || input.quantity || 1, 1)) reasons.push('Incluye MOQ como punto de partida.')
    if (candidate.selectedMode) reasons.push(`${candidate.selectedMode === 'lcl' ? 'LCL' : 'Aéreo'} es el menor costo accionable.`)
    if (candidate.monthsOfStock !== null && targetMonths) reasons.push(`${candidate.monthsOfStock} meses de stock vs objetivo ${targetMonths}.`)
    if (candidate.totalVolumeCbm >= 1) reasons.push(`${candidate.totalVolumeCbm} m³ estimados; revisar packaging real con proveedor.`)

    return {
      ...candidate,
      score: round(Math.max(0, unitCostScore + marginScore + stockScore + budgetScore - affordabilityPenalty), 1),
      reasons,
    }
  })
}

export function optimizeQuantity(input: QuantityOptimizerInput): QuantityOptimization {
  const strategy = input.strategy || 'normal'
  const quantities = generateQuantityCandidates(input)
  const rawCandidates = quantities.map((quantity) => candidateCost(input, quantity))
  const candidates = scoreCandidates(rawCandidates, input).sort((a, b) => b.score - a.score || a.unitCostUsd - b.unitCostUsd || a.totalCostUsd - b.totalCostUsd)
  const affordableCandidates = candidates.filter((candidate) => candidate.affordable)
  const recommendation = (affordableCandidates[0] || candidates[0]) ?? null
  const rejected = candidates.filter((candidate) => candidate !== recommendation).slice(0, 8)
  const targetStockMonths = strategyTargetMonths(input)
  const notes = [
    'La cantidad óptima compara sólo LCL vs aéreo; FCL queda como referencia.',
    'Si Alibaba no trae packaging por caja, el volumen se estima con volumen unitario del proveedor.',
    input.monthlyDemand && input.monthlyDemand > 0
      ? `Stock objetivo ${targetStockMonths} meses para estrategia ${strategy}.`
      : 'Sin demanda mensual, se optimiza por costo unitario, presupuesto y margen; stock queda como dato pendiente.',
  ]
  return {
    strategy,
    budgetUsd: Math.max(0, input.budgetUsd || 0),
    targetStockMonths,
    candidates,
    affordableCandidates,
    recommendation,
    rejected,
    notes,
  }
}
