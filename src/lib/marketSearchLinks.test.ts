import { describe, expect, it } from 'vitest'
import { mercadoLibreSlug, mercadoLibreSearchUrl, googleShoppingArUrl } from './marketSearchLinks'

describe('marketSearchLinks', () => {
  it('slugifies product names (accent-free, hyphenated, trimmed)', () => {
    expect(mercadoLibreSlug('Paleta de pádel carbono')).toBe('paleta-de-padel-carbono')
    expect(mercadoLibreSlug('  Café  Molido!! ')).toBe('cafe-molido')
    expect(mercadoLibreSlug('')).toBe('')
  })

  it('builds a MercadoLibre listado URL, falling back to home for empty names', () => {
    expect(mercadoLibreSearchUrl('Mochila táctica')).toBe('https://listado.mercadolibre.com.ar/mochila-tactica')
    expect(mercadoLibreSearchUrl('')).toBe('https://www.mercadolibre.com.ar/')
  })

  it('builds an Argentina-scoped Google Shopping URL with encoded query', () => {
    const url = googleShoppingArUrl('taladro inalámbrico')
    expect(url.startsWith('https://www.google.com/search?tbm=shop&gl=ar&hl=es-419&q=')).toBe(true)
    expect(url).toContain(encodeURIComponent('taladro inalámbrico argentina'))
    // accents/spaces must be percent-encoded, never raw
    expect(url).not.toContain('taladro inalámbrico argentina')
  })
})
