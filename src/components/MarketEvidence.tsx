import React from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { ars } from '../lib/format'

type Props = { analysis: ProductAnalysisV2 }

export default function MarketEvidence({ analysis }: Props) {
  const market = (analysis.market as any).details
  if (!market) return null

  if (market.status !== 'live') {
    return <section className="market-evidence market-evidence-warning">
      <div><span className="eyebrow">Mercado argentino</span><h3>Comparables insuficientes</h3></div>
      <p>ShippingAPP no usa el benchmark histórico como sustituto. Estado: <b>{market.status}</b>.</p>
    </section>
  }

  return <section className="market-evidence">
    <div className="market-evidence-head">
      <div><span className="eyebrow">Mercado argentino · evidencia live</span><h3>{market.comparableCount} comparables aceptados</h3><p>{market.rawCount} resultados revisados · query “{market.query}”</p></div>
      <span className="confidence">{market.confidence}% confidence</span>
    </div>
    <div className="market-percentiles">
      <div><span>P25</span><b>{ars(market.p25Ars || 0)}</b></div>
      <div><span>Mediana</span><b>{ars(market.medianArs || 0)}</b></div>
      <div><span>P75</span><b>{ars(market.p75Ars || 0)}</b></div>
      <div><span>Precio screening</span><b>{ars(market.suggestedPriceArs || 0)}</b></div>
    </div>
    <p className="market-disclaimer">Precios publicados de screening. No representan necesariamente el precio final/promocional de checkout ni una estimación de demanda.</p>
    <details><summary>Ver comparables utilizados</summary><div className="comparable-list">{market.comparables.map((item: any) => <div key={item.id || item.title}><span>{item.title}</span><b>{ars(item.priceArs)}</b><small>Match {item.score}/100</small></div>)}</div></details>
  </section>
}
