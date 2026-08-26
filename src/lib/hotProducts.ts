import { hotProducts, type HotProduct } from '../data/hotProducts'

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function dedupeHotProducts(products: HotProduct[]) {
  const seen = new Set<string>()
  const unique: HotProduct[] = []
  for (const product of products) {
    const key = product.id || normalizeKey(`${product.title}-${product.supplierName}`)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(product)
  }
  return unique
}

export function getCachedHotProducts(limit = 8) {
  return dedupeHotProducts(hotProducts)
    .filter((product) => product.unitPriceUsd > 0 && product.moq > 0)
    .slice(0, Math.max(0, limit))
}

export function hotProductToQuotePrefill(product: HotProduct) {
  return {
    productName: product.title,
    originCountry: product.originCountry,
    quantity: product.moq,
    unitPriceUsd: product.unitPriceUsd,
    unitWeightKg: product.unitWeightKg,
    unitVolumeCbm: product.unitVolumeCbm,
    moq: product.moq,
    budgetUsd: product.budgetUsd,
    monthlyDemand: product.monthlyDemand,
    localSellPriceUsd: product.localSellPriceUsd,
    sensitiveCategory: product.sensitiveCategory,
    sourceLabel: 'Hot product cacheado',
  }
}

export type QuotePrefill = ReturnType<typeof hotProductToQuotePrefill>
