import type { SensitiveProductCategory } from './landedCostEngine'

const categories = ['none', 'food', 'toys', 'cosmetics', 'medicines', 'supplements', 'plants', 'unknown']

/** Recover the private, non-visible category only when every other quote input matches. */
export function recoverSavedCategory(savedKey: string, currentKey: string): SensitiveProductCategory | null | undefined {
  try {
    const saved: unknown = JSON.parse(savedKey)
    const current: unknown = JSON.parse(currentKey)
    if (!Array.isArray(saved) || !Array.isArray(current) || saved.length !== 8 || current.length !== 8) return undefined
    const category: unknown = saved[3]
    if (category !== null && (typeof category !== 'string' || !categories.includes(category))) return undefined
    current[3] = category
    return JSON.stringify(saved) === JSON.stringify(current) ? category as SensitiveProductCategory | null : undefined
  } catch {
    return undefined
  }
}
