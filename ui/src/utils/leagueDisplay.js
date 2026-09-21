// Codes courts affichés dans un badge plutôt que des drapeaux emoji — rendu
// incohérent selon les polices système (Windows en particulier).
const COUNTRY_CODES = {
  spain: 'ESP',
  england: 'ENG',
  france: 'FRA',
  germany: 'GER',
  italy: 'ITA',
  portugal: 'POR',
  netherlands: 'NED',
  russia: 'RUS',
  china: 'CHN',
  brazil: 'BRA',
  argentina: 'ARG',
  belgium: 'BEL',
  turkey: 'TUR',
  scotland: 'SCO',
  greece: 'GRE',
  poland: 'POL',
  usa: 'USA',
  // Le repli — trois premières lettres du pays — donne le bon code par
  // hasard pour la Finlande ou la Norvège, mais se trompe partout où le code
  // FIFA ne suit pas l'anglais : « Romania » donnerait ROM au lieu de ROU,
  // « Serbia » SER au lieu de SRB, « Latvia » LAT au lieu de LVA.
  finland: 'FIN',
  norway: 'NOR',
  sweden: 'SWE',
  denmark: 'DEN',
  austria: 'AUT',
  switzerland: 'SUI',
  croatia: 'CRO',
  czechia: 'CZE',
  iceland: 'ISL',
  ireland: 'IRL',
  israel: 'ISR',
  latvia: 'LVA',
  romania: 'ROU',
  serbia: 'SRB',
  slovakia: 'SVK',
  // Amériques.
  argentina: 'ARG',
  bolivia: 'BOL',
  canada: 'CAN',
  chile: 'CHI',
  colombia: 'COL',
  ecuador: 'ECU',
  mexico: 'MEX',
  paraguay: 'PAR',
  peru: 'PER',
  venezuela: 'VEN'
};

/** Découpe "La Liga - Spain" en {name: "La Liga", country: "Spain"} ; "EFL Cup" reste tel quel, sans pays. */
export function parseLeagueLabel(sportTitle) {
  if (!sportTitle) return { name: 'Compétition', country: null, countryCode: null };

  const separatorIndex = sportTitle.lastIndexOf(' - ');
  if (separatorIndex === -1) return { name: sportTitle, country: null, countryCode: null };

  const name = sportTitle.slice(0, separatorIndex);
  const country = sportTitle.slice(separatorIndex + 3);
  return { name, country, countryCode: COUNTRY_CODES[country.toLowerCase()] ?? country.slice(0, 3).toUpperCase() };
}

/**
 * Libellé lisible et NON AMBIGU, pour une liste où plusieurs pays coexistent :
 * le nom seul ne suffit plus dès que le magasin contient la Russie et la Chine
 * ("Premier League" et "Super League" se confondraient avec l'anglaise et la
 * grecque). Le pays n'est ajouté que lorsqu'il existe.
 */
export function formatLeagueOptionLabel(sportTitle) {
  const { name, countryCode } = parseLeagueLabel(sportTitle);
  return countryCode ? `${name} (${countryCode})` : name;
}

/** Regroupe une liste de matchs adaptés par libellé de compétition, en conservant l'ordre d'apparition. */
export function groupMatchesByLeague(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = match.league || 'Autres rencontres';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return [...groups.entries()].map(([league, leagueMatches]) => ({ league, matches: leagueMatches }));
}

/**
 * Regroupe une liste de matchs (déjà triée par coup d'envoi) par jour, pour
 * afficher une seule date en en-tête plutôt que de la répéter sur chaque
 * ligne — l'ordre d'apparition est conservé, donc un tri préalable des
 * matchs par date est supposé.
 */
export function groupMatchesByDate(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = match.commenceTime ? match.commenceTime.slice(0, 10) : 'Date inconnue';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return [...groups.entries()].map(([dayKey, dayMatches]) => ({ dayKey, matches: dayMatches }));
}
