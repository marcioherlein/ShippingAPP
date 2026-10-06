/**
 * Dossier fixture — renders ImportQuoteFlow with pre-set props for screenshot
 * capture without needing a live classification pipeline or Clerk auth.
 *
 * Reads `?fixture=provisional` (default) or `?fixture=confirmed` from the URL.
 * All CSS is imported here so the full design-system token scope is active.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'

// Full stylesheet import mirrors main.tsx so every token is in scope.
import './styles.css'
import './styles/regulatory.css'
import './styles/entry-simplification.css'
import './styles/visual-consistency.css'
import './styles/progressive-product-confirmation.css'
import './styles/design-system.css'
import './styles/journey-refinement.css'
import './styles/p2-semantic-polish.css'
import './styles/accessibility.css'
import './styles/ncm-clarification.css'
import './styles/output-redesign.css'
import './styles/result-dossier.css'
import './styles/product-quality.css'
import './styles/ds-select.css'
import './styles/dark-mode.css'
import './styles/live-flow.css'

import ImportQuoteFlow from './components/ImportQuoteFlow'
import type { QuotePrefill } from './lib/hotProducts'
import type { JourneyQuoteSetup } from './components/ImportQuoteFlow'

const BASE: QuotePrefill = {
  productName: 'Raqueta de tenis de aluminio para adultos',
  originCountry: 'China',
  quantity: 100,
  unitPriceUsd: 28,
  unitWeightKg: 0.42,
  unitVolumeCbm: 0.008,
  moq: 50,
  budgetUsd: 0,
  monthlyDemand: 40,
  localSellPriceUsd: 0,
  fxArsPerUsd: 1050,
  fxSourceDate: '2026-09-30',
  sensitiveCategory: 'none',
  sourceLabel: 'Datos de prueba — fixture',
  statisticsRatePct: 3,
  vatRatePct: 21,
  vatAdditionalRatePct: 20,
  gainsRatePct: 6,
  iibbRatePct: 2.5,
  capitalGoodEligible: false,
  customsMissingFacts: [],
  customsRationale: [],
}

const PROVISIONAL: QuotePrefill = {
  ...BASE,
  ncmCode: null,
  classificationConfidence: 'low',
  dutyRatePct: 35,
  provisional: true,
  provisionalCode: '9506.51.00',
  provisionalLabel: 'Raquetas de tenis, incluso sin cordaje',
  provisionalBasis:
    'Derecho más alto entre los candidatos de la shortlist (conservador). Verificá la posición antes de operar.',
  marketStatus: 'estimate',
  marketPriceArs: null,
  marketComparableCount: 0,
}

const CONFIRMED: QuotePrefill = {
  ...BASE,
  ncmCode: '9506.51.00',
  classificationConfidence: 'high',
  dutyRatePct: 35,
  provisional: false,
  marketStatus: 'live',
  marketPriceArs: 89990,
  marketP25Ars: 72000,
  marketMedianArs: 89990,
  marketP75Ars: 115000,
  marketComparableCount: 8,
  marketConfidence: 82,
  marketSource: 'MercadoLibre Argentina',
  localSellPriceUsd: 89990 / 1050,
  marketComparables: [
    { id: 'MLA1', title: 'Raqueta Wilson Pro Staff 97 2026', priceArs: 79990, permalink: 'https://articulo.mercadolibre.com.ar/MLA-1' },
    { id: 'MLA2', title: 'Raqueta Babolat Pure Drive Team', priceArs: 89990, permalink: 'https://articulo.mercadolibre.com.ar/MLA-2' },
    { id: 'MLA3', title: 'Raqueta Head Speed MP 2026', priceArs: 95000, permalink: 'https://articulo.mercadolibre.com.ar/MLA-3' },
    { id: 'MLA4', title: 'Raqueta aluminio principiante', priceArs: 24990 },
  ],
}

const SETUP: JourneyQuoteSetup = {
  budgetUsd: 0,
  quantity: 100,
  purpose: 'resale',
  entityType: 'company',
  hasImporterSignature: 'yes',
  sensitiveCategory: 'none',
}

const fixture = new URLSearchParams(window.location.search).get('fixture') ?? 'provisional'
const prefill = fixture === 'confirmed' ? CONFIRMED : PROVISIONAL

const root = document.getElementById('root')!
createRoot(root).render(
  <main className="journey-app" id="home">
    <section className="journey-calculator-section" style={{ padding: '24px 0' }}>
      <ImportQuoteFlow prefill={prefill} setup={SETUP} />
    </section>
  </main>,
)
