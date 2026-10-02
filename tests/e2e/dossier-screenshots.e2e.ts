/**
 * Standalone dossier screenshots — two fixture states
 * ─────────────────────────────────────────────────────
 * Uses /fixture-dossier.html?fixture=provisional|confirmed to render
 * ImportQuoteFlow in isolation (no live classifier, no Clerk auth).
 *
 * State A — provisional / estimate: LOW classification + estimate market
 * State B — confirmed / live: high-confidence NCM + live MercadoLibre data
 */

import { expect, test } from '@playwright/test'

async function openDossier(
  page: import('@playwright/test').Page,
  fixture: 'provisional' | 'confirmed',
) {
  await page.goto(`/fixture-dossier.html?fixture=${fixture}`)
  // Wait for the hero cost number to appear — component has computed.
  await page.waitForSelector('.result-hero-number', { timeout: 10000 })

  // Expand all collapsible details so the full dossier is captured.
  const summaries = await page.locator('.result-collapsible > summary').all()
  for (const s of summaries) {
    const open = await s.evaluate((el) => (el.parentElement as HTMLDetailsElement | null)?.open)
    if (!open) await s.click()
  }
  await page.waitForTimeout(150) // let open animations settle
}

// ── Provisional + estimate ──────────────────────────────────────────────────

test.describe('dossier: provisional classification + estimate market', () => {
  test('desktop 1440px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openDossier(page, 'provisional')

    // Provisional warning banner visible.
    await expect(page.locator('.result-hero-provisional')).toBeVisible()
    await expect(page.locator('.result-hero-provisional')).toContainText('Clasificación estimada')

    // Market estimate section: search buttons + estimate hero present.
    await expect(page.locator('.market-search-actions')).toBeVisible()
    await expect(page.locator('.market-estimate-hero')).toBeVisible()

    // No horizontal overflow.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('dossier-provisional-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('mobile 390px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDossier(page, 'provisional')

    await expect(page.locator('.result-hero-provisional')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('dossier-provisional-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })
})

// ── Confirmed + live market ─────────────────────────────────────────────────

test.describe('dossier: confirmed classification + live market', () => {
  test('desktop 1440px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openDossier(page, 'confirmed')

    // No provisional banner.
    await expect(page.locator('.result-hero-provisional')).toHaveCount(0)

    // Live market comparables.
    await expect(page.locator('.market-provenance')).toBeVisible()
    await expect(page.locator('.market-provenance')).toContainText('comparables')

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('dossier-confirmed-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('mobile 390px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDossier(page, 'confirmed')

    await expect(page.locator('.result-hero-provisional')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('dossier-confirmed-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })
})
