import { describe, expect, it, vi } from 'vitest'
import { preferredScrollBehavior, prefersReducedMotion, scrollElementIntoView, scrollWindowToTop } from './motionPreference'

function motionTarget(reduced: boolean) {
  return {
    matchMedia: vi.fn(() => ({ matches: reduced })) as unknown as Window['matchMedia'],
  }
}

describe('motion preference helpers', () => {
  it('uses auto scrolling when reduced motion is requested', () => {
    const target = motionTarget(true)
    expect(prefersReducedMotion(target)).toBe(true)
    expect(preferredScrollBehavior(target)).toBe('auto')
  })

  it('uses smooth scrolling when reduced motion is not requested', () => {
    const target = motionTarget(false)
    expect(prefersReducedMotion(target)).toBe(false)
    expect(preferredScrollBehavior(target)).toBe('smooth')
  })

  it('passes the resolved behavior to element scrolling', () => {
    const scrollIntoView = vi.fn()
    const element = { scrollIntoView } as unknown as Element
    scrollElementIntoView(element, { block: 'start' }, motionTarget(true))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
  })

  it('passes the resolved behavior to window scrolling', () => {
    const scrollTo = vi.fn()
    const target = { ...motionTarget(true), scrollTo } as unknown as Pick<Window, 'matchMedia' | 'scrollTo'>
    scrollWindowToTop(target)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
