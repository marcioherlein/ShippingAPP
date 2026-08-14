import React from 'react'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'

const formatRate = (value: number) => new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
}).format(value)

export default function FxEvidence({ analysis }: { analysis: ProductAnalysisV2 }) {
  const fx = analysis.fx
  if (!fx || fx.status !== 'live' || !fx.arsPerUsd) {
    return <section className="partial-card">
      <span className="eyebrow">FX · BCRA</span>
      <h2>USD/ARS de referencia pendiente</h2>
      <p>{fx?.note || 'La respuesta del scan no contiene una cotización BCRA REF utilizable.'}</p>
      <p>ShippingAPP conserva producto y mercado, pero bloquea landed cost y Opportunity Decision hasta tener FX oficial de referencia.</p>
    </section>
  }

  return <section className="extraction-card">
    <div className="extraction-top">
      <div>
        <span className="eyebrow">FX · evidencia live</span>
        <h2>ARS {formatRate(fx.arsPerUsd)} / USD</h2>
        <p>{fx.source} · fecha publicada {fx.sourceDate || 'sin fecha'}</p>
      </div>
      <span className="confidence">REF · COM A 3500</span>
    </div>
    <p className="assumption-note">{fx.note}</p>
  </section>
}
