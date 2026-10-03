/**
 * pays.js — la nationalité d'un joueur : drapeau et nom en français, à partir
 * du code à trois lettres que publie FotMob (ESP, ENG, GER…), qui suit
 * l'usage de la FIFA et pas la norme ISO (GER et non DEU, NED et non NLD) ;
 * l'Angleterre, l'Écosse, le pays de Galles et l'Irlande du Nord y ont chacun
 * le leur (01/10/2026).
 */

/** Drapeau publié par FotMob pour ce code (minuscules), ou null. */
export const drapeau = (code) =>
  /^[A-Za-z]{3}$/.test(String(code ?? '')) ? `https://images.fotmob.com/image_resources/logo/teamlogo/${String(code).toLowerCase()}.png` : null;

// Code FIFA (FotMob) -> code ISO à deux lettres, pour le nom du pays en
// français (Intl.DisplayNames). Les pays du Royaume-Uni n'en ont pas : noms à part.
const ISO = {
  AFG: 'AF', ALB: 'AL', ALG: 'DZ', AND: 'AD', ANG: 'AO', ARG: 'AR', ARM: 'AM', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
  BAH: 'BS', BAN: 'BD', BEL: 'BE', BEN: 'BJ', BER: 'BM', BIH: 'BA', BLR: 'BY', BOL: 'BO', BRA: 'BR', BUL: 'BG',
  BFA: 'BF', BDI: 'BI', CAN: 'CA', CHI: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', CGO: 'CG', COL: 'CO',
  CPV: 'CV', CRC: 'CR', CRO: 'HR', CUB: 'CU', CUW: 'CW', CYP: 'CY', CZE: 'CZ', DEN: 'DK', DOM: 'DO', ECU: 'EC',
  EGY: 'EG', EQG: 'GQ', ESP: 'ES', EST: 'EE', ETH: 'ET', FIN: 'FI', FRA: 'FR', FRO: 'FO', GAB: 'GA', GAM: 'GM',
  GEO: 'GE', GER: 'DE', GHA: 'GH', GIB: 'GI', GLP: 'GP', GNB: 'GW', GRE: 'GR', GRN: 'GD', GUA: 'GT', GUI: 'GN',
  GUF: 'GF', GUY: 'GY', HAI: 'HT', HON: 'HN', HUN: 'HU', IDN: 'ID', IND: 'IN', IRL: 'IE', IRN: 'IR', IRQ: 'IQ',
  ISL: 'IS', ISR: 'IL', ITA: 'IT', JAM: 'JM', JOR: 'JO', JPN: 'JP', KAZ: 'KZ', KEN: 'KE', KGZ: 'KG', KOR: 'KR',
  KSA: 'SA', KOS: 'XK', KUW: 'KW', LAT: 'LV', LBN: 'LB', LBR: 'LR', LBY: 'LY', LIE: 'LI', LTU: 'LT', LUX: 'LU',
  MAD: 'MG', MAR: 'MA', MAS: 'MY', MDA: 'MD', MEX: 'MX', MKD: 'MK', MLI: 'ML', MLT: 'MT', MNE: 'ME', MOZ: 'MZ',
  MRI: 'MU', MTN: 'MR', MTQ: 'MQ', NAM: 'NA', NCA: 'NI', NED: 'NL', NGA: 'NG', NIG: 'NE', NOR: 'NO', NZL: 'NZ',
  OMA: 'OM', PAK: 'PK', PAN: 'PA', PAR: 'PY', PER: 'PE', PHI: 'PH', PLE: 'PS', POL: 'PL', POR: 'PT', PRK: 'KP',
  PUR: 'PR', QAT: 'QA', ROU: 'RO', RSA: 'ZA', RUS: 'RU', RWA: 'RW', SEN: 'SN', SLE: 'SL', SLV: 'SV', SMR: 'SM',
  SOM: 'SO', SRB: 'RS', SSD: 'SS', STP: 'ST', SUD: 'SD', SUI: 'CH', SUR: 'SR', SVK: 'SK', SVN: 'SI', SWE: 'SE',
  SYR: 'SY', TAN: 'TZ', THA: 'TH', TJK: 'TJ', TKM: 'TM', TOG: 'TG', TRI: 'TT', TUN: 'TN', TUR: 'TR', UAE: 'AE',
  UGA: 'UG', UKR: 'UA', URU: 'UY', USA: 'US', UZB: 'UZ', VEN: 'VE', VIE: 'VN', ZAM: 'ZM', ZIM: 'ZW', COM: 'KM',
  NCL: 'NC', MYA: 'MM', HKG: 'HK', TPE: 'TW', SGP: 'SG', CTA: 'CF', CHA: 'TD', ERI: 'ER', DJI: 'DJ', LES: 'LS',
  BOT: 'BW', SWZ: 'SZ', MWI: 'MW', BRB: 'BB', BLZ: 'BZ', ARU: 'AW', SKN: 'KN', LCA: 'LC', VIN: 'VC', ATG: 'AG',
  // Écritures propres à FotMob ou doublons rencontrés (Kosovo « KVX »,
  // Lettonie « LVA » comme « LAT », Singapour « SIN »…).
  KVX: 'XK', LVA: 'LV', SIN: 'SG', MON: 'MC', CUR: 'CW', SEY: 'SC', FIJ: 'FJ', PNG: 'PG', SOL: 'SB', TAH: 'PF',
  VAN: 'VU', SAM: 'WS', TGA: 'TO', BHU: 'BT', BRU: 'BN', CAM: 'KH', LAO: 'LA', MDV: 'MV', MNG: 'MN', NEP: 'NP',
  SRI: 'LK', TLS: 'TL', YEM: 'YE', BHR: 'BH', MAC: 'MO', GUM: 'GU', REU: 'RE', MYT: 'YT', SXM: 'SX', DMA: 'DM',
  CAY: 'KY', TCA: 'TC', VGB: 'VG', VIR: 'VI', AIA: 'AI', MSR: 'MS'
};
const SANS_ISO = { ENG: 'Angleterre', SCO: 'Écosse', WAL: 'pays de Galles', NIR: 'Irlande du Nord' };
// Le nom d'usage dans le football plutôt que le nom administratif
// (« Territoires palestiniens », « Congo-Kinshasa »).
const USAGE_FOOTBALL = { PLE: 'Palestine', COD: 'RD Congo', CGO: 'Congo' };

let noms = null;
try {
  noms = new Intl.DisplayNames(['fr'], { type: 'region' });
} catch {
  noms = null; // Navigateur sans Intl.DisplayNames : le nom anglais de FotMob reste.
}

/** Nom du pays en français (« Espagne »), sinon le nom fourni par FotMob, sinon le code. */
export function nomPays(code, repli = null) {
  const c = String(code ?? '').toUpperCase();
  if (SANS_ISO[c] || USAGE_FOOTBALL[c]) return SANS_ISO[c] ?? USAGE_FOOTBALL[c];
  if (ISO[c] && noms) {
    try {
      const nom = noms.of(ISO[c]);
      if (nom) return nom.charAt(0).toUpperCase() + nom.slice(1);
    } catch {
      // Code inconnu de l'API : repli ci-dessous.
    }
  }
  return repli ?? (c || null);
}
