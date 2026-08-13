export function airFreight(quantity: number, weightKg: number, rate: number, minimum: number) {
  return Math.max(minimum, quantity * weightKg * rate)
}

export function seaFreight(quantity: number, volumeCbm: number, rate: number, minimum: number) {
  return Math.max(minimum, quantity * volumeCbm * rate)
}
