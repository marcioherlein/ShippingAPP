export type CustomsVocabularyFacts = {
  name?: string | null
  category?: string | null
  material?: string | null
  functionText?: string | null
  description?: string | null
}

type VocabularyRule = {
  when: RegExp
  terms: string[]
}

function normalize(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// This is deliberately code-free. It only bridges common marketplace English
// vocabulary to Spanish customs/product terminology so retrieval can work even
// when Workers AI is unavailable or returns unusable structured output.
// NCM codes still come exclusively from the official ARCA snapshot.
const RULES: VocabularyRule[] = [
  {
    when: /\b(padel|paddle)\b.*\b(racket|racquet)\b|\b(racket|racquet)\b.*\b(padel|paddle)\b/,
    terms: ['raqueta de padel', 'raqueta deportiva', 'raquetas de tenis badminton o similares'],
  },
  {
    when: /\b(racket|racquet)\b/,
    terms: ['raqueta', 'raquetas deportivas'],
  },
  {
    when: /\b(charger|wall charger|power adapter|power supply|static power converter|ac to dc|ac dc adapter)\b/,
    terms: ['convertidor electrico estatico', 'convertidores electricos estaticos', 'adaptador de corriente', 'fuente de alimentacion'],
  },
  {
    when: /\b(lithium ion|lithium-ion|li ion|li-ion|18650)\b/,
    terms: ['acumulador de iones de litio', 'acumuladores electricos', 'iones de litio', 'bateria recargable'],
  },
  {
    when: /\b(smartphone|smart phone|mobile phone|cellular telephone|cell phone)\b/,
    terms: ['telefono inteligente', 'telefonos inteligentes', 'telefono celular', 'aparato telefonico'],
  },
  {
    when: /\b(desk lamp|table lamp|reading light|table lighting|lighting fitting)\b/,
    terms: ['lampara electrica de mesa escritorio', 'aparato electrico de alumbrado', 'aparatos de alumbrado', 'luminaria de mesa'],
  },
  {
    when: /\b(backpack|rucksack|school bag)\b/,
    terms: ['mochila', 'mochilas', 'bolso mochila'],
  },
  {
    when: /\b(laptop|notebook computer|portable computer|portable automatic data processing machine)\b/,
    terms: ['maquina automatica para tratamiento o procesamiento de datos portatil', 'maquinas automaticas para tratamiento o procesamiento de datos', 'computadora portatil'],
  },
  {
    // USB-C is also a connector on chargers and devices. Require an actual cable
    // or conductor word before adding conductor vocabulary.
    when: /\b(usb c cable|usb-c cable|usb cable|charging cable|cable with connectors|electric conductor|insulated electric conductor)\b/,
    terms: ['conductores electricos aislados', 'conductores electricos', 'cables electricos'],
  },
  {
    when: /\b(connectors|connector|fitted with connectors|pieces of connection|piezas de conexion|conectores)\b/,
    terms: ['provistos de piezas de conexion', 'conductores electricos provistos de piezas de conexion', 'piezas de conexion'],
  },
  {
    when: /\b(polyester|poliester)\b/,
    terms: ['materia textil', 'textil de poliester'],
  },
  {
    when: /\b(led|light emitting diode|diodo emisor de luz)\b/,
    terms: ['diodos emisores de luz led'],
  },
  {
    when: /\b(rechargeable|recargable)\b.*\b(battery|bateria|accumulator|acumulador)\b|\b(battery|bateria|accumulator|acumulador)\b.*\b(rechargeable|recargable)\b/,
    terms: ['acumulador electrico', 'bateria recargable'],
  },
  {
    when: /\b(portable|portatil)\b.*\b(data processing|procesamiento de datos|tratamiento de datos)\b/,
    terms: ['maquina automatica portatil para tratamiento de datos'],
  },
]

export function deterministicCustomsTerms(facts: CustomsVocabularyFacts): string[] {
  const text = normalize([
    facts.name || '',
    facts.category || '',
    facts.material || '',
    facts.functionText || '',
    facts.description || '',
  ].join(' '))
  if (!text) return []

  const terms: string[] = []
  for (const rule of RULES) {
    if (!rule.when.test(text)) continue
    terms.push(...rule.terms)
  }

  return [...new Set(terms)].slice(0, 24)
}
