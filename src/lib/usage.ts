import { apiFetch } from './apiClient'

export type UsageSummary = {
  plan: {
    code: string
    name: string
    monthlyCredits: number
    monitoringEnabled: boolean
  }
  period: {
    id: string
    start: string
    end: string
    creditsGranted: number
    creditsConsumed: number
    creditsRemaining: number
  }
}

export async function loadUsage(): Promise<UsageSummary> {
  const response = await apiFetch('/api/usage')
  const body = await response.json() as { usage?: UsageSummary; error?: string }
  if (!response.ok || !body.usage) {
    throw new Error(body.error || 'No pudimos consultar tus créditos.')
  }
  return body.usage
}

export function usageLabel(usage: UsageSummary) {
  if (usage.plan.code === 'admin') return 'Admin · créditos ilimitados'
  const remaining = Math.max(0, usage.period.creditsRemaining)
  const granted = Math.max(0, usage.period.creditsGranted)
  return `${usage.plan.name} · ${remaining}/${granted} créditos`
}
