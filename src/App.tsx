import React, { useMemo, useState } from 'react'
import UrlAnalyzer from './components/UrlAnalyzer'
import HotProductsSection from './components/HotProductsSection'
import ImportQuoteFlow, { type JourneyQuoteSetup } from './components/ImportQuoteFlow'
import { getCachedHotProducts, hotProductToQuotePrefill, type QuotePrefill } from './lib/hotProducts'
import type { HotProduct } from './data/hotProducts'
import type { ProductAnalysisV2 } from './lib/productAnalysisV2'
import type { ImportEntityType, ImportPurpose, SensitiveProductCategory } from './lib/landedCostEngine'

type EntryIntent = 'have_product' | 'search_product' | 'discover' | null
type BudgetMode = 'budget' | 'units' | 'unknown' | null
type SignatureAnswer = 'yes' | 'no' | 'unknown'

const stepLabels = ['Objetivo', 'Tu operación', 'Presupuesto', 'Producto', 'Resultado']

function purposeLabel(value: ImportPurpose | null) {
  if (value === 'resale') return 'Reventa'
  if (value === 'own_use') return 'Uso propio'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

function entityLabel(value: ImportEntityType | null) {
  if (value === 'company') return 'Empresa'
  if (value === 'individual') return 'Persona humana'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

function signatureLabel(value: SignatureAnswer | null) {
  if (value === 'yes') return 'Sí, tengo firma/importador'
  if (value === 'no') return 'No tengo firma/importador'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

function sensitiveLabel(value: SensitiveProductCategory | null) {
  if (value === 'none') return 'No es categoría sensible'
  if (value === 'food') return 'Alimentos'
  if (value === 'toys') return 'Juguetes'
  if (value === 'cosmetics') return 'Cosméticos'
  if (value === 'medicines') return 'Medicamentos'
  if (value === 'supplements') return 'Suplementos'
  if (value === 'unknown') return 'Todavía no sé'
  return 'Pendiente'
}

export default function App() {
  const [intent, setIntent] = useState<EntryIntent>(null)
  const [step, setStep] = useState(0)
  const [purpose, setPurpose] = useState<ImportPurpose | null>(null)
  const [entityType, setEntityType] = useState<ImportEntityType | null>(null)
  const [signature, setSignature] = useState<SignatureAnswer | null>(null)
  const [sensitiveCategory, setSensitiveCategory] = useState<SensitiveProductCategory | null>(null)
  const [budgetMode, setBudgetMode] = useState<BudgetMode>(null)
  const [budgetUsd, setBudgetUsd] = useState(10000)
  const [unitsMin, setUnitsMin] = useState(50)
  const [unitsMax, setUnitsMax] = useState(200)
  const [analysis, setAnalysis] = useState<ProductAnalysisV2 | null>(null)
  const [selectedHotProduct, setSelectedHotProduct] = useState<HotProduct | null>(null)

  const hotProducts = useMemo(() => getCachedHotProducts(8), [])
  const operationAnswered = purpose !== null && entityType !== null && signature !== null && sensitiveCategory !== null
  const budgetAnswered = budgetMode !== null

  const analysisPrefill = useMemo<QuotePrefill | null>(() => {
    if (!analysis) return null
    const fx = analysis.fx?.status === 'live' && analysis.fx.arsPerUsd && analysis.fx.arsPerUsd > 0 ? analysis.fx.arsPerUsd : null
    const estimatedLocalUsd = fx && analysis.market.estimatedPriceArs ? analysis.market.estimatedPriceArs / fx : 0
    const fallbackQuantity = analysis.product.moq || analysis.suggestedQuantities[0] || 100

    return {
      productName: analysis.product.name,
      originCountry: analysis.product.originCountry || 'China',
      quantity: fallbackQuantity,
      unitPriceUsd: analysis.product.unitPriceUsd || 0,
      unitWeightKg: analysis.product.packedWeightKg || 0,
      unitVolumeCbm: analysis.product.volumeCbm || 0,
      moq: analysis.product.moq || fallbackQuantity,
      budgetUsd: budgetMode === 'budget' ? budgetUsd : 0,
      monthlyDemand: analysis.market.estimatedMonthlyDemand || 0,
      localSellPriceUsd: estimatedLocalUsd,
      sensitiveCategory: sensitiveCategory || 'unknown',
      sourceLabel: analysis.sourceUrl.startsWith('chat://') ? 'Datos aportados en conversación' : 'Producto analizado por ShippingAPP',
    }
  }, [analysis, budgetMode, budgetUsd, sensitiveCategory])

  const selectedPrefill = useMemo<QuotePrefill | null>(() => {
    if (selectedHotProduct) {
      const base = hotProductToQuotePrefill(selectedHotProduct)
      return { ...base, budgetUsd: budgetMode === 'budget' ? budgetUsd : base.budgetUsd }
    }
    return analysisPrefill
  }, [selectedHotProduct, analysisPrefill, budgetMode, budgetUsd])

  const quoteSetup = useMemo<JourneyQuoteSetup>(() => ({
    budgetUsd: budgetMode === 'budget' ? budgetUsd : 0,
    quantity: budgetMode === 'units' ? Math.max(unitsMin, Math.round((unitsMin + unitsMax) / 2)) : undefined,
    purpose: purpose || 'unknown',
    entityType: entityType || 'unknown',
    hasImporterSignature: signature || 'unknown',
    sensitiveCategory: sensitiveCategory || 'unknown',
  }), [budgetMode, budgetUsd, unitsMin, unitsMax, purpose, entityType, signature, sensitiveCategory])

  const productReady = intent === 'have_product' || Boolean(selectedPrefill)
  const resultStepActive = productReady && step >= 3
  const progressStep = resultStepActive ? 4 : step

  const chooseIntent = (next: Exclude<EntryIntent, null>) => {
    setIntent(next)
    setAnalysis(null)
    setSelectedHotProduct(null)
    setStep(1)
  }

  const handleAnalysis = (next: ProductAnalysisV2) => {
    setAnalysis(next)
    setSelectedHotProduct(null)
    setStep(4)
    window.setTimeout(() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const handleHotProductQuote = (product: HotProduct) => {
    setSelectedHotProduct(product)
    setAnalysis(null)
    setStep(4)
    window.setTimeout(() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const continueOperation = () => {
    if (operationAnswered) setStep(2)
  }

  const continueBudget = () => {
    if (budgetAnswered) setStep(3)
  }

  const resetJourney = () => {
    setIntent(null)
    setStep(0)
    setPurpose(null)
    setEntityType(null)
    setSignature(null)
    setSensitiveCategory(null)
    setBudgetMode(null)
    setAnalysis(null)
    setSelectedHotProduct(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <main className="journey-app" id="home">
    <header className="journey-topbar">
      <a className="journey-brand" href="#home"><span className="journey-brand-mark">S</span><span>Shipping<b>APP</b></span></a>
      <div className="journey-top-actions"><span className="journey-live-dot">Motor de importación activo</span><button type="button" onClick={resetJourney}>Nuevo caso</button></div>
    </header>

    <section className="journey-hero">
      <div className="journey-orb journey-orb-one" aria-hidden="true" />
      <div className="journey-orb journey-orb-two" aria-hidden="true" />
      <span className="eyebrow">AI Import Copilot</span>
      <h1>Contame qué querés importar.<br />Yo construyo el caso.</h1>
      <p>ShippingAPP te guía desde la idea o el proveedor hasta el costo final puesto en Argentina, compara flete y simula la cantidad que tiene más sentido para tu presupuesto.</p>
      <div className="journey-stepper" aria-label="Progreso de la cotización">
        {stepLabels.map((label, index) => <div className={`journey-step${index < progressStep ? ' done' : ''}${index === progressStep ? ' active' : ''}`} key={label}>
          <span>{index < progressStep ? '✓' : index + 1}</span><small>{label}</small>
        </div>)}
      </div>
    </section>

    <section className="journey-workspace">
      <div className="journey-conversation">
        <div className="journey-thread-label"><span>ShippingAPP</span><small>Tu caso se arma mientras conversamos</small></div>

        <div className="journey-bubble assistant">
          <span className="journey-avatar">S</span>
          <div><b>Primero: ¿desde dónde arrancamos?</b><p>No necesito que sepas de aduana. Elegí lo que mejor describe tu situación.</p></div>
        </div>

        {intent === null ? <div className="journey-choice-grid three">
          <button type="button" onClick={() => chooseIntent('have_product')}><span>▣</span><b>Ya tengo un producto</b><small>Tengo proveedor, precio, peso/volumen o parte de esos datos.</small></button>
          <button type="button" onClick={() => chooseIntent('search_product')}><span>⌕</span><b>Quiero buscarlo</b><small>Describilo en lenguaje natural y ShippingAPP busca opciones en Alibaba.</small></button>
          <button type="button" onClick={() => chooseIntent('discover')}><span>✦</span><b>Quiero descubrir</b><small>Buscá en Alibaba o explorá oportunidades listas para cotizar.</small></button>
        </div> : <div className="journey-bubble user"><div><b>{intent === 'have_product' ? 'Ya tengo el producto.' : intent === 'search_product' ? 'Quiero buscar un producto.' : 'Quiero explorar oportunidades.'}</b><button type="button" onClick={() => setStep(0)}>Cambiar</button></div></div>}

        {intent && <>
          <div className="journey-bubble assistant">
            <span className="journey-avatar">S</span>
            <div><b>Antes de cotizar necesito entender cómo vas a importar.</b><p>Estas respuestas pueden cambiar impuestos, gastos y requisitos. Si algo no lo sabés, marcá “No sé” y lo dejamos visible como pendiente.</p></div>
          </div>

          <section className={`journey-question-card${step === 1 ? ' active' : ''}`}>
            <div className="journey-question-head"><span>01</span><div><b>Perfil de la operación</b><small>Cuatro decisiones que afectan el costo real.</small></div>{step > 1 && <button type="button" onClick={() => setStep(1)}>Editar</button>}</div>
            {step === 1 ? <div className="journey-question-fields">
              <div><label>¿Para qué lo traés?</label><div className="journey-chip-row"><button className={purpose === 'resale' ? 'selected' : ''} onClick={() => setPurpose('resale')} type="button">Reventa</button><button className={purpose === 'own_use' ? 'selected' : ''} onClick={() => setPurpose('own_use')} type="button">Uso propio</button><button className={purpose === 'unknown' ? 'selected' : ''} onClick={() => setPurpose('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Quién importa?</label><div className="journey-chip-row"><button className={entityType === 'company' ? 'selected' : ''} onClick={() => setEntityType('company')} type="button">Empresa</button><button className={entityType === 'individual' ? 'selected' : ''} onClick={() => setEntityType('individual')} type="button">Persona</button><button className={entityType === 'unknown' ? 'selected' : ''} onClick={() => setEntityType('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Tenés firma/importador para operar?</label><div className="journey-chip-row"><button className={signature === 'yes' ? 'selected' : ''} onClick={() => setSignature('yes')} type="button">Sí</button><button className={signature === 'no' ? 'selected' : ''} onClick={() => setSignature('no')} type="button">No</button><button className={signature === 'unknown' ? 'selected' : ''} onClick={() => setSignature('unknown')} type="button">No sé</button></div></div>
              <div><label>¿Es una categoría sensible?</label><select value={sensitiveCategory || ''} onChange={(event) => setSensitiveCategory(event.target.value as SensitiveProductCategory)}><option value="" disabled>Elegir</option><option value="none">No</option><option value="food">Alimentos</option><option value="toys">Juguetes</option><option value="cosmetics">Cosméticos</option><option value="medicines">Medicamentos</option><option value="supplements">Suplementos</option><option value="unknown">No sé</option></select></div>
              <button className="journey-primary-action" type="button" disabled={!operationAnswered} onClick={continueOperation}>Seguir con presupuesto <span>→</span></button>
            </div> : <div className="journey-complete-row"><span>{purposeLabel(purpose)}</span><span>{entityLabel(entityType)}</span><span>{signatureLabel(signature)}</span><span>{sensitiveLabel(sensitiveCategory)}</span></div>}
          </section>

          {step >= 2 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div><b>Ahora definamos el tamaño posible de la operación.</b><p>USD 1.000, USD 10.000 y USD 50.000 son problemas logísticos distintos. También podés pensar en un rango de unidades o decir que todavía no lo sabés.</p></div>
            </div>
            <section className={`journey-question-card${step === 2 ? ' active' : ''}`}>
              <div className="journey-question-head"><span>02</span><div><b>Presupuesto o rango</b><small>Esto limita las cantidades que vale la pena simular.</small></div>{step > 2 && <button type="button" onClick={() => setStep(2)}>Editar</button>}</div>
              {step === 2 ? <div className="journey-question-fields">
                <div className="journey-choice-grid budget">
                  <button className={budgetMode === 'budget' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('budget')}><b>Tengo presupuesto</b><small>Quiero maximizar lo que puedo traer sin pasarme.</small></button>
                  <button className={budgetMode === 'units' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('units')}><b>Tengo rango de unidades</b><small>Sé más o menos cuántas quiero probar.</small></button>
                  <button className={budgetMode === 'unknown' ? 'selected' : ''} type="button" onClick={() => setBudgetMode('unknown')}><b>Todavía no sé</b><small>Calculame escenarios para entender el orden de magnitud.</small></button>
                </div>
                {budgetMode === 'budget' && <label className="journey-number-field"><span>Presupuesto máximo total</span><div><small>USD</small><input type="number" min="0" step="500" value={budgetUsd} onChange={(event) => setBudgetUsd(Number(event.target.value))} /></div><em>Usamos costo final estimado, no sólo compra FOB.</em></label>}
                {budgetMode === 'units' && <div className="journey-range-fields"><label><span>Desde</span><input type="number" min="1" value={unitsMin} onChange={(event) => setUnitsMin(Number(event.target.value))} /></label><label><span>Hasta</span><input type="number" min="1" value={unitsMax} onChange={(event) => setUnitsMax(Number(event.target.value))} /></label></div>}
                <button className="journey-primary-action" type="button" disabled={!budgetAnswered} onClick={continueBudget}>Seguir con el producto <span>→</span></button>
              </div> : <div className="journey-complete-row"><span>{budgetMode === 'budget' ? `Hasta USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} unidades` : 'Cantidad/presupuesto por definir'}</span></div>}
            </section>
          </>}

          {step >= 3 && <>
            <div className="journey-bubble assistant">
              <span className="journey-avatar">S</span>
              <div>
                <b>{intent === 'have_product' ? 'Perfecto. Pasame los datos del producto y calculamos.' : intent === 'search_product' ? 'Describime el producto como se lo explicarías a una persona.' : 'Buscá en Alibaba o elegí una oportunidad lista.'}</b>
                <p>{intent === 'have_product'
                  ? 'Precio, origen, peso, volumen y MOQ son suficientes para arrancar. Si algo falta, podés completar después.'
                  : intent === 'search_product'
                    ? 'Podés escribir “buscame paletas de pádel de carbono hasta USD 30 y MOQ menor a 100”, pegar un link o describir lo que necesitás.'
                    : 'Escribí cualquier producto para buscarlo en Alibaba. Si sólo querés explorar, abajo siguen disponibles oportunidades cacheadas sin iniciar una búsqueda nueva.'}</p>
              </div>
            </div>

            {intent === 'search_product' && <div className="journey-product-surface"><UrlAnalyzer onAnalysis={handleAnalysis} analysis={analysis} /></div>}

            {intent === 'discover' && <>
              <div className="journey-product-surface"><UrlAnalyzer mode="discovery" onAnalysis={handleAnalysis} analysis={analysis} /></div>
              <div className="journey-product-surface">
                <div className="journey-section-heading"><span className="eyebrow">O explorar sin buscar</span><h2>Oportunidades cacheadas</h2><p>Estos productos quedan disponibles para comparar rápido sin consumir una búsqueda nueva de Alibaba.</p></div>
                <HotProductsSection products={hotProducts} selectedId={selectedHotProduct?.id ?? null} onQuote={handleHotProductQuote} />
              </div>
            </>}

            {intent === 'have_product' && <div className="journey-manual-ready"><span>✓</span><div><b>Listo para cargar tu producto</b><p>La calculadora de abajo empieza con datos editables. Reemplazalos por los de tu proveedor.</p></div><a href="#calculator">Abrir calculadora</a></div>}
          </>}
        </>}
      </div>

      <aside className="journey-case-summary">
        <div className="journey-summary-sticky">
          <span className="eyebrow">Caso en construcción</span>
          <h2>{selectedPrefill?.productName || (intent === 'have_product' ? 'Tu producto' : 'Nueva importación')}</h2>
          <div className="journey-summary-list">
            <div><span>Objetivo</span><b>{intent === 'have_product' ? 'Cotizar producto propio' : intent === 'search_product' ? 'Buscar + cotizar' : intent === 'discover' ? 'Descubrir + cotizar' : 'Pendiente'}</b></div>
            <div><span>Uso</span><b>{purposeLabel(purpose)}</b></div>
            <div><span>Importador</span><b>{entityLabel(entityType)}</b></div>
            <div><span>Firma</span><b>{signatureLabel(signature)}</b></div>
            <div><span>Capacidad</span><b>{budgetMode === 'budget' ? `USD ${budgetUsd.toLocaleString('es-AR')}` : budgetMode === 'units' ? `${unitsMin}–${unitsMax} u.` : budgetMode === 'unknown' ? 'A definir' : 'Pendiente'}</b></div>
            <div><span>Producto</span><b>{selectedPrefill ? 'Datos cargados' : intent === 'have_product' && step >= 3 ? 'Carga manual' : 'Pendiente'}</b></div>
          </div>
          <div className="journey-summary-note"><span>La lógica</span><p>Primero definimos restricciones reales. Después comparamos cantidades y modos de flete. Así evitamos optimizar un producto para una operación que no encaja.</p></div>
        </div>
      </aside>
    </section>

    {intent === 'have_product' && step >= 3 && <section className="journey-calculator-section" id="calculator">
      <div className="journey-section-heading"><span className="eyebrow">Cálculo automático</span><h2>Completá los datos físicos y comerciales.</h2><p>ShippingAPP recalcula flete, CIF, impuestos, gastos, costo unitario y cantidad recomendada con cada cambio.</p></div>
      <ImportQuoteFlow setup={quoteSetup} />
    </section>}

    {selectedPrefill && <section className="journey-calculator-section" id="calculator">
      <div className="journey-section-heading"><span className="eyebrow">Resultado del caso</span><h2>Producto identificado. Ahora optimizamos la importación.</h2><p>Revisá los datos detectados y ajustá cualquier supuesto antes de tomar la decisión.</p></div>
      <ImportQuoteFlow key={`${selectedPrefill.productName}-${budgetMode}-${budgetUsd}-${unitsMin}-${unitsMax}`} prefill={selectedPrefill} setup={quoteSetup} />
    </section>}

    <section className="journey-output-explainer">
      <div><span>01</span><b>Producto</b><p>Proveedor o búsqueda, FOB, MOQ, peso y volumen.</p></div>
      <div><span>02</span><b>Flete</b><p>Compara aéreo, LCL y referencia FCL con peso/volumen cobrable.</p></div>
      <div><span>03</span><b>Costo puesto</b><p>CIF, derechos, tasa, IVA, percepciones y gastos de destino.</p></div>
      <div><span>04</span><b>Decisión</b><p>Escenarios de cantidad, presupuesto, costo unitario y recomendación.</p></div>
    </section>
  </main>
}