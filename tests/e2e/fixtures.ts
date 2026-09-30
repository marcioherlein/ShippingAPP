import { test as base, expect } from '@playwright/test'

/**
 * The app now opens on a standalone marketing Landing screen; the tool itself
 * only renders once the user "enters" (persisted as localStorage
 * `shippingapp:entered`). These flow tests exercise the tool, not the landing,
 * so we seed the entered flag before any app JS runs — the standard way to jump
 * a test straight to the state under test. The landing screen and its jump-free
 * entry are covered separately in `landing.e2e.ts`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('shippingapp:entered', '1') } catch { /* storage may be unavailable */ }
    })
    await use(page)
  },
})

export { expect }
