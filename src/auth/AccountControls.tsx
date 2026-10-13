import React, { createContext, useContext, useState, type ReactNode } from 'react'

// Account UI is supplied by ClerkShell and rendered by the shared header.
// Public builds can use the same header without loading Clerk hooks.
export const AccountControlsContext = createContext<ReactNode>(null)

export default function AccountControls() {
  const controls = useContext(AccountControlsContext)
  return controls ?? <UnavailableAccountControls />
}

function UnavailableAccountControls() {
  const [requested, setRequested] = useState(false)
  return <div className="auth-account-control">
    <button type="button" className="auth-secondary" onClick={() => setRequested(true)}>Ingresar</button>
    {requested && <p role="alert">El acceso a cuentas no está disponible en este momento. Tu ficha queda guardada.</p>}
  </div>
}
