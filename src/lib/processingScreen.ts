export type ProcessingDetails = {
  title: string
  detail: string
  steps?: readonly string[]
  activeStep?: number
  priority?: number
}

type ProcessingState = ProcessingDetails & { id: symbol; startedAt: number }
const operations = new Map<symbol, ProcessingState>()
const listeners = new Set<() => void>()
let current: ProcessingState | null = null

function publish() {
  const next = [...operations.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.startedAt - a.startedAt)[0] ?? null
  if (next === current) return
  current = next
  listeners.forEach(listener => listener())
}

/** Only foreground work registers here; background account reads never lock the UI. */
export function startProcessing(details: ProcessingDetails) {
  const id = Symbol('processing')
  operations.set(id, { ...details, id, startedAt: Date.now() })
  publish()
  return {
    update(next: ProcessingDetails) {
      const previous = operations.get(id)
      if (!previous) return
      operations.set(id, { ...next, id, startedAt: previous.startedAt })
      publish()
    },
    finish() {
      operations.delete(id)
      publish()
    },
  }
}

export const getProcessingState = () => current
export function subscribeProcessing(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
