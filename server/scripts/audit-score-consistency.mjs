#!/usr/bin/env node
/**
 * audit-score-consistency.mjs
 * -----------------------------------------------------------------------
 * Relit les scores déjà enregistrés et vérifie qu'ils tiennent debout face
 * à ce qu'on sait par ailleurs du même match. Complément du garde-fou des
 * scripts de fusion : celui-là empêche qu'un score connu soit REMPLACÉ en
 * silence, mais ne peut rien contre une PREMIÈRE écriture déjà fausse.
 *
 * C'est exactement ce qui est arrivé à Cadiz - Girona du 19 septembre 2026,
 * enregistré 0-0 alors que le match s'était terminé 1-2. Aucun remplacement,
 * donc aucun conflit : la valeur était fausse dès le départ. Ce qui l'a
 * trahie, ce sont les statistiques du match — deux buteurs et deux gardiens
 * à 2 et 1 buts encaissés, sous un score annoncé vierge.
 *
 * Quatre contrôles, du plus révélateur au plus mécanique :
 *
 *   1. GARDIENS — les buts encaissés des gardiens d'une équipe doivent
 *      égaler le score de l'adversaire. C'est le contrôle qui détecte un
 *      score faux, parce que les deux chiffres viennent de sources
 *      différentes : le score d'une feuille de résultats, les encaissés
 *      d'une feuille de statistiques.
 *   2. BUTEURS — la somme des buts des joueurs d'une équipe ne peut pas
 *      dépasser son score. En dessous, un écart d'exactement 1 est normal :
 *      c'est un but contre son camp, crédité à aucun joueur. Un écart de 2
 *      ou plus est suspect et signalé.
 *   3. TROIS FICHIERS — match-stats, season-calendar et match-results
 *      doivent annoncer le même score pour le même match.
 *   4. CALENDRIER vs RÉSULTATS — même comparaison, étendue aux matchs qui
 *      n'ont pas de statistiques détaillées.
 *
 * Un contrôle qui ne peut pas s'appuyer sur une donnée absente ne dit rien :
 * pas de gardien renseigné, pas de contrôle 1. L'audit ne signale que ce
 * qu'il peut réellement contredire.
 *
 * Usage (depuis server/, tous les arguments sont optionnels) :
 *   node scripts/audit-score-consistency.mjs
 *   node scripts/audit-score-consistency.mjs <dossier-match-stats> <season-calendar.json> <match-results.json>
 *
 * Sortie : le détail sur stderr, un résumé JSON sur stdout (même convention
 * que les scripts de fusion). Le code de sortie reste 0 même en cas
 * d'anomalie — c'est un rapport, pas une barrière ; lis `anomalies`.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { teamNamesLikelyMatch } from '../src/utils/teamNameMatch.js';

const [, , statsDirArg, calendarPathArg, resultsPathArg] = process.argv;
const statsDir = statsDirArg ?? 'data/runtime/match-stats';
const calendarPath = calendarPathArg ?? 'data/runtime/season-calendar.json';
const resultsPath = resultsPathArg ?? 'data/runtime/match-results.json';

function slug(text) {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Attention : ${p} illisible/corrompu (${e.message}), on repart de la valeur par défaut.`);
  }
  return fallback;
}

/**
 * Score réellement connu, ou null. Même piège que dans les scripts de
 * fusion : `Number(null)` vaut 0 et passe `Number.isFinite`, ce qui ferait
 * lire « 0-0 » un match sans score — et l'audit se mettrait à comparer des
 * scores imaginaires.
 */
function scoreOf(entry) {
  const home = entry?.homeGoals;
  const away = entry?.awayGoals;
  if (home === null || home === undefined || away === null || away === undefined) return null;
  const numHome = Number(home);
  const numAway = Number(away);
  return Number.isFinite(numHome) && Number.isFinite(numAway) ? [numHome, numAway] : null;
}

function readStats(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const shard = readJson(path.join(dir, file), []);
    if (Array.isArray(shard)) out.push(...shard);
  }
  return out;
}

const stats = readStats(statsDir);
const calendar = readJson(calendarPath, []);
const results = readJson(resultsPath, []);

/**
 * Retrouve la même rencontre dans un autre fichier. D'abord par clé exacte
 * (date + équipes), sinon par correspondance floue sur les DEUX camps à la
 * même date — les noms ne sont pas écrits pareil partout (« Leverkusen » au
 * calendrier, « Bayer Leverkusen » ailleurs). Renvoie aussi `swapped` quand
 * l'entrée trouvée stocke la rencontre dans l'autre sens, pour que la
 * comparaison des scores porte sur les mêmes équipes.
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
      if (teamNamesLikelyMatch(e.homeName, homeName) && teamNamesLikelyMatch(e.awayName, awayName)) {
        return { entry: e, swapped: false };
      }
      if (teamNamesLikelyMatch(e.homeName, awayName) && teamNamesLikelyMatch(e.awayName, homeName)) {
        return { entry: e, swapped: true };
      }
    }
    return null;
  };
}

const findInCalendar = buildFinder(calendar, (e) => e.date);
// match-results n'a pas de champ `date` : elle est encodée dans le matchId
// (`web-AAAA-MM-JJ-domicile-exterieur`), exactement comme la lit
// createResultLookup() dans matchResultsRepository.js.
const findInResults = buildFinder(results, (e) => (typeof e.matchId === 'string' ? e.matchId.slice(4, 14) : null));

const oriented = (score, swapped) => (swapped ? [score[1], score[0]] : score);

const anomalies = [];
const report = (kind, label, detail) => {
  anomalies.push({ kind, label, detail });
  console.error(`[${kind}] ${label} — ${detail}`);
};

let checkedGk = 0;
let checkedScorers = 0;
let checkedCrossFile = 0;
let ownGoals = 0;

for (const m of stats) {
  const score = scoreOf(m);
  const label = `${m.date} ${m.homeName} ${score ? `${score[0]}-${score[1]}` : '?-?'} ${m.awayName}`;
  const players = m.players ?? {};

  for (const side of ['home', 'away']) {
    const rows = players[side] ?? [];
    if (!rows.length || !score) continue;
    const own = side === 'home' ? score[0] : score[1];
    const opponent = side === 'home' ? score[1] : score[0];

    // 1. Gardiens : buts encaissés = score adverse.
    const keepers = rows.filter((r) => r.goalsConceded !== null && r.goalsConceded !== undefined);
    if (keepers.length) {
      checkedGk++;
      const conceded = keepers.reduce((total, r) => total + Number(r.goalsConceded), 0);
      if (conceded !== opponent) {
        report(
          'gardien',
          label,
          `les gardiens de ${side === 'home' ? m.homeName : m.awayName} encaissent ${conceded} ` +
          `alors que l'adversaire marque ${opponent} — l'un des deux chiffres est faux`
        );
      }
    }

    // 2. Buteurs : somme des buts <= score, écart de 1 toléré (csc).
    checkedScorers++;
    const scored = rows.reduce((total, r) => total + (Number(r.goals) || 0), 0);
    if (scored > own) {
      report('buteurs', label, `${scored} buts crédités aux joueurs pour un score de ${own} — buteur en trop`);
    } else if (own - scored === 1) {
      ownGoals++;
    } else if (own - scored >= 2) {
      report('buteurs', label, `${scored} buts crédités aux joueurs pour un score de ${own} — ${own - scored} buteurs manquants`);
    }
  }

  // 3. Le même score dans les trois fichiers.
  if (!score) continue;
  const inCalendar = findInCalendar(m.date, m.homeName, m.awayName);
  const inResults = findInResults(m.date, m.homeName, m.awayName);
  for (const [name, found] of [['le calendrier', inCalendar], ['match-results', inResults]]) {
    if (!found) continue;
    const other = scoreOf(found.entry);
    if (!other) continue;
    checkedCrossFile++;
    const [otherHome, otherAway] = oriented(other, found.swapped);
    if (otherHome !== score[0] || otherAway !== score[1]) {
      report('fichiers', label, `match-stats dit ${score[0]}-${score[1]}, ${name} dit ${otherHome}-${otherAway}`);
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
  const [otherHome, otherAway] = oriented(other, found.swapped);
  if (otherHome !== score[0] || otherAway !== score[1]) {
    report(
      'fichiers',
      `${e.date} ${e.homeName} ${score[0]}-${score[1]} ${e.awayName}`,
      `le calendrier dit ${score[0]}-${score[1]}, les résultats disent ${otherHome}-${otherAway}`
    );
  }
}

const byKind = anomalies.reduce((acc, a) => ({ ...acc, [a.kind]: (acc[a.kind] ?? 0) + 1 }), {});

console.log(
  JSON.stringify({
    matchsAvecStats: stats.length,
    controlesGardiens: checkedGk,
    controlesButeurs: checkedScorers,
    controlesEntreFichiers: checkedCrossFile + checkedCalendarResults,
    butsContreSonCamp: ownGoals,
    anomalies: anomalies.length,
    parType: byKind
  })
);
