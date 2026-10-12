import React, { useEffect, useMemo, useState } from 'react'
import type { CustomsProfile, NcmDisambiguationData } from '../lib/customsClassification'
import { manualNcmProfile, type ManualNcmIndex } from '../lib/manualNcm'
import { composeClarificationNote, hasActionableAnswers, type DisambiguationAnswers } from '../lib/ncmDisambiguation'
import UiIcon from './UiIcon'
import { loadManualNcmIndex } from '../lib/loadManualNcmIndex'
import { readProductDraft, writeProductDraft } from '../lib/productDraft'

type Props = {
  disambiguation: NcmDisambiguationData
  customs: CustomsProfile
  // A direct pick resolves to a confirmed profile for that position (routes to onManualNcm).
  onPickCandidate: (customs: CustomsProfile) => void
  // Answers compose a plain-Spanish note fed back through the classifier refinement path.
  onAnswer: (note: string) => void
  // Decision 1 fallback: proceed with the conservative estimate instead of narrowing further.
  onContinueEstimate?: () => void
  provisionalAvailable?: boolean
  recoveryKey?: string
}

/**
 * Guided NCM disambiguation. The user reviews the code without needing to type it: they pick the
 * candidate position that best matches their product (resolved deterministically against the
 * nomenclador) or answer a few yes/no/no-sé questions that re-run the classifier with the added
 * facts. When a conservative estimate exists, a "continuar con el estimado" escape hatch means
 * this is never a dead-end.
 */
export default function NcmDisambiguation({ disambiguation, customs, onPickCandidate, onAnswer, onContinueEstimate, provisionalAvailable, recoveryKey = customs.description || '' }: Props) {
  const storageKey = `ncm-answers:${recoveryKey}`
  const [index, setIndex] = useState<ManualNcmIndex | null>(null)
  const [answers, setAnswers] = useState<DisambiguationAnswers>(() => readProductDraft<DisambiguationAnswers>(storageKey) || {})
  const [pickError, setPickError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    // Load the nomenclador lazily so a direct pick resolves to validated tariffs. A failure is
    // non-fatal: the questions path and the estimate escape hatch still work without it.
    const controller = new AbortController()
    setLoadError('')
    loadManualNcmIndex(controller.signal).then(data => {
      if (!controller.signal.aborted) setIndex(data)
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message) })
    return () => controller.abort()
  }, [retry])
  useEffect(() => { writeProductDraft(storageKey, answers) }, [storageKey, answers])

  const questions = disambiguation.questions
  const actionable = useMemo(() => hasActionableAnswers(questions, answers), [questions, answers])

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
    const note = composeClarificationNote(questions, answers)
    if (note) onAnswer(note)
  }

  return <div className="ncm-disambiguation">
    <div className="ncm-disambiguation-head">
      <span className="eyebrow">Afinemos la clasificación</span>
      <b>¿Cuál se parece más a tu producto?</b>
      <small>Elegí la descripción que mejor describe lo que vas a importar. No necesitás conocer el código: lo resolvemos nosotros.</small>
    </div>

    {!index && !loadError && <p role="status">Cargando aranceles del nomenclador para validar las opciones…</p>}
    {loadError && <div role="alert"><p>{loadError}</p><button type="button" className="pipeline-secondary" onClick={() => setRetry(value => value + 1)}>Reintentar carga del nomenclador</button></div>}
    {index && <p className="ncm-catalog-source">Fuente: {index.meta.source} · Actualización: {index.meta.sourceDate}</p>}

    <div className="ncm-disambiguation-candidates journey-choice-grid" role="group" aria-label="Posiciones candidatas">
      {disambiguation.candidates.map((candidate) => (
        <button type="button" key={candidate.code} className="ncm-disambiguation-candidate" disabled={!index} onClick={() => pickCandidate(candidate.code)}>
          <b>{candidate.plainLabel}</b>
          <small>NCM {candidate.code}</small>
          <small>Elegir esta descripción</small>
        </button>
      ))}
    </div>

    {pickError && <p className="ncm-disambiguation-error" role="alert">{pickError}</p>}

    {questions.length > 0 && <div className="ncm-disambiguation-questions">
      <small className="ncm-disambiguation-questions-intro">O respondé estas preguntas y volvemos a clasificar automáticamente:</small>
      {questions.map((question) => (
        <fieldset className="ncm-disambiguation-question" key={question.id}>
          <legend>{question.prompt}</legend>
          <div className="journey-chip-row">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.value
              return <button
                type="button"
                key={option.value}
                className={`ncm-disambiguation-chip${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.value }))}
              >{option.label}</button>
            })}
          </div>
        </fieldset>
      ))}
      <button type="button" className="journey-primary-action" disabled={!actionable} onClick={submitAnswers}>
        Volver a clasificar con mis respuestas <UiIcon name="arrow-right" size={16} />
      </button>
    </div>}

    {provisionalAvailable && onContinueEstimate && <div className="ncm-disambiguation-estimate">
      <small>¿No estás seguro? Podés seguir con un cálculo estimado y verificar la posición después.</small>
      <button type="button" className="pipeline-secondary" onClick={onContinueEstimate}>Continuar con el estimado</button>
    </div>}
  </div>
}
