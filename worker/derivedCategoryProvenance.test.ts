import { describe, expect, it, vi } from 'vitest'
import { requiredSelfFirstSignals, resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import type { DirectAlibabaResult } from './alibabaDirectProvider'
import type { ParsebotAlibabaResult } from './parsebotAlibaba'
import type { NativeAlibabaResult } from './nativeAlibaba'

const url = new URL('https://www.alibaba.com/product-detail/Large-Capacity-Sport-Water-Bottle-Gym_1601254829915.html')
const env: any = { BROWSER: { quickAction: async () => new Response('{}') } }

// Case B: a fully-described plastic sport bottle whose supplier ficha exposes every commercial
// signal EXCEPT a generic category. The user should not be asked "¿qué categoría?".
function plasticBottleDirect(): DirectAlibabaResult {
  return {
    status: 'ready', source: 'ShippingAPP direct Alibaba', httpStatus: 200, warnings: [],
    facts: {
      name: 'Large Capacity Sport Water Bottle Gym',
      category: null,
      categoryPath: [],
      unitPriceUsd: 2.64,
      moq: 500,
      packedWeightKg: 0.5,
      volumeCbm: 0.004608,
      unitSize: '24x8x8 cm',
      originCountry: 'Zhejiang, China',
      imageUrl: null,
      supplier: 'Shanghai Karry Industrial Co., Ltd.',
      description: 'thermal insulation performance: None, material Plastic, plastic type PP, direct drinking, straw with cap, gym',
      material: 'Plastic',
      functionText: 'direct drinking sport water bottle',
      hsCode: null,
      productId: '1601254829915',
      specifications: [],
      evidence: ['title', 'price', 'moq', 'weight', 'volume', 'origin'],
    },
  } as DirectAlibabaResult
}

const parsebotOut: ParsebotAlibabaResult = { status: 'not_configured', source: 'Parse.bot', facts: null, warnings: ['no key'] }
const nativeOut: NativeAlibabaResult = { status: 'unavailable', source: 'Browser', facts: null, browserMsUsed: null, warnings: ['browser off'] }

describe('derived category normalization with provenance', () => {
  it('derives a safe category so a fully-described plastic bottle reaches 7/7 without a category question', async () => {
    const parsebotReader = vi.fn(async () => parsebotOut)
    const nativeReader = vi.fn(async () => nativeOut)
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => plasticBottleDirect(),
      parsebotReader,
      nativeReader,
    })

    // Category filled deterministically from evidence (plastic + drinking), not invented.
    expect(result.product.category).toMatch(/[Bb]otella reutilizable/)
    expect(result.product.category).toMatch(/plástico/)
    expect(result.product.categorySource).toBe('derived')
    expect(requiredSelfFirstSignals(result)).toBe(7)

    // Provenance preserved: it must be labelled as ShippingAPP-derived, not a supplier fact.
    expect(result.sourceEvidence.derivedCategory).toBeTruthy()
    expect(result.assumptions.join(' ')).toMatch(/derivada por ShippingAPP/)
    // It must NOT claim insulation the product explicitly denies.
    expect(result.product.category).not.toMatch(/isotérmico|[Tt]ermo/)

    // Because the ficha was completed by the first-party direct read, Parse.bot/Browser are
    // never invoked just to obtain a category.
    expect(parsebotReader).not.toHaveBeenCalled()
    expect(nativeReader).not.toHaveBeenCalled()
  })

  it('does not derive a category (fails closed) when the product identity is unclear', async () => {
    const vagueDirect = { ...plasticBottleDirect() }
    ;(vagueDirect as any).facts = {
      ...(plasticBottleDirect() as any).facts,
      name: 'OEM item 8891',
      material: null,
      functionText: null,
      description: 'assorted goods',
    }
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => vagueDirect as DirectAlibabaResult,
      parsebotReader: async () => parsebotOut,
      nativeReader: async () => nativeOut,
    })
    expect(result.product.category).toBe('Sin clasificar')
    expect(result.sourceEvidence.derivedCategory).toBeUndefined()
  })

  it('tags a supplier-provided category as supplier provenance, not derived', async () => {
    const withCategory = { ...plasticBottleDirect() }
    ;(withCategory as any).facts = { ...(plasticBottleDirect() as any).facts, category: 'Sports Water Bottle' }
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => withCategory as DirectAlibabaResult,
      parsebotReader: async () => parsebotOut,
      nativeReader: async () => nativeOut,
    })
    expect(result.product.category).toBe('Sports Water Bottle')
    expect(result.product.categorySource).toBe('supplier')
    expect(result.sourceEvidence.derivedCategory).toBeUndefined()
  })
})
