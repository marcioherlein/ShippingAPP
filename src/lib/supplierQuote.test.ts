import { describe, expect, it } from 'vitest'
import { optimizeQuantity } from './quantityOptimizer'
import { initialSupplierQuote, supplierQuotePrice } from './supplierQuote'
import { applyProductConfirmation, createManualProductAnalysis, createPrefilledAnalysis, productConfirmationFromAnalysis } from './productConfirmation'

describe('supplier confirmation and purchase quantity', () => {
  it('never treats extracted price as USD or a unit price without explicit correction', () => {
    expect(supplierQuotePrice(initialSupplierQuote(85), 20)).toBeNull()
  })
  it('uses the original pack amount, currency and documented rate', () => {
    const quote = { ...initialSupplierQuote(100), currency: 'CNY' as const, basis: 'pack' as const, unitsPerPack: 5, variant: 'Model A', minQuantity: 10, maxQuantity: 99, usdPerCurrency: 0.14, fxSource: 'Official currency cross rate', fxDate: '2026-10-06' }
    expect(supplierQuotePrice(quote, 20)).toBeCloseTo(2.8)
    expect(supplierQuotePrice({ ...quote, fxSource: '' }, 20)).toBeNull()
    expect(supplierQuotePrice({ ...quote, fxDate: '' }, 20)).toBeNull()
    expect(supplierQuotePrice(quote, 100)).toBeNull()
  })
  it('leaves USD unchanged and blocks invalid pack sizes or quantity bands', () => {
    const quote = initialSupplierQuote(12.5, true)
    expect(supplierQuotePrice(quote, 1)).toBe(12.5)
    expect(supplierQuotePrice({ ...quote, basis: 'pack', unitsPerPack: 0 })).toBeNull()
    expect(supplierQuotePrice({ ...quote, minQuantity: 50, maxQuantity: 10 })).toBeNull()
  })
  it('recalculates the price from confirmed non-overlapping tiers and rejects gaps', () => {
    const quote = { ...initialSupplierQuote(20, true), maxQuantity: 49, additionalTiers: [{ amount: 15, minQuantity: 50, maxQuantity: 99 }, { amount: 12, minQuantity: 100, maxQuantity: null }] }
    expect(supplierQuotePrice(quote, 30)).toBe(20)
    expect(supplierQuotePrice(quote, 75)).toBe(15)
    expect(supplierQuotePrice(quote, 120)).toBe(12)
    expect(supplierQuotePrice({ ...quote, maxQuantity: 60 }, 75)).toBeNull()
    expect(supplierQuotePrice({ ...quote, maxQuantity: 20 }, 30)).toBeNull()
  })
  it('optimizer prices each scenario by confirmed tier and excludes uncovered quantities', () => {
    const quote = { ...initialSupplierQuote(20, true), maxQuantity: 49, additionalTiers: [{ amount: 15, minQuantity: 50, maxQuantity: 99 }] }
    const result = optimizeQuantity({ originCountry: 'China', quantity: 20, unitPriceUsd: 20, unitWeightKg: 0.5, unitVolumeCbm: 0.01, dutyRatePct: 20, budgetUsd: 0, moq: 10, supplierQuote: quote })
    expect(result.candidates.some(item => item.quantity === 50 && item.unitPriceUsd === 15)).toBe(true)
    expect(result.candidates.every(item => item.quantity <= 99)).toBe(true)
    expect(result.candidates.every(item => item.unitPriceUsd === (item.quantity < 50 ? 20 : 15))).toBe(true)
  })
  it('does not turn MOQ or suggested scenarios into a purchase quantity', () => {
    const base = createManualProductAnalysis('manual://product', 'Motocicleta eléctrica')
    base.product.moq = 50
    base.suggestedQuantities = [50, 100]
    expect(productConfirmationFromAnalysis(base).quantity).toBeUndefined()
    const confirmed = applyProductConfirmation(base, { ...productConfirmationFromAnalysis(base), quantity: 120 })
    expect(confirmed.product.purchaseQuantity).toBe(120)
    expect(productConfirmationFromAnalysis(confirmed).quantity).toBe(120)
    expect(confirmed.suggestedQuantities[0]).toBe(120)
  })
  it('keeps unknown MOQ and unprovided volume missing in the manual chat', () => {
    const base = createPrefilledAnalysis({ name: 'Motocicleta eléctrica', use: 'Transporte', material: '', unitPriceUsd: 300, originCountry: 'China', packedWeightKg: 50, moq: 0, volumeCbm: null, sensitiveCategory: 'none' })
    expect(base.product.moq).toBeNull()
    expect(base.product.volumeCbm).toBe(0)
    expect(base.suggestedQuantities).toEqual([])
  })
})
