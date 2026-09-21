import { getSportOddsRaw } from './oddsApiClient.js';
import { getCompetitionsRaw } from './footballDataClient.js';
import { saveOddsMatches, saveCompetitions } from '../repositories/fixturesRepository.js';

/**
 * Championnats suivis par CôteMaster côté The Odds API. Liste choisie le
 * 2026-09-14 (5 grands championnats + leurs 2e divisions + coupes
 * européennes) — remplace un premier choix arbitraire (La Liga/EFL Cup/
 * Russie/Chine) qui ne correspondait à aucun besoin précis.
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
 * Chaque entrée consomme un crédit PAR ACTUALISATION (plan "Starter" :
 * 500/mois) — 18 clés = 18 crédits à chaque clic sur "Actualiser", soit ~27
 * actualisations par mois. Aucun rafraîchissement automatique ailleurs dans
 * l'appli (cf. oddsApiClient.js) : c'est toujours une action explicite.
 */
export const TRACKED_SPORT_KEYS = [
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
  'soccer_switzerland_superleague'
];

/**
 * Récupère les cotes en direct pour chaque championnat suivi et remplace
 * l'instantané local (server/data/fixtures/odds/odds-snapshot.json). Ne se
 * déclenche jamais automatiquement : uniquement sur action explicite de
 * l'utilisateur, pour préserver le quota mensuel. Une compétition en échec
 * (coupe entre deux tours, clé hors saison) n'annule pas les autres : on
 * sauvegarde ce qui a répondu et on remonte la liste des échecs.
 */
export async function refreshLiveOdds() {
  const allMatches = [];
  const sportsRefreshed = [];
  const failures = [];
  let lastQuota = null;

  for (const sportKey of TRACKED_SPORT_KEYS) {
    try {
      const { matches, quota } = await getSportOddsRaw(sportKey);
      allMatches.push(...matches);
      sportsRefreshed.push(sportKey);
      lastQuota = quota ?? lastQuota;
    } catch (error) {
      failures.push({ sportKey, message: error.message });
    }
  }

  if (!sportsRefreshed.length) {
    throw new Error(`Aucune compétition n'a pu être rafraîchie : ${failures.map((f) => `${f.sportKey} (${f.message})`).join(' ; ')}`);
  }

  saveOddsMatches(allMatches);
  return { matchesFetched: allMatches.length, sportsRefreshed, failures, quota: lastQuota };
}

/** Récupère la liste des compétitions en direct et remplace l'instantané local. */
export async function refreshLiveCompetitions() {
  const competitions = await getCompetitionsRaw();
  saveCompetitions(competitions);
  return { competitionsFetched: competitions.length };
}
