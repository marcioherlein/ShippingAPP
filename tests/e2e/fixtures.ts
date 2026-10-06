import { test as base, expect } from '@playwright/test'

/**
 * The app now opens on a standalone marketing Landing screen; the tool itself
 * only renders once the user "enters" (persisted as localStorage
 * `shippingapp:entered`). These flow tests exercise the tool, not the landing,
 * so we seed the entered flag before any app JS runs — the standard way to jump
 * a test straight to the state under test. The landing screen and its jump-free
 * entry are covered separately in `landing.e2e.ts`.
 */
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
