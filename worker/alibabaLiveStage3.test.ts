import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const liveBranch = (process.env.GITHUB_REF || '').includes('feature/alibaba-live-stage3')

const suite = liveBranch ? describe : describe.skip

suite('Stage 3 live Alibaba self-scraper benchmark', () => {
  it('identifies every curated real Alibaba product or routes incomplete facts to confirmation', () => {
    const output = execFileSync(process.execPath, ['scripts/alibaba-live-stage3.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      env: process.env,
      maxBuffer: 5 * 1024 * 1024,
    })
    console.log(output)
    const marker = output.split('\n').find((line) => line.startsWith('ALIBABA_STAGE3_RESULT='))
    expect(marker, 'Stage 3 script did not emit a machine-readable result').toBeTruthy()
    const result = JSON.parse(marker!.slice('ALIBABA_STAGE3_RESULT='.length))
    expect(result.summary.identityFailed.count).toBe(0)
    expect(result.summary.combinedAutomaticIdentity.pass).toBe(result.summary.cases)
  }, 16 * 60 * 1000)
})
