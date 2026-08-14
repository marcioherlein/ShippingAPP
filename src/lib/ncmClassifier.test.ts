import { describe, expect, it } from 'vitest'
import { classifyNcm } from './ncmClassifier'
import { isCatalogCode } from './ncmCatalog'

describe('NCM intelligence adversarial rules', () => {
  it('classifies a padel racket to the non-tennis similar-racket subheading', () => {
    const result = classifyNcm({ name: 'Carbon Fiber Padel Racket', category: 'Padel racket' })
    expect(result.status).toBe('candidate')
    expect(result.top?.code).toBe('9506.59.00')
    expect(result.top?.simOpening?.code).toBe('9506.59.00.900Z')
  })

  it('does not classify a padel racket as a tennis racket', () => {
    const result = classifyNcm({ name: 'Professional padel racket', category: 'Padel racket' })
    expect(result.top?.code).not.toBe('9506.51.00')
  })

  it('uses the specific tennis-racket subheading for tennis', () => {
    const result = classifyNcm({ name: 'Graphite tennis racket', category: 'Tennis racket' })
    expect(result.top?.code).toBe('9506.51.00')
  })

  it('does not force a tennis SIM material opening when composition wording is insufficient', () => {
    const result = classifyNcm({ name: 'Carbon fiber tennis racket', category: 'Tennis racket' })
    expect(result.top?.code).toBe('9506.51.00')
    expect(result.top?.simOpening).toBeNull()
  })

  it('resolves badminton and squash to their specific official SIM openings', () => {
    expect(classifyNcm({ name: 'Badminton racket', category: 'Badminton racket' }).top?.simOpening?.code).toBe('9506.59.00.100F')
    expect(classifyNcm({ name: 'Squash racket', category: 'Squash racket' }).top?.simOpening?.code).toBe('9506.59.00.200L')
  })

  it('keeps table tennis out of the similar-racket residual', () => {
    const result = classifyNcm({ name: 'Table tennis ping pong paddle', category: 'Table tennis equipment' })
    expect(result.top?.code).toBe('9506.40.00')
    expect(result.top?.simOpening?.code).toBe('9506.40.00.200P')
  })

  it('does not force an unrelated product into chapter 95 pilot coverage', () => {
    const result = classifyNcm({ name: 'USB-C 65W power adapter', category: 'Power adapter' })
    expect(result.status).toBe('missing')
    expect(result.top).toBeNull()
  })

  it('never returns a candidate code outside the loaded catalog', () => {
    const cases = [
      { name: 'padel paddle', category: 'Padel racket' },
      { name: 'tennis racquet', category: 'Tennis racket' },
      { name: 'fitness training equipment', category: 'Gym equipment' },
    ]
    for (const facts of cases) {
      const result = classifyNcm(facts)
      if (result.top) expect(isCatalogCode(result.top.code)).toBe(true)
      result.alternatives.forEach((candidate) => expect(isCatalogCode(candidate.code)).toBe(true))
    }
  })

  it('does not let origin country change tariff classification', () => {
    const china = classifyNcm({ name: 'padel racket China', category: 'Padel racket' })
    const brazil = classifyNcm({ name: 'padel racket Brazil', category: 'Padel racket' })
    expect(china.top?.code).toBe(brazil.top?.code)
  })

  it('returns alternatives rather than pretending the top candidate is the only possibility', () => {
    const result = classifyNcm({ name: 'sport racket paddle', category: 'Racket sports equipment' })
    expect(result.status).toBe('candidate')
    expect(result.confidence).toBe('low')
    expect(result.alternatives.length).toBeGreaterThan(0)
  })

  it('does not invent a SIM opening for an ambiguous racket', () => {
    const result = classifyNcm({ name: 'sport racket paddle', category: 'Racket sports equipment' })
    expect(result.top?.simOpening).toBeNull()
  })

  it('flags missing functional facts on ambiguous products', () => {
    const result = classifyNcm({ name: 'Sports equipment', category: 'Sports equipment' })
    if (result.status === 'candidate') expect(result.missingFacts.length).toBeGreaterThan(0)
    else expect(result.status).toBe('missing')
  })

  it('does not infer an NCM when there are no useful facts', () => {
    const result = classifyNcm({})
    expect(result.status).toBe('missing')
    expect(result.missingFacts).toContain('Identidad o categoría del producto')
  })
})
