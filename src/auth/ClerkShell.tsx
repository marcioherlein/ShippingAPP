import React, { useEffect, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth, useClerk } from '@clerk/react'
import { apiFetch, setApiTokenProvider } from '../lib/apiClient'
import './auth.css'

type AccountSyncState = 'idle' | 'syncing' | 'ready' | 'error'

export default function ClerkShell({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const [accountSync, setAccountSync] = useState<AccountSyncState>('idle')

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setApiTokenProvider(null)
      setAccountSync('idle')
      return
    }

    let active = true
    setApiTokenProvider(() => getToken())
    setAccountSync('syncing')

    // Shadow-auth calls /api/me immediately after sign-in. A 200 response proves
    // the live Clerk session was verified by the Worker and mapped to the D1 user.
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
    const requestSignIn = () => clerk.openSignIn({})
    window.addEventListener('shippingapp:auth-required', requestSignIn)
    return () => window.removeEventListener('shippingapp:auth-required', requestSignIn)
  }, [clerk])

  const accountLabel = accountSync === 'ready'
    ? 'Cuenta conectada · tus análisis quedan guardados'
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
        <span className="auth-saved-label" data-account-sync={accountSync}>{accountLabel}</span>
        <UserButton />
      </Show>
    </div>
    {children}
  </>
}
