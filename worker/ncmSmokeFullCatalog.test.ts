import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { loadCanonicalSimParentLabels, reconcileNcmIndexLabels } from '../scripts/ncm-label-reconciliation.mjs'
import { classifyFullNcm, type NcmSearchIndex, type NcmProductFacts } from './ncmRetrieval'

const raw = JSON.parse(readFileSync('public/data/ncm-index.json', 'utf8'))
const { labelsByCode, sourceDate } = loadCanonicalSimParentLabels('public/data/sim')
const index = reconcileNcmIndexLabels(raw, labelsByCode, sourceDate) as NcmSearchIndex
// Read the actual production fixtures without executing their authenticated HTTP runner.
const smoke = readFileSync('scripts/smoke-production-intake.mjs', 'utf8')
const fixtures = runInNewContext(smoke.match(/const classificationCases = (\[[\s\S]*?\n\])/ )![1]) as Array<{ name: string; facts: NcmProductFacts; expectedCode?: string; expectedPrefix?: string }>

describe('all production intake classifications with canonical catalog and AI offline', () => {
  it('records every fixture, including failures, without stopping after the first', async () => {
    const results = []
    for (const fixture of fixtures) {
      const ai = { run: vi.fn(async () => { throw new Error('AI unavailable') }) }
      const started = performance.now()
      const result = await classifyFullNcm(index, ai, fixture.facts)
      results.push({ durationMs: performance.now() - started, tariff: result.tariff, name: fixture.name, status: result.status, code: result.code, aiCalls: ai.run.mock.calls.length, expectedCode: fixture.expectedCode, expectedPrefix: fixture.expectedPrefix })
    }
    mkdirSync('work', { recursive: true })
    writeFileSync('work/ncm-smoke-offline-results.json', JSON.stringify(results, null, 2))
    expect(results).toHaveLength(20)
    for (const result of results) {
      expect.soft(result.status, result.name).toBe('candidate')
      expect.soft(result.aiCalls, result.name).toBe(0)
      if (result.expectedCode) expect.soft(result.code, result.name).toBe(result.expectedCode)
      if (result.expectedPrefix) expect.soft(result.code?.startsWith(result.expectedPrefix), result.name).toBe(true)
    }
  })
})


describe('principal article aliases and safety guards', () => {
  const offline = () => ({ run: vi.fn(async () => { throw new Error('AI unavailable') }) })
  it.each([
    'Paleta de pádel', 'Raqueta de pádel', 'Padel racket', 'Carbon fiber padel paddle',
    'Paletas de pádel', 'Raquetas de pádel', 'Padel rackets', 'Padel racquets',
    'Paleta de pádel con grip de repuesto', 'Paleta de pádel con funda incluida',
    'Padel racket with replacement grip',
  ])('classifies the racket without AI: %s', async name => {
    const ai = offline()
    const result = await classifyFullNcm(index, ai, { name })
    expect(result.code).toBe('9506.59.00')
    const row = index.records.find(record => record[0] === result.code)!
    expect(result.label).toBe(row[1])
    expect(result.tariff).toEqual({ aecPct: row[2], diePct: row[3], tePct: row[4], diiPct: row[5], vatPct: row[6], vatAdditionalPct: row[7], gainsPct: row[8], iibbPct: row[9], internalTax: row[10], capitalGoodEligible: Boolean(row[11]) })
    expect(ai.run).not.toHaveBeenCalled()
  })
  it.each([
    'Funda para paleta de pádel', 'Grip de repuesto para paleta de pádel',
    'Pelotas de pádel', 'Repuestos para raqueta de pádel', 'Padel racket replacement grip',
    'Padel racket bag', 'Padel racket protector', 'Muñequera pádel paleta', 'Padel racket cover', 'Padel racket strings', 'Raqueta de tenis',
    'Raqueta de tenis de mesa padel', 'Tenis de mesa', 'Artículos deportivos de pádel', 'Equipo deportivo',
  ])('does not promote an accessory or different sport to padel: %s', async name => {
    const result = await classifyFullNcm(index, offline(), { name, category: 'Padel racket', description: 'Paleta de pádel para uso deportivo' })
    expect(result.code).not.toBe('9506.59.00')
  })
  it.each([
    [{ name: 'Raqueta de tenis de mesa ping pong' }, '9506.51.00'],
    [{ name: 'Mochila de cuero con forro de poliéster', material: 'cuero y poliéster' }, '4202.92.00'],
    [{ name: 'Mochila', material: 'forro poliéster' }, '4202.92.00'],
    [{ name: 'Mochila', material: 'desconocido' }, '4202.92.00'],
    [{ name: 'Soporte de auriculares Bluetooth' }, '8518.30.00'],
    [{ name: 'Headphone stand' }, '8518.30.00'],
    [{ name: 'Organizador de mancuernas' }, '9506.91.00'],
    [{ name: 'Soporte de mancuernas' }, '9506.91.00'],
    [{ name: 'Funda para auriculares Bluetooth' }, '8518.30.00'],
    [{ name: 'Auriculares replacement earpads' }, '8518.30.00'],
    [{ name: 'Cafetera manual espresso' }, '8516.71.00'],
    [{ name: 'Cafetera eléctrica doméstica', functionText: 'No eléctrica, funciona a gas' }, '8516.71.00'],
    [{ name: 'Mochila de poliéster', functionText: 'Superficie exterior de cuero' }, '4202.92.00'],
    [{ name: 'Cafetera eléctrica doméstica', description: 'No eléctrica, funciona a gas' }, '8516.71.00'],
    [{ name: 'Mochila de poliéster', description: 'superficie exterior de cuero' }, '4202.92.00'],
    [{ name: 'Termotanque eléctrico', description: 'No eléctrico, funciona a gas' }, '8516.10.00'],
    [{ name: 'Cafetera eléctrica industrial' }, '8516.71.00'],
    [{ name: 'Termotanque a gas' }, '8516.10.00'],
    [{ name: 'Resistencia para termotanque eléctrico' }, '8516.10.00'],
    [{ name: 'Parlante Bluetooth portátil 10W', description: 'portable bluetooth speaker' }, '8518.21.00'],
    [{ name: 'Parlante Bluetooth', description: 'dos altavoces en caja, multiple drivers' }, '8518.21.00'],
    [{ name: 'Parlante Bluetooth', description: 'un solo altavoz sin caja' }, '8518.21.00'],
  ] as const)('does not shortcut unsupported construction: %j', async (facts, code) => {
    const result = await classifyFullNcm(index, offline(), facts)
    expect(result.code).not.toBe(code)
    if (facts.name === 'Raqueta de tenis de mesa ping pong') expect(result.code).toBe('9506.40.00')
    else expect(result.retrievalMode).not.toBe('deterministic_fallback')
  })
})
