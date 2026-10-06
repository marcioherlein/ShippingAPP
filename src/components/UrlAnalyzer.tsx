import React, { useEffect, useMemo, useRef, useState } from 'react'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'
import { ingestAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import { isAlibabaUrl } from '../lib/productIntake'
import { discoverProducts, type DiscoveryConstraints, type ProductDiscoveryResponse } from '../lib/productDiscovery'
import { checkDiscoveryConstraints } from '../lib/discoveryConstraintCheck'
import { buildDiscoveryQuery, isGenericAlibabaSearchRequest } from '../lib/searchIntent'
import { translateProductLabel } from '../lib/productTranslation'
import UiIcon from './UiIcon'

type Props = {
  onAnalysis: (analysis: ProductAnalysisV2) => void
  onManualFallback?: (sourceUrl?: string) => void
  analysis?: ProductAnalysisV2 | null
  mode?: 'intake' | 'discovery'
  deferCalculation?: boolean
}

type SearchDraft = { draft?: string; lastSearch?: string; discovery?: ProductDiscoveryResponse | null; messages?: ThreadMessage[]; selectedConstraints?: DiscoveryConstraints | null; pendingAuth?: boolean }

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
  return value && value > 0 ? `${value.toFixed(2)} · moneda a confirmar` : null
}

function units(value?: number | null) {
  return value && value > 0 ? `${value} u.` : null
}

export default function UrlAnalyzer({ onAnalysis, onManualFallback, analysis, mode = 'intake', deferCalculation = false }: Props) {
  const [savedSearch] = useState(() => readProductDraft<SearchDraft>('search'))
  const [draft, setDraft] = useState(() => typeof savedSearch?.draft === 'string' ? savedSearch.draft.slice(0, 1800) : '')
  const [lastSearch, setLastSearch] = useState(() => typeof savedSearch?.lastSearch === 'string' ? savedSearch.lastSearch.slice(0, 1800) : '')
  const [messages, setMessages] = useState<ThreadMessage[]>(savedSearch?.messages || [])
  const [discovery, setDiscovery] = useState<ProductDiscoveryResponse | null>(savedSearch?.discovery || null)
  const [selectedConstraints, setSelectedConstraints] = useState<DiscoveryConstraints | null>(savedSearch?.selectedConstraints || null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'search' | 'extract'>('idle')
  const pendingAuth = useRef(savedSearch?.pendingAuth || false)
  const [error, setError] = useState('')
  const [failedSourceUrl, setFailedSourceUrl] = useState<string | null>(null)

  useEffect(() => { writeProductDraft('search', { draft, lastSearch, discovery, messages: messages.slice(-12), selectedConstraints, pendingAuth: pendingAuth.current }) }, [draft, lastSearch, discovery, messages, selectedConstraints])

  const constraintChecks = useMemo(
    () => analysis && selectedConstraints ? checkDiscoveryConstraints(analysis, selectedConstraints) : [],
    [analysis, selectedConstraints],
  )

  const analyzeRealUrl = async (url: string, fromDiscovery = false, constraints: DiscoveryConstraints | null = null) => {
    setPhase('extract')
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
    setPhase('search')
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
    setLastSearch(value)
    setDraft(value)
    // Save before the request can open sign-in or navigate away. Restoring text
    // must never automatically repeat a metered search.
    writeProductDraft('search', { draft: value, lastSearch: value, discovery, messages, selectedConstraints, pendingAuth: pendingAuth.current })
    setLoading(true)
    setError('')
    setFailedSourceUrl(null)
    // Keep prior results until a new successful response replaces them.

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
      const message = err instanceof Error ? err.message : 'No pude completar la búsqueda en este momento.'
      pendingAuth.current = /Ingresá a tu cuenta|validar tu sesión/.test(message)
      writeProductDraft('search', { draft: value, lastSearch: value, discovery, messages, selectedConstraints, pendingAuth: pendingAuth.current })
      setError(message)
    } finally {
      setLoading(false)
      setPhase('idle')
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
      setPhase('idle')
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void submitValue(draft)
  }

  // Resume a metered search after sign-in. A signed-out metered search makes
  // apiClient dispatch `shippingapp:auth-required`; ClerkShell then dispatches
  // `shippingapp:auth-resolved` once the user is signed in. Only that explicit
  // event re-runs the search — plain text restore never repeats it on its own.
  const submitValueRef = useRef(submitValue)
  submitValueRef.current = submitValue
  useEffect(() => {
    const onAuthResolved = () => {
      const pending = readProductDraft<SearchDraft>('search')
      const query = pending?.lastSearch?.trim()
      if (!pending?.pendingAuth || !query) return
      pendingAuth.current = false
      writeProductDraft('search', { ...pending, pendingAuth: false })
      void submitValueRef.current(query)
    }
    window.addEventListener('shippingapp:auth-resolved', onAuthResolved)
    return () => window.removeEventListener('shippingapp:auth-resolved', onAuthResolved)
  }, [])

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
        <span>{message.role === 'user' ? 'Vos' : 'GlobalShipping'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>GlobalShipping</span><p>{phase === 'extract' ? 'Leyendo los datos de la publicación…' : 'Buscando proveedores y publicaciones…'}</p><div className="search-loading-bar" role="progressbar" aria-label="Buscando productos"><span /></div></div>}
    </div>}

    {loading && <p className="search-operation-state" role="status">{phase === 'extract' ? '2. Extracción del producto' : '1. Búsqueda de proveedor'} · límite de 30 segundos. La clasificación NCM empieza después de tu confirmación.</p>}
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

    {!loading && lastSearch && (error || (discovery && discovery.results.length === 0)) && <div className="search-recovery">
      <p>Podés continuar sin esperar la búsqueda automática.</p>
      <a href={`https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(buildDiscoveryQuery(lastSearch))}`} target="_blank" rel="noopener noreferrer">Buscar directamente en Alibaba</a>
      <button type="button" onClick={() => onAnalysis(createManualProductAnalysis('manual://product', isAlibabaUrl(lastSearch) ? '' : lastSearch))}>Completar la ficha manualmente</button>
      <button type="button" onClick={() => void submitValue(lastSearch)}>Reintentar búsqueda</button>
    </div>}
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

    {analysis && !loading && (() => {
      const productLabel = analysis.product.name ? translateProductLabel(analysis.product.name) : null
      const showSpanish = Boolean(productLabel?.fromEnglish && productLabel.translated)
      return <div className="extraction-card">
      <div className="extraction-top">
        <div>
          <span className="eyebrow">Producto seleccionado</span>
          <h2>{analysis.product.name || 'Necesito que me digas qué producto es'}</h2>
          {showSpanish && <p className="extraction-translation" title="Traducción para orientarte; el nombre original del proveedor se mantiene arriba.">En español: {productLabel!.text}</p>}
          <p>{readLabel(analysis)}{analysis.product.originCountry ? ` · ${analysis.product.originCountry}` : ''}</p>
        </div>
        {analysis.confidence.overall > 0 && <span className="confidence">{analysis.confidence.overall}% detectado</span>}
      </div>
      <div className="fact-grid">
        {analysis.product.unitPriceUsd && analysis.product.unitPriceUsd > 0 ? <div><span>{analysis.product.supplierQuote ? 'FOB unitario confirmado' : 'Precio proveedor detectado'}</span><b>{analysis.product.supplierQuote ? `USD ${analysis.product.unitPriceUsd.toFixed(2)} por unidad` : `${analysis.product.unitPriceUsd.toFixed(2)} · ${analysis.product.supplierEvidence?.currency || 'moneda a confirmar'}`}</b>{analysis.product.supplierQuote && <small>Oferta original en {analysis.product.supplierQuote.currency} · {analysis.product.supplierQuote.basis === 'pack' ? 'por lote' : 'por unidad'} · {analysis.product.supplierQuote.variant}{analysis.product.supplierQuote.currency !== 'USD' && ` · Conversión: ${analysis.product.supplierQuote.usdPerCurrency} USD por ${analysis.product.supplierQuote.currency} · ${analysis.product.supplierQuote.fxSource} · ${analysis.product.supplierQuote.fxDate}`}</small>}</div> : null}
        {analysis.product.moq && analysis.product.moq > 0 ? <div><span>MOQ</span><b>{analysis.product.moq} u.</b></div> : null}
        {analysis.product.packedWeightKg && analysis.product.packedWeightKg > 0 ? <div><span>Peso unitario</span><b>{analysis.product.packedWeightKg} kg</b></div> : null}
        {analysis.product.volumeCbm && analysis.product.volumeCbm > 0 ? <div><span>Volumen unitario</span><b>{analysis.product.volumeCbm} m³</b></div> : null}
      </div>
      <p className="assumption-note">Siguiente paso: revisá lo detectado abajo. La app sólo te va a pedir los campos imprescindibles que falten.</p>
      {constraintChecks.length > 0 && <div className="constraint-checks">{constraintChecks.map((check) => {
        const tone = check.status === 'pass' ? 'is-pass' : check.status === 'fail' ? 'is-fail' : 'is-warn'
        const text = check.status === 'pass' ? 'OK' : check.status === 'fail' ? 'No cumple' : 'Falta verificar'
        return <span key={check.id} className={`ds-status-pill ${tone}`} title={check.detail}><UiIcon name={check.status === 'pass' ? 'check' : 'warning'} size={14} />{text} · {check.label}</span>
      })}</div>}
    </div>
    })()}
  </section>
}
