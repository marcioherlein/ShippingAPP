import { isSupportedCurrency, type CurrencyCode } from './currency'

export type SupplierPriceTier = { amount: number; minQuantity: number; maxQuantity: number | null }

/** Commercial evidence confirmed for one variant and quantity band. */
export type SupplierQuote = {
  amount: number
  currency: CurrencyCode | ''
  basis: 'unit' | 'pack' | ''
  unitsPerPack: number
  variant: string
  minQuantity: number
  maxQuantity: number | null
  usdPerCurrency: number
  fxSource: string
  fxDate: string
  additionalTiers?: SupplierPriceTier[]
}

export function supplierQuotePrice(quote: SupplierQuote, quantity?: number) {
  if (!Number.isFinite(quote.amount) || quote.amount <= 0 || !isSupportedCurrency(quote.currency) || !['unit', 'pack'].includes(quote.basis) || !quote.variant.trim()) return null
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) return null
  if (!Number.isInteger(quote.minQuantity) || quote.minQuantity < 1) return null
  if (quote.maxQuantity !== null && (!Number.isInteger(quote.maxQuantity) || quote.maxQuantity < quote.minQuantity)) return null
  const tiers = [quote, ...(quote.additionalTiers || [])].sort((a, b) => a.minQuantity - b.minQuantity)
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    if (!Number.isFinite(tier.amount) || tier.amount <= 0 || !Number.isInteger(tier.minQuantity) || tier.minQuantity < 1) return null
    if (tier.maxQuantity !== null && (!Number.isInteger(tier.maxQuantity) || tier.maxQuantity < tier.minQuantity)) return null
    if (i > 0 && (tiers[i - 1].maxQuantity === null || tiers[i - 1].maxQuantity! >= tier.minQuantity)) return null
  }
  const selected = quantity ? tiers.find(tier => quantity >= tier.minQuantity && (tier.maxQuantity === null || quantity <= tier.maxQuantity)) : quote
  if (!selected) return null
  const pack = quote.basis === 'pack' ? quote.unitsPerPack : 1
  if (!Number.isInteger(pack) || pack < 1) return null
  const rate = quote.currency === 'USD' ? 1 : quote.usdPerCurrency
  if (!Number.isFinite(rate) || rate <= 0) return null
  if (quote.currency !== 'USD' && (!quote.fxSource.trim() || !validFxDate(quote.fxDate))) return null
  const price = selected.amount * rate / pack
  return Number.isFinite(price) && price > 0 ? price : null
}

function validFxDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function initialSupplierQuote(amount: number, manual = false): SupplierQuote {
  return { amount, currency: manual ? 'USD' : '', basis: manual ? 'unit' : '', unitsPerPack: 1, variant: manual ? 'Producto descripto' : '', minQuantity: 1, maxQuantity: null, usdPerCurrency: 0, fxSource: '', fxDate: '' }
}
