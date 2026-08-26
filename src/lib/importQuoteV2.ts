export type ImportPurpose = 'own_use' | 'resale'
export type ImportActor = 'company' | 'individual'
export type ImporterSignatureStatus = 'has_importer_signature' | 'no_importer_signature'
export type SensitiveCategory = 'none' | 'food' | 'toys' | 'cosmetics' | 'medicine' | 'supplements'
export type TransportModeV2 = 'lcl' | 'air' | 'fcl_reference'

export type ImportChecklistV2 = {
  purpose: ImportPurpose
  actor: ImportActor
  importerSignature: ImporterSignatureStatus
  sensitiveCategory: SensitiveCategory
}

export type FreightCatalogRate = {
  country: string
  capital: string
  region: string
  fclUsdContainer: number
  lclUsdCbm: number
  airUsdKg: number
  airMinimumUsd: number
}

export type ImportQuoteInputV2 = ImportChecklistV2 & {
  originCountry: string
  quantity: number
  unitPriceUsd: number
  unitWeightKg: number
  unitVolumeCbm: number
  dutyRatePct: number
  statisticsRatePct: number
  vatRatePct: number
  vatAdditionalRatePct: number
  gainsRatePct: number
  iibbRatePct: number
  marketPriceUsd?: number
}

export type ImportQuoteLineV2 = {
  mode: TransportModeV2
  label: string
  freightUsd: number
  freightBasis: string
  fobUsd: number
  cifUsd: number
  importDutyUsd: number
  statisticsFeeUsd: number
  vatBaseUsd: number
  vatUsd: number
  vatAdditionalUsd: number
  gainsUsd: number
  iibbUsd: number
  fixedChargesUsd: number
  noImporterSignatureUsd: number
  sensitiveCategoryUsd: number
  finalCostUsd: number
  finalUnitCostUsd: number
  marginPct: number | null
  assumptions: string[]
}

export type ImportQuoteV2 = {
  checklist: {
    required: string[]
    warnings: string[]
    sensitiveCategoryRequiresExtraReview: boolean
  }
  originRate: FreightCatalogRate
  quotes: ImportQuoteLineV2[]
  comparison: {
    recommendedMode: TransportModeV2
    lclVsAirDeltaUsd: number | null
    lclVsAirDeltaPct: number | null
    fclReferenceIncluded: boolean
  }
}

export const SENSITIVE_CATEGORIES: SensitiveCategory[] = ['food', 'toys', 'cosmetics', 'medicine', 'supplements']

const FREIGHT_CATALOG: FreightCatalogRate[] = [{"country":"Afganistán","capital":"Kabul","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Albania","capital":"Tirana","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Alemania","capital":"Berlín","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":5,"airMinimumUsd":170},{"country":"Andorra","capital":"Andorra la Vieja","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Angola","capital":"Luanda","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Antigua y Barbuda","capital":"Saint John","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Arabia Saudita","capital":"Riad","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Argelia","capital":"Argel","region":"África","fclUsdContainer":3000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Armenia","capital":"Ereván","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Australia","capital":"Canberra","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Austria","capital":"Viena","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Azerbaiyán","capital":"Bakú","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bahamas","capital":"Nasáu","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bangladés","capital":"Daca","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Barbados","capital":"Bridgetown","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Baréin","capital":"Manama","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bélgica","capital":"Bruselas","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Belice","capital":"Belmopán","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Benín","capital":"Porto Novo","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bielorrusia","capital":"Minsk","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Birmania (Myanmar)","capital":"Naipyidó","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bolivia","capital":"Sucre","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bosnia y Herzegovina","capital":"Sarajevo","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Botsuana","capital":"Gaborone","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Brasil","capital":"Brasilia","region":"América del Sur","fclUsdContainer":800,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Brunéi","capital":"Bandar Seri Begawan","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bulgaria","capital":"Sofía","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Burkina Faso","capital":"Uagadugú","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Burundi","capital":"Gitega","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Bután","capital":"Timbu","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Cabo Verde","capital":"Praia","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Camboya","capital":"Nom Pen","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Camerún","capital":"Yaundé","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Canadá","capital":"Ottawa","region":"América del Norte","fclUsdContainer":4500,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Catar","capital":"Doha","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Chad","capital":"Yamena","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Chile","capital":"Santiago","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"China","capital":"Shanghai","region":"Asia","fclUsdContainer":9600,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":150},{"country":"Chipre","capital":"Nicosia","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Colombia","capital":"Bogotá","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Comoras","capital":"Moroni","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Congo (Brazzaville)","capital":"Brazzaville","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Congo (Kinshasa)","capital":"Kinshasa","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Corea del Norte","capital":"Pionyang","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Corea del Sur","capital":"Seúl","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Costa de Marfil","capital":"Yamusukro","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Costa Rica","capital":"San José","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Croacia","capital":"Zagreb","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Cuba","capital":"La Habana","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Dinamarca","capital":"Copenhague","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Dominica","capital":"Roseau","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Ecuador","capital":"Quito","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Egipto","capital":"El Cairo","region":"África","fclUsdContainer":3000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"El Salvador","capital":"San Salvador","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Emiratos Árabes Unidos","capital":"Abu Dabi","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Eritrea","capital":"Asmara","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Eslovaquia","capital":"Bratislava","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Eslovenia","capital":"Liubliana","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"España","capital":"Madrid","region":"Europa","fclUsdContainer":3000,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Estados Unidos","capital":"Washington D.C.","region":"América del Norte","fclUsdContainer":4000,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Estonia","capital":"Tallin","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Etiopía","capital":"Adís Abeba","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Filipinas","capital":"Manila","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Finlandia","capital":"Helsinki","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Fiyi","capital":"Suva","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Francia","capital":"París","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Gabón","capital":"Libreville","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Gambia","capital":"Banjul","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Georgia","capital":"Tiflis","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Ghana","capital":"Acra","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Granada","capital":"Saint George","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Grecia","capital":"Atenas","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Guatemala","capital":"Ciudad de Guatemala","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Guinea","capital":"Conakri","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Guinea-Bisáu","capital":"Bisáu","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Guinea Ecuatorial","capital":"Malabo","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Guyana","capital":"Georgetown","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Haití","capital":"Puerto Príncipe","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Honduras","capital":"Tegucigalpa","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Hungría","capital":"Budapest","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"India","capital":"Nueva Delhi","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Indonesia","capital":"Yakarta","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Irak","capital":"Bagdad","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Irán","capital":"Teherán","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Irlanda","capital":"Dublín","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Islandia","capital":"Reikiavik","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Islas Marshall","capital":"Majuro","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Islas Salomón","capital":"Honiara","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Israel","capital":"Jerusalén","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Italia","capital":"Roma","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Jamaica","capital":"Kingston","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Japón","capital":"Tokio","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Jordania","capital":"Amán","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Kazajistán","capital":"Astaná","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Kenia","capital":"Nairobi","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Kirguistán","capital":"Biskek","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Kiribati","capital":"Tarawa","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Kuwait","capital":"Kuwait","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Laos","capital":"Vientián","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Lesoto","capital":"Maseru","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Letonia","capital":"Riga","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Líbano","capital":"Beirut","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Liberia","capital":"Monrovia","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Libia","capital":"Trípoli","region":"África","fclUsdContainer":3000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Liechtenstein","capital":"Vaduz","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Lituania","capital":"Vilna","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Luxemburgo","capital":"Luxemburgo","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Macedonia del Norte","capital":"Skopie","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Madagascar","capital":"Antananarivo","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Malasia","capital":"Kuala Lumpur","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Malaui","capital":"Lilongüe","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Maldivas","capital":"Malé","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Malí","capital":"Bamako","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Malta","capital":"La Valeta","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Marruecos","capital":"Rabat","region":"África","fclUsdContainer":3000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Mauricio","capital":"Port Louis","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Mauritania","capital":"Nuakchot","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"México","capital":"Ciudad de México","region":"América del Norte","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Micronesia","capital":"Palikir","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Moldavia","capital":"Chisináu","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Mónaco","capital":"Mónaco","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Mongolia","capital":"Ulán Bator","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Montenegro","capital":"Podgorica","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Mozambique","capital":"Maputo","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Namibia","capital":"Windhoek","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Nauru","capital":"Yaren","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Nepal","capital":"Katmandú","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Nicaragua","capital":"Managua","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Níger","capital":"Niamey","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Nigeria","capital":"Abuya","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Noruega","capital":"Oslo","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Nueva Zelanda","capital":"Wellington","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Omán","capital":"Mascate","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Países Bajos","capital":"Ámsterdam","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Pakistán","capital":"Islamabad","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Palaos","capital":"Ngerulmud","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Panamá","capital":"Ciudad de Panamá","region":"América Central","fclUsdContainer":4000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Papúa Nueva Guinea","capital":"Puerto Moresby","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Paraguay","capital":"Asunción","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Perú","capital":"Lima","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Polonia","capital":"Varsovia","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Portugal","capital":"Lisboa","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Reino Unido","capital":"Londres","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"República Centroafricana","capital":"Bangui","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"República Checa","capital":"Praga","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"República Dominicana","capital":"Santo Domingo","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Ruanda","capital":"Kigali","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Rumanía","capital":"Bucarest","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Rusia","capital":"Moscú","region":"Europa/Asia","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Samoa","capital":"Apia","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"San Cristóbal y Nieves","capital":"Basseterre","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"San Marino","capital":"San Marino","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"San Vicente y las Granadinas","capital":"Kingstown","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Santa Lucía","capital":"Castries","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Santo Tomé y Príncipe","capital":"Santo Tomé","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Senegal","capital":"Dakar","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Serbia","capital":"Belgrado","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Seychelles","capital":"Victoria","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Sierra Leona","capital":"Freetown","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Singapur","capital":"Singapur","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Siria","capital":"Damasco","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Somalia","capital":"Mogadiscio","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Sri Lanka","capital":"Sri Jayewardenepura Kotte","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Suazilandia (Esuatini)","capital":"Mbabane","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Sudáfrica","capital":"Pretoria","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Sudán","capital":"Jartum","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Sudán del Sur","capital":"Yuba","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Suecia","capital":"Estocolmo","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Suiza","capital":"Berna","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Surinam","capital":"Paramaribo","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Tailandia","capital":"Bangkok","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Tanzania","capital":"Dodoma","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Tayikistán","capital":"Dusambé","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Timor Oriental","capital":"Dili","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Togo","capital":"Lomé","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Tonga","capital":"Nukualofa","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Trinidad y Tobago","capital":"Puerto España","region":"Caribe","fclUsdContainer":5000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Túnez","capital":"Túnez","region":"África","fclUsdContainer":3000,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Turkmenistán","capital":"Asjabad","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Turquía","capital":"Ankara","region":"Asia/Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Tuvalu","capital":"Funafuti","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Ucrania","capital":"Kiev","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Uganda","capital":"Kampala","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Uruguay","capital":"Montevideo","region":"América del Sur","fclUsdContainer":800,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Uzbekistán","capital":"Taskent","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Vanuatu","capital":"Port Vila","region":"Oceanía","fclUsdContainer":8000,"lclUsdCbm":120,"airUsdKg":8,"airMinimumUsd":170},{"country":"Vaticano","capital":"Ciudad del Vaticano","region":"Europa","fclUsdContainer":1200,"lclUsdCbm":50,"airUsdKg":8,"airMinimumUsd":170},{"country":"Venezuela","capital":"Caracas","region":"América del Sur","fclUsdContainer":2500,"lclUsdCbm":15,"airUsdKg":8,"airMinimumUsd":170},{"country":"Vietnam","capital":"Hanói","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Yemen","capital":"Saná","region":"Asia","fclUsdContainer":7500,"lclUsdCbm":200,"airUsdKg":8,"airMinimumUsd":170},{"country":"Yibuti","capital":"Yibuti","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Zambia","capital":"Lusaka","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170},{"country":"Zimbabue","capital":"Harare","region":"África","fclUsdContainer":2500,"lclUsdCbm":75,"airUsdKg":8,"airMinimumUsd":170}]

const EXPENSES = {"fcl":{"fixedChargesUsd":[{"label":"Gastos Destino","amountUsd":1000},{"label":"Gastos de Aduana","amountUsd":400},{"label":"Despacho de Importacion","amountUsd":300},{"label":"Terminal","amountUsd":2000}],"noImporterSignatureUsd":200,"sensitiveCategoryUsd":200},"lcl":{"fixedChargesUsd":[{"label":"Gastos Destino","amountUsd":400},{"label":"Gastos de Aduana","amountUsd":400},{"label":"Despacho de Importacion","amountUsd":300},{"label":"Deposito Fiscal","amountUsd":1000}],"noImporterSignatureUsd":200,"sensitiveCategoryUsd":200},"air":{"fixedChargesUsd":[{"label":"Gastos Destino","amountUsd":350},{"label":"Gastos de Aduana","amountUsd":400},{"label":"Despacho de Importacion","amountUsd":300},{"label":"TCA","amountUsd":350}],"noImporterSignatureUsd":200,"sensitiveCategoryUsd":200}} as const

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function getFreightRate(originCountry: string): FreightCatalogRate {
  const normalized = normalize(originCountry)
  const rate = FREIGHT_CATALOG.find((item) => normalize(item.country) === normalized)
  if (!rate) throw new Error(`No freight rate configured for origin country: ${originCountry}`)
  return rate
}

export function buildImportChecklistV2(input: Partial<ImportChecklistV2>) {
  const required = [
    'Uso: propio o reventa',
    'Importador: empresa o persona humana',
    'Firma importadora: tiene o no tiene',
    'Categoría regulada: alimentos, juguetes, cosméticos, medicamentos o suplementos',
  ]
  const warnings: string[] = []
  if (!input.purpose) warnings.push('Falta definir si es uso propio o reventa.')
  if (!input.actor) warnings.push('Falta definir si importa una empresa o una persona humana.')
  if (!input.importerSignature) warnings.push('Falta definir si cuenta con firma importadora.')
  if (!input.sensitiveCategory) warnings.push('Falta definir si el producto cae en categoría regulada.')
  const sensitiveCategoryRequiresExtraReview = !!input.sensitiveCategory && input.sensitiveCategory !== 'none'
  if (sensitiveCategoryRequiresExtraReview) {
    warnings.push('Categoría sensible: alimentos, juguetes, cosméticos, medicamentos y suplementos requieren control extra antes de cotizar como importación simple.')
  }
  if (input.importerSignature === 'no_importer_signature') {
    warnings.push('Sin firma importadora: se agrega gasto adicional del Excel y se debe resolver quién firma la operación.')
  }
  return { required, warnings, sensitiveCategoryRequiresExtraReview }
}

function pct(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) / 100 : 0
}

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

function expenseFor(mode: TransportModeV2) {
  if (mode === 'fcl_reference') return EXPENSES.fcl
  return mode === 'air' ? EXPENSES.air : EXPENSES.lcl
}

function fixedCharges(mode: TransportModeV2) {
  return expenseFor(mode).fixedChargesUsd.reduce((sum, item) => sum + item.amountUsd, 0)
}

function chargeableLclCbm(quantity: number, unitWeightKg: number, unitVolumeCbm: number) {
  const totalCbm = Math.max(0, quantity * unitVolumeCbm)
  const weightMeasurement = Math.max(0, quantity * unitWeightKg) / 1000
  return Math.max(totalCbm, weightMeasurement)
}

function chargeableAirKg(quantity: number, unitWeightKg: number, unitVolumeCbm: number) {
  const actualWeightKg = Math.max(0, quantity * unitWeightKg)
  const volumetricKg = Math.max(0, quantity * unitVolumeCbm) * (1000 / 6)
  return Math.max(actualWeightKg, volumetricKg)
}

export function calculateFreightV2(mode: TransportModeV2, input: ImportQuoteInputV2, rate = getFreightRate(input.originCountry)) {
  if (mode === 'fcl_reference') {
    return {
      freightUsd: rate.fclUsdContainer,
      basis: 'FCL referencia: valor por contenedor completo del Excel.',
    }
  }
  if (mode === 'lcl') {
    const cbm = chargeableLclCbm(input.quantity, input.unitWeightKg, input.unitVolumeCbm)
    return {
      freightUsd: cbm * rate.lclUsdCbm,
      basis: `LCL: ${cbm.toFixed(3)} W/M × USD ${rate.lclUsdCbm} por CBM/W/M.`,
    }
  }
  const kg = chargeableAirKg(input.quantity, input.unitWeightKg, input.unitVolumeCbm)
  const variable = kg * rate.airUsdKg
  return {
    freightUsd: Math.max(variable, rate.airMinimumUsd),
    basis: variable < rate.airMinimumUsd
      ? `Aéreo: mínimo USD ${rate.airMinimumUsd} aplicado sobre ${kg.toFixed(1)} kg cobrables.`
      : `Aéreo: ${kg.toFixed(1)} kg cobrables × USD ${rate.airUsdKg}/kg.`,
  }
}

export function calculateImportQuoteLineV2(mode: TransportModeV2, input: ImportQuoteInputV2, rate = getFreightRate(input.originCountry)): ImportQuoteLineV2 {
  const freight = calculateFreightV2(mode, input, rate)
  const fobUsd = input.quantity * input.unitPriceUsd
  const cifUsd = fobUsd + freight.freightUsd
  const importDutyUsd = cifUsd * pct(input.dutyRatePct)
  const statisticsFeeUsd = cifUsd * pct(input.statisticsRatePct)
  const vatBaseUsd = cifUsd + importDutyUsd + statisticsFeeUsd
  const vatUsd = vatBaseUsd * pct(input.vatRatePct)
  const vatAdditionalUsd = vatBaseUsd * pct(input.vatAdditionalRatePct)
  const gainsUsd = vatBaseUsd * pct(input.gainsRatePct)
  const iibbUsd = vatBaseUsd * pct(input.iibbRatePct)
  const modeExpenses = expenseFor(mode)
  const fixedChargesUsd = fixedCharges(mode)
  const noImporterSignatureUsd = input.importerSignature === 'no_importer_signature' ? modeExpenses.noImporterSignatureUsd : 0
  const sensitiveCategoryUsd = input.sensitiveCategory !== 'none' ? modeExpenses.sensitiveCategoryUsd : 0
  const finalCostUsd = vatBaseUsd + vatUsd + vatAdditionalUsd + gainsUsd + iibbUsd + fixedChargesUsd + noImporterSignatureUsd + sensitiveCategoryUsd
  const finalUnitCostUsd = input.quantity > 0 ? finalCostUsd / input.quantity : 0
  const marketPriceUsd = input.marketPriceUsd && input.marketPriceUsd > 0 ? input.marketPriceUsd : null
  const marginPct = marketPriceUsd ? (marketPriceUsd - finalUnitCostUsd) / marketPriceUsd : null
  return {
    mode,
    label: mode === 'lcl' ? 'LCL · espacio en contenedor' : mode === 'air' ? 'Aéreo' : 'FCL · referencia contenedor entero',
    freightUsd: round2(freight.freightUsd),
    freightBasis: freight.basis,
    fobUsd: round2(fobUsd),
    cifUsd: round2(cifUsd),
    importDutyUsd: round2(importDutyUsd),
    statisticsFeeUsd: round2(statisticsFeeUsd),
    vatBaseUsd: round2(vatBaseUsd),
    vatUsd: round2(vatUsd),
    vatAdditionalUsd: round2(vatAdditionalUsd),
    gainsUsd: round2(gainsUsd),
    iibbUsd: round2(iibbUsd),
    fixedChargesUsd: round2(fixedChargesUsd),
    noImporterSignatureUsd: round2(noImporterSignatureUsd),
    sensitiveCategoryUsd: round2(sensitiveCategoryUsd),
    finalCostUsd: round2(finalCostUsd),
    finalUnitCostUsd: round2(finalUnitCostUsd),
    marginPct,
    assumptions: [
      freight.basis,
      'CIF = FOB + flete internacional, según estructura del Excel recibido.',
      'Base IVA = CIF + Derecho de Importación + Tasa de Estadística.',
      'Costo final = Base IVA + IVA + percepciones + gastos fijos + extras por firma/categoría.',
    ],
  }
}

export function calculateImportQuoteV2(input: ImportQuoteInputV2): ImportQuoteV2 {
  const originRate = getFreightRate(input.originCountry)
  const checklist = buildImportChecklistV2(input)
  const quotes = [
    calculateImportQuoteLineV2('lcl', input, originRate),
    calculateImportQuoteLineV2('air', input, originRate),
    calculateImportQuoteLineV2('fcl_reference', input, originRate),
  ]
  const lcl = quotes.find((q) => q.mode === 'lcl')
  const air = quotes.find((q) => q.mode === 'air')
  const recommended = [lcl, air].filter(Boolean).sort((a, b) => a!.finalCostUsd - b!.finalCostUsd)[0]!
  const lclVsAirDeltaUsd = lcl && air ? round2(air.finalCostUsd - lcl.finalCostUsd) : null
  const lclVsAirDeltaPct = lcl && air && air.finalCostUsd > 0 ? (air.finalCostUsd - lcl.finalCostUsd) / air.finalCostUsd : null
  return {
    checklist,
    originRate,
    quotes,
    comparison: {
      recommendedMode: recommended.mode,
      lclVsAirDeltaUsd,
      lclVsAirDeltaPct,
      fclReferenceIncluded: true,
    },
  }
}
