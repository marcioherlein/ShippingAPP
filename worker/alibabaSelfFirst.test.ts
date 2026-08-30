import { describe, expect, it, vi } from 'vitest'
import { requiredSelfFirstSignals, resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import type { DirectAlibabaResult } from './alibabaDirectProvider'
import type { ParsebotAlibabaResult } from './parsebotAlibaba'
import type { NativeAlibabaResult } from './nativeAlibaba'

const url = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')
const env: any = { BROWSER: { quickAction: async () => new Response('{}') } }

function direct(overrides: Record<string, unknown> = {}): DirectAlibabaResult {
  return {
    status: 'ready', source: 'ShippingAPP direct Alibaba', httpStatus: 200, warnings: [],
    facts: {
      name: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
      category: 'Mechanical Watches',
      categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      unitPriceUsd: 71.5,
      moq: 5,
      packedWeightKg: 0.18,
      volumeCbm: 0.00096,
      unitSize: '12x10x8 cm',
      originCountry: 'China',
      imageUrl: null,
      supplier: 'Watch Supplier',
      description: 'Automatic mechanical stainless steel wristwatch',
      material: 'Stainless Steel',
      functionText: 'Mechanical wristwatch',
      hsCode: '910221',
      productId: '1601666174891',
      specifications: [],
      evidence: ['title', 'category', 'price', 'moq', 'weight', 'volume', 'origin'],
      ...overrides,
    },
  } as DirectAlibabaResult
}

function parsebot(overrides: Record<string, unknown> = {}): ParsebotAlibabaResult {
  return {
    status: 'ready', source: 'Parse.bot · GET product_id', warnings: [], executionTime: 1,
    facts: {
      name: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
      category: 'Mechanical Watches',
      categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      unitPriceUsd: 71.5,
      moq: 5,
      packedWeightKg: 0.2,
      volumeCbm: 0.001,
      unitSize: '12x10x8 cm',
      originCountry: 'China', supplierCountry: 'CN', imageUrl: null, supplier: 'Watch Supplier', supplierBadges: [],
      description: 'Specifications: Movement: Automatic; Material: Stainless Steel', hsCode: '910221',
      productId: '1601666174891', productCategoryId: null, quantityUnit: 'pieces', leadTime: null, packaging: null, tariffInfo: null,
      ...overrides,
    },
  }
}

function native(overrides: Record<string, unknown> = {}): NativeAlibabaResult {
  return {
    status: 'ready', source: 'Cloudflare Browser Run JSON', warnings: [], browserMsUsed: 900,
    facts: {
      name: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
      category: 'Mechanical Watches', categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      unitPriceUsd: 71.5, moq: 5, packedWeightKg: 0.21, volumeCbm: 0.0011, unitSize: '12x10x9 cm',
      originCountry: 'China', supplierCountry: 'CN', imageUrl: null, supplier: 'Watch Supplier', supplierBadges: [],
      description: 'Specifications: Movement: Automatic', hsCode: '910221', productId: '1601666174891',
      productCategoryId: null, quantityUnit: 'pieces', leadTime: null, packaging: null, tariffInfo: null, raw: null,
      ...overrides,
    },
  }
}

const parsebotOut: ParsebotAlibabaResult = {
  status: 'unavailable', source: 'Parse.bot', facts: null, httpStatus: 402,
  warnings: ['Parse.bot credits exhausted.'],
}
const nativeOut: NativeAlibabaResult = {
  status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, browserMsUsed: null,
  warnings: ['Browser unavailable.'],
}

describe('Alibaba self-scrape-first orchestration', () => {
  it('uses zero-Parse-credit direct extraction first and skips paid providers when complete', async () => {
    const directReader = vi.fn(async () => direct())
    const parsebotReader = vi.fn(async () => parsebot())
    const nativeReader = vi.fn(async () => native())
    const result = await resolveAlibabaSelfFirst(url, env, { directReader, parsebotReader, nativeReader })
    expect(requiredSelfFirstSignals(result)).toBe(7)
    expect(directReader).toHaveBeenCalledTimes(1)
    expect(parsebotReader).not.toHaveBeenCalled()
    expect(nativeReader).not.toHaveBeenCalled()
    expect(result.confidence.productSource).toContain('direct')
  })

  it('uses Parse.bot only to fill facts missing from the first-party read', async () => {
    const partial = direct({ packedWeightKg: null, volumeCbm: null, evidence: ['title', 'category', 'price', 'moq', 'origin'] })
    ;(partial as any).status = 'partial'
    const parsebotReader = vi.fn(async () => parsebot())
    const nativeReader = vi.fn(async () => native())
    const result = await resolveAlibabaSelfFirst(url, env, { directReader: async () => partial, parsebotReader, nativeReader })
    expect(parsebotReader).toHaveBeenCalledTimes(1)
    expect(nativeReader).not.toHaveBeenCalled()
    expect(result.product.packedWeightKg).toBe(0.2)
    expect(result.product.volumeCbm).toBe(0.001)
    expect(requiredSelfFirstSignals(result)).toBe(7)
  })

  it('survives exhausted Parse.bot credits by falling through to Browser Run', async () => {
    const partial = direct({ packedWeightKg: null, volumeCbm: null, evidence: ['title', 'category', 'price', 'moq', 'origin'] })
    ;(partial as any).status = 'partial'
    const nativeReader = vi.fn(async () => native())
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => partial,
      parsebotReader: async () => parsebotOut,
      nativeReader,
    })
    expect(nativeReader).toHaveBeenCalledTimes(1)
    expect(result.product.packedWeightKg).toBe(0.21)
    expect(result.product.volumeCbm).toBe(0.0011)
    expect(requiredSelfFirstSignals(result)).toBe(7)
    expect(result.assumptions.join(' ')).toContain('credits exhausted')
  })

  it('never invents missing logistics when Parse.bot and Browser Run are both unavailable', async () => {
    const partial = direct({ packedWeightKg: null, volumeCbm: null, originCountry: null, evidence: ['title', 'category', 'price', 'moq'] })
    ;(partial as any).status = 'partial'
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => partial,
      parsebotReader: async () => parsebotOut,
      nativeReader: async () => nativeOut,
    })
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(result.product.originCountry).toBe('')
    expect(requiredSelfFirstSignals(result)).toBe(4)
    expect(result.assumptions.join(' ')).toContain('ficha obligatoria')
  })

  it('preserves the supplied watch identity even when every provider is unavailable', async () => {
    const directOut: DirectAlibabaResult = {
      status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: 403, warnings: ['blocked'],
    }
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader: async () => directOut,
      parsebotReader: async () => parsebotOut,
      nativeReader: async () => nativeOut,
    })
    expect(result.product.name).toMatch(/Fully Automatic Mechanical Watches/i)
    expect(result.product.category).toBe('Sin clasificar')
    expect(result.product.unitPriceUsd).toBeNull()
    expect(result.product.packedWeightKg).toBe(0)
  })
})
