import { lookupFreightRate, type ModeCostBreakdown } from './landedCostEngine'
export type PlannedMode = 'lcl' | 'air' | 'courier'
export type TransitEstimate = { minDays: number; maxDays: number; basis: 'business' | 'calendar'; scope: string; source: string }
export type TransportOption = { mode: PlannedMode; cost: ModeCostBreakdown; transit: TransitEstimate | null; limitations: string[]; eligibility: 'estimated' | 'requires_quote' | 'unavailable' }
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Planning assumptions, deliberately separate from quoted workbook freight rates. */
function transitEstimate(mode: PlannedMode, origin: string): TransitEstimate | null {
  const rate = lookupFreightRate(origin)
  if (!rate) return null
  const region = normalize(rate.region)
  const days = mode === 'courier' ? [5, 10] : mode === 'air' ? [7, 15] : region === 'asia' ? [35, 65] : region === 'europa' ? [25, 45] : region.includes('america') || region === 'caribe' ? [15, 40] : [30, 70]
  return { minDays: days[0], maxDays: days[1], basis: mode === 'lcl' ? 'calendar' : 'business', scope: 'Sólo transporte internacional; no incluye preparación del proveedor, aduana ni entrega local.', source: 'Supuesto orientativo de planificación; plazo y ruta por confirmar con el operador.' }
}

export function transportOption(mode: PlannedMode, cost: ModeCostBreakdown, origin: string, cargoText = ''): TransportOption {
  const limitations = mode === 'courier' ? [
    'La tabla de precios modelada cubre hasta 50 kg facturables por envío; es cobertura del modelo, no un límite legal por bulto.',
    'Peso facturable: el mayor entre peso real y volumen × 200 kg/m³, redondeado al kg superior.',
    'Confirmar con el courier valor, dimensiones, cantidad de bultos, régimen aplicable y aceptación de la mercadería.',
  ] : mode === 'air' ? [
    'Se cobra el mayor entre peso real y peso volumétrico (aprox. 166,67 kg/m³), con mínimo de flete según origen.',
    'Confirmar dimensiones por pieza, bodega disponible, restricciones de carga y aceptación del operador.',
  ] : [
    'Carga marítima consolidada: se cobra el mayor entre m³ y toneladas, con mínimo de 1 W/M y redondeo por W/M entero.',
    'Requiere consolidación y desconsolidación; confirmar ruta, frecuencias y embalaje aceptado.',
  ]
  const cargo = normalize(cargoText)
  const battery = /\b(baterias?|batter(?:y|ies)|litio|lithium|li[ -]?ion)\b/.test(cargo) && !/\b(sin bateria|without (?:a )?battery|no incluye bateria)\b/.test(cargo)
  if (battery) limitations.push('La carga contiene o menciona baterías: la aceptación y los recargos requieren cotización específica. Si son de litio, confirmar Wh, embalaje, UN 38.3 y documentación con el transportista; el flete estándar no incluye recargos de mercancía peligrosa.')
  if (!cost.available && cost.reason) limitations.unshift(cost.reason)
  return { mode, cost, transit: cost.available ? transitEstimate(mode, origin) : null, limitations, eligibility: !cost.available ? 'unavailable' : battery ? 'requires_quote' : 'estimated' }
}
