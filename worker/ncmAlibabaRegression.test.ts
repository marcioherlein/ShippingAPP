import { describe, expect, it } from 'vitest'
import { classifyFullNcm, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: {
    source: 'ARCA regression fixture', sourceFile: 'nomenclador fixture', sourceDate: '2026-08-14',
    parserSchema: 2, indexSchema: 3, recordCount: 10504, tariffDataIncluded: false,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label]',
  },
  records: [
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje > Las demás'],
    ['9506.51.00', 'Raquetas de tenis, incluso sin cordaje'],
    ['8504.40.90', 'Transformadores eléctricos, convertidores eléctricos estáticos y bobinas de reactancia > Convertidores estáticos > Los demás'],
    ['8507.60.00', 'Acumuladores eléctricos > De iones de litio'],
    ['8517.13.00', 'Teléfonos inteligentes smartphones'],
    ['9405.21.00', 'Lámparas eléctricas de mesa escritorio cabecera o de pie diseñadas para fuente LED'],
    ['4202.92.00', 'Mochilas bolsos y continentes similares con superficie exterior de materia textil o plástico'],
    ['8471.30.19', 'Máquinas automáticas para tratamiento o procesamiento de datos portátiles computadoras notebook laptop'],
    ['8544.42.00', 'Conductores eléctricos aislados provistos de piezas de conexión cables eléctricos con conectores'],
    ['6109.10.00', 'Camisetas T-shirts de punto de algodón'],
    ['6404.11.00', 'Calzado de deporte con suela de caucho o plástico y parte superior textil'],
    ['8414.51.10', 'Ventiladores de mesa suelo pared ventana techo con motor eléctrico de potencia inferior o igual a 125 W'],
    ['8516.60.00', 'Hornos cocinas calentadores eléctricos aparatos electrotérmicos para cocción'],
    ['6302.60.00', 'Ropa de tocador o cocina de tejido con bucles de algodón toallas'],
    ['6912.00.00', 'Vajilla y demás artículos de uso doméstico higiene o tocador de cerámica'],
    ['8421.21.00', 'Aparatos para filtrar o depurar líquidos > Para filtrar o depurar agua'],
    ['9019.10.00', 'Aparatos de mecanoterapia y aparatos para masajes'],
    ['7323.93.00', 'Artículos de uso doméstico de acero inoxidable'],
    ['3926.90.90', 'Las demás manufacturas de plástico'],
  ],
}

type Case = {
  title: string
  terms: string[]
  expected: string
}

const positiveCases: Case[] = [
  { title: 'Professional Custom 12K Carbon Fiber Paddle Racket for Padel Tennis', terms: ['raqueta deportiva similar', 'raqueta bádminton similar'], expected: '9506.59.00' },
  { title: '65W GaN USB C PD Fast Wall Charger Power Adapter', terms: ['convertidor eléctrico estático', 'adaptador alimentación convertidor'], expected: '8504.40.90' },
  { title: '11.1V Rechargeable 18650 Lithium Ion Battery Pack with BMS', terms: ['acumulador ion litio', 'batería ion litio'], expected: '8507.60.00' },
  { title: 'Unlocked Android 5G Smartphone Dual SIM Mobile Phone', terms: ['teléfono inteligente smartphone', 'smartphone teléfono'], expected: '8517.13.00' },
  { title: 'Dimmable LED Desk Lamp Table Reading Light', terms: ['lámpara eléctrica mesa', 'lámpara escritorio led'], expected: '9405.21.00' },
  { title: 'Waterproof Polyester Travel Backpack School Bag', terms: ['mochila materia textil', 'mochila bolso textil'], expected: '4202.92.00' },
  { title: '14 inch Intel Notebook Laptop Computer', terms: ['computadora portátil notebook', 'máquina datos portátil'], expected: '8471.30.19' },
  { title: 'USB C to USB C Fast Charging Cable with Connectors', terms: ['cable eléctrico conector', 'conductor aislado conexión'], expected: '8544.42.00' },
  { title: '100% Cotton Blank Crew Neck T Shirt', terms: ['camiseta algodón punto', 't shirt algodón'], expected: '6109.10.00' },
  { title: 'Breathable Textile Upper Running Sports Shoes', terms: ['calzado deporte textil', 'zapatilla deporte textil'], expected: '6404.11.00' },
  { title: '12 inch Electric Table Fan 45W', terms: ['ventilador mesa eléctrico', 'ventilador motor 125 w'], expected: '8414.51.10' },
  { title: 'Electric Countertop Oven 30L Baking Cooker', terms: ['horno eléctrico cocción', 'aparato electrotérmico cocina'], expected: '8516.60.00' },
  { title: '100% Cotton Terry Bath Towel Hotel Towel', terms: ['toalla algodón bucles', 'ropa tocador algodón'], expected: '6302.60.00' },
  { title: 'Ceramic Dinner Plate Bowl Mug Tableware Set', terms: ['vajilla cerámica doméstico', 'artículo doméstico cerámica'], expected: '6912.00.00' },
  { title: 'Reverse Osmosis Household Water Filter Purifier', terms: ['aparato filtrar agua', 'depurar agua aparato'], expected: '8421.21.00' },
  { title: 'Handheld Percussion Massage Gun Muscle Massager', terms: ['aparato masaje mecanoterapia', 'aparato para masajes'], expected: '9019.10.00' },
  { title: 'Stainless Steel Kitchen Mixing Bowl Household Set', terms: ['artículo doméstico acero inoxidable', 'uso doméstico inoxidable'], expected: '7323.93.00' },
]

function fakeAi(terms: string[], expected: string) {
  let call = 0
  return {
    run: async () => {
      call += 1
      if (call === 1) return { response: JSON.stringify({ searchTerms: terms, missingFacts: [] }) }
      return { response: JSON.stringify({ ranking: [{ code: expected, reason: 'objective product characteristics match' }], confidence: 'high', missingFacts: [] }) }
    },
  }
}

describe('Alibaba-style full NCM regression', () => {
  for (const sample of positiveCases) {
    it(`classifies: ${sample.title}`, async () => {
      const result = await classifyFullNcm(index, fakeAi(sample.terms, sample.expected), { name: sample.title })
      expect(result.status).toBe('candidate')
      expect(result.code).toBe(sample.expected)
      expect(result.alternatives.map((item) => item.code)).not.toContain('9999.99.99')
    })
  }

  const adversarialCases = [
    ['Padel Racket Protective Cover Bag Only', ['funda protectora raqueta', 'bolso funda textil']],
    ['USB C Charging Cable 2m No Power Adapter', ['cable eléctrico conector', 'conductor aislado conexión']],
    ['Phone Protective Case TPU Without Electronics', ['funda teléfono plástico', 'manufactura plástico funda']],
    ['LED Desk Lamp Shade Replacement Only', ['pantalla lámpara repuesto', 'parte lámpara pantalla']],
    ['Backpack Zipper Replacement Accessory', ['cierre cremallera repuesto', 'accesorio cierre']],
  ] as const

  for (const [title, terms] of adversarialCases) {
    it(`does not hallucinate the principal product for accessory: ${title}`, async () => {
      const ai = {
        run: async () => ({ response: JSON.stringify({ searchTerms: terms, missingFacts: ['confirmar naturaleza exacta del accesorio'] }) }),
      }
      const result = await classifyFullNcm(index, ai, { name: title })
      if (result.status === 'candidate') {
        if (title.includes('Padel')) expect(result.code).not.toBe('9506.59.00')
        if (title.includes('Cable')) expect(result.code).not.toBe('8504.40.90')
        if (title.includes('Phone')) expect(result.code).not.toBe('8517.13.00')
        if (title.includes('Lamp')) expect(result.code).not.toBe('9405.21.00')
        if (title.includes('Backpack')) expect(result.code).not.toBe('4202.92.00')
      } else {
        expect(result.status).toBe('missing')
      }
    })
  }

  it('fails closed for a product title with insufficient objective characteristics', async () => {
    const ai = { run: async () => ({ response: JSON.stringify({ searchTerms: ['producto industrial genérico'], missingFacts: ['función principal', 'material', 'composición'] }) }) }
    const result = await classifyFullNcm(index, ai, { name: 'Hot Sale New Product 2026' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
  })
})
