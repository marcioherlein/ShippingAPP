// Browser-only fixture: real calculation and dashboard, no backend or account claim.
import '../../../src/styles.css'
import '../../../src/styles/regulatory.css'
import '../../../src/styles/entry-simplification.css'
import '../../../src/styles/visual-consistency.css'
import '../../../src/styles/progressive-product-confirmation.css'
import '../../../src/styles/design-system.css'
import '../../../src/styles/journey-refinement.css'
import '../../../src/styles/p2-semantic-polish.css'
import '../../../src/styles/accessibility.css'
import '../../../src/styles/ncm-clarification.css'
import '../../../src/styles/output-redesign.css'
import '../../../src/styles/result-dossier.css'
import '../../../src/styles/product-quality.css'
import '../../../src/styles/ds-select.css'
import '../../../src/styles/dark-mode.css'
import '../../../src/styles/live-flow.css'
import '../../../src/styles/app-header.css'
import '../../../src/styles/guided-case.css'
import '../../../src/styles/workspace.css'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PurchaseQuoteSummary } from '../../../src/components/PurchaseQuoteResult'
import { createManualProductAnalysis } from '../../../src/lib/productConfirmation'
import { initialSupplierQuote } from '../../../src/lib/supplierQuote'
import { buildPurchasePlan } from '../../../src/lib/purchasePlan'

const heavy = new URLSearchParams(location.search).has('heavy')
const battery = new URLSearchParams(location.search).has('battery')
const product = createManualProductAnalysis('manual://dashboard-fixture')
product.product.name = battery ? 'Monopatín eléctrico para transporte personal' : 'Botella de acero para bebidas'
product.product.moq = 2
product.product.packedWeightKg = heavy ? 1 : 0.2
product.product.volumeCbm = 0.001
product.product.originCountry = 'China'
product.product.description = battery ? 'Batería de litio integrada, motor eléctrico' : 'Botella reutilizable de acero inoxidable'
product.product.supplierQuote = { ...initialSupplierQuote(10, true), minQuantity: 2, maxQuantity: 200 }
product.customs.ncmCandidate = battery ? '8711.60.00' : '7323.93.00'
product.customs.source = 'Catálogo de prueba del dashboard; no acredita clasificación automática ni proveedor real.'

function Dashboard() {
  const [quantity, setQuantity] = useState(heavy ? 100 : 10)
  const plan = buildPurchasePlan({ costs: { originCountry: 'China', unitWeightKg: product.product.packedWeightKg, unitVolumeCbm: product.product.volumeCbm!, dutyRatePct: 16, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' }, quote: product.product.supplierQuote!, moq: 2, capacity: { mode: 'units', min: 2, max: 200, budgetUsd: 0 }, quantity, quantityApproved: true, cargoText: product.product.description || '' })
  const selected = plan.selected!
  return <main className="journey-app workspace-app"><header className="app-header"><a className="app-wordmark" href="#dashboard">GlobalShipping</a><nav aria-label="Navegación principal"><a href="#dashboard">Resultado</a></nav></header><section className="journey-hero"><h1>Tu panel de resultados</h1></section><div id="dashboard"><PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis: product, pipelineSummary: { baseQuantity: quantity, selectedMode: selected.mode, totalCostUsd: selected.cost.totalCostUsd, unitCostUsd: selected.cost.unitCostUsd, freightCostUsd: selected.cost.freightCostUsd }, purchasePlan: plan, conversation: [] }} onChoose={setQuantity} /></div></main>
}
createRoot(document.getElementById('root')!).render(<Dashboard />)
