import React, { useEffect, useState } from 'react'
import { UserButton, useAuth } from '@clerk/react'
import LoginDialog from './LoginDialog'
import { apiFetch, setApiTokenProvider } from '../lib/apiClient'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import AnalysisHistory from '../components/AnalysisHistory'
import Watchlist from '../components/Watchlist'
import UsageBadge from '../components/UsageBadge'
import EmailPreferences from '../components/EmailPreferences'
import './auth.css'
import { AccountControlsContext } from './AccountControls'
import { authenticationError, getSessionState, setSessionState, subscribeSession } from '../lib/authSession'

type AccountSyncState = 'idle' | 'syncing' | 'ready' | 'error'
type HistorySaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function ClerkShell({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [accountSync, setAccountSync] = useState<AccountSyncState>('idle')
  const [historySave, setHistorySave] = useState<HistorySaveState>('idle')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [syncError, setSyncError] = useState('')
  useEffect(() => subscribeSession(() => {
    if (getSessionState() === 'error') setAccountSync('error')
  }), [])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setApiTokenProvider(null)
      setSessionState(isLoaded ? 'signed_out' : 'loading')
      setAccountSync('idle')
      setHistorySave('idle')
      return
    }

    let active = true
    const controller = new AbortController()
    setApiTokenProvider((fresh) => getToken({ skipCache: !!fresh }))
    setSessionState('verifying')
    setAccountSync('syncing')
    setSyncError('')

    void apiFetch('/api/me', { signal: controller.signal })
      .then(async (response) => {
        const identity = await response.json() as { authenticated?: boolean; accountId?: string }
        if (!active) return
        if (!response.ok || identity.authenticated !== true || !identity.accountId) throw authenticationError('auth_identity_unavailable', true)
        setAccountSync('ready')
        setSessionState('ready')
      })
      .catch((error) => {
        if (!active) return
        setAccountSync('error')
        setSyncError(error instanceof Error ? error.message : 'No pudimos conectar tu cuenta.')
        setSessionState('error')
      })

    return () => {
      active = false
      controller.abort()
      setApiTokenProvider(null)
    }
  }, [getToken, isLoaded, isSignedIn, syncAttempt])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    let active = true
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{ input?: unknown; result?: unknown }>).detail
      if (!detail || detail.input === undefined || detail.result === undefined) return
      setHistorySave('saving')
      void saveCompletedAnalysis(detail.input, detail.result)
        .then(() => {
          if (!active) return
          setHistorySave('saved')
          window.dispatchEvent(new CustomEvent('shippingapp:history-updated'))
          window.setTimeout(() => {
            if (active) setHistorySave('idle')
          }, 1800)
        })
        .catch(() => {
          if (active) setHistorySave('error')
        })
    }

    window.addEventListener('shippingapp:analysis-completed', completed)
    return () => {
      active = false
      window.removeEventListener('shippingapp:analysis-completed', completed)
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    const requestSignIn = () => { if (!isSignedIn) setLoginOpen(true) }
    window.addEventListener('shippingapp:auth-required', requestSignIn)
    return () => window.removeEventListener('shippingapp:auth-required', requestSignIn)
  }, [isSignedIn])
  useEffect(() => { if (isSignedIn) setLoginOpen(false) }, [isSignedIn])

  const accountLabel = accountSync === 'ready'
    ? historySave === 'saving'
      ? 'Cuenta conectada · guardando análisis…'
      : historySave === 'saved'
        ? 'Cuenta conectada · análisis guardado'
        : historySave === 'error'
          ? 'Cuenta conectada · el último análisis no se guardó'
          : 'Cuenta conectada · podés guardar tus presupuestos'
    : accountSync === 'error'
      ? syncError || 'No pudimos sincronizar la cuenta'
      : 'Conectando cuenta…'

  const controls = <div className="auth-account-control" role="group" aria-label="Cuenta">
      {!isSignedIn ? <>
        <button type="button" className="auth-secondary" onClick={() => setLoginOpen(true)}>Ingresar</button>
        <button type="button" className="auth-primary" onClick={() => setLoginOpen(true)}>Crear cuenta</button>
      </> : <>
        {accountSync === 'error' && <button type="button" className="auth-secondary" onClick={() => setSyncAttempt(attempt => attempt + 1)}>Reintentar conectar cuenta</button>}
        <details className="app-account-menu">
          <summary>Mi cuenta</summary>
          <div className="app-account-panel">
        <span className="auth-saved-label" data-account-sync={accountSync} data-history-save={historySave}>{accountLabel}</span>
        {accountSync === 'ready' && <UsageBadge />}
        {accountSync === 'ready' && <EmailPreferences />}
        {accountSync === 'ready' && <Watchlist />}
        {accountSync === 'ready' && <AnalysisHistory />}
        <UserButton />
          </div>
        </details>
      </>}
    </div>

  return <AccountControlsContext value={controls}>{children}{loginOpen && <LoginDialog loaded={!!isLoaded} onClose={() => setLoginOpen(false)} />}</AccountControlsContext>
}
