import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const liveBranch = (process.env.GITHUB_REF || '').includes('feature/alibaba-live-stage3')
const suite = liveBranch ? describe : describe.skip

function titleOf(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 220) || null
}

async function diagnose(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    const html = await response.text()
    return {
      url,
      http: response.status,
      finalUrl: response.url,
      bytes: html.length,
      title: titleOf(html),
      markers: {
        mechanical: /mechanical/i.test(html),
        wristwatch: /wristwatch/i.test(html),
        productId: /1601666174891/.test(html),
        captcha: /captcha|verify you are human|punish|robot check/i.test(html),
        ldJson: /application\/ld\+json/i.test(html),
        nextData: /__NEXT_DATA__|__INITIAL_STATE__|window\.__/i.test(html),
        moq: /minimum order|\bmoq\b/i.test(html),
        origin: /place of origin|country of origin/i.test(html),
      },
    }
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : String(error) }
  }
}

suite('Stage 3 live Alibaba self-scraper benchmark', () => {
  it('diagnoses desktop and crawler/mobile representations of the watch page', async () => {
    const urls = [
      'https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html',
      'https://m.alibaba.com/product/1601666174891/Fully-Automatic-Mechanical-Watches-42-5MM/specifications.html?isSpider=true&s=p',
      'https://m.alibaba.com/product/1601666174891/Fully-Automatic-Mechanical-Watches-42-5MM.html?isSpider=true&s=p',
    ]
    const results = []
    for (const url of urls) results.push(await diagnose(url))
    console.log('ALIBABA_DIRECT_DIAGNOSTICS=' + JSON.stringify(results))
    expect(results.length).toBe(3)
  }, 90_000)

  it('identifies every curated real Alibaba product or routes incomplete facts to confirmation', () => {
    const result = spawnSync(process.execPath, ['scripts/alibaba-live-stage3.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
      env: process.env,
      maxBuffer: 5 * 1024 * 1024,
    })
    console.log(result.stdout || '')
    if (result.stderr) console.error(result.stderr)
    const marker = (result.stdout || '').split('\n').find((line) => line.startsWith('ALIBABA_STAGE3_RESULT='))
    expect(marker, 'Stage 3 script did not emit a machine-readable result').toBeTruthy()
    const parsed = JSON.parse(marker!.slice('ALIBABA_STAGE3_RESULT='.length))
    expect(parsed.summary.identityFailed.count).toBe(0)
    expect(parsed.summary.combinedAutomaticIdentity.pass).toBe(parsed.summary.cases)
    expect(result.status).toBe(0)
  }, 16 * 60 * 1000)
})
