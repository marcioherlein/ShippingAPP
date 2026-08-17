import { describe, expect, it } from 'vitest'
import { conversationalAnalysis } from './enrich'
import type { IntakeResult } from './conversationalIntake'

function ready(): IntakeResult {
  return {
    status: 'ready', intent: 'analyze_product', message: 'ready', searchQuery: null,
    facts: {
      name: 'Product X', category: 'Padel racket', unitPriceUsd: 25, moq: 300,
      packedWeightKg: 0.7, volumeCbm: 0.006, originCountry: 'China', material: 'carbon', functionText: 'sport racket', description: 'complete user supplied case',
    },
    factSources: { moq: 'user', packedWeightKg: 'user', volumeCbm: 'user' },
    missingFields: [], suggestedQuantities: [300, 450, 600, 900], assumptions: [],
  }
}

describe('conversational analysis source confidence', () => {
  it('caps a fully populated but unverified user-supplied product at 65', () => {
    const analysis = conversationalAnalysis(ready())
    expect(analysis.confidence.overall).toBeLessThanOrEqual(65)
    expect(analysis.confidence.productSource).toBe('user-supplied-unverified')
    expect(analysis.assumptions.join(' ')).toContain('limitada')
  })

  it('does not upgrade benchmark logistics to verified user evidence', () => {
    const intake = ready()
    intake.factSources = { moq: 'user', packedWeightKg: 'benchmark', volumeCbm: 'benchmark' }
    const analysis = conversationalAnalysis(intake)
    expect(analysis.confidence.logistics).toBe('mixed-user-benchmark')
    expect(analysis.confidence.overall).toBeLessThan(65)
  })
})
