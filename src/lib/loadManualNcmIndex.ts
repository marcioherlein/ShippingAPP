import type { ManualNcmIndex } from './manualNcm'

/** Bound both the download and JSON parsing, including a stalled response body. */
export async function loadManualNcmIndex(signal: AbortSignal, timeoutMs = 12_000): Promise<ManualNcmIndex> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: () => void = () => undefined
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException('Carga cancelada', 'AbortError'))
      controller.abort()
    }
    signal.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      reject(new Error('El nomenclador tardó demasiado en responder. Reintentá sin cambiar de producto.'))
      controller.abort()
    }, timeoutMs)
    if (signal.aborted) cancel()
  })
  const download = async () => {
    const response = await fetch('/data/ncm-index.json', { signal: controller.signal })
    if (!response.ok) throw new Error('No pude cargar el nomenclador. Reintentá sin cambiar de producto.')
    const data = await response.json()
    if (!Array.isArray(data?.records) || !data.records.length || !data.meta?.sourceDate ||
      !data.records.every((row: unknown) => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string')) {
      throw new Error('El nomenclador recibido está incompleto. Reintentá la carga.')
    }
    return data as ManualNcmIndex
  }
  try {
    return await Promise.race([download(), interrupted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
