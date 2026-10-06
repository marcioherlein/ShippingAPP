// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ImportQuoteFlow from './ImportQuoteFlow'
import type { QuotePrefill } from '../lib/hotProducts'

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
