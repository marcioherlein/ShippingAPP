export type FreightRateRecord = {
  id: string
  provider: string
  mode: 'air' | 'sea_lcl'
  origin: string
  destination: string
  currency: 'USD'
  rate: number
  rateUnit: 'kg' | 'wm'
  minimumUsd: number
  originChargesUsd: number
  destinationChargesUsd: number
  otherSurchargesUsd: number
  validFrom: string
  validTo: string
  sourceType: 'quote' | 'rate_sheet' | 'benchmark'
  receivedAt: string
}

export type FreightRateStatus = 'valid' | 'expired' | 'future' | 'invalid'

export function freightRateStatus(rate: FreightRateRecord, asOfIso: string): FreightRateStatus {
  if (!rate.id || !rate.provider || !rate.origin || !rate.destination) return 'invalid'
  if (rate.rate < 0 || rate.minimumUsd < 0 || rate.originChargesUsd < 0 || rate.destinationChargesUsd < 0 || rate.otherSurchargesUsd < 0) return 'invalid'
  if (rate.mode === 'air' && rate.rateUnit !== 'kg') return 'invalid'
  if (rate.mode === 'sea_lcl' && rate.rateUnit !== 'wm') return 'invalid'
  const asOf = Date.parse(asOfIso)
  const from = Date.parse(rate.validFrom)
  const to = Date.parse(rate.validTo)
  if (![asOf, from, to].every(Number.isFinite) || from > to) return 'invalid'
  if (asOf < from) return 'future'
  if (asOf > to) return 'expired'
  return 'valid'
}

export function quoteFixedCharges(rate: FreightRateRecord) {
  return rate.originChargesUsd + rate.destinationChargesUsd + rate.otherSurchargesUsd
}
