import React, { FormEvent, useEffect, useState } from 'react'
import {
  applyAnalystScenario,
  askImportAnalyst,
  type AnalystChatMessage,
  type AnalystScenarioPatch,
} from '../lib/importAnalyst'
import { pct, usd } from '../lib/format'
import type { OpportunityDecision } from '../lib/opportunityDecision'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { Inputs } from '../lib/types'

type Props = {
  analysis: ProductAnalysisV2
  inputs: Inputs
  decision: OpportunityDecision
  onApplyScenario: (next: Inputs) => void
}

const suggestions = [
  '¿Por qué llegaste a este verdict?',
  '¿Cuál es el dato más débil del análisis?',
  '¿Qué tendría que validar antes de comprar?',
  '¿Qué pasa si vendo 20 por mes?',
  'Tengo USD 15.000. ¿Me alcanza?',
]

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function patchLabel(patch: AnalystScenarioPatch) {
  const values: string[] = []
  if (patch.monthlyDemand !== undefined) values.push(`Demanda: ${patch.monthlyDemand} u./mes`)
  if (patch.capitalAvailableUsd !== undefined) values.push(`Capital: USD ${patch.capitalAvailableUsd.toLocaleString('en-US')}`)
  return values.join(' · ')
}

function deterministicResultText(decision: OpportunityDecision) {
  const result = decision.result
  const parts = [`Nuevo resultado: ${decision.label}.`]
  if (result) {
    parts.push(`Cantidad evaluada ${result.quantity} u. por ${result.mode === 'air' ? 'aéreo' : 'marítimo'}.`)
    parts.push(`Cash requerido ${usd(result.cashRequiredUsd)} y margen ${pct(result.marginPct)}.`)
  }
  if (decision.robustCandidate) parts.push(`Robust score ${decision.robustCandidate.robustScore}/100.`)
  if (decision.warnings.length) parts.push(`Principal límite: ${decision.warnings[0]}`)
  return parts.join(' ')
}

export default function ImportAnalyst({ analysis, inputs, decision, onApplyScenario }: Props) {
  const [messages, setMessages] = useState<AnalystChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingPatch, setPendingPatch] = useState<AnalystScenarioPatch | null>(null)
  const [pendingReason, setPendingReason] = useState<string | null>(null)
  const [awaitingDeterministicResult, setAwaitingDeterministicResult] = useState<string | null>(null)

  useEffect(() => {
    if (!awaitingDeterministicResult) return
    setMessages((current) => [...current, {
      id: id(),
      role: 'assistant',
      content: `${awaitingDeterministicResult} ${deterministicResultText(decision)}`,
    }])
    setAwaitingDeterministicResult(null)
  }, [decision, awaitingDeterministicResult])

  const send = async (raw: string) => {
    const message = raw.trim()
    if (!message || loading) return

    const userMessage: AnalystChatMessage = { id: id(), role: 'user', content: message }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setError('')
    setPendingPatch(null)
    setPendingReason(null)
    setLoading(true)

    try {
      const reply = await askImportAnalyst(message, messages, analysis, inputs, decision)
      setMessages((current) => [...current, { id: id(), role: 'assistant', content: reply.answer }])
      setPendingPatch(reply.scenarioPatch)
      setPendingReason(reply.actionReason)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI Import Analyst no disponible.')
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const apply = () => {
    if (!pendingPatch) return
    const label = patchLabel(pendingPatch)
    setAwaitingDeterministicResult(`Escenario aplicado (${label}).`)
    onApplyScenario(applyAnalystScenario(inputs, pendingPatch))
    setPendingPatch(null)
    setPendingReason(null)
  }

  return <section className="analyst-card">
    <div className="analyst-head">
      <div>
        <span className="eyebrow">AI Import Analyst · MVP 1.4</span>
        <h2>Preguntale al análisis, no a un chatbot genérico.</h2>
        <p>Conoce el producto, mercado, customs screening, FX y Opportunity Decision actuales. Explica; no inventa números.</p>
      </div>
      <span className="analyst-grounded">Grounded in this scan</span>
    </div>

    {messages.length === 0 && <div className="analyst-suggestions">
      {suggestions.map((item) => <button key={item} type="button" onClick={() => void send(item)}>{item}</button>)}
    </div>}

    {messages.length > 0 && <div className="analyst-thread" aria-live="polite">
      {messages.map((message) => <div key={message.id} className={`analyst-message ${message.role}`}>
        <span>{message.role === 'user' ? 'Vos' : 'ShippingAPP'}</span>
        <p>{message.content}</p>
      </div>)}
      {loading && <div className="analyst-message assistant loading"><span>ShippingAPP</span><p>Analizando el caso…</p></div>}
    </div>}

    {pendingPatch && <div className="analyst-action">
      <div>
        <span>Escenario propuesto</span>
        <b>{patchLabel(pendingPatch)}</b>
        {pendingReason && <p>{pendingReason}</p>}
      </div>
      <button type="button" onClick={apply}>Aplicar y recalcular</button>
    </div>}

    {error && <p className="analyst-error">{error}</p>}

    <form className="analyst-form" onSubmit={submit}>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
        placeholder="Ej: Tengo USD 15.000 y creo que puedo vender 20 por mes"
        disabled={loading}
        aria-label="Pregunta para AI Import Analyst"
      />
      <button type="submit" disabled={loading || !draft.trim()}>{loading ? 'Pensando…' : 'Preguntar'}</button>
    </form>
    <p className="analyst-footnote">Para escenarios, el chat sólo puede proponer demanda y capital. Precio, FX, NCM, arancel y flete permanecen vinculados a sus fuentes/motores. Los resultados numéricos posteriores a “Aplicar” vienen del motor determinístico, no del LLM.</p>
  </section>
}
