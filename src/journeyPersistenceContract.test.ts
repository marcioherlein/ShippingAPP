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

  it('creates navigation entries from semantic stage transitions instead of click timing', () => {
    expect(persistence).toContain("return state ? `${state.intent}:${state.step}` : null")
    expect(persistence).toContain("key !== lastNavigationKey ? 'push' : 'replace'")
    expect(persistence).toContain('lastNavigationKey = navigationKey(state)')
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

  it('installs persistence only after the React application render call', () => {
    expect(main).toContain("import { installJourneyPersistence } from './lib/journeyPersistence'")
    const renderIndex = main.indexOf('createRoot(root).render(')
    const persistenceIndex = main.indexOf('installJourneyPersistence()')
    expect(renderIndex).toBeGreaterThan(-1)
    expect(persistenceIndex).toBeGreaterThan(renderIndex)
  })
})
