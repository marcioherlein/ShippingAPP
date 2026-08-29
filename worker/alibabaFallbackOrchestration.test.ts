import { describe, expect, it, vi } from 'vitest'
import { needsAlibabaSupplement, requiredAlibabaSignalCount, resolveAlibabaFallback } from './router'
import type { BrowserRun } from './alibabaSource'
import type { DirectAlibabaResult } from './alibabaDirectProvider'
import type { NativeAlibabaResult } from './nativeAlibaba'

const url = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')
const browser: BrowserRun = { quickAction: async () => new Response('{}') }

function base(mode = 'partial', overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: url.toString(), fetched: true,
    sourceRead: { mode, quality: 2, directStatus: 200, browserAttempted: false, browserMsUsed: null, reason: 'test' },
    product: {
      name: 'Mechanical Wristwatch', category: 'Mechanical Wristwatch', unitPriceUsd: null, moq: null,
      packedWeightKg: 0, volumeCbm: 0, originCountry: '', imageUrl: null, ...overrides,
    },
    suggestedQuantities: [], confidence: { overall: 40, productSource: mode, logistics: 'missing', market: 'missing' }, assumptions: [],
  }
}

function direct(status: 'ready' | 'partial' = 'ready', overrides: Record<string, unknown> = {}): DirectAlibabaResult {
  return {
    status, source: 'ShippingAPP direct Alibaba', httpStatus: 200, warnings: [],
    facts: {
      name: 'Mechanical Wristwatch', category: 'Mechanical Wristwatch', categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      unitPriceUsd: 71.5, moq: 5, packedWeightKg: 0.18, volumeCbm: 0.00096, unitSize: '12x10x8 cm',
      originCountry: 'China', imageUrl: null, supplier: null, description: 'Automatic mechanical stainless steel wristwatch',
      material: 'Stainless Steel', functionText: 'Wristwatch', hsCode: '910221', productId: '1601666174891',
      specifications: [], evidence: ['title', 'category', 'price', 'moq', 'weight', 'volume', 'origin'], ...overrides,
    },
  } as DirectAlibabaResult
}

function nativeReady(overrides: Record<string, unknown> = {}): NativeAlibabaResult {
  return {
    status: 'ready', source: 'Cloudflare Browser Run JSON', browserMsUsed: 1200, warnings: [],
    facts: {
      name: 'Mechanical Wristwatch', category: 'Mechanical Wristwatch', categoryPath: ['Timepieces', 'Watches', 'Mechanical Watches'],
      unitPriceUsd: 71.5, moq: 5, packedWeightKg: 0.2, volumeCbm: 0.001, unitSize: '12x10x8 cm',
      originCountry: 'China', supplierCountry: 'CN', imageUrl: null, supplier: null, supplierBadges: [],
      description: 'Specifications: Movement: Automatic', hsCode: '910221', productId: '1601666174891', productCategoryId: null,
      quantityUnit: 'pieces', leadTime: null, packaging: null, tariffInfo: null, raw: null, ...overrides,
    },
  }
}

const nativeUnavailable: NativeAlibabaResult = {
  status: 'unavailable', source: 'Cloudflare Browser Run JSON', facts: null, warnings: ['browser unavailable'], browserMsUsed: null,
}

const directUnavailable: DirectAlibabaResult = {
  status: 'unavailable', source: 'ShippingAPP direct Alibaba', facts: null, httpStatus: 403, warnings: ['direct blocked'],
}

describe('Alibaba staged fallback orchestration', () => {
  it('does nothing when the existing ficha already has all seven required signals', async () => {
    const current = base('parsebot', { unitPriceUsd: 71.5, moq: 5, packedWeightKg: 0.18, volumeCbm: 0.001, originCountry: 'China' })
    const directReader = vi.fn(async () => direct())
    const nativeReader = vi.fn(async () => nativeReady())
    const result = await resolveAlibabaFallback(current, url, browser, directReader, nativeReader)
    expect(requiredAlibabaSignalCount(result)).toBe(7)
    expect(directReader).not.toHaveBeenCalled()
    expect(nativeReader).not.toHaveBeenCalled()
  })

  it('uses zero-credit direct extraction before Browser Run and stops when direct completes the ficha', async () => {
    const directReader = vi.fn(async () => direct())
    const nativeReader = vi.fn(async () => nativeReady())
    const result = await resolveAlibabaFallback(base(), url, browser, directReader, nativeReader)
    expect(requiredAlibabaSignalCount(result)).toBe(7)
    expect(result.product.packedWeightKg).toBe(0.18)
    expect(result.sourceRead.browserAttempted).toBe(false)
    expect(directReader).toHaveBeenCalledTimes(1)
    expect(nativeReader).not.toHaveBeenCalled()
  })

  it('calls Browser Run exactly once when direct extraction is partial', async () => {
    const directReader = vi.fn(async () => direct('partial', { packedWeightKg: null, volumeCbm: null, originCountry: null }))
    const nativeReader = vi.fn(async () => nativeReady())
    const result = await resolveAlibabaFallback(base(), url, browser, directReader, nativeReader)
    expect(directReader).toHaveBeenCalledTimes(1)
    expect(nativeReader).toHaveBeenCalledTimes(1)
    expect(result.sourceRead.browserAttempted).toBe(true)
    expect(requiredAlibabaSignalCount(result)).toBe(7)
  })

  it('falls directly to Browser Run when direct HTTP is blocked', async () => {
    const directReader = vi.fn(async () => directUnavailable)
    const nativeReader = vi.fn(async () => nativeReady())
    const result = await resolveAlibabaFallback(base(), url, browser, directReader, nativeReader)
    expect(directReader).toHaveBeenCalledTimes(1)
    expect(nativeReader).toHaveBeenCalledTimes(1)
    expect(requiredAlibabaSignalCount(result)).toBe(7)
    expect(result.assumptions.join(' ')).toContain('direct blocked')
  })

  it('preserves missing fields for mandatory user confirmation when both self-scrapers fail', async () => {
    const result = await resolveAlibabaFallback(base(), url, browser, async () => directUnavailable, async () => nativeUnavailable)
    expect(needsAlibabaSupplement(result)).toBe(true)
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(result.assumptions.join(' ')).toContain('ficha obligatoria')
  })

  it('does not let legacy AI numbers masquerade as direct evidence', async () => {
    const legacy = base('partial', {
      unitPriceUsd: 999, moq: 777, packedWeightKg: 123, volumeCbm: 9, originCountry: 'Mars',
    })
    const partial = direct('partial', {
      unitPriceUsd: null, moq: null, packedWeightKg: null, volumeCbm: null, originCountry: null,
      evidence: ['title', 'category'],
    })
    const result = await resolveAlibabaFallback(legacy, url, browser, async () => partial, async () => nativeUnavailable)
    expect(result.product.unitPriceUsd).toBeNull()
    expect(result.product.moq).toBeNull()
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(result.product.originCountry).toBe('')
  })

  it('supplements an incomplete Parse.bot result instead of treating Parse.bot as an all-or-nothing provider', async () => {
    const parsed = base('parsebot', { unitPriceUsd: 70, moq: 5, packedWeightKg: 0, volumeCbm: 0, originCountry: '' })
    const result = await resolveAlibabaFallback(parsed, url, browser, async () => direct(), async () => nativeUnavailable)
    expect(requiredAlibabaSignalCount(result)).toBe(7)
    expect(result.confidence.productSource).toBe('parsebot+direct')
    expect(result.sourceRead.browserAttempted).toBe(false)
  })

  it('treats missing merchandise origin as incomplete even when all six other fields exist', () => {
    const six = base('direct', { unitPriceUsd: 71.5, moq: 5, packedWeightKg: 0.18, volumeCbm: 0.001, originCountry: '' })
    expect(requiredAlibabaSignalCount(six)).toBe(6)
    expect(needsAlibabaSupplement(six)).toBe(true)
  })
})
