import { describe, expect, it } from 'vitest'
import {
  convertToUsd,
  detectCurrency,
  isSupportedCurrency,
  priceStringToUsd,
} from './currency'

describe('currency detection', () => {
  it('detects explicit currency codes over bare symbols', () => {
    expect(detectCurrency('US $12.50').code).toBe('USD')
    expect(detectCurrency('USD 12.50').code).toBe('USD')
    expect(detectCurrency('RMB 85').code).toBe('CNY')
    expect(detectCurrency('CNY 85').code).toBe('CNY')
    expect(detectCurrency('EUR 9,90').code).toBe('EUR')
  })

  it('detects currency symbols', () => {
    expect(detectCurrency('¥85.00 / piece')).toMatchObject({ code: 'CNY', confidence: 'symbol' })
    expect(detectCurrency('€9.90')).toMatchObject({ code: 'EUR', confidence: 'symbol' })
    expect(detectCurrency('£7.50')).toMatchObject({ code: 'GBP', confidence: 'symbol' })
    expect(detectCurrency('R$ 40')).toMatchObject({ code: 'BRL', confidence: 'symbol' })
  })

  it('prefers R$ over a bare dollar sign', () => {
    expect(detectCurrency('R$ 40').code).toBe('BRL')
  })

  it('falls back to the assumed currency when nothing is detected', () => {
    expect(detectCurrency('12.50')).toMatchObject({ code: 'USD', confidence: 'assumed', matchedToken: null })
    expect(detectCurrency('85', 'CNY')).toMatchObject({ code: 'CNY', confidence: 'assumed' })
    expect(detectCurrency('')).toMatchObject({ code: 'USD', confidence: 'assumed' })
  })
})

describe('conversion to USD', () => {
  it('passes USD through untouched and needs no confirmation', () => {
    const result = convertToUsd(12.5, 'USD')
    expect(result.amountUsd).toBe(12.5)
    expect(result.isUsd).toBe(true)
    expect(result.needsConfirmation).toBe(false)
  })

  it('converts a foreign currency and flags it for confirmation', () => {
    const result = convertToUsd(100, 'CNY')
    expect(result.amountUsd).toBe(14)
    expect(result.isUsd).toBe(false)
    expect(result.needsConfirmation).toBe(true)
    expect(result.usdPerUnit).toBe(0.14)
  })

  it('honours an explicit rate override', () => {
    const result = convertToUsd(100, 'CNY', 0.15)
    expect(result.amountUsd).toBe(15)
    expect(result.usdPerUnit).toBe(0.15)
  })

  it('falls back to the indicative rate for a non-positive override', () => {
    expect(convertToUsd(100, 'EUR', 0).usdPerUnit).toBe(1.08)
    expect(convertToUsd(100, 'EUR', null).usdPerUnit).toBe(1.08)
  })

  it('never returns a negative amount for junk input', () => {
    expect(convertToUsd(-5, 'CNY').amountUsd).toBe(0)
    expect(convertToUsd(Number.NaN, 'CNY').amountUsd).toBe(0)
  })
})

describe('priceStringToUsd', () => {
  it('parses number and currency together', () => {
    const result = priceStringToUsd('¥85.00 / piece')
    expect(result?.sourceCurrency).toBe('CNY')
    expect(result?.sourceAmount).toBe(85)
    expect(result?.amountUsd).toBe(11.9)
    expect(result?.needsConfirmation).toBe(true)
  })

  it('handles thousands separators', () => {
    const result = priceStringToUsd('US $1,250.00')
    expect(result?.sourceCurrency).toBe('USD')
    expect(result?.sourceAmount).toBe(1250)
  })

  it('returns null when there is no usable number', () => {
    expect(priceStringToUsd('price on request')).toBeNull()
    expect(priceStringToUsd('')).toBeNull()
  })
})

describe('isSupportedCurrency', () => {
  it('recognises known codes and rejects the rest', () => {
    expect(isSupportedCurrency('USD')).toBe(true)
    expect(isSupportedCurrency('CNY')).toBe(true)
    expect(isSupportedCurrency('XYZ')).toBe(false)
    expect(isSupportedCurrency(null)).toBe(false)
  })
})
