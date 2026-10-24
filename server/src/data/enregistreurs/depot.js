/**
 * depot.js — les écritures et lectures des tables des enregistreurs (étape E).
 * -----------------------------------------------------------------------
 * Seul point d'écriture de live_snapshots, unavailable_reads/_daily,
 * engine_picks, engine_candidate_picks (étape 25 : la version candidate à
 * blanc, écrite par moteurABlanc.js dans la passe), recorder_counts et
 * recorder_state (DDL : matchStatsDb.js), et du passage des cotes payantes
 * vers odds_quotes. Les appelants ne l'utilisent pas directement : ils
 * mettent leurs lignes en file (file.js), qui les écrit par petites tranches
 * quand personne d'autre ne tient le verrou — sauf l'étape « moteurABlanc »
 * de l'actualisation, qui TIENT le verrou de sa passe et écrit ses tranches
 * elle-même, en rendant la main entre deux. Chaque tranche est UNE
 * transaction (BEGIN IMMEDIATE, comme upsertMatches : un BEGIN différé échoue
 * sur SQLITE_BUSY_SNAPSHOT).
 *
 * Ajout seulement : aucune de ces écritures ne réécrit une ligne déjà là
 * (ON CONFLICT DO NOTHING), à l'exception des deux tables d'état, qui ne
 * portent que des compteurs et des heures.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { upsertQuotes, ecrireSaisies } from '../db/oddsQuotesRepository.js';
import { jourParis, iso } from './communs.js';

const requetes = new WeakMap();
function prepares(database) {
  let r = requetes.get(database);
  if (r) return r;
  r = {
    instantane: database.prepare(`INSERT INTO live_snapshots (fotmob_id, taken_at, kind, date, kickoff, league, league_key, home_id, away_id, home_name, away_name,
        status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, xg_home, xg_away, stats, coverage, detail_at, source)
      VALUES (@fotmobId, @takenAt, @kind, @date, @kickoff, @league, @leagueKey, @homeId, @awayId, @homeName, @awayName,
        @status, @minute, @addedTime, @minuteLabel, @homeGoals, @awayGoals, @homeRed, @awayRed, @xgHome, @xgAway, @stats, @coverage, @detailAt, @source)
      ON CONFLICT(fotmob_id, taken_at) DO NOTHING`),
    lecture: database.prepare(`INSERT INTO unavailable_reads (day, fotmob_id, date, kickoff, league, home_id, away_id, home_name, away_name, read_at, origin, status, home_count, away_count)
      VALUES (@day, @fotmobId, @date, @kickoff, @league, @homeId, @awayId, @homeName, @awayName, @readAt, @origin, @status, @homeCount, @awayCount)
      ON CONFLICT(day, fotmob_id) DO NOTHING`),
    absent: database.prepare(`INSERT INTO unavailable_daily (day, fotmob_id, side, player_key, player_id, player_name, team_id, reason, expected_return, read_at)
      VALUES (@day, @fotmobId, @side, @playerKey, @playerId, @playerName, @teamId, @reason, @expectedReturn, @readAt)
      ON CONFLICT(day, fotmob_id, side, player_key) DO NOTHING`),
    lectureFaite: database.prepare('SELECT 1 AS oui FROM unavailable_reads WHERE day = ? AND fotmob_id = ?'),
    dernierPronostic: database.prepare(`SELECT version, choice, params, predicted_odds AS predictedOdds, market_odds AS marketOdds, min_odds AS minOdds,
        odds_source AS oddsSource, lineup_state AS lineupState, engine_version AS engineVersion, distribution
      FROM engine_picks WHERE fixture_key = ? AND market_key = ? ORDER BY version DESC LIMIT 1`),
    marchesDuMatch: database.prepare(`SELECT p.market_key AS marketKey, p.market_id AS marketId, p.market AS market, p.choice AS choice
      FROM engine_picks p
      WHERE p.fixture_key = ? AND p.version = (SELECT MAX(version) FROM engine_picks WHERE fixture_key = p.fixture_key AND market_key = p.market_key)`),
    pronostic: database.prepare(`INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, match_id, league, date, kickoff, home_name, away_name,
        home_id, away_id, market_id, market, params, choice, label, probability, predicted_odds, market_odds, min_odds, odds_source, odds_at, lineup_state, lineup_at, engine_hash,
        engine_version, distribution)
      VALUES (@fixtureKey, @marketKey, @version, @recordedAt, @origin, @matchId, @league, @date, @kickoff, @homeName, @awayName,
        @homeId, @awayId, @marketId, @market, @params, @choice, @label, @probability, @predictedOdds, @marketOdds, @minOdds, @oddsSource, @oddsAt, @lineupState, @lineupAt, @engineHash,
        @engineVersion, @distribution)
      ON CONFLICT(fixture_key, market_key, version) DO NOTHING`),
    // Étape 25 : la version candidate calculée à blanc (moteurABlanc.js), dans sa table à part.
    dernierABlanc: database.prepare(`SELECT revision, candidate_hash AS candidateHash, service_version AS serviceVersion, params, choice, predicted_odds AS predictedOdds,
        distribution, service_params AS serviceParams, service_choice AS serviceChoice, service_predicted_odds AS servicePredictedOdds,
        service_distribution AS serviceDistribution, odds_source AS oddsSource, lineup_state AS lineupState
      FROM engine_candidate_picks WHERE candidate_id = ? AND fixture_key = ? AND market_key = ? ORDER BY revision DESC LIMIT 1`),
    aBlanc: database.prepare(`INSERT INTO engine_candidate_picks (candidate_id, fixture_key, market_key, revision, recorded_at, candidate_hash, service_version,
        match_id, league, date, kickoff, home_name, away_name, home_id, away_id, market_id, market, params, choice, label, probability, predicted_odds, distribution,
        service_params, service_choice, service_probability, service_predicted_odds, service_distribution, odds_source, odds_at, lineup_state)
      VALUES (@candidateId, @fixtureKey, @marketKey, @revision, @recordedAt, @candidateHash, @serviceVersion,
        @matchId, @league, @date, @kickoff, @homeName, @awayName, @homeId, @awayId, @marketId, @market, @params, @choice, @label, @probability, @predictedOdds, @distribution,
        @serviceParams, @serviceChoice, @serviceProbability, @servicePredictedOdds, @serviceDistribution, @oddsSource, @oddsAt, @lineupState)
      ON CONFLICT(candidate_id, fixture_key, market_key, revision) DO NOTHING`),
    compte: database.prepare(`INSERT INTO recorder_counts (recorder, day, rows, last_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(recorder, day) DO UPDATE SET rows = recorder_counts.rows + excluded.rows,
        last_at = CASE WHEN recorder_counts.last_at IS NULL OR excluded.last_at > recorder_counts.last_at THEN excluded.last_at ELSE recorder_counts.last_at END`),
    etat: database.prepare(`INSERT INTO recorder_state (recorder, first_at, last_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(recorder) DO UPDATE SET first_at = COALESCE(recorder_state.first_at, excluded.first_at),
        last_at = CASE WHEN recorder_state.last_at IS NULL OR excluded.last_at > recorder_state.last_at THEN excluded.last_at ELSE recorder_state.last_at END,
        updated_at = excluded.updated_at`),
    source: database.prepare(`INSERT INTO recorder_state (recorder, source_at, detail, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(recorder) DO UPDATE SET source_at = COALESCE(excluded.source_at, recorder_state.source_at),
        detail = COALESCE(excluded.detail, recorder_state.detail), updated_at = excluded.updated_at`)
  };
  requetes.set(database, r);
  return r;
}

function enTransaction(database, travail) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const r = travail();
    database.exec('COMMIT');
    return r;
  } catch (error) {
    // Sur erreur d'E/S, SQLite a déjà annulé : le ROLLBACK échouerait à son
    // tour et cacherait la vraie cause.
    try {
      database.exec('ROLLBACK');
    } catch {
      /* déjà annulée */
    }
    throw error;
  }
}

const nombreOuNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const texteOuNull = (x) => (x === null || x === undefined || x === '' ? null : String(x));

// ------------------------------------------------------------- le direct
/** Instantanés de matchs en cours. Rend le nombre de lignes écrites. */
export function ecrireInstantanes(lignes, { database = openDb() } = {}) {
  const r = prepares(database);
  return enTransaction(database, () => {
    let n = 0;
    for (const l of lignes) {
      n += r.instantane.run({
        fotmobId: String(l.fotmobId),
        takenAt: l.takenAt,
        kind: l.kind ?? 'direct',
        date: l.date,
        kickoff: texteOuNull(l.kickoff),
        league: texteOuNull(l.league),
        leagueKey: texteOuNull(l.leagueKey),
        homeId: texteOuNull(l.homeId),
        awayId: texteOuNull(l.awayId),
        homeName: texteOuNull(l.homeName),
        awayName: texteOuNull(l.awayName),
        status: l.status ?? 'en cours',
        minute: nombreOuNull(l.minute),
        addedTime: nombreOuNull(l.addedTime),
        minuteLabel: texteOuNull(l.minuteLabel),
        homeGoals: nombreOuNull(l.homeGoals),
        awayGoals: nombreOuNull(l.awayGoals),
        homeRed: nombreOuNull(l.homeRed),
        awayRed: nombreOuNull(l.awayRed),
        xgHome: nombreOuNull(l.xgHome),
        xgAway: nombreOuNull(l.xgAway),
        stats: l.stats ? JSON.stringify(l.stats) : null,
        coverage: texteOuNull(l.coverage),
        detailAt: texteOuNull(l.detailAt),
        source: l.source ?? 'liste'
      }).changes;
    }
    return n;
  });
}

// ---------------------------------------------------------- les absents
/**
 * Lectures des absents : `{ lecture, joueurs }` par match. Une lecture déjà
 * notée ce jour-là pour ce match (une par match et par jour) n'est pas
 * réécrite, et ses joueurs non plus : ils viendraient d'une autre lecture.
 */
export function ecrireAbsents(elements, { database = openDb() } = {}) {
  const r = prepares(database);
  return enTransaction(database, () => {
    let n = 0;
    for (const { lecture: l, joueurs = [] } of elements) {
      const ecrite = r.lecture.run({
        day: l.day,
        fotmobId: String(l.fotmobId),
        date: texteOuNull(l.date),
        kickoff: texteOuNull(l.kickoff),
        league: texteOuNull(l.league),
        homeId: texteOuNull(l.homeId),
        awayId: texteOuNull(l.awayId),
        homeName: texteOuNull(l.homeName),
        awayName: texteOuNull(l.awayName),
        readAt: l.readAt,
        origin: l.origin,
        status: l.status,
        homeCount: nombreOuNull(l.homeCount),
        awayCount: nombreOuNull(l.awayCount)
      }).changes;
      if (!ecrite) continue;
      n += ecrite;
      for (const j of joueurs) {
        n += r.absent.run({
          day: l.day,
          fotmobId: String(l.fotmobId),
          side: j.side,
          playerKey: j.playerKey,
          playerId: texteOuNull(j.playerId),
          playerName: j.playerName,
          teamId: texteOuNull(j.teamId),
          reason: texteOuNull(j.reason),
          expectedReturn: texteOuNull(j.expectedReturn),
          readAt: l.readAt
        }).changes;
      }
    }
    return n;
  });
}

/** Les absents de ce match ont-ils déjà été relevés ce jour-là (jour de Paris) ? */
export function lectureAbsentsFaite(jour, fotmobId, { database = openDb() } = {}) {
  return Boolean(prepares(database).lectureFaite.get(jour, String(fotmobId)));
}

// ------------------------------------------------------- le gel du moteur
/**
 * Étape 25 : deux distributions gelées (JSON, cf. distributionDuMarche) sont-elles la même ? Même ligne,
 * même équipe, mêmes issues, et aucune probabilité qui bouge d'un dixième de point (0,001) ou plus :
 * en deçà, ce n'est pas un nouveau pronostic (un match de plus dans les moyennes déplace les décimales
 * chaque nuit). Absente d'un côté seulement (une ligne gelée avant l'étape 25) : différentes.
 */
export const ECART_DE_DISTRIBUTION = 0.001;
export function memeDistribution(a, b) {
  if ((a ?? null) === null || (b ?? null) === null) return (a ?? null) === (b ?? null);
  let da;
  let db;
  try {
    da = typeof a === 'string' ? JSON.parse(a) : a;
    db = typeof b === 'string' ? JSON.parse(b) : b;
  } catch {
    return a === b;
  }
  if ((da?.ligne ?? null) !== (db?.ligne ?? null) || (da?.equipe ?? null) !== (db?.equipe ?? null)) return false;
  const ia = da?.issues ?? {};
  const ib = db?.issues ?? {};
  const cles = Object.keys(ia);
  if (cles.length !== Object.keys(ib).length || !cles.every((k) => k in ib)) return false;
  return cles.every((k) => Number.isFinite(ia[k]) && Number.isFinite(ib[k]) ? Math.abs(ia[k] - ib[k]) < ECART_DE_DISTRIBUTION : ia[k] === ib[k]);
}

/**
 * Ce qui fait qu'un pronostic a changé : son choix et ses chiffres, pas l'heure des cotes ni les noms.
 * Depuis l'étape 25 : aussi la VERSION DU MOTEUR qui l'a calculé et sa distribution complète — la
 * première nuit après la mise en service, chaque pronostic à venir reçoit donc une révision avec sa
 * version et sa distribution (les lignes d'avant restent telles quelles, « sans version »).
 */
const memeValeur = (d, p, engineVersion = null) =>
  d.choice === (p.choice ?? null) &&
  (d.params ?? null) === (p.params ?? null) &&
  d.predictedOdds === nombreOuNull(p.predictedOdds) &&
  d.marketOdds === nombreOuNull(p.marketOdds) &&
  d.minOdds === nombreOuNull(p.minOdds) &&
  (d.oddsSource ?? null) === (p.oddsSource ?? null) &&
  (d.lineupState ?? null) === (p.lineupState ?? null) &&
  (d.engineVersion ?? null) === versionOuNull(engineVersion) &&
  memeDistribution(d.distribution ?? null, p.distribution ?? null);

/** Un numéro de version du moteur (entier ≥ 1), ou null — jamais 0 pour une version inconnue. */
const versionOuNull = (v) => (Number.isInteger(v) && v >= 1 ? v : null);

/**
 * Pronostics gelés, par match : `{ fixture, origine, recordedAt, engineHash,
 * pronostics, complet }`. Ajout SEULEMENT : la version 1 de chaque pronostic
 * (match × marché) est sa première valeur et ne change plus jamais ; une
 * valeur différente de la dernière version ajoute la version suivante, datée ;
 * une valeur identique n'ajoute rien. `complet` : le calcul couvrait tout le
 * match — un marché qui avait un pronostic et n'en a plus reçoit une version
 * « plus de pronostic » (choix vide), pour que la dernière version dise vrai.
 */
export function ecrirePronostics(elements, { database = openDb() } = {}) {
  const r = prepares(database);
  return enTransaction(database, () => {
    let n = 0;
    for (const e of elements) {
      const f = e.fixture;
      const commun = {
        fixtureKey: f.fixtureKey,
        recordedAt: e.recordedAt,
        origin: e.origine,
        matchId: texteOuNull(f.matchId),
        league: texteOuNull(f.league),
        date: f.date,
        kickoff: texteOuNull(f.kickoff),
        homeName: texteOuNull(f.homeName),
        awayName: texteOuNull(f.awayName),
        homeId: texteOuNull(f.homeId),
        awayId: texteOuNull(f.awayId),
        engineHash: texteOuNull(e.engineHash),
        // Étape 25 : la version du moteur du calcul (null : « sans version »).
        engineVersion: versionOuNull(e.engineVersion)
      };
      const vus = new Set();
      for (const p of e.pronostics ?? []) {
        vus.add(p.marketKey);
        const d = r.dernierPronostic.get(f.fixtureKey, p.marketKey);
        if (d && memeValeur(d, p, e.engineVersion)) continue;
        n += r.pronostic.run({
          ...commun,
          marketKey: p.marketKey,
          version: (d?.version ?? 0) + 1,
          marketId: p.marketId,
          market: texteOuNull(p.market),
          params: p.params ?? null,
          choice: p.choice ?? null,
          label: texteOuNull(p.label),
          probability: nombreOuNull(p.probability),
          predictedOdds: nombreOuNull(p.predictedOdds),
          marketOdds: nombreOuNull(p.marketOdds),
          minOdds: nombreOuNull(p.minOdds),
          oddsSource: texteOuNull(p.oddsSource),
          oddsAt: texteOuNull(p.oddsAt),
          lineupState: texteOuNull(p.lineupState),
          lineupAt: texteOuNull(p.lineupAt),
          distribution: texteOuNull(p.distribution)
        }).changes;
      }
      if (!e.complet) continue;
      for (const m of r.marchesDuMatch.all(f.fixtureKey)) {
        if (vus.has(m.marketKey) || m.choice === null) continue;
        const d = r.dernierPronostic.get(f.fixtureKey, m.marketKey);
        n += r.pronostic.run({
          ...commun,
          marketKey: m.marketKey,
          version: (d?.version ?? 0) + 1,
          marketId: m.marketId,
          market: m.market,
          params: null,
          choice: null,
          label: 'plus de pronostic',
          probability: null,
          predictedOdds: null,
          marketOdds: null,
          minOdds: null,
          oddsSource: texteOuNull(e.oddsSource),
          oddsAt: texteOuNull(e.oddsAt),
          lineupState: texteOuNull(e.lineupState),
          lineupAt: texteOuNull(e.lineupAt),
          distribution: null
        }).changes;
      }
    }
    return n;
  });
}

/** Toutes les versions des pronostics gelés d'un match (la 1re de chaque marché = sa première valeur). */
export function pronosticsGeles(fixtureKey, { database = openDb() } = {}) {
  return database
    .prepare(`SELECT fixture_key AS fixtureKey, market_key AS marketKey, version, recorded_at AS recordedAt, origin, match_id AS matchId, league, date, kickoff,
                     home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, market_id AS marketId, market, params, choice, label,
                     probability, predicted_odds AS predictedOdds, market_odds AS marketOdds, min_odds AS minOdds, odds_source AS oddsSource, odds_at AS oddsAt,
                     lineup_state AS lineupState, lineup_at AS lineupAt, engine_hash AS engineHash, engine_version AS engineVersion, distribution
              FROM engine_picks WHERE fixture_key = ? ORDER BY market_key, version`)
    .all(fixtureKey);
}

// ---------------------------------------- la version candidate, à blanc
/** Ce qui fait qu'un chiffre à blanc a changé : la candidate (son empreinte), les deux pronostics et leurs distributions. */
const memeABlanc = (d, l) =>
  d.candidateHash === l.candidateHash &&
  (d.serviceVersion ?? null) === versionOuNull(l.serviceVersion) &&
  (d.params ?? null) === (l.params ?? null) &&
  (d.choice ?? null) === (l.choice ?? null) &&
  d.predictedOdds === nombreOuNull(l.predictedOdds) &&
  memeDistribution(d.distribution ?? null, l.distribution ?? null) &&
  (d.serviceParams ?? null) === (l.serviceParams ?? null) &&
  (d.serviceChoice ?? null) === (l.serviceChoice ?? null) &&
  d.servicePredictedOdds === nombreOuNull(l.servicePredictedOdds) &&
  memeDistribution(d.serviceDistribution ?? null, l.serviceDistribution ?? null) &&
  (d.oddsSource ?? null) === (l.oddsSource ?? null) &&
  (d.lineupState ?? null) === (l.lineupState ?? null);

/**
 * Étape 25 du plan : les chiffres de la VERSION CANDIDATE calculée à blanc (data/enregistreurs/moteurABlanc.js),
 * dans leur table à part (engine_candidate_picks), en UNE transaction pour la tranche reçue. Ajout seulement,
 * comme engine_picks : la révision 1 est la première valeur, chaque changement en ajoute une, une valeur
 * inchangée n'ajoute rien. Rend le nombre de lignes écrites.
 */
export function ecrirePronosticsABlanc(lignes, { database = openDb() } = {}) {
  const r = prepares(database);
  return enTransaction(database, () => {
    let n = 0;
    for (const l of lignes) {
      const d = r.dernierABlanc.get(l.candidateId, l.fixtureKey, l.marketKey);
      if (d && memeABlanc(d, l)) continue;
      n += r.aBlanc.run({
        candidateId: l.candidateId,
        fixtureKey: l.fixtureKey,
        marketKey: l.marketKey,
        revision: (d?.revision ?? 0) + 1,
        recordedAt: l.recordedAt,
        candidateHash: l.candidateHash,
        serviceVersion: versionOuNull(l.serviceVersion),
        matchId: texteOuNull(l.matchId),
        league: texteOuNull(l.league),
        date: l.date,
        kickoff: texteOuNull(l.kickoff),
        homeName: texteOuNull(l.homeName),
        awayName: texteOuNull(l.awayName),
        homeId: texteOuNull(l.homeId),
        awayId: texteOuNull(l.awayId),
        marketId: l.marketId,
        market: texteOuNull(l.market),
        params: l.params ?? null,
        choice: l.choice ?? null,
        label: texteOuNull(l.label),
        probability: nombreOuNull(l.probability),
        predictedOdds: nombreOuNull(l.predictedOdds),
        distribution: texteOuNull(l.distribution),
        serviceParams: l.serviceParams ?? null,
        serviceChoice: l.serviceChoice ?? null,
        serviceProbability: nombreOuNull(l.serviceProbability),
        servicePredictedOdds: nombreOuNull(l.servicePredictedOdds),
        serviceDistribution: texteOuNull(l.serviceDistribution),
        oddsSource: texteOuNull(l.oddsSource),
        oddsAt: texteOuNull(l.oddsAt),
        lineupState: texteOuNull(l.lineupState)
      }).changes;
    }
    return n;
  });
}

const COLONNES_A_BLANC = `candidate_id AS candidateId, fixture_key AS fixtureKey, market_key AS marketKey, revision, recorded_at AS recordedAt, candidate_hash AS candidateHash,
                     service_version AS serviceVersion, match_id AS matchId, league, date, kickoff, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId,
                     market_id AS marketId, market, params, choice, label, probability, predicted_odds AS predictedOdds, distribution,
                     service_params AS serviceParams, service_choice AS serviceChoice, service_probability AS serviceProbability,
                     service_predicted_odds AS servicePredictedOdds, service_distribution AS serviceDistribution, odds_source AS oddsSource, odds_at AS oddsAt, lineup_state AS lineupState`;

/** Les chiffres à blanc d'une candidate (toutes les révisions), pour les essais et le juge à venir. */
export function pronosticsABlanc(candidateId, { database = openDb() } = {}) {
  return database.prepare(`SELECT ${COLONNES_A_BLANC} FROM engine_candidate_picks WHERE candidate_id = ? ORDER BY fixture_key, market_key, revision`).all(candidateId);
}

/** Lignes par page de pronosticsABlancParPages : ~15 ms de lecture chacune (les distributions du score exact pèsent ~1,5 Ko). */
export const PAGE_A_BLANC = 1000;

/**
 * Les MÊMES lignes que pronosticsABlanc (mêmes colonnes, même ordre, mêmes objets), lues PAR PAGES — un générateur
 * qui `yield` entre deux pages (cf. utils/travailCooperatif.js) : l'essai jugé de la nuit relit toute la table de la
 * candidate (24 000 lignes à 800 matchs joués : ~360 ms d'une seule requête, mesuré le 24/10/2026). Chaque page est
 * une requête courte, reprise après la clé de la précédente (fixture_key, market_key, revision : la clé primaire,
 * aucun curseur laissé ouvert pendant que la main est rendue). Rend la liste complète.
 */
export function* pronosticsABlancParPages(candidateId, { database = openDb(), page = PAGE_A_BLANC } = {}) {
  const premiere = database.prepare(`SELECT ${COLONNES_A_BLANC} FROM engine_candidate_picks WHERE candidate_id = ? ORDER BY fixture_key, market_key, revision LIMIT ?`);
  const suivante = database.prepare(
    `SELECT ${COLONNES_A_BLANC} FROM engine_candidate_picks WHERE candidate_id = ? AND (fixture_key, market_key, revision) > (?, ?, ?) ORDER BY fixture_key, market_key, revision LIMIT ?`
  );
  const lignes = [];
  let lot = premiere.all(candidateId, page);
  while (lot.length) {
    for (const l of lot) lignes.push(l);
    if (lot.length < page) break;
    yield 'lignes à blanc de la candidate';
    const d = lot.at(-1);
    lot = suivante.all(candidateId, d.fixtureKey, d.marketKey, d.revision, page);
  }
  return lignes;
}

// --------------------------------------------------- les cotes payantes
/**
 * Cotes payantes (normalisées pour upsertQuotes) et marqueurs de fin de
 * relevé `{ marqueur: { sourceAt, detail } }` : le marqueur n'est écrit
 * qu'APRÈS toutes les cotes du relevé (la file garde l'ordre). C'est lui qui
 * dit « ce relevé est archivé » ; un serveur arrêté avant le relève à son
 * redémarrage, sans rien doubler (la clé de chaque cote porte l'heure du
 * relevé).
 */
export function ecrireCotesPayantes(lignes, { database = openDb() } = {}) {
  const cotes = lignes.filter((l) => !l?.marqueur);
  let n = 0;
  if (cotes.length) n = upsertQuotes(cotes, { database, garderChaqueReleve: true }).written;
  for (const l of lignes) if (l?.marqueur) noterSource('cotes-payantes', l.marqueur, { database });
  return n;
}

// ------------------------------------------------ les saisies à la main
/**
 * Cotes saisies à la main (étape 7 du plan, data/saisiesCotes.js) : une ligne
 * par saisie, correction ou retrait, avec l'heure de la saisie ; ajout
 * seulement (oddsQuotesRepository.ecrireSaisies, seul écrivain des tables
 * de cotes). Rend le nombre de lignes écrites.
 */
export function ecrireSaisiesEnFile(lignes, { database = openDb() } = {}) {
  return ecrireSaisies(lignes, { database });
}

// ------------------------------------------------------ état et comptes
/**
 * Lignes gardées par un enregistreur (jour de Paris de l'écriture) et heure
 * du dernier relevé (`dernierReleve`, l'heure qu'avait la donnée relevée).
 * Une passe qui n'a rien de nouveau compte 0 ligne mais avance l'heure.
 */
export function compterLignes(recorder, lignes, dernierReleve, { database = openDb(), maintenant = Date.now() } = {}) {
  const r = prepares(database);
  const quand = dernierReleve ?? iso(maintenant);
  enTransaction(database, () => {
    r.compte.run(recorder, jourParis(maintenant), Math.max(0, Number(lignes) || 0), quand);
    r.etat.run(recorder, quand, quand, iso(maintenant));
  });
}

/** L'heure de la dernière source traitée (instantané payant archivé…) et un petit bilan. */
export function noterSource(recorder, { sourceAt = null, detail = null } = {}, { database = openDb(), maintenant = Date.now() } = {}) {
  prepares(database).source.run(recorder, sourceAt, detail === null ? null : JSON.stringify(detail), iso(maintenant));
}

/** Comptes des jours demandés et état de chaque enregistreur : ce que lit la carte de Réglages. */
export function lireComptesEtEtats({ jours = [], database = openDb() } = {}) {
  const comptes = jours.length
    ? database.prepare(`SELECT recorder, day, rows, last_at AS lastAt FROM recorder_counts WHERE day IN (${jours.map(() => '?').join(', ')})`).all(...jours)
    : [];
  const etats = database.prepare('SELECT recorder, first_at AS firstAt, last_at AS lastAt, source_at AS sourceAt, detail, updated_at AS updatedAt FROM recorder_state').all();
  return {
    comptes,
    etats: etats.map((e) => {
      let detail = null;
      try {
        detail = e.detail ? JSON.parse(e.detail) : null;
      } catch {
        detail = null;
      }
      return { ...e, detail };
    })
  };
}

export const __testing = { memeValeur, memeABlanc };
