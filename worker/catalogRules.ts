export const EXCLUDED_LISTING_TERMS = ['funda', 'protector', 'overgrip', 'grip', 'pelota', 'pelotas', 'bolso', 'mochila', 'paletero', 'llavero', 'munequera']

// High-recognition brands are used only as a conservative false-positive guardrail.
// If the imported target is private-label/unknown, a known premium/branded local item
// must not become a strong comparable merely because category/spec tokens overlap.
export const HIGH_BRAND_EQUITY = [
  'apple', 'samsung', 'xiaomi', 'motorola', 'lenovo', 'hp', 'dell', 'asus', 'acer', 'sony', 'lg', 'philips',
  'bosch', 'dewalt', 'makita', 'stanley', 'black decker', 'black+decker', 'einhell',
  'logitech', 'jbl', 'anker', 'dyson', 'electrolux', 'oster', 'atmanda',
  'nox', 'bullpadel', 'adidas', 'head', 'wilson', 'babolat', 'siux', 'starvie', 'star vie', 'drop shot', 'lok', 'varlion', 'royal padel',
]
