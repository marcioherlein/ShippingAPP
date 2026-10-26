import { expect, test } from './fixtures'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shared header fits narrow phones and desktop in ${colorScheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      // The first decision must fit the screen without an empty operation rail.
      await expect(page.getByRole('heading', { name: 'Elegí cómo empezar' })).toBeVisible()
      await expect(page.locator('.journey-case-summary')).toHaveCount(0)
      await expect(page.locator('.gs-chat-panel-header')).not.toBeVisible()
      const entryChoices = page.locator('.journey-entry-panel button:visible')
      await expect(entryChoices).toHaveCount(2)
      for (const choice of await entryChoices.all()) {
        const box = await choice.boundingBox()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(844)
      }
      // CI runs without a Clerk key. Include the real signed-out control
      // classes so cascade conflicts and mobile account overflow are covered.
      await expect(page.locator('.app-header-account')).toBeVisible()
      await page.evaluate(() => {
        document.querySelector('.app-header-account')!.innerHTML = '<div class="auth-account-control"><button type="button" class="auth-secondary">Ingresar</button><button type="button" class="auth-primary">Crear cuenta</button></div>'
      })
      const header = page.locator('.app-header')
      const signUp = header.getByRole('button', { name: 'Crear cuenta', exact: true })
      if (width <= 460) await expect(signUp).not.toBeVisible()
      else {
        await expect(signUp).toBeVisible()
        await expect(signUp).toHaveCSS('color', 'rgb(255, 255, 255)')
        expect(await signUp.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
      }
      await expect(header.getByRole('link', { name: 'GlobalShipping, inicio' })).toBeVisible()
      await expect(page.locator('.journey-brand-mark')).toHaveCount(0)
      await expect(header.getByRole('button', { name: 'Nuevo caso', exact: true })).toBeVisible()
      const controls = await header.locator('a:visible, button:visible').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, height: rect.height }
      }))
      for (const control of controls) {
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(width)
        expect(control.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`header-${colorScheme}-${width}.png`) })
    }
    await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
    await expect(page.locator('.journey-case-summary')).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Reventa', exact: true })).toBeVisible()
    await expect(page.getByRole('progressbar')).toBeVisible()
    await page.getByRole('button', { name: 'Nuevo caso', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Seguir con este caso', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
}
