import React, { useCallback, useEffect, useRef, useState } from 'react'
import { loadUsage, usageLabel, type UsageSummary } from '../lib/usage'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; usage: UsageSummary }
  | { kind: 'error' }

export default function UsageBadge() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const requestGeneration = useRef(0)
  const mounted = useRef(true)

  const refresh = useCallback(() => {
    const generation = ++requestGeneration.current
    void loadUsage()
      .then((usage) => {
        if (mounted.current && generation === requestGeneration.current) {
          setState({ kind: 'ready', usage })
        }
      })
      .catch(() => {
        if (mounted.current && generation === requestGeneration.current) {
          setState({ kind: 'error' })
        }
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    return () => {
      mounted.current = false
      requestGeneration.current += 1
    }
  }, [refresh])

  useEffect(() => {
    const updated = () => { refresh() }
    window.addEventListener('shippingapp:usage-updated', updated)
    return () => window.removeEventListener('shippingapp:usage-updated', updated)
  }, [refresh])

  if (state.kind === 'loading') {
    return <span className="auth-usage-badge" aria-label="Créditos disponibles">Créditos…</span>
  }
  if (state.kind === 'error') {
    return <button type="button" className="auth-usage-badge auth-usage-retry" onClick={refresh} aria-label="Reintentar consulta de créditos">Créditos no disponibles</button>
  }

  const unlimited = state.usage.plan.code === 'admin'
  return <span
    className={`auth-usage-badge${!unlimited && state.usage.period.creditsRemaining === 0 ? ' exhausted' : ''}`}
    aria-label={unlimited
      ? 'Créditos de administrador ilimitados'
      : `${state.usage.period.creditsRemaining} créditos disponibles de ${state.usage.period.creditsGranted}`}
    title={unlimited ? 'Cuenta de administrador para pruebas' : `Período: ${state.usage.period.start} — ${state.usage.period.end}`}
  >
    {usageLabel(state.usage)}
  </span>
}
