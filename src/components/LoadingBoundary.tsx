import React, { Component, Suspense, type ReactNode } from 'react'

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
    return <Suspense fallback={<p role="status">{this.props.label || 'Cargando este paso…'}</p>}>
      {this.props.children}
    </Suspense>
  }
}
