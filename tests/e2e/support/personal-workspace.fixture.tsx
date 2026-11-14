// Browser-only verification of production components with a simulated session.
// This is excluded from the production build and does not simulate a real Clerk login.
import '../../../src/styles.css'
import '../../../src/styles/regulatory.css'
import '../../../src/styles/entry-simplification.css'
import '../../../src/styles/visual-consistency.css'
import '../../../src/styles/progressive-product-confirmation.css'
import '../../../src/styles/design-system.css'
import '../../../src/styles/journey-refinement.css'
import '../../../src/styles/p2-semantic-polish.css'
import '../../../src/styles/accessibility.css'
import '../../../src/styles/ncm-clarification.css'
import '../../../src/styles/output-redesign.css'
import '../../../src/styles/result-dossier.css'
import '../../../src/styles/product-quality.css'
import '../../../src/styles/ds-select.css'
import '../../../src/styles/dark-mode.css'
import '../../../src/styles/live-flow.css'
import '../../../src/styles/app-header.css'
import '../../../src/styles/guided-case.css'
import '../../../src/styles/workspace.css'
import '../../../src/styles/personal-workspace.css'
import '../../../src/styles/quote-forms.css'
import '../../../src/styles/calculator-redesign.css'

import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import AppEntry from '../../../src/AppEntry'
import { AccountSessionContext, type AccountSession } from '../../../src/auth/AccountSession'
import { AccountControlsContext } from '../../../src/auth/AccountControls'
import { setApiTokenProvider } from '../../../src/lib/apiClient'
import { setSessionState } from '../../../src/lib/authSession'
import { installJourneySemantics } from '../../../src/lib/journeySemantics'
import { installJourneyPersistence } from '../../../src/lib/journeyPersistence'

const query = new URLSearchParams(location.search)
const initialStatus = query.has('signed-out') ? 'idle' : query.has('verifying') ? 'syncing' : query.has('error') ? 'error' : 'ready'
function Fixture() {
  const [account, setAccount] = useState({ signedIn: !query.has('signed-out'), loaded: true, status: initialStatus, userId: query.has('signed-out') ? null : 'test-account-a', name: 'Alex', error: '' } as AccountSession)
  useEffect(() => {
    const update = (event: Event) => setAccount(current => ({ ...current, ...(event as CustomEvent).detail }))
    window.addEventListener('workspace-test:session', update)
    return () => window.removeEventListener('workspace-test:session', update)
  }, [])
  useEffect(() => {
    setApiTokenProvider(account.signedIn ? async () => 'browser-fixture-session' : null)
    setSessionState(account.status === 'ready' ? 'ready' : account.signedIn ? 'verifying' : 'signed_out')
  }, [account.signedIn, account.status])
  const signIn = () => setAccount(current => ({ ...current, signedIn: true, status: 'ready', userId: 'test-account-a' }))
  return <AccountSessionContext value={{ ...account, signIn, retry: signIn }}><AccountControlsContext value={<button className="auth-secondary" onClick={() => { window.dispatchEvent(new Event('shippingapp:open-workspace')); if (!account.signedIn) signIn() }}>{account.signedIn ? 'Cuenta de prueba' : 'Ingresar'}</button>}><AppEntry /></AccountControlsContext></AccountSessionContext>
}
installJourneySemantics()
createRoot(document.getElementById('root')!).render(<Fixture />)
installJourneyPersistence()
