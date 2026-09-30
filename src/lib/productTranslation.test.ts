import { describe, expect, it } from 'vitest'
import { looksEnglish, spanishSearchTerms, translateProductLabel } from './productTranslation'

describe('looksEnglish', () => {
  it('flags English product names', () => {
    expect(looksEnglish('Stainless Steel Water Bottle')).toBe(true)
    expect(looksEnglish('Portable Wireless Speaker')).toBe(true)
  })

  it('does not flag Spanish names', () => {
    expect(looksEnglish('Botella térmica de acero')).toBe(false)
    expect(looksEnglish('Reloj mecánico automático')).toBe(false)
  })

  it('is conservative on short or brand-only input', () => {
    expect(looksEnglish('X9')).toBe(false)
    expect(looksEnglish('')).toBe(false)
  })
})

describe('translateProductLabel', () => {
  it('translates known tokens and preserves the rest', () => {
    const result = translateProductLabel('Stainless Steel Bottle')
    expect(result.text).toBe('Inoxidable Acero Botella')
    expect(result.translated).toBe(true)
    expect(result.fromEnglish).toBe(true)
  })

  it('keeps brands, models and numbers untouched', () => {
    const result = translateProductLabel('Anker Portable Charger 20000mAh')
    expect(result.text).toContain('Anker')
    expect(result.text).toContain('20000mAh')
    expect(result.text.toLowerCase()).toContain('portátil')
    expect(result.text.toLowerCase()).toContain('cargador')
  })

  it('returns the original when nothing is translatable', () => {
    const result = translateProductLabel('Zyxel ABC123')
    expect(result.translated).toBe(false)
    expect(result.text).toBe('Zyxel ABC123')
  })

  it('handles empty input', () => {
    expect(translateProductLabel('').text).toBe('')
    expect(translateProductLabel(null).translated).toBe(false)
  })
})

describe('spanishSearchTerms', () => {
  it('produces Spanish market-search terms from an English label', () => {
    const terms = spanishSearchTerms('Portable Stainless Steel Water Bottle')
    expect(terms).toContain('botella')
    expect(terms).toContain('acero')
    expect(terms).not.toContain('with')
  })

  it('deduplicates and caps the term count', () => {
    const terms = spanishSearchTerms('bottle bottle bottle steel steel')
    expect(terms.split(' ').length).toBeLessThanOrEqual(8)
  })
})
