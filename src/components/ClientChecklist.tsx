import React from 'react'
import type { ClientProfile, TriState } from '../lib/regulatory'

type Props = { value: ClientProfile; onChange: (next: ClientProfile) => void }

const triOptions = [
  ['unknown', 'No sé'], ['yes', 'Sí'], ['no', 'No'],
] as const

export default function ClientChecklist({ value, onChange }: Props) {
  const set = <K extends keyof ClientProfile>(key: K, next: ClientProfile[K]) => onChange({ ...value, [key]: next })
  const tri = (key: keyof ClientProfile, label: string, help: string) => <label className="readiness-field">
    <span>{label}</span><small>{help}</small>
    <select value={String(value[key])} onChange={(e) => set(key as keyof ClientProfile, e.target.value as never)}>
      {triOptions.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </label>

  return <section className="client-checklist regulatory-card">
    <div className="reg-card-head">
      <div><span className="eyebrow">Checklist del importador</span><h2>¿Estás listo para ejecutar la operación?</h2></div>
      <span className="checklist-time">≈ 60 segundos</span>
    </div>
    <p className="reg-intro">No pedimos CUIT ni datos sensibles. Sólo el estado operativo que cambia requisitos, impuestos o timing de pago.</p>

    <div className="readiness-grid">
      <label className="readiness-field"><span>Tipo de importador</span><small>Modifica excepciones y tratamiento fiscal.</small>
        <select value={value.entityType} onChange={(e) => set('entityType', e.target.value as ClientProfile['entityType'])}>
          <option value="unknown">No sé / todavía no definido</option><option value="company">Empresa</option><option value="individual">Persona humana</option>
        </select>
      </label>
      <label className="readiness-field"><span>Situación fiscal</span><small>Clave para cash vs costo recuperable.</small>
        <select value={value.taxStatus} onChange={(e) => set('taxStatus', e.target.value as ClientProfile['taxStatus'])}>
          <option value="unknown">No sé</option><option value="responsable_inscripto">Responsable inscripto</option><option value="monotributo">Monotributo</option><option value="exento">Exento / no alcanzado</option>
        </select>
      </label>
      {tri('importerProfile', 'Perfil ARCA Importador/Exportador', 'Perfil operativo para gestionar destinaciones.')}
      {tri('biometrics', 'Datos biométricos en ARCA', 'Condición del perfil operativo.')}
      {tri('sitaSicnea', 'SITA / SICNEA habilitados', 'Trámites y comunicaciones aduaneras.')}
      {tri('mipyme', 'Certificado / condición MiPyME', 'Puede cambiar el timing del pago exterior.')}
      {tri('bankComex', 'Banco / canal COMEX definido', 'Necesario para cursar pagos por MLC.')}
      <label className="readiness-field"><span>Destino de la mercadería</span><small>Cambia percepciones y requisitos de venta.</small>
        <select value={value.purpose} onChange={(e) => set('purpose', e.target.value as ClientProfile['purpose'])}>
          <option value="resale">Reventa</option><option value="own_use">Uso propio</option><option value="unknown">No definido</option>
        </select>
      </label>
      <label className="readiness-field"><span>Condición de pago proveedor</span><small>Anticipo, embarque, llegada o crédito.</small>
        <select value={value.paymentTerm} onChange={(e) => set('paymentTerm', e.target.value as ClientProfile['paymentTerm'])}>
          <option value="unknown">No sé</option><option value="advance">Anticipo</option><option value="shipment">Al embarque</option><option value="arrival">A la llegada</option><option value="credit">Crédito / plazo</option>
        </select>
      </label>
      <label className="readiness-field"><span>Provincia / jurisdicción fiscal</span><small>Necesaria para modelar Ingresos Brutos.</small>
        <input value={value.province} onChange={(e) => set('province', e.target.value)} placeholder="Ej. CABA, Buenos Aires" />
      </label>
    </div>
  </section>
}
