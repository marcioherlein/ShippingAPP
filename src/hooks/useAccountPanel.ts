import { useEffect, useRef } from 'react'

/** Account panels are non-modal: Tab may leave them, Escape/outside click dismisses. */
export function useAccountPanel(open: boolean, onClose: () => void, viewKey?: string) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const firstControl = panel.querySelector<HTMLButtonElement>('[data-account-panel-start]') ?? panel.querySelector<HTMLButtonElement>('button')
    firstControl?.focus()
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target) && !triggerRef.current?.contains(event.target)) closeRef.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !panel.contains(document.activeElement)) return
      event.preventDefault()
      closeRef.current()
    }
    document.addEventListener('pointerdown', dismiss)
    panel.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      panel.removeEventListener('keydown', escape)
      // A pointer dismissal must not steal focus from the newly clicked control.
      if (panel.contains(document.activeElement) || document.activeElement === document.body) triggerRef.current?.focus()
    }
  }, [open, viewKey])

  return { panelRef, triggerRef }
}
