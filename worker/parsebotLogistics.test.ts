import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractAlibabaWithParsebot } from './parsebotAlibaba'

const reportedUrl = new URL('https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html')

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function facts(product: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: {
    product_id: '1601389995797', title: 'Basketball inner-bladder making machine', ...product,
  } }), { status: 200 })))
  const result = await extractAlibabaWithParsebot(reportedUrl, { PARSEBOT_API_KEY: 'test-key' })
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error('Expected usable product identity')
  return result.facts
}

describe('Parse.bot supplier logistics evidence', () => {
  it('does not turn the reported bare machine dimensions into 1015.3 m³', async () => {
    const result = await facts({ shipping_info: { unit_size: '500X1430X1420' } })
    expect(result.volumeCbm).toBeNull()
    expect(result.unitSize).toBe('500X1430X1420')
    expect(result.supplierEvidence?.volumeText).toBe('500X1430X1420')
  })

  it.each([
    ['500X1430X1420 mm', 1.0153],
    ['50 x 143 x 142 cm', 1.0153],
    ['0.5m x 1.43m x 1.42m', 1.0153],
    ['500×1430×1420mm', 1.0153],
    ['36X25.5X6 cm', 0.005508],
    ['1 x 1 x 1 mm', 0.000000001],
  ])('converts explicitly declared dimensions %s', async (unit_size, expected) => {
    expect((await facts({ shipping_info: { unit_size } })).volumeCbm).toBeCloseTo(expected, 12)
  })

  it('accepts a declared unit next to the dimensions field', async () => {
    const result = await facts({ shipping_info: { unit_size: '500X1430X1420', dimensions_unit: 'mm' } })
    expect(result.volumeCbm).toBeCloseTo(1.0153, 12)
    expect(result.unitSize).toBe('500X1430X1420')
  })

  it('preserves dimension objects without inferring their missing unit', async () => {
    const result = await facts({ packaging: { dimensions: { length: 500, width: 1430, height: 1420 } } })
    expect(result.volumeCbm).toBeNull()
    expect(result.unitSize).toBe('500 x 1430 x 1420')
    expect(result.supplierEvidence?.volumeText).toBe('500 x 1430 x 1420')
  })

  it('converts dimension objects only when they declare a supported unit', async () => {
    const result = await facts({ packaging: { dimensions: { length: 500, width: 1430, height: 1420, unit: 'mm' } } })
    expect(result.volumeCbm).toBeCloseTo(1.0153, 12)
    expect(result.unitSize).toBe('500 x 1430 x 1420 mm')
  })

  it.each(['10 cm x 20 mm x 30 cm', '10 x 20 x 30 inches'])('keeps ambiguous or unsupported dimension units pending: %s', async (unit_size) => {
    expect((await facts({ unit_size })).volumeCbm).toBeNull()
  })

  it('rejects conflicting field and text dimension units', async () => {
    expect((await facts({ unit_size: '500X1430X1420 cm', dimensions_unit: 'mm' })).volumeCbm).toBeNull()
  })

  it('does not substitute a generic or net product weight for packed freight weight', async () => {
    const result = await facts({ net_weight: 2800, weight_kg: 2800 })
    expect(result.packedWeightKg).toBeNull()
    expect(result.supplierEvidence?.weightText).toBe('2800')
    expect(result.supplierEvidence?.weightSource).toContain('confirmar el peso embalado')
  })

  it('prefers declared package weight over the product unit weight', async () => {
    const result = await facts({ unit_weight: '2800 kg', packaging: { package_weight: '3000 kg' } })
    expect(result.packedWeightKg).toBe(3000)
    expect(result.supplierEvidence?.weightText).toBe('3000 kg')
  })

  it('preserves the provider shipping unit-weight kg convention', async () => {
    const result = await facts({ shipping_info: { unit_weight: '3.0' } })
    expect(result.packedWeightKg).toBe(3)
    expect(result.supplierEvidence?.weightText).toBe('3.0')
  })
})
