import { test as base, expect } from '@playwright/test'

// Tests for an existing case seed the calculator entry flag. Landing tests
// exercise the public product-first path without this seed.
// Restricted workspaces cannot spawn Chromium's renderer processes. Isolate
// each test in a fresh browser when explicitly opting into the local fallback.
export const browserTest = process.env.PW_CHROMIUM_SINGLE_PROCESS === '1' ? base.extend({
  page: async ({ playwright, browserName, launchOptions, contextOptions }, use, testInfo) => {
    const browser = await playwright[browserName].launch(launchOptions)
    const configured = testInfo.project.use
    const context = await browser.newContext({
      ...contextOptions, baseURL: configured.baseURL, viewport: configured.viewport,
      userAgent: configured.userAgent, deviceScaleFactor: configured.deviceScaleFactor,
      isMobile: configured.isMobile, hasTouch: configured.hasTouch,
      colorScheme: configured.colorScheme,
    })
    const page = await context.newPage()
    try { await use(page) } finally { await browser.close() }
  },
}) : base

export const test = browserTest.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('shippingapp:entered', '1') } catch { /* storage may be unavailable */ }
    })
    await use(page)
  },
})

export { expect }
