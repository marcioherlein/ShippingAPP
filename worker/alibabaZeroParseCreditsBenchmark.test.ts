import { describe, expect, it, vi } from 'vitest'
import { extractAlibabaDirectHttp } from './alibabaDirectProvider'
import { requiredSelfFirstSignals, resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import type { NativeAlibabaResult } from './nativeAlibaba'
import type { ParsebotAlibabaResult } from './parsebotAlibaba'

const unavailableParsebot: ParsebotAlibabaResult = {
  status: 'unavailable',
  source: 'Parse.bot',
  facts: null,
  httpStatus: 402,
  warnings: ['Parse.bot credits exhausted.'],
}

const unavailableBrowser: NativeAlibabaResult = {
  status: 'unavailable',
  source: 'Cloudflare Browser Run JSON',
  facts: null,
  browserMsUsed: null,
  warnings: ['Browser unavailable.'],
}

const env: any = { BROWSER: { quickAction: async () => new Response('{}') } }

function shell(body: string, head = '') {
  return `<!doctype html><html><head>${head}</head><body>${body}${' wholesale supplier product detail '.repeat(30)}</body></html>`
}

type Fixture = {
  id: string
  title: string
  category: string
  price: number
  moq: number
  weight: string
  size: string
  origin: string
  hs: string
  material: string
  type: string
  variant: 'camel' | 'snake' | 'jsonparse' | 'nested' | 'visible'
}

const fixtures: Fixture[] = [
  { id: '1601666174891', title: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch', category: 'Mechanical Watches', price: 71.5, moq: 5, weight: '180 g', size: '12 x 10 x 8 cm', origin: 'China', hs: '910221', material: 'Stainless Steel', type: 'Wristwatch', variant: 'camel' },
  { id: '1601666174892', title: '2026 New 65W GaN PD Fast Charger Type C EU US Plug OEM Logo', category: 'GaN Chargers', price: 8.6, moq: 50, weight: '145 g', size: '11 x 8 x 5 cm', origin: 'Guangdong, China', hs: '850440', material: 'PC ABS', type: 'USB C Charger', variant: 'snake' },
  { id: '1601666174893', title: '12V 24V DC Brushless Mini Water Pump Quiet High Pressure OEM', category: 'Water Pumps', price: 12.4, moq: 20, weight: '0.42 kg', size: '140 x 95 x 85 mm', origin: 'Zhejiang, China', hs: '841370', material: 'Engineering Plastic', type: 'Brushless Water Pump', variant: 'jsonparse' },
  { id: '1601666174894', title: '28mm PCO PET Bottle Preform 18g 24g 32g Mineral Water Packaging', category: 'Bottle Preforms', price: 0.045, moq: 10000, weight: '24 g', size: '12 x 3 x 3 cm', origin: 'China', hs: '392330', material: 'PET', type: 'PET Preform', variant: 'nested' },
  { id: '1601666174895', title: 'Automatic 96 Eggs Poultry Incubator Chicken Duck Hatcher Digital Controller', category: 'Egg Incubators', price: 84, moq: 2, weight: '8.5 kg', size: '55 x 55 x 35 cm', origin: 'Henan, China', hs: '843621', material: 'ABS', type: 'Poultry Incubator', variant: 'visible' },
  { id: '1601666174896', title: 'HGR20 Linear Guide Rail HGH20CA Block CNC Router Motion System 1000mm', category: 'Linear Guides', price: 15.8, moq: 10, weight: '2.2 kg', size: '105 x 8 x 6 cm', origin: 'China', hs: '848790', material: 'Bearing Steel', type: 'Linear Guide Rail', variant: 'camel' },
  { id: '1601666174897', title: '40oz Vacuum Insulated Stainless Steel Tumbler With Handle Straw Custom Logo', category: 'Vacuum Flasks', price: 4.9, moq: 100, weight: '620 g', size: '31 x 11 x 11 cm', origin: 'Zhejiang, China', hs: '961700', material: '304 Stainless Steel', type: 'Vacuum Tumbler', variant: 'snake' },
  { id: '1601666174898', title: '18K Carbon Fiber Padel Racket 3K EVA Professional Beach Tennis Paddle OEM', category: 'Padel Rackets', price: 24.5, moq: 50, weight: '365 g', size: '47 x 28 x 5 cm', origin: 'China', hs: '950659', material: 'Carbon Fiber', type: 'Padel Racket', variant: 'jsonparse' },
  { id: '1601666174899', title: 'TPE EVA Non Slip Yoga Mat 6mm Eco Friendly Exercise Fitness Mat Custom Print', category: 'Yoga Mats', price: 3.7, moq: 100, weight: '0.9 kg', size: '63 x 15 x 15 cm', origin: 'Jiangsu, China', hs: '950691', material: 'TPE', type: 'Yoga Mat', variant: 'nested' },
  { id: '1601666174900', title: 'Samsung LM301H 650W Full Spectrum LED Grow Light Bar Indoor Hydroponic Plant', category: 'Grow Lights', price: 128, moq: 5, weight: '8.2 kg', size: '112 x 35 x 15 cm', origin: 'Guangdong, China', hs: '940542', material: 'Aluminum', type: 'LED Grow Light', variant: 'visible' },
  { id: '1601666174901', title: 'Mini Rice Mill Machine Paddy Husker Grain Polisher 6N40 Combined Household', category: 'Rice Mills', price: 210, moq: 1, weight: '78 kg', size: '90 x 55 x 95 cm', origin: 'Hunan, China', hs: '843780', material: 'Steel', type: 'Rice Milling Machine', variant: 'camel' },
  { id: '1601666174902', title: 'CNC Adjustable Motorcycle Brake Clutch Lever Set For Yamaha Honda Kawasaki OEM', category: 'Motorcycle Levers', price: 6.3, moq: 50, weight: '320 g', size: '24 x 12 x 5 cm', origin: 'China', hs: '871410', material: 'Aluminum Alloy', type: 'Motorcycle Brake Lever', variant: 'snake' },
  { id: '1601666174903', title: 'Food Grade Silicone Chocolate Mold 3D Custom Candy Soap Baking Mould', category: 'Baking Molds', price: 1.2, moq: 200, weight: '160 g', size: '25 x 18 x 3 cm', origin: 'Guangdong, China', hs: '392410', material: 'Silicone', type: 'Baking Mold', variant: 'jsonparse' },
  { id: '1601666174904', title: '58mm Bluetooth Thermal Receipt Printer Portable POS Android iOS Rechargeable', category: 'Thermal Printers', price: 18.9, moq: 20, weight: '0.48 kg', size: '16 x 12 x 8 cm', origin: 'China', hs: '844332', material: 'ABS', type: 'Thermal Printer', variant: 'nested' },
  { id: '1601666174905', title: '801D Battery Spot Welder Pulse Welding Machine Lithium Nickel Strip 220V', category: 'Spot Welders', price: 72, moq: 2, weight: '5.8 kg', size: '40 x 30 x 25 cm', origin: 'Guangdong, China', hs: '851580', material: 'Metal', type: 'Spot Welding Machine', variant: 'visible' },
  { id: '1601666174906', title: 'Clear Acrylic Counter Display Stand Custom Retail Cosmetic Product Riser', category: 'Display Stands', price: 4.2, moq: 100, weight: '0.75 kg', size: '32 x 22 x 12 cm', origin: 'China', hs: '392690', material: 'Acrylic', type: 'Display Stand', variant: 'camel' },
  { id: '1601666174907', title: 'PP Spunbond Nonwoven Fabric Roll 25gsm 1.6m Width Medical Agricultural', category: 'Nonwoven Fabric', price: 1.65, moq: 1000, weight: '18 kg', size: '165 x 25 x 25 cm', origin: 'Fujian, China', hs: '560312', material: 'Polypropylene', type: 'Nonwoven Fabric Roll', variant: 'snake' },
  { id: '1601666174908', title: 'Si3N4 Ceramic Ball Bearing 608 Hybrid High Speed Skateboard Electric Motor', category: 'Ball Bearings', price: 2.8, moq: 100, weight: '22 g', size: '4 x 4 x 2 cm', origin: 'China', hs: '848210', material: 'Ceramic Steel', type: 'Ball Bearing', variant: 'jsonparse' },
  { id: '1601666174909', title: '2 Way Normally Closed Brass Solenoid Valve 12V 24V DC Water Air 1 2 Inch', category: 'Solenoid Valves', price: 5.4, moq: 50, weight: '0.56 kg', size: '10 x 8 x 7 cm', origin: 'Zhejiang, China', hs: '848180', material: 'Brass', type: 'Solenoid Valve', variant: 'nested' },
  { id: '1601666174910', title: 'MPPT 60A Solar Charge Controller 12V 24V 48V LCD Lithium Lead Acid Battery', category: 'Solar Controllers', price: 31, moq: 10, weight: '1.25 kg', size: '24 x 18 x 8 cm', origin: 'Guangdong, China', hs: '850440', material: 'Aluminum ABS', type: 'Solar Charge Controller', variant: 'visible' },
]

function specs(f: Fixture) {
  return [
    { name: 'Place of Origin', value: f.origin },
    { name: 'Material', value: f.material },
    { name: 'Product Type', value: f.type },
  ]
}

function fixtureHtml(f: Fixture) {
  if (f.variant === 'camel') {
    return shell(`<script>window.__INITIAL_STATE__ = ${JSON.stringify({ product: {
      productId: f.id, productTitle: f.title, productType: f.category,
      categoryPath: ['Industrial & Consumer Products', f.category], priceValue: f.price, moq: f.moq,
      unitWeight: f.weight, unitSize: f.size, hsCode: f.hs, specifications: specs(f),
    } })};</script>`)
  }
  if (f.variant === 'snake') {
    return shell(`<script type="application/json">${JSON.stringify({ product: {
      product_id: f.id, product_title: f.title, product_type: f.category,
      category_path: ['Products', f.category], price_tiers: [{ min_quantity: f.moq, unit_price: f.price }],
      package_weight: f.weight, package_dimensions: f.size, hs_code: f.hs, attributes: specs(f),
    } })}</script>`)
  }
  if (f.variant === 'jsonparse') {
    const state = JSON.stringify({ product: {
      product_id: f.id, product_title: f.title, product_type: f.category,
      category_path: ['Alibaba', f.category], price_tiers: [{ min_quantity: f.moq, price_value: f.price }],
      unit_weight: f.weight, unit_size: f.size, hs_code: f.hs, specifications: specs(f),
    } })
    return shell(`<script>window.__STATE__ = JSON.parse(${JSON.stringify(state)});</script>`)
  }
  if (f.variant === 'nested') {
    const nested = JSON.stringify({
      productId: f.id, productTitle: f.title, productType: f.category, categoryPath: ['Products', f.category],
      minOrderQuantity: f.moq, unitPrice: f.price, grossWeight: f.weight, packingSize: f.size,
      hsCode: f.hs, productAttributes: specs(f),
    })
    return shell(`<script type="application/json">${JSON.stringify({ bootstrap: nested })}</script>`)
  }
  return shell(
    `<nav class="product-breadcrumb"><a>Home</a><a>Products</a><a>${f.category}</a></nav>
     <div>FOB Price: US $${f.price} / piece</div>
     <div>Minimum Order Quantity: ${f.moq} pieces</div>
     <div>Package Weight: ${f.weight}</div>
     <div>Package Dimensions: ${f.size}</div>
     <div>Place of Origin: ${f.origin}</div>
     <div>Material: ${f.material}</div>
     <div>Product Type: ${f.type}</div>
     <script type="application/json">${JSON.stringify({ productId: f.id, productTitle: f.title, hsCode: f.hs })}</script>`,
    `<meta property="og:title" content="${f.title.replace(/"/g, '&quot;')}">`,
  )
}

function directReaderFor(f: Fixture) {
  const html = fixtureHtml(f)
  return (url: URL) => extractAlibabaDirectHttp(
    url,
    async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    async () => ({ status: 'unavailable', source: 'Alibaba public listing', facts: null, warnings: ['not needed'] } as any),
    async () => ({ status: 'unavailable', source: 'Alibaba high-signal public corroboration', facts: null, warnings: ['not needed'] } as any),
  )
}

describe('Alibaba zero-Parse-credit benchmark', () => {
  it('completes 20/20 heterogeneous Alibaba fixtures without calling Parse.bot or Browser Run', async () => {
    let passed = 0
    for (const f of fixtures) {
      const url = new URL(`https://www.alibaba.com/product-detail/${encodeURIComponent(f.title.replace(/\s+/g, '-'))}_${f.id}.html`)
      const parsebotReader = vi.fn(async () => unavailableParsebot)
      const nativeReader = vi.fn(async () => unavailableBrowser)
      const result = await resolveAlibabaSelfFirst(url, env, {
        directReader: directReaderFor(f),
        parsebotReader,
        nativeReader,
      })

      const signals = requiredSelfFirstSignals(result)
      if (signals === 7) passed += 1
      expect(signals, `${f.title} should expose all seven required ficha signals`).toBe(7)
      expect(result.product.name).toContain(f.title.slice(0, 24))
      expect(result.product.category).toBe(f.category)
      expect(result.product.unitPriceUsd).toBeCloseTo(f.price, 4)
      expect(result.product.moq).toBe(f.moq)
      expect(result.product.packedWeightKg).toBeGreaterThan(0)
      expect(result.product.volumeCbm).toBeGreaterThan(0)
      expect(result.product.originCountry).toBe(f.origin)
      expect(result.sourceEvidence?.directAlibaba?.hsCode).toBe(f.hs)
      expect(parsebotReader).not.toHaveBeenCalled()
      expect(nativeReader).not.toHaveBeenCalled()
    }
    console.info(`ZERO_PARSE_COMPLETE_SUCCESS_RATE=${passed}/${fixtures.length} (${((passed / fixtures.length) * 100).toFixed(1)}%)`)
    expect(passed).toBe(fixtures.length)
  })

  it('survives HTTP 402 from Parse.bot after both first-party readers are incomplete and preserves a completable ficha', async () => {
    const f = fixtures[0]
    const url = new URL(`https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_${f.id}.html`)
    const incompleteHtml = shell(
      `<script type="application/json">${JSON.stringify({
        productId: f.id,
        productTitle: f.title,
        productType: f.category,
        priceValue: f.price,
        moq: f.moq,
      })}</script>`,
    )
    const directReader = (target: URL) => extractAlibabaDirectHttp(
      target,
      async () => new Response(incompleteHtml, { status: 200 }),
      async () => ({ status: 'unavailable', source: 'Alibaba public listing', facts: null, warnings: [] } as any),
      async () => ({ status: 'unavailable', source: 'Alibaba high-signal public corroboration', facts: null, warnings: [] } as any),
    )
    const parsebotReader = vi.fn(async () => unavailableParsebot)
    const nativeReader = vi.fn(async () => unavailableBrowser)
    const result = await resolveAlibabaSelfFirst(url, env, { directReader, parsebotReader, nativeReader })

    expect(nativeReader).toHaveBeenCalledTimes(1)
    expect(parsebotReader).toHaveBeenCalledTimes(1)
    expect(result.product.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.product.category).toBe('Mechanical Watches')
    expect(result.product.unitPriceUsd).toBe(71.5)
    expect(result.product.moq).toBe(5)
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(result.product.originCountry).toBe('')
    expect(requiredSelfFirstSignals(result)).toBe(4)
    expect(result.assumptions.join(' ')).toContain('credits exhausted')
    expect(result.assumptions.join(' ')).toContain('ficha obligatoria')
  })

  it('never substitutes supplier country, guessed logistics or random page numbers when zero-credit scraping is incomplete', async () => {
    const url = new URL('https://www.alibaba.com/product-detail/Industrial-Sensor_1601666174999.html')
    const html = shell(`<script type="application/json">${JSON.stringify({
      productId: '1601666174999',
      productTitle: 'Industrial Sensor 24V',
      productType: 'Industrial Sensor',
      supplierCountry: 'CN',
      supplierYears: 16,
      responseRate: 99,
      discount: 30,
    })}</script>`)
    const directReader = (target: URL) => extractAlibabaDirectHttp(
      target,
      async () => new Response(html, { status: 200 }),
      async () => ({ status: 'unavailable', source: 'Alibaba public listing', facts: null, warnings: [] } as any),
      async () => ({ status: 'unavailable', source: 'Alibaba high-signal public corroboration', facts: null, warnings: [] } as any),
    )
    const result = await resolveAlibabaSelfFirst(url, env, {
      directReader,
      nativeReader: async () => unavailableBrowser,
      parsebotReader: async () => unavailableParsebot,
    })

    expect(result.product.originCountry).toBe('')
    expect(result.product.unitPriceUsd).toBeNull()
    expect(result.product.moq).toBeNull()
    expect(result.product.packedWeightKg).toBe(0)
    expect(result.product.volumeCbm).toBe(0)
    expect(requiredSelfFirstSignals(result)).toBe(2)
  })
})
