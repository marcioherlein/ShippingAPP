import { describe, expect, it, vi } from 'vitest'
import { parseAnalystModelResponse, runImportAnalyst, validateAnalystRequest } from './importAnalyst'

describe('AI Import Analyst boundaries', () => {
  it('rejects an empty question', () => {
    expect(validateAnalystRequest({ message: '   ' }).ok).toBe(false)
  })

  it('whitelists only demand and capital scenario mutations', () => {
    const parsed = parseAnalystModelResponse(JSON.stringify({
      answer: 'Probemos el escenario.',
      scenarioPatch: {
        monthlyDemand: 22.6,
        capitalAvailableUsd: 15000,
        marketPriceArs: 999999,
        dutyRatePct: 0,
        usdArs: 1,
      },
      actionReason: 'Recalcular con supuestos del usuario.',
    }))
    expect(parsed.scenarioPatch).toEqual({ monthlyDemand: 23, capitalAvailableUsd: 15000 })
    expect((parsed.scenarioPatch as any).marketPriceArs).toBeUndefined()
    expect((parsed.scenarioPatch as any).dutyRatePct).toBeUndefined()
    expect((parsed.scenarioPatch as any).usdArs).toBeUndefined()
  })

  it('drops invalid or absurd scenario values rather than clamping them into a plausible case', () => {
    const parsed = parseAnalystModelResponse({
      answer: 'No aplicar.',
      scenarioPatch: { monthlyDemand: -10, capitalAvailableUsd: 2_000_000_000 },
    })
    expect(parsed.scenarioPatch).toBeNull()
  })

  it('sanitizes context before it reaches the model', async () => {
    const run = vi.fn(async (_model: string, input: any) => {
      const serialized = JSON.stringify(input)
      expect(serialized).not.toContain('RAW_PROMPT_INJECTION_SHOULD_NOT_PASS')
      expect(serialized).not.toContain('rawHtml')
      expect(serialized).toContain('Carbon racket')
      return { response: JSON.stringify({ answer: 'El verdict depende del margen observado.', scenarioPatch: null, actionReason: null }) }
    })
    const result = await runImportAnalyst({ run }, {
      message: '¿Por qué?',
      context: {
        rawHtml: 'RAW_PROMPT_INJECTION_SHOULD_NOT_PASS',
        product: { name: 'Carbon racket', category: 'Padel racket', unitPriceUsd: 25 },
        decision: { label: 'ATTRACTIVE · DEMAND PENDING' },
      },
    })
    expect(result.status).toBe(200)
    expect((result.body as any).answer).toContain('verdict')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('limits conversation history sent to the model', async () => {
    const run = vi.fn(async (_model: string, input: any) => {
      const conversational = input.messages.filter((item: any) => item.role === 'user' || item.role === 'assistant')
      // Eight retained history items + the new user message.
      expect(conversational).toHaveLength(9)
      expect(conversational[0].content).toBe('old-4')
      return { response: JSON.stringify({ answer: 'ok', scenarioPatch: null, actionReason: null }) }
    })
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `old-${index}`,
    }))
    const result = await runImportAnalyst({ run }, { message: 'nuevo', history, context: {} })
    expect(result.status).toBe(200)
  })

  it('fails closed when the model call fails', async () => {
    const result = await runImportAnalyst({ run: async () => { throw new Error('quota') } }, { message: '¿Por qué?', context: {} })
    expect(result.status).toBe(503)
    expect((result.body as any).error).toContain('no disponible')
  })
})
