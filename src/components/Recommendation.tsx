import React from 'react'
import { ars, pct, usd } from '../lib/format'
import type { Result } from '../lib/types'

type Props = { result?: Result; capitalAvailableUsd?: number }

export default function Recommendation({ result, capitalAvailableUsd }: Props) {
  if (!result) return <section className="recommendation empty">Completá los datos para calcular escenarios.</section>
  const hasCapital = typeof capitalAvailableUsd === 'number' && capitalAvailableUsd > 0
  const shortfall = hasCapital ? Math.max(0, result.cashRequiredUsd - capitalAvailableUsd) : null
  const mode = result.mode === 'air' ? '✈ Aéreo' : '⚓ Marítimo LCL'

  return <section className="recommendation">
    <div className="recommendation-top">
      <div><span className="eyebrow">{result.affordable ? 'Cantidad recomendada' : 'No hay escenario financiable'}</span><strong>{result.affordable ? `${result.quantity} unidades` : shortfall ? `Faltan ${usd(shortfall)}` : 'Capital insuficiente'}</strong></div>
      <div className="score"><span>Economic score</span><b>{result.score}</b><small>/100</small></div>
    </div>
    <div className="mode">{result.affordable ? `${mode} · Cash inicial dentro del capital` : `${mode} · Pedido mínimo: ${result.quantity} u. · Cash insuficiente`}</div>
    <div className="metric-grid">
      <div><span>Costo económico / unidad</span><b>{usd(result.economicLandedUnitUsd)}</b></div>
      <div><span>Margen bruto estimado</span><b>{pct(result.marginPct)}</b></div>
      <div><span>Cash inicial requerido</span><b>{usd(result.cashRequiredUsd)}</b></div>
      <div><span>Créditos potenciales</span><b>{usd(result.potentialCreditsUsd)}</b></div>
      <div><span>Inventario estimado</span><b>{result.inventoryMonths.toFixed(1)} meses</b></div>
      <div><span>Break-even económico</span><b>{ars(result.breakEvenArs)}</b></div>
    </div>
    <details className="tax-breakdown"><summary>Ver desglose tributario</summary><div className="tax-breakdown-grid">
      <span>Valor aduanero<b>{usd(result.customsBaseUsd)}</b></span><span>Derecho<b>{usd(result.importDutyUsd)}</b></span><span>Tasa estadística<b>{usd(result.statisticsFeeUsd)}</b></span><span>IVA importación<b>{usd(result.importVatUsd)}</b></span><span>Percepción IVA<b>{usd(result.vatPerceptionUsd)}</b></span><span>Percepción Ganancias<b>{usd(result.gainsPerceptionUsd)}</b></span><span>IIBB<b>{usd(result.iibbPerceptionUsd)}</b></span><span>Flete<b>{usd(result.freightUsd)}</b></span>
    </div><ul className="tax-assumptions">{result.taxAssumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
  </section>
}
