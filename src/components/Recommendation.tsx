import React from 'react'
import { ars, pct, usd } from '../lib/format'
import type { Result } from '../lib/types'

type Props = { result?: Result }

export default function Recommendation({ result }: Props) {
  if (!result) return <section className="recommendation empty">Completá los datos para calcular escenarios.</section>

  return <section className="recommendation">
    <div className="recommendation-top">
      <div><span className="eyebrow">Cantidad recomendada</span><strong>{result.quantity} unidades</strong></div>
      <div className="score"><span>Score</span><b>{result.score}</b><small>/100</small></div>
    </div>
    <div className="mode">{result.mode === 'air' ? '✈ Aéreo' : '⚓ Marítimo LCL'} {result.affordable ? '· Dentro del capital' : '· Supera el capital'}</div>
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
