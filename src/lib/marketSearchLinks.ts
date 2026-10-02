/**
 * Pure URL builders for the Argentine market section. The app cannot reliably fetch ≥5
 * comparables (MercadoLibre is 401/403-blocked, Google Shopping needs a paid key), so instead
 * of a dead field we hand the user two prefilled search links they can open themselves. No
 * network here — just deterministic URLs from the product name.
 */

/** Collapse a product name into a MercadoLibre listado slug: lowercased, accent-free, hyphenated. */
export function mercadoLibreSlug(productName: string): string {
  return productName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * MercadoLibre Argentina search. ML's `listado.mercadolibre.com.ar/<slug>` path is the public,
 * shareable search surface (no auth), so we use it rather than the API. Empty name → the home
 * listado so the link is never broken.
 */
export function mercadoLibreSearchUrl(productName: string): string {
  const slug = mercadoLibreSlug(productName || '')
  return slug
    ? `https://listado.mercadolibre.com.ar/${slug}`
    : 'https://www.mercadolibre.com.ar/'
}

/**
 * Google Shopping scoped to Argentina (`tbm=shop`, `gl=ar`), the product name plus "argentina"
 * to bias local sellers. `encodeURIComponent` keeps accents/spaces safe.
 */
export function googleShoppingArUrl(productName: string): string {
  const query = `${(productName || '').trim()} argentina`.trim()
  return `https://www.google.com/search?tbm=shop&gl=ar&hl=es-419&q=${encodeURIComponent(query)}`
}
