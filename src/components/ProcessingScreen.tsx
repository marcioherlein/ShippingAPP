import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getProcessingState, subscribeProcessing } from '../lib/processingScreen'
import UiIcon from './UiIcon'
import '../styles/processing-screen.css'

/** A native modal makes every other control inert, including keyboard navigation. */
export default function ProcessingScreen() {
  const operation = useSyncExternalStore(subscribeProcessing, getProcessingState, () => null)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [takingLonger, setTakingLonger] = useState(false)
  const active = !!operation
  useLayoutEffect(() => {
    if (!active) return
    const element = dialog.current
    if (!element) return
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    element.showModal()
    heading.current?.focus({ preventScroll: true })
    return () => {
      element.close()
      document.documentElement.style.overflow = previousOverflow
    }
  }, [active])

  useEffect(() => {
    setTakingLonger(false)
    if (!operation) return
    const timer = window.setTimeout(() => setTakingLonger(true), Math.max(0, operation.startedAt + 10_000 - Date.now()))
    return () => window.clearTimeout(timer)
  }, [operation?.id])

  if (!operation) return null
  const steps = operation.steps ?? []
  const activeStep = Math.max(0, Math.min(operation.activeStep ?? 0, steps.length - 1))
  return createPortal(<dialog ref={dialog} className="processing-screen" aria-labelledby="processing-title" aria-describedby="processing-detail" aria-busy="true" onCancel={event => event.preventDefault()}>
    <div className="processing-screen-brand">GlobalShipping</div>
    <div className="processing-screen-content">
      <div className="processing-screen-orbit" aria-hidden="true"><UiIcon name="product" size={28} /></div>
      <p className="processing-screen-eyebrow">TU IMPORTACIÓN, PASO A PASO</p>
      <h1 id="processing-title" ref={heading} tabIndex={-1}>{operation.title}</h1>
      <p id="processing-detail">{operation.detail}</p>
      <div className="processing-screen-track" role="progressbar" aria-label={operation.title}><span /></div>
      {steps.length > 0 && <ol className="processing-screen-steps" aria-label="Etapas del proceso">
        {steps.map((step, index) => <li key={step} data-state={index < activeStep ? 'complete' : index === activeStep ? 'active' : 'pending'} aria-current={index === activeStep ? 'step' : undefined}>
          <span aria-hidden="true">{index < activeStep ? <UiIcon name="check" size={14} /> : index + 1}</span>{step}
        </li>)}
      </ol>}
      <p className="processing-screen-status" role="status" aria-live="polite">{takingLonger ? 'Seguimos consultando las fuentes. Tus datos están guardados; si no responden, te mostraremos cómo continuar.' : 'Estamos trabajando en tu solicitud. Podrás continuar al terminar.'}</p>
    </div>
  </dialog>, document.body)
}
