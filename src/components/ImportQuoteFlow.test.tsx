// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ImportQuoteFlow from './ImportQuoteFlow'
import type { QuotePrefill } from '../lib/hotProducts'
import { initialSupplierQuote } from '../lib/supplierQuote'
import { compareLandedCost } from '../lib/landedCostEngine'
import { usd } from '../lib/format'

const prefill: QuotePrefill = {
  productName: 'Raqueta de aluminio', originCountry: 'China', quantity: 20,
  unitPriceUsd: 10, unitWeightKg: 0.5, unitVolumeCbm: 0.01, moq: 0,
  budgetUsd: 0, monthlyDemand: 0, localSellPriceUsd: 50,
  sensitiveCategory: 'none', sourceLabel: 'Oferta confirmada',
  ncmCode: '9506.51.00', classificationConfidence: 'high', dutyRatePct: 35,
  marketStatus: 'live', marketPriceArs: 50000, marketComparableCount: 3,
  marketSource: 'Publicaciones comparables', fxArsPerUsd: 1000,
}

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
async function render(value = prefill, review = false) {
  await act(async () => root.render(<ImportQuoteFlow prefill={value} setup={{ purpose: 'resale', entityType: 'company', hasImporterSignature: 'yes' }} onReviewProduct={review ? () => {} : undefined} />))
}
function input(label: string) {
  const field = [...container.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === label)
  const element = field?.querySelector('input')
  if (!element) throw new Error(`Missing input: ${label}`)
  return element
}
async function fill(label: string, value: string) {
  const element = input(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('quotation evidence in rendered results', () => {
  it('recalculates confirmed tier, freight, taxes and unit cost when adopting a recommended quantity', async () => {
    const supplierQuote = { ...initialSupplierQuote(10, true), maxQuantity: 49, additionalTiers: [{ minQuantity: 50, maxQuantity: 99, amount: 5 }] }
    await act(async () => root.render(<ImportQuoteFlow prefill={prefill} setup={{ purpose: 'resale', entityType: 'company', hasImporterSignature: 'yes' }} supplierQuote={supplierQuote} purchaseRange={{ min: 60, max: 60 }} />))
    expect(input('Precio FOB unitario').value).toBe('10')
    const button = [...container.querySelectorAll('button')].find(el => el.textContent === 'Usar esta cantidad en la simulación')!
    await act(async () => button.click())
    expect(input('Cantidad base').value).toBe('60')
    expect(input('Precio FOB unitario').value).toBe('5')
    const expected = compareLandedCost({ originCountry: 'China', quantity: 60, unitPriceUsd: 5, unitWeightKg: 0.5, unitVolumeCbm: 0.01, dutyRatePct: 35, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' })
    expect(expected.bestMode).not.toBeNull()
    expect(container.querySelector('.result-hero-number')?.textContent).toBe(usd(expected.modes[expected.bestMode!].unitCostUsd))
    await fill('Cantidad base', '100')
    expect(container.querySelector('.result-hero-number')).toBeNull()
    expect(container.textContent).toContain('La oferta confirmada no cubre esta cantidad')
    await fill('Cantidad base', '60')
    expect(container.querySelector('.result-hero-number')?.textContent).toBe(usd(expected.modes[expected.bestMode!].unitCostUsd))
  })
  it('keeps absent MOQ empty and allows clearing a known supplier minimum', async () => {
    await render()
    expect(input('MOQ proveedor').value).toBe('')
    await fill('MOQ proveedor', '10')
    expect(input('MOQ proveedor').value).toBe('10')
    await fill('MOQ proveedor', '')
    expect(input('MOQ proveedor').value).toBe('')
  })

  it('preserves unknown MOQ in a confirmed result instead of inventing a minimum', async () => {
    await render(prefill, true)
    const field = [...container.querySelectorAll('.field')].find(el => el.querySelector('span')?.textContent === 'MOQ proveedor')!
    expect(field.textContent).toContain('Sin dato')
    expect(field.querySelector('input')).toBeNull()
  })

  it('relabels an edited live benchmark as a manual estimate and retains its stated source', async () => {
    await render()
    expect(container.querySelector('.market-provenance')).not.toBeNull()
    await fill('Precio venta local (USD)', '120')
    expect(container.querySelector('.market-provenance')).toBeNull()
    expect(container.querySelector('.market-estimate-hero')?.textContent).toContain('Sin fuente indicada')
    await fill('Fuente del precio local', 'Cotización del distribuidor')
    const evidence = container.querySelector('.market-estimate-hero')?.textContent
    expect(evidence).toContain('Cotización del distribuidor')
    expect(evidence).toContain('No es un benchmark confirmado')
    expect(evidence).not.toContain('1.6')
  })
})
