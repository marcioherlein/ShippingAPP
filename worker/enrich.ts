import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'

type Env = { AI: { run: (model: string, input: unknown) => Promise<unknown> }; ASSETS: { fetch: (request: Request) => Promise<Response> } }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return baseWorker.fetch(request, env)
    const response = await baseWorker.fetch(request.clone(), env)
    if (!response.ok) return response
    const data = await response.json() as any
    const market = await analyzeArgentinaMarket(data.product?.name || '', data.product?.category || '')
    data.market = { ...data.market, details: market }
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  },
}
