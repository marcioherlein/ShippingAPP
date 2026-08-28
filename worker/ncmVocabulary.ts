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

const STRONG_ACCESSORY_INTENT = /\b(replacement|replacement only|spare|accessory|part|parts|shade|zipper|repuesto|repuestos|accesorio|accesorios|parte|partes|reemplazo|pantalla|cierre|cremallera)\b/
const COVER_CASE_WORD = /\b(cover|case|funda|estuche|cubierta)\b/
const ACCESSORY_ONLY_CONTEXT = /\b(protective|protection|replacement|spare|only|shell|empty|without electronics|without device|no electronics|solo funda|solo estuche|solo cubierta|repuesto|reemplazo|protector|proteccion)\b/
const COMPLETE_EARBUDS = /\b(headphones?|earbuds?|earphones?|tws|auriculares?)\b/
const BUNDLED_CHARGING_CASE = /\b(with|incl(?:udes?|uded)?|including|con)\b.{0,30}\b(charging case|charger case|estuche de carga)\b|\b(charging case|charger case|estuche de carga)\b.{0,30}\b(with|incl(?:udes?|uded)?|including|con)\b/
const CHARGING_CASE_ONLY = /\b(replacement|spare|only)\b.{0,30}\b(charging case|charger case)\b|\b(charging case|charger case)\b.{0,30}\b(replacement|spare|only)\b/

export function hasAccessoryIntent(facts: CustomsVocabularyFacts) {
  const text = normalize([
    facts.name || '',
    facts.category || '',
    facts.material || '',
    facts.functionText || '',
    facts.description || '',
  ].join(' '))
  if (!text) return false

  // Alibaba titles often describe a complete TWS product as "earbuds with
  // charging case". The bundled case is packaging/functionality, not proof
  // that the listing itself is an accessory. Only accessory-only wording wins.
  if (COMPLETE_EARBUDS.test(text) && BUNDLED_CHARGING_CASE.test(text) && !CHARGING_CASE_ONLY.test(text)) {
    return false
  }

  if (STRONG_ACCESSORY_INTENT.test(text)) return true
  if (COVER_CASE_WORD.test(text) && ACCESSORY_ONLY_CONTEXT.test(text)) return true

  return false
}

// Code-free bilingual bridge between noisy marketplace language and the Spanish
// wording used by the official Argentina nomenclature. NCM codes never live in
// this vocabulary: they are selected only from the official NCM_APP snapshot.
const RULES: VocabularyRule[] = [
  {
    when: /\b(padel|paddle)\b.*\b(racket|racquet|pala|paleta|raqueta)\b|\b(racket|racquet|pala|paleta|raqueta)\b.*\b(padel|paddle)\b/,
    terms: ['raqueta de padel', 'raqueta de pádel', 'paleta de padel', 'raqueta deportiva', 'raquetas similares'],
  },
  {
    when: /\b(badminton|badminton)\b.*\b(racket|racquet|raqueta)\b|\b(racket|racquet|raqueta)\b.*\b(badminton|badminton)\b/,
    terms: ['raqueta de badminton', 'raqueta de bádminton', 'raquetas similares', 'raqueta deportiva'],
  },
  {
    when: /\b(tennis|tenis)\b.*\b(racket|racquet|raqueta)\b|\b(racket|racquet|raqueta)\b.*\b(tennis|tenis)\b/,
    terms: ['raqueta de tenis', 'raquetas de tenis'],
  },
  {
    when: /\b(charger|wall charger|power adapter|power supply|static converter|ac to dc|ac dc adapter|cargador|adaptador de corriente|fuente de alimentacion)\b/,
    terms: ['convertidor electrico estatico', 'convertidores electricos estaticos', 'adaptador de corriente', 'fuente de alimentacion', 'cargador electrico'],
  },
  {
    when: /\b(lithium ion|lithium-ion|li ion|li-ion|18650|iones de litio|ion litio)\b/,
    terms: ['acumulador de iones de litio', 'acumuladores electricos', 'iones de litio', 'bateria recargable'],
  },
  {
    when: /\b(smartphone|smart phone|mobile phone|cellular telephone|cell phone|telefono inteligente|telefono celular)\b/,
    terms: ['telefono inteligente', 'telefonos inteligentes', 'telefono celular', 'aparato telefonico'],
  },
  {
    when: /\b(desk lamp|table lamp|reading light|table light|reading lamp|lampara de mesa|lampara escritorio)\b/,
    terms: ['lampara electrica de mesa', 'lampara de escritorio', 'aparato electrico de alumbrado', 'luminaria de mesa'],
  },
  {
    when: /\b(backpack|rucksack|school bag|mochila)\b/,
    terms: ['mochila', 'mochilas', 'bolso mochila', 'continente similar materia textil'],
  },
  {
    when: /\b(laptop|notebook computer|notebook|portable computer|computadora portatil)\b/,
    terms: ['maquina automatica para tratamiento o procesamiento de datos portatil', 'computadora portatil', 'notebook'],
  },
  {
    when: /\b(usb c cable|usb-c cable|usb cable|charging cable|cable with connectors|electric conductor|cable electrico)\b/,
    terms: ['conductores electricos aislados', 'cables electricos', 'provistos de piezas de conexion', 'conductores con conectores'],
  },
  {
    when: /\b(headphones?|earbuds?|earphones?|tws|auriculares?)\b/,
    terms: ['auriculares', 'auriculares de casco', 'auriculares con microfono'],
  },
  {
    when: /\b(portable speaker|bluetooth speaker|wireless speaker|loudspeaker|parlante|altavoz)\b/,
    terms: ['altavoz', 'altavoces', 'parlante'],
  },
  {
    when: /\b(projector|proyector)\b/,
    terms: ['proyector', 'proyectores', 'monitor proyector'],
  },
  {
    when: /\b(blender|liquidizer|licuadora|batidora)\b/,
    terms: ['licuadora', 'trituradoras y mezcladoras de alimentos', 'aparato electromecanico con motor electrico'],
  },
  {
    when: /\b(vacuum cleaner|pet grooming vacuum|aspiradora)\b/,
    terms: ['aspiradora', 'aspiradoras con motor electrico incorporado'],
  },
  {
    when: /\b(sunglasses?|gafas de sol|anteojos de sol)\b/,
    terms: ['gafas de sol', 'anteojos de sol'],
  },
  {
    when: /\b(coffee maker|coffee machine|espresso machine|cafetera)\b/,
    terms: ['aparatos para la preparacion de cafe o te', 'cafetera electrica'],
  },
  {
    when: /\b(solar panel|photovoltaic panel|pv panel|panel solar|panel fotovoltaico)\b/,
    terms: ['celulas fotovoltaicas ensambladas en modulos o paneles', 'panel solar fotovoltaico'],
  },
  {
    when: /\b(t[- ]?shirt|tee shirt|camiseta)\b/,
    terms: ['t shirts y camisetas de punto', 'camiseta de punto'],
  },
  {
    when: /\b(cotton|algodon)\b/,
    terms: ['algodon', 'de algodon'],
  },
  {
    when: /\b(running shoes?|sports shoes?|sneakers?|trainers?|zapatillas?|calzado deportivo)\b/,
    terms: ['calzado de deporte', 'calzado deportivo', 'parte superior textil'],
  },
  {
    when: /\b(table fan|desk fan|electric fan|ventilador de mesa|ventilador electrico)\b/,
    terms: ['ventilador de mesa', 'ventiladores con motor electrico'],
  },
  {
    when: /\b(countertop oven|electric oven|baking oven|horno electrico)\b/,
    terms: ['hornos electricos', 'aparatos electrotermicos para coccion', 'horno electrico'],
  },
  {
    when: /\b(bath towel|terry towel|hotel towel|toalla de bano|toalla)\b/,
    terms: ['ropa de tocador de algodon', 'toalla de algodon', 'tejido con bucles de algodon'],
  },
  {
    when: /\b(tableware|dinnerware|plate bowl mug|vajilla|plato ceramica|taza ceramica)\b/,
    terms: ['vajilla de ceramica', 'articulos de uso domestico de ceramica'],
  },
  {
    when: /\b(water filter|water purifier|reverse osmosis|filtro de agua|purificador de agua)\b/,
    terms: ['aparatos para filtrar o depurar agua', 'filtrar agua', 'depurar agua'],
  },
  {
    when: /\b(massage gun|percussion massager|muscle massager|pistola de masaje|masajeador)\b/,
    terms: ['aparatos para masajes', 'aparatos de mecanoterapia'],
  },
  {
    when: /\b(stainless steel)\b.*\b(kitchen|household|bowl|mixing bowl)\b|\b(acero inoxidable)\b.*\b(cocina|domestico|bol)\b/,
    terms: ['articulos de uso domestico de acero inoxidable', 'uso domestico acero inoxidable'],
  },
  {
    when: /\b(keyboard|teclado)\b/,
    terms: ['teclado unidad de entrada', 'unidad de entrada para procesamiento de datos'],
  },
  {
    when: /\b(computer mouse|wireless mouse|optical mouse|mouse inalambrico)\b/,
    terms: ['mouse unidad de entrada', 'unidad de entrada para procesamiento de datos'],
  },
  {
    when: /\b(thermal bottle|vacuum flask|insulated bottle|thermos|botella termica|termo)\b/,
    terms: ['recipiente isotermico', 'termo', 'botella isotermica'],
  },
  {
    when: /\b(water heater|electric water heater|storage water heater|termotanque|calentador de agua)\b/,
    terms: ['calentador electrico de agua', 'calentadores electricos de agua'],
  },
  {
    when: /\b(office furniture|metal office furniture|office cabinet|mueble de oficina|mueble metalico oficina)\b/,
    terms: ['muebles de metal de los tipos utilizados en oficinas', 'mueble de oficina metalico'],
  },
  {
    when: /\b(electronic scale|digital scale|industrial scale|balanza electronica|bascula electronica)\b/,
    terms: ['aparatos e instrumentos para pesar', 'balanza electronica'],
  },
  {
    when: /\b(led facial mask|led face mask|beauty mask led|mascara led facial)\b/,
    terms: ['aparato electrico con funcion propia', 'mascara led facial'],
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

  // Marketplace accessory listings often repeat the complete product name.
  // Suppress complete-product vocabulary only when the listing itself is an
  // accessory. A complete product bundled with a case remains a full product.
  if (hasAccessoryIntent(facts)) {
    const accessoryTerms = ['accesorio', 'parte', 'repuesto', 'componente']
    if (/\b(cover|case|funda|estuche|cubierta)\b/.test(text)) accessoryTerms.push('funda', 'cubierta')
    if (/\b(shade|pantalla)\b/.test(text)) accessoryTerms.push('pantalla', 'parte de aparato de alumbrado')
    if (/\b(zipper|cierre|cremallera)\b/.test(text)) accessoryTerms.push('cierre', 'cremallera')
    return [...new Set(accessoryTerms)].slice(0, 14)
  }

  const terms: string[] = []
  for (const rule of RULES) {
    if (rule.when.test(text)) terms.push(...rule.terms)
  }
  return [...new Set(terms)].slice(0, 32)
}
