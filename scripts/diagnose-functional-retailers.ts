import { cleanText } from '../worker/catalogMatch'
import { functionalComparableScore } from '../worker/functionalMarketMatch'
import { buildArgentinaFunctionalMarketQuery } from '../worker/functionalMarketQuery'
import { passesFunctionalTraitEvidence } from '../worker/functionalTraitEvidence'
import type { ArgentinaMarketCandidate } from '../worker/marketProviderContracts'
import type { MlResult } from '../worker/marketTypes'
import { createArgentinaDirectRetailerProvider } from '../worker/vtexRetailerMarketProvider'

const probes = [
  { id: 'airfryer', productName: 'Freidora de aire 6L 1700W sin marca', category: 'freidora de aire' },
  { id: 'smartwatch', productName: 'Smartwatch GPS 1.4 pulgadas sin marca', category: 'smartwatch' },
  { id: 'tennis', productName: 'Raqueta de tenis grafito 300g sin marca', category: 'raqueta de tenis' },
  { id: 'dumbbell', productName: 'Mancuerna ajustable 20kg sin marca', category: 'mancuerna' },
]

function asMatcherItem(candidate: ArgentinaMarketCandidate): MlResult {
  return {
    id: candidate.id,
    title: candidate.title,
    price: candidate.priceArs,
    currency_id: 'ARS',
    condition: candidate.condition,
    category_id: candidate.categoryId,
    catalog_product_id: candidate.catalogProductId,
    permalink: candidate.permalink,
    attributes: candidate.attributes,
  }
}

function summarizeCandidates(candidates: ArgentinaMarketCandidate[], productName: string, category: string) {
  const traitPassed = candidates.filter((candidate) => passesFunctionalTraitEvidence(candidate, productName))
  const scored = traitPassed.map((candidate) => ({
    candidate,
    score: functionalComparableScore(asMatcherItem(candidate), productName, category),
  }))
  const matched = scored.filter(({ score }) => score >= 55)
  const strict = scored.filter(({ score }) => score >= 65)
  return {
    raw: candidates.length,
    traitPassed: traitPassed.length,
    matched55: matched.length,
    strict65: strict.length,
    top: scored
      .sort((left, right) => right.score - left.score)
      .slice(0, 10)
      .map(({ candidate, score }) => ({
        score,
        id: candidate.id,
        title: candidate.title,
        attributes: (candidate.attributes || []).slice(0, 8).map((row) => `${row.name || ''}=${row.value_name || ''}`),
      })),
  }
}

const provider = createArgentinaDirectRetailerProvider({ requestTimeoutMs: 8000 })
const report: Record<string, unknown> = {}

for (const probe of probes) {
  const strictQuery = buildArgentinaFunctionalMarketQuery(probe.productName, probe.category)
  const categoryQuery = (buildArgentinaFunctionalMarketQuery('', probe.category) || cleanText(probe.category)).trim()
  const stages: Record<string, unknown> = {}
  for (const [stage, query] of [['strict', strictQuery], ['category', categoryQuery]] as const) {
    try {
      const result = await provider.discover({ query, productName: probe.productName, category: probe.category })
      stages[stage] = {
        query,
        sourceLabel: result.sourceLabel,
        ...summarizeCandidates(result.candidates || [], probe.productName, probe.category),
        warnings: result.warnings || [],
      }
    } catch (error) {
      stages[stage] = {
        query,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  report[probe.id] = {
    productName: probe.productName,
    category: probe.category,
    stages,
  }
}

console.log(JSON.stringify({
  status: 'functional_retailer_diagnostic',
  generatedAt: new Date().toISOString(),
  probes: report,
}, null, 2))
