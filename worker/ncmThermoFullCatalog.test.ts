import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { classifyFullNcm, retrieveNcmCandidates, type NcmSearchIndex } from './ncmRetrieval'
import { deriveSemanticConcepts } from './semanticConcepts'

// Production asset, including competing raw-material/parts/machinery families.
const index = JSON.parse(readFileSync('public/data/ncm-index.json', 'utf8')) as NcmSearchIndex
const unavailable = { run: vi.fn(async () => { throw new Error('AI unavailable') }) }
const ordinary = { name: 'Termo Stanley', material: 'Acero inoxidable', functionText: 'Para mantener el agua caliente y tomar mate' }

describe('reported thermo failure against the complete official catalog', () => {
  it.each([
    { name: 'Termo Stanley' }, ordinary,
    { name: 'Vaso Stanley Quencher', material: 'Acero inoxidable', description: 'doble pared' },
    { name: 'Travel tumbler', description: 'thermal insulation, double wall', functionText: 'For drinking coffee' },
  ])('asks the decisive construction question without displaying arbitrary candidates: $name', async facts => {
    unavailable.run.mockClear()
    const result = await classifyFullNcm(index, unavailable, facts)
    expect(result.status).toBe('missing')
    expect(result.tariff).toBeNull()
    expect(result.alternatives).toEqual([])
    expect(result.disambiguation?.candidates).toEqual([])
    expect(result.disambiguation?.questions).toHaveLength(1)
    expect(result.disambiguation?.questions[0].id).toBe('insulation')
    expect(result.missingFacts[0]).toContain('vacío')
    expect(unavailable.run).not.toHaveBeenCalled()
  })

  it.each([
    'Recipiente aislado por vacío para bebidas.',
    'Aislamiento al vacío, para conservar agua caliente.',
    'Vacuum insulated beverage flask.',
  ])('converges after the explicit answer, without another AI loop: %s', async description => {
    const result = await classifyFullNcm(index, unavailable, { ...ordinary, description })
    expect(result.code).toBe('9617.00.10')
    expect(result.tariff).not.toBeNull()
    expect(result.missingFacts).toEqual([])
    expect(result.diagnostics?.normalizedConcepts).toContain('beverage_container')
  })

  it('does not retrieve steel stock, screws or glass liners for the finished drinkware identity', () => {
    const result = retrieveNcmCandidates(index, ['acero inoxidable', 'termo', 'recipiente isotermico'], ordinary, 25)
    expect(result.length).toBeGreaterThan(0)
    expect(result.some(item => item.code === '9617.00.10')).toBe(true)
    expect(result.some(item => /^(72|7318|7020)/.test(item.code))).toBe(false)
    expect(result.some(item => item.code === '9617.00.20')).toBe(false)
  })

  it.each([
    { ...ordinary, description: 'Recipiente sin aislamiento por vacío.' },
    { ...ordinary, description: 'No tiene aislamiento al vacío.' },
    { ...ordinary, description: 'No está aislado por vacío.' },
    { ...ordinary, description: 'Does not have vacuum insulation.' },
    { ...ordinary, description: 'Without vacuum insulation.' },
    { name: 'Botella común', material: 'Plástico', description: 'Sin aislamiento térmico' },
    { name: 'Termo eléctrico', functionText: 'Calentar agua con electricidad', description: 'Aislado por vacío' },
    { name: 'Ampolla de vidrio de repuesto para termo', description: 'Aislado por vacío' },
    { name: 'Partes de termo', description: 'Aislado por vacío' },
    { name: 'Tapas para termos', description: 'Aislado por vacío' },
    { name: 'Lids for vacuum flasks', description: 'Vacuum insulated' },
    { name: 'Piezas para termos', description: 'Aislado por vacío' },
    { name: 'Repuestos para termos', description: 'Aislado por vacío' },
    { name: 'Vacuum flask parts', description: 'Vacuum insulated' },
    { name: 'Tapa para termo Stanley', material: 'Plástico', description: 'Repuesto para recipiente aislado por vacío' },
  ])('never promotes an incompatible complete vacuum flask: $name', async facts => {
    let call = 0
    const malicious = { run: async () => ({ response: JSON.stringify(call++ === 0
      ? { searchTerms: ['termo', 'recipiente isotermico', 'acero inoxidable'], missingFacts: [] }
      : { ranking: [{ code: '9617.00.10', reason: 'brand looks like a thermo' }], confidence: 'high', missingFacts: [] }) }) }
    const result = await classifyFullNcm(index, malicious, facts)
    expect(result.code).not.toBe('9617.00.10')
  })

  it('does not confuse raw steel intended to manufacture thermos with a finished flask', () => {
    const facts = { name: 'Lámina de acero inoxidable', functionText: 'Para fabricar termos' }
    expect(deriveSemanticConcepts(facts).concepts).toContain('raw_material')
    const candidates = retrieveNcmCandidates(index, ['acero inoxidable', 'laminados planos'], facts, 25)
    expect(candidates.some(item => item.code.startsWith('72'))).toBe(true)
  })

  it('does not infer a beverage identity from a volume alone', () => {
    const concepts = deriveSemanticConcepts({ name: 'Crema facial 500 ml', description: 'Envase de doble pared' })
    expect(concepts.concepts).not.toContain('beverage_container')
    expect(concepts.concepts).not.toContain('vacuum_insulated')
  })
})

it('bounds an indefinitely stalled model and returns an unpriced result', async () => {
  vi.useFakeTimers()
  try {
    const stalled = { run: () => new Promise<never>(() => {}) }
    const pending = classifyFullNcm(index, stalled, { name: 'Botella de plástico para bebidas', description: 'Sin aislamiento térmico' })
    await vi.advanceTimersByTimeAsync(16_001)
    const result = await pending
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
    expect(result.tariff).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it('does not mistake explicit complete articles or a travel slogan for replacement parts', async () => {
  for (const name of ['Termo completo, no es un repuesto', 'Termo para llevar a todas partes']) {
    const result = await classifyFullNcm(index, unavailable, { ...ordinary, name, description: 'Aislado por vacío para bebidas' })
    expect(result.code).toBe('9617.00.10')
  }
})
