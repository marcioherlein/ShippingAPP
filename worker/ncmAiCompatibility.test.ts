import { describe, expect, it } from 'vitest'
import { classifyFullNcm, NCM_STRUCTURED_AI_MODEL, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: {
    source: 'test ARCA snapshot',
    sourceFile: 'test.txt',
    sourceDate: '2026-08-24',
    parserSchema: 1,
    indexSchema: 3,
    recordCount: 10434,
    tariffDataIncluded: false,
    simOpeningsIncluded: false,
    recordShape: '[ncmCode,label]',
  },
  records: [
    ['9506.59.00', 'Artículos y material para deportes > Raquetas de tenis y similares > Las demás'],
    ['9506.11.00', 'Artículos y material para deportes > Esquís para nieve'],
  ],
}

describe('NCM structured AI compatibility', () => {
  it('uses a JSON-Mode-supported Workers AI model for expansion and reranking', async () => {
    const models: string[] = []
    let call = 0
    const ai = {
      async run(model: string) {
        models.push(model)
        if (model !== NCM_STRUCTURED_AI_MODEL) throw new Error(`unsupported structured model: ${model}`)
        call += 1
        if (call === 1) {
          return { response: { searchTerms: ['raquetas de tenis', 'raqueta deportiva', 'tenis similares'], missingFacts: [] } }
        }
        return { response: { ranking: [{ code: '9506.59.00', reason: 'Coincide con raqueta deportiva.' }], confidence: 'high', missingFacts: [] } }
      },
    }

    const result = await classifyFullNcm(index, ai, {
      name: 'Professional 12K carbon fiber padel racket',
      category: 'Padel racket',
      material: 'carbon fiber',
      functionText: 'sports racket for padel',
    })

    expect(result.status).toBe('candidate')
    expect(result.code).toBe('9506.59.00')
    expect(models).toEqual([NCM_STRUCTURED_AI_MODEL, NCM_STRUCTURED_AI_MODEL])
    expect(NCM_STRUCTURED_AI_MODEL).toBe('@cf/meta/llama-3.1-8b-instruct-fast')
  })
})
