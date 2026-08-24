import { NCM_STRUCTURED_AI_MODEL, type FullNcmClassification, type NcmProductFacts } from './ncmRetrieval'

export type NcmClarificationOption = {
  id: string
  label: string
  value: string
}

export type NcmClarification = {
  id: string
  round: number
  factKey: 'product_scope' | 'principal_function' | 'material' | 'electrical_type' | 'construction' | 'other'
  question: string
  options: NcmClarificationOption[]
  reason: string
}

type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type ClarificationFactKey = NcmClarification['factKey']

const FACT_KEYS: ClarificationFactKey[] = ['product_scope', 'principal_function', 'material', 'electrical_type', 'construction', 'other']

const CLARIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    factKey: { type: 'string', enum: FACT_KEYS },
    reason: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
  },
  required: ['question', 'factKey', 'reason', 'options'],
}

function parseResponse(result: any) {
  const content = result?.response ?? result?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    try { return JSON.parse(content) } catch { return null }
  }
  return content && typeof content === 'object' ? content : null
}

function safeText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function containsCustomsCode(value: string) {
  return /\b\d{4}[.]?\d{2}[.]?\d{2}\b/.test(value)
}

function normalizedFactKeys(values: string[] = []): ClarificationFactKey[] {
  return [...new Set(values.filter((value): value is ClarificationFactKey => FACT_KEYS.includes(value as ClarificationFactKey)))]
}

function semanticOptionValue(label: string, value: string) {
  const normalized = value.trim().toLowerCase()
  if (/^(true|false|yes|no|si|sí|1|0)$/.test(normalized)) return label
  return value
}

function scopeFallback(
  facts: NcmProductFacts,
  round: number,
  answeredFactKeys: ClarificationFactKey[] = [],
): NcmClarification | null {
  if (answeredFactKeys.includes('product_scope')) return null
  const text = `${facts.name || ''} ${facts.category || ''} ${facts.description || ''}`.toLowerCase()
  if (!/(cover|case|replacement|shade|accessor|part|repuesto|funda|estuche|cubierta|parte)/.test(text)) return null
  return {
    id: `ncm-q${round + 1}-scope`, round: round + 1, factKey: 'product_scope',
    question: '¿Qué estás importando exactamente?',
    reason: 'Confirmar si se trata del producto principal o solamente de un accesorio/repuesto puede cambiar la clasificación.',
    options: [
      { id: `ncm-q${round + 1}-o1`, label: 'El producto completo', value: 'El artículo importado es el producto completo, no un accesorio ni repuesto.' },
      { id: `ncm-q${round + 1}-o2`, label: 'Sólo un accesorio o repuesto', value: 'El artículo importado es solamente un accesorio, cubierta, funda, parte o repuesto del producto principal.' },
      { id: `ncm-q${round + 1}-o3`, label: 'No estoy seguro', value: 'El usuario no puede confirmar si el artículo es el producto completo o solamente un accesorio/repuesto.' },
    ],
  }
}

export async function buildNcmClarification(
  ai: AI,
  facts: NcmProductFacts,
  classification: FullNcmClassification,
  answeredCount: number,
  answeredFactKeysInput: string[] = [],
): Promise<NcmClarification | null> {
  // Clarification is for discriminating real candidates. When retrieval has no
  // shortlist at all, asking arbitrary multiple-choice questions is misleading;
  // the UI should instead ask for a better product description.
  if (answeredCount >= 3 || classification.confidence === 'high' || classification.status !== 'candidate' || !classification.code) return null
  if (classification.confidence === 'medium' && classification.alternatives.length === 0 && classification.missingFacts.length === 0) return null

  const answeredFactKeys = normalizedFactKeys(answeredFactKeysInput)
  const candidates = [
    { code: classification.code, label: classification.label || '' },
    ...classification.alternatives.slice(0, 3).map(({ code, label }) => ({ code, label })),
  ]

  try {
    const result = await ai.run(NCM_STRUCTURED_AI_MODEL, {
      messages: [
        {
          role: 'system',
          content: 'You design ONE short clarification question for an Argentina customs NCM screening flow. Write the question and answer labels in simple Spanish. Ask only for an objective product characteristic that could materially distinguish the supplied customs candidates: whether it is the complete product vs accessory/replacement, principal function, material/composition, electrical nature, or construction. Provide 2 to 4 mutually useful answer options. Each option value must be a concise declarative product fact, never true/false. Never mention or reveal NCM/HS/customs codes in the question or options. Never ask about price, origin, profitability, brand or intended resale. Do not ask a fact type listed in alreadyConfirmedFactKeys. If the supplied facts already answer a characteristic, do not ask it again. If no useful NEW discriminating clarification exists, return an empty question and empty options.'
        },
        {
          role: 'user',
          content: JSON.stringify({ product: facts, alreadyConfirmedFactKeys: answeredFactKeys, currentClassification: { confidence: classification.confidence, missingFacts: classification.missingFacts, candidates } }),
        },
      ],
      response_format: { type: 'json_schema', json_schema: CLARIFICATION_SCHEMA },
      temperature: 0,
      max_tokens: 450,
    })

    const parsed: any = parseResponse(result)
    const question = safeText(parsed?.question, 220)
    const reason = safeText(parsed?.reason, 320)
    const factKey = FACT_KEYS.includes(parsed?.factKey) ? parsed.factKey as ClarificationFactKey : 'other'
    const rawOptions = Array.isArray(parsed?.options) ? parsed.options : []
    const options = rawOptions
      .map((item: any, index: number) => {
        const label = safeText(item?.label, 120)
        const rawValue = safeText(item?.value, 300)
        return {
          id: `ncm-q${answeredCount + 1}-o${index + 1}`,
          label,
          value: semanticOptionValue(label, rawValue),
        }
      })
      .filter((item: NcmClarificationOption) => item.label.length >= 2 && item.value.length >= 3 && !containsCustomsCode(`${item.label} ${item.value}`))
      .slice(0, 4)

    if (!question || containsCustomsCode(question) || options.length < 2 || answeredFactKeys.includes(factKey)) {
      return scopeFallback(facts, answeredCount, answeredFactKeys)
    }
    return {
      id: `ncm-q${answeredCount + 1}-${factKey}`,
      round: answeredCount + 1,
      factKey,
      question,
      options,
      reason: reason || 'Este dato puede separar alternativas de clasificación que hoy no tienen evidencia suficiente.',
    }
  } catch {
    return scopeFallback(facts, answeredCount, answeredFactKeys)
  }
}
