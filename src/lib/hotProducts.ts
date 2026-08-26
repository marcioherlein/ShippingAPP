import { hotProducts, type HotProduct } from '../data/hotProducts'

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function allowedProductHost(host: string) {
  const normalized = host.toLowerCase()
  return normalized === 'alibaba.com' || normalized.endsWith('.alibaba.com')
}

function allowedImageHost(host: string) {
  const normalized = host.toLowerCase()
  return normalized === 'alicdn.com'
    || normalized.endsWith('.alicdn.com')
    || normalized === 'alibaba.com'
    || normalized.endsWith('.alibaba.com')
    || normalized === 'images.unsplash.com'
    || normalized === 'source.unsplash.com'
}

export function normalizeAlibabaProductUrl(raw: string | null | undefined, title = '') {
  const fallback = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(title || 'wholesale product')}`
  const candidate = (raw || fallback).trim()
  if (!candidate) return fallback
  try {
    const url = new URL(candidate.startsWith('//') ? `https:${candidate}` : candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback
    if (!allowedProductHost(url.hostname)) return fallback
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return fallback
  }
}

export function normalizeProductImageUrl(raw: string | null | undefined) {
  const candidate = (raw || '').trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate.startsWith('//') ? `https:${candidate}` : candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!allowedImageHost(url.hostname)) return null
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

export function proxiedImageUrl(raw: string | null | undefined) {
  const normalized = normalizeProductImageUrl(raw)
  return normalized ? `/api/image-proxy?url=${encodeURIComponent(normalized)}` : null
}

export function dedupeHotProducts(products: HotProduct[]) {
  const seen = new Set<string>()
  const unique: HotProduct[] = []
  for (const product of products) {
    const key = product.id || normalizeKey(`${product.title}-${product.supplierName}`)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({
      ...product,
      productUrl: normalizeAlibabaProductUrl(product.productUrl, product.title),
      imageUrl: normalizeProductImageUrl(product.imageUrl),
    })
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
