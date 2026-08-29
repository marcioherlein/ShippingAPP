import { describe, expect, it } from 'vitest'
import { buildResolvedConfig, extractDatabaseInfo } from './resolve-production-d1-config.mjs'

describe('production D1 binding resolver', () => {
  it('resolves the existing shippingapp database id from Wrangler info', () => {
    expect(extractDatabaseInfo({ name: 'shippingapp-db', uuid: '11111111-2222-3333-4444-555555555555' })).toEqual({
      databaseName: 'shippingapp-db',
      databaseId: '11111111-2222-3333-4444-555555555555',
    })
  })

  it('accepts list-shaped Wrangler payloads while selecting only the expected database', () => {
    expect(extractDatabaseInfo([
      { name: 'other-db', uuid: 'other-id' },
      { name: 'shippingapp-db', uuid: 'shipping-id' },
    ])).toEqual({ databaseName: 'shippingapp-db', databaseId: 'shipping-id' })
  })

  it('fails closed on a mismatched database name instead of binding an arbitrary database', () => {
    expect(() => extractDatabaseInfo({ name: 'other-db', uuid: 'other-id' })).toThrow('unexpected D1 database name')
  })

  it('preserves unrelated bindings and injects the explicit DB name/id', () => {
    const base = {
      name: 'shippingapp',
      d1_databases: [
        { binding: 'ANALYTICS_DB', database_name: 'analytics', database_id: 'analytics-id' },
        { binding: 'DB', migrations_dir: 'migrations' },
      ],
    }
    const resolved = buildResolvedConfig(base, { databaseName: 'shippingapp-db', databaseId: 'shipping-id' })
    expect(resolved.d1_databases).toEqual([
      { binding: 'ANALYTICS_DB', database_name: 'analytics', database_id: 'analytics-id' },
      { binding: 'DB', migrations_dir: 'migrations', database_name: 'shippingapp-db', database_id: 'shipping-id' },
    ])
  })
})
