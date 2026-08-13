export type LegalSource = {
  id: string
  label: string
  url: string
  lastChecked: string
}

export const legalSources: Record<string, LegalSource> = {
  customsCode: { id: 'customsCode', label: 'Código Aduanero · DNU 70/2023', url: 'https://www.argentina.gob.ar/normativa/nacional/395521/texto', lastChecked: '2026-08-13' },
  arcaProfile: { id: 'arcaProfile', label: 'ARCA · Perfiles Importador/Exportador y Declarante', url: 'https://www.arca.gob.ar/decreto-70-2023/gestion-de-perfiles/perfiles.asp', lastChecked: '2026-08-13' },
  sicnea: { id: 'sicnea', label: 'ARCA · SICNEA · adhesión y comunicaciones', url: 'https://www.arca.gob.ar/sicnea/procedimiento/adhesion-y-acceso-a-comunicaciones.asp', lastChecked: '2026-08-13' },
  sedi: { id: 'sedi', label: 'RG Conjunta 5651/2025 · derogación SEDI', url: 'https://www.argentina.gob.ar/normativa/nacional/norma-410079', lastChecked: '2026-08-13' },
  vuce: { id: 'vuce', label: 'VUCE / CIVUCE', url: 'https://www.argentina.gob.ar/vuce', lastChecked: '2026-08-13' },
  tariff: { id: 'tariff', label: 'ARCA · Arancel Integrado · datos 27/07/2026', url: 'https://www.arca.gob.ar/aduana/arancelintegrado/', lastChecked: '2026-08-13' },
  statistics: { id: 'statistics', label: 'Decreto 1140/2024 · tasa de estadística', url: 'https://biblioteca.arca.gob.ar/dcp/DEC_C_001140_2024_12_30', lastChecked: '2026-08-13' },
  vat: { id: 'vat', label: 'Ley de IVA · importaciones', url: 'https://www.argentina.gob.ar/normativa/nacional/ley-23349-42701/actualizacion', lastChecked: '2026-08-13' },
  vatPerception: { id: 'vatPerception', label: 'RG 2937/2010 · percepción IVA', url: 'https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-2937-2010-174986/actualizacion', lastChecked: '2026-08-13' },
  gains: { id: 'gains', label: 'RG 2281/2007 · percepción Ganancias', url: 'https://www.argentina.gob.ar/normativa/nacional/norma-130808/actualizacion', lastChecked: '2026-08-13' },
  bcra: { id: 'bcra', label: 'BCRA · Normativa de Exterior y Cambios', url: 'https://www.bcra.gob.ar/normativa-de-exterior-y-cambios/', lastChecked: '2026-08-13' },
  technicalRegs: { id: 'technicalRegs', label: 'Resolución 237/2024 · Marco General de Evaluación de la Conformidad', url: 'https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-237-2024-403547/actualizacion', lastChecked: '2026-08-13' },
  consumerProducts313: { id: 'consumerProducts313', label: 'Resolución SIC 313/2025 · productos de consumo alcanzados', url: 'https://www.argentina.gob.ar/node/477287', lastChecked: '2026-08-13' },
  labeling: { id: 'labeling', label: 'DNU 274/2019 · Lealtad Comercial', url: 'https://www.argentina.gob.ar/normativa/nacional/decreto-274-2019-322236/texto', lastChecked: '2026-08-13' },
}
