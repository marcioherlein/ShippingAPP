import { describe, expect, it } from 'vitest'
import { composeClarificationNote, hasActionableAnswers } from './ncmDisambiguation'
import type { NcmDisambiguationQuestion } from './customsClassification'

const questions: NcmDisambiguationQuestion[] = [
  {
    id: 'motor',
    prompt: '¿Tiene motor eléctrico?',
    attribute: 'motor',
    options: [
      { label: 'Sí', value: 'si', note: 'El producto tiene motor eléctrico.' },
      { label: 'No', value: 'no', note: 'El producto no tiene motor.' },
      { label: 'No sé', value: 'no-se' },
    ],
  },
  {
    id: 'material',
    prompt: '¿De qué material es?',
    attribute: 'material',
    options: [
      { label: 'Plástico', value: 'plastico', note: 'Está hecho principalmente de plástico.' },
      { label: 'Metal', value: 'metal', note: 'Está hecho principalmente de metal.' },
      { label: 'No sé', value: 'no-se' },
    ],
  },
]

describe('ncmDisambiguation', () => {
  it('composes a Spanish note from answered questions, joining their option notes', () => {
    const note = composeClarificationNote(questions, { motor: 'si', material: 'metal' })
    expect(note).toBe('El producto tiene motor eléctrico. Está hecho principalmente de metal.')
  })

  it('skips no-sé and unanswered questions', () => {
    expect(composeClarificationNote(questions, { motor: 'no-se', material: 'plastico' }))
      .toBe('Está hecho principalmente de plástico.')
    expect(composeClarificationNote(questions, { motor: 'no-se' })).toBe('')
    expect(composeClarificationNote(questions, {})).toBe('')
  })

  it('hasActionableAnswers is true only when at least one answer adds a fact', () => {
    expect(hasActionableAnswers(questions, { motor: 'si' })).toBe(true)
    expect(hasActionableAnswers(questions, { motor: 'no-se', material: 'no-se' })).toBe(false)
    expect(hasActionableAnswers(questions, {})).toBe(false)
  })
})
