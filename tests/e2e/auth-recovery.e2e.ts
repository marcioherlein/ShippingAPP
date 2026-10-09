import { test, expect } from './fixtures'

for (const width of [320, 390]) {
  test(`search resumes once after verified identity and redirect at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const keys: string[] = []
    await page.route('**/api/opportunity-search', async route => {
      keys.push(route.request().headers()['idempotency-key'])
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        status: 'live', mode: 'direct', query: 'electric motorcycle', constraints: {}, note: '',
        results: [{ title: 'Moto eléctrica confirmada', url: 'https://www.alibaba.com/product-detail/Electric-motorcycle_1600000000001.html' }],
      }) })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Quiero buscarlo/ }).click()
    await page.getByRole('radio', { name: 'Reventa', exact: true }).click()
    await page.getByRole('radio', { name: 'Empresa', exact: true }).click()
    await page.getByRole('radio', { name: 'Sí', exact: true }).click()
    await page.getByRole('button', { name: /Seguir con presupuesto/ }).click()
    await page.getByRole('radio', { name: /Todavía no sé/ }).click()
    await page.getByRole('button', { name: /Seguir con el producto/ }).click()
    const query = 'Motocicleta eléctrica completa para circular'
    const input = page.getByRole('textbox', { name: 'Buscar productos en Alibaba' })
    await input.fill(query)
    // CI has no production Clerk account. Explicitly exercise the durable
    // app state boundary, without presenting this as a real Clerk login.
    await page.evaluate(async () => {
      const auth = await import('/src/lib/authSession.ts')
      auth.setSessionState('signed_out')
    })
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Ingresá a tu cuenta')
    const operationId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shippingapp:product-draft:operation-search')!).data.id)
    expect(keys).toHaveLength(0)
    const returnUrl = page.url()
    await page.goto('about:blank')
    await page.goto(returnUrl)
    await expect(input).toHaveValue(query)
    await page.evaluate(async () => {
      const auth = await import('/src/lib/authSession.ts')
      const api = await import('/src/lib/apiClient.ts')
      api.setApiTokenProvider(async () => 'test-session')
      auth.setSessionState('verifying')
    })
    expect(keys).toHaveLength(0)
    await page.evaluate(async () => (await import('/src/lib/authSession.ts')).setSessionState('ready'))
    await expect(page.getByText('Moto eléctrica confirmada', { exact: true })).toBeVisible()
    expect(keys).toEqual([operationId])
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('shippingapp:auth-resolved')))
    await expect(page.getByRole('button', { name: 'Buscar', exact: true })).toBeEnabled()
    expect(keys).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
