/**
 * lignesEnginePicks.js — le petit ADAPTATEUR du garde-fou de la mesure (étape 16 du plan, 07/10/2026) :
 * pronostics gelés (table engine_picks, étape E) × résultats → lignes appariées pour le juge (guard.js).
 * -----------------------------------------------------------------------
 * Deux limites de engine_picks, à connaître avant tout usage :
 *   1. la colonne `version` est le NUMÉRO DE RÉVISION d'un même pronostic
 *      (1 = sa première valeur, puis chaque changement), PAS une version du
 *      moteur : deux pronostics de versions différentes peuvent venir du même
 *      moteur, et deux de même version de deux moteurs (engine_hash le dit) ;
 *   2. un pronostic ne garde que la probabilité de L'ISSUE CHOISIE
 *      (`probability` = 1 / predicted_odds), pas la distribution complète du
 *      marché : la perte log complète n'est pas calculable, seule la perte log
 *      BINAIRE de l'affirmation (« domicile à 55 % ») l'est.
 * RECOMMANDATION POUR L'ÉTAPE 25 : geler aussi les probabilités de TOUTES les
 * issues de chaque marché, et le numéro de version du moteur sur chaque
 * pronostic — sans elles, la perte log du 1N2 (le juge principal) ne se
 * calcule pas sur les pronostics gelés.
 *
 * Ce qui en découle (pas un choix) :
 *   - perte log binaire : seulement les paires où A et B font LA MÊME
 *     AFFIRMATION — même choix ET mêmes paramètres (une même ligne de buts) ;
 *     comparer « domicile à 55 % » à « nul à 30 % » n'a pas de sens (domicile
 *     gagne : B aurait l'air meilleur avec −ln 0,70 < −ln 0,55), ni « plus de
 *     1,5 but » à « plus de 2,5 buts ». Ces paires sont comptées et écartées ;
 *   - gain : chaque version mise 1 unité sur SON choix quand elle a une cote de
 *     marché (`marketOdds` : le Résultat seulement aujourd'hui), 0 sinon.
 * L'adaptateur filtre et COMPTE tout ce qu'il écarte ; le juge, lui, ne jette
 * jamais une ligne en silence.
 *
 * Le règlement est celui de settlementRules.js (deriveActualOutcome), sur le
 * score et les statistiques qu'on lui apporte. Le juge ne touche pas à la
 * base ; ce fichier non plus, sauf le lecteur d'appoint resultatsDuMagasin,
 * PROVISOIRE, qui reçoit la base de son appelant et n'en ouvre jamais.
 * -----------------------------------------------------------------------
 */

import { deriveActualOutcome } from '../core/settlement/settlementRules.js';
import { perteLogBinaire, gainMiseFixe } from './metrics.js';
import { LignesInvalides } from './guard.js';

/** Clé d'appariement d'un pronostic gelé : match × marché. */
export const cleAppariement = (pick) => `${pick.fixtureKey}|${pick.marketKey}`;
/** Le bloc par défaut : le match (les marchés d'un même match dépendent du même score). */
export const blocParMatch = (pick) => pick.fixtureKey;
/** La journée d'un championnat (jamais la date seule : elle mélangerait vingt championnats dans un bloc). */
export const blocParJournee = (pick) => `${pick.date}|${pick.league ?? ''}`;

const MESURES_DE_L_ADAPTATEUR = Object.freeze(['perte-log-binaire', 'gain']);

const nombreFini = (x) => typeof x === 'number' && Number.isFinite(x);
const probabiliteLisible = (p) => nombreFini(p) && p >= 0 && p <= 1;
const coteLisible = (c) => nombreFini(c) && c > 1;
const butsLisibles = (r) => r !== null && typeof r === 'object' && [r.homeGoals, r.awayGoals].every((g) => Number.isInteger(g) && g >= 0);

/** Les paramètres d'un pronostic (texte JSON trié, cf. gelPronostics.js) : un objet, {} sans paramètres, null s'ils sont illisibles. */
function parametres(params) {
  if (params === null || params === undefined || params === '') return {};
  if (typeof params === 'object' && !Array.isArray(params)) return params;
  if (typeof params !== 'string') return null;
  try {
    const p = JSON.parse(params);
    return p !== null && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** Les paramètres comparables d'une version à l'autre : clés triées. */
const parametresCanoniques = (params) => {
  const p = parametres(params);
  return p === null ? null : JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k]]));
};

/** Même affirmation : même choix et mêmes paramètres (même ligne, même équipe). Des paramètres illisibles sont écartés avant (« non réglable »). */
const memeAffirmation = (pA, pB) => pA.choice === pB.choice && parametresCanoniques(pA.params) === parametresCanoniques(pB.params);

/** Ce qui s'est passé pour CE pronostic (sa ligne, son équipe), ou null si aucune règle ne le règle. */
function issueDe(pick, resultat) {
  const params = parametres(pick.params);
  if (params === null) return null;
  return deriveActualOutcome(
    { market: pick.market, predictedLabel: pick.label, homeName: pick.homeName, awayName: pick.awayName, marketId: pick.marketId, params },
    resultat.homeGoals,
    resultat.awayGoals,
    resultat.stats ?? null
  );
}

/** Une liste de pronostics indexée par clé d'appariement, dans son ordre ; deux pronostics pour une même clé : c'est à l'appelant de choisir. */
function indexer(picks, nom) {
  if (!Array.isArray(picks)) throw new LignesInvalides(`${nom} : une liste de pronostics est attendue.`);
  const index = new Map();
  picks.forEach((p, i) => {
    if (p === null || typeof p !== 'object' || typeof p.fixtureKey !== 'string' || !p.fixtureKey || typeof p.marketKey !== 'string' || !p.marketKey) {
      throw new LignesInvalides(`${nom}, pronostic ${i} : fixtureKey et marketKey sont obligatoires.`, { indice: i });
    }
    const cle = cleAppariement(p);
    if (index.has(cle)) {
      throw new LignesInvalides(`${nom} : deux pronostics pour ${cle} — à l’appelant de choisir lequel (première valeur, dernière avant le coup d’envoi, version candidate…).`, { indice: i, cle });
    }
    index.set(cle, p);
  });
  return index;
}

/**
 * Lignes appariées à partir de deux listes de pronostics gelés (forme de pronosticsGeles(), depot.js)
 * et des résultats.
 *   picksA, picksB : un pronostic par (fixtureKey, marketKey) et par liste — c'est l'appelant qui a
 *                    choisi lequel (première valeur, dernière avant coup d'envoi, version candidate de
 *                    l'étape 25…) ;
 *   resultats      : Map fixtureKey → { homeGoals, awayGoals, stats, date } (stats = { home: { corners,
 *                    shots, shotsOnTarget }, away } ou null) ;
 *   mesure         : 'perte-log-binaire' (mode moyenne, plus petit = mieux) ou 'gain' (mode rendement) ;
 *   bloc           : blocParMatch (défaut) ou blocParJournee.
 * Chaque paire écartée l'est pour UNE raison, la première dans cet ordre : sansPaire (un seul des deux
 * pronostiqueurs a ce marché ; chaque pronostic seul compte pour un), plusDePronostic (choix vide),
 * sansResultat, nonReglable (paramètres illisibles), choixDifferents (perte log binaire : pas la même
 * affirmation), nonReglable (aucune règle, ou corners/tirs sans statistiques), sansProbabilite (perte log
 * binaire), sansCote (gain : aucune des deux
 * versions n'a de cote de marché). `ecretees` (perte log binaire) : les lignes où la probabilité de A, de B,
 * a été ramenée à 1e−6 — une version qui écrête souvent a un défaut à part.
 * @returns {{ lignes: object[], ecartees: object, ecretees?: { a: number, b: number } }}
 */
export function apparierPronostics({ picksA, picksB, resultats, mesure, bloc = blocParMatch } = {}) {
  if (!MESURES_DE_L_ADAPTATEUR.includes(mesure)) throw new LignesInvalides(`Mesure « ${String(mesure)} » : l’adaptateur ne sait faire que ${MESURES_DE_L_ADAPTATEUR.join(' et ')}.`);
  if (!(resultats instanceof Map)) throw new LignesInvalides('resultats : une Map fixtureKey → { homeGoals, awayGoals, stats, date } est attendue.');
  if (typeof bloc !== 'function') throw new LignesInvalides('bloc : une fonction (blocParMatch ou blocParJournee) est attendue.');
  const indexA = indexer(picksA, 'picksA');
  const indexB = indexer(picksB, 'picksB');
  const ecartees = { sansPaire: 0, plusDePronostic: 0, sansResultat: 0, choixDifferents: 0, nonReglable: 0, sansProbabilite: 0, sansCote: 0 };
  const ecretees = { a: 0, b: 0 };
  const lignes = [];
  for (const [cle, pA] of indexA) {
    const pB = indexB.get(cle);
    if (!pB) {
      ecartees.sansPaire++;
      continue;
    }
    if (pA.choice === null || pA.choice === undefined || pB.choice === null || pB.choice === undefined) {
      ecartees.plusDePronostic++;
      continue;
    }
    const resultat = resultats.get(pA.fixtureKey);
    if (!butsLisibles(resultat)) {
      ecartees.sansResultat++;
      continue;
    }
    // Des paramètres illisibles ne se règlent pas : jamais pris pour une autre affirmation (« choix différents »).
    if (parametres(pA.params) === null || parametres(pB.params) === null) {
      ecartees.nonReglable++;
      continue;
    }
    if (mesure === 'perte-log-binaire' && !memeAffirmation(pA, pB)) {
      ecartees.choixDifferents++;
      continue;
    }
    const issueA = issueDe(pA, resultat);
    const issueB = issueDe(pB, resultat);
    if (issueA === null || issueA === undefined || issueB === null || issueB === undefined) {
      ecartees.nonReglable++;
      continue;
    }
    const commun = { bloc: bloc(pA), match: pA.fixtureKey, cle, date: pA.date };
    if (mesure === 'perte-log-binaire') {
      if (!probabiliteLisible(pA.probability) || !probabiliteLisible(pB.probability)) {
        ecartees.sansProbabilite++;
        continue;
      }
      const la = perteLogBinaire(pA.probability, issueA === pA.choice);
      const lb = perteLogBinaire(pB.probability, issueB === pB.choice);
      if (la.ecretee) ecretees.a++;
      if (lb.ecretee) ecretees.b++;
      lignes.push({ ...commun, a: la.valeur, b: lb.valeur });
    } else {
      const coteA = coteLisible(pA.marketOdds);
      const coteB = coteLisible(pB.marketOdds);
      if (!coteA && !coteB) {
        ecartees.sansCote++;
        continue;
      }
      lignes.push({
        ...commun,
        gainA: coteA ? gainMiseFixe({ cote: pA.marketOdds, gagne: issueA === pA.choice }) : 0,
        miseA: coteA ? 1 : 0,
        gainB: coteB ? gainMiseFixe({ cote: pB.marketOdds, gagne: issueB === pB.choice }) : 0,
        miseB: coteB ? 1 : 0
      });
    }
  }
  for (const cle of indexB.keys()) if (!indexA.has(cle)) ecartees.sansPaire++;
  return mesure === 'perte-log-binaire' ? { lignes, ecartees, ecretees } : { lignes, ecartees };
}

/**
 * LECTEUR D'APPOINT, PROVISOIRE : les résultats du magasin pour des clés de match « fotmob:<domicile>|
 * <extérieur>|<jour> » (cleDuMatch, gelPronostics.js), lus dans `matches` par identifiants FotMob et jour,
 * pour les seuls matchs qui ont un score — `matches` n'a pas de colonne de statut : un score présent vaut
 * match joué. Corners et tirs viennent de team_stats quand ils y sont (un 0 des deux côtés veut dire
 * « non relevé », comme au règlement). Une clé « nom:… » (sans identifiant) n'est pas lue, ni une clé
 * qui trouve deux rencontres (jamais une prise au hasard) : l'adaptateur les compte « sans résultat ».
 * Il ne connaît NI les prolongations de coupe NI les résultats attribués : les règles complètes sont
 * celles de settlementService.js, que le banc (étape 19) branchera à la place de ce lecteur. Il cherche le
 * jour exact de la clé (jour UTC du coup d'envoi au gel) : un match daté autrement au magasin n'est pas
 * trouvé — à vérifier au banc.
 * `database` : la base de l'APPELANT (ce fichier n'en ouvre jamais).
 * @returns {Map<string, { homeGoals: number, awayGoals: number, date: string, stats: object }>}
 */
export function resultatsDuMagasin(fixtureKeys, { database } = {}) {
  if (!database || typeof database.prepare !== 'function') throw new TypeError('resultatsDuMagasin : la base est à passer par l’appelant ({ database }) — ce fichier n’en ouvre jamais.');
  const requete = database.prepare(`SELECT m.home_goals AS homeGoals, m.away_goals AS awayGoals, m.date AS date,
           th.corner_kicks AS hc, ta.corner_kicks AS ac, th.total_shots AS hs, ta.total_shots AS as_,
           th.shots_on_goal AS hsot, ta.shots_on_goal AS asot
    FROM matches m
    LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
    LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
    WHERE m.home_id = ? AND m.away_id = ? AND m.date = ? AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
    LIMIT 2`);
  const paire = (h, a) => {
    const lisible = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!lisible(h) || !lisible(a) || (h === 0 && a === 0)) return [null, null];
    return [h, a];
  };
  const resultats = new Map();
  for (const cle of new Set(fixtureKeys ?? [])) {
    const morceaux = /^fotmob:([^|]+)\|([^|]+)\|(\d{4}-\d{2}-\d{2})$/.exec(typeof cle === 'string' ? cle : '');
    if (!morceaux) continue;
    const trouves = requete.all(morceaux[1], morceaux[2], morceaux[3]);
    if (trouves.length !== 1) continue;
    const r = trouves[0];
    const [hc, ac] = paire(r.hc, r.ac);
    const [hs, as] = paire(r.hs, r.as_);
    const [hsot, asot] = paire(r.hsot, r.asot);
    resultats.set(cle, {
      homeGoals: Number(r.homeGoals),
      awayGoals: Number(r.awayGoals),
      date: r.date,
      stats: { home: { corners: hc, shots: hs, shotsOnTarget: hsot }, away: { corners: ac, shots: as, shotsOnTarget: asot } }
    });
  }
  return resultats;
}
