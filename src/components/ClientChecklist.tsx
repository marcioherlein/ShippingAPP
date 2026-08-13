import React from 'react'
import type { TriState } from '../lib/regulatory'
import type { ClientProfileV3 } from '../lib/regulatoryV3'

type Props = { value: ClientProfileV3; onChange: (next: ClientProfileV3) => void }

const triOptions = [
  ['unknown', 'No sé'], ['yes', 'Sí'], ['no', 'No'],
] as const

export default function ClientChecklist({ value, onChange }: Props) {
  const set = <K extends keyof ClientProfileV3>(key: K, next: ClientProfileV3[K]) => onChange({ ...value, [key]: next })
  const tri = (key: keyof ClientProfileV3, label: string, help: string) => <label className="readiness-field">
    <span>{label}</span><small>{help}</small>
    <select value={String(value[key])} onChange={(e) => set(key, e.target.value as never)}>
      {triOptions.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </label>

  const externalDeclarant = value.declarationRoute === 'authorized_declarante' || value.declarationRoute === 'customs_broker'

  return <section className="client-checklist regulatory-card">
    <div className="reg-card-head">
      <div><span className="eyebrow">Checklist del importador</span><h2>¿Estás listo para ejecutar y vender?</h2></div>
      <span className="checklist-time">≈ 90 segundos</span>
    </div>
    <p className="reg-intro">No pedimos CUIT ni documentos. Sólo estados que cambian la posibilidad de operar, el tratamiento fiscal, el pago exterior o la comercialización.</p>

    <div className="readiness-grid">
      <label className="readiness-field"><span>Tipo de importador</span><small>Modifica excepciones y tratamiento fiscal.</small>
        <select value={value.entityType} onChange={(e) => set('entityType', e.target.value as ClientProfileV3['entityType'])}>
          <option value="unknown">No sé / todavía no definido</option><option value="company">Empresa</option><option value="individual">Persona humana</option>
        </select>
      </label>
      <label className="readiness-field"><span>Situación fiscal</span><small>Clave para cash vs costo recuperable.</small>
        <select value={value.taxStatus} onChange={(e) => set('taxStatus', e.target.value as ClientProfileV3['taxStatus'])}>
          <option value="unknown">No sé</option><option value="responsable_inscripto">Responsable inscripto</option><option value="monotributo">Monotributo</option><option value="exento">Exento / no alcanzado</option>
        </select>
      </label>
      {tri('importerProfile', 'Perfil ARCA Importador/Exportador', 'Perfil operativo para gestionar destinaciones.')}
      {tri('sicneaAdhesion', 'SICNEA adherido', 'Comunicaciones y notificaciones aduaneras.')}
      {tri('bankComex', 'Banco / canal COMEX definido', 'Valida el pago exterior contra normativa BCRA vigente.')}
      <label className="readiness-field"><span>Destino de la mercadería</span><small>Cambia percepciones y requisitos de venta.</small>
        <select value={value.purpose} onChange={(e) => set('purpose', e.target.value as ClientProfileV3['purpose'])}>
          <option value="resale">Reventa</option><option value="own_use">Uso propio</option><option value="unknown">No definido</option>
        </select>
      </label>
      {tri('mipyme', 'Condición MiPyME', 'Puede modificar el encuadre del pago exterior; no lo aprueba automáticamente.')}
      <label className="readiness-field"><span>Condición de pago proveedor</span><small>Anticipo, embarque, llegada o crédito.</small>
        <select value={value.paymentTerm} onChange={(e) => set('paymentTerm', e.target.value as ClientProfileV3['paymentTerm'])}>
          <option value="unknown">No sé</option><option value="advance">Anticipo</option><option value="shipment">Al embarque</option><option value="arrival">A la llegada</option><option value="credit">Crédito / plazo</option>
        </select>
      </label>
      <label className="readiness-field"><span>Provincia / jurisdicción fiscal</span><small>Necesaria para modelar Ingresos Brutos.</small>
        <input value={value.province} onChange={(e) => set('province', e.target.value)} placeholder="Ej. CABA, Buenos Aires" />
      </label>
    </div>

    <details className="manual-details" style={{ marginTop: 18 }}>
      <summary>Requisitos operativos y de comercialización</summary>
      <div className="readiness-grid" style={{ marginTop: 12 }}>
        {tri('biometrics', 'Datos biométricos en ARCA', 'Condición para solicitar y sostener el Perfil.')}
        {tri('sitaAccess', 'Acceso SITA', 'Trámites y documentación complementaria; distinto de SICNEA.')}
        {tri('criminalRecordDocs', 'Antecedentes para el Perfil', 'Si el Perfil no está aceptado, confirmar la documentación requerida por ARCA.')}
        <label className="readiness-field"><span>Quién presenta la destinación</span><small>Directamente o mediante persona autorizada.</small>
          <select value={value.declarationRoute} onChange={(e) => set('declarationRoute', e.target.value as ClientProfileV3['declarationRoute'])}>
            <option value="unknown">No definido</option><option value="self">El importador directamente</option><option value="customs_broker">Despachante de aduana</option><option value="authorized_declarante">Otro declarante autorizado</option>
          </select>
        </label>
        {externalDeclarant && tri('declarantProfile', 'Perfil del declarante / despachante', 'ARCA prevé un perfil operativo separado para quien actúa como declarante autorizado.')}
        <label className="readiness-field"><span>Reglamento técnico</span><small>Estado de la verificación producto/NCM y conformidad.</small>
          <select value={value.technicalRegulation} onChange={(e) => set('technicalRegulation', e.target.value as ClientProfileV3['technicalRegulation'])}>
            <option value="unknown">Todavía no verificado</option><option value="not_applicable_confirmed">No aplica · confirmado</option><option value="applies_ready">Aplica · conformidad lista</option><option value="applies_pending">Aplica · conformidad pendiente</option>
          </select>
        </label>
        {tri('tadAccess', 'Acceso TAD', 'Canal para trámites del marco de reglamentos técnicos cuando aplica.')}
        {tri('labelingReady', 'Rotulado para venta local', 'Sólo es crítico si la mercadería se comercializa en Argentina.')}
      </div>
    </details>
  </section>
}
