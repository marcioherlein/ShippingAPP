import React, { useEffect, useMemo, useState } from 'react'
import type { CustomsProfile, NcmDisambiguationData } from '../lib/customsClassification'
import { manualNcmProfile, type ManualNcmIndex } from '../lib/manualNcm'
import { composeClarificationNote, hasActionableAnswers, type DisambiguationAnswers } from '../lib/ncmDisambiguation'
import UiIcon from './UiIcon'

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
}

/**
 * Guided NCM disambiguation. The user never sees or types an NCM code: they either pick the
 * candidate position that best matches their product (resolved deterministically against the
 * nomenclador) or answer a few yes/no/no-sé questions that re-run the classifier with the added
 * facts. When a conservative estimate exists, a "continuar con el estimado" escape hatch means
 * this is never a dead-end.
 */
export default function NcmDisambiguation({ disambiguation, customs, onPickCandidate, onAnswer, onContinueEstimate, provisionalAvailable }: Props) {
  const [index, setIndex] = useState<ManualNcmIndex | null>(null)
  const [answers, setAnswers] = useState<DisambiguationAnswers>({})
  const [pickError, setPickError] = useState('')

  useEffect(() => {
    // Load the nomenclador lazily so a direct pick resolves to validated tariffs. A failure is
    // non-fatal: the questions path and the estimate escape hatch still work without it.
    const controller = new AbortController()
    fetch('/data/ncm-index.json', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json()
      if (Array.isArray(data.records) && data.meta?.sourceDate) setIndex(data)
    }).catch(() => { /* direct pick simply falls back to the estimate */ })
    return () => controller.abort()
  }, [])

  const questions = disambiguation.questions
  const actionable = useMemo(() => hasActionableAnswers(questions, answers), [questions, answers])

  const pickCandidate = (code: string) => {
    setPickError('')
    if (!index) {
      setPickError('No pude cargar el nomenclador para confirmar la posición. Podés responder las preguntas o continuar con el estimado.')
      return
    }
    try {
      onPickCandidate(manualNcmProfile(customs, index, code))
    } catch {
      setPickError('Esa posición no tiene aranceles completos para usar directamente. Respondé las preguntas para afinar la clasificación o continuá con el estimado.')
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

    <div className="ncm-disambiguation-candidates journey-choice-grid" role="group" aria-label="Posiciones candidatas">
      {disambiguation.candidates.map((candidate) => (
        <button type="button" key={candidate.code} className="ncm-disambiguation-candidate" onClick={() => pickCandidate(candidate.code)}>
          <b>{candidate.plainLabel}</b>
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
