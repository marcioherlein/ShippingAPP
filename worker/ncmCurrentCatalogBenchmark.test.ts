import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyFullNcm, type NcmSearchIndex } from './ncmRetrieval'

const index = JSON.parse(readFileSync('public/data/ncm-index.json', 'utf8')) as NcmSearchIndex
const aiUnavailable = { run: async () => { throw new Error('benchmark: AI intentionally unavailable') } }

type PositiveCase = { title: string; expected: string }

// Marketplace-style English titles intentionally include common Alibaba noise:
// marketing adjectives, OEM/ODM wording, model specs and inconsistent naming.
// The benchmark runs with AI disabled, so a pass proves product identity + the
// current NCM_APP snapshot can resolve the code without a model rescue.
const positiveCases: PositiveCase[] = [
  { title: '2026 New Arrival OEM ODM Professional Custom 12K Carbon Fiber Paddle Racket for Padel Tennis', expected: '9506.59.00' },
  { title: 'Factory Direct 65W GaN USB C PD3.0 QC4.0 Fast Wall Charger Power Adapter EU Plug', expected: '8504.40.90' },
  { title: '11.1V Rechargeable 18650 Lithium Ion Battery Pack with BMS OEM Custom', expected: '8507.60.00' },
  { title: 'Unlocked Android 5G Smartphone Dual SIM Mobile Phone 8GB 256GB Global Version', expected: '8517.13.00' },
  { title: 'Dimmable LED Desk Lamp Table Reading Light USB Touch Control Modern Office', expected: '9405.21.00' },
  { title: 'Waterproof Polyester Travel Backpack School Bag Laptop Rucksack Wholesale', expected: '4202.92.00' },
  { title: '14 inch Intel Notebook Laptop Computer Slim Portable PC OEM', expected: '8471.30.19' },
  { title: 'USB C to USB C Fast Charging Cable 2m with Connectors Braided 100W', expected: '8544.42.00' },
  { title: '100% Cotton Blank Crew Neck T Shirt Unisex Private Label OEM', expected: '6109.10.00' },
  { title: 'Breathable Textile Upper Running Sports Shoes Lightweight Sneakers', expected: '6404.11.00' },
  { title: '12 inch Electric Table Fan 45W Quiet Desk Fan Home Office', expected: '8414.51.10' },
  { title: 'Electric Countertop Oven 30L Baking Cooker Home Kitchen Appliance', expected: '8516.60.00' },
  { title: '100% Cotton Terry Bath Towel Hotel Towel 500GSM Wholesale', expected: '6302.60.00' },
  { title: 'Ceramic Dinner Plate Bowl Mug Tableware Set Restaurant Household', expected: '6912.00.00' },
  { title: 'Reverse Osmosis Household Water Filter Purifier 5 Stage RO System', expected: '8421.21.00' },
  { title: 'Handheld Percussion Massage Gun Muscle Massager Deep Tissue Fitness', expected: '9019.10.00' },
  { title: 'Stainless Steel Kitchen Mixing Bowl Household Set Food Prep', expected: '7323.93.00' },
  { title: 'Bluetooth 5.3 TWS Wireless Earbuds Headphones with Microphone Charging Case', expected: '8518.30.00' },
  { title: 'Portable Bluetooth Speaker Wireless Loudspeaker Mini Outdoor Audio', expected: '8518.21.00' },
  { title: 'Professional Carbon Badminton Racket Lightweight Racquet Tournament Wholesale', expected: '9506.59.00' },
  { title: 'Portable Blender USB Rechargeable Smoothie Juice Mixer Cup', expected: '8509.40.50' },
  { title: 'Pet Grooming Vacuum Cleaner Dog Hair Suction Kit Home Electric', expected: '8508.11.00' },
  { title: 'Polarized UV400 Fashion Sunglasses Unisex Wholesale Custom Logo', expected: '9004.10.00' },
  { title: 'Electric Espresso Coffee Maker Machine 15 Bar Home Cappuccino', expected: '8516.71.00' },
  { title: '550W Mono Photovoltaic Solar Panel PV Module Half Cell', expected: '8541.43.00' },
  { title: 'Professional Graphite Tennis Racket Racquet 27 Inch Carbon Adult', expected: '9506.51.00' },
  { title: '2.4G Wireless Computer Keyboard Slim USB Receiver Office', expected: '8471.60.52' },
  { title: 'Ergonomic Wireless Mouse Optical Computer Mouse USB 2.4G', expected: '8471.60.53' },
  { title: 'Stainless Steel Vacuum Flask Insulated Bottle Thermos 1L', expected: '9617.00.10' },
  { title: '80L Electric Water Heater Storage Tank Wall Mounted Home', expected: '8516.10.00' },
]

describe('current NCM_APP deterministic marketplace benchmark', () => {
  it('uses the 2026-08-27 NCM_APP snapshot as the benchmark catalog', () => {
    expect(index.meta.source).toBe('NCM_APP.xlsx')
    expect(index.meta.sourceDate).toBe('2026-08-27')
    expect(index.meta.indexSchema).toBe(4)
    expect(index.meta.recordCount).toBeGreaterThanOrEqual(10500)
    expect(index.records.length).toBeGreaterThanOrEqual(10500)
  })

  it('contains every exact NCM used by the marketplace benchmark', () => {
    const available = new Set(index.records.map(([code]) => code))
    const missing = [...new Set(positiveCases.map((sample) => sample.expected))].filter((code) => !available.has(code))
    expect(missing).toEqual([])
  })

  it('classifies 30/30 noisy English Alibaba-style product titles with AI disabled', async () => {
    const failures: Array<{ title: string; expected: string; actual: string | null; status: string }> = []
    for (const sample of positiveCases) {
      const result = await classifyFullNcm(index, aiUnavailable, { name: sample.title, description: sample.title })
      if (result.status !== 'candidate' || result.code !== sample.expected) {
        failures.push({ title: sample.title, expected: sample.expected, actual: result.code, status: result.status })
      }
    }
    console.info(`[NCM benchmark] exact English marketplace classification: ${positiveCases.length - failures.length}/${positiveCases.length}`)
    expect(failures).toEqual([])
  })

  const adversarialCases = [
    { title: 'Padel Racket Protective Cover Bag Only', forbidden: '9506.59.00' },
    { title: 'Phone Protective Case TPU Without Electronics', forbidden: '8517.13.00' },
    { title: 'LED Desk Lamp Shade Replacement Only', forbidden: '9405.21.00' },
    { title: 'Backpack Zipper Replacement Accessory', forbidden: '4202.92.00' },
    { title: 'Tennis Racket Replacement Grommet Part Only', forbidden: '9506.51.00' },
  ]

  for (const sample of adversarialCases) {
    it(`does not classify an accessory as its parent product: ${sample.title}`, async () => {
      const result = await classifyFullNcm(index, aiUnavailable, { name: sample.title, description: sample.title })
      expect(result.code).not.toBe(sample.forbidden)
    })
  }

  it('classifies a charging cable as a cable, not as the charger named in negative text', async () => {
    const result = await classifyFullNcm(index, aiUnavailable, { name: 'USB C Charging Cable 2m No Power Adapter' })
    expect(result.status).toBe('candidate')
    expect(result.code).toBe('8544.42.00')
    expect(result.code).not.toBe('8504.40.90')
  })

  it('fails closed for marketing text with no objective product identity', async () => {
    const result = await classifyFullNcm(index, aiUnavailable, { name: 'Hot Sale New Product 2026 Best Quality OEM ODM' })
    expect(result.status).toBe('missing')
    expect(result.code).toBeNull()
  })

  it('does not preserve the stale projector code removed from the current NCM_APP snapshot', async () => {
    const available = new Set(index.records.map(([code]) => code))
    expect(available.has('8528.69.00')).toBe(false)
    const result = await classifyFullNcm(index, aiUnavailable, { name: 'Mini Projector 1080P Portable Home Theater LED Video Projector' })
    expect(result.code).not.toBe('8528.69.00')
  })
})
