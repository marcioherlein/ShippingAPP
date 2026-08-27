import React, { useMemo, useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { isAlibabaUrl } from '../lib/productIntake'
import { discoverProducts, type DiscoveryConstraints, type ProductDiscoveryResponse } from '../lib/productDiscovery'
import { checkDiscoveryConstraints } from '../lib/discoveryConstraintCheck'
import { buildDiscoveryQuery, isGenericAlibabaSearchRequest } from '../lib/searchIntent'

type Props = {
  onAnalysis: (analysis: ProductAnalysisV2) => void
  analysis?: ProductAnalysisV2 | null
  mode?: 'intake' | 'discovery'
  deferCalculation?: boolean
}

type ThreadMessage = { role: 'user' | 'assistant'; content: string }

const starters = [
  'Paletas de pádel de carbono',
  'Raquetas de tenis profesionales',
  'Cargadores USB-C 65W',
  'Botellas térmicas de acero inoxidable',
]

function readLabel(analysis: ProductAnalysisV2) {
  if (analysis.sourceUrl.startsWith('chat://')) return 'Datos aportados en conversación'
  const mode = analysis.sourceRead?.mode
  if (mode === 'parsebot') return 'Alibaba · datos estructurados'
  if (mode === 'direct') return 'Alibaba · lectura directa'
  if (mode === 'browser') return 'Alibaba · Browser Run'
  if (mode === 'partial') return 'Alibaba · lectura parcial'
  if (mode === 'blocked') return 'Alibaba · bloqueado'
  return analysis.fetched ? 'Fuente leída' : 'Fuente no disponible'
}

function money(value?: number | null) {
  return value ? `USD ${value.toFixed(2)}` : 'Precio pendiente'
}

function units(value?: number | null) {
  return value ? `${value} u.` : 'MOQ pendiente'
}

export default function UrlAnalyzer({ onAnalysis, analysis, mode = 'intake', deferCalculation = false }: Props) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [discovery, setDiscovery] = useState<ProductDiscoveryResponse | null>(null)
  const [selectedConstraints, setSelectedConstraints] = useState<DiscoveryConstraints | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const constraintChecks = useMemo(
    () => analysis && selectedConstraints ? checkDiscoveryConstraints(analysis, selectedConstraints) : [],
    [analysis, selectedConstraints],
  )

  const analyzeRealUrl = async (url: string, fromDiscovery = false, constraints: DiscoveryConstraints | null = null) => {
    const next = await analyzeAlibabaUrlV2(url)
    setSelectedConstraints(fromDiscovery ? constraints : null)
    onAnalysis(next)
    setDiscovery(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: fromDiscovery
        ? 'Producto seleccionado. Leí la publicación y completé los datos visibles. Confirmalos abajo antes de iniciar el cálculo.'
        : 'Producto ingerido desde Alibaba. Revisá los datos y confirmalos antes de iniciar clasificación, aranceles y costos.',
    }])
  }

  const runDiscoverySearch = async (query: string, userText: string) => {
    setMessages((current) => [...current, {
      role: 'assistant',
      content: 'Buscando en Alibaba. Si una fuente no responde, ShippingAPP prueba automáticamente una alternativa.',
    }])
    const live = await discoverProducts(query, userText)
    setDiscovery(live)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: live.status === 'live'
        ? `Encontré ${live.results.length} candidatos reales. Elegí uno y abro su publicación para validar precio, MOQ y logística antes de cotizar.`
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

      const query = buildDiscoveryQuery(value)
      if (!query || isGenericAlibabaSearchRequest(value)) {
        setMessages((current) => [...current, {
          role: 'assistant',
          content: 'Decime qué producto querés buscar. Podés agregar precio máximo, MOQ, material u otra condición.',
        }])
        return
      }

      // This component is the product finder. Any non-URL product text means
      // "search Alibaba" regardless of whether the entry card was Buscar or Descubrir.
      await runDiscoverySearch(query, value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos buscar ese producto en este momento.')
    } finally {
      setLoading(false)
    }
  }

  const selectDiscovery = async (url: string) => {
    if (loading || !discovery) return
    setLoading(true)
    setError('')
    try {
      await analyzeRealUrl(url, true, discovery.constraints)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos analizar el producto seleccionado.')
    } finally {
      setLoading(false)
    }
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
  const modeClass = mode === 'discovery' ? ' discovery-search-mode' : ' search-first-mode'

  return <section className={`url-analyzer${modeClass}`}>
    <div className="analyzer-copy">
      <span className="eyebrow">Alibaba live search</span>
      <h1>Buscá cualquier producto en Alibaba.</h1>
      <p>Escribí lo que querés en lenguaje natural. ShippingAPP busca candidatos reales, absorbe fallas de fuente cuando puede y te deja elegir una publicación para cotizar.</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>Buscando y leyendo productos reales en Alibaba…</p></div>}
    </div>}

    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 1800))}
          placeholder="Ej: raqueta de tenis profesional hasta USD 30, MOQ menor a 100"
          disabled={loading}
          aria-label="Buscar productos en Alibaba"
        />
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Buscando…' : 'Buscar en Alibaba'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>

    {discovery && <section className="discovery-card">
      <div className="discovery-head">
        <div><span className="eyebrow">Opportunity Finder</span><h2>Resultados Alibaba</h2><p>{discovery.note}</p></div>
        <span className="confidence">{discovery.mode === 'parsebot' ? 'Structured' : discovery.mode === 'browser' ? 'Browser' : discovery.mode === 'direct' ? 'Direct' : 'Unavailable'}</span>
      </div>
      <div className="discovery-constraints"><b>Tu criterio</b><span>{discovery.constraintsNote}</span></div>

      {discovery.results.length > 0 ? <div className="discovery-grid">
        {discovery.results.map((item) => <article key={item.url} className="discovery-item">
          <div className="discovery-item-top">
            <span>ALIBABA · {item.source === 'parsebot_search_products' ? 'STRUCTURED DATA' : 'LIVE SOURCE'}</span>
            <small>{item.opportunityScore ? `${item.opportunityScore}/100` : `${(item.titleMatch || 'partial').toUpperCase()} MATCH`}</small>
          </div>
          {item.imageUrl && <img className="discovery-thumb" src={item.imageUrl} alt="" loading="lazy" />}
          <h3>{item.title}</h3>
          <div className="opportunity-facts">
            <span><b>{money(item.unitPriceUsd)}</b><small>{item.priceDisplay || 'supplier price'}</small></span>
            <span><b>{units(item.moq)}</b><small>minimum order</small></span>
            <span><b>{item.supplierName || 'Proveedor pendiente'}</b><small>{item.supplierYears || 'supplier'}</small></span>
            <span><b>{item.volumeCbm ? `${item.volumeCbm} m³` : 'Volumen pendiente'}</b><small>{item.packedWeightKg ? `${item.packedWeightKg} kg` : 'peso pendiente'}</small></span>
          </div>
          {(item.supplierBadges?.length || item.sellingPoints?.length) ? <p>Señales: {[...(item.sellingPoints || []), ...(item.supplierBadges || [])].slice(0, 5).join(' · ')}</p> : null}
          {item.missingFacts?.length
            ? <p>Falta validar: {item.missingFacts.join(' · ')}. Abrí el producto para análisis profundo.</p>
            : <p>Datos comerciales principales presentes desde búsqueda. Igual abrimos la publicación para validar specs y logística.</p>}
          <div className="discovery-actions">
            <a href={item.url} target="_blank" rel="noreferrer">Ver en Alibaba</a>
            <button type="button" disabled={loading} onClick={() => void selectDiscovery(item.url)}>{deferCalculation ? 'Elegir producto' : 'Elegir y cotizar'}</button>
          </div>
        </article>)}
      </div> : <div className="customs-note"><b>NO RESULTS</b><span>No mostramos productos sintéticos. Podés reformular la búsqueda o pegar una publicación concreta.</span></div>}

      {discovery.creditsEstimated !== undefined && discovery.creditsEstimated > 0 && <p className="assumption-note">Costo estimado de búsqueda estructurada: {discovery.creditsEstimated} créditos. El análisis profundo puede consumir créditos adicionales por producto seleccionado.</p>}
      {discovery.browserAttempted && <p className="assumption-note">Fuente alternativa con navegador: {discovery.browserMsUsed ? `${(discovery.browserMsUsed / 1000).toFixed(1)}s` : 'intentada'}. Se usa sólo cuando las fuentes anteriores no entregan suficientes URLs reales.</p>}
    </section>}

    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top">
        <div><span className="eyebrow">Ingesta de producto</span><h2>{analysis.product.name}</h2><p>{analysis.product.category}{analysis.product.originCountry ? ` · ${analysis.product.originCountry}` : ''}</p></div>
        <span className="confidence">{analysis.confidence.overall}% datos</span>
      </div>
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
