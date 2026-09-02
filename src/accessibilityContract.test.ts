import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('./components/CalculationPipeline.tsx', import.meta.url), 'utf8')
const accessibilityCss = readFileSync(new URL('./styles/accessibility.css', import.meta.url), 'utf8')

describe('primary journey accessibility contract', () => {
  it('keeps visible keyboard focus for the interactive surface', () => {
    expect(accessibilityCss).toContain(':focus-visible')
    expect(accessibilityCss).toContain('outline: 3px solid var(--a11y-focus)')
    expect(accessibilityCss).toContain('.mobile-bottom-nav a:focus-visible')
  })

  it('keeps functional metadata on the accessible muted token', () => {
    expect(accessibilityCss).toContain('--a11y-functional-muted: #64748b')
    expect(accessibilityCss).toContain('.journey-question-head small')
    expect(accessibilityCss).toContain('.pipeline-step-copy small')
    expect(accessibilityCss).toContain('.quote-customs-facts small')
  })

  it('exposes calculation status and progress semantically', () => {
    expect(pipelineSource).toContain('aria-busy={status === \'processing\'}')
    expect(pipelineSource).toContain('role="status"')
    expect(pipelineSource).toContain('aria-live="polite"')
    expect(pipelineSource).toContain('role="progressbar"')
    expect(pipelineSource).toContain('aria-valuenow={Math.round(progress)}')
    expect(pipelineSource).toContain('aria-current={state === \'active\' ? \'step\' : undefined}')
    expect(pipelineSource).toContain('className="pipeline-blocker" role="alert"')
  })

  it('provides a reduced-motion fallback for CSS animations', () => {
    expect(accessibilityCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(accessibilityCss).toContain('animation-duration: 0.01ms !important')
  })
})
