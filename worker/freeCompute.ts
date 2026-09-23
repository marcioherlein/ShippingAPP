type ComputeNamespace = {
  newUniqueId(): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

/** Keep the edge request cheap: no body parsing, scoring or response cloning.
 * A fresh object gives each request its own outgoing-connection budget; a global
 * singleton would put concurrent retailer searches in the same I/O context.
 * No object ID, request body, timer, alarm or storage is retained.
 */
export async function dispatchComputeRequest(
  request: Request,
  env: Record<string, unknown>,
  local: () => Promise<Response>,
): Promise<Response> {
  const path = new URL(request.url).pathname
  if (env.FREE_COMPUTE_ENABLED !== 'true' || !path.startsWith('/api/')) return local()

  const namespace = env.SHIPPING_COMPUTE as ComputeNamespace | undefined
  try {
    if (!namespace) throw new Error('compute_binding_missing')
    return await namespace.get(namespace.newUniqueId()).fetch(request)
  } catch {
    // Do not replay a request: it might have already consumed a credit or saved
    // an analysis. Quota exhaustion must not trigger the CPU-limited old path.
    return Response.json({
      error: 'No pudimos completar la solicitud. Intentá nuevamente más tarde.',
      code: 'compute_unavailable',
    }, { status: 503, headers: { 'cache-control': 'no-store', 'x-request-id': crypto.randomUUID() } })
  }
}
