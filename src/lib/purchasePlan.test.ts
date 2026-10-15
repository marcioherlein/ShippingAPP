import { describe, expect, it } from 'vitest'
import { buildPurchasePlan, purchaseScenario, type PurchasePlanInput } from './purchasePlan'
import { initialSupplierQuote } from './supplierQuote'
function input(): PurchasePlanInput { return { costs: { originCountry:'China',unitWeightKg:0.1,unitVolumeCbm:0.001,dutyRatePct:16,purpose:'resale',entityType:'company',hasImporterSignature:true,sensitiveCategory:'none' },quote:initialSupplierQuote(10,true),moq:0,capacity:{mode:'unknown',budgetUsd:0,min:1,max:1} } }
describe('purchase policy uses confirmed bands and the full landed-cost engine', () => {
  it('exploration starts at one, and any improvement has identical modeled freight and lower unit cost', () => {
    const value=input(); const plan=buildPurchasePlan(value)
    expect(plan.selected?.quantity).toBe(1)
    expect(plan.single?.cost.totalCostUsd).toBe(plan.selected?.cost.totalCostUsd)
    expect(plan.improvement).not.toBeNull()
    expect(plan.improvement!.cost.freightCostUsd).toBe(plan.selected!.cost.freightCostUsd)
    expect(plan.improvement!.mode).toBe(plan.selected!.mode)
    expect(plan.improvement!.cost.unitCostUsd).toBeLessThan(plan.selected!.cost.unitCostUsd)
    expect(plan.improvement!.cost.totalCostUsd).toBeGreaterThan(plan.selected!.cost.totalCostUsd)
  })
  it('preserves requested units and requires explicit approval to leave the original range', () => {
    const value=input(); value.capacity={mode:'units',budgetUsd:0,min:3,max:3}
    expect(buildPurchasePlan(value).selected?.quantity).toBe(3)
    expect(buildPurchasePlan({...value,quantity:5}).selected).toBeNull()
    expect(buildPurchasePlan({...value,quantity:5,quantityApproved:true}).selected?.quantity).toBe(5)
  })
  it('does not apply a wholesale MOQ/pack quote to a fictitious one-unit order', () => {
    const value=input(); value.moq=10; value.quote={...value.quote,basis:'pack',unitsPerPack:5,amount:50}
    const plan=buildPurchasePlan(value)
    expect(plan.single).toBeNull(); expect(plan.singleReason).toContain('mínimo de 10')
    expect(plan.selected?.quantity).toBe(10)
    expect(purchaseScenario(value,11)).toBeNull()
  })
  it('finds an affordable discounted band and counts taxes/freight inside the budget', () => {
    const value=input(); value.capacity={mode:'budget',budgetUsd:5000,min:1,max:1}
    value.quote={...value.quote,amount:1000,maxQuantity:99,additionalTiers:[{minQuantity:100,maxQuantity:300,amount:10}]}
    const plan=buildPurchasePlan(value)
    expect(plan.selected?.quantity).toBeGreaterThanOrEqual(100)
    expect(plan.selected!.cost.totalCostUsd).toBeLessThanOrEqual(5000)
    expect(plan.selected!.cost.totalCostUsd).toBeGreaterThan(plan.selected!.cost.fobUsd)
    expect(plan.selected!.priceUsd).toBe(10)
    expect(plan.improvement?.cost.totalCostUsd ?? 0).toBeLessThanOrEqual(5000)
  })
  it('reports an insufficient budget without silently exceeding it', () => {
    const value=input(); value.capacity={mode:'budget',budgetUsd:1,min:1,max:1}
    const plan=buildPurchasePlan(value)
    expect(plan.selected).toBeNull(); expect(plan.error).toContain('no alcanza')
  })
})
