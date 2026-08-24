const base = process.argv[2]?.replace(/\/$/, '')
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/ncm-live-smoke.mjs https://<preview-worker>.workers.dev')
  process.exit(2)
}

const cases = [
  {
    name: 'Carbon padel racket',
    facts: { name: 'Professional 12K carbon fiber padel racket', category: 'Padel racket', material: 'carbon fiber', functionText: 'sports racket for padel' },
    hints: ['producto completo', 'raqueta completa', 'raqueta deportiva', 'padel', 'fibra de carbono'],
    code: '9506.59.00', aec: 20, statistics: 3, iva: 21,
  },
  {
    name: '65W GaN USB-C charger',
    facts: { name: '65W GaN USB C PD fast wall charger power adapter', category: 'Power adapter', functionText: 'static power converter AC to DC' },
    hints: ['producto completo', 'adaptador cargador completo', 'convertidor electrico estatico', 'corriente alterna a continua', '65w'],
    code: '8504.40.90', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'Lithium ion battery pack',
    facts: { name: '11.1V rechargeable 18650 lithium ion battery pack with BMS', category: 'Lithium battery', functionText: 'rechargeable electrical accumulator' },
    hints: ['producto completo', 'bateria recargable', 'acumulador electrico', 'iones de litio', '11.1v'],
    code: '8507.60.00', aec: 18, statistics: 3, iva: 21,
  },
  {
    name: 'Android 5G smartphone',
    facts: { name: 'Unlocked Android 5G smartphone dual SIM mobile phone', category: 'Smartphone', functionText: 'cellular mobile telephone' },
    hints: ['producto completo', 'telefono movil', 'telefono celular', 'telefono inteligente', 'smartphone', '5g', 'dual sim'],
    code: '8517.13.00', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'LED desk lamp',
    facts: { name: 'Dimmable LED desk lamp table reading light', category: 'Desk lamp', functionText: 'electric table lighting fitting' },
    hints: ['producto completo', 'lampara completa', 'lampara electrica de mesa', 'aparato electrico de alumbrado', 'mesa', 'led'],
    code: '9405.21.00', aec: 18, statistics: 3, iva: 21,
  },
  {
    name: 'Polyester backpack',
    facts: { name: 'Waterproof polyester travel backpack school bag', category: 'Backpack', material: 'polyester textile' },
    hints: ['producto completo', 'mochila completa', 'bolso mochila', 'materia textil', 'poliester'],
    code: '4202.92.00', aec: 35, statistics: 3, iva: 21,
  },
  {
    name: 'Laptop computer',
    facts: { name: '14 inch notebook laptop computer', category: 'Laptop computer', functionText: 'portable automatic data processing machine' },
    hints: ['producto completo', 'computadora portatil', 'maquina automatica para tratamiento de datos', 'notebook', 'laptop'],
    code: '8471.30.19', aec: 7, statistics: 3, iva: 21,
  },
  {
    name: 'USB-C cable',
    facts: { name: 'USB C to USB C fast charging cable with connectors', category: 'USB cable', functionText: 'insulated electric conductor fitted with connectors' },
    hints: ['producto completo', 'cable electrico', 'provisto de conectores', 'con conectores en ambos extremos', 'usb c', 'tension inferior o igual a 1000 v'],
    code: '8544.42.00', aec: 16, statistics: 3, iva: 21,
  },
]

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function chooseOption(options, hints) {
  const hintText = normalize(hints.join(' '))
  const hintTokens = new Set(hintText.split(' ').filter((token) => token.length >= 3))
  const ranked = (Array.isArray(options) ? options : []).map((option) => {
    const text = normalize(`${option?.label || ''} ${option?.value || ''}`)
    const tokens = new Set(text.split(' ').filter((token) => token.length >= 3))
    let score = 0
    for (const token of tokens) if (hintTokens.has(token)) score += token.length >= 8 ? 3 : 1
    for (const hint of hints) if (text.includes(normalize(hint))) score += 8
    if (/no estoy seguro|no se|desconozco|cannot confirm|not sure/.test(text)) score -= 12
    return { option, score }
  }).sort((a, b) => b.score - a.score)
  return ranked[0]?.score > 0 ? ranked[0].option : null
}

async function classify(sample, clarifications) {
  const response = await fetch(`${base}/api/ncm-classify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sample.facts, clarifications }),
  })
  let data
  try { data = await response.json() } catch { data = null }
  return { response, data }
}

let failures = 0

for (const sample of cases) {
  const clarifications = []
  const clarificationRounds = []
  let response
  let data

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await classify(sample, clarifications)
    response = result.response
    data = result.data
    const question = data?.clarification
    if (!response.ok || !question || clarifications.length >= 3) break

    const option = chooseOption(question.options, sample.hints)
    if (!option) {
      clarificationRounds.push({ round: question.round, question: question.question, selected: null, reason: 'No deterministic smoke-test answer matched.' })
      break
    }
    clarifications.push({ question: question.question, answer: option.value, factKey: question.factKey })
    clarificationRounds.push({ round: question.round, question: question.question, selected: option.label })
  }

  const checks = {
    http: response?.ok === true,
    noPendingClarification: !data?.clarification,
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
    clarificationRounds,
    expected: { code: sample.code, aec: sample.aec, statistics: sample.statistics, iva: sample.iva },
    actual: {
      http: response?.status ?? null,
      statusText: response?.statusText ?? null,
      error: data?.error ?? null,
      detail: data?.detail ?? null,
      status: data?.status ?? null,
      code: data?.code ?? null,
      label: data?.label ?? null,
      confidence: data?.confidence ?? null,
      retrievalMode: data?.retrievalMode ?? null,
      pendingClarification: data?.clarification ?? null,
      searchTerms: data?.searchTerms ?? [],
      missingFacts: data?.missingFacts ?? [],
      rationale: data?.rationale ?? [],
      alternatives: data?.alternatives ?? [],
      tariff: data?.tariff ?? null,
    },
    checks,
  }, null, 2))
}

console.log(`\nLive NCM smoke: ${cases.length - failures}/${cases.length} passed`)
if (failures) process.exit(1)
