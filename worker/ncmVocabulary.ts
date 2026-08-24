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

const ACCESSORY_INTENT = /\b(cover|case|replacement|shade|accessory|part|spare|repuesto|funda|estuche|cubierta|pantalla|accesorio|parte|reemplazo)\b/

// This is deliberately code-free. It only bridges common marketplace English
// vocabulary to Spanish customs/product terminology so retrieval can work even
// when Workers AI is unavailable or returns unusable structured output.
// NCM codes still come exclusively from the official ARCA snapshot.
const RULES: VocabularyRule[] = [
  {
    when: /\b(padel|paddle)\b.*\b(racket|racquet)\b|\b(racket|racquet)\b.*\b(padel|paddle)\b/,
    // Do not inject "tenis" here. Padel and tennis can sit in neighboring
    // tariff children, so naming the neighboring sport creates false evidence.
    // Official ARCA/SIM text and semantic alignment decide the child.
    terms: ['raqueta de padel', 'raqueta de pádel', 'raqueta deportiva', 'otras raquetas deportivas'],
  },
  {
    when: /\b(racket|racquet)\b/,
    terms: ['raqueta', 'raquetas deportivas'],
  },
  {
    when: /\b(charger|wall charger|power adapter|power supply|static power converter|ac to dc|ac dc adapter)\b/,
    terms: [
      'convertidor electrico estatico',
      'convertidores electricos estaticos',
      'convertidores estaticos los demas',
      'adaptador de corriente',
      'fuente de alimentacion',
    ],
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
    terms: [
      'lamparas electricas de mesa oficina cabecera o de pie',
      'lampara electrica de mesa',
      'aparato electrico de alumbrado',
      'aparatos de alumbrado',
      'luminaria de mesa',
    ],
  },
  {
    when: /\b(backpack|rucksack|school bag)\b/,
    terms: ['mochila', 'mochilas', 'bolso mochila'],
  },
  {
    when: /\b(laptop|notebook computer|portable computer|portable automatic data processing machine)\b/,
    terms: ['maquina automatica para tratamiento o procesamiento de datos portatil', 'maquinas automaticas para tratamiento o procesamiento de datos', 'computadora portatil', 'notebook'],
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
    terms: [
      'diodos emisores de luz led',
      'diseñadas para ser utilizadas unicamente con fuentes luminosas de diodos emisores de luz led',
    ],
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

  // Marketplace accessory listings frequently contain the name of the parent
  // product ("desk lamp shade", "padel racket cover"). In that situation the
  // parent-product vocabulary is actively dangerous: it can manufacture a
  // strong shortlist for the complete article. Fail closed and search only for
  // accessory/part language; the clarification layer can then ask whether the
  // user actually imports the complete product.
  if (ACCESSORY_INTENT.test(text)) {
    const accessoryTerms = ['accesorio', 'parte', 'repuesto', 'componente']
    if (/\b(cover|case|funda|estuche|cubierta)\b/.test(text)) accessoryTerms.push('funda', 'cubierta')
    if (/\b(shade|pantalla)\b/.test(text)) accessoryTerms.push('pantalla', 'parte de aparato de alumbrado')
    return [...new Set(accessoryTerms)].slice(0, 12)
  }

  const terms: string[] = []
  for (const rule of RULES) {
    if (!rule.when.test(text)) continue
    terms.push(...rule.terms)
  }

  return [...new Set(terms)].slice(0, 24)
}
