import { compareLandedCost, type LandedCostInput, type ModeCostBreakdown } from './landedCostEngine'
import { optimizeQuantity } from './quantityOptimizer'
import { supplierQuotePrice, type SupplierQuote } from './supplierQuote'
import { transportOption, type TransportOption } from './transportPlanning'
export type PurchaseCapacity = { mode: 'budget' | 'units' | 'unknown'; budgetUsd: number; min: number; max: number }
export type PurchaseScenario = { quantity: number; priceUsd: number; mode: 'lcl' | 'air' | 'courier'; cost: ModeCostBreakdown; withinBudget?: boolean }
export type PurchasePlan = { single: PurchaseScenario | null; singleReason: string | null; selected: PurchaseScenario | null; improvement: PurchaseScenario | null; error: string | null; note: string | null; minimum?: PurchaseScenario | null; minimumReason?: string | null; alternatives?: PurchaseScenario[]; transportOptions?: TransportOption[] }
export type PurchasePlanInput = { costs: Omit<LandedCostInput, 'quantity' | 'unitPriceUsd'>; quote: SupplierQuote; moq: number; capacity: PurchaseCapacity; quantity?: number; quantityApproved?: boolean; cargoText?: string }
export function purchaseScenario(input: PurchasePlanInput, quantity: number, mode?: PurchaseScenario['mode']): PurchaseScenario | null {
  const increment = input.quote.basis === 'pack' ? input.quote.unitsPerPack : 1
  if (!Number.isInteger(increment) || increment < 1 || quantity % increment !== 0 || !Number.isInteger(quantity) || quantity < Math.max(1, input.moq)) return null
  const priceUsd = supplierQuotePrice(input.quote, quantity)
  if (priceUsd === null) return null
  const comparison = compareLandedCost({ ...input.costs, quantity, unitPriceUsd: priceUsd })
  const selectedMode = mode ?? comparison.bestMode
  if (comparison.status !== 'ok' || !selectedMode || !comparison.modes[selectedMode].available) return null
  return { quantity, priceUsd, mode: selectedMode, cost: comparison.modes[selectedMode],
    ...(input.capacity.mode === 'budget' ? { withinBudget: comparison.modes[selectedMode].totalCostUsd <= input.capacity.budgetUsd } : {}),
  }
}
/** Search each confirmed band independently; same freight means the same mode and cents. */
function sameFreightImprovement(input: PurchasePlanInput, selected: PurchaseScenario) {
  let best: PurchaseScenario | null = null
  const step = input.quote.basis === 'pack' ? input.quote.unitsPerPack : 1
  for (const tier of [input.quote, ...(input.quote.additionalTiers || [])]) {
    let low = Math.ceil(Math.max(selected.quantity + 1, input.moq, tier.minQuantity) / step)
    let high = Math.floor(Math.min(250000, tier.maxQuantity ?? 250000) / step)
    const fits = (q: number) => {
      const scenario = purchaseScenario(input, q * step, selected.mode)
      return scenario && scenario.cost.freightCostUsd <= selected.cost.freightCostUsd + 0.005 ? scenario : null
    }
    if (low > high || !fits(low)) continue
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(middle)) low = middle; else high = middle - 1
    }
    const scenario = fits(low)
    if (scenario && Math.abs(scenario.cost.freightCostUsd - selected.cost.freightCostUsd) < 0.005 && scenario.cost.unitCostUsd < selected.cost.unitCostUsd && (!best || scenario.cost.unitCostUsd < best.cost.unitCostUsd)) best = scenario
  }
  return best
}
export function buildPurchasePlan(input: PurchasePlanInput): PurchasePlan {
  const single = purchaseScenario(input, 1)
  const singleReason = single ? null : input.moq > 1 ? `El proveedor exige un mínimo de ${input.moq} unidades; una unidad no es una compra disponible.` : input.quote.basis === 'pack' && input.quote.unitsPerPack > 1 ? `La oferta es por lotes de ${input.quote.unitsPerPack} unidades; no hay una compra unitaria confirmada.` : 'No hay precio confirmado o flete disponible para comprar una unidad.'
  const step = input.quote.basis === 'pack' ? input.quote.unitsPerPack : 1
  const bands = [input.quote, ...(input.quote.additionalTiers || [])]
  const floors = bands.map(tier => Math.ceil(Math.max(1, input.moq, tier.minQuantity) / step) * step)
    .filter(q => Number.isFinite(q) && supplierQuotePrice(input.quote, q) !== null)
  const minimum = floors.length ? Math.min(...floors) : Math.ceil(Math.max(1, input.moq) / step) * step
  const minimumScenario = purchaseScenario(input, minimum)
  const finish = (plan: PurchasePlan): PurchasePlan => {
    const selected = plan.selected
    const candidates = new Set<number>([minimum, ...floors, ...bands.flatMap(tier => tier.maxQuantity === null ? [] : [Math.floor(tier.maxQuantity / step) * step])])
    if (selected) for (const factor of [1, 2, 3, 5, 10]) candidates.add(Math.ceil(selected.quantity * factor / step) * step)
    if (plan.improvement) candidates.add(plan.improvement.quantity)
    const valid = [...candidates].filter(q => q <= 250000).map(q => purchaseScenario(input, q)).filter((s): s is PurchaseScenario => !!s)
      .filter(s => input.capacity.mode !== 'budget' || s.cost.totalCostUsd <= input.capacity.budgetUsd)
      .sort((a, b) => a.quantity - b.quantity)
    const important = [minimumScenario, selected, plan.improvement].filter((s): s is PurchaseScenario => !!s)
      .filter(s => input.capacity.mode !== 'budget' || s.cost.totalCostUsd <= input.capacity.budgetUsd)
    const quantities = new Set(important.map(s => s.quantity))
    for (const scenario of valid) if (quantities.size < 8) quantities.add(scenario.quantity)
    const alternatives = valid.filter(s => quantities.has(s.quantity))
    const comparison = selected ? compareLandedCost({ ...input.costs, quantity: selected.quantity, unitPriceUsd: selected.priceUsd }) : null
    return { ...plan, minimum: minimumScenario,
      minimumReason: minimumScenario ? null : `No hay precio y transporte modelados para el mínimo comercial de ${minimum} unidades. Revisá MOQ, lotes, tramos y origen.`,
      alternatives,
      transportOptions: comparison ? (['courier', 'air', 'lcl'] as const).map(mode => transportOption(mode, comparison.modes[mode], input.costs.originCountry, input.cargoText)) : [],
    }
  }
  let selected: PurchaseScenario | null = null
  let note: string | null = null
  if (input.capacity.mode === 'budget') {
    if (!(input.capacity.budgetUsd > 0)) return finish({ single, singleReason, selected: null, improvement: null, error: 'Ingresá un presupuesto total positivo.', note })
    const options = optimizeQuantity({ ...input.costs, quantity: minimum, unitPriceUsd: supplierQuotePrice(input.quote) || 0, supplierQuote: input.quote, moq: input.moq, unitIncrement: step, budgetUsd: input.capacity.budgetUsd })
    const affordable = options.affordableCandidates.filter(c => c.selectedCost && c.totalCostUsd <= input.capacity.budgetUsd).sort((a,b) => b.quantity - a.quantity)
    selected = input.quantity ? purchaseScenario(input, input.quantity) : affordable.length ? purchaseScenario(input, affordable[0].quantity) : null
    if (!selected || selected.cost.totalCostUsd > input.capacity.budgetUsd) {
      const floor = options.candidates.filter(c => c.selectedCost && c.totalCostUsd > 0).sort((a,b) => a.totalCostUsd - b.totalCostUsd)[0]
      return finish({ single, singleReason, selected: null, improvement: null, error: floor ? `El presupuesto no alcanza. La alternativa evaluada de menor total requiere USD ${floor.totalCostUsd.toFixed(2)}; faltan USD ${Math.max(0, floor.totalCostUsd - input.capacity.budgetUsd).toFixed(2)}.` : 'No hay una compra viable con este presupuesto y los precios confirmados.', note })
    }
    const cheaper = affordable.filter(c => c.unitCostUsd < selected!.cost.unitCostUsd).sort((a,b) => a.unitCostUsd - b.unitCostUsd)[0]
    const improvement = cheaper ? purchaseScenario(input, cheaper.quantity) : null
    return finish({ single, singleReason, selected, improvement, error: null, note: `Cantidad calculada dentro del presupuesto total de USD ${input.capacity.budgetUsd.toFixed(2)}. Saldo: USD ${(input.capacity.budgetUsd - selected.cost.totalCostUsd).toFixed(2)}.` })
  }
  if (input.capacity.mode === 'units') {
    const quantity = input.quantity ?? input.capacity.min
    if (!Number.isInteger(quantity) || (!input.quantityApproved && (quantity < input.capacity.min || quantity > input.capacity.max))) return finish({ single, singleReason, selected: null, improvement: null, error: 'Elegí una cantidad dentro del rango que ingresaste.', note })
    selected = purchaseScenario(input, quantity)
    if (input.capacity.min !== input.capacity.max) note = input.quantityApproved && (quantity < input.capacity.min || quantity > input.capacity.max) ? `Elegiste ${quantity} unidades como alternativa a tu rango original ${input.capacity.min}–${input.capacity.max}.` : `Usamos ${quantity} unidades de tu rango ${input.capacity.min}–${input.capacity.max}; podés cambiar esa cantidad.`
  } else {
    selected = purchaseScenario(input, input.quantity ?? minimum)
    note = `Empezamos por la compra mínima disponible: ${minimum} unidades, respetando MOQ, lotes y tramos de precio confirmados.`
  }
  return finish({ single, singleReason, selected, improvement: selected ? sameFreightImprovement(input, selected) : null, error: selected ? null : 'La cantidad no cumple el mínimo, no tiene un tramo de precio confirmado o no dispone de flete. Revisá la oferta del proveedor.', note })
}
