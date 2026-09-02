import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVER_ONLY = [
  'RESEND_API_KEY',
  'EMAIL_UNSUBSCRIBE_SECRET',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'INTERNAL_API_TOKEN',
]

function files(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

describe('Stage 8 production secret boundary', () => {
  it('keeps server-only email/auth secrets out of browser source', () => {
    const client = files('src').map((file) => fs.readFileSync(file, 'utf8')).join('\n')
    for (const secret of SERVER_ONLY) {
      expect(client, `${secret} must not appear in browser source`).not.toContain(secret)
      expect(client, `VITE_${secret} must never exist`).not.toContain(`VITE_${secret}`)
    }
  })

  it('keeps generic pull-request CI disconnected from GitHub production secrets', () => {
    const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8')
    expect(ci).not.toContain('${{ secrets.')
    for (const secret of SERVER_ONLY) {
      expect(ci, `generic CI must not read secrets.${secret}`).not.toContain(`secrets.${secret}`)
      expect(ci, `generic CI must not expose VITE_${secret}`).not.toContain(`VITE_${secret}`)
    }
    // A deterministic dummy INTERNAL_API_TOKEN in .dev.vars is deliberately
    // allowed for the local Wrangler smoke. It is not sourced from GitHub
    // Secrets and cannot authenticate against production.
    expect(ci).toContain("CI_INTERNAL_TOKEN='ci-local-only-internal-token-")
  })

  it('keeps secrets out of versioned Wrangler vars', () => {
    const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8')
    for (const secret of SERVER_ONLY) expect(wrangler).not.toContain(`\"${secret}\"`)
  })

  it('allows trusted production deploy to sync server-only secrets without exposing VITE variants', () => {
    const deploy = fs.readFileSync('.github/workflows/deploy-production.yml', 'utf8')
    expect(deploy).toContain('secrets.RESEND_API_KEY')
    expect(deploy).toContain('secrets.EMAIL_UNSUBSCRIBE_SECRET')
    expect(deploy).toContain('put_secret RESEND_API_KEY')
    expect(deploy).toContain('put_secret EMAIL_UNSUBSCRIBE_SECRET')
    expect(deploy).not.toContain('VITE_RESEND_API_KEY')
    expect(deploy).not.toContain('VITE_EMAIL_UNSUBSCRIBE_SECRET')
  })
})
