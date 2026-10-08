import type { MouseEventHandler } from 'react'
import AccountControls from '../auth/AccountControls'

type Props = { onNewCase?: MouseEventHandler<HTMLButtonElement>; hasProduct?: boolean }

export default function AppHeader({ onNewCase, hasProduct = false }: Props) {
  return <header className="app-header">
    <a className="app-wordmark" href="#home" aria-label="GlobalShipping, inicio">GlobalShipping</a>
    {onNewCase && <nav className="app-header-nav" aria-label="Navegación principal">
      <a href="#cotizador">Cotizador</a>
      {hasProduct && <a href="#case-confirmation">Producto</a>}
      <button type="button" onClick={onNewCase}>Nuevo caso</button>
    </nav>}
    <div className="app-header-account"><AccountControls /></div>
  </header>
}
