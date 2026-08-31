import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_ROUTE_POLICIES, resolveRoutePolicy } from './routePolicy'

function exactRoutesFromSource(path: string) {
  const source = readFileSync(path, 'utf8')
  const matches = [...source.matchAll(/\b[A-Za-z_$][\w$]*\.pathname\s*(?:===|!==)\s*['"]([^'"]+)['"]/g)]
  return matches.map((match) => match[1]).filter((path) => path.startsWith('/api/') || path.startsWith('/oauth/'))
}

describe('SaaS API route inventory', () => {
  it('has unique route/method combinations', () => {
    const combinations = API_ROUTE_POLICIES.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`))
    expect(new Set(combinations).size).toBe(combinations.length)
  })

  it('classifies every exact API/OAuth route currently implemented', () => {
    const implemented = new Set([
      ...exactRoutesFromSource('worker/entry.ts'),
      ...exactRoutesFromSource('worker/analysisHistory.ts'),
      ...exactRoutesFromSource('worker/watchlist.ts'),
      ...exactRoutesFromSource('worker/router.ts'),
      ...exactRoutesFromSource('worker/enrich.ts'),
      ...exactRoutesFromSource('worker/index.ts'),
    ])
    const classified = new Set(API_ROUTE_POLICIES.map((route) => route.path))

    expect([...implemented].sort()).toEqual([...classified].sort())
  })

  it('keeps every high-cost route away from a public target state', () => {
    const highCost = API_ROUTE_POLICIES.filter((route) => route.costRisk === 'high')
    expect(highCost.length).toBeGreaterThan(0)
    for (const route of highCost) {
      expect(['authenticated', 'internal']).toContain(route.targetAccess)
      if (route.targetAccess === 'authenticated') expect(route.targetMetered).toBe(true)
    }
  })

  it('keeps private history authenticated and unmetered', () => {
    expect(resolveRoutePolicy('/api/history', 'GET')).toMatchObject({ id: 'analysis-history', targetAccess: 'authenticated', targetMetered: false })
    expect(resolveRoutePolicy('/api/history', 'POST')).toMatchObject({ id: 'analysis-history', targetAccess: 'authenticated', targetMetered: false })
    expect(resolveRoutePolicy('/api/history-item', 'GET')).toMatchObject({ id: 'analysis-history-item', targetAccess: 'authenticated', targetMetered: false })
    expect(resolveRoutePolicy('/api/history-item', 'DELETE')).toMatchObject({ id: 'analysis-history-item', targetAccess: 'authenticated', targetMetered: false })
  })

  it('keeps watchlist ownership actions unmetered but marks provider refresh as a metered target', () => {
    expect(resolveRoutePolicy('/api/watchlist', 'GET')).toMatchObject({ id: 'watchlist', targetAccess: 'authenticated', targetMetered: false, costRisk: 'low' })
    expect(resolveRoutePolicy('/api/watchlist', 'POST')).toMatchObject({ id: 'watchlist', targetAccess: 'authenticated', targetMetered: false, costRisk: 'low' })
    expect(resolveRoutePolicy('/api/watchlist-item', 'GET')).toMatchObject({ id: 'watchlist-item', targetAccess: 'authenticated', targetMetered: false })
    expect(resolveRoutePolicy('/api/watchlist-item', 'DELETE')).toMatchObject({ id: 'watchlist-item', targetAccess: 'authenticated', targetMetered: false })
    expect(resolveRoutePolicy('/api/watchlist-refresh', 'POST')).toMatchObject({ id: 'watchlist-refresh', targetAccess: 'authenticated', targetMetered: true, costRisk: 'high' })
  })

  it('resolves only declared method/path pairs', () => {
    expect(resolveRoutePolicy('/api/analyze', 'POST')?.id).toBe('analyze')
    expect(resolveRoutePolicy('/api/alibaba-native-probe', 'POST')?.targetAccess).toBe('internal')
    expect(resolveRoutePolicy('/api/argentina-market/benchmark', 'POST')).toMatchObject({
      id: 'argentina-market-benchmark',
      targetAccess: 'authenticated',
      targetMetered: true,
      costRisk: 'high',
    })
    expect(resolveRoutePolicy('/api/analyze', 'GET')).toBeNull()
    expect(resolveRoutePolicy('/api/history', 'DELETE')).toBeNull()
    expect(resolveRoutePolicy('/api/watchlist-refresh', 'GET')).toBeNull()
    expect(resolveRoutePolicy('/api/not-real', 'POST')).toBeNull()
  })
})
