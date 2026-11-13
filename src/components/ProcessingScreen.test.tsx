// @vitest-environment jsdom
import React, { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProcessingScreen from './ProcessingScreen'
import { getProcessingState, startProcessing } from '../lib/processingScreen'
import { useProcessingScreen } from '../lib/useProcessingScreen'

let root: Root, container: HTMLDivElement
const tasks: ReturnType<typeof startProcessing>[] = []
const originalModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { tasks.forEach(task => task.finish()); await root.unmount() })
  tasks.length = 0; container.remove(); vi.restoreAllMocks()
  for (const [key, descriptor] of [['showModal', originalModal], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
  expect(getProcessingState()).toBeNull()
  expect(document.querySelector('.processing-screen')).toBeNull()
})
function start(title = 'Leyendo producto', priority = 0) {
  const task = startProcessing({ title, detail: 'Recuperando los datos del proveedor.', priority })
  tasks.push(task); return task
}

it('locks scrolling, announces actual stages and prevents Escape from interrupting work', async () => {
  document.documentElement.style.overflow = 'clip'
  await act(async () => { root.render(<ProcessingScreen />); start() })
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!
  expect(dialog.open).toBe(true)
  expect(document.activeElement?.id).toBe('processing-title')
  expect(document.documentElement.style.overflow).toBe('hidden')
  const cancel = new Event('cancel', { cancelable: true })
  await act(async () => { dialog.dispatchEvent(cancel) })
  expect(cancel.defaultPrevented).toBe(true)
  await act(async () => tasks[0].update({ title: 'Calculando los costos', detail: 'Comparando modalidades.', steps: ['Producto', 'Costos', 'Resultado'], activeStep: 1 }))
  expect(dialog.querySelector('h1')?.textContent).toBe('Calculando los costos')
  expect(dialog.querySelector('[aria-current=step]')?.textContent).toContain('Costos')
  expect(dialog.querySelector('[role=progressbar]')?.hasAttribute('aria-valuenow')).toBe(false)
  await act(async () => tasks[0].finish())
  expect(document.documentElement.style.overflow).toBe('clip')
  document.documentElement.style.overflow = ''
})

it('keeps the screen locked until every foreground task finishes', async () => {
  let pipeline!: ReturnType<typeof startProcessing>, request!: ReturnType<typeof startProcessing>
  await act(async () => { root.render(<ProcessingScreen />); pipeline = start('Tu importación', 10); request = start('Clasificando', -10) })
  expect(document.querySelector('h1')?.textContent).toBe('Tu importación')
  await act(async () => request.finish())
  expect(document.querySelector('dialog')?.open).toBe(true)
  await act(async () => pipeline.finish())
  expect(document.querySelector('dialog')).toBeNull()
})

it('releases work on unmount and remains safe under StrictMode effect replay', async () => {
  function Task() { useProcessingScreen(true, { title: 'Buscando productos', detail: 'Consultando proveedores.' }); return null }
  await act(async () => root.render(<StrictMode><ProcessingScreen /><Task /></StrictMode>))
  expect(document.querySelector('dialog')?.open).toBe(true)
  await act(async () => root.render(<ProcessingScreen />))
  expect(document.querySelector('dialog')).toBeNull()
  expect(getProcessingState()).toBeNull()
})
