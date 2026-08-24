const base = process.argv[2]?.replace(/\/$/, '')
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/ncm-live-smoke.mjs https://<preview-worker>.workers.dev')
  process.exit(2)
}

const cases = [
  {
    name: 'Carbon padel racket',
    facts: { name: 'Professional 12K carbon fiber padel racket', category: 'Padel racket', material: 'carbon fiber', functionText: 'sports racket for padel' },
    code: '9506.59.00', aec: 20, statistics: 3, iva: 21,
  },
  {
    name: '65W GaN USB-C charger',
    facts: { name: '65W GaN USB C PD fast wall charger power adapter', category: 'Power adapter', functionText: 'static power converter AC to DC' },
    code: '8504.40.90', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'Lithium ion battery pack',
    facts: { name: '11.1V rechargeable 18650 lithium ion battery pack with BMS', category: 'Lithium battery', functionText: 'rechargeable electrical accumulator' },
    code: '8507.60.00', aec: 18, statistics: 3, iva: 21,
  },
  {
    name: 'Android 5G smartphone',
    facts: { name: 'Unlocked Android 5G smartphone dual SIM mobile phone', category: 'Smartphone', functionText: 'cellular mobile telephone' },
    code: '8517.13.00', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'LED desk lamp',
    facts: { name: 'Dimmable LED desk lamp table reading light', category: 'Desk lamp', functionText: 'electric table lighting fitting' },
    code: '9405.21.00', aec: 18, statistics: 3, iva: 21,
  },
  {
    name: 'Polyester backpack',
    facts: { name: 'Waterproof polyester travel backpack school bag', category: 'Backpack', material: 'polyester textile' },
    code: '4202.92.00', aec: 35, statistics: 3, iva: 21,
  },
  {
    name: 'Laptop computer',
    facts: { name: '14 inch notebook laptop computer', category: 'Laptop computer', functionText: 'portable automatic data processing machine' },
    code: '8471.30.19', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'USB-C cable',
    facts: { name: 'USB C to USB C fast charging cable with connectors', category: 'USB cable', functionText: 'insulated electric conductor fitted with connectors' },
    code: '8544.42.00', aec: 16, statistics: 3, iva: 21,
  },
]

let failures = 0

for (const sample of cases) {
  const response = await fetch(`${base}/api/ncm-classify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample.facts),
  })
  let data
  try { data = await response.json() } catch { data = null }

  const checks = {
    http: response.ok,
    candidate: data?.status === 'candidate',
    code: data?.code === sample.code,
    tariffStatus: data?.tariff?.status === 'ok',
    aec: data?.tariff?.aecPct === sample.aec,
    statistics: data?.tariff?.statisticsPct === sample.statistics,
    iva: data?.tariff?.ivaPct === sample.iva,
  }
  const ok = Object.values(checks).every(Boolean)
  if (!ok) failures += 1

  console.log(JSON.stringify({
    sample: sample.name,
    ok,
    expected: { code: sample.code, aec: sample.aec, statistics: sample.statistics, iva: sample.iva },
    actual: {
      http: response.status,
      status: data?.status ?? null,
      code: data?.code ?? null,
      confidence: data?.confidence ?? null,
      tariff: data?.tariff ?? null,
    },
    checks,
  }, null, 2))
}

console.log(`\nLive NCM smoke: ${cases.length - failures}/${cases.length} passed`)
if (failures) process.exit(1)
