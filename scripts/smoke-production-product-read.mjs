import { pathToFileURL } from 'node:url'

export const REPORTED_ALIBABA_URL = 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html?spm=a2700.prosearch.normal_offer.d_image.771b67afVPP1xD&priceId=e74649aeab9c4359b570d52c7a348432&priceId=e74649aeab9c4359b570d52c7a348432'

/** Accept the actual free customer route, not just individual scraper probes. */
export async function verifyProductRead(origin, fetchImpl = fetch, timeoutMs = 25_000) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${new URL(origin).origin}/api/product-read`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: REPORTED_ALIBABA_URL }), signal: controller.signal,
    })
    const body = await response.json()
    if (!response.ok) throw new Error(`Customer product-read failed HTTP ${response.status}: ${body.code || 'no code'}; ${JSON.stringify(body.diagnostics || {})}`)
    const product = body.product ?? {}
    const name = String(product.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const source = String(body.confidence?.productSource || '')
    if (!/machine|maquina|bobinador|winding/i.test(name)) throw new Error('The complete machine identity was not recovered from supplier evidence')
    if (!body.fetched || !source || /url-only|provisional/i.test(source) || body.sourceRead?.mode === 'blocked') throw new Error('A URL slug or blocked read cannot pass as a recovered product')
    if (!String(body.sourceUrl).includes('_1601389995797.html')) throw new Error('Product-read returned another listing')
    const providerIds = ['directAlibaba', 'nativeAlibaba', 'parsebotAlibaba'].map(key => body.sourceEvidence?.[key]?.productId).filter(Boolean)
    if (!providerIds.length || providerIds.some(id => String(id) !== '1601389995797')) throw new Error('Supplier evidence must match the exact requested product ID')
    if (source.includes('parsebot') && String(body.sourceEvidence?.parsebotAlibaba?.productId) !== '1601389995797') throw new Error('Structured supplier evidence lacks the exact product ID')
    const price = product.supplierEvidence
    if (!(Number(product.unitPriceUsd) > 0) && !(price?.currency && /\d/.test(price?.priceText || ''))) throw new Error('No published offer was recovered')
    if (!(Number(product.moq) >= 1)) throw new Error('No supplier MOQ was recovered')
    // Exact regression: an unqualified 500X1430X1420 string previously became
    // 1,015.3 m³ by assuming centimetres. Its unit must be explicit to calculate.
    if (Math.abs(Number(product.volumeCbm) - 1015.3) < 0.00001) throw new Error('The ambiguous-dimension regression returned')
    if (body.usageReservationId || response.headers.get('x-shippingapp-usage-reservation')) throw new Error('Reading the supplier ficha must not start a paid analysis')
    const elapsedMs = Date.now() - started
    if (elapsedMs >= timeoutMs) throw new Error('The actual customer read exceeded its acceptance deadline')
    return { status: 'passed', productId: '1601389995797', elapsedMs, name: product.name, mode: body.sourceRead?.mode, source,
      priceUsd: product.unitPriceUsd, originalPrice: price?.priceText ?? null, currency: price?.currency ?? null, moq: product.moq,
      weightKg: product.packedWeightKg, volumeCbm: product.volumeCbm, paidReservation: false, readBudget: body.sourceEvidence?.readBudget ?? null }
  } finally { clearTimeout(timer) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exercise separate customer reads, with no retry that could mask an unstable
  // first response. Each read must meet every identity/commerce/deadline check.
  const reads = []
  for (let read = 0; read < 3; read++) reads.push(await verifyProductRead(process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'))
  console.log(JSON.stringify({ status: 'passed', reads }, null, 2))
}
