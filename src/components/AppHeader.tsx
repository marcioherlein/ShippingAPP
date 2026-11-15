import type { MouseEventHandler } from 'react'
import AccountControls from '../auth/AccountControls'
import { openPersonalWorkspace } from '../auth/AccountSession'
import UiIcon from './UiIcon'

type Props = { onNewCase?: MouseEventHandler<HTMLButtonElement>; hasProduct?: boolean; onReviewProduct?: () => void; hasResult?: boolean; processing?: boolean; workspace?: boolean }

export default function AppHeader({ onNewCase, hasProduct = false, onReviewProduct, hasResult = false, processing = false, workspace = false }: Props) {
  return <header className="app-header">
    <a className="app-wordmark" href="#mi-panel" onClick={event => { event.preventDefault(); openPersonalWorkspace() }} aria-label="GlobalShipping, inicio"><span className="workspace-brand-symbol"><UiIcon name="brand" size={21} /></span>GlobalShipping<span className="workspace-brand-dot">.</span></a>
    {onNewCase && <nav className="app-header-nav" aria-label="Navegación principal">
      <a href="#mi-panel" aria-current={workspace ? 'page' : undefined} onClick={event => { event.preventDefault(); openPersonalWorkspace() }}>Mis cálculos</a>
      {!workspace && <a href="#cotizador" aria-current={!hasProduct ? 'step' : undefined}>Cotizador</a>}
      {hasProduct && onReviewProduct && <button type="button" onClick={onReviewProduct} disabled={processing} aria-current={!hasResult ? 'step' : undefined}>Revisar producto</button>}
      {hasResult && <a href="#calculator" aria-current="step">Resultado</a>}
      <button type="button" className="app-new-case" onClick={onNewCase}><span aria-hidden="true">＋</span> {workspace ? 'Nuevo cálculo' : 'Nuevo caso'}</button>
    </nav>}
    <div className="app-header-account"><AccountControls destination="workspace" /></div>
  </header>
}
