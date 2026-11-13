import { lazy, useEffect, useRef, useState } from 'react'
import LoadingBoundary from './components/LoadingBoundary'
import ProcessingScreen from './components/ProcessingScreen'
import Landing from './components/Landing'
import type { PreparedProduct } from './components/ProductEntry'
import { useAccountSession } from './auth/AccountSession'
import type { AnalysisHistoryItem } from './lib/analysisHistory'
import { scrollWindowToTop } from './lib/motionPreference'
import { clearProductDraft, readProductDraft, writeProductDraft } from './lib/productDraft'
import { clearPendingConfirm } from './lib/sessionDraft'
import { canResume, readOperation } from './lib/pendingOperation'

const QuoteApp = lazy(() => import('./App'))
const PersonalWorkspace = lazy(() => import('./components/PersonalWorkspace'))

type View = 'landing' | 'workspace' | 'calculator'

function resume() {
  const deepLink = new URL(location.href).searchParams.has('journey')
  try {
    return localStorage.getItem('shippingapp:entered') === '1'
      || !!localStorage.getItem('shippingapp:journey:v1')
      || !!sessionStorage.getItem('shippingapp:product-draft:analysis')
      || !!readProductDraft<PreparedProduct>('prepared-entry')
      || deepLink
  } catch {
    return deepLink
  }
}

export default function AppEntry() {
  const account = useAccountSession()
  const [view, setView] = useState<View>(() => location.hash === '#mi-panel' ? 'workspace' : resume() || location.hash === '#cotizador' ? 'calculator' : 'landing')
  // One quote tree stays mounted when visiting the panel, preserving unsaved work.
  const [quoteMounted, setQuoteMounted] = useState(() => resume() || location.hash === '#cotizador')
  const [focusOnEntry, setFocusOnEntry] = useState(false)
  const [preparedProduct, setPreparedProduct] = useState<PreparedProduct | null>(() => readProductDraft<PreparedProduct>('prepared-entry'))
  const [newCalculationRequest, setNewCalculationRequest] = useState(0)
  const [savedQuote, setSavedQuote] = useState<AnalysisHistoryItem | null>(null)
  const [quoteToOpen, setQuoteToOpen] = useState<AnalysisHistoryItem | null>(null)
  const replaceDialog = useRef<HTMLDialogElement>(null)
  const [quoteOwnerId, setQuoteOwnerId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('shippingapp:quote-owner') } catch { return null }
  })
  const [quoteGeneration, setQuoteGeneration] = useState(0)
  const [hasDraft, setHasDraft] = useState(() => {
    if (preparedProduct) return true
    try { return !!localStorage.getItem('shippingapp:journey:v1') || !!sessionStorage.getItem('shippingapp:product-draft:analysis') } catch { return false }
  })
  const explicitView = useRef(location.hash === '#cotizador' || location.hash === '#mi-panel')
  const checkedAccount = useRef(false)

  const navigate = (next: View) => {
    explicitView.current = true
    setView(next)
    if (next === 'calculator') setQuoteMounted(true)
    const url = new URL(location.href)
    url.hash = next === 'workspace' ? 'mi-panel' : next === 'calculator' ? 'cotizador' : 'home'
    if (url.href !== location.href) history.pushState({ ...history.state, workspaceView: next }, '', url)
    scrollWindowToTop()
  }

  useEffect(() => {
    history.replaceState({ ...history.state, workspaceView: view }, '', location.href)
    const openWorkspace = () => navigate('workspace')
    const onHistory = () => {
      if (location.hash === '#mi-panel') setView('workspace')
      else if (location.hash === '#cotizador') { setQuoteMounted(true); setView('calculator') }
      else if (location.hash === '#home' || !location.hash) {
        const restored = history.state?.workspaceView as View | undefined
        if (restored) { setView(restored); if (restored === 'calculator') setQuoteMounted(true) }
      }
    }
    window.addEventListener('shippingapp:open-workspace', openWorkspace)
    window.addEventListener('popstate', onHistory)
    return () => { window.removeEventListener('shippingapp:open-workspace', openWorkspace); window.removeEventListener('popstate', onHistory) }
  }, [])

  useEffect(() => {
    if (!account.loaded) return
    if (quoteOwnerId && (!account.signedIn || account.userId !== quoteOwnerId)) {
      // Never restore another account's saved result from this tab's recovery data.
      clearProductDraft()
      clearPendingConfirm()
      try { sessionStorage.removeItem('shippingapp:quote-owner') } catch {}
      setSavedQuote(null)
      setPreparedProduct(null)
      setQuoteToOpen(null)
      setQuoteMounted(false)
      setQuoteGeneration(value => value + 1)
      setQuoteOwnerId(null)
      setHasDraft(false)
      window.dispatchEvent(new Event('shippingapp:journey-reset'))
      navigate('workspace')
    } else if (!quoteOwnerId && quoteMounted && account.signedIn && account.userId) {
      setQuoteOwnerId(account.userId)
      try { sessionStorage.setItem('shippingapp:quote-owner', account.userId) } catch {}
    }
  }, [account.loaded, account.signedIn, account.userId, quoteOwnerId, quoteMounted])

  useEffect(() => {
    if (checkedAccount.current || !account.loaded || !account.signedIn) return
    checkedAccount.current = true
    const productLookupPending = canResume(readOperation('owned-link')) || canResume(readOperation('search'))
    if (!explicitView.current && !hasDraft && !productLookupPending) navigate('workspace')
  }, [account.loaded, account.signedIn, hasDraft])

  useEffect(() => {
    const draftChanged = () => {
      try { setHasDraft(!!localStorage.getItem('shippingapp:journey:v1') || !!sessionStorage.getItem('shippingapp:product-draft:analysis')) } catch { /* storage can be unavailable */ }
    }
    window.addEventListener('shippingapp:journey-restored', draftChanged)
    window.addEventListener('shippingapp:journey-reset', draftChanged)
    // The panel reads storage after React and the existing persistence observer settle.
    const timer = window.setTimeout(draftChanged, 100)
    return () => { window.clearTimeout(timer); window.removeEventListener('shippingapp:journey-restored', draftChanged); window.removeEventListener('shippingapp:journey-reset', draftChanged) }
  }, [view])

  useEffect(() => { if (quoteToOpen) replaceDialog.current?.showModal() }, [quoteToOpen])

  const enterCalculator = () => {
    try { localStorage.setItem('shippingapp:entered', '1') } catch {}
    setFocusOnEntry(true)
    navigate('calculator')
  }
  const startWithProduct = (product: PreparedProduct) => {
    writeProductDraft('prepared-entry', product)
    setPreparedProduct(product)
    enterCalculator()
  }
  const newCalculation = () => {
    setSavedQuote(null)
    setNewCalculationRequest(value => value + 1)
    enterCalculator()
  }
  const openQuote = (item: AnalysisHistoryItem) => {
    setQuoteToOpen(null)
    setSavedQuote(item)
    enterCalculator()
  }
  const quoteVisibleToAccount = !quoteOwnerId || account.loaded && account.signedIn && account.userId === quoteOwnerId

  return <>
    <ProcessingScreen />
    {view === 'landing' && <Landing onStart={enterCalculator} onProduct={quoteMounted ? undefined : startWithProduct} />}
    {view === 'workspace' && <LoadingBoundary label="Cargando tu espacio…"><PersonalWorkspace key={account.userId ?? 'visitor'} hasDraft={hasDraft} onContinue={enterCalculator} onNewCalculation={newCalculation} onOpen={item => { if (hasDraft) setQuoteToOpen(item); else openQuote(item) }} /></LoadingBoundary>}
    {quoteMounted && quoteVisibleToAccount && <div hidden={view !== 'calculator'} className="quote-view"><LoadingBoundary label="Cargando cotizador…"><QuoteApp key={quoteGeneration} active={view === 'calculator'} focusOnEntry={focusOnEntry} initialSavedQuote={savedQuote} initialPreparedProduct={preparedProduct} newCalculationRequest={newCalculationRequest} /></LoadingBoundary></div>}
    {view === 'calculator' && quoteMounted && !quoteVisibleToAccount && <p className="workspace-account-state" role="status">Verificando la cuenta para recuperar tu cálculo…</p>}
    {quoteToOpen && quoteVisibleToAccount && account.signedIn && <dialog ref={replaceDialog} className="workspace-replace-dialog" aria-labelledby="replace-quote-title" onCancel={() => setQuoteToOpen(null)}><span className="eyebrow">CAMBIAR DE CÁLCULO</span><h2 id="replace-quote-title">¿Abrir el presupuesto guardado?</h2><p>Reemplazará el cálculo en curso. Los presupuestos que ya guardaste seguirán en tu cuenta.</p><div><button className="workspace-text-button" onClick={() => setQuoteToOpen(null)}>Conservar mi cálculo actual</button><button className="workspace-button" onClick={() => openQuote(quoteToOpen)}>Abrir presupuesto guardado</button></div></dialog>}
  </>
}
