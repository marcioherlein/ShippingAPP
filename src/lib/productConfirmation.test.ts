import { describe, expect, it } from 'vitest'
import { applyProductConfirmation, createManualProductAnalysis, missingProductConfirmationFields, productConfirmationFromAnalysis } from './productConfirmation'

describe('mandatory product confirmation gate', () => {
  it('requires physical, commercial and identity data before classification', () => {
    const draft = productConfirmationFromAnalysis(createManualProductAnalysis())
    const missing = missingProductConfirmationFields(draft).map((item) => item.id)
    expect(missing).toContain('productName')
    expect(missing).toContain('category')
    expect(missing).toContain('originCountry')
    expect(missing).toContain('unitPriceUsd')
    expect(missing).toContain('moq')
    expect(missing).toContain('unitWeightKg')
    expect(missing).toContain('unitVolumeCbm')
    expect(missing).toContain('identity_context')
  })

  it('accepts a complete user-confirmed watch ficha and invalidates stale customs', () => {
    const base = createManualProductAnalysis('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches_1601666174891.html')
    const next = applyProductConfirmation(base, {
      productName: 'Fully Automatic Mechanical Watches 42.5MM Stainless Steel Wristwatch',
      category: 'Mechanical Watches',
      description: 'Automatic mechanical wristwatch, stainless steel case, 100m waterproof.',
      material: 'Stainless steel',
      functionText: 'Mechanical timekeeping wristwatch',
      originCountry: 'China',
      unitPriceUsd: 32.5,
      moq: 20,
      unitWeightKg: 0.18,
      unitVolumeCbm: 0.0009,
    })
    expect(missingProductConfirmationFields(productConfirmationFromAnalysis(next))).toHaveLength(0)
    expect(next.product.moq).toBe(20)
    expect(next.product.packedWeightKg).toBe(0.18)
    expect(next.product.volumeCbm).toBe(0.0009)
    expect(next.suggestedQuantities).toContain(20)
    expect(next.customs.ncmCandidate).toBeNull()
    expect(next.customs.dutyRatePct).toBeNull()
  })
})
