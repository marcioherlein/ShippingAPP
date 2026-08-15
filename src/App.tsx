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
import FxEvidence from './components/FxEvidence'
import RobustQuantityPanel from './components/RobustQuantityPanel'
import ExpertOverridePanel from './components/ExpertOverridePanel'
import NcmIntelligencePanel from './components/NcmIntelligencePanel'
import OpportunityDecisionPanel from './components/OpportunityDecisionPanel'
import ImportAnalyst from './components/ImportAnalyst'
import { defaultInputs } from './data/defaults'
import { bestRowsV2, calculateV2, recommendV2 } from './lib/optimizerV2'
import { applyAnalysisV2, type ProductAnalysisV2 } from './lib/productAnalysisV2'
import { buildRegulatoryChecksV4 } from './lib/regulatoryV4'
import { defaultClientProfileV3, type ClientProfileV3 } from './lib/regulatoryV3'
import { applyExpertOverride, type ExpertOverride } from './lib/expertOverride'
import { automaticEvidenceReady, quantityDecisionReady } from './lib/decisionReadiness'
import { buildOpportunityDecision } from './lib/opportunityDecision'
import type { ScenarioTaxContext } from './lib/types'

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [product, setProduct] = useState('')
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [expertOverride, setExpertOverride] = useState<ExpertOverride | null>(null)
  const [client, setClient] = useState<ClientProfileV3>(defaultClientProfileV3)
  const taxContext = useMemo<ScenarioTaxContext>(() => ({ entityType: client.entityType, taxStatus: client.taxStatus, purpose: client.purpose, statisticsExempt: false, vatPerceptionExempt: client.entityType === 'individual' && client.purpose === 'own_use', gainsPerceptionExempt: false }), [client])
  const regulatoryChecks = useMemo(() => analysis ? buildRegulatoryChecksV4(analysis, client, expertOverride) : [], [analysis, client, expertOverride])
  const marketP25Ars = analysis && !expertOverride ? Number((analysis.market as any).details?.p25Ars) || null : null

  const automaticReady = !!analysis && automaticEvidenceReady(analysis)
  const fxReady = !!analysis && analysis.fx?.status === 'live' && !!analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0
  const economicsReady = automaticReady || (!!expertOverride && fxReady)
  const decisionReady = quantityDecisionReady(economicsReady, inputs.monthlyDemand)

  // With fail-closed FX/customs defaults, do not even execute scenario math until
  // evidence is ready. This prevents hidden Infinity/NaN states before a scan.
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

  return <main>
    <header className="topbar"><a className="brand" href="#">Shipping<span>APP</span></a><span className="mvp-badge">MVP 1.4</span></header>
    <UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} />

    {analysis && <OpportunityDecisionPanel decision={opportunityDecision} />}
    {analysis && <ImportAnalyst key={analysis.sourceUrl} analysis={analysis} inputs={inputs} decision={opportunityDecision} onApplyScenario={setInputs} />}
    {analysis && <MarketEvidence analysis={analysis} />}
    {analysis && <FxEvidence analysis={analysis} />}
    {analysis && !expertOverride && <NcmIntelligencePanel analysis={analysis} />}

    {analysis && economicsReady && <>
      {expertOverride
        ? <div className="analysis-banner"><b>Expert Override activo.</b> El business case usa evidencia aportada manualmente: NCM {expertOverride.ncm}, derecho {expertOverride.dutyRatePct}%, precio proveedor USD {expertOverride.supplierUnitPriceUsd}, MOQ {expertOverride.moq}, peso/volumen, benchmark local y demanda {expertOverride.monthlyDemand} u./mes. El FX sigue viniendo de BCRA REF; ShippingAPP no convierte el override en validación aduanera.</div>
        : <div className="analysis-banner"><b>Opportunity screening.</b> El verdict instantáneo usa unit economics del MOQ sin inventar demanda. Cuando ingresás una hipótesis mensual —manualmente o desde AI Import Analyst— pasa a Robust Decision con stress de demanda -30% y precio P25 cuando existe. FX usa BCRA REF; la NCM/SIM y el arancel siguen siendo screening y las intervenciones/reglamentos permanecen sujetos a verificación.</div>}

      <div className="workspace">
        <aside className="inputs-column"><details className="manual-details" open><summary>Ajustar supuestos económicos</summary><label className="product-name"><span>Producto</span><input value={product} onChange={(e) => setProduct(e.target.value)} /></label><ProductPanel inputs={inputs} setInputs={setInputs} /><MarketPanel inputs={inputs} setInputs={setInputs} /><LogisticsPanel inputs={inputs} setInputs={setInputs} /><ImportPanel inputs={inputs} setInputs={setInputs} /></details></aside>
        <section className="results-column">
          {decisionReady ? <>
            <div className="sticky-results"><div className="result-heading"><span className="eyebrow">Business case estimado</span><h2>{product || 'Producto sin nombre'}</h2></div><Recommendation result={selected} capitalAvailableUsd={inputs.capitalAvailableUsd} /></div>
            <ScenarioTable rows={rows} selected={selected} />
            <RobustQuantityPanel key={`${analysis.sourceUrl}:${marketP25Ars ?? 'manual'}`} inputs={inputs} context={taxContext} marketP25Ars={marketP25Ars} />
            <section className="method-card"><h3>Cómo se calcula el score</h3><p>Margen sobre costo económico 40% · eficiencia del capital 30% · inventario 20% · capacidad de financiar el capital inicial 10% cuando el capital fue informado.</p><p>Si el capital no se informa, esa dimensión no recibe puntos gratis: se normalizan sólo las dimensiones observadas. El score mide atractivo económico, no habilitación legal ni demanda observada.</p></section>
          </> : <section className="partial-card"><span className="eyebrow">Robust Decision pendiente</span><h2>Agregá una hipótesis de demanda para optimizar cantidad.</h2><p>El Instant Screening de arriba ya evalúa unit economics y cash del MOQ. Podés escribir la demanda en “Mercado y capital” o decírsela al AI Import Analyst. ShippingAPP recién muestra “cantidad recomendada”, inventario y Robust score cuando la demanda mensual es mayor a 0.</p><p>Mercado Libre aporta publicaciones y precios de screening; no observamos ventas reales.</p></section>}
        </section>
      </div>
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {analysis && !economicsReady && <>
      <ExpertOverridePanel key={analysis.sourceUrl} analysis={analysis} onApply={handleExpertOverride} />
      <ClientChecklist value={client} onChange={setClient} /><RegulatoryPanel checks={regulatoryChecks} client={client} />
    </>}

    {!analysis && <section className="value-strip"><div><b>01</b><span>Producto</span><p>Extraemos precio, MOQ y características visibles.</p></div><div><b>02</b><span>Mercado argentino</span><p>Buscamos comparables y rango de precio local.</p></div><div><b>03</b><span>Importabilidad</span><p>NCM/SIM, landed cost y requisitos como motores internos.</p></div><div><b>04</b><span>AI Decision</span><p>Opportunity Decision + analista conversacional grounded en el mismo caso.</p></div></section>}
  </main>
}
