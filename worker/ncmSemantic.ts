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
  const canonicalRaw = index >= 0 ? label.slice(0, index).trim() : label
  const simRaw = index >= 0 ? label.slice(index + marker.length).trim() : ''
  const pathParts = canonicalRaw.split('>').map((item) => item.trim()).filter(Boolean)
  const canonicalLeafRaw = pathParts.at(-1) || canonicalRaw
  // The first path element is usually the very broad heading text repeated in
  // every sibling. For semantic discrimination, keep only the child path.
  const specificPathRaw = pathParts.slice(1).join(' > ')
  return {
    canonical: norm(canonicalRaw),
    canonicalLeaf: norm(canonicalLeafRaw),
    specificPath: norm(specificPathRaw),
    simEvidence: norm(simRaw),
  }
}

export function semanticAdjustment(candidate: NcmRetrievalCandidate, facts: NcmProductFacts) {
  const product = productText(facts)
  const { canonical, canonicalLeaf, specificPath, simEvidence } = parts(candidate.label)
  const specificEvidence = `${specificPath} ${simEvidence}`.trim()
  let adjustment = 0

  const productIsWaste = /\b(waste|scrap|used for recycling|desecho|desperdicio|residuo|chatarra|inservible)\b/.test(product)
  const labelIsWaste = /\b(desperdicio|desecho|residuo|chatarra|inservible)\b/.test(specificEvidence || canonical)
  if (!productIsWaste && labelIsWaste) adjustment -= 45

  if (/\b(lithium ion|lithium|litio|18650)\b/.test(product)) {
    if (/iones? de litio/.test(specificEvidence || canonical)) adjustment += 32
    if (/plomo|cadmio|mercurio|pcb/.test(canonicalLeaf) && !/plomo|cadmio|mercurio|pcb/.test(product)) adjustment -= 30
    if (/desperdicio|desecho|residuo|chatarra/.test(specificEvidence)) adjustment -= 45
  }

  if (/\bpadel\b/.test(product)) {
    const racketEvidence = /\braquet/.test(specificEvidence || canonical)
    if (racketEvidence) adjustment += 48
    else adjustment -= 42
    if (/\btenis\b/.test(canonicalLeaf)) adjustment -= 32
    if (/\bbadminton\b/.test(canonicalLeaf) && !/\braquet/.test(simEvidence)) adjustment -= 20
  }

  // The broad 42.02 heading repeats backpack/wallet/handbag terminology across
  // every sibling, so only child path + SIM identity + exterior material should
  // decide the branch. This uses objective article/material evidence, not codes.
  if (/\b(backpack|rucksack|mochila|school bag)\b/.test(product)) {
    if (/\bmochila/.test(simEvidence)) adjustment += 90
    if (/art\s+culos? de bolsillo|articulos? de bolsillo|tarjeter|portachequera|billetera|portamonedas|pitillera/.test(specificEvidence)) adjustment -= 70
    if (/bolsos? de mano|carteras?/.test(specificPath) && !/\bmochila/.test(simEvidence)) adjustment -= 55

    const textileProduct = /\b(polyester|textile|textil|fabric|tela)\b/.test(product)
    if (textileProduct && /hojas? de plastico o materia textil|materia textil/.test(specificPath)) adjustment += 35
    if (textileProduct && /cuero natural|cuero regenerado/.test(specificPath)) adjustment -= 45
  }

  if (/\b(desk lamp|table lamp|reading light|lampara de mesa|luminaria de mesa)\b/.test(product)) {
    if (/mesa|oficina|cabecera|de pie/.test(specificEvidence)) adjustment += 34
    if (/faros?|sellados?|incandescencia|descarga|tubos?|bombill|techo|pared|vehicul|subacuat|emergencia|fotovoltaic/.test(specificEvidence)) adjustment -= 34
  }

  const connectorCable = /\b(cable|conductor)\b/.test(product) && /\b(connector|connectors|conexion|conectores)\b/.test(product)
  if (connectorCable) {
    if (/provistos? de piezas de conexion/.test(specificEvidence)) adjustment += 40
    if (/coaxial|bujia|vehicul|alambre para bobinar|fibra optica/.test(specificEvidence)) adjustment -= 38
    if (/sin piezas de conexion/.test(simEvidence)) adjustment -= 45
  }

  if (/\b(charger|wall charger|power adapter|ac to dc|adaptador de corriente)\b/.test(product)) {
    if (/convertidores? estaticos?/.test(specificEvidence || canonical) && /los demas/.test(specificEvidence || canonicalLeaf)) adjustment += 20
    if (/convertidores? de corriente continua/.test(specificEvidence) && /ac to dc/.test(product)) adjustment -= 30
    if (/alimentacion ininterrumpida|transformador|motor|generador/.test(specificEvidence)) adjustment -= 35
  }

  if (/\b(smartphone|telefono inteligente|smart phone)\b/.test(product)) {
    if (/telefonos? inteligentes?/.test(specificEvidence || canonical)) adjustment += 42
    if (/router|switch|modem|estacion base|aparatos para recepcion conversion/.test(specificEvidence)) adjustment -= 35
  }

  if (/\b(laptop|notebook computer|portable computer)\b/.test(product)) {
    if (/portatil/.test(specificEvidence || canonical)) adjustment += 24
    if (/las demas unidades|placas de video|torre|rackeable/.test(specificEvidence)) adjustment -= 35
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
