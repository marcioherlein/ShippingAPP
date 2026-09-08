import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const journeyCss = readFileSync(new URL('./styles/journey.css', import.meta.url), 'utf8')

describe('landing copy contract', () => {
  it('renders the approved hero, steps and freight messages', () => {
    expect(app).toContain('Recib&#xED; el valor real de tu producto <em>puesto en Argentina.</em>')
    expect(app).toContain('Pod&#xE9;s calcular flete, impuestos y gastos en destino en menos de 2 minutos.')
    expect(app).toContain('Consegu&#xED; en 3 pasos tu costo real')
    expect(app).toContain('Fletes Internacionales Reales')
    expect(app).toContain('y te da la mejor alternativa para tu importaci&#xF3;n.')
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
    }
    expect(journeyCss).not.toContain('journey-faq')
  })
})
