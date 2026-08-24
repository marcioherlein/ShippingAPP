import baseWorker, { validFacts } from './enrich'
import { loadNcmIndex } from './ncmRetrieval'
import { classifyFullNcmWithSemantic } from './ncmRetrievalSemantic'
import { buildNcmClarification } from './ncmClarification'
import { lookupNcmTariff, type D1DatabaseLike } from './ncmTariff'
import { resolveSimOpening } from './simHydration'
import type { MercadoLibreAuthEnv } from './mercadoLibreAuth'
import type { BrowserRun } from './alibabaSource'

type Env = MercadoLibreAuthEnv & {
  AI: { run: (model: string, input: unknown) => Promise<unknown> }
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  BROWSER: BrowserRun
  NCM_DB?: D1DatabaseLike
}

type ClarificationAnswer = { question: string; answer: string; factKey?: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function answersFrom(body: any): ClarificationAnswer[] {
  if (!Array.isArray(body?.clarifications)) return []
  return body.clarifications
    .map((item: any) => ({
      question: typeof item?.question === 'string' ? item.question.trim().replace(/\s+/g, ' ').slice(0, 220) : '',
      answer: typeof item?.answer === 'string' ? item.answer.trim().replace(/\s+/g, ' ').slice(0, 320) : '',
      factKey: typeof item?.factKey === 'string' ? item.factKey.trim().slice(0, 40) : undefined,
    }))
    .filter((item: ClarificationAnswer) => item.question.length >= 2 && item.answer.length >= 2)
    .slice(0, 3)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/api/ncm-classify' || request.method !== 'POST') return baseWorker.fetch(request, env)

    try {
      const body = await request.json() as any
      const answers = answersFrom(body)
      const facts = validFacts(body, answers)
      if (!facts) return json({ error: 'Faltan datos del producto para clasificar.' }, 400)

      const index = await loadNcmIndex(request.url, env.ASSETS)
      const classification = await classifyFullNcmWithSemantic(index, env.AI, facts)
      const clarification = await buildNcmClarification(
        env.AI,
        facts,
        classification,
        answers.length,
        answers.map((item) => item.factKey || '').filter(Boolean),
      )

      if (classification.status !== 'candidate' || !classification.code) {
        return json({ ...classification, clarification, tariff: null, sim: null })
      }
      if (clarification || classification.confidence === 'low') {
        return json({ ...classification, clarification, tariff: null, sim: null })
      }

      const tariff = await lookupNcmTariff(env.NCM_DB, classification.code)
      try {
        const sim = await resolveSimOpening(request.url, env.ASSETS, env.AI, classification.code, facts)
        return json({ ...classification, clarification: null, tariff, sim })
      } catch (error) {
        return json({
          ...classification,
          clarification: null,
          tariff,
          sim: {
            status: 'unavailable', ncmCode: classification.code, ncmLabel: classification.label,
            candidate: null, alternatives: [], confidence: 'missing', missingFacts: [], sourceDate: classification.sourceDate,
            rationale: [`No se pudo hidratar la apertura SIM: ${error instanceof Error ? error.message : 'unknown error'}. La NCM candidata se conserva; no se inventa un sufijo.`],
          },
        })
      }
    } catch (error) {
      return json({
        error: 'No pudimos consultar el índice NCM completo. ShippingAPP debe degradar sin inventar una posición.',
        detail: error instanceof Error ? error.message : 'unknown error',
      }, 503)
    }
  },
}
