/**
 * scoreFormRead.js — ce qu'il faut au pronostic du score, lu dans le magasin.
 * -----------------------------------------------------------------------
 * Pour un match du championnat L joué le jour J entre D et E, SEULS les
 * matchs joués AVANT J comptent (jamais le match lui-même, ni un match
 * attribué sur tapis vert). Trois lectures, celles de l'étude du 23/09/2026
 * qui a fixé les poids du pronostic (cf. core/engine/scorePrediction.js) :
 *
 *   1. LES MOYENNES DU CHAMPIONNAT : buts, xG et tirs cadrés moyens à
 *      domicile et à l'extérieur, sur la saison en cours avant J (matchs
 *      qui comptent au classement) ; moins de 30 matchs : les 365 derniers
 *      jours ; moins de 10 : 1,45 et 1,15 buts.
 *   2. LES CINQ DERNIERS MATCHS de chaque équipe, TOUTES COMPÉTITIONS :
 *      buts, xG et tirs cadrés pour et contre, lieu, adversaire.
 *   3. LA SAISON de chaque équipe dans L : buts pour et contre, à domicile
 *      et à l'extérieur (au moins 6 matchs de la saison, sinon tout son
 *      historique dans L).
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { countsForTable } from './matchStatsRead.js';
import { canonicalTeamNames } from './identityRegistry.js';
import { clubDuMagasin } from './oddsProfileRead.js';
import { seasonOf, seasonBounds } from '../providers/seasonWindows.js';

export const FORME_MATCHS = 5;
const MINIMUM_SAISON_EQUIPE = 6;
const MINIMUM_SAISON_LIGUE = 30;
const MINIMUM_LIGUE = 10;
const MINIMUM_XG = 20;
const DEFAUT = { home: 1.45, away: 1.15 };

const JOUE = 'm.home_goals IS NOT NULL AND m.away_goals IS NOT NULL';
const NON_ATTRIBUE =
  "COALESCE(json_extract(m.meta, '$.awarded'), 0) <> 1 AND COALESCE(json_extract(m.meta, '$.reason'), '') NOT IN ('awarded_win', 'id_reused')";
const RELEVES = `LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
  LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'`;
const COLONNES = `m.match_key AS match_key, m.date AS date, m.league, m.home_id, m.away_id, m.home_name, m.away_name,
  m.home_goals AS hg, m.away_goals AS ag, th.expected_goals AS xh, ta.expected_goals AS xa,
  th.shots_on_goal AS sh, ta.shots_on_goal AS sa`;

const nombre = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const moyenne = (liste) => liste.reduce((s, x) => s + x, 0) / liste.length;

function joursAvant(iso, jours) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - jours);
  return t.toISOString().slice(0, 10);
}

// Les moyennes d'un championnat changent une fois par journée : dix minutes
// de cache évitent de relire la saison à chaque match analysé.
const CACHE_MS = 10 * 60 * 1000;
const cacheLigue = new Map();

/** Moyennes du championnat avant J. */
export function leagueAveragesBefore(league, date, { database = openDb() } = {}) {
  const cle = `${league}|${date}`;
  const connu = cacheLigue.get(cle);
  if (connu && connu.database === database && Date.now() - connu.pose < CACHE_MS) return connu.valeur;
  const valeur = calculerMoyennesLigue(league, date, database);
  if (cacheLigue.size > 500) cacheLigue.clear();
  cacheLigue.set(cle, { valeur, database, pose: Date.now() });
  return valeur;
}

function calculerMoyennesLigue(league, date, database) {
  const [debutSaison] = seasonBounds(league, seasonOf(league, date));
  const unAn = joursAvant(date, 365);
  const lire = (depuis) =>
    database
      .prepare(`SELECT ${COLONNES}, m.meta FROM matches m ${RELEVES}
                WHERE m.league = ? AND m.date >= ? AND m.date < ? AND ${JOUE} AND ${NON_ATTRIBUE}`)
      .all(league, depuis, date)
      .filter((r) => {
        try {
          return countsForTable(JSON.parse(r.meta ?? '{}'));
        } catch {
          return true;
        }
      });

  let fenetre = lire(debutSaison);
  let source = 'saison';
  if (fenetre.length < MINIMUM_SAISON_LIGUE) {
    fenetre = lire(unAn);
    source = '365 jours';
  }
  if (fenetre.length < MINIMUM_LIGUE) {
    return { goals: { ...DEFAUT }, xg: { ...DEFAUT }, shotsOnTarget: null, matches: fenetre.length, source: 'défaut' };
  }
  const goals = { home: moyenne(fenetre.map((r) => r.hg)), away: moyenne(fenetre.map((r) => r.ag)) };
  const avecXg = fenetre.filter((r) => nombre(r.xh) !== null && nombre(r.xa) !== null);
  const avecTirs = fenetre.filter((r) => nombre(r.sh) !== null && nombre(r.sa) !== null);
  return {
    goals,
    xg:
      avecXg.length >= MINIMUM_XG
        ? { home: moyenne(avecXg.map((r) => Number(r.xh))), away: moyenne(avecXg.map((r) => Number(r.xa))) }
        : { ...goals },
    shotsOnTarget:
      avecTirs.length >= MINIMUM_XG
        ? { home: moyenne(avecTirs.map((r) => Number(r.sh))), away: moyenne(avecTirs.map((r) => Number(r.sa))) }
        : null,
    matches: fenetre.length,
    source
  };
}

/** Tous les matchs joués d'une équipe avant J, du plus récent au plus ancien. */
function matchsAvant(teamId, date, database) {
  const cote = (colonne, camp) =>
    `SELECT ${COLONNES}, '${camp}' AS camp FROM matches m ${RELEVES}
     WHERE m.${colonne} = ? AND m.date < ? AND ${JOUE} AND ${NON_ATTRIBUE}`;
  return database
    .prepare(`${cote('home_id', 'home')} UNION ALL ${cote('away_id', 'away')} ORDER BY date DESC, match_key DESC`)
    .all(teamId, date, teamId, date)
    .map((r) => {
      const home = r.camp === 'home';
      const xgOk = nombre(r.xh) !== null && nombre(r.xa) !== null;
      const tirsOk = nombre(r.sh) !== null && nombre(r.sa) !== null;
      return {
        matchKey: r.match_key,
        date: r.date,
        league: r.league,
        home,
        opponentId: home ? r.away_id : r.home_id,
        opponentName: home ? r.away_name : r.home_name,
        goalsFor: home ? r.hg : r.ag,
        goalsAgainst: home ? r.ag : r.hg,
        xgFor: xgOk ? Number(home ? r.xh : r.xa) : null,
        xgAgainst: xgOk ? Number(home ? r.xa : r.xh) : null,
        shotsOnTargetFor: tirsOk ? Number(home ? r.sh : r.sa) : null,
        shotsOnTargetAgainst: tirsOk ? Number(home ? r.sa : r.sh) : null
      };
    });
}

/** Buts pour et contre de la saison dans L, à domicile et à l'extérieur. */
function saisonDansLigue(historique, league, date) {
  const dansLigue = historique.filter((r) => r.league === league);
  const [debut, fin] = seasonBounds(league, seasonOf(league, date));
  const deLaSaison = dansLigue.filter((r) => r.date >= debut && r.date < fin);
  const base = deLaSaison.length >= MINIMUM_SAISON_EQUIPE ? deLaSaison : dansLigue;
  if (!base.length) return null;
  const dom = base.filter((r) => r.home);
  const ext = base.filter((r) => !r.home);
  const moy = (liste, champ) => (liste.length ? moyenne(liste.map((r) => r[champ])) : null);
  return {
    forHome: moy(dom, 'goalsFor'),
    againstHome: moy(dom, 'goalsAgainst'),
    forAway: moy(ext, 'goalsFor'),
    againstAway: moy(ext, 'goalsAgainst'),
    matches: base.length,
    inSeason: deLaSaison.length >= MINIMUM_SAISON_EQUIPE
  };
}

function equipe(teamId, league, date, database, noms) {
  if (teamId === null || teamId === undefined) return { teamId: null, last: [], season: null };
  const historique = matchsAvant(teamId, date, database);
  const last = historique.slice(0, FORME_MATCHS).map((r) => ({
    ...r,
    opponentName: noms.get(r.opponentId) ?? r.opponentName,
    result: r.goalsFor > r.goalsAgainst ? 'V' : r.goalsFor === r.goalsAgainst ? 'N' : 'D'
  }));
  return { teamId, last, season: saisonDansLigue(historique, league, date) };
}

/**
 * Entrées du pronostic du score.
 *
 * @param {object} p
 * @param {string} p.league   compétition, au libellé du magasin
 * @param {string} p.home     équipe qui reçoit (nom de la source des cotes)
 * @param {string} p.away     équipe qui se déplace
 * @param {string} p.date     jour du match (AAAA-MM-JJ) : seuls les matchs d'avant comptent
 * @param {number} [p.homeId] identifiant FotMob, s'il est déjà connu
 * @param {number} [p.awayId]
 */
export function scoreInputsFromStore({ league, home, away, date, homeId = null, awayId = null, database = openDb() }) {
  if (!league || !date) return null;
  const jour = String(date).slice(0, 10);
  const idDom = homeId ?? clubDuMagasin(home, league, database);
  const idExt = awayId ?? clubDuMagasin(away, league, database);
  const noms = canonicalTeamNames({ database });
  return {
    date: jour,
    league: leagueAveragesBefore(league, jour, { database }),
    home: { name: noms.get(idDom) ?? home ?? null, ...equipe(idDom, league, jour, database, noms) },
    away: { name: noms.get(idExt) ?? away ?? null, ...equipe(idExt, league, jour, database, noms) }
  };
}
