import type { ModeCostBreakdown } from '../lib/landedCostEngine'
import { usd } from '../lib/format'

export default function QuoteCostBreakdown({ cost, quantity }: { cost: ModeCostBreakdown; quantity: number }) {
  const lines: [string, number][] = [
    ['Mercadería', cost.fobUsd],
    ['Flete internacional', cost.freightCostUsd],
    ['Derecho de importación', cost.dutyUsd],
    ['Tasa estadística', cost.statisticsUsd],
    ['IVA', cost.vatUsd],
    ['IVA adicional', cost.vatAdditionalUsd],
    ['Ganancias', cost.gainsUsd],
    ['Ingresos brutos', cost.iibbUsd],
    ['Gastos de destino', cost.fixedDestinationUsd],
    ['Firma de importador', cost.noImporterSignatureUsd],
    ['Intervenciones', cost.sensitiveCategoryUsd],
  ]
  return <table className="calculator-cost-table">
    <caption className="calculator-sr-only">Desglose del costo en dólares</caption>
    <thead><tr><th scope="col">Concepto</th><th scope="col">Total</th><th scope="col">Por unidad</th></tr></thead>
    <tbody>{lines.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{usd(value)}</td><td>{quantity > 0 ? usd(value / quantity) : '—'}</td></tr>)}</tbody>
    <tfoot><tr><th scope="row">Desembolso</th><td>{usd(cost.totalCostUsd)}</td><td>{usd(cost.unitCostUsd)}</td></tr></tfoot>
  </table>
}
