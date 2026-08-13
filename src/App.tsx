import React, { useMemo, useState } from 'react'
import ProductPanel from './components/ProductPanel'
import MarketPanel from './components/MarketPanel'
import LogisticsPanel from './components/LogisticsPanel'
import ImportPanel from './components/ImportPanel'
import Recommendation from './components/Recommendation'
import ScenarioTable from './components/ScenarioTable'
import UrlAnalyzer from './components/UrlAnalyzer'
import ClientChecklist from './components/ClientChecklist'
import RegulatoryPanel from './components/RegulatoryPanel'
import { defaultInputs } from './data/defaults'
import { bestRowsV2, calculateV2, recommendV2 } from './lib/optimizerV2'
import { applyAnalysis, type ProductAnalysis } from './lib/productAnalysis'
import { defaultClientProfile, type ClientProfile } from './lib/regulatory'
import { buildRegulatoryChecksV2 } from './lib/regulatoryV2'
import type { ScenarioTaxContext } from './lib/types'

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const [client, setClient] = useState<ClientProfile>(defaultClientProfile)
  const taxContext = useMemo<ScenarioTaxContext>(() => ({ entityType: client.entityType, taxStatus: client.taxStatus, purpose: client.purpose, statisticsExempt: false, vatPerceptionExempt: client.entityType === 'individual' && client.purpose === 'own_use', gainsPerceptionExempt: false }), [client])
  const results = useMemo(() => calculateV2(inputs, taxContext), [inputs, taxContext])
  const rows = useMemo(() => bestRowsV2(results), [results])
  const selected = useMemo(() => recommendV2(results), [results])
  const regulatoryChecks = useMemo(() => analysis ? buildRegulatoryChecksV2(analysis, client) : [], [analysis, client])
  const economicsReady = !!analysis?.product.unitPriceUsd && !!analysis?.market.estimatedPriceArs

  const handleAnalysis = (next: ProductAnalysis) => {
    setAnalysis(next); setProduct(next.product.name); setInputs((current) => applyAnalysis(current, next))
  }

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 0.3.1</span></header>
    <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />
    {analysis && economicsReady && <>
      <div className="analysis-banner"><b>Estimación instantánea.</b> Los campos marcados como benchmark se usan para completar datos que la publicación no expone.</div>
      <div className="workspace"><aside className="inputs-column"><details className="manual-details" open><summary>Ajustar supuestos económicos</summary><label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><ProductPanel inputs={inputs} setInputs={setInputs} /><MarketPanel inputs={inputs} setInputs={setInputs} /><LogisticsPanel inputs={inputs} setInputs={setInputs} /><ImportPanel inputs={inputs} setInputs={setInputs} /></details></aside>
      <section className="results-column"><div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} capitalAvailableUsd={inputs.capitalAvailableUsd} /></div><ScenarioTable rows={rows} selected={selected} /><section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen sobre costo económico 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar el capital inicial 10%.</p><p>El score mide atractivo económico, no habilitación legal. El Regulatory Engine mantiene ambos conceptos separados.</p></section></section></div>
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}
    {analysis && !economicsReady && <><section className="partial-card"><span className="eyebrow">Análisis parcial</span><h2>Detectamos el producto, pero todavía no tenemos suficiente información para calcular margen.</h2><p>No mostramos un número inventado. Podés completar el checklist y revisar requisitos mientras se completa la parte económica.</p></section><ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} /></>}
    {!analysis && <section className="value-strip"><div><b>01</b><span>Producto y MOQ</span><p>Extraemos lo visible de la publicación.</p></div><div><b>02</b><span>Costo puesto</span><p>Separamos costo económico de capital inicial.</p></div><div><b>03</b><span>Mercado argentino</span><p>Estimamos precio y atractivo comercial.</p></div><div><b>04</b><span>Readiness regulatorio</span><p>Checklist del importador y requisitos por producto.</p></div></section>}
  </main>
}
