import React from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { ars } from '../lib/format'

type Props = { analysis: ProductAnalysisV2 }

function priceSourceLabel(source: string) {
  return source === 'sale_price' ? 'precio efectivo' : 'precio búsqueda'
}

export default function MarketEvidence({ analysis }: Props) {
  const market = (analysis.market as any).details
  if (!market) return null

  if (market.status === 'configuration_required') {
    return <section className="partial-card">
      <span className="eyebrow">Mercado argentino</span>
      <h2>Conexión Mercado Libre pendiente</h2>
      <p>ShippingAPP requiere la API oficial autenticada para promover un precio de mercado al business case. Configurá <b>MERCADOLIBRE_ACCESS_TOKEN</b> como Worker secret; mientras tanto no se inventa ni reutiliza un benchmark local.</p>
    </section>
  }

  if (market.status !== 'live') {
    return <section className="partial-card">
      <span className="eyebrow">Mercado argentino</span>
      <h2>Comparables insuficientes</h2>
      <p>ShippingAPP no usa el benchmark histórico como sustituto. Estado de la fuente: <b>{market.status}</b>.</p>
      {market.warnings?.length > 0 && <p>{market.warnings[market.warnings.length - 1]}</p>}
    </section>
  }

  return <section className="extraction-card">
    <div className="extraction-top">
      <div>
        <span className="eyebrow">Mercado argentino · Mercado Libre API</span>
        <h2>{market.comparableCount} comparables aceptados</h2>
        <p>{market.rawCount} resultados revisados · {market.effectivePriceCount} con precio efectivo · query “{market.query}”{market.categoryName ? ` · ${market.categoryName}` : ''}</p>
      </div>
      <span className="confidence">{market.confidence}% confidence</span>
    </div>
    <div className="fact-grid">
      <div><span>P25</span><b>{ars(market.p25Ars || 0)}</b></div>
      <div><span>Mediana</span><b>{ars(market.medianArs || 0)}</b></div>
      <div><span>P75</span><b>{ars(market.p75Ars || 0)}</b></div>
      <div><span>Precio competitivo · P40</span><b>{ars(market.suggestedPriceArs || 0)}</b></div>
    </div>
    <p className="assumption-note">La API usa sale_price efectivo cuando Mercado Libre lo devuelve y conserva el precio de búsqueda autenticado sólo como fallback por publicación. Esto sigue siendo evidencia de oferta, no ventas observadas ni demanda.</p>
    <details className="assumptions">
      <summary>Ver comparables utilizados</summary>
      <ul>{market.comparables.map((item: any) => <li key={item.id || item.title}><b>{ars(item.priceArs)}</b> · {priceSourceLabel(item.priceSource)} · {item.title} · Match {item.score}/100</li>)}</ul>
    </details>
  </section>
}
