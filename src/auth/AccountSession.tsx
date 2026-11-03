import { createContext, useContext } from 'react'

export type AccountSession = {
  signedIn: boolean
  loaded: boolean
  status: 'unavailable' | 'idle' | 'syncing' | 'ready' | 'error'
  userId: string | null
  name: string | null
  error: string
  signIn: () => void
  retry: () => void
}

export const AccountSessionContext = createContext<AccountSession>({
  signedIn: false, loaded: true, status: 'unavailable', userId: null, name: null, error: '',
  signIn: () => window.dispatchEvent(new Event('shippingapp:auth-required')),
  retry: () => window.location.reload(),
})

export const useAccountSession = () => useContext(AccountSessionContext)

export function openPersonalWorkspace() {
  window.dispatchEvent(new Event('shippingapp:open-workspace'))
}
