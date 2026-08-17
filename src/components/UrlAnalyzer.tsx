import React, { useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { emptyIntakeFacts, isAlibabaUrl, runProductIntake, type IntakeFacts } from '../lib/productIntake'
import { discoverProducts, type ProductDiscoveryResponse } from '../lib/productDiscovery'

type Props = { onAnalysis: (analysis: ProductAnalysisV2) => void; analysis?: ProductAnalysisV2 | null }
type ThreadMessage = { role: 'user' | 'assistant'; content: string }

function readLabel(analysis: ProductAnalysisV2) {
  if (analysis.sourceUrl.startsWith('chat://')) return 'Datos aportados en conversación'
  const mode = analysis.sourceRead?.mode
  if (mode === 'direct') return 'Alibaba · lectura directa'
  if (mode === 'browser') return 'Alibaba · Browser Run'
  if (mode === 'partial') return 'Alibaba · lectura parcial'
  if (mode === 'blocked') return 'Alibaba · bloqueado'
  return analysis.fetched ? 'Fuente leída' : 'Fuente no disponible'
}

const starters = [
  'Paleta de pádel carbono, China, USD 25,50',
  'Quiero evaluar un cargador USB-C de 65W',
  'Buscame paletas de pádel de carbono con MOQ bajo',
]

export default function UrlAnalyzer({ onAnalysis, analysis }: Props) {
  const [draft, setDraft] = useState('')
  const [facts, setFacts] = useState<IntakeFacts>(emptyIntakeFacts())
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [discovery, setDiscovery] = useState<ProductDiscoveryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analyzeRealUrl = async (url: string, fromDiscovery = false) => {
    setFacts(emptyIntakeFacts())
    const next = await analyzeAlibabaUrlV2(url)
    onAnalysis(next)
    setDiscovery(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: fromDiscovery
        ? 'Producto seleccionado y analizado desde su URL real de Alibaba. Ya podés revisar Opportunity Decision, mercado e importabilidad.'
        : 'Link analizado. Ya podés revisar Opportunity Decision, mercado, importabilidad y preguntarle al AI Import Analyst.',
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

    try {
      if (isAlibabaUrl(value)) {
        await analyzeRealUrl(value)
        return
      }

      const result = await runProductIntake(value, facts)
      setFacts(result.facts)

      if (result.status === 'discovery_pending' && result.searchQuery) {
        setMessages((current) => [...current, { role: 'assistant', content: 'Entendí la búsqueda. Consultando Alibaba en vivo; sólo voy a mostrar productos respaldados por una URL real.' }])
        const live = await discoverProducts(result.searchQuery)
        setDiscovery(live)
        setMessages((current) => [...current, {
          role: 'assistant',
          content: live.status === 'live'
            ? `Encontré ${live.results.length} productos con fuente Alibaba real. Elegí uno para correr el análisis completo.`
            : live.note,
        }])
        return
      }

      setMessages((current) => [...current, { role: 'assistant', content: result.message }])
      if (result.analysis) onAnalysis(result.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar ese producto.')
    } finally {
      setLoading(false)
    }
  }

  const selectDiscovery = async (url: string) => {
    if (loading) return
    setLoading(true)
    setError('')
    try { await analyzeRealUrl(url, true) }
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

  return <section className="url-analyzer">
    <div className="analyzer-copy">
      <span className="eyebrow">AI product opportunity scanner</span>
      <h1>Contame qué querés importar.</h1>
      <p>Describí un producto, pedime que busque opciones o pegá Alibaba. ShippingAPP usa fuentes reales y pregunta sólo lo que falta.</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>Consultando y estructurando el caso…</p></div>}
    </div>}

    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1800))}
          placeholder="Ej: buscame paletas de pádel de carbono — o pegá un link de Alibaba"
          disabled={loading}
          aria-label="Producto, búsqueda o link para analizar"
        />
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Analizando…' : 'Analizar'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>

    {discovery && <section className="discovery-card">
      <div className="discovery-head">
        <div><span className="eyebrow">Experimental live search</span><h2>Resultados Alibaba</h2><p>{discovery.note}</p></div>
        <span className="confidence">{discovery.mode === 'browser' ? 'Browser Run' : discovery.mode === 'direct' ? 'Direct' : 'Unavailable'}</span>
      </div>
      {discovery.results.length > 0 ? <div className="discovery-grid">
        {discovery.results.map((item) => <article key={item.url} className="discovery-item">
          <span>ALIBABA · LIVE SOURCE</span>
          <h3>{item.title}</h3>
          <p>Precio, MOQ y proveedor se validan recién al abrir esta publicación; no se infieren desde el resultado de búsqueda.</p>
          <div className="discovery-actions">
            <a href={item.url} target="_blank" rel="noreferrer">Ver fuente</a>
            <button type="button" disabled={loading} onClick={() => void selectDiscovery(item.url)}>Analizar</button>
          </div>
        </article>)}
      </div> : <div className="customs-note"><b>NO RESULTS</b><span>No mostramos productos sintéticos. Podés reformular la búsqueda o pegar una publicación concreta.</span></div>}
      {discovery.browserAttempted && <p className="assumption-note">Browser Run: {discovery.browserMsUsed ? `${(discovery.browserMsUsed / 1000).toFixed(1)}s` : 'intentado'}. Se utiliza sólo cuando la lectura directa no expone suficientes URLs de producto.</p>}
    </section>}

    {analysis && !loading && <div className="extraction-card">
      <div className="extraction-top"><div><span className="eyebrow">Producto detectado</span><h2>{analysis.product.name}</h2><p>{analysis.product.category}{analysis.product.originCountry ? ` · ${analysis.product.originCountry}` : ''}</p></div><span className="confidence">{analysis.confidence.overall}% confidence</span></div>
      <div className="fact-grid">
        <div><span>Precio proveedor</span><b>{analysis.product.unitPriceUsd ? `USD ${analysis.product.unitPriceUsd.toFixed(2)}` : 'No verificado'}</b></div>
        <div><span>MOQ</span><b>{analysis.product.moq ? `${analysis.product.moq} u.` : 'No verificado'}</b></div>
        <div><span>NCM candidato</span><b>{analysis.customs.ncmCandidate || 'Pendiente'}</b></div>
        <div><span>Derecho candidato</span><b>{dutyLabel}</b></div>
        <div><span>Fuente del producto</span><b>{readLabel(analysis)}</b></div>
        <div><span>Browser Run</span><b>{conversational ? 'No aplica' : analysis.sourceRead?.browserAttempted ? `${analysis.sourceRead.browserMsUsed ? `${(analysis.sourceRead.browserMsUsed / 1000).toFixed(1)}s` : 'intentado'}` : 'No necesario'}</b></div>
      </div>
      {analysis.sourceRead && <div className="customs-note"><b>{analysis.sourceRead.mode.toUpperCase()}</b><span>{analysis.sourceRead.reason}</span></div>}
      {conversational && <div className="customs-note"><b>USER-SUPPLIED</b><span>Los datos comerciales provienen de la conversación y no fueron verificados contra proveedor/proforma.</span></div>}
      <div className="customs-note"><b>{classificationLabel}</b><span>{analysis.customs.source} · Revisado {analysis.customs.reviewedAt}. Intervenciones: verificar en CIVUCE/VUCE.</span></div>
      <details className="assumptions"><summary>Ver supuestos y calidad de datos</summary><ul>{analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>}
  </section>
}
