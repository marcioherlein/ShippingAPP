import React, { useEffect } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth, useClerk } from '@clerk/react'
import { setApiTokenProvider } from '../lib/apiClient'
import './auth.css'

export default function ClerkShell({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setApiTokenProvider(null)
      return
    }
    setApiTokenProvider(() => getToken())
    return () => setApiTokenProvider(null)
  }, [getToken, isLoaded, isSignedIn])

  useEffect(() => {
    const requestSignIn = () => clerk.openSignIn({})
    window.addEventListener('shippingapp:auth-required', requestSignIn)
    return () => window.removeEventListener('shippingapp:auth-required', requestSignIn)
  }, [clerk])

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
        <span className="auth-saved-label">Tus análisis quedan guardados</span>
        <UserButton />
      </Show>
    </div>
    {children}
  </>
}
