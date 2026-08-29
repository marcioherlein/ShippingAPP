import app from './enrich'
import { withRequestContext } from './requestContext'

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return withRequestContext(request, env, () => app.fetch(request, env as never))
  },
}
