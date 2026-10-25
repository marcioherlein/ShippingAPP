import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

// Render production components with deterministic account data, without claiming
// an authenticated Clerk/backend session. Vite serves this test module only;
// the fixture is not part of index.html or the production Rollup entry graph.
async function openPanels(page: Page) {
  await page.route('**/__account-panels-audit', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paneles</title></head><body><div id="root"></div><script type="module" src="/tests/e2e/support/account-panels.fixture.tsx"></script></body></html>` }))
  await page.goto('/__account-panels-audit')
  await expect(page.getByRole('heading', { name: 'Paneles de cuenta' })).toBeVisible()
}

for (const width of [320, 1440]) {
  test(`account panels recover and preserve keyboard context at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const history = { id: 'saved-1', createdAt: '2026-10-23T12:00:00Z', productName: 'Termo guardado', sourceUrl: null, ncmCode: '9617.00.10', selectedMode: 'lcl', unitCostUsd: 10, totalCostUsd: 1000 }
    const tracked = { id: 'tracked-1', analysisId: history.id, title: 'Termo seguido', sourceUrl: '', createdAt: history.createdAt, updatedAt: history.createdAt, ncmCode: history.ncmCode, latestSnapshot: null, previousSnapshot: null, changes: { marketPricePct: null, landedCostPct: null, grossMarginPoints: null }, snapshots: [] }
    let historyLoads = 0
    let watchlistLoads = 0
    let historyRemoved = false
    let watchlistRemoved = false
    const deletions = { history: 0, watchlist: 0 }
    await page.route('**/api/history?*', route => {
      historyLoads += 1
      return route.fulfill({ status: historyLoads === 1 ? 503 : 200, json: historyLoads === 1 ? { error: 'No pudimos cargar tu historial.' } : { items: historyLoads === 2 || historyRemoved ? [] : [history], nextCursor: null } })
    })
    await page.route('**/api/history-item?*', route => {
      if (route.request().method() === 'DELETE') {
        historyRemoved = true
        deletions.history += 1
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill({ json: { item: { id: history.id, createdAt: history.createdAt, updatedAt: history.createdAt, input: {}, result: { analysis: { product: { name: history.productName } } } } } })
    })
    await page.route('**/api/watchlist', route => {
      watchlistLoads += 1
      return route.fulfill({ status: watchlistLoads === 1 ? 503 : 200, json: watchlistLoads === 1 ? { error: 'No pudimos cargar tus productos seguidos.' } : { items: watchlistLoads === 2 || watchlistRemoved ? [] : [tracked] } })
    })
    await page.route('**/api/watchlist-item?*', route => {
      if (route.request().method() === 'DELETE') {
        watchlistRemoved = true
        deletions.watchlist += 1
        return route.fulfill({ status: 204, body: '' })
      }
      return route.fulfill({ json: { item: tracked } })
    })
    await openPanels(page)
    for (const panel of [
      { trigger: 'Historial', name: 'Historial de análisis', close: 'Cerrar historial', empty: 'Todavía no hay análisis guardados.', open: 'Abrir análisis', back: '← Volver al historial', remove: 'Eliminar', title: history.productName },
      { trigger: 'Seguimiento', name: 'Productos seguidos', close: 'Cerrar seguimiento', empty: 'Todavía no seguís ningún producto.', open: 'Ver historial', back: '← Volver al seguimiento', remove: 'Quitar', title: tracked.title },
    ]) {
      const trigger = page.getByRole('button', { name: panel.trigger, exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: panel.name })
      await expect(dialog.getByRole('button', { name: panel.close })).toBeFocused()
      await expect(dialog.getByRole('alert')).toBeVisible()
      await dialog.getByRole('button', { name: 'Reintentar' }).click()
      await expect(dialog.getByText(panel.empty, { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await dialog.getByRole('button', { name: panel.open, exact: true }).click()
      const back = dialog.getByRole('button', { name: panel.back, exact: true })
      await expect(back).toBeFocused()
      await back.click()
      await expect(dialog.getByRole('button', { name: panel.close })).toBeFocused()
      const box = await dialog.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      const close = await dialog.getByRole('button', { name: panel.close }).boundingBox()
      expect(close!.height).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: testInfo.outputPath(`${panel.trigger}-${width}.png`) })
      // These panels are deliberately non-modal: pointer interaction elsewhere
      // dismisses them and keeps focus at the chosen background control.
      const outside = page.getByRole('button', { name: 'Volver al cotizador' })
      await outside.click()
      await expect(dialog).not.toBeVisible()
      await expect(outside).toBeFocused()
      await trigger.click()
      const row = dialog.getByRole('article').filter({ hasText: panel.title })
      await expect(row).toBeVisible()
      const confirmation = page.waitForEvent('dialog').then(async prompt => {
        expect(prompt.type()).toBe('confirm')
        expect(prompt.message()).toMatch(/Eliminar|Dejar de seguir/)
        await prompt.accept()
      })
      await row.getByRole('button', { name: panel.remove, exact: true }).click()
      await confirmation
      await expect(row).toHaveCount(0)
      await expect(dialog.getByRole('alert')).toHaveCount(0)
      await expect(dialog.getByText(panel.empty, { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: panel.close })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    }
    expect(deletions).toEqual({ history: 1, watchlist: 1 })
  })

  test(`email modal contains keyboard focus and saves valid changes at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const preferences = { digestEnabled: true, alertsEnabled: false, marketingEnabled: false, timezone: 'UTC', updatedAt: '2026-10-23T12:00:00Z', transactional: { configurable: false, note: 'Avisos operativos.' } }
    let saves = 0
    let releaseSave: (() => void) | undefined
    const saveGate = new Promise<void>(resolve => { releaseSave = resolve })
    await page.route('**/api/email-preferences', async route => {
      if (route.request().method() !== 'PATCH') return route.fulfill({ json: { preferences } })
      saves += 1
      if (saves === 1) {
        await saveGate
        return route.fulfill({ status: 503, json: { code: 'temporarily_unavailable' } })
      }
      return route.fulfill({ json: { preferences: { ...preferences, ...route.request().postDataJSON() } } })
    })
    await openPanels(page)
    const trigger = page.getByRole('button', { name: 'Emails', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Qué querés recibir' })
    await expect(dialog.getByRole('button', { name: 'Cerrar preferencias de email' })).toBeFocused()
    await expect(dialog.getByRole('button', { name: 'Guardar preferencias' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Guardar preferencias' })).toHaveCSS('color', 'rgb(255, 255, 255)')
    const panelBox = await dialog.locator('.email-pref-panel').boundingBox()
    expect(panelBox!.x).toBeGreaterThanOrEqual(0)
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width)
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(900)
    // Verify actual native top-layer modality and browser focus containment.
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Guardar preferencias' })).toBeFocused()
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    }
    const timezone = dialog.getByRole('textbox', { name: 'Zona horaria' })
    await timezone.fill('Not/AZone')
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click()
    await expect(timezone).toHaveAttribute('aria-invalid', 'true')
    await expect(timezone).toBeFocused()
    await expect(dialog.getByRole('alert')).toContainText('zona válida')
    expect(saves).toBe(0)
    await timezone.fill('America/Argentina/Buenos_Aires')
    const digest = dialog.getByRole('checkbox', { name: /Resumen semanal/ })
    await digest.uncheck()
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click()
    await expect(digest).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled()
    releaseSave!()
    await expect(dialog.getByRole('alert')).toContainText('No pudimos guardar')
    await expect(digest).not.toBeChecked()
    await expect(digest).toBeEnabled()
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click()
    await expect(dialog.getByText('Guardado', { exact: true })).toBeVisible()
    expect(saves).toBe(2)
    await page.screenshot({ path: testInfo.outputPath(`email-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })
}
