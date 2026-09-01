import React, { useEffect, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth, useClerk } from '@clerk/react'
import { apiFetch, setApiTokenProvider } from '../lib/apiClient'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import AnalysisHistory from '../components/AnalysisHistory'
import Watchlist from '../components/Watchlist'
import UsageBadge from '../components/UsageBadge'
import EmailPreferences from '../components/EmailPreferences'
import './auth.css'

type AccountSyncState = 'idle' | 'syncing' | 'ready' | 'error'
type HistorySaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function ClerkShell({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const [accountSync, setAccountSync] = useState<AccountSyncState>('idle')
  const [historySave, setHistorySave] = useState<HistorySaveState>('idle')

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setApiTokenProvider(null)
      setAccountSync('idle')
      setHistorySave('idle')
      return
    }

    let active = true
    setApiTokenProvider(() => getToken())
    setAccountSync('syncing')

    void apiFetch('/api/me')
      .then((response) => {
        if (active) setAccountSync(response.ok ? 'ready' : 'error')
      })
      .catch(() => {
        if (active) setAccountSync('error')
      })

    return () => {
      active = false
      setApiTokenProvider(null)
    }
  }, [getToken, isLoaded, isSignedIn])

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
    const requestSignIn = () => clerk.openSignIn({})
    window.addEventListener('shippingapp:auth-required', requestSignIn)
    return () => window.removeEventListener('shippingapp:auth-required', requestSignIn)
  }, [clerk])

  const accountLabel = accountSync === 'ready'
    ? historySave === 'saving'
      ? 'Cuenta conectada · guardando análisis…'
      : historySave === 'saved'
        ? 'Cuenta conectada · análisis guardado'
        : historySave === 'error'
          ? 'Cuenta conectada · el último análisis no se guardó'
          : 'Cuenta conectada · tus análisis quedan guardados'
    : accountSync === 'error'
      ? 'No pudimos sincronizar la cuenta'
      : 'Conectando cuenta…'

  return <>
    <div className="auth-account-control" aria-label="Cuenta">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className="auth-secondary">Ingresar</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="auth-primary">Crear cuenta</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <span className="auth-saved-label" data-account-sync={accountSync} data-history-save={historySave}>{accountLabel}</span>
        {accountSync === 'ready' && <UsageBadge />}
        {accountSync === 'ready' && <EmailPreferences />}
        <Watchlist />
        <AnalysisHistory />
        <UserButton />
      </Show>
    </div>
    {children}
  </>
}
