import { createManualProductAnalysis } from '../../../src/lib/productConfirmation'
import { initialSupplierQuote } from '../../../src/lib/supplierQuote'
import { buildPurchasePlan } from '../../../src/lib/purchasePlan'
import type { AnalysisHistoryItem, AnalysisHistorySummary } from '../../../src/lib/analysisHistory'
import type { PurchaseQuoteSnapshot } from '../../../src/components/PurchaseQuoteResult'

const analysis = createManualProductAnalysis('manual://saved-workspace-fixture')
analysis.product.name = 'Botella térmica de acero inoxidable'
analysis.product.moq = 2
analysis.product.purchaseQuantity = 100
analysis.product.unitPriceUsd = 12
analysis.product.packedWeightKg = 0.5
analysis.product.volumeCbm = 0.002
analysis.product.originCountry = 'China'
analysis.product.description = 'Botella de doble pared de acero inoxidable con aislamiento por vacío'
analysis.product.supplierQuote = { ...initialSupplierQuote(12, true), minQuantity: 2, maxQuantity: 200 }
analysis.customs.ncmCandidate = '9617.00.10'
analysis.customs.classificationConfidence = 'high'
analysis.customs.dutyRatePct = 18
analysis.customs.source = 'Datos de prueba. No es una clasificación productiva.'
const capacity = { mode: 'units' as const, min: 2, max: 200, budgetUsd: 0 }
const purchasePlan = buildPurchasePlan({ costs: { originCountry: 'China', unitWeightKg: 0.5, unitVolumeCbm: 0.002, dutyRatePct: 18, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' }, quote: analysis.product.supplierQuote, moq: 2, capacity, quantity: 100, quantityApproved: true })
const selected = purchasePlan.selected!
const createdAt = '2026-11-03T12:00:00Z'
const snapshot: PurchaseQuoteSnapshot = { version: 1, quotedAt: createdAt, analysis, purchasePlan, pipelineSummary: { baseQuantity: 100, selectedMode: selected.mode, unitCostUsd: selected.cost.unitCostUsd, totalCostUsd: selected.cost.totalCostUsd, freightCostUsd: selected.cost.freightCostUsd }, conversation: [{ role: 'user', text: 'Quiero importar 100 botellas desde China.' }] }
export const workspaceItem: AnalysisHistoryItem = { id: 'saved-bottle', createdAt, updatedAt: createdAt, input: { intent: 'have_product', purpose: 'resale', entityType: 'company', signature: 'yes', sensitiveCategory: 'none', budgetMode: 'units', budgetUsd: 0, unitsMin: 2, unitsMax: 200, approvedQuantity: 100, capacity }, result: snapshot }
export const workspaceSummary: AnalysisHistorySummary = { id: workspaceItem.id, createdAt, productName: analysis.product.name, sourceUrl: null, ncmCode: analysis.customs.ncmCandidate, selectedMode: selected.mode, unitCostUsd: selected.cost.unitCostUsd, totalCostUsd: selected.cost.totalCostUsd }
export const secondSummary: AnalysisHistorySummary = { ...workspaceSummary, id: 'saved-backpack', productName: 'Mochila urbana de poliéster', ncmCode: '4202.92.00', selectedMode: 'air' }
