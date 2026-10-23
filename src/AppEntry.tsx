import { lazy, useState } from 'react'
import LoadingBoundary from './components/LoadingBoundary'
import Landing from './components/Landing'

const QuoteApp = lazy(() => import('./App'))

function resume() {
  const deepLink = new URL(location.href).searchParams.has('journey')
  try {
    return localStorage.getItem('shippingapp:entered') === '1'
      || !!localStorage.getItem('shippingapp:journey:v1')
      || !!sessionStorage.getItem('shippingapp:product-draft:analysis')
      || deepLink
  } catch {
    return deepLink
  }
}

export default function AppEntry() {
  const [entered, setEntered] = useState(resume)
  const [focusOnEntry, setFocusOnEntry] = useState(false)
  if (!entered) return <Landing onStart={() => {
    try { localStorage.setItem('shippingapp:entered', '1') } catch {}
    setFocusOnEntry(true)
    setEntered(true)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }} />
  return <LoadingBoundary label="Cargando cotizador…"><QuoteApp focusOnEntry={focusOnEntry} /></LoadingBoundary>
}
