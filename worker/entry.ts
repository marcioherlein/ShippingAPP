import app from './router'
import { authorizeRequest } from './auth'
import { withRequestContext } from './requestContext'
import { analyzeAlibabaSelfFirst, parseAlibabaSelfFirstUrl } from './alibabaSelfFirst'
import { handleAnalysisHistory, isAnalysisHistoryRoute } from './analysisHistory'

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return withRequestContext(request, env, async () => {
      const gate = await authorizeRequest(request, env)
      if (!gate.ok) return gate.response

      const url = new URL(gate.request.url)
      if (url.pathname === '/api/me' && gate.request.method === 'GET') {
        if (gate.identity?.kind !== 'user') {
          return Response.json({ error: 'Authentication rollout is not enabled.', code: 'auth_disabled' }, { status: 404 })
        }
        return Response.json({ authenticated: true, accountId: gate.identity.userId })
      }

      if (isAnalysisHistoryRoute(url.pathname)) {
        return handleAnalysisHistory(gate.request, env as any)
      }

      // Normal Alibaba analysis is self-scrape first. Parse.bot is now only an
      // optional supplement when first-party HTML/JSON does not complete the
      // mandatory product ficha. Explicit diagnostic sourceMode requests keep
      // using the existing router probes unchanged.
      if (url.pathname === '/api/analyze' && gate.request.method === 'POST') {
        let body: any = null
        try { body = await gate.request.clone().json() } catch { body = null }
        const alibabaUrl = !body?.sourceMode ? parseAlibabaSelfFirstUrl(body?.url) : null
        if (alibabaUrl) {
          try {
            return Response.json(await analyzeAlibabaSelfFirst(alibabaUrl, env as any))
          } catch {
            // Reliability backstop: if the new orchestrator itself fails, keep
            // the previous router pipeline available rather than dropping the case.
          }
        }
      }

      return app.fetch(gate.request, env as never)
    })
  },
}
