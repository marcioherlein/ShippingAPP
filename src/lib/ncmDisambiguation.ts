import type { NcmDisambiguationQuestion } from './customsClassification'

/**
 * Pure helpers that turn the user's yes/no/no-sé disambiguation answers into a plain-Spanish
 * clarification note. The note feeds the EXISTING `applyClassificationClarification` →
 * `/api/ncm-classify` refinement path, so the user never sees or types an NCM code — they just
 * answer questions about their product and the classifier re-runs with the added facts.
 */

export type DisambiguationAnswers = Record<string, string>

/**
 * Compose a Spanish clarification from answered questions. 'no-se' (and unanswered) questions
 * assert nothing and are skipped. Returns '' when no answer adds a fact — the caller should
 * then keep the free-text fallback or a direct candidate pick.
 */
export function composeClarificationNote(
  questions: NcmDisambiguationQuestion[],
  answers: DisambiguationAnswers,
): string {
  const notes: string[] = []
  for (const question of questions) {
    const value = answers[question.id]
    if (!value || value === 'no-se') continue
    const option = question.options.find((candidate) => candidate.value === value)
    if (option?.note) notes.push(option.note)
  }
  return notes.join(' ')
}

/** True when at least one answered question contributes a usable fact (not all no-sé/empty). */
export function hasActionableAnswers(
  questions: NcmDisambiguationQuestion[],
  answers: DisambiguationAnswers,
): boolean {
  return composeClarificationNote(questions, answers).length > 0
}
