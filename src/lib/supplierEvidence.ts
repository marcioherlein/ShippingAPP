/** Original supplier values; normalized numbers remain editable candidates. */
export type SupplierEvidence = {
  priceText: string | null
  currency: string | null
  quantityUnit: string | null
  variant: string | null
  weightText?: string | null
  moqText?: string | null
  volumeText?: string | null
  priceSource?: string | null
  weightSource?: string | null
  moqSource?: string | null
  volumeSource?: string | null
}

export function originalSupplierText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).replace(/\s+/g, ' ').trim().slice(0, 300)
  return text || null
}

/** Keep provenance coupled to the numeric field selected by each reader. */
export function mergeSupplierEvidence(prior: SupplierEvidence | undefined, next: SupplierEvidence | undefined,
  useNext: { price: boolean; weight: boolean; moq: boolean; volume: boolean }, nextSource: string): SupplierEvidence {
  const price = useNext.price ? next : prior
  const weight = useNext.weight ? next : prior
  const moq = useNext.moq ? next : prior
  const volume = useNext.volume ? next : prior
  return {
    priceText: price?.priceText ?? null, currency: price?.currency ?? null,
    quantityUnit: price?.quantityUnit ?? null, variant: price?.variant ?? null,
    priceSource: useNext.price ? nextSource : price?.priceSource ?? null,
    weightText: weight?.weightText ?? null, weightSource: useNext.weight ? nextSource : weight?.weightSource ?? null,
    moqText: moq?.moqText ?? null, moqSource: useNext.moq ? nextSource : moq?.moqSource ?? null,
    volumeText: volume?.volumeText ?? null, volumeSource: useNext.volume ? nextSource : volume?.volumeSource ?? null,
  }
}
