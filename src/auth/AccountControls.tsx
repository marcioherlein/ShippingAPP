import { createContext, useContext, type ReactNode } from 'react'

// Account UI is supplied by ClerkShell and rendered by the shared header.
// Public builds can use the same header without loading Clerk hooks.
export const AccountControlsContext = createContext<ReactNode>(null)

export default function AccountControls() {
  return useContext(AccountControlsContext)
}
