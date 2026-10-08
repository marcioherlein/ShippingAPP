import { expect, test } from './fixtures'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`shared header fits narrow phones and desktop in ${colorScheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      const header = page.locator('.app-header')
      await expect(header.getByRole('link', { name: 'GlobalShipping, inicio' })).toBeVisible()
      await expect(page.locator('.journey-brand-mark')).toHaveCount(0)
      await expect(header.getByRole('button', { name: 'Nuevo caso', exact: true })).toBeVisible()
      const controls = await header.locator('a, button').evaluateAll(elements => elements.map(element => {
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
    await page.getByRole('button', { name: 'Nuevo caso', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Seguir con este caso', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
}
