const origin = new URL(process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev').origin
const url = new URL(process.env.ALIBABA_URL || '')
if (url.protocol !== 'https:' || !(url.hostname === 'alibaba.com' || url.hostname.endsWith('.alibaba.com'))) throw new Error('A public HTTPS Alibaba product URL is required')

async function probe(path, timeoutMs) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.href }), signal: controller.signal })
    const body = await response.json()
    const facts = body.product ?? body.facts ?? {}
    return { path, httpStatus: response.status, elapsedMs: Date.now() - started, status: body.status ?? null, code: body.code ?? null, fetched: body.fetched ?? null,
      sourceRead: body.sourceRead ?? null, name: facts.name ?? null, category: facts.category ?? null, priceUsd: facts.unitPriceUsd ?? null, moq: facts.moq ?? null,
      weightKg: facts.packedWeightKg ?? null, volumeCbm: facts.volumeCbm ?? null, originCountry: facts.originCountry ?? null, evidence: facts.evidence ?? null,
      warnings: body.warnings ?? body.assumptions ?? [], sourceEvidence: body.sourceEvidence ?? null }
  } catch (error) { return { path, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) } }
  finally { clearTimeout(timer) }
}

const results = await Promise.all([
  probe('/api/product-read', 45_000),
  probe('/api/alibaba-direct-probe', 25_000),
  probe('/api/alibaba-native-probe', 40_000),
])
console.log(JSON.stringify({ origin, productId: url.pathname.match(/_(\d+)\.html$/)?.[1], results }, null, 2))
// Diagnostic output is not an acceptance gate. Release smoke must separately
// assert useful evidence and a deadline on the actual customer route.
