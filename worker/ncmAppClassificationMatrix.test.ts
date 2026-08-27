import { describe, expect, it } from 'vitest'
import { classifyFullNcm, tariffFromRecord, type NcmSearchIndex } from './ncmRetrieval'

const index: NcmSearchIndex = {
  meta: {
    source: 'NCM_APP.xlsx', sourceFile: 'NCM_APP.xlsx', sourceDate: '2026-08-27',
    parserSchema: 3, indexSchema: 4, recordCount: 10504, tariffDataIncluded: true,
    simOpeningsIncluded: false, recordShape: '[ncmCode,label,aec,die,te,dii,iva,ivaAdic,ganancias,iibb,impInternos,bienUso]',
    tariffShape: '[aec,die,te,dii,iva,ivaAdic,ganancias,iibb,impInternos,bienUso]', filters: ['exento_ganancias', 'bien_de_uso'],
  },
  records: [
    ['9506.59.00', 'Raquetas de tenis, bádminton o similares, incluso sin cordaje; las demás paletas de pádel racket carbono', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8504.40.90', 'Convertidores eléctricos estáticos fuentes de alimentación cargadores USB C power adapter', 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
    ['8525.89.19', 'Cámaras de televisión digitales webcam cámaras de seguridad IP wifi smart video door phone', 16, 16, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
    ['8518.30.00', 'Auriculares incluidos los de casco earbuds TWS bluetooth con micrófono', 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8528.69.00', 'Proyectores y monitores no incorporando aparato receptor de televisión mini proyector 1080p', 16, 16, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
    ['8509.40.50', 'Aparatos electromecánicos con motor eléctrico incorporado licuadoras batidoras mezcladoras portátil USB', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8508.11.00', 'Aspiradoras con motor eléctrico incorporado de potencia inferior o igual a 1500 W grooming mascotas', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8543.70.99', 'Máquinas y aparatos eléctricos con función propia no expresados máscara LED facial beauty device', 16, 16, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
    ['8471.30.19', 'Máquinas automáticas para tratamiento o procesamiento de datos portátiles notebook laptop', 16, 16, 3, 0, 10.5, 20, 6, 2.5, null, 'SI'],
    ['8541.43.00', 'Células fotovoltaicas ensambladas en módulos o paneles panel solar fotovoltaico', 0, 0, 3, 0, 21, 20, 0, 2.5, null, 'SI'],
    ['9004.10.00', 'Gafas anteojos de sol sunglasses', 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['8516.71.00', 'Aparatos electrotérmicos para preparar café o té cafeteras espresso coffee maker', 20, 20, 3, 0, 21, 20, 6, 2.5, null, 'NO'],
    ['9403.10.00', 'Muebles de metal de los tipos utilizados en oficinas mueble oficina metálico', 18, 18, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
    ['8423.81.90', 'Aparatos e instrumentos para pesar balanzas electrónicas industriales de capacidad inferior o igual a 30 kg', 14, 14, 3, 0, 21, 20, 6, 2.5, null, 'SI'],
  ],
}

type Case = {
  kind: 'Alibaba' | 'Palabra'
  input: string
  terms: string[]
  code: string
  capitalGood: boolean
  gainsPct: number
}

function fakeAi(testCase: Case) {
  let call = 0
  return {
    run: async () => {
      call += 1
      if (call === 1) return { response: JSON.stringify({ searchTerms: testCase.terms, missingFacts: [] }) }
      return { response: JSON.stringify({ ranking: [{ code: testCase.code, reason: 'Coincide con descripción objetiva del producto.' }], confidence: 'high', missingFacts: [] }) }
    },
  }
}

const cases: Case[] = [
  { kind: 'Alibaba', input: 'Carbon 18K padel racket Alibaba', terms: ['paletas de pádel racket carbono', 'raquetas similares'], code: '9506.59.00', capitalGood: false, gainsPct: 6 },
  { kind: 'Palabra', input: 'cargador USB-C 65W', terms: ['cargadores USB C power adapter', 'convertidores eléctricos estáticos'], code: '8504.40.90', capitalGood: true, gainsPct: 6 },
  { kind: 'Alibaba', input: 'smart wifi video door phone camera Alibaba', terms: ['cámaras de seguridad IP wifi', 'video door phone'], code: '8525.89.19', capitalGood: true, gainsPct: 6 },
  { kind: 'Palabra', input: 'auriculares TWS bluetooth', terms: ['auriculares earbuds TWS', 'micrófono bluetooth'], code: '8518.30.00', capitalGood: false, gainsPct: 6 },
  { kind: 'Alibaba', input: 'mini projector 1080p Alibaba', terms: ['proyectores mini proyector', '1080p'], code: '8528.69.00', capitalGood: true, gainsPct: 6 },
  { kind: 'Palabra', input: 'licuadora portátil USB', terms: ['licuadoras portátil USB', 'aparatos electromecánicos motor eléctrico'], code: '8509.40.50', capitalGood: false, gainsPct: 6 },
  { kind: 'Alibaba', input: 'pet grooming vacuum cleaner Alibaba', terms: ['aspiradoras grooming mascotas', 'motor eléctrico incorporado'], code: '8508.11.00', capitalGood: false, gainsPct: 6 },
  { kind: 'Palabra', input: 'máscara LED facial', terms: ['máscara LED facial', 'aparatos eléctricos función propia'], code: '8543.70.99', capitalGood: true, gainsPct: 6 },
  { kind: 'Palabra', input: 'notebook laptop', terms: ['notebook laptop', 'máquinas automáticas procesamiento de datos portátiles'], code: '8471.30.19', capitalGood: true, gainsPct: 6 },
  { kind: 'Alibaba', input: 'solar panel photovoltaic Alibaba', terms: ['panel solar fotovoltaico', 'células fotovoltaicas módulos'], code: '8541.43.00', capitalGood: true, gainsPct: 0 },
  { kind: 'Palabra', input: 'gafas de sol', terms: ['gafas anteojos de sol', 'sunglasses'], code: '9004.10.00', capitalGood: false, gainsPct: 6 },
  { kind: 'Palabra', input: 'cafetera espresso eléctrica', terms: ['cafeteras espresso coffee maker', 'aparatos electrotérmicos café'], code: '8516.71.00', capitalGood: false, gainsPct: 6 },
  { kind: 'Palabra', input: 'mueble oficina metálico', terms: ['muebles de metal oficina', 'mueble oficina metálico'], code: '9403.10.00', capitalGood: true, gainsPct: 6 },
  { kind: 'Palabra', input: 'balanza electrónica industrial', terms: ['balanzas electrónicas industriales', 'aparatos instrumentos para pesar'], code: '8423.81.90', capitalGood: true, gainsPct: 6 },
]

describe('NCM_APP classification matrix from Alibaba/product words', () => {
  it.each(cases)('$kind · $input → $code with tariff filters', async (testCase) => {
    const result = await classifyFullNcm(index, fakeAi(testCase), { name: testCase.input, category: testCase.input })
    expect(result.status).toBe('candidate')
    expect(result.code).toBe(testCase.code)
    expect(result.tariff?.capitalGoodEligible).toBe(testCase.capitalGood)
    expect(result.tariff?.gainsPct).toBe(testCase.gainsPct)
    expect(result.tariff?.vatPct).toBeGreaterThan(0)
  })

  it('extracts NCM_APP tariff shape and Bien de Uso flag from a schema-4 row', () => {
    const row = index.records.find(([code]) => code === '9403.10.00')
    const tariff = tariffFromRecord(row)
    expect(tariff?.diePct).toBe(18)
    expect(tariff?.vatPct).toBe(21)
    expect(tariff?.gainsPct).toBe(6)
    expect(tariff?.capitalGoodEligible).toBe(true)
  })
})
