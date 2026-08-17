import React, { useMemo, useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { emptyIntakeFacts, isAlibabaUrl, runProductIntake, type IntakeFacts } from '../lib/productIntake'
import { discoverProducts, type DiscoveryConstraints, type ProductDiscoveryResponse } from '../lib/productDiscovery'
import { checkDiscoveryConstraints } from '../lib/discoveryConstraintCheck'

type Props = {
  onAnalysis: (analysis: ProductAnalysisV2) => void
  onDiscoveryCapital?: (capitalUsd: number) => void
  analysis?: ProductAnalysisV2 | null
}
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
  'Tengo USD 10.000 de capital. Buscame paletas de pádel de carbono con MOQ bajo',
  'Quiero evaluar un cargador USB-C de 65W',
  'Buscame paletas de pádel de carbono de China, hasta USD 30, MOQ hasta 100',
]

export default function UrlAnalyzer({ onAnalysis, onDiscoveryCapital, analysis }: Props) {
  const [draft, setDraft] = useState('')
  const [facts, setFacts] = useState<IntakeFacts>(emptyIntakeFacts())
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
    setFacts(emptyIntakeFacts())
    const next = await analyzeAlibabaUrlV2(url)
    setSelectedConstraints(fromDiscovery ? constraints : null)
    onAnalysis(next)
    setDiscovery(null)
    setMessages((current) => [...current, {
      role: 'assistant',
      content: fromDiscovery
        ? 'Producto seleccionado y analizado desde su URL real de Alibaba. Ahora también verifiqué las restricciones de producto; si informaste capital, affordability se calcula abajo con landed cost.'
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
    setSelectedConstraints(null)

    try {
      if (isAlibabaUrl(value)) {
        await analyzeRealUrl(value)
        return
      }

      const result = await runProductIntake(value, facts)
      setFacts(result.facts)

      if (result.status === 'discovery_pending' && result.searchQuery) {
        setMessages((current) => [...current, { role: 'assistant', content: 'Entendí la búsqueda. Consultando Alibaba en vivo; sólo voy a mostrar productos respaldados por una URL real.' }])
        const live = await discoverProducts(result.searchQuery, value)
        setDiscovery(live)
        if (live.constraints.availableCapitalUsd !== null) onDiscoveryCapital?.(live.constraints.availableCapitalUsd)
        setMessages((current) => [...current, {
          role: 'assistant',
          content: live.status === 'live'
            ? `Encontré ${live.results.length} productos con fuente Alibaba real. Los ordené por relevancia visible; precio, MOQ y origen se verifican al abrir cada publicación${live.constraints.availableCapitalUsd !== null ? `, y tu capital de USD ${live.constraints.availableCapitalUsd.toLocaleString('en-US')} se evaluará contra landed cost` : ''}.`
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

  return <section className="url-analyzer">
    <div className="analyzer-copy">
      <span className="eyebrow">AI product opportunity scanner</span>
      <h1>Contame qué querés importar.</h1>
      <p>Podés decirme qué producto buscás, cuánto capital tenés, restricciones comerciales o pegar una publicación. Cada dato se valida en la capa correcta.</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span><p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>Consultando y estructurando el caso…</p></div>}
    </div>}

    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 1800))} placeholder="Ej: tengo USD 10.000, buscame paletas de carbono con MOQ bajo" disabled={loading} aria-label="Producto, presupuesto, búsqueda o link para analizar" />
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Analizando…' : 'Analizar'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>

    {discovery && <section className="discovery-card">
      <div className="discovery-head"><div><span className="eyebrow">Experimental live search</span><h2>Resultados Alibaba</h2><p>{discovery.note}</p></div><span className="confidence">{discovery.mode === 'browser' ? 'Browser Run' : discovery.mode === 'direct' ? 'Direct' : 'Unavailable'}</span></div>
      <div className="discovery-constraints"><b>Tu criterio</b><span>{discovery.constraintsNote}</span></div>
      {discovery.results.length > 0 ? <div className="discovery-grid">
        {discovery.results.map((item) => <article key={item.url} className="discovery-item">
          <div className="discovery-item-top"><span>ALIBABA · LIVE SOURCE</span><small className={`match-${item.titleMatch}`}>{item.titleMatch.toUpperCase()} TITLE MATCH</small></div>
          <h3>{item.title}</h3>
          {item.matchedTerms.length > 0 && <p>Match visible: {item.matchedTerms.join(' · ')}</p>}
          <p>Precio, MOQ, origen y affordability no se infieren desde esta tarjeta. Elegí el producto para pasar por la publicación y el landed-cost engine.</p>
          <div className="discovery-actions"><a href={item.url} target="_blank" rel="noreferrer">Ver fuente</a><button type="button" disabled={loading} onClick={() => void selectDiscovery(item.url)}>Analizar</button></div>
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
      {constraintChecks.length > 0 && <div className="constraint-checks"><b>Restricciones de producto · verificadas después de abrir la publicación</b><div>{constraintChecks.map((check) => <span key={`${check.id}-${check.label}`} className={`constraint-${check.status}`} title={check.detail}>{check.status.toUpperCase()} · {check.label}</span>)}</div></div>}
      {analysis.sourceRead && <div className="customs-note"><b>{analysis.sourceRead.mode.toUpperCase()}</b><span>{analysis.sourceRead.reason}</span></div>}
      {conversational && <div className="customs-note"><b>USER-SUPPLIED</b><span>Los datos comerciales provienen de la conversación y no fueron verificados contra proveedor/proforma.</span></div>}
      <div className="customs-note"><b>{classificationLabel}</b><span>{analysis.customs.source} · Revisado {analysis.customs.reviewedAt}. Intervenciones: verificar en CIVUCE/VUCE.</span></div>
      <details className="assumptions"><summary>Ver supuestos y calidad de datos</summary><ul>{analysis.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>}
  </section>
}
