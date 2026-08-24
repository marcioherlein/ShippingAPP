import { describe, expect, it } from 'vitest'
import { classifyFullNcm, NCM_STRUCTURED_AI_MODEL, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: {
    source: 'ARCA', sourceFile: 'fixture.txt', sourceDate: '2026-08-14', parserSchema: 2, indexSchema: 3,
    recordCount: 10504, tariffDataIncluded: false, simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
  },
  records: [
    ['8504.40.90', 'Transformadores eléctricos, convertidores eléctricos estáticos y bobinas de reactancia > Convertidores estáticos > Los demás'],
  ],
}

describe('NCM Workers AI request compatibility', () => {
  it('uses a JSON-mode model and max_tokens for expansion and reranking', async () => {
    const calls: Array<{ model: string; input: any }> = []
    const outputs = [
      { response: { searchTerms: ['convertidor eléctrico estático', 'convertidores estáticos'], missingFacts: [] } },
      { response: { ranking: [{ code: '8504.40.90' }], confidence: 'high', missingFacts: [] } },
    ]
    const ai = {
      run: async (model: string, input: unknown) => {
        calls.push({ model, input })
        return outputs[calls.length - 1]
      },
    }

    const result = await classifyFullNcm(index, ai, { name: '65W GaN USB-C charger', category: 'Power adapter' })
    expect(result.code).toBe('8504.40.90')
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.model).toBe(NCM_STRUCTURED_AI_MODEL)
      expect(call.input.response_format).toEqual({ type: 'json_object' })
      expect(typeof call.input.max_tokens).toBe('number')
      expect(call.input).not.toHaveProperty('max_completion_tokens')
    }
  })
})
