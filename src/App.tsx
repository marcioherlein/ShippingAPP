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
import { applyAnalysisV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { defaultClientProfile, type ClientProfile } from './lib/regulatory'
import { buildRegulatoryChecksV2 } from './lib/regulatoryV2'
import type { ScenarioTaxContext } from './lib/types'

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [client, setClient] = useState<ClientProfile>(defaultClientProfile)
  const taxContext = useMemo<ScenarioTaxContext>(() => ({ entityType: client.entityType, taxStatus: client.taxStatus, purpose: client.purpose, statisticsExempt: analysis?.customs.statisticsExemptByOrigin === true, vatPerceptionExempt: client.entityType === 'individual' && client.purpose === 'own_use', gainsPerceptionExempt: false }), [client, analysis])
  const results = useMemo(() => calculateV2(inputs, taxContext), [inputs, taxContext])
  const rows = useMemo(() => bestRowsV2(results), [results])
  const selected = useMemo(() => recommendV2(results), [results])
  const regulatoryChecks = useMemo(() => analysis ? buildRegulatoryChecksV2(analysis, client) : [], [analysis, client])
  const customsReady = analysis?.customs.dutyRatePct !== null
  const economicsReady = !!analysis?.product.unitPriceUsd && !!analysis?.market.estimatedPriceArs && customsReady

  const handleAnalysis = (next: ProductAnalysisV2) => {
    setAnalysis(next)
    setProduct(next.product.name)
    setInputs((current) => applyAnalysisV2(current, next))
  }

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 0.3.2</span></header>
    <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />
    {analysis && economicsReady && <>
      <div className="analysis-banner"><b>Estimación instantánea.</b> NCM, derecho e intervenciones permanecen sujetos a verificación contra Arancel Integrado/CIVUCE.</div>
      <div className="workspace"><aside className="inputs-column"><details className="manual-details" open><summary>Ajustar supuestos económicos</summary><label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><ProductPanel inputs={inputs} setInputs={setInputs} /><MarketPanel inputs={inputs} setInputs={setInputs} /><LogisticsPanel inputs={inputs} setInputs={setInputs} /><ImportPanel inputs={inputs} setInputs={setInputs} /></details></aside>
      <section className="results-column"><div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} capitalAvailableUsd={inputs.capitalAvailableUsd} /></div><ScenarioTable rows={rows} selected={selected} /><section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen sobre costo económico 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar el capital inicial 10%.</p><p>El score mide atractivo económico, no habilitación legal. El Regulatory Engine mantiene ambos conceptos separados.</p></section></section></div>
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}
    {analysis && !economicsReady && <><section className="partial-card"><span className="eyebrow">Análisis parcial</span><h2>{!customsReady ? 'Producto detectado; clasificación aduanera todavía no soportada.' : 'Detectamos el producto, pero falta información económica.'}</h2><p>{!customsReady ? 'ShippingAPP no reutiliza un arancel genérico. El NCM, derecho e intervenciones deben resolverse antes del business case.' : 'No mostramos un margen inventado. Podés completar el checklist y revisar requisitos mientras se completa la parte económica.'}</p></section><ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} /></>}
    {!analysis && <section className="value-strip"><div><b>01</b><span>Producto y MOQ</span><p>Extraemos lo visible de la publicación.</p></div><div><b>02</b><span>Clasificación</span><p>Asignamos NCM sólo para categorías soportadas.</p></div><div><b>03</b><span>Costo y mercado</span><p>Separamos costo económico de capital inicial.</p></div><div><b>04</b><span>Readiness regulatorio</span><p>Checklist e intervenciones a verificar.</p></div></section>}
  </main>
}
