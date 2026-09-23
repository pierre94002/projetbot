/**
 * -----------------------------------------------------------------------
 * Bornes de saison, compétition par compétition.
 * -----------------------------------------------------------------------
 * Une saison ne va pas de juillet à juin partout. C'est vrai des grands
 * championnats européens, et c'est ce que tout le magasin supposait — ce
 * qui donnait, pour les championnats d'ANNÉE CIVILE, des classements qui ne
 * correspondent à rien : l'Allsvenskan « 2025 » réunissait la fin de la
 * saison 2025 (juillet-novembre) et le début de la saison 2026 (mars-juin),
 * deux demi-saisons de deux championnats différents, additionnées.
 *
 * Sont d'année civile : les pays nordiques et baltes (Suède, Norvège,
 * Finlande, Islande, Irlande, Lettonie), toutes les Amériques sauf le
 * Mexique (dont l'Apertura commence en juillet), la Chine, et les coupes
 * qui s'y rattachent. FotMob les nomme d'ailleurs par une seule année —
 * « 2025 » — là où il écrit « 2025/2026 » pour les autres.
 *
 * Un seul point de vérité pour tous les lecteurs : classement, buteurs,
 * tableau de coupe, statistiques joueurs, moyennes d'équipe.
 */

const ANNEE_CIVILE = new Set([
  'Allsvenskan - Sweden',
  'Eliteserien - Norway',
  'Veikkausliiga - Finland',
  'Besta deildin - Iceland',
  'League of Ireland',
  'Virsliga - Latvia',
  'Brazil Série A',
  'MLS',
  'Super League - China',
  'Canadian Premier League',
  'Primera División - Argentina',
  'Primera División - Chile',
  'Primera A - Colombia',
  'Liga 1 - Peru',
  'División Profesional - Paraguay',
  'Primera División - Bolivia',
  'Serie A - Ecuador',
  'Primera División - Venezuela',
  'Copa do Brasil',
  'Copa Argentina',
  'US Open Cup',
  'Leagues Cup',
  'Copa Libertadores',
  'Copa Sudamericana',
  'Copa Chile',
  'Canadian Championship',
  'Coupe de Chine'
]);

/** Mois où commence la saison : 1 (janvier) ou 7 (juillet). */
export function seasonStartMonth(league) {
  return ANNEE_CIVILE.has(league) ? 1 : 7;
}

export function isCalendarYearLeague(league) {
  return ANNEE_CIVILE.has(league);
}

/** Année de DÉBUT de la saison à laquelle appartient une date. */
export function seasonOf(league, isoDate) {
  const year = Number(String(isoDate).slice(0, 4));
  const month = Number(String(isoDate).slice(5, 7));
  if (seasonStartMonth(league) === 1) return year;
  return month >= 7 ? year : year - 1;
}

/** Bornes [début, fin) d'une saison, au format ISO. */
export function seasonBounds(league, season) {
  const s = Number(season);
  return seasonStartMonth(league) === 1
    ? [`${s}-01-01`, `${s + 1}-01-01`]
    : [`${s}-07-01`, `${s + 1}-07-01`];
}

/** Libellé lisible : « 2025 » ou « 2025-26 ». */
export function seasonLabel(league, season) {
  const s = Number(season);
  return seasonStartMonth(league) === 1 ? `${s}` : `${s}-${String(s + 1).slice(2)}`;
}

/**
 * Début du libellé FotMob de la saison : « 2025 » ou « 2025/2026 ». FotMob
 * y ajoute parfois une phase — « 2025 - Clausura », « 2025/2026 - Apertura »
 * — d'où une comparaison sur le préfixe (cf. fotMobStandingsRefresh.js).
 */
export function fotmobSeasonBase(league, season) {
  const s = Number(season);
  return seasonStartMonth(league) === 1 ? `${s}` : `${s}/${s + 1}`;
}

/** Année de début d'une saison à partir de son libellé FotMob. */
export function seasonFromFotmobLabel(label) {
  const m = String(label ?? '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Saison en cours d'une compétition, à la date du jour. */
export function currentSeason(league, today = new Date()) {
  return seasonOf(league, today.toISOString().slice(0, 10));
}
