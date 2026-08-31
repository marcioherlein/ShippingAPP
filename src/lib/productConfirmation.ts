import { customsProfileFor } from './customsClassification'
import type { ProductAnalysisV2 } from './productAnalysisV2'

export type ProductConfirmationData = {
  productName: string
  category: string
  description: string
  material: string
  functionText: string
  originCountry: string
  unitPriceUsd: number
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

function cleanText(value: string | null | undefined, max = 1200) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
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
    functionText: cleanText(analysis.product.functionText, 500),
    originCountry: cleanText(analysis.product.originCountry, 120),
    unitPriceUsd: positive(analysis.product.unitPriceUsd),
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
  if (positive(data.moq) <= 0) missing.push({ id: 'moq', label: 'MOQ/cantidad mínima' })
  if (positive(data.unitWeightKg) <= 0) missing.push({ id: 'unitWeightKg', label: 'peso unitario embalado' })
  if (resolvedProductVolumeCbm(data) <= 0) missing.push({ id: 'packageVolume', label: 'volumen o medidas del bulto unitario' })
  return missing
}

/** Backwards-compatible full readiness gate. */
export function missingProductConfirmationFields(data: ProductConfirmationData): ProductConfirmationMissingField[] {
  return [...missingClassificationConfirmationFields(data), ...missingQuoteConfirmationFields(data)]
}

function classificationIdentityChanged(analysis: ProductAnalysisV2, data: ProductConfirmationData) {
  return cleanText(analysis.product.name, 500) !== cleanText(data.productName, 500)
    || cleanText(analysis.product.category, 300) !== cleanText(data.category, 300)
    || cleanText(analysis.product.description, 1200) !== cleanText(data.description, 1200)
    || cleanText(analysis.product.material, 300) !== cleanText(data.material, 300)
    || cleanText(analysis.product.functionText, 500) !== cleanText(data.functionText, 500)
}

export function applyProductConfirmation(analysis: ProductAnalysisV2, data: ProductConfirmationData): ProductAnalysisV2 {
  const productName = cleanText(data.productName, 500)
  const category = cleanText(data.category, 300)
  const originCountry = cleanText(data.originCountry, 120)
  const moq = positive(data.moq)
  const existingQuantities = analysis.suggestedQuantities.filter((value) => Number.isFinite(value) && value > 0)
  const suggestedQuantities = [...new Set([moq, ...existingQuantities].filter((value) => value > 0))].sort((a, b) => a - b)
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
