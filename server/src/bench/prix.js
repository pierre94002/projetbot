/**
 * prix.js — les PRIX que le banc d'essai donne au moteur (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Quatre jeux de prix, jamais mélangés (periodes.js, JEUX_DE_PRIX), chacun
 * rendu au format `marketOdds` du moteur — { odds1, oddsDraw, odds2,
 * bookmakersCount, byBookmaker: [{ key, title, odds1, oddsDraw, odds2,
 * referenceOnly? }] } — avec les clés que valueFinder.js reconnaît :
 * `pinnacle` (palier 1), `williamhill` (un de vos bookmakers, palier 3 : un
 * seul avis, jamais juge seul), `b365` (ni juge ni permis : affiché),
 * `fd_moyenne` (référence seulement). Le moteur décide lui-même, par sa
 * règle, sans retouche : cote juste Pinnacle quand il cote le match, prix
 * William Hill quand il existe.
 *
 * Ce qu'on peut prouver, et sur quelle période (dit tel quel sur la page) :
 * | Quoi                                   | Période                  | Prix             | Preuve ?                                  |
 * |----------------------------------------|--------------------------|------------------|-------------------------------------------|
 * | 1N2                                    | P2                       | fd-avant-match   | preuve au banc (Pinnacle face à la moyenne) |
 * | 1N2                                    | P3                       | fd-avant-match, gratuites | indicatif ; calibration face à FIABILITE : neuve |
 * | 1N2 sans cote                          | P2 (pays), P3-P5         | « sans-cote »    | témoin, hors note                         |
 * | Autres lignes, score exact, statistiques | P2, P3                 | repère           | preuve au banc, une case par ligne        |
 * | Paris : rendement                      | 27/07/2012 → 27/03/2025  | fd-avant-match   | jamais : rapporté                         |
 * | Paris : valeur de clôture              | idem                     | Pinnacle clôture | prouve : P2, P1 ≥ 2012-07 ; P3/P4a indicatif |
 * | Paris à vos prix                       | P5                       | vos-bookmakers   | preuve neuve ; « pas assez de matchs » attendu longtemps |
 *
 * Deux règles d'intégrité, testées :
 *   - un jeu d'avant-match ne lit AUCUNE colonne de clôture (chaque lecture
 *     de fd_history passe par `colonne`, qui refuse une colonne hors du jeu),
 *     ni aucune cote relevée après la coupure (gratuites, vos bookmakers) ;
 *   - la clôture ne sert qu'à MESURER, après coup : probaCloture (Pinnacle
 *     clôture, sinon moyenne de clôture, jamais le maximum), les témoins.
 * Lit la base de l'appelant (`database`), n'en ouvre jamais.
 * -----------------------------------------------------------------------
 */

import { removeMargin } from '../core/market/marginRemoval.js';
import { computeMarketConsensus } from '../sports/football/bookmakerConsensus.js';
import { titreBookmaker } from '../core/engine/vosBookmakers.js';
import { coteDuMarcheDesLivres } from '../data/freeMarketOdds.js';
import { SOURCES_PAYANTES, SOURCES_SAISIES } from '../data/db/oddsQuotesRepository.js';
import { JEUX_DE_PRIX, avantLaCoupure } from './periodes.js';

const p6 = (x) => Number(x.toFixed(6));

/** Une cote lisible (centièmes de fd_history → décimale), > 1 ; sinon null. Jamais Number(null) = 0. */
const coteFd = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v) / 100;
  return Number.isFinite(n) && n > 1 ? n : null;
};

/**
 * LA lecture d'une colonne de fd_history pour nourrir le moteur : refusée (on lève) si la colonne n'est pas
 * dans le jeu de prix — une colonne de clôture glissée dans un jeu d'avant-match ne passe jamais en silence.
 */
export function colonne(ligne, nom, jeu) {
  const def = JEUX_DE_PRIX[jeu];
  if (!def) throw new RangeError(`prix : jeu de prix inconnu « ${String(jeu)} ».`);
  if (!def.colonnes.includes(nom)) throw new RangeError(`prix : la colonne « ${nom} » n'appartient pas au jeu « ${jeu} » — refusée (fuite de clôture ?).`);
  return coteFd(ligne?.[nom]);
}

const trio = (ligne, prefixe, jeu, cloture = false) => {
  const cols = cloture ? [`${prefixe}_c1`, `${prefixe}_cn`, `${prefixe}_c2`] : [`${prefixe}_1`, `${prefixe}_n`, `${prefixe}_2`];
  const o = cols.map((c) => colonne(ligne, c, jeu));
  return o.every((x) => x !== null) ? o : null;
};

/**
 * Les prix football-data d'une ligne de fd_history pour un jeu ('fd-avant-match' ou 'fd-cloture'), au format
 * `marketOdds`, ou null quand la moyenne du jeu manque (une ligne de pays n'a que la clôture : null avant-match).
 *   fd-avant-match : odds1/oddsDraw/odds2 = la moyenne ; byBookmaker = pinnacle, williamhill, b365 (quand ils
 *                    cotent) et fd_moyenne (référence) — JAMAIS le maximum (fairFromAllValid lit toute la liste ;
 *                    sa somme passe sous 100 % dans 15 à 36 % des matchs) : il n'est rendu que dans `affichage` ;
 *   fd-cloture     : la moyenne de clôture SEULE, en référence (la reproduction du 23/09).
 */
export function prixFd(ligne, { jeu } = {}) {
  if (jeu !== 'fd-avant-match' && jeu !== 'fd-cloture') throw new RangeError(`prixFd : jeu « ${String(jeu)} » — fd-avant-match ou fd-cloture.`);
  const cloture = jeu === 'fd-cloture';
  const moyenne = trio(ligne, 'moy', jeu, cloture);
  if (!moyenne) return null;
  const quand = cloture ? 'clôture' : 'avant-match';
  const livre = (key, nom, prefixe, enPlus = {}) => {
    const o = trio(ligne, prefixe, jeu, cloture);
    return o ? { key, title: `${nom} (football-data, ${quand})`, odds1: o[0], oddsDraw: o[1], odds2: o[2], ...enPlus } : null;
  };
  const byBookmaker = cloture
    ? [{ key: 'fd_moyenne', title: 'Moyenne du marché (football-data, clôture)', odds1: moyenne[0], oddsDraw: moyenne[1], odds2: moyenne[2], referenceOnly: true }]
    : [
        livre('pinnacle', 'Pinnacle', 'pin'),
        livre('williamhill', 'William Hill', 'wh'),
        livre('b365', 'Bet365', 'b365'),
        { key: 'fd_moyenne', title: 'Moyenne du marché (football-data, avant-match)', odds1: moyenne[0], oddsDraw: moyenne[1], odds2: moyenne[2], referenceOnly: true }
      ].filter(Boolean);
  const maximum = cloture ? null : trio(ligne, 'max', jeu);
  return {
    odds1: moyenne[0],
    oddsDraw: moyenne[1],
    odds2: moyenne[2],
    bookmakersCount: byBookmaker.length,
    byBookmaker,
    jeu,
    // Affiché seulement : jamais recopié dans le match donné au moteur.
    affichage: { maximum: maximum ? { odds1: maximum[0], oddsDraw: maximum[1], odds2: maximum[2] } : null }
  };
}

/**
 * LA LECTURE DIRECTE d'un 1N2 (la formule de la référence du 23/09) : removeMargin de la moyenne du jeu
 * (méthode puissance ; marge incohérente → lecture proportionnelle, signalée), probabilités à 6 décimales.
 */
export function lectureDirecte(marketOdds) {
  if (!marketOdds || ![marketOdds.odds1, marketOdds.oddsDraw, marketOdds.odds2].every((o) => Number.isFinite(o) && o > 1)) return null;
  const r = removeMargin([marketOdds.odds1, marketOdds.oddsDraw, marketOdds.odds2]);
  return { distribution: { home: p6(r.probabilities[0]), draw: p6(r.probabilities[1]), away: p6(r.probabilities[2]) }, anomalie: r.anomaly };
}

/** Une paire plus/moins lue directement (deux cotes en centièmes) : { over, under, anomalie } marge retirée, ou null. */
function paireDirecte(ligne, plus, moins) {
  const o = [coteFd(ligne?.[plus]), coteFd(ligne?.[moins])];
  if (o.some((x) => x === null)) return null;
  const r = removeMargin(o);
  return { over: p6(r.probabilities[0]), under: p6(r.probabilities[1]), anomalie: r.anomaly };
}

/**
 * Le marché du plus/moins 2,5 buts d'une ligne de fd_history (marge retirée) : la moyenne d'avant-match pour
 * `fd-avant-match`, la moyenne de clôture pour `fd-cloture`. null sans les deux cotes ; aucun autre jeu.
 */
export function plusMoins25(ligne, { jeu } = {}) {
  if (jeu === 'fd-avant-match') return paireDirecte(ligne, 'moy_p25', 'moy_m25');
  if (jeu === 'fd-cloture') return paireDirecte(ligne, 'moy_cp25', 'moy_cm25');
  return null;
}

/** Les TÉMOINS de clôture d'une ligne de fd_history (1N2 et 2,5), lus directement, jamais par le moteur. */
export function temoinsDeCloture(ligne) {
  const t1 = (() => {
    const o = ['moy_c1', 'moy_cn', 'moy_c2'].map((c) => coteFd(ligne?.[c]));
    if (o.some((x) => x === null)) return null;
    const r = removeMargin(o);
    return { distribution: { home: p6(r.probabilities[0]), draw: p6(r.probabilities[1]), away: p6(r.probabilities[2]) }, anomalie: r.anomaly };
  })();
  return { result: t1, totalGoals25: paireDirecte(ligne, 'moy_cp25', 'moy_cm25') };
}

const ISSUES_1X2 = ['home', 'draw', 'away'];
const ISSUES_OU = ['over', 'under'];

/**
 * La probabilité de clôture d'une issue, pour la VALEUR DE CLÔTURE d'un pari (mesurée après coup) :
 * Pinnacle clôture s'il cote le match, sinon la moyenne de clôture, sinon null (`sansCloture`). Jamais le
 * maximum, jamais la clôture d'un autre livre ; une clôture incohérente ne compte pas.
 * `marche` : '1x2' (issue home/draw/away) ou 'ou25' (issue over/under).
 */
export function probaCloture(ligne, { marche = '1x2', issue } = {}) {
  return clotureDe(ligne, { marche, issue })?.p ?? null;
}

/** probaCloture avec le livre qui l'a donnée : { p, livre: 'pinnacle' | 'moyenne' } ou null. */
export function clotureDe(ligne, { marche = '1x2', issue } = {}) {
  const issues = marche === 'ou25' ? ISSUES_OU : ISSUES_1X2;
  const i = issues.indexOf(issue);
  if (i < 0) throw new RangeError(`probaCloture : issue « ${String(issue)} » inconnue pour ${marche}.`);
  const livres =
    marche === 'ou25'
      ? [['pinnacle', ['pin_cp25', 'pin_cm25']], ['moyenne', ['moy_cp25', 'moy_cm25']]]
      : [['pinnacle', ['pin_c1', 'pin_cn', 'pin_c2']], ['moyenne', ['moy_c1', 'moy_cn', 'moy_c2']]];
  for (const [livre, cols] of livres) {
    const o = cols.map((c) => coteFd(ligne?.[c]));
    if (o.some((x) => x === null)) continue;
    const r = removeMargin(o);
    if (r.anomaly) continue;
    const p = r.probabilities[i];
    if (p > 0 && p < 1) return { p, livre };
  }
  return null;
}

// ------------------------------------------------------- les cotes archivées

const requetes = new WeakMap();
function requete(database, nom, sql) {
  let parBase = requetes.get(database);
  if (!parBase) {
    parBase = new Map();
    requetes.set(database, parBase);
  }
  if (!parBase.has(nom)) parBase.set(nom, database.prepare(sql));
  return parBase.get(nom);
}
const exclues = [...SOURCES_PAYANTES, ...SOURCES_SAISIES].map((s) => `'${s}'`).join(', ');

/**
 * Le relevé retenu de chaque sélection d'un livre gratuit, selon la coupure (amendement A13) : `open` et
 * `preclose` admis toujours (d'avant-match par nature, rattrapés compris) ; `snapshot` et `close` seulement
 * relevés au plus tard à la coupure ; `live` jamais. Pris : le dernier snapshot/close admis, sinon la
 * pré-clôture, sinon l'ouverture.
 */
function choisirGratuit(actuel, l, coupure) {
  const rang = l.kind === 'snapshot' || l.kind === 'close' ? 3 : l.kind === 'preclose' ? 2 : l.kind === 'open' ? 1 : 0;
  if (!rang) return actuel;
  if (rang === 3 && !avantLaCoupure(l.releveAt, coupure)) return actuel;
  if (!actuel || rang > actuel.rang || (rang === actuel.rang && l.releveAt > actuel.releveAt)) return { rang, price: l.price, volume: l.volume, kind: l.kind, releveAt: l.releveAt };
  return actuel;
}

/**
 * Les COTES GRATUITES d'une rencontre du magasin (odds_events.match_key), telles qu'elles étaient à la
 * coupure, construites EXACTEMENT comme le moteur les lit aujourd'hui (coteDuMarcheDesLivres, la construction
 * de freeMarketOddsFor : sans le maximum, bourses à volume suffisant, moyenne des bookmakers, tout en
 * référence). null sans livre complet.
 */
export function prixGratuits(matchKey, { coupure, database } = {}) {
  if (!coupure) throw new RangeError('prixGratuits : la coupure est obligatoire.');
  const lignes = requete(
    database,
    'gratuites',
    `SELECT e.source, e.kickoff, e.provenance, q.bookmaker, q.selection, q.kind, q.releve_at AS releveAt, q.price, q.volume
     FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
     WHERE e.match_key = ? AND e.source NOT IN (${exclues}) AND q.market = '1x2' AND q.kind IN ('open', 'preclose', 'snapshot', 'close')`
  ).all(matchKey);
  const parLivre = new Map();
  for (const l of lignes) {
    const cle = `${l.source}|${l.bookmaker}`;
    const livre = parLivre.get(cle) ?? { source: l.source, bookmaker: l.bookmaker, provenance: l.provenance, kickoff: l.kickoff, selections: {} };
    livre.selections[l.selection] = choisirGratuit(livre.selections[l.selection], l, coupure);
    parLivre.set(cle, livre);
  }
  const livres = [];
  for (const b of parLivre.values()) {
    const s = b.selections;
    if (!(s.home?.price > 1 && s.draw?.price > 1 && s.away?.price > 1)) continue;
    livres.push({
      source: b.source,
      bookmaker: b.bookmaker,
      provenance: b.provenance,
      kickoff: b.kickoff,
      odds1: s.home.price,
      oddsDraw: s.draw.price,
      odds2: s.away.price,
      volume: s.home.volume ?? null,
      releveAt: [s.home.releveAt, s.draw.releveAt, s.away.releveAt].sort().at(-1),
      kind: s.home.kind
    });
  }
  const m = coteDuMarcheDesLivres(livres, { date: coupure.jour });
  return m ? { ...m, jeu: 'gratuites-avant-match' } : null;
}

/**
 * Les cotes de VOS BOOKMAKERS (archive des relevés payants, étape E) d'une rencontre du magasin : pour chaque
 * bookmaker, le dernier relevé `snapshot` au plus tard à la coupure (jamais `live`, jamais après). La moyenne
 * et la liste par bookmaker sont celles de l'appli (computeMarketConsensus, sports/football). Chaque livre
 * garde l'heure de son relevé (`releveAt`) : la fraîcheur s'étiquette après la décision (simulateBets.js).
 */
export function prixVosBookmakers(matchKey, { coupure, database } = {}) {
  if (!coupure) throw new RangeError('prixVosBookmakers : la coupure est obligatoire.');
  const lignes = requete(
    database,
    'payantes',
    `SELECT q.bookmaker, q.selection, q.releve_at AS releveAt, q.price
     FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
     WHERE e.match_key = ? AND e.source IN (${[...SOURCES_PAYANTES].map((s) => `'${s}'`).join(', ')}) AND q.market = '1x2' AND q.kind = 'snapshot'`
  ).all(matchKey);
  const parLivre = new Map();
  for (const l of lignes) {
    if (!avantLaCoupure(l.releveAt, coupure)) continue;
    const livre = parLivre.get(l.bookmaker) ?? {};
    const actuel = livre[l.selection];
    if (!actuel || l.releveAt > actuel.releveAt) livre[l.selection] = { price: l.price, releveAt: l.releveAt };
    parLivre.set(l.bookmaker, livre);
  }
  const bookmakers = [];
  const heures = new Map();
  for (const [cle, s] of parLivre) {
    if (!(s.home?.price > 1 && s.draw?.price > 1 && s.away?.price > 1)) continue;
    heures.set(cle, [s.home.releveAt, s.draw.releveAt, s.away.releveAt].sort().at(-1));
    bookmakers.push({
      key: cle,
      title: titreBookmaker(cle),
      markets: [{ key: 'h2h', outcomes: [{ name: 'Domicile', price: s.home.price }, { name: 'Draw', price: s.draw.price }, { name: 'Extérieur', price: s.away.price }] }]
    });
  }
  const c = computeMarketConsensus(bookmakers, 'Domicile', 'Extérieur');
  if (!c) return null;
  return {
    odds1: c.odds1,
    oddsDraw: c.oddsDraw,
    odds2: c.odds2,
    bookmakersCount: c.bookmakersCount,
    byBookmaker: c.perBookmaker.map((b) => ({ ...b, releveAt: heures.get(b.key) ?? null })),
    jeu: 'vos-bookmakers',
    releveAt: [...heures.values()].sort().at(-1) ?? null
  };
}
