import { chromium } from 'playwright'

const baseUrl = process.env.PRODUCTION_URL || 'https://shippingapp.marciofabrizio.workers.dev'
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'narrow-360', width: 360, height: 800 },
]

const failures = []
const results = []

function record(viewport, check, pass, detail) {
  results.push({ viewport, check, pass, detail })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${viewport} / ${check}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures.push({ viewport, check, detail })
}

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }).length)
}

async function assertNoOverflow(page, viewportName, phase) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  const overflow = Math.max(metrics.docScrollWidth, metrics.bodyScrollWidth) - metrics.innerWidth
  record(viewportName, `${phase}: no horizontal page overflow`, overflow <= 2, JSON.stringify({ ...metrics, overflow }))
}

async function assertVisibleBoxesInsideViewport(page, viewportName, phase) {
  const selector = [
    '.journey-topbar',
    '.journey-hero',
    '.journey-workspace',
    '.journey-conversation',
    '.journey-summary-sticky',
    '.journey-choice-grid',
    '.journey-question-card',
    '.journey-product-surface',
    '.url-analyzer',
    '.intake-message',
    '.finder-cache',
  ].join(',')

  const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      className: element.className,
      display: style.display,
      visibility: style.visibility,
      width: rect.width,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    }
  }).filter((box) => box.display !== 'none' && box.visibility !== 'hidden' && box.width > 0))

  const bad = boxes.filter((box) => box.left < -2 || box.right > page.viewportSize().width + 2)
  record(viewportName, `${phase}: visible boxes stay inside viewport`, bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 8)) : `${boxes.length} boxes checked`)
}

async function assertFonts(page, viewportName, phase) {
  await page.evaluate(() => document.fonts.ready)
  const fonts = await page.evaluate(() => {
    const selectors = ['body', '.journey-hero h1', '.journey-choice-grid button', 'input', 'select', '.journey-bubble p', '.intake-message p']
    const values = {}
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el) values[selector] = getComputedStyle(el).fontFamily
    }
    return {
      values,
      sap72Loaded: document.fonts.check('16px "72"'),
    }
  })
  const wrong = Object.entries(fonts.values).filter(([, family]) => !String(family).includes('72'))
  record(viewportName, `${phase}: unified 72 font stack`, wrong.length === 0, wrong.length ? JSON.stringify(wrong) : JSON.stringify(fonts.values))
  record(viewportName, `${phase}: SAP 72 webfont available`, fonts.sap72Loaded, `document.fonts.check=${fonts.sap72Loaded}`)
}

async function goToFinder(page) {
  await page.getByRole('button', { name: /Quiero buscarlo/i }).click()
  await page.getByRole('button', { name: /^Reventa$/i }).click()
  await page.getByRole('button', { name: /^Empresa$/i }).click()
  await page.getByRole('button', { name: /^Sí$/i }).click()
  await page.locator('.journey-question-fields select').selectOption('none')
  await page.getByRole('button', { name: /Seguir con presupuesto/i }).click()
  await page.getByRole('button', { name: /Tengo presupuesto/i }).click()
  await page.getByRole('button', { name: /Seguir con el producto/i }).click()
  await page.locator('.journey-product-surface .url-analyzer').waitFor({ state: 'visible', timeout: 10000 })
}

async function injectAdversarialChat(page) {
  await page.evaluate(() => {
    const analyzer = document.querySelector('.journey-product-surface .url-analyzer')
    if (!analyzer) throw new Error('url-analyzer not found')
    let thread = analyzer.querySelector('.intake-thread')
    if (!thread) {
      thread = document.createElement('div')
      thread.className = 'intake-thread'
      const form = analyzer.querySelector('.url-form')
      if (form) analyzer.insertBefore(thread, form)
      else analyzer.appendChild(thread)
    }
    const message = document.createElement('div')
    message.className = 'intake-message assistant audit-long-message'
    const label = document.createElement('span')
    label.textContent = 'ShippingAPP'
    const text = document.createElement('p')
    text.textContent = 'Producto con texto extremadamente largo: https://www.alibaba.com/product-detail/THIS_IS_A_VERY_LONG_UNBROKEN_TOKEN_1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz_9876543210 y NCM 1234.56.78.901Z para comprobar que ningún chatbot, URL o código salga del box.'
    message.append(label, text)
    thread.appendChild(message)
  })
}

async function assertRailAlignment(page, viewportName) {
  const values = await page.evaluate(() => {
    const selectors = ['.journey-question-card', '.journey-product-surface']
    return selectors.map((selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { selector, left: rect.left, right: rect.right, width: rect.width }
    }).filter(Boolean)
  })
  if (values.length < 2) {
    record(viewportName, 'finder: box rail alignment', false, `only ${values.length} comparable boxes found`)
    return
  }
  const leftSpread = Math.max(...values.map((v) => v.left)) - Math.min(...values.map((v) => v.left))
  const rightSpread = Math.max(...values.map((v) => v.right)) - Math.min(...values.map((v) => v.right))
  record(viewportName, 'finder: box rail alignment', leftSpread <= 2 && rightSpread <= 2, JSON.stringify({ leftSpread, rightSpread, boxes: values }))
}

async function main() {
  console.log(`ShippingAPP production layout audit -> ${baseUrl}`)
  const browser = await chromium.launch({ headless: true })
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
      const page = await context.newPage()
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 })

      const visibleEntryButtons = await visibleCount(page, '.journey-choice-grid.three > button')
      record(viewport.name, 'entry exposes exactly two visible paths', visibleEntryButtons === 2, `visible=${visibleEntryButtons}`)
      await assertNoOverflow(page, viewport.name, 'entry')
      await assertVisibleBoxesInsideViewport(page, viewport.name, 'entry')
      await assertFonts(page, viewport.name, 'entry')

      await goToFinder(page)
      await injectAdversarialChat(page)
      await page.waitForTimeout(100)

      await assertNoOverflow(page, viewport.name, 'finder')
      await assertVisibleBoxesInsideViewport(page, viewport.name, 'finder')
      await assertFonts(page, viewport.name, 'finder')
      await assertRailAlignment(page, viewport.name)

      const longMessage = await page.locator('.audit-long-message').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const parent = element.parentElement?.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width, parentLeft: parent?.left, parentRight: parent?.right }
      })
      const contained = longMessage.parentLeft !== undefined && longMessage.parentRight !== undefined
        && longMessage.left >= longMessage.parentLeft - 1 && longMessage.right <= longMessage.parentRight + 1
      record(viewport.name, 'finder: adversarial chat stays inside thread', contained, JSON.stringify(longMessage))

      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log('\n=== LAYOUT AUDIT SUMMARY ===')
  console.log(JSON.stringify({ total: results.length, passed: results.length - failures.length, failed: failures.length, failures }, null, 2))
  if (failures.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
