import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './AppEntry'
import { setSessionState } from './lib/authSession'
import { readPublicAuthKey } from './lib/publicAuthConfig'
import { installJourneySemantics } from './lib/journeySemantics'
import { installJourneyPersistence } from './lib/journeyPersistence'
import './styles.css'
import './styles/regulatory.css'
import './styles/entry-simplification.css'
import './styles/visual-consistency.css'
import './styles/progressive-product-confirmation.css'
import './styles/design-system.css'
import './styles/journey-refinement.css'
import './styles/p2-semantic-polish.css'
import './styles/accessibility.css'
import './styles/ncm-clarification.css'
import './styles/output-redesign.css'
import './styles/result-dossier.css'
import './styles/product-quality.css'
import './styles/ds-select.css'
import './styles/dark-mode.css'
import './styles/live-flow.css'
import './styles/app-header.css'
import './styles/guided-case.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

installJourneySemantics()

const reactRoot = createRoot(root)
reactRoot.render(<p role="status">Cargando aplicación…</p>)
void readPublicAuthKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY).then(async clerkPublishableKey => {
if (clerkPublishableKey) setSessionState('loading')
const AuthenticatedApp = clerkPublishableKey ? (await import('./auth/AuthenticatedApp')).default : null
const application = AuthenticatedApp && clerkPublishableKey ? <AuthenticatedApp publishableKey={clerkPublishableKey}><App /></AuthenticatedApp> : <App />

reactRoot.render(
  <React.StrictMode>
    {application}
  </React.StrictMode>,
)

installJourneyPersistence()
}).catch(() => reactRoot.render(<section role="alert"><p>No pudimos iniciar el acceso a la aplicación.</p><button type="button" onClick={() => window.location.reload()}>Reintentar cargar</button></section>))

import "./styles/workspace.css"
