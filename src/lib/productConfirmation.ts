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
}

export type ProductConfirmationMissingField = {
  id: keyof ProductConfirmationData | 'identity_context'
  label: string
}

function cleanText(value: string | null | undefined, max = 1200) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
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
  }
}

export function missingProductConfirmationFields(data: ProductConfirmationData): ProductConfirmationMissingField[] {
  const missing: ProductConfirmationMissingField[] = []
  if (cleanText(data.productName).length < 3) missing.push({ id: 'productName', label: 'nombre exacto del producto' })
  if (cleanText(data.category).length < 3) missing.push({ id: 'category', label: 'categoría/tipo de producto' })
  if (!cleanText(data.originCountry)) missing.push({ id: 'originCountry', label: 'país de origen de la mercadería' })
  if (positive(data.unitPriceUsd) <= 0) missing.push({ id: 'unitPriceUsd', label: 'precio FOB unitario' })
  if (positive(data.moq) <= 0) missing.push({ id: 'moq', label: 'MOQ/cantidad mínima' })
  if (positive(data.unitWeightKg) <= 0) missing.push({ id: 'unitWeightKg', label: 'peso unitario embalado' })
  if (positive(data.unitVolumeCbm) <= 0) missing.push({ id: 'unitVolumeCbm', label: 'volumen unitario embalado' })

  const identityText = `${cleanText(data.productName)} ${cleanText(data.category)} ${cleanText(data.description)} ${cleanText(data.functionText)}`.trim()
  if (identityText.length < 18) missing.push({ id: 'identity_context', label: 'descripción o función suficiente para clasificar' })
  return missing
}

export function applyProductConfirmation(analysis: ProductAnalysisV2, data: ProductConfirmationData): ProductAnalysisV2 {
  const productName = cleanText(data.productName, 500)
  const category = cleanText(data.category, 300)
  const originCountry = cleanText(data.originCountry, 120)
  const moq = positive(data.moq)
  const existingQuantities = analysis.suggestedQuantities.filter((value) => Number.isFinite(value) && value > 0)
  const suggestedQuantities = [...new Set([moq, ...existingQuantities].filter((value) => value > 0))].sort((a, b) => a - b)

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
      volumeCbm: positive(data.unitVolumeCbm),
    },
    suggestedQuantities,
    // Any edit invalidates the previous nomenclature result. The full classifier
    // will run only after this confirmed snapshot is accepted by the user.
    customs: customsProfileFor('', originCountry, ''),
    assumptions: [
      ...analysis.assumptions.filter((item) => !item.startsWith('Ficha de producto confirmada por el usuario')),
      'Ficha de producto confirmada por el usuario antes de clasificación NCM y cálculo.',
    ],
  }
}

export function createManualProductAnalysis(sourceUrl = 'manual://product'): ProductAnalysisV2 {
  return {
    sourceUrl,
    fetched: false,
    product: {
      name: '',
      category: '',
      unitPriceUsd: null,
      moq: null,
      packedWeightKg: 0,
      volumeCbm: 0,
      originCountry: '',
      imageUrl: null,
      material: null,
      functionText: null,
      description: null,
    },
    market: {
      estimatedPriceArs: null,
      estimatedMonthlyDemand: 0,
      source: 'Mercado pendiente de validar',
    },
    suggestedQuantities: [],
    confidence: {
      overall: 0,
      productSource: 'Carga manual requerida',
      logistics: 'Pendiente de confirmación',
      market: 'Pendiente',
    },
    assumptions: ['La fuente automática no entregó una ficha completa. El usuario debe confirmar los datos antes de clasificar o cotizar.'],
    customs: customsProfileFor('', '', ''),
  }
}
