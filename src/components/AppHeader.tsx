import type { MouseEventHandler } from 'react'
import AccountControls from '../auth/AccountControls'

type Props = { onNewCase?: MouseEventHandler<HTMLButtonElement>; hasProduct?: boolean; onReviewProduct?: () => void; hasResult?: boolean; processing?: boolean }

export default function AppHeader({ onNewCase, hasProduct = false, onReviewProduct, hasResult = false, processing = false }: Props) {
  return <header className="app-header">
    <a className="app-wordmark" href="#home" aria-label="GlobalShipping, inicio">GlobalShipping</a>
    {onNewCase && <nav className="app-header-nav" aria-label="Navegación principal">
      <a href="#cotizador" aria-current={!hasProduct ? 'step' : undefined}>Cotizador</a>
      {hasProduct && onReviewProduct && <button type="button" onClick={onReviewProduct} disabled={processing} aria-current={!hasResult ? 'step' : undefined}>Revisar producto</button>}
      {hasResult && <a href="#calculator" aria-current="step">Resultado</a>}
      <button type="button" className="app-new-case" onClick={onNewCase}>Nuevo caso</button>
    </nav>}
    <div className="app-header-account"><AccountControls /></div>
  </header>
}
