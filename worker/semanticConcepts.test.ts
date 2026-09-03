import { describe, expect, it } from 'vitest'
import { deriveClarifications, deriveNormalizedCategory, deriveSemanticConcepts } from './semanticConcepts'

describe('semantic concept derivation', () => {
  it('derives vacuum-insulated beverage concepts from English commercial facts', () => {
    const c = deriveSemanticConcepts({
      name: '45oz 1350ml Large Capacity Stainless Steel',
      material: 'Stainless Steel',
      description: 'thermal insulation performance: Thermal Insulation, direct drinking, travel',
    })
    expect(c.concepts).toContain('vacuum_insulated')
    expect(c.concepts).toContain('beverage_container')
    expect(c.material).toBe('acero inoxidable')
    expect(c.construction).toBe('vacuum_insulated')
    expect(c.positiveTerms.join(' ')).toMatch(/isotermico|termo/)
    // Positively insulated → must NOT exclude the isothermal family.
    expect(c.exclusionTerms.join(' ')).not.toMatch(/isotermic/)
  })

  it('derives the SAME insulation concept from Spanish facts (language invariance)', () => {
    const c = deriveSemanticConcepts({
      name: 'Termo botella térmica 1350 ml de acero inoxidable',
      category: 'Termo y recipiente isotérmico aislado por vacío',
      material: 'Acero inoxidable',
      functionText: 'Recipiente reutilizable aislado por vacío para conservar bebidas.',
    })
    expect(c.concepts).toContain('vacuum_insulated')
    expect(c.concepts).toContain('beverage_container')
    expect(c.material).toBe('acero inoxidable')
  })

  it('derives insulation concept from mixed English/Spanish facts', () => {
    const c = deriveSemanticConcepts({
      name: 'Vacuum flask botella de acero inoxidable 1350ml',
      description: 'double wall, conserva bebidas frías o calientes',
    })
    expect(c.concepts).toContain('vacuum_insulated')
    expect(c.concepts).toContain('beverage_container')
  })

  it('treats "thermal insulation: none" as explicit denial and flips to exclusion', () => {
    const c = deriveSemanticConcepts({
      name: 'Large Capacity Sport Water Bottle Gym',
      material: 'Plastic, plastic type PP',
      description: 'thermal insulation performance: None, direct drinking, straw with cap',
    })
    expect(c.concepts).toContain('beverage_container')
    expect(c.concepts).toContain('material_plastic')
    // Denied insulation must NOT assert the construction and MUST become an exclusion.
    expect(c.construction).toBeNull()
    expect(c.concepts).toContain('!vacuum_insulated')
    expect(c.exclusionTerms.join(' ')).toMatch(/isotermic/)
    expect(c.exclusionTerms.join(' ')).toMatch(/vacio|termo/)
  })

  it('flips refrigeration and electric concepts on explicit negatives', () => {
    const c = deriveSemanticConcepts({
      name: 'plastic water bottle',
      description: 'passive container, no active cooling, no refrigeration, non-electric',
    })
    expect(c.exclusionTerms).toContain('refriger')
    expect(c.exclusionTerms).toContain('electric')
    expect(c.activeMechanism).toBe('passive')
  })

  it('does not add exclusions from the mere absence of a positive fact', () => {
    const c = deriveSemanticConcepts({ name: 'stainless steel ordinary bottle' })
    // No explicit "non-insulated" statement → no insulation exclusion (uncertainty, not denial).
    expect(c.exclusionTerms).toEqual([])
    expect(c.concepts).not.toContain('!vacuum_insulated')
  })

  it('derives sunglasses concept in both languages', () => {
    expect(deriveSemanticConcepts({ name: 'Mens Sunglasses UV400' }).concepts).toContain('sunglasses')
    expect(deriveSemanticConcepts({ name: 'Gafas de sol para hombre' }).concepts).toContain('sunglasses')
  })

  it('does NOT treat safety/protective glasses as sunglasses (adversarial lexical overlap)', () => {
    const c = deriveSemanticConcepts({ name: 'safety protective glasses polycarbonate', description: 'industrial eye protection' })
    expect(c.concepts).not.toContain('sunglasses')
  })

  it('does NOT assert vacuum insulation for an ordinary stainless steel bottle', () => {
    const c = deriveSemanticConcepts({ name: 'stainless steel ordinary water bottle', material: 'stainless steel' })
    expect(c.concepts).toContain('beverage_container')
    expect(c.concepts).not.toContain('vacuum_insulated')
    // No explicit denial either → uncertainty, not an exclusion.
    expect(c.concepts).not.toContain('!vacuum_insulated')
    expect(c.exclusionTerms).toEqual([])
  })
})

describe('derived category normalization', () => {
  it('derives an insulated-thermo category with material', () => {
    const category = deriveNormalizedCategory({
      name: 'stainless steel vacuum flask',
      material: 'stainless steel',
      description: 'thermal insulation, keeps drinks hot',
    })
    expect(category).toMatch(/[Tt]ermo|isotérmico/)
    expect(category).toMatch(/acero inoxidable/)
  })

  it('derives a plastic reusable bottle category without inventing insulation', () => {
    const category = deriveNormalizedCategory({
      name: 'Large Capacity Sport Water Bottle Gym',
      material: 'Plastic PP',
      description: 'thermal insulation performance: None, direct drinking',
    })
    expect(category).toMatch(/[Bb]otella reutilizable/)
    expect(category).toMatch(/plástico/)
    expect(category).not.toMatch(/isotérmico|[Tt]ermo/)
  })

  it('returns null when evidence does not clearly describe a product', () => {
    expect(deriveNormalizedCategory({ name: 'mystery item xyz' })).toBeNull()
  })
})

describe('clarification questions (asked only when they change classification)', () => {
  it('asks a specific insulation question for a bottle with unknown insulation', () => {
    const q = deriveClarifications(deriveSemanticConcepts({ name: 'stainless steel water bottle 1L' }))
    expect(q).toHaveLength(1)
    expect(q[0].question).toMatch(/aislamiento|vacío|termo/i)
    expect(q[0].fact).toBe('construction')
  })

  it('does NOT ask about insulation once it is asserted', () => {
    const q = deriveClarifications(deriveSemanticConcepts({ name: 'vacuum insulated flask', description: 'double wall' }))
    expect(q.find((c) => c.fact === 'construction')).toBeUndefined()
  })

  it('does NOT ask about insulation once it is explicitly denied', () => {
    const q = deriveClarifications(deriveSemanticConcepts({ name: 'plastic bottle', description: 'thermal insulation: none' }))
    expect(q.find((c) => c.fact === 'construction')).toBeUndefined()
  })

  it('asks nothing for a product with no classification-changing ambiguity', () => {
    expect(deriveClarifications(deriveSemanticConcepts({ name: 'notebook laptop' }))).toEqual([])
  })
})

