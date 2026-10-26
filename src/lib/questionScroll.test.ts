// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollIntoViewIfNeeded } from './motionPreference'

afterEach(() => vi.restoreAllMocks())

function question(top: number, bottom: number) {
  const element = document.createElement('section')
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, bottom } as DOMRect)
  const scroll = vi.fn()
  element.scrollIntoView = scroll
  return { element, scroll }
}
const viewport = { innerHeight: 844, matchMedia: vi.fn(() => ({ matches: false })) as unknown as Window['matchMedia'] }

describe('question positioning without a pending tap-time animation', () => {
  it('reveals an offscreen question synchronously without scheduling a frame', () => {
    const request = vi.spyOn(window, 'requestAnimationFrame')
    const { element, scroll } = question(300, 1000)
    scrollIntoViewIfNeeded(element, viewport, 'instant')
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
    expect(request).not.toHaveBeenCalled()
  })

  it('does not move a question already entirely visible', () => {
    const { element, scroll } = question(120, 800)
    scrollIntoViewIfNeeded(element, viewport, 'instant')
    expect(scroll).not.toHaveBeenCalled()
  })

  it('allows cancelling a deferred navigation reveal', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { element, scroll } = question(300, 1000)
    const cleanup = scrollIntoViewIfNeeded(element, viewport)
    cleanup?.()
    expect(cancel).toHaveBeenCalledWith(42)
    expect(scroll).not.toHaveBeenCalled()
  })
})
