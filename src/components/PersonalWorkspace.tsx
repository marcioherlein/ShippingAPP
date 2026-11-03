import { lazy, useEffect, useRef, useState } from 'react'
import { useAccountSession } from '../auth/AccountSession'
import type { AnalysisHistoryItem } from '../lib/analysisHistory'
import AppHeader from './AppHeader'
import LoadingBoundary from './LoadingBoundary'
import UiIcon from './UiIcon'

const SavedCalculations = lazy(() => import('./SavedCalculations'))
const Watchlist = lazy(() => import('./Watchlist'))
const EmailPreferences = lazy(() => import('./EmailPreferences'))
const UsageBadge = lazy(() => import('./UsageBadge'))

type Props = {
  onNewCalculation: () => void
  onContinue: () => void
  onOpen: (item: AnalysisHistoryItem) => void
  hasDraft: boolean
}

export default function PersonalWorkspace({ onNewCalculation, onContinue, onOpen, hasDraft }: Props) {
  const account = useAccountSession()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])
  const ready = account.signedIn && account.status === 'ready'

  return <main className="personal-workspace" id="mi-panel">
    <a className="skip-to-quote" href="#workspace-content">Ir a mis cálculos</a>
    <AppHeader workspace onNewCase={onNewCalculation} />
    <div className="personal-workspace-content" id="workspace-content" tabIndex={-1}>
      <section className="personal-workspace-heading">
        <div><span className="eyebrow">TU ESPACIO DE IMPORTACIÓN</span>
          <h1 ref={title} tabIndex={-1}>{ready && account.name ? `Hola, ${account.name}.` : 'Tu panel de importaciones.'}</h1>
          <p>Retomá un cálculo, compará alternativas y planificá tu próxima compra.</p>
        </div>
        {ready && <span className="workspace-private-label"><UiIcon name="check" size={16} /> Espacio privado</span>}
      </section>

      {!account.loaded || account.signedIn && (account.status === 'syncing' || account.status === 'idle') ? <section className="workspace-account-state" role="status"><span className="eyebrow">CONECTANDO TU CUENTA</span><h2>Estamos preparando tu espacio.</h2><p>Tus cálculos aparecerán al verificar la sesión.</p></section>
        : account.signedIn && account.status === 'error' ? <section className="workspace-account-state" role="alert"><h2>No pudimos conectar tu cuenta.</h2><p>{account.error || 'Tu trabajo se conserva. Reintentá para acceder a tus cálculos guardados.'}</p><button className="workspace-button" onClick={account.retry}>Reintentar conectar cuenta</button></section>
          : !ready ? <section className="workspace-signin">
            <div className="workspace-signin-copy"><span className="workspace-signin-symbol"><UiIcon name="product" size={40} /></span><span className="eyebrow">DEL PRODUCTO A LA DECISIÓN</span><h2>Todo lo que calculás.<br />Un lugar para volver.</h2><p>Guardá tus presupuestos con fecha, revisá los costos y retomá cada producto desde donde lo dejaste.</p><ul><li><UiIcon name="check" />Historial privado de cálculos</li><li><UiIcon name="check" />Comparación de transporte y cantidades</li><li><UiIcon name="check" />Fuentes y datos pendientes a la vista</li></ul></div>
            <div className="workspace-signin-action"><span className="eyebrow">BIENVENIDO A GLOBALSHIPPING</span><h2>Ingresá a tu espacio.</h2><p>Conectá tu cuenta para ver tus cálculos anteriores y guardar los próximos.</p>{account.status === 'unavailable' ? <div role="alert"><p>El acceso a cuentas no está disponible en este momento. Podés continuar con tu cálculo y reintentar más tarde.</p><button className="workspace-button" onClick={account.retry}>Reintentar cargar acceso</button></div> : <button className="workspace-button" onClick={account.signIn}>Ingresar o crear cuenta <UiIcon name="arrow-right" /></button>}<button className="workspace-text-button" onClick={hasDraft ? onContinue : onNewCalculation}>{hasDraft ? 'Continuar mi cálculo actual' : 'Empezar un cálculo'} <UiIcon name="arrow-right" size={16} /></button><small>Para buscar, clasificar y guardar productos necesitás una cuenta.</small></div>
          </section> : null}

      {ready && <>
        <section className="workspace-new-calculation" aria-labelledby="new-calculation-title">
          <div className="workspace-new-copy"><span className="eyebrow">TU PRÓXIMA COMPRA</span><h2 id="new-calculation-title">¿Qué estás pensando traer?</h2><p>Partí de un enlace, describí tu producto o buscá un proveedor.</p><button type="button" className="workspace-button" onClick={onNewCalculation}>Calcular un nuevo producto <UiIcon name="arrow-right" /></button></div>
          <ol className="workspace-new-steps"><li><span>01</span><div><b>Tu producto</b><small>Enlace, descripción o búsqueda.</small></div></li><li><span>02</span><div><b>Tu operación</b><small>Cantidad, oferta y datos confirmados.</small></div></li><li><span>03</span><div><b>Tu decisión</b><small>Inversión, costo por unidad y alternativas.</small></div></li></ol>
        </section>
        {hasDraft && <aside className="workspace-draft"><div><span className="workspace-draft-dot" /><div><b>Tenés un cálculo en curso</b><p>Tu producto y tus respuestas siguen acá.</p></div></div><button type="button" className="workspace-text-button" onClick={onContinue}>Retomar cálculo <UiIcon name="arrow-right" size={16} /></button></aside>}
        <LoadingBoundary label="Cargando tus cálculos…"><SavedCalculations key={account.userId} onOpen={onOpen} onNewCalculation={onNewCalculation} /></LoadingBoundary>
        <section className="workspace-account-settings" aria-labelledby="workspace-settings-title"><div><span className="eyebrow">A TU MANERA</span><h2 id="workspace-settings-title">Tu cuenta y seguimiento</h2><p>Consultá tu uso y administrá los productos y avisos que te interesan.</p></div><button className="workspace-text-button" aria-expanded={settingsOpen} aria-controls="workspace-settings-content" onClick={() => setSettingsOpen(value => !value)}>{settingsOpen ? 'Cerrar preferencias' : 'Ver preferencias'} <UiIcon name="chevron-down" size={16} /></button>{settingsOpen && <div className="workspace-settings-content" id="workspace-settings-content"><LoadingBoundary label="Cargando preferencias…"><UsageBadge /><Watchlist /><EmailPreferences /></LoadingBoundary></div>}</section>
      </>}
      <footer className="personal-workspace-footer"><span>GlobalShipping <span aria-hidden="true">/</span> Importaciones con perspectiva.</span><nav aria-label="Páginas legales"><a href="/privacidad.html">Privacidad</a><a href="/terminos.html">Términos de uso</a></nav><p>Los costos son estimaciones para planificar. Validá clasificación, tarifas y requisitos antes de comprar.</p></footer>
    </div>
  </main>
}
