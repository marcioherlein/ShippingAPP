import { apiFetch } from './apiClient'

export type EmailPreferences = {
  digestEnabled: boolean
  alertsEnabled: boolean
  marketingEnabled: boolean
  timezone: string
  updatedAt: string
  transactional: {
    configurable: false
    note: string
  }
}

export type EmailPreferencesPatch = Partial<Pick<EmailPreferences, 'digestEnabled' | 'alertsEnabled' | 'marketingEnabled' | 'timezone'>>

async function responseJson(response: Response) {
  let body: any = null
  try { body = await response.json() } catch { body = null }
  if (!response.ok) throw new Error(typeof body?.code === 'string' ? body.code : 'email_preferences_request_failed')
  return body
}

export async function loadEmailPreferences(): Promise<EmailPreferences> {
  const body = await responseJson(await apiFetch('/api/email-preferences'))
  if (!body?.preferences) throw new Error('email_preferences_invalid_response')
  return body.preferences as EmailPreferences
}

export async function saveEmailPreferences(patch: EmailPreferencesPatch): Promise<EmailPreferences> {
  const body = await responseJson(await apiFetch('/api/email-preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }))
  if (!body?.preferences) throw new Error('email_preferences_invalid_response')
  return body.preferences as EmailPreferences
}
