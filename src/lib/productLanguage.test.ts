import { expect, it } from 'vitest'
import { spanishProductText } from './productLanguage'
it('translates known nouns without inventing specs or changing models', () => {
 expect(spanishProductText('Wilson Tennis Racket X100 180g')).toBe('Wilson raqueta de tenis X100 180g')
 expect(spanishProductText('Stainless Steel Water Bottle 1350ml')).toBe('acero inoxidable botella de agua 1350ml')
 expect(spanishProductText('UnknownBrand Z200')).toBe('UnknownBrand Z200')
})
