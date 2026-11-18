export type AlibabaReadOptions = { signal?: AbortSignal; timeoutMs?: number }

/** One deadline includes headers, body consumption and any follow-up attempts. */
export function createAlibabaReadBudget(options: AlibabaReadOptions, defaultTimeoutMs: number) {
  const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
    ? Math.max(0, options.timeoutMs) : defaultTimeoutMs
  const deadline = Date.now() + timeoutMs
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new DOMException('Alibaba read budget exhausted', 'TimeoutError')), timeoutMs)

  return {
    remainingMs: () => Math.max(0, deadline - Date.now()),
    async run<T>(operation: (signal: AbortSignal) => Promise<T>, stageLimitMs = timeoutMs): Promise<T> {
      if (controller.signal.aborted) throw controller.signal.reason
      const remaining = Math.min(Math.max(0, deadline - Date.now()), stageLimitMs)
      if (remaining <= 0) throw new DOMException('Alibaba read budget exhausted', 'TimeoutError')
      const stage = new AbortController()
      const abortStage = () => stage.abort(controller.signal.reason)
      controller.signal.addEventListener('abort', abortStage, { once: true })
      const stageTimer = setTimeout(() => stage.abort(new DOMException('Alibaba source step timed out', 'TimeoutError')), remaining)
      let rejectAborted: () => void = () => undefined
      try {
        return await Promise.race([
          new Promise<never>((_resolve, reject) => {
            rejectAborted = () => reject(stage.signal.reason)
            stage.signal.addEventListener('abort', rejectAborted, { once: true })
            if (stage.signal.aborted) rejectAborted()
          }),
          Promise.resolve().then(() => {
            if (stage.signal.aborted) throw stage.signal.reason
            return operation(stage.signal)
          }),
        ])
      } finally {
        clearTimeout(stageTimer)
        controller.signal.removeEventListener('abort', abortStage)
        stage.signal.removeEventListener('abort', rejectAborted)
      }
    },
    dispose() {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      controller.abort(new DOMException('Alibaba read finished', 'AbortError'))
    },
  }
}

export type AlibabaReadBudget = ReturnType<typeof createAlibabaReadBudget>

export async function bufferAlibabaResponse(response: Response) {
  if (!response.body || [204, 205, 304].includes(response.status)) return response
  const body = await response.arrayBuffer()
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
