import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { retrieveNcmCandidates, type NcmProductFacts, type NcmSearchIndex } from './ncmRetrieval'

const index = JSON.parse(
  fs.readFileSync(new URL('../public/data/ncm-index.json', import.meta.url), 'utf8'),
) as NcmSearchIndex

type CorpusCase = {
  label: string
  alibabaTitle: string
  sourceUrl: string
  facts: NcmProductFacts
  searchTerms: string[]
  expectedPrefix: string
  expectedExact?: string
}

// Real Alibaba-style commercial titles are deliberately paired with Spanish
// customs vocabulary, which is what the AI expansion stage is constrained to
// produce. This test validates the deterministic retrieval layer underneath AI.
const cases: CorpusCase[] = [
  {
    label: 'padel-carbon-12k',
    alibabaTitle: 'OEM Spain Popular 12k Carbon Diamond Shape Padel Rackets',
    sourceUrl: 'https://www.alibaba.com/product-detail/OEM-Spain-Popular-12k-Carbon-Diamond_1600089608706.html',
    facts: { name: 'Paleta de pádel 12K carbono forma diamante', category: 'Paleta de pádel', material: 'fibra de carbono', functionText: 'raqueta deportiva para jugar pádel' },
    searchTerms: ['raqueta de padel', 'raqueta similar', 'articulo para deporte'],
    expectedPrefix: '9506',
    expectedExact: '9506.59.00',
  },
  {
    label: 'gan-usbc-charger-65w',
    alibabaTitle: '65W GaN 2-Port Compact Wall Charger EU US USB C Fast Charger',
    sourceUrl: 'https://www.alibaba.com/showroom/65w-gan-charger.html',
    facts: { name: 'Cargador GaN USB-C 65W', category: 'Adaptador de corriente', functionText: 'convierte corriente alterna de red a corriente continua USB-C' },
    searchTerms: ['convertidor electrico estatico', 'fuente de alimentacion', 'adaptador de corriente'],
    expectedPrefix: '8504.40',
    expectedExact: '8504.40.90',
  },
  {
    label: 'vacuum-flask-stainless-500ml',
    alibabaTitle: '500ml Double Wall Stainless Steel Thermal Vacuum Flask',
    sourceUrl: 'https://www.alibaba.com/showroom/500ml-vacuum-flask.html',
    facts: { name: 'Termo de acero inoxidable 500 ml', category: 'Termo', material: 'acero inoxidable', functionText: 'recipiente isotermico al vacio para bebidas' },
    searchTerms: ['termo', 'recipiente isotermico', 'recipiente al vacio'],
    expectedPrefix: '9617',
    expectedExact: '9617.00.10',
  },
  {
    label: 'tws-bluetooth-earbuds',
    alibabaTitle: 'Wireless In-Ear BT5.3 Noise Cancelling 48H TWS Earbuds',
    sourceUrl: 'https://www.alibaba.com/showroom/tws-bluetooth-earbuds.html',
    facts: { name: 'Auriculares TWS Bluetooth 5.3', category: 'Auriculares', functionText: 'reproduccion de audio inalambrica intraaural' },
    searchTerms: ['auriculares', 'audifonos', 'auriculares combinados con microfono'],
    expectedPrefix: '8518',
  },
  {
    label: 'mini-crawler-excavator-1t',
    alibabaTitle: 'Mini Crawler Excavator 1 Ton Mini Small Digger',
    sourceUrl: 'https://www.alibaba.com/showroom/1-ton-mini-excavator.html',
    facts: { name: 'Mini excavadora sobre orugas 1 tonelada', category: 'Excavadora', functionText: 'maquina autopropulsada para excavar y mover tierra' },
    searchTerms: ['excavadora', 'maquina autopropulsada', 'excavadora sobre orugas'],
    expectedPrefix: '8429',
  },
  {
    label: 'ionic-hair-dryer-2000w',
    alibabaTitle: 'Professional Negative Ionic Hair Dryer 2000W',
    sourceUrl: 'https://www.alibaba.com/showroom/2000w-hair-dryer.html',
    facts: { name: 'Secador de cabello ionico 2000W', category: 'Secador de cabello', functionText: 'aparato electrotermico para secar cabello' },
    searchTerms: ['secador de cabello', 'secador para el cabello', 'aparato electrotermico'],
    expectedPrefix: '8516.31',
    expectedExact: '8516.31.00',
  },
  {
    label: 'household-sewing-machine',
    alibabaTitle: 'Portable Mini Electric Household Sewing Machine 12 Stitch',
    sourceUrl: 'https://www.alibaba.com/showroom/household-sewing-machine.html',
    facts: { name: 'Maquina de coser electrica domestica portatil', category: 'Maquina de coser', functionText: 'coser tejidos en el hogar' },
    searchTerms: ['maquina de coser', 'maquina de coser domestica'],
    expectedPrefix: '8452',
  },
  {
    label: 'cordless-brushless-drill-20v',
    alibabaTitle: '20V Lithium Battery Brushless Impact Drill 13mm',
    sourceUrl: 'https://www.alibaba.com/showroom/20v-cordless-drill.html',
    facts: { name: 'Taladro de impacto inalambrico 20V brushless 13mm', category: 'Herramienta electrica de mano', functionText: 'taladrar mediante motor electrico incorporado' },
    searchTerms: ['taladro de mano', 'herramienta con motor electrico incorporado', 'taladro electrico'],
    expectedPrefix: '8467',
  },
  {
    label: 'stainless-kitchen-sink',
    alibabaTitle: 'High Quality SUS304 Stainless Steel Kitchen Sink',
    sourceUrl: 'https://www.alibaba.com/showroom/stainless-steel-kitchen-sink.html',
    facts: { name: 'Pileta fregadero cocina SUS304', category: 'Fregadero de cocina', material: 'acero inoxidable', functionText: 'fregadero sanitario fijo para cocina' },
    searchTerms: ['fregadero de acero inoxidable', 'pileta de acero inoxidable', 'articulos sanitarios de acero'],
    expectedPrefix: '7324',
  },
  {
    label: 'deep-groove-ball-bearing-6204',
    alibabaTitle: '6204 ZZ Deep Groove Ball Bearing',
    sourceUrl: 'https://www.alibaba.com/showroom/6204-deep-groove-ball-bearing.html',
    facts: { name: 'Rodamiento rigido de bolas 6204 ZZ', category: 'Rodamiento', functionText: 'rodamiento radial de bolas para eje' },
    searchTerms: ['rodamiento de bolas', 'rodamiento radial', 'cojinete de bolas'],
    expectedPrefix: '8482',
  },
  {
    label: 'electric-kettle-17l',
    alibabaTitle: '1.7L Stainless Steel Electric Thermo Temperature Control Kettle 2200W',
    sourceUrl: 'https://www.alibaba.com/showroom/1.7l-electric-kettle.html',
    facts: { name: 'Hervidor electrico acero inoxidable 1.7L 2200W', category: 'Hervidor electrico', functionText: 'aparato electrotermico domestico para calentar y hervir agua' },
    searchTerms: ['hervidor electrico', 'aparato electrotermico domestico', 'calentar agua'],
    expectedPrefix: '8516',
  },
  {
    label: 'pet-bottle-preform',
    alibabaTitle: '500ml PET Preform for Water Detergent Bottle',
    sourceUrl: 'https://www.alibaba.com/showroom/pet-bottle-preform.html',
    facts: { name: 'Preforma PET para botella 500 ml', category: 'Preforma para envase', material: 'PET plastico', functionText: 'preforma para fabricar botella mediante soplado' },
    searchTerms: ['preforma de plastico', 'preforma para botella', 'articulo para envase de plastico'],
    expectedPrefix: '3923',
  },
  {
    label: 'lifepo4-battery-pack-48v',
    alibabaTitle: 'OEM 48V LiFePO4 Lithium Battery Pack IP65',
    sourceUrl: 'https://www.alibaba.com/showroom/48v-lifepo4-battery-pack.html',
    facts: { name: 'Bateria LiFePO4 48V', category: 'Bateria recargable', material: 'litio hierro fosfato', functionText: 'acumulador electrico recargable de ion litio' },
    searchTerms: ['acumulador de ion de litio', 'bateria de ion litio', 'acumulador electrico'],
    expectedPrefix: '8507.60',
    expectedExact: '8507.60.00',
  },
  {
    label: 'ceramic-mug-11oz',
    alibabaTitle: '11oz Blank Ceramic Sublimation Mug',
    sourceUrl: 'https://www.alibaba.com/showroom/11oz-ceramic-mug.html',
    facts: { name: 'Taza de ceramica 11 oz para sublimacion', category: 'Vajilla de ceramica', material: 'ceramica no porcelana', functionText: 'taza para beber' },
    searchTerms: ['vajilla de ceramica', 'taza de ceramica', 'articulos de mesa de ceramica'],
    expectedPrefix: '6912',
  },
  {
    label: 'solar-inverter-5kw',
    alibabaTitle: '5kW Solar Inverter 48V DC 220V AC Pure Sine Wave',
    sourceUrl: 'https://www.alibaba.com/showroom/5kw-solar-inverter.html',
    facts: { name: 'Inversor solar 5kW 48V DC a 220V AC', category: 'Inversor electrico', functionText: 'convertidor electrico estatico que convierte corriente continua en alterna' },
    searchTerms: ['convertidor electrico estatico', 'inversor electrico', 'convertidor corriente continua alterna'],
    expectedPrefix: '8504.40',
    expectedExact: '8504.40.90',
  },
]

describe('real Alibaba commercial-title NCM retrieval corpus', () => {
  for (const item of cases) {
    it(`${item.label}: retrieves the expected customs family without synthetic codes`, () => {
      const candidates = retrieveNcmCandidates(index, item.searchTerms, item.facts, 25)
      const codes = candidates.map((candidate) => candidate.code)
      expect(candidates.length, `${item.label} produced no shortlist`).toBeGreaterThan(0)
      expect(codes.some((code) => code.startsWith(item.expectedPrefix)), `${item.label}: ${codes.slice(0, 10).join(', ')}`).toBe(true)
      if (item.expectedExact) {
        expect(codes, `${item.label}: exact code absent from shortlist`).toContain(item.expectedExact)
      }
      expect(codes.every((code) => index.records.some(([allowed]) => allowed === code))).toBe(true)
    })
  }

  it('keeps exact-code confidence separate from heading-level retrieval', () => {
    const ambiguous = cases.filter((item) => !item.expectedExact)
    expect(ambiguous.length).toBeGreaterThan(0)
    expect(ambiguous.every((item) => item.expectedPrefix.length <= 7)).toBe(true)
  })
})
