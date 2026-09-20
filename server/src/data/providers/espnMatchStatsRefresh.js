/**
 * espnMatchStatsRefresh.js
 * -----------------------------------------------------------------------
 * Comble les statistiques de match manquantes, tout seul.
 *
 * Marche à suivre :
 *   1. lire le calendrier et repérer les rencontres terminées dont les
 *      statistiques n'ont jamais été récupérées chez ESPN ;
 *   2. pour chaque (championnat, date), demander le tableau des scores et
 *      apparier les rencontres ESPN aux nôtres par nom d'équipe ;
 *   3. récupérer le détail de chaque match apparié ;
 *   4. fusionner par lots via mergeMatchStats(), qui complète sans jamais
 *      écraser une valeur déjà confirmée.
 *
 * La source est gratuite et sans clé : aucun quota n'est consommé, donc ce
 * rafraîchissement peut tourner en boucle sans rien coûter.
 *
 * Reprise : une entrée déjà passée par ce tuyau porte l'URL ESPN dans ses
 * `sources`. Les exécutions suivantes ne regardent donc que les nouvelles
 * rencontres — le premier passage est long, les suivants sont courts.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESPN_LEAGUE_SLUGS, fetchFinishedEvents, fetchMatchStats, fetchSeasonMatchDays } from './espnMatchStatsProvider.js';
import { teamNamesLikelyMatch, findBestTeamNameMatch } from '../../utils/teamNameMatch.js';
// Le contrat de fusion (clés acceptées, upsert, format des fichiers mensuels)
// n'existe qu'à un seul endroit : scripts/merge-match-stats.mjs. La ligne de
// commande et le serveur l'appellent tous deux plutôt que d'en tenir deux
// versions qui divergeraient.
import { mergeMatchStats } from '../../../scripts/merge-match-stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '../../../data/runtime');
const MATCH_STATS_DIR = path.join(RUNTIME_DIR, 'match-stats');
const CALENDAR_FILE = path.join(RUNTIME_DIR, 'season-calendar.json');
const STATUS_FILE = path.join(RUNTIME_DIR, 'espn-refresh-status.json');
const LOCK_FILE = path.join(RUNTIME_DIR, 'espn-refresh.lock');
// Journees de match par (championnat, saison), decouvertes chez ESPN. Le
// calendrier d'une saison terminee ne change plus : on evite de le redemander.
const SEASON_DAYS_FILE = path.join(RUNTIME_DIR, 'espn-season-days.json');

/** Au-delà, un verrou est tenu pour abandonné (processus tué, coupure). */
const LOCK_STALE_MINUTES = 60;

/** Marque laissée dans `sources` par ce tuyau : sert de témoin de reprise. */
const ESPN_SOURCE_MARK = 'cdn.espn.com/core/soccer/match';

/** Requêtes simultanées vers ESPN. Volontairement bas : rien ne presse. */
const DEFAULT_CONCURRENCY = 4;
/** Les résultats sont écrits tous les N matchs : une coupure ne perd pas tout. */
const FLUSH_EVERY = 150;

function slug(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Toutes les entrées déjà stockées, indexées par matchKey. */
function readStoredEntries() {
  const index = new Map();
  let files = [];
  try {
    files = fs.readdirSync(MATCH_STATS_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  } catch {
    return index;
  }
  for (const file of files) {
    const entries = readJson(path.join(MATCH_STATS_DIR, file), []);
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) if (entry?.matchKey) index.set(entry.matchKey, entry);
  }
  return index;
}

/**
 * Rencontres terminées qui n'ont pas encore été confrontées à ESPN.
 * `leagues` limite le champ ; `since`/`until` bornent les dates.
 */
export function listMissing({ leagues = null, since = null, until = null, force = false } = {}) {
  const calendar = readJson(CALENDAR_FILE, []);
  const stored = readStoredEntries();
  const wanted = leagues ? new Set(leagues) : null;
  const missing = [];

  for (const fixture of Array.isArray(calendar) ? calendar : []) {
    const { date, league, homeName, awayName, homeGoals, awayGoals } = fixture ?? {};
    if (homeGoals === null || homeGoals === undefined) continue;
    if (awayGoals === null || awayGoals === undefined) continue;
    if (!date || !league || !homeName || !awayName) continue;
    if (!ESPN_LEAGUE_SLUGS[league]) continue;
    if (wanted && !wanted.has(league)) continue;
    if (since && date < since) continue;
    if (until && date > until) continue;

    const matchKey = `${date}-${slug(homeName)}-${slug(awayName)}`;
    const entry = stored.get(matchKey);
    // `force` repasse sur les rencontres déjà récupérées : utile quand la
    // lecture de la source a été corrigée et qu'il faut compléter ce que
    // l'ancienne version avait écarté à tort.
    const alreadyFetched = (entry?.sources ?? []).some((s) => String(s).includes(ESPN_SOURCE_MARK));
    if (alreadyFetched && !force) continue;

    missing.push({ date, league, homeName, awayName, homeGoals, awayGoals, matchKey });
  }

  missing.sort((a, b) => b.date.localeCompare(a.date) || a.matchKey.localeCompare(b.matchKey));
  return missing;
}

/** Couverture actuelle, par championnat. */
export function getCoverage() {
  const calendar = readJson(CALENDAR_FILE, []);
  const stored = readStoredEntries();
  const byLeague = new Map();

  for (const fixture of Array.isArray(calendar) ? calendar : []) {
    const { date, league, homeName, awayName, homeGoals, awayGoals } = fixture ?? {};
    if (homeGoals === null || homeGoals === undefined) continue;
    if (awayGoals === null || awayGoals === undefined) continue;
    if (!date || !league || !homeName || !awayName) continue;

    if (!byLeague.has(league)) {
      byLeague.set(league, { league, supported: Boolean(ESPN_LEAGUE_SLUGS[league]), finished: 0, withStats: 0, withPlayers: 0, fields: 0 });
    }
    const row = byLeague.get(league);
    row.finished++;

    const entry = stored.get(`${date}-${slug(homeName)}-${slug(awayName)}`);
    if (!entry) continue;
    row.withStats++;
    row.fields += Object.keys(entry.teamStats?.home ?? {}).length;
    if ((entry.players?.home ?? []).length) row.withPlayers++;
  }

  const leagues = [...byLeague.values()]
    .map((row) => ({
      ...row,
      coverage: row.finished ? Math.round((100 * row.withStats) / row.finished) : 0,
      averageFields: row.withStats ? Number((row.fields / row.withStats).toFixed(1)) : 0
    }))
    .sort((a, b) => b.finished - a.finished);

  const totals = leagues.reduce(
    (acc, row) => ({ finished: acc.finished + row.finished, withStats: acc.withStats + row.withStats, withPlayers: acc.withPlayers + row.withPlayers }),
    { finished: 0, withStats: 0, withPlayers: 0 }
  );
  totals.coverage = totals.finished ? Math.round((100 * totals.withStats) / totals.finished) : 0;

  return { totals, leagues, seasons: summariseSeasons(stored) };
}

/**
 * Ce que contient le magasin, saison par saison — y compris les saisons
 * passées, qui ne figurent pas au calendrier local et resteraient donc
 * invisibles dans le tableau de couverture ci-dessus.
 *
 * Une saison va de juillet à juin ; les championnats russe et chinois, qui
 * suivent l'année civile, s'y rangent par leur année de début.
 */
function summariseSeasons(stored) {
  const bySeason = new Map();
  for (const entry of stored.values()) {
    if (!entry?.date) continue;
    const year = Number(entry.date.slice(0, 4));
    const month = Number(entry.date.slice(5, 7));
    const start = month >= 7 ? year : year - 1;
    const label = `${start}-${String(start + 1).slice(2)}`;
    if (!bySeason.has(label)) bySeason.set(label, { season: label, matches: 0, withPlayers: 0, playerRows: 0, leagues: new Set() });
    const row = bySeason.get(label);
    row.matches++;
    if (entry.league) row.leagues.add(entry.league);
    const players = (entry.players?.home?.length ?? 0) + (entry.players?.away?.length ?? 0);
    row.playerRows += players;
    if (players) row.withPlayers++;
  }
  return [...bySeason.values()]
    .map(({ leagues, ...row }) => ({ ...row, leagues: leagues.size }))
    .sort((a, b) => a.season.localeCompare(b.season));
}

/** Exécute `worker` sur `items` avec au plus `size` tâches en vol. */
async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * Apparie une rencontre du calendrier à un événement ESPN. Les deux équipes
 * doivent correspondre et un seul événement doit convenir : un appariement
 * ambigu est refusé plutôt que deviné, sinon on écrirait les statistiques
 * d'un match dans un autre.
 */
function matchEvent(fixture, events) {
  const candidates = events.filter(
    (e) => teamNamesLikelyMatch(e.homeName, fixture.homeName) && teamNamesLikelyMatch(e.awayName, fixture.awayName)
  );
  if (candidates.length !== 1) return null;
  const event = candidates[0];
  // Garde-fou : un score différent signale un mauvais appariement (ou un
  // calendrier fautif). Dans le doute on n'écrit rien.
  if (event.homeGoals !== fixture.homeGoals || event.awayGoals !== fixture.awayGoals) return null;
  return event;
}

/**
 * Récupère et fusionne les statistiques manquantes.
 *
 * Options : `leagues`, `since`, `until`, `limit` (nombre de matchs),
 * `concurrency`, et `onProgress(info)` pour suivre l'avancement.
 */
export async function refreshMatchStats(options = {}) {
  const { limit = null, concurrency = DEFAULT_CONCURRENCY, onProgress = null } = options;
  const startedAt = new Date().toISOString();

  let missing = listMissing(options);
  if (limit) missing = missing.slice(0, limit);

  const report = {
    startedAt,
    finishedAt: null,
    considered: missing.length,
    matched: 0,
    fetched: 0,
    merged: 0,
    playersMerged: 0,
    unmatched: 0,
    noStats: 0,
    failed: 0,
    samples: { unmatched: [], failed: [] }
  };

  if (!missing.length) {
    report.finishedAt = new Date().toISOString();
    writeStatus(report);
    return report;
  }

  // Un tableau de scores par (championnat, date), partagé : une rencontre du
  // jour J est cherchée sur J-1, J et J+1, car ESPN date ses rencontres selon
  // le fuseau du coup d'envoi.
  const scoreboards = new Map();
  const loadScoreboard = async (leagueSlug, date) => {
    const key = `${leagueSlug}|${date}`;
    if (!scoreboards.has(key)) {
      scoreboards.set(
        key,
        fetchFinishedEvents(leagueSlug, date).catch(() => [])
      );
    }
    return scoreboards.get(key);
  };

  // Étape 1 : apparier. Regroupé par (championnat, date) pour n'appeler
  // chaque tableau de scores qu'une fois.
  const groups = new Map();
  for (const fixture of missing) {
    const key = `${fixture.league}|${fixture.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  }

  const pairs = [];
  await pool([...groups.values()], concurrency, async (fixtures) => {
    const { league, date } = fixtures[0];
    const leagueSlug = ESPN_LEAGUE_SLUGS[league];
    const windows = await Promise.all([shiftDate(date, -1), date, shiftDate(date, 1)].map((d) => loadScoreboard(leagueSlug, d)));
    const events = windows.flat();
    for (const fixture of fixtures) {
      const event = matchEvent(fixture, events);
      if (event) pairs.push({ fixture, event });
      else {
        report.unmatched++;
        if (report.samples.unmatched.length < 20) {
          report.samples.unmatched.push(`${fixture.date} ${fixture.league} ${fixture.homeName}-${fixture.awayName}`);
        }
      }
    }
  });

  report.matched = pairs.length;
  onProgress?.({ phase: 'matched', matched: report.matched, unmatched: report.unmatched, total: report.considered });

  // Étape 2 : récupérer le détail, puis fusionner par lots.
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    const summary = mergeMatchStats(MATCH_STATS_DIR, batch);
    report.merged += summary.created + summary.updated;
    report.playersMerged += summary.playersMerged;
    batch = [];
  };

  let done = 0;
  await pool(pairs, concurrency, async ({ fixture, event }) => {
    try {
      const stats = await fetchMatchStats(event.gameId);
      if (!stats) report.noStats++;
      else {
        report.fetched++;
        batch.push({
          date: fixture.date,
          league: fixture.league,
          // Les noms du calendrier font foi : c'est sur eux que l'application
          // recherche une équipe. Les noms ESPN ne servent qu'à l'appariement.
          homeName: fixture.homeName,
          awayName: fixture.awayName,
          homeGoals: fixture.homeGoals,
          awayGoals: fixture.awayGoals,
          teamStats: stats.teamStats,
          players: stats.players,
          sources: stats.sources
        });
      }
    } catch (error) {
      report.failed++;
      if (report.samples.failed.length < 20) {
        report.samples.failed.push(`${fixture.date} ${fixture.homeName}-${fixture.awayName} : ${error.message}`);
      }
    }
    done++;
    if (batch.length >= FLUSH_EVERY) flush();
    if (onProgress && done % 25 === 0) onProgress({ phase: 'fetching', done, total: pairs.length, merged: report.merged });
  });

  flush();
  report.finishedAt = new Date().toISOString();
  writeStatus(report);
  onProgress?.({ phase: 'done', ...report });
  return report;
}

/**
 * Verrou sur disque : la garde mémoire ci-dessous ne protège que d'un second
 * appel dans le même processus. Or le serveur et la commande de rattrapage
 * sont deux processus distincts qui écrivent les mêmes fichiers mensuels —
 * chacun les lit en entier puis les réécrit, donc deux passages simultanés
 * feraient perdre le travail de l'un des deux.
 *
 * `wx` échoue si le fichier existe déjà : la création fait donc office de
 * prise de verrou atomique. Un verrou plus vieux que LOCK_STALE_MINUTES est
 * considéré comme abandonné (processus tué avant d'avoir pu le retirer).
 */
/** Le processus qui détient le verrou tourne-t-il encore ? */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 ne fait rien : il ne sert qu'à tester l'existence du processus.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = le processus existe mais appartient à un autre utilisateur.
    return error.code === 'EPERM';
  }
}

function acquireLock() {
  try {
    const previous = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const ageMinutes = (Date.now() - new Date(previous.startedAt).getTime()) / 60_000;
    // Un verrou dont le détenteur n'existe plus est abandonné, quel que soit
    // son âge : un processus tué (arrêt du serveur, délai dépassé) laisse
    // sinon le verrou en place une heure durant, pour rien.
    if (ageMinutes < LOCK_STALE_MINUTES && pidAlive(previous.pid)) return false;
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    // Pas de verrou, ou verrou illisible : on tente de le prendre.
  }
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
    return true;
  } catch {
    return false; // Un autre processus l'a pris entre-temps.
  }
}

function releaseLock() {
  try {
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    // Rien à faire : le prochain passage le traitera comme périmé.
  }
}

// Un seul rafraîchissement à la fois dans ce processus.
let inFlight = null;

/**
 * Comme refreshMatchStats(), mais si un rafraîchissement est déjà en cours,
 * renvoie celui-là au lieu d'en lancer un second. C'est le point d'entrée
 * qu'utilisent la route HTTP et la tâche périodique.
 */
export function refreshMatchStatsExclusive(options = {}) {
  return withRefreshLock(() => refreshMatchStats(options));
}

/**
 * Exécute `task` sous le verrou, en garantissant qu'un seul rafraîchissement
 * touche les fichiers mensuels à la fois — ici comme dans un autre processus.
 *
 * Permet d'enchaîner plusieurs passes (ESPN puis FotMob) sous UN seul verrou :
 * les prendre à tour de rôle laisserait une fenêtre entre les deux où la
 * ligne de commande pourrait s'intercaler.
 */
export function withRefreshLock(task) {
  if (inFlight) return inFlight;
  if (!acquireLock()) {
    // Un autre processus travaille déjà : on ne fait rien plutôt que d'aller
    // écraser ses écritures.
    return Promise.resolve({ skipped: 'verrou détenu par un autre processus', considered: 0, merged: 0, playersMerged: 0, unmatched: 0, failed: 0 });
  }
  inFlight = Promise.resolve()
    .then(task)
    .finally(() => {
      releaseLock();
      inFlight = null;
    });
  return inFlight;
}

export function isRefreshRunning() {
  return inFlight !== null;
}

/**
 * Noms d'équipe déjà employés par le projet, par championnat. Les saisons
 * passées arrivent avec l'orthographe d'ESPN ("Manchester City") alors que le
 * reste du magasin emploie celle du calendrier ("Man City") : sans
 * harmonisation, une même équipe aurait deux séries de statistiques.
 */
function buildKnownNames() {
  const byLeague = new Map();
  const add = (league, name) => {
    if (!league || !name) return;
    if (!byLeague.has(league)) byLeague.set(league, new Set());
    byLeague.get(league).add(name);
  };
  for (const fixture of readJson(CALENDAR_FILE, [])) add(fixture?.league, fixture?.homeName), add(fixture?.league, fixture?.awayName);
  for (const entry of readStoredEntries().values()) add(entry?.league, entry?.homeName), add(entry?.league, entry?.awayName);
  return byLeague;
}

/** Nom canonique du projet pour une équipe ESPN, ou le nom ESPN à défaut. */
function canonicalName(espnName, league, known) {
  const candidates = known.get(league);
  if (!candidates?.size) return espnName;
  return findBestTeamNameMatch(espnName, [...candidates]) ?? espnName;
}

/**
 * Importe des saisons entières sans passer par le calendrier local, qui ne
 * remonte pas au-delà de la saison précédente. Les journées de match sont
 * découvertes chez ESPN (cf. fetchSeasonMatchDays).
 *
 * `seasons` est une liste d'années de DÉBUT de saison : 2024 désigne
 * 2024-25.
 */
export async function importSeasons({ seasons, leagues = null, concurrency = DEFAULT_CONCURRENCY, onProgress = null } = {}) {
  const startedAt = new Date().toISOString();
  const wanted = leagues ? Object.entries(ESPN_LEAGUE_SLUGS).filter(([name]) => leagues.includes(name)) : Object.entries(ESPN_LEAGUE_SLUGS);
  const known = buildKnownNames();
  const already = new Set(readStoredEntries().keys());

  const report = { startedAt, finishedAt: null, seasons, days: 0, discovered: 0, skipped: 0, fetched: 0, merged: 0, playersMerged: 0, noStats: 0, failed: 0, unavailable: [], samples: { failed: [] } };

  // Étape 1 : les journées à interroger, championnat par championnat.
  // Mises en cache : le calendrier d'une saison terminée ne bouge plus, et
  // sans cela une reprise après incident réinterrogerait des milliers de
  // journées avant d'atteindre les rencontres qui manquent encore.
  const dayCache = readJson(SEASON_DAYS_FILE, {});
  let cacheChanged = false;
  const dayTasks = [];
  for (const season of seasons) {
    for (const [leagueName, slug] of wanted) {
      const key = `${slug}|${season}`;
      let days = dayCache[key];
      if (!days) {
        days = await fetchSeasonMatchDays(slug, season).catch(() => null);
        if (days?.length) {
          dayCache[key] = days;
          cacheChanged = true;
        }
      }
      if (!days?.length) {
        report.unavailable.push(`${leagueName} ${season}-${String(season + 1).slice(2)}`);
        continue;
      }
      for (const date of days) dayTasks.push({ leagueName, slug, date });
    }
  }
  if (cacheChanged) {
    try {
      fs.writeFileSync(SEASON_DAYS_FILE, `${JSON.stringify(dayCache, null, 2)}\n`, 'utf8');
    } catch {
      // Le cache n'est qu'un raccourci : son échec ne doit pas arrêter l'import.
    }
  }
  report.days = dayTasks.length;
  onProgress?.({ phase: 'days', days: report.days });

  // Étape 2 : les rencontres de chaque journée.
  const events = [];
  let daysDone = 0;
  await pool(dayTasks, concurrency, async ({ leagueName, slug, date }) => {
    const found = await fetchFinishedEvents(slug, date).catch(() => []);
    for (const event of found) events.push({ ...event, leagueName });
    daysDone++;
    if (onProgress && daysDone % 100 === 0) onProgress({ phase: 'scanning', done: daysDone, total: dayTasks.length, found: events.length });
  });

  // Une rencontre peut apparaître sur deux journées voisines (fuseaux) : on
  // ne la retient qu'une fois.
  const uniqueEvents = [...new Map(events.map((e) => [e.gameId, e])).values()];
  report.discovered = uniqueEvents.length;

  const pending = [];
  for (const event of uniqueEvents) {
    const homeName = canonicalName(event.homeName, event.leagueName, known);
    const awayName = canonicalName(event.awayName, event.leagueName, known);
    const matchKey = `${event.date}-${slug(homeName)}-${slug(awayName)}`;
    if (already.has(matchKey)) {
      report.skipped++;
      continue;
    }
    pending.push({ event, homeName, awayName });
  }
  onProgress?.({ phase: 'discovered', discovered: report.discovered, pending: pending.length, skipped: report.skipped });

  // Étape 3 : le détail, fusionné par lots.
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    const summary = mergeMatchStats(MATCH_STATS_DIR, batch);
    report.merged += summary.created + summary.updated;
    report.playersMerged += summary.playersMerged;
    batch = [];
  };

  let done = 0;
  await pool(pending, concurrency, async ({ event, homeName, awayName }) => {
    try {
      const stats = await fetchMatchStats(event.gameId);
      if (!stats) report.noStats++;
      else {
        report.fetched++;
        batch.push({
          date: event.date,
          league: event.leagueName,
          homeName,
          awayName,
          homeGoals: event.homeGoals,
          awayGoals: event.awayGoals,
          teamStats: stats.teamStats,
          players: stats.players,
          sources: stats.sources
        });
      }
    } catch (error) {
      report.failed++;
      if (report.samples.failed.length < 20) report.samples.failed.push(`${event.date} ${homeName}-${awayName} : ${error.message}`);
    }
    done++;
    if (batch.length >= FLUSH_EVERY) flush();
    if (onProgress && done % 50 === 0) onProgress({ phase: 'fetching', done, total: pending.length, merged: report.merged });
  });

  flush();
  report.finishedAt = new Date().toISOString();
  onProgress?.({ phase: 'done', ...report });
  return report;
}

function writeStatus(report) {
  try {
    const status = { ...report, coverage: getCoverage().totals };
    fs.writeFileSync(STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  } catch {
    // Le témoin d'état est un confort : son échec ne doit pas faire échouer
    // un rafraîchissement par ailleurs réussi.
  }
}

/** Dernier rafraîchissement connu, pour l'API d'état. */
export function getRefreshStatus() {
  return readJson(STATUS_FILE, null);
}

export const __testing = { matchEvent, shiftDate, slug };
