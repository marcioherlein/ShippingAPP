import React from 'react'
import type { TriState } from '../lib/regulatory'
import type { ClientProfileV3 } from '../lib/regulatoryV3'

type Props = { value: ClientProfileV3; onChange: (next: ClientProfileV3) => void }

type SensitiveCategory = 'unknown' | 'none' | 'food' | 'toys' | 'cosmetics' | 'medicines' | 'supplements'

const triOptions = [
  ['unknown', 'No sé'], ['yes', 'Sí'], ['no', 'No'],
] as const

const sensitiveLabels: Record<SensitiveCategory, string> = {
  unknown: 'No sé todavía',
  none: 'Ninguna de estas',
  food: 'Alimentos',
  toys: 'Juguetes',
  cosmetics: 'Cosméticos',
  medicines: 'Medicamentos',
  supplements: 'Suplementos',
}

export default function ClientChecklist({ value, onChange }: Props) {
  const set = <K extends keyof ClientProfileV3>(key: K, next: ClientProfileV3[K]) => onChange({ ...value, [key]: next })
  const extended = value as ClientProfileV3 & { hasImporterSignature?: TriState; sensitiveCategory?: SensitiveCategory }
  const importerSignature = extended.hasImporterSignature || value.importerProfile || 'unknown'
  const sensitiveCategory = extended.sensitiveCategory || 'unknown'
  const setImporterSignature = (next: TriState) => onChange({ ...value, importerProfile: next, hasImporterSignature: next } as ClientProfileV3)
  const setSensitiveCategory = (next: SensitiveCategory) => onChange({ ...value, sensitiveCategory: next } as ClientProfileV3)

  const sensitiveExplanation = sensitiveCategory === 'none'
    ? 'No se activa el gasto/camino especial de categoría sensible.'
    : sensitiveCategory === 'unknown'
      ? 'Este punto queda abierto hasta confirmar si el producto entra en alguna categoría sensible.'
      : 'Esta categoría activa explicación y gasto adicional en el motor de costos hasta validar intervención/requisito específico.'

  return <section className="client-checklist regulatory-card">
    <div className="reg-card-head">
      <div><span className="eyebrow">Checklist mínimo</span><h2>4 datos que cambian la importación</h2></div>
      <span className="checklist-time">≈ 30 segundos</span>
    </div>
    <p className="reg-intro">Reducido a las preguntas que impactan el cálculo y el camino operativo. No pedimos CUIT ni documentos; sólo inputs de decisión.</p>

    <div className="readiness-grid">
      <label className="readiness-field"><span>Destino de la mercadería</span><small>Define si el caso es consumo propio o negocio de reventa.</small>
        <select value={value.purpose} onChange={(e) => set('purpose', e.target.value as ClientProfileV3['purpose'])}>
          <option value="resale">Reventa</option>
          <option value="own_use">Uso propio</option>
          <option value="unknown">No definido</option>
        </select>
      </label>

      <label className="readiness-field"><span>Quién importa</span><small>Cambia tratamiento fiscal y forma de operar.</small>
        <select value={value.entityType} onChange={(e) => set('entityType', e.target.value as ClientProfileV3['entityType'])}>
          <option value="unknown">No sé / todavía no definido</option>
          <option value="company">Empresa</option>
          <option value="individual">Persona humana</option>
        </select>
      </label>

      <label className="readiness-field"><span>Firma importador</span><small>Si no hay firma/importador, el motor suma el gasto adicional de gestión.</small>
        <select value={importerSignature} onChange={(e) => setImporterSignature(e.target.value as TriState)}>
          {triOptions.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
      </label>

      <label className="readiness-field"><span>Categoría sensible</span><small>Alimentos, juguetes, cosméticos, medicamentos y suplementos requieren explicación separada.</small>
        <select value={sensitiveCategory} onChange={(e) => setSensitiveCategory(e.target.value as SensitiveCategory)}>
          {(Object.keys(sensitiveLabels) as SensitiveCategory[]).map((key) => <option key={key} value={key}>{sensitiveLabels[key]}</option>)}
        </select>
      </label>
    </div>

    <div className="analysis-banner" style={{ marginTop: 16 }}>
      <b>Por qué importa la categoría sensible.</b> {sensitiveExplanation} Alimentos, juguetes, cosméticos, medicamentos y suplementos pueden requerir intervención, control, rotulado, autorización o documentación distinta; ShippingAPP no debe tratarlos como importación estándar sin esa alerta.
    </div>
  </section>
}
