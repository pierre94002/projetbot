/**
 * scoreAudit.js — les scores enregistrés tiennent-ils debout ?
 * -----------------------------------------------------------------------
 * Logique de scripts/audit-score-consistency.mjs, sortie en module pour que
 * l'actualisation de l'appli la lance chaque jour (c'était l'étape 4 de la
 * tâche Claude supprimée le 24/09/2026). Rien n'est corrigé : c'est un
 * rapport. Quatre contrôles, du plus révélateur au plus mécanique :
 *
 *   1. GARDIENS — les buts encaissés des gardiens d'une équipe égalent le
 *      score de l'adversaire. Deux sources différentes (feuille de résultat,
 *      feuille de statistiques) : c'est le contrôle qui trahit un score faux,
 *      comme le 0-0 de Cadiz - Girona du 19/09/2026 (en réalité 1-2).
 *   2. BUTEURS — la somme des buts des joueurs (plus les csc adverses) ne
 *      dépasse pas le score ; un écart de 1 en dessous est un csc non relevé.
 *   3. TROIS FICHIERS — la base, season-calendar.json et match-results.json
 *      annoncent le même score.
 *   4. CALENDRIER contre RÉSULTATS, y compris sans statistiques.
 *
 * `since` restreint aux rencontres à partir d'une date : l'actualisation
 * contrôle les trente derniers jours (quelques centaines de rencontres, en
 * une fraction de seconde), la ligne de commande tout l'historique.
 * -----------------------------------------------------------------------
 */

import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { readJsonFile } from '../../utils/atomicJson.js';

function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Score réellement connu, ou null. `Number(null)` vaut 0 et passe
 * `Number.isFinite` : sans ce test, un match sans score se lirait « 0-0 ».
 */
function scoreOf(entry) {
  const home = entry?.homeGoals;
  const away = entry?.awayGoals;
  if (home === null || home === undefined || away === null || away === undefined) return null;
  const numHome = Number(home);
  const numAway = Number(away);
  return Number.isFinite(numHome) && Number.isFinite(numAway) ? [numHome, numAway] : null;
}

/**
 * Les rencontres de la base, avec par camp ce que l'audit vérifie. Agrégé
 * en SQL : deux millions de lignes joueur ne se matérialisent pas en objets.
 */
function readStats(database, since) {
  const parMatch = new Map();
  const filtre = since ? 'WHERE m.date >= ?' : '';
  const args = since ? [since] : [];
  for (const r of database.prepare(`
    SELECT m.match_key, m.date, m.home_name, m.away_name, m.home_goals, m.away_goals, p.side,
           SUM(COALESCE(p.goals_conceded, 0)) AS conceded,
           SUM(CASE WHEN p.goals_conceded IS NOT NULL THEN 1 ELSE 0 END) AS keepers,
           SUM(CASE WHEN p.position = 'Goalkeeper' AND p.minutes > 0 THEN 1 ELSE 0 END) AS gkJoue,
           SUM(CASE WHEN p.position = 'Goalkeeper' AND (
                 COALESCE(p.red_cards, 0) > 0
                 OR (p.starter = 1 AND p.minutes < 90 AND p.sub_out_minute IS NULL)
                 OR EXISTS (SELECT 1 FROM json_each(m.events) e WHERE json_extract(e.value, '$.type') = 'card'
                            AND json_extract(e.value, '$.card') IN ('red', 'yellowred') AND json_extract(e.value, '$.player') = p.name)
               ) THEN 1 ELSE 0 END) AS gkSorti,
           COALESCE(SUM(p.goals), 0) AS scored,
           COALESCE(SUM(p.own_goals), 0) AS ownGoals,
           json_extract(m.meta, '$.awarded') AS awarded,
           COUNT(*) AS lignes
    FROM matches m JOIN players p ON p.match_key = m.match_key
    ${filtre}
    GROUP BY m.match_key, p.side
  `).iterate(...args)) {
    let e = parMatch.get(r.match_key);
    if (!e) {
      parMatch.set(r.match_key, (e = {
        date: r.date,
        homeName: r.home_name,
        awayName: r.away_name,
        homeGoals: r.home_goals,
        awayGoals: r.away_goals,
        // Résultat attribué par la fédération : le score n'est pas celui du
        // jeu, les feuilles décrivent un autre match — rien à confronter.
        awarded: Boolean(r.awarded),
        sides: {}
      }));
    }
    e.sides[r.side] = { conceded: r.conceded, keepers: r.keepers, scored: r.scored, ownGoals: r.ownGoals, lignes: r.lignes, gkJoue: r.gkJoue, gkSorti: r.gkSorti };
  }
  return [...parMatch.values()];
}

/**
 * Retrouve la même rencontre dans un autre fichier : clé exacte (date +
 * équipes), sinon correspondance sur les DEUX camps à la même date. `swapped`
 * quand l'entrée trouvée stocke la rencontre dans l'autre sens.
 */
function buildFinder(entries, getDate) {
  const byKey = new Map();
  const byDay = new Map();
  for (const e of entries) {
    const date = getDate(e);
    if (!date) continue;
    byKey.set(`${date}|${slug(e.homeName)}|${slug(e.awayName)}`, e);
    const day = byDay.get(date) ?? [];
    day.push(e);
    byDay.set(date, day);
  }
  return (date, homeName, awayName) => {
    const exact = byKey.get(`${date}|${slug(homeName)}|${slug(awayName)}`);
    if (exact) return { entry: exact, swapped: false };
    for (const e of byDay.get(date) ?? []) {
      if (teamNamesLikelyMatch(e.homeName, homeName) && teamNamesLikelyMatch(e.awayName, awayName)) return { entry: e, swapped: false };
      if (teamNamesLikelyMatch(e.homeName, awayName) && teamNamesLikelyMatch(e.awayName, homeName)) return { entry: e, swapped: true };
    }
    return null;
  };
}

const oriented = (score, swapped) => (swapped ? [score[1], score[0]] : score);

/**
 * @param {object} p
 * @param {import('node:sqlite').DatabaseSync} p.database  connexion (lecture suffit)
 * @param {string|null} p.since       première date contrôlée (AAAA-MM-JJ), null = tout
 * @param {string} p.calendarPath     season-calendar.json
 * @param {string} p.resultsPath      match-results.json
 * @param {(a: object) => void} [p.onAnomaly]
 * @param {number} [p.maxSamples]     anomalies gardées dans le rapport
 */
export function auditScores({ database, since = null, calendarPath, resultsPath, onAnomaly = null, maxSamples = 50 }) {
  const stats = readStats(database, since);
  const garder = (e) => !since || (e?.date ?? '') >= since;
  const calendar = readJsonFile(calendarPath, []).filter(garder);
  // match-results n'a pas de champ `date` : elle est dans le matchId
  // (`web-AAAA-MM-JJ-domicile-exterieur`).
  const dateResultat = (e) => (typeof e.matchId === 'string' ? e.matchId.slice(4, 14) : null);
  const results = readJsonFile(resultsPath, []).filter((e) => !since || (dateResultat(e) ?? '') >= since);

  const findInCalendar = buildFinder(calendar, (e) => e.date);
  const findInResults = buildFinder(results, dateResultat);

  const anomalies = [];
  let total = 0;
  const report = (kind, label, detail) => {
    total++;
    const a = { kind, label, detail };
    if (anomalies.length < maxSamples) anomalies.push(a);
    onAnomaly?.(a);
  };

  let checkedGk = 0;
  let checkedScorers = 0;
  let checkedCrossFile = 0;
  let ownGoals = 0;
  let attribues = 0;
  let sansGardien = 0;
  const byKind = {};

  for (const m of stats) {
    const score = scoreOf(m);
    const label = `${m.date} ${m.homeName} ${score ? `${score[0]}-${score[1]}` : '?-?'} ${m.awayName}`;
    if (m.awarded) {
      attribues++;
      continue;
    }
    for (const side of ['home', 'away']) {
      const agg = m.sides[side];
      if (!agg || !agg.lignes || !score) continue;
      const own = side === 'home' ? score[0] : score[1];
      const opponent = side === 'home' ? score[1] : score[0];

      // 1. Gardiens : buts encaissés = score adverse.
      if (agg.keepers) {
        checkedGk++;
        // Gardien exclu ou sorti sans relayeur : personne n'encaisse.
        if (agg.conceded < opponent && agg.gkSorti > 0 && agg.gkJoue <= 1) {
          sansGardien++;
        } else if (agg.conceded !== opponent) {
          report('gardien', label, `les gardiens de ${side === 'home' ? m.homeName : m.awayName} encaissent ${agg.conceded} alors que l'adversaire marque ${opponent}`);
          byKind.gardien = (byKind.gardien ?? 0) + 1;
        }
      }

      // 2. Buteurs : buts des joueurs + csc de l'adversaire = score.
      checkedScorers++;
      const csc = m.sides[side === 'home' ? 'away' : 'home']?.ownGoals ?? 0;
      const manque = own - agg.scored - csc;
      if (manque < 0) {
        report('buteurs', label, `${agg.scored} buts crédités aux joueurs (+ ${csc} csc adverses) pour un score de ${own} : buteur en trop`);
        byKind.buteurs = (byKind.buteurs ?? 0) + 1;
      } else if (manque === 1) {
        ownGoals++;
      } else if (manque >= 2) {
        report('buteurs', label, `${agg.scored} buts crédités aux joueurs (+ ${csc} csc adverses) pour un score de ${own} : ${manque} buteurs manquants`);
        byKind.buteurs = (byKind.buteurs ?? 0) + 1;
      }
    }

    // 3. Le même score dans les trois sources.
    if (!score) continue;
    for (const [name, found] of [['le calendrier', findInCalendar(m.date, m.homeName, m.awayName)], ['match-results', findInResults(m.date, m.homeName, m.awayName)]]) {
      if (!found) continue;
      const other = scoreOf(found.entry);
      if (!other) continue;
      checkedCrossFile++;
      const [oh, oa] = oriented(other, found.swapped);
      if (oh !== score[0] || oa !== score[1]) {
        report('fichiers', label, `la base dit ${score[0]}-${score[1]}, ${name} dit ${oh}-${oa}`);
        byKind.fichiers = (byKind.fichiers ?? 0) + 1;
      }
    }
  }

  // 4. Calendrier contre résultats, y compris les matchs sans statistiques.
  let checkedCalendarResults = 0;
  for (const e of calendar) {
    const score = scoreOf(e);
    if (!score || e.status !== 'finished') continue;
    const found = findInResults(e.date, e.homeName, e.awayName);
    if (!found) continue;
    const other = scoreOf(found.entry);
    if (!other) continue;
    checkedCalendarResults++;
    const [oh, oa] = oriented(other, found.swapped);
    if (oh !== score[0] || oa !== score[1]) {
      report('fichiers', `${e.date} ${e.homeName} ${score[0]}-${score[1]} ${e.awayName}`, `le calendrier dit ${score[0]}-${score[1]}, les résultats disent ${oh}-${oa}`);
      byKind.fichiers = (byKind.fichiers ?? 0) + 1;
    }
  }

  return {
    since,
    matchsAvecStats: stats.length,
    controlesGardiens: checkedGk,
    controlesButeurs: checkedScorers,
    controlesEntreFichiers: checkedCrossFile + checkedCalendarResults,
    butsContreSonCamp: ownGoals,
    resultatsAttribues: attribues,
    gardienSortiSansRelayeur: sansGardien,
    anomalies: total,
    parType: byKind,
    samples: anomalies
  };
}
