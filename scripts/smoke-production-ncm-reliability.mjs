import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export async function verifyNcmReliability(baseUrl, fetcher = fetch) {
  const product = { name: 'Termo Stanley', material: 'Acero inoxidable', functionText: 'Para mantener el agua caliente y tomar mate' }
  async function classify(facts) {
    const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api/ncm-classify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(facts), signal: AbortSignal.timeout(25_000),
    })
    if (!response.ok) throw new Error(`NCM gate HTTP ${response.status}`)
    return response.json()
  }
  const pending = await classify(product)
  if (pending.code || pending.tariff || pending.alternatives?.length || pending.disambiguation?.candidates?.length) throw new Error('Unconfirmed vacuum construction must not expose a classification or arbitrary alternatives')
  if (pending.disambiguation?.questions?.length !== 1 || pending.disambiguation.questions[0].id !== 'insulation') throw new Error('Missing precise vacuum clarification')
  const affirmative = pending.disambiguation.questions[0].options.find(option => option.value === 'si')?.note
  if (!affirmative) throw new Error('Missing explicit confirmation option')
  const confirmed = await classify({ ...product, description: affirmative })
  if (confirmed.status !== 'candidate' || confirmed.code !== '9617.00.10' || !confirmed.tariff || confirmed.missingFacts?.length) throw new Error('Explicitly confirmed complete vacuum flask did not resolve against the official catalog')
  for (const facts of [
    { ...product, description: 'No tiene aislamiento al vacío.' },
    { name: 'Ampolla de vidrio de repuesto para termo', description: 'Aislado por vacío' },
    { name: 'Termo eléctrico', functionText: 'Calienta agua con electricidad', description: 'Aislado por vacío' },
  ]) {
    const result = await classify(facts)
    if (result.code === '9617.00.10') throw new Error(`Incompatible complete-flask classification: ${facts.name}`)
  }
  return { status: 'passed', cases: 5, catalogRecordCount: confirmed.catalogRecordCount, confirmedCode: confirmed.code }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = process.env.PRODUCTION_URL
  if (!origin) throw new Error('PRODUCTION_URL is required')
  console.log(JSON.stringify(await verifyNcmReliability(origin)))
}
