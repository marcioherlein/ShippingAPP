// Conservative vocabulary only: untranslated brands, model IDs and measurements
// stay verbatim. This never adds material, insulation or technical properties.
const terms: Array<[RegExp, string]> = [
  [/\bstainless steel\b/gi, 'acero inoxidable'], [/\bwater bottle\b/gi, 'botella de agua'],
  [/\bvacuum flask\b/gi, 'termo al vacío'], [/\bvacuum cleaner\b/gi, 'aspiradora'],
  [/\bpadel racket\b/gi, 'paleta de pádel'], [/\btennis racket\b/gi, 'raqueta de tenis'],
  [/\bbadminton racket\b/gi, 'raqueta de bádminton'], [/\bface cream\b/gi, 'crema facial'],
  [/\bskin care\b/gi, 'cuidado de la piel'], [/\bphone light(?:ing)?\b/gi, 'luz para celular'],
  [/\bwristwatch\b/gi, 'reloj de pulsera'], [/\bmechanical\b/gi, 'mecánico'],
  [/\bautomatic\b/gi, 'automático'], [/\bbackpack\b/gi, 'mochila'],
  [/\bheadphones\b/gi, 'auriculares'], [/\bspeaker\b/gi, 'parlante'],
  [/\bcharger\b/gi, 'cargador'], [/\bwireless\b/gi, 'inalámbrico'],
  [/\bdrill\b/gi, 'taladro'], [/\bblender\b/gi, 'licuadora'],
  [/\bportable\b/gi, 'portátil'], [/\badjustable\b/gi, 'ajustable'],
  [/\bcarbon fiber\b/gi, 'fibra de carbono'], [/\bplastic\b/gi, 'plástico'],
]
export function spanishProductText(original: string): string {
  return terms.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), original)
}
