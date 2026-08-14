export type NcmCatalogRow = {
  code: string
  heading: string
  description: string
  dutyRatePct: number | null
  keywords: string[]
  negativeKeywords?: string[]
  functionHints: string[]
  materialHints?: string[]
  notes: string[]
}

export const NCM_CATALOG_META = {
  scope: 'official-seed-partial',
  coverage: 'Pilot subset of NCM heading 95.06; full ARCA Arancel Integrado sync pending.',
  sourceLabel: 'ARCA · Arancel Integrado / NCM official nomenclature',
  sourceUrl: 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/default.asp',
  sourceObservedAt: '2026-07-31',
  reviewedAt: '2026-08-14',
} as const

export const NCM_CATALOG: NcmCatalogRow[] = [
  {
    code: '9506.51.00',
    heading: '95.06',
    description: 'Raquetas de tenis, incluso sin cordaje',
    dutyRatePct: 20,
    keywords: ['tennis', 'tenis', 'racket', 'racquet', 'raqueta'],
    negativeKeywords: ['padel', 'pádel', 'badminton', 'bádminton', 'pickleball'],
    functionHints: ['practice tennis', 'play tennis', 'tennis racket'],
    notes: ['Specific subheading for tennis rackets.'],
  },
  {
    code: '9506.59.00',
    heading: '95.06',
    description: 'Las demás raquetas de tenis, badminton o similares, incluso sin cordaje',
    dutyRatePct: 20,
    keywords: ['padel', 'pádel', 'badminton', 'bádminton', 'pickleball', 'racket', 'racquet', 'paddle', 'paleta', 'raqueta'],
    negativeKeywords: ['table tennis', 'tenis de mesa', 'ping pong'],
    functionHints: ['play padel', 'practice padel', 'play badminton', 'play pickleball', 'similar racket sport'],
    notes: ['Residual subheading for rackets similar to tennis/badminton other than tennis rackets.'],
  },
  {
    code: '9506.40.00',
    heading: '95.06',
    description: 'Artículos y material para tenis de mesa',
    dutyRatePct: 20,
    keywords: ['table tennis', 'tenis de mesa', 'ping pong', 'paddle', 'paleta'],
    functionHints: ['play table tennis', 'play ping pong'],
    notes: ['Specific subheading for table-tennis articles and equipment.'],
  },
  {
    code: '9506.91.00',
    heading: '95.06',
    description: 'Artículos y material para cultura física, gimnasia o atletismo',
    dutyRatePct: 20,
    keywords: ['gym', 'gymnastics', 'fitness', 'training equipment', 'exercise equipment', 'athletics'],
    functionHints: ['physical training', 'gymnastics', 'athletics'],
    notes: ['Included only as an adversarial alternative inside the pilot heading.'],
  },
  {
    code: '9506.99.00',
    heading: '95.06',
    description: 'Los demás artículos y material para deportes o juegos al aire libre de la partida 95.06',
    dutyRatePct: 20,
    keywords: ['sport', 'sports equipment', 'outdoor game'],
    functionHints: ['sporting use', 'outdoor game'],
    notes: ['Residual heading-level candidate; should not outrank a specific racket subheading when product facts are sufficient.'],
  },
]

export function ncmRow(code: string) {
  return NCM_CATALOG.find((row) => row.code === code) ?? null
}

export function isCatalogCode(code: string) {
  return NCM_CATALOG.some((row) => row.code === code)
}
