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
