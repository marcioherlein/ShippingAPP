import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const motion = fs.readFileSync(new URL('./lib/motionPreference.ts', import.meta.url), 'utf8')
const polish = fs.readFileSync(new URL('./styles/p2-semantic-polish.css', import.meta.url), 'utf8')

describe('UI audit WARN cleanup contract', () => {
  it('routes application scrolling through the reduced-motion helper', () => {
    expect(app).toContain("from './lib/motionPreference'")
    expect(app).toContain('scrollElementIntoView(')
    expect(app).toContain('scrollWindowToTop()')
    expect(app).not.toContain("behavior: 'smooth'")
    expect(motion).toContain("'(prefers-reduced-motion: reduce)'")
    expect(motion).toContain("? 'auto' : 'smooth'")
  })

  it('uses the shared SVG primitive for journey control icons', () => {
    expect(app).toContain('<UiIcon name="product"')
    expect(app).toContain('<UiIcon name="search"')
    expect(app).toContain('<UiIcon name="sparkles"')
    expect(app).toContain('<UiIcon name="check"')
    expect(app).toContain('<UiIcon name="arrow-right"')
    expect(app).not.toContain('>▣<')
    expect(app).not.toContain('>⌕<')
    expect(app).not.toContain('>✦<')
  })

  it('keeps compact interactive targets at the 44px audit target', () => {
    expect(polish).toContain('min-height: 44px')
    expect(polish).toContain('min-width: 44px')
    expect(polish).toContain('.journey-chip-row > button')
    expect(polish).toContain('.journey-question-head > button')
  })
})
