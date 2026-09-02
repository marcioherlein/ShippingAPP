import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const designSystemCss = readFileSync(new URL('./styles/design-system.css', import.meta.url), 'utf8')
const iconSource = readFileSync(new URL('./components/UiIcon.tsx', import.meta.url), 'utf8')
const intakeSource = readFileSync(new URL('./components/OwnedProductIntake.tsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')

describe('ShippingAPP design system contract', () => {
  it('defines stable typography, spacing, shape, color, elevation and motion tokens', () => {
    for (const token of [
      '--ds-font-sans',
      '--ds-type-display',
      '--ds-space-4',
      '--ds-radius-md',
      '--ds-text-strong',
      '--ds-surface-glass',
      '--ds-shadow-2',
      '--ds-motion-fast',
    ]) {
      expect(designSystemCss).toContain(token)
    }
  })

  it('migrates the primary journey and pipeline surfaces onto semantic tokens', () => {
    expect(designSystemCss).toContain('border-radius: var(--ds-radius-2xl)')
    expect(designSystemCss).toContain('box-shadow: var(--ds-shadow-3), var(--ds-glass-inset)')
    expect(designSystemCss).toContain('color: var(--ds-text-muted)')
    expect(designSystemCss).toContain('transition:')
  })

  it('loads design-system tokens before accessibility overrides', () => {
    expect(mainSource.indexOf("./styles/design-system.css")).toBeGreaterThan(-1)
    expect(mainSource.indexOf("./styles/accessibility.css")).toBeGreaterThan(mainSource.indexOf("./styles/design-system.css"))
  })

  it('provides one reusable SVG icon primitive', () => {
    expect(iconSource).toContain('export type UiIconName')
    expect(iconSource).toContain('aria-hidden="true"')
    expect(iconSource).toContain('stroke="currentColor"')
  })

  it('removes font glyph icons from the owned-product intake', () => {
    expect(intakeSource).toContain('<UiIcon name="external-link"')
    expect(intakeSource).toContain('<UiIcon name="edit"')
    expect(intakeSource).toContain('<UiIcon name="arrow-right"')
    expect(intakeSource).not.toContain('>↗<')
    expect(intakeSource).not.toContain('>✎<')
    expect(intakeSource).not.toContain('>→<')
  })
})
