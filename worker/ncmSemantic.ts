import type { NcmProductFacts, NcmRetrievalCandidate } from './ncmRetrieval'

function norm(value: string | null | undefined) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function productText(facts: NcmProductFacts) {
  return norm([facts.name, facts.category, facts.material, facts.functionText, facts.description].filter(Boolean).join(' '))
}

function parts(label: string) {
  const marker = '> Aperturas SIM oficiales:'
  const index = label.indexOf(marker)
  const canonical = index >= 0 ? label.slice(0, index).trim() : label
  const simEvidence = index >= 0 ? label.slice(index + marker.length).trim() : ''
  const canonicalLeaf = canonical.split('>').pop()?.trim() || canonical
  return { canonical: norm(canonical), canonicalLeaf: norm(canonicalLeaf), simEvidence: norm(simEvidence) }
}

export function semanticAdjustment(candidate: NcmRetrievalCandidate, facts: NcmProductFacts) {
  const product = productText(facts)
  const { canonical, canonicalLeaf, simEvidence } = parts(candidate.label)
  let adjustment = 0

  // A functioning article must not drift into waste/scrap headings merely
  // because those headings repeat the name of the article they contain.
  const productIsWaste = /\b(waste|scrap|used for recycling|desecho|desperdicio|residuo|chatarra|inservible)\b/.test(product)
  const labelIsWaste = /\b(desperdicio|desecho|residuo|chatarra|inservible)\b/.test(canonical)
  if (!productIsWaste && labelIsWaste) adjustment -= 45

  // Specific chemistry is stronger evidence than generic mentions of batteries.
  if (/\b(lithium ion|lithium|litio|18650)\b/.test(product)) {
    if (/iones? de litio/.test(canonical)) adjustment += 32
    if (/plomo|cadmio|mercurio|pcb/.test(canonicalLeaf) && !/plomo|cadmio|mercurio|pcb/.test(product)) adjustment -= 30
  }

  // Marketplace racket names identify the sport. Do not let the neighboring
  // tennis/badminton children win just because the common heading names them.
  if (/\bpadel\b/.test(product)) {
    if (/\btenis\b/.test(canonicalLeaf)) adjustment -= 32
    if (/\bbadminton\b/.test(canonicalLeaf)) adjustment -= 32
    if (/\bpadel\b/.test(simEvidence)) adjustment += 32
  }

  // A backpack is neither a wallet/card holder nor a handbag. SIM terminal
  // descriptors are official evidence and can resolve otherwise identical 4202
  // parent wording without hard-coding any customs code.
  if (/\b(backpack|rucksack|mochila|school bag)\b/.test(product)) {
    if (/\bmochila/.test(simEvidence)) adjustment += 38
    if (/tarjeter|portachequera|bolso de mano|bolsos de mano|articulos de bolsillo/.test(canonical + ' ' + simEvidence)) adjustment -= 32
  }

  // Desk/table lighting should outrank ceiling/wall/vehicle/emergency branches.
  if (/\b(desk lamp|table lamp|reading light|lampara de mesa|luminaria de mesa)\b/.test(product)) {
    if (/mesa|oficina|cabecera|de pie/.test(canonical)) adjustment += 28
    if (/techo|pared|vehicul|subacuat|emergencia|fotovoltaic/.test(canonical + ' ' + simEvidence)) adjustment -= 28
  }

  // Explicit connector construction separates ordinary USB/data cables from
  // coaxial, ignition, winding, optical and connector-less conductors.
  const connectorCable = /\b(cable|conductor)\b/.test(product) && /\b(connector|connectors|conexion|conectores)\b/.test(product)
  if (connectorCable) {
    if (/provistos? de piezas de conexion/.test(canonicalLeaf)) adjustment += 35
    if (/coaxial|bujia|vehicul|alambre para bobinar|fibra optica/.test(canonical)) adjustment -= 34
    if (/sin piezas de conexion/.test(simEvidence)) adjustment -= 40
  }

  // An AC-to-DC wall charger is a static converter, not a DC-to-DC converter,
  // UPS or transformer. These are objective function contradictions.
  if (/\b(charger|wall charger|power adapter|ac to dc|adaptador de corriente)\b/.test(product)) {
    if (/convertidores? estaticos?/.test(canonical) && /los demas/.test(canonicalLeaf)) adjustment += 14
    if (/convertidores? de corriente continua/.test(canonicalLeaf) && /ac to dc/.test(product)) adjustment -= 26
    if (/alimentacion ininterrumpida|transformador/.test(canonicalLeaf)) adjustment -= 30
  }

  // Portable computers must not drift to generic ADP "units". Subdivision
  // inside the portable branch can still remain ambiguous and be clarified.
  if (/\b(laptop|notebook computer|portable computer)\b/.test(product)) {
    if (/portatil/.test(canonical)) adjustment += 20
    if (/las demas unidades|placas de video|torre|rackeable/.test(canonical + ' ' + simEvidence)) adjustment -= 35
    if (/tableta/.test(simEvidence) && !/\b(tablet|tableta)\b/.test(product)) adjustment -= 10
  }

  return adjustment
}

export function semanticRerankNcmCandidates(candidates: NcmRetrievalCandidate[], facts: NcmProductFacts) {
  return candidates
    .map((candidate) => ({ ...candidate, score: Math.max(0, Math.round((candidate.score + semanticAdjustment(candidate, facts)) * 100) / 100) }))
    .filter((candidate) => candidate.score >= 8)
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
}
