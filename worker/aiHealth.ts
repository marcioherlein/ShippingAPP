type AI = { run: (model: string, input: unknown) => Promise<unknown> }

export const INTAKE_MODEL = '@cf/zai-org/glm-4.7-flash'

export type AiHealthResult = {
  status: 'ok' | 'degraded'
  model: string
  latencyMs: number
  checkedAt: string
}

type CachedHealth = { expiresAt: number; result: AiHealthResult }
let cache: CachedHealth | null = null

function failureReason(error: unknown) {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'unknown')
  return raw.replace(/\s+/g, ' ').slice(0, 300)
}

function parseProbe(result: any) {
  const content = result?.response ?? result?.choices?.[0]?.message?.content
  if (!content) throw new Error('ai_health_empty')
  let parsed: any
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content
  } catch {
    throw new Error('ai_health_invalid_json')
  }
  if (parsed?.ok !== true) throw new Error('ai_health_invalid_shape')
}

export function resetAiHealthCacheForTests() {
  cache = null
}

export async function checkAiHealth(ai: AI, now = () => Date.now()): Promise<AiHealthResult> {
  const current = now()
  if (cache && cache.expiresAt > current) return cache.result

  const started = current
  try {
    const result = await ai.run(INTAKE_MODEL, {
      messages: [
        { role: 'system', content: 'Return JSON only with exactly this semantic value: {"ok":true}.' },
        { role: 'user', content: 'health' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 20,
    })
    parseProbe(result)

    const finished = now()
    const health: AiHealthResult = {
      status: 'ok',
      model: INTAKE_MODEL,
      latencyMs: Math.max(0, finished - started),
      checkedAt: new Date(finished).toISOString(),
    }
    cache = { expiresAt: finished + 60_000, result: health }
    return health
  } catch (error) {
    const finished = now()
    console.error('shippingapp.ai_health_failure', { reason: failureReason(error), model: INTAKE_MODEL })
    const health: AiHealthResult = {
      status: 'degraded',
      model: INTAKE_MODEL,
      latencyMs: Math.max(0, finished - started),
      checkedAt: new Date(finished).toISOString(),
    }
    cache = { expiresAt: finished + 15_000, result: health }
    return health
  }
}
