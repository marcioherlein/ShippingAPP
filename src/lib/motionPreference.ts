type MotionWindow = Pick<Window, 'matchMedia' | 'scrollTo'>

export function prefersReducedMotion(target: Pick<Window, 'matchMedia'> = window) {
  return target.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function preferredScrollBehavior(target: Pick<Window, 'matchMedia'> = window): ScrollBehavior {
  return prefersReducedMotion(target) ? 'auto' : 'smooth'
}

export function scrollElementIntoView(
  element: Element | null | undefined,
  options: Omit<ScrollIntoViewOptions, 'behavior'> = { block: 'start' },
  target: Pick<Window, 'matchMedia'> = window,
) {
  element?.scrollIntoView({ ...options, behavior: preferredScrollBehavior(target) })
}

export function scrollWindowToTop(target: MotionWindow = window) {
  target.scrollTo({ top: 0, behavior: preferredScrollBehavior(target) })
}

/**
 * Reveal a freshly shown card without yanking the page. Runs one rAF so the
 * element is laid out first, and skips scrolling entirely when the element is
 * already comfortably inside the viewport (accounting for the sticky top bar) —
 * so advancing a step that's already visible produces no "salto".
 */
export function scrollIntoViewIfNeeded(
  element: Element | null | undefined,
  target: Pick<Window, 'matchMedia'> & { innerHeight: number } = window,
) {
  if (!element) return
  window.requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect()
    const stickyOffset = 92
    const fullyVisible = rect.top >= stickyOffset && rect.bottom <= target.innerHeight
    if (fullyVisible) return
    element.scrollIntoView({ block: 'start', behavior: preferredScrollBehavior(target) })
  })
}
