const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 25000)

async function postJson(path, payload, label) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  let text
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    text = await response.text()
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || 'request failed')
    throw new Error(`${label}: ${path} ${reason}`)
  } finally {
    clearTimeout(timeout)
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${label}: ${path} returned non-JSON HTTP ${response.status}: ${String(text).slice(0, 500)}`)
  }
  if (!response.ok) throw new Error(`${label}: ${path} failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`)
  return body
}

async function main() {
  const body = await postJson('/api/opportunity-search', {
    query: 'smart wifi video door phone',
    userText: 'buscame smart wifi video door phone con precio MOQ proveedor',
    limit: 6,
  }, 'opportunity-search')

  if (body.status !== 'live') throw new Error(`opportunity-search: expected live, got ${JSON.stringify(body).slice(0, 2000)}`)
  if (body.mode !== 'parsebot') throw new Error(`opportunity-search: expected parsebot mode, got ${body.mode}`)
  if (!Array.isArray(body.results) || body.results.length < 1) throw new Error(`opportunity-search: no results ${JSON.stringify(body).slice(0, 2000)}`)

  const top = body.results[0]
  if (!top.title || !top.url) throw new Error(`opportunity-search: top result missing title/url ${JSON.stringify(top).slice(0, 1200)}`)
  if (!top.unitPriceUsd && !top.moq && !top.supplierName && !top.imageUrl) {
    throw new Error(`opportunity-search: top result lacks useful commercial facts ${JSON.stringify(top).slice(0, 1200)}`)
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
    query: body.query,
    mode: body.mode,
    resultCount: body.results.length,
    creditsEstimated: body.creditsEstimated,
    top: {
      title: top.title,
      url: top.url,
      unitPriceUsd: top.unitPriceUsd,
      moq: top.moq,
      supplierName: top.supplierName,
      opportunityScore: top.opportunityScore,
      missingFacts: top.missingFacts,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
