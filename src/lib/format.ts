export const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

export const ars = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)

export const formatUnits = (quantity: number) =>
  `${quantity.toLocaleString('es-AR')} ${quantity === 1 ? 'unidad' : 'unidades'}`

export const pct = (value: number) => `${(value * 100).toFixed(1)}%`
