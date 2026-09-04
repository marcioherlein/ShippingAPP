import type { LandedCostComparison, ModeCostBreakdown } from './landedCostEngine'
import type { QuantityOptimization } from './quantityOptimizer'

export type ImportVerdict = 'si' | 'no' | 'ajusta' | 'faltan-datos'

export type ImporterCostItem = {
  label: string
  usd: number
}

export type ImporterSummary = {
  // Top-level verdict
  verdict: ImportVerdict
  verdictHeadline: string
  verdictDetail: string

  // Fixed costs: paid once per shipment regardless of quantity
  fixedCostUsd: number
  fixedItems: ImporterCostItem[]

  // Variable costs: per-unit landed cost (product + freight + duties + taxes)
  unitVariableCostUsd: number
  unitItems: ImporterCostItem[]

  // Full unit landed cost (fixed diluted + variable)
  unitTotalCostUsd: number

  // Best mode
  mode: 'lcl' | 'air' | null
  modeLabel: string
  quantity: number
  totalCostUsd: number

  // Profitability (null when sell price unknown)
  sellPriceUsd: number | null
  profitPerUnitUsd: number | null
  profitPct: number | null
  needsCapitalUsd: number

  // Plain-Spanish logistics fact for LCL or FCL
  logisticsFact: string | null

  // Fill-the-meter / pull-back signals from the optimizer
  freightSignals: string[]
}

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

function modeLabel(mode: 'lcl' | 'air' | null): string {
  if (mode === 'lcl') return 'barco (LCL)'
  if (mode === 'air') return 'aéreo'
  return '-'
}

function logisticsFactFor(breakdown: ModeCostBreakdown): string | null {
  if (breakdown.mode === 'lcl') {
    const raw = breakdown.lclRawWm
    const billed = breakdown.lclBilledWm
    if (raw !== undefined && billed !== undefined && raw > 0) {
      if (billed > raw + 0.01) {
        return `Tu carga ocupa ${raw.toFixed(2)} m³, pero el flete se cobra por ${billed} m³ (mínimo por metro cúbico entero).`
      }
      return `Tu carga ocupa ${raw.toFixed(2)} m³ — se factura como ${billed} m³.`
    }
  }
  if (breakdown.mode === 'fcl') {
    const c = breakdown.fclContainers ?? 1
    return `Tu carga necesita ${c} contenedor${c > 1 ? 'es' : ''} de 40 pies.`
  }
  return null
}

function verdictFor(
  mode: 'lcl' | 'air' | null,
  marginPct: number | null,
  blockers: string[],
): { verdict: ImportVerdict; headline: string; detail: string } {
  if (!mode || blockers.length > 0) {
    return {
      verdict: 'faltan-datos',
      headline: 'Completá los datos',
      detail: blockers.length
        ? 'Hay datos clave sin completar. El costo se muestra pero la decisión queda abierta.'
        : 'Cargá producto, origen y peso/volumen para ver la comparación.',
    }
  }
  if (marginPct !== null && marginPct < 0) {
    return {
      verdict: 'no',
      headline: 'No conviene con estos datos',
      detail: `El costo por unidad supera el precio de venta que cargaste. Revisá precio de compra o precio de venta.`,
    }
  }
  if (marginPct !== null && marginPct < 20) {
    return {
      verdict: 'ajusta',
      headline: 'Ajustá la cantidad o el precio',
      detail: `El margen queda por debajo del 20 %. Hay poco colchón para errores, demoras o gastos no modelados. Probá traer más unidades para bajar el costo unitario.`,
    }
  }
  return {
    verdict: 'si',
    headline: `Conviene importar por ${modeLabel(mode)}`,
    detail: marginPct !== null
      ? `Margen estimado de ${marginPct.toFixed(0)} % sobre el precio de venta cargado.`
      : `${modeLabel(mode).charAt(0).toUpperCase() + modeLabel(mode).slice(1)} es el menor costo entre las opciones.`,
  }
}

export function buildImporterSummary(
  comparison: LandedCostComparison,
  quantity: number,
  localSellPriceUsd: number,
  optimization: QuantityOptimization | null,
): ImporterSummary {
  const winner = comparison.bestMode ? comparison.modes[comparison.bestMode] : null
  const mode = comparison.bestMode
  const checklist = comparison.checklist
  const marginPct = winner && localSellPriceUsd > 0
    ? round2(((localSellPriceUsd - winner.unitCostUsd) / localSellPriceUsd) * 100)
    : null

  const { verdict, headline, detail } = verdictFor(mode, marginPct, checklist.blockers)

  // Fixed items: paid once per shipment, not per unit
  const fixedItems: ImporterCostItem[] = []
  if (winner) {
    if (winner.fixedDestinationUsd > 0) fixedItems.push({ label: 'Trámites en destino (despacho, depósito, etc.)', usd: winner.fixedDestinationUsd })
    if (winner.noImporterSignatureUsd > 0) fixedItems.push({ label: 'Costo por no tener firma de importador', usd: winner.noImporterSignatureUsd })
    if (winner.sensitiveCategoryUsd > 0) fixedItems.push({ label: 'Trámite de intervención (alimentos, juguetes, etc.)', usd: winner.sensitiveCategoryUsd })
  }
  const fixedCostUsd = round2(fixedItems.reduce((s, i) => s + i.usd, 0))

  // Variable per-unit items
  const unitItems: ImporterCostItem[] = []
  const qty = Math.max(1, quantity)
  if (winner) {
    const perUnit = (v: number) => round2(v / qty)
    unitItems.push({ label: 'Producto (precio de compra)', usd: perUnit(winner.fobUsd) })
    unitItems.push({ label: 'Flete internacional', usd: perUnit(winner.freightCostUsd) })
    const aranceles = winner.dutyUsd + winner.statisticsUsd
    if (aranceles > 0) unitItems.push({ label: 'Aranceles (derecho + tasa estadística)', usd: perUnit(aranceles) })
    const impuestos = winner.vatUsd + winner.vatAdditionalUsd + winner.gainsUsd + winner.iibbUsd
    if (impuestos > 0) unitItems.push({ label: 'Impuestos (IVA, ganancias, IIBB)', usd: perUnit(impuestos) })
  }
  const unitVariableCostUsd = round2(unitItems.reduce((s, i) => s + i.usd, 0))

  // Fill-the-meter signals from recommendation
  const freightSignals: string[] = []
  if (optimization?.recommendation) {
    const recReasons = optimization.recommendation.reasons
    for (const r of recReasons) {
      if (r.includes('m³ de flete') || r.includes('m³ más sin pagar')) freightSignals.push(r)
    }
  }

  return {
    verdict,
    verdictHeadline: headline,
    verdictDetail: detail,
    fixedCostUsd,
    fixedItems,
    unitVariableCostUsd,
    unitItems,
    unitTotalCostUsd: winner ? round2(winner.unitCostUsd) : 0,
    mode,
    modeLabel: modeLabel(mode),
    quantity,
    totalCostUsd: winner ? round2(winner.totalCostUsd) : 0,
    sellPriceUsd: localSellPriceUsd > 0 ? localSellPriceUsd : null,
    profitPerUnitUsd: winner && localSellPriceUsd > 0 ? round2(localSellPriceUsd - winner.unitCostUsd) : null,
    profitPct: marginPct,
    needsCapitalUsd: winner ? round2(winner.totalCostUsd) : 0,
    logisticsFact: winner ? logisticsFactFor(winner) : null,
    freightSignals,
  }
}
