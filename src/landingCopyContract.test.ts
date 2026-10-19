import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const landing = readFileSync(new URL('./components/Landing.tsx', import.meta.url), 'utf8')
const journeyCss = readFileSync(new URL('./styles/journey.css', import.meta.url), 'utf8')

describe('landing copy contract', () => {
  it('explains the decision workflow without unsupported commercial promises', () => {
    expect(landing).toContain('mirá el panorama completo.')
    expect(landing).toContain('costo por unidad, inversión total y alternativas de compra')
    expect(landing).toContain('Completá y validá la ficha')
    for (const claim of ['+1.200', 'menos de 2 minutos', 'Fletes Internacionales Reales']) expect(landing).not.toContain(claim)
    expect(app).toContain('Planificá tu importación')
  })

  it('removes obsolete claims and the FAQ from markup and styles', () => {
    for (const obsolete of [
      '100% gratuito',
      'Sin estimaciones de aduana',
      'Tipos de cambio reales',
      'en minutos, sin suposiciones',
      'no voy a disfrazarlo',
      'no voy a inventar un dato que Alibaba no exponga',
      'journey-faq',
    ]) {
      expect(app).not.toContain(obsolete)
      expect(landing).not.toContain(obsolete)
    }
    expect(journeyCss).not.toContain('journey-faq')
  })
})
