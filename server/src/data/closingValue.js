/**
 * closingValue.js — la valeur de clôture des pronostics et des paris
 * (04/10/2026, Pierre : « lance les 4 améliorations »).
 * -----------------------------------------------------------------------
 * La meilleure mesure connue de la qualité d'un pronostic, bien avant que
 * les résultats aient le temps de parler : APRÈS le choix, la cote du
 * marché a-t-elle baissé (le marché lui a donné raison) ou monté ?
 *
 *   - Pronostic du moteur : probabilité juste du marché au moment où le
 *     pronostic a été enregistré, puis à la clôture. `clvPct` = de combien
 *     la cote juste de l'issue choisie a baissé (positif = bon signe).
 *   - Pari de Pierre : la cote prise contre la probabilité juste à la
 *     clôture. `valueAtClosePct` = cote prise × probabilité de clôture − 1,
 *     l'espérance du pari vue avec l'information de la dernière minute.
 *
 * Les prix viennent des relevés gratuits (cf. freeOdds.js, marketMovement.js).
 * Un relevé en temps réel date le prix du moment du choix ; un historique
 * rattrapé, lui, n'a qu'une ouverture et une clôture : le prix du choix est
 * alors celui de l'ouverture, et la ligne le dit (`approx: 'ouverture'`).
 *
 * Seuls trois marchés ont des cotes gratuites : le résultat 1N2, le
 * plus/moins de buts et les deux équipes marquent. Les autres (buts d'une
 * équipe, combinés résultat + buts, corners) sont comptés et nommés dans
 * « ce qui manque », jamais ignorés en silence.
 *
 * Le suivi des paris (étape 11, data/suiviParis.js) lit toutes les mesures
 * des paris (`toutesLesMesures`, non rendue par la route) pour donner sa
 * valeur de clôture à chaque pari.
 *
 * La calibration mensuelle (étape 20, data/calibration.js) mesure ses propres
 * entrées — les pronostics GELÉS du moteur (engine_picks) et les paris d'un
 * mois — avec la même mesure, entrée par entrée (`contexteDeMesure`,
 * `mesurerUneEntree`, `entreesDesParis`) : jamais une seconde écriture de la
 * règle. Une entrée qui porte déjà les identifiants FotMob de ses clubs
 * (`idsDuMagasin`, ceux du gel) n'est pas relue dans l'annuaire par ses noms.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { quotesForFixture } from './db/oddsQuotesRepository.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { listPredictions } from './repositories/predictionsRepository.js';
import { listBets, gainAttenduDuPari } from './repositories/betsRepository.js';
import { livresA, probabiliteMarche, libelleMarche } from './marketMovement.js';

const CACHE_MS = 5 * 60 * 1000;
const ENTREES_RENDUES = 400;

export const RAISONS = {
  marche:'Marché sans cote gratuite (buts d’une équipe, combiné résultat + buts, corners, tirs)',
  avenir: 'Match pas encore joué : la clôture n’est pas connue',
  apres: 'Pronostic enregistré après le coup d’envoi',
  equipe: 'Club non reconnu dans l’annuaire (nom différent de FotMob)',
  releve: 'Aucune cote relevée pour ce match (compétition non couverte, ou historique pas encore rattrapé)',
  marcheAbsent: 'Ce marché n’a pas été coté pour ce match',
  unSeul: 'Une seule cote connue : rien à comparer',
  sansDate: 'Ancien pronostic sans date de match, et rencontre introuvable au magasin'
};

/** L'issue cotée qui correspond à un pronostic ou à une jambe de pari. */
export function issueDe(entree) {
  const id = entree.marketId;
  const p = entree.params ?? {};
  const choix = p.outcome ?? p.side ?? entree.predictedOutcome ?? null;
  if (id === 'result' && ['home', 'draw', 'away'].includes(choix)) return { market: '1x2', line: 0, issue: choix };
  if (id === 'totalGoals') {
    const line = Number(p.line);
    if (Number.isFinite(line) && ['over', 'under'].includes(p.side ?? choix)) return { market: 'ou', line, issue: p.side ?? choix };
  }
  if (id === 'bothTeamsScore' && ['yes', 'no'].includes(choix)) return { market: 'btts', line: 0, issue: choix };
  return null;
}

function resolveur(database) {
  const memo = new Map();
  return (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!memo.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, database);
      } catch {
        id = null;
      }
      memo.set(cle, id);
    }
    return memo.get(cle);
  };
}

/** Un bookmaker au moins a-t-il deux prix distincts dans le temps pour ce marché ? */
function deuxPrix(fq, market, line) {
  return fq.sources.some((s) =>
    s.bookmakers.some((b) =>
      b.markets.some(
        (m) =>
          m.market === market &&
          Math.abs(Number(m.line) - Number(line)) < 1e-9 &&
          m.selections.some((x) => {
            const points = [x.open, x.preclose, ...(x.snapshots ?? []), x.close].filter(Boolean);
            return points.length >= 2;
          })
      )
    )
  );
}

/**
 * Mesure une entrée (pronostic ou jambe de pari) : la probabilité juste au
 * moment du choix et à la clôture, ou la raison pour laquelle on ne peut pas.
 */
function mesurer(e, { club, database, cacheFq, rencontreJouee }) {
  const cible = issueDe(e);
  if (!cible) return { raison: 'marche' };
  // Étape 20 : un pronostic gelé connaît déjà ses clubs (identifiants FotMob du gel) — pas de seconde lecture par les noms.
  const homeId = e.idsDuMagasin?.home ?? club(e.homeName, e.league);
  const awayId = e.idsDuMagasin?.away ?? club(e.awayName, e.league);
  if (!homeId || !awayId) return { raison: 'equipe' };
  const choixAt = e.pickAt;
  const coup = Date.parse(e.commenceTime ?? '');
  let date;
  if (Number.isFinite(coup)) {
    if (coup > Date.now()) return { raison: 'avenir' };
    if (choixAt && Date.parse(choixAt) >= coup) return { raison: 'apres' };
    date = new Date(coup).toISOString().slice(0, 10);
  } else {
    // Les pronostics d'avant le 30/09 n'ont pas l'heure du match : la
    // rencontre jouée par ces deux clubs dans les 15 jours qui suivent le
    // choix, lue au magasin. Sans heure, « après le coup d'envoi » ne se
    // décide qu'au jour près.
    const jour = String(choixAt ?? e.day ?? '').slice(0, 10);
    if (!jour) return { raison: 'sansDate' };
    const joue = rencontreJouee.get(homeId, awayId, jour, jour);
    if (!joue) return { raison: 'sansDate' };
    if (jour > joue.date) return { raison: 'apres' };
    date = joue.date;
  }
  const cle = `${homeId}|${awayId}|${date}`;
  if (!cacheFq.has(cle)) cacheFq.set(cle, quotesForFixture({ homeId, awayId, date }, { database }));
  const fq = cacheFq.get(cle);
  if (!fq.count) return { raison: 'releve' };
  // Sans heure de match, celle que donnent les sources de cotes : un pari
  // enregistré le soir d'un match joué l'après-midi n'est pas un pronostic.
  if (!Number.isFinite(coup) && choixAt) {
    const coups = fq.sources.flatMap((x) => x.events ?? []).map((ev) => Date.parse(ev.kickoff ?? '')).filter(Number.isFinite);
    if (coups.length && Date.parse(choixAt) >= Math.min(...coups)) return { raison: 'apres' };
  }

  const marches = [cible.market];
  const cloture = probabiliteMarche(livresA(fq, 'close', { markets: marches }), cible.market, cible.line, cible.issue);
  if (!cloture) return { raison: 'marcheAbsent' };
  let choix = choixAt ? probabiliteMarche(livresA(fq, 'at', { at: choixAt, markets: marches }), cible.market, cible.line, cible.issue) : null;
  let approx = null;
  if (!choix) {
    choix = probabiliteMarche(livresA(fq, 'open', { markets: marches }), cible.market, cible.line, cible.issue);
    approx = 'ouverture';
  }
  if (!choix) return { raison: 'marcheAbsent' };
  // Sans relevé daté, le prix du choix est l'ouverture : il faut alors au
  // moins un bookmaker qui ait DEUX prix pour ce marché (ouverture et
  // clôture, ou deux relevés), sinon on comparerait une cote à elle-même.
  if (approx && !deuxPrix(fq, cible.market, cible.line)) return { raison: 'unSeul' };
  return {
    cible,
    date,
    pickProb: choix.prob,
    closeProb: cloture.prob,
    clvPct: (cloture.prob / choix.prob - 1) * 100,
    approx,
    bookmakers: cloture.bookmakers,
    exchangeOnly: cloture.exchange,
    sources: fq.sources.map((s) => s.source)
  };
}

function resumer(mesures, valeur) {
  const n = mesures.length;
  if (!n) return { n: 0, avgPct: null, positiveShare: null };
  const valeurs = mesures.map(valeur);
  return {
    n,
    avgPct: valeurs.reduce((t, v) => t + v, 0) / n,
    positiveShare: valeurs.filter((v) => v > 0).length / n
  };
}

function parGroupe(mesures, cleDe, libelleDe, valeur) {
  const groupes = new Map();
  for (const m of mesures) {
    const cle = cleDe(m);
    if (!groupes.has(cle)) groupes.set(cle, { key: cle, label: libelleDe(m), items: [] });
    groupes.get(cle).items.push(m);
  }
  return [...groupes.values()].map((g) => ({ key: g.key, label: g.label, ...resumer(g.items, valeur) })).sort((a, b) => b.n - a.n);
}

function manques(compte) {
  return Object.entries(compte)
    .filter(([, n]) => n > 0)
    .map(([raison, count]) => ({ reason: raison, label: RAISONS[raison], count }))
    .sort((a, b) => b.count - a.count);
}

const cache = new Map();
const enCours = new Map();

/**
 * Le rapport de valeur de clôture. `scope` : `predictions` (le moteur) ou
 * `bets` (les paris de Pierre, jambe par jambe).
 */
export async function closingValueReport({ scope = 'predictions', force = false, database = openDb() } = {}) {
  const connu = cache.get(scope);
  if (!force && connu && Date.now() - connu.at < CACHE_MS) return connu.valeur;
  // Deux demandes simultanées attendent le même calcul.
  if (enCours.has(scope)) return enCours.get(scope);
  const calcul = calculerRapport(scope, database).finally(() => enCours.delete(scope));
  enCours.set(scope, calcul);
  return calcul;
}

/**
 * Le contexte d'une série de mesures : l'annuaire des clubs, les cotes déjà lues (une lecture par rencontre),
 * la rencontre jouée des anciens pronostics sans heure. Étape 20 : la calibration mensuelle s'en sert aussi.
 */
export function contexteDeMesure(database) {
  return {
    club: resolveur(database),
    database,
    cacheFq: new Map(),
    rencontreJouee: database.prepare(
      `SELECT date FROM matches WHERE home_id = ? AND away_id = ? AND home_goals IS NOT NULL
       AND date >= date(?, '-1 day') AND date <= date(?, '+15 day') ORDER BY date LIMIT 1`
    )
  };
}

/**
 * Une entrée mesurée (pronostic ou jambe de pari) : { cible, date, pickProb, closeProb, clvPct, approx, … } ou
 * { raison } (une clé de RAISONS). Ne lève pas : une lecture ratée compte « aucune cote relevée », comme dans
 * le rapport. `ctx` : contexteDeMesure(database), partagé par toute la série.
 */
export function mesurerUneEntree(e, ctx) {
  try {
    return mesurer(e, ctx);
  } catch {
    return { raison: 'releve' };
  }
}

/**
 * Les entrées des paris du carnet, une par sélection (`id` = « <pari>#<rang> ») : ce que mesure le rapport
 * `bets`, et ce que la calibration mensuelle (étape 20) mesure pour les paris d'un mois.
 */
export function entreesDesParis(bets) {
  return (bets ?? []).flatMap((bet) =>
    (bet.legs ?? []).map((leg, k) => ({
      ...leg,
      id: `${bet.id}#${k}`,
      betId: bet.id,
      legsCount: bet.legs.length,
      pickAt: bet.createdAt,
      oddsTaken: Number(leg.odds) || null,
      status: leg.status ?? bet.status,
      label: leg.pick,
      // Étape 10 (« J'ai parié ») : le bookmaker et l'avantage au moment du pari (pari simple dont la probabilité est notée).
      betBookmaker: bet.bookmaker ?? null,
      betBookmakerTitle: bet.bookmakerTitle ?? null,
      gainAttenduPct: bet.legs.length === 1 ? gainAttenduDuPari(bet).pourcent : null
    }))
  );
}

async function calculerRapport(scope, database) {

  const ctx = contexteDeMesure(database);
  const compte = Object.fromEntries(Object.keys(RAISONS).map((r) => [r, 0]));
  const mesures = [];

  const entrees = scope === 'bets' ? entreesDesParis(listBets()) : listPredictions().map((p) => ({ ...p, pickAt: p.firstSeenAt, label: p.predictedLabel }));

  for (const [n, e] of entrees.entries()) {
    if (n && n % 20 === 0) await new Promise((fin) => setImmediate(fin));
    let r;
    try {
      r = mesurer(e, ctx);
    } catch {
      r = { raison: 'releve' };
    }
    if (r.raison) {
      compte[r.raison]++;
      continue;
    }
    const valueAtClosePct = scope === 'bets' && e.oddsTaken ? (e.oddsTaken * r.closeProb - 1) * 100 : null;
    mesures.push({
      id: e.id,
      betId: e.betId ?? null,
      legsCount: e.legsCount ?? null,
      league: e.league ?? null,
      homeName: e.homeName,
      awayName: e.awayName,
      commenceTime: e.commenceTime ?? null,
      matchDate: r.date,
      pickAt: e.pickAt ?? null,
      market: r.cible.market,
      line: r.cible.line,
      marketLabel: libelleMarche(r.cible.market, r.cible.line),
      label: e.label ?? null,
      action: e.action ?? null,
      status: e.status ?? null,
      oddsTaken: e.oddsTaken ?? null,
      // Étape 10 : chez qui, et ce que le moteur donnait au moment du pari (null pour un pari d'avant l'étape 10 : « non noté »).
      bookmaker: scope === 'bets' ? (e.bookmaker ?? e.betBookmaker ?? null) : null,
      bookmakerTitle: scope === 'bets' ? (e.bookmakerTitle ?? e.betBookmakerTitle ?? null) : null,
      probabiliteMoteur: scope === 'bets' && Number.isFinite(e.probabiliteMoteur) ? e.probabiliteMoteur : null,
      gainAttenduPct: scope === 'bets' ? (e.gainAttenduPct ?? null) : null,
      pickProb: r.pickProb,
      closeProb: r.closeProb,
      pickFairOdds: 1 / r.pickProb,
      closeFairOdds: 1 / r.closeProb,
      clvPct: r.clvPct,
      valueAtClosePct,
      approx: r.approx,
      bookmakers: r.bookmakers,
      exchangeOnly: r.exchangeOnly,
      sources: r.sources
    });
  }

  // La mesure vedette : le mouvement de la cote juste pour un pronostic,
  // l'espérance à la clôture pour un pari (la cote prise est connue).
  const vedette = (m) => (scope === 'bets' && m.valueAtClosePct !== null ? m.valueAtClosePct : m.clvPct);
  const triees = [...mesures].sort((a, b) => String(b.commenceTime ?? b.matchDate).localeCompare(String(a.commenceTime ?? a.matchDate)));
  const valeur = {
    scope,
    generatedAt: new Date().toISOString(),
    totalEntries: entrees.length,
    measured: mesures.length,
    approxCount: mesures.filter((m) => m.approx).length,
    // Étape 10 : combien de paris mesurés ont leur probabilité du moteur notée (les paris d'avant l'étape 10 n'en ont pas).
    avecProbabilite: scope === 'bets' ? mesures.filter((m) => m.probabiliteMoteur !== null).length : null,
    summary: resumer(mesures, vedette),
    movement: resumer(mesures, (m) => m.clvPct),
    byMarket: parGroupe(mesures, (m) => `${m.market}|${m.line}`, (m) => m.marketLabel, vedette),
    byAction: scope === 'predictions' ? parGroupe(mesures, (m) => m.action ?? 'aucune', (m) => (m.action === 'RECOMMENDED' ? 'Paris recommandés' : 'Pronostics simples'), vedette) : [],
    byLeague: parGroupe(mesures, (m) => m.league ?? '—', (m) => m.league ?? '—', vedette).slice(0, 20),
    missing: manques(compte),
    entries: triees.slice(0, ENTREES_RENDUES)
  };
  // Étape 11 (suivi des paris) : TOUTES les mesures, pour la valeur de clôture de chaque pari — hors de la
  // réponse de la route (propriété non énumérable : JSON l'ignore), qui garde ses 400 plus récentes.
  Object.defineProperty(valeur, 'toutesLesMesures', { value: triees, enumerable: false });
  cache.set(scope, { at: Date.now(), valeur });
  return valeur;
}

/** Après une collecte de cotes : le rapport se recalcule au prochain appel. */
export function invalidateClosingValue() {
  cache.clear();
}
