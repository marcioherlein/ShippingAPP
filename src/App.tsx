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
import MarketEvidence from './components/MarketEvidence'
import RobustQuantityPanel from './components/RobustQuantityPanel'
import ExpertOverridePanel from './components/ExpertOverridePanel'
import NcmIntelligencePanel from './components/NcmIntelligencePanel'
import { defaultInputs } from './data/defaults'
import { bestRowsV2, calculateV2, recommendV2 } from './lib/optimizerV2'
import { applyAnalysisV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { buildRegulatoryChecksV4 } from './lib/regulatoryV4'
import { defaultClientProfileV3, type ClientProfileV3 } from './lib/regulatoryV3'
import { applyExpertOverride, type ExpertOverride } from './lib/expertOverride'
import { automaticEvidenceReady, missingAutomaticEvidence, quantityDecisionReady } from './lib/decisionReadiness'
import type { ScenarioTaxContext } from './lib/types'

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [expertOverride, setExpertOverride] = useState<ExpertOverride | null>(null)
  const [client, setClient] = useState<ClientProfileV3>(defaultClientProfileV3)
  const taxContext = useMemo<ScenarioTaxContext>(() => ({ entityType: client.entityType, taxStatus: client.taxStatus, purpose: client.purpose, statisticsExempt: false, vatPerceptionExempt: client.entityType === 'individual' && client.purpose === 'own_use', gainsPerceptionExempt: false }), [client])
  const results = useMemo(() => calculateV2(inputs, taxContext), [inputs, taxContext])
  const rows = useMemo(() => bestRowsV2(results), [results])
  const selected = useMemo(() => recommendV2(results), [results])
  const regulatoryChecks = useMemo(() => analysis ? buildRegulatoryChecksV4(analysis, client, expertOverride) : [], [analysis, client, expertOverride])
  const marketP25Ars = analysis && !expertOverride ? Number((analysis.market as any).details?.p25Ars) || null : null

  const automaticReady = !!analysis && automaticEvidenceReady(analysis)
  const economicsReady = automaticReady || !!expertOverride
  const decisionReady = quantityDecisionReady(economicsReady, inputs.monthlyDemand)

  const handleAnalysis = (next: ProductAnalysisV2) => {
    setExpertOverride(null)
    setAnalysis(next)
    setProduct(next.product.name)
    setInputs((current) => ({ ...applyAnalysisV2(current, next), monthlyDemand: 0 }))
  }

  const handleExpertOverride = (override: ExpertOverride) => {
    setExpertOverride(override)
    setInputs((current) => applyExpertOverride(current, override))
  }

  const missingAutomatic = analysis ? missingAutomaticEvidence(analysis) : []

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 1.1</span></header>
    <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />
    {analysis && <MarketEvidence analysis={analysis} />}
    {analysis && !expertOverride && <NcmIntelligencePanel analysis={analysis} />}

    {analysis && economicsReady && <>
      {expertOverride
        ? <div className="analysis-banner"><b>Expert Override activo.</b> El business case usa evidencia aportada manualmente: NCM {expertOverride.ncm}, derecho {expertOverride.dutyRatePct}%, precio proveedor USD {expertOverride.supplierUnitPriceUsd}, MOQ {expertOverride.moq}, peso/volumen, benchmark local y demanda {expertOverride.monthlyDemand} u./mes. ShippingAPP no convierte esos datos en validación aduanera; NCM/derecho permanecen en VERIFICAR.</div>
        : <div className="analysis-banner"><b>Estimación instantánea.</b> Precio local basado en comparables publicados; la demanda no se infiere de Mercado Libre. Confirmá una hipótesis mensual antes de usar score o recomendación de cantidad. La NCM se busca contra la snapshot completa cargada del nomenclador ARCA y sigue siendo candidata; el arancel automático sólo se conserva cuando existe evidencia separada suficientemente fuerte. Intervenciones, origen preferencial, reglamentos técnicos y medidas comerciales permanecen sujetos a verificación.</div>}

      <div className="workspace">
        <aside className="inputs-column"><details className="manual-details" open><summary>Ajustar supuestos económicos</summary><label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><ProductPanel inputs={inputs} setInputs={setInputs} /><MarketPanel inputs={inputs} setInputs={setInputs} /><LogisticsPanel inputs={inputs} setInputs={setInputs} /><ImportPanel inputs={inputs} setInputs={setInputs} /></details></aside>
        <section className="results-column">
          {decisionReady ? <>
            <div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} capitalAvailableUsd={inputs.capitalAvailableUsd} /></div>
            <ScenarioTable rows={rows} selected={selected} />
            <RobustQuantityPanel key={`${analysis.sourceUrl}:${marketP25Ars ?? 'manual'}`} inputs={inputs} context={taxContext} marketP25Ars={marketP25Ars} />
            <section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen sobre costo económico 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar el capital inicial 10%.</p><p>El score mide atractivo económico, no habilitación legal ni demanda observada. El optimizador robusto compara ese mismo score bajo escenarios adversos visibles, sin probabilidades implícitas.</p></section>
          </> : <section className="partial-card"><span className="eyebrow">Quantity decision locked</span><h2>Confirmá una hipótesis de demanda mensual</h2><p>Los datos de producto, mercado y costos están listos para seguir ajustando, pero ShippingAPP no muestra “Recomendado”, meses de inventario, Economic score ni cantidad robusta hasta que ingreses una demanda mensual mayor a 0 en “Mercado y capital”.</p><p>Mercado Libre aporta publicaciones y precios de screening; no observamos ventas reales.</p></section>}
        </section>
      </div>
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {analysis && !economicsReady && <>
      <section className="partial-card"><span className="eyebrow">Análisis parcial</span><h2>Falta evidencia crítica para calcular sin heredar defaults de la demo.</h2><p>Campos pendientes: {missingAutomatic.join(', ') || 'evidencia manual requerida'}. ShippingAPP no reutiliza precios, pesos, volúmenes, demanda ni aranceles de otro producto.</p></section>
      <ExpertOverridePanel key={analysis.sourceUrl} analysis={analysis} onApply={handleExpertOverride} />
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {!analysis && <section className="value-strip"><div><b>01</b><span>Producto y MOQ</span><p>Extraemos lo visible de la publicación.</p></div><div><b>02</b><span>NCM Intelligence</span><p>Retrieval sobre la snapshot completa ARCA + shortlist restringida.</p></div><div><b>03</b><span>Requirements</span><p>Arancel, CIVUCE, restricciones, reglamentos y origen a resolver.</p></div><div><b>04</b><span>Decisión robusta</span><p>Economics + readiness + cantidad con demanda explícita.</p></div></section>}
  </main>
}
