import assert from 'node:assert/strict'
import { classifyTitleEvidenceWarning, refineTitleEvidenceWarnings, summarizeResults } from './mixed48-audit-semantics.mjs'

const camera = classifyTitleEvidenceWarning({ title: 'Cámara De Seguridad Exterior 3MP', issue: 'missing /camara/i' })
assert.equal(camera.classification, 'resolved_title_normalization')

const karcher = classifyTitleEvidenceWarning({ title: 'Hidrolavadora Kärcher K2', issue: 'missing /karcher/i' })
assert.equal(karcher.classification, 'resolved_title_normalization')

const electric = classifyTitleEvidenceWarning({ title: 'Termotanque eléctrico 80L', issue: 'missing /electr/i' })
assert.equal(electric.classification, 'resolved_title_normalization')

const toaster = classifyTitleEvidenceWarning({ title: 'Tostadora 2 rodajas 800W', issue: 'missing /2\\s*(?:ranura|pan)/i' })
assert.equal(toaster.classification, 'resolved_title_synonym')

const a16 = classifyTitleEvidenceWarning({ title: 'Samsung Galaxy A16 4GB 128G', issue: 'missing /128\\s*gb/i' })
assert.equal(a16.classification, 'unresolved_title_evidence')

const carbon = classifyTitleEvidenceWarning({ title: 'Paleta Padel Terra Vairo', issue: 'missing /carbon/i' })
assert.equal(carbon.classification, 'unresolved_title_evidence')

const refined = refineTitleEvidenceWarnings([
  { title: 'Cámara exterior', issue: 'missing /camara/i' },
  { title: 'Paleta Padel Terra', issue: 'missing /carbon/i' },
])
assert.equal(refined.resolved.length, 1)
assert.equal(refined.unresolved.length, 1)

assert.deepEqual(summarizeResults([
  { status: 'live', titleEvidencePass: true, modeCorrect: true },
  { status: 'live', titleEvidencePass: false, modeCorrect: true },
  { status: 'insufficient', titleEvidencePass: true, modeCorrect: false },
]), {
  total: 3,
  live: 2,
  liveRate: 2 / 3,
  titleEvidenceLive: 1,
  titleEvidenceLiveRate: 1 / 3,
  liveWithUnresolvedTitleEvidenceWarnings: 1,
  modeCorrect: 2,
  modeAccuracy: 2 / 3,
})

console.log('[mixed-48 semantics] 8/8 assertions PASS')
