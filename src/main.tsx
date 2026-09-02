import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations/es-ES'
import App from './App'
import ClerkShell from './auth/ClerkShell'
import './styles.css'
import './styles/regulatory.css'
import './styles/entry-simplification.css'
import './styles/visual-consistency.css'
import './styles/progressive-product-confirmation.css'
import './styles/design-system.css'
import './styles/accessibility.css'

const root = document.getElementById('root')
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()

if (!root) {
  throw new Error('Root element not found')
}

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
