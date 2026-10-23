/**
 * vosBookmakers.js — les noms de VOS bookmakers (The Odds API), tels que l'appli les montre. Pur, sans Vue ni navigateur.
 * -----------------------------------------------------------------------
 * UNE seule liste : celle que Réglages › « Vos bookmakers » (EngineConfigForm) fait cocher, déplacée ici pour que la page
 * Bookmakers (étape 31, retouche du 22/10/2026) dise les mêmes noms — « Winamax (FR) », « PMU », « Betclic » — au lieu
 * des clés de l'API (« winamax_fr », « pmu_fr », « betclic_fr »).
 *
 * Les clés que Réglages ne propose pas mais que vos relevés contiennent (la page Bookmakers lit tout ce qui est archivé,
 * pas seulement ce qui est coché) prennent le titre que The Odds API leur donne (son relevé du 21/09/2026 :
 * server/data/fixtures/odds/odds-snapshot.json), avec une seule exception, dite plus bas. Une clé jamais vue reçoit un
 * nom lisible fabriqué (`titreParDefaut`) : « mot_mot » ne s'affiche jamais.
 * -----------------------------------------------------------------------
 */

/**
 * Les bookmakers où un pari peut être recommandé (Réglages › Vos bookmakers) : leur clé The Odds API, leur nom, leur
 * groupe (« fiable » : réglementé par une autorité européenne ; « france » : agréé en France, marge 11 à 15 % ; « autre »).
 */
export const BOOKMAKERS = Object.freeze(
  [
    { key: 'williamhill', title: 'William Hill', groupe: 'fiable' },
    { key: 'sport888', title: '888sport', groupe: 'fiable' },
    { key: 'betsson', title: 'Betsson', groupe: 'fiable' },
    { key: 'nordicbet', title: 'Nordic Bet', groupe: 'fiable' },
    { key: 'unibet_nl', title: 'Unibet (NL)', groupe: 'fiable' },
    { key: 'unibet_se', title: 'Unibet (SE)', groupe: 'fiable' },
    { key: 'leovegas_se', title: 'LeoVegas (SE)', groupe: 'fiable' },
    { key: 'tipico_de', title: 'Tipico', groupe: 'fiable' },
    { key: 'coolbet', title: 'Coolbet', groupe: 'fiable' },
    { key: 'codere_it', title: 'Codere (IT)', groupe: 'fiable' },
    { key: 'betclic_fr', title: 'Betclic', groupe: 'france' },
    { key: 'unibet_fr', title: 'Unibet (FR)', groupe: 'france' },
    { key: 'winamax_fr', title: 'Winamax (FR)', groupe: 'france' },
    { key: 'pmu_fr', title: 'PMU', groupe: 'france' },
    { key: 'marathonbet', title: 'Marathon Bet', groupe: 'autre' },
    { key: 'onexbet', title: '1xBet', groupe: 'autre' }
  ].map((b) => Object.freeze(b))
);

/**
 * Les autres clés de vos relevés : le titre que The Odds API leur donne — sauf `betfair_ex_eu`, que l'API appelle
 * « Betfair » : c'est la bourse que l'appli nomme « Betfair Exchange » partout ailleurs (football-data, freeMarketOdds.js
 * l'associe à cette clé), avec la région de la clé, comme « Winamax (DE) ».
 */
export const AUTRES_TITRES = Object.freeze({
  winamax_de: 'Winamax (DE)',
  betfair_ex_eu: 'Betfair Exchange (EU)',
  pinnacle: 'Pinnacle',
  mybookieag: 'MyBookie.ag',
  betonlineag: 'BetOnline.ag',
  betanysports: 'BetAnything',
  suprabets: 'Suprabets',
  everygame: 'Everygame',
  gtbets: 'GTbets'
});

/** Un nom lisible pour une clé jamais vue : les mots en majuscule initiale, la région (deux lettres) entre parenthèses — « foo_bar_nl » donne « Foo Bar (NL) ». */
export function titreParDefaut(cle) {
  const mots = String(cle ?? '')
    .split('_')
    .filter(Boolean);
  if (!mots.length) return String(cle ?? '');
  const region = mots.length > 1 && /^[a-z]{2}$/i.test(mots.at(-1)) ? mots.pop().toUpperCase() : null;
  const nom = mots.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(' ');
  return region ? `${nom} (${region})` : nom;
}

/** Le nom d'un bookmaker de The Odds API : celui de Réglages, sinon celui que l'API donne, sinon un nom fabriqué lisible. */
export function titreDuBookmaker(cle) {
  return BOOKMAKERS.find((b) => b.key === cle)?.title ?? AUTRES_TITRES[cle] ?? titreParDefaut(cle);
}
