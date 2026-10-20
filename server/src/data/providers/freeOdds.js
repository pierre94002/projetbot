/**
 * freeOdds.js — les cotes gratuites, relevées comme les données de match.
 * -----------------------------------------------------------------------
 * 04/10/2026, Pierre : « il faut que tu me récupères ça gratuitement, de la
 * même façon que tu me récupères les données pour le match ». Donc : aucune
 * clé payante, une collecte dans le processus serveur (l'actualisation
 * complète et la boucle oddsWatch), la provenance exacte de chaque valeur.
 *
 * Cinq fournisseurs, gratuits et lisibles depuis la France, au même contrat
 * (voir l'en-tête d'oddsQuotesRepository.js pour la forme d'une cote) :
 *   - espnOdds.js       ESPN : DraftKings (ouverture/clôture/courante), ESPN
 *                       BET, Bet 365… ; l'historique depuis 2023 ; le direct ;
 *   - kalshiOdds.js     Kalshi : probabilité, volume, intérêt ouvert ; la
 *                       saison 2025-26 en historique ;
 *   - smarketsOdds.js   Smarkets : carnet de bourse et volume en livres ;
 *   - scores365Odds.js  365Scores : Bet365 ouverture/courante, deux ans ;
 *   - footballDataOdds.js football-data.co.uk : pré-clôture et clôture
 *                       (moyenne, maximum, Betfair Exchange, Pinnacle,
 *                       Bet365), et fixtures.csv pour les matchs à venir.
 * Impossibles depuis la France ou interdits, et donc absents : Betfair,
 * Matchbook, Pinnacle en direct, Polymarket (bloqué par l'ANJ), le scraping
 * d'OddsPortal/BetExplorer, les « % des mises » des bookmakers français.
 *
 * Ce module n'interroge aucune source lui-même : il prépare les rencontres
 * (calendrier FotMob, identifiants des clubs), appelle chaque fournisseur,
 * range les cotes rendues (oddsQuotesRepository) et rattache les rencontres
 * jouées au magasin. Un fournisseur absent ou en panne n'arrête jamais les
 * autres : son bilan le dit.
 *
 * Le sens des cotes (`kind`) : un fournisseur rend, pour un match à venir,
 * l'ouverture (« open ») et la valeur du moment (« snapshot »). C'est ICI
 * que la valeur du moment devient la clôture provisoire (« close »,
 * remplacée à chaque relevé plus récent : la dernière avant le coup d'envoi
 * fait foi) et, dans les 48 heures qui précèdent le match, un point de la
 * série d'avant-match. Un relevé fait APRÈS le coup d'envoi n'est jamais
 * une clôture : il va dans la série « live ».
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { listSeasonCalendar } from '../repositories/seasonCalendarRepository.js';
import {
  upsertQuotes,
  attachQuotesToMatches,
  fillMatchOddsFromQuotes,
  readSourceState,
  writeSourceState,
  listSourceStates,
  leaguesWithMatchOdds,
  recordMisses,
  pruneMisses
} from '../db/oddsQuotesRepository.js';

const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;
/** La série d'avant-match ne garde que les dernières heures : au-delà, l'ouverture et la clôture suffisent. */
const SERIE_AVANT_MATCH_MS = 48 * HEURE_MS;

/**
 * Les fournisseurs, dans l'ordre d'appel. `upcoming`, `live`, `backfill` :
 * le nom de la fonction exportée quand il diffère du contrat commun.
 * `global` : le rattrapage couvre toutes les compétitions d'un coup (une
 * page de la source = une journée, toutes compétitions confondues).
 */
export const FOURNISSEURS = [
  // ESPN : une fois l'historique fini, les trois derniers jours sont relus
  // chaque jour — c'est là qu'apparaît la vraie clôture d'un match joué.
  { cle: 'espn', nom: 'ESPN', fichier: './espnOdds.js', relecture: { jours: 3, apresHeures: 20 } },
  // football-data : un fichier de saison, c'est jusqu'à 25 000 cotes ; quatre
  // fichiers par passage au plus — la centaine de fichiers depuis 2023 en deux heures environ.
  { cle: 'football-data.co.uk', nom: 'football-data.co.uk', fichier: './footballDataOdds.js', upcoming: 'collectFixturesCsv', live: null, backfill: 'backfillQuotes', budgetMax: 4 },
  { cle: '365scores', nom: '365Scores', fichier: './scores365Odds.js' },
  { cle: 'kalshi', nom: 'Kalshi', fichier: './kalshiOdds.js' },
  { cle: 'smarkets', nom: 'Smarkets', fichier: './smarketsOdds.js' }
];

const modules = new Map();
/** Charge un fournisseur ; null s'il manque ou ne se charge pas (le bilan le dira). */
async function charger(f) {
  if (modules.has(f.cle)) return modules.get(f.cle);
  let mod = null;
  let erreur = null;
  try {
    mod = await import(f.fichier);
  } catch (error) {
    erreur = error.message;
  }
  const entree = { mod, erreur };
  modules.set(f.cle, entree);
  return entree;
}

/**
 * Ce que chaque fournisseur couvre : ses compétitions (LIGUES) et ce qu'il
 * sait rendre (COUVERTURE : marchés, avant-match, direct, historique,
 * volumes, limites). Sert à dire, pour chaque cote absente, si la source ne
 * couvre pas la compétition ou si elle n'a simplement rien publié.
 */
export async function providerCoverage() {
  const liste = [];
  for (const f of FOURNISSEURS) {
    const { mod, erreur } = await charger(f);
    const ligues = mod?.LIGUES instanceof Map ? [...mod.LIGUES.keys()] : mod?.LIGUES ? Object.keys(mod.LIGUES) : [...(mod?.LIGUES_AVEC_COTES ?? [])];
    liste.push({
      source: f.cle,
      nom: f.nom,
      charge: Boolean(mod),
      erreur: erreur ?? null,
      ligues: new Set(ligues),
      couverture: mod?.COUVERTURE ?? null
    });
  }
  return liste;
}

const iso = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Écrit les cotes par tranches de `taille` : chaque transaction reste courte
 * (le serveur et l'actualisation complète écrivent dans la même base), et la
 * boucle d'événements reprend la main entre deux tranches. Un rattrapage
 * football-data rend jusqu'à 25 000 cotes par fichier.
 */
async function ecrireParTranches(cotes, database, taille = 5_000) {
  const total = { written: 0, unchanged: 0, rejected: 0, events: 0 };
  const liste = cotes ?? [];
  for (let i = 0; i < liste.length; i += taille) {
    const r = upsertQuotes(liste.slice(i, i + taille), { database });
    total.written += r.written;
    total.unchanged += r.unchanged;
    total.rejected += r.rejected;
    total.events += r.events;
    if (i + taille < liste.length) await new Promise((fin) => setImmediate(fin));
  }
  return total;
}
const plusJours = (jour, n) => iso(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS);

/** Les identifiants FotMob des clubs du calendrier, par l'annuaire strict, en cache. */
function resolveurDeClubs(database) {
  const cache = new Map();
  return (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!cache.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, database);
      } catch {
        id = null;
      }
      cache.set(cle, id);
    }
    return cache.get(cle);
  };
}

/**
 * Les rencontres À VENIR du calendrier FotMob d'une période, au format des
 * fournisseurs : { league, date, homeName, awayName, homeId, awayId,
 * kickoff, matchId }. Le calendrier ne connaît que le jour ; l'heure vient
 * de la source des cotes ou de la liste du jour FotMob (boucle oddsWatch).
 */
export function upcomingFixtures({ from, to, database = openDb() } = {}) {
  const club = resolveurDeClubs(database);
  return listSeasonCalendar({ allSeasons: true })
    .filter((e) => e.date >= from && e.date <= to && e.status !== 'finished' && e.status !== 'postponed' && e.homeGoals == null && e.league && e.homeName && e.awayName)
    .map((e) => ({
      league: e.league,
      date: e.date,
      homeName: e.homeName,
      awayName: e.awayName,
      homeId: club(e.homeName, e.league),
      awayId: club(e.awayName, e.league),
      kickoff: null,
      matchId: e.matchId ?? null
    }));
}

/**
 * Le sens des cotes d'avant-match (voir l'en-tête) : la valeur du moment
 * devient la clôture provisoire, et un point de série dans les 48 dernières
 * heures ; après le coup d'envoi, du direct.
 */
export function versAvantMatch(cotes, maintenant = Date.now()) {
  const sortie = [];
  for (const q of cotes ?? []) {
    if (!q) continue;
    if (q.kind !== 'snapshot') {
      sortie.push(q);
      continue;
    }
    const releve = Date.parse(q.releveAt ?? '') || maintenant;
    const coup = q.kickoff ? Date.parse(q.kickoff) : NaN;
    if (Number.isFinite(coup) && releve >= coup) {
      sortie.push({ ...q, kind: 'live' });
      continue;
    }
    sortie.push({ ...q, kind: 'close' });
    const avant = Number.isFinite(coup) ? coup - releve : Date.parse(`${q.date}T23:59:59Z`) - releve;
    if (avant <= SERIE_AVANT_MATCH_MS) sortie.push(q);
  }
  return sortie;
}

/**
 * Note les rencontres qu'un fournisseur couvre mais n'a pas pu coter, avec
 * sa raison, en retrouvant les identifiants FotMob de la rencontre dans la
 * liste demandée.
 */
/**
 * Les rencontres d'un fournisseur qui tombent sur une rencontre du calendrier
 * (mêmes identifiants, même sens, jour ± 1) confirment leurs deux noms chez
 * cette source (sourceMatching.confirmFixtureAliases).
 */
async function confirmerNoms(f, r, fixtures, database) {
  const evenements = (r?.events ?? []).filter((e) => e?.homeId && e.awayId && e.homeName && e.awayName && e.league && e.date);
  if (!evenements.length) return 0;
  let confirmFixtureAliases;
  try {
    ({ confirmFixtureAliases } = await import('./sourceMatching.js'));
  } catch {
    return 0;
  }
  const decaler = (jour, n) => iso(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS);
  const index = new Set(fixtures.filter((x) => x.homeId && x.awayId).map((x) => `${x.league}|${x.homeId}|${x.awayId}|${x.date}`));
  let appris = 0;
  for (const e of evenements) {
    const present = [-1, 0, 1].some((n) => index.has(`${e.league}|${e.homeId}|${e.awayId}|${decaler(e.date, n)}`));
    if (!present) continue;
    try {
      appris += confirmFixtureAliases({ source: f.cle, league: e.league, homeName: e.homeName, awayName: e.awayName, homeId: e.homeId, awayId: e.awayId, database });
    } catch {
      // un alias non écrit n'empêche rien : il sera retrouvé à la passe suivante
    }
  }
  return appris;
}

function noterManques(f, r, fixtures, database) {
  const manques = (r?.missing ?? []).filter(Boolean);
  if (!manques.length) return 0;
  const index = new Map(fixtures.map((x) => [`${x.league}|${x.date}|${x.homeName}|${x.awayName}`, x]));
  const lignes = manques.map((m) => {
    const fx = index.get(`${m.league}|${m.date}|${m.homeName}|${m.awayName}`) ?? null;
    return { source: f.cle, league: m.league, date: m.date, homeName: m.homeName, awayName: m.awayName, homeId: fx?.homeId ?? null, awayId: fx?.awayId ?? null, reason: m.reason ?? 'aucune cote' };
  });
  try {
    return recordMisses(lignes, { database }).recorded;
  } catch {
    return 0;
  }
}

function bilanDe(f, r, ecrit, debut) {
  return {
    source: f.cle,
    nom: f.nom,
    events: Array.isArray(r?.events) ? r.events.length : (r?.events ?? null),
    quotes: r?.quotes?.length ?? 0,
    written: ecrit?.written ?? 0,
    unchanged: ecrit?.unchanged ?? 0,
    rejected: ecrit?.rejected ?? 0,
    requests: r?.requests ?? null,
    unresolved: (r?.unresolved ?? []).length,
    unresolvedSample: (r?.unresolved ?? []).slice(0, 12).map((u) => (typeof u === 'string' ? u : `${u.name} (${u.league})`)),
    errors: (r?.errors ?? []).slice(0, 5).map((e) => String(e?.message ?? e).slice(0, 200)),
    ms: Date.now() - debut
  };
}

/**
 * Relevé des cotes des rencontres à venir. `fixtures` : la liste à relever
 * (par défaut, le calendrier des `days` prochains jours) ; `sources` : les
 * clés de fournisseurs à appeler (par défaut, tous).
 */
export async function collectUpcomingOdds({ database = openDb(), days = 14, fixtures = null, sources = null, log = () => {} } = {}) {
  const aujourdHui = iso(Date.now());
  const liste = fixtures ?? upcomingFixtures({ from: aujourdHui, to: plusJours(aujourdHui, days), database });
  const bilans = [];
  if (!liste.length) return { fixtures: 0, sources: bilans, attached: 0 };
  for (const f of FOURNISSEURS) {
    if (sources && !sources.includes(f.cle)) continue;
    const { mod, erreur } = await charger(f);
    const fn = mod?.[f.upcoming ?? 'collectUpcoming'];
    if (typeof fn !== 'function') {
      bilans.push({ source: f.cle, nom: f.nom, status: 'absent', error: erreur ?? 'fonction absente' });
      continue;
    }
    const debut = Date.now();
    try {
      const r = await fn({ fixtures: liste, database, log });
      const ecrit = await ecrireParTranches(versAvantMatch(r?.quotes), database);
      const manques = noterManques(f, r, liste, database);
      const confirmes = await confirmerNoms(f, r, liste, database);
      bilans.push({ ...bilanDe(f, r, ecrit, debut), missing: manques, aliasesConfirmed: confirmes });
    } catch (error) {
      bilans.push({ source: f.cle, nom: f.nom, error: String(error.message).slice(0, 300), ms: Date.now() - debut });
    }
  }
  let attached = 0;
  try {
    attached = attachQuotesToMatches({ database }).attached;
  } catch {
    attached = 0;
  }
  return { fixtures: liste.length, sources: bilans, attached };
}

/** Relevé des cotes EN DIRECT des rencontres en cours (`fixtures`). */
export async function collectLiveOdds({ database = openDb(), fixtures = [], sources = null, log = () => {} } = {}) {
  const bilans = [];
  if (!fixtures.length) return { fixtures: 0, sources: bilans };
  for (const f of FOURNISSEURS) {
    if (sources && !sources.includes(f.cle)) continue;
    if (f.live === null) continue;
    const { mod } = await charger(f);
    const fn = mod?.[f.live ?? 'collectLive'];
    if (typeof fn !== 'function') continue;
    const debut = Date.now();
    try {
      const r = await fn({ fixtures, database, log });
      // Une cote relevée en match est du direct, quel que soit le nom que lui donne la source.
      const cotes = (r?.quotes ?? []).map((q) => (q && (q.kind === 'snapshot' || q.kind === 'close') ? { ...q, kind: 'live' } : q));
      const ecrit = await ecrireParTranches(cotes, database);
      const manques = noterManques(f, r, fixtures, database);
      bilans.push({ ...bilanDe(f, r, ecrit, debut), missing: manques });
    } catch (error) {
      bilans.push({ source: f.cle, nom: f.nom, error: String(error.message).slice(0, 300), ms: Date.now() - debut });
    }
  }
  return { fixtures: fixtures.length, sources: bilans };
}

/**
 * Les compétitions d'un fournisseur, dans l'ordre du rattrapage : celles
 * qui n'ont encore AUCUNE cote au profilage d'abord (c'est le trou à
 * combler), puis les autres.
 */
function ordreDesCompetitions(mod, database) {
  const ligues = mod?.LIGUES instanceof Map ? [...mod.LIGUES.keys()] : Object.keys(mod?.LIGUES ?? {});
  let avecCotes = new Set();
  try {
    avecCotes = leaguesWithMatchOdds({ database });
  } catch {
    avecCotes = new Set();
  }
  return [...ligues.filter((l) => !avecCotes.has(l)), ...ligues.filter((l) => avecCotes.has(l))];
}

/**
 * Rattrapage de l'historique, par tranches : `budget` requêtes au plus par
 * fournisseur et par appel. Chaque compétition reprend où la passe
 * précédente s'est arrêtée (odds_source_state) ; une compétition finie
 * n'est plus relue.
 */
export async function backfillOdds({ database = openDb(), budget = 60, sources = null, deadline = null, tempsParSource = null, log = () => {} } = {}) {
  const bilans = [];
  const fournisseursActifs = FOURNISSEURS.filter((f) => !sources || sources.includes(f.cle));
  // Sans part fixée, le temps restant se partage entre les sources à venir :
  // la première (ESPN, la plus longue à rattraper) ne prend jamais tout.
  const partDe = (index) => {
    if (!deadline) return null;
    const restant = deadline - Date.now();
    const part = tempsParSource ?? restant / Math.max(1, fournisseursActifs.length - index);
    return Date.now() + Math.max(0, Math.min(restant, part));
  };
  for (const [index, f] of fournisseursActifs.entries()) {
    // Le rattrapage cède toujours la place : passé l'heure limite, il reprendra à la passe suivante.
    if (deadline && Date.now() > deadline) break;
    const limite = partDe(index);
    const { mod, erreur } = await charger(f);
    const fn = mod?.[f.backfill ?? 'backfill'];
    if (typeof fn !== 'function') {
      bilans.push({ source: f.cle, nom: f.nom, status: 'absent', error: erreur ?? 'fonction absente' });
      continue;
    }
    const global = mod.BACKFILL_GLOBAL === true;
    const portees = global ? ['*'] : ordreDesCompetitions(mod, database);
    const bilan = { source: f.cle, nom: f.nom, requests: 0, quotes: 0, written: 0, scopes: 0, done: 0, errors: [] };
    const budgetSource = Math.min(budget, f.budgetMax ?? budget);
    const debut = Date.now();
    for (const portee of portees) {
      if (bilan.requests >= budgetSource) break;
      if (limite && Date.now() > limite) break;
      let etat = readSourceState(f.cle, portee, { database });
      if (etat?.done) {
        const relire = f.relecture && etat.updatedAt && Date.now() - Date.parse(etat.updatedAt) > f.relecture.apresHeures * 3_600_000;
        if (!relire) {
          bilan.done++;
          continue;
        }
        // Les derniers jours, relus : le curseur repart quelques jours en arrière.
        etat = { ...etat, cursor: iso(Date.now() - f.relecture.jours * JOUR_MS), done: false };
      }
      try {
        const r = await fn({ league: global ? null : portee, database, budget: budgetSource - bilan.requests, state: etat ? { cursor: etat.cursor } : null, deadline: limite, log });
        const ecrit = await ecrireParTranches(r?.quotes ?? [], database);
        bilan.requests += r?.requests ?? 0;
        bilan.quotes += r?.quotes?.length ?? 0;
        bilan.written += ecrit.written;
        bilan.scopes++;
        const cumul = etat?.detail ?? {};
        writeSourceState(
          f.cle,
          portee,
          {
            cursor: r?.cursor ?? null,
            done: Boolean(r?.done),
            detail: {
              requests: (cumul.requests ?? 0) + (r?.requests ?? 0),
              quotes: (cumul.quotes ?? 0) + (r?.quotes?.length ?? 0),
              written: (cumul.written ?? 0) + ecrit.written,
              attached: (cumul.attached ?? 0) + (r?.bilan?.attached ?? 0),
              unresolved: r?.bilan?.unresolvedNames?.slice?.(0, 20) ?? cumul.unresolved ?? []
            }
          },
          { database }
        );
        if (r?.done) bilan.done++;
        // Une source qui ne rend plus rien sans finir : on n'insiste pas à cette passe.
        if (!r?.requests && !r?.done && !r?.bilan?.aJour) break;
      } catch (error) {
        bilan.errors.push(`${portee} : ${String(error.message).slice(0, 200)}`);
        break;
      }
    }
    bilan.total = portees.length;
    bilan.ms = Date.now() - debut;
    bilans.push(bilan);
  }
  return { sources: bilans };
}

/**
 * Après une collecte : rattache les rencontres jouées au magasin, puis
 * complète le profilage de cotes (match_odds) là où football-data ne couvre
 * pas la compétition.
 */
export function finalizeOdds({ database = openDb() } = {}) {
  const attache = attachQuotesToMatches({ database });
  const profil = fillMatchOddsFromQuotes({ database });
  // Les raisons des cotes absentes ne servent plus un mois après le match.
  let purge = 0;
  try {
    purge = pruneMisses(iso(Date.now() - 30 * JOUR_MS), { database }).pruned;
  } catch {
    purge = 0;
  }
  return { attached: attache.attached, matchOddsFilled: profil.filled, matchOddsCandidates: profil.candidates, missesPruned: purge };
}

/** Avancement du rattrapage, par fournisseur : compétitions finies / à faire. */
export function backfillProgress({ database = openDb() } = {}) {
  return FOURNISSEURS.map((f) => {
    let etats = [];
    try {
      etats = listSourceStates(f.cle, { database });
    } catch {
      etats = [];
    }
    return {
      source: f.cle,
      nom: f.nom,
      scopes: etats.length,
      done: etats.filter((e) => e.done).length,
      requests: etats.reduce((n, e) => n + (e.detail?.requests ?? 0), 0),
      written: etats.reduce((n, e) => n + (e.detail?.written ?? 0), 0),
      lastAt: etats.map((e) => e.updatedAt).sort().at(-1) ?? null
    };
  });
}
