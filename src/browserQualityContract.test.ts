import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const playwrightConfig = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8')
const browserTest = readFileSync(new URL('../tests/e2e/accessibility.e2e.ts', import.meta.url), 'utf8')

describe('browser quality gate contract', () => {
  it('keeps Playwright and axe pinned in the project', () => {
    expect(packageJson).toContain('"@playwright/test": "1.62.1"')
    expect(packageJson).toContain('"@axe-core/playwright": "4.13.0"')
    expect(packageJson).toContain('"test:e2e": "playwright test"')
  })

  it('runs Chromium accessibility gates in CI', () => {
    expect(workflow).toContain('Install Chromium for browser quality gates')
    expect(workflow).toContain('npx playwright install --with-deps chromium')
    expect(workflow).toContain('Browser accessibility and UX gates')
    expect(workflow).toContain('npm run test:e2e')
  })

  it('isolates browser tests from Vitest discovery', () => {
    expect(playwrightConfig).toContain("testMatch: '**/*.e2e.ts'")
    expect(browserTest).toContain("from '@playwright/test'")
  })

  it('covers axe, keyboard focus, reduced motion and mobile hierarchy', () => {
    expect(browserTest).toContain("from '@axe-core/playwright'")
    expect(browserTest).toContain('serious')
    expect(browserTest).toContain('critical')
    expect(browserTest).toContain("page.keyboard.press('Tab')")
    expect(browserTest).toContain('outlineWidth')
    expect(browserTest).toContain("reducedMotion: 'reduce'")
    expect(browserTest).toContain('width: 390')
  })
})
