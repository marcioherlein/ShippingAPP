const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'

const message = 'Paleta de pádel de fibra de carbono, núcleo EVA, uso deportivo, origen China, precio proveedor USD 18, MOQ 300 unidades, peso embalado 0.65 kg por unidad.'

async function main() {
  const response = await fetch(`${baseUrl}/api/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, priorFacts: {} }),
  })

  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`/api/intake returned non-JSON HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

  if (!response.ok) {
    throw new Error(`/api/intake failed HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`)
  }

  if (body.status !== 'ready') throw new Error(`Expected ready status, got ${body.status}: ${JSON.stringify(body).slice(0, 1000)}`)
  if (body.facts?.category !== 'Padel racket') throw new Error(`Expected Padel racket, got ${body.facts?.category}`)
  if (body.facts?.unitPriceUsd !== 18) throw new Error(`Expected unitPriceUsd=18, got ${body.facts?.unitPriceUsd}`)
  if (body.facts?.moq !== 300) throw new Error(`Expected moq=300, got ${body.facts?.moq}`)
  if (body.facts?.packedWeightKg !== 0.65) throw new Error(`Expected packedWeightKg=0.65, got ${body.facts?.packedWeightKg}`)
  if (body.facts?.volumeCbm !== 0.006) throw new Error(`Expected volumeCbm=0.006, got ${body.facts?.volumeCbm}`)
  if (body.facts?.originCountry !== 'China') throw new Error(`Expected originCountry=China, got ${body.facts?.originCountry}`)
  if (!body.analysis?.product?.name) throw new Error('Expected conversational analysis product name')

  console.log(JSON.stringify({
    status: body.status,
    product: body.analysis.product.name,
    category: body.facts.category,
    unitPriceUsd: body.facts.unitPriceUsd,
    moq: body.facts.moq,
    packedWeightKg: body.facts.packedWeightKg,
    volumeCbm: body.facts.volumeCbm,
    originCountry: body.facts.originCountry,
    marketSource: body.analysis.market?.source,
    fxStatus: body.analysis.fx?.status,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
