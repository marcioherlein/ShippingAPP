import type { CustomsProfile } from './customsClassification'

export type ProductRequirement = {
  id: string
  status: 'pass' | 'verify' | 'blocker' | 'info'
  title: string
  explanation: string
  nextStep: string
  source: 'ARCA' | 'CIVUCE' | 'VUCE'
}

export function buildProductRequirements(customs: CustomsProfile, originCountry: string | null | undefined): ProductRequirement[] {
  const ncm = customs.ncmCandidate
  const origin = (originCountry || '').trim()

  if (!ncm) {
    return [{
      id: 'classification-first', status: 'blocker', title: 'Resolver clasificación arancelaria antes de cerrar requisitos',
      explanation: 'Intervenciones, alícuotas, prohibiciones, preferencias y parte de los reglamentos técnicos dependen de la posición arancelaria. Sin NCM candidata suficiente, ShippingAPP no extrapola requisitos desde otro producto.',
      nextStep: 'Completar los datos faltantes del producto o usar Expert Override con una NCM trazable.', source: 'VUCE',
    }]
  }

  const tariffExplanation = customs.classificationConfidence === 'low'
    ? 'Existe un candidato NCM, pero su confianza es LOW. ShippingAPP retiene deliberadamente la alícuota del cálculo económico hasta fortalecer la clasificación o recibir evidencia manual; no es ausencia de tasa, es un gate de confianza.'
    : customs.dutyRatePct === null
      ? 'La clasificación candidata no tiene una alícuota utilizable en la evidencia cargada; no se completa con un porcentaje genérico.'
      : `El screening usa ${customs.dutyRatePct}% como derecho candidato. La alícuota final puede depender de actualización normativa, origen, régimen o preferencia aplicable.`

  const simCandidate = customs.simOpeningCandidate
  const simConfidence = customs.simOpeningConfidence ?? 'missing'
  const simUsableForLookup = !!simCandidate && (simConfidence === 'high' || simConfidence === 'medium')
  const customsLookupCode = simUsableForLookup ? simCandidate!.code : ncm
  const simRequirement: ProductRequirement = simCandidate
    ? {
        id: 'sim-opening', status: 'verify', title: `Confirmar apertura SIM candidata ${simCandidate.code}`,
        explanation: `ShippingAPP encontró una apertura oficial dentro de la NCM ${ncm}: ${simCandidate.description}. Confidence ${simConfidence.toUpperCase()}. La apertura SIM mejora la precisión declarativa y de intervenciones, pero la salida automática no constituye una clasificación vinculante.`,
        nextStep: simUsableForLookup
          ? 'Contrastar la apertura con la ficha técnica y la nomenclatura vigente antes de oficializar la destinación o resolver intervenciones asociadas.'
          : 'La apertura puede mostrarse como hipótesis, pero por su baja confianza no se usa como referencia automática más específica; fortalecer evidencia antes de apoyarse en el sufijo.',
        source: 'ARCA',
      }
    : {
        id: 'sim-opening', status: 'verify', title: 'Confirmar si corresponde una apertura SIM más específica',
        explanation: simConfidence === 'low'
          ? `La NCM ${ncm} se conserva, pero ShippingAPP detectó conflicto o evidencia insuficiente entre aperturas SIM. No se eligió un sufijo automático para evitar falsa precisión.`
          : `La NCM ${ncm} está identificada, pero no quedó una apertura SIM automática suficientemente sustentada. Esto no invalida la NCM; significa que el detalle declarativo debe revisarse por separado.`,
        nextStep: 'Revisar las aperturas SIM oficiales de la NCM y aportar las características técnicas que permitan distinguirlas.', source: 'ARCA',
      }

  const requirements: ProductRequirement[] = [
    {
      id: 'tariff-current', status: 'verify', title: `Confirmar alícuota vigente para NCM ${ncm}`,
      explanation: tariffExplanation,
      nextStep: 'Contrastar la posición y alícuota contra el Arancel Integrado vigente al momento del análisis.', source: 'ARCA',
    },
    simRequirement,
    {
      id: 'interventions', status: 'verify', title: 'Consultar intervenciones previas y organismos',
      explanation: 'CIVUCE vincula posiciones arancelarias con intervenciones potenciales de organismos. La NCM o apertura SIM sola no demuestra que una intervención aplique o no al producto concreto.',
      nextStep: `Consultar ${customsLookupCode} para importación en CIVUCE y revisar cada intervención contra las características del producto.${simCandidate && !simUsableForLookup ? ` La SIM ${simCandidate.code} queda como hipótesis LOW y no reemplaza la NCM en este paso.` : ''}`, source: 'CIVUCE',
    },
    {
      id: 'prohibitions', status: 'verify', title: 'Revisar prohibiciones y restricciones asociadas',
      explanation: 'CIVUCE informa normativa sobre prohibiciones potencialmente asociada a la mercadería. ShippingAPP no interpreta “sin dato” como “sin prohibición”.',
      nextStep: `Revisar prohibiciones de importación vinculadas a ${customsLookupCode} y su alcance material.`, source: 'CIVUCE',
    },
    {
      id: 'trade-remedies', status: 'verify', title: 'Revisar antidumping, compensatorios y medidas específicas',
      explanation: 'Una posición puede estar afectada por medidas de defensa comercial cuyo alcance depende también de descripción, origen y productor/exportador.',
      nextStep: `Buscar medidas vigentes para ${ncm}${origin ? ` con origen ${origin}` : ''} antes de cerrar landed cost.`, source: 'CIVUCE',
    },
    {
      id: 'technical-regulations', status: 'verify', title: 'Determinar reglamentos técnicos / certificaciones aplicables',
      explanation: 'La posición ayuda a descubrir normativa, pero el alcance material puede depender de tensión, potencia, composición, uso, edad del usuario, contacto con alimentos u otras características.',
      nextStep: 'Revisar normativa e intervenciones asociadas y comparar el alcance con la ficha técnica real del producto.', source: 'VUCE',
    },
  ]

  if (!origin) {
    requirements.push({
      id: 'origin', status: 'verify', title: 'Confirmar país y prueba de origen',
      explanation: 'El origen no debe inferirse desde la plataforma de venta. Puede cambiar preferencias arancelarias, medidas de defensa comercial y documentación.',
      nextStep: 'Obtener origen declarado y, si se pretende una preferencia, verificar regla y prueba de origen.', source: 'CIVUCE',
    })
  } else if (customs.statisticsPreferenceStatus === 'verify_origin') {
    requirements.push({
      id: 'origin', status: 'verify', title: `Posible tratamiento preferencial por origen ${origin}`,
      explanation: 'El país declarado no activa por sí solo una preferencia o exención. Deben cumplirse la regla de origen y la documentación correspondiente.',
      nextStep: 'Consultar preferencia por NCM/origen y conservar la prueba de origen exigible.', source: 'CIVUCE',
    })
  } else {
    requirements.push({
      id: 'origin', status: 'info', title: `Origen usado para screening: ${origin}`,
      explanation: 'ShippingAPP no aplicó automáticamente una preferencia por el solo país informado.',
      nextStep: 'Revalidar origen si cambia proveedor, fábrica o ruta de abastecimiento.', source: 'CIVUCE',
    })
  }

  if (customs.classificationConfidence !== 'high' || customs.missingFacts.length > 0) {
    requirements.unshift({
      id: 'classification-evidence', status: 'verify', title: 'Fortalecer evidencia de clasificación',
      explanation: customs.missingFacts.length
        ? `Faltan datos que pueden ser relevantes: ${customs.missingFacts.join('; ')}.`
        : 'La clasificación es candidata y no constituye una consulta vinculante.',
      nextStep: 'Revisar ficha técnica, notas, reglas interpretativas y criterios/resoluciones de clasificación comparables antes de declarar.', source: 'CIVUCE',
    })
  }

  return requirements
}
