const ENHANCED_ATTRIBUTE = 'data-journey-radio-enhanced'

function setAttributeIfChanged(element: Element, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value)
}

function getGroupLabel(group: HTMLElement) {
  if (group.classList.contains('budget')) return 'Presupuesto o rango'

  const parent = group.parentElement
  const label = parent?.querySelector(':scope > label')?.textContent?.trim()
  return label || 'Opciones'
}

function enhanceRadioGroup(group: HTMLElement) {
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>(':scope > button'))
  if (buttons.length === 0) return

  setAttributeIfChanged(group, 'role', 'radiogroup')
  setAttributeIfChanged(group, 'aria-label', getGroupLabel(group))

  const selectedIndex = buttons.findIndex((button) => button.classList.contains('selected'))
  buttons.forEach((button, index) => {
    const selected = button.classList.contains('selected')
    setAttributeIfChanged(button, 'role', 'radio')
    setAttributeIfChanged(button, 'aria-checked', selected ? 'true' : 'false')
    button.tabIndex = selectedIndex >= 0 ? (selected ? 0 : -1) : (index === 0 ? 0 : -1)

    if (button.hasAttribute(ENHANCED_ATTRIBUTE)) return
    button.setAttribute(ENHANCED_ATTRIBUTE, 'true')
    button.addEventListener('keydown', (event) => {
      const currentButtons = Array.from(group.querySelectorAll<HTMLButtonElement>(':scope > button'))
      const currentIndex = currentButtons.indexOf(button)
      if (currentIndex < 0) return

      let nextIndex: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % currentButtons.length
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + currentButtons.length) % currentButtons.length
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = currentButtons.length - 1
      if (nextIndex === null) return

      event.preventDefault()
      const target = currentButtons[nextIndex]
      target.focus()
      target.click()
    })
  })
}

function enhanceDisabledAction(button: HTMLButtonElement) {
  const isOperationAction = button.textContent?.includes('Seguir con presupuesto')
  const reason = isOperationAction
    ? 'Completá las cuatro respuestas de esta sección para continuar.'
    : 'Elegí una modalidad válida o corregí el presupuesto o rango para continuar.'

  if (button.disabled) {
    setAttributeIfChanged(button, 'data-disabled-reason', reason)
    setAttributeIfChanged(button, 'aria-label', `${button.textContent?.trim() || 'Continuar'}. ${reason}`)
  } else {
    button.removeAttribute('data-disabled-reason')
    button.removeAttribute('aria-label')
  }
}

function applyJourneySemantics() {
  document.querySelectorAll<HTMLElement>('.journey-question-card.active .journey-chip-row, .journey-question-card.active .journey-choice-grid.budget')
    .forEach(enhanceRadioGroup)

  document.querySelectorAll<HTMLButtonElement>('.journey-question-card.active .journey-primary-action')
    .forEach(enhanceDisabledAction)
}

export function installJourneySemantics() {
  if (typeof document === 'undefined') return () => undefined

  let scheduled = false
  const scheduleApply = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      applyJourneySemantics()
    })
  }

  const observer = new MutationObserver(scheduleApply)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'disabled'],
  })
  scheduleApply()

  return () => observer.disconnect()
}
