import { createManualProductAnalysis } from './productConfirmation'
import type { ProductDiscoveryItem } from './productDiscovery'
import type { ProductAnalysisV2 } from './productAnalysisV2'

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Search evidence can identify a product even when its detail page blocks scraping.
 * It never constitutes a confirmed commercial offer, NCM or freight measurement.
 */
export function analysisFromDiscovery(item: ProductDiscoveryItem, detail?: ProductAnalysisV2): ProductAnalysisV2 {
  const base = createManualProductAnalysis(item.url, item.title)
  const product = detail?.product
  const name = product?.name?.trim()
  const priceText = item.priceDisplay?.trim() || (positive(item.unitPriceUsd) ? String(item.unitPriceUsd) : null)
  const source = 'Publicación encontrada en Alibaba · pendiente de confirmar'
  const evidence = product?.supplierEvidence
  const hasDetailPrice = !!evidence?.priceText?.trim() || !!positive(product?.unitPriceUsd)
  const hasDetailMoq = !!positive(product?.moq)
  const incomplete = !detail || detail.fetched === false || detail.sourceRead?.mode === 'blocked' || detail.sourceRead?.mode === 'partial'
  return {
    ...base,
    ...detail,
    sourceUrl: item.url,
    product: {
      ...base.product,
      ...product,
      name: name && !/^(producto (de alibaba|sin (nombre|identificar))|sin nombre|untitled)$/i.test(name) ? name : item.title,
      imageUrl: product?.imageUrl || (item.imageUrl?.startsWith('https://') ? item.imageUrl : null),
      moq: positive(product?.moq) || positive(item.moq),
      // A search result's price lacks confirmed currency, variant and unit basis.
      // Keep it as evidence; SupplierQuoteReview must confirm the actual offer.
      supplierEvidence: {
        priceText: hasDetailPrice ? evidence?.priceText || String(product!.unitPriceUsd) : priceText,
        currency: hasDetailPrice ? evidence?.currency ?? null : null,
        quantityUnit: hasDetailPrice ? evidence?.quantityUnit ?? null : null,
        variant: hasDetailPrice ? evidence?.variant ?? null : null,
        priceSource: hasDetailPrice ? evidence?.priceSource || 'Página de detalle de Alibaba' : priceText ? source : null,
        moqText: hasDetailMoq ? evidence?.moqText || String(product!.moq) : positive(item.moq) ? String(item.moq) : null,
        moqSource: hasDetailMoq ? evidence?.moqSource || 'Página de detalle de Alibaba' : positive(item.moq) ? source : null,
        weightText: evidence?.weightText || (positive(item.packedWeightKg) ? `${item.packedWeightKg} kg · dato de búsqueda, confirmar embalaje` : null),
        weightSource: evidence?.weightText ? evidence.weightSource || 'Página de detalle de Alibaba' : positive(item.packedWeightKg) ? source : null,
        volumeText: evidence?.volumeText || (positive(item.volumeCbm) ? `${item.volumeCbm} m³ · dato de búsqueda, confirmar embalaje` : null),
        volumeSource: evidence?.volumeText ? evidence.volumeSource || 'Página de detalle de Alibaba' : positive(item.volumeCbm) ? source : null,
      },
    },
    ...(!detail ? {
      fetched: false,
      sourceRead: { mode: 'partial' as const, quality: 25, directStatus: null, browserAttempted: false, browserMsUsed: null,
        reason: 'Se conservó la publicación real encontrada. La página de detalle no estuvo disponible; confirmá los datos antes de analizar.' },
      confidence: { ...base.confidence, productSource: source },
    } : {}),
    assumptions: [...(detail?.assumptions || []), ...(incomplete
      ? ['Conservamos el producto que elegiste. No pudimos verificar todos los datos de la publicación: confirmá identidad, oferta y embalaje en los siguientes pasos.']
      : [])],
  }
}
