import React, { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useProcessingScreen } from '../lib/useProcessingScreen'

function LoadingStep({ label }: { label: string }) {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 20_000)
    return () => window.clearTimeout(timer)
  }, [])
  useProcessingScreen(!timedOut, { title: label, detail: 'Estamos preparando el próximo paso.', priority: -20 })
  if (timedOut) return <section role="alert"><p>No pudimos cargar este paso a tiempo. Tu ficha permanece guardada.</p><button type="button" onClick={() => window.location.reload()}>Reintentar cargar</button></section>
  return <p role="status">{label}</p>
}

export default class LoadingBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <section role="alert">
      <p>No pudimos cargar este paso. Tu ficha permanece guardada.</p>
      <button type="button" onClick={() => window.location.reload()}>Reintentar cargar</button>
    </section>
    return <Suspense fallback={<LoadingStep label={this.props.label || 'Cargando este paso…'} />}>
      {this.props.children}
    </Suspense>
  }
}
