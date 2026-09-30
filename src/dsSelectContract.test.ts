import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const dsSelect = fs.readFileSync(new URL('./components/DsSelect.tsx', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const persistence = fs.readFileSync(new URL('./lib/journeyPersistence.ts', import.meta.url), 'utf8')

describe('DsSelect accessible listbox contract', () => {
  it('implements the WAI-ARIA combobox + listbox roles', () => {
    expect(dsSelect).toContain('role="combobox"')
    expect(dsSelect).toContain('aria-haspopup="listbox"')
    expect(dsSelect).toContain('aria-expanded={open}')
    expect(dsSelect).toContain('aria-controls={listboxId}')
    expect(dsSelect).toContain('role="listbox"')
    expect(dsSelect).toContain('role="option"')
    expect(dsSelect).toContain('aria-selected={isSelected}')
    expect(dsSelect).toContain('aria-activedescendant={optionId(activeIndex)}')
  })

  it('supports full keyboard operation', () => {
    // Open from the trigger, move/select/close from the list.
    for (const key of ["case 'ArrowDown'", "case 'ArrowUp'", "case 'Enter'", "case ' '", "case 'Home'", "case 'End'", "case 'Escape'", "case 'Tab'"]) {
      expect(dsSelect).toContain(key)
    }
    expect(dsSelect).toContain('typeahead(event.key)')
    // Focus returns to the trigger on close.
    expect(dsSelect).toContain('triggerRef.current?.focus()')
  })

  it('exposes data-value on the trigger and options for replay/e2e', () => {
    expect(dsSelect).toContain('data-value={value}')
    expect(dsSelect).toContain('data-value={option.value}')
  })
})

describe('journey sensitive-category uses DsSelect with replayable value', () => {
  it('renders the DsSelect (not a native select) with the stable id', () => {
    expect(app).toContain('<DsSelect id="journey-sensitive-category"')
    expect(app).not.toContain('<select id="journey-sensitive-category"')
  })

  it('captures and restores the selection through data-value click-replay', () => {
    expect(persistence).toContain("document.getElementById('journey-sensitive-category')?.getAttribute('data-value')")
    expect(persistence).toContain("selectDsOption('journey-sensitive-category'")
    expect(persistence).toContain('${triggerId}-listbox [data-value="${value}"]')
    // The mutation observer must watch data-value so a DsSelect change syncs.
    expect(persistence).toContain("attributeFilter: ['class', 'aria-checked', 'data-value']")
  })
})

describe('post-login continues where the user left off', () => {
  it('persists a ready pipeline snapshot and rehydrates it on restore', () => {
    // Snapshot written when a quote is ready.
    expect(app).toContain("writeProductDraft('pipeline'")
    expect(app).toContain("status: 'ready'")
    // Restore only rehydrates when the saved inputs still match.
    expect(app).toContain("readProductDraft<PipelineDraft>('pipeline')")
    expect(app).toContain('pipe.calculationInputKey === currentCalculationInputKeyRef.current')
    expect(app).toContain("setCalculationStatus('ready')")
  })
})

describe('landing is a separate screen with jump-free entry', () => {
  it('gates the app behind an entered flag and enters instantly', () => {
    expect(app).toContain('if (!entered) return <Landing onStart={enterApp} />')
    expect(app).toContain("window.scrollTo({ top: 0, behavior: 'auto' })")
    expect(app).toContain("localStorage.setItem(ENTERED_KEY")
  })

  it('reveals sections without yanking during a restore replay', () => {
    expect(app).toContain('if (restoringRef.current) return')
    expect(app).toContain('scrollIntoViewIfNeeded(target)')
    // No leftover setTimeout-based scrolling.
    expect(app).not.toContain('scrollElementIntoView(')
  })
})
