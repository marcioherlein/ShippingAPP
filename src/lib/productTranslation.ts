/**
 * Lightweight EN→ES product-label translation for display.
 *
 * Supplier listings are usually in English (audit item #3). The customs and
 * market-search layers already carry Spanish concepts server-side; this module
 * covers the *user-facing* gap: showing an English product name in Spanish
 * without touching the underlying data (presentation only).
 *
 * It is deliberately a compact, concept-level glossary — not a per-product
 * dictionary and not a general MT engine. Unknown tokens (brands, models,
 * numbers, units) are preserved as-is so nothing meaningful is lost.
 */

// Common import nouns/adjectives, singular keys. Order does not matter; matching
// is token-wise and also tries a trailing-'s' plural fallback.
const GLOSSARY: Record<string, string> = {
  // materials
  steel: 'acero',
  stainless: 'inoxidable',
  aluminum: 'aluminio',
  aluminium: 'aluminio',
  plastic: 'plástico',
  silicone: 'silicona',
  leather: 'cuero',
  cotton: 'algodón',
  wood: 'madera',
  wooden: 'de madera',
  glass: 'vidrio',
  rubber: 'goma',
  ceramic: 'cerámica',
  // common products
  bottle: 'botella',
  bottles: 'botellas',
  flask: 'termo',
  cup: 'vaso',
  mug: 'taza',
  watch: 'reloj',
  watches: 'relojes',
  clock: 'reloj de pared',
  glasses: 'gafas',
  sunglasses: 'gafas de sol',
  lamp: 'lámpara',
  light: 'luz',
  lights: 'luces',
  bag: 'bolso',
  bags: 'bolsos',
  backpack: 'mochila',
  shoe: 'zapato',
  shoes: 'zapatos',
  sneaker: 'zapatilla',
  sneakers: 'zapatillas',
  jacket: 'campera',
  shirt: 'camisa',
  toy: 'juguete',
  toys: 'juguetes',
  phone: 'teléfono',
  case: 'funda',
  cover: 'cubierta',
  charger: 'cargador',
  cable: 'cable',
  headphone: 'auricular',
  headphones: 'auriculares',
  earphone: 'auricular',
  earbuds: 'auriculares',
  speaker: 'parlante',
  keyboard: 'teclado',
  mouse: 'mouse',
  camera: 'cámara',
  battery: 'batería',
  power: 'energía',
  bank: 'banco',
  fan: 'ventilador',
  heater: 'calefactor',
  blender: 'licuadora',
  kettle: 'pava eléctrica',
  knife: 'cuchillo',
  knives: 'cuchillos',
  pan: 'sartén',
  pot: 'olla',
  towel: 'toalla',
  blanket: 'manta',
  pillow: 'almohada',
  chair: 'silla',
  table: 'mesa',
  desk: 'escritorio',
  brush: 'cepillo',
  comb: 'peine',
  razor: 'afeitadora',
  cream: 'crema',
  serum: 'sérum',
  lock: 'cerradura',
  cabinet: 'gabinete',
  drawer: 'cajón',
  wheel: 'rueda',
  wheels: 'ruedas',
  tool: 'herramienta',
  tools: 'herramientas',
  paddle: 'paleta',
  racket: 'raqueta',
  ball: 'pelota',
  bike: 'bicicleta',
  bicycle: 'bicicleta',
  helmet: 'casco',
  gloves: 'guantes',
  // descriptors
  portable: 'portátil',
  wireless: 'inalámbrico',
  rechargeable: 'recargable',
  electric: 'eléctrico',
  mechanical: 'mecánico',
  automatic: 'automático',
  waterproof: 'resistente al agua',
  insulated: 'térmico',
  thermal: 'térmico',
  vacuum: 'al vacío',
  smart: 'inteligente',
  digital: 'digital',
  foldable: 'plegable',
  adjustable: 'ajustable',
  reusable: 'reutilizable',
  set: 'set',
  kit: 'kit',
  // linking words worth keeping natural
  for: 'para',
  with: 'con',
  and: 'y',
}

// English function words used to decide whether a label reads as English.
const ENGLISH_MARKERS = new Set([
  'the', 'a', 'an', 'for', 'with', 'and', 'of', 'to', 'in', 'pro', 'new',
  'portable', 'wireless', 'rechargeable', 'stainless', 'steel', 'waterproof',
  'set', 'kit', 'high', 'quality', 'hot', 'sale', 'mini', 'multi',
])

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Heuristic: does this label read as English (and therefore benefit from a
 * Spanish display translation)? Conservative — returns false when unsure so a
 * Spanish or brand-heavy name is never mangled.
 */
export function looksEnglish(text: string | null | undefined): boolean {
  const raw = (text || '').trim()
  if (raw.length < 3) return false
  const tokens = stripDiacritics(raw.toLowerCase()).split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
  if (!tokens.length) return false
  const englishHits = tokens.filter((t) => ENGLISH_MARKERS.has(t) || GLOSSARY[t] || GLOSSARY[t.replace(/s$/, '')]).length
  // Spanish accents or ñ strongly suggest the text is already Spanish.
  if (/[áéíóúñ¿¡]/i.test(raw)) return false
  return englishHits / tokens.length >= 0.34
}

export type TranslatedLabel = {
  text: string
  /** True when at least one token was translated. */
  translated: boolean
  /** True when the source looked English and a translation is worth showing. */
  fromEnglish: boolean
}

/**
 * Translate a product label token-wise into Spanish for display. Unknown tokens
 * (brands, models, numbers, units) are preserved. Never throws; returns the
 * original text when nothing can be translated.
 */
export function translateProductLabel(text: string | null | undefined): TranslatedLabel {
  const raw = (text || '').trim()
  if (!raw) return { text: '', translated: false, fromEnglish: false }
  const fromEnglish = looksEnglish(raw)

  let translated = false
  const out = raw.replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase()
    const hit = GLOSSARY[lower] ?? GLOSSARY[lower.replace(/s$/, '')]
    if (!hit) return word
    translated = true
    // Preserve leading capitalization of the source word.
    if (word[0] === word[0].toUpperCase()) return hit.charAt(0).toUpperCase() + hit.slice(1)
    return hit
  })

  return { text: translated ? out : raw, translated, fromEnglish }
}

/**
 * Build Spanish search terms for the local market (MercadoLibre Argentina) from
 * an English-ish product label: translate known tokens, drop noise, keep order.
 */
export function spanishSearchTerms(text: string | null | undefined): string {
  const translated = translateProductLabel(text).text
  const tokens = stripDiacritics(translated.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !ENGLISH_MARKERS.has(t))
  return [...new Set(tokens)].slice(0, 8).join(' ')
}
