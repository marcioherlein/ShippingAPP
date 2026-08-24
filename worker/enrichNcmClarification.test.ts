import { describe, expect, it } from 'vitest'
import { validFacts } from './enrich'

describe('NCM clarification evidence plumbing', () => {
  it('feeds confirmed answers into functionText for deterministic retrieval fallback', () => {
    const answers = [{
      question: '¿El cable viene provisto de conectores?',
      answer: 'El cable viene provisto de conectores en ambos extremos.',
      factKey: 'construction',
    }]
    const facts = validFacts({
      name: 'USB-C cable',
      category: 'USB cable',
      functionText: 'insulated electric conductor',
      description: 'charging cable',
    }, answers)

    expect(facts?.functionText).toContain('insulated electric conductor')
    expect(facts?.functionText).toContain('provisto de conectores en ambos extremos')
    expect(facts?.description).toContain('provisto de conectores en ambos extremos')
  })

  it('caps clarification evidence to three rounds upstream and preserves the base function', () => {
    const facts = validFacts({
      name: 'battery pack',
      functionText: 'rechargeable accumulator',
    }, [
      { question: 'Q1', answer: 'A1', factKey: 'material' },
      { question: 'Q2', answer: 'A2', factKey: 'construction' },
      { question: 'Q3', answer: 'A3', factKey: 'electrical_type' },
    ])
    expect(facts?.functionText).toContain('rechargeable accumulator')
    expect(facts?.functionText).toContain('A1')
    expect(facts?.functionText).toContain('A3')
  })
})
