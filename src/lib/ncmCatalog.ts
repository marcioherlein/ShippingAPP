export type NcmSimOpening = {
  code: string
  description: string
  matchTerms: string[]
}

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
  simOpenings?: NcmSimOpening[]
}

export const NCM_CATALOG_META = {
  scope: 'official-seed-partial',
  coverage: 'Pilot subset of NCM heading 95.06; official ARCA archive is machine-readable and full-catalog sync is the next expansion step.',
  sourceLabel: 'ARCA · Arancel Integrado / NCM official nomenclature',
  sourceUrl: 'https://serviciosweb.afip.gob.ar/aduana/arancelintegrado/default.asp',
  sourceObservedAt: '2026-08-14',
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
    simOpenings: [
      { code: '9506.51.00.110N', description: 'De grafito, sin combinar con otras materias', matchTerms: ['graphite without other materials', 'grafito sin combinar'] },
      { code: '9506.51.00.120R', description: 'De grafito, combinadas con otras materias', matchTerms: ['graphite combined with other materials', 'grafito combinado con otras materias'] },
      { code: '9506.51.00.210U', description: 'De fibras de carbono, sin combinar con otras materias', matchTerms: ['carbon fiber without other materials', 'fibra de carbono sin combinar'] },
      { code: '9506.51.00.220X', description: 'De fibras de carbono, combinadas con otras materias', matchTerms: ['carbon fiber combined with other materials', 'fibra de carbono combinada con otras materias'] },
      { code: '9506.51.00.900D', description: 'De las demás materias', matchTerms: [] },
    ],
  },
  {
    code: '9506.59.00',
    heading: '95.06',
    description: 'Las demás raquetas de tenis, badminton o similares, incluso sin cordaje',
    dutyRatePct: 20,
    keywords: ['padel', 'pádel', 'badminton', 'bádminton', 'squash', 'pickleball', 'racket', 'racquet', 'paddle', 'paleta', 'raqueta'],
    negativeKeywords: ['table tennis', 'tenis de mesa', 'ping pong'],
    functionHints: ['play padel', 'practice padel', 'play badminton', 'play squash', 'play pickleball', 'similar racket sport'],
    notes: ['Residual subheading for rackets similar to tennis/badminton other than tennis rackets.'],
    simOpenings: [
      { code: '9506.59.00.100F', description: 'Raquetas de badminton, incluso sin cordaje', matchTerms: ['badminton', 'bádminton'] },
      { code: '9506.59.00.200L', description: 'Raquetas de squash, incluso sin cordaje', matchTerms: ['squash'] },
      { code: '9506.59.00.900Z', description: 'Las demás', matchTerms: ['padel', 'pádel', 'pickleball'] },
    ],
  },
  {
    code: '9506.40.00',
    heading: '95.06',
    description: 'Artículos y material para tenis de mesa',
    dutyRatePct: 20,
    keywords: ['table tennis', 'tenis de mesa', 'ping pong', 'paddle', 'paleta'],
    functionHints: ['play table tennis', 'play ping pong'],
    notes: ['Specific subheading for table-tennis articles and equipment.'],
    simOpenings: [
      { code: '9506.40.00.100J', description: 'Mesas', matchTerms: ['table tennis table', 'mesa de tenis de mesa'] },
      { code: '9506.40.00.200P', description: 'Paletas', matchTerms: ['paddle', 'paleta'] },
      { code: '9506.40.00.300V', description: 'Pelotas', matchTerms: ['table tennis ball', 'ping pong ball', 'pelota de tenis de mesa'] },
      { code: '9506.40.00.900C', description: 'Los demás', matchTerms: [] },
    ],
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
