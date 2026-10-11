import { describe, expect, it } from 'vitest'
import { validateClerkDeployment } from './validate-clerk-deployment.mjs'

const production = {
  CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
  CLERK_SECRET_KEY: 'sk_live_fixture',
  CLERK_JWT_KEY: 'fixture-public-key',
}

describe('Clerk deployment environment validation', () => {
  it('permits consistent test and live configurations without returning credential values', () => {
    expect(validateClerkDeployment(production)).toEqual({ environment: 'production', configurationValid: true })
    expect(validateClerkDeployment({ ...production, CLERK_PUBLISHABLE_KEY: 'pk_test_fixture', CLERK_SECRET_KEY: 'sk_test_fixture' }))
      .toEqual({ environment: 'development', configurationValid: true })
    expect(validateClerkDeployment({})).toEqual({ environment: 'missing', configurationValid: false })
  })

  it.each([
    ['test frontend/live backend', { ...production, CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }, 'mixed'],
    ['live frontend/test backend', { ...production, CLERK_SECRET_KEY: 'sk_test_fixture' }, 'mixed'],
    ['missing JWT', { ...production, CLERK_JWT_KEY: '' }, 'incomplete'],
    ['invalid publishable key', { ...production, CLERK_PUBLISHABLE_KEY: 'sentinel-private-value' }, 'invalid'],
    ['invalid secret key', { ...production, CLERK_SECRET_KEY: 'sentinel-private-value' }, 'invalid'],
    ['empty live key payload', { ...production, CLERK_PUBLISHABLE_KEY: 'pk_live_' }, 'invalid'],
    ['line break in secret key', { ...production, CLERK_SECRET_KEY: 'sk_live_fixture\nextra' }, 'invalid'],
  ])('rejects %s before deployment without leaking keys', (_, env, category) => {
    expect(() => validateClerkDeployment(env)).toThrow(`configuration is ${category}`)
    try { validateClerkDeployment(env) } catch (error) {
      for (const value of Object.values(env).filter(Boolean)) expect(String(error)).not.toContain(value)
    }
  })
})
