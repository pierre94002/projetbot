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
 *      Correctif du 28/10/2026 (`jugerLesButeurs`) : des buteurs qui
 *      MANQUENT (deux ou plus, y compris aucun) ne sont plus une
 *      contradiction en soi — FotMob donne le score des petits matchs de
 *      coupe sans tous les buteurs (Arosa SC – Pontevedra 2-0 : aucun
 *      buteur ; Boluspor – Karşıyaka 1-3 : un sur trois). C'est
 *      `incomplets` : « buteurs absents ou incomplets chez la source »,
 *      à vérifier (orange au contrôle quotidien), jamais une erreur. Restent
 *      des erreurs : un buteur EN TROP, et des buteurs manquants que les
 *      gardiens adverses contredisent aussi (`contredits` : ils encaissent
 *      autre chose que le score — le score lui-même est en doute, comme le
 *      faux 4-3 de Leeds – Newcastle des essais).
 *   3. TROIS FICHIERS — la base, season-calendar.json et match-results.json
 *      annoncent le même score.
 *   4. CALENDRIER contre RÉSULTATS, y compris sans statistiques.
 *
 * `since` restreint aux rencontres à partir d'une date : l'actualisation
 * contrôle les trente derniers jours (quelques centaines de rencontres, en
 * une fraction de seconde), la ligne de commande tout l'historique.
 *
 * `cles` (étape 12 du plan, carnet de santé) restreint aux rencontres
 * données par leur clé : la passe de nuit du carnet ne relit que les
 * rencontres nouvelles ou modifiées. Le contrôle 4 (calendrier contre
 * résultats, sans rencontre du magasin) est alors sauté : il ne porte sur
 * aucune d'elles. Chaque anomalie porte la clé de sa rencontre (`matchKey`,
 * null pour le contrôle 4), sa date et sa compétition.
 *
 * Écrit UNE fois, en générateur (`auditScoresParMorceaux`, qui `yield` entre
 * deux tranches de travail : utils/travailCooperatif.js) ; `auditScores`
 * garde son nom d'avant, synchrone, pour la ligne de commande et le contrôle
 * quotidien. Le contrôle complet du carnet de santé l'exécute en rendant la
 * main au serveur : sur la base du bac, l'audit des 60 000 rencontres durait
 * 53 s d'une traite — lecture des feuilles joueur (20 s, une seule requête
 * qui rend pourtant ses lignes au fil de l'eau : `.iterate()`), puis le
 * rapprochement des scores avec le calendrier et les résultats (30 s, une
 * boucle).
 * -----------------------------------------------------------------------
 */

import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { executerSansPause, lireJsonEnDeuxTemps } from '../../utils/travailCooperatif.js';

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
function* readStats(database, since, cles = null) {
  const parMatch = new Map();
  // Par lots de 500 clés : SQLite plafonne le nombre de paramètres d'une requête.
  const lots = cles ? Array.from({ length: Math.ceil(cles.length / 500) }, (_, i) => cles.slice(i * 500, i * 500 + 500)) : [null];
  for (const lot of lots) {
    if (lot && !lot.length) continue;
    const filtres = [];
    const args = [];
    if (since) {
      filtres.push('m.date >= ?');
      args.push(since);
    }
    if (lot) {
      filtres.push(`m.match_key IN (${lot.map(() => '?').join(',')})`);
      args.push(...lot);
    }
    yield* lireStatsDuLot(database, filtres.length ? `WHERE ${filtres.join(' AND ')}` : '', args, parMatch);
  }
  return [...parMatch.values()];
}

/**
 * La requête rend ses groupes (une rencontre, un camp) au fil de l'eau — la
 * table des joueurs se parcourt dans l'ordre de sa clé, sans tri — : lue par
 * `.iterate()`, avec un point d'arrêt tous les 32 groupes (~6 ms).
 */
function* lireStatsDuLot(database, filtre, args, parMatch) {
  let groupes = 0;
  for (const r of database.prepare(`
    SELECT m.match_key, m.date, m.league, m.home_name, m.away_name, m.home_goals, m.away_goals, p.side,
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
        matchKey: r.match_key,
        date: r.date,
        league: r.league,
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
    if ((++groupes & 7) === 0) yield 'audit : feuilles joueur';
  }
}

/**
 * Retrouve la même rencontre dans un autre fichier : clé exacte (date +
 * équipes), sinon correspondance sur les DEUX camps à la même date. `swapped`
 * quand l'entrée trouvée stocke la rencontre dans l'autre sens. Un point
 * d'arrêt tous les 256 tours : 47 000 entrées, deux `slug` chacune.
 */
function* buildFinder(entries, getDate) {
  const byKey = new Map();
  const byDay = new Map();
  let tours = 0;
  for (const e of entries) {
    const date = getDate(e);
    if (date) {
      byKey.set(`${date}|${slug(e.homeName)}|${slug(e.awayName)}`, e);
      const day = byDay.get(date) ?? [];
      day.push(e);
      byDay.set(date, day);
    }
    if ((++tours & 255) === 0) yield 'audit : index du calendrier et des résultats';
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

const pluriel = (n, un, plusieurs) => `${n} ${Math.abs(n) > 1 ? plusieurs : un}`;

/**
 * Les gardiens d'une équipe contredisent-ils le score de l'adversaire ? Exactement le contrôle 1 (gardiens) : ils
 * encaissent autre chose que `marques`, sauf un gardien exclu ou sorti sans relayeur (personne n'encaisse après lui).
 * Sans gardien relevé (`keepers` à 0 : feuille sans buts encaissés), ils ne disent rien.
 */
function gardiensContredisent(gardiens, marques) {
  if (!gardiens?.keepers) return false;
  if (gardiens.conceded < marques && gardiens.gkSorti > 0 && gardiens.gkJoue <= 1) return false;
  return gardiens.conceded !== marques;
}

/**
 * Le contrôle 2 (buteurs) pour UNE équipe — correctif du 28/10/2026. `marques` : ses buts au score ; `credites` : les
 * buts de ses joueurs ; `cscAdverses` : les buts contre son camp de l'adversaire ; `gardiensAdverses` : la feuille des
 * gardiens adverses ({ keepers, conceded, gkJoue, gkSorti }, ou null) ; `equipe` : son nom. Rend { ecart, manque,
 * detail } — `ecart` :
 *   null             les buts crédités font le score ;
 *   'csc-non-releve' un seul but sans buteur : un csc non relevé (compté, jamais signalé) ;
 *   'en-trop'        plus de buts crédités que le score : une vraie contradiction (erreur) ;
 *   'contredits'     deux buteurs ou plus manquent ET les gardiens adverses encaissent autre chose que le score : le
 *                    score lui-même ne colle pas (erreur) ;
 *   'incomplets'     deux buteurs ou plus manquent (aucun, parfois), les gardiens adverses ne contredisent pas le score :
 *                    buteurs absents ou incomplets chez la source (à vérifier, jamais une erreur).
 */
export function jugerLesButeurs({ marques, credites, cscAdverses = 0, gardiensAdverses = null, equipe = null }) {
  const manque = marques - credites - cscAdverses;
  if (manque === 0) return { ecart: null, manque, detail: null };
  if (manque < 0) return { ecart: 'en-trop', manque, detail: `${credites} buts crédités aux joueurs (+ ${cscAdverses} csc adverses) pour un score de ${marques} : buteur en trop` };
  if (manque === 1) return { ecart: 'csc-non-releve', manque, detail: null };
  if (gardiensContredisent(gardiensAdverses, marques)) {
    return {
      ecart: 'contredits',
      manque,
      detail: `${pluriel(credites, 'but crédité', 'buts crédités')} aux joueurs (+ ${pluriel(cscAdverses, 'csc adverse', 'csc adverses')}) pour un score de ${marques} (${manque} sans buteur), et les gardiens adverses en encaissent ${gardiensAdverses.conceded} : le score lui-même ne colle pas`
    };
  }
  const attribues = credites + cscAdverses;
  const avecButeur = attribues === 0 ? 'aucun n’a de buteur' : attribues === 1 ? 'un seul a un buteur' : `${attribues} seulement ont un buteur`;
  const csc = cscAdverses > 0 ? ` (dont ${cscAdverses} contre son camp)` : '';
  return { ecart: 'incomplets', manque, detail: `buteurs absents ou incomplets chez la source : ${equipe ?? 'l’équipe'} marque ${pluriel(marques, 'but', 'buts')}, ${avecButeur}${csc}` };
}

/**
 * @param {object} p
 * @param {import('node:sqlite').DatabaseSync} p.database  connexion (lecture suffit)
 * @param {string|null} p.since       première date contrôlée (AAAA-MM-JJ), null = tout
 * @param {string} p.calendarPath     season-calendar.json
 * @param {string} p.resultsPath      match-results.json
 * @param {(a: object) => void} [p.onAnomaly]
 * @param {number} [p.maxSamples]     anomalies gardées dans le rapport
 * @param {string[]|null} [p.cles]    seulement ces rencontres (clés du magasin) ; sans le contrôle 4
 */
export function auditScores(options) {
  return executerSansPause(auditScoresParMorceaux(options));
}

/** La même chose, en générateur : voir utils/travailCooperatif.js. */
export function* auditScoresParMorceaux({ database, since = null, calendarPath, resultsPath, onAnomaly = null, maxSamples = 50, cles = null }) {
  const stats = yield* readStats(database, since, cles);
  const garder = (e) => !since || (e?.date ?? '') >= since;
  // Sans fichier désigné (un contrôle qui ne porte que sur la base) : rien à confronter.
  // Chaque fichier se lit en deux temps (le texte, puis l'analyse JSON) : 18 Mo d'une traite, c'est 150 ms.
  const calendar = (calendarPath ? yield* lireJsonEnDeuxTemps(calendarPath, [], 'audit : calendrier de saison') : []).filter(garder);
  yield 'audit : calendrier de saison lu';
  // match-results n'a pas de champ `date` : elle est dans le matchId
  // (`web-AAAA-MM-JJ-domicile-exterieur`).
  const dateResultat = (e) => (typeof e.matchId === 'string' ? e.matchId.slice(4, 14) : null);
  const results = (resultsPath ? yield* lireJsonEnDeuxTemps(resultsPath, [], 'audit : résultats') : []).filter((e) => !since || (dateResultat(e) ?? '') >= since);
  yield 'audit : résultats lus';

  const findInCalendar = yield* buildFinder(calendar, (e) => e.date);
  const findInResults = yield* buildFinder(results, dateResultat);

  const anomalies = [];
  let total = 0;
  // `m` : la rencontre du magasin concernée (null pour le contrôle 4) ; `camp` : l'équipe visée ; `ecart` : la sorte
  // d'écart de buteurs (jugerLesButeurs), null pour les autres contrôles.
  const report = (kind, label, detail, m = null, camp = null, ecart = null) => {
    total++;
    const a = { kind, label, detail, matchKey: m?.matchKey ?? null, date: m?.date ?? null, league: m?.league ?? null, camp, ecart };
    if (anomalies.length < maxSamples) anomalies.push(a);
    onAnomaly?.(a);
  };

  let checkedGk = 0;
  let checkedScorers = 0;
  let checkedCrossFile = 0;
  let ownGoals = 0;
  let buteursIncomplets = 0;
  let attribues = 0;
  let sansGardien = 0;
  const byKind = {};

  // Une rencontre ~0,7 ms (le rapprochement des noms avec les deux fichiers) : un point d'arrêt tous les 4 tours.
  let tours = 0;
  for (const m of stats) {
    if ((++tours & 3) === 0) yield 'audit : rapprochement des scores';
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
          report('gardien', label, `les gardiens de ${side === 'home' ? m.homeName : m.awayName} encaissent ${agg.conceded} alors que l'adversaire marque ${opponent}`, m, side);
          byKind.gardien = (byKind.gardien ?? 0) + 1;
        }
      }

      // 2. Buteurs : buts des joueurs + csc de l'adversaire = score (jugerLesButeurs, correctif du 28/10/2026).
      checkedScorers++;
      const adverse = m.sides[side === 'home' ? 'away' : 'home'] ?? null;
      const buteurs = jugerLesButeurs({ marques: own, credites: agg.scored, cscAdverses: adverse?.ownGoals ?? 0, gardiensAdverses: adverse, equipe: side === 'home' ? m.homeName : m.awayName });
      if (buteurs.ecart === 'csc-non-releve') {
        ownGoals++;
      } else if (buteurs.ecart) {
        report('buteurs', label, buteurs.detail, m, side, buteurs.ecart);
        byKind.buteurs = (byKind.buteurs ?? 0) + 1;
        if (buteurs.ecart === 'incomplets') buteursIncomplets++;
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
        report('fichiers', label, `la base dit ${score[0]}-${score[1]}, ${name} dit ${oh}-${oa}`, m);
        byKind.fichiers = (byKind.fichiers ?? 0) + 1;
      }
    }
  }

  // 4. Calendrier contre résultats, y compris les matchs sans statistiques —
  // sauf quand l'audit ne porte que sur des rencontres données (`cles`).
  let checkedCalendarResults = 0;
  let toursCalendrier = 0;
  for (const e of cles ? [] : calendar) {
    if ((++toursCalendrier & 15) === 0) yield 'audit : calendrier contre résultats';
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
    // Correctif du 28/10/2026 : parmi les écarts de buteurs, ceux qui ne sont que des buteurs absents ou incomplets chez la source.
    buteursIncomplets,
    resultatsAttribues: attribues,
    gardienSortiSansRelayeur: sansGardien,
    anomalies: total,
    parType: byKind,
    samples: anomalies
  };
}
