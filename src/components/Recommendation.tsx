import React from 'react'
import { ars, pct, usd } from '../lib/format'
import type { Result } from '../lib/types'

type Props = { result?: Result; capitalAvailableUsd?: number }

export default function Recommendation({ result, capitalAvailableUsd }: Props) {
  if (!result) return <section className="recommendation empty">Completá los datos para calcular escenarios.</section>

  const hasCapital = typeof capitalAvailableUsd === 'number' && capitalAvailableUsd > 0
  const shortfall = hasCapital ? Math.max(0, result.landedTotalUsd - capitalAvailableUsd) : null
  const mode = result.mode === 'air' ? '✈ Aéreo' : '⚓ Marítimo LCL'

  return <section className="recommendation">
    <div className="recommendation-top">
      <div>
        <span className="eyebrow">{result.affordable ? 'Cantidad recomendada' : 'No hay escenario financiable'}</span>
        <strong>{result.affordable ? `${result.quantity} unidades` : shortfall ? `Faltan ${usd(shortfall)}` : 'Capital insuficiente'}</strong>
      </div>
      <div className="score"><span>Opportunity score</span><b>{result.score}</b><small>/100</small></div>
    </div>
    <div className="mode">
      {result.affordable
        ? `${mode} · Dentro del capital`
        : `${mode} · Pedido mínimo analizado: ${result.quantity} u. · Capital insuficiente`}
    </div>
    <div className="metric-grid">
      <div><span>Landed / unidad</span><b>{usd(result.landedUnitUsd)}</b></div>
      <div><span>Margen bruto</span><b>{pct(result.marginPct)}</b></div>
      <div><span>Capital requerido</span><b>{usd(result.landedTotalUsd)}</b></div>
      <div><span>Inventario estimado</span><b>{result.inventoryMonths.toFixed(1)} meses</b></div>
      <div><span>Precio break-even</span><b>{ars(result.breakEvenArs)}</b></div>
      <div><span>Flete internacional</span><b>{usd(result.freightUsd)}</b></div>
    </div>
  </section>
}
