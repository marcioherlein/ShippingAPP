import { apiFetch } from './apiClient'
import {
  mergeFullCustomsProfile,
  type FullNcmApiResult,
  type FullNcmFacts,
} from './fullNcmClient'

export { mergeFullCustomsProfile }

export async function classifyNcmRemote(facts: FullNcmFacts, usageReservationId: string): Promise<FullNcmApiResult> {
  const reservationId = usageReservationId?.trim()
  if (!reservationId) throw new Error('La clasificación requiere la reserva del análisis activo.')
  const response = await apiFetch('/api/ncm-classify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shippingapp-usage-reservation': reservationId,
    },
    body: JSON.stringify(facts),
  })
  const data = await response.json() as FullNcmApiResult & { error?: string }
  if (!response.ok) throw new Error(data.error || 'No pudimos consultar el nomenclador completo.')
  return data
}
