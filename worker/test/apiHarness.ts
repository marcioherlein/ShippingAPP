export function apiRequest(path: string, options: RequestInit = {}) {
  return new Request(`https://shippingapp.test${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value)
}

export async function responseJson<T = any>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export function fakeSecretEnv(overrides: Record<string, unknown> = {}) {
  return {
    PARSEBOT_API_KEY: 'test-parsebot-secret-value',
    MERCADOLIBRE_ACCESS_TOKEN: 'test-mercadolibre-access-token',
    MERCADOLIBRE_CLIENT_SECRET: 'test-mercadolibre-client-secret',
    MERCADOLIBRE_REFRESH_TOKEN: 'test-mercadolibre-refresh-token',
    ...overrides,
  }
}
