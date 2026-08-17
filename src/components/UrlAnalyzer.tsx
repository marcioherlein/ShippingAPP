import React, { useState } from 'react'
import { analyzeAlibabaUrlV2, type ProductAnalysisV2 } from '../lib/productAnalysisV2'
import { emptyIntakeFacts, isAlibabaUrl, runProductIntake, type IntakeFacts } from '../lib/productIntake'

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
  'Buscame productos para importar con USD 10.000',
]

export default function UrlAnalyzer({ onAnalysis, analysis }: Props) {
  const [draft, setDraft] = useState('')
  const [facts, setFacts] = useState<IntakeFacts>(emptyIntakeFacts())
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submitValue = async (raw: string) => {
    const value = raw.trim()
    if (!value || loading) return
    setMessages((current) => [...current, { role: 'user', content: value }])
    setDraft('')
    setLoading(true)
    setError('')

    try {
      if (isAlibabaUrl(value)) {
        setFacts(emptyIntakeFacts())
        const next = await analyzeAlibabaUrlV2(value)
        onAnalysis(next)
        setMessages((current) => [...current, { role: 'assistant', content: 'Link analizado. Ya podés revisar Opportunity Decision, mercado, importabilidad y preguntarle al AI Import Analyst.' }])
        return
      }

      const result = await runProductIntake(value, facts)
      setFacts(result.facts)
      setMessages((current) => [...current, { role: 'assistant', content: result.message }])
      if (result.analysis) onAnalysis(result.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar ese producto.')
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

  return <section className="url-analyzer">
    <div className="analyzer-copy">
      <span className="eyebrow">AI product opportunity scanner</span>
      <h1>Contame qué querés importar.</h1>
      <p>Pegá Alibaba o describí el producto. ShippingAPP pregunta sólo lo que falta y pasa el caso por mercado argentino, FX, NCM/SIM y economics.</p>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions intake-suggestions">
      {starters.map((item) => <button key={item} type="button" onClick={() => void submitValue(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="intake-thread" aria-live="polite">
      {messages.slice(-6).map((message, index) => <div key={`${index}-${message.content}`} className={`intake-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="intake-message assistant"><span>ShippingAPP</span><p>Estructurando el caso…</p></div>}
    </div>}

    <form className="url-form" onSubmit={submit}>
      <div className="url-input-wrap">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1800))}
          placeholder="Ej: paleta de pádel carbono, USD 25.50, MOQ 300 — o pegá un link de Alibaba"
          disabled={loading}
          aria-label="Producto o link para analizar"
        />
        <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Analizando…' : 'Analizar'}</button>
      </div>
      {error && <p className="analyzer-error">{error}</p>}
    </form>

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
