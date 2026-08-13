export function percentile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * p
  const low = Math.floor(position)
  const high = Math.ceil(position)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

export function iqrBounds(values: number[]) {
  if (values.length < 4) return null
  const q1 = percentile(values, 0.25)
  const q3 = percentile(values, 0.75)
  if (q1 === null || q3 === null) return null
  const iqr = q3 - q1
  return { low: Math.max(0, q1 - 1.5 * iqr), high: q3 + 1.5 * iqr }
}

export function trimPriceOutliers<T>(items: T[], price: (item: T) => number, minRemaining = 5) {
  const bounds = iqrBounds(items.map(price))
  if (!bounds) return items
  const trimmed = items.filter((item) => {
    const value = price(item)
    return value >= bounds.low && value <= bounds.high
  })
  return trimmed.length >= minRemaining ? trimmed : items
}
