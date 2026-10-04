import { customsProfileFor } from './customsClassification'
import type { ProductAnalysisV2 } from './productAnalysisV2'
import type { SensitiveProductCategory } from './landedCostEngine'

const PRODUCT_FUNCTION_MAP: Array<[RegExp, string]> = [
  [/reloj|watch|clock/i, 'Mide y muestra la hora'],
  [/parlante|speaker|altavoz|bocina|bafle/i, 'Reproduce audio'],
  [/auricular|headphone|earphone|earbud|airpod/i, 'Escucha audio de forma personal'],
  [/raqueta|racket/i, 'Raqueta para golpear pelotas en deporte'],
  [/\bpelota\b|bal[oó]n|\bball\b/i, 'Balón para uso deportivo o recreativo'],
  [/zapato|calzado|sandal|sandalia|\bshoe\b/i, 'Calzado para cubrir el pie'],
  [/camiseta|remera|\bshirt\b|vestimenta|prenda|\bclothes\b/i, 'Prenda de vestir'],
  [/mochila|backpack/i, 'Porta objetos y pertenencias en la espalda'],
  [/cargador|charger/i, 'Carga baterías de dispositivos electrónicos'],
  [/\bcable\b/i, 'Transmite corriente eléctrica o señal de datos'],
  [/l[aá]mpara|bulb|foco|\bled\b/i, 'Ilumina espacios'],
  [/\bmouse\b|rat[oó]n/i, 'Periférico de entrada para computadora'],
  [/teclado|keyboard/i, 'Periférico de entrada para computadora'],
  [/sart[eé]n|olla|cacerola|\bpot\b|\bpan\b/i, 'Cocina alimentos mediante calor'],
  [/\btaza\b|tumbler|\bcup\b|\bmug\b/i, 'Recipiente para servir bebidas'],
  [/maleta|luggage|suitcase/i, 'Transporta ropa y objetos en viajes'],
  [/cartera|bolso|purse|handbag/i, 'Porta objetos personales'],
  [/paraguas|umbrella/i, 'Protege de la lluvia'],
  [/cintur[oó]n|\bbelt\b/i, 'Ajusta y sostiene ropa en la cintura'],
  [/gafas|lentes|glasses|sunglasses/i, 'Protege o corrige la visión'],
  [/collar|necklace/i, 'Adorno para el cuello'],
  [/pulsera|bracelet/i, 'Adorno para la muñeca'],
  [/juguete|\btoy\b/i, 'Entretenimiento y juego'],
  [/monopat[ií]n|patinete|scooter eléctrico|scooter electrico/i, 'Vehículo de movilidad personal eléctrico de dos ruedas'],
  [/bicicleta el[eé]ctrica|e-bike|ebike/i, 'Bicicleta con asistencia eléctrica al pedaleo'],
  [/\bbicicleta\b|\bbicycle\b|\bbike\b/i, 'Vehículo de dos ruedas de propulsión humana'],
  [/moto el[eé]ctrica|motocicleta el[eé]ctrica/i, 'Motocicleta eléctrica de dos ruedas'],
  [/\bmotocicleta\b|\bmoto\b|\bmotor bike\b/i, 'Motocicleta de combustión interna de dos ruedas'],
  [/ventilador|fan cooler/i, 'Ventila y refresca ambientes'],
  [/aire acondicionado|air conditioner/i, 'Climatiza y regula la temperatura del ambiente'],
  [/calefactor|heater|estufa eléctrica/i, 'Calienta ambientes mediante resistencia eléctrica'],
  [/aspiradora|vacuum/i, 'Aspira polvo y suciedad del suelo'],
  [/taladro|drill/i, 'Perfora materiales mediante rotación'],
  [/cuchillo|knife|\bknife\b/i, 'Utensilio de corte para cocina o uso general'],
  [/herramienta|wrench|llave inglesa/i, 'Herramienta manual de uso general'],
  [/impresora|printer/i, 'Imprime documentos o imágenes en papel'],
  [/c[aá]mara|camera/i, 'Captura fotografías o videos'],
  [/tel[eé]fono|smartphone|iphone|android/i, 'Dispositivo de comunicación y computación móvil'],
  [/tablet|tableta/i, 'Dispositivo de computación táctil portátil'],
  [/laptop|notebook|portátil/i, 'Computadora personal portátil'],
  [/pantalla|monitor|display/i, 'Muestra imágenes y video desde un dispositivo'],
  [/proyector|projector/i, 'Proyecta imágenes o video en una superficie'],
  [/power bank|batería portátil/i, 'Almacena energía para cargar dispositivos móviles'],
  [/\bsilla\b|\bchair\b/i, 'Mueble para sentarse'],
  [/escritorio|desk/i, 'Mueble de trabajo para apoyo de equipos o papeles'],
  [/\balmohada\b|pillow/i, 'Soporte blando para la cabeza durante el descanso'],
  [/\bcolchón\b|mattress/i, 'Superficie acolchada para dormir'],
  [/cortina|curtain|blind/i, 'Cubre ventanas para privacidad y control de luz'],
  [/alfombra|carpet|rug/i, 'Recubre el suelo para decoración o confort'],
  [/\bjarrón\b|\bvase\b/i, 'Recipiente decorativo para flores u ornamentación'],
  [/termo|thermos/i, 'Recipiente aislante para mantener temperatura de líquidos'],
  [/\bbolígrafo\b|\bbirome\b|\bpen\b/i, 'Instrumento de escritura con tinta'],
  [/\bcuaderno\b|\bnotebook paper\b/i, 'Libreta para escribir o dibujar'],
  [/\bsilla de ruedas\b|wheelchair/i, 'Silla con ruedas para movilidad de personas con discapacidad'],
  [/silla de beb[eé]|baby seat|car seat/i, 'Asiento de seguridad para bebés en vehículos'],
  [/cochecito|stroller|carriola/i, 'Vehículo para transportar bebés a pie'],
  [/andador|walker/i, 'Dispositivo de apoyo para caminar'],
  [/guitarra|ukulele/i, 'Instrumento musical de cuerda'],
  [/piano|teclado musical/i, 'Instrumento musical de teclas'],
  [/batería musical|drum/i, 'Instrumento musical de percusión'],
  [/m[aá]scara|mask/i, 'Cubre el rostro para protección o uso decorativo'],
  [/guante|glove/i, 'Cubre y protege las manos'],
  [/\bcasco\b|\bhelmet\b/i, 'Protege la cabeza de impactos'],
]

export function inferFunctionFromProductName(name: string): string | null {
  const n = (name || '').toLocaleLowerCase('es')
  for (const [pattern, label] of PRODUCT_FUNCTION_MAP) {
    if (pattern.test(n)) return label
  }
  return null
}

export type ManualProductChatData = {
  name: string
  use: string
  material: string
  unitPriceUsd: number
  originCountry: string
  packedWeightKg: number
  moq: number
  volumeCbm: number | null
  sensitiveCategory: SensitiveProductCategory
}

const SENSITIVE_PATTERNS: Array<[SensitiveProductCategory, RegExp]> = [
  ['food',        /alimento|comida|snack|chocolate|galleta|cereal|salsa|queso|leche|yogur|harina|azúcar|café|bebida|vino|cerveza|mate|dulce|mermelada|conserva|enlatad|embutido|chorizo|fiambre|miel|arroz|pasta|fideos|caldo|sopa|galleta|bizcochuelo|torta|pan\b/i],
  ['toys',        /juguete|toy\b|muñec[ao]|peluche|lego\b|puzzle|rompecabeza|juego de mesa|figura.*(acción|coleccion)|osito de peluche/i],
  ['cosmetics',   /sérum|serum|shampoo|champú|maquillaje|labial|perfume|loción|locion|colonia\b|gel.*(facial|corporal|pelo|capilar)|mascarilla|hidratante|humectante|base de maquillaje|rubor|delineador|contorno|esmalte de uñas|tónico facial|limpiador facial|crema (facial|corporal|antiedad|solar|hidratante|para)/i],
  ['medicines',   /medicamento|fármaco|farmaco|pastilla|comprimido|antibiótico|antibiotico|analgésico|analgesico|antigripal|remedio medico|jarabe medicinal/i],
  ['supplements', /proteína|proteina|suplemento dietario|suplemento nutricional|vitamina\b|colágeno|colageno|creatina\b|bcaa\b|aminoácido|aminoacido|omega[\s-]?3|probiótico|probiotico|prebiótico|whey\b|caseína/i],
  ['plants',      /\bplanta\b|flores?\b|semilla\b|bulbo\b|cactus\b|suculenta/i],
]

export function inferSensitiveCategoryFromName(name: string): SensitiveProductCategory {
  for (const [category, pattern] of SENSITIVE_PATTERNS) {
    if (pattern.test(name)) return category
  }
  // "crema" alone is ambiguous (food vs cosmetic); ask the user
  if (/\bcrema\b/i.test(name) && !/crema de (manteca|maní|chocolate|leche)/.test(name)) return 'unknown'
  return 'none'
}

export type ProductConfirmationData = {
  productName: string
  category: string
  description: string
  material: string
  functionText: string
  originCountry: string
  unitPriceUsd: number
  quantity?: number
  moq: number
  unitWeightKg: number
  unitVolumeCbm: number
  packageLengthCm?: number
  packageWidthCm?: number
  packageHeightCm?: number
}

export type ProductConfirmationMissingField = {
  id: keyof ProductConfirmationData | 'identity_context' | 'packageVolume'
  label: string
}

export type ClassificationClarificationTarget = 'functionText' | 'material' | 'category' | 'description'

function cleanText(value: string | null | undefined, max = 1200) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function classificationClarificationTarget(missingFacts: string[]): ClassificationClarificationTarget {
  const text = missingFacts.join(' ').toLocaleLowerCase('es')
  if (/funci[oó]n|uso principal|para qu[eé] sirve|utiliza/.test(text)) return 'functionText'
  if (/material|composici[oó]n|fabricad/.test(text)) return 'material'
  if (/tipo|categor[ií]a|naturaleza del producto/.test(text)) return 'category'
  return 'description'
}

export function applyClassificationClarification(
  data: ProductConfirmationData,
  rawNote: string,
  missingFacts: string[],
): ProductConfirmationData {
  const note = cleanText(rawNote, 1000)
  if (!note) return data

  const target = classificationClarificationTarget(missingFacts)

  // For specialized targets (functionText, material, category) update ONLY that
  // field — NOT description. Appending a note to description triggers
  // classificationIdentityChanged → customsProfileFor('','','') discards the
  // entire prior classification attempt. Only touch description when that IS
  // the clarification target.
  if (target === 'description') {
    const descriptionNote = `Aclaración del usuario: ${note}`
    const description = cleanText(data.description, 1200).includes(descriptionNote)
      ? cleanText(data.description, 1200)
      : cleanText([data.description, descriptionNote].filter(Boolean).join('. '), 1200)
    return { ...data, description }
  }

  return {
    ...data,
    ...(target === 'functionText' ? { functionText: cleanText(note, 500) } : {}),
    ...(target === 'material' ? { material: cleanText(note, 300) } : {}),
    ...(target === 'category' ? { category: cleanText(note, 300) } : {}),
  }
}

export function resolvedProductVolumeCbm(data: ProductConfirmationData) {
  const explicit = positive(data.unitVolumeCbm)
  if (explicit > 0) return explicit
  const length = positive(data.packageLengthCm)
  const width = positive(data.packageWidthCm)
  const height = positive(data.packageHeightCm)
  if (!length || !width || !height) return 0
  return (length * width * height) / 1_000_000
}

export function productConfirmationFromAnalysis(analysis: ProductAnalysisV2): ProductConfirmationData {
  return {
    productName: cleanText(analysis.product.name, 500),
    category: cleanText(analysis.product.category, 300),
    description: cleanText(analysis.product.description, 1200),
    material: cleanText(analysis.product.material, 300),
    functionText: cleanText(analysis.product.functionText || inferFunctionFromProductName(analysis.product.name), 500),
    originCountry: cleanText(analysis.product.originCountry, 120),
    unitPriceUsd: positive(analysis.product.unitPriceUsd),
    quantity: positive(analysis.suggestedQuantities[0]) || positive(analysis.product.moq) || 1,
    moq: positive(analysis.product.moq),
    unitWeightKg: positive(analysis.product.packedWeightKg),
    unitVolumeCbm: positive(analysis.product.volumeCbm),
    packageLengthCm: 0,
    packageWidthCm: 0,
    packageHeightCm: 0,
  }
}

/**
 * Facts required to START nomenclature. Commercial and logistics data are
 * intentionally excluded: price, MOQ, weight and volume do not identify the
 * tariff position and should not make the user fill a boring form first.
 */
export function missingClassificationConfirmationFields(data: ProductConfirmationData): ProductConfirmationMissingField[] {
  const missing: ProductConfirmationMissingField[] = []
  if (cleanText(data.productName).length < 3) missing.push({ id: 'productName', label: 'qué producto es' })

  const identityText = `${cleanText(data.productName)} ${cleanText(data.category)} ${cleanText(data.description)} ${cleanText(data.material)} ${cleanText(data.functionText)}`.trim()
  if (identityText.length < 18) missing.push({ id: 'identity_context', label: 'un poco más de detalle para identificarlo' })
  return missing
}

/** Facts required only after NCM/tariffs are resolved and before quoting. */
export function missingQuoteConfirmationFields(data: ProductConfirmationData): ProductConfirmationMissingField[] {
  const missing: ProductConfirmationMissingField[] = []
  if (!cleanText(data.originCountry)) missing.push({ id: 'originCountry', label: 'país de origen de la mercadería' })
  if (positive(data.unitPriceUsd) <= 0) missing.push({ id: 'unitPriceUsd', label: 'precio FOB unitario' })
  if (positive(data.unitWeightKg) <= 0) missing.push({ id: 'unitWeightKg', label: 'peso unitario embalado' })
  if (resolvedProductVolumeCbm(data) <= 0) missing.push({ id: 'packageVolume', label: 'volumen o medidas del bulto unitario' })
  return missing
}

/** Backwards-compatible full readiness gate. */
export function missingProductConfirmationFields(data: ProductConfirmationData): ProductConfirmationMissingField[] {
  return [...missingClassificationConfirmationFields(data), ...missingQuoteConfirmationFields(data)]
}

function classificationIdentityChanged(analysis: ProductAnalysisV2, data: ProductConfirmationData) {
  const effectiveFunctionText = cleanText(analysis.product.functionText || inferFunctionFromProductName(analysis.product.name), 500)
  return cleanText(analysis.product.name, 500) !== cleanText(data.productName, 500)
    || cleanText(analysis.product.category, 300) !== cleanText(data.category, 300)
    || cleanText(analysis.product.description, 1200) !== cleanText(data.description, 1200)
    || cleanText(analysis.product.material, 300) !== cleanText(data.material, 300)
    || effectiveFunctionText !== cleanText(data.functionText, 500)
}

export function applyProductConfirmation(analysis: ProductAnalysisV2, data: ProductConfirmationData): ProductAnalysisV2 {
  const productName = cleanText(data.productName, 500)
  const category = cleanText(data.category, 300)
  const originCountry = cleanText(data.originCountry, 120)
  const moq = positive(data.moq)
  const existingQuantities = analysis.suggestedQuantities.filter((value) => Number.isFinite(value) && value > 0)
  const suggestedQuantities = [...new Set([positive(data.quantity), moq, ...existingQuantities].filter((value) => value > 0))]
  const identityChanged = classificationIdentityChanged(analysis, data)

  return {
    ...analysis,
    product: {
      ...analysis.product,
      name: productName,
      category,
      description: cleanText(data.description, 1200) || null,
      material: cleanText(data.material, 300) || null,
      functionText: cleanText(data.functionText, 500) || null,
      originCountry,
      unitPriceUsd: positive(data.unitPriceUsd) || null,
      moq: moq || null,
      packedWeightKg: positive(data.unitWeightKg),
      volumeCbm: resolvedProductVolumeCbm(data),
    },
    suggestedQuantities,
    // Logistics/commercial corrections do not invalidate an already-resolved
    // NCM. Any change to product identity does invalidate it and forces rerun.
    customs: identityChanged ? customsProfileFor('', originCountry, '') : analysis.customs,
    assumptions: [
      ...analysis.assumptions.filter((item) => !item.startsWith('Datos del producto confirmados por el usuario')),
      'Datos del producto confirmados por el usuario antes de usar la clasificación o la cotización.',
    ],
  }
}

export function createManualProductAnalysis(sourceUrl = 'manual://product', seedDescription = ''): ProductAnalysisV2 {
  const seed = cleanText(seedDescription, 1200)
  return {
    sourceUrl,
    fetched: false,
    product: {
      name: seed,
      category: '',
      unitPriceUsd: null,
      moq: null,
      packedWeightKg: 0,
      volumeCbm: 0,
      originCountry: '',
      imageUrl: null,
      material: null,
      functionText: null,
      description: seed || null,
    },
    market: {
      estimatedPriceArs: null,
      estimatedMonthlyDemand: 0,
      source: 'Mercado pendiente de validar',
    },
    suggestedQuantities: [],
    confidence: {
      overall: seed ? 25 : 0,
      productSource: seed ? 'Descripción aportada por el usuario' : 'Carga manual requerida',
      logistics: 'Pendiente de confirmación',
      market: 'Pendiente',
    },
    assumptions: [seed
      ? 'La identidad inicial del producto fue aportada por el usuario y debe confirmarse antes de clasificar.'
      : 'La fuente automática no entregó identidad suficiente. El usuario debe describir el producto antes de clasificar.'],
    customs: customsProfileFor('', '', ''),
  }
}

export function createPrefilledAnalysis(data: ManualProductChatData): ProductAnalysisV2 {
  const name = cleanText(data.name, 500)
  const originCountry = cleanText(data.originCountry, 120)
  const volumeCbm = positive(data.volumeCbm ?? data.packedWeightKg * 0.005)
  const functionText = data.use ? cleanText(data.use, 500) : inferFunctionFromProductName(name)
  const material = data.material ? cleanText(data.material, 300) : null
  return {
    sourceUrl: 'chatbot://product',
    fetched: false,
    product: {
      name,
      category: '',
      unitPriceUsd: positive(data.unitPriceUsd) || null,
      moq: positive(data.moq) || null,
      packedWeightKg: positive(data.packedWeightKg),
      volumeCbm,
      originCountry,
      imageUrl: null,
      material: material,
      functionText: functionText || null,
      description: null,
    },
    market: {
      estimatedPriceArs: null,
      estimatedMonthlyDemand: 0,
      source: 'Mercado pendiente de validar',
    },
    suggestedQuantities: positive(data.moq) > 0 ? [positive(data.moq)] : [],
    confidence: {
      overall: 60,
      productSource: 'Datos ingresados directamente por el usuario',
      logistics: 'Datos confirmados por el usuario',
      market: 'Pendiente',
    },
    assumptions: ['Datos del producto ingresados directamente por el usuario.'],
    customs: customsProfileFor('', originCountry, ''),
  }
}
