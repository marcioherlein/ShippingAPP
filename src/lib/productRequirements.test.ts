import { describe, expect, it } from 'vitest'
import { buildProductRequirements } from './productRequirements'
import { customsProfileFor } from './customsClassification'

describe('NCM-driven requirements adversarial rules', () => {
  it('blocks requirements closure when classification is missing', () => {
    const customs = customsProfileFor('Power adapter', 'China', '65W USB-C charger')
    const requirements = buildProductRequirements(customs, 'China')
    expect(customs.ncmCandidate).toBeNull()
    expect(requirements).toHaveLength(1)
    expect(requirements[0].status).toBe('blocker')
  })

  it('never claims CIVUCE requirements are clear merely because NCM exists', () => {
    const customs = customsProfileFor('Padel racket', 'China', 'Carbon fiber padel racket')
    const requirements = buildProductRequirements(customs, 'China')
    expect(requirements.find((item) => item.id === 'interventions')?.status).toBe('verify')
    expect(requirements.find((item) => item.id === 'prohibitions')?.status).toBe('verify')
    expect(requirements.find((item) => item.id === 'trade-remedies')?.status).toBe('verify')
    expect(requirements.find((item) => item.id === 'technical-regulations')?.status).toBe('verify')
  })

  it('does not auto-apply origin preference for Mercosur text', () => {
    const customs = customsProfileFor('Padel racket', 'Brazil', 'Padel racket')
    const origin = buildProductRequirements(customs, 'Brazil').find((item) => item.id === 'origin')
    expect(origin?.status).toBe('verify')
    expect(origin?.title).toContain('Posible')
  })

  it('requires origin verification when origin is absent', () => {
    const customs = customsProfileFor('Padel racket', '', 'Padel racket')
    const origin = buildProductRequirements(customs, '').find((item) => item.id === 'origin')
    expect(origin?.status).toBe('verify')
    expect(origin?.title).toContain('Confirmar')
  })

  it('treats a non-preferential origin as information, not as proof of no trade measures', () => {
    const customs = customsProfileFor('Padel racket', 'China', 'Padel racket')
    const requirements = buildProductRequirements(customs, 'China')
    expect(requirements.find((item) => item.id === 'origin')?.status).toBe('info')
    expect(requirements.find((item) => item.id === 'trade-remedies')?.status).toBe('verify')
  })

  it('asks for stronger classification evidence when confidence is not high', () => {
    const customs = customsProfileFor('Racket sports equipment', 'China', 'sport racket paddle')
    const evidence = buildProductRequirements(customs, 'China').find((item) => item.id === 'classification-evidence')
    if (customs.ncmCandidate) expect(evidence?.status).toBe('verify')
  })
})
