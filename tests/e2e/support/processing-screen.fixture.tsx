import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProcessingScreen from '../../../src/components/ProcessingScreen'
import { apiFetch } from '../../../src/lib/apiClient'
import '../../../src/styles.css'
import '../../../src/styles/design-system.css'
import '../../../src/styles/dark-mode.css'

function Fixture() {
  const [edits, setEdits] = useState(0)
  const [message, setMessage] = useState('')
  async function process() {
    setMessage('')
    try {
      const response = await apiFetch('/api/product-read', { method: 'POST', body: '{}' })
      if (!response.ok) throw new Error('La fuente no respondió. Tus datos siguen disponibles.')
      setMessage('Producto listo para confirmar')
    } catch (error) { setMessage((error as Error).message) }
  }
  return <><ProcessingScreen /><main style={{ padding: 24 }}>
    <nav aria-label="Navegación"><button onClick={() => setEdits(value => value + 1)}>Nuevo caso</button></nav>
    <label>Nombre del producto<input defaultValue="Termo de acero" /></label>
    <button onClick={() => void process()}>Procesar producto</button>
    <output aria-label="Interrupciones">{edits}</output>
    {message && <p role="status">{message}</p>}
  </main></>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
