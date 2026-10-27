import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadCanonicalSimParentLabels, reconcileNcmIndexLabels } from '../scripts/ncm-label-reconciliation.mjs'
import { classifyFullNcm, retrieveNcmCandidates, type NcmSearchIndex } from './ncmRetrieval'
import { deriveSemanticConcepts, deriveDisambiguationQuestions } from './semanticConcepts'
import { inferFunctionFromProductName } from '../src/lib/productConfirmation'

// Same labels and full record coverage as the deployed build, not synthetic rows.
const raw = JSON.parse(readFileSync('public/data/ncm-index.json', 'utf8'))
const { labelsByCode, sourceDate } = loadCanonicalSimParentLabels('public/data/sim')
const index = reconcileNcmIndexLabels(raw, labelsByCode, sourceDate) as NcmSearchIndex
const unavailable = { run: vi.fn(async () => { throw new Error('AI unavailable') }) }

describe('complete product identity against the canonical production catalog', () => {
  it.each(['monopatin electrico', 'Monopatín eléctrico', 'electric scooter', 'Electric scooters', 'scooter eléctrico', 'patinete eléctrico'])('asks only the missing use for %s', async name => {
    unavailable.run.mockClear()
    const result = await classifyFullNcm(index, unavailable, { name })
    expect(result.code).toBeNull()
    expect(result.tariff).toBeNull()
    expect(result.disambiguation?.candidates).toEqual([])
    expect(result.disambiguation?.questions.map(q => q.id)).toEqual(['mobility-use'])
    expect(unavailable.run).not.toHaveBeenCalled()
    const note = result.disambiguation!.questions[0].options.find(o => o.value === 'transport')!.note
    const confirmed = await classifyFullNcm(index, unavailable, { name, description: note })
    expect(confirmed.code).toBe('8711.60.00')
    expect(confirmed.tariff).not.toBeNull()
    expect(confirmed.missingFacts).toEqual([])
  })

  it.each([
    { name: 'Monopatín eléctrico', functionText: 'Transporte urbano personal', material: 'Aluminio' },
    { name: 'Electric scooter with lithium battery', functionText: 'Transporte personal urbano para adultos', description: 'Monopatín eléctrico completo, batería de litio integrada y cargador incluido' },
    { name: 'Patinete eléctrico con batería y cargador', description: 'Para adultos, motor eléctrico de 350 W, transporte urbano' },
    { name: 'Monopatín eléctrico para adultos', description: 'No es un juguete infantil; transporte urbano personal.' },
  ])('classifies the complete vehicle, not its integrated components: $name', async facts => {
    const result = await classifyFullNcm(index, unavailable, facts)
    expect(result.code).toBe('8711.60.00')
    expect(result.missingFacts).toEqual([])
    const concepts = deriveSemanticConcepts(facts)
    expect(concepts.derivedCategory).toBe('Monopatín eléctrico')
    expect(concepts.concepts).not.toContain('battery_lithium')
    expect(concepts.concepts).not.toContain('power_adapter')
    const retrieved = retrieveNcmCandidates(index, concepts.positiveTerms, facts)
    expect(retrieved[0]?.code).toBe('8711.60.00')
    expect(retrieved.every(c => c.code.startsWith('8711.60'))).toBe(true)
  })

  it.each(['Bicicleta', 'Taladro', 'Robot aspirador', 'Parlante', 'Notebook', 'Auriculares Bluetooth'])('does not change %s into its battery', name => {
    const facts = { name, description: 'Batería de litio integrada y cargador eléctrico incluido' }
    const concepts = deriveSemanticConcepts(facts)
    expect(concepts.concepts).not.toContain('battery_lithium')
    expect(concepts.concepts).not.toContain('power_adapter')
    expect(concepts.derivedCategory).not.toBe('Acumulador de litio')
  })

  it.each(['Monopatín sin motor', 'Patinete a patada', 'Kick scooter without a motor'])('never infers electric propulsion from %s', async name => {
    const facts = { name, functionText: 'Transporte personal para adultos' }
    const concepts = deriveSemanticConcepts(facts)
    expect(concepts.concepts).toContain('!electric')
    expect(concepts.concepts).not.toContain('electric')
    expect((await classifyFullNcm(index, unavailable, facts)).code).not.toBe('8711.60.00')
  })

  it('does not infer vehicle propulsion from an included electric charger', () => {
    const concepts = deriveSemanticConcepts({ name: 'Monopatín con cargador eléctrico incluido' })
    expect(concepts.concepts).not.toContain('electric')
    expect(deriveDisambiguationQuestions(concepts).map(q => q.id)).toContain('mobility-propulsion')
  })

  it.each(['Batería de litio para monopatín eléctrico', 'Cargador para monopatín eléctrico', 'Rueda para monopatín eléctrico', 'Ruedas para monopatines eléctricos', 'Motor para monopatín eléctrico'])('never retrieves a complete vehicle for %s', name => {
    const facts = { name }
    const concepts = deriveSemanticConcepts(facts)
    expect(concepts.concepts).not.toContain('kick_scooter')
    const candidates = retrieveNcmCandidates(index, ['propulsadas con motor electrico', 'bateria de litio'], facts)
    expect(candidates.some(c => c.code.startsWith('8711'))).toBe(false)
  })

  it.each([
    { name: 'Monopatín eléctrico infantil', description: 'Juguete para niños' },
    { name: 'Electric mobility scooter', functionText: 'Para personas con discapacidad y movilidad reducida' },
    { name: 'Monopatín eléctrico sin motor', functionText: 'Transporte personal para adultos' },
  ])('does not auto-price conflicting or different vehicle uses: $name', async facts => {
    expect((await classifyFullNcm(index, unavailable, facts)).code).not.toBe('8711.60.00')
  })

  it.each([
    { name: 'Monopatín sin motor', functionText: 'Transporte personal para adultos' },
    { name: 'Monopatín eléctrico infantil', description: 'Juguete para niños' },
    { name: 'Monopatín eléctrico sin motor', functionText: 'Transporte personal para adultos' },
  ])('cannot auto-price ANY vehicle or toy position from poisoned AI for $name', async facts => {
    const poisoned = { run: vi.fn(async () => ({ response: JSON.stringify({
      searchTerms: ['volquetes automotores diseñados para utilizarlos fuera de la red de carreteras', 'con capacidad de carga superior o igual a 85 t', 'vehículos automóviles para el transporte de mercancías'],
      ranking: [{ code: '8704.10.10' }, { code: '9503.00.10' }], confidence: 'high',
    }) })) }
    const result = await classifyFullNcm(index, poisoned, facts)
    expect(result.code).toBeNull()
    expect(result.tariff).toBeNull()
    expect(result.alternatives).toEqual([])
    expect(result.missingFacts.join(' ')).toContain('requiere revisión')
    expect(poisoned.run).not.toHaveBeenCalled()
  })

  it('does not invent motor type or wheel count in a suggested function', () => {
    expect(inferFunctionFromProductName('Monopatín sin motor')).not.toMatch(/eléctrico|dos ruedas/)
    expect(inferFunctionFromProductName('Batería para monopatín')).toContain('energía')
  })

  it.each(['Batería para monopatín', 'Battery for electric scooter', 'Pila 18650'])('asks for chemistry instead of assuming lithium for %s', async name => {
    const facts = { name }
    const concepts = deriveSemanticConcepts(facts)
    expect(concepts.concepts).not.toContain('battery_lithium')
    expect(concepts.derivedCategory).not.toBe('Acumulador de litio')
    const result = await classifyFullNcm(index, unavailable, facts)
    expect(result.code).toBeNull()
    expect(result.tariff).toBeNull()
    expect(result.disambiguation?.questions.map(q => q.id)).toEqual(['battery-chemistry'])
    const answer = result.disambiguation!.questions[0].options.find(o => o.value === 'lithium-ion')!.note
    expect(deriveSemanticConcepts({ ...facts, description: answer }).concepts).toContain('battery_lithium')
  })

  it.each([
    { name: 'Batería de plomo para monopatín eléctrico' },
    { name: 'Pila alcalina', description: 'No recargable' },
    { name: 'Batería sin litio', description: 'No es de ion de litio; acumulador de níquel' },
    { name: 'Batería', description: 'No es de ion de litio.' },
    { name: 'Lithium battery', description: 'Primary, non-rechargeable lithium metal cell' },
  ])('never promotes $name to a lithium-ion accumulator', async facts => {
    expect(deriveSemanticConcepts(facts).concepts).not.toContain('battery_lithium')
    const poisoned = { run: vi.fn(async () => ({ response: JSON.stringify({ searchTerms: ['acumuladores electricos', 'de iones de litio'], ranking: [{ code: '8507.60.00' }], confidence: 'high' }) })) }
    const result = await classifyFullNcm(index, poisoned, facts)
    expect(result.code).not.toBe('8507.60.00')
  })

  it('keeps explicitly confirmed lithium-ion chemistry when lead is explicitly excluded', () => {
    const concepts = deriveSemanticConcepts({ name: 'Lithium-ion battery', description: 'Lead-free rechargeable battery, no contiene plomo.' })
    expect(concepts.concepts).toContain('battery_lithium')
    expect(concepts.concepts).not.toContain('battery_chemistry_unknown')
  })
})
