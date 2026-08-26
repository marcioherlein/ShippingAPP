import { describe, expect, it } from 'vitest'
import { auditImportUserPath } from './importUxAgent'

describe('guided import UX audit agent', () => {
  it('starts with product selection when nothing is loaded', () => {
    const audit = auditImportUserPath({
      hasSelectedProduct: false,
      hasSupplierData: false,
      hasBudget: false,
      hasQuantitySignal: false,
      hasNcmCandidate: false,
    })

    expect(audit.canCalculate).toBe(false)
    expect(audit.nextAction.id).toBe('product')
    expect(audit.steps[0].status).toBe('active')
    expect(audit.steps[1].status).toBe('blocked')
  })

  it('asks for NCM facts after supplier data exists but no NCM candidate exists', () => {
    const audit = auditImportUserPath({
      hasSelectedProduct: true,
      hasSupplierData: true,
      hasBudget: false,
      hasQuantitySignal: false,
      hasNcmCandidate: false,
      productName: 'Mini proyector 1080p',
      missingProductFacts: ['si tiene WiFi', 'tipo de lámpara', 'uso doméstico o profesional'],
    })

    const ncm = audit.steps.find((step) => step.id === 'ncm')
    expect(ncm?.status).toBe('active')
    expect(ncm?.helper).toContain('si tiene WiFi')
    expect(audit.ncmExplanation).toContain('material')
  })

  it('allows calculation only when supplier data, budget and quantity signal are present', () => {
    const audit = auditImportUserPath({
      hasSelectedProduct: true,
      hasSupplierData: true,
      hasBudget: true,
      hasQuantitySignal: true,
      hasNcmCandidate: false,
      productName: 'Auriculares TWS',
    })

    expect(audit.canCalculate).toBe(true)
    expect(audit.nextAction.id).toBe('ncm')
    expect(audit.steps.find((step) => step.id === 'calculate')?.status).toBe('active')
  })
})
