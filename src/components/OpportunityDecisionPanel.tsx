import React from 'react'
import type { OpportunityDecision } from '../lib/opportunityDecision'
import { pct, usd } from '../lib/format'

export default function OpportunityDecisionPanel({ decision }: { decision: OpportunityDecision }) {
  const result = decision.result
  const stage = decision.stage === 'robust_decision' ? 'Robust Decision' : 'Instant Screening'

  return <section className={`opportunity-card ${decision.verdict}`}>
    <div className="opportunity-head">
      <div>
        <span className="eyebrow">Opportunity Decision · MVP 1.3</span>
        <h2>{decision.label}</h2>
        <p>{decision.summary}</p>
      </div>
      <div className="opportunity-confidence">
        <span>{stage}</span>
        <b>{decision.evidenceConfidencePct}%</b>
        <small>evidence confidence</small>
      </div>
    </div>

    {result && <div className="opportunity-metrics">
      <div><span>MOQ / cantidad evaluada</span><b>{result.quantity} u.</b></div>
      <div><span>Costo económico</span><b>{usd(result.economicLandedUnitUsd)}/u.</b></div>
      <div><span>Margen screening</span><b>{pct(result.marginPct)}</b></div>
      <div><span>Cash requerido</span><b>{usd(result.cashRequiredUsd)}</b></div>
      {decision.robustCandidate && <>
        <div><span>Robust score</span><b>{decision.robustCandidate.robustScore}/100</b></div>
        <div><span>Peor margen</span><b>{pct(decision.robustCandidate.worstMarginPct)}</b></div>
      </>}
    </div>}

    {decision.reasons.length > 0 && <div className="opportunity-reasons">
      <b>Por qué</b>
      <ul>{decision.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}

    {decision.warnings.length > 0 && <div className="opportunity-warnings">
      <b>{decision.provisional ? 'Qué falta antes de confiar en esta señal' : 'Sensibilidades / límites'}</b>
      <ul>{decision.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}

    {decision.nextActions.length > 0 && <div className="opportunity-next">
      <b>Siguiente paso</b>
      <ul>{decision.nextActions.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}
  </section>
}
