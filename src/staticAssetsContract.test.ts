import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

function cssFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    return entry.isDirectory() ? cssFiles(child) : entry.name.endsWith('.css') ? [child] : []
  })
}

describe('static asset contract', () => {
  it('does not reference missing public image assets', () => {
    const imageSources = [...appSource.matchAll(/<img\b[^>]*\bsrc=["'](\/[^"']+)["']/g)]
      .map((match) => match[1])

    for (const source of imageSources) {
      expect(existsSync(new URL(`../public${source}`, import.meta.url)), `${source} must exist in public`).toBe(true)
    }
  })

  it('does not reference missing local assets from CSS', () => {
    const localUrls = cssFiles(new URL('./styles/', import.meta.url))
      .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/url\(["']?(\/[^)'"?#]+)["']?\)/g)])
      .map((match) => match[1])

    for (const source of localUrls) {
      expect(existsSync(new URL(`../public${source}`, import.meta.url)), `${source} must exist in public`).toBe(true)
    }
  })
})
