import app from './router'
import { authorizeRequest } from './auth'
import { withRequestContext } from './requestContext'

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

      return app.fetch(gate.request, env as never)
    })
  },
}
