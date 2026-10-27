/** Product identity is separate from its included accessories and intended host. */
export function normalizeProductIdentity(value?: string | null) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function principalProductText(facts: { name?: string | null; category?: string | null; functionText?: string | null; description?: string | null }) {
  const identity = normalizeProductIdentity(facts.name || facts.category || facts.functionText || facts.description)
  return identity.split(/\b(?:con|with|including|includes?|incluye|incluido|equipad[oa]|equipped|para|for)\b/)[0].trim()
}

export function componentIdentity(facts: Parameters<typeof principalProductText>[0]): 'battery' | 'power_adapter' | null {
  const identity = principalProductText(facts).replace(/\b\d+\s*(?:w|v|a|mah|wh)\b/g, '').trim()
  if (/\b(?:musical|percusion|drums?)\b/.test(identity)) return null
  const modifiers = '(?:(?:de|ion|iones|lithium|litio|li|recargable|rechargeable|portable|portatil|usb|c|wall|travel|universal|electrico|electric)\\s+)*'
  if (new RegExp(`^${modifiers}(?:baterias?|battery|batteries|acumulador(?:es)?|pilas?|celdas?|cells?|power bank|18650)\\b`).test(identity)) return 'battery'
  if (new RegExp(`^${modifiers}(?:cargador(?:es)?|chargers?|power adapter|adaptador de corriente|fuente de alimentacion)\\b`).test(identity)) return 'power_adapter'
  return null
}

export function isKickScooterIdentity(facts: Parameters<typeof principalProductText>[0]) {
  if (componentIdentity(facts)) return false
  if (/\b(?:movilidad reducida|mobility scooter|discapacidad|discapacitados?|disabled|disability|wheelchair|silla de ruedas)\b/.test(normalizeProductIdentity([facts.name, facts.functionText, facts.description].filter(Boolean).join(' ')))) return false
  const identity = principalProductText(facts)
  return /\b(monopatin(?:es)?|patinetes?|kick scooters?|e scooters?|electric scooters?|scooters? electricos?)\b/.test(identity)
    && !/^(?:partes?|piezas?|repuestos?|recambios?|spare|replacement|parts?|motor(?:es)?|motors?|ruedas?|wheels?|frenos?|brakes?|controlador(?:es)?|controllers?)\b/.test(identity)
}

export function isMobilityPartIdentity(facts: Parameters<typeof principalProductText>[0]) {
  return /\b(?:monopatin(?:es)?|patinetes?|scooters?|bicicletas?|bicycles?)\b/.test(normalizeProductIdentity(facts.name))
    && /^(?:partes?|piezas?|repuestos?|recambios?|spare|replacement|baterias?|battery|cargador(?:es)?|chargers?|motor(?:es)?|motors?|ruedas?|wheels?|frenos?|brakes?|controlador(?:es)?|controllers?)\b/.test(principalProductText(facts))
}
