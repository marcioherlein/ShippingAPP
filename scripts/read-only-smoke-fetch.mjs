const CONNECTION_RESET_CODES = new Set(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'])

function isConnectionReset(error) {
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth++) {
    if (CONNECTION_RESET_CODES.has(current.code)) return true
  }
  return false
}

/** Only for read-only smoke POSTs with a replayable JSON body, never mutations. */
export async function readOnlySmokeFetch(fetcher, input, init = {}, timeoutMs = 15_000) {
  const controller = new AbortController()
  const abort = () => controller.abort(init.signal.reason)
  init.signal?.addEventListener('abort', abort, { once: true })
  if (init.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new DOMException('Production smoke read timed out', 'TimeoutError')), timeoutMs)
  const read = async () => {
    controller.signal.throwIfAborted()
    const response = await fetcher(input, { ...init, signal: controller.signal })
    const text = await response.text()
    return { response, text }
  }
  try {
    try { return await read() }
    catch (error) {
      if (controller.signal.aborted || !isConnectionReset(error)) throw error
      console.warn('Production smoke: retrying one reset connection inside the original read deadline.')
      return await read()
    }
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}
