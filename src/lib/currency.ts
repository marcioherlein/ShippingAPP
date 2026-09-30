/**
 * Currency detection and conversion to USD.
 *
 * Supplier listings (Alibaba, etc.) express prices in several currencies and
 * the extractor historically stored whatever number it found as `unitPriceUsd`
 * — treating a ¥ or € price as dollars. This module detects the currency a
 * price is expressed in and converts it to USD so the landed-cost engine always
 * works in dollars.
 *
 * IMPORTANT: the built-in rates are INDICATIVE fallbacks only. The official
 * conversion must always be confirmed by the user (audit item #1: "siempre pasa
 * los precios a DÓLAR OFICIAL … Todo lo que extraigas pedí confirmación al
 * usuario"). Callers should surface the detected currency, the rate used and
 * the resulting USD amount for explicit confirmation, and allow the rate to be
 * overridden.
 */

export type CurrencyCode =
  | 'USD'
  | 'CNY'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'HKD'
  | 'KRW'
  | 'INR'
  | 'BRL'
  | 'ARS'

export type CurrencyConfidence = 'explicit' | 'symbol' | 'assumed'

export type DetectedCurrency = {
  code: CurrencyCode
  confidence: CurrencyConfidence
  /** The token in the source text that drove detection, for transparency. */
  matchedToken: string | null
}

export type UsdConversion = {
  amountUsd: number
  sourceAmount: number
  sourceCurrency: CurrencyCode
  /** USD per 1 unit of the source currency. */
  usdPerUnit: number
  /** True when the source currency is USD and no conversion was needed. */
  isUsd: boolean
  /** True when the user must confirm the rate before it is trusted. */
  needsConfirmation: boolean
  note: string
}

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: 'Dólar estadounidense',
  CNY: 'Yuan chino (RMB)',
  EUR: 'Euro',
  GBP: 'Libra esterlina',
  JPY: 'Yen japonés',
  HKD: 'Dólar de Hong Kong',
  KRW: 'Won surcoreano',
  INR: 'Rupia india',
  BRL: 'Real brasileño',
  ARS: 'Peso argentino',
}

/**
 * Indicative USD-per-unit rates. Deliberately rough and flagged: they exist so
 * a foreign price is never silently mistaken for USD, NOT to quote a precise
 * transactional rate. The user confirms/overrides before the number is trusted.
 */
export const INDICATIVE_USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  CNY: 0.14,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  HKD: 0.128,
  KRW: 0.00073,
  INR: 0.012,
  BRL: 0.19,
  ARS: 0.001,
}

// Ordered so more specific tokens (US$, R$, RMB) win over bare symbols ($).
const EXPLICIT_CODE_TOKENS: Array<{ token: RegExp; code: CurrencyCode }> = [
  { token: /\bUS\$?\s?D?\b/i, code: 'USD' },
  { token: /\bUSD\b/i, code: 'USD' },
  { token: /\bRMB\b/i, code: 'CNY' },
  { token: /\bCNY\b/i, code: 'CNY' },
  { token: /\bEUR\b/i, code: 'EUR' },
  { token: /\bGBP\b/i, code: 'GBP' },
  { token: /\bJPY\b/i, code: 'JPY' },
  { token: /\bHKD\b/i, code: 'HKD' },
  { token: /\bKRW\b/i, code: 'KRW' },
  { token: /\bINR\b/i, code: 'INR' },
  { token: /\bBRL\b/i, code: 'BRL' },
  { token: /\bARS\b/i, code: 'ARS' },
]

// R$ must be tested before a bare $; ¥ is shared by CNY/JPY (CNY on Alibaba).
const SYMBOL_TOKENS: Array<{ token: string; code: CurrencyCode }> = [
  { token: 'R$', code: 'BRL' },
  { token: '€', code: 'EUR' },
  { token: '£', code: 'GBP' },
  { token: '¥', code: 'CNY' },
  { token: '₩', code: 'KRW' },
  { token: '₹', code: 'INR' },
  { token: '$', code: 'USD' },
]

/**
 * Detect the currency a price string is expressed in.
 * @param text Raw text near the price (e.g. "US $12.50", "¥85.00 / piece").
 * @param assumed Currency to fall back to when nothing is detected. Alibaba
 *   defaults to USD, but callers can pass a different market default.
 */
export function detectCurrency(text: string | null | undefined, assumed: CurrencyCode = 'USD'): DetectedCurrency {
  const raw = (text || '').trim()
  if (raw) {
    for (const { token, code } of EXPLICIT_CODE_TOKENS) {
      const match = raw.match(token)
      if (match) return { code, confidence: 'explicit', matchedToken: match[0].trim() }
    }
    for (const { token, code } of SYMBOL_TOKENS) {
      if (raw.includes(token)) return { code, confidence: 'symbol', matchedToken: token }
    }
  }
  return { code: assumed, confidence: 'assumed', matchedToken: null }
}

export function isSupportedCurrency(code: string | null | undefined): code is CurrencyCode {
  return !!code && Object.prototype.hasOwnProperty.call(INDICATIVE_USD_RATES, code)
}

/**
 * Convert an amount in a source currency to USD.
 * @param rateOverride USD per 1 unit of the source currency, when the user (or
 *   a live FX source) supplies one. Falls back to the indicative rate.
 */
export function convertToUsd(
  amount: number,
  sourceCurrency: CurrencyCode,
  rateOverride?: number | null,
): UsdConversion {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0
  const isUsd = sourceCurrency === 'USD'
  const usdPerUnit = isUsd
    ? 1
    : Number.isFinite(rateOverride) && (rateOverride as number) > 0
      ? (rateOverride as number)
      : INDICATIVE_USD_RATES[sourceCurrency] ?? 1
  const usedFallback = !isUsd && !(Number.isFinite(rateOverride) && (rateOverride as number) > 0)
  return {
    amountUsd: Math.round(safeAmount * usdPerUnit * 100) / 100,
    sourceAmount: safeAmount,
    sourceCurrency,
    usdPerUnit,
    isUsd,
    needsConfirmation: !isUsd,
    note: isUsd
      ? 'El precio ya está expresado en dólares.'
      : usedFallback
        ? `Convertido desde ${CURRENCY_LABELS[sourceCurrency]} con una tasa indicativa (${usdPerUnit} USD por unidad). Confirmá o ajustá el tipo de cambio antes de usarlo.`
        : `Convertido desde ${CURRENCY_LABELS[sourceCurrency]} a ${usdPerUnit} USD por unidad.`,
  }
}

/**
 * Detect + convert in one step, from a price string like "¥85 / piece".
 * Returns the numeric amount parsed alongside the conversion, or null when no
 * usable number is present.
 */
export function priceStringToUsd(
  text: string | null | undefined,
  assumed: CurrencyCode = 'USD',
  rateOverride?: number | null,
): (UsdConversion & { detection: DetectedCurrency }) | null {
  const detection = detectCurrency(text, assumed)
  const numberMatch = (text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  if (!numberMatch) return null
  const amount = Number(numberMatch[0])
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { ...convertToUsd(amount, detection.code, rateOverride), detection }
}
