import React, { useEffect, useRef, useState } from 'react'
import { SignIn } from '@clerk/react'

export default function LoginDialog({ loaded, onClose }: { loaded: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [slow, setSlow] = useState(false)
  const [returnUrl] = useState(() => window.location.href)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    const element = form.current
    if (!element) return
    const inspect = () => { if (element.querySelector('input, button, form')) setReady(true) }
    const observer = new MutationObserver(inspect)
    observer.observe(element, { childList: true, subtree: true })
    inspect()
    const timer = window.setTimeout(() => setSlow(true), 15_000)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [])
  return <dialog ref={dialog} className="auth-login-dialog" aria-labelledby="auth-login-title" onCancel={onClose}>
    <div className="auth-login-head"><h2 id="auth-login-title">Ingresá para continuar</h2><button type="button" className="auth-secondary" onClick={onClose} aria-label="Cerrar ingreso">Cerrar</button></div>
    <p>Tu producto y tus respuestas quedan guardados mientras conectás la cuenta.</p>
    {!ready && <div role="status">
      <p>{slow ? 'No pude cargar el formulario de acceso. Recargá para reintentar; conservamos tus datos.' : 'Cargando el formulario de acceso…'}</p>
      {slow && <button type="button" className="auth-secondary" onClick={() => window.location.reload()}>Recargar acceso</button>}
    </div>}
    <div ref={form} className="auth-login-form">{loaded && <SignIn routing="hash" withSignUp fallbackRedirectUrl={returnUrl} signUpFallbackRedirectUrl={returnUrl} />}</div>
  </dialog>
}
