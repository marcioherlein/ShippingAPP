import React, { useEffect, useState } from 'react'
import type { CustomsProfile, NcmDisambiguationData } from '../lib/customsClassification'
import { manualNcmProfile, type ManualNcmIndex } from '../lib/manualNcm'
import { composeClarificationNote, type DisambiguationAnswers } from '../lib/ncmDisambiguation'
import UiIcon from './UiIcon'
import { loadManualNcmIndex } from '../lib/loadManualNcmIndex'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'

type Props = {
  disambiguation: NcmDisambiguationData
  customs: CustomsProfile
  // A direct pick resolves to a confirmed profile for that position (routes to onManualNcm).
  onPickCandidate: (customs: CustomsProfile) => void
  // Answers compose a plain-Spanish note fed back through the classifier refinement path.
  onAnswer: (note: string, previousOptions?: string[]) => void
  // Decision 1 fallback: proceed with the conservative estimate instead of narrowing further.
  onContinueEstimate?: () => void
  provisionalAvailable?: boolean
  refinementExhausted?: boolean
  recoveryKey?: string
}

/**
 * Guided NCM disambiguation. The user reviews the code without needing to type it: they pick the
 * candidate position that best matches their product (resolved deterministically against the
 * nomenclador) or answer a few yes/no/no-sé questions that re-run the classifier with the added
 * facts. When a conservative estimate exists, a "continuar con el estimado" escape hatch means
 * this is never a dead-end.
 */
export default function NcmDisambiguation({ disambiguation, customs, onPickCandidate, onAnswer, onContinueEstimate, provisionalAvailable, recoveryKey = customs.description || '', refinementExhausted = false }: Props) {
  const storageKey = `ncm-answers:${recoveryKey}`
  const [index, setIndex] = useState<ManualNcmIndex | null>(null)
  const [answers, setAnswers] = useState<DisambiguationAnswers>(() => readProductDraft<DisambiguationAnswers>(storageKey + ':precise') || {})
  const [submitted, setSubmitted] = useState<DisambiguationAnswers>(() => readProductDraft<DisambiguationAnswers>(storageKey + ':submitted') || {})
  const [facts, setFacts] = useState<DisambiguationAnswers>(() => readProductDraft<DisambiguationAnswers>(storageKey + ':facts') || {})
  const [completed, setCompleted] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [pickError, setPickError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    // Load the nomenclador lazily so a direct pick resolves to validated tariffs. A failure is
    // non-fatal: the questions path and the estimate escape hatch still work without it.
    if (!disambiguation.candidates.length) return
    const controller = new AbortController()
    setLoadError('')
    loadManualNcmIndex(controller.signal).then(data => {
      if (!controller.signal.aborted) setIndex(data)
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message) })
    return () => controller.abort()
  }, [retry, disambiguation.candidates.length])
  useEffect(() => { writeProductDraft(storageKey + ':precise', answers) }, [storageKey, answers])

  const questions = disambiguation.questions
  const identity = (question: typeof questions[number]) => JSON.stringify([question.id, question.prompt, question.options])
  const remaining = questions.filter(question => !submitted[identity(question)] || editing === identity(question))
  const current = remaining.find(question => !completed.includes(identity(question)))
  const roundAnswers = Object.fromEntries(remaining.map(question => [question.id, answers[identity(question)]]))
  const note = composeClarificationNote(remaining, roundAnswers)
  useEffect(() => { writeProductDraft(storageKey + ':submitted', submitted) }, [storageKey, submitted])
  useEffect(() => { writeProductDraft(storageKey + ':facts', facts) }, [storageKey, facts])
  useEffect(() => {
    const field = document.querySelector<HTMLElement>('.ncm-disambiguation-question')
    field?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    field?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
  }, [current?.id, current?.prompt])

  const pickCandidate = (code: string) => {
    setPickError('')
    if (!index) {
      setPickError('Todavía no pude validar esa posición. Reintentá la carga del nomenclador o respondé las preguntas.')
      return
    }
    try {
      onPickCandidate(manualNcmProfile(customs, index, code))
    } catch {
      setPickError('Esa posición no tiene aranceles completos para usar directamente. Respondé las preguntas o buscá una posición en el nomenclador.')
    }
  }

  const submitAnswers = () => {
    if (!note || refinementExhausted || current) return
    const next = { ...submitted }
    for (const question of remaining) next[identity(question)] = answers[identity(question)]
    const previousOptions = remaining.flatMap(question => [facts[question.attribute], ...question.options.map(option => option.note)].filter((value): value is string => !!value))
    const nextFacts = { ...facts }
    for (const question of remaining) {
      const fact = question.options.find(option => option.value === answers[identity(question)])?.note
      if (fact) nextFacts[question.attribute] = fact
    }
    // The parent may unmount this panel in the same batch when processing begins.
    // Persist before notifying it; effects from this render are not guaranteed to run.
    writeProductDraft(storageKey + ':submitted', next)
    writeProductDraft(storageKey + ':facts', nextFacts)
    setFacts(nextFacts); setSubmitted(next); setEditing(null); setCompleted([])
    onAnswer(note, previousOptions)
  }

  return <div className="ncm-disambiguation">
    <div className="ncm-disambiguation-head">
      <span className="eyebrow">Validá un detalle del producto</span>
      <small>Respondé con lo que confirma la ficha del proveedor. Si no figura, elegí «No sé».</small>
    </div>

    {refinementExhausted ? <p role="status">Ya completamos las dos rondas de aclaración. Conservamos tus respuestas; podés validar la posición en el nomenclador.</p> : current ? <fieldset className="ncm-disambiguation-question" key={identity(current)}>
      <legend>{current.prompt}</legend>
      <div className="journey-chip-row">{current.options.map(option => <button type="button" key={option.value} className={`ncm-disambiguation-chip${answers[identity(current)] === option.value ? ' is-selected' : ''}`} aria-pressed={answers[identity(current)] === option.value} onClick={() => setAnswers(value => ({ ...value, [identity(current)]: option.value }))}>{option.label}</button>)}</div>
      <button type="button" className="journey-primary-action" disabled={!answers[identity(current)]} onClick={() => { setCompleted(value => [...value, identity(current)]) }}>Continuar</button>
    </fieldset> : remaining.length > 0 ? <div className="ncm-disambiguation-questions">
      <p>{note ? 'Tus respuestas están listas para validar la clasificación.' : 'No agregaste un dato confirmado. Podés consultar la ficha al proveedor o validar una posición en el nomenclador.'}</p>
      {!!note && <button type="button" className="journey-primary-action" onClick={submitAnswers}>Volver a clasificar con mis respuestas <UiIcon name="arrow-right" size={16} /></button>}
    </div> : questions.length > 0 ? <p role="status">Estas preguntas ya están respondidas. Conservamos tus respuestas; si falta otro dato, podés consultar al proveedor o validar la posición en el nomenclador.</p> : null}

    {questions.some(question => answers[identity(question)]) && <details><summary>Revisar mis respuestas</summary>{questions.filter(question => answers[identity(question)]).map(question => <div key={identity(question)}><p>{question.prompt}</p><b>{question.options.find(option => option.value === answers[identity(question)])?.label}</b>{!refinementExhausted && <button type="button" className="pipeline-secondary" onClick={() => { setEditing(identity(question)); setCompleted(value => value.filter(key => key !== identity(question))) }}>Cambiar respuesta</button>}</div>)}</details>}

    {disambiguation.candidates.length > 0 && <details><summary>Ver posiciones posibles</summary>
      <p>Revisá la descripción completa antes de elegir; una coincidencia de nombre no confirma la clasificación.</p>
      {!index && !loadError && <p role="status">Cargando aranceles del nomenclador para validar las opciones…</p>}
      {loadError && <div role="alert"><p>{loadError}</p><button type="button" className="pipeline-secondary" onClick={() => setRetry(value => value + 1)}>Reintentar carga del nomenclador</button></div>}
      {index && <p className="ncm-catalog-source">Fuente: {index.meta.source} · Actualización: {index.meta.sourceDate}</p>}
      <div className="ncm-disambiguation-candidates journey-choice-grid" role="group" aria-label="Posiciones candidatas">{disambiguation.candidates.map(candidate => <button type="button" key={candidate.code} className="ncm-disambiguation-candidate" disabled={!index} onClick={() => pickCandidate(candidate.code)}><b>{candidate.plainLabel}</b><small>NCM {candidate.code}</small><small>Elegir esta descripción</small></button>)}</div>
      {pickError && <p className="ncm-disambiguation-error" role="alert">{pickError}</p>}
    </details>}

    {provisionalAvailable && onContinueEstimate && <div className="ncm-disambiguation-estimate">
      <small>¿No estás seguro? Podés seguir con un cálculo estimado y verificar la posición después.</small>
      <button type="button" className="pipeline-secondary" onClick={onContinueEstimate}>Continuar con el estimado</button>
    </div>}
  </div>
}
