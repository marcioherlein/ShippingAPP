import React, { useEffect, useMemo, useState } from 'react'
import { loadEmailPreferences, saveEmailPreferences, type EmailPreferences as EmailPreferencesState } from '../lib/emailPreferences'
import './EmailPreferences.css'

type LoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'error'

function localTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

export default function EmailPreferences() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>('idle')
  const [preferences, setPreferences] = useState<EmailPreferencesState | null>(null)
  const browserTimezone = useMemo(localTimezone, [])

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
  }, [open, preferences])

  const save = async () => {
    if (!preferences) return
    setState('saving')
    try {
      const saved = await saveEmailPreferences({
        digestEnabled: preferences.digestEnabled,
        alertsEnabled: preferences.alertsEnabled,
        marketingEnabled: preferences.marketingEnabled,
        timezone: preferences.timezone,
      })
      setPreferences(saved)
      setState('saved')
      window.setTimeout(() => setState((current) => current === 'saved' ? 'ready' : current), 1400)
    } catch {
      setState('error')
    }
  }

  const update = (patch: Partial<EmailPreferencesState>) => {
    setPreferences((current) => current ? { ...current, ...patch } : current)
    if (state === 'saved' || state === 'error') setState('ready')
  }

  return <>
    <button type="button" className="auth-secondary email-pref-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
      Emails
    </button>
    {open && <div className="email-pref-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setOpen(false)
    }}>
      <section className="email-pref-panel" role="dialog" aria-modal="true" aria-labelledby="email-pref-title">
        <div className="email-pref-heading">
          <div>
            <span className="email-pref-kicker">Preferencias</span>
            <h2 id="email-pref-title">Qué querés recibir</h2>
          </div>
          <button type="button" className="email-pref-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
        </div>

        {state === 'loading' && <p className="email-pref-muted">Cargando preferencias…</p>}
        {state === 'error' && !preferences && <div className="email-pref-error">
          <p>No pudimos cargar tus preferencias.</p>
          <button type="button" onClick={() => { setState('idle'); setPreferences(null); setOpen(false); window.setTimeout(() => setOpen(true), 0) }}>Reintentar</button>
        </div>}

        {preferences && <>
          <label className="email-pref-row">
            <span><strong>Resumen semanal</strong><small>Cambios en precio, costo y margen de tus productos seguidos.</small></span>
            <input type="checkbox" checked={preferences.digestEnabled} onChange={(event) => update({ digestEnabled: event.target.checked })} />
          </label>
          <label className="email-pref-row">
            <span><strong>Alertas de precio y margen</strong><small>Avisos cuando un producto seguido tenga un cambio relevante.</small></span>
            <input type="checkbox" checked={preferences.alertsEnabled} onChange={(event) => update({ alertsEnabled: event.target.checked })} />
          </label>
          <label className="email-pref-row">
            <span><strong>Novedades de ShippingAPP</strong><small>Comunicaciones opcionales de producto. Desactivadas por defecto.</small></span>
            <input type="checkbox" checked={preferences.marketingEnabled} onChange={(event) => update({ marketingEnabled: event.target.checked })} />
          </label>

          <div className="email-pref-timezone">
            <span><strong>Zona horaria</strong><small>Se usa para programar resúmenes cuando activemos el envío semanal.</small></span>
            <div>
              <input value={preferences.timezone} maxLength={64} onChange={(event) => update({ timezone: event.target.value })} aria-label="Zona horaria" />
              {preferences.timezone !== browserTimezone && <button type="button" onClick={() => update({ timezone: browserTimezone })}>Usar {browserTimezone}</button>}
            </div>
          </div>

          <div className="email-pref-transactional">
            <strong>Emails operativos</strong>
            <p>{preferences.transactional.note} Los mensajes de acceso y seguridad de cuenta siguen siendo administrados por Clerk.</p>
          </div>

          {state === 'error' && <p className="email-pref-inline-error">No pudimos guardar el cambio. Tus preferencias anteriores siguen vigentes.</p>}
          <div className="email-pref-actions">
            <span aria-live="polite">{state === 'saved' ? 'Guardado' : state === 'saving' ? 'Guardando…' : ''}</span>
            <button type="button" className="email-pref-save" onClick={save} disabled={state === 'saving'}>Guardar preferencias</button>
          </div>
        </>}
      </section>
    </div>}
  </>
}
