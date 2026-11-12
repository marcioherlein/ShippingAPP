import { describe, expect, it } from 'vitest'
import { analysisFromDiscovery } from './discoverySelection'
import { createManualProductAnalysis } from './productConfirmation'

const item = { title: 'Electric kick scooter with battery', url: 'https://www.alibaba.com/product-detail/Scooter_1600000000001.html',
  unitPriceUsd: 99, priceDisplay: '€99–120 / set', moq: 2, packedWeightKg: 12, volumeCbm: 0.3, imageUrl: 'https://example.com/scooter.jpg' }

describe('selected discovery evidence', () => {
  it('keeps the real listing and its original evidence without inventing offer, packaging or customs', () => {
    const result = analysisFromDiscovery(item)
    expect(result.sourceUrl).toBe(item.url)
    expect(result.product.name).toBe(item.title)
    expect(result.product.imageUrl).toBe(item.imageUrl)
    expect(result.product.moq).toBe(2)
    expect(result.product.unitPriceUsd).toBeNull()
    expect(result.product.supplierQuote).toBeUndefined()
    expect(result.product.supplierEvidence).toMatchObject({ priceText: '€99–120 / set', currency: null, weightText: expect.stringContaining('confirmar embalaje') })
    expect(result.product.originCountry).toBe('')
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(result.product.material).toBeNull()
    expect(result.customs.ncmCandidate).toBeNull()
    expect(result.customs.dutyRatePct).toBeNull()
    expect(result.fetched).toBe(false)
    expect(result.sourceRead?.mode).toBe('partial')
    expect(result.assumptions.join(' ')).toContain('confirmá')
  })

  it('fills an empty or generic detail identity from the selected listing', () => {
    const detail = createManualProductAnalysis(item.url)
    detail.product.name = 'Producto de Alibaba'
    const result = analysisFromDiscovery(item, detail)
    expect(result.product.name).toBe(item.title)
    expect(result.product.moq).toBe(2)
    expect(result.product.unitPriceUsd).toBeNull()
  })

  it('does not erase search evidence when a partial detail response supplies empty evidence fields', () => {
    const detail = createManualProductAnalysis(item.url)
    detail.product.supplierEvidence = { priceText: null, currency: null, quantityUnit: null, variant: null, moqText: null, weightText: null, volumeText: null }
    const result = analysisFromDiscovery(item, detail)
    expect(result.product.supplierEvidence?.priceText).toBe('€99–120 / set')
    expect(result.product.supplierEvidence?.currency).toBeNull()
    expect(result.product.supplierEvidence?.moqText).toBe('2')
    expect(result.product.supplierEvidence?.weightText).toContain('confirmar embalaje')
    expect(result.product.supplierEvidence?.volumeText).toContain('confirmar embalaje')
    expect(result.product.unitPriceUsd).toBeNull()
  })

  it('preserves detailed evidence over search candidates and does not replace an actual product name', () => {
    const detail = createManualProductAnalysis(item.url, 'Electric scooter Model X')
    detail.fetched = true
    detail.product.unitPriceUsd = 110
    detail.product.moq = 5
    detail.product.packedWeightKg = 15
    detail.product.supplierEvidence = { priceText: 'USD 110 each', currency: 'USD', quantityUnit: 'unit', variant: 'Model X', priceSource: 'Product detail page' }
    const result = analysisFromDiscovery(item, detail)
    expect(result.product.name).toBe('Electric scooter Model X')
    expect(result.product.moq).toBe(5)
    expect(result.product.packedWeightKg).toBe(15)
    expect(result.product.unitPriceUsd).toBe(110)
    expect(result.product.supplierEvidence?.priceText).toBe('USD 110 each')
    expect(result.product.supplierEvidence?.currency).toBe('USD')
    expect(result.fetched).toBe(true)
  })

  it('rejects invalid image sources and non-positive commercial candidates', () => {
    const result = analysisFromDiscovery({ ...item, imageUrl: 'javascript:alert(1)', moq: -1, unitPriceUsd: Infinity, priceDisplay: '' })
    expect(result.product.imageUrl).toBeNull()
    expect(result.product.moq).toBeNull()
    expect(result.product.supplierEvidence?.priceText).toBeNull()
  })
})
