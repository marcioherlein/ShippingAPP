import React, { useMemo, useState } from 'react'
import { emptyExpertOverride, validateExpertOverride, type ExpertOverride, type ExpertOverrideDraft } from '../lib/expertOverride'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'

type Props = { analysis: ProductAnalysisV2; onApply: (override: ExpertOverride) => void }

function initialDraft(analysis: ProductAnalysisV2): ExpertOverrideDraft {
  return {
    ...emptyExpertOverride,
    ncm: analysis.customs.ncmCandidate ?? '',
    dutyRatePct: analysis.customs.dutyRatePct,
    supplierUnitPriceUsd: analysis.product.unitPriceUsd,
    moq: analysis.product.moq,
    unitWeightKg: analysis.product.packedWeightKg > 0 ? analysis.product.packedWeightKg : null,
    unitVolumeCbm: analysis.product.volumeCbm > 0 ? analysis.product.volumeCbm : null,
    marketPriceArs: analysis.market.estimatedPriceArs,
    monthlyDemand: analysis.market.estimatedMonthlyDemand > 0 ? analysis.market.estimatedMonthlyDemand : null,
  }
}

function NumberInput({ label, help, value, onChange, error, step = 1 }: { label: string; help: string; value: number | null; onChange: (value: number | null) => void; error?: string; step?: number }) {
  return <label className="readiness-field"><span>{label}</span><small>{help}</small><input type="number" min="0" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />{error && <small className="error">{error}</small>}</label>
}

export default function ExpertOverridePanel({ analysis, onApply }: Props) {
  const [draft, setDraft] = useState<ExpertOverrideDraft>(() => initialDraft(analysis))
  const [submitted, setSubmitted] = useState(false)
  const validation = useMemo(() => validateExpertOverride(draft), [draft])
  const set = <K extends keyof ExpertOverrideDraft>(key: K, value: ExpertOverrideDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const apply = () => {
    setSubmitted(true)
    if (validation.valid && validation.value) onApply(validation.value)
  }

  return <section className="regulatory-card">
    <div className="reg-card-head"><div><span className="eyebrow">Expert override</span><h2>Completar evidencia para habilitar el business case</h2></div><span className="confidence warning">Manual · VERIFICAR</span></div>
    <p className="reg-intro">Usá esta vía sólo cuando tengas datos concretos del proveedor, producto y mercado. Los campos prellenados provienen del análisis actual; los vacíos no se reemplazan por defaults de la demo. Aplicar este formulario habilita una estimación económica, no una aprobación aduanera.</p>

    <div className="readiness-grid">
      <label className="readiness-field"><span>NCM</span><small>8 dígitos. Se normaliza como 0000.00.00.</small><input value={draft.ncm} onChange={(e) => set('ncm', e.target.value)} placeholder="Ej. 8504.40.90" />{submitted && validation.errors.ncm && <small className="error">{validation.errors.ncm}</small>}</label>
      <NumberInput label="Derecho de importación" help="Alícuota que querés usar para screening." value={draft.dutyRatePct} step={0.1} onChange={(v) => set('dutyRatePct', v)} error={submitted ? validation.errors.dutyRatePct : undefined} />
      <NumberInput label="Precio proveedor / unidad" help="USD unitarios reales; no usamos el precio demo." value={draft.supplierUnitPriceUsd} step={0.01} onChange={(v) => set('supplierUnitPriceUsd', v)} error={submitted ? validation.errors.supplierUnitPriceUsd : undefined} />
      <NumberInput label="MOQ" help="Cantidad mínima del proveedor." value={draft.moq} onChange={(v) => set('moq', v)} error={submitted ? validation.errors.moq : undefined} />
      <NumberInput label="Peso embalado / unidad" help="kg cobrables antes de volumetría." value={draft.unitWeightKg} step={0.001} onChange={(v) => set('unitWeightKg', v)} error={submitted ? validation.errors.unitWeightKg : undefined} />
      <NumberInput label="Volumen embalado / unidad" help="m³ por unidad; necesario para aéreo volumétrico y LCL." value={draft.unitVolumeCbm} step={0.0001} onChange={(v) => set('unitVolumeCbm', v)} error={submitted ? validation.errors.unitVolumeCbm : undefined} />
      <NumberInput label="Benchmark local" help="ARS por unidad. Debe ser un comparable que puedas defender." value={draft.marketPriceArs} step={1000} onChange={(v) => set('marketPriceArs', v)} error={submitted ? validation.errors.marketPriceArs : undefined} />
      <NumberInput label="Ventas mensuales esperadas" help="Hipótesis explícita para inventario/robustez; no se hereda la demanda demo." value={draft.monthlyDemand} onChange={(v) => set('monthlyDemand', v)} error={submitted ? validation.errors.monthlyDemand : undefined} />
    </div>

    <label className="readiness-field" style={{ marginTop: 14 }}><span><input type="checkbox" checked={draft.userCheckedOfficialSource} onChange={(e) => set('userCheckedOfficialSource', e.target.checked)} /> Verifiqué NCM/derecho contra una fuente oficial</span><small>Esto registra tu declaración; ShippingAPP igualmente mantendrá NCM y derecho en VERIFICAR hasta contar con validación independiente.</small></label>
    {draft.userCheckedOfficialSource && <label className="readiness-field"><span>Referencia de fuente</span><small>Ej. ARCA Arancel Integrado + fecha de consulta.</small><input value={draft.sourceNote} onChange={(e) => set('sourceNote', e.target.value)} placeholder="ARCA Arancel Integrado · 14/08/2026" />{submitted && validation.errors.sourceNote && <small className="error">{validation.errors.sourceNote}</small>}</label>}

    <button type="button" onClick={apply}>Aplicar evidencia manual</button>
    {submitted && !validation.valid && <div className="analysis-banner"><b>No se aplicó ningún override.</b> Completá todos los campos obligatorios marcados. ShippingAPP mantiene el análisis parcial mientras falte evidencia crítica.</div>}
  </section>
}
