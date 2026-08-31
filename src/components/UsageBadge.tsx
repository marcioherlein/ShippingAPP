import React, { useCallback, useEffect, useState } from 'react'
import { loadUsage, usageLabel, type UsageSummary } from '../lib/usage'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; usage: UsageSummary }
  | { kind: 'error' }

export default function UsageBadge() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const refresh = useCallback(() => {
    let cancelled = false
    void loadUsage()
      .then((usage) => {
        if (!cancelled) setState({ kind: 'ready', usage })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' })
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => refresh(), [refresh])

  useEffect(() => {
    const updated = () => { refresh() }
    window.addEventListener('shippingapp:usage-updated', updated)
    return () => window.removeEventListener('shippingapp:usage-updated', updated)
  }, [refresh])

  if (state.kind === 'loading') {
    return <span className="auth-usage-badge" aria-label="Créditos disponibles">Créditos…</span>
  }
  if (state.kind === 'error') {
    return <button type="button" className="auth-usage-badge auth-usage-retry" onClick={() => refresh()} aria-label="Reintentar consulta de créditos">Créditos no disponibles</button>
  }

  return <span
    className={`auth-usage-badge${state.usage.period.creditsRemaining === 0 ? ' exhausted' : ''}`}
    aria-label={`${state.usage.period.creditsRemaining} créditos disponibles de ${state.usage.period.creditsGranted}`}
    title={`Período: ${state.usage.period.start} — ${state.usage.period.end}`}
  >
    {usageLabel(state.usage)}
  </span>
}
