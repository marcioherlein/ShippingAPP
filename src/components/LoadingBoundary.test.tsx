// @vitest-environment jsdom
import React, { act, lazy } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LoadingBoundary from './LoadingBoundary'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

it('announces loading and replaces it with the requested surface when its chunk resolves', async () => {
  let resolve!: (value: { default: React.ComponentType }) => void
  const Surface = lazy(() => new Promise<{ default: React.ComponentType }>(done => { resolve = done }))
  await act(async () => root.render(<LoadingBoundary label="Cargando cotizador…"><Surface /></LoadingBoundary>))
  expect(container.querySelector('[role=status]')?.textContent).toBe('Cargando cotizador…')
  await act(async () => resolve({ default: () => <h2>Tu ficha</h2> }))
  expect(container.querySelector('h2')?.textContent).toBe('Tu ficha')
  expect(container.querySelector('[role=status]')).toBeNull()
})

it('offers recovery after a rejected chunk and preserves the existing draft', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.setItem('shippingapp:product-draft:analysis', 'saved-draft')
  const Surface = lazy(() => Promise.reject(new Error('Chunk unavailable')))
  await act(async () => root.render(<LoadingBoundary><Surface /></LoadingBoundary>))
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Tu ficha permanece guardada')
  expect(container.querySelector('button')?.textContent).toBe('Reintentar cargar')
  expect(sessionStorage.getItem('shippingapp:product-draft:analysis')).toBe('saved-draft')
})
