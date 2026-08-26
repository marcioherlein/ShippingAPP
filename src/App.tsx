import React, { useMemo, useState } from 'react'
import ProductPanel from './components/ProductPanel'
import MarketPanel from './components/MarketPanel'
import LogisticsPanel from './components/LogisticsPanel'
import ImportPanel from './components/ImportPanel'
import Recommendation from './components/Recommendation'
import ScenarioTable from './components/ScenarioTable'
import UrlAnalyzer from './components/UrlAnalyzer'
import ImportQuoteFlow from './components/ImportQuoteFlow'
import ClientChecklist from './components/ClientChecklist'
import RegulatoryPanel from './components/RegulatoryPanel'
import MarketEvidence from './components/MarketEvidence'
import FxEvidence from './components/FxEvidence'
import FreightComparisonPanel from './components/FreightComparisonPanel'
import RobustQuantityPanel from './components/RobustQuantityPanel'
import ExpertOverridePanel from './components/ExpertOverridePanel'
import NcmIntelligencePanel from './components/NcmIntelligencePanel'
import OpportunityDecisionPanel from './components/OpportunityDecisionPanel'
import ImportAnalyst from './components/ImportAnalyst'
import HotProductsSection from './components/HotProductsSection'
import { defaultInputs } from './data/defaults'
import { bestRowsV2, calculateV2, recommendV2 } from './lib/optimizerV2'
import { applyAnalysisV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { buildRegulatoryChecksV4 } from './lib/regulatoryV4'
import { defaultClientProfileV3, type ClientProfileV3 } from './lib/regulatoryV3'
import { applyExpertOverride, type ExpertOverride } from './lib/expertOverride'
import { automaticEvidenceReady, quantityDecisionReady } from './lib/decisionReadiness'
import { buildOpportunityDecision } from './lib/opportunityDecision'
import { getCachedHotProducts, hotProductToQuotePrefill } from './lib/hotProducts'
import type { HotProduct } from './data/hotProducts'
import type { ScenarioTaxContext } from './lib/types'

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [expertOverride, setExpertOverride] = useState<ExpertOverride | null>(null)
  const [client, setClient] = useState<ClientProfileV3>(defaultClientProfileV3)
  const [selectedHotProduct, setSelectedHotProduct] = useState<HotProduct | null>(null)
  const hotProducts = useMemo(() => getCachedHotProducts(8), [])
  const quotePrefill = useMemo(() => selectedHotProduct ? hotProductToQuotePrefill(selectedHotProduct) : null, [selectedHotProduct])
  const taxContext = useMemo<ScenarioTaxContext>(() => ({ entityType: client.entityType, taxStatus: client.taxStatus, purpose: client.purpose, statisticsExempt: false, vatPerceptionExempt: client.entityType === 'individual' && client.purpose === 'own_use', gainsPerceptionExempt: false }), [client])
  const regulatoryChecks = useMemo(() => analysis ? buildRegulatoryChecksV4(analysis, client, expertOverride) : [], [analysis, client, expertOverride])
  const marketP25Ars = analysis && !expertOverride ? Number((analysis.market as any).details?.p25Ars) || null : null

  const automaticReady = !!analysis && automaticEvidenceReady(analysis)
  const fxReady = !!analysis && analysis.fx?.status === 'live' && !!analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0
  const economicsReady = automaticReady || (!!expertOverride && fxReady)
  const decisionReady = quantityDecisionReady(economicsReady, inputs.monthlyDemand)

  const results = useMemo(() => economicsReady && inputs.usdArs > 0 ? calculateV2(inputs, taxContext) : [], [inputs, taxContext, economicsReady])
  const rows = useMemo(() => bestRowsV2(results), [results])
  const selected = useMemo(() => recommendV2(results), [results])
  const opportunityDecision = useMemo(() => buildOpportunityDecision({
    analysis, inputs, taxContext, economicsReady, marketP25Ars, manualOverrideActive: !!expertOverride,
  }), [analysis, inputs, taxContext, economicsReady, marketP25Ars, expertOverride])

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

  const handleHotProductQuote = (next: HotProduct) => {
    setSelectedHotProduct(next)
    window.setTimeout(() => {
      document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  return <main className="mobile-app-shell">
    <header className="topbar mobile-topbar" id="home">
      <a className="brand mobile-brand" href="#home"><span className="brand-cube" aria-hidden="true" />Shipping<span>APP</span></a>
      <span className="mvp-badge">MVP 2.4</span>
    </header>

    <section className="mobile-hero">
      <div className="hero-glow" aria-hidden="true" />
      <span className="eyebrow">Calcula. Importa. Gana.</span>
      <h1>Decidí qué importar y cuántas unidades traer.</h1>
      <p>Buscá oportunidades en Alibaba o cargá tu proveedor propio. ShippingAPP calcula flete, CIF, impuestos, cantidad óptima y recomendación final.</p>
      <div className="hero-search-pill"><span>🔎</span><b>Buscar producto, pegar link o cotizar manual</b></div>
      <div className="entry-grid">
        <a className="entry-card entry-primary" href="#hot-products"><span>01</span><b>Hot products</b><small>Ideas cacheadas para cotizar sin gastar créditos.</small></a>
        <a className="entry-card" href="#quote"><span>02</span><b>Ya tengo proveedor</b><small>Cargá FOB, peso, volumen, presupuesto y checklist.</small></a>
      </div>
      <div className="mobile-step-strip">
        <span><b>1</b>Elegir</span><span><b>2</b>Cotizar</span><span><b>3</b>Optimizar</span><span><b>4</b>Decidir</span>
      </div>
    </section>

    <HotProductsSection products={hotProducts} selectedId={selectedHotProduct?.id ?? null} onQuote={handleHotProductQuote} />

    <section id="quote" className="mobile-section primary-quote-section">
      <ImportQuoteFlow key={selectedHotProduct?.id ?? 'manual-quote'} prefill={quotePrefill} />
    </section>

    <details id="discover" className="manual-details autocomplete-panel mobile-discover-panel">
      <summary>Buscar oportunidades o autocompletar con proveedor</summary>
      <section className="method-card">
        <h3>Alibaba/MercadoLibre son fuentes opcionales</h3>
        <p>Usá esta sección para traer datos del producto, MOQ, peso, volumen o benchmarks. La cotización manual queda siempre disponible arriba.</p>
      </section>
      <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />
    </details>

    <section id="results" className="mobile-section results-anchor">
      {analysis && <OpportunityDecisionPanel decision={opportunityDecision} />}
      {analysis && <ImportAnalyst key={analysis.sourceUrl} analysis={analysis} inputs={inputs} decision={opportunityDecision} onApplyScenario={setInputs} />}
      {analysis && <MarketEvidence analysis={analysis} />}
      {analysis && <FxEvidence analysis={analysis} />}
      {analysis && <FreightComparisonPanel analysis={analysis} inputs={inputs} client={client} />}
      {analysis && !expertOverride && <NcmIntelligencePanel analysis={analysis} />}
    </section>

    {analysis && economicsReady && <>
      {expertOverride
        ? <div className="analysis-banner"><b>Expert Override activo.</b> El business case usa evidencia aportada manualmente: NCM {expertOverride.ncm}, derecho {expertOverride.dutyRatePct}%, precio proveedor USD {expertOverride.supplierUnitPriceUsd}, MOQ {expertOverride.moq}, peso/volumen, benchmark local y demanda {expertOverride.monthlyDemand} u./mes. El FX sigue viniendo de BCRA REF; ShippingAPP no convierte el override en validación aduanera.</div>
        : <div className="analysis-banner"><b>Opportunity screening.</b> El output sigue input → proceso → output: datos del producto, benchmark, FX, flete FCL/LCL/aéreo, CIF/impuestos/gastos y decisión. FX usa BCRA REF; la NCM/SIM y el arancel siguen siendo screening.</div>}

      <div className="workspace legacy-business-case">
        <aside className="inputs-column"><details className="manual-details" open><summary>Ajustar supuestos económicos</summary><label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><ProductPanel inputs={inputs} setInputs={setInputs} /><MarketPanel inputs={inputs} setInputs={setInputs} /><LogisticsPanel inputs={inputs} setInputs={setInputs} /><ImportPanel inputs={inputs} setInputs={setInputs} /></details></aside>
        <section className="results-column">
          {decisionReady ? <>
            <div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} capitalAvailableUsd={inputs.capitalAvailableUsd} /></div>
            <ScenarioTable rows={rows} selected={selected} />
            <RobustQuantityPanel key={`${analysis.sourceUrl}:${marketP25Ars ?? 'manual'}`} inputs={inputs} context={taxContext} marketP25Ars={marketP25Ars} />
            <section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen sobre costo económico 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar el capital inicial 10% cuando el capital fue informado.</p><p>Si el capital no se informa, esa dimensión no recibe puntos gratis: se normalizan sólo las dimensiones observadas. El score mide atractivo económico, no habilitación legal ni demanda observada.</p></section>
          </> : <section className="partial-card"><span className="eyebrow">Robust Decision pendiente</span><h2>Agregá una hipótesis de demanda para optimizar cantidad.</h2><p>El Instant Screening ya evalúa unit economics y cash del MOQ. Podés escribir la demanda en “Mercado y capital” o decírsela al AI Import Analyst.</p><p>Mercado Libre aporta publicaciones y precios de screening; no observamos ventas reales.</p></section>}
        </section>
      </div>
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {analysis && !economicsReady && <>
      <ExpertOverridePanel key={analysis.sourceUrl} analysis={analysis} onApply={handleExpertOverride} />
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {!analysis && <section className="value-strip mobile-value-strip"><div><b>01</b><span>Input mínimo</span><p>Producto, origen, precio, MOQ, peso/volumen y checklist.</p></div><div><b>02</b><span>Proceso</span><p>Flete FCL/LCL/aéreo, CIF, derechos, tasa, IVA y gastos.</p></div><div><b>03</b><span>Optimización</span><p>Presupuesto, MOQ, demanda y cantidad óptima.</p></div><div><b>04</b><span>Output</span><p>Costo unitario, margen y decisión final.</p></div></section>}

    <nav className="mobile-bottom-nav" aria-label="Navegación principal">
      <a href="#home"><span>⌂</span>Inicio</a>
      <a href="#hot-products"><span>★</span>Hot</a>
      <a href="#quote"><span>▣</span>Cotizar</a>
      <a href="#results"><span>✓</span>Decidir</a>
    </nav>
  </main>
}
