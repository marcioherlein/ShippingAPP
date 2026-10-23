// Browser-only harness: this file is never an entry in the production build.
import React from 'react'
import { createRoot } from 'react-dom/client'
import AnalysisHistory from '../../../src/components/AnalysisHistory'
import Watchlist from '../../../src/components/Watchlist'
import EmailPreferences from '../../../src/components/EmailPreferences'
import '../../../src/styles.css'
import '../../../src/styles/design-system.css'
import '../../../src/styles/accessibility.css'
import '../../../src/auth/auth.css'
import '../../../src/styles/app-header.css'

createRoot(document.getElementById('root')!).render(<>
  <header className="app-header">
    <a className="app-wordmark" href="#main">GlobalShipping</a>
    <div className="app-header-account">
      <div className="auth-account-control" role="group" aria-label="Cuenta">
        <details className="app-account-menu" open>
          <summary>Mi cuenta</summary>
          <div className="app-account-panel">
            <EmailPreferences />
            <Watchlist />
            <AnalysisHistory />
          </div>
        </details>
      </div>
    </div>
  </header>
  <main id="main" style={{ padding: 16 }}>
    <h1>Paneles de cuenta</h1>
    <button type="button" style={{ position: 'fixed', bottom: 16, left: 16, minHeight: 44 }}>Volver al cotizador</button>
  </main>
</>)
