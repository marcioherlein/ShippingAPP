import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations/es-ES'
import ClerkShell from './ClerkShell'
export default function AuthenticatedApp({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
 return <ClerkProvider publishableKey={publishableKey} localization={esES}><ClerkShell>{children}</ClerkShell></ClerkProvider>
}
