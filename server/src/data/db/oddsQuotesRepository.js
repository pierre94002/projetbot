/**
 * oddsQuotesRepository.js — les cotes et prix de marché gratuits (odds_events + odds_quotes).
 * -----------------------------------------------------------------------
 * Seul point d'écriture des deux tables (voir le DDL dans matchStatsDb.js) :
 * les fournisseurs (espnOdds.js, kalshiOdds.js, smarketsOdds.js,
 * scores365Odds.js, footballDataOdds.js) rendent des cotes NORMALISÉES et
 * ne touchent jamais à la base. Une cote normalisée :
 *
 *   { source, sourceEvent, bookmaker, market, selection, line, price, prob,
 *     volume, openInterest, kind, releveAt, date, kickoff, league,
 *     homeId, awayId, homeName, awayName, matchKey, provenance }
 *
 * Le dépôt la range en deux : la rencontre vue par la source (odds_events,
 * une ligne par source et identifiant de rencontre) et la cote elle-même
 * (odds_quotes). Politique d'écriture, portée par la clé de odds_quotes :
 *   - open      : première valeur connue, jamais écrasée ;
 *   - preclose, close : dernière valeur relevée (un relevé plus ancien ne
 *     remplace jamais un plus récent) ;
 *   - snapshot, live  : série ; une ligne par relevé, ignorée si rien n'a
 *     changé depuis le relevé précédent (prix, probabilité, volume).
 *
 * Lecture : par rencontre du magasin (match_key) ou par affiche (les deux
 * identifiants FotMob et le jour ± 1), regroupée par source, bookmaker et
 * marché, avec la provenance exacte de chaque valeur.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';

export const KINDS_FIXES = new Set(['open', 'preclose', 'close']);
export const KINDS_SERIES = new Set(['snapshot', 'live']);
export const MARCHES = new Set(['1x2', 'ou', 'ah', 'btts', 'dc', 'dnb', 'exact', 'ht_1x2', 'ht_ou', 'team_total']);
/** Prix d'échange sans marge : jamais mêlés aux cotes de bookmaker du profilage. */
export const SOURCES_ECHANGE = new Set(['kalshi', 'smarkets']);
/**
 * Cotes PAYANTES archivées (étape E du plan, 05/10/2026) : chaque cote
 * relevée à la main chez The Odds API, avec l'heure du relevé (cf.
 * data/enregistreurs/cotesPayantes.js). Elles vivent dans les mêmes tables
 * — une seule archive de toutes les cotes, que l'étape 7 lira —, mais les
 * lectures des cotes GRATUITES les écartent : chutes de cotes, couverture,
 * cotes de référence du moteur, profilage, onglet « Cotes » d'un match et
 * provenance « Cotes gratuites » restent exactement ce qu'ils étaient. Une
 * lecture qui les veut le demande (`avecPayantes`).
 */
export const SOURCES_PAYANTES = new Set(['odds-api']);
/**
 * Cotes SAISIES À LA MAIN (étape 7 du plan, 06/10/2026) : une cote vue par
 * Pierre chez un de SES bookmakers, sur un marché que rien ne relève
 * (corners, cartons, buteurs, plus/moins…), gardée avec l'heure de la saisie
 * (cf. data/saisiesCotes.js). Mêmes tables, source « saisie » ; une saisie
 * retirée est une ligne sans prix. Écartées de TOUTES les lectures des cotes
 * gratuites, et de celles qui demandent les cotes payantes (`avecPayantes`) :
 * seules saisiesCotes.js et cotesDeVosBookmakers.js les lisent.
 */
export const SOURCE_SAISIE = 'saisie';
export const SOURCES_SAISIES = new Set([SOURCE_SAISIE]);
const listeSql = (sources) => [...sources].map((s) => `'${s}'`).join(', ');
/** Fragment SQL : la colonne `colonne` (source d'odds_events) n'est ni une source payante, ni une saisie à la main. */
export const sqlHorsPayantes = (colonne = 'source') => `${colonne} NOT IN (${listeSql([...SOURCES_PAYANTES, ...SOURCES_SAISIES])})`;
/** Fragment SQL : la colonne `colonne` n'est pas une saisie à la main (lectures `avecPayantes`). */
export const sqlHorsSaisies = (colonne = 'source') => `${colonne} NOT IN (${listeSql(SOURCES_SAISIES)})`;

/**
 * Ordre de préférence des bookmakers pour une cote « de référence » (celle
 * qui va dans match_odds pour le profilage quand football-data ne couvre
 * pas la compétition). Mesuré le 23/09/2026 : la bourse Betfair à la
 * clôture et la moyenne du marché sont les plus justes ; Pinnacle n'existe
 * plus après 2025 ; un bookmaker seul vient après.
 */
export const BOOKMAKERS_DE_REFERENCE = [
  'Betfair Exchange',
  'Moyenne du marché',
  'Pinnacle',
  'Maximum du marché',
  'DraftKings',
  'ESPN BET',
  'Bet 365',
  'Bet365',
  'Unibet',
  'BetfairSportsbook',
  'Caesars'
];

const decimale = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 1 ? n : null;
};
const probabilite = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
};
const nombre = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const isoOuNull = (x) => {
  if (!x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Vérifie et met en forme une cote ; null si elle est inutilisable. */
export function normaliserCote(q) {
  if (!q || !q.source || !q.sourceEvent || !q.bookmaker || !q.market || !q.selection || !q.kind) return null;
  if (!KINDS_FIXES.has(q.kind) && !KINDS_SERIES.has(q.kind)) return null;
  if (!q.date || !/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !q.league || !q.homeName || !q.awayName) return null;
  const prob = probabilite(q.prob);
  let price = decimale(q.price);
  // Un prix d'échange sans cote décimale : 1/prob suffit à l'afficher.
  if (!price && prob) price = Math.round((1 / prob) * 1000) / 1000;
  if (!price && !prob) return null;
  return {
    source: String(q.source),
    sourceEvent: String(q.sourceEvent),
    bookmaker: String(q.bookmaker),
    market: String(q.market),
    selection: String(q.selection),
    line: nombre(q.line) ?? 0,
    price,
    prob,
    volume: nombre(q.volume),
    openInterest: nombre(q.openInterest),
    kind: q.kind,
    releveAt: isoOuNull(q.releveAt) ?? new Date().toISOString(),
    date: q.date,
    kickoff: isoOuNull(q.kickoff),
    league: String(q.league),
    homeId: q.homeId ?? null,
    awayId: q.awayId ?? null,
    homeName: String(q.homeName),
    awayName: String(q.awayName),
    matchKey: q.matchKey ?? null,
    provenance: q.provenance ?? null
  };
}

const requetes = new WeakMap();
function prepares(database) {
  let r = requetes.get(database);
  if (r) return r;
  const colonnes = 'event_id, bookmaker, market, selection, line, kind, seq, releve_at, price, prob, volume, open_interest';
  const params = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
  const cle = 'ON CONFLICT(event_id, bookmaker, market, selection, line, kind, seq)';
  r = {
    evenement: database.prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, source_event) DO UPDATE SET
        league = excluded.league, date = excluded.date, kickoff = COALESCE(excluded.kickoff, odds_events.kickoff),
        home_name = excluded.home_name, away_name = excluded.away_name,
        home_id = COALESCE(excluded.home_id, odds_events.home_id), away_id = COALESCE(excluded.away_id, odds_events.away_id),
        match_key = COALESCE(excluded.match_key, odds_events.match_key), provenance = COALESCE(excluded.provenance, odds_events.provenance),
        updated_at = excluded.updated_at
      RETURNING id`),
    open: database.prepare(`INSERT INTO odds_quotes (${colonnes}) VALUES (${params}) ${cle} DO NOTHING`),
    fixe: database.prepare(`INSERT INTO odds_quotes (${colonnes}) VALUES (${params}) ${cle} DO UPDATE SET
      releve_at = excluded.releve_at, price = excluded.price, prob = excluded.prob, volume = excluded.volume, open_interest = excluded.open_interest
      WHERE excluded.releve_at >= odds_quotes.releve_at`),
    serie: database.prepare(`INSERT INTO odds_quotes (${colonnes}) VALUES (${params}) ${cle} DO NOTHING`),
    dernier: database.prepare(`SELECT price, prob, volume, open_interest AS openInterest FROM odds_quotes
      WHERE event_id = ? AND bookmaker = ? AND market = ? AND selection = ? AND line = ? AND kind = ?
      ORDER BY seq DESC LIMIT 1`)
  };
  requetes.set(database, r);
  return r;
}

const pareil = (a, b) => a && b && a.price === b.price && a.prob === b.prob && a.volume === b.volume && a.openInterest === b.openInterest;

/**
 * Écrit un lot de cotes. Rend le bilan : cotes écrites, ignorées (déjà là
 * ou inchangées), refusées (mal formées), rencontres touchées.
 *
 * `garderChaqueReleve` : une série (snapshot, live) garde une ligne par
 * relevé même quand la cote n'a pas bougé — l'archive des cotes payantes
 * (étape E) : chaque cote relevée, avec son heure. Le même relevé rejoué
 * (même heure) ne double rien : la clé porte l'heure.
 */
export function upsertQuotes(cotes, { database = openDb(), garderChaqueReleve = false } = {}) {
  const r = prepares(database);
  const bilan = { written: 0, unchanged: 0, rejected: 0, events: 0 };
  const ids = new Map();
  const maintenant = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const brute of cotes ?? []) {
      const c = normaliserCote(brute);
      if (!c) {
        bilan.rejected++;
        continue;
      }
      const cleEvenement = `${c.source}|${c.sourceEvent}`;
      let eventId = ids.get(cleEvenement);
      if (!eventId) {
        eventId = r.evenement.get(c.source, c.sourceEvent, c.league, c.date, c.kickoff, c.homeName, c.awayName, c.homeId, c.awayId, c.matchKey, c.provenance, maintenant).id;
        ids.set(cleEvenement, eventId);
        bilan.events++;
      }
      const valeurs = (seq) => [eventId, c.bookmaker, c.market, c.selection, c.line, c.kind, seq, c.releveAt, c.price, c.prob, c.volume, c.openInterest];
      let resultat;
      if (c.kind === 'open') resultat = r.open.run(...valeurs(''));
      else if (KINDS_FIXES.has(c.kind)) resultat = r.fixe.run(...valeurs(''));
      else {
        if (!garderChaqueReleve && pareil(r.dernier.get(eventId, c.bookmaker, c.market, c.selection, c.line, c.kind), c)) {
          bilan.unchanged++;
          continue;
        }
        resultat = r.serie.run(...valeurs(c.releveAt));
      }
      if (resultat.changes > 0) bilan.written++;
      else bilan.unchanged++;
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return bilan;
}

/**
 * Les cotes SAISIES À LA MAIN (étape 7 du plan), dans les mêmes tables,
 * source « saisie ». Une ligne par saisie, correction ou RETRAIT (prix vide :
 * la saisie ne compte plus, l'archive garde qu'elle a existé). Série
 * (`snapshot`), clé portant l'heure de la saisie : AJOUT SEULEMENT, jamais une
 * ligne réécrite ; la même saisie rejouée (même heure) ne double rien.
 * `lignes` : [{ sourceEvent, league, date, kickoff, homeName, awayName,
 * homeId, awayId, provenance, bookmaker, market, selection, line, price
 * (null = retrait), releveAt }]. Une seule transaction (BEGIN IMMEDIATE).
 * Appelée par la file des enregistreurs (enregistreurs/file.js), jamais
 * pendant un import. Rend le nombre de lignes écrites.
 */
export function ecrireSaisies(lignes, { database = openDb() } = {}) {
  const evenement = database.prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(source, source_event) DO UPDATE SET
      kickoff = COALESCE(excluded.kickoff, odds_events.kickoff),
      home_id = COALESCE(excluded.home_id, odds_events.home_id), away_id = COALESCE(excluded.away_id, odds_events.away_id),
      updated_at = excluded.updated_at
    RETURNING id`);
  const cote = database.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price, prob, volume, open_interest)
    VALUES (?, ?, ?, ?, ?, 'snapshot', ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(event_id, bookmaker, market, selection, line, kind, seq) DO NOTHING`);
  let ecrites = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const l of lignes ?? []) {
      const releveAt = isoOuNull(l?.releveAt);
      if (!l?.sourceEvent || !l.bookmaker || !l.market || !l.selection || !releveAt || !l.date || !l.league || !l.homeName || !l.awayName) continue;
      const prix = l.price === null || l.price === undefined ? null : decimale(l.price);
      if (l.price !== null && l.price !== undefined && prix === null) continue;
      const id = evenement.get(SOURCE_SAISIE, String(l.sourceEvent), String(l.league), l.date, isoOuNull(l.kickoff), String(l.homeName), String(l.awayName), l.homeId ?? null, l.awayId ?? null, l.provenance ?? null, releveAt).id;
      ecrites += cote.run(id, String(l.bookmaker), String(l.market), String(l.selection), nombre(l.line) ?? 0, releveAt, releveAt, prix).changes;
    }
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* déjà annulée */
    }
    throw error;
  }
  return ecrites;
}

/**
 * Toutes les lignes saisies d'une rencontre (source « saisie », `sourceEvent`),
 * dans l'ordre des saisies : { bookmaker, market, selection, line, releveAt, price }.
 */
export function lireSaisies(sourceEvent, { database = openDb() } = {}) {
  return database
    .prepare(`SELECT q.bookmaker, q.market, q.selection, q.line, q.seq, q.releve_at AS releveAt, q.price
              FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
              WHERE e.source = ? AND e.source_event = ? ORDER BY q.seq, q.bookmaker, q.market, q.selection, q.line`)
    .all(SOURCE_SAISIE, String(sourceEvent));
}

const decaler = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * Remplit `match_key` des rencontres qui n'en ont pas encore : celle du
 * magasin qui oppose les mêmes identifiants, au jour le plus proche à un
 * jour près. Une rencontre à venir n'est pas dans `matches` : ses cotes
 * attendent, c'est normal.
 *
 * LIRE D'ABORD, ÉCRIRE ENSUITE D'UN COUP (retouche du 12/10/2026). Avant,
 * un seul UPDATE cherchait la rencontre de chaque cote ET l'écrivait : SQLite
 * prend le verrou d'écriture au début d'un UPDATE et le garde jusqu'à la fin,
 * même quand rien ne change. Or la recherche est lente : pour chaque cote,
 * toutes les rencontres du club qui se déplace (index des identifiants), lues
 * jusqu'à `home_id` et `away_id`, rangés EN FIN de ligne, après plusieurs ko
 * de listes JSON (~17 ms par cote sur la base de Pierre). Dans la nuit du 11
 * au 12/10/2026, la boucle des cotes gratuites (jobs/oddsWatch.js, qui ne
 * regarde pas le verrou de la passe) a eu 1 536 cotes à rattacher aux 299
 * rencontres que la passe venait d'importer : 27 s de verrou d'écriture
 * (mesurées sur une copie de la sauvegarde de la nuit), et l'étape
 * « annuaires », dans son processus à part, a renoncé au bout de ses 15 s
 * d'attente. Maintenant la recherche se fait en LECTURE, sans verrou
 * d'écriture (en WAL, une lecture ne gêne aucun écrivain) ; puis une seule
 * transaction courte écrit ce qui a été trouvé, ligne par ligne, et seulement
 * là où `match_key` est encore vide (un autre écrivain passé entre les deux
 * n'est jamais écrasé). Mêmes rencontres trouvées qu'avant (même recherche,
 * même ordre) ; rien à rattacher : aucune écriture, aucun verrou.
 */
export function attachQuotesToMatches({ database = openDb(), since = null } = {}) {
  const depuis = since ?? decaler(aujourdhui(), -1200);
  const trouvees = database
    .prepare(`SELECT e.id, (
        SELECT m.match_key FROM matches m
        WHERE m.home_id = e.home_id AND m.away_id = e.away_id
          AND m.date >= date(e.date, '-1 day') AND m.date <= date(e.date, '+1 day')
        ORDER BY abs(julianday(m.date) - julianday(e.date)) LIMIT 1) AS cle
      FROM odds_events e
      WHERE e.match_key IS NULL AND e.home_id IS NOT NULL AND e.away_id IS NOT NULL AND e.date >= ? AND e.date <= ?`)
    .all(depuis, decaler(aujourdhui(), 1))
    .filter((r) => r.cle !== null && r.cle !== undefined);
  if (!trouvees.length) return { attached: 0 };
  const rattacher = database.prepare('UPDATE odds_events SET match_key = ? WHERE id = ? AND match_key IS NULL');
  let attached = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const r of trouvees) attached += rattacher.run(r.cle, r.id).changes;
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* déjà annulée */
    }
    throw error;
  }
  return { attached };
}

/**
 * Complète `match_odds` (le profilage de cotes) pour les rencontres jouées
 * qui n'y sont pas : la clôture 1x2 (à défaut l'ouverture) du bookmaker de
 * référence le mieux placé, et son plus/moins 2,5 s'il l'a. Les lignes déjà
 * là (football-data) ne sont jamais touchées. Les prix d'échange (Kalshi,
 * Smarkets) n'y entrent pas : sans marge, ils ne se comparent pas aux cotes
 * de bookmaker que le profilage rapproche.
 */
export function fillMatchOddsFromQuotes({ database = openDb(), since = '2023-01-01' } = {}) {
  // Ni les prix d'échange, ni les cotes payantes archivées (étape E), ni les
  // saisies à la main (étape 7) : le profilage garde ses sources d'avant.
  const echanges = [...SOURCES_ECHANGE, ...SOURCES_PAYANTES, ...SOURCES_SAISIES].map((s) => `'${s}'`).join(', ');
  const candidates = database
    .prepare(`SELECT DISTINCT e.match_key AS matchKey FROM odds_events e
              WHERE e.match_key IS NOT NULL AND e.date >= ? AND e.source NOT IN (${echanges})
                AND NOT EXISTS (SELECT 1 FROM match_odds o WHERE o.match_key = e.match_key)
                AND EXISTS (SELECT 1 FROM odds_quotes q WHERE q.event_id = e.id AND q.market = '1x2' AND q.kind IN ('close', 'open'))`)
    .all(since)
    .map((r) => r.matchKey);
  if (!candidates.length) return { filled: 0, candidates: 0 };

  const lire = database.prepare(`SELECT e.source, q.bookmaker, q.market, q.selection, q.line, q.price, q.kind, q.releve_at AS releveAt
                                 FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
                                 WHERE e.match_key = ? AND e.source NOT IN (${echanges}) AND q.market IN ('1x2', 'ou') AND q.kind IN ('close', 'open')`);
  const ins = database.prepare(`INSERT OR IGNORE INTO match_odds (match_key, source, basis, home, draw, away, over25, under25, fetched_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const rang = (b) => {
    const i = BOOKMAKERS_DE_REFERENCE.indexOf(b);
    return i === -1 ? BOOKMAKERS_DE_REFERENCE.length : i;
  };
  let filled = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const matchKey of candidates) {
      // Par (source, bookmaker, kind) : un jeu complet domicile/nul/extérieur.
      const jeux = new Map();
      for (const l of lire.all(matchKey)) {
        const cle = `${l.source}|${l.bookmaker}|${l.kind}`;
        const j = jeux.get(cle) ?? { source: l.source, bookmaker: l.bookmaker, kind: l.kind, releveAt: l.releveAt };
        if (l.market === '1x2') j[l.selection] = l.price;
        if (l.market === 'ou' && Math.abs(l.line - 2.5) < 1e-9) j[l.selection === 'over' ? 'over25' : 'under25'] = l.price;
        jeux.set(cle, j);
      }
      const complets = [...jeux.values()].filter((j) => j.home > 1 && j.draw > 1 && j.away > 1);
      if (!complets.length) continue;
      complets.sort((a, b) => (a.kind === 'close' ? 0 : 1) - (b.kind === 'close' ? 0 : 1) || rang(a.bookmaker) - rang(b.bookmaker));
      const j = complets[0];
      const basis = `${j.bookmaker} ${j.kind === 'close' ? 'clôture' : 'ouverture'}`;
      const r = ins.run(matchKey, j.source, basis, j.home, j.draw, j.away, j.over25 ?? null, j.under25 ?? null, j.releveAt);
      if (r.changes > 0) filled++;
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { filled, candidates: candidates.length };
}

/**
 * Les rencontres d'une affiche : par `matchKey` quand elle est au magasin ;
 * par les deux identifiants FotMob et le jour (± 1) ; en dernier recours
 * par les noms exacts de la source et le jour.
 */
function evenementsDe({ matchKey, homeId, awayId, date, homeName, awayName, league }, database, { avecPayantes = false } = {}) {
  const conditions = [];
  const params = [];
  if (matchKey) {
    conditions.push('match_key = ?');
    params.push(matchKey);
  }
  if (homeId && awayId && date) {
    conditions.push("(home_id = ? AND away_id = ? AND date >= date(?, '-1 day') AND date <= date(?, '+1 day'))");
    params.push(homeId, awayId, date, date);
  }
  if (!conditions.length && homeName && awayName && date) {
    conditions.push(`(home_name = ? AND away_name = ? AND date >= date(?, '-1 day') AND date <= date(?, '+1 day')${league ? ' AND league = ?' : ''})`);
    params.push(homeName, awayName, date, date);
    if (league) params.push(league);
  }
  if (!conditions.length) return [];
  // Les cotes payantes archivées (étape E) seulement si on les demande ; les
  // saisies à la main (étape 7) jamais.
  const filtre = avecPayantes ? ` AND ${sqlHorsSaisies()}` : ` AND ${sqlHorsPayantes()}`;
  return database
    .prepare(`SELECT id, source, source_event AS sourceEvent, league, date, kickoff, home_name AS homeName, away_name AS awayName,
                     home_id AS homeId, away_id AS awayId, match_key AS matchKey, provenance, updated_at AS updatedAt
              FROM odds_events WHERE (${conditions.join(' OR ')})${filtre} ORDER BY source`)
    .all(...params);
}

/**
 * Les cotes d'une affiche, regroupées : par source, puis bookmaker, puis
 * marché ; pour chaque sélection, l'ouverture, la pré-clôture, la clôture,
 * la série avant match et la série live (datées), et la dernière valeur.
 * Les cotes GRATUITES seulement, sauf `avecPayantes` (étape E).
 */
export function quotesForFixture(fixture = {}, { database = openDb(), avecPayantes = false } = {}) {
  const evenements = evenementsDe(fixture, database, { avecPayantes });
  if (!evenements.length) return { sources: [], count: 0 };
  const lire = database.prepare(`SELECT bookmaker, market, selection, line, kind, seq, releve_at AS releveAt, price, prob, volume, open_interest AS openInterest
                                 FROM odds_quotes WHERE event_id = ? ORDER BY bookmaker, market, line, selection, kind, seq`);
  let count = 0;
  const sources = new Map();
  for (const e of evenements) {
    const s = sources.get(e.source) ?? { source: e.source, events: [], lastReleveAt: null, bookmakers: new Map() };
    s.events.push({ sourceEvent: e.sourceEvent, league: e.league, date: e.date, kickoff: e.kickoff, homeName: e.homeName, awayName: e.awayName, matchKey: e.matchKey, provenance: e.provenance });
    for (const l of lire.all(e.id)) {
      count++;
      if (!s.lastReleveAt || l.releveAt > s.lastReleveAt) s.lastReleveAt = l.releveAt;
      const b = s.bookmakers.get(l.bookmaker) ?? { bookmaker: l.bookmaker, provenance: e.provenance, markets: new Map() };
      const cleMarche = `${l.market}|${l.line}`;
      const m = b.markets.get(cleMarche) ?? { market: l.market, line: l.line, selections: new Map() };
      const sel = m.selections.get(l.selection) ?? { selection: l.selection, open: null, preclose: null, close: null, snapshots: [], live: [] };
      const valeur = { price: l.price, prob: l.prob, volume: l.volume, openInterest: l.openInterest, releveAt: l.releveAt };
      if (l.kind === 'open') sel.open = valeur;
      else if (l.kind === 'preclose') sel.preclose = valeur;
      else if (l.kind === 'close') sel.close = valeur;
      else if (l.kind === 'live') sel.live.push(valeur);
      else sel.snapshots.push(valeur);
      m.selections.set(l.selection, sel);
      b.markets.set(cleMarche, m);
      s.bookmakers.set(l.bookmaker, b);
    }
    sources.set(e.source, s);
  }
  const liste = [...sources.values()].map((s) => ({
    ...s,
    bookmakers: [...s.bookmakers.values()].map((b) => ({
      ...b,
      markets: [...b.markets.values()].map((m) => ({
        ...m,
        selections: [...m.selections.values()].map((sel) => ({
          ...sel,
          // La dernière valeur connue : le dernier point live, sinon la
          // clôture, sinon le dernier instantané, la pré-clôture, l'ouverture.
          latest: sel.live.at(-1) ?? sel.close ?? sel.snapshots.at(-1) ?? sel.preclose ?? sel.open
        }))
      }))
    }))
  }));
  return { sources: liste, count };
}

/**
 * La dernière cote 1x2 d'avant-match de chaque bookmaker, pour les
 * rencontres À VENIR d'une période : ce que la liste des matchs et le moteur
 * lisent quand The Odds API ne cote pas un match. Clé : « homeId|awayId|jour ».
 * Pour chaque bookmaker : la clôture (dernier relevé avant match), sinon le
 * dernier instantané, sinon l'ouverture. Les prix d'échange gardent leur
 * probabilité brute (`prob`) à côté de la cote.
 */
export function latestPrematch1x2({ from, to, database = openDb() } = {}) {
  const lignes = database
    .prepare(`SELECT e.source, e.source_event AS sourceEvent, e.home_id AS homeId, e.away_id AS awayId, e.date, e.kickoff, e.provenance,
                     q.bookmaker, q.selection, q.kind, q.seq, q.releve_at AS releveAt, q.price, q.prob, q.volume
              FROM odds_events e JOIN odds_quotes q ON q.event_id = e.id
              WHERE e.date >= ? AND e.date <= ? AND e.home_id IS NOT NULL AND e.away_id IS NOT NULL AND ${sqlHorsPayantes('e.source')}
                AND q.market = '1x2' AND q.kind IN ('open', 'preclose', 'snapshot', 'close')`)
    .all(from, to);
  // La clôture, puis le dernier relevé, puis la pré-clôture du vendredi/mardi, puis l'ouverture.
  const priorite = { close: 4, snapshot: 3, preclose: 2, open: 1 };
  const parAffiche = new Map();
  for (const l of lignes) {
    const cle = `${l.homeId}|${l.awayId}|${l.date}`;
    const livres = parAffiche.get(cle) ?? new Map();
    const cleLivre = `${l.source}|${l.bookmaker}`;
    const livre = livres.get(cleLivre) ?? { source: l.source, bookmaker: l.bookmaker, provenance: l.provenance, kickoff: l.kickoff, selections: {} };
    const actuel = livre.selections[l.selection];
    const meilleur =
      !actuel ||
      priorite[l.kind] > priorite[actuel.kind] ||
      (priorite[l.kind] === priorite[actuel.kind] && l.releveAt > actuel.releveAt);
    if (meilleur) livre.selections[l.selection] = { price: l.price, prob: l.prob, volume: l.volume, kind: l.kind, releveAt: l.releveAt };
    livres.set(cleLivre, livre);
    parAffiche.set(cle, livres);
  }
  const sortie = new Map();
  for (const [cle, livres] of parAffiche) {
    const complets = [...livres.values()]
      .filter((b) => b.selections.home?.price > 1 && b.selections.draw?.price > 1 && b.selections.away?.price > 1)
      .map((b) => ({
        source: b.source,
        bookmaker: b.bookmaker,
        provenance: b.provenance,
        kickoff: b.kickoff,
        odds1: b.selections.home.price,
        oddsDraw: b.selections.draw.price,
        odds2: b.selections.away.price,
        prob: b.selections.home.prob != null ? { home: b.selections.home.prob, draw: b.selections.draw.prob, away: b.selections.away.prob } : null,
        volume: b.selections.home.volume ?? null,
        releveAt: [b.selections.home.releveAt, b.selections.draw.releveAt, b.selections.away.releveAt].sort().at(-1),
        kind: b.selections.home.kind
      }));
    if (complets.length) sortie.set(cle, complets);
  }
  return sortie;
}

/**
 * Bilan par source : rencontres, période, dernier passage — pour la
 * provenance. `withQuotes` compte aussi les cotes (parcourt toute la table :
 * réservé à l'écran d'état, jamais à la liste des matchs). Les sources
 * gratuites seulement, sauf `avecPayantes` (étape E).
 */
export function quotesSummary({ database = openDb(), withQuotes = false, avecPayantes = false } = {}) {
  const filtre = avecPayantes ? `WHERE ${sqlHorsSaisies('e.source')}` : `WHERE ${sqlHorsPayantes('e.source')}`;
  const sources = database
    .prepare(`SELECT e.source, COUNT(*) AS events, COUNT(e.match_key) AS matches, COUNT(DISTINCT e.league) AS leagues,
                     MIN(e.date) AS firstDate, MAX(e.date) AS lastDate, MAX(e.updated_at) AS lastSeenAt
              FROM odds_events e ${filtre} GROUP BY e.source ORDER BY e.source`)
    .all();
  if (!withQuotes) return { sources };
  const cotes = new Map(
    database
      .prepare(`SELECT e.source, COUNT(*) AS quotes, MAX(q.releve_at) AS lastReleveAt FROM odds_quotes q JOIN odds_events e ON e.id = q.event_id ${filtre} GROUP BY e.source`)
      .all()
      .map((r) => [r.source, r])
  );
  return { sources: sources.map((s) => ({ ...s, quotes: cotes.get(s.source)?.quotes ?? 0, lastReleveAt: cotes.get(s.source)?.lastReleveAt ?? null })) };
}

/** Compétitions qui ont au moins une cote au profilage (match_odds). */
export function leaguesWithMatchOdds({ database = openDb() } = {}) {
  return new Set(database.prepare('SELECT DISTINCT m.league FROM match_odds o JOIN matches m ON m.match_key = o.match_key').all().map((r) => r.league));
}

// ------------------------------------------------------- ce qui manque
/** La clé d'un club dans odds_fixture_misses : son identifiant FotMob, sinon son nom. */
export const cleDeClub = (id, nom) => id || `nom:${String(nom ?? '').trim().toLowerCase()}`;

/**
 * Note les rencontres qu'une source couvre mais n'a pas pu coter, avec la
 * raison qu'elle donne. `rows` : [{ source, league, date, homeId, awayId,
 * homeName, awayName, reason }]. Une nouvelle vérification remplace
 * l'ancienne (raison et heure).
 */
export function recordMisses(rows, { database = openDb() } = {}) {
  const valides = (rows ?? []).filter((r) => r?.source && r.league && r.date && r.homeName && r.awayName && r.reason);
  if (!valides.length) return { recorded: 0 };
  const ins = database.prepare(`INSERT INTO odds_fixture_misses (source, date, home_key, away_key, league, home_name, away_name, reason, checked_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(source, date, home_key, away_key) DO UPDATE SET reason = excluded.reason, checked_at = excluded.checked_at,
                                  league = excluded.league, home_name = excluded.home_name, away_name = excluded.away_name`);
  const maintenant = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const r of valides) {
      ins.run(r.source, r.date, cleDeClub(r.homeId, r.homeName), cleDeClub(r.awayId, r.awayName), r.league, r.homeName, r.awayName, String(r.reason).slice(0, 300), r.checkedAt ?? maintenant);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { recorded: valides.length };
}

/** Les raisons notées pour une rencontre (jour ± 1), la plus récente par source. */
export function missesForFixture({ homeId = null, awayId = null, homeName = null, awayName = null, date }, { database = openDb() } = {}) {
  if (!date) return [];
  const cles = [
    [cleDeClub(homeId, homeName), cleDeClub(awayId, awayName)],
    ...(homeId && awayId && homeName && awayName ? [[cleDeClub(null, homeName), cleDeClub(null, awayName)]] : [])
  ];
  const lire = database.prepare(`SELECT source, league, date, home_name AS homeName, away_name AS awayName, reason, checked_at AS checkedAt
                                 FROM odds_fixture_misses WHERE home_key = ? AND away_key = ? AND date >= date(?, '-1 day') AND date <= date(?, '+1 day')`);
  const parSource = new Map();
  for (const [h, a] of cles) {
    for (const r of lire.all(h, a, date, date)) {
      const deja = parSource.get(r.source);
      if (!deja || r.checkedAt > deja.checkedAt) parSource.set(r.source, r);
    }
  }
  return [...parSource.values()];
}

/** Oublie les raisons des rencontres d'avant `before` (AAAA-MM-JJ). */
export function pruneMisses(before, { database = openDb() } = {}) {
  return { pruned: database.prepare('DELETE FROM odds_fixture_misses WHERE date < ?').run(before).changes };
}

/** État d'un rattrapage (curseur) ; `scope` = compétition, série… */
export function readSourceState(source, scope, { database = openDb() } = {}) {
  const r = database.prepare('SELECT cursor, done, detail, updated_at AS updatedAt FROM odds_source_state WHERE source = ? AND scope = ?').get(source, scope);
  if (!r) return null;
  let detail = null;
  try {
    detail = r.detail ? JSON.parse(r.detail) : null;
  } catch {
    detail = null;
  }
  return { cursor: r.cursor, done: Boolean(r.done), detail, updatedAt: r.updatedAt };
}

export function writeSourceState(source, scope, { cursor = null, done = false, detail = null }, { database = openDb() } = {}) {
  database
    .prepare(`INSERT INTO odds_source_state (source, scope, cursor, done, detail, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(source, scope) DO UPDATE SET cursor = excluded.cursor, done = excluded.done, detail = excluded.detail, updated_at = excluded.updated_at`)
    .run(source, scope, cursor, done ? 1 : 0, detail === null ? null : JSON.stringify(detail), new Date().toISOString());
}

export function listSourceStates(source, { database = openDb() } = {}) {
  return database
    .prepare('SELECT scope, cursor, done, detail, updated_at AS updatedAt FROM odds_source_state WHERE source = ? ORDER BY scope')
    .all(source)
    .map((r) => {
      let detail = null;
      try {
        detail = r.detail ? JSON.parse(r.detail) : null;
      } catch {
        detail = null;
      }
      return { ...r, done: Boolean(r.done), detail };
    });
}
