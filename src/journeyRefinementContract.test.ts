import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const refinementCss = readFileSync(new URL('./styles/journey-refinement.css', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')

describe('journey refinement contract', () => {
  it('compresses onboarding chrome after the user chooses an entry path', () => {
    expect(refinementCss).toContain('.journey-app:has(.journey-bubble.user) .journey-hero')
    expect(refinementCss).toContain('.journey-app:has(.journey-bubble.user) .journey-hero > p')
    expect(refinementCss).toContain('display: none')
  })

  it('removes consumed teaching copy while preserving completed stage receipts', () => {
    expect(refinementCss).toContain('.journey-bubble.assistant:has(+ .journey-question-card:not(.active))')
    expect(refinementCss).toContain('.journey-question-card:not(.active)')
    expect(refinementCss).toContain('.journey-complete-row')
    expect(refinementCss).toContain('.journey-question-head > button')
  })

  it('gives the current task stronger hierarchy than completed stages', () => {
    expect(refinementCss).toContain('.journey-question-card.active')
    expect(refinementCss).toContain('--journey-current-ring')
    expect(refinementCss).toContain('box-shadow: 0 0 0 4px')
  })

  it('keeps the refinement layer below accessibility overrides', () => {
    const refinementImport = mainSource.indexOf("import './styles/journey-refinement.css'")
    const accessibilityImport = mainSource.indexOf("import './styles/accessibility.css'")
    expect(refinementImport).toBeGreaterThan(-1)
    expect(accessibilityImport).toBeGreaterThan(refinementImport)
  })

  it('has an explicit mobile density treatment', () => {
    expect(refinementCss).toContain('@media (max-width: 640px)')
    expect(refinementCss).toContain('flex-wrap: nowrap')
    expect(refinementCss).toContain('white-space: nowrap')
  })
})
