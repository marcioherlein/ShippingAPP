import { describe, expect, it } from 'vitest'
import { configureWrangler, validD1DatabaseId } from './configure-ncm-d1.mjs'

describe('configure NCM D1 binding', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'

  it('accepts a Cloudflare-style UUID and rejects placeholders', () => {
    expect(validD1DatabaseId(id)).toBe(true)
    expect(validD1DatabaseId('<CLOUDFLARE_DATABASE_ID>')).toBe(false)
    expect(validD1DatabaseId('abc')).toBe(false)
  })

  it('adds NCM_DB without losing other bindings', () => {
    const result = configureWrangler({
      name: 'shippingapp',
      d1_databases: [{ binding: 'OTHER_DB', database_name: 'other', database_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }],
    }, id)
    expect(result.d1_databases).toEqual([
      { binding: 'OTHER_DB', database_name: 'other', database_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      { binding: 'NCM_DB', database_name: 'shippingapp-ncm', database_id: id },
    ])
  })

  it('replaces an existing NCM_DB binding instead of duplicating it', () => {
    const result = configureWrangler({
      d1_databases: [{ binding: 'NCM_DB', database_name: 'old', database_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }],
    }, id)
    expect(result.d1_databases).toHaveLength(1)
    expect(result.d1_databases[0]).toEqual({ binding: 'NCM_DB', database_name: 'shippingapp-ncm', database_id: id })
  })
})
