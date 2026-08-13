import React from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { ars } from '../lib/format'

type Props = { analysis: ProductAnalysisV2 }

export default function MarketEvidence({ analysis }: Props) {
  const market = (analysis.market as any).details
  if (!market) return null

  if (market.status !== 'live') {
    return <section className="partial-card">
      <span className="eyebrow">Mercado argentino</span>
      <h2>Comparables insuficientes</h2>
      <p>ShippingAPP no usa el benchmark histórico como sustituto. Estado de la fuente: <b>{market.status}</b>.</p>
    </section>
  }

  return <section className="extraction-card">
    <div className="extraction-top">
      <div><span className="eyebrow">Mercado argentino · evidencia live</span><h2>{market.comparableCount} comparables aceptados</h2><p>{market.rawCount} resultados revisados · query “{market.query}”</p></div>
      <span className="confidence">{market.confidence}% confidence</span>
    </div>
    <div className="fact-grid">
      <div><span>P25</span><b>{ars(market.p25Ars || 0)}</b></div>
      <div><span>Mediana</span><b>{ars(market.medianArs || 0)}</b></div>
      <div><span>P75</span><b>{ars(market.p75Ars || 0)}</b></div>
      <div><span>Precio publicado de screening</span><b>{ars(market.suggestedPriceArs || 0)}</b></div>
    </div>
    <p className="assumption-note">Precios publicados de screening. No representan necesariamente el precio final/promocional de checkout ni una estimación de demanda.</p>
    <details className="assumptions"><summary>Ver comparables utilizados</summary><ul>{market.comparables.map((item: any) => <li key={item.id || item.title}><b>{ars(item.priceArs)}</b> · {item.title} · Match {item.score}/100</li>)}</ul></details>
  </section>
}
