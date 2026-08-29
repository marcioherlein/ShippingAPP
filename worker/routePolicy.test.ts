import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ROUTE_POLICIES, resolveRoutePolicy } from './routePolicy'

function exactRoutesFromSource(path: string) {
  const source = readFileSync(path, 'utf8')
  const matches = [...source.matchAll(/url\.pathname\s*(?:===|!==)\s*['"]([^'"]+)['"]/g)]
  return matches.map((match) => match[1]).filter((path) => path.startsWith('/api/') || path.startsWith('/oauth/'))
}

describe('SaaS API route inventory', () => {
  it('has unique route/method combinations', () => {
    const combinations = API_ROUTE_POLICIES.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`))
    expect(new Set(combinations).size).toBe(combinations.length)
  })

  it('classifies every exact API/OAuth route currently implemented', () => {
    const implemented = new Set([
      ...exactRoutesFromSource('worker/enrich.ts'),
      ...exactRoutesFromSource('worker/index.ts'),
    ])
    const classified = new Set(API_ROUTE_POLICIES.map((route) => route.path))

    expect([...implemented].sort()).toEqual([...classified].sort())
  })

  it('marks every high-cost product computation for future authentication', () => {
    const highCost = API_ROUTE_POLICIES.filter((route) => route.costRisk === 'high')
    expect(highCost.length).toBeGreaterThan(0)
    for (const route of highCost) {
      expect(route.targetAccess).toBe('authenticated')
      expect(route.targetMetered).toBe(true)
    }
  })

  it('resolves only declared method/path pairs', () => {
    expect(resolveRoutePolicy('/api/analyze', 'POST')?.id).toBe('analyze')
    expect(resolveRoutePolicy('/api/analyze', 'GET')).toBeNull()
    expect(resolveRoutePolicy('/api/not-real', 'POST')).toBeNull()
  })
})
