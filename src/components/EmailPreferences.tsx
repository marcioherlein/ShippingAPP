import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadEmailPreferences, saveEmailPreferences, type EmailPreferences as EmailPreferencesState } from '../lib/emailPreferences'
import './EmailPreferences.css'

type LoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'error'

function localTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

export default function EmailPreferences() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const timezoneErrorId = useId()
  const [timezoneError, setTimezoneError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [state, setState] = useState<LoadState>('idle')
  const [preferences, setPreferences] = useState<EmailPreferencesState | null>(null)
  const browserTimezone = useMemo(localTimezone, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previous = document.activeElement
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || preferences) return
    let active = true
    setState('loading')
    void loadEmailPreferences()
      .then((value) => {
        if (!active) return
        setPreferences(value)
        setState('ready')
      })
      .catch(() => {
        if (active) setState('error')
      })
    return () => { active = false }
  }, [open, preferences, loadAttempt])

  const save = async () => {
    if (!preferences || state === 'saving') return
    try {
      if (!preferences.timezone.trim()) throw new Error('empty')
      new Intl.DateTimeFormat('es-AR', { timeZone: preferences.timezone.trim() }).format()
    } catch {
      setTimezoneError('Ingresá una zona válida, por ejemplo America/Argentina/Buenos_Aires, o usá la de tu dispositivo.')
      dialogRef.current?.querySelector<HTMLInputElement>('[aria-label="Zona horaria"]')?.focus()
      return
    }
    setTimezoneError('')
    setState('saving')
    try {
      const saved = await saveEmailPreferences({
        digestEnabled: preferences.digestEnabled,
        alertsEnabled: preferences.alertsEnabled,
        marketingEnabled: preferences.marketingEnabled,
        timezone: preferences.timezone.trim(),
      })
      setPreferences(saved)
      setState('saved')
      window.setTimeout(() => setState((current) => current === 'saved' ? 'ready' : current), 1400)
    } catch {
      setState('error')
    }
  }

  const update = (patch: Partial<EmailPreferencesState>) => {
    if (state === 'saving') return
    if ('timezone' in patch) setTimezoneError('')
    setPreferences((current) => current ? { ...current, ...patch } : current)
    if (state === 'saved' || state === 'error') setState('ready')
  }

  return <>
    <button type="button" className="auth-secondary email-pref-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      Emails
    </button>
    {open && <dialog ref={dialogRef} className="email-pref-backdrop" aria-labelledby={titleId} onCancel={() => setOpen(false)} onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }} onMouseDown={(event) => {
      if (event.currentTarget === event.target) setOpen(false)
    }}>
      <section className="email-pref-panel">
        <div className="email-pref-heading">
          <div>
            <span className="email-pref-kicker">Preferencias</span>
            <h2 id={titleId}>Qué querés recibir</h2>
          </div>
          <button type="button" className="email-pref-close" onClick={() => setOpen(false)} aria-label="Cerrar preferencias de email">×</button>
        </div>

        {state === 'loading' && <p className="email-pref-muted" role="status">Cargando preferencias…</p>}
        {state === 'error' && !preferences && <div className="email-pref-error" role="alert">
          <p>No pudimos cargar tus preferencias.</p>
          <button type="button" onClick={() => { setLoadAttempt(attempt => attempt + 1); dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }}>Reintentar</button>
        </div>}

        {preferences && <form onSubmit={(event) => { event.preventDefault(); void save() }}><fieldset className="email-pref-fields" disabled={state === 'saving'}>
          <label className="email-pref-row">
            <span><strong>Resumen semanal</strong><small>Cambios en precio, costo y margen de tus productos seguidos.</small></span>
            <input type="checkbox" checked={preferences.digestEnabled} onChange={(event) => update({ digestEnabled: event.target.checked })} />
          </label>
          <label className="email-pref-row">
            <span><strong>Alertas de precio y margen</strong><small>Avisos cuando un producto seguido tenga un cambio relevante.</small></span>
            <input type="checkbox" checked={preferences.alertsEnabled} onChange={(event) => update({ alertsEnabled: event.target.checked })} />
          </label>
          <label className="email-pref-row">
            <span><strong>Novedades de GlobalShipping</strong><small>Comunicaciones opcionales de producto. Desactivadas por defecto.</small></span>
            <input type="checkbox" checked={preferences.marketingEnabled} onChange={(event) => update({ marketingEnabled: event.target.checked })} />
          </label>

          <div className="email-pref-timezone">
            <span><strong>Zona horaria</strong><small>Se usa para programar resúmenes cuando activemos el envío semanal.</small></span>
            <div>
              <input value={preferences.timezone} maxLength={64} onChange={(event) => update({ timezone: event.target.value })} aria-label="Zona horaria" aria-invalid={!!timezoneError} aria-describedby={timezoneError ? timezoneErrorId : undefined} />
              {preferences.timezone !== browserTimezone && <button type="button" onClick={() => update({ timezone: browserTimezone })}>Usar {browserTimezone}</button>}
            </div>
          </div>

          {timezoneError && <p id={timezoneErrorId} className="email-pref-inline-error" role="alert">{timezoneError}</p>}
          <div className="email-pref-transactional">
            <strong>Emails operativos</strong>
            <p>{preferences.transactional.note} Los mensajes de acceso y seguridad de cuenta siguen siendo administrados por Clerk.</p>
          </div>

          {state === 'error' && <p className="email-pref-inline-error" role="alert">No pudimos guardar el cambio. Tus preferencias anteriores siguen vigentes.</p>}
          <div className="email-pref-actions">
            <span aria-live="polite">{state === 'saved' ? 'Guardado' : state === 'saving' ? 'Guardando…' : ''}</span>
            <button type="submit" className="email-pref-save" disabled={state === 'saving'}>Guardar preferencias</button>
          </div>
        </fieldset></form>}
      </section>
    </dialog>}
  </>
}
