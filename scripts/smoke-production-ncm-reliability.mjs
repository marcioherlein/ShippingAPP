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
    { name: 'Partes de termo', description: 'Aislado por vacío' },
    { name: 'Termo eléctrico', functionText: 'Calienta agua con electricidad', description: 'Aislado por vacío' },
  ]) {
    const result = await classify(facts)
    if (result.code === '9617.00.10') throw new Error(`Incompatible complete-flask classification: ${facts.name}`)
  }
  const scooter = await classify({ name: 'monopatin electrico' })
  if (scooter.code || scooter.tariff || scooter.disambiguation?.questions?.length !== 1 || scooter.disambiguation.questions[0].id !== 'mobility-use') throw new Error('Electric scooter did not ask its missing use without arbitrary positions')
  const transport = scooter.disambiguation.questions[0].options.find(option => option.value === 'transport')?.note
  const vehicle = await classify({ name: 'monopatin electrico', description: transport })
  if (vehicle.code !== '8711.60.00' || !vehicle.tariff || vehicle.missingFacts?.length) throw new Error('Confirmed personal-transport electric scooter did not resolve')
  const bilingual = await classify({ name: 'Electric scooter with lithium battery', functionText: 'Transporte personal urbano para adultos', description: 'Monopatín eléctrico completo, batería de litio integrada y cargador incluido' })
  if (bilingual.code !== '8711.60.00') throw new Error('Integrated battery displaced the complete bilingual vehicle identity')
  for (const facts of [
    { name: 'Monopatín sin motor', functionText: 'Transporte personal para adultos' },
    { name: 'Batería para monopatín eléctrico', description: 'Repuesto vendido por separado; composición no informada' },
  ]) {
    const result = await classify(facts)
    if (result.code === '8711.60.00') throw new Error('Nonmotorized product or component promoted to a complete electric vehicle')
    if (facts.name.startsWith('Batería') && (result.code || result.tariff || result.disambiguation?.questions?.[0]?.id !== 'battery-chemistry')) throw new Error('Unknown battery chemistry was invented instead of asking for the specification')
  }
  return { status: 'passed', cases: 11, catalogRecordCount: confirmed.catalogRecordCount, confirmedCode: confirmed.code, confirmedMobilityCode: vehicle.code }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = process.env.PRODUCTION_URL
  if (!origin) throw new Error('PRODUCTION_URL is required')
  console.log(JSON.stringify(await verifyNcmReliability(origin)))
}
