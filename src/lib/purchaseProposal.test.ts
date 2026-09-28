import { expect, it } from 'vitest'
import { proposePurchase } from './purchaseProposal'
const input = { originCountry: 'China', unitPriceUsd: 10, unitWeightKg: 0.2, unitVolumeCbm: 0.001, dutyRatePct: 16, purpose: 'resale' as const, entityType: 'company' as const, hasImporterSignature: true, sensitiveCategory: 'none' as const }
it('proposes only a full landed cost inside the budget and confirmed price tier', () => {
 const result = proposePurchase(input, 5000, 50, 100)
 expect(result?.quantity).toBeGreaterThanOrEqual(50)
 expect(result?.quantity).toBeLessThanOrEqual(100)
 expect(result?.totalUsd).toBeLessThanOrEqual(5000)
 expect(result?.totalUsd).toBeGreaterThan((result?.quantity || 0) * 10)
 expect(proposePurchase(input, 5, 50)).toBeNull()
})
