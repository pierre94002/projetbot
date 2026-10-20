/**
 * oddsApiCompetitions.js — les compétitions relevées chez The Odds API, et ce qu'un relevé coûte.
 * -----------------------------------------------------------------------
 * Des CONSTANTES seulement : ce fichier n'importe rien et n'appelle rien.
 * Sorti de liveDataSync.js à l'étape 7 du plan (06/10/2026) pour que le
 * conseil de relevé (data/conseilReleve.js) lise la liste sans charger le
 * client payant (oddsApiClient.js) : seul liveDataSync.refreshLiveOdds, au
 * clic de Pierre (Réglages › Données › « Actualiser »), appelle The Odds API.
 *
 * Liste choisie le 2026-09-14 (5 grands championnats + leurs 2e divisions +
 * coupes européennes) — remplace un premier choix arbitraire (La Liga/EFL
 * Cup/Russie/Chine) qui ne correspondait à aucun besoin précis.
 *
 * League One, League Two, la Russie et la Chine ont été retirées le
 * 2026-09-19 faute de données exploitables, puis REMISES le 2026-09-21 : la
 * tâche quotidienne les a depuis peuplées entièrement (calendrier, classement
 * complet, 30 statistiques par équipe dans le magasin). Le motif du retrait —
 * 38 des 48 équipes anglaises sans la moindre donnée — n'est plus vrai, et
 * sans cotes ces championnats restaient invisibles sur la page Matchs, donc
 * hors de portée du moteur.
 *
 * La Serie C italienne reste absente : elle n'existe pas dans le catalogue de
 * The Odds API (vérifié via GET /v4/sports).
 *
 * LE COÛT. Chaque compétition est UNE requête, 1 région (« eu ») × 1 marché
 * (« h2h ») : au plus 1 crédit par compétition, donc au plus
 * TRACKED_SPORT_KEYS.length crédits à chaque clic sur « Actualiser » (37
 * depuis le 21/09/2026 ; le commentaire d'origine disait 18, avant les
 * ajouts du 21/09). Le plan « Starter » donne 500 crédits par mois. Le coût
 * réel d'un relevé se lit dans les en-têtes de la réponse (x-requests-last,
 * x-requests-used) et est gardé dans data/runtime/releve-payant.json
 * (repositories/relevePayantRepository.js). Aucun rafraîchissement
 * automatique nulle part : c'est toujours une action explicite.
 * -----------------------------------------------------------------------
 */

export const TRACKED_SPORT_KEYS = Object.freeze([
  'soccer_epl',
  'soccer_efl_champ',
  'soccer_england_league1',
  'soccer_england_league2',
  'soccer_england_efl_cup',
  'soccer_spain_la_liga',
  'soccer_spain_segunda_division',
  'soccer_italy_serie_a',
  'soccer_italy_serie_b',
  'soccer_germany_bundesliga',
  'soccer_germany_bundesliga2',
  'soccer_france_ligue_one',
  'soccer_france_ligue_two',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_russia_premier_league',
  'soccer_china_superleague',
  // Ajoutés le 2026-09-21. Turquie, Portugal et Belgique sont marqués
  // "hors saison" par The Odds API (aucune cote ouverte) : ils n'en
  // apparaissent pas moins dans la page Matchs, via le calendrier.
  'soccer_spl',
  'soccer_greece_super_league',
  'soccer_turkey_super_league',
  'soccer_portugal_primeira_liga',
  'soccer_belgium_first_div',
  'soccer_netherlands_eredivisie',
  // Ajoutée le 2026-09-21, également marquée « hors saison » par The Odds API :
  // la compétition existe bien côté cotes (`soccer_poland_ekstraklasa`), mais
  // aucune n'est ouverte pour l'instant. Elle apparaît par le calendrier.
  'soccer_poland_ekstraklasa',
  // Reste de l'Europe, ajouté le 2026-09-21. Sur les quinze championnats
  // ajoutés au magasin, sept seulement existent chez The Odds API — la
  // Croatie, la Tchéquie, l'Islande, Israël, la Lettonie, la Roumanie, la
  // Serbie et la Slovaquie n'y sont pas du tout. Ces huit-là vivent donc
  // uniquement par le calendrier, comme la Pologne : le moteur voit
  // `market.available: false` et neutralise edge et mise.
  'soccer_austria_bundesliga',
  'soccer_denmark_superliga',
  'soccer_finland_veikkausliiga',
  'soccer_league_of_ireland',
  'soccer_norway_eliteserien',
  'soccer_sweden_allsvenskan',
  'soccer_switzerland_superleague',
  // Amériques, 2026-09-21. Cinq des douze championnats ajoutés au magasin
  // existent chez The Odds API ; la Bolivie, le Canada, la Colombie,
  // l'Équateur, le Paraguay, le Pérou et le Venezuela n'y sont pas, et
  // vivent donc par le calendrier.
  'soccer_argentina_primera_division',
  'soccer_brazil_campeonato',
  'soccer_chile_campeonato',
  'soccer_mexico_ligamx',
  'soccer_usa_mls'
]);

/**
 * Le nom de chaque compétition DANS L'APPLI, qui est le titre que The Odds API
 * lui donne (`sport_title`) : la page Matchs rapproche ses cotes et le
 * calendrier par ce nom (matchSources.js). Les quatorze compétitions du relevé
 * du 21/09/2026 ont été vérifiées dans ce relevé ; les autres sont les noms du
 * calendrier FotMob de l'appli (FOTMOB_LEAGUES, fotMobProvider.js), qui
 * reprend ces mêmes titres. Un titre différent lu dans un relevé l'emporte
 * (conseilReleve.js).
 */
export const NOMS_DES_CLES = Object.freeze({
  soccer_epl: 'EPL',
  soccer_efl_champ: 'Championship',
  soccer_england_league1: 'League 1',
  soccer_england_league2: 'League 2',
  soccer_england_efl_cup: 'EFL Cup',
  soccer_spain_la_liga: 'La Liga - Spain',
  soccer_spain_segunda_division: 'La Liga 2 - Spain',
  soccer_italy_serie_a: 'Serie A - Italy',
  soccer_italy_serie_b: 'Serie B - Italy',
  soccer_germany_bundesliga: 'Bundesliga - Germany',
  soccer_germany_bundesliga2: 'Bundesliga 2 - Germany',
  soccer_france_ligue_one: 'Ligue 1 - France',
  soccer_france_ligue_two: 'Ligue 2 - France',
  soccer_uefa_champs_league: 'UEFA Champions League',
  soccer_uefa_europa_league: 'UEFA Europa League',
  soccer_uefa_europa_conference_league: 'UEFA Europa Conference League',
  soccer_russia_premier_league: 'Premier League - Russia',
  soccer_china_superleague: 'Super League - China',
  soccer_spl: 'Premiership - Scotland',
  soccer_greece_super_league: 'Super League - Greece',
  soccer_turkey_super_league: 'Turkey Super League',
  soccer_portugal_primeira_liga: 'Primeira Liga - Portugal',
  soccer_belgium_first_div: 'Belgium First Div',
  soccer_netherlands_eredivisie: 'Dutch Eredivisie',
  soccer_poland_ekstraklasa: 'Ekstraklasa - Poland',
  soccer_austria_bundesliga: 'Austrian Football Bundesliga',
  soccer_denmark_superliga: 'Denmark Superliga',
  soccer_finland_veikkausliiga: 'Veikkausliiga - Finland',
  soccer_league_of_ireland: 'League of Ireland',
  soccer_norway_eliteserien: 'Eliteserien - Norway',
  soccer_sweden_allsvenskan: 'Allsvenskan - Sweden',
  soccer_switzerland_superleague: 'Swiss Superleague',
  soccer_argentina_primera_division: 'Primera División - Argentina',
  soccer_brazil_campeonato: 'Brazil Série A',
  soccer_chile_campeonato: 'Primera División - Chile',
  soccer_mexico_ligamx: 'Liga MX',
  soccer_usa_mls: 'MLS'
});

/** Ce que demande chaque requête du relevé (cf. oddsApiClient.getSportOddsRaw) : 1 région × 1 marché. */
export const REQUETE_RELEVE = Object.freeze({ regions: 'eu', markets: 'h2h' });
/** Au plus 1 crédit par compétition (régions × marchés). */
export const CREDITS_PAR_COMPETITION = 1;
/** Le forfait « Starter » de The Odds API : crédits par mois. */
export const CREDITS_PAR_MOIS = 500;
