import React from 'react'
import { pct, usd } from '../lib/format'
import type { Result } from '../lib/types'

type Props = { rows: Result[]; selected?: Result }

export default function ScenarioTable({ rows, selected }: Props) {
  return <section className="table-card">
    <div className="table-title"><h2>Comparación por cantidad</h2><small>Score 0–100</small></div>
    <div className="table-scroll"><table>
      <thead><tr><th>Cant.</th><th>Vía</th><th>Landed/u</th><th>Capital</th><th>Margen</th><th>Meses</th><th>Score</th></tr></thead>
      <tbody>{rows.map((r) => {
        const chosen = selected?.quantity === r.quantity && selected?.mode === r.mode
        return <tr key={`${r.quantity}-${r.mode}`} className={chosen ? 'selected-row' : ''}>
          <td><b>{r.quantity}</b>{chosen && <em>Recomendado</em>}</td>
          <td>{r.mode === 'air' ? 'Aéreo' : 'Marítimo'}</td>
          <td>{usd(r.landedUnitUsd)}</td><td>{usd(r.landedTotalUsd)}</td>
          <td>{pct(r.marginPct)}</td><td>{r.inventoryMonths.toFixed(1)}</td>
          <td><span className="score-pill">{r.score}</span></td>
        </tr>
      })}</tbody>
    </table></div>
  </section>
}
