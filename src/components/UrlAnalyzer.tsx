import React, { useMemo, useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { emptyIntakeFacts, isAlibabaUrl, runProductIntake, type IntakeFacts } from '../lib/productIntake'
import { discoverProducts, type DiscoveryConstraints, type ProductDiscoveryResponse } from '../lib/productDiscovery'
import { checkDiscoveryConstraints } from '../lib/discoveryConstraintCheck'
import { buildDiscoveryQuery, isGenericAlibabaSearchRequest, wantsAlibabaDiscovery } from '../lib/searchIntent'

type Props = {
  onAnalysis: (analysis: ProductAnalysisV2) => void
  analysis?: ProductAnalysisV2 | null
  mode?: 'intake' | 'discovery'
  deferCalculation?: boolean
}
type ThreadMessage = { role: 'user' | 'assistant'; content: string }

function readLabel(analysis: ProductAnalysisV2) {
  if (analysis.sourceUrl.startsWith('chat://')) return 'Datos aportados en conversación'
  const mode = analysis.sourceRead?.mode
  if (mode === 'parsebot') return 'Alibaba · Parse.bot'
  if (mode === 'direct') return 'Alibaba · lectura directa'
  if (mode === 'browser') return 'Alibaba · Browser Run'
  if (mode === 'partial') return 'Alibaba · lectura parcial'
  if (mode === 'blocked') return 'Alibaba · bloqueado'
  return analysis.fetched ? 'Fuente leída' : 'Fuente no disponible'
}

const intakeStarters = [
  'Paleta de pádel carbono, China, USD 25,50',
  'Quiero evaluar un cargador USB-C de 65W',
  'Buscame paletas de pádel de carbono de China, hasta USD 30, MOQ hasta 100',
]

const discoveryStarters = [
  'Paletas de pádel de carbono',
  'Cargadores USB-C 65W',
  'Botellas térmicas de acero inoxidable',
]

function money(value?: number | null) {
  return value ? `USD ${value.toFixed(2)}` : 'Precio pendiente'
}

function units(value?: number | null) {
  return value ? `${value} u.` : 'MOQ pendiente'
}

export default function UrlAnalyzer({ onAnalysis, analysis, mode = 'intake', deferCalculation = false }: Props) {
  const [draft, setDraft] = useState('')
  const [facts, setFacts] = useState<IntakeFacts>(emptyIntakeFacts())
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [discovery, setDiscovery] = useState<ProductDiscoveryResponse | null>(null)
  const [selectedConstraints, setSelectedConstraints] = useState<DiscoveryConstraints | null>(null)
  const [pendingDiscovery, setPendingDiscovery] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const discoveryOnly = mode === 'discovery'
  const starters = discoveryOnly ? discoveryStarters : intakeStarters

  const constraintChecks = useMemo(
    () => analysis && selectedConstraints ? checkDiscoveryConstraints(analysis, selectedConstraints) : [],
    [analysis, selectedConstraints],
  )

  const analyzeRealUrl = async (url: string, fromDiscovery = false, constraints: DiscoveryConstraints | null = null) => {
    setPendingDiscovery(false)
    setFacts(emptyIntakeFacts())
    const next = await analyzeAlibabaUrlV2(url)
    setSelectedConstraints(fromDiscovery ? constraints : null)
    onAnalysis(next)
    setDiscovery(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: fromDiscovery
        ? 'Producto seleccionado. Terminé la ingesta de la publicación y validé los datos comerciales visibles. Confirmalos abajo antes de iniciar el cálculo.'
        : 'Producto ingerido. Revisá los datos y confirmalos antes de iniciar clasificación, aranceles y costos.',
    }])
  }

  const runDiscoverySearch = async (query: string, userText: string) => {
    setPendingDiscovery(false)
    setFacts(emptyIntakeFacts())
    setMessages((current) => [...current, { role: 'assistant', content: 'Buscando en Alibaba. Voy a mostrar candidatos reales con precio, MOQ y proveedor cuando estén disponibles.' }])
    const live = await discoverProducts(query, userText)
    setDiscovery(live)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: live.status === 'live'
        ? `Encontré ${live.results.length} candidatos desde Alibaba. Elegí uno y hago la ingesta profunda de la publicación antes de calcular.`
        : live.note,
    }])
  }

  const submitValue = async (raw: string) => {
    const value = raw.trim()
    if (!value || loading) return
    setMessages((current) => [...current, { role: 'user', content: value }])
    setDraft('')
    setLoading(true)
    setError('')
    setDiscovery(null)
    setSelectedConstraints(null)

    try {
      if (isAlibabaUrl(value)) {
        await analyzeRealUrl(value)
        return
      }

      const discoveryIntent = discoveryOnly || pendingDiscovery || wantsAlibabaDiscovery(value)
      if (discoveryIntent) {
        const query = buildDiscoveryQuery(value)
        if (!query || isGenericAlibabaSearchRequest(value)) {
          setPendingDiscovery(true)
          setMessages((current) => [...current, { role: 'assistant', content: 'Decime qué producto querés que busque en Alibaba. Podés agregar precio máximo o MOQ objetivo.' }])
          return
        }
        await runDiscoverySearch(query, value)
        return
      }

      const result = await runProductIntake(value, facts)
      setFacts(result.facts)

      if (result.status === 'discovery_pending' && result.searchQuery) {
        await runDiscoverySearch(result.searchQuery, value)
        return
      }

      setMessages((current) => [...current, { role: 'assistant', content: result.message }])
      if (result.analysis) {
        setPendingDiscovery(false)
        onAnalysis(result.analysis)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar ese producto.')
    } finally {
      setLoading(false)
    }
  }

  const selectDiscovery = async (url: string) => {
    if (loading || !discovery) return
    setLoading(true)
    setError('')
    try { await analyzeRealUrl(url, true, discovery.constraints) }
    catch (err) { setError(err instanceof Error ? err.message : 'No pudimos analizar el producto seleccionado.') }
    finally { setLoading(false) }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void submitValue(draft)
  }

  const classificationLabel = !analysis?.customs.ncmCandidate
    ? 'Clasificación pendiente'
    : analysis.customs.dutyRateStatus === 'candidate'
      ? 'Clasificación para screening'
      : 'NCM candidata · economics bloqueado'

  const dutyLabel = analysis?.customs.dutyRatePct !== null && analysis?.customs.dutyRatePct !== undefined
    ? `${analysis.customs.dutyRatePct}%`
    : analysis?.customs.classificationConfidence === 'low'
      ? 'Retenido · LOW confidence'
      : 'Pendiente'

  const conversational = !!analysis?.sourceUrl.startsWith('chat://')

  return <section className={`url-analyzer${discoveryOnly ? ' discovery-search-mode' : ''}`}>
    <div className="analyzer-copy">
      <span className="eyebrow">{discoveryOnly ? 'Alibaba live search' : 'AI product opportunity scanner'}</span>
      <h1>{discoveryOnly ? 'Buscá cualquier producto en Alibaba.' : 'Contame qué querés importar.'}</h1>
      <p>{discoveryOnly
        ? 'Escribí el producto en lenguaje natural. ShippingAPP consulta Alibaba, muestra candidatos reales y te deja elegir uno para cotizar.'
        : 'Describí un producto, pedime que busque opciones o pegá Alibaba. ShippingAPP usa fuentes reales y pregunta sólo lo que falta.'}</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>{discoveryOnly ? 'Buscando y leyendo productos reales en Alibaba…' : 'Consultando y estructurando el caso…'}</p></div>}
    </div>}

    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1800))}
          placeholder={discoveryOnly ? 'Ej: paletas de pádel carbono hasta USD 30, MOQ menor a 100' : 'Ej: buscame paletas de carbono hasta USD 30, MOQ hasta 100 — o pegá Alibaba'}
          disabled={loading}
          aria-label={discoveryOnly ? 'Buscar productos en Alibaba' : 'Producto, búsqueda o link para analizar'}
        />
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Buscando…' : discoveryOnly ? 'Buscar en Alibaba' : 'Analizar'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>

    {discovery && <section className="discovery-card">
      <div className="discovery-head">
        <div><span className="eyebrow">Opportunity Finder</span><h2>Resultados Alibaba</h2><p>{discovery.note}</p></div>
        <span className="confidence">{discovery.mode === 'parsebot' ? 'Parse.bot' : discovery.mode === 'browser' ? 'Browser Run' : discovery.mode === 'direct' ? 'Direct' : 'Unavailable'}</span>
      </div>
      <div className="discovery-constraints"><b>Tu criterio</b><span>{discovery.constraintsNote}</span></div>
      {discovery.results.length > 0 ? <div className="discovery-grid">
        {discovery.results.map((item) => <article key={item.url} className="discovery-item">
          <div className="discovery-item-top"><span>ALIBABA · {item.source === 'parsebot_search_products' ? 'PARSE.BOT' : 'LIVE SOURCE'}</span><small>{item.opportunityScore ? `${item.opportunityScore}/100` : `${(item.titleMatch || 'partial').toUpperCase()} MATCH`}</small></div>
          {item.imageUrl && <img className="discovery-thumb" src={item.imageUrl} alt="" loading="lazy" />}
          <h3>{item.title}</h3>
          <div className="opportunity-facts">
            <span><b>{money(item.unitPriceUsd)}</b><small>{item.priceDisplay || 'supplier price'}</small></span>
            <span><b>{units(item.moq)}</b><small>minimum order</small></span>
            <span><b>{item.supplierName || 'Proveedor pendiente'}</b><small>{item.supplierYears || 'supplier'}</small></span>
            <span><b>{item.volumeCbm ? `${item.volumeCbm} m³` : 'Volumen pendiente'}</b><small>{item.packedWeightKg ? `${item.packedWeightKg} kg` : 'peso pendiente'}</small></span>
          </div>
          {(item.supplierBadges?.length || item.sellingPoints?.length) ? <p>Señales: {[...(item.sellingPoints || []), ...(item.supplierBadges || [])].slice(0, 5).join(' · ')}</p> : null}
          {item.missingFacts?.length ? <p>Falta validar: {item.missingFacts.join(' · ')}. Abrí el producto para análisis profundo.</p> : <p>Datos comerciales principales presentes desde búsqueda. Igual conviene abrirlo para validar specs/logística.</p>}
          <div className="discovery-actions">
            <a href={item.url} target="_blank" rel="noreferrer">Ver en Alibaba</a>
            <button type="button" disabled={loading} onClick={() => void selectDiscovery(item.url)}>{deferCalculation ? 'Elegir producto' : 'Elegir y cotizar'}</button>
          </div>
        </article>)}
      </div> : <div className="customs-note"><b>NO RESULTS</b><span>No mostramos productos sintéticos. Podés reformular la búsqueda o pegar una publicación concreta.</span></div>}
      {discovery.creditsEstimated !== undefined && <p className="assumption-note">Costo estimado Parse.bot: {discovery.creditsEstimated} créditos para la búsqueda. El análisis profundo consume créditos adicionales por producto seleccionado.</p>}
      {discovery.browserAttempted && <p className="assumption-note">Browser Run: {discovery.browserMsUsed ? `${(discovery.browserMsUsed / 1000).toFixed(1)}s` : 'intentado'}. Se utiliza sólo cuando la lectura directa no expone suficientes URLs de producto.</p>}
    </section>}

    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top"><div><span className="eyebrow">Ingesta de producto</span><h2>{analysis.product.name}</h2><p>{analysis.product.category}{analysis.product.originCountry ? ` · ${analysis.product.originCountry}` : ''}</p></div><span className="confidence">{analysis.confidence.overall}% datos</span></div>
      <div className="fact-grid">
        <div><span>Precio proveedor</span><b>{analysis.product.unitPriceUsd ? `USD ${analysis.product.unitPriceUsd.toFixed(2)}` : 'No verificado'}</b></div>
        <div><span>MOQ</span><b>{analysis.product.moq ? `${analysis.product.moq} u.` : 'No verificado'}</b></div>
        {deferCalculation ? <>
          <div><span>Peso unitario</span><b>{analysis.product.packedWeightKg ? `${analysis.product.packedWeightKg} kg` : 'No verificado'}</b></div>
          <div><span>Volumen unitario</span><b>{analysis.product.volumeCbm ? `${analysis.product.volumeCbm} m³` : 'No verificado'}</b></div>
        </> : <>
          <div><span>NCM candidato</span><b>{analysis.customs.ncmCandidate || 'Pendiente'}</b></div>
          <div><span>Derecho candidato</span><b>{dutyLabel}</b></div>
        </>}
        <div><span>Fuente del producto</span><b>{readLabel(analysis)}</b></div>
        <div><span>Browser Run</span><b>{conversational ? 'No aplica' : analysis.sourceRead?.browserAttempted ? `${analysis.sourceRead.browserMsUsed ? `${(analysis.sourceRead.browserMsUsed / 1000).toFixed(1)}s` : 'intentado'}` : 'No necesario'}</b></div>
      </div>
      {constraintChecks.length > 0 && <div className="constraint-checks">
        <b>Restricciones de tu búsqueda · verificadas después de abrir la publicación</b>
        <div>{constraintChecks.map((check) => <span key={check.id} className={`constraint-${check.status}`} title={check.detail}>{check.status.toUpperCase()} · {check.label}</span>)}</div>
      </div>}
      {analysis.sourceRead && <div className="customs-note"><b>{analysis.sourceRead.mode.toUpperCase()}</b><span>{analysis.sourceRead.reason}</span></div>}
      {conversational && <div className="customs-note"><b>USER-SUPPLIED</b><span>Los datos comerciales provienen de la conversación y no fueron verificados contra proveedor/proforma.</span></div>}
      {deferCalculation
        ? <div className="customs-note"><b>INGESTA COMPLETA</b><span>Confirmá el producto en el siguiente paso. La clasificación NCM y los aranceles se validan en el pipeline de cálculo.</span></div>
        : <div className="customs-note"><b>{classificationLabel}</b><span>{analysis.customs.source} · Revisado {analysis.customs.reviewedAt}. Intervenciones: verificar en CIVUCE/VUCE.</span></div>}
      <details className="assumptions"><summary>Ver supuestos y calidad de datos</summary><ul>{analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>}
  </section>
}
