import { comparableScore } from '../worker/catalogMatch'
import type { MlResult } from '../worker/marketTypes'

const productName = 'Sony WH-1000XM5'
const category = 'auriculares bluetooth'

function item(title: string, attributes: MlResult['attributes'] = []): MlResult {
  return {
    id: `audit:${Math.random()}`,
    title,
    price: 449999.44,
    currency_id: 'ARS',
    condition: 'new',
    attributes,
  }
}

const realSonyAttributes = [
  { name: 'Marca', value_name: 'Sony' },
  { name: 'Modelo', value_name: 'WH-1000XM5 1 PAGO' },
  { name: 'Back to GWT', value_name: 'wh-1000xm5' },
  { name: 'Características', value_name: 'Bluetooth®, Noise Cancelling, High Resolution Audio' },
]

const cases = [
  {
    id: 'sony-real-item',
    candidate: item('Auriculares inalámbricos con noise cancelling WH-1000XM5 WH1000XM5/LMUC + 1 PAGO', realSonyAttributes),
  },
  {
    id: 'sony-real-product-title-only',
    candidate: item('Auriculares inalámbricos con noise cancelling WH-1000XM5', realSonyAttributes),
  },
  {
    id: 'sony-brand-visible-in-title',
    candidate: item('Auriculares inalámbricos Sony con noise cancelling WH-1000XM5', realSonyAttributes),
  },
  {
    id: 'known-accepted-oncity-shape',
    candidate: item('Auriculares Bluetooth Sony Inalambricos WH-1000XM5 Negro'),
  },
  {
    id: 'sony-conflicting-brand-attribute',
    candidate: item('Auriculares inalámbricos con noise cancelling WH-1000XM5', [
      { name: 'Marca', value_name: 'Bose' },
      { name: 'Modelo', value_name: 'WH-1000XM5' },
    ]),
  },
  {
    id: 'sony-accessory-kit',
    candidate: item('KIT: Almohadillas para WH-1000XM5 + Herramienta de instalación', [
      { name: 'Marca', value_name: 'Sony' },
      { name: 'Modelo', value_name: 'KIT: Almohadillas WH-1000XM5 + Herramienta' },
    ]),
  },
]

const scored = cases.map(({ id, candidate }) => ({
  id,
  score: comparableScore(candidate, productName, category),
  acceptedAt55: comparableScore(candidate, productName, category) >= 55,
  title: candidate.title,
}))

console.log(JSON.stringify({
  status: 'sony_match_score_audit_complete',
  productName,
  category,
  threshold: 55,
  scored,
}, null, 2))
