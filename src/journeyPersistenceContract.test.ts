import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const persistence = fs.readFileSync(new URL('./lib/journeyPersistence.ts', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')

describe('journey persistence contract', () => {
  it('persists a versioned setup state in URL and local storage', () => {
    expect(persistence).toContain("shippingapp:journey:v1")
    expect(persistence).toContain("const URL_KEY = 'journey'")
    expect(persistence).toContain('window.history.pushState')
    expect(persistence).toContain('window.history.replaceState')
  })

  it('treats URL state as the preferred deep-link source', () => {
    const urlRead = persistence.indexOf('const fromUrl = decodeState')
    const storageRead = persistence.indexOf('localStorage.getItem(STORAGE_KEY)')
    expect(urlRead).toBeGreaterThan(-1)
    expect(storageRead).toBeGreaterThan(urlRead)
  })

  it('restores setup through existing controlled journey interactions', () => {
    expect(persistence).toContain('restoreJourneyState')
    expect(persistence).toContain('restoreOperation')
    expect(persistence).toContain('restoreBudget')
    expect(persistence).toContain("window.addEventListener('popstate'")
  })

  it('does not serialize analysis, customs results, or calculated output', () => {
    const stateDeclaration = persistence.slice(
      persistence.indexOf('export type PersistedJourneyState'),
      persistence.indexOf("type HistoryMode"),
    )
    expect(stateDeclaration).not.toContain('analysis')
    expect(stateDeclaration).not.toContain('pipelineSummary')
    expect(stateDeclaration).not.toContain('ncm')
  })

  it('is installed in the application shell', () => {
    expect(main).toContain("import { installJourneyPersistence } from './lib/journeyPersistence'")
    expect(main).toContain('installJourneyPersistence()')
  })
})
