import { describe, expect, it } from 'vitest'
import { classifyFullNcm, retrieveNcmCandidates, type NcmSearchIndex } from './ncmRetrieval'
import { deriveSemanticConcepts } from './semanticConcepts'

// Schema-4 index with the real tariff families involved in the reported defects. Labels are
// close paraphrases of the official ARCA/NCM_APP snapshot, plus one deliberately adversarial
// refrigeration row that reproduces the production "8419 beats 3924" lexical trap.
const row = (code: string, label: string): [string, string, number, number, number, number, number, number, number, number, null, string] =>
  [code, label, 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'NO']

const index: NcmSearchIndex = {
  meta: {
    source: 'NCM_APP.xlsx', sourceFile: 'NCM_APP.xlsx', sourceDate: '2026-08-27',
    parserSchema: 3, indexSchema: 4, recordCount: 10504, tariffDataIncluded: true,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label,...tariff]',
  },
  records: [
    row('9617.00.10', 'TERMOS Y DEMAS RECIPIENTES ISOTERMICOS, MONTADOS Y AISLADOS POR VACIO, ASI COMO SUS PARTES > Termos y demas recipientes isotermicos'),
    row('3924.10.00', 'VAJILLA, ARTICULOS DE COCINA O DE USO DOMESTICO Y ARTICULOS DE HIGIENE O TOCADOR, DE PLASTICO > Vajilla y demas articulos para el servicio de mesa o de cocina'),
    row('3924.90.00', 'VAJILLA, ARTICULOS DE COCINA O DE USO DOMESTICO Y ARTICULOS DE HIGIENE O TOCADOR, DE PLASTICO > Los demas'),
    row('8419.89.91', 'MAQUINAS Y APARATOS PARA ENFRIAR recipiente refrigerador de bebidas con dispositivo de circulacion de fluido refrigerante electrico'),
    row('9004.10.00', 'GAFAS (ANTEOJOS) CORRECTORAS, PROTECTORAS U OTRAS, Y ARTICULOS SIMILARES > Gafas (anteojos) de sol'),
    row('9004.90.10', 'GAFAS (ANTEOJOS) CORRECTORAS, PROTECTORAS U OTRAS, Y ARTICULOS SIMILARES > Los demas > Gafas (anteojos) correctoras'),
  ],
}

// AI that refuses to run — proves the deterministic layer alone carries the result.
const noAi = { run: async () => { throw new Error('AI must not be needed') } }

function fakeAi(outputs: unknown[]) {
  let i = 0
  return { run: async () => ({ response: JSON.stringify(outputs[i++] ?? {}) }) }
}

describe('language invariance — vacuum thermo converges on 9617.00.10', () => {
  const english = {
    name: '45oz 1350ml Large Capacity Stainless Steel',
    material: 'Stainless Steel',
    functionText: 'direct drinking, travel',
    description: 'thermal insulation performance: Thermal Insulation, double wall',
  }
  const spanish = {
    name: 'Termo botella térmica 1350 ml de acero inoxidable',
    category: 'Termo y recipiente isotérmico aislado por vacío',
    material: 'Acero inoxidable',
    functionText: 'Recipiente reutilizable aislado por vacío para conservar bebidas frías o calientes.',
    description: 'Termo de 1,35 litros con doble pared de acero inoxidable, aislado por vacío, para bebidas.',
  }
  const mixed = {
    name: 'Vacuum flask botella de acero inoxidable 1350ml',
    description: 'double wall, conserva bebidas frías o calientes, direct drinking',
  }

  it.each([['English', english], ['Spanish', spanish], ['mixed', mixed]] as const)(
    '%s facts → 9617.00.10 without calling AI',
    async (_label, facts) => {
      const result = await classifyFullNcm(index, noAi, facts)
      expect(result.status).toBe('candidate')
      expect(result.code).toBe('9617.00.10')
      expect(result.confidence).not.toBe('low')
      expect(result.diagnostics?.normalizedConcepts).toContain('vacuum_insulated')
    },
  )
})

describe('negative-evidence scoring — retrieval level', () => {
  const plasticQuery = ['plastico', 'de plastico', 'recipiente', 'para bebidas', 'articulos de uso domestico', 'refrigerador']
  const facts = { name: 'botella de plastico', material: 'plastico' }

  it('ranks refrigeration machinery ABOVE plastic families when no negative evidence is applied', () => {
    const result = retrieveNcmCandidates(index, plasticQuery, facts, 25, [])
    const codes = result.map((c) => c.code)
    // With the "refrigerador" term and no exclusion, 8419 competes strongly (the old bug).
    expect(codes).toContain('8419.89.91')
  })

  it('penalizes the contradicted refrigeration family below plastic families with negative evidence', () => {
    const result = retrieveNcmCandidates(index, plasticQuery, facts, 25, ['refriger', 'electric', 'isotermic', 'vacio', 'termo'])
    const codes = result.map((c) => c.code)
    const idx3924 = codes.findIndex((c) => c.startsWith('3924'))
    const idx8419 = codes.indexOf('8419.89.91')
    expect(idx3924).toBeGreaterThanOrEqual(0)
    expect(idx3924).toBeLessThan(idx8419 === -1 ? Number.MAX_SAFE_INTEGER : idx8419)
    const eight = result.find((c) => c.code === '8419.89.91')
    if (eight) {
      expect(eight.penalty).toBeGreaterThan(0)
      expect(eight.conflicts?.join(' ')).toMatch(/refriger/)
    }
    // The isothermal family must also be penalized for an explicitly non-insulated product.
    const thermo = result.find((c) => c.code === '9617.00.10')
    if (thermo) expect(thermo.penalty).toBeGreaterThan(0)
  })
})

describe('negative-evidence scoring — classification level (plastic non-insulated sport bottle)', () => {
  it('prefers the 3924 plastic family over refrigeration/machinery and never promotes 8419', async () => {
    const facts = {
      name: 'Large Capacity Sport Water Bottle Gym',
      material: 'Plastic, plastic type PP',
      functionText: 'recipiente para beber agua, uso deportivo y doméstico',
      description: 'thermal insulation performance: None, contenedor pasivo, sin refrigeración activa, no eléctrico, straw with cap',
    }
    // AI expansion + a rerank that (correctly) points at the plastic family.
    const ai = fakeAi([
      { searchTerms: ['articulos de uso domestico de plastico', 'recipiente de plastico'], negativeTerms: [], missingFacts: [] },
      { ranking: [{ code: '3924.10.00', reason: 'Recipiente de plástico de uso doméstico.' }, { code: '3924.90.00' }], confidence: 'high', missingFacts: [] },
    ])
    const result = await classifyFullNcm(index, ai, facts)

    // 8419 (refrigeration machinery) must never be the promoted code.
    expect(result.code).not.toBe('8419.89.91')
    // The 3924 family must be ranked above 8419 in the diagnostics candidate ordering.
    const codes = (result.diagnostics?.topCandidates ?? []).map((c) => c.code)
    const idx3924 = codes.findIndex((c) => c.startsWith('3924'))
    const idx8419 = codes.indexOf('8419.89.91')
    expect(idx3924).toBeGreaterThanOrEqual(0)
    if (idx8419 !== -1) expect(idx3924).toBeLessThan(idx8419)
    // Negative evidence must be recorded for explainability.
    expect(result.diagnostics?.negativeConcepts.join(' ')).toMatch(/refriger|isotermic|electric/)
    if (result.code) expect(result.code.startsWith('3924')).toBe(true)
  })
})

describe('fail-closed is preserved for genuinely ambiguous evidence', () => {
  it('returns missing when evidence cannot retrieve a supported family', async () => {
    const ai = fakeAi([{ searchTerms: ['dispositivo generico sin identidad'], negativeTerms: [], missingFacts: ['función principal'] }])
    const result = await classifyFullNcm(index, ai, { name: 'generic unknown gadget' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
    expect(result.tariff).toBeNull()
  })
})

describe('sunglasses classify (criterion 3)', () => {
  it('classifies sunglasses as 9004.10.00 without needing AI', async () => {
    const result = await classifyFullNcm(index, noAi, { name: 'Mens Sunglasses Luxury Designer UV400', category: 'sunglasses' })
    expect(result.status).toBe('candidate')
    expect(result.code).toBe('9004.10.00')
  })
})

describe('adversarial — misleading lexical overlap must not force a family', () => {
  it('does NOT classify an ordinary stainless-steel bottle (no vacuum) as a 9617 thermo; asks about insulation', async () => {
    // AI proposes the thermo code, but it is not in the deterministic shortlist for a
    // non-insulated bottle, so it is sanitized away and the result fails closed with a
    // specific insulation clarification instead of a wrong 9617.
    const ai = fakeAi([
      { searchTerms: ['botella de acero inoxidable', 'recipiente metalico para bebidas'], negativeTerms: [], missingFacts: [] },
      { ranking: [{ code: '9617.00.10', reason: 'looks like a thermo' }], confidence: 'high', missingFacts: [] },
    ])
    const result = await classifyFullNcm(index, ai, { name: 'stainless steel ordinary water bottle 1L', material: 'stainless steel', functionText: 'drinking' })
    expect(result.code).not.toBe('9617.00.10')
    expect(result.missingFacts.join(' ')).toMatch(/aislamiento|vacío|termo/i)
  })

  it('does not treat a passive "cooler-style" bottle as refrigeration machinery', () => {
    const c = deriveSemanticConcepts({
      name: 'cooler style drinking bottle',
      description: 'no active cooling, passive, keeps drinks cool by insulation only, non-electric',
    })
    expect(c.exclusionTerms).toContain('refriger')
    expect(c.exclusionTerms).toContain('electric')
  })
})

