import { describe, expect, it } from 'vitest'
import { buildNcmClarification } from './ncmClarification'
import type { FullNcmClassification } from './ncmRetrieval'

const base: FullNcmClassification = {
  status: 'candidate',
  code: '8544.49.00',
  label: 'Los demás conductores eléctricos para una tensión inferior o igual a 1.000 V',
  confidence: 'medium',
  alternatives: [
    { code: '8544.42.00', label: 'Los demás conductores eléctricos provistos de piezas de conexión', score: 28 },
  ],
  missingFacts: ['Confirmar si posee piezas de conexión'],
  rationale: [],
  searchTerms: ['cable eléctrico', 'conductores con conectores'],
  sourceDate: '2026-08-14',
  source: 'ARCA',
  catalogRecordCount: 10504,
  retrievalMode: 'ai_reranked',
}

describe('adaptive NCM clarification', () => {
  it('asks one objective question for an ambiguous classification', async () => {
    const calls: any[] = []
    const ai = {
      run: async (_model: string, input: unknown) => {
        calls.push(input)
        return { response: {
          question: '¿El cable viene provisto de conectores en sus extremos?',
          factKey: 'construction',
          reason: 'La presencia de conectores puede separar las alternativas actuales.',
          options: [
            { label: 'Sí, tiene conectores', value: 'El cable viene provisto de conectores en ambos extremos.' },
            { label: 'No, no tiene conectores', value: 'El cable se importa sin conectores ni piezas de conexión.' },
          ],
        } }
      },
    }

    const result = await buildNcmClarification(ai, { name: 'USB-C cable' }, base, 0)
    expect(result?.round).toBe(1)
    expect(result?.question).toContain('conectores')
    expect(result?.options).toHaveLength(2)
    expect(calls[0].response_format.type).toBe('json_schema')
    expect(calls[0].response_format.json_schema.properties.options.type).toBe('array')
    expect(calls[0].max_tokens).toBe(450)
  })

  it('does not ask when confidence is already high', async () => {
    let calls = 0
    const ai = { run: async () => { calls += 1; return {} } }
    const result = await buildNcmClarification(ai, { name: 'known product' }, { ...base, confidence: 'high' }, 0)
    expect(result).toBeNull()
    expect(calls).toBe(0)
  })

  it('stops after three answered questions', async () => {
    let calls = 0
    const ai = { run: async () => { calls += 1; return {} } }
    const result = await buildNcmClarification(ai, { name: 'ambiguous product' }, base, 3)
    expect(result).toBeNull()
    expect(calls).toBe(0)
  })

  it('falls back to complete-product vs accessory when AI is unavailable', async () => {
    const ai = { run: async () => { throw new Error('offline') } }
    const result = await buildNcmClarification(ai, { name: 'LED desk lamp shade replacement only' }, { ...base, confidence: 'low' }, 0)
    expect(result?.factKey).toBe('product_scope')
    expect(result?.options.map((item) => item.label)).toContain('El producto completo')
    expect(result?.options.map((item) => item.label)).toContain('Sólo un accesorio o repuesto')
  })

  it('rejects clarification options that leak customs codes', async () => {
    const ai = { run: async () => ({ response: {
      question: '¿Cuál opción describe el cable?', factKey: 'construction', reason: 'distingue alternativas',
      options: [
        { label: '8544.42.00', value: 'usar 8544.42.00' },
        { label: 'Cable simple', value: 'Cable sin piezas de conexión' },
      ],
    } }) }
    const result = await buildNcmClarification(ai, { name: 'USB cable' }, base, 0)
    expect(result).toBeNull()
  })
})
