import React, { useMemo, useState } from 'react'
import { ingestAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { isAlibabaUrl } from '../lib/productIntake'
import { discoverProducts, type DiscoveryConstraints, type ProductDiscoveryResponse } from '../lib/productDiscovery'
import { checkDiscoveryConstraints } from '../lib/discoveryConstraintCheck'
import { buildDiscoveryQuery, isGenericAlibabaSearchRequest } from '../lib/searchIntent'

type Props = {
  onAnalysis: (analysis: ProductAnalysisV2) => void
  onManualFallback?: (sourceUrl?: string) => void
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
  if (analysis.sourceUrl.startsWith('manual://')) return 'Carga manual'
  const mode = analysis.sourceRead?.mode
  if (mode === 'parsebot') return 'Alibaba · datos estructurados'
  if (mode === 'direct') return 'Alibaba · lectura directa'
  if (mode === 'browser') return 'Alibaba · Browser Run'
  if (mode === 'partial') return 'Alibaba · lectura parcial'
  if (mode === 'blocked') return 'Alibaba · bloqueado'
  return analysis.fetched ? 'Fuente leída' : 'Fuente no disponible'
}

function money(value?: number | null) {
  return value && value > 0 ? `USD ${value.toFixed(2)}` : null
}

function units(value?: number | null) {
  return value && value > 0 ? `${value} u.` : null
}

export default function UrlAnalyzer({ onAnalysis, onManualFallback, analysis, mode = 'intake', deferCalculation = false }: Props) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [discovery, setDiscovery] = useState<ProductDiscoveryResponse | null>(null)
  const [selectedConstraints, setSelectedConstraints] = useState<DiscoveryConstraints | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [failedSourceUrl, setFailedSourceUrl] = useState<string | null>(null)

  const constraintChecks = useMemo(
    () => analysis && selectedConstraints ? checkDiscoveryConstraints(analysis, selectedConstraints) : [],
    [analysis, selectedConstraints],
  )

  const analyzeRealUrl = async (url: string, fromDiscovery = false, constraints: DiscoveryConstraints | null = null) => {
    const next = await ingestAlibabaUrlV2(url)
    setSelectedConstraints(fromDiscovery ? constraints : null)
    setFailedSourceUrl(null)
    onAnalysis(next)
    setDiscovery(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: fromDiscovery
        ? 'Producto seleccionado. Validé la publicación real. Abajo vas a completar solamente los datos que no pude confirmar.'
        : 'Producto leído. Abajo vas a revisar lo detectado y completar únicamente lo que falte.',
    }])
  }

  const runDiscoverySearch = async (query: string, userText: string) => {
    setFailedSourceUrl(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: 'Buscando publicaciones reales en Alibaba…',
    }])
    const live = await discoverProducts(query, userText)
    setDiscovery(live)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: live.status === 'live'
        ? live.results.length > 0
          ? `Encontré ${live.results.length} opciones reales. Elegí una y sigo con esa publicación.`
          : 'La búsqueda respondió pero no encontró publicaciones útiles. Probá describiendo el producto con más detalle.'
        : 'No pude obtener resultados reales ahora. Podés reformular la búsqueda o pegar directamente un link de Alibaba.',
    }])
  }

  const submitValue = async (raw: string) => {
    const value = raw.trim()
    if (!value || loading) return

    setMessages((current) => [...current, { role: 'user', content: value }])
    setDraft('')
    setLoading(true)
    setError('')
    setFailedSourceUrl(null)
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
          content: 'Decime qué producto querés buscar. Ejemplo: “paleta de pádel de carbono, hasta USD 30, MOQ menor a 100”.',
        }])
        return
      }

      await runDiscoverySearch(query, value)
    } catch (err) {
      if (isAlibabaUrl(value)) setFailedSourceUrl(value)
      setError(err instanceof Error ? err.message : 'No pude completar la búsqueda en este momento.')
    } finally {
      setLoading(false)
    }
  }

  const selectDiscovery = async (url: string) => {
    if (loading || !discovery) return
    setLoading(true)
    setError('')
    setFailedSourceUrl(null)
    try {
      await analyzeRealUrl(url, true, discovery.constraints)
    } catch (err) {
      setFailedSourceUrl(url)
      setError(err instanceof Error ? err.message : 'No pude analizar la publicación seleccionada.')
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void submitValue(draft)
  }

  const modeClass = mode === 'discovery' ? ' discovery-search-mode' : ' search-first-mode'

  return <section className={`url-analyzer${modeClass}`}>
    <div className="analyzer-copy">
      <span className="eyebrow">Búsqueda real en Alibaba</span>
      <h1>Buscá un producto o pegá un link.</h1>
      <p>La app muestra sólo publicaciones reales. Si un dato no está disponible, no lo rellena con “pendiente”: te lo pide después únicamente si es necesario para calcular.</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>Estoy consultando Alibaba y validando las publicaciones encontradas…</p></div>}
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
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Buscando…' : 'Buscar'}</button>
      </div>
      <small>También podés pegar directamente una URL de producto de Alibaba.</small>
      {error && <div className="analyzer-error manual-fallback-error" role="alert">
        <span>{error}</span>
        {failedSourceUrl && onManualFallback && <button type="button" onClick={() => onManualFallback(failedSourceUrl)}>Cargar este producto manualmente</button>}
      </div>}
    </form>

    {discovery && <section className="discovery-card">
      <div className="discovery-head">
        <div><span className="eyebrow">Resultados reales</span><h2>{discovery.results.length > 0 ? 'Elegí una publicación' : 'No encontré una publicación útil'}</h2><p>{discovery.note}</p></div>
        {discovery.results.length > 0 && <span className="confidence">{discovery.results.length} resultado{discovery.results.length === 1 ? '' : 's'}</span>}
      </div>
      {discovery.constraintsNote && <div className="discovery-constraints"><b>Tu búsqueda</b><span>{discovery.constraintsNote}</span></div>}

      {discovery.results.length > 0 ? <div className="discovery-grid">
        {discovery.results.map((item) => {
          const price = money(item.unitPriceUsd)
          const moq = units(item.moq)
          const missing = item.missingFacts?.filter(Boolean) ?? []
          return <article key={item.url} className="discovery-item">
            <div className="discovery-item-top">
              <span>ALIBABA · PUBLICACIÓN REAL</span>
              {item.opportunityScore ? <small>{item.opportunityScore}/100</small> : null}
            </div>
            {item.imageUrl && <img className="discovery-thumb" src={item.imageUrl} alt="" loading="lazy" />}
            <h3>{item.title}</h3>
            <div className="opportunity-facts">
              {price && <span><b>{price}</b><small>{item.priceDisplay || 'precio proveedor'}</small></span>}
              {moq && <span><b>{moq}</b><small>pedido mínimo</small></span>}
              {item.supplierName && <span><b>{item.supplierName}</b><small>{item.supplierYears || 'proveedor'}</small></span>}
              {item.packedWeightKg && item.packedWeightKg > 0 && <span><b>{item.packedWeightKg} kg</b><small>peso detectado</small></span>}
              {item.volumeCbm && item.volumeCbm > 0 && <span><b>{item.volumeCbm} m³</b><small>volumen detectado</small></span>}
            </div>
            {missing.length > 0 && <p><b>Después de elegirlo voy a necesitar confirmar:</b> {missing.join(' · ')}.</p>}
            <div className="discovery-actions">
              <a href={item.url} target="_blank" rel="noreferrer">Ver publicación</a>
              <button type="button" disabled={loading} onClick={() => void selectDiscovery(item.url)}>{deferCalculation ? 'Usar este producto' : 'Usar y cotizar'}</button>
            </div>
          </article>
        })}
      </div> : <div className="customs-note"><b>Sin resultados utilizables</b><span>Probá con nombre + material + uso, o pegá directamente una publicación de Alibaba.</span></div>}
    </section>}

    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top">
        <div><span className="eyebrow">Producto seleccionado</span><h2>{analysis.product.name || 'Necesito que me digas qué producto es'}</h2><p>{readLabel(analysis)}{analysis.product.originCountry ? ` · ${analysis.product.originCountry}` : ''}</p></div>
        {analysis.confidence.overall > 0 && <span className="confidence">{analysis.confidence.overall}% detectado</span>}
      </div>
      <div className="fact-grid">
        {analysis.product.unitPriceUsd && analysis.product.unitPriceUsd > 0 ? <div><span>Precio proveedor</span><b>USD {analysis.product.unitPriceUsd.toFixed(2)}</b></div> : null}
        {analysis.product.moq && analysis.product.moq > 0 ? <div><span>MOQ</span><b>{analysis.product.moq} u.</b></div> : null}
        {analysis.product.packedWeightKg && analysis.product.packedWeightKg > 0 ? <div><span>Peso unitario</span><b>{analysis.product.packedWeightKg} kg</b></div> : null}
        {analysis.product.volumeCbm && analysis.product.volumeCbm > 0 ? <div><span>Volumen unitario</span><b>{analysis.product.volumeCbm} m³</b></div> : null}
      </div>
      <p className="assumption-note">Siguiente paso: revisá lo detectado abajo. La app sólo te va a pedir los campos imprescindibles que falten.</p>
      {constraintChecks.length > 0 && <div className="constraint-checks">{constraintChecks.map((check) => <span key={check.id} className={check.status === 'pass' ? 'score-pill' : 'score-pill warning-pill'} title={check.detail}>{check.status === 'pass' ? 'OK' : check.status === 'fail' ? 'No cumple' : 'Falta verificar'} · {check.label}</span>)}</div>}
    </div>}
  </section>
}
