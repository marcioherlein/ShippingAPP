import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const semantics = readFileSync(new URL('./lib/journeySemantics.ts', import.meta.url), 'utf8')
const polish = readFileSync(new URL('./styles/p2-semantic-polish.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const e2e = readFileSync(new URL('../tests/e2e/p2-semantics.e2e.ts', import.meta.url), 'utf8')

describe('P2 journey semantics contract', () => {
  it('exposes chip choices as grouped radio controls', () => {
    expect(semantics).toContain("'role', 'radiogroup'")
    expect(semantics).toContain("'role', 'radio'")
    expect(semantics).toContain("'aria-checked'")
    expect(semantics).toContain("event.key === 'ArrowRight'")
    expect(semantics).toContain("event.key === 'Home'")
  })

  it('explains disabled progression visually and accessibly', () => {
    expect(semantics).toContain('data-disabled-reason')
    expect(semantics).toContain("'aria-label'")
    expect(polish).toContain("content: attr(data-disabled-reason)")
  })

  it('loads semantic polish before the final accessibility override', () => {
    expect(main.indexOf("./styles/p2-semantic-polish.css")).toBeGreaterThan(-1)
    expect(main.indexOf("./styles/p2-semantic-polish.css")).toBeLessThan(main.indexOf("./styles/accessibility.css"))
    expect(main).toContain('installJourneySemantics()')
  })

  it('keeps browser regressions for radio semantics and readable body copy', () => {
    expect(e2e).toContain("getByRole('radiogroup'")
    expect(e2e).toContain("getByRole('radio'")
    expect(e2e).toContain('data-disabled-reason')
    expect(e2e).toContain('toBeGreaterThanOrEqual(16)')
  })
})
