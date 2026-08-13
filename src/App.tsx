import React, { useMemo, useState } from 'react'
import ProductPanel from './components/ProductPanel'
import MarketPanel from './components/MarketPanel'
import LogisticsPanel from './components/LogisticsPanel'
import ImportPanel from './components/ImportPanel'
import Recommendation from './components/Recommendation'
import ScenarioTable from './components/ScenarioTable'
import UrlAnalyzer from './components/UrlAnalyzer'
import { demoInputs } from './data/demo'
import { bestPerQuantity, calculate, recommend } from './lib/optimizer'
import { applyAnalysis, type ProductAnalysis } from './lib/productAnalysis'

export default function App() {
  const [inputs, setInputs] = useState(demoInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const results = useMemo(() => calculate(inputs), [inputs])
  const rows = useMemo(() => bestPerQuantity(results), [results])
  const selected = useMemo(() => recommend(results), [results])
  const economicsReady = !!analysis?.product.unitPriceUsd && !!analysis?.market.estimatedPriceArs

  const handleAnalysis = (next: ProductAnalysis) => {
    setAnalysis(next)
    setProduct(next.product.name)
    setInputs((current) => applyAnalysis(current, next))
  }

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 0.2</span></header>

    <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />

    {analysis && economicsReady && <>
      <div className="analysis-banner"><b>Estimación instantánea.</b> Los campos marcados como benchmark se usan para completar datos que la publicación no expone.</div>
      <div className="workspace">
        <aside className="inputs-column">
          <details className="manual-details" open>
            <summary>Ajustar supuestos</summary>
            <label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label>
            <ProductPanel inputs={inputs} setInputs={setInputs} />
            <MarketPanel inputs={inputs} setInputs={setInputs} />
            <LogisticsPanel inputs={inputs} setInputs={setInputs} />
            <ImportPanel inputs={inputs} setInputs={setInputs} />
          </details>
        </aside>
        <section className="results-column">
          <div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} /></div>
          <ScenarioTable rows={rows} selected={selected} />
          <section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar la operación 10%.</p><p>Los números son estimaciones para screening. ShippingAPP mostrará la calidad de cada input antes de tratarlo como dato verificado.</p></section>
        </section>
      </div>
    </>}

    {analysis && !economicsReady && <section className="partial-card">
      <span className="eyebrow">Análisis parcial</span>
      <h2>Detectamos el producto, pero todavía no tenemos suficiente información para calcular margen.</h2>
      <p>No mostramos un número inventado. La próxima capa del scanner buscará automáticamente precio de proveedor y comparables argentinos cuando Alibaba no los exponga directamente.</p>
    </section>}

    {!analysis && <section className="value-strip">
      <div><b>01</b><span>Producto y MOQ</span><p>Extraemos lo visible de la publicación.</p></div>
      <div><b>02</b><span>Costo puesto</span><p>Comparamos cantidades y transporte.</p></div>
      <div><b>03</b><span>Mercado argentino</span><p>Estimamos precio y atractivo comercial.</p></div>
      <div><b>04</b><span>Cantidad óptima</span><p>Buscamos el mejor uso del capital.</p></div>
    </section>}
  </main>
}
