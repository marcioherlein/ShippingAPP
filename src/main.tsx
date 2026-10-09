import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations/es-ES'
import App from './App'
import ClerkShell from './auth/ClerkShell'
import { setSessionState } from './lib/authSession'
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
import './styles/ace-landing.css'

const root = document.getElementById('root')
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
if (clerkPublishableKey) setSessionState('loading')

if (!root) {
  throw new Error('Root element not found')
}

installJourneySemantics()

const application = clerkPublishableKey
  ? <ClerkProvider publishableKey={clerkPublishableKey} localization={esES}>
      <ClerkShell><App /></ClerkShell>
    </ClerkProvider>
  : <App />

createRoot(root).render(
  <React.StrictMode>
    {application}
  </React.StrictMode>,
)

installJourneyPersistence()
